import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCameraRig, CAMERA_PRESETS } from '../src/scene/cameraRig.js';
import { createEnvironment } from '../src/scene/environment.js';
import { evaluateOceanHeight } from '../src/math/oceanMath.js';
import { createBreachController } from '../src/animation/breachTimeline.js';
import { createWhaleRig } from '../src/whale/whaleMesh.js';
import { createOceanSurface } from '../src/ocean/oceanSurface.js';
import { createSplashSystem } from '../src/effects/splashSystem.js';

function expectBalancedGlsl(source) {
  let braces = 0;
  let parens = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') braces += 1;
    else if (ch === '}') braces -= 1;
    else if (ch === '(') parens += 1;
    else if (ch === ')') parens -= 1;
    expect(braces).toBeGreaterThanOrEqual(0);
    expect(parens).toBeGreaterThanOrEqual(0);
  }
  expect(braces).toBe(0);
  expect(parens).toBe(0);
}

describe('cameraRig & environment cinematography', () => {
  it('initializes in default low-angle preset and switches cleanly across all 6 presets with per-preset FOV', () => {
    const rig = createCameraRig();

    expect(Object.keys(CAMERA_PRESETS)).toEqual([
      'low-angle',
      'close-breach',
      'underwater',
      'orbit',
      'split',
      'aerial',
    ]);

    expect(rig.getPreset()).toBe('low-angle');
    expect(rig.camera.position.x).toBeCloseTo(18, 2);
    expect(rig.camera.position.y).toBeCloseTo(1.8, 2);
    expect(rig.camera.position.z).toBeCloseTo(21, 2);
    expect(rig.camera.fov).toBeCloseTo(35, 3);
    expect(rig.controls.enabled).toBe(false);

    rig.setPreset('close-breach', { immediate: true });
    expect(rig.getPreset()).toBe('close-breach');
    expect(rig.camera.position.x).toBeCloseTo(11, 2);
    expect(rig.camera.position.y).toBeCloseTo(2.1, 2);
    expect(rig.camera.position.z).toBeCloseTo(13.5, 2);
    expect(rig.camera.fov).toBeCloseTo(56, 3);

    rig.setPreset('underwater', { immediate: true });
    expect(rig.getPreset()).toBe('underwater');
    expect(rig.camera.position.x).toBeCloseTo(9.5, 2);
    expect(rig.camera.position.y).toBeCloseTo(-6.0, 2);
    expect(rig.camera.position.z).toBeCloseTo(10.5, 2);
    expect(rig.camera.fov).toBeCloseTo(64, 3);
    const uwTarget = rig.getTarget();
    expect(uwTarget.x).toBeCloseTo(0, 2);
    expect(uwTarget.y).toBeCloseTo(1.5, 2);
    expect(uwTarget.z).toBeCloseTo(2, 2);

    rig.setPreset('orbit', { immediate: true });
    expect(rig.getPreset()).toBe('orbit');
    expect(rig.camera.position.x).toBeCloseTo(26, 2);
    expect(rig.camera.position.y).toBeCloseTo(11, 2);
    expect(rig.camera.position.z).toBeCloseTo(28, 2);
    expect(rig.camera.fov).toBeCloseTo(48, 3);
    expect(rig.controls.enabled).toBe(true);

    rig.setPreset('split', { immediate: true });
    expect(rig.getPreset()).toBe('split');
    expect(rig.camera.position.x).toBeCloseTo(12.5, 2);
    expect(rig.camera.position.y).toBeCloseTo(0.0, 2);
    expect(rig.camera.position.z).toBeCloseTo(14.0, 2);
    expect(rig.camera.fov).toBeCloseTo(60, 3);
    expect(rig.controls.enabled).toBe(false);
    const splitTarget = rig.getTarget();
    expect(splitTarget.x).toBeCloseTo(0, 2);
    expect(splitTarget.y).toBeCloseTo(0.8, 2);
    expect(splitTarget.z).toBeCloseTo(2.2, 2);

    rig.setPreset('aerial', { immediate: true });
    expect(rig.getPreset()).toBe('aerial');
    expect(rig.camera.position.x).toBeCloseTo(14.0, 2);
    expect(rig.camera.position.y).toBeCloseTo(34.0, 2);
    expect(rig.camera.position.z).toBeCloseTo(16.0, 2);
    expect(rig.camera.fov).toBeCloseTo(44, 3);
    expect(rig.controls.enabled).toBe(false);
    const aerialTarget = rig.getTarget();
    expect(aerialTarget.x).toBeCloseTo(0, 2);
    expect(aerialTarget.y).toBeCloseTo(0.5, 2);
    expect(aerialTarget.z).toBeCloseTo(4.5, 2);

    rig.dispose();
  });

  it('smoothly interpolates camera.fov and updates projection matrix during non-immediate preset transitions', () => {
    const rig = createCameraRig({ initialPreset: 'low-angle' });
    expect(rig.camera.fov).toBeCloseTo(35, 3);
    const initialProjScaleY = rig.camera.projectionMatrix.elements[5];

    rig.setPreset('underwater', { immediate: false });
    const step1 = rig.update({ dt: 1 / 60, time: 0.1 });
    expect(step1.fov).toBeGreaterThan(35.5);
    expect(step1.fov).toBeLessThan(63.5);
    expect(rig.camera.projectionMatrix.elements[5]).not.toBeCloseTo(
      initialProjScaleY,
      3,
    );

    let lastStep = step1;
    for (let i = 0; i < 120; i += 1) {
      lastStep = rig.update({ dt: 1 / 60, time: 0.2 + i / 60 });
    }
    expect(lastStep.fov).toBeCloseTo(64, 2);
    const expectedScaleY = 1 / Math.tan(THREE.MathUtils.degToRad(64 * 0.5));
    expect(rig.camera.projectionMatrix.elements[5]).toBeCloseTo(
      expectedScaleY,
      2,
    );

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
    expect(status.waterlineFraction).toBe(0);
    expect(rig.camera.position.y).toBeGreaterThan(0.4 + 0.8);

    // Smooth non-immediate switch into underwater preset
    rig.setPreset('underwater');
    const firstStep = rig.update({
      dt: 1 / 60,
      time: 2.6,
      breachState: { position: { x: 0, y: -12, z: -4 } },
      getWaterHeight: () => 0.2,
    });
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
    expect(finalStep.waterlineFraction).toBe(1);
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

  it('straddles dynamic ocean surface in split preset (~0.48-0.52 waterlineFraction) and banks smoothly in aerial preset', () => {
    const rig = createCameraRig({ initialPreset: 'split' });

    for (let i = 0; i < 45; i += 1) {
      const t = i / 60;
      const status = rig.update({
        dt: 1 / 60,
        time: t,
        breachState: { position: { x: 0, y: 2.5, z: 3.0 } },
        getWaterHeight: (x, z, qTime) => evaluateOceanHeight(x, z, qTime),
      });
      expect(status.isSubmerged).toBe(false);
      expect(status.waterlineFraction).toBeGreaterThanOrEqual(0.475);
      expect(status.waterlineFraction).toBeLessThanOrEqual(0.525);
      expect(status.fov).toBeCloseTo(60, 2);
    }

    // Switch to aerial drone and verify high banking orbit and clean up-vector
    rig.setPreset('aerial', { immediate: true });
    const startAerialPos = rig.camera.position.clone();
    let aerialStatus;
    for (let i = 0; i < 90; i += 1) {
      aerialStatus = rig.update({
        dt: 1 / 60,
        time: 2.0 + i / 60,
        breachState: { position: { x: 0.2, y: 6.0, z: 4.5 } },
        getWaterHeight: () => 0.2,
      });
    }
    expect(aerialStatus.isSubmerged).toBe(false);
    expect(aerialStatus.waterlineFraction).toBe(0);
    expect(aerialStatus.fov).toBeCloseTo(44, 2);
    expect(rig.camera.position.y).toBeGreaterThan(32.0);
    expect(rig.camera.position.distanceTo(startAerialPos)).toBeGreaterThan(0.5);
    expect(rig.camera.up.x).toBeCloseTo(0, 5);
    expect(rig.camera.up.y).toBeCloseTo(1, 5);
    expect(rig.camera.up.z).toBeCloseTo(0, 5);

    rig.dispose();
  });

  it('applies bounded ±2.0° wave-slope boat horizon roll in low-angle and close-breach, and resets camera.up in other presets', () => {
    const rig = createCameraRig({ initialPreset: 'low-angle' });
    const maxRad = THREE.MathUtils.degToRad(2.0);

    // Moderate positive X wave slope
    for (let i = 0; i < 40; i += 1) {
      rig.update({
        dt: 1 / 60,
        time: i / 60,
        getWaterHeight: (x) => (x - 18) * 0.18,
      });
    }
    const rollPosAngle = Math.acos(
      THREE.MathUtils.clamp(rig.camera.up.y, -1, 1),
    );
    expect(rollPosAngle).toBeGreaterThan(0.002);
    expect(rollPosAngle).toBeLessThanOrEqual(maxRad + 1e-5);
    const upXPositiveSlope = rig.camera.up.x;

    // Extreme negative X wave slope -> clamped strictly to 2.0 deg and opposite tilt sign
    rig.setPreset('close-breach', { immediate: true });
    expect(rig.camera.up.x).toBe(0);
    expect(rig.camera.up.y).toBe(1);
    expect(rig.camera.up.z).toBe(0);

    for (let i = 0; i < 60; i += 1) {
      rig.update({
        dt: 1 / 60,
        time: 1.0 + i / 60,
        getWaterHeight: (x) => -(x - 11) * 8.0,
      });
    }
    const rollClampedAngle = Math.acos(
      THREE.MathUtils.clamp(rig.camera.up.y, -1, 1),
    );
    expect(rollClampedAngle).toBeCloseTo(maxRad, 3);
    expect(Math.sign(rig.camera.up.x)).toBe(-Math.sign(upXPositiveSlope));

    // Reset cleanly in underwater, aerial, and orbit
    for (const cleanPreset of ['underwater', 'aerial', 'orbit']) {
      rig.setPreset(cleanPreset);
      rig.update({
        dt: 1 / 60,
        time: 2.5,
        getWaterHeight: (x) => x * 0.5,
      });
      expect(rig.camera.up.x).toBeCloseTo(0, 6);
      expect(rig.camera.up.y).toBeCloseTo(1, 6);
      expect(rig.camera.up.z).toBeCloseTo(0, 6);
    }

    rig.dispose();
  });

  it('applies camera shake and ~4.5s lensWetness splash decay with zero drift', () => {
    const rig = createCameraRig({ initialPreset: 'orbit' });
    const restPos = rig.camera.position.clone();

    rig.addShake(0.35);
    rig.addLensSplash(0.6);
    expect(rig.getShakeIntensity()).toBeCloseTo(0.35, 3);
    expect(rig.getLensWetness()).toBeCloseTo(0.6, 3);

    const step1 = rig.update({ dt: 1 / 60, time: 0.1 });
    const offsetAfterBreakthrough = rig.camera.position.distanceTo(restPos);
    expect(offsetAfterBreakthrough).toBeGreaterThan(0.005);
    expect(step1.shakeIntensity).toBeLessThan(0.35);
    expect(step1.shakeIntensity).toBeGreaterThan(0.25);
    expect(step1.lensWetness).toBeLessThan(0.6);
    expect(step1.lensWetness).toBeGreaterThan(0.55);

    // Stronger splashdown shake & capped wetness
    rig.addShake(0.65);
    rig.addLensSplash(0.75);
    expect(rig.getShakeIntensity()).toBeGreaterThan(0.65);
    expect(rig.getLensWetness()).toBeCloseTo(1.0, 4);

    let prevShake = rig.getShakeIntensity();
    let prevWet = rig.getLensWetness();
    let wetAt2s = 0;
    let wetAt45s = 0;

    for (let i = 1; i <= 330; i += 1) {
      const s = rig.update({ dt: 1 / 60, time: 0.2 + i / 60 });
      expect(s.shakeIntensity).toBeLessThanOrEqual(prevShake);
      expect(s.lensWetness).toBeLessThanOrEqual(prevWet);
      prevShake = s.shakeIntensity;
      prevWet = s.lensWetness;
      if (i === 120) wetAt2s = s.lensWetness;
      if (i === 270) wetAt45s = s.lensWetness;
    }

    expect(wetAt2s).toBeGreaterThan(0.12);
    expect(wetAt45s).toBeLessThan(0.025);
    expect(rig.getLensWetness()).toBe(0);
    expect(rig.getShakeIntensity()).toBe(0);
    expect(rig.camera.position.distanceTo(restPos)).toBeLessThan(1e-3);

    rig.resize(1920, 1080);
    expect(rig.camera.aspect).toBeCloseTo(1920 / 1080, 5);

    rig.dispose();
  });

  it('upgrades sky/envSky with procedural clouds + horizon islands and drives split-waterline meniscus & lens droplets', () => {
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
    const viewAxis = new THREE.Vector3(-18, 0, -18).normalize();
    expect(golden.sunDirection.dot(viewAxis)).toBeLessThan(0.75);

    // Verify both scene sky and PMREM envSky carry clouds + horizon islands + linear HDR calibration
    for (const skyMesh of [env.sky, env.envSky]) {
      const frag = skyMesh.material.fragmentShader;
      expect(frag).toContain('uZenithColor');
      expect(frag).toContain('skyFbm');
      expect(frag).toContain('skyIslandProfile');
      expect(frag).not.toContain('1.2 * vSunfade');
      expectBalancedGlsl(frag);
    }
    expectBalancedGlsl(env.lensAndWaterlinePass.material.fragmentShader);
    expect(env.lensAndWaterlinePass.material.fragmentShader).toContain(
      'evaluateBokehDroplets',
    );
    expect(env.lensAndWaterlinePass.material.fragmentShader).toContain(
      'uWaterlineFraction',
    );

    const baseGoldenFog = scene.fog.density;
    expect(baseGoldenFog).toBeLessThan(0.005);
    expect(env.sky.visible).toBe(true);
    expect(env.lensAndWaterlinePass.enabled).toBe(false);

    const noon = env.setMood('noon');
    expect(noon.mood).toBe('noon');
    expect(noon.sunDirection.y).toBeGreaterThan(golden.sunDirection.y);

    const twilight = env.setMood('twilight');
    expect(twilight.mood).toBe('twilight');
    env.setMood('golden');

    // Split waterline mode: sky stays visible, atmospheric fog blends gently, meniscus pass activates
    rig.setPreset('split', { immediate: true });
    const splitCam = rig.update({
      dt: 1 / 60,
      time: 1.5,
      getWaterHeight: () => 0.25,
    });
    const splitEnv = env.update({
      dt: 1 / 60,
      cameraPosition: rig.camera.position,
      waterHeightAtCamera: splitCam.waterHeightAtCamera,
      waterlineFraction: splitCam.waterlineFraction,
      lensWetness: splitCam.lensWetness,
      time: 1.5,
    });
    expect(splitCam.waterlineFraction).toBeGreaterThan(0.47);
    expect(splitCam.waterlineFraction).toBeLessThan(0.53);
    expect(splitEnv.isSubmerged).toBe(false);
    expect(env.sky.visible).toBe(true);
    expect(env.lensAndWaterlinePass.enabled).toBe(true);
    expect(
      env.lensAndWaterlinePass.uniforms.uSplitActive.value,
    ).toBeGreaterThan(0.5);
    expect(scene.fog.density).toBeGreaterThan(baseGoldenFog);
    expect(scene.fog.density).toBeLessThan(0.01);

    // Refractive lens droplets when above water
    rig.setPreset('close-breach', { immediate: true });
    env.triggerLensSplash(0.65);
    const closeCam = rig.update({
      dt: 1 / 60,
      time: 2.0,
      getWaterHeight: () => 0.0,
    });
    const wetEnv = env.update({
      dt: 1 / 60,
      cameraPosition: rig.camera.position,
      waterHeightAtCamera: closeCam.waterHeightAtCamera,
      waterlineFraction: closeCam.waterlineFraction,
      time: 2.0,
    });
    expect(wetEnv.lensWetness).toBeGreaterThan(0.6);
    expect(env.lensAndWaterlinePass.enabled).toBe(true);
    expect(
      env.lensAndWaterlinePass.uniforms.uLensWetness.value,
    ).toBeGreaterThan(0.6);

    // Switch camera to underwater and verify full submergence fog + sky visibility
    rig.setPreset('underwater', { immediate: true });
    const camStep = rig.update({
      dt: 1 / 60,
      time: 3.0,
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

    env.resize(1600, 900, 2);
    expect(env.lensAndWaterlinePass.uniforms.uAspect.value).toBeCloseTo(
      1600 / 900,
      5,
    );

    env.dispose();
    rig.dispose();
  });

  it('integrates cameraRig and environment cleanly across a full 9s breach cycle cycling all 6 camera presets', () => {
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

    const presetSchedule = [
      'low-angle',
      'close-breach',
      'split',
      'aerial',
      'underwater',
      'orbit',
    ];

    let simTime = 0;
    let currentState = controller.getState();
    let sawBreakthroughShake = false;
    let sawSplashdownShake = false;
    let sawLensDroplets = false;

    const getWaterHeight = (x, z, queryTime = simTime) =>
      evaluateOceanHeight(x, z, queryTime, {
        dome: currentState?.waterDome,
        ripples: oceanSurface.ripples,
      });

    const dt = 0.05;
    for (let i = 0; i < 190; i += 1) {
      if (i % 32 === 0) {
        const nextPreset =
          presetSchedule[Math.floor(i / 32) % presetSchedule.length];
        rig.setPreset(nextPreset, { immediate: true });
      }

      simTime += dt;
      const { state, events } = controller.update(dt, simTime);
      currentState = state;

      for (const ev of events) {
        oceanSurface.pushRipple(ev);
        if (ev.type === 'breakthrough') {
          splashSystem.triggerBreakthrough(ev);
          rig.addShake(0.35);
          rig.addLensSplash(0.5);
          env.triggerLensSplash(0.5);
          sawBreakthroughShake = true;
        } else if (ev.type === 'splashdown') {
          splashSystem.triggerSplashdown(ev);
          rig.addShake(0.65);
          rig.addLensSplash(0.8);
          env.triggerLensSplash(0.8);
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
        waterlineFraction: camStatus.waterlineFraction,
        lensWetness: camStatus.lensWetness,
        time: simTime,
      });

      if (envState.lensWetness > 0.1) {
        sawLensDroplets = true;
      }

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
      expect(Number.isFinite(camStatus.fov)).toBe(true);
      expect(camStatus.waterlineFraction).toBeGreaterThanOrEqual(0);
      expect(camStatus.waterlineFraction).toBeLessThanOrEqual(1);
    }

    expect(sawBreakthroughShake).toBe(true);
    expect(sawSplashdownShake).toBe(true);
    expect(sawLensDroplets).toBe(true);
    expect(oceanSurface.ripples.length).toBeGreaterThan(0);

    env.dispose();
    rig.dispose();
  });
});
