/**
 * WHAT: Synthetic EEG from the Jansen-Rit neural mass model: one cortical column per channel, driven by random
 *       input pulses, giving an alpha rhythm at the published connectivity.
 * NOT:  Not a model of any real brain or of sleep, seizures or disease. Not for diagnosis or for training anything
 *       that will be used on patients without separate validation.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: Jansen BH, Rit VG. Electroencephalogram and visual evoked potential generation in a mathematical model
 *              of coupled cortical columns. Biol Cybern 73:357-366, 1995. Parameters are the paper's: A 3.25 mV,
 *              B 22 mV, a 100/s, b 50/s, v0 6 mV, e0 2.5/s, r 0.56/mV, C 135, input 120 to 320 pulses/s. The tests
 *              check the alpha peak the paper reports for C = 135.
 * GOTCHA: The model's output is a membrane potential in mV, not a scalp voltage. Scaling each channel to a standard
 *         deviation in microvolts is an extension, as is giving channels independent input.
 */
import { seededRandom } from './random.ts';

export type EegOptions = {
  seed: string;
  seconds: number;
  channels: readonly string[];
  /** Output samples per second; must divide the internal rate of 1024 Hz. */
  sampleRate?: number;
  /** Connectivity constant C; 135 gives the alpha rhythm of the paper. */
  connectivity?: number;
  /** Standard deviation of each output channel, microvolts. */
  microvoltsSd?: number;
};

export type Eeg = { sampleRate: number; channels: { label: string; microvolts: number[] }[] };

const INTERNAL_RATE = 1024;
const SETTLE_SECONDS = 2;
const P = { A: 3.25, B: 22, a: 100, b: 50, v0: 6, e0: 2.5, r: 0.56, pMin: 120, pMax: 320 };

const sigmoid = (v: number): number => (2 * P.e0) / (1 + Math.exp(P.r * (P.v0 - v)));

/** Raw model output y1 - y2 in mV at the internal rate, after the start-up transient. */
export function jansenRit(seed: string, seconds: number, connectivity = 135): Float64Array {
  const random = seededRandom(seed);
  const [c1, c2, c3, c4] = [connectivity, 0.8 * connectivity, 0.25 * connectivity, 0.25 * connectivity];
  const dt = 1 / INTERNAL_RATE;
  const settle = SETTLE_SECONDS * INTERNAL_RATE;
  const total = Math.round(seconds * INTERNAL_RATE);
  const out = new Float64Array(total);
  let [y0, y1, y2, y3, y4, y5] = [0, 0, 0, 0, 0, 0];
  for (let s = 0; s < settle + total; s++) {
    const p = P.pMin + (P.pMax - P.pMin) * random.next();
    const d3 = P.A * P.a * sigmoid(y1 - y2) - 2 * P.a * y3 - P.a * P.a * y0;
    const d4 = P.A * P.a * (p + c2 * sigmoid(c1 * y0)) - 2 * P.a * y4 - P.a * P.a * y1;
    const d5 = P.B * P.b * c4 * sigmoid(c3 * y0) - 2 * P.b * y5 - P.b * P.b * y2;
    [y0, y1, y2] = [y0 + dt * y3, y1 + dt * y4, y2 + dt * y5];
    [y3, y4, y5] = [y3 + dt * d3, y4 + dt * d4, y5 + dt * d5];
    if (s >= settle) out[s - settle] = y1 - y2;
  }
  return out;
}

export function generateEeg(options: EegOptions): Eeg {
  const sampleRate = options.sampleRate ?? 256;
  if (INTERNAL_RATE % sampleRate !== 0) throw new Error(`sample rate must divide ${INTERNAL_RATE}`);
  if (options.channels.length === 0) throw new Error('at least one channel is needed');
  const step = INTERNAL_RATE / sampleRate;
  const targetSd = options.microvoltsSd ?? 20;
  return {
    sampleRate,
    channels: options.channels.map((label) => {
      const raw = jansenRit(`eeg:${options.seed}:${label}`, options.seconds, options.connectivity);
      const down = Array.from({ length: Math.floor(raw.length / step) }, (_, i) => raw[i * step] ?? 0);
      const mean = down.reduce((s, v) => s + v, 0) / down.length;
      const sd = Math.sqrt(down.reduce((s, v) => s + (v - mean) ** 2, 0) / down.length) || 1;
      return { label, microvolts: down.map((v) => ((v - mean) / sd) * targetSd) };
    })
  };
}
