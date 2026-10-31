/**
 * WHAT: Writes daily wearable values as a Whoop sync payload: one cycle, recovery and sleep per day, in the shape
 *       open-twin's provider-whoop reads.
 * NOT:  Not a capture of the Whoop API: no recovery score, strain, kilojoules or sleep performance, which this
 *       repository does not model.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: Field names and units follow open-twin provider-whoop (api/schemas/recovery.ts, cycle.ts, sleep.ts,
 *              sync.ts); the tests check the shape, and docs/signals.md says how the output was run through that
 *              connector.
 * GOTCHA: Whoop sleep stage times are milliseconds. Cycle ids are numbers in the API; here they count days since
 *         1970, so they are stable and unique per person.
 */
import type { WearableDay } from '../wearables.ts';
import { stableUuid } from './open-wearables.ts';

const MINUTE = 60_000;

export function whoopSync(personId: string, days: readonly WearableDay[]) {
  const cycleId = (d: WearableDay): number => Math.round(Date.parse(`${d.date}T00:00:00Z`) / 86_400_000);
  const sleepId = (d: WearableDay): string => stableUuid('whoop-sleep', personId, d.date);
  return {
    cycles: days.map((d) => ({
      id: cycleId(d),
      start: d.sleep.bedtimeStart,
      end: new Date(Date.parse(d.sleep.bedtimeStart) + 86_400_000).toISOString(),
      score_state: 'SCORED'
    })),
    recovery: days.map((d) => ({
      cycle_id: cycleId(d),
      sleep_id: sleepId(d),
      created_at: d.sleep.bedtimeEnd,
      score_state: 'SCORED',
      score: {
        resting_heart_rate: d.restingHeartRate,
        hrv_rmssd_milli: d.hrvRmssdMs,
        spo2_percentage: d.spo2AveragePercent
      }
    })),
    sleep: days.map((d) => ({
      id: sleepId(d),
      cycle_id: cycleId(d),
      start: d.sleep.bedtimeStart,
      end: d.sleep.bedtimeEnd,
      nap: false,
      score_state: 'SCORED',
      score: {
        respiratory_rate: d.respiratoryRate,
        sleep_efficiency_percentage: d.sleep.efficiencyPercent,
        stage_summary: {
          total_in_bed_time_milli: d.sleep.timeInBedMinutes * MINUTE,
          total_awake_time_milli: d.sleep.awakeMinutes * MINUTE,
          total_light_sleep_time_milli: d.sleep.lightMinutes * MINUTE,
          total_slow_wave_sleep_time_milli: d.sleep.deepMinutes * MINUTE,
          total_rem_sleep_time_milli: d.sleep.remMinutes * MINUTE,
          disturbance_count: 0
        }
      }
    }))
  };
}
