import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { type BatchPlan, runBatches, TSV_HEADER } from '../src/batch.ts';

const root = mkdtempSync(join(tmpdir(), 'cohort-batch-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const fake = join(root, 'fake-generate.sh');
writeFileSync(
  fake,
  [
    '[[ "$SYNTHEA_SEED" == "$FAIL_SEED" ]] && { echo "synthea: boom" >&2; exit 1; }',
    'mkdir -p "$SYNTHEA_OUT_DIR/fhir"',
    'for p in $(seq 1 "$SYNTHEA_POPULATION"); do echo "{\\"seed\\":$SYNTHEA_SEED,\\"p\\":$p}" > "$SYNTHEA_OUT_DIR/fhir/p$p.json"; done',
    'echo "{\\"seed\\": $SYNTHEA_SEED}" > "$SYNTHEA_OUT_DIR/manifest.json"',
    'echo "Records: total=$((SYNTHEA_POPULATION + 1)), alive=$SYNTHEA_POPULATION, dead=1"'
  ].join('\n')
);
const plan = (outDir: string, overrides: Partial<BatchPlan> = {}): BatchPlan => ({
  outDir,
  first: 1,
  last: 3,
  population: 4,
  seedBase: 1000,
  clinicianSeedBase: 2000,
  workers: 2,
  script: fake,
  ...overrides
});

describe('runBatches', () => {
  const out = join(root, 'cohort');

  it('runs every batch, archives it and records seeds, counts and checksums', async () => {
    const result = await runBatches(plan(out), () => undefined);
    expect(result).toEqual({ done: 3, skipped: 0, failed: [] });
    const lines = readFileSync(join(out, 'batches.tsv'), 'utf8').trim().split('\n');
    expect(lines[0]).toBe(TSV_HEADER);
    expect(lines.slice(1).map((l) => l.split('\t').slice(0, 6))).toEqual([
      ['batch-001', '1001', '2001', '5', '4', '1'],
      ['batch-002', '1002', '2002', '5', '4', '1'],
      ['batch-003', '1003', '2003', '5', '4', '1']
    ]);
    const listing = execFileSync('bash', [
      '-c',
      `zstd -dc "${join(out, 'batch-002.tar.zst')}" | tar -tf - | sort`
    ]).toString();
    expect(listing.trim().split('\n')).toEqual([
      'fhir/',
      'fhir/p1.json',
      'fhir/p2.json',
      'fhir/p3.json',
      'fhir/p4.json'
    ]);
    expect(existsSync(join(out, 'work'))).toBe(false);
  });

  it('skips finished batches when run again', async () => {
    const result = await runBatches(plan(out, { last: 4 }), () => undefined);
    expect(result).toEqual({ done: 1, skipped: 3, failed: [] });
  });

  it('stops starting batches after one fails and keeps no partial archive', async () => {
    process.env.FAIL_SEED = '1002';
    const failing = join(root, 'failing');
    const result = await runBatches(plan(failing, { last: 6, workers: 1 }), () => undefined);
    delete process.env.FAIL_SEED;
    expect(result).toEqual({ done: 1, skipped: 0, failed: ['batch-002'] });
    expect(existsSync(join(failing, 'batch-002.tar.zst'))).toBe(false);
    expect(readFileSync(join(failing, 'batch-002.log'), 'utf8')).toContain('boom');
  });
});
