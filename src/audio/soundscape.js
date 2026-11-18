export const SURFACE_AIR_CUTOFF_HZ = 16000;
export const SURFACE_SUBMERGED_CUTOFF_HZ = 320;
export const BLOW_AUTO_TRIGGER_THRESHOLD = 0.35;
export const BLOW_AUTO_COOLDOWN_SECONDS = 1.2;

const MASTER_TARGET_GAIN = 0.82;
const TWO_PI = Math.PI * 2;

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function smoothstep01(t) {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function evaluateWhaleSongPhrase(songClock) {
  // 4 expressive cetacean vocal phrases (~3.6s each) spanning 90..420 Hz
  const phraseDuration = 3.6;
  const totalCycle = phraseDuration * 4;
  const wrapped = ((songClock % totalCycle) + totalCycle) % totalCycle;
  const phraseIdx = Math.floor(wrapped / phraseDuration);
  const localT = (wrapped - phraseIdx * phraseDuration) / phraseDuration;

  // Active vocalization occupies 0.04..0.86 of each phrase with soft attack/release
  let envelope = 0;
  if (localT > 0.04 && localT < 0.86) {
    const attack = smoothstep01((localT - 0.04) / 0.16);
    const release = smoothstep01((0.86 - localT) / 0.24);
    envelope = attack * release;
  }

  const u = clamp((localT - 0.04) / 0.82, 0, 1);
  let baseHz = 180;
  let harmonicRatio = 1.5;

  if (phraseIdx === 0) {
    // Rising humpback cry: 116 -> 376 -> 290 Hz
    baseHz = u < 0.62
      ? lerp(116, 376, smoothstep01(u / 0.62))
      : lerp(376, 290, smoothstep01((u - 0.62) / 0.38));
    harmonicRatio = 1.5;
  } else if (phraseIdx === 1) {
    // Haunting descending moan: 338 -> 142 -> 102 Hz
    baseHz = u < 0.55
      ? lerp(338, 142, smoothstep01(u / 0.55))
      : lerp(142, 102, smoothstep01((u - 0.55) / 0.45));
    harmonicRatio = 2.0;
  } else if (phraseIdx === 2) {
    // Expressive harmonic whoop: 152 -> 404 -> 224 Hz
    baseHz = u < 0.48
      ? lerp(152, 404, smoothstep01(u / 0.48))
      : lerp(404, 224, smoothstep01((u - 0.48) / 0.52));
    harmonicRatio = 1.5;
  } else {
    // Deep oceanic call: 218 -> 126 -> 96 Hz
    baseHz = u < 0.5
      ? lerp(218, 126, smoothstep01(u / 0.5))
      : lerp(126, 96, smoothstep01((u - 0.5) / 0.5));
    harmonicRatio = 2.0;
  }

  const vibrato = Math.sin(songClock * TWO_PI * 5.1) * 4.2 * envelope;
  const pitchHz = clamp(baseHz + vibrato, 90, 420);

  return {
    pitchHz,
    envelope,
    harmonicRatio,
  };
}

function resolveBrowserAudioContextCtor() {
  const win = typeof window !== 'undefined' ? window : globalThis;
  const Ctor =
    win?.AudioContext ||
    win?.webkitAudioContext ||
    globalThis?.AudioContext ||
    globalThis?.webkitAudioContext ||
    null;
  return typeof Ctor === 'function' ? Ctor : null;
}

function createSeededRandom(seed = 0x5f3759df) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setParamSmooth(param, targetValue, now, timeConstant = 0.03) {
  if (!param) return;
  const safeVal = Number.isFinite(targetValue) ? targetValue : 0;
  const safeNow = Number.isFinite(now) ? Math.max(0, now) : 0;
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(safeNow);
  }
  if (typeof param.setTargetAtTime === 'function') {
    param.setTargetAtTime(safeVal, safeNow, Math.max(0.004, timeConstant));
  } else if (typeof param.setValueAtTime === 'function') {
    param.setValueAtTime(safeVal, safeNow);
  } else {
    param.value = safeVal;
  }
}

function crossfadeLoopTail(data, fadeSamples) {
  const len = data.length;
  const n = Math.min(fadeSamples, Math.floor(len * 0.15));
  for (let i = 0; i < n; i += 1) {
    const t = i / n;
    const smooth = t * t * (3 - 2 * t);
    const tailIdx = len - n + i;
    data[tailIdx] = data[tailIdx] * (1 - smooth) + data[i] * smooth;
  }
}

function buildPinkNoiseBuffer(ctx, durationSeconds = 3.5, seed = 0x1a2b3c4d) {
  const rate = ctx.sampleRate || 48000;
  const length = Math.max(4096, Math.floor(rate * durationSeconds));
  const channels = 2;
  const buffer = ctx.createBuffer(channels, length, rate);
  const rand = createSeededRandom(seed);

  for (let ch = 0; ch < channels; ch += 1) {
    const out = buffer.getChannelData(ch);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    let peak = 1e-6;

    for (let i = 0; i < length; i += 1) {
      const white = rand() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const sample = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      out[i] = sample;
      const abs = Math.abs(sample);
      if (abs > peak) peak = abs;
    }

    const invPeak = 0.85 / peak;
    for (let i = 0; i < length; i += 1) {
      out[i] *= invPeak;
    }
    crossfadeLoopTail(out, Math.min(2048, Math.floor(rate * 0.04)));
  }

  return buffer;
}

function buildBrownNoiseBuffer(ctx, durationSeconds = 3.5, seed = 0x778899aa) {
  const rate = ctx.sampleRate || 48000;
  const length = Math.max(4096, Math.floor(rate * durationSeconds));
  const channels = 2;
  const buffer = ctx.createBuffer(channels, length, rate);
  const rand = createSeededRandom(seed);

  for (let ch = 0; ch < channels; ch += 1) {
    const out = buffer.getChannelData(ch);
    let last = 0;
    let dcMean = 0;
    for (let i = 0; i < length; i += 1) {
      const white = rand() * 2 - 1;
      last = (last + 0.024 * white) / 1.024;
      out[i] = last;
      dcMean += last;
    }
    dcMean /= length;

    let peak = 1e-6;
    for (let i = 0; i < length; i += 1) {
      out[i] -= dcMean;
      const abs = Math.abs(out[i]);
      if (abs > peak) peak = abs;
    }

    const invPeak = 0.88 / peak;
    for (let i = 0; i < length; i += 1) {
      out[i] *= invPeak;
    }
    crossfadeLoopTail(out, Math.min(2048, Math.floor(rate * 0.04)));
  }

  return buffer;
}

export function createSoundscape({ createAudioContext } = {}) {
  let enabled = false;
  let disposed = false;
  let ctx = null;
  let graph = null;

  let pausedState = false;
  let currentTimeScale = 1;
  let smoothedSubmergence = 0;
  let surfaceCutoffHz = SURFACE_AIR_CUTOFF_HZ;
  let masterGainLevel = 0;
  let activityGainLevel = 1;
  let underwaterGainLevel = 0.08;
  let whaleGainLevel = 0.30;
  let rumbleGainLevel = 0.03;
  let whalePitchHz = 180;
  let oceanClock = 0;
  let songClock = 0.25;
  let blowCooldown = 0;
  let prevBlowIntensity = 0;
  let noiseOffsetCursor = 0.37;
  const triggerCounts = {
    breakthrough: 0,
    splashdown: 0,
    blow: 0,
  };

  const continuousSources = [];
  const staticNodes = [];
  const activeVoices = new Set();

  function nextBufferOffset(buffer) {
    noiseOffsetCursor = (noiseOffsetCursor + 0.6180339887) % 1;
    return buffer && buffer.duration > 0 ? noiseOffsetCursor * buffer.duration * 0.85 : 0;
  }

  function registerTransientVoice(sources, nodes, primarySource) {
    const voice = { sources, nodes, cleaned: false };
    activeVoices.add(voice);

    const cleanup = () => {
      if (voice.cleaned) return;
      voice.cleaned = true;
      activeVoices.delete(voice);
      for (let i = 0; i < voice.nodes.length; i += 1) {
        try {
          voice.nodes[i].disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
      for (let i = 0; i < voice.sources.length; i += 1) {
        try {
          voice.sources[i].disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
    };

    const anchor = primarySource || sources[sources.length - 1];
    if (anchor) {
      anchor.onended = cleanup;
    }
    return voice;
  }

  function createStereoRoute(targetBus, panValue = 0, voiceNodes = []) {
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(clamp(panValue, -1, 1), ctx.currentTime || 0);
      panner.connect(targetBus);
      voiceNodes.push(panner);
      return panner;
    }
    return targetBus;
  }

  function trackNode(node) {
    if (node) staticNodes.push(node);
    return node;
  }

  function trackLoopSource(src) {
    if (src) {
      continuousSources.push(src);
      staticNodes.push(src);
    }
    return src;
  }

  function resumeContextIfNeeded() {
    if (!ctx || typeof ctx.resume !== 'function') return;
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      try {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      } catch {
        // Ignore resume errors in restricted contexts
      }
    }
  }

  function createLoopingNoiseSource(buffer, playbackRate = 1, offset = 0) {
    const src = trackLoopSource(ctx.createBufferSource());
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = playbackRate;
    const startOffset = buffer.duration > 0 ? offset % buffer.duration : 0;
    src.start(ctx.currentTime || 0, startOffset);
    return src;
  }

  function ensureGraph() {
    if (disposed) return null;
    if (graph && ctx) return graph;

    let created = null;
    try {
      if (typeof createAudioContext === 'function') {
        created = createAudioContext();
      } else {
        const Ctor = resolveBrowserAudioContextCtor();
        created = Ctor ? new Ctor() : null;
      }
    } catch {
      created = null;
    }

    if (!created) return null;
    ctx = created;
    const now = ctx.currentTime || 0;

    const pinkBuffer = buildPinkNoiseBuffer(ctx, 2.4, 0x13572468);
    const brownBuffer = buildBrownNoiseBuffer(ctx, 2.6, 0x24681357);

    // Master chain: activityGain (pause attenuation) -> masterGain (mute/unmute) -> compressor -> destination
    const masterGain = trackNode(ctx.createGain());
    masterGain.gain.setValueAtTime(0, now);

    const activityGain = trackNode(ctx.createGain());
    activityGain.gain.setValueAtTime(pausedState ? 0 : 1, now);
    activityGain.connect(masterGain);

    if (typeof ctx.createDynamicsCompressor === 'function') {
      const compressor = trackNode(ctx.createDynamicsCompressor());
      compressor.threshold.value = -10;
      compressor.knee.value = 16;
      compressor.ratio.value = 3.5;
      compressor.attack.value = 0.006;
      compressor.release.value = 0.22;
      masterGain.connect(compressor);
      compressor.connect(ctx.destination);
    } else {
      masterGain.connect(ctx.destination);
    }

    // 1. Surface & Spray Bus -> Dynamic Medium Lowpass (~16,000 Hz air -> ~320 Hz submerged)
    const surfaceBus = trackNode(ctx.createGain());
    surfaceBus.gain.value = 1.0;

    const surfaceLowpass = trackNode(ctx.createBiquadFilter());
    surfaceLowpass.type = 'lowpass';
    surfaceLowpass.frequency.setValueAtTime(SURFACE_AIR_CUTOFF_HZ, now);
    surfaceLowpass.Q.setValueAtTime(0.75, now);

    const surfaceLevelGain = trackNode(ctx.createGain());
    surfaceLevelGain.gain.setValueAtTime(0.95, now);

    surfaceBus.connect(surfaceLowpass);
    surfaceLowpass.connect(surfaceLevelGain);
    surfaceLevelGain.connect(activityGain);

    // 2. Underwater Hydrophone Bus
    const underwaterBus = trackNode(ctx.createGain());
    underwaterBus.gain.value = 1.0;

    const underwaterGain = trackNode(ctx.createGain());
    underwaterGain.gain.setValueAtTime(underwaterGainLevel, now);
    underwaterBus.connect(underwaterGain);
    underwaterGain.connect(activityGain);

    // 3. Whale Song & Ascent Rumble Bus
    const whaleBus = trackNode(ctx.createGain());
    whaleBus.gain.value = 1.0;

    const whaleMediumFilter = trackNode(ctx.createBiquadFilter());
    whaleMediumFilter.type = 'lowpass';
    whaleMediumFilter.frequency.setValueAtTime(980, now);
    whaleMediumFilter.Q.setValueAtTime(0.9, now);

    const whalePresenceGain = trackNode(ctx.createGain());
    whalePresenceGain.gain.setValueAtTime(whaleGainLevel, now);

    whaleBus.connect(whaleMediumFilter);
    whaleMediumFilter.connect(whalePresenceGain);
    whalePresenceGain.connect(activityGain);

    // 4. Sub-Bass Physical Impact Bus (transmits through water & air)
    const subImpactBus = trackNode(ctx.createGain());
    subImpactBus.gain.setValueAtTime(0.95, now);
    subImpactBus.connect(activityGain);

    // --- Continuous Layer A: Ocean Surf Swell + Gentle Hull/Waterline Lap ---
    const swellSource = createLoopingNoiseSource(pinkBuffer, 0.92, 0.0);
    const swellFilter = trackNode(ctx.createBiquadFilter());
    swellFilter.type = 'lowpass';
    swellFilter.frequency.setValueAtTime(440, now);
    swellFilter.Q.setValueAtTime(0.85, now);
    const swellGain = trackNode(ctx.createGain());
    swellGain.gain.setValueAtTime(0.18, now);
    swellSource.connect(swellFilter);
    swellFilter.connect(swellGain);
    swellGain.connect(surfaceBus);

    const lapSource = createLoopingNoiseSource(pinkBuffer, 1.08, 1.15);
    const lapFilter = trackNode(ctx.createBiquadFilter());
    lapFilter.type = 'bandpass';
    lapFilter.frequency.setValueAtTime(1020, now);
    lapFilter.Q.setValueAtTime(2.1, now);
    const lapGain = trackNode(ctx.createGain());
    lapGain.gain.setValueAtTime(0.055, now);
    lapSource.connect(lapFilter);
    lapFilter.connect(lapGain);
    lapGain.connect(surfaceBus);

    // --- Continuous Layer B: Deep Underwater Hydrophone & Bubble Shimmer ---
    const hydroSource = createLoopingNoiseSource(brownBuffer, 0.85, 0.4);
    const hydroFilter = trackNode(ctx.createBiquadFilter());
    hydroFilter.type = 'lowpass';
    hydroFilter.frequency.setValueAtTime(175, now);
    hydroFilter.Q.setValueAtTime(1.65, now);
    const hydroGain = trackNode(ctx.createGain());
    hydroGain.gain.setValueAtTime(0.38, now);
    hydroSource.connect(hydroFilter);
    hydroFilter.connect(hydroGain);
    hydroGain.connect(underwaterBus);

    const hydroDroneOsc = trackLoopSource(ctx.createOscillator());
    hydroDroneOsc.type = 'sine';
    hydroDroneOsc.frequency.setValueAtTime(54, now);
    const hydroDroneGain = trackNode(ctx.createGain());
    hydroDroneGain.gain.setValueAtTime(0.045, now);
    hydroDroneOsc.connect(hydroDroneGain);
    hydroDroneGain.connect(underwaterBus);
    hydroDroneOsc.start(now);

    const shimmerSource = createLoopingNoiseSource(pinkBuffer, 1.18, 2.1);
    const shimmerFilter = trackNode(ctx.createBiquadFilter());
    shimmerFilter.type = 'bandpass';
    shimmerFilter.frequency.setValueAtTime(1520, now);
    shimmerFilter.Q.setValueAtTime(4.2, now);
    const shimmerGain = trackNode(ctx.createGain());
    shimmerGain.gain.setValueAtTime(0.032, now);
    shimmerSource.connect(shimmerFilter);
    shimmerFilter.connect(shimmerGain);
    shimmerGain.connect(underwaterBus);

    // --- Continuous Layer C: Humpback Whale FM/Formant Song + Ascent Propulsion Rumble ---
    // FM Modulator -> Carrier (90Hz..420Hz harmonic glides) -> Dual Formant Filters -> whaleSongGain
    const whaleModOsc = trackLoopSource(ctx.createOscillator());
    whaleModOsc.type = 'sine';
    whaleModOsc.frequency.setValueAtTime(360, now);
    const whaleModIndexGain = trackNode(ctx.createGain());
    whaleModIndexGain.gain.setValueAtTime(48, now);

    const whaleCarrierOsc = trackLoopSource(ctx.createOscillator());
    whaleCarrierOsc.type = 'triangle';
    whaleCarrierOsc.frequency.setValueAtTime(180, now);
    whaleModOsc.connect(whaleModIndexGain);
    whaleModIndexGain.connect(whaleCarrierOsc.frequency);

    const whaleFormant1 = trackNode(ctx.createBiquadFilter());
    whaleFormant1.type = 'bandpass';
    whaleFormant1.frequency.setValueAtTime(360, now);
    whaleFormant1.Q.setValueAtTime(4.8, now);

    const whaleFormant2 = trackNode(ctx.createBiquadFilter());
    whaleFormant2.type = 'bandpass';
    whaleFormant2.frequency.setValueAtTime(920, now);
    whaleFormant2.Q.setValueAtTime(5.5, now);

    const whaleFundamentalFilter = trackNode(ctx.createBiquadFilter());
    whaleFundamentalFilter.type = 'lowpass';
    whaleFundamentalFilter.frequency.setValueAtTime(460, now);
    whaleFundamentalFilter.Q.setValueAtTime(1.1, now);

    const whaleSongGain = trackNode(ctx.createGain());
    whaleSongGain.gain.setValueAtTime(0.0, now);

    const formant2Mix = trackNode(ctx.createGain());
    formant2Mix.gain.setValueAtTime(0.45, now);
    const fundamentalMix = trackNode(ctx.createGain());
    fundamentalMix.gain.setValueAtTime(0.55, now);

    whaleCarrierOsc.connect(whaleFormant1);
    whaleCarrierOsc.connect(whaleFormant2);
    whaleCarrierOsc.connect(whaleFundamentalFilter);

    whaleFormant1.connect(whaleSongGain);
    whaleFormant2.connect(formant2Mix);
    formant2Mix.connect(whaleSongGain);
    whaleFundamentalFilter.connect(fundamentalMix);
    fundamentalMix.connect(whaleSongGain);
    whaleSongGain.connect(whaleBus);

    whaleModOsc.start(now);
    whaleCarrierOsc.start(now);

    // Ascent & Recovery Sub-Bass Propulsion Rumble
    const rumbleOsc = trackLoopSource(ctx.createOscillator());
    rumbleOsc.type = 'triangle';
    rumbleOsc.frequency.setValueAtTime(48, now);

    const rumbleNoise = createLoopingNoiseSource(brownBuffer, 0.65, 1.8);
    const rumbleFilter = trackNode(ctx.createBiquadFilter());
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.setValueAtTime(95, now);
    rumbleFilter.Q.setValueAtTime(1.5, now);

    const rumbleGain = trackNode(ctx.createGain());
    rumbleGain.gain.setValueAtTime(0.04, now);

    const rumbleOscMix = trackNode(ctx.createGain());
    rumbleOscMix.gain.setValueAtTime(0.55, now);

    rumbleOsc.connect(rumbleOscMix);
    rumbleOscMix.connect(rumbleFilter);
    rumbleNoise.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(whaleBus);
    rumbleOsc.start(now);

    graph = {
      pinkBuffer,
      brownBuffer,
      masterGain,
      activityGain,
      surfaceBus,
      surfaceLowpass,
      surfaceLevelGain,
      underwaterBus,
      underwaterGain,
      whaleBus,
      whaleMediumFilter,
      whalePresenceGain,
      subImpactBus,
      swellSource,
      swellFilter,
      swellGain,
      lapSource,
      lapFilter,
      lapGain,
      hydroSource,
      hydroFilter,
      hydroGain,
      hydroDroneOsc,
      hydroDroneGain,
      shimmerSource,
      shimmerFilter,
      shimmerGain,
      whaleModOsc,
      whaleModIndexGain,
      whaleCarrierOsc,
      whaleFormant1,
      whaleFormant2,
      whaleSongGain,
      rumbleOsc,
      rumbleNoise,
      rumbleFilter,
      rumbleGain,
    };

    return graph;
  }

  function applyMasterGainRamp(isOn) {
    if (!graph || !ctx) return;
    const now = ctx.currentTime || 0;
    const target = isOn ? MASTER_TARGET_GAIN : 0.0;
    masterGainLevel = target;
    // Smooth exponential approach with zero-click time constant (~45ms)
    setParamSmooth(graph.masterGain.gain, target, now, 0.045);
  }

  function getState() {
    return {
      enabled,
      initialized: ctx !== null,
      disposed,
      paused: pausedState,
      timeScale: currentTimeScale,
      submergence: smoothedSubmergence,
      surfaceCutoffHz,
      masterGain: masterGainLevel,
      activityGain: activityGainLevel,
      underwaterGain: underwaterGainLevel,
      whaleGain: whaleGainLevel,
      rumbleGain: rumbleGainLevel,
      whalePitchHz,
      blowCooldown,
      triggerCounts: { ...triggerCounts },
    };
  }

  function setEnabled(flag) {
    if (disposed) return false;
    enabled = Boolean(flag);
    if (enabled) {
      ensureGraph();
      resumeContextIfNeeded();
      applyMasterGainRamp(true);
    } else if (graph) {
      applyMasterGainRamp(false);
    }
    return enabled;
  }

  function toggle() {
    return setEnabled(!enabled);
  }

  function isEnabled() {
    return enabled;
  }

  function update({
    dt = 1 / 60,
    time = 0,
    breachState = null,
    isSubmerged = false,
    waterlineFraction = undefined,
    timeScale = 1,
    paused = false,
  } = {}) {
    if (disposed) return getState();

    const safeDt = clamp(Number.isFinite(dt) ? dt : 1 / 60, 0, 0.25);
    currentTimeScale = clamp(Number.isFinite(timeScale) ? timeScale : 1, 0.1, 2.5);
    pausedState = Boolean(paused);

    // Smoothly attenuate output when paused and restore when unpaused
    const pauseAlpha = safeDt > 0 ? 1 - Math.exp(-safeDt * 7.5) : 1;
    const targetActivity = pausedState ? 0.0 : 1.0;
    activityGainLevel = lerp(activityGainLevel, targetActivity, pauseAlpha);

    // Resolve target medium submergence [0 = air, 0.5 = split waterline, 1 = submerged]
    const submergedFlag = Boolean(isSubmerged);
    let targetSubmergence = submergedFlag ? 1 : 0;
    if (
      waterlineFraction !== undefined &&
      waterlineFraction !== null &&
      Number.isFinite(waterlineFraction)
    ) {
      targetSubmergence = clamp(waterlineFraction, 0, 1);
      if (targetSubmergence === 0 && submergedFlag) {
        targetSubmergence = 1;
      }
    }

    const mediumAlpha = safeDt > 0 ? 1 - Math.exp(-safeDt * 8.5) : 1;
    smoothedSubmergence = lerp(smoothedSubmergence, targetSubmergence, mediumAlpha);

    // Exponential low-pass sweep (~16,000 Hz in air -> ~320 Hz submerged)
    surfaceCutoffHz =
      SURFACE_AIR_CUTOFF_HZ *
      Math.pow(SURFACE_SUBMERGED_CUTOFF_HZ / SURFACE_AIR_CUTOFF_HZ, smoothedSubmergence);

    // Boost underwater hydrophone & whale vocal presence when submerged
    underwaterGainLevel = lerp(0.08, 0.86, smoothedSubmergence);
    whaleGainLevel = lerp(0.30, 1.0, smoothedSubmergence);

    // Advance modulation clocks scaled by timeScale when not paused
    const simStep = pausedState ? 0 : safeDt * currentTimeScale;
    oceanClock += simStep;
    songClock += simStep;

    const phaseName = breachState?.phaseName ?? 'ascent';
    const tailAmp = clamp(breachState?.tailBeatAmplitude ?? 0.5, 0, 1.2);
    const tailPhase = Number.isFinite(breachState?.tailBeatPhase)
      ? breachState.tailBeatPhase
      : time * 4.5;

    // Ascent & recovery propulsion rumble
    const underwaterPropulsionWeight =
      phaseName === 'ascent'
        ? 1.0
        : phaseName === 'recovery'
          ? 0.88
          : phaseName === 'breakthrough' || phaseName === 'splashdown'
            ? 0.45
            : 0.08;
    const flukeStroke = 0.58 + 0.42 * Math.abs(Math.sin(tailPhase));
    const targetRumble =
      0.015 + 0.24 * underwaterPropulsionWeight * (0.35 + 0.65 * tailAmp) * flukeStroke;
    rumbleGainLevel = lerp(rumbleGainLevel, targetRumble, mediumAlpha);

    // Expressive humpback FM/formant vocalization contour (90..420 Hz at 1x)
    const song = evaluateWhaleSongPhrase(songClock);
    const pitchScale = Math.pow(currentTimeScale, 0.55);
    whalePitchHz = clamp(song.pitchHz * (currentTimeScale === 1 ? 1 : pitchScale), 40, 600);

    if (graph && ctx) {
      const now = ctx.currentTime || 0;
      const tau = 0.028;
      const rateScale = Math.pow(currentTimeScale, 0.65);

      // Pause attenuation & playback rate scaling for slow-motion thunder
      setParamSmooth(graph.activityGain.gain, activityGainLevel, now, 0.035);
      setParamSmooth(graph.swellSource.playbackRate, 0.92 * rateScale, now, 0.04);
      setParamSmooth(graph.lapSource.playbackRate, 1.08 * rateScale, now, 0.04);
      setParamSmooth(graph.hydroSource.playbackRate, 0.85 * rateScale, now, 0.04);
      setParamSmooth(graph.shimmerSource.playbackRate, 1.18 * rateScale, now, 0.04);
      setParamSmooth(graph.rumbleNoise.playbackRate, 0.65 * rateScale, now, 0.04);

      // Surface medium filter & underwater/whale bus presence
      setParamSmooth(graph.surfaceLowpass.frequency, surfaceCutoffHz, now, tau);
      setParamSmooth(graph.surfaceLowpass.Q, 0.75 + 0.65 * smoothedSubmergence, now, tau);
      setParamSmooth(graph.underwaterGain.gain, underwaterGainLevel, now, tau);
      setParamSmooth(graph.whalePresenceGain.gain, whaleGainLevel, now, tau);
      setParamSmooth(
        graph.whaleMediumFilter.frequency,
        lerp(920, 3500, smoothedSubmergence) * pitchScale,
        now,
        tau,
      );

      // Ocean wave swell & waterline lap modulation
      const waveRhythm =
        0.5 +
        0.35 * Math.sin(oceanClock * 0.85) +
        0.15 * Math.sin(oceanClock * 0.33 + 1.2);
      const chopRhythm =
        0.5 +
        0.3 * Math.sin(oceanClock * 2.2 + 0.4) +
        0.2 * Math.cos(oceanClock * 3.5);
      const splitProximity = 1 - Math.min(1, Math.abs(smoothedSubmergence - 0.5) * 2.4);

      setParamSmooth(
        graph.swellFilter.frequency,
        lerp(290, 760, waveRhythm) * pitchScale,
        now,
        0.05,
      );
      setParamSmooth(graph.swellGain.gain, lerp(0.12, 0.25, waveRhythm), now, 0.05);
      setParamSmooth(
        graph.lapFilter.frequency,
        lerp(860, 1280, chopRhythm) * pitchScale,
        now,
        0.04,
      );
      setParamSmooth(
        graph.lapGain.gain,
        0.038 + 0.032 * chopRhythm + 0.048 * splitProximity,
        now,
        0.04,
      );

      // Underwater hydrophone & bubble shimmer
      const recoveryBubbleBoost = phaseName === 'recovery' ? 0.055 : phaseName === 'splashdown' ? 0.04 : 0;
      const shimmerSweep = 0.5 + 0.5 * Math.sin(oceanClock * 1.45 + 0.8);
      setParamSmooth(
        graph.shimmerFilter.frequency,
        lerp(1180, 2040, shimmerSweep) * pitchScale,
        now,
        0.05,
      );
      setParamSmooth(graph.shimmerGain.gain, 0.028 + recoveryBubbleBoost, now, 0.06);
      setParamSmooth(graph.hydroDroneOsc.frequency, 54 * pitchScale, now, 0.05);

      // Whale FM/formant song
      const vocalPhaseWeight =
        phaseName === 'apex' ? 0.28 : phaseName === 'ascent' || phaseName === 'recovery' ? 1.0 : 0.6;
      const targetSongGain = 0.14 * song.envelope * vocalPhaseWeight;
      setParamSmooth(graph.whaleCarrierOsc.frequency, whalePitchHz, now, 0.03);
      setParamSmooth(
        graph.whaleModOsc.frequency,
        whalePitchHz * song.harmonicRatio,
        now,
        0.03,
      );
      setParamSmooth(
        graph.whaleModIndexGain.gain,
        whalePitchHz * (0.18 + 0.16 * song.envelope),
        now,
        0.03,
      );
      setParamSmooth(
        graph.whaleFormant1.frequency,
        clamp(whalePitchHz * 1.85, 160, 780),
        now,
        0.03,
      );
      setParamSmooth(
        graph.whaleFormant2.frequency,
        clamp(whalePitchHz * 4.1, 480, 1650),
        now,
        0.03,
      );
      setParamSmooth(graph.whaleSongGain.gain, targetSongGain, now, 0.04);

      // Ascent / recovery propulsion rumble
      const rumbleFreq = (42 + 22 * tailAmp * flukeStroke) * pitchScale;
      setParamSmooth(graph.rumbleOsc.frequency, rumbleFreq, now, 0.04);
      setParamSmooth(graph.rumbleFilter.frequency, (78 + 48 * tailAmp) * pitchScale, now, 0.04);
      setParamSmooth(graph.rumbleGain.gain, rumbleGainLevel, now, 0.04);
    }

    // Automatic blowhole spout trigger + cooldown guard when blowIntensity crosses upward > 0.35
    if (!pausedState && safeDt > 0) {
      blowCooldown = Math.max(0, blowCooldown - safeDt);
    }
    const rawBlowIntensity = Number.isFinite(breachState?.blowIntensity)
      ? breachState.blowIntensity
      : 0;
    const crossedBlowUpward =
      prevBlowIntensity <= BLOW_AUTO_TRIGGER_THRESHOLD &&
      rawBlowIntensity > BLOW_AUTO_TRIGGER_THRESHOLD;
    prevBlowIntensity = rawBlowIntensity;

    if (crossedBlowUpward && !pausedState && blowCooldown <= 0) {
      blowCooldown = BLOW_AUTO_COOLDOWN_SECONDS;
      triggerBlow({ intensity: clamp(0.55 + 0.45 * rawBlowIntensity, 0.65, 1.2) });
    }

    return getState();
  }

  function triggerBreakthrough(options = {}) {
    if (disposed || !enabled || !ctx || !graph) return false;
    resumeContextIfNeeded();

    const rawStrength = typeof options === 'number' ? options : options?.strength ?? 1.2;
    const strength = clamp(Number.isFinite(rawStrength) ? rawStrength : 1.2, 0.35, 2.6);
    const now = ctx.currentTime || 0;
    const stretch = Math.pow(1 / clamp(currentTimeScale, 0.2, 2.2), 0.7);
    const pitchMul = currentTimeScale === 1 ? 1 : Math.pow(currentTimeScale, 0.55);
    const rateScale = Math.pow(currentTimeScale, 0.65);

    const sources = [];
    const nodes = [];

    // Layer 1: Rising water dome pressure tear (46 Hz -> 118 Hz upward heave)
    const domeDuration = 0.52 * stretch;
    const domeOsc = ctx.createOscillator();
    domeOsc.type = 'triangle';
    domeOsc.frequency.setValueAtTime(46 * pitchMul, now);
    domeOsc.frequency.exponentialRampToValueAtTime(118 * pitchMul, now + domeDuration * 0.85);

    const domeFilter = ctx.createBiquadFilter();
    domeFilter.type = 'lowpass';
    domeFilter.frequency.setValueAtTime(220 * pitchMul, now);

    const domeGain = ctx.createGain();
    const domePeak = clamp(0.26 * strength, 0.08, 0.55);
    domeGain.gain.setValueAtTime(0.0001, now);
    domeGain.gain.linearRampToValueAtTime(domePeak, now + 0.035 * stretch);
    domeGain.gain.exponentialRampToValueAtTime(0.0001, now + domeDuration);

    domeOsc.connect(domeFilter);
    domeFilter.connect(domeGain);
    domeGain.connect(graph.subImpactBus);
    domeOsc.start(now);
    domeOsc.stop(now + domeDuration + 0.02);
    sources.push(domeOsc);
    nodes.push(domeFilter, domeGain);

    // Layer 2: Foaming upward surface surge (bandpass/lowpass sweep 220 Hz -> 2600 Hz)
    const surgeDuration = 1.05 * stretch;
    const surgeSrc = ctx.createBufferSource();
    surgeSrc.buffer = graph.pinkBuffer;
    surgeSrc.loop = true;
    surgeSrc.playbackRate.setValueAtTime(0.96 * rateScale, now);

    const surgeFilter = ctx.createBiquadFilter();
    surgeFilter.type = 'bandpass';
    surgeFilter.Q.setValueAtTime(1.35, now);
    surgeFilter.frequency.setValueAtTime(220 * pitchMul, now);
    surgeFilter.frequency.exponentialRampToValueAtTime(
      2600 * pitchMul,
      now + surgeDuration * 0.42,
    );
    surgeFilter.frequency.exponentialRampToValueAtTime(
      620 * pitchMul,
      now + surgeDuration,
    );

    const surgeGain = ctx.createGain();
    const surgePeak = clamp(0.32 * strength, 0.1, 0.68);
    surgeGain.gain.setValueAtTime(0.0001, now);
    surgeGain.gain.linearRampToValueAtTime(surgePeak, now + 0.09 * stretch);
    surgeGain.gain.exponentialRampToValueAtTime(0.0001, now + surgeDuration);

    surgeSrc.connect(surgeFilter);
    surgeFilter.connect(surgeGain);
    surgeGain.connect(graph.surfaceBus);
    surgeSrc.start(now, nextBufferOffset(graph.pinkBuffer));
    surgeSrc.stop(now + surgeDuration + 0.02);
    sources.push(surgeSrc);
    nodes.push(surgeFilter, surgeGain);

    registerTransientVoice(sources, nodes, surgeSrc);
    triggerCounts.breakthrough += 1;
    return true;
  }

  function triggerSplashdown(options = {}) {
    if (disposed || !enabled || !ctx || !graph) return false;
    resumeContextIfNeeded();

    const rawStrength = typeof options === 'number' ? options : options?.strength ?? 1.75;
    const strength = clamp(Number.isFinite(rawStrength) ? rawStrength : 1.75, 0.4, 2.8);
    const now = ctx.currentTime || 0;
    const stretch = Math.pow(1 / clamp(currentTimeScale, 0.2, 2.2), 0.72);
    const pitchMul = currentTimeScale === 1 ? 1 : Math.pow(currentTimeScale, 0.55);
    const rateScale = Math.pow(currentTimeScale, 0.65);

    const sources = [];
    const nodes = [];

    // Layer 1: Deep Sub-Bass Cannon Boom (38..85 Hz pitch-drop sine + triangle punch)
    const subStartHz = clamp(78 + (strength - 1.25) * 12, 74, 85) * pitchMul;
    const subEndHz = 38 * pitchMul;
    const subDuration = 0.78 * stretch;

    const subSine = ctx.createOscillator();
    subSine.type = 'sine';
    subSine.frequency.setValueAtTime(subStartHz, now);
    subSine.frequency.exponentialRampToValueAtTime(subEndHz, now + subDuration * 0.88);

    const subSineGain = ctx.createGain();
    const subPeak = clamp(0.42 * strength, 0.2, 0.85);
    subSineGain.gain.setValueAtTime(0.0001, now);
    subSineGain.gain.linearRampToValueAtTime(subPeak, now + 0.012 * stretch);
    subSineGain.gain.exponentialRampToValueAtTime(0.0001, now + subDuration);

    subSine.connect(subSineGain);
    subSineGain.connect(graph.subImpactBus);
    subSine.start(now);
    subSine.stop(now + subDuration + 0.02);
    sources.push(subSine);
    nodes.push(subSineGain);

    const subTriDuration = 0.52 * stretch;
    const subTri = ctx.createOscillator();
    subTri.type = 'triangle';
    subTri.frequency.setValueAtTime(Math.min(85, subStartHz) * 0.98, now);
    subTri.frequency.exponentialRampToValueAtTime(40 * pitchMul, now + subTriDuration);

    const subTriFilter = ctx.createBiquadFilter();
    subTriFilter.type = 'lowpass';
    subTriFilter.frequency.setValueAtTime(145 * pitchMul, now);

    const subTriGain = ctx.createGain();
    subTriGain.gain.setValueAtTime(0.0001, now);
    subTriGain.gain.linearRampToValueAtTime(subPeak * 0.55, now + 0.01 * stretch);
    subTriGain.gain.exponentialRampToValueAtTime(0.0001, now + subTriDuration);

    subTri.connect(subTriFilter);
    subTriFilter.connect(subTriGain);
    subTriGain.connect(graph.subImpactBus);
    subTri.start(now);
    subTri.stop(now + subTriDuration + 0.02);
    sources.push(subTri);
    nodes.push(subTriFilter, subTriGain);

    // Layer 2: Wide Stereo Filtered Whitewater Crash (decorrelated Left & Right channels)
    const crashDuration = 1.75 * stretch;
    const stereoSides = [
      { pan: -0.68, rate: 0.94, startCutoff: 3400, endCutoff: 420 },
      { pan: 0.68, rate: 1.04, startCutoff: 3800, endCutoff: 480 },
    ];

    for (let i = 0; i < stereoSides.length; i += 1) {
      const side = stereoSides[i];
      const crashSrc = ctx.createBufferSource();
      crashSrc.buffer = i === 0 ? graph.pinkBuffer : graph.brownBuffer;
      crashSrc.loop = true;
      crashSrc.playbackRate.setValueAtTime(side.rate * rateScale, now);

      const crashFilter = ctx.createBiquadFilter();
      crashFilter.type = 'lowpass';
      crashFilter.Q.setValueAtTime(1.15, now);
      crashFilter.frequency.setValueAtTime(side.startCutoff * pitchMul, now);
      crashFilter.frequency.exponentialRampToValueAtTime(
        side.endCutoff * pitchMul,
        now + crashDuration,
      );

      const crashGain = ctx.createGain();
      const crashPeak = clamp(0.28 * strength, 0.12, 0.62);
      crashGain.gain.setValueAtTime(0.0001, now);
      crashGain.gain.linearRampToValueAtTime(crashPeak, now + 0.028 * stretch);
      crashGain.gain.exponentialRampToValueAtTime(0.0001, now + crashDuration);

      const stereoOut = createStereoRoute(graph.surfaceBus, side.pan, nodes);
      crashSrc.connect(crashFilter);
      crashFilter.connect(crashGain);
      crashGain.connect(stereoOut);
      crashSrc.start(now, nextBufferOffset(crashSrc.buffer));
      crashSrc.stop(now + crashDuration + 0.02);
      sources.push(crashSrc);
      nodes.push(crashFilter, crashGain);
    }

    // Layer 3: Lingering ~4s Sizzling Foam & Aerated Underwater Bubble Decay
    const foamDuration = 4.25 * stretch;
    const foamSrc = ctx.createBufferSource();
    foamSrc.buffer = graph.pinkBuffer;
    foamSrc.loop = true;
    foamSrc.playbackRate.setValueAtTime(1.06 * rateScale, now);

    const foamFilter = ctx.createBiquadFilter();
    foamFilter.type = 'bandpass';
    foamFilter.Q.setValueAtTime(0.9, now);
    foamFilter.frequency.setValueAtTime(2600 * pitchMul, now);
    foamFilter.frequency.exponentialRampToValueAtTime(1150 * pitchMul, now + foamDuration);

    const foamGain = ctx.createGain();
    const foamPeak = clamp(0.16 * strength, 0.07, 0.36);
    foamGain.gain.setValueAtTime(0.0001, now);
    foamGain.gain.linearRampToValueAtTime(foamPeak, now + 0.18 * stretch);
    foamGain.gain.exponentialRampToValueAtTime(0.0001, now + foamDuration);

    foamSrc.connect(foamFilter);
    foamFilter.connect(foamGain);
    foamGain.connect(graph.surfaceBus);
    foamSrc.start(now, nextBufferOffset(graph.pinkBuffer));
    foamSrc.stop(now + foamDuration + 0.03);
    sources.push(foamSrc);
    nodes.push(foamFilter, foamGain);

    // Companion underwater aerated bubble plume decay
    const bubbleDuration = 3.8 * stretch;
    const bubbleSrc = ctx.createBufferSource();
    bubbleSrc.buffer = graph.pinkBuffer;
    bubbleSrc.loop = true;
    bubbleSrc.playbackRate.setValueAtTime(0.88 * rateScale, now);

    const bubbleFilter = ctx.createBiquadFilter();
    bubbleFilter.type = 'bandpass';
    bubbleFilter.Q.setValueAtTime(3.1, now);
    bubbleFilter.frequency.setValueAtTime(1420 * pitchMul, now);
    bubbleFilter.frequency.exponentialRampToValueAtTime(680 * pitchMul, now + bubbleDuration);

    const bubbleGain = ctx.createGain();
    bubbleGain.gain.setValueAtTime(0.0001, now);
    bubbleGain.gain.linearRampToValueAtTime(foamPeak * 0.85, now + 0.14 * stretch);
    bubbleGain.gain.exponentialRampToValueAtTime(0.0001, now + bubbleDuration);

    bubbleSrc.connect(bubbleFilter);
    bubbleFilter.connect(bubbleGain);
    bubbleGain.connect(graph.underwaterBus);
    bubbleSrc.start(now, nextBufferOffset(graph.pinkBuffer));
    bubbleSrc.stop(now + bubbleDuration + 0.02);
    sources.push(bubbleSrc);
    nodes.push(bubbleFilter, bubbleGain);

    registerTransientVoice(sources, nodes, foamSrc);
    triggerCounts.splashdown += 1;
    return true;
  }

  function triggerBlow(options = {}) {
    if (disposed || !enabled || !ctx || !graph) return false;
    resumeContextIfNeeded();

    const rawIntensity =
      typeof options === 'number'
        ? options
        : options?.intensity ?? options?.blowIntensity ?? 1.0;
    const intensity = clamp(Number.isFinite(rawIntensity) ? rawIntensity : 1.0, 0.25, 1.6);
    const now = ctx.currentTime || 0;
    const stretch = Math.pow(1 / clamp(currentTimeScale, 0.2, 2.2), 0.65);
    const pitchMul = currentTimeScale === 1 ? 1 : Math.pow(currentTimeScale, 0.5);
    const rateScale = Math.pow(currentTimeScale, 0.65);

    const sources = [];
    const nodes = [];

    // Layer 1: Crisp initial "Pff" blowhole muscular valve plosive
    const plosiveDuration = 0.11 * stretch;
    const plosiveSrc = ctx.createBufferSource();
    plosiveSrc.buffer = graph.pinkBuffer;
    plosiveSrc.loop = true;
    plosiveSrc.playbackRate.setValueAtTime(1.15 * rateScale, now);

    const plosiveFilter = ctx.createBiquadFilter();
    plosiveFilter.type = 'bandpass';
    plosiveFilter.Q.setValueAtTime(1.9, now);
    plosiveFilter.frequency.setValueAtTime(1450 * pitchMul, now);
    plosiveFilter.frequency.exponentialRampToValueAtTime(820 * pitchMul, now + plosiveDuration);

    const plosiveGain = ctx.createGain();
    const plosivePeak = clamp(0.28 * intensity, 0.08, 0.48);
    plosiveGain.gain.setValueAtTime(0.0001, now);
    plosiveGain.gain.linearRampToValueAtTime(plosivePeak, now + 0.012 * stretch);
    plosiveGain.gain.exponentialRampToValueAtTime(0.0001, now + plosiveDuration);

    plosiveSrc.connect(plosiveFilter);
    plosiveFilter.connect(plosiveGain);
    plosiveGain.connect(graph.surfaceBus);
    plosiveSrc.start(now, nextBufferOffset(graph.pinkBuffer));
    plosiveSrc.stop(now + plosiveDuration + 0.02);
    sources.push(plosiveSrc);
    nodes.push(plosiveFilter, plosiveGain);

    // Layer 2: Resonant hollow "Whoooosh" dual-cavity tracheal exhalation
    const whooshDuration = 0.92 * stretch;
    const whooshSrc = ctx.createBufferSource();
    whooshSrc.buffer = graph.pinkBuffer;
    whooshSrc.loop = true;
    whooshSrc.playbackRate.setValueAtTime(0.95 * rateScale, now);

    const cavityLow = ctx.createBiquadFilter();
    cavityLow.type = 'bandpass';
    cavityLow.Q.setValueAtTime(4.2, now);
    cavityLow.frequency.setValueAtTime(320 * pitchMul, now);
    cavityLow.frequency.linearRampToValueAtTime(470 * pitchMul, now + whooshDuration * 0.28);
    cavityLow.frequency.exponentialRampToValueAtTime(285 * pitchMul, now + whooshDuration);

    const cavityHigh = ctx.createBiquadFilter();
    cavityHigh.type = 'bandpass';
    cavityHigh.Q.setValueAtTime(2.4, now);
    cavityHigh.frequency.setValueAtTime(880 * pitchMul, now);
    cavityHigh.frequency.linearRampToValueAtTime(1220 * pitchMul, now + whooshDuration * 0.25);
    cavityHigh.frequency.exponentialRampToValueAtTime(690 * pitchMul, now + whooshDuration);

    const whooshGain = ctx.createGain();
    const whooshPeak = clamp(0.34 * intensity, 0.1, 0.56);
    whooshGain.gain.setValueAtTime(0.0001, now);
    whooshGain.gain.linearRampToValueAtTime(whooshPeak, now + 0.075 * stretch);
    whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + whooshDuration);

    const highMix = ctx.createGain();
    highMix.gain.setValueAtTime(0.62, now);

    whooshSrc.connect(cavityLow);
    whooshSrc.connect(cavityHigh);
    cavityLow.connect(whooshGain);
    cavityHigh.connect(highMix);
    highMix.connect(whooshGain);
    whooshGain.connect(graph.surfaceBus);

    whooshSrc.start(now, nextBufferOffset(graph.pinkBuffer));
    whooshSrc.stop(now + whooshDuration + 0.02);
    sources.push(whooshSrc);
    nodes.push(cavityLow, cavityHigh, highMix, whooshGain);

    registerTransientVoice(sources, nodes, whooshSrc);
    triggerCounts.blow += 1;
    return true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    enabled = false;
    masterGainLevel = 0;

    for (const voice of activeVoices) {
      voice.cleaned = true;
      for (let i = 0; i < voice.sources.length; i += 1) {
        try {
          voice.sources[i].stop();
        } catch {
          // Ignore already stopped
        }
        try {
          voice.sources[i].disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
      for (let i = 0; i < voice.nodes.length; i += 1) {
        try {
          voice.nodes[i].disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
    }
    activeVoices.clear();

    for (let i = 0; i < continuousSources.length; i += 1) {
      const src = continuousSources[i];
      try {
        src.stop();
      } catch {
        // Ignore if already stopped
      }
    }
    continuousSources.length = 0;

    for (let i = 0; i < staticNodes.length; i += 1) {
      const node = staticNodes[i];
      try {
        node.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }
    staticNodes.length = 0;

    if (ctx && typeof ctx.close === 'function') {
      try {
        const res = ctx.close();
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      } catch {
        // Ignore close errors on teardown
      }
    }
    graph = null;
    ctx = null;
  }

  return {
    isEnabled,
    setEnabled,
    toggle,
    update,
    triggerBreakthrough,
    triggerSplashdown,
    triggerBlow,
    getState,
    dispose,
  };
}
