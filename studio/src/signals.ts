/**
 * WHAT: Generates one person's signals for the studio's Signals tab: a 10 s ECG, 10 s of awake EEG and 30 days of
 *       wearable values, the same generators and seeds the pnpm ecg, eeg and wearables commands use.
 * NOT:  Does not write files; whole-cohort exports are the command-line tools, whose commands the tab shows.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: NONE, no external authority checks what Synthea generates
 * GOTCHA: The person file must come from the run's own explore index, never from the request directly.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateEcg } from '../../signals/src/ecg.ts';
import { ATRIAL_FIBRILLATION, DEFAULT_HEART_RATE } from '../../signals/src/ecg-cohort.ts';
import { generateEeg } from '../../signals/src/eeg.ts';
import { ageAt, hasCondition, readPerson } from '../../signals/src/person.ts';
import { wearableDays } from '../../signals/src/wearables.ts';
import type { ExploreIndex } from './explore.ts';

/** `date` is the run's end date, YYYY-MM-DD. */
export function personSignals(runDir: string, index: ExploreIndex, file: string, date: string) {
  if (!index.patients.some((p) => p.f === file)) return null;
  const person = readPerson(JSON.parse(readFileSync(join(runDir, 'out', 'fhir', file), 'utf8')), date);
  const alive = person.deceasedAt === null || person.deceasedAt.slice(0, 10) > date;
  const measured = person.vitals.heartRate;
  const heartRate = measured !== undefined && measured >= 20 && measured <= 250 ? measured : DEFAULT_HEART_RATE;
  const af = hasCondition(person, ATRIAL_FIBRILLATION, date);
  return {
    personId: person.id,
    date,
    age: ageAt(person, date),
    alive,
    ecg: alive
      ? {
          heartRate,
          heartRateFrom: heartRate === measured ? 'vitals' : 'default',
          atrialFibrillation: af,
          ...generateEcg({ seed: person.id, seconds: 10, heartRate, atrialFibrillation: af })
        }
      : null,
    eeg: alive ? generateEeg({ seed: person.id, seconds: 10, channels: ['O1'] }) : null,
    wearables: wearableDays(person, date, 30, person.id)
  };
}
