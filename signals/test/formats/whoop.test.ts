import { describe, expect, it } from 'vitest';
import { whoopSync } from '../../src/formats/whoop.ts';
import type { Person } from '../../src/person.ts';
import { wearableDays } from '../../src/wearables.ts';

const person: Person = {
  id: 'p1',
  sex: 'male',
  birthDate: '1978-01-01',
  deceasedAt: null,
  conditions: [],
  vitals: { heartRate: 60 }
};
const days = wearableDays(person, '2026-01-01', 3, 'p1') ?? [];

describe('whoopSync', () => {
  const sync = whoopSync('p1', days);

  it('links each recovery to its cycle and sleep', () => {
    sync.recovery.forEach((r, i) => {
      expect(r.cycle_id).toBe(sync.cycles[i]?.id);
      expect(r.sleep_id).toBe(sync.sleep[i]?.id);
    });
  });

  it('writes sleep stages in milliseconds that add up to time in bed', () => {
    const s = sync.sleep[0]?.score.stage_summary;
    const sum =
      (s?.total_awake_time_milli ?? 0) +
      (s?.total_light_sleep_time_milli ?? 0) +
      (s?.total_slow_wave_sleep_time_milli ?? 0) +
      (s?.total_rem_sleep_time_milli ?? 0);
    expect(sum).toBe(s?.total_in_bed_time_milli);
  });

  it('gives consecutive days consecutive cycle ids', () => {
    expect(sync.cycles.map((c) => c.id)).toEqual([20452, 20453, 20454]);
  });
});
