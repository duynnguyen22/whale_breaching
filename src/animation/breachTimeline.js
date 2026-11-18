export const BREACH_CYCLE_DURATION = 9.0;
export const BREACH_VARIANTS = ['classic', 'chin-slam', 'barrel-port', 'tail-lob'];

const TWO_PI = Math.PI * 2;
const BREAKTHROUGH_PROGRESS = 0.24;
const SPLASHDOWN_PROGRESS = 0.67;

// Shared C1-compatible start (p = 0) and end (p = 1) boundary conditions across all variants:
// pos(0) = pos(1) = (0, -21, -10), dPos/dp(0) = dPos/dp(1) = (0, 24, 20),
// pitch = 1.05 (m=0), yaw = 0 (m=0), roll = 0 mod 2*pi (m=0),
// spineArch = 0.08 (m=0), finSpread = 0.18 (m=0), tailAmp = 0.95 (m=0).

const VARIANT_CURVES = {
  classic: {
    x: [
      { p: 0.0, v: 0.0, m: 0.0 },
      { p: 0.23, v: 0.0, m: 0.0 },
      { p: 0.47, v: 0.25, m: 1.2 },
      { p: 0.64, v: 0.4, m: 0.2 },
      { p: 0.76, v: 0.3, m: -2.0 },
      { p: 0.89, v: -0.6, m: 0.0 },
      { p: 1.0, v: 0.0, m: 0.0 },
    ],
    y: [
      { p: 0.0, v: -21.0, m: 24.0 },
      { p: 0.23, v: -1.0, m: 103.3 },
      { p: 0.47, v: 9.2, m: 0.0 },
      { p: 0.64, v: 1.8, m: -52.0 },
      { p: 0.76, v: -6.5, m: -82.0 },
      { p: 0.93, v: -21.6, m: 0.0 },
      { p: 1.0, v: -21.0, m: 24.0 },
    ],
    z: [
      { p: 0.0, v: -10.0, m: 20.0 },
      { p: 0.23, v: -0.4, m: 32.0 },
      { p: 0.47, v: 5.5, m: 24.0 },
      { p: 0.64, v: 9.5, m: 24.0 },
      { p: 0.76, v: 12.5, m: 14.0 },
      { p: 0.785, v: 12.68, m: 0.0 },
      { p: 0.95, v: -10.5, m: 0.0 },
      { p: 1.0, v: -10.0, m: 20.0 },
    ],
    pitch: [
      { p: 0.0, v: 1.05, m: 0.0 },
      { p: 0.14, v: 1.08, m: 0.0 },
      { p: 0.23, v: 1.05, m: -1.2 },
      { p: 0.47, v: 0.18, m: -3.2 },
      { p: 0.64, v: -0.3, m: -2.2 },
      { p: 0.76, v: -0.52, m: 0.0 },
      { p: 0.9, v: 0.45, m: 9.0 },
      { p: 1.0, v: 1.05, m: 0.0 },
    ],
    yaw: [
      { p: 0.0, v: 0.0, m: 0.0 },
      { p: 0.23, v: 0.0, m: 0.0 },
      { p: 0.47, v: 0.05, m: 0.1 },
      { p: 0.64, v: 0.06, m: -0.1 },
      { p: 0.76, v: 0.02, m: -0.5 },
      { p: 0.89, v: -0.05, m: 0.0 },
      { p: 1.0, v: 0.0, m: 0.0 },
    ],
    roll: [
      { p: 0.0, v: 0.0, m: 0.0 },
      { p: 0.21, v: 0.0, m: 0.0 },
      { p: 0.23, v: 0.04, m: 3.5 },
      { p: 0.47, v: 2.55, m: 3.0 },
      { p: 0.56, v: 2.75, m: 1.8 },
      { p: 0.64, v: 2.92, m: 2.8 },
      { p: 0.76, v: 3.55, m: 8.5 },
      { p: 1.0, v: TWO_PI, m: 0.0 },
    ],
    spineArch: [
      { p: 0.0, v: 0.08, m: 0.0 },
      { p: 0.23, v: 0.22, m: 1.8 },
      { p: 0.47, v: 0.88, m: 1.2 },
      { p: 0.56, v: 0.96, m: 0.0 },
      { p: 0.64, v: 0.72, m: -5.0 },
      { p: 0.76, v: -0.12, m: -1.0 },
      { p: 0.88, v: -0.16, m: 0.8 },
      { p: 1.0, v: 0.08, m: 0.0 },
    ],
    finSpread: [
      { p: 0.0, v: 0.18, m: 0.0 },
      { p: 0.23, v: 0.25, m: 1.5 },
      { p: 0.44, v: 1.0, m: 0.0 },
      { p: 0.5, v: 1.0, m: 0.0 },
      { p: 0.64, v: 0.86, m: -2.2 },
      { p: 0.76, v: 0.34, m: -2.0 },
      { p: 1.0, v: 0.18, m: 0.0 },
    ],
    tailAmp: [
      { p: 0.0, v: 0.95, m: 0.0 },
      { p: 0.2, v: 0.98, m: 0.0 },
      { p: 0.23, v: 0.92, m: -2.5 },
      { p: 0.47, v: 0.3, m: -0.8 },
      { p: 0.6, v: 0.24, m: 0.0 },
      { p: 0.76, v: 0.48, m: 2.2 },
      { p: 1.0, v: 0.95, m: 0.0 },
    ],
    jawPulse: { amp: 0.16, s0: 0.25, s1: 0.36, s2: 0.42, s3: 0.58 },
    blowPulse: { amp: 0.82, s0: 0.235, s1: 0.265, s2: 0.305, s3: 0.355 },
  },

  'chin-slam': {
    // Upright ventral lunge & massive flat chin/throat-pleat slam with wide horizontal wing flare
    x: [
      { p: 0.0, v: 0.0, m: 0.0 },
      { p: 0.23, v: 0.05, m: 0.6 },
      { p: 0.46, v: 0.75, m: 2.2 },
      { p: 0.64, v: 1.10, m: 0.8 },
      { p: 0.76, v: 0.85, m: -3.2 },
      { p: 0.90, v: -0.35, m: 0.0 },
      { p: 1.0, v: 0.0, m: 0.0 },
    ],
    y: [
      { p: 0.0, v: -21.0, m: 24.0 },
      { p: 0.23, v: -0.95, m: 98.0 },
      { p: 0.46, v: 8.4, m: 0.0 },
      { p: 0.64, v: 1.55, m: -52.0 },
      { p: 0.76, v: -6.8, m: -80.0 },
      { p: 0.93, v: -21.6, m: 0.0 },
      { p: 1.0, v: -21.0, m: 24.0 },
    ],
    z: [
      { p: 0.0, v: -10.0, m: 20.0 },
      { p: 0.23, v: -0.35, m: 34.0 },
      { p: 0.46, v: 6.2, m: 26.0 },
      { p: 0.64, v: 10.6, m: 24.0 },
      { p: 0.76, v: 13.4, m: 14.0 },
      { p: 0.79, v: 13.6, m: 0.0 },
      { p: 0.95, v: -10.5, m: 0.0 },
      { p: 1.0, v: -10.0, m: 20.0 },
    ],
    pitch: [
      { p: 0.0, v: 1.05, m: 0.0 },
      { p: 0.14, v: 1.08, m: 0.0 },
      { p: 0.23, v: 1.02, m: -1.6 },
      { p: 0.46, v: 0.24, m: -2.8 },
      { p: 0.64, v: -0.18, m: -2.1 },
      { p: 0.76, v: -0.48, m: 0.0 },
      { p: 0.90, v: 0.45, m: 9.0 },
      { p: 1.0, v: 1.05, m: 0.0 },
    ],
    yaw: [
      { p: 0.0, v: 0.0, m: 0.0 },
      { p: 0.23, v: 0.02, m: 0.3 },
      { p: 0.46, v: 0.15, m: 0.3 },
      { p: 0.64, v: 0.18, m: -0.1 },
      { p: 0.76, v: 0.08, m: -1.1 },
      { p: 0.90, v: -0.04, m: 0.0 },
      { p: 1.0, v: 0.0, m: 0.0 },
    ],
    roll: [
      { p: 0.0, v: 0.0, m: 0.0 },
      { p: 0.23, v: 0.02, m: 0.4 },
      { p: 0.46, v: 0.18, m: 0.0 },
      { p: 0.64, v: -0.06, m: -0.8 },
      { p: 0.76, v: -0.12, m: 0.4 },
      { p: 1.0, v: 0.0, m: 0.0 },
    ],
    spineArch: [
      { p: 0.0, v: 0.08, m: 0.0 },
      { p: 0.23, v: 0.28, m: 1.4 },
      { p: 0.40, v: 0.45, m: -0.6 },
      { p: 0.60, v: -0.28, m: -1.4 },
      { p: 0.72, v: -0.32, m: 1.2 },
      { p: 0.88, v: -0.08, m: 0.8 },
      { p: 1.0, v: 0.08, m: 0.0 },
    ],
    finSpread: [
      { p: 0.0, v: 0.18, m: 0.0 },
      { p: 0.23, v: 0.35, m: 2.2 },
      { p: 0.40, v: 1.0, m: 0.0 },
      { p: 0.60, v: 1.0, m: -0.5 },
      { p: 0.76, v: 0.32, m: -2.0 },
      { p: 1.0, v: 0.18, m: 0.0 },
    ],
    tailAmp: [
      { p: 0.0, v: 0.95, m: 0.0 },
      { p: 0.20, v: 0.98, m: 0.0 },
      { p: 0.23, v: 0.90, m: -2.2 },
      { p: 0.46, v: 0.36, m: -0.6 },
      { p: 0.64, v: 0.30, m: 0.5 },
      { p: 0.76, v: 0.55, m: 2.2 },
      { p: 1.0, v: 0.95, m: 0.0 },
    ],
    jawPulse: { amp: 0.38, s0: 0.26, s1: 0.36, s2: 0.49, s3: 0.63 },
    blowPulse: { amp: 0.88, s0: 0.235, s1: 0.265, s2: 0.325, s3: 0.39 },
  },

  'barrel-port': {
    // High explosive portside (-X) 360-degree counter-clockwise corkscrew breach
    x: [
      { p: 0.0, v: 0.0, m: 0.0 },
      { p: 0.23, v: -0.12, m: -2.2 },
      { p: 0.47, v: -1.45, m: -4.8 },
      { p: 0.64, v: -2.25, m: -2.4 },
      { p: 0.76, v: -2.35, m: 2.8 },
      { p: 0.90, v: -0.55, m: 6.5 },
      { p: 1.0, v: 0.0, m: 0.0 },
    ],
    y: [
      { p: 0.0, v: -21.0, m: 24.0 },
      { p: 0.23, v: -0.95, m: 106.5 },
      { p: 0.47, v: 9.8, m: 0.0 },
      { p: 0.64, v: 1.85, m: -54.0 },
      { p: 0.76, v: -6.8, m: -82.0 },
      { p: 0.93, v: -21.6, m: 0.0 },
      { p: 1.0, v: -21.0, m: 24.0 },
    ],
    z: [
      { p: 0.0, v: -10.0, m: 20.0 },
      { p: 0.23, v: -0.35, m: 31.0 },
      { p: 0.47, v: 5.1, m: 22.0 },
      { p: 0.64, v: 8.9, m: 23.0 },
      { p: 0.76, v: 11.8, m: 13.0 },
      { p: 0.785, v: 12.0, m: 0.0 },
      { p: 0.95, v: -10.5, m: 0.0 },
      { p: 1.0, v: -10.0, m: 20.0 },
    ],
    pitch: [
      { p: 0.0, v: 1.05, m: 0.0 },
      { p: 0.15, v: 1.10, m: 0.0 },
      { p: 0.23, v: 1.06, m: -1.2 },
      { p: 0.47, v: 0.22, m: -3.3 },
      { p: 0.64, v: -0.32, m: -2.3 },
      { p: 0.76, v: -0.55, m: 0.0 },
      { p: 0.90, v: 0.45, m: 9.0 },
      { p: 1.0, v: 1.05, m: 0.0 },
    ],
    yaw: [
      { p: 0.0, v: 0.0, m: 0.0 },
      { p: 0.23, v: -0.04, m: -0.5 },
      { p: 0.47, v: -0.22, m: -0.5 },
      { p: 0.64, v: -0.28, m: 0.0 },
      { p: 0.76, v: -0.16, m: 1.4 },
      { p: 0.90, v: 0.04, m: 0.0 },
      { p: 1.0, v: 0.0, m: 0.0 },
    ],
    roll: [
      { p: 0.0, v: 0.0, m: 0.0 },
      { p: 0.21, v: 0.0, m: 0.0 },
      { p: 0.23, v: -0.08, m: -3.8 },
      { p: 0.47, v: -2.85, m: -4.2 },
      { p: 0.64, v: -3.55, m: -4.5 },
      { p: 0.76, v: -4.45, m: -7.5 },
      { p: 1.0, v: -TWO_PI, m: 0.0 },
    ],
    spineArch: [
      { p: 0.0, v: 0.08, m: 0.0 },
      { p: 0.23, v: 0.26, m: 1.9 },
      { p: 0.50, v: 0.95, m: 0.4 },
      { p: 0.64, v: 0.70, m: -4.8 },
      { p: 0.76, v: -0.14, m: -1.0 },
      { p: 0.88, v: -0.16, m: 0.8 },
      { p: 1.0, v: 0.08, m: 0.0 },
    ],
    finSpread: [
      { p: 0.0, v: 0.18, m: 0.0 },
      { p: 0.23, v: 0.28, m: 1.8 },
      { p: 0.43, v: 1.0, m: 0.0 },
      { p: 0.56, v: 1.0, m: -0.4 },
      { p: 0.64, v: 0.88, m: -2.2 },
      { p: 0.76, v: 0.34, m: -2.0 },
      { p: 1.0, v: 0.18, m: 0.0 },
    ],
    tailAmp: [
      { p: 0.0, v: 0.95, m: 0.0 },
      { p: 0.20, v: 0.98, m: 0.0 },
      { p: 0.23, v: 0.92, m: -2.4 },
      { p: 0.47, v: 0.32, m: -0.6 },
      { p: 0.60, v: 0.28, m: 0.0 },
      { p: 0.76, v: 0.52, m: 2.2 },
      { p: 1.0, v: 0.95, m: 0.0 },
    ],
    jawPulse: { amp: 0.22, s0: 0.25, s1: 0.35, s2: 0.45, s3: 0.58 },
    blowPulse: { amp: 0.78, s0: 0.23, s1: 0.255, s2: 0.29, s3: 0.335 },
  },

  'tail-lob': {
    // Surfacing blowhole spout followed by steep nose-dive hoisting the 4.5m flukes ~10m high & thunderous tail-lob slam
    x: [
      { p: 0.0, v: 0.0, m: 0.0 },
      { p: 0.23, v: 0.0, m: 0.0 },
      { p: 0.42, v: -0.35, m: -1.8 },
      { p: 0.64, v: -0.65, m: -0.4 },
      { p: 0.76, v: -0.50, m: 2.2 },
      { p: 0.90, v: 0.15, m: 0.0 },
      { p: 1.0, v: 0.0, m: 0.0 },
    ],
    y: [
      { p: 0.0, v: -21.0, m: 24.0 },
      { p: 0.23, v: -0.65, m: 58.0 },
      { p: 0.34, v: 2.45, m: 6.0 },
      { p: 0.51, v: 3.65, m: 0.0 },
      { p: 0.64, v: 1.25, m: -40.0 },
      { p: 0.76, v: -6.2, m: -76.0 },
      { p: 0.93, v: -21.5, m: 0.0 },
      { p: 1.0, v: -21.0, m: 24.0 },
    ],
    z: [
      { p: 0.0, v: -10.0, m: 20.0 },
      { p: 0.23, v: -0.25, m: 28.0 },
      { p: 0.42, v: 4.4, m: 22.0 },
      { p: 0.64, v: 8.6, m: 18.0 },
      { p: 0.76, v: 11.2, m: 12.0 },
      { p: 0.79, v: 11.4, m: 0.0 },
      { p: 0.95, v: -10.5, m: 0.0 },
      { p: 1.0, v: -10.0, m: 20.0 },
    ],
    pitch: [
      { p: 0.0, v: 1.05, m: 0.0 },
      { p: 0.14, v: 0.96, m: -1.8 },
      { p: 0.23, v: 0.56, m: -3.6 },
      { p: 0.34, v: 0.08, m: -4.2 },
      { p: 0.52, v: -0.98, m: -1.2 },
      { p: 0.67, v: -0.38, m: 4.5 },
      { p: 0.78, v: -0.45, m: 0.0 },
      { p: 0.91, v: 0.48, m: 8.8 },
      { p: 1.0, v: 1.05, m: 0.0 },
    ],
    yaw: [
      { p: 0.0, v: 0.0, m: 0.0 },
      { p: 0.23, v: 0.0, m: 0.0 },
      { p: 0.50, v: -0.12, m: -0.2 },
      { p: 0.67, v: -0.10, m: 0.4 },
      { p: 0.85, v: 0.03, m: 0.0 },
      { p: 1.0, v: 0.0, m: 0.0 },
    ],
    roll: [
      { p: 0.0, v: 0.0, m: 0.0 },
      { p: 0.23, v: 0.0, m: 0.0 },
      { p: 0.50, v: 0.22, m: 0.4 },
      { p: 0.67, v: 0.08, m: -1.0 },
      { p: 0.82, v: -0.05, m: 0.3 },
      { p: 1.0, v: 0.0, m: 0.0 },
    ],
    spineArch: [
      { p: 0.0, v: 0.08, m: 0.0 },
      { p: 0.23, v: 0.18, m: 0.8 },
      { p: 0.40, v: 0.55, m: 2.2 },
      { p: 0.52, v: 0.78, m: -1.5 },
      { p: 0.67, v: -0.68, m: -3.2 },
      { p: 0.78, v: -0.28, m: 2.5 },
      { p: 1.0, v: 0.08, m: 0.0 },
    ],
    finSpread: [
      { p: 0.0, v: 0.18, m: 0.0 },
      { p: 0.23, v: 0.32, m: 1.2 },
      { p: 0.48, v: 0.82, m: 0.5 },
      { p: 0.64, v: 0.72, m: -1.8 },
      { p: 0.78, v: 0.28, m: -1.5 },
      { p: 1.0, v: 0.18, m: 0.0 },
    ],
    tailAmp: [
      { p: 0.0, v: 0.95, m: 0.0 },
      { p: 0.23, v: 0.75, m: -1.2 },
      { p: 0.42, v: 0.62, m: 1.8 },
      { p: 0.58, v: 1.15, m: 0.8 },
      { p: 0.72, v: 0.88, m: -1.2 },
      { p: 1.0, v: 0.95, m: 0.0 },
    ],
    jawPulse: { amp: 0.08, s0: 0.26, s1: 0.32, s2: 0.38, s3: 0.46 },
    blowPulse: { amp: 1.0, s0: 0.215, s1: 0.255, s2: 0.355, s3: 0.425 },
  },
};

function resolveVariantKey(variant) {
  if (typeof variant === 'string' && Object.prototype.hasOwnProperty.call(VARIANT_CURVES, variant)) {
    return variant;
  }
  return 'classic';
}

function wrapProgress(progress) {
  if (!Number.isFinite(progress)) return 0;
  if (progress >= 0 && progress < 1) return progress;
  const wrapped = progress - Math.floor(progress);
  return wrapped >= 1 ? 0 : wrapped;
}

function smoothstep01(t) {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

function plateauPulse(p, start, peakStart, peakEnd, end) {
  if (p <= start || p >= end) return 0;
  if (p < peakStart) return smoothstep01((p - start) / (peakStart - start));
  if (p <= peakEnd) return 1;
  return smoothstep01((end - p) / (end - peakEnd));
}

function evalHermite(knots, p) {
  let idx = 0;
  for (let i = 0; i < knots.length - 2; i += 1) {
    if (p < knots[i + 1].p) {
      idx = i;
      break;
    }
    idx = i + 1;
  }

  const k0 = knots[idx];
  const k1 = knots[idx + 1];
  const h = k1.p - k0.p;
  const u = (p - k0.p) / h;
  const u2 = u * u;
  const u3 = u2 * u;

  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;

  const value = h00 * k0.v + h10 * (h * k0.m) + h01 * k1.v + h11 * (h * k1.m);

  const dh00 = 6 * u2 - 6 * u;
  const dh10 = 3 * u2 - 4 * u + 1;
  const dh01 = -6 * u2 + 6 * u;
  const dh11 = 3 * u2 - 2 * u;

  const derivative =
    (dh00 * k0.v + dh10 * (h * k0.m) + dh01 * k1.v + dh11 * (h * k1.m)) / h;

  return { value, derivative };
}

function resolvePhaseName(p) {
  if (p < 0.23) return 'ascent';
  if (p < 0.47) return 'breakthrough';
  if (p < 0.64) return 'apex';
  if (p < 0.76) return 'splashdown';
  return 'recovery';
}

function evaluateDomeForProgress(p) {
  if (p <= 0.15 || p >= 0.27) {
    return { x: 0, z: 0, radius: 4.8, height: 0 };
  }

  if (p <= 0.215) {
    const u = smoothstep01((p - 0.15) / (0.215 - 0.15));
    return {
      x: 0,
      z: 0,
      radius: 3.4 + 1.4 * u,
      height: 1.85 * u,
    };
  }

  const u = smoothstep01((0.27 - p) / (0.27 - 0.215));
  return {
    x: 0,
    z: 0,
    radius: 4.8 + 0.7 * (1 - u),
    height: 1.85 * u,
  };
}

function evaluateWetness(p) {
  if (p <= 0.24 || p >= 0.68) return 1.0;
  if (p <= 0.63) {
    return 1.0 - 0.26 * smoothstep01((p - 0.24) / (0.63 - 0.24));
  }
  return 0.74 + 0.26 * smoothstep01((p - 0.63) / (0.68 - 0.63));
}

export function evaluateBreachState(progress, { variant = 'classic' } = {}) {
  const p = wrapProgress(progress);
  const variantKey = resolveVariantKey(variant);
  const curves = VARIANT_CURVES[variantKey];
  const phaseName = resolvePhaseName(p);

  const hx = evalHermite(curves.x, p);
  const hy = evalHermite(curves.y, p);
  const hz = evalHermite(curves.z, p);

  const pitch = evalHermite(curves.pitch, p).value;
  const yaw = evalHermite(curves.yaw, p).value;
  const roll = evalHermite(curves.roll, p).value;

  const spineArch = evalHermite(curves.spineArch, p).value;
  const finSpread = Math.min(1, Math.max(0, evalHermite(curves.finSpread, p).value));
  const tailBeatAmplitude = Math.max(0, evalHermite(curves.tailAmp, p).value);
  const tailBeatPhase = TWO_PI * (8 * p + 0.85 * Math.sin(TWO_PI * p));

  const jp = curves.jawPulse;
  const jawOpen = jp.amp * plateauPulse(p, jp.s0, jp.s1, jp.s2, jp.s3);

  const bp = curves.blowPulse;
  const blowIntensity = Math.min(
    1,
    Math.max(0, bp.amp * plateauPulse(p, bp.s0, bp.s1, bp.s2, bp.s3))
  );

  const emergenceIntensity = plateauPulse(p, 0.21, 0.29, 0.34, 0.49);
  const bodyShedIntensity = plateauPulse(p, 0.26, 0.46, 0.6, 0.7);
  const splashdownIntensity = plateauPulse(p, 0.635, 0.68, 0.71, 0.8);
  const wetness = evaluateWetness(p);
  const waterDome = evaluateDomeForProgress(p);

  return {
    progress: p,
    variant: variantKey,
    phaseName,
    position: {
      x: hx.value,
      y: hy.value,
      z: hz.value,
    },
    velocity: {
      x: hx.derivative / BREACH_CYCLE_DURATION,
      y: hy.derivative / BREACH_CYCLE_DURATION,
      z: hz.derivative / BREACH_CYCLE_DURATION,
    },
    rotation: {
      pitch,
      yaw,
      roll,
    },
    spineArch,
    tailBeatPhase,
    tailBeatAmplitude,
    finSpread,
    jawOpen,
    blowIntensity,
    waterDome,
    emergenceIntensity,
    bodyShedIntensity,
    splashdownIntensity,
    wetness,
  };
}

function countThresholdCrossings(prev, rawEnd, nextWrapped, loopEnabled, threshold) {
  if (!loopEnabled || rawEnd < 1) {
    const end = loopEnabled ? rawEnd : Math.min(rawEnd, 1 - 1e-6);
    return prev < threshold && end >= threshold ? 1 : 0;
  }

  const fullLoops = Math.floor(rawEnd);
  return (
    (prev < threshold ? 1 : 0) +
    (fullLoops - 1) +
    (nextWrapped >= threshold ? 1 : 0)
  );
}

export function createBreachController({
  cycleDuration = BREACH_CYCLE_DURATION,
  autoLoop = true,
  variant = 'auto',
} = {}) {
  const duration = cycleDuration > 0 ? cycleDuration : BREACH_CYCLE_DURATION;
  let loopEnabled = Boolean(autoLoop);
  let paused = false;
  let timeScale = 1.0;
  let progress = 0;
  let internalElapsed = 0;

  let variantMode =
    variant === 'auto' || BREACH_VARIANTS.includes(variant) ? variant : 'auto';
  let cycleIndex =
    variantMode === 'auto' ? 0 : BREACH_VARIANTS.indexOf(variantMode);

  function resolveActiveVariant() {
    if (variantMode === 'auto') {
      return BREACH_VARIANTS[cycleIndex % BREACH_VARIANTS.length];
    }
    return variantMode;
  }

  function evaluateScaledState(p, activeVariant) {
    const st = evaluateBreachState(p, { variant: activeVariant });
    if (duration === BREACH_CYCLE_DURATION) {
      return st;
    }
    const scale = BREACH_CYCLE_DURATION / duration;
    return {
      ...st,
      velocity: {
        x: st.velocity.x * scale,
        y: st.velocity.y * scale,
        z: st.velocity.z * scale,
      },
    };
  }

  let currentState = evaluateScaledState(progress, resolveActiveVariant());

  return {
    update(dt, elapsedTime) {
      const events = [];
      if (paused || !(dt > 0) || timeScale === 0) {
        return { state: currentState, events };
      }

      const scaledDt = dt * timeScale;
      internalElapsed += scaledDt;
      const now = Number.isFinite(elapsedTime) ? elapsedTime : internalElapsed;

      const deltaProgress = scaledDt / duration;
      const prevProgress = progress;
      const rawEnd = prevProgress + deltaProgress;
      const nextProgress = loopEnabled
        ? wrapProgress(rawEnd)
        : Math.min(rawEnd, 1 - 1e-6);

      const prevActiveVariant = resolveActiveVariant();
      if (loopEnabled && rawEnd >= 1 && variantMode === 'auto') {
        const wrappedLoops = Math.floor(rawEnd);
        cycleIndex = (cycleIndex + wrappedLoops) % BREACH_VARIANTS.length;
      }
      const nextActiveVariant = resolveActiveVariant();

      if (rawEnd > prevProgress) {
        const candidates = [];

        if (
          countThresholdCrossings(
            prevProgress,
            rawEnd,
            nextProgress,
            loopEnabled,
            BREAKTHROUGH_PROGRESS,
          ) > 0
        ) {
          const crossingVariant =
            prevProgress < BREAKTHROUGH_PROGRESS
              ? prevActiveVariant
              : nextActiveVariant;
          const crossing = evaluateBreachState(BREAKTHROUGH_PROGRESS, {
            variant: crossingVariant,
          });
          const order =
            prevProgress < BREAKTHROUGH_PROGRESS
              ? BREAKTHROUGH_PROGRESS
              : 1 + BREAKTHROUGH_PROGRESS;
          candidates.push({
            order,
            event: {
              type: 'breakthrough',
              x: crossing.position.x,
              z: crossing.position.z,
              startTime: now,
              strength: 1.2,
              speed: 8.5,
              variant: crossingVariant,
              heading: crossing.rotation.yaw,
              roll: crossing.rotation.roll,
            },
          });
        }

        if (
          countThresholdCrossings(
            prevProgress,
            rawEnd,
            nextProgress,
            loopEnabled,
            SPLASHDOWN_PROGRESS,
          ) > 0
        ) {
          const crossingVariant =
            prevProgress < SPLASHDOWN_PROGRESS
              ? prevActiveVariant
              : nextActiveVariant;
          const crossing = evaluateBreachState(SPLASHDOWN_PROGRESS, {
            variant: crossingVariant,
          });
          const order =
            prevProgress < SPLASHDOWN_PROGRESS
              ? SPLASHDOWN_PROGRESS
              : 1 + SPLASHDOWN_PROGRESS;
          candidates.push({
            order,
            event: {
              type: 'splashdown',
              x: crossing.position.x,
              z: crossing.position.z,
              startTime: now,
              strength: 1.75,
              speed: 9.2,
              variant: crossingVariant,
              heading: crossing.rotation.yaw,
              roll: crossing.rotation.roll,
            },
          });
        }

        candidates.sort((a, b) => a.order - b.order);
        for (let i = 0; i < candidates.length; i += 1) {
          events.push(candidates[i].event);
        }
      }

      progress = nextProgress;
      currentState = evaluateScaledState(progress, nextActiveVariant);

      return { state: currentState, events };
    },

    triggerBreach() {
      progress = 0.13;
      paused = false;
      currentState = evaluateScaledState(progress, resolveActiveVariant());
      return currentState;
    },

    setVariant(mode) {
      if (mode === 'auto') {
        const curActive = resolveActiveVariant();
        variantMode = 'auto';
        if (progress < 0.01 || progress > 0.99) {
          cycleIndex = 0;
        } else {
          cycleIndex = Math.max(0, BREACH_VARIANTS.indexOf(curActive));
        }
        currentState = evaluateScaledState(progress, resolveActiveVariant());
      } else if (BREACH_VARIANTS.includes(mode)) {
        variantMode = mode;
        cycleIndex = BREACH_VARIANTS.indexOf(mode);
        currentState = evaluateScaledState(progress, resolveActiveVariant());
      }
      return variantMode;
    },

    getVariant() {
      return variantMode;
    },

    getActiveVariant() {
      return resolveActiveVariant();
    },

    setPaused(flag) {
      paused = Boolean(flag);
    },

    isPaused() {
      return paused;
    },

    setTimeScale(scale) {
      if (Number.isFinite(scale) && scale >= 0) {
        timeScale = scale;
      }
    },

    getTimeScale() {
      return timeScale;
    },

    setAutoLoop(flag) {
      loopEnabled = Boolean(flag);
    },

    getState() {
      return currentState;
    },
  };
}
