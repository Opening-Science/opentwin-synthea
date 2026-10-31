/**
 * WHAT: Daily wearable values for one adult Synthea person: resting heart rate, HRV (RMSSD), steps, one night's
 *       sleep with stages, mean overnight SpO2 and respiratory rate, each drawn around published norms for their age
 *       and sex, so writers can serialise them in each device's format.
 * NOT:  Not a physiological model of the person; days are independent draws around a fixed personal baseline. No
 *       values for people under 18, whom none of the norms below cover.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: Resting heart rate: Quer et al., PLoS One 15(2):e0227709, 2020 (65.5 +/- 7.7 bpm between people; within
 *              a person SD 3.10 bpm women, 2.90 men). RMSSD: Voss et al., PLoS One 10(3):e0118308, 2015, Tables 5 and
 *              7 (5-minute recordings, mean +/- SD by sex and decade, 25 to 74). Steps: Bassett et al., Med Sci Sports
 *              Exerc 42(10):1819-1825, 2010, Table 2 (mean and SE by age and by sex; SD = SE x sqrt(N)). Sleep and
 *              SpO2: Mitterling et al., Sleep 38(6):867-875, 2015, Tables 2 and 5 (medians by age group).
 * GOTCHA: Extensions, not from those papers: day-to-day variation of HRV (CV 0.15), steps (CV 0.3), sleep time (SD 30
 *         min) and SpO2 (SD 0.5 points); combining Bassett's age and sex effects by multiplication; using the
 *         nearest age group outside a table's range; and anchoring resting heart rate and respiratory rate on the
 *         person's latest Synthea vital signs.
 */

import { ageAt, type Person } from './person.ts';
import { type Random, seededRandom } from './random.ts';

export type SleepNight = {
  /** ISO date-times, UTC. */
  bedtimeStart: string;
  bedtimeEnd: string;
  timeInBedMinutes: number;
  totalSleepMinutes: number;
  awakeMinutes: number;
  latencyMinutes: number;
  lightMinutes: number;
  deepMinutes: number;
  remMinutes: number;
  efficiencyPercent: number;
};

export type WearableDay = {
  /** YYYY-MM-DD; the night is the one ending on this morning. */
  date: string;
  restingHeartRate: number;
  hrvRmssdMs: number;
  steps: number;
  sleep: SleepNight;
  spo2AveragePercent: number;
  respiratoryRate: number;
};

type Sex = 'female' | 'male';

const RMSSD: Record<Sex, [number, number][]> = {
  female: [
    [42.9, 22.8],
    [35.4, 18.5],
    [26.3, 13.6],
    [21.4, 11.9],
    [19.1, 11.8]
  ],
  male: [
    [39.7, 19.9],
    [32.0, 16.5],
    [23.0, 10.9],
    [19.9, 11.1],
    [19.1, 10.7]
  ]
};
const rmssdRow = (age: number): number => Math.min(4, Math.max(0, Math.floor((age - 25) / 10)));

const STEPS_BY_AGE: { from: number; mean: number; se: number; n: number }[] = [
  { from: 18, mean: 5843, se: 287, n: 220 },
  { from: 30, mean: 5127, se: 204, n: 193 },
  { from: 40, mean: 5915, se: 206, n: 233 },
  { from: 50, mean: 4742, se: 256, n: 229 },
  { from: 60, mean: 4027, se: 169, n: 261 }
];
const STEPS_SEX_FACTOR: Record<Sex, number> = { female: 4912 / 5117, male: 5340 / 5117 };

/** Mitterling Table 2 medians by age group (<=30, 31-40, 41-50, 51-60, >60); stages and WASO as % of sleep period. */
const SLEEP = [
  { tst: 413.5, latency: 24.8, n1: 8.7, n2: 45.2, n3: 20.7, rem: 15.6 },
  { tst: 420.0, latency: 16.0, n1: 10.2, n2: 45.2, n3: 19.3, rem: 14.0 },
  { tst: 402.0, latency: 14.0, n1: 9.2, n2: 46.2, n3: 14.1, rem: 14.8 },
  { tst: 397.0, latency: 11.0, n1: 9.3, n2: 45.7, n3: 15.5, rem: 12.2 },
  { tst: 378.3, latency: 16.2, n1: 10.3, n2: 44.2, n3: 14.9, rem: 10.3 }
];
/** Mitterling Table 5, mean oxygen saturation medians, same age groups. */
const SPO2 = [95.2, 95.5, 95.0, 93.8, 93.5];
const TIME_IN_BED = 480;
const sleepRow = (age: number): number => (age <= 30 ? 0 : age <= 40 ? 1 : age <= 50 ? 2 : age <= 60 ? 3 : 4);

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

type Baseline = { sex: Sex; age: number; rhr: number; rhrSd: number; rmssd: number; steps: number; rr: number };

function baseline(person: Person, random: Random, at: string): Baseline {
  const sex: Sex = person.sex === 'male' ? 'male' : 'female';
  const age = ageAt(person, at);
  const measured = person.vitals.heartRate;
  const rhr =
    measured !== undefined && measured >= 35 && measured <= 120
      ? measured
      : clamp(65.5 + 7.7 * random.normal(), 40, 109);
  const [rMean, rSd] = RMSSD[sex][rmssdRow(age)] ?? [30, 15];
  const group = [...STEPS_BY_AGE].reverse().find((g) => age >= g.from) ?? STEPS_BY_AGE[0];
  const stepsMean = (group?.mean ?? 5117) * STEPS_SEX_FACTOR[sex];
  const stepsSd = (group?.se ?? 200) * Math.sqrt(group?.n ?? 200);
  return {
    sex,
    age,
    rhr,
    rhrSd: sex === 'male' ? 2.9 : 3.1,
    rmssd: clamp(rMean + rSd * random.normal(), 5, 200),
    steps: clamp(stepsMean + stepsSd * random.normal(), 300, 40000),
    rr: person.vitals.respiratoryRate ?? 16
  };
}

function night(b: Baseline, random: Random, date: string): SleepNight {
  const row = SLEEP[sleepRow(b.age)] ?? SLEEP[0];
  const latency = Math.round(clamp((row?.latency ?? 15) * (1 + 0.3 * random.normal()), 1, 90));
  const total = Math.round(clamp((row?.tst ?? 400) + 30 * random.normal(), 180, TIME_IN_BED - latency));
  const sleepShare = (row?.n1 ?? 9) + (row?.n2 ?? 45) + (row?.n3 ?? 16) + (row?.rem ?? 13);
  const deep = Math.round((total * (row?.n3 ?? 16)) / sleepShare);
  const rem = Math.round((total * (row?.rem ?? 13)) / sleepShare);
  const end = new Date(`${date}T07:00:00Z`);
  const start = new Date(end.getTime() - TIME_IN_BED * 60_000);
  return {
    bedtimeStart: start.toISOString(),
    bedtimeEnd: end.toISOString(),
    timeInBedMinutes: TIME_IN_BED,
    totalSleepMinutes: total,
    awakeMinutes: TIME_IN_BED - total,
    latencyMinutes: latency,
    lightMinutes: total - deep - rem,
    deepMinutes: deep,
    remMinutes: rem,
    efficiencyPercent: Math.round((1000 * total) / TIME_IN_BED) / 10
  };
}

/** One value set per day for `days` days ending on `endDate`; null for a person under 18 or dead by then. */
export function wearableDays(person: Person, endDate: string, days: number, seed: string): WearableDay[] | null {
  if (ageAt(person, endDate) < 18) return null;
  if (person.deceasedAt !== null && person.deceasedAt.slice(0, 10) <= endDate) return null;
  const random = seededRandom(`wearables:${seed}`);
  const b = baseline(person, random, endDate);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const spo2 = SPO2[sleepRow(b.age)] ?? 95;
  return Array.from({ length: days }, (_, k) => {
    const date = new Date(end - (days - 1 - k) * 86_400_000).toISOString().slice(0, 10);
    return {
      date,
      restingHeartRate: Math.round(clamp(b.rhr + b.rhrSd * random.normal(), 35, 130)),
      hrvRmssdMs: Math.round(10 * clamp(b.rmssd * (1 + 0.15 * random.normal()), 3, 250)) / 10,
      steps: Math.round(clamp(b.steps * (1 + 0.3 * random.normal()), 0, 60000)),
      sleep: night(b, random, date),
      spo2AveragePercent: Math.round(10 * clamp(spo2 + 0.5 * random.normal(), 85, 100)) / 10,
      respiratoryRate: Math.round(10 * clamp(b.rr + 0.5 * random.normal(), 8, 30)) / 10
    };
  });
}
