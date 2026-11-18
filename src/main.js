import * as THREE from 'three';
import { evaluateOceanHeight } from './math/oceanMath.js';
import {
  createBreachController,
  BREACH_CYCLE_DURATION,
} from './animation/breachTimeline.js';
import { createWhaleRig } from './whale/whaleMesh.js';
import { createOceanSurface } from './ocean/oceanSurface.js';
import { createSplashSystem } from './effects/splashSystem.js';
import { createEnvironment } from './scene/environment.js';
import { createCameraRig } from './scene/cameraRig.js';
import { createHud } from './ui/hud.js';

function initWhaleScene() {
  const canvas = document.getElementById('scene-canvas');
  const hudContainer = document.getElementById('hud-root');

  const getViewportSize = () => ({
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight),
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  });

  const initialViewport = getViewportSize();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(initialViewport.pixelRatio);
  renderer.setSize(initialViewport.width, initialViewport.height, false);

  const scene = new THREE.Scene();

  const cameraRig = createCameraRig({
    domElement: canvas,
    initialPreset: 'low-angle',
    aspect: initialViewport.width / initialViewport.height,
  });

  const environment = createEnvironment({
    scene,
    renderer,
    camera: cameraRig.camera,
    initialMood: 'golden',
    width: initialViewport.width,
    height: initialViewport.height,
  });

  const controller = createBreachController({
    cycleDuration: BREACH_CYCLE_DURATION,
    autoLoop: true,
  });

  const whaleRig = createWhaleRig();
  scene.add(whaleRig.group);

  const oceanSurface = createOceanSurface();
  scene.add(oceanSurface.mesh);

  const splashSystem = createSplashSystem();
  scene.add(splashSystem.group);

  let simTime = 0;
  let frameCount = 0;
  let currentBreachState = controller.getState();

  const getWaterHeight = (x, z, queryTime = simTime) =>
    evaluateOceanHeight(x, z, queryTime, {
      dome: currentBreachState?.waterDome,
      ripples: oceanSurface.ripples,
    });

  function triggerBreach() {
    currentBreachState = controller.triggerBreach();
    return currentBreachState;
  }

  function togglePause() {
    controller.setPaused(!controller.isPaused());
    return controller.isPaused();
  }

  function setSpeed(scale) {
    controller.setTimeScale(scale);
    return controller.getTimeScale();
  }

  function setCameraPreset(presetName, options) {
    cameraRig.setPreset(presetName, options);
    return cameraRig.getPreset();
  }

  function setMood(moodName) {
    return environment.setMood(moodName);
  }

  const hud = createHud({
    container: hudContainer,
    initialState: {
      paused: controller.isPaused(),
      speed: controller.getTimeScale(),
      camera: cameraRig.getPreset(),
      mood: environment.getMood(),
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
  });

  function dispatchEvents(events) {
    for (let i = 0; i < events.length; i += 1) {
      const ev = events[i];
      if (ev.type === 'breakthrough') {
        oceanSurface.pushRipple(ev);
        splashSystem.triggerBreakthrough(ev);
        cameraRig.addShake(0.35);
      } else if (ev.type === 'splashdown') {
        oceanSurface.pushRipple(ev);
        splashSystem.triggerSplashdown(ev);
        cameraRig.addShake(0.65);
      }
    }
  }

  function advanceSubstep(clampedDt) {
    const simDt = controller.isPaused()
      ? 0
      : clampedDt * controller.getTimeScale();

    simTime += simDt;

    const { state, events } = controller.update(clampedDt, simTime);
    currentBreachState = state;

    if (events.length > 0) {
      dispatchEvents(events);
    }

    whaleRig.update(currentBreachState, simTime);
    const whaleAnchors = whaleRig.getWorldAnchors();

    const camStatus = cameraRig.update({
      dt: clampedDt,
      time: simTime,
      breachState: currentBreachState,
      getWaterHeight,
    });

    const envState = environment.update({
      dt: clampedDt,
      cameraPosition: cameraRig.camera.position,
      waterHeightAtCamera: camStatus.waterHeightAtCamera,
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
    });

    splashSystem.update({
      dt: simDt,
      time: simTime,
      breachState: currentBreachState,
      whaleAnchors,
      getWaterHeight,
      sunColor: envState.sunColor,
    });

    hud.update({
      phaseName: currentBreachState.phaseName,
      progress: currentBreachState.progress,
      elevation: currentBreachState.position.y,
      paused: controller.isPaused(),
      speed: controller.getTimeScale(),
      camera: cameraRig.getPreset(),
      mood: environment.getMood(),
    });
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
  let lastTimestamp = performance.now();

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
    triggerBreach,
    togglePause,
    setSpeed,
    setCameraPreset,
    setMood,
    stepFrame,
    getStatus() {
      const state = controller.getState();
      const target = cameraRig.getTarget();
      const camPos = cameraRig.camera.position;
      const waterAtOrigin = getWaterHeight(0, 0, simTime);
      const waterAtCamera = getWaterHeight(camPos.x, camPos.z, simTime);
      return {
        simTime,
        frameCount,
        paused: controller.isPaused(),
        timeScale: controller.getTimeScale(),
        progress: state.progress,
        phaseName: state.phaseName,
        phaseLabel: hud.getPhaseLabel(state.phaseName),
        whalePosition: { ...state.position },
        whaleRotation: { ...state.rotation },
        waterDome: { ...state.waterDome },
        waterHeightAtOrigin: waterAtOrigin,
        cameraPreset: cameraRig.getPreset(),
        cameraPosition: { x: camPos.x, y: camPos.y, z: camPos.z },
        cameraTarget: { x: target.x, y: target.y, z: target.z },
        isCameraSubmerged: camPos.y < waterAtCamera,
        shakeIntensity: cameraRig.getShakeIntensity(),
        mood: environment.getMood(),
        activeRippleCount: Array.isArray(oceanSurface.ripples)
          ? oceanSurface.ripples.length
          : 0,
      };
    },
    dispose() {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      hud.dispose();
      cameraRig.dispose();
      environment.dispose();
      renderer.dispose();
    },
  };

  window.__WHALE_SCENE__ = debugHandle;
  return debugHandle;
}

initWhaleScene();
