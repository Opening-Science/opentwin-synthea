/**
 * WHAT: Writes daily wearable values as Google Health API v4 list responses (daily resting heart rate, HRV, SpO2,
 *       respiratory rate, daily steps and sleep sessions), in the shape open-twin's provider-google-health reads.
 * NOT:  Not a capture of the Google Health API: no per-sample heart rate, sleep stage timeline or data point names.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: Field names follow open-twin provider-google-health (fhir/mappers/daily.ts, interval.ts, session.ts,
 *              verification/exampleBundle.ts); the tests check the shape, and docs/signals.md says how the output
 *              was run through that connector.
 * GOTCHA: The API writes 64-bit integers (counts, minutes) as strings and doubles as numbers; this keeps that split.
 */
import type { WearableDay } from '../wearables.ts';

const SOURCE = { recordingMethod: 'DERIVED', platform: 'FITBIT' };
const UTC = '0s';

const date = (d: WearableDay) => {
  const [year, month, day] = d.date.split('-').map(Number);
  return { year, month, day };
};
const response = (points: object[]) => ({ dataPoints: points.map((p) => ({ dataSource: SOURCE, ...p })) });

export function googleHealthResponses(days: readonly WearableDay[]) {
  return [
    response(
      days.map((d) => ({ dailyRestingHeartRate: { date: date(d), beatsPerMinute: String(d.restingHeartRate) } }))
    ),
    response(
      days.map((d) => ({
        dailyHeartRateVariability: { date: date(d), averageHeartRateVariabilityMilliseconds: d.hrvRmssdMs }
      }))
    ),
    response(days.map((d) => ({ dailyOxygenSaturation: { date: date(d), averagePercentage: d.spo2AveragePercent } }))),
    response(days.map((d) => ({ dailyRespiratoryRate: { date: date(d), breathsPerMinute: d.respiratoryRate } }))),
    response(
      days.map((d) => ({
        steps: {
          interval: {
            startTime: `${d.date}T00:00:00Z`,
            startUtcOffset: UTC,
            endTime: new Date(Date.parse(`${d.date}T00:00:00Z`) + 86_400_000).toISOString().replace('.000Z', 'Z'),
            endUtcOffset: UTC
          },
          count: String(d.steps)
        }
      }))
    ),
    response(
      days.map((d) => ({
        sleep: {
          interval: {
            startTime: d.sleep.bedtimeStart.replace('.000Z', 'Z'),
            startUtcOffset: UTC,
            endTime: d.sleep.bedtimeEnd.replace('.000Z', 'Z'),
            endUtcOffset: UTC
          },
          type: 'stages',
          summary: {
            minutesAsleep: String(d.sleep.totalSleepMinutes),
            minutesAwake: String(d.sleep.awakeMinutes),
            minutesInSleepPeriod: String(d.sleep.timeInBedMinutes),
            minutesToFallAsleep: String(d.sleep.latencyMinutes),
            stagesSummary: [
              { type: 'LIGHT', minutes: String(d.sleep.lightMinutes) },
              { type: 'DEEP', minutes: String(d.sleep.deepMinutes) },
              { type: 'REM', minutes: String(d.sleep.remMinutes) }
            ]
          }
        }
      }))
    )
  ];
}
