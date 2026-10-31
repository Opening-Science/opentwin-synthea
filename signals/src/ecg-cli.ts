/**
 * WHAT: Command line: reads every person in a Synthea FHIR output folder and writes one ECG observation per living
 *       person, plus manifest.json with the recipe, each person's inputs and the hash of every file written.
 * NOT:  Does not run Synthea; point it at the fhir folder generate.sh or Cohort Studio wrote.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: NONE, no external authority checks what Synthea generates
 * GOTCHA: Synthea also writes hospitalInformation and practitionerInformation bundles; they have no Patient and are
 *         skipped. The manifest holds no timestamps, so the same inputs give the same bytes.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type EcgSummary, ecgForPerson } from './ecg-cohort.ts';
import { readPerson } from './person.ts';

const out = (s: string): boolean => process.stdout.write(`${s}\n`);
const usage = 'Usage: pnpm ecg <synthea fhir folder> --out <empty folder> [--seconds 10] [--at 2026-01-01]';
const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(): number {
  const args = process.argv.slice(2);
  const base = process.env.INIT_CWD ?? process.cwd();
  const values = new Set(['--out', '--seconds', '--at'].map((n) => args.indexOf(n) + 1).filter((i) => i > 0));
  const source = args.find((a, i) => !a.startsWith('--') && !values.has(i));
  const outArg = option(args, '--out');
  const seconds = Number(option(args, '--seconds') ?? 10);
  const at = option(args, '--at') ?? '2026-01-01';
  if (!source || !outArg || !(seconds > 0 && seconds <= 3600) || !/^\d{4}-\d{2}-\d{2}$/.test(at)) {
    out(usage);
    return 2;
  }
  const sourceDir = resolve(base, source);
  const outDir = resolve(base, outArg);
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    out(`error: ${outDir} is not empty`);
    return 2;
  }
  mkdirSync(outDir, { recursive: true });

  const recipe = { seconds, sampleRate: 256, at };
  const people: (EcgSummary & { sourceSha256: string; outputSha256: string })[] = [];
  let skipped = 0;
  for (const file of readdirSync(sourceDir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const text = readFileSync(join(sourceDir, file));
    const bundle = JSON.parse(text.toString('utf8')) as { entry?: { resource?: { resourceType?: string } }[] };
    if (!bundle.entry?.some((e) => e.resource?.resourceType === 'Patient')) continue;
    const result = ecgForPerson(readPerson(bundle, at), recipe);
    if (!result) {
      skipped++;
      continue;
    }
    const body = `${JSON.stringify(result.observation)}\n`;
    writeFileSync(join(outDir, `ecg-${result.summary.personId}.json`), body);
    people.push({ ...result.summary, sourceSha256: sha256(text), outputSha256: sha256(body) });
  }
  const manifest = {
    generator: 'ecgsyn',
    format: 'opentwin-synthea-signal/1',
    recipe,
    people,
    skippedDeceased: skipped
  };
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const withAf = people.filter((p) => p.af).length;
  out(`Wrote ${people.length} ECGs to ${outDir} (${withAf} with atrial fibrillation, ${skipped} skipped as deceased)`);
  return 0;
}

process.exitCode = main();
