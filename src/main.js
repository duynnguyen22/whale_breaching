import * as THREE from 'three';
import { evaluateOceanHeight } from './math/oceanMath.js';
import {
  createBreachController,
  BREACH_CYCLE_DURATION,
  BREACH_VARIANTS,
} from './animation/breachTimeline.js';
import { createWhaleRig } from './whale/whaleMesh.js';
import { createOceanSurface } from './ocean/oceanSurface.js';
import { createSplashSystem } from './effects/splashSystem.js';
import { createEnvironment } from './scene/environment.js';
import { createCameraRig } from './scene/cameraRig.js';
import { createSoundscape } from './audio/soundscape.js';
import { createHud } from './ui/hud.js';

export function initWhaleScene({ createRenderer, createAudioContext } = {}) {
  const canvas = document.getElementById('scene-canvas');
  const hudContainer = document.getElementById('hud-root');

  const getViewportSize = () => ({
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight),
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  });

  const initialViewport = getViewportSize();

  const renderer =
    typeof createRenderer === 'function'
      ? createRenderer({ canvas })
      : new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          powerPreference: 'high-performance',
        });

  if (renderer) {
    renderer.setPixelRatio(initialViewport.pixelRatio);
    renderer.setSize(initialViewport.width, initialViewport.height, false);
  }

  const scene = new THREE.Scene();

  const cameraRig = createCameraRig({
    domElement: canvas,
    initialPreset: 'low-angle',
    aspect: initialViewport.width / initialViewport.height,
  });

  const environment = createEnvironment({
    scene,
    renderer: renderer?.capabilities ? renderer : null,
    camera: cameraRig.camera,
    initialMood: 'golden',
    width: initialViewport.width,
    height: initialViewport.height,
  });

  const controller = createBreachController({
    cycleDuration: BREACH_CYCLE_DURATION,
    autoLoop: true,
    variant: 'auto',
  });

  const whaleRig = createWhaleRig();
  scene.add(whaleRig.group);

  const oceanSurface = createOceanSurface();
  scene.add(oceanSurface.mesh);

  const splashSystem = createSplashSystem();
  scene.add(splashSystem.group);

  const soundscape = createSoundscape(
    createAudioContext ? { createAudioContext } : {},
  );

  let simTime = 0;
  let frameCount = 0;
  let currentBreachState = controller.getState();
  let lastCamStatus = {
    preset: cameraRig.getPreset(),
    isSubmerged: false,
    waterlineFraction: 0,
    waterHeightAtCamera: 0,
    shakeIntensity: 0,
    lensWetness: 0,
    fov: cameraRig.camera.fov,
  };

  const getWaterHeight = (x, z, queryTime = simTime) =>
    evaluateOceanHeight(x, z, queryTime, {
      dome: currentBreachState?.waterDome,
      ripples: oceanSurface.ripples,
    });

  let hud = null;

  function syncHud() {
    if (!hud) return;
    hud.update({
      phaseName: currentBreachState.phaseName,
      progress: currentBreachState.progress,
      elevation: currentBreachState.position.y,
      paused: controller.isPaused(),
      speed: controller.getTimeScale(),
      camera: cameraRig.getPreset(),
      mood: environment.getMood(),
      variant: controller.getVariant(),
      activeVariant: currentBreachState.variant,
      soundEnabled: soundscape.isEnabled(),
    });
  }

  function triggerBreach() {
    currentBreachState = controller.triggerBreach();
    syncHud();
    return currentBreachState;
  }

  function togglePause() {
    controller.setPaused(!controller.isPaused());
    syncHud();
    return controller.isPaused();
  }

  function setSpeed(scale) {
    controller.setTimeScale(scale);
    syncHud();
    return controller.getTimeScale();
  }

  function setCameraPreset(presetName, options) {
    cameraRig.setPreset(presetName, options);
    syncHud();
    return cameraRig.getPreset();
  }

  function setMood(moodName) {
    const res = environment.setMood(moodName);
    syncHud();
    return res;
  }

  function setVariant(mode) {
    const res = controller.setVariant(mode);
    currentBreachState = controller.getState();
    syncHud();
    return res;
  }

  function toggleSound() {
    const enabled = soundscape.toggle();
    syncHud();
    return enabled;
  }

  function triggerBlow(intensity = 1.0) {
    const anchors = whaleRig.getWorldAnchors();
    splashSystem.triggerSpout({
      blowhole: anchors.blowhole,
      upDir: anchors.upDir,
      intensity,
      velocity: currentBreachState?.velocity,
    });
    return soundscape.triggerBlow({ intensity });
  }

  hud = createHud({
    container: hudContainer,
    initialState: {
      paused: controller.isPaused(),
      speed: controller.getTimeScale(),
      camera: cameraRig.getPreset(),
      mood: environment.getMood(),
      variant: controller.getVariant(),
      activeVariant: currentBreachState.variant,
      soundEnabled: soundscape.isEnabled(),
      phaseName: currentBreachState.phaseName,
      progress: currentBreachState.progress,
      elevation: currentBreachState.position.y,
    },
    onTriggerBreach: () => {
      triggerBreach();
    },
    onTogglePause: () => {
      togglePause();
    },
    onSelectSpeed: (speed) => {
      setSpeed(speed);
    },
    onSelectCamera: (preset) => {
      setCameraPreset(preset);
    },
    onSelectMood: (mood) => {
      setMood(mood);
    },
    onSelectVariant: (variant) => {
      setVariant(variant);
    },
    onToggleSound: () => {
      toggleSound();
    },
  });

  function maybeTriggerLensSplash(ev, baseAmount) {
    const preset = cameraRig.getPreset();
    if (preset === 'underwater' || preset === 'aerial') return;

    const camPos = cameraRig.camera.position;
    const waterAtCam = getWaterHeight(camPos.x, camPos.z, simTime);
    const isAboveOrSplit = preset === 'split' || camPos.y >= waterAtCam - 0.55;
    if (!isAboveOrSplit || camPos.y > 18) return;

    const dx = camPos.x - (ev.x ?? 0);
    const dz = camPos.z - (ev.z ?? 0);
    const horizDist = Math.hypot(dx, dz);
    if (horizDist > 42) return;

    const proximity = THREE.MathUtils.clamp(1.28 - horizDist / 38, 0.35, 1.0);
    const presetBoost =
      preset === 'close-breach' || preset === 'split' ? 1.15 : 0.85;
    const amount = THREE.MathUtils.clamp(
      baseAmount * proximity * presetBoost,
      0.12,
      0.95,
    );

    cameraRig.addLensSplash(amount);
    environment.triggerLensSplash(amount);
  }

  function dispatchEvents(events, whaleAnchors) {
    for (let i = 0; i < events.length; i += 1) {
      const ev = events[i];
      if (ev.type === 'breakthrough') {
        oceanSurface.pushRipple(ev);
        splashSystem.triggerBreakthrough(ev);
        soundscape.triggerBreakthrough(ev);
        cameraRig.addShake(0.35);
        maybeTriggerLensSplash(ev, 0.45);
      } else if (ev.type === 'splashdown') {
        const splashdownEvent = {
          ...ev,
          spineStations: whaleAnchors.spineStations,
        };
        oceanSurface.pushRipple(splashdownEvent);
        splashSystem.triggerSplashdown(splashdownEvent);
        soundscape.triggerSplashdown(splashdownEvent);
        cameraRig.addShake(0.65);
        maybeTriggerLensSplash(splashdownEvent, 0.78);
      } else if (ev.type === 'blow') {
        splashSystem.triggerSpout({
          blowhole: whaleAnchors.blowhole,
          upDir: whaleAnchors.upDir,
          intensity: ev.intensity ?? ev.strength ?? 1.0,
          velocity: currentBreachState?.velocity,
        });
        soundscape.triggerBlow(ev);
      }
    }
  }

  function advanceSubstep(clampedDt) {
    const paused = controller.isPaused();
    const timeScale = controller.getTimeScale();
    const simDt = paused ? 0 : clampedDt * timeScale;

    simTime += simDt;

    const prevBlow = currentBreachState?.blowIntensity ?? 0;
    const { state, events } = controller.update(clampedDt, simTime);
    currentBreachState = state;

    const preAtmo = environment.getAtmosphereState();
    const whaleWaterLevel = getWaterHeight(
      currentBreachState.position.x,
      currentBreachState.position.z,
      simTime,
    );
    whaleRig.update(currentBreachState, simTime, {
      sunDirection: preAtmo.sunDirection,
      waterLevel: whaleWaterLevel,
    });
    const whaleAnchors = whaleRig.getWorldAnchors();

    if (events.length > 0) {
      dispatchEvents(events, whaleAnchors);
    }

    const nextBlow = currentBreachState.blowIntensity ?? 0;
    if (
      !paused &&
      prevBlow <= 0.35 &&
      nextBlow > 0.35 &&
      whaleAnchors.blowhole &&
      whaleAnchors.blowhole.y >
        getWaterHeight(
          whaleAnchors.blowhole.x,
          whaleAnchors.blowhole.z,
          simTime,
        )
    ) {
      splashSystem.triggerSpout({
        blowhole: whaleAnchors.blowhole,
        upDir: whaleAnchors.upDir,
        intensity: nextBlow,
        velocity: currentBreachState.velocity,
      });
    }

    const camStatus = cameraRig.update({
      dt: clampedDt,
      time: simTime,
      breachState: currentBreachState,
      getWaterHeight,
    });
    lastCamStatus = camStatus;

    const envState = environment.update({
      dt: clampedDt,
      cameraPosition: cameraRig.camera.position,
      waterHeightAtCamera: camStatus.waterHeightAtCamera,
      waterlineFraction: camStatus.waterlineFraction,
      lensWetness: camStatus.lensWetness,
      time: simTime,
    });

    oceanSurface.update({
      time: simTime,
      sunDirection: envState.sunDirection,
      sunColor: envState.sunColor,
      skyHorizonColor: envState.skyHorizonColor,
      fogColor: envState.fogColor,
      fogDensity: envState.fogDensity,
      waterDome: currentBreachState.waterDome,
      mood: envState.mood,
      whaleAnchors,
    });

    splashSystem.update({
      dt: simDt,
      time: simTime,
      breachState: currentBreachState,
      whaleAnchors,
      getWaterHeight,
      sunColor: envState.sunColor,
      sunDirection: envState.sunDirection,
    });

    soundscape.update({
      dt: clampedDt,
      time: simTime,
      breachState: currentBreachState,
      isSubmerged: camStatus.isSubmerged,
      waterlineFraction: camStatus.waterlineFraction,
      timeScale,
      paused,
    });

    syncHud();
  }

  function stepFrame(rawDt = 1 / 60) {
    const totalDt = Math.max(0, Number.isFinite(rawDt) ? rawDt : 0);
    if (totalDt <= 0.05) {
      advanceSubstep(totalDt);
    } else {
      const steps = Math.min(240, Math.ceil(totalDt / 0.04));
      const subDt = totalDt / steps;
      for (let i = 0; i < steps; i += 1) {
        advanceSubstep(subDt);
      }
    }

    environment.render(Math.min(0.05, totalDt));
    frameCount += 1;
  }

  function handleResize() {
    const vp = getViewportSize();
    cameraRig.resize(vp.width, vp.height);
    environment.resize(vp.width, vp.height, vp.pixelRatio);
  }

  window.addEventListener('resize', handleResize);

  // Render initial frame immediately
  stepFrame(1 / 60);

  let rafId = 0;
  let lastTimestamp =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  function animate(now) {
    rafId = window.requestAnimationFrame(animate);
    const dt = Math.min(0.05, Math.max(0, (now - lastTimestamp) * 0.001));
    lastTimestamp = now;
    stepFrame(dt);
  }

  rafId = window.requestAnimationFrame(animate);

  const debugHandle = {
    controller,
    cameraRig,
    environment,
    whaleRig,
    oceanSurface,
    splashSystem,
    soundscape,
    hud,
    variants: BREACH_VARIANTS,
    triggerBreach,
    togglePause,
    setSpeed,
    setCameraPreset,
    setMood,
    setVariant,
    toggleSound,
    triggerBlow,
    stepFrame,
    getStatus() {
      const state = controller.getState();
      const target = cameraRig.getTarget();
      const camPos = cameraRig.camera.position;
      const waterAtOrigin = getWaterHeight(0, 0, simTime);
      const waterAtCamera = getWaterHeight(camPos.x, camPos.z, simTime);
      const lensWetness = Math.max(
        cameraRig.getLensWetness(),
        environment.getLensWetness(),
      );
      return {
        simTime,
        frameCount,
        paused: controller.isPaused(),
        timeScale: controller.getTimeScale(),
        progress: state.progress,
        variant: controller.getVariant(),
        activeVariant: state.variant,
        blowIntensity: state.blowIntensity ?? 0,
        phaseName: state.phaseName,
        phaseLabel: hud.getPhaseLabel(state.phaseName),
        whalePosition: { ...state.position },
        whaleRotation: { ...state.rotation },
        waterDome: { ...state.waterDome },
        waterHeightAtOrigin: waterAtOrigin,
        cameraPreset: cameraRig.getPreset(),
        cameraPosition: { x: camPos.x, y: camPos.y, z: camPos.z },
        cameraTarget: { x: target.x, y: target.y, z: target.z },
        fov: cameraRig.camera.fov,
        isCameraSubmerged: lastCamStatus
          ? lastCamStatus.isSubmerged
          : camPos.y < waterAtCamera,
        waterlineFraction: lastCamStatus?.waterlineFraction ?? 0,
        lensWetness,
        shakeIntensity: cameraRig.getShakeIntensity(),
        mood: environment.getMood(),
        soundEnabled: soundscape.isEnabled(),
        activeRippleCount: Array.isArray(oceanSurface.ripples)
          ? oceanSurface.ripples.length
          : 0,
      };
    },
    dispose() {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      hud.dispose();
      soundscape.dispose();
      cameraRig.dispose();
      environment.dispose();
      renderer?.dispose();
    },
  };

  window.__WHALE_SCENE__ = debugHandle;
  return debugHandle;
}

if (
  typeof document !== 'undefined' &&
  document.getElementById('scene-canvas')
) {
  initWhaleScene();
}
