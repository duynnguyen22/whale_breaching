const TWO_PI = Math.PI * 2;
const MAX_RIPPLE_AGE = 8.5;
const RIPPLE_WAVELENGTH = 3.6;
const RIPPLE_K = TWO_PI / RIPPLE_WAVELENGTH;
const RIPPLE_LEAD_WIDTH = 2.0;
const RIPPLE_TRAIL_CUTOFF = 16.0;
const RIPPLE_TRAIL_SIGMA = 4.6;

function makeWave(angle, steepness, wavelength, speed, amplitude) {
  return Object.freeze({
    dirX: Math.cos(angle),
    dirZ: Math.sin(angle),
    steepness,
    wavelength,
    speed,
    amplitude,
  });
}

function smoothstep01(t) {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

export const WAVE_COMPONENTS = Object.freeze([
  makeWave(0.34, 0.62, 42.0, 8.1, 0.48),
  makeWave(-0.26, 0.58, 27.0, 6.5, 0.34),
  makeWave(0.82, 0.54, 16.5, 5.1, 0.21),
  makeWave(-0.71, 0.48, 10.2, 4.0, 0.13),
  makeWave(1.24, 0.42, 6.1, 3.1, 0.075),
  makeWave(-1.16, 0.38, 3.7, 2.4, 0.045),
]);

export function evaluateGerstnerWaves(x, z, time = 0) {
  let dx = 0;
  let dy = 0;
  let dz = 0;

  for (let i = 0; i < WAVE_COMPONENTS.length; i += 1) {
    const w = WAVE_COMPONENTS[i];
    const k = TWO_PI / w.wavelength;
    const phase = k * (w.dirX * x + w.dirZ * z - w.speed * time);
    const cosPhase = Math.cos(phase);
    const horiz = w.steepness * w.amplitude * cosPhase;

    dx += w.dirX * horiz;
    dz += w.dirZ * horiz;
    dy += w.amplitude * Math.sin(phase);
  }

  return { dx, dy, dz };
}

export function evaluateWaterDome(x, z, dome) {
  if (!dome || !(dome.height > 0) || !(dome.radius > 0)) {
    return 0;
  }

  const dx = x - (dome.x ?? 0);
  const dz = z - (dome.z ?? 0);
  const r2 = dx * dx + dz * dz;
  const radius = dome.radius;
  const maxR = 3 * radius;

  if (r2 >= maxR * maxR) {
    return 0;
  }

  const gaussian = dome.height * Math.exp(-r2 / (radius * radius));
  const innerCutoffR = 2 * radius;
  if (r2 <= innerCutoffR * innerCutoffR) {
    return gaussian;
  }

  const r = Math.sqrt(r2);
  const cutoff = smoothstep01((maxR - r) / radius);
  return gaussian * cutoff;
}

export function evaluateShockwaveRipples(x, z, time, ripples = []) {
  if (!Array.isArray(ripples) || ripples.length === 0) {
    return 0;
  }

  let total = 0;

  for (let i = 0; i < ripples.length; i += 1) {
    const r = ripples[i];
    if (!r) continue;

    const age = time - r.startTime;
    if (!(age > 0 && age < MAX_RIPPLE_AGE)) continue;

    const strength = r.strength ?? 1.0;
    if (strength === 0) continue;

    const speed = r.speed ?? 8.5;
    const rx = r.x ?? 0;
    const rz = r.z ?? 0;
    const dist = Math.hypot(x - rx, z - rz);
    const front = age * speed;
    const delta = dist - front;

    if (delta >= RIPPLE_LEAD_WIDTH || delta <= -RIPPLE_TRAIL_CUTOFF) {
      continue;
    }

    let spatialEnvelope;
    if (delta > 0) {
      const lead = smoothstep01(1 - delta / RIPPLE_LEAD_WIDTH);
      spatialEnvelope = lead * Math.exp(-delta * delta * 0.8);
    } else {
      const trailWindow = smoothstep01(1 + delta / RIPPLE_TRAIL_CUTOFF);
      spatialEnvelope =
        trailWindow *
        Math.exp(-(delta * delta) / (2 * RIPPLE_TRAIL_SIGMA * RIPPLE_TRAIL_SIGMA));
    }

    const rampIn = age < 0.08 ? smoothstep01(age / 0.08) : 1.0;
    const lifeLeft = 1 - age / MAX_RIPPLE_AGE;
    const timeDecay = lifeLeft * lifeLeft * Math.exp(-age * 0.25);
    const radialDecay = 1 / Math.sqrt(1 + dist * 0.08);

    total +=
      0.38 *
      strength *
      rampIn *
      timeDecay *
      radialDecay *
      spatialEnvelope *
      Math.cos(RIPPLE_K * delta);
  }

  return total;
}

export function evaluateOceanHeight(x, z, time, surfaceState = {}) {
  const state = surfaceState ?? {};
  return (
    evaluateGerstnerWaves(x, z, time).dy +
    evaluateWaterDome(x, z, state.dome) +
    evaluateShockwaveRipples(x, z, time, state.ripples)
  );
}
