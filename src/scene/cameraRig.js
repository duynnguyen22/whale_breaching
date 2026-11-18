import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const CAMERA_PRESETS = {
  'low-angle': {
    label: 'Low-Angle',
    position: { x: 18, y: 1.8, z: 21 },
    target: { x: 0, y: 1.1, z: 3.0 },
    fov: 35,
  },
  'close-breach': {
    label: 'Close Breach',
    position: { x: 11, y: 2.1, z: 13.5 },
    target: { x: 0, y: 1.0, z: 1.5 },
    fov: 56,
  },
  underwater: {
    label: 'Underwater',
    position: { x: 9.5, y: -6.0, z: 10.5 },
    target: { x: 0, y: 1.5, z: 2.0 },
    fov: 64,
  },
  orbit: {
    label: 'Free Orbit',
    position: { x: 26, y: 11, z: 28 },
    target: { x: 0, y: 2.2, z: 3.5 },
    fov: 48,
  },
  split: {
    label: 'Split Waterline',
    position: { x: 12.5, y: 0.0, z: 14.0 },
    target: { x: 0, y: 0.8, z: 2.2 },
    fov: 60,
  },
  aerial: {
    label: 'Aerial Drone',
    position: { x: 14.0, y: 34.0, z: 16.0 },
    target: { x: 0, y: 0.5, z: 4.5 },
    fov: 44,
  },
};

const DOME_HALF_SPAN = 0.55;
const MAX_BOAT_ROLL_RAD = THREE.MathUtils.degToRad(2.0);

function computeWaterlineFraction(relY) {
  if (relY >= DOME_HALF_SPAN) return 0;
  if (relY <= -DOME_HALF_SPAN) return 1;
  const norm = Math.abs(relY) / DOME_HALF_SPAN;
  return THREE.MathUtils.clamp(
    0.5 - 0.5 * Math.sign(relY) * Math.pow(norm, 1.35),
    0,
    1,
  );
}

export function createCameraRig({
  camera: providedCamera = null,
  domElement = null,
  initialPreset = 'low-angle',
  aspect = 16 / 9,
} = {}) {
  const initialFov = CAMERA_PRESETS[initialPreset]?.fov ?? 48;
  const camera =
    providedCamera ?? new THREE.PerspectiveCamera(initialFov, aspect, 0.25, 1600);

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
  let pendingSplitSurfaceSnap = false;
  let shakeIntensity = 0;
  let shakeClock = 0;
  let lensWetness = 0;
  let currentRoll = 0;

  controls.addEventListener('start', () => {
    orbitTransitionActive = false;
  });

  function removeLastShake() {
    if (appliedShakeOffset.lengthSq() > 0) {
      camera.position.sub(appliedShakeOffset);
      appliedShakeOffset.set(0, 0, 0);
    }
  }

  function resetCameraUp() {
    currentRoll = 0;
    camera.up.set(0, 1, 0);
  }

  function applyPresetState(presetKey, immediate = false) {
    removeLastShake();
    const preset = CAMERA_PRESETS[presetKey];
    controls.enabled = presetKey === 'orbit';

    if (immediate) {
      orbitTransitionActive = false;
      pendingSplitSurfaceSnap = presetKey === 'split';
      resetCameraUp();

      const targetFov = preset.fov ?? 48;
      if (camera.fov !== targetFov) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      }

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
      pendingSplitSurfaceSnap = false;
      resetCameraUp();
    } else {
      orbitTransitionActive = false;
      pendingSplitSurfaceSnap = false;
      if (
        presetKey === 'aerial' ||
        presetKey === 'underwater' ||
        presetKey === 'split'
      ) {
        resetCameraUp();
      }
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

  function addLensSplash(amount = 0.6) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    lensWetness = Math.min(1.0, lensWetness + amount);
  }

  function getLensWetness() {
    return lensWetness;
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

    // Smooth per-preset focal length (FOV) interpolation
    const targetFov = CAMERA_PRESETS[currentPreset]?.fov ?? 48;
    if (Math.abs(camera.fov - targetFov) > 1e-4) {
      const fovAlpha = 1 - Math.exp(-5.4 * safeDt);
      const nextFov = THREE.MathUtils.lerp(camera.fov, targetFov, fovAlpha);
      camera.fov = Math.abs(nextFov - targetFov) < 5e-4 ? targetFov : nextFov;
      camera.updateProjectionMatrix();
    }

    // Smooth ~4.5s lens wetness decay
    if (lensWetness > 0 && safeDt > 0) {
      lensWetness = Math.max(
        0,
        lensWetness * Math.exp(-0.85 * safeDt) - 0.008 * safeDt,
      );
      if (lensWetness < 1e-4) {
        lensWetness = 0;
      }
    }

    const whalePos = breachState?.position ?? { x: 0, y: 0, z: 0 };
    const domeHeight = breachState?.waterDome?.height ?? 0;

    if (currentPreset === 'orbit') {
      resetCameraUp();
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
      let posYOverrideAlpha = null;

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
      } else if (currentPreset === 'split') {
        const swayX = Math.sin(time * 0.38) * 0.14;
        const swayZ = Math.cos(time * 0.33) * 0.12;
        const swayY = Math.sin(time * 0.92) * 0.008;
        const splitX = preset.position.x + swayX;
        const splitZ = preset.position.z + swayZ;
        const waveAtSplit = sampleWater(splitX, splitZ);
        const targetSplitY = waveAtSplit + 0.04 + swayY;

        desiredPosition.set(splitX, targetSplitY, splitZ);

        const verticalTrack =
          whalePos.y < 0
            ? Math.max(-1.0, whalePos.y * 0.07)
            : whalePos.y * 0.35 + Math.max(0, domeHeight) * 0.22;
        desiredTarget.set(
          whalePos.x * 0.32,
          preset.target.y + verticalTrack,
          preset.target.z +
            THREE.MathUtils.clamp(whalePos.z - 1.0, -2.5, 8.5) * 0.34,
        );

        posDampRate = 5.6;
        targetDampRate = 6.2;

        if (pendingSplitSurfaceSnap) {
          basePosition.set(splitX, targetSplitY, splitZ);
          pendingSplitSurfaceSnap = false;
        } else if (Math.abs(basePosition.y - targetSplitY) < 0.45) {
          posYOverrideAlpha = 1 - Math.exp(-18.0 * safeDt);
        }
      } else if (currentPreset === 'aerial') {
        const baseDx = preset.position.x - preset.target.x;
        const baseDz = preset.position.z - preset.target.z;
        const baseRadius = Math.hypot(baseDx, baseDz);
        const baseTheta = Math.atan2(baseDx, baseDz);
        const theta = baseTheta + time * 0.085;
        const radius = baseRadius + Math.sin(time * 0.24) * 1.35;
        const airborneLift = Math.max(0, whalePos.y) * 0.18;
        const droneY =
          preset.position.y + Math.sin(time * 0.32) * 0.95 + airborneLift;

        desiredPosition.set(
          preset.target.x + Math.sin(theta) * radius,
          Math.max(waveAtPreset + 12.0, droneY),
          preset.target.z + Math.cos(theta) * radius,
        );

        const verticalTrack =
          whalePos.y < 0
            ? Math.max(-1.6, whalePos.y * 0.09)
            : whalePos.y * 0.28 + Math.max(0, domeHeight) * 0.24;
        desiredTarget.set(
          whalePos.x * 0.45,
          preset.target.y + verticalTrack,
          preset.target.z +
            THREE.MathUtils.clamp(whalePos.z - 2.0, -4.0, 8.5) * 0.42,
        );

        posDampRate = 3.4;
        targetDampRate = 4.5;
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
      if (posYOverrideAlpha !== null) {
        basePosition.x = THREE.MathUtils.lerp(
          basePosition.x,
          desiredPosition.x,
          posAlpha,
        );
        basePosition.y = THREE.MathUtils.lerp(
          basePosition.y,
          desiredPosition.y,
          posYOverrideAlpha,
        );
        basePosition.z = THREE.MathUtils.lerp(
          basePosition.z,
          desiredPosition.z,
          posAlpha,
        );
      } else {
        basePosition.lerp(desiredPosition, posAlpha);
      }
      baseTarget.lerp(desiredTarget, targetAlpha);

      // Wave-slope boat horizon roll (±2.0° max) in low-angle and close-breach
      if (
        currentPreset === 'low-angle' ||
        currentPreset === 'close-breach'
      ) {
        const waveDiff =
          sampleWater(basePosition.x + 1.2, basePosition.z) -
          sampleWater(basePosition.x - 1.2, basePosition.z);
        const localSlope = waveDiff / 2.4;
        const targetRoll = THREE.MathUtils.clamp(
          Math.atan(localSlope) * 0.55,
          -MAX_BOAT_ROLL_RAD,
          MAX_BOAT_ROLL_RAD,
        );
        const rollAlpha = 1 - Math.exp(-6.5 * safeDt);
        currentRoll = THREE.MathUtils.lerp(currentRoll, targetRoll, rollAlpha);
        if (Math.abs(currentRoll) < 1e-6) {
          resetCameraUp();
        } else {
          const fwdX = baseTarget.x - basePosition.x;
          const fwdZ = baseTarget.z - basePosition.z;
          const fwdLen = Math.hypot(fwdX, fwdZ);
          const rightX = fwdLen > 1e-5 ? -fwdZ / fwdLen : 1;
          const rightZ = fwdLen > 1e-5 ? fwdX / fwdLen : 0;
          const sinR = Math.sin(currentRoll);
          const cosR = Math.cos(currentRoll);
          camera.up.set(rightX * sinR, cosR, rightZ * sinR).normalize();
        }
      } else {
        resetCameraUp();
      }

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
        } else if (currentPreset === 'split') {
          appliedShakeOffset.y = THREE.MathUtils.clamp(
            appliedShakeOffset.y * 0.35,
            -0.12,
            0.12,
          );
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
    const relY = camera.position.y - waterHeightAtCamera;
    const waterlineFraction = computeWaterlineFraction(relY);
    const isSubmerged = camera.position.y < waterHeightAtCamera;

    return {
      preset: currentPreset,
      isSubmerged,
      waterlineFraction,
      waterHeightAtCamera,
      shakeIntensity,
      lensWetness,
      fov: camera.fov,
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
    addLensSplash,
    getLensWetness,
    resize,
    update,
    dispose,
  };
}
