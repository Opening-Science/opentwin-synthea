/**
 * WHAT: Writes daily wearable values as Oura API v2 list responses for the sleep, daily_activity and daily_spo2
 *       endpoints, in the shape open-twin's provider-oura parses.
 * NOT:  Not a capture of the Oura API: no scores, contributors, 5-minute phases or per-sample heart rate, which this
 *       repository does not model.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: Field names, units and required fields follow open-twin provider-oura (api/schemas/sleep.ts, daily.ts,
 *              spo2.ts); the tests check the shape, and docs/signals.md says how the output was run through that
 *              connector.
 * GOTCHA: Oura durations are whole seconds. Oura's lowest sleeping heart rate carries the resting heart rate here,
 *         and open-twin maps it to LOINC 103222-6 (minimum), not 40443-4.
 */
import type { WearableDay } from '../wearables.ts';
import { stableUuid } from './open-wearables.ts';

const page = <T>(data: T[]) => ({ data, next_token: null });

export function ouraResponses(personId: string, days: readonly WearableDay[]) {
  return {
    sleep: page(
      days.map((d) => ({
        id: stableUuid('oura-sleep', personId, d.date),
        day: d.date,
        type: 'long_sleep' as const,
        bedtime_start: d.sleep.bedtimeStart.replace('.000Z', '+00:00'),
        bedtime_end: d.sleep.bedtimeEnd.replace('.000Z', '+00:00'),
        time_in_bed: d.sleep.timeInBedMinutes * 60,
        total_sleep_duration: d.sleep.totalSleepMinutes * 60,
        awake_time: d.sleep.awakeMinutes * 60,
        light_sleep_duration: d.sleep.lightMinutes * 60,
        deep_sleep_duration: d.sleep.deepMinutes * 60,
        rem_sleep_duration: d.sleep.remMinutes * 60,
        latency: d.sleep.latencyMinutes * 60,
        efficiency: Math.round(d.sleep.efficiencyPercent),
        lowest_heart_rate: d.restingHeartRate,
        average_hrv: d.hrvRmssdMs,
        average_breath: d.respiratoryRate
      }))
    ),
    daily_activity: page(
      days.map((d) => ({
        id: stableUuid('oura-activity', personId, d.date),
        day: d.date,
        timestamp: `${d.date}T00:00:00+00:00`,
        contributors: {},
        steps: d.steps
      }))
    ),
    daily_spo2: page(
      days.map((d) => ({
        id: stableUuid('oura-spo2', personId, d.date),
        day: d.date,
        spo2_percentage: { average: d.spo2AveragePercent },
        breathing_disturbance_index: null
      }))
    )
  };
}
