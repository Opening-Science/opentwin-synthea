/**
 * WHAT: Writes daily wearable values as an Open Wearables sync: time series samples and sleep sessions, in the shape
 *       open-twin's provider-open-wearables reads.
 * NOT:  Not a capture of the Open Wearables API; heart rate, workouts and other series are not written.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: Field names and unit spellings follow open-twin provider-open-wearables (api/schemas/timeseries.ts,
 *              api/schemas/events.ts, fhir/seriesMap.ts); the tests check the shape, and docs/signals.md says how the
 *              output was run through that connector.
 * GOTCHA: The connector refuses a sample whose unit is not in the series' accepted list (bpm, ms, count, percent,
 *         brpm), so the units here must not drift.
 */
import { createHash } from 'node:crypto';
import type { WearableDay } from '../wearables.ts';

const SOURCE = { provider: 'opentwin-synthea', device: 'synthetic' };

export function stableUuid(...parts: string[]): string {
  const h = createHash('sha256').update(parts.join('\u0000')).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const sample = (day: WearableDay, type: string, value: number, unit: string, dailyTotal = false) => ({
  timestamp: `${day.date}T07:00:00+00:00`,
  zone_offset: '+00:00',
  type,
  value,
  unit,
  source: SOURCE,
  is_daily_total: dailyTotal
});

export function openWearablesSync(personId: string, days: readonly WearableDay[]) {
  return {
    userId: personId,
    timeseries: {
      data: days.flatMap((d) => [
        sample(d, 'resting_heart_rate', d.restingHeartRate, 'bpm'),
        sample(d, 'heart_rate_variability_rmssd', d.hrvRmssdMs, 'ms'),
        sample(d, 'steps', d.steps, 'count', true),
        sample(d, 'oxygen_saturation', d.spo2AveragePercent, 'percent'),
        sample(d, 'respiratory_rate', d.respiratoryRate, 'brpm')
      ])
    },
    sleepSessions: {
      data: days.map((d) => ({
        id: stableUuid('sleep', personId, d.date),
        start_time: d.sleep.bedtimeStart.replace('.000Z', '+00:00'),
        end_time: d.sleep.bedtimeEnd.replace('.000Z', '+00:00'),
        zone_offset: '+00:00',
        duration_seconds: d.sleep.timeInBedMinutes * 60,
        sleep_duration_seconds: d.sleep.totalSleepMinutes * 60,
        efficiency_percent: d.sleep.efficiencyPercent,
        stages: {
          awake_minutes: d.sleep.awakeMinutes,
          light_minutes: d.sleep.lightMinutes,
          deep_minutes: d.sleep.deepMinutes,
          rem_minutes: d.sleep.remMinutes
        },
        source: SOURCE,
        is_nap: false
      }))
    }
  };
}
