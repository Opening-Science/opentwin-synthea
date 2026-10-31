import { describe, expect, it } from 'vitest';
import type { Person } from '../src/person.ts';
import { type WearableDay, wearableDays } from '../src/wearables.ts';

const person = (id: string, sex: 'female' | 'male', birthDate: string, heartRate?: number): Person => ({
  id,
  sex,
  birthDate,
  deceasedAt: null,
  conditions: [],
  vitals: heartRate === undefined ? {} : { heartRate }
});
const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;
const sd = (xs: number[]): number => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
/** First day for each of n people of one sex and birth date. */
const cohort = (n: number, sex: 'female' | 'male', birthDate: string): WearableDay[] =>
  Array.from(
    { length: n },
    (_, i) => wearableDays(person(`${sex}-${i}`, sex, birthDate), '2026-01-01', 1, `${sex}-${i}`)?.[0]
  ).filter((d): d is WearableDay => d !== undefined);

describe('wearableDays', () => {
  it('gives the same days for the same seed', () => {
    const p = person('a', 'female', '1980-05-01', 72);
    expect(wearableDays(p, '2026-01-01', 7, 'a')).toEqual(wearableDays(p, '2026-01-01', 7, 'a'));
  });

  it('skips children and people who died by the end date', () => {
    expect(wearableDays(person('c', 'male', '2015-01-01'), '2026-01-01', 7, 'c')).toBeNull();
    expect(
      wearableDays({ ...person('d', 'male', '1950-01-01'), deceasedAt: '2020-01-01T00:00:00Z' }, '2026-01-01', 7, 'd')
    ).toBeNull();
  });

  it('lists consecutive days ending on the end date', () => {
    const days = wearableDays(person('e', 'male', '1970-01-01'), '2026-01-01', 3, 'e')?.map((d) => d.date);
    expect(days).toEqual(['2025-12-30', '2025-12-31', '2026-01-01']);
  });

  it('keeps a person near their Synthea heart rate, varying by about 3 bpm a day (Quer 2020)', () => {
    const days = wearableDays(person('f', 'female', '1980-01-01', 70), '2026-01-01', 400, 'f') ?? [];
    expect(mean(days.map((d) => d.restingHeartRate))).toBeCloseTo(70, 0);
    expect(sd(days.map((d) => d.restingHeartRate))).toBeGreaterThan(2.6);
    expect(sd(days.map((d) => d.restingHeartRate))).toBeLessThan(3.6);
  });

  it('draws resting heart rate around 65.5 bpm without a Synthea value (Quer 2020)', () => {
    expect(mean(cohort(2000, 'male', '1980-01-01').map((d) => d.restingHeartRate))).toBeGreaterThan(64);
    expect(mean(cohort(2000, 'male', '1980-01-01').map((d) => d.restingHeartRate))).toBeLessThan(67);
  });

  it('reproduces RMSSD by sex and decade (Voss 2015, Tables 5 and 7)', () => {
    expect(mean(cohort(3000, 'female', '1996-01-01').map((d) => d.hrvRmssdMs))).toBeGreaterThan(42.9 * 0.9);
    expect(mean(cohort(3000, 'female', '1996-01-01').map((d) => d.hrvRmssdMs))).toBeLessThan(42.9 * 1.12);
    expect(mean(cohort(3000, 'male', '1956-01-01').map((d) => d.hrvRmssdMs))).toBeGreaterThan(19.1 * 0.9);
    expect(mean(cohort(3000, 'male', '1956-01-01').map((d) => d.hrvRmssdMs))).toBeLessThan(19.1 * 1.2);
  });

  it('reproduces steps by age and sex (Bassett 2010, Table 2)', () => {
    const steps = mean(cohort(3000, 'male', '1981-01-01').map((d) => d.steps));
    expect(steps).toBeGreaterThan(5915 * (5340 / 5117) * 0.92);
    expect(steps).toBeLessThan(5915 * (5340 / 5117) * 1.08);
  });

  it('reproduces sleep and SpO2 medians by age group (Mitterling 2015, Tables 2 and 5)', () => {
    const young = cohort(2000, 'female', '2000-01-01');
    const old = cohort(2000, 'female', '1955-01-01');
    expect(mean(young.map((d) => d.sleep.totalSleepMinutes))).toBeCloseTo(413.5, -1);
    expect(mean(old.map((d) => d.sleep.totalSleepMinutes))).toBeCloseTo(378.3, -1);
    expect(mean(young.map((d) => d.sleep.deepMinutes / d.sleep.totalSleepMinutes))).toBeCloseTo(20.7 / 90.2, 2);
    expect(mean(old.map((d) => d.spo2AveragePercent))).toBeCloseTo(93.5, 0);
  });

  it('keeps each night consistent: stages add up to sleep, sleep plus awake to time in bed', () => {
    for (const d of cohort(200, 'male', '1975-01-01')) {
      const s = d.sleep;
      expect(s.lightMinutes + s.deepMinutes + s.remMinutes).toBe(s.totalSleepMinutes);
      expect(s.totalSleepMinutes + s.awakeMinutes).toBe(s.timeInBedMinutes);
      expect(Date.parse(s.bedtimeEnd) - Date.parse(s.bedtimeStart)).toBe(s.timeInBedMinutes * 60_000);
    }
  });
});
