/**
 * WHAT: Reads one Synthea person from a FHIR R4 bundle: sex, birth and death, conditions, and the latest vital signs
 *       on or before a given date, so a generator can shape a signal to that person.
 * NOT:  Not a general FHIR parser; it reads only the resources and codes Synthea v4.0.0 writes for these fields.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: NONE, no external authority checks what Synthea generates
 * GOTCHA: Synthea records vital signs at visits only, so "latest" can be years before the date for an older record.
 *         Blood pressure is one panel (85354-9) with systolic (8480-6) and diastolic (8462-4) components.
 */

export type Sex = 'female' | 'male' | 'other' | 'unknown';

export type Condition = { code: string; display: string; onset: string; abatement: string | null };

export type Vitals = {
  heartRate?: number;
  respiratoryRate?: number;
  systolic?: number;
  diastolic?: number;
  bmi?: number;
  weightKg?: number;
  heightCm?: number;
};

export type Person = {
  id: string;
  sex: Sex;
  birthDate: string;
  deceasedAt: string | null;
  conditions: Condition[];
  /** Latest value of each vital sign on or before the date given to readPerson. */
  vitals: Vitals;
};

type Resource = { resourceType?: string; [key: string]: unknown };
type Coding = { system?: string; code?: string; display?: string };
type Quantity = { value?: number };

const VITALS: Record<string, keyof Vitals> = {
  '8867-4': 'heartRate',
  '9279-1': 'respiratoryRate',
  '8480-6': 'systolic',
  '8462-4': 'diastolic',
  '39156-5': 'bmi',
  '29463-7': 'weightKg',
  '8302-2': 'heightCm'
};

const firstCoding = (concept: unknown): Coding => {
  const codings = (concept as { coding?: Coding[] } | undefined)?.coding;
  return codings?.[0] ?? {};
};

export function readPerson(bundle: unknown, at: string): Person {
  const entries = (bundle as { entry?: { resource?: Resource }[] }).entry ?? [];
  const resources = entries.map((e) => e.resource).filter((r): r is Resource => r !== undefined);
  const patient = resources.find((r) => r.resourceType === 'Patient');
  if (!patient) throw new Error('bundle has no Patient');

  const conditions = resources
    .filter((r) => r.resourceType === 'Condition')
    .map((r) => {
      const coding = firstCoding(r.code);
      return {
        code: coding.code ?? '',
        display: coding.display ?? '',
        onset: String(r.onsetDateTime ?? ''),
        abatement: typeof r.abatementDateTime === 'string' ? r.abatementDateTime : null
      };
    })
    .filter((c) => c.code !== '' && c.onset !== '');

  const vitals: Vitals = {};
  const when: Partial<Record<keyof Vitals, string>> = {};
  const take = (code: string | undefined, value: number | undefined, effective: string): void => {
    const key = code ? VITALS[code] : undefined;
    if (!key || value === undefined || effective > at) return;
    if ((when[key] ?? '') > effective) return;
    vitals[key] = value;
    when[key] = effective;
  };
  for (const r of resources) {
    if (r.resourceType !== 'Observation' || typeof r.effectiveDateTime !== 'string') continue;
    take(firstCoding(r.code).code, (r.valueQuantity as Quantity | undefined)?.value, r.effectiveDateTime);
    for (const c of (r.component as { code?: unknown; valueQuantity?: Quantity }[] | undefined) ?? []) {
      take(firstCoding(c.code).code, c.valueQuantity?.value, r.effectiveDateTime);
    }
  }

  const sex = patient.gender;
  return {
    id: String(patient.id),
    sex: sex === 'female' || sex === 'male' || sex === 'other' ? sex : 'unknown',
    birthDate: String(patient.birthDate),
    deceasedAt: typeof patient.deceasedDateTime === 'string' ? patient.deceasedDateTime : null,
    conditions,
    vitals
  };
}

/** Whether the person has the SNOMED CT condition on the date (ISO, UTC as Synthea writes): started, not yet ended. */
export function hasCondition(person: Person, snomed: string, at: string): boolean {
  return person.conditions.some(
    (c) => c.code === snomed && c.onset <= at && (c.abatement === null || c.abatement > at)
  );
}

/** Age in whole years on the date. */
export function ageAt(person: Person, at: string): number {
  const [by, bm, bd] = person.birthDate.split('-').map(Number) as [number, number, number];
  const [y, m, d] = at.slice(0, 10).split('-').map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}
