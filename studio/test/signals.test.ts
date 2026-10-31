import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { ExploreIndex } from '../src/explore.ts';
import { personSignals } from '../src/signals.ts';

const runDir = mkdtempSync(join(tmpdir(), 'studio-signals-'));
afterAll(() => rmSync(runDir, { recursive: true, force: true }));
mkdirSync(join(runDir, 'out', 'fhir'), { recursive: true });

const bundle = (id: string, birthDate: string, deceasedDateTime?: string) => ({
  resourceType: 'Bundle',
  entry: [
    {
      resource: {
        resourceType: 'Patient',
        id,
        gender: 'male',
        birthDate,
        ...(deceasedDateTime ? { deceasedDateTime } : {})
      }
    },
    {
      resource: {
        resourceType: 'Observation',
        code: { coding: [{ code: '8867-4' }] },
        effectiveDateTime: '2025-06-01T10:00:00+00:00',
        valueQuantity: { value: 77 }
      }
    }
  ]
});
writeFileSync(join(runDir, 'out', 'fhir', 'adult.json'), JSON.stringify(bundle('adult', '1980-01-01')));
writeFileSync(join(runDir, 'out', 'fhir', 'child.json'), JSON.stringify(bundle('child', '2018-01-01')));
writeFileSync(
  join(runDir, 'out', 'fhir', 'dead.json'),
  JSON.stringify(bundle('dead', '1930-01-01', '2000-01-01T00:00:00+00:00'))
);
const index = { patients: [{ f: 'adult.json' }, { f: 'child.json' }, { f: 'dead.json' }] } as unknown as ExploreIndex;

describe('personSignals', () => {
  it('only reads files listed in the run index', () => {
    expect(personSignals(runDir, index, '../../etc/passwd', '2026-01-01')).toBeNull();
    expect(personSignals(runDir, index, 'missing.json', '2026-01-01')).toBeNull();
  });

  it('gives an adult an ECG at their Synthea heart rate, an EEG and 30 wearable days', () => {
    const s = personSignals(runDir, index, 'adult.json', '2026-01-01');
    expect(s?.ecg).toMatchObject({ heartRate: 77, heartRateFrom: 'vitals', atrialFibrillation: false });
    expect(s?.ecg?.millivolts).toHaveLength(2560);
    expect(s?.eeg?.channels[0]?.label).toBe('O1');
    expect(s?.wearables).toHaveLength(30);
  });

  it('gives a child no wearable data and a dead person no signals', () => {
    expect(personSignals(runDir, index, 'child.json', '2026-01-01')?.wearables).toBeNull();
    expect(personSignals(runDir, index, 'dead.json', '2026-01-01')).toMatchObject({
      alive: false,
      ecg: null,
      eeg: null
    });
  });
});

describe('personSignals sleep stages', () => {
  it('gives 30 s of C3 sleep EEG for N2 and N3', () => {
    const s = personSignals(runDir, index, 'adult.json', '2026-01-01', 'N3');
    expect(s?.stage).toBe('N3');
    expect(s?.eeg?.channels[0]?.label).toBe('C3');
    expect(s?.eeg?.channels[0]?.microvolts).toHaveLength(30 * 256);
  });
});
