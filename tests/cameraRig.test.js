import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCameraRig, CAMERA_PRESETS } from '../src/scene/cameraRig.js';
import { createEnvironment } from '../src/scene/environment.js';
import { evaluateOceanHeight } from '../src/math/oceanMath.js';
import { createBreachController } from '../src/animation/breachTimeline.js';
import { createWhaleRig } from '../src/whale/whaleMesh.js';
import { createOceanSurface } from '../src/ocean/oceanSurface.js';
import { createSplashSystem } from '../src/effects/splashSystem.js';

describe('cameraRig', () => {
  it('initializes in default low-angle preset and switches cleanly across all 4 presets', () => {
    const rig = createCameraRig();

    expect(rig.getPreset()).toBe('low-angle');
    expect(rig.camera.position.x).toBeCloseTo(18, 2);
    expect(rig.camera.position.y).toBeCloseTo(1.8, 2);
    expect(rig.camera.position.z).toBeCloseTo(21, 2);
    expect(rig.controls.enabled).toBe(false);

    rig.setPreset('close-breach', { immediate: true });
    expect(rig.getPreset()).toBe('close-breach');
    expect(rig.camera.position.x).toBeCloseTo(11, 2);
    expect(rig.camera.position.y).toBeCloseTo(2.1, 2);
    expect(rig.camera.position.z).toBeCloseTo(13.5, 2);

    rig.setPreset('underwater', { immediate: true });
    expect(rig.getPreset()).toBe('underwater');
    expect(rig.camera.position.x).toBeCloseTo(9.5, 2);
    expect(rig.camera.position.y).toBeCloseTo(-6.0, 2);
    expect(rig.camera.position.z).toBeCloseTo(10.5, 2);
    const uwTarget = rig.getTarget();
    expect(uwTarget.x).toBeCloseTo(0, 2);
    expect(uwTarget.y).toBeCloseTo(1.5, 2);
    expect(uwTarget.z).toBeCloseTo(2, 2);

    rig.setPreset('orbit', { immediate: true });
    expect(rig.getPreset()).toBe('orbit');
    expect(rig.camera.position.x).toBeCloseTo(26, 2);
    expect(rig.camera.position.y).toBeCloseTo(11, 2);
    expect(rig.camera.position.z).toBeCloseTo(28, 2);
    expect(rig.controls.enabled).toBe(true);
    expect(Object.keys(CAMERA_PRESETS)).toEqual([
      'low-angle',
      'close-breach',
      'underwater',
      'orbit',
    ]);

    rig.dispose();
  });

  it('bobs above waves in low-angle, tracks ~45% of whale airborne rise, and detects submergence', () => {
    const rig = createCameraRig({ initialPreset: 'low-angle' });

    // Baseline with whale submerged
    for (let i = 0; i < 30; i += 1) {
      rig.update({
        dt: 1 / 60,
        time: i / 60,
        breachState: {
          position: { x: 0, y: -5, z: 0 },
          waterDome: { x: 0, z: 0, radius: 4.8, height: 0 },
        },
        getWaterHeight: () => 0,
      });
    }
    const baseTargetY = rig.getTarget().y;

    // Airborne apex at y = +9.2m -> target should rise by ~45% of 9.2m (~4.14m)
    let status;
    for (let i = 0; i < 90; i += 1) {
      status = rig.update({
        dt: 1 / 60,
        time: 1.0 + i / 60,
        breachState: {
          position: { x: 0, y: 9.2, z: 5.5 },
          waterDome: { x: 0, z: 0, radius: 4.8, height: 0 },
        },
        getWaterHeight: () => 0.4,
      });
    }

    const apexTargetY = rig.getTarget().y;
    const riseDelta = apexTargetY - baseTargetY;
    expect(riseDelta).toBeGreaterThan(3.6);
    expect(riseDelta).toBeLessThan(4.6);
    expect(status.isSubmerged).toBe(false);
    expect(rig.camera.position.y).toBeGreaterThan(0.4 + 0.8);

    // Smooth non-immediate switch into underwater preset
    rig.setPreset('underwater');
    const firstStep = rig.update({
      dt: 1 / 60,
      time: 2.6,
      breachState: { position: { x: 0, y: -12, z: -4 } },
      getWaterHeight: () => 0.2,
    });
    // Mid-transition: moved downward from low-angle y, not yet snapped to -6.0
    expect(rig.camera.position.y).toBeLessThan(2.2);
    expect(rig.camera.position.y).toBeGreaterThan(-5.8);
    expect(firstStep.preset).toBe('underwater');

    let finalStep;
    for (let i = 0; i < 120; i += 1) {
      finalStep = rig.update({
        dt: 1 / 60,
        time: 2.7 + i / 60,
        breachState: { position: { x: 0, y: 0, z: 0 } },
        getWaterHeight: () => 0.2,
      });
    }
    expect(finalStep.isSubmerged).toBe(true);
    expect(rig.camera.position.y).toBeLessThan(-5.0);

    // Close-breach tracks high enough and pulls back during breakthrough/apex so +11.4m snout stays in frame
    rig.setPreset('close-breach', { immediate: true });
    for (let i = 0; i < 60; i += 1) {
      rig.update({
        dt: 1 / 60,
        time: 5.0 + i / 60,
        breachState: {
          position: { x: 0, y: 9.2, z: 5.5 },
          emergenceIntensity: 0.6,
          waterDome: { x: 0, z: 0, radius: 4.8, height: 0 },
        },
        getWaterHeight: () => 0,
      });
    }
    expect(rig.getTarget().y).toBeGreaterThan(6.8);
    expect(rig.camera.position.z).toBeGreaterThan(16.0);

    rig.dispose();
  });

  it('applies breakthrough (0.35) and splashdown (0.65) camera shake with smooth exponential decay and no drift', () => {
    const rig = createCameraRig({ initialPreset: 'orbit' });
    const restPos = rig.camera.position.clone();

    rig.addShake(0.35);
    expect(rig.getShakeIntensity()).toBeCloseTo(0.35, 3);

    const step1 = rig.update({ dt: 1 / 60, time: 0.1 });
    const offsetAfterBreakthrough = rig.camera.position.distanceTo(restPos);
    expect(offsetAfterBreakthrough).toBeGreaterThan(0.005);
    expect(step1.shakeIntensity).toBeLessThan(0.35);
    expect(step1.shakeIntensity).toBeGreaterThan(0.25);

    // Stronger splashdown shake
    rig.addShake(0.65);
    expect(rig.getShakeIntensity()).toBeGreaterThan(0.65);

    // Monotonic exponential decay back to rest position with zero drift in orbit mode
    let prevShake = rig.getShakeIntensity();
    for (let i = 0; i < 180; i += 1) {
      const s = rig.update({ dt: 1 / 60, time: 0.2 + i / 60 });
      expect(s.shakeIntensity).toBeLessThanOrEqual(prevShake);
      prevShake = s.shakeIntensity;
    }

    expect(rig.getShakeIntensity()).toBe(0);
    expect(rig.camera.position.distanceTo(restPos)).toBeLessThan(1e-3);

    rig.resize(1920, 1080);
    expect(rig.camera.aspect).toBeCloseTo(1920 / 1080, 5);

    rig.dispose();
  });

  it('coordinates camera submergence with environment mood and underwater fog switching', () => {
    const scene = new THREE.Scene();
    const rig = createCameraRig({ initialPreset: 'low-angle' });
    const env = createEnvironment({
      scene,
      camera: rig.camera,
      initialMood: 'golden',
    });

    const golden = env.getAtmosphereState();
    expect(golden.mood).toBe('golden');
    expect(golden.sunDirection.length()).toBeCloseTo(1, 4);
    // Sun is angled to a 3/4 rim/side direction rather than straight into the (-0.707, 0, -0.707) camera view axis
    const viewAxis = new THREE.Vector3(-18, 0, -18).normalize();
    expect(golden.sunDirection.dot(viewAxis)).toBeLessThan(0.75);
    expect(env.sky.material.fragmentShader).toContain('uZenithColor');
    expect(env.sky.material.fragmentShader).not.toContain('1.2 * vSunfade');
    expect(scene.fog.density).toBeLessThan(0.005);
    expect(env.sky.visible).toBe(true);

    const noon = env.setMood('noon');
    expect(noon.mood).toBe('noon');
    expect(noon.sunDirection.y).toBeGreaterThan(golden.sunDirection.y);

    const twilight = env.setMood('twilight');
    expect(twilight.mood).toBe('twilight');

    // Switch camera to underwater and verify fog + sky submergence state
    rig.setPreset('underwater', { immediate: true });
    const camStep = rig.update({
      dt: 1 / 60,
      time: 1.0,
      getWaterHeight: () => 0.1,
    });
    const envStep = env.update({
      dt: 1 / 60,
      cameraPosition: rig.camera.position,
      waterHeightAtCamera: camStep.waterHeightAtCamera,
    });

    expect(camStep.isSubmerged).toBe(true);
    expect(envStep.isSubmerged).toBe(true);
    expect(env.sky.visible).toBe(false);
    expect(scene.fog.density).toBeGreaterThan(0.015);

    env.dispose();
    rig.dispose();
  });

  it('integrates cameraRig and environment cleanly across a full 9s breach cycle with all scene subsystems', () => {
    const scene = new THREE.Scene();
    const rig = createCameraRig({ initialPreset: 'low-angle' });
    const env = createEnvironment({
      scene,
      camera: rig.camera,
      initialMood: 'golden',
    });
    const controller = createBreachController();
    const whaleRig = createWhaleRig();
    const oceanSurface = createOceanSurface();
    const splashSystem = createSplashSystem();

    scene.add(whaleRig.group, oceanSurface.mesh, splashSystem.group);

    let simTime = 0;
    let currentState = controller.getState();
    let sawBreakthroughShake = false;
    let sawSplashdownShake = false;

    const getWaterHeight = (x, z, queryTime = simTime) =>
      evaluateOceanHeight(x, z, queryTime, {
        dome: currentState?.waterDome,
        ripples: oceanSurface.ripples,
      });

    const dt = 0.05;
    for (let i = 0; i < 190; i += 1) {
      simTime += dt;
      const { state, events } = controller.update(dt, simTime);
      currentState = state;

      for (const ev of events) {
        oceanSurface.pushRipple(ev);
        if (ev.type === 'breakthrough') {
          splashSystem.triggerBreakthrough(ev);
          rig.addShake(0.35);
          sawBreakthroughShake = true;
        } else if (ev.type === 'splashdown') {
          splashSystem.triggerSplashdown(ev);
          rig.addShake(0.65);
          sawSplashdownShake = true;
        }
      }

      whaleRig.update(currentState, simTime);
      const whaleAnchors = whaleRig.getWorldAnchors();
      const camStatus = rig.update({
        dt,
        time: simTime,
        breachState: currentState,
        getWaterHeight,
      });
      const envState = env.update({
        dt,
        cameraPosition: rig.camera.position,
        waterHeightAtCamera: camStatus.waterHeightAtCamera,
      });

      oceanSurface.update({
        time: simTime,
        sunDirection: envState.sunDirection,
        sunColor: envState.sunColor,
        skyHorizonColor: envState.skyHorizonColor,
        fogColor: envState.fogColor,
        fogDensity: envState.fogDensity,
        waterDome: currentState.waterDome,
        mood: envState.mood,
      });

      splashSystem.update({
        dt,
        time: simTime,
        breachState: currentState,
        whaleAnchors,
        getWaterHeight,
        sunColor: envState.sunColor,
      });

      expect(Number.isFinite(rig.camera.position.x)).toBe(true);
      expect(Number.isFinite(rig.camera.position.y)).toBe(true);
      expect(Number.isFinite(rig.camera.position.z)).toBe(true);
      expect(camStatus.isSubmerged).toBe(false);
    }

    expect(sawBreakthroughShake).toBe(true);
    expect(sawSplashdownShake).toBe(true);
    expect(oceanSurface.ripples.length).toBeGreaterThan(0);

    env.dispose();
    rig.dispose();
  });
});
