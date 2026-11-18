import { describe, it, expect, afterEach } from 'vitest';
import {
  createSoundscape,
  SURFACE_AIR_CUTOFF_HZ,
  SURFACE_SUBMERGED_CUTOFF_HZ,
} from '../src/audio/soundscape.js';

function createMockAudioParam(initialValue = 0) {
  const events = [];
  const param = {
    value: initialValue,
    defaultValue: initialValue,
    events,
    setValueAtTime(value, time) {
      this.value = value;
      events.push({ type: 'setValueAtTime', value, time });
      return this;
    },
    linearRampToValueAtTime(value, time) {
      this.value = value;
      events.push({ type: 'linearRampToValueAtTime', value, time });
      return this;
    },
    exponentialRampToValueAtTime(value, time) {
      this.value = value;
      events.push({ type: 'exponentialRampToValueAtTime', value, time });
      return this;
    },
    setTargetAtTime(target, startTime, timeConstant) {
      this.value = target;
      events.push({ type: 'setTargetAtTime', value: target, startTime, timeConstant });
      return this;
    },
    cancelScheduledValues(startTime) {
      events.push({ type: 'cancelScheduledValues', startTime });
      return this;
    },
  };
  return param;
}

function createMockAudioContext({ initialState = 'suspended', sampleRate = 48000 } = {}) {
  let now = 0;
  const createdNodes = [];
  const gains = [];
  const filters = [];
  const oscillators = [];
  const bufferSources = [];
  const panners = [];
  const compressors = [];
  const buffers = [];

  function makeBaseNode(kind, extra = {}) {
    const connections = [];
    const node = {
      kind,
      connections,
      disconnected: false,
      disconnectCount: 0,
      connect(target) {
        connections.push(target);
        return target;
      },
      disconnect() {
        this.disconnected = true;
        this.disconnectCount += 1;
        connections.length = 0;
      },
      ...extra,
    };
    createdNodes.push(node);
    return node;
  }

  const destination = makeBaseNode('DestinationNode');

  const ctx = {
    sampleRate,
    state: initialState,
    destination,
    resumeCalls: 0,
    closeCalls: 0,
    createdNodes,
    gains,
    filters,
    oscillators,
    bufferSources,
    panners,
    compressors,
    buffers,
    get currentTime() {
      return now;
    },
    advanceTime(dt) {
      now += Math.max(0, dt);
      // Fire onended for finite one-shot sources whose stopTime has passed
      for (const src of [...oscillators, ...bufferSources]) {
        if (
          src.started &&
          src.stopTime !== null &&
          now >= src.stopTime &&
          !src.endedFired
        ) {
          src.endedFired = true;
          if (typeof src.onended === 'function') {
            src.onended();
          }
        }
      }
      return now;
    },
    resume() {
      this.resumeCalls += 1;
      if (this.state === 'suspended') {
        this.state = 'running';
      }
      return Promise.resolve();
    },
    close() {
      this.closeCalls += 1;
      this.state = 'closed';
      return Promise.resolve();
    },
    createGain() {
      const node = makeBaseNode('GainNode', {
        gain: createMockAudioParam(1),
      });
      gains.push(node);
      return node;
    },
    createBiquadFilter() {
      const node = makeBaseNode('BiquadFilterNode', {
        type: 'lowpass',
        frequency: createMockAudioParam(350),
        Q: createMockAudioParam(1),
        gain: createMockAudioParam(0),
        detune: createMockAudioParam(0),
      });
      filters.push(node);
      return node;
    },
    createOscillator() {
      const node = makeBaseNode('OscillatorNode', {
        type: 'sine',
        frequency: createMockAudioParam(440),
        detune: createMockAudioParam(0),
        started: false,
        stopped: false,
        startTime: null,
        stopTime: null,
        endedFired: false,
        onended: null,
        start(when = now) {
          this.started = true;
          this.startTime = when;
        },
        stop(when = now) {
          this.stopped = true;
          this.stopTime = when;
        },
      });
      oscillators.push(node);
      return node;
    },
    createBuffer(channels, length, rate = sampleRate) {
      const channelData = Array.from({ length: channels }, () => new Float32Array(length));
      const buf = {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        duration: length / rate,
        getChannelData(ch) {
          return channelData[ch];
        },
      };
      buffers.push(buf);
      return buf;
    },
    createBufferSource() {
      const node = makeBaseNode('AudioBufferSourceNode', {
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        playbackRate: createMockAudioParam(1),
        detune: createMockAudioParam(0),
        started: false,
        stopped: false,
        startTime: null,
        stopTime: null,
        endedFired: false,
        onended: null,
        start(when = now) {
          this.started = true;
          this.startTime = when;
        },
        stop(when = now) {
          this.stopped = true;
          this.stopTime = when;
        },
      });
      bufferSources.push(node);
      return node;
    },
    createStereoPanner() {
      const node = makeBaseNode('StereoPannerNode', {
        pan: createMockAudioParam(0),
      });
      panners.push(node);
      return node;
    },
    createDynamicsCompressor() {
      const node = makeBaseNode('DynamicsCompressorNode', {
        threshold: createMockAudioParam(-12),
        knee: createMockAudioParam(18),
        ratio: createMockAudioParam(4),
        attack: createMockAudioParam(0.005),
        release: createMockAudioParam(0.18),
      });
      compressors.push(node);
      return node;
    },
  };

  return ctx;
}

afterEach(() => {
  delete globalThis.window;
  delete globalThis.AudioContext;
  delete globalThis.webkitAudioContext;
});

describe('soundscape', () => {
  it('safely no-ops through full lifecycle in headless Node where Web Audio is absent', () => {
    const soundscape = createSoundscape();

    // Must start muted to respect browser autoplay policies
    expect(soundscape.isEnabled()).toBe(false);
    expect(soundscape.getState().enabled).toBe(false);
    expect(soundscape.getState().initialized).toBe(false);

    // Safe no-ops while muted and without AudioContext
    expect(() => {
      soundscape.update({
        dt: 1 / 60,
        time: 0.5,
        breachState: { phaseName: 'ascent', blowIntensity: 0 },
        isSubmerged: false,
        waterlineFraction: 0,
        timeScale: 1,
        paused: false,
      });
      soundscape.triggerBreakthrough({ strength: 1.2 });
      soundscape.triggerSplashdown({ strength: 1.75 });
      soundscape.triggerBlow({ intensity: 1.0 });
    }).not.toThrow();

    // Toggling in headless mode flips logical enabled flag cleanly without throwing
    expect(soundscape.toggle()).toBe(true);
    expect(soundscape.isEnabled()).toBe(true);
    expect(soundscape.getState().initialized).toBe(false);

    expect(() => {
      soundscape.update({
        dt: 1 / 60,
        time: 1.0,
        breachState: { phaseName: 'breakthrough', blowIntensity: 0.6 },
        isSubmerged: true,
        waterlineFraction: 1,
        timeScale: 0.25,
        paused: true,
      });
      soundscape.triggerBreakthrough();
      soundscape.triggerSplashdown();
      soundscape.triggerBlow();
    }).not.toThrow();

    expect(soundscape.toggle()).toBe(false);
    expect(soundscape.isEnabled()).toBe(false);

    expect(soundscape.setEnabled(true)).toBe(true);
    expect(() => soundscape.dispose()).not.toThrow();
    expect(soundscape.isEnabled()).toBe(false);
    expect(soundscape.getState().disposed).toBe(true);

    // Repeated calls after dispose remain safe no-ops
    expect(soundscape.toggle()).toBe(false);
    expect(() => soundscape.dispose()).not.toThrow();
  });

  it('lazily initializes AudioContext on user enable, resumes suspended context, builds continuous layers, and ramps master gain smoothly on mute/unmute', () => {
    let factoryCalls = 0;
    let mockCtx = null;
    const soundscape = createSoundscape({
      createAudioContext: () => {
        factoryCalls += 1;
        mockCtx = createMockAudioContext({ initialState: 'suspended' });
        return mockCtx;
      },
    });

    // Not created until explicitly enabled
    expect(soundscape.isEnabled()).toBe(false);
    expect(factoryCalls).toBe(0);
    soundscape.update({ dt: 1 / 60, time: 0.2 });
    expect(soundscape.triggerSplashdown()).toBe(false);
    expect(factoryCalls).toBe(0);

    // Enable via toggle() -> initializes graph once, resumes context, ramps master gain up smoothly
    expect(soundscape.toggle()).toBe(true);
    expect(soundscape.isEnabled()).toBe(true);
    expect(factoryCalls).toBe(1);
    expect(mockCtx.resumeCalls).toBe(1);
    expect(mockCtx.state).toBe('running');

    // Procedural pink/brown noise buffers synthesized with finite non-zero samples
    expect(mockCtx.buffers.length).toBeGreaterThanOrEqual(2);
    for (const buf of mockCtx.buffers) {
      const samples = buf.getChannelData(0);
      let energy = 0;
      let allFinite = true;
      for (let i = 0; i < samples.length; i += 1) {
        if (!Number.isFinite(samples[i])) {
          allFinite = false;
          break;
        }
        energy += Math.abs(samples[i]);
      }
      expect(allFinite).toBe(true);
      expect(energy).toBeGreaterThan(10);
    }

    // Continuous looping ambient sources (surf swell, waterline lap, hydrophone, bubble shimmer)
    const loopingSources = mockCtx.bufferSources.filter((s) => s.loop && s.started);
    expect(loopingSources.length).toBeGreaterThanOrEqual(3);

    // Continuous cetacean oscillators (whale song FM carrier/modulator + propulsion rumble)
    const runningOscs = mockCtx.oscillators.filter((o) => o.started);
    expect(runningOscs.length).toBeGreaterThanOrEqual(3);

    // Master gain must ramp smoothly without clicks above 0
    const stateOn = soundscape.getState();
    expect(stateOn.initialized).toBe(true);
    expect(stateOn.masterGain).toBeGreaterThan(0.5);

    // Mute via toggle() -> smoothly ramps master gain down to ~0 without re-creating AudioContext
    mockCtx.advanceTime(0.25);
    expect(soundscape.toggle()).toBe(false);
    expect(soundscape.isEnabled()).toBe(false);
    expect(factoryCalls).toBe(1);
    expect(soundscape.getState().masterGain).toBeLessThanOrEqual(0.001);

    // Re-enabling reuses existing AudioContext and resumes if suspended again
    mockCtx.state = 'suspended';
    mockCtx.advanceTime(0.25);
    expect(soundscape.setEnabled(true)).toBe(true);
    expect(factoryCalls).toBe(1);
    expect(mockCtx.resumeCalls).toBe(2);
    expect(soundscape.getState().masterGain).toBeGreaterThan(0.5);

    soundscape.dispose();

    // Also verify browser window.webkitAudioContext fallback when createAudioContext is omitted
    let webkitConstructed = 0;
    globalThis.window = {
      webkitAudioContext: function MockWebkitAudioContext() {
        webkitConstructed += 1;
        return createMockAudioContext({ initialState: 'running' });
      },
    };
    const browserSoundscape = createSoundscape();
    expect(webkitConstructed).toBe(0);
    browserSoundscape.setEnabled(true);
    expect(webkitConstructed).toBe(1);
    expect(browserSoundscape.getState().initialized).toBe(true);
    browserSoundscape.dispose();
  });

  it('sweeps surface low-pass cutoff smoothly from ~16kHz in air through split waterline to ~320Hz underwater while boosting hydrophone & whale presence and singing 90..420Hz glides', () => {
    const mockCtx = createMockAudioContext({ initialState: 'running' });
    const soundscape = createSoundscape({ createAudioContext: () => mockCtx });
    soundscape.setEnabled(true);

    // 1. Above water (air): cutoff near ~16,000 Hz
    let airState;
    for (let i = 0; i < 30; i += 1) {
      mockCtx.advanceTime(1 / 60);
      airState = soundscape.update({
        dt: 1 / 60,
        time: i / 60,
        breachState: {
          phaseName: 'apex',
          progress: 0.5,
          tailBeatAmplitude: 0.25,
          tailBeatPhase: 1.2,
        },
        isSubmerged: false,
        waterlineFraction: 0,
        timeScale: 1,
        paused: false,
      });
    }
    expect(airState.surfaceCutoffHz).toBeGreaterThan(14500);
    expect(airState.surfaceCutoffHz).toBeLessThanOrEqual(SURFACE_AIR_CUTOFF_HZ);

    // Find the surface lowpass BiquadFilterNode on the graph
    const surfaceFilter = mockCtx.filters.find(
      (f) => f.type === 'lowpass' && f.frequency.value > 14000,
    );
    expect(surfaceFilter).toBeDefined();

    // 2. Split waterline (waterlineFraction = 0.5): intermediate lowpass cutoff
    let splitState;
    for (let i = 0; i < 45; i += 1) {
      mockCtx.advanceTime(1 / 60);
      splitState = soundscape.update({
        dt: 1 / 60,
        time: 0.6 + i / 60,
        breachState: {
          phaseName: 'breakthrough',
          progress: 0.26,
          tailBeatAmplitude: 0.85,
          tailBeatPhase: 2.0,
        },
        isSubmerged: false,
        waterlineFraction: 0.5,
        timeScale: 1,
        paused: false,
      });
    }
    expect(splitState.submergence).toBeGreaterThan(0.45);
    expect(splitState.submergence).toBeLessThan(0.55);
    expect(splitState.surfaceCutoffHz).toBeLessThan(5000);
    expect(splitState.surfaceCutoffHz).toBeGreaterThan(1200);
    expect(surfaceFilter.frequency.value).toBeCloseTo(splitState.surfaceCutoffHz, 0);

    // 3. Fully submerged during underwater ascent: cutoff settles near ~320 Hz,
    // hydrophone & whale presence boost significantly, and whale glides stay in 90..420 Hz
    const observedWhaleHz = [];
    let submergedState;
    for (let i = 0; i < 90; i += 1) {
      mockCtx.advanceTime(1 / 60);
      submergedState = soundscape.update({
        dt: 1 / 60,
        time: 1.5 + i / 60,
        breachState: {
          phaseName: 'ascent',
          progress: 0.08 + i * 0.001,
          tailBeatAmplitude: 0.96,
          tailBeatPhase: i * 0.22,
        },
        isSubmerged: true,
        waterlineFraction: 1,
        timeScale: 1,
        paused: false,
      });
      observedWhaleHz.push(submergedState.whalePitchHz);
    }

    expect(submergedState.surfaceCutoffHz).toBeGreaterThan(290);
    expect(submergedState.surfaceCutoffHz).toBeLessThan(360);
    expect(surfaceFilter.frequency.value).toBeLessThan(360);
    expect(submergedState.underwaterGain).toBeGreaterThan(airState.underwaterGain * 3);
    expect(submergedState.whaleGain).toBeGreaterThan(airState.whaleGain * 1.8);
    expect(submergedState.rumbleGain).toBeGreaterThan(airState.rumbleGain * 2);

    const minWhaleHz = Math.min(...observedWhaleHz);
    const maxWhaleHz = Math.max(...observedWhaleHz);
    expect(minWhaleHz).toBeGreaterThanOrEqual(90);
    expect(maxWhaleHz).toBeLessThanOrEqual(420);
    expect(maxWhaleHz - minWhaleHz).toBeGreaterThan(25);

    // 4. Returning to air smoothly sweeps surface filter back up to ~16,000 Hz
    let resurfacedState;
    for (let i = 0; i < 90; i += 1) {
      mockCtx.advanceTime(1 / 60);
      resurfacedState = soundscape.update({
        dt: 1 / 60,
        time: 3.5 + i / 60,
        isSubmerged: false,
        waterlineFraction: 0,
      });
    }
    expect(resurfacedState.surfaceCutoffHz).toBeGreaterThan(15000);
    expect(surfaceFilter.frequency.value).toBeGreaterThan(15000);

    soundscape.dispose();
  });

  it('scales continuous playback rates and pitch down in 0.25x slow-motion and smoothly attenuates output when paused', () => {
    const mockCtx = createMockAudioContext({ initialState: 'running' });
    const soundscape = createSoundscape({ createAudioContext: () => mockCtx });
    soundscape.setEnabled(true);

    const loopingSources = mockCtx.bufferSources.filter((s) => s.loop);

    // Run at normal 1.0x speed
    let normalState;
    for (let i = 0; i < 20; i += 1) {
      mockCtx.advanceTime(1 / 60);
      normalState = soundscape.update({
        dt: 1 / 60,
        time: i / 60,
        breachState: { phaseName: 'ascent', tailBeatAmplitude: 0.9, tailBeatPhase: 1.0 },
        isSubmerged: true,
        waterlineFraction: 1,
        timeScale: 1.0,
        paused: false,
      });
    }
    const normalRates = loopingSources.map((s) => s.playbackRate.value);
    expect(normalState.activityGain).toBeGreaterThan(0.95);

    // Switch to 0.25x cinematic slow-motion
    let slowState;
    for (let i = 0; i < 25; i += 1) {
      mockCtx.advanceTime(1 / 60);
      slowState = soundscape.update({
        dt: 1 / 60,
        time: 0.4 + (i / 60) * 0.25,
        breachState: { phaseName: 'ascent', tailBeatAmplitude: 0.9, tailBeatPhase: 1.0 },
        isSubmerged: true,
        waterlineFraction: 1,
        timeScale: 0.25,
        paused: false,
      });
    }
    const slowRates = loopingSources.map((s) => s.playbackRate.value);
    for (let i = 0; i < slowRates.length; i += 1) {
      expect(slowRates[i]).toBeLessThan(normalRates[i] * 0.72);
    }
    expect(slowState.timeScale).toBeCloseTo(0.25, 3);
    expect(slowState.whalePitchHz).toBeLessThan(normalState.whalePitchHz * 0.75);

    // Pause simulation -> smoothly attenuates output while preserving enabled state
    let pausedState;
    for (let i = 0; i < 40; i += 1) {
      mockCtx.advanceTime(1 / 60);
      pausedState = soundscape.update({
        dt: 1 / 60,
        time: 0.5,
        breachState: { phaseName: 'ascent', tailBeatAmplitude: 0.9, tailBeatPhase: 1.0 },
        isSubmerged: true,
        waterlineFraction: 1,
        timeScale: 0.25,
        paused: true,
      });
    }
    expect(soundscape.isEnabled()).toBe(true);
    expect(pausedState.paused).toBe(true);
    expect(pausedState.activityGain).toBeLessThan(0.05);

    // Unpause -> smoothly recovers output gain
    let resumedState;
    for (let i = 0; i < 40; i += 1) {
      mockCtx.advanceTime(1 / 60);
      resumedState = soundscape.update({
        dt: 1 / 60,
        time: 0.6 + i / 60,
        isSubmerged: true,
        waterlineFraction: 1,
        timeScale: 1.0,
        paused: false,
      });
    }
    expect(resumedState.paused).toBe(false);
    expect(resumedState.activityGain).toBeGreaterThan(0.95);

    soundscape.dispose();
  });

  it('synthesizes breakthrough, multi-layered 38..85Hz + stereo + 4s-decay splashdown, and hollow blowhole exhalation with slow-mo stretching', () => {
    const mockCtx = createMockAudioContext({ initialState: 'running' });
    const soundscape = createSoundscape({ createAudioContext: () => mockCtx });
    soundscape.setEnabled(true);
    mockCtx.advanceTime(0.1);

    const baseOscCount = mockCtx.oscillators.length;
    const baseBufSrcCount = mockCtx.bufferSources.length;
    const basePannerCount = mockCtx.panners.length;

    // 1. Breakthrough: rising water dome tear + foaming upward surge
    expect(soundscape.triggerBreakthrough({ strength: 1.2 })).toBe(true);
    const btOscs = mockCtx.oscillators.slice(baseOscCount);
    const btSources = mockCtx.bufferSources.slice(baseBufSrcCount);
    expect(btOscs.length).toBeGreaterThanOrEqual(1);
    expect(btSources.length).toBeGreaterThanOrEqual(1);
    // Dome tear sweeps upward in frequency
    const domeEvents = btOscs[0].frequency.events;
    expect(domeEvents.length).toBeGreaterThanOrEqual(2);
    expect(domeEvents[domeEvents.length - 1].value).toBeGreaterThan(domeEvents[0].value);

    // 2. Splashdown: 38..85Hz pitch-drop sub-bass boom + wide stereo crash + 4s lingering foam decay
    mockCtx.advanceTime(0.2);
    const preSplashOscCount = mockCtx.oscillators.length;
    const preSplashSrcCount = mockCtx.bufferSources.length;
    expect(soundscape.triggerSplashdown({ strength: 1.75 })).toBe(true);

    const splashOscs = mockCtx.oscillators.slice(preSplashOscCount);
    const splashSources = mockCtx.bufferSources.slice(preSplashSrcCount);
    const splashPanners = mockCtx.panners.slice(basePannerCount);

    // Sub-bass cannon boom: sine/triangle pitch drop anchored inside 38..85 Hz
    expect(splashOscs.length).toBeGreaterThanOrEqual(2);
    const primarySub = splashOscs[0];
    const subFreqValues = primarySub.frequency.events
      .filter((e) => typeof e.value === 'number')
      .map((e) => e.value);
    expect(Math.max(...subFreqValues)).toBeLessThanOrEqual(85.5);
    expect(Math.max(...subFreqValues)).toBeGreaterThanOrEqual(72);
    expect(Math.min(...subFreqValues)).toBeGreaterThanOrEqual(37.5);
    expect(Math.min(...subFreqValues)).toBeLessThanOrEqual(45);
    expect(subFreqValues[subFreqValues.length - 1]).toBeLessThan(subFreqValues[0]);

    // Wide stereo whitewater crash panners (left < 0, right > 0)
    expect(splashPanners.some((p) => p.pan.value < -0.3)).toBe(true);
    expect(splashPanners.some((p) => p.pan.value > 0.3)).toBe(true);

    // Lingering >= 4.0s foam/bubble decay source
    const splashDurations = splashSources.map((s) => (s.stopTime ?? 0) - (s.startTime ?? 0));
    const maxSplashDecayAt1x = Math.max(...splashDurations);
    expect(maxSplashDecayAt1x).toBeGreaterThanOrEqual(4.0);

    // Slow-motion 0.25x splashdown stretches decay envelope and deepens sub-bass boom
    soundscape.update({ dt: 1 / 60, time: 0.4, timeScale: 0.25, paused: false });
    const preSlowSrcCount = mockCtx.bufferSources.length;
    const preSlowOscCount = mockCtx.oscillators.length;
    expect(soundscape.triggerSplashdown({ strength: 1.75 })).toBe(true);
    const slowSplashSources = mockCtx.bufferSources.slice(preSlowSrcCount);
    const slowSplashOscs = mockCtx.oscillators.slice(preSlowOscCount);
    const maxSlowDecay = Math.max(
      ...slowSplashSources.map((s) => (s.stopTime ?? 0) - (s.startTime ?? 0)),
    );
    expect(maxSlowDecay).toBeGreaterThan(maxSplashDecayAt1x * 1.8);
    expect(slowSplashOscs[0].frequency.events[0].value).toBeLessThan(subFreqValues[0]);

    // 3. Blowhole exhalation: "pff-whoooosh" noise + resonant hollow cavity filters
    soundscape.update({ dt: 1 / 60, time: 0.5, timeScale: 1.0, paused: false });
    const preBlowSrcCount = mockCtx.bufferSources.length;
    const preBlowFilterCount = mockCtx.filters.length;
    expect(soundscape.triggerBlow({ intensity: 1.0 })).toBe(true);
    expect(mockCtx.bufferSources.length - preBlowSrcCount).toBeGreaterThanOrEqual(2);
    expect(mockCtx.filters.length - preBlowFilterCount).toBeGreaterThanOrEqual(2);

    expect(soundscape.getState().triggerCounts).toEqual({
      breakthrough: 1,
      splashdown: 2,
      blow: 1,
    });

    // Advancing past transient voice duration automatically disconnects completed one-shot sources
    mockCtx.advanceTime(15.0);
    for (const src of btSources) {
      expect(src.disconnected).toBe(true);
    }

    soundscape.dispose();
  });

  it('automatically triggers blowhole burst when breachState.blowIntensity crosses upward above 0.35 with cooldown guard, and cleanly disposes all nodes', () => {
    const mockCtx = createMockAudioContext({ initialState: 'running' });
    const soundscape = createSoundscape({ createAudioContext: () => mockCtx });
    soundscape.setEnabled(true);

    // Below threshold -> no auto blow
    soundscape.update({
      dt: 0.05,
      time: 0.05,
      breachState: { phaseName: 'recovery', blowIntensity: 0.2 },
    });
    expect(soundscape.getState().triggerCounts.blow).toBe(0);

    // Upward crossing above 0.35 -> triggers exactly once and arms cooldown
    soundscape.update({
      dt: 0.05,
      time: 0.1,
      breachState: { phaseName: 'recovery', blowIntensity: 0.62 },
    });
    expect(soundscape.getState().triggerCounts.blow).toBe(1);
    expect(soundscape.getState().blowCooldown).toBeGreaterThan(0.9);

    // Staying above 0.35 does NOT re-trigger
    soundscape.update({
      dt: 0.05,
      time: 0.15,
      breachState: { phaseName: 'recovery', blowIntensity: 0.88 },
    });
    expect(soundscape.getState().triggerCounts.blow).toBe(1);

    // Dipping below 0.35 and crossing upward again WHILE cooldown is still active does NOT re-trigger
    soundscape.update({
      dt: 0.1,
      time: 0.25,
      breachState: { phaseName: 'recovery', blowIntensity: 0.1 },
    });
    soundscape.update({
      dt: 0.1,
      time: 0.35,
      breachState: { phaseName: 'recovery', blowIntensity: 0.7 },
    });
    expect(soundscape.getState().triggerCounts.blow).toBe(1);

    // Advance past cooldown (> 1.2s), drop below 0.35, then cross upward above 0.35 -> triggers second blow!
    for (let i = 0; i < 15; i += 1) {
      mockCtx.advanceTime(0.1);
      soundscape.update({
        dt: 0.1,
        time: 0.45 + i * 0.1,
        breachState: { phaseName: 'ascent', blowIntensity: 0.0 },
      });
    }
    expect(soundscape.getState().blowCooldown).toBe(0);

    soundscape.update({
      dt: 0.05,
      time: 2.0,
      breachState: { phaseName: 'recovery', blowIntensity: 0.55 },
    });
    expect(soundscape.getState().triggerCounts.blow).toBe(2);

    // Trigger an in-flight splashdown right before dispose to ensure active transient voices also stop/disconnect
    soundscape.triggerSplashdown({ strength: 1.5 });

    const allStartedOscs = mockCtx.oscillators.filter((o) => o.started);
    const allStartedSources = mockCtx.bufferSources.filter((s) => s.started);
    expect(allStartedOscs.length).toBeGreaterThan(3);
    expect(allStartedSources.length).toBeGreaterThan(5);

    soundscape.dispose();

    expect(soundscape.isEnabled()).toBe(false);
    expect(mockCtx.closeCalls).toBe(1);
    expect(mockCtx.state).toBe('closed');

    // Every started oscillator and buffer source must be stopped and disconnected
    for (const osc of allStartedOscs) {
      expect(osc.stopped).toBe(true);
      expect(osc.disconnected).toBe(true);
    }
    for (const src of allStartedSources) {
      expect(src.stopped).toBe(true);
      expect(src.disconnected).toBe(true);
    }
  });
});
