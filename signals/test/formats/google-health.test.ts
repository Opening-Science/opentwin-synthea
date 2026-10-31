import { describe, expect, it } from 'vitest';
import { googleHealthResponses } from '../../src/formats/google-health.ts';
import type { Person } from '../../src/person.ts';
import { wearableDays } from '../../src/wearables.ts';

const person: Person = {
  id: 'p1',
  sex: 'female',
  birthDate: '1962-01-01',
  deceasedAt: null,
  conditions: [],
  vitals: {}
};
const days = wearableDays(person, '2026-01-01', 2, 'p1') ?? [];

describe('googleHealthResponses', () => {
  const responses = googleHealthResponses(days);

  it('writes one response per data type with one point a day, each carrying one typed field', () => {
    expect(responses).toHaveLength(6);
    for (const r of responses) {
      expect(r.dataPoints).toHaveLength(2);
      expect(Object.keys(r.dataPoints[0] ?? {}).filter((k) => k !== 'dataSource')).toHaveLength(1);
    }
  });

  it('writes 64-bit integers as strings, as the API does', () => {
    const steps = responses[4]?.dataPoints[0] as { steps: { count: string } } | undefined;
    expect(typeof steps?.steps.count).toBe('string');
  });

  it('uses calendar dates for daily values', () => {
    const rhr = responses[0]?.dataPoints[1] as { dailyRestingHeartRate: { date: object } } | undefined;
    expect(rhr?.dailyRestingHeartRate.date).toEqual({ year: 2026, month: 1, day: 1 });
  });
});
