import { describe, expect, it } from 'vitest';
import { writeEdf } from '../src/edf.ts';

const text = (b: Buffer, from: number, width: number): string => b.toString('ascii', from, from + width).trim();

describe('writeEdf', () => {
  const samples = Array.from({ length: 512 + 100 }, (_, i) => 30 * Math.sin(i / 10));
  const edf = writeEdf({
    patient: 'synthetic p1',
    recording: 'opentwin-synthea jansen-rit',
    start: new Date('2026-01-01T08:30:05Z'),
    sampleRate: 256,
    channels: [
      { label: 'EEG O1', unit: 'uV', samples },
      { label: 'EEG O2', unit: 'uV', samples: samples.map((v) => -v) }
    ]
  });

  it('writes the fixed header the specification lays out', () => {
    expect(text(edf, 0, 8)).toBe('0');
    expect(text(edf, 168, 8)).toBe('01.01.26');
    expect(text(edf, 176, 8)).toBe('08.30.05');
    expect(Number(text(edf, 184, 8))).toBe(768);
    expect(Number(text(edf, 236, 8))).toBe(2);
    expect(Number(text(edf, 244, 8))).toBe(1);
    expect(Number(text(edf, 252, 4))).toBe(2);
    expect(text(edf, 256, 16)).toBe('EEG O1');
    expect(edf.length).toBe(768 + 2 * 2 * 256 * 2);
  });

  it('stores samples that read back within one digital step', () => {
    const [min, max] = [-30, 30];
    const step = (max - min) / 65535;
    for (const i of [0, 17, 255]) {
      const digital = edf.readInt16LE(768 + i * 2);
      const physical = min + ((digital + 32768) / 65535) * (max - min);
      expect(Math.abs(physical - (samples[i] ?? 0))).toBeLessThanOrEqual(step);
    }
  });

  it('refuses header text that would break the fixed layout', () => {
    expect(() =>
      writeEdf({
        patient: 'é',
        recording: '',
        start: new Date(0),
        sampleRate: 1,
        channels: [{ label: 'x', unit: 'uV', samples: [0] }]
      })
    ).toThrow('ASCII');
  });
});
