import { describe, expect, it } from 'vitest';
import { openWearablesSync, stableUuid } from '../../src/formats/open-wearables.ts';
import type { Person } from '../../src/person.ts';
import { wearableDays } from '../../src/wearables.ts';

const person: Person = {
  id: 'p1',
  sex: 'male',
  birthDate: '1970-01-01',
  deceasedAt: null,
  conditions: [],
  vitals: {}
};
const days = wearableDays(person, '2026-01-01', 2, 'p1') ?? [];

describe('openWearablesSync', () => {
  const sync = openWearablesSync('p1', days);

  it('writes five daily series in the units the connector accepts', () => {
    const units = Object.fromEntries(sync.timeseries.data.map((s) => [s.type, s.unit]));
    expect(units).toEqual({
      resting_heart_rate: 'bpm',
      heart_rate_variability_rmssd: 'ms',
      steps: 'count',
      oxygen_saturation: 'percent',
      respiratory_rate: 'brpm'
    });
    expect(sync.timeseries.data).toHaveLength(10);
  });

  it('writes one sleep session a night with stages that add up', () => {
    const night = sync.sleepSessions.data[0];
    const s = night?.stages;
    expect((s?.light_minutes ?? 0) + (s?.deep_minutes ?? 0) + (s?.rem_minutes ?? 0)).toBe(
      (night?.sleep_duration_seconds ?? 0) / 60
    );
    expect(night?.start_time).toMatch(/\+00:00$/);
  });

  it('gives sleep sessions stable ids', () => {
    expect(stableUuid('sleep', 'p1', '2026-01-01')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(openWearablesSync('p1', days)).toEqual(sync);
  });
});
