import { describe, expect, it } from 'vitest';
import { type Ecg, generateEcg, rrProcess } from '../src/ecg.ts';
import { seededRandom } from '../src/random.ts';

const rrIntervals = (e: Ecg): number[] => e.rPeaks.slice(1).map((p, i) => (p - (e.rPeaks[i] ?? 0)) / e.sampleRate);
const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;
const sd = (xs: number[]): number => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/** Average beat around each R peak, from `before` to `after` seconds. */
function template(e: Ecg, before: number, after: number): number[] {
  const [b, a] = [Math.round(before * e.sampleRate), Math.round(after * e.sampleRate)];
  const beats = e.rPeaks.filter((p) => p - b >= 0 && p + a < e.millivolts.length);
  return Array.from({ length: a + b }, (_, k) => mean(beats.map((p) => e.millivolts[p - b + k] ?? 0)));
}

describe('generateEcg', () => {
  it('gives the same trace for the same seed', () => {
    const a = generateEcg({ seed: 's', seconds: 10, heartRate: 72 });
    const b = generateEcg({ seed: 's', seconds: 10, heartRate: 72 });
    expect(b.millivolts).toEqual(a.millivolts);
    expect(generateEcg({ seed: 't', seconds: 10, heartRate: 72 }).millivolts).not.toEqual(a.millivolts);
  });

  it.each([60, 85, 110])('beats at the requested %i bpm', (heartRate) => {
    const e = generateEcg({ seed: 'rate', seconds: 60, heartRate });
    expect(60 / mean(rrIntervals(e))).toBeCloseTo(heartRate, 0);
  });

  it('varies the RR interval by the requested heart rate standard deviation', () => {
    const e = generateEcg({ seed: 'hrv', seconds: 300, heartRate: 60, heartRateSd: 1 });
    expect(sd(rrIntervals(e))).toBeGreaterThan((60 / 3600) * 0.75);
    expect(sd(rrIntervals(e))).toBeLessThan((60 / 3600) * 1.25);
  });

  it('scales to -0.4 to 1.2 mV, as ecgsyn.m does', () => {
    const e = generateEcg({ seed: 'range', seconds: 10 });
    expect(Math.min(...e.millivolts)).toBeCloseTo(-0.4, 6);
    expect(Math.max(...e.millivolts)).toBeCloseTo(1.2, 6);
  });

  it('draws P before R and T after R', () => {
    const beat = template(generateEcg({ seed: 'order', seconds: 60, heartRate: 60 }), 0.4, 0.6);
    const at = (s: number): number => Math.round((0.4 + s) * 256);
    const peak = (from: number, to: number): number => Math.max(...beat.slice(at(from), at(to)));
    const baseline = beat[at(-0.35)] ?? 0;
    expect(peak(-0.3, -0.1) - baseline).toBeGreaterThan(0.1);
    expect(peak(0.15, 0.5) - baseline).toBeGreaterThan(0.2);
    expect(peak(-0.03, 0.03)).toBeGreaterThan(peak(0.15, 0.5));
  });

  it('rejects a sample rate that does not divide 512 Hz and impossible heart rates', () => {
    expect(() => generateEcg({ seed: 'x', seconds: 1, sampleRate: 300 })).toThrow('divide');
    expect(() => generateEcg({ seed: 'x', seconds: 1, heartRate: 400 })).toThrow('out of range');
  });
});

describe('rrProcess', () => {
  it('has the requested LF/HF power ratio (0.1 Hz Mayer waves to 0.25 Hz respiration)', () => {
    const n = 1024;
    const rr = rrProcess(seededRandom('spectrum'), n, { heartRate: 60, heartRateSd: 1, lfHfRatio: 0.5 });
    const m = mean(rr);
    const power = (lo: number, hi: number): number => {
      let p = 0;
      for (let k = Math.ceil(lo * n); k <= Math.floor(hi * n); k++) {
        let re = 0;
        let im = 0;
        rr.forEach((v, t) => {
          re += (v - m) * Math.cos((2 * Math.PI * k * t) / n);
          im -= (v - m) * Math.sin((2 * Math.PI * k * t) / n);
        });
        p += re * re + im * im;
      }
      return p;
    };
    expect(power(0.05, 0.15) / power(0.2, 0.3)).toBeCloseTo(0.5, 1);
  });
});

describe('atrial fibrillation extension', () => {
  const sinus = generateEcg({ seed: 'af', seconds: 120, heartRate: 85 });
  const af = generateEcg({ seed: 'af', seconds: 120, heartRate: 85, atrialFibrillation: true });

  it('makes the rhythm irregular', () => {
    const cv = (e: Ecg): number => sd(rrIntervals(e)) / mean(rrIntervals(e));
    expect(cv(sinus)).toBeLessThan(0.03);
    expect(cv(af)).toBeGreaterThan(0.1);
  });

  it('removes the P wave', () => {
    const pBump = (e: Ecg): number => {
      const beat = template(e, 0.3, 0.1);
      return Math.max(...beat.slice(Math.round(0.05 * 256), Math.round(0.22 * 256))) - (beat[0] ?? 0);
    };
    expect(pBump(af)).toBeLessThan(pBump(sinus) / 2);
  });
});
