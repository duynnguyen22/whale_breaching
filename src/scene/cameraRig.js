import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const CAMERA_PRESETS = {
  'low-angle': {
    label: 'Low-Angle',
    position: { x: 18, y: 1.8, z: 21 },
    target: { x: 0, y: 1.1, z: 3.0 },
  },
  'close-breach': {
    label: 'Close Breach',
    position: { x: 11, y: 2.1, z: 13.5 },
    target: { x: 0, y: 1.0, z: 1.5 },
  },
  underwater: {
    label: 'Underwater',
    position: { x: 9.5, y: -6.0, z: 10.5 },
    target: { x: 0, y: 1.5, z: 2.0 },
  },
  orbit: {
    label: 'Free Orbit',
    position: { x: 26, y: 11, z: 28 },
    target: { x: 0, y: 2.2, z: 3.5 },
  },
};

export function createCameraRig({
  camera: providedCamera = null,
  domElement = null,
  initialPreset = 'low-angle',
  aspect = 16 / 9,
} = {}) {
  const camera =
    providedCamera ?? new THREE.PerspectiveCamera(48, aspect, 0.25, 1600);

  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.minDistance = 5;
  controls.maxDistance = 140;
  controls.maxPolarAngle = Math.PI * 0.64;

  let currentPreset = CAMERA_PRESETS[initialPreset]
    ? initialPreset
    : 'low-angle';

  const basePosition = new THREE.Vector3();
  const baseTarget = new THREE.Vector3();
  const desiredPosition = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const appliedShakeOffset = new THREE.Vector3();

  let orbitTransitionActive = false;
  let shakeIntensity = 0;
  let shakeClock = 0;

  controls.addEventListener('start', () => {
    orbitTransitionActive = false;
  });

  function removeLastShake() {
    if (appliedShakeOffset.lengthSq() > 0) {
      camera.position.sub(appliedShakeOffset);
      appliedShakeOffset.set(0, 0, 0);
    }
  }

  function applyPresetState(presetKey, immediate = false) {
    removeLastShake();
    const preset = CAMERA_PRESETS[presetKey];
    controls.enabled = presetKey === 'orbit';
    if (immediate) {
      orbitTransitionActive = false;
      basePosition.set(preset.position.x, preset.position.y, preset.position.z);
      baseTarget.set(preset.target.x, preset.target.y, preset.target.z);
      camera.position.copy(basePosition);
      controls.target.copy(baseTarget);
      camera.lookAt(baseTarget);
      if (controls.enabled) {
        controls.update();
      }
    } else if (presetKey === 'orbit') {
      orbitTransitionActive = true;
    } else {
      orbitTransitionActive = false;
      basePosition.copy(camera.position);
      baseTarget.copy(controls.target);
    }
  }

  applyPresetState(currentPreset, true);

  function setPreset(presetName, { immediate = false } = {}) {
    if (!CAMERA_PRESETS[presetName]) return;
    currentPreset = presetName;
    applyPresetState(presetName, immediate);
  }

  function getPreset() {
    return currentPreset;
  }

  function getTarget() {
    return controls.target.clone();
  }

  function addShake(intensity = 0.35) {
    if (!Number.isFinite(intensity) || intensity <= 0) return;
    shakeIntensity = Math.min(1.5, shakeIntensity + intensity);
  }

  function getShakeIntensity() {
    return shakeIntensity;
  }

  function resize(width, height) {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    camera.aspect = safeWidth / safeHeight;
    camera.updateProjectionMatrix();
  }

  function update({
    dt = 1 / 60,
    time = 0,
    breachState = null,
    getWaterHeight = null,
  } = {}) {
    const safeDt = THREE.MathUtils.clamp(dt, 0, 0.1);
    removeLastShake();

    const sampleWater = (x, z) =>
      typeof getWaterHeight === 'function' ? getWaterHeight(x, z, time) : 0;

    const whalePos = breachState?.position ?? { x: 0, y: 0, z: 0 };
    const domeHeight = breachState?.waterDome?.height ?? 0;

    if (currentPreset === 'orbit') {
      if (orbitTransitionActive) {
        const preset = CAMERA_PRESETS.orbit;
        desiredPosition.set(
          preset.position.x,
          preset.position.y,
          preset.position.z,
        );
        desiredTarget.set(preset.target.x, preset.target.y, preset.target.z);
        const alpha = 1 - Math.exp(-5.0 * safeDt);
        camera.position.lerp(desiredPosition, alpha);
        controls.target.lerp(desiredTarget, alpha);
        if (
          camera.position.distanceToSquared(desiredPosition) < 0.02 &&
          controls.target.distanceToSquared(desiredTarget) < 0.01
        ) {
          orbitTransitionActive = false;
        }
      }
      controls.update();
      basePosition.copy(camera.position);
      baseTarget.copy(controls.target);
    } else {
      const preset = CAMERA_PRESETS[currentPreset];
      const waveAtPreset = sampleWater(preset.position.x, preset.position.z);
      let posDampRate = 4.6;
      let targetDampRate = 5.4;

      if (currentPreset === 'low-angle') {
        const bobX = Math.sin(time * 0.42) * 0.26;
        const bobZ = Math.cos(time * 0.36) * 0.22;
        const bobY = waveAtPreset * 0.65 + Math.sin(time * 1.05) * 0.09;
        desiredPosition.set(
          preset.position.x + bobX,
          Math.max(waveAtPreset + 1.0, preset.position.y + bobY),
          preset.position.z + bobZ,
        );

        const airborneRise = Math.max(0, whalePos.y);
        const domeLift = Math.max(0, domeHeight) * 0.22;
        const surfacePresence = THREE.MathUtils.clamp(
          (whalePos.y + 5) / 5,
          0,
          1,
        );
        desiredTarget.set(
          whalePos.x * 0.35,
          preset.target.y + airborneRise * 0.45 + domeLift,
          preset.target.z +
            THREE.MathUtils.clamp(whalePos.z - 2.0, -2.5, 8.5) *
              0.38 *
              surfacePresence,
        );
      } else if (currentPreset === 'close-breach') {
        const airborneRise = Math.max(0, whalePos.y);
        const emergenceLead = Math.max(0, breachState?.emergenceIntensity ?? 0);
        const pullback = airborneRise * 0.52 + emergenceLead * 1.35;
        const targetX = preset.position.x + pullback * 0.66;
        const targetZ = preset.position.z + pullback * 0.75;
        const waveAtDynamic = sampleWater(targetX, targetZ);
        const bobY = waveAtDynamic * 0.55 + Math.sin(time * 1.15 + 0.7) * 0.08;

        desiredPosition.set(
          targetX + Math.sin(time * 0.48) * 0.2,
          Math.max(
            waveAtDynamic + 1.05,
            preset.position.y + bobY + airborneRise * 0.08,
          ),
          targetZ + Math.cos(time * 0.41) * 0.18,
        );

        const domeLift = Math.max(0, domeHeight) * 0.42;
        const surfacePresence = THREE.MathUtils.clamp(
          (whalePos.y + 4) / 4,
          0,
          1,
        );
        desiredTarget.set(
          whalePos.x * 0.4,
          preset.target.y +
            airborneRise * 0.68 +
            emergenceLead * 1.15 +
            domeLift,
          preset.target.z +
            THREE.MathUtils.clamp(whalePos.z - 0.5, -2.0, 9.5) *
              0.46 *
              surfacePresence,
        );

        posDampRate = 6.2;
        targetDampRate = 7.4;
      } else {
        // underwater
        const swayX = Math.sin(time * 0.45) * 0.22;
        const swayY = Math.cos(time * 0.52) * 0.14;
        const swayZ = Math.sin(time * 0.37 + 1.1) * 0.2;
        desiredPosition.set(
          preset.position.x + swayX,
          Math.min(waveAtPreset - 1.5, preset.position.y + swayY),
          preset.position.z + swayZ,
        );

        const verticalTrack =
          whalePos.y < 0
            ? Math.max(-2.6, whalePos.y * 0.14)
            : Math.min(2.2, whalePos.y * 0.22);
        desiredTarget.set(
          whalePos.x * 0.25,
          preset.target.y + verticalTrack,
          preset.target.z + THREE.MathUtils.clamp(whalePos.z, -4, 8) * 0.22,
        );
      }

      const posAlpha = 1 - Math.exp(-posDampRate * safeDt);
      const targetAlpha = 1 - Math.exp(-targetDampRate * safeDt);
      basePosition.lerp(desiredPosition, posAlpha);
      baseTarget.lerp(desiredTarget, targetAlpha);

      camera.position.copy(basePosition);
      controls.target.copy(baseTarget);
      camera.lookAt(baseTarget);
    }

    if (shakeIntensity > 0) {
      shakeClock += safeDt;
      shakeIntensity *= Math.exp(-4.2 * safeDt);
      if (shakeIntensity < 1e-4) {
        shakeIntensity = 0;
      } else {
        const amp = shakeIntensity * 0.36;
        const sx =
          (Math.sin(shakeClock * 31.7 + 0.4) * 0.65 +
            Math.cos(shakeClock * 19.3 + 1.7) * 0.35) *
          amp;
        const sy =
          (Math.cos(shakeClock * 27.1 + 0.9) * 0.72 +
            Math.sin(shakeClock * 41.9 + 2.3) * 0.28) *
          amp;
        const sz = Math.sin(shakeClock * 23.4 + 1.2) * 0.45 * amp;
        appliedShakeOffset.set(sx, sy, sz);

        if (currentPreset === 'low-angle' || currentPreset === 'close-breach') {
          const surfaceY = sampleWater(
            camera.position.x + sx,
            camera.position.z + sz,
          );
          const minSafeY = surfaceY + 0.65;
          if (camera.position.y + appliedShakeOffset.y < minSafeY) {
            appliedShakeOffset.y = minSafeY - camera.position.y;
          }
        }

        camera.position.add(appliedShakeOffset);
        if (currentPreset !== 'orbit') {
          camera.lookAt(baseTarget);
        }
      }
    }

    const waterHeightAtCamera = sampleWater(
      camera.position.x,
      camera.position.z,
    );
    const isSubmerged = camera.position.y < waterHeightAtCamera;

    return {
      preset: currentPreset,
      isSubmerged,
      waterHeightAtCamera,
      shakeIntensity,
    };
  }

  function dispose() {
    removeLastShake();
    if (controls.domElement !== null) {
      controls.dispose();
    }
  }

  return {
    camera,
    controls,
    presets: CAMERA_PRESETS,
    setPreset,
    getPreset,
    getTarget,
    addShake,
    getShakeIntensity,
    resize,
    update,
    dispose,
  };
}
