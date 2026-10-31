/**
 * WHAT: Synthetic NREM sleep EEG (stages N2 and N3) from the thalamocortical neural mass model of Schellenberger
 *       Costa et al.: a cortical column (pyramidal and inhibitory populations with sodium-dependent adaptation)
 *       coupled to a thalamic relay and reticular population with T-type calcium and h currents.
 * NOT:  Not a model of any real brain, of wake or REM sleep, or of sleep disorders. Not for diagnosis or for training
 *       anything that will be used on patients without separate validation.
 * GOVERNED BY: docs/signals.md
 * CORRECTNESS: Schellenberger Costa M, Weigenand A, Ngo HVV, Marshall L, Born J, Martinetz T, Claussen JC. A
 *              thalamocortical neural mass model of the EEG during NREM sleep and its response to auditory
 *              stimulation. PLoS Comput Biol 12(9):e1005022, 2016: equations S1 Text (A.1-A.5), parameters S1 Table
 *              and Table 2 (N2, N3). k1 = 2.5e7 mM^-4 ms^-1 is from Destexhe et al., J Neurophysiol 76:2049, 1996,
 *              the source of the h-current kinetics, as S1 Table omits it. The firing rate includes C = pi / sqrt(3)
 *              from Weigenand et al., PLoS Comput Biol 10:e1003923, 2014, Eq. 1 and Text S2, which A.5 leaves out.
 *              CALIBRATED, not reproduced: at the published N2 and N3 settings this implementation's cortex sits
 *              further from its bifurcation than the paper's (its canard explosion at sigma_p 4.6 lies near g_KNa
 *              1.65 instead of about 1.45), so g_KNa is raised to 1.68 (N2) and 2.10 (N3), chosen so that every seed
 *              tested shows the paper's stage behaviour. The tests check it: N2 isolated K-complexes (troughs
 *              below -69 mV) and thalamic spindles at 12 to 15 Hz; N3 slow oscillations near 0.8 Hz.
 * GOTCHA: S1 Text has sign and index slips, read here as: currents are outward positive, so I_T and I_h enter the
 *         relay membrane equation with the same sign as the leak currents and calcium influx is -alpha_Ca * I_T;
 *         the second E_Ca (-40 mV) is E_h; J_L, I_LK and I_T^r use their own population's voltage and gating; the
 *         s_rt equation decays s_rt. Noise phi_n' into the inhibitory population has the cortical SD (extension).
 *         The pyramidal voltage is the EEG source; scalp microvolts are 5 x its deviation from the mean (extension).
 */
import { seededRandom } from './random.ts';

export type SleepStage = 'N2' | 'N3';

/** Table 2 of the paper, with g_KNa calibrated (published: N2 1.33, N3 1.88). */
export const STAGES: Record<SleepStage, { sigmaP: number; gKNa: number; gLK: number; gH: number }> = {
  N2: { sigmaP: 4.7, gKNa: 1.68, gLK: 0.034, gH: 0.052 },
  N3: { sigmaP: 6, gKNa: 2.1, gLK: 0.034, gH: 0.062 }
};
export const PUBLISHED_G_KNA: Record<SleepStage, number> = { N2: 1.33, N3: 1.88 };

const BASE = {
  Cm: 1,
  tauP: 30,
  tauI: 30,
  tauT: 20,
  tauR: 20,
  QmaxP: 30e-3,
  QmaxI: 60e-3,
  QmaxT: 400e-3,
  QmaxR: 400e-3,
  theta: -58.5,
  sigmaI: 6,
  sigmaT: 6,
  sigmaR: 6,
  gammaE: 70e-3,
  gammaG: 58.6e-3,
  gammaR: 100e-3,
  nu: 120e-3,
  Npp: 120,
  Nip: 72,
  Npi: 90,
  Nii: 90,
  Ntp: 2.6,
  Nrp: 2.6,
  Nrt: 3,
  Ntr: 5,
  Nrr: 19,
  Npt: 2.5,
  Nit: 2.5,
  wAMPA: 1,
  wGABA: 1,
  gTt: 3,
  gTr: 2.3,
  ELcortex: -64,
  ELthalamus: -70,
  EK: -100,
  ECa: 120,
  Eh: -40,
  EAMPA: 0,
  EGABA: -70,
  alphaNa: 2,
  tauNa: 1.7,
  Rpump: 0.09,
  NaEq: 9.5,
  alphaCa: 51.8e-6,
  tauCa: 10,
  Ca0: 2.4e-4,
  k1: 2.5e7,
  k2: 4e-4,
  k3: 1e-1,
  k4: 1e-3,
  nP: 4,
  gInc: 2,
  phiSdCortex: 120e-3,
  phiSdThalamus: 10e-3
};

const TEMPERATURE = 3 ** 1.2;
/** Firing rate, Weigenand et al. 2014 Eq. 1, with C = pi / sqrt(3), which S1 Text (A.5) leaves out. */
const C = Math.PI / Math.sqrt(3);

/** Pyramidal (EEG source) and thalamic relay membrane voltages in mV at `sampleRate`, after `settleMs` of start-up. */
export function thalamocortical(
  seed: string,
  stage: SleepStage,
  seconds: number,
  { sampleRate = 256, settleMs = 10_000 }: { sampleRate?: number; settleMs?: number } = {}
): { vp: Float64Array; vt: Float64Array } {
  const s = STAGES[stage];
  const P = BASE;
  const dtMs = 1000 / (sampleRate * 40);
  const random = seededRandom(`sleep-eeg:${seed}:${stage}`);
  const every = 40;
  const settle = Math.round(settleMs / dtMs);
  const total = Math.round(seconds * sampleRate);
  const vp = new Float64Array(total);
  const vt = new Float64Array(total);
  const sqrtDt = Math.sqrt(dtMs);
  const sig = (v: number, qmax: number, sigma: number): number => qmax / (1 + Math.exp((-C * (v - P.theta)) / sigma));
  const pump = (na: number): number => P.Rpump * (na ** 3 / (na ** 3 + 3375) - P.NaEq ** 3 / (P.NaEq ** 3 + 3375));

  let [Vp, Vi, Vt, Vr] = [-68, -68, -68, -68];
  let [sep, dsep, sei, dsei, set, dset, ser, dser] = [0, 0, 0, 0, 0, 0, 0, 0];
  let [sgp, dsgp, sgi, dsgi, srt, dsrt, srr, dsrr] = [0, 0, 0, 0, 0, 0, 0, 0];
  let [phiP, dphiP, phiT, dphiT] = [0, 0, 0, 0];
  let hTt = 1 / (1 + Math.exp((Vt + 81) / 4));
  let hTr = 1 / (1 + Math.exp((Vr + 80) / 5));
  let [mh1, mh2, Ca, Na] = [0, 0, P.Ca0, P.NaEq];

  for (let n = 0; n < settle + total * every; n++) {
    const Qp = sig(Vp, P.QmaxP, s.sigmaP);
    const Qi = sig(Vi, P.QmaxI, P.sigmaI);
    const Qt = sig(Vt, P.QmaxT, P.sigmaT);
    const Qr = sig(Vr, P.QmaxR, P.sigmaR);

    const IKNa = (s.gKNa * 0.37 * (Vp - P.EK)) / (1 + (38.7 / Na) ** 3.5);
    const mTt = 1 / (1 + Math.exp(-(Vt + 59) / 6.2));
    const mTr = 1 / (1 + Math.exp(-(Vr + 52) / 7.4));
    const ITt = P.gTt * mTt * mTt * hTt * (Vt - P.ECa);
    const ITr = P.gTr * mTr * mTr * hTr * (Vr - P.ECa);
    const Ih = s.gH * (mh1 + P.gInc * mh2) * (Vt - P.Eh);
    const ILKt = s.gLK * (Vt - P.EK);
    const ILKr = s.gLK * (Vr - P.EK);

    const dVp =
      (-(Vp - P.ELcortex) - P.wAMPA * sep * (Vp - P.EAMPA) - P.wGABA * sgp * (Vp - P.EGABA) - (P.tauP / P.Cm) * IKNa) /
      P.tauP;
    const dVi = (-(Vi - P.ELcortex) - P.wAMPA * sei * (Vi - P.EAMPA) - P.wGABA * sgi * (Vi - P.EGABA)) / P.tauI;
    const dVt =
      (-(Vt - P.ELthalamus) -
        P.wAMPA * set * (Vt - P.EAMPA) -
        P.wGABA * srt * (Vt - P.EGABA) -
        (P.tauT / P.Cm) * (ILKt + ITt + Ih)) /
      P.tauT;
    const dVr =
      (-(Vr - P.ELthalamus) -
        P.wAMPA * ser * (Vr - P.EAMPA) -
        P.wGABA * srr * (Vr - P.EGABA) -
        (P.tauR / P.Cm) * (ILKr + ITr)) /
      P.tauR;

    const second = (gamma: number, input: number, x: number, dx: number): number =>
      gamma * gamma * (input - x) - 2 * gamma * dx;
    const ddsep = second(P.gammaE, P.Npp * Qp + P.Npt * phiT, sep, dsep);
    const ddsei = second(P.gammaE, P.Nip * Qp + P.Nit * phiT, sei, dsei);
    const ddset = second(P.gammaE, P.Ntp * phiP, set, dset);
    const ddser = second(P.gammaE, P.Nrt * Qt + P.Nrp * phiP, ser, dser);
    const ddsgp = second(P.gammaG, P.Npi * Qi, sgp, dsgp);
    const ddsgi = second(P.gammaG, P.Nii * Qi, sgi, dsgi);
    const ddsrt = second(P.gammaR, P.Ntr * Qr, srt, dsrt);
    const ddsrr = second(P.gammaR, P.Nrr * Qr, srr, dsrr);
    const ddphiP = second(P.nu, Qp, phiP, dphiP);
    const ddphiT = second(P.nu, Qt, phiT, dphiT);

    const tauHt = (30.8 + (211.4 + Math.exp((Vt + 115.2) / 5)) / (1 + Math.exp((Vt + 86) / 3.2))) / TEMPERATURE;
    const tauHr = (85 + 1 / (Math.exp((Vr + 48) / 4) + Math.exp(-(Vr + 407) / 50))) / TEMPERATURE;
    const dhTt = (1 / (1 + Math.exp((Vt + 81) / 4)) - hTt) / tauHt;
    const dhTr = (1 / (1 + Math.exp((Vr + 80) / 5)) - hTr) / tauHr;
    const mhInf = 1 / (1 + Math.exp((Vt + 75) / 5.5));
    const tauMh = 20 + 1000 / (Math.exp((Vt + 71.5) / 14.2) + Math.exp(-(Vt + 89) / 11.6));
    const ca4 = P.k1 * Ca ** P.nP;
    const Ph = ca4 / (ca4 + P.k2);
    const dmh1 = (mhInf * (1 - mh2) - mh1) / tauMh - P.k3 * Ph * mh1 + P.k4 * mh2;
    const dmh2 = P.k3 * Ph * mh1 - P.k4 * mh2;
    const dCa = -P.alphaCa * ITt - (Ca - P.Ca0) / P.tauCa;
    const dNa = (P.alphaNa * Qp - pump(Na)) / P.tauNa;

    const gE2 = P.gammaE * P.gammaE;
    const noiseP = gE2 * P.phiSdCortex * sqrtDt * random.normal();
    const noiseI = gE2 * P.phiSdCortex * sqrtDt * random.normal();
    const noiseT = gE2 * P.phiSdThalamus * sqrtDt * random.normal();

    Vp += dtMs * dVp;
    Vi += dtMs * dVi;
    Vt += dtMs * dVt;
    Vr += dtMs * dVr;
    sep += dtMs * dsep;
    dsep += dtMs * ddsep + noiseP;
    sei += dtMs * dsei;
    dsei += dtMs * ddsei + noiseI;
    set += dtMs * dset;
    dset += dtMs * ddset + noiseT;
    ser += dtMs * dser;
    dser += dtMs * ddser;
    sgp += dtMs * dsgp;
    dsgp += dtMs * ddsgp;
    sgi += dtMs * dsgi;
    dsgi += dtMs * ddsgi;
    srt += dtMs * dsrt;
    dsrt += dtMs * ddsrt;
    srr += dtMs * dsrr;
    dsrr += dtMs * ddsrr;
    phiP += dtMs * dphiP;
    dphiP += dtMs * ddphiP;
    phiT += dtMs * dphiT;
    dphiT += dtMs * ddphiT;
    hTt += dtMs * dhTt;
    hTr += dtMs * dhTr;
    mh1 += dtMs * dmh1;
    mh2 += dtMs * dmh2;
    Ca += dtMs * dCa;
    Na += dtMs * dNa;

    const k = n - settle;
    if (k >= 0 && k % every === 0) {
      vp[k / every] = Vp;
      vt[k / every] = Vt;
    }
  }
  return { vp, vt };
}

/** Sleep EEG channels in microvolts, each its own thalamocortical model with independent noise. */
export function generateSleepEeg(options: {
  seed: string;
  stage: SleepStage;
  seconds: number;
  channels: readonly string[];
}): { sampleRate: number; channels: { label: string; microvolts: number[] }[] } {
  if (options.channels.length === 0) throw new Error('at least one channel is needed');
  const sampleRate = 256;
  return {
    sampleRate,
    channels: options.channels.map((label) => {
      const { vp } = thalamocortical(`${options.seed}:${label}`, options.stage, options.seconds, { sampleRate });
      const mean = vp.reduce((a, v) => a + v, 0) / vp.length;
      return { label, microvolts: Array.from(vp, (v) => 5 * (v - mean)) };
    })
  };
}
