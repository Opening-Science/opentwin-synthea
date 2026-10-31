import { describe, expect, it } from 'vitest';
import { ATRIAL_FIBRILLATION, ecgForPerson } from '../src/ecg-cohort.ts';
import type { Person } from '../src/person.ts';

const person = (overrides: Partial<Person> = {}): Person => ({
  id: 'p1',
  sex: 'female',
  birthDate: '1950-01-01',
  deceasedAt: null,
  conditions: [],
  vitals: { heartRate: 82 },
  ...overrides
});
const recipe = { seconds: 10, sampleRate: 256, at: '2026-01-01' };

describe('ecgForPerson', () => {
  it('uses the latest heart rate and writes lead II in microvolt steps', () => {
    const result = ecgForPerson(person(), recipe);
    expect(result?.summary).toEqual({ personId: 'p1', heartRate: 82, heartRateFrom: 'vitals', af: false });
    const components = result?.observation.component as { valueSampledData: { data: string } }[] | undefined;
    expect(components?.[0]?.valueSampledData.data.split(' ')).toHaveLength(2560);
  });

  it('turns atrial fibrillation on while the condition is active', () => {
    const af = { code: ATRIAL_FIBRILLATION, display: 'Atrial fibrillation', onset: '2020-01-01', abatement: null };
    expect(ecgForPerson(person({ conditions: [af] }), recipe)?.summary.af).toBe(true);
  });

  it('writes the same samples as CSV, in seconds and millivolts', () => {
    const lines = ecgForPerson(person(), recipe)?.csv.trimEnd().split('\n') ?? [];
    expect(lines[0]).toBe('time_s,lead_ii_mv');
    expect(lines).toHaveLength(2561);
    expect(lines[2]).toMatch(/^0\.003906,-?\d+\.\d{3}$/);
  });

  it('falls back to 70 bpm without a usable heart rate', () => {
    expect(ecgForPerson(person({ vitals: {} }), recipe)?.summary).toMatchObject({
      heartRate: 70,
      heartRateFrom: 'default'
    });
  });

  it('skips a person who died before the date', () => {
    expect(ecgForPerson(person({ deceasedAt: '1999-05-01T00:00:00+00:00' }), recipe)).toBeNull();
  });

  it('gives each person the same trace every time', () => {
    expect(ecgForPerson(person(), recipe)?.observation).toEqual(ecgForPerson(person(), recipe)?.observation);
  });
});
