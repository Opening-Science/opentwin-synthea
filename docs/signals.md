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
