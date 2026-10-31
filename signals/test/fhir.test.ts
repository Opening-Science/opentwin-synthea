import { describe, expect, it } from 'vitest';
import { decodeSamples, ECG, ECG_LEADS, encodeSamples, MDC, waveformObservation } from '../src/fhir.ts';

describe('SampledData encoding', () => {
  it('round-trips within half a step', () => {
    const samples = [0, 0.1234, -0.5, 1.2, -0.0004];
    const back = decodeSamples(encodeSamples(samples, 0.001), 0.001);
    back.forEach((v, i) => {
      expect(Math.abs(v - (samples[i] ?? 0))).toBeLessThanOrEqual(0.0005);
    });
  });

  it('writes integers and never -0', () => {
    expect(encodeSamples([0.0004, -0.0004, 0.0016], 0.001)).toBe('0 0 2');
  });
});

describe('waveformObservation', () => {
  const obs = waveformObservation({
    id: 'ecg-1',
    code: { system: MDC, ...ECG },
    patientId: 'p1',
    start: '2026-01-01T00:00:00.000Z',
    periodMs: 4,
    unit: 'mV',
    factor: 0.001,
    channels: [{ code: { system: MDC, ...ECG_LEADS.II }, samples: [0, 0.5, 1, 0.5] }]
  });

  it('follows the HL7 ECG example and tags the record as test data', () => {
    expect(obs).toMatchObject({
      resourceType: 'Observation',
      status: 'final',
      meta: { tag: [{ code: 'HTEST' }] },
      code: { coding: [{ system: 'urn:oid:2.16.840.1.113883.6.24', code: '131328' }] },
      subject: { reference: 'urn:uuid:p1' },
      effectivePeriod: { start: '2026-01-01T00:00:00.000Z', end: '2026-01-01T00:00:00.012Z' },
      component: [
        {
          code: { coding: [{ code: '131330', display: 'MDC_ECG_ELEC_POTL_II' }] },
          valueSampledData: {
            origin: { value: 0, code: 'mV' },
            period: 4,
            factor: 0.001,
            dimensions: 1,
            data: '0 500 1000 500'
          }
        }
      ]
    });
  });
});
