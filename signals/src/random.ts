/**
 * WHAT: Seeded random numbers for every signal generator: xoshiro128** seeded from the sha256 of a seed string.
 * NOT:  Not cryptographic, and never Math.random; generators must not use any other source of randomness.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: xoshiro128** as published by Blackman and Vigna (https://prng.di.unimi.it/xoshiro128starstar.c);
 *              the reference outputs for state {1, 2, 3, 4} are in the tests.
 * GOTCHA: Changing this file changes every generated signal. The tests pin the sequence; keep them failing loudly.
 */
import { createHash } from 'node:crypto';

export type Random = {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal, Box-Muller. */
  normal(): number;
  /** Raw 32-bit output. */
  nextUint32(): number;
};

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

export function fromState(state: readonly [number, number, number, number]): Random {
  if (state.every((v) => v === 0)) throw new Error('xoshiro128** state must not be all zero');
  let [s0, s1, s2, s3] = state.map((v) => v >>> 0) as [number, number, number, number];
  let spare: number | null = null;
  const nextUint32 = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    return result;
  };
  const next = (): number => nextUint32() / 2 ** 32;
  const normal = (): number => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    const u = 1 - next();
    const r = Math.sqrt(-2 * Math.log(u));
    const angle = 2 * Math.PI * next();
    spare = r * Math.sin(angle);
    return r * Math.cos(angle);
  };
  return { next, normal, nextUint32 };
}

export function seededRandom(seed: string): Random {
  const digest = createHash('sha256').update(seed).digest();
  return fromState([digest.readUInt32LE(0), digest.readUInt32LE(4), digest.readUInt32LE(8), digest.readUInt32LE(12)]);
}
