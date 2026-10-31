/**
 * WHAT: Writes channels sampled at one rate as a European Data Format (EDF) file, 16-bit, one-second data records.
 * NOT:  Not EDF+: no annotations signal and free-text patient and recording fields.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: Kemp B, Varri A, Rosa AC, Nielsen KD, Gade J. A simple format for exchange of digitized polygraphic
 *              recordings. Electroencephalogr Clin Neurophysiol 82:391-393, 1992 (https://www.edfplus.info/specs/edf.html).
 * GOTCHA: Header fields are fixed-width ASCII; numbers must fit in 8 characters, so physical limits are rounded out
 *         to whole units. Samples beyond the last whole second are dropped, as EDF records are whole.
 */

export type EdfChannel = { label: string; unit: string; samples: readonly number[] };

export type EdfInput = {
  patient: string;
  recording: string;
  /** Start of the recording, UTC. */
  start: Date;
  sampleRate: number;
  channels: readonly EdfChannel[];
};

const field = (value: string | number, width: number): string => {
  const s = String(value);
  if (s.length > width) throw new Error(`EDF field too long for ${width} characters: ${s}`);
  if (!/^[\x20-\x7e]*$/.test(s)) throw new Error(`EDF fields must be printable ASCII: ${s}`);
  return s.padEnd(width, ' ');
};

const two = (n: number): string => String(n).padStart(2, '0');

export function writeEdf(input: EdfInput): Buffer {
  const { sampleRate, channels } = input;
  if (channels.length === 0) throw new Error('EDF needs at least one channel');
  const records = Math.floor(Math.min(...channels.map((c) => c.samples.length)) / sampleRate);
  const limits = channels.map((c) => {
    const peak = Math.ceil(Math.max(1, ...c.samples.map(Math.abs)));
    return { min: -peak, max: peak };
  });
  const d = input.start;
  const header = [
    field('0', 8),
    field(input.patient, 80),
    field(input.recording, 80),
    field(`${two(d.getUTCDate())}.${two(d.getUTCMonth() + 1)}.${two(d.getUTCFullYear() % 100)}`, 8),
    field(`${two(d.getUTCHours())}.${two(d.getUTCMinutes())}.${two(d.getUTCSeconds())}`, 8),
    field(256 * (channels.length + 1), 8),
    field('', 44),
    field(records, 8),
    field(1, 8),
    field(channels.length, 4),
    ...channels.map((c) => field(c.label, 16)),
    ...channels.map(() => field('', 80)),
    ...channels.map((c) => field(c.unit, 8)),
    ...limits.map((l) => field(l.min, 8)),
    ...limits.map((l) => field(l.max, 8)),
    ...channels.map(() => field(-32768, 8)),
    ...channels.map(() => field(32767, 8)),
    ...channels.map(() => field('', 80)),
    ...channels.map(() => field(sampleRate, 8)),
    ...channels.map(() => field('', 32))
  ].join('');
  const data = Buffer.alloc(records * channels.length * sampleRate * 2);
  let offset = 0;
  for (let r = 0; r < records; r++) {
    channels.forEach((c, k) => {
      const { min, max } = limits[k] ?? { min: -1, max: 1 };
      for (let s = 0; s < sampleRate; s++) {
        const v = c.samples[r * sampleRate + s] ?? 0;
        const digital = Math.round(((v - min) / (max - min)) * 65535 - 32768);
        data.writeInt16LE(Math.max(-32768, Math.min(32767, digital)), offset);
        offset += 2;
      }
    });
  }
  return Buffer.concat([Buffer.from(header, 'ascii'), data]);
}
