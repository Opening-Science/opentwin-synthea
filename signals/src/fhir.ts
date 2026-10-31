/**
 * WHAT: Writes a waveform as a FHIR R4 Observation with one SampledData component per channel, tagged as test data.
 * NOT:  Does not validate against the FHIR specification; the HL7 validator is the authority for that.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: Structure follows the HL7 R4 example observation-example-sample-data (ECG codes from ISO/IEEE 11073-10101,
 *              system urn:oid:2.16.840.1.113883.6.24). The HTEST tag is HL7 v3 ActReason "test health data".
 * GOTCHA: Samples are stored as integers of `factor` (value = origin + factor * data), so the output is exact and
 *         byte-stable; choose a factor at or below the resolution the signal needs.
 */

export type Coding = { system: string; code: string; display: string };

export const MDC = 'urn:oid:2.16.840.1.113883.6.24';
export const ECG = { code: '131328', display: 'MDC_ECG_ELEC_POTL' } as const;
export const ECG_LEADS = {
  I: { code: '131329', display: 'MDC_ECG_ELEC_POTL_I' },
  II: { code: '131330', display: 'MDC_ECG_ELEC_POTL_II' },
  III: { code: '131389', display: 'MDC_ECG_ELEC_POTL_III' }
} as const;

const TEST_DATA_TAG = {
  system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
  code: 'HTEST',
  display: 'test health data'
};

export type Channel = { code: Coding; samples: readonly number[] };

export type Waveform = {
  id: string;
  code: Coding;
  /** Synthea patient id; referenced as urn:uuid like Synthea's own resources. */
  patientId: string;
  /** ISO date-time of the first sample. */
  start: string;
  /** Milliseconds between samples. */
  periodMs: number;
  /** UCUM unit of the samples, e.g. mV. */
  unit: string;
  /** Value of one data step in `unit`, e.g. 0.001 for microvolts when unit is mV. */
  factor: number;
  channels: readonly Channel[];
};

export function encodeSamples(samples: readonly number[], factor: number): string {
  return samples.map((v) => String(Math.round(v / factor) || 0)).join(' ');
}

export function decodeSamples(data: string, factor: number): number[] {
  return data.split(' ').map((d) => Number(d) * factor);
}

export function waveformObservation(w: Waveform): Record<string, unknown> {
  const end = new Date(Date.parse(w.start) + w.periodMs * Math.max(0, (w.channels[0]?.samples.length ?? 1) - 1));
  return {
    resourceType: 'Observation',
    id: w.id,
    meta: { tag: [TEST_DATA_TAG] },
    status: 'final',
    code: { coding: [w.code], text: w.code.display },
    subject: { reference: `urn:uuid:${w.patientId}` },
    effectivePeriod: { start: w.start, end: end.toISOString() },
    component: w.channels.map((c) => ({
      code: { coding: [c.code], text: c.code.display },
      valueSampledData: {
        origin: { value: 0, unit: w.unit, system: 'http://unitsofmeasure.org', code: w.unit },
        period: w.periodMs,
        factor: w.factor,
        dimensions: 1,
        data: encodeSamples(c.samples, w.factor)
      }
    }))
  };
}
