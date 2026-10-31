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
lead II SampledData component (256 Hz, microvolt steps) and as CSV
(`time_s,lead_ii_mv`), and `manifest.json`
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

## EEG

`pnpm eeg <synthea fhir folder> --out <empty folder> [--seconds 30] [--at 2026-01-01]`
writes one EDF recording per person alive on the date, six channels (Fp1, Fp2,
C3, C4, O1, O2) at 256 Hz, and `manifest.json` like the ECG's. EDF is the
format of Kemp et al. 1992, read by EEG tools such as MNE and EDFbrowser.

Each channel is a Jansen-Rit neural mass model (Jansen and Rit, Biol Cybern
1995) with the paper's parameters: at connectivity C = 135 it produces the
alpha rhythm near 10 Hz the paper reports, which the tests check. The model's
output is a membrane potential, not a scalp voltage; scaling each channel to a
standard deviation of 20 microvolts and driving channels with independent
input are extensions. The EEG does not yet depend on the person's age or
conditions; their id seeds it.

### Sleep stages N2 and N3

`pnpm eeg ... --stage N2` or `--stage N3` uses the thalamocortical neural
mass model of Schellenberger Costa et al. (PLoS Comput Biol 2016) instead of
Jansen-Rit: a cortical column with sodium-dependent adaptation coupled to a
thalamic relay and reticular population with T-type calcium and h currents.
N2 gives isolated K-complexes (about 2 a minute) with thalamic spindles at 12
to 15 Hz; N3 gives slow oscillations near 0.8 Hz. `--stage awake`, the
default, keeps the Jansen-Rit alpha rhythm.

The model is built from the paper's equations and parameter tables, not from
the authors' code, which has no licence. Where the publications are
incomplete or inconsistent, this repository decides as follows, and the module
header lists the same points:

- the firing rate includes C = π/√3 (Weigenand et al. 2014, Eq. 1 and Text S2),
  which the 2016 supplement leaves out;
- k1 = 2.5·10⁷ mM⁻⁴ ms⁻¹ comes from Destexhe et al. 1996, the source of the
  h-current kinetics, as the 2016 table omits it;
- currents are outward positive throughout, so the T and h currents
  depolarize the relay cells as the paper describes; the supplement's signs
  would make them hyperpolarize;
- the second E_Ca in the table (−40 mV) is read as E_h.

With those, the model shows the paper's bifurcation structure (a canard
explosion near the Hopf point at high gain, a gradual Hopf beyond the cusp,
spindles from the isolated thalamus), but at the published stage settings its
cortex sits further from the bifurcation than the paper's. **The stages are
therefore calibrated, not reproduced**: g_KNa is 1.68 in N2 (published 1.33)
and 2.10 in N3 (published 1.88), chosen so every seed tested shows the
paper's stage behaviour; the neural gain and thalamic settings are as
published. The tests check that behaviour, not the published numbers.

## Wearables

`pnpm wearables <synthea fhir folder> --out <empty folder> [--days 30] [--end 2026-01-01]`
writes, for every adult alive on the end date, one value set per day: resting
heart rate, HRV (RMSSD), steps, one night of sleep with light, deep and REM
minutes, mean overnight SpO2 and respiratory rate. Each person's days are
written four times, as the payloads open-twin's connectors read:
`open-wearables/`, `oura/`, `whoop/` and `google-health/`, one JSON file per
person, plus `manifest.json`.

| Value              | Source                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Resting heart rate | the person's latest Synthea heart rate, else 65.5 ± 7.7 bpm; day to day SD 3.10 bpm women, 2.90 men (Quer et al., PLoS One 2020) |
| HRV (RMSSD)        | mean ± SD by sex and decade, Voss et al., PLoS One 2015, Tables 5 and 7                                                          |
| Steps              | mean by age and sex, SD = SE × √N, Bassett et al., Med Sci Sports Exerc 2010, Table 2                                            |
| Sleep              | median total sleep, latency and stage shares by age group, Mitterling et al., Sleep 2015, Table 2                                |
| SpO2               | median mean overnight saturation by age group, Mitterling et al. 2015, Table 5                                                   |
| Respiratory rate   | the person's latest Synthea respiratory rate, else 16 per minute                                                                 |

Extensions, not from those papers: day-to-day variation of HRV, steps, sleep
time and SpO2; combining Bassett's age and sex effects by multiplication; the
nearest age group outside a table's range. Voss measured RMSSD over 5 minutes
awake, so nightly wearable values in real devices run higher. People under 18
get no data, since none of these norms cover them.

Each format was run through the matching open-twin connector (provider-oura,
provider-whoop, provider-google-health, provider-open-wearables, open-twin
main on 31 October 2026): every payload parsed, nothing was refused or left
unmapped, and the values came out in the FHIR observations. The Whoop connector
does not map sleep stages or respiratory rate, so those do not reach FHIR from
the Whoop payload.
