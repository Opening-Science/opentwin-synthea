/**
 * WHAT: Synthetic ECG from the ECGSYN dynamical model, with heart rate and rhythm taken from one Synthea person.
 * NOT:  Not a model of any real heart, and no lead other than a lead II like trace. Not for diagnosis or for training
 *       anything that will be used on patients without separate validation.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: McSharry, Clifford, Tarassenko, Smith. A dynamical model for generating synthetic electrocardiogram
 *              signals. IEEE Trans Biomed Eng 50(3):289-294, 2003. Parameters are the defaults of PhysioNet's reference
 *              ecgsyn.m. The tests check heart rate, RR variability, the LF/HF ratio and the P, R, T order.
 * GOTCHA: Atrial fibrillation (no P wave, irregular RR, small f waves) is an extension, not part of the publication.
 *         RR values are held per beat from a 1 Hz series interpolated linearly, where ecgsyn.m uses MATLAB's interp.
 */
import { type Random, seededRandom } from './random.ts';

export type EcgOptions = {
  seed: string;
  seconds: number;
  /** Output samples per second; must divide the internal rate of 512 Hz. */
  sampleRate?: number;
  heartRate?: number;
  /** Standard deviation of the heart rate, beats per minute. */
  heartRateSd?: number;
  /** Ratio of low (Mayer wave, 0.1 Hz) to high (respiratory, 0.25 Hz) frequency power in the RR series. */
  lfHfRatio?: number;
  atrialFibrillation?: boolean;
};

export type Ecg = { sampleRate: number; millivolts: number[]; rPeaks: number[] };

const INTERNAL_RATE = 512;
const DEG = Math.PI / 180;
const WAVES = {
  theta: [-70 * DEG, -15 * DEG, 0, 15 * DEG, 100 * DEG],
  a: [1.2, -5, 30, -7.5, 0.75],
  b: [0.25, 0.1, 0.1, 0.1, 0.4]
};

/** RR intervals in seconds sampled at 1 Hz, with a bimodal spectrum (ecgsyn.m rrprocess). */
export function rrProcess(
  random: Random,
  n: number,
  { heartRate, heartRateSd, lfHfRatio }: { heartRate: number; heartRateSd: number; lfHfRatio: number }
): number[] {
  const [w1, w2, c1, c2] = [2 * Math.PI * 0.1, 2 * Math.PI * 0.25, 2 * Math.PI * 0.01, 2 * Math.PI * 0.01];
  const rrMean = 60 / heartRate;
  const rrSd = (60 * heartRateSd) / heartRate ** 2;
  const gauss = (w: number, centre: number, width: number, power: number): number =>
    (power * Math.exp(-0.5 * ((w - centre) / width) ** 2)) / Math.sqrt(2 * Math.PI * width ** 2);
  const half = n / 2;
  const hw = Array.from({ length: half }, (_, k) => {
    const w = (2 * Math.PI * k) / n;
    return gauss(w, w1, c1, lfHfRatio) + gauss(w, w2, c2, 1);
  });
  const sw = [...hw, ...hw.slice().reverse()].map((h) => 0.5 * Math.sqrt(h));
  const phase0 = Array.from({ length: half - 1 }, () => 2 * Math.PI * random.next());
  const phase = [
    0,
    ...phase0,
    0,
    ...phase0
      .slice()
      .reverse()
      .map((p) => -p)
  ];
  const x = Array.from({ length: n }, (_, t) => {
    let re = 0;
    for (let k = 0; k < n; k++) {
      const angle = (2 * Math.PI * k * t) / n + (phase[k] ?? 0);
      re += (sw[k] ?? 0) * Math.cos(angle);
    }
    return re / n;
  });
  const mean = x.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(x.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  return x.map((v) => rrMean + ((v - mean) * rrSd) / sd);
}

function irregularRr(random: Random, n: number, heartRate: number): number[] {
  const rrMean = 60 / heartRate;
  return Array.from({ length: n }, () => Math.max(0.3, rrMean * (1 + 0.2 * random.normal())));
}

export function generateEcg(options: EcgOptions): Ecg {
  const sampleRate = options.sampleRate ?? 256;
  if (INTERNAL_RATE % sampleRate !== 0) throw new Error(`sample rate must divide ${INTERNAL_RATE}`);
  const heartRate = options.heartRate ?? 60;
  if (heartRate < 20 || heartRate > 250) throw new Error(`heart rate out of range: ${heartRate}`);
  const random = seededRandom(`ecg:${options.seed}`);
  const af = options.atrialFibrillation ?? false;

  const beats = Math.ceil((options.seconds * heartRate) / 60) + 2;
  const n = 2 ** Math.ceil(Math.log2(Math.max(4, (beats * 60) / heartRate)));
  const rr1Hz = af
    ? irregularRr(random, Math.max(n, beats * 2), heartRate)
    : rrProcess(random, n, {
        heartRate,
        heartRateSd: options.heartRateSd ?? 1,
        lfHfRatio: options.lfHfRatio ?? 0.5
      });

  const dt = 1 / INTERNAL_RATE;
  const total = Math.round(options.seconds * INTERNAL_RATE);
  const rrAt = new Float64Array(total);
  let t = 0;
  let i = 0;
  let beat = 0;
  while (i < total) {
    const rr = af ? (rr1Hz[Math.min(beat++, rr1Hz.length - 1)] ?? 1) : lerp(rr1Hz, t);
    const end = Math.min(total, Math.round((t + rr) * INTERNAL_RATE));
    rrAt.fill(rr, i, Math.max(i + 1, end));
    i = Math.max(i + 1, end);
    t += rr;
  }

  const hrFactor = Math.sqrt(heartRate / 60);
  const hrFactor2 = Math.sqrt(hrFactor);
  const theta = WAVES.theta.map((v, k) => v * ([hrFactor2, hrFactor, 1, hrFactor, hrFactor2][k] ?? 1));
  const b = WAVES.b.map((v) => v * hrFactor);
  const a = WAVES.a.map((v, k) => (af && k === 0 ? 0 : v));
  const fPhase = 2 * Math.PI * random.next();

  const derivs = (time: number, [x, y, z]: [number, number, number], omega: number): [number, number, number] => {
    const alpha = 1 - Math.sqrt(x * x + y * y);
    const angle = Math.atan2(y, x);
    const zBase = 0.005 * Math.sin(2 * Math.PI * 0.25 * time);
    let dz = -(z - zBase);
    for (let k = 0; k < 5; k++) {
      const d = (angle - (theta[k] ?? 0)) % (2 * Math.PI);
      const bk = b[k] ?? 1;
      dz -= (a[k] ?? 0) * d * Math.exp(-0.5 * (d / bk) ** 2);
    }
    return [alpha * x - omega * y, alpha * y + omega * x, dz];
  };

  const z = new Float64Array(total);
  const angles = new Float64Array(total);
  let state: [number, number, number] = [1, 0, 0.04];
  for (let s = 0; s < total; s++) {
    z[s] = state[2];
    angles[s] = Math.atan2(state[1], state[0]);
    const time = s * dt;
    const omega = (2 * Math.PI) / (rrAt[s] ?? 1);
    const k1 = derivs(time, state, omega);
    const k2 = derivs(time + dt / 2, add(state, k1, dt / 2), omega);
    const k3 = derivs(time + dt / 2, add(state, k2, dt / 2), omega);
    const k4 = derivs(time + dt, add(state, k3, dt), omega);
    const rk = (j: 0 | 1 | 2): number => state[j] + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
    state = [rk(0), rk(1), rk(2)];
  }

  const step = INTERNAL_RATE / sampleRate;
  const raw = Array.from({ length: Math.floor(total / step) }, (_, s) => z[s * step] ?? 0);
  const lo = Math.min(...raw);
  const hi = Math.max(...raw);
  const millivolts = raw.map((v, s) => {
    const scaled = ((v - lo) * 1.6) / (hi - lo) - 0.4;
    return af ? scaled + 0.05 * Math.sin(2 * Math.PI * 6 * (s / sampleRate) + fPhase) : scaled;
  });

  const rPeaks: number[] = [];
  for (let s = 1; s < total; s++) {
    if ((angles[s - 1] ?? 0) < 0 && (angles[s] ?? 0) >= 0) rPeaks.push(Math.round(s / step));
  }
  return { sampleRate, millivolts, rPeaks };
}

function lerp(series: number[], t: number): number {
  const k = Math.floor(t);
  const f = t - k;
  const a = series[Math.min(k, series.length - 1)] ?? 1;
  const b = series[Math.min(k + 1, series.length - 1)] ?? a;
  return a + f * (b - a);
}

function add(v: [number, number, number], d: [number, number, number], h: number): [number, number, number] {
  return [v[0] + h * d[0], v[1] + h * d[1], v[2] + h * d[2]];
}
