import { describe, expect, it } from 'vitest';
import { ageAt, hasCondition, readPerson } from '../src/person.ts';

const quantity = (code: string, value: number, at: string) => ({
  resource: {
    resourceType: 'Observation',
    code: { coding: [{ code }] },
    effectiveDateTime: at,
    valueQuantity: { value }
  }
});
const bloodPressure = (systolic: number, diastolic: number, at: string) => ({
  resource: {
    resourceType: 'Observation',
    code: { coding: [{ code: '85354-9' }] },
    effectiveDateTime: at,
    component: [
      { code: { coding: [{ code: '8462-4' }] }, valueQuantity: { value: diastolic } },
      { code: { coding: [{ code: '8480-6' }] }, valueQuantity: { value: systolic } }
    ]
  }
});
const condition = (code: string, onset: string, abatement?: string) => ({
  resource: {
    resourceType: 'Condition',
    code: { coding: [{ system: 'http://snomed.info/sct', code, display: `condition ${code}` }] },
    onsetDateTime: onset,
    ...(abatement ? { abatementDateTime: abatement } : {})
  }
});

const bundle = {
  resourceType: 'Bundle',
  entry: [
    { resource: { resourceType: 'Patient', id: 'p1', gender: 'female', birthDate: '1960-06-15' } },
    quantity('8867-4', 72, '2020-03-01T10:00:00+00:00'),
    quantity('8867-4', 88, '2025-03-01T10:00:00+00:00'),
    quantity('8867-4', 95, '2026-06-01T10:00:00+00:00'),
    quantity('9279-1', 14, '2025-03-01T10:00:00+00:00'),
    bloodPressure(138, 86, '2025-03-01T10:00:00+00:00'),
    condition('49436004', '2018-05-01T00:00:00+00:00'),
    condition('444814009', '2019-01-01T00:00:00+00:00', '2019-01-20T00:00:00+00:00')
  ]
};

describe('readPerson', () => {
  const person = readPerson(bundle, '2026-01-01');

  it('reads the patient', () => {
    expect(person).toMatchObject({ id: 'p1', sex: 'female', birthDate: '1960-06-15', deceasedAt: null });
  });

  it('takes the latest vital signs on or before the date, including blood pressure components', () => {
    expect(person.vitals).toEqual({ heartRate: 88, respiratoryRate: 14, systolic: 138, diastolic: 86 });
  });

  it('reads conditions with onset and end', () => {
    expect(person.conditions.map((c) => [c.code, c.abatement])).toEqual([
      ['49436004', null],
      ['444814009', '2019-01-20T00:00:00+00:00']
    ]);
  });

  it('rejects a bundle without a Patient', () => {
    expect(() => readPerson({ entry: [] }, '2026-01-01')).toThrow('no Patient');
  });
});

describe('hasCondition', () => {
  const person = readPerson(bundle, '2026-01-01');

  it('is true between onset and end, false before and after', () => {
    expect(hasCondition(person, '49436004', '2026-01-01')).toBe(true);
    expect(hasCondition(person, '49436004', '2017-01-01')).toBe(false);
    expect(hasCondition(person, '444814009', '2019-01-10')).toBe(true);
    expect(hasCondition(person, '444814009', '2020-01-01')).toBe(false);
  });
});

describe('ageAt', () => {
  it('counts whole years', () => {
    const person = readPerson(bundle, '2026-01-01');
    expect(ageAt(person, '2026-06-14')).toBe(65);
    expect(ageAt(person, '2026-06-15')).toBe(66);
  });
});
