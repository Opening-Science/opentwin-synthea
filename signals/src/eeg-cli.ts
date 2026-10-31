/**
 * WHAT: Command line: writes one EDF EEG recording per person alive on the date in a Synthea FHIR output folder, plus
 *       manifest.json with the recipe, the montage and the hash of every input and output file.
 * NOT:  Does not shape the EEG to the person's age or conditions yet; the person's id seeds the input noise.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: NONE, no external authority checks what Synthea generates
 * GOTCHA: EDF holds whole seconds; the manifest holds no timestamps, so the same inputs give the same bytes.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { writeEdf } from './edf.ts';
import { generateEeg } from './eeg.ts';
import { readPerson } from './person.ts';

const out = (s: string): boolean => process.stdout.write(`${s}\n`);
const usage = 'Usage: pnpm eeg <synthea fhir folder> --out <empty folder> [--seconds 30] [--at 2026-01-01]';
const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
export const MONTAGE = ['Fp1', 'Fp2', 'C3', 'C4', 'O1', 'O2'] as const;

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
  const seconds = Number(option(args, '--seconds') ?? 30);
  const at = option(args, '--at') ?? '2026-01-01';
  if (
    !source ||
    !outArg ||
    !(Number.isInteger(seconds) && seconds > 0 && seconds <= 3600) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(at)
  ) {
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

  const recipe = { seconds, sampleRate: 256, at, montage: MONTAGE, connectivity: 135, microvoltsSd: 20 };
  const people: { personId: string; sourceSha256: string; outputSha256: string }[] = [];
  let skipped = 0;
  for (const file of readdirSync(sourceDir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const text = readFileSync(join(sourceDir, file));
    const bundle = JSON.parse(text.toString('utf8')) as { entry?: { resource?: { resourceType?: string } }[] };
    if (!bundle.entry?.some((e) => e.resource?.resourceType === 'Patient')) continue;
    const person = readPerson(bundle, at);
    if (person.deceasedAt !== null && person.deceasedAt <= at) {
      skipped++;
      continue;
    }
    const eeg = generateEeg({ seed: person.id, seconds, channels: MONTAGE });
    const edf = writeEdf({
      patient: `synthetic ${person.id.slice(0, 60)}`,
      recording: 'opentwin-synthea jansen-rit, synthetic, not for clinical use',
      start: new Date(`${at}T00:00:00Z`),
      sampleRate: eeg.sampleRate,
      channels: eeg.channels.map((c) => ({ label: `EEG ${c.label}`, unit: 'uV', samples: c.microvolts }))
    });
    writeFileSync(join(outDir, `eeg-${person.id}.edf`), edf);
    people.push({ personId: person.id, sourceSha256: sha256(text), outputSha256: sha256(edf) });
  }
  const manifest = {
    generator: 'jansen-rit',
    format: 'opentwin-synthea-signal/1',
    recipe,
    people,
    skippedDeceased: skipped
  };
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  out(`Wrote ${people.length} EEG recordings to ${outDir} (${skipped} skipped as deceased)`);
  return 0;
}

process.exitCode = main();
