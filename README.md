# opentwin-synthea

Deterministic [Synthea](https://github.com/synthetichealth/synthea) FHIR R4
cohorts, and Cohort Studio, a local web app to build, run and explore them.

**Every person this repository produces is synthetic.** The data is for
research, software testing and non-medical wellness work only. It is not
clinically validated and must not guide care; see [intended use](docs/INTENDED-USE.md).

## Quick start

Needs Node 22.13+, pnpm and Java 21+.

```bash
SYNTHEA_POPULATION=2 ./generate.sh   # FHIR R4 bundles and manifest.json in out/
pnpm install
pnpm studio                          # Cohort Studio on http://127.0.0.1:4400
```

`generate.sh` downloads the pinned Synthea JAR once into `.cache/` and checks
its sha256 against `version.lock`. The same inputs give byte-identical patient
files on any machine.

## Contents

| Path                                 | What                                              |
| ------------------------------------ | ------------------------------------------------- |
| `generate.sh`                        | the recipe: every input as a `SYNTHEA_*` variable |
| `version.lock`, `synthea.properties` | pinned Synthea release and export settings        |
| [`docs/synthea.md`](docs/synthea.md) | filters, reproducibility, large cohorts           |
| [`studio/`](studio/README.md)        | Cohort Studio, `pnpm cohort` and `pnpm repro`     |

## Development

```bash
pnpm lint
pnpm typecheck
pnpm test           # no Java needed
pnpm test:generate  # Java needed: generate.sh input and output folder guards
pnpm repro          # Java needed: one recipe three times, identical patient files
```

## Used by

- [open-twin](https://github.com/Opening-Science/open-twin), where this work started.
- [TwinLLM](https://github.com/Opening-Science/twin-llm), which pins the same Synthea JAR.

## Licence

MIT, Copyright (c) 2026 Open Science Foundation (Opening Science). Synthea is
by The MITRE Corporation under Apache-2.0; see [NOTICE](NOTICE).
