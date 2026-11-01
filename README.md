# opentwin-synthea

Deterministic [Synthea](https://github.com/synthetichealth/synthea) FHIR R4
cohorts, the signals Synthea does not simulate (ECG, EEG and wearable data)
for the same people, and Cohort Studio, a local web app to build, run and
explore them.

**Every person and signal this repository produces is synthetic.** The data
is for research, software testing and non-medical wellness work only. It is
not clinically validated and must not guide care; see
[intended use](docs/INTENDED-USE.md).

## Quick start

Needs Node 22.13+, pnpm and Java 21+.

```bash
pnpm install
SYNTHEA_POPULATION=10 ./generate.sh   # FHIR R4 bundles and manifest.json in out/
pnpm studio                           # Cohort Studio on http://127.0.0.1:4400
```

`generate.sh` downloads the pinned Synthea JAR once into `.cache/` and checks
its sha256 against `version.lock`. The same inputs give byte-identical patient
files on any machine.

## What it produces

| Command                                      | Output                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `./generate.sh`                              | a Synthea FHIR R4 cohort, filtered by age, sex, place and conditions if asked           |
| `pnpm batch --out <dir>`                     | large cohorts as parallel, resumable batches with seeds, counts and checksums per batch |
| `pnpm ecg out/fhir --out <dir>`              | one ECG per person as FHIR SampledData and CSV (ECGSYN model)                           |
| `pnpm eeg out/fhir --out <dir> [--stage N3]` | six-channel EDF EEG, awake (Jansen-Rit) or sleep stage N2 or N3 (thalamocortical model) |
| `pnpm wearables out/fhir --out <dir>`        | 30 days per adult in the Oura, Whoop, Google Health and Open Wearables formats          |

Every signal command writes a `manifest.json` with its inputs and the sha256 of
every file, and gives the same bytes for the same inputs. Each generator
implements a published model and its tests check the paper's own numbers; the
sleep stages are calibrated rather than reproduced, and every extension beyond
a paper is named. [docs/signals.md](docs/signals.md) lists the models, sources
and decisions.

In Cohort Studio, Explore shows any person's ECG, EEG and wearable days next
to their record.

## Contents

| Path                                    | What                                                        |
| --------------------------------------- | ----------------------------------------------------------- |
| `generate.sh`                           | the recipe: every input as a `SYNTHEA_*` variable           |
| `version.lock`, `synthea.properties`    | pinned Synthea release and export settings                  |
| [`docs/synthea.md`](docs/synthea.md)    | filters, reproducibility, large cohorts, the 1M cohort      |
| [`docs/signals.md`](docs/signals.md)    | ECG, EEG and wearable generators: models, sources, limits   |
| [`studio/`](studio/README.md)           | Cohort Studio, `pnpm cohort`, `pnpm repro` and `pnpm batch` |
| `signals/`                              | the signal generators and device formats                    |
| [`cohorts/`](cohorts/synthea-1m-v2.tsv) | the 1,000,000 person cohort: seeds and checksums per batch  |

## Development

```bash
pnpm lint
pnpm typecheck
pnpm test           # no Java needed
pnpm test:generate  # Java needed: generate.sh input and output folder guards
pnpm repro          # Java needed: one recipe three times, identical patient files
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how changes are made here.

## Used by

- [open-twin](https://github.com/Opening-Science/open-twin), where this work started.
- [TwinLLM](https://github.com/Opening-Science/twin-llm), which pins the same Synthea JAR.

## Licence

MIT, Copyright (c) 2026 Open Science Foundation (Opening Science). Synthea is
by The MITRE Corporation under Apache-2.0; see [NOTICE](NOTICE).
