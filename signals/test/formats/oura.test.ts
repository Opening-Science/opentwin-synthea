import { describe, expect, it } from 'vitest';
import { ouraResponses } from '../../src/formats/oura.ts';
import type { Person } from '../../src/person.ts';
import { wearableDays } from '../../src/wearables.ts';

const person: Person = {
  id: 'p1',
  sex: 'female',
  birthDate: '1985-01-01',
  deceasedAt: null,
  conditions: [],
  vitals: { heartRate: 64 }
};
const days = wearableDays(person, '2026-01-01', 3, 'p1') ?? [];

describe('ouraResponses', () => {
  const r = ouraResponses('p1', days);

  it('writes one record a day per endpoint, as list pages', () => {
    expect([r.sleep.data.length, r.daily_activity.data.length, r.daily_spo2.data.length]).toEqual([3, 3, 3]);
    expect(r.sleep.next_token).toBeNull();
  });

  it('writes sleep durations in whole seconds that add up', () => {
    const s = r.sleep.data[0];
    expect(s?.total_sleep_duration).toBe((days[0]?.sleep.totalSleepMinutes ?? 0) * 60);
    expect((s?.light_sleep_duration ?? 0) + (s?.deep_sleep_duration ?? 0) + (s?.rem_sleep_duration ?? 0)).toBe(
      s?.total_sleep_duration
    );
    expect(Number.isInteger(s?.efficiency)).toBe(true);
  });

  it('uses the day and a midnight timestamp with an offset for activity', () => {
    expect(r.daily_activity.data[2]).toMatchObject({ day: '2026-01-01', timestamp: '2026-01-01T00:00:00+00:00' });
  });
});
