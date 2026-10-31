/**
 * WHAT: Turns one Synthea person into an ECG observation: heart rate from their latest vital signs, atrial
 *       fibrillation when Synthea gave them that condition, seeded by their id so each person keeps their trace.
 * NOT:  Does not read Synthea's output folder or write files; ecg-cli.ts does.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: Synthea v4.0.0 records atrial fibrillation as SNOMED CT 49436004 (modules/atrial_fibrillation.json)
 *              and heart rate as LOINC 8867-4.
 * GOTCHA: A person dead on the date gets no ECG; Synthea's last heart rate can be from a visit years earlier.
 */
import { generateEcg } from './ecg.ts';
import { ECG, ECG_LEADS, MDC, waveformObservation } from './fhir.ts';
import { hasCondition, type Person } from './person.ts';

export const ATRIAL_FIBRILLATION = '49436004';
export const DEFAULT_HEART_RATE = 70;

export type EcgRecipe = { seconds: number; sampleRate: number; at: string };

export type EcgSummary = { personId: string; heartRate: number; heartRateFrom: 'vitals' | 'default'; af: boolean };

export function ecgForPerson(
  person: Person,
  recipe: EcgRecipe
): { observation: Record<string, unknown>; summary: EcgSummary } | null {
  if (person.deceasedAt !== null && person.deceasedAt <= recipe.at) return null;
  const measured = person.vitals.heartRate;
  const heartRate = measured !== undefined && measured >= 20 && measured <= 250 ? measured : DEFAULT_HEART_RATE;
  const af = hasCondition(person, ATRIAL_FIBRILLATION, recipe.at);
  const ecg = generateEcg({
    seed: person.id,
    seconds: recipe.seconds,
    sampleRate: recipe.sampleRate,
    heartRate,
    atrialFibrillation: af
  });
  const observation = waveformObservation({
    id: `ecg-${person.id}`,
    code: { system: MDC, ...ECG },
    patientId: person.id,
    start: new Date(Date.parse(recipe.at)).toISOString(),
    periodMs: 1000 / recipe.sampleRate,
    unit: 'mV',
    factor: 0.001,
    channels: [{ code: { system: MDC, ...ECG_LEADS.II }, samples: ecg.millivolts }]
  });
  return {
    observation,
    summary: { personId: person.id, heartRate, heartRateFrom: heartRate === measured ? 'vitals' : 'default', af }
  };
}
