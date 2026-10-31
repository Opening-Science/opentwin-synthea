/**
 * WHAT: Command line: writes daily wearable data for every adult alive on the end date in a Synthea FHIR output
 *       folder, once per device format (Open Wearables, Oura, Whoop, Google Health), plus manifest.json with the
 *       recipe and the hash of every input and output file.
 * NOT:  Does not call any device API or run open-twin; it writes the payloads those connectors read.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: NONE, no external authority checks what Synthea generates
 * GOTCHA: People under 18 are skipped, as no norm used covers them. The manifest holds no timestamps, so the same
 *         inputs give the same bytes.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { googleHealthResponses } from './formats/google-health.ts';
import { openWearablesSync } from './formats/open-wearables.ts';
import { ouraResponses } from './formats/oura.ts';
import { whoopSync } from './formats/whoop.ts';
import { readPerson } from './person.ts';
import { wearableDays } from './wearables.ts';

const out = (s: string): boolean => process.stdout.write(`${s}\n`);
const usage = 'Usage: pnpm wearables <synthea fhir folder> --out <empty folder> [--days 30] [--end 2026-01-01]';
const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
const FORMATS = {
  'open-wearables': openWearablesSync,
  oura: ouraResponses,
  whoop: whoopSync,
  'google-health': (_id: string, days: Parameters<typeof googleHealthResponses>[0]) => googleHealthResponses(days)
} as const;

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(): number {
  const args = process.argv.slice(2);
  const base = process.env.INIT_CWD ?? process.cwd();
  const values = new Set(['--out', '--days', '--end'].map((n) => args.indexOf(n) + 1).filter((i) => i > 0));
  const source = args.find((a, i) => !a.startsWith('--') && !values.has(i));
  const outArg = option(args, '--out');
  const days = Number(option(args, '--days') ?? 30);
  const end = option(args, '--end') ?? '2026-01-01';
  if (!source || !outArg || !(Number.isInteger(days) && days > 0 && days <= 3660) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    out(usage);
    return 2;
  }
  const sourceDir = resolve(base, source);
  const outDir = resolve(base, outArg);
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    out(`error: ${outDir} is not empty`);
    return 2;
  }
  for (const format of Object.keys(FORMATS)) mkdirSync(join(outDir, format), { recursive: true });

  const people: { personId: string; sourceSha256: string; outputs: Record<string, string> }[] = [];
  let skipped = 0;
  for (const file of readdirSync(sourceDir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const text = readFileSync(join(sourceDir, file));
    const bundle = JSON.parse(text.toString('utf8')) as { entry?: { resource?: { resourceType?: string } }[] };
    if (!bundle.entry?.some((e) => e.resource?.resourceType === 'Patient')) continue;
    const person = readPerson(bundle, end);
    const series = wearableDays(person, end, days, person.id);
    if (!series) {
      skipped++;
      continue;
    }
    const outputs: Record<string, string> = {};
    for (const [format, write] of Object.entries(FORMATS)) {
      const body = `${JSON.stringify(write(person.id, series))}\n`;
      writeFileSync(join(outDir, format, `${person.id}.json`), body);
      outputs[format] = sha256(body);
    }
    people.push({ personId: person.id, sourceSha256: sha256(text), outputs });
  }
  const manifest = {
    generator: 'wearables',
    format: 'opentwin-synthea-signal/1',
    recipe: { days, end, formats: Object.keys(FORMATS) },
    people,
    skippedChildrenOrDeceased: skipped
  };
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  out(
    `Wrote ${days} days for ${people.length} people in ${Object.keys(FORMATS).length} formats to ${outDir} (${skipped} skipped)`
  );
  return 0;
}

process.exitCode = main();
