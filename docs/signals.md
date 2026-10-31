# Signal generators

Synthea gives each synthetic person a medical history: conditions, visits,
medicines and occasional vital signs. The generators in `signals/` add the
signals Synthea does not simulate, such as ECG and EEG waveforms and wearable
device streams, for the same people. Like everything here, their output is
synthetic, for research and software testing only, and not clinically
validated; see [intended use](INTENDED-USE.md).

## Contract

Every generator follows the same rules, so a signal can be reproduced and
traced back to its inputs:

- **Deterministic.** The same recipe, seed and person give the same bytes.
  Randomness comes only from `signals/src/random.ts` (xoshiro128\*\* seeded from
  the sha256 of a seed string), never from `Math.random` or the clock.
- **Grounded.** Each generator implements a published model, cited in its
  module header, and its tests check the output against numbers from that
  publication. Anything beyond the publication is marked as an extension.
- **Linked.** A signal is derived from one Synthea person (age, sex,
  conditions, vital signs) and refers to that person by id.
- **Recorded.** Each run writes a manifest with every input, the generator
  version and a hash of the output.

## ECG

`pnpm ecg <synthea fhir folder> --out <empty folder> [--seconds 10] [--at 2026-01-01]`
writes one ECG per person alive on the date, as a FHIR R4 Observation with a
lead II SampledData component (256 Hz, microvolt steps), and `manifest.json`
with the recipe, each person's heart rate and rhythm, and the sha256 of every
input bundle and output file.

The waveform comes from ECGSYN (McSharry et al., IEEE TBME 2003) with the
defaults of PhysioNet's `ecgsyn.m`: P, Q, R, S and T as Gaussian events on a
limit cycle, RR intervals with 0.1 Hz Mayer waves and 0.25 Hz respiratory
variation at an LF/HF power ratio of 0.5. Each person's heart rate is their
latest Synthea heart rate (LOINC 8867-4), or 70 bpm without one. The tests
check the heart rate, the RR variability, the LF/HF ratio, the -0.4 to 1.2 mV
range and the order of P, R and T.

People with atrial fibrillation on the date (SNOMED CT 49436004, from Synthea's
`atrial_fibrillation` module) get an extension that is not in the publication:
no P wave, RR intervals drawn independently with a coefficient of variation of
0.2, and 0.05 mV fibrillatory waves at 6 Hz.
