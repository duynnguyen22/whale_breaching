export const BREACH_CYCLE_DURATION = 9.0;

const TWO_PI = Math.PI * 2;
const BREAKTHROUGH_PROGRESS = 0.24;
const SPLASHDOWN_PROGRESS = 0.67;

const X_KNOTS = [
  { p: 0.0, v: 0.0, m: 0.0 },
  { p: 0.23, v: 0.0, m: 0.0 },
  { p: 0.47, v: 0.25, m: 1.2 },
  { p: 0.64, v: 0.4, m: 0.2 },
  { p: 0.76, v: 0.3, m: -2.0 },
  { p: 0.89, v: -0.6, m: 0.0 },
  { p: 1.0, v: 0.0, m: 0.0 },
];

const Y_KNOTS = [
  { p: 0.0, v: -21.0, m: 24.0 },
  { p: 0.23, v: -1.0, m: 103.3 },
  { p: 0.47, v: 9.2, m: 0.0 },
  { p: 0.64, v: 1.8, m: -52.0 },
  { p: 0.76, v: -6.5, m: -82.0 },
  { p: 0.93, v: -21.6, m: 0.0 },
  { p: 1.0, v: -21.0, m: 24.0 },
];

const Z_KNOTS = [
  { p: 0.0, v: -10.0, m: 20.0 },
  { p: 0.23, v: -0.4, m: 32.0 },
  { p: 0.47, v: 5.5, m: 24.0 },
  { p: 0.64, v: 9.5, m: 24.0 },
  { p: 0.76, v: 12.5, m: 14.0 },
  { p: 0.785, v: 12.68, m: 0.0 },
  { p: 0.95, v: -10.5, m: 0.0 },
  { p: 1.0, v: -10.0, m: 20.0 },
];

const PITCH_KNOTS = [
  { p: 0.0, v: 1.05, m: 0.0 },
  { p: 0.14, v: 1.08, m: 0.0 },
  { p: 0.23, v: 1.05, m: -1.2 },
  { p: 0.47, v: 0.18, m: -3.2 },
  { p: 0.64, v: -0.3, m: -2.2 },
  { p: 0.76, v: -0.52, m: 0.0 },
  { p: 0.9, v: 0.45, m: 9.0 },
  { p: 1.0, v: 1.05, m: 0.0 },
];

const YAW_KNOTS = [
  { p: 0.0, v: 0.0, m: 0.0 },
  { p: 0.23, v: 0.0, m: 0.0 },
  { p: 0.47, v: 0.05, m: 0.1 },
  { p: 0.64, v: 0.06, m: -0.1 },
  { p: 0.76, v: 0.02, m: -0.5 },
  { p: 0.89, v: -0.05, m: 0.0 },
  { p: 1.0, v: 0.0, m: 0.0 },
];

const ROLL_KNOTS = [
  { p: 0.0, v: 0.0, m: 0.0 },
  { p: 0.21, v: 0.0, m: 0.0 },
  { p: 0.23, v: 0.04, m: 3.5 },
  { p: 0.47, v: 2.55, m: 3.0 },
  { p: 0.56, v: 2.75, m: 1.8 },
  { p: 0.64, v: 2.92, m: 2.8 },
  { p: 0.76, v: 3.55, m: 8.5 },
  { p: 1.0, v: TWO_PI, m: 0.0 },
];

const SPINE_ARCH_KNOTS = [
  { p: 0.0, v: 0.08, m: 0.0 },
  { p: 0.23, v: 0.22, m: 1.8 },
  { p: 0.47, v: 0.88, m: 1.2 },
  { p: 0.56, v: 0.96, m: 0.0 },
  { p: 0.64, v: 0.72, m: -5.0 },
  { p: 0.76, v: -0.12, m: -1.0 },
  { p: 0.88, v: -0.16, m: 0.8 },
  { p: 1.0, v: 0.08, m: 0.0 },
];

const FIN_SPREAD_KNOTS = [
  { p: 0.0, v: 0.18, m: 0.0 },
  { p: 0.23, v: 0.25, m: 1.5 },
  { p: 0.44, v: 1.0, m: 0.0 },
  { p: 0.5, v: 1.0, m: 0.0 },
  { p: 0.64, v: 0.86, m: -2.2 },
  { p: 0.76, v: 0.34, m: -2.0 },
  { p: 1.0, v: 0.18, m: 0.0 },
];

const TAIL_AMP_KNOTS = [
  { p: 0.0, v: 0.95, m: 0.0 },
  { p: 0.2, v: 0.98, m: 0.0 },
  { p: 0.23, v: 0.92, m: -2.5 },
  { p: 0.47, v: 0.3, m: -0.8 },
  { p: 0.6, v: 0.24, m: 0.0 },
  { p: 0.76, v: 0.48, m: 2.2 },
  { p: 1.0, v: 0.95, m: 0.0 },
];

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

export function evaluateBreachState(progress) {
  const p = wrapProgress(progress);
  const phaseName = resolvePhaseName(p);

  const hx = evalHermite(X_KNOTS, p);
  const hy = evalHermite(Y_KNOTS, p);
  const hz = evalHermite(Z_KNOTS, p);

  const pitch = evalHermite(PITCH_KNOTS, p).value;
  const yaw = evalHermite(YAW_KNOTS, p).value;
  const roll = evalHermite(ROLL_KNOTS, p).value;

  const spineArch = evalHermite(SPINE_ARCH_KNOTS, p).value;
  const finSpread = Math.min(1, Math.max(0, evalHermite(FIN_SPREAD_KNOTS, p).value));
  const tailBeatAmplitude = Math.max(0, evalHermite(TAIL_AMP_KNOTS, p).value);
  const tailBeatPhase = TWO_PI * (8 * p + 0.85 * Math.sin(TWO_PI * p));

  const jawOpen = 0.16 * plateauPulse(p, 0.25, 0.36, 0.42, 0.58);
  const emergenceIntensity = plateauPulse(p, 0.21, 0.29, 0.34, 0.49);
  const bodyShedIntensity = plateauPulse(p, 0.26, 0.46, 0.6, 0.7);
  const splashdownIntensity = plateauPulse(p, 0.635, 0.68, 0.71, 0.8);
  const wetness = evaluateWetness(p);
  const waterDome = evaluateDomeForProgress(p);

  return {
    progress: p,
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
} = {}) {
  const duration = cycleDuration > 0 ? cycleDuration : BREACH_CYCLE_DURATION;
  let loopEnabled = Boolean(autoLoop);
  let paused = false;
  let timeScale = 1.0;
  let progress = 0;
  let internalElapsed = 0;
  let currentState = evaluateBreachState(progress);

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
          const crossing = evaluateBreachState(BREAKTHROUGH_PROGRESS);
          const order = prevProgress < BREAKTHROUGH_PROGRESS
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
          const crossing = evaluateBreachState(SPLASHDOWN_PROGRESS);
          const order = prevProgress < SPLASHDOWN_PROGRESS
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
            },
          });
        }

        candidates.sort((a, b) => a.order - b.order);
        for (let i = 0; i < candidates.length; i += 1) {
          events.push(candidates[i].event);
        }
      }

      progress = nextProgress;
      currentState = evaluateBreachState(progress);

      // Scale velocity consistently if custom cycleDuration differs from BREACH_CYCLE_DURATION
      if (duration !== BREACH_CYCLE_DURATION) {
        const scale = BREACH_CYCLE_DURATION / duration;
        currentState = {
          ...currentState,
          velocity: {
            x: currentState.velocity.x * scale,
            y: currentState.velocity.y * scale,
            z: currentState.velocity.z * scale,
          },
        };
      }

      return { state: currentState, events };
    },

    triggerBreach() {
      progress = 0.13;
      paused = false;
      currentState = evaluateBreachState(progress);
      return currentState;
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
