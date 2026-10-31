/**
 * WHAT: Generates a large cohort as numbered batches: parallel workers each run generate.sh for one seed pair into
 *       their own folder, archive the FHIR files as tar.zst and record seeds, record counts and checksums.
 * NOT:  Does not change the recipe; every batch is an ordinary generate.sh run, so any batch can be rerun alone.
 * GOVERNED BY: docs/synthea.md
 * CORRECTNESS: NONE, no external authority checks what Synthea generates
 * GOTCHA: Resumable: a batch whose archive and record row exist is skipped. A failed batch stops new batches from
 *         starting; batches already running finish. Archive checksums depend on the zstd version, FHIR ones do not.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { GENERATE_SH } from './paths.ts';
import { contentChecksum, parseRecordsLine } from './runner.ts';

export type BatchPlan = {
  outDir: string;
  first: number;
  last: number;
  population: number;
  seedBase: number;
  clinicianSeedBase: number;
  workers: number;
  script?: string;
};

export type BatchRow = {
  batch: string;
  seed: number;
  clinicianSeed: number;
  records: number;
  alive: number;
  dead: number;
  fhirContentSha256: string;
  archiveBytes: number;
  archiveSha256: string;
};

export const TSV_HEADER =
  'batch\tseed\tclinician_seed\trecords\talive\tdead\tfhir_content_sha256\tarchive_bytes\tarchive_sha256';

export const batchName = (i: number): string => `batch-${String(i).padStart(3, '0')}`;

const toTsv = (r: BatchRow): string =>
  [
    r.batch,
    r.seed,
    r.clinicianSeed,
    r.records,
    r.alive,
    r.dead,
    r.fhirContentSha256,
    r.archiveBytes,
    r.archiveSha256
  ].join('\t');

function run(command: string, args: string[], env: NodeJS.ProcessEnv, logFile?: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    child.stdout?.on('data', (c: Buffer) => chunks.push(c));
    child.stderr?.on('data', (c: Buffer) => chunks.push(c));
    child.on('error', () => resolve(127));
    child.on('close', (code) => {
      if (logFile) writeFileSync(logFile, Buffer.concat(chunks));
      resolve(code ?? 1);
    });
  });
}

function fileSha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (c) => hash.update(c))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/** Writes batches.tsv from every finished batch's row file, in batch order. */
export function writeTable(outDir: string): number {
  const rows = readdirSync(outDir)
    .filter((f) => f.endsWith('.row'))
    .sort()
    .map((f) => readFileSync(join(outDir, f), 'utf8').trim());
  writeFileSync(join(outDir, 'batches.tsv'), `${[TSV_HEADER, ...rows].join('\n')}\n`);
  return rows.length;
}

async function runOne(plan: BatchPlan, i: number): Promise<BatchRow> {
  const name = batchName(i);
  const work = join(plan.outDir, 'work', name);
  rmSync(work, { recursive: true, force: true });
  const seed = plan.seedBase + i;
  const clinicianSeed = plan.clinicianSeedBase + i;
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('SYNTHEA_'))),
    SYNTHEA_POPULATION: String(plan.population),
    SYNTHEA_SEED: String(seed),
    SYNTHEA_CLINICIAN_SEED: String(clinicianSeed),
    SYNTHEA_OUT_DIR: work
  };
  const log = join(plan.outDir, `${name}.log`);
  if ((await run('bash', [plan.script ?? GENERATE_SH], env, log)) !== 0) throw new Error(`${name} failed; see ${log}`);
  const records = readFileSync(log, 'utf8')
    .split('\n')
    .map(parseRecordsLine)
    .filter((r) => r !== null)
    .at(-1);
  if (!records) throw new Error(`${name}: no "Records:" line in ${log}`);
  const fhirContentSha256 = contentChecksum(join(work, 'fhir'));
  const archive = join(plan.outDir, `${name}.tar.zst`);
  const partial = `${archive}.partial`;
  const tar = `tar -C "$1" -cf - fhir | zstd -T2 -10 -q -f -o "$2"`;
  if ((await run('bash', ['-o', 'pipefail', '-c', tar, 'bash', work, partial], process.env)) !== 0) {
    rmSync(partial, { force: true });
    throw new Error(`${name}: archiving failed`);
  }
  renameSync(partial, archive);
  writeFileSync(join(plan.outDir, `${name}.manifest.json`), readFileSync(join(work, 'manifest.json')));
  rmSync(work, { recursive: true, force: true });
  const row: BatchRow = {
    batch: name,
    seed,
    clinicianSeed,
    records: records.total,
    alive: records.alive,
    dead: records.dead,
    fhirContentSha256,
    archiveBytes: statSync(archive).size,
    archiveSha256: await fileSha256(archive)
  };
  writeFileSync(join(plan.outDir, `${name}.row`), `${toTsv(row)}\n`);
  return row;
}

export async function runBatches(
  plan: BatchPlan,
  onEvent: (e: { batch: string; status: 'skipped' | 'started' | 'done' | 'failed'; detail?: string }) => void
): Promise<{ done: number; skipped: number; failed: string[] }> {
  mkdirSync(plan.outDir, { recursive: true });
  const queue: number[] = [];
  let skipped = 0;
  for (let i = plan.first; i <= plan.last; i++) {
    const name = batchName(i);
    if (existsSync(join(plan.outDir, `${name}.tar.zst`)) && existsSync(join(plan.outDir, `${name}.row`))) {
      skipped++;
      onEvent({ batch: name, status: 'skipped' });
    } else queue.push(i);
  }
  let done = 0;
  const failed: string[] = [];
  const worker = async (): Promise<void> => {
    for (let i = queue.shift(); i !== undefined && failed.length === 0; i = queue.shift()) {
      const name = batchName(i);
      onEvent({ batch: name, status: 'started' });
      try {
        const row = await runOne(plan, i);
        done++;
        writeTable(plan.outDir);
        onEvent({
          batch: name,
          status: 'done',
          detail: `${row.records} records, ${row.fhirContentSha256.slice(0, 12)}`
        });
      } catch (e) {
        failed.push(name);
        onEvent({ batch: name, status: 'failed', detail: (e as Error).message });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, plan.workers) }, worker));
  writeTable(plan.outDir);
  rmSync(join(plan.outDir, 'work'), { recursive: true, force: true });
  return { done, skipped, failed };
}
