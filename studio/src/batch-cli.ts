/**
 * WHAT: Command line for batch generation: pnpm batch --out <folder> with seed range, batch size and workers.
 * NOT:  Does not delete a finished batch; rerunning the same command resumes where it stopped.
 * GOVERNED BY: docs/synthea.md
 * CORRECTNESS: NONE, no external authority checks what Synthea generates
 * GOTCHA: Each worker runs its own JVM; JAVA_TOOL_OPTIONS (for example -Xmx3g) passes through to every worker.
 */
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { runBatches } from './batch.ts';

const out = (s: string): boolean => process.stdout.write(`${s}\n`);
const usage =
  'Usage: pnpm batch --out <folder> [--from 1] [--to 100] [--population 10000] [--seed-base 1000] ' +
  '[--clinician-seed-base 2000] [--workers N]';

function int(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

async function main(): Promise<number> {
  const i = process.argv.indexOf('--out');
  const outArg = i >= 0 ? process.argv[i + 1] : undefined;
  const plan = {
    outDir: resolve(process.env.INIT_CWD ?? process.cwd(), outArg ?? ''),
    first: int('--from', 1),
    last: int('--to', 100),
    population: int('--population', 10000),
    seedBase: int('--seed-base', 1000),
    clinicianSeedBase: int('--clinician-seed-base', 2000),
    workers: int('--workers', Math.max(1, cpus().length - 1))
  };
  const numbers = [plan.first, plan.last, plan.population, plan.seedBase, plan.clinicianSeedBase, plan.workers];
  if (!outArg || !numbers.every(Number.isInteger) || plan.first < 1 || plan.last < plan.first || plan.population < 1) {
    out(usage);
    return 2;
  }
  out(
    `Batches ${plan.first} to ${plan.last} of ${plan.population} people, ${plan.workers} workers, into ${plan.outDir}`
  );
  const started = Date.now();
  const result = await runBatches(plan, (e) => out(`${e.batch} ${e.status}${e.detail ? `: ${e.detail}` : ''}`));
  const minutes = ((Date.now() - started) / 60_000).toFixed(1);
  out(
    `${result.done} done, ${result.skipped} skipped, ${result.failed.length} failed in ${minutes} min; see batches.tsv`
  );
  return result.failed.length === 0 ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    out(`error: ${(e as Error).message}`);
    process.exitCode = 1;
  }
);
