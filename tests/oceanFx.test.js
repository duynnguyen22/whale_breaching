import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createSplashSystem } from '../src/effects/splashSystem.js';
import {
  createPolarOceanGeometry,
  createOceanSurface,
  evaluateShaderOceanHeightFromUniforms,
  evaluateSubsurfaceWhaleOptics,
} from '../src/ocean/oceanSurface.js';
import { WAVE_COMPONENTS, evaluateOceanHeight } from '../src/math/oceanMath.js';
import {
  createBreachController,
  evaluateBreachState,
} from '../src/animation/breachTimeline.js';
import { createWhaleRig } from '../src/whale/whaleMesh.js';

describe('splashSystem', () => {
  it('creates splash group in Node without DOM and exposes particle pool with custom shader attributes', () => {
    expect(typeof document).toBe('undefined');

    const splash = createSplashSystem();
    expect(splash).toBeDefined();
    expect(splash.group).toBeInstanceOf(THREE.Group);
    expect(typeof splash.triggerBreakthrough).toBe('function');
    expect(typeof splash.triggerSplashdown).toBe('function');
    expect(typeof splash.update).toBe('function');

    const pointsObjects = [];
    splash.group.traverse((child) => {
      if (child.isPoints) pointsObjects.push(child);
    });
    expect(pointsObjects.length).toBeGreaterThanOrEqual(2); // main spray pool + underwater bubbles

    const sprayPoints = pointsObjects.find(
      (pts) => pts.geometry.getAttribute('position').count >= 3500
    );
    expect(sprayPoints).toBeDefined();

    const posAttr = sprayPoints.geometry.getAttribute('position');
    const sizeAttr = sprayPoints.geometry.getAttribute('aSize');
    const alphaAttr = sprayPoints.geometry.getAttribute('aAlpha');
    const seedAttr = sprayPoints.geometry.getAttribute('aSeed');

    expect(posAttr.count).toBeGreaterThanOrEqual(3800);
    expect(posAttr.count).toBeLessThanOrEqual(4500);
    expect(sizeAttr).toBeDefined();
    expect(sizeAttr.count).toBe(posAttr.count);
    expect(alphaAttr).toBeDefined();
    expect(alphaAttr.count).toBe(posAttr.count);
    expect(seedAttr).toBeDefined();
    expect(seedAttr.count).toBe(posAttr.count);

    expect(sprayPoints.material).toBeInstanceOf(THREE.ShaderMaterial);
    const spriteMap = sprayPoints.material.uniforms.uSprite.value;
    expect(spriteMap).toBeInstanceOf(THREE.DataTexture);

    // Underwater volumetric sunbeam shafts exist beneath y = 0
    const sunbeams = splash.group.getObjectByName('underwaterSunbeams');
    expect(sunbeams).toBeDefined();
    expect(sunbeams.children.length).toBeGreaterThanOrEqual(3);
    for (const shaft of sunbeams.children) {
      shaft.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(shaft);
      expect(box.max.y).toBeLessThanOrEqual(0.05);
      expect(box.min.y).toBeLessThan(-8);
    }
  });

  it('spawns pre-breach surface boil particles when waterDome.height > 0.25', () => {
    const splash = createSplashSystem();
    const sprayPoints = splash.group.getObjectByName('sprayParticles');
    const alphaAttr = sprayPoints.geometry.getAttribute('aAlpha');
    const posAttr = sprayPoints.geometry.getAttribute('position');

    const countActive = () => {
      let active = 0;
      for (let i = 0; i < alphaAttr.count; i++) {
        if (alphaAttr.getX(i) > 0.01) active++;
      }
      return active;
    };

    // Quiet dome (height <= 0.25) should not boil
    splash.update({
      dt: 1 / 60,
      time: 1.0,
      breachState: {
        waterDome: { x: 0, z: 0, radius: 4.5, height: 0.1 },
        emergenceIntensity: 0,
        splashdownIntensity: 0,
      },
      whaleAnchors: { spineStations: [] },
      getWaterHeight: () => 0.4,
    });
    expect(countActive()).toBe(0);

    // Rising water dome (height > 0.25) boils at the water surface
    splash.update({
      dt: 1 / 30,
      time: 1.05,
      breachState: {
        waterDome: { x: 1.5, z: -0.5, radius: 4.6, height: 1.35 },
        emergenceIntensity: 0,
        splashdownIntensity: 0,
      },
      whaleAnchors: { spineStations: [] },
      getWaterHeight: () => 0.4,
    });

    expect(countActive()).toBeGreaterThan(8);
    for (let i = 0; i < alphaAttr.count; i++) {
      if (alphaAttr.getX(i) > 0.01) {
        expect(posAttr.getY(i)).toBeGreaterThanOrEqual(0.39);
      }
    }
  });

  it('erupts water-face curtain spray from spineStations crossing waterY scaled by station.radius', () => {
    const runForStationRadius = (radius) => {
      const splash = createSplashSystem();
      const sprayPoints = splash.group.getObjectByName('sprayParticles');
      const alphaAttr = sprayPoints.geometry.getAttribute('aAlpha');
      const posAttr = sprayPoints.geometry.getAttribute('position');

      splash.update({
        dt: 0.05,
        time: 2.2,
        breachState: {
          waterDome: { x: 0, z: 0, radius: 4.5, height: 0 },
          emergenceIntensity: 0.92,
          splashdownIntensity: 0,
          velocity: { x: 0, y: 11.5, z: 3.0 },
        },
        whaleAnchors: {
          spineStations: [{ x: 2.0, y: 0.55, z: -1.0, radius }],
        },
        getWaterHeight: () => 0.5,
      });

      // Advance slightly so upward velocity lifts curtain above waterY
      for (let step = 0; step < 5; step++) {
        splash.update({
          dt: 0.04,
          time: 2.24 + step * 0.04,
          breachState: {
            waterDome: { x: 0, z: 0, radius: 4.5, height: 0 },
            emergenceIntensity: 0,
            splashdownIntensity: 0,
          },
          whaleAnchors: { spineStations: [] },
          getWaterHeight: () => 0.5,
        });
      }

      let activeCount = 0;
      let maxY = -Infinity;
      let radialSum = 0;
      for (let i = 0; i < alphaAttr.count; i++) {
        if (alphaAttr.getX(i) > 0.01) {
          activeCount++;
          const x = posAttr.getX(i);
          const y = posAttr.getY(i);
          const z = posAttr.getZ(i);
          if (y > maxY) maxY = y;
          radialSum += Math.hypot(x - 2.0, z - -1.0);
        }
      }

      return {
        activeCount,
        maxY,
        meanRadialOffset: activeCount > 0 ? radialSum / activeCount : 0,
      };
    };

    const narrow = runForStationRadius(0.35);
    const wideChest = runForStationRadius(1.65);

    expect(narrow.activeCount).toBeGreaterThan(6);
    expect(wideChest.activeCount).toBeGreaterThan(narrow.activeCount);
    expect(wideChest.maxY).toBeGreaterThan(1.4); // visibly erupts upward above waterY = 0.5
    expect(wideChest.meanRadialOffset).toBeGreaterThan(narrow.meanRadialOffset);
  });

  it('streams airborne shedding droplets from flippers, chin, and flukes above waterY + 0.4 and removes them on hitting waterY', () => {
    const splash = createSplashSystem();
    const sprayPoints = splash.group.getObjectByName('sprayParticles');
    const alphaAttr = sprayPoints.geometry.getAttribute('aAlpha');
    const posAttr = sprayPoints.geometry.getAttribute('position');

    const getActiveYs = () => {
      const ys = [];
      for (let i = 0; i < alphaAttr.count; i++) {
        if (alphaAttr.getX(i) > 0.01) {
          ys.push(posAttr.getY(i));
        }
      }
      return ys;
    };

    // Anchors below waterY + 0.4 should NOT shed airborne droplets
    splash.update({
      dt: 0.05,
      time: 4.0,
      breachState: {
        bodyShedIntensity: 0.9,
        emergenceIntensity: 0,
        splashdownIntensity: 0,
        waterDome: { x: 0, z: 0, radius: 4, height: 0 },
      },
      whaleAnchors: {
        flipperL: { x: -4.2, y: 0.45, z: 1.0 },
        flipperR: { x: 4.2, y: 0.45, z: 1.0 },
        chin: { x: 0, y: 0.5, z: 5.0 },
        flukeL: { x: -2.0, y: 0.3, z: -6.0 },
        flukeR: { x: 2.0, y: 0.3, z: -6.0 },
        spineStations: [],
      },
      getWaterHeight: () => 0.2,
    });
    expect(getActiveYs().length).toBe(0);

    // Anchors high in the air (y = 3.2 > waterY + 0.4) stream droplets
    splash.update({
      dt: 0.05,
      time: 4.05,
      breachState: {
        bodyShedIntensity: 0.95,
        emergenceIntensity: 0,
        splashdownIntensity: 0,
        velocity: { x: 0, y: 0.5, z: 4.0 },
        waterDome: { x: 0, z: 0, radius: 4, height: 0 },
      },
      whaleAnchors: {
        flipperL: { x: -4.2, y: 3.2, z: 1.0 },
        flipperR: { x: 4.2, y: 3.2, z: 1.0 },
        chin: { x: 0, y: 3.5, z: 5.0 },
        flukeL: { x: -2.0, y: 2.8, z: -6.0 },
        flukeR: { x: 2.0, y: 2.8, z: -6.0 },
        spineStations: [],
      },
      getWaterHeight: () => 0.2,
    });

    const initialYs = getActiveYs();
    expect(initialYs.length).toBeGreaterThan(12);
    const initialMeanY = initialYs.reduce((a, b) => a + b, 0) / initialYs.length;

    // Step forward without new spawns: droplets fall under gravity (-9.81 m/s^2)
    for (let step = 0; step < 6; step++) {
      splash.update({
        dt: 0.05,
        time: 4.1 + step * 0.05,
        breachState: {
          bodyShedIntensity: 0,
          emergenceIntensity: 0,
          splashdownIntensity: 0,
          waterDome: { x: 0, z: 0, radius: 4, height: 0 },
        },
        whaleAnchors: { spineStations: [] },
        getWaterHeight: () => 0.2,
      });
    }

    const fallingYs = getActiveYs();
    expect(fallingYs.length).toBeGreaterThan(0);
    const fallingMeanY = fallingYs.reduce((a, b) => a + b, 0) / fallingYs.length;
    expect(fallingMeanY).toBeLessThan(initialMeanY - 0.25);

    // Every active airborne droplet is strictly above waterY = 0.2; once simulated long enough to hit water, all vanish cleanly
    for (const y of fallingYs) {
      expect(y).toBeGreaterThan(0.2);
    }

    for (let step = 0; step < 30; step++) {
      splash.update({
        dt: 0.05,
        time: 4.45 + step * 0.05,
        breachState: {
          bodyShedIntensity: 0,
          emergenceIntensity: 0,
          splashdownIntensity: 0,
          waterDome: { x: 0, z: 0, radius: 4, height: 0 },
        },
        whaleAnchors: { spineStations: [] },
        getWaterHeight: () => 0.2,
      });
      for (const y of getActiveYs()) {
        expect(y).toBeGreaterThan(0.2);
      }
    }
    expect(getActiveYs().length).toBe(0);
  });

  it('erupts a ~12m splashdown plume & crown, expanding ~6s wave-hugging foam rings, and rising underwater bubbles', () => {
    const splash = createSplashSystem();
    const sprayPoints = splash.group.getObjectByName('sprayParticles');
    const sprayAlpha = sprayPoints.geometry.getAttribute('aAlpha');
    const sprayPos = sprayPoints.geometry.getAttribute('position');

    const bubblePoints = splash.group.getObjectByName('cavitationBubbles');
    const bubbleAlpha = bubblePoints.geometry.getAttribute('aAlpha');
    const bubblePos = bubblePoints.geometry.getAttribute('position');

    const waveFn = (x, z) => 0.35 * Math.sin(x * 0.25) + 0.2 * Math.cos(z * 0.2);

    // 1. Trigger breakthrough and splashdown events
    splash.triggerBreakthrough({ x: 0, z: 0, startTime: 2.1, strength: 1.2 });
    splash.triggerSplashdown({ x: 0, z: 8.5, startTime: 6.0, strength: 1.75 });

    let peakPlumeHeightAboveWater = 0;
    const baseWaterAtSplash = waveFn(0, 8.5);

    for (let step = 0; step < 36; step++) {
      const t = 6.0 + (step + 1) * 0.05;
      splash.update({
        dt: 0.05,
        time: t,
        breachState: {
          emergenceIntensity: 0,
          splashdownIntensity: 0,
          bodyShedIntensity: 0,
          waterDome: { x: 0, z: 0, radius: 4, height: 0 },
        },
        whaleAnchors: {
          flukeL: { x: -1.8, y: -4.5, z: 6.0 },
          flukeR: { x: 1.8, y: -4.5, z: 6.0 },
          spineStations: [{ x: 0, y: -3.8, z: 7.5, radius: 1.1 }],
        },
        getWaterHeight: waveFn,
      });

      for (let i = 0; i < sprayAlpha.count; i++) {
        if (sprayAlpha.getX(i) > 0.01) {
          const hAbove = sprayPos.getY(i) - baseWaterAtSplash;
          if (hAbove > peakPlumeHeightAboveWater) {
            peakPlumeHeightAboveWater = hAbove;
          }
        }
      }
    }

    // Plume reaches ~12m height above water surface
    expect(peakPlumeHeightAboveWater).toBeGreaterThanOrEqual(10.5);
    expect(peakPlumeHeightAboveWater).toBeLessThanOrEqual(15.5);

    // 2. Underwater cavitation bubbles spawned and rose upward
    const activeBubbleYs = [];
    for (let i = 0; i < bubbleAlpha.count; i++) {
      if (bubbleAlpha.getX(i) > 0.01) {
        activeBubbleYs.push(bubblePos.getY(i));
      }
    }
    expect(activeBubbleYs.length).toBeGreaterThan(15);
    expect(Math.max(...activeBubbleYs)).toBeGreaterThan(-3.7); // rose above spawn depth -3.8 / -4.5

    // 3. Whitewater foam ring meshes hug waterY + 0.06, expand over time, and fade after ~6s
    const foamGroup = splash.group.getObjectByName('foamRings');
    expect(foamGroup).toBeDefined();
    const visibleFoamAt1_8s = foamGroup.children.filter((m) => m.visible);
    expect(visibleFoamAt1_8s.length).toBeGreaterThanOrEqual(2);

    const splashFoam = visibleFoamAt1_8s[visibleFoamAt1_8s.length - 1];
    const radiusEarly = splashFoam.userData.currentRadius;
    expect(radiusEarly).toBeGreaterThan(2.5);

    // Verify foam mesh vertices hug getWaterHeight(worldX, worldZ) + 0.06
    const foamPos = splashFoam.geometry.getAttribute('position');
    for (let v = 0; v < foamPos.count; v += 9) {
      const wx = splashFoam.position.x + foamPos.getX(v);
      const wy = splashFoam.position.y + foamPos.getY(v);
      const wz = splashFoam.position.z + foamPos.getZ(v);
      expect(wy).toBeCloseTo(waveFn(wx, wz) + 0.06, 2);
    }

    // Advance another 1.5s -> foam expands further and remains visible (< 6s total age)
    for (let step = 0; step < 30; step++) {
      splash.update({
        dt: 0.05,
        time: 7.85 + step * 0.05,
        getWaterHeight: waveFn,
      });
    }
    expect(splashFoam.visible).toBe(true);
    expect(splashFoam.userData.currentRadius).toBeGreaterThan(radiusEarly);

    // Advance past ~6.2s total age -> foam fades out cleanly
    for (let step = 0; step < 65; step++) {
      splash.update({
        dt: 0.05,
        time: 9.35 + step * 0.05,
        getWaterHeight: waveFn,
      });
    }
    expect(splashFoam.visible).toBe(false);
  });

  it('uses dense 24x64 FrontSide Cartesian foam rings with strong polygonOffset so underwater views have zero Z-fighting or 2pi seam', () => {
    const splash = createSplashSystem();
    splash.triggerSplashdown({ x: 0, z: 4, startTime: 1.0, strength: 1.75 });
    splash.update({ dt: 0.05, time: 1.1, getWaterHeight: () => 0 });

    const foamGroup = splash.group.getObjectByName('foamRings');
    const activeFoam = foamGroup.children.find((m) => m.visible);
    expect(activeFoam).toBeDefined();

    const pos = activeFoam.geometry.getAttribute('position');
    expect(pos.count).toBe(1 + 24 * 64);
    expect(activeFoam.material.side).toBe(THREE.FrontSide);
    expect(activeFoam.material.polygonOffset).toBe(true);
    expect(activeFoam.material.polygonOffsetFactor).toBeLessThanOrEqual(-6);
    expect(activeFoam.material.polygonOffsetUnits).toBeLessThanOrEqual(-6);
    expect(activeFoam.material.fragmentShader).toContain('vUnitPos');
    expect(activeFoam.material.fragmentShader).not.toContain('vPolarUv.y * 6.28');

    activeFoam.geometry.computeVertexNormals();
    const norm = activeFoam.geometry.getAttribute('normal');
    for (let i = 0; i < norm.count; i += 17) {
      expect(norm.getY(i)).toBeGreaterThan(0.999);
    }
  });

  it('erupts early rostrum breakthrough curtain spray around progress 0.20 while waterDome.height > 0.25 and upward velocity > 4.0', () => {
    const splash = createSplashSystem();
    const whale = createWhaleRig();
    const state = evaluateBreachState(0.2);
    expect(state.emergenceIntensity).toBe(0);
    expect(state.waterDome.height).toBeGreaterThan(0.25);
    expect(state.velocity.y).toBeGreaterThan(4.0);

    whale.update(state, 1.8);
    const anchors = whale.getWorldAnchors();
    const getWaterHeight = (x, z) => evaluateOceanHeight(x, z, 1.8, { dome: state.waterDome });

    splash.update({
      dt: 0.05,
      time: 1.8,
      breachState: state,
      whaleAnchors: anchors,
      getWaterHeight,
    });

    // Step forward briefly so curtain spray rises above the dome surface
    for (let step = 0; step < 4; step++) {
      splash.update({
        dt: 0.04,
        time: 1.84 + step * 0.04,
        breachState: {
          waterDome: { x: 0, z: 0, radius: 4.8, height: 0 },
          emergenceIntensity: 0,
          splashdownIntensity: 0,
          velocity: { x: 0, y: 0, z: 0 },
        },
        whaleAnchors: { spineStations: [] },
        getWaterHeight,
      });
    }

    const sprayPoints = splash.group.getObjectByName('sprayParticles');
    const alphaAttr = sprayPoints.geometry.getAttribute('aAlpha');
    const posAttr = sprayPoints.geometry.getAttribute('position');

    let activeAboveDome = 0;
    const domeTop = getWaterHeight(0, 0);
    for (let i = 0; i < alphaAttr.count; i++) {
      if (alphaAttr.getX(i) > 0.02 && posAttr.getY(i) > domeTop + 0.35) {
        activeAboveDome++;
      }
    }
    expect(activeAboveDome).toBeGreaterThan(20);
  });

  it('exposes velocity-stretched liquid spray attribute (aVelocity) updated across spawn, ballistic integration, and deactivation', () => {
    const splash = createSplashSystem();
    const sprayPoints = splash.group.getObjectByName('sprayParticles');
    const posAttr = sprayPoints.geometry.getAttribute('position');
    const alphaAttr = sprayPoints.geometry.getAttribute('aAlpha');
    const velAttr = sprayPoints.geometry.getAttribute('aVelocity');

    expect(velAttr).toBeDefined();
    expect(velAttr.itemSize).toBe(3);
    expect(velAttr.count).toBe(posAttr.count);

    // Shader projects aVelocity into view/screen space to stretch fast spray into liquid ligaments
    expect(sprayPoints.material.vertexShader).toContain('attribute vec3 aVelocity');
    expect(sprayPoints.material.vertexShader).toContain('vScreenVelDir');
    expect(sprayPoints.material.vertexShader).toContain('vStretch');
    expect(sprayPoints.material.fragmentShader).toContain('vScreenVelDir');
    expect(sprayPoints.material.fragmentShader).toContain('vStretch');

    splash.triggerSplashdown({ x: 0, z: 0, startTime: 1.0, strength: 1.75 });

    let fastCount = 0;
    let initialMeanVy = 0;
    let activeCount = 0;
    for (let i = 0; i < alphaAttr.count; i++) {
      if (alphaAttr.getX(i) > 0.01) {
        activeCount++;
        const vx = velAttr.getX(i);
        const vy = velAttr.getY(i);
        const vz = velAttr.getZ(i);
        initialMeanVy += vy;
        if (Math.hypot(vx, vy, vz) > 9.0) fastCount++;
      }
    }
    expect(activeCount).toBeGreaterThan(500);
    expect(fastCount).toBeGreaterThan(250);
    initialMeanVy /= activeCount;

    // Step forward 0.4s: gravity & drag update aVelocity in-place
    for (let step = 0; step < 8; step++) {
      splash.update({ dt: 0.05, time: 1.05 + step * 0.05, getWaterHeight: () => 0 });
    }

    let laterMeanVy = 0;
    let laterActive = 0;
    for (let i = 0; i < alphaAttr.count; i++) {
      if (alphaAttr.getX(i) > 0.01) {
        laterActive++;
        laterMeanVy += velAttr.getY(i);
      } else {
        expect(velAttr.getX(i)).toBe(0);
        expect(velAttr.getY(i)).toBe(0);
        expect(velAttr.getZ(i)).toBe(0);
      }
    }
    expect(laterActive).toBeGreaterThan(200);
    laterMeanVy /= laterActive;
    expect(laterMeanVy).toBeLessThan(initialMeanVy - 2.0);
  });

  it('streams continuous full-wing water curtains along 4.6m pectoral wing & 4.5m fluke trailing arrays while suppressing submerged stations', () => {
    const splash = createSplashSystem();
    const sprayPoints = splash.group.getObjectByName('sprayParticles');
    const alphaAttr = sprayPoints.geometry.getAttribute('aAlpha');
    const posAttr = sprayPoints.geometry.getAttribute('position');

    // Left wing airborne (y = 3.8..5.0), Right wing outer half dipped below water (y = -0.5), Flukes airborne
    const flipperTrailingL = Array.from({ length: 6 }, (_, i) => ({
      x: -1.1 - (i / 5) * 3.7,
      y: 3.8 + (i / 5) * 1.2,
      z: 1.4 - (i / 5) * 0.6,
      radius: 0.48 - i * 0.04,
    }));
    const flipperTrailingR = Array.from({ length: 6 }, (_, i) => ({
      x: 1.1 + (i / 5) * 3.7,
      y: i < 2 ? 2.2 : -0.6, // outer stations 2..5 submerged below waterY = 0
      z: 1.4 - (i / 5) * 0.6,
      radius: 0.48 - i * 0.04,
    }));
    const flukeTrailing = Array.from({ length: 5 }, (_, i) => ({
      x: -2.25 + (i / 4) * 4.5,
      y: 3.2,
      z: -6.8,
      radius: 0.35,
    }));

    for (let step = 0; step < 4; step++) {
      splash.update({
        dt: 0.05,
        time: 3.0 + step * 0.05,
        breachState: {
          bodyShedIntensity: 0.95,
          emergenceIntensity: 0,
          splashdownIntensity: 0,
          velocity: { x: 0, y: 1.2, z: 4.5 },
          waterDome: { x: 0, z: 0, radius: 4.8, height: 0 },
        },
        whaleAnchors: {
          chin: { x: 0, y: 4.2, z: 4.8 },
          flipperTrailingL,
          flipperTrailingR,
          flukeTrailing,
          spineStations: [],
        },
        getWaterHeight: () => 0,
      });
    }

    let leftInner = 0;
    let leftMid = 0;
    let leftOuter = 0;
    let rightSubmergedOuter = 0;
    let flukeSpanCount = 0;

    for (let i = 0; i < alphaAttr.count; i++) {
      if (alphaAttr.getX(i) > 0.01) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        expect(y).toBeGreaterThan(0);

        if (z > 0.2 && z < 2.2) {
          if (x < -1.0 && x >= -2.4) leftInner++;
          if (x < -2.4 && x >= -3.6) leftMid++;
          if (x < -3.6) leftOuter++;
          if (x > 3.2) rightSubmergedOuter++;
        }
        if (z < -5.5) flukeSpanCount++;
      }
    }

    // Continuous curtain populates inner, mid, AND outer span of the 4.6m airborne wing
    expect(leftInner).toBeGreaterThan(3);
    expect(leftMid).toBeGreaterThan(3);
    expect(leftOuter).toBeGreaterThan(3);
    expect(flukeSpanCount).toBeGreaterThan(8);
    // Submerged right outer wing stations do not emit airborne shedding
    expect(rightSubmergedOuter).toBe(0);
  });

  it('spawns an elongated 15m body-slam splashdown trench with lateral curtains, cavitation cylinder, and staggered foam rings when spineStations are provided', () => {
    const splashPoint = createSplashSystem();
    splashPoint.triggerSplashdown({ x: 0, z: 9.0, startTime: 5.0, strength: 1.75 });

    const splashTrench = createSplashSystem();
    const spineStations = Array.from({ length: 8 }, (_, i) => ({
      x: 0.2,
      y: -0.2,
      z: 2.0 + (i / 7) * 14.6, // ~14.6m longitudinal slam from z=2.0 to z=16.6
      radius: [0.42, 0.75, 1.25, 1.58, 1.52, 1.22, 0.88, 0.52][i],
    }));
    splashTrench.triggerSplashdown({
      x: 0.2,
      z: 9.3,
      startTime: 5.0,
      strength: 1.75,
      spineStations,
    });

    const measureZSpan = (splashInstance, objName) => {
      const pts = splashInstance.group.getObjectByName(objName);
      const alpha = pts.geometry.getAttribute('aAlpha');
      const pos = pts.geometry.getAttribute('position');
      const vel = pts.geometry.getAttribute('aVelocity');
      let minZ = Infinity;
      let maxZ = -Infinity;
      let portLateral = 0;
      let starboardLateral = 0;
      for (let i = 0; i < alpha.count; i++) {
        if (alpha.getX(i) > 0.01) {
          const z = pos.getZ(i);
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
          if (vel && vel.getX(i) < -2.5) portLateral++;
          if (vel && vel.getX(i) > 2.5) starboardLateral++;
        }
      }
      return { spanZ: maxZ - minZ, portLateral, starboardLateral };
    };

    const pointSpray = measureZSpan(splashPoint, 'sprayParticles');
    const trenchSpray = measureZSpan(splashTrench, 'sprayParticles');
    const trenchBubbles = measureZSpan(splashTrench, 'cavitationBubbles');

    expect(trenchSpray.spanZ).toBeGreaterThan(13.5);
    expect(trenchSpray.spanZ).toBeGreaterThan(pointSpray.spanZ + 6.0);
    expect(trenchSpray.portLateral).toBeGreaterThan(80);
    expect(trenchSpray.starboardLateral).toBeGreaterThan(80);
    expect(trenchBubbles.spanZ).toBeGreaterThan(12.5);

    // Staggered wave-hugging foam patches span the 15m impact scar
    splashTrench.update({ dt: 0.05, time: 5.1, getWaterHeight: () => 0.15 });
    const foamGroup = splashTrench.group.getObjectByName('foamRings');
    const activeFoams = foamGroup.children.filter((m) => m.visible);
    expect(activeFoams.length).toBeGreaterThanOrEqual(3);
    const foamZs = activeFoams.map((m) => m.position.z);
    expect(Math.max(...foamZs) - Math.min(...foamZs)).toBeGreaterThan(8.5);
  });

  it('shoots a backlit V-shaped blowhole mist spout (< 3000 pool) via triggerSpout and continuous blowIntensity > 0.02 above waterY', () => {
    const splash = createSplashSystem();
    expect(typeof splash.triggerSpout).toBe('function');

    const spoutPoints = splash.group.getObjectByName('blowholeSpout');
    expect(spoutPoints).toBeDefined();
    expect(spoutPoints.isPoints).toBe(true);

    const spoutPos = spoutPoints.geometry.getAttribute('position');
    const spoutAlpha = spoutPoints.geometry.getAttribute('aAlpha');
    const spoutSize = spoutPoints.geometry.getAttribute('aSize');
    expect(spoutPos.count).toBeGreaterThanOrEqual(400);
    expect(spoutPos.count).toBeLessThan(3000);

    const countActiveSpout = () => {
      let n = 0;
      for (let i = 0; i < spoutAlpha.count; i++) {
        if (spoutAlpha.getX(i) > 0.01) n++;
      }
      return n;
    };

    // 1. Submerged blowhole (y <= waterY) must NOT emit mist spout even when blowIntensity is high
    splash.update({
      dt: 0.05,
      time: 1.0,
      breachState: { blowIntensity: 0.95 },
      whaleAnchors: {
        blowhole: { x: 0, y: -0.25, z: 3.5 },
        upDir: { x: 0, y: 1, z: 0 },
        spineStations: [],
      },
      getWaterHeight: () => 0.0,
    });
    expect(countActiveSpout()).toBe(0);

    // 2. Surfaced blowhole (y > waterY) with blowIntensity > 0.02 + triggerSpout shoots tall V-plume that expands & drifts with wind
    splash.triggerSpout({
      position: { x: 0, y: 0.65, z: 3.5 },
      upDir: { x: 0, y: 1, z: 0 },
      intensity: 1.0,
    });

    for (let step = 0; step < 5; step++) {
      splash.update({
        dt: 0.05,
        time: 1.05 + step * 0.05,
        breachState: { blowIntensity: 0.88 },
        whaleAnchors: {
          blowhole: { x: 0, y: 0.65, z: 3.5 },
          upDir: { x: 0, y: 1, z: 0 },
          flipperL: { x: -4.2, y: -1.2, z: 1.0 },
          flipperR: { x: 4.2, y: -1.2, z: 1.0 },
          spineStations: [],
        },
        getWaterHeight: () => 0.0,
        sunDirection: new THREE.Vector3(0.4, 0.3, -0.86).normalize(),
      });
    }

    let earlyMeanX = 0;
    let earlyMeanSize = 0;
    let earlyCount = 0;
    let negLobe = 0;
    let posLobe = 0;
    for (let i = 0; i < spoutAlpha.count; i++) {
      if (spoutAlpha.getX(i) > 0.01) {
        earlyCount++;
        const x = spoutPos.getX(i);
        earlyMeanX += x;
        earlyMeanSize += spoutSize.getX(i);
        if (x < -0.05) negLobe++;
        if (x > 0.05) posLobe++;
      }
    }
    expect(earlyCount).toBeGreaterThan(80);
    expect(negLobe).toBeGreaterThan(15);
    expect(posLobe).toBeGreaterThan(15);
    earlyMeanX /= earlyCount;
    earlyMeanSize /= earlyCount;

    // Advance 1.1s without new emission: plume rises > 3.5m, expands significantly, and drifts downwind (+X)
    let peakSpoutY = 0;
    for (let step = 0; step < 22; step++) {
      splash.update({
        dt: 0.05,
        time: 1.35 + step * 0.05,
        breachState: { blowIntensity: 0 },
        whaleAnchors: { spineStations: [] },
        getWaterHeight: () => 0.0,
      });
      for (let i = 0; i < spoutAlpha.count; i++) {
        if (spoutAlpha.getX(i) > 0.01 && spoutPos.getY(i) > peakSpoutY) {
          peakSpoutY = spoutPos.getY(i);
        }
      }
    }

    let lateMeanX = 0;
    let lateMeanSize = 0;
    let lateCount = 0;
    for (let i = 0; i < spoutAlpha.count; i++) {
      if (spoutAlpha.getX(i) > 0.01) {
        lateCount++;
        lateMeanX += spoutPos.getX(i);
        lateMeanSize += spoutSize.getX(i);
      }
    }
    expect(peakSpoutY).toBeGreaterThan(3.8);
    expect(lateCount).toBeGreaterThan(30);
    expect(lateMeanSize / lateCount).toBeGreaterThan(earlyMeanSize * 1.6);
    expect(lateMeanX / lateCount).toBeGreaterThan(earlyMeanX + 0.45);
  });

  it('dynamically aligns and shears underwater god rays to Snell-refracted sunDirection while keeping Box3 strictly submerged', () => {
    const splash = createSplashSystem();
    const sunbeams = splash.group.getObjectByName('underwaterSunbeams');
    expect(sunbeams).toBeDefined();

    const sunEast = new THREE.Vector3(0.78, 0.25, -0.57).normalize();
    splash.update({ dt: 1 / 60, time: 1.0, sunDirection: sunEast });
    const refractedEast = sunbeams.userData.refractedDirection.clone();
    const shearEastX = sunbeams.children[0].userData.worldShear.x;

    for (const shaft of sunbeams.children) {
      shaft.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(shaft);
      expect(box.max.y).toBeLessThanOrEqual(0.05);
      expect(box.min.y).toBeLessThan(-8);
    }

    // Flip sun to West + low twilight elevation and high noon
    const sunWest = new THREE.Vector3(-0.82, 0.12, 0.56).normalize();
    splash.update({ dt: 1 / 60, time: 2.0, sunDirection: sunWest });
    const refractedWest = sunbeams.userData.refractedDirection.clone();
    const shearWestX = sunbeams.children[0].userData.worldShear.x;

    // Incident sunlight from +X refracts toward -X underwater; incident from -X refracts toward +X
    expect(refractedEast.x).toBeLessThan(-0.2);
    expect(refractedWest.x).toBeGreaterThan(0.2);
    expect(Math.sign(shearEastX)).toBe(-1);
    expect(Math.sign(shearWestX)).toBe(1);

    for (const sunDir of [
      sunWest,
      new THREE.Vector3(0.05, 0.98, 0.18).normalize(),
      new THREE.Vector3(0.95, 0.02, -0.31).normalize(),
    ]) {
      splash.update({ dt: 1 / 60, time: 3.0, sunDirection: sunDir });
      for (const shaft of sunbeams.children) {
        shaft.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(shaft);
        expect(box.max.y).toBeLessThanOrEqual(0.05);
        expect(box.min.y).toBeLessThan(-8);
      }
    }
  });
});

describe('oceanSurface', () => {
  it('builds a seamless concentric polar ocean geometry with ~0.25-0.4m breach-zone spacing and +Y winding', () => {
    const geom = createPolarOceanGeometry();
    expect(geom).toBeInstanceOf(THREE.BufferGeometry);

    const pos = geom.getAttribute('position');
    const uv = geom.getAttribute('uv');
    expect(pos.count).toBe(1 + 168 * 180);
    expect(uv.count).toBe(pos.count);

    // Center vertex at (0, 0, 0)
    expect(pos.getX(0)).toBeCloseTo(0, 6);
    expect(pos.getY(0)).toBeCloseTo(0, 6);
    expect(pos.getZ(0)).toBeCloseTo(0, 6);

    const ringRadii = [0];
    for (let ring = 1; ring <= 168; ring++) {
      const idx = 1 + (ring - 1) * 180;
      const r = Math.hypot(pos.getX(idx), pos.getZ(idx));
      ringRadii.push(r);
      expect(r).toBeCloseTo(460 * Math.pow(ring / 168, 2.35), 4);
    }

    // Horizon ring reaches 460m
    expect(ringRadii[168]).toBeCloseTo(460, 4);

    // Breach-zone rings around r ~ 2-3.5m have ~0.25-0.4m radial spacing
    const breachSpacings = [];
    for (let ring = 1; ring <= 168; ring++) {
      const r = ringRadii[ring];
      if (r >= 1.6 && r <= 3.6) {
        breachSpacings.push(ringRadii[ring] - ringRadii[ring - 1]);
      }
    }
    expect(breachSpacings.length).toBeGreaterThanOrEqual(4);
    for (const dr of breachSpacings) {
      expect(dr).toBeGreaterThanOrEqual(0.22);
      expect(dr).toBeLessThanOrEqual(0.42);
    }

    // Verify every triangle winds CCW when viewed from +Y so gl_FrontFacing is true above water
    geom.computeVertexNormals();
    const norm = geom.getAttribute('normal');
    for (let i = 0; i < norm.count; i++) {
      expect(Number.isFinite(norm.getX(i))).toBe(true);
      expect(norm.getY(i)).toBeGreaterThan(0.999);
      expect(Number.isFinite(norm.getZ(i))).toBe(true);
    }
  });

  it('creates DoubleSide ShaderMaterial ocean surface synced 100% with WAVE_COMPONENTS and evaluateOceanHeight', () => {
    const ocean = createOceanSurface();
    expect(ocean.mesh).toBeInstanceOf(THREE.Mesh);
    expect(ocean.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(ocean.material.side).toBe(THREE.DoubleSide);
    expect(Array.isArray(ocean.ripples)).toBe(true);
    expect(typeof ocean.pushRipple).toBe('function');
    expect(typeof ocean.update).toBe('function');

    const { uniforms, vertexShader, fragmentShader } = ocean.material;
    expect(uniforms.uWaves.value).toHaveLength(6);
    expect(uniforms.uWaveParams.value).toHaveLength(6);
    expect(uniforms.uRipples.value).toHaveLength(6);

    // Confirm all 6 WAVE_COMPONENTS are loaded directly into shader uniforms
    for (let i = 0; i < 6; i++) {
      const w = WAVE_COMPONENTS[i];
      expect(uniforms.uWaves.value[i].x).toBeCloseTo(w.dirX, 6);
      expect(uniforms.uWaves.value[i].y).toBeCloseTo(w.dirZ, 6);
      expect(uniforms.uWaves.value[i].z).toBeCloseTo(w.steepness, 6);
      expect(uniforms.uWaves.value[i].w).toBeCloseTo(w.amplitude, 6);
      expect(uniforms.uWaveParams.value[i].x).toBeCloseTo(w.wavelength, 6);
      expect(uniforms.uWaveParams.value[i].y).toBeCloseTo(w.speed, 6);
    }

    // Push shockwave ripples and update with dome + environment lighting
    const ripplesRef = ocean.ripples;
    ocean.pushRipple({ x: 0, z: 0, startTime: 2.0, strength: 1.2, speed: 8.5 });
    ocean.pushRipple({ x: 0.5, z: 8.2, startTime: 3.1, strength: 1.75, speed: 9.2 });

    const waterDome = { x: 0.2, z: -0.3, radius: 4.8, height: 1.65 };
    ocean.update({
      time: 3.85,
      sunDirection: new THREE.Vector3(0.5, 0.25, -0.8).normalize(),
      sunColor: new THREE.Color('#ffcf87'),
      skyHorizonColor: new THREE.Color('#f4a261'),
      fogColor: new THREE.Color('#1a3b52'),
      fogDensity: 0.0024,
      waterDome,
      mood: 'golden',
    });

    expect(ocean.ripples).toBe(ripplesRef);
    expect(ocean.ripples).toHaveLength(2);
    expect(uniforms.uTime.value).toBeCloseTo(3.85, 6);
    expect(uniforms.uDome.value.x).toBeCloseTo(waterDome.x, 6);
    expect(uniforms.uDome.value.y).toBeCloseTo(waterDome.z, 6);
    expect(uniforms.uDome.value.z).toBeCloseTo(waterDome.radius, 6);
    expect(uniforms.uDome.value.w).toBeCloseTo(waterDome.height, 6);
    expect(uniforms.uFogDensity.value).toBeCloseTo(0.0024, 6);

    // 100% parity check between shader uniform height formula and CPU evaluateOceanHeight
    const testCoords = [
      [0, 0],
      [1.4, -0.9],
      [-3.5, 2.2],
      [6.2, 8.8],
      [14.5, -11.0],
      [-28.0, 19.5],
      [85.0, -120.0],
    ];
    for (const [x, z] of testCoords) {
      const cpuHeight = evaluateOceanHeight(x, z, 3.85, {
        dome: waterDome,
        ripples: ocean.ripples,
      });
      const gpuHeight = evaluateShaderOceanHeightFromUniforms(x, z, uniforms);
      expect(gpuHeight).toBeCloseTo(cpuHeight, 5);
    }

    // Ring buffer caps at 6 ripples and prunes expired ripples (age >= 8.5s)
    for (let k = 0; k < 7; k++) {
      ocean.pushRipple({ x: k, z: -k, startTime: 4.0 + k * 0.1, strength: 1.0, speed: 8.5 });
    }
    expect(ocean.ripples.length).toBeLessThanOrEqual(6);

    ocean.update({ time: 20.0, mood: 'twilight' });
    expect(ocean.ripples).toHaveLength(0);

    // Verify GLSL features: Gerstner tangent/binormal, uDome, uRipples, Fresnel, SSS, Snell's window
    expect(vertexShader).toContain('uWaves');
    expect(vertexShader).toContain('uDome');
    expect(vertexShader).toContain('uRipples');
    expect(vertexShader).toContain('cross(binormal, tangent)');
    expect(fragmentShader).toContain('gl_FrontFacing');
    expect(fragmentShader).toContain('0.02'); // Schlick F0
    expect(fragmentShader).toContain('1.333'); // Snell's window water/air IOR (~48.6° critical angle)
  });

  it('uses CanvasTexture in browser environments when document.createElement("canvas") is available', () => {
    const prevDoc = globalThis.document;
    globalThis.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          createRadialGradient: () => ({ addColorStop: () => {} }),
          clearRect: () => {},
          fillRect: () => {},
          fillStyle: '',
        }),
      }),
    };

    try {
      const splash = createSplashSystem();
      const sprayPoints = splash.group.getObjectByName('sprayParticles');
      expect(sprayPoints.material.uniforms.uSprite.value).toBeInstanceOf(THREE.CanvasTexture);
    } finally {
      globalThis.document = prevDoc;
    }
  });

  it('integrates end-to-end across a full 9s breach cycle with breachTimeline, whaleRig, oceanSurface, and splashSystem', () => {
    const controller = createBreachController({ cycleDuration: 9.0, autoLoop: true });
    const whale = createWhaleRig();
    const ocean = createOceanSurface();
    const splash = createSplashSystem();

    const sprayPoints = splash.group.getObjectByName('sprayParticles');
    const sprayAlpha = sprayPoints.geometry.getAttribute('aAlpha');
    const sprayPos = sprayPoints.geometry.getAttribute('position');
    const bubblePoints = splash.group.getObjectByName('cavitationBubbles');
    const bubbleAlpha = bubblePoints.geometry.getAttribute('aAlpha');

    let sawBreakthroughEvent = false;
    let sawSplashdownEvent = false;
    let peakActiveSpray = 0;
    let peakActiveBubbles = 0;

    const dt = 0.1;
    for (let step = 0; step < 95; step++) {
      const elapsed = step * dt;
      const { state, events } = controller.update(dt, elapsed);
      whale.update(state, elapsed);
      const anchors = whale.getWorldAnchors();

      for (const ev of events) {
        ocean.pushRipple(ev);
        if (ev.type === 'breakthrough') {
          sawBreakthroughEvent = true;
          splash.triggerBreakthrough(ev);
        } else if (ev.type === 'splashdown') {
          sawSplashdownEvent = true;
          splash.triggerSplashdown(ev);
        }
      }

      ocean.update({
        time: elapsed,
        waterDome: state.waterDome,
        mood: step < 30 ? 'golden' : step < 60 ? 'noon' : 'twilight',
      });

      const getWaterHeight = (x, z) =>
        evaluateOceanHeight(x, z, elapsed, {
          dome: state.waterDome,
          ripples: ocean.ripples,
        });

      splash.update({
        dt,
        time: elapsed,
        breachState: state,
        whaleAnchors: anchors,
        getWaterHeight,
        sunColor: '#ffd59a',
      });

      let activeSpray = 0;
      for (let i = 0; i < sprayAlpha.count; i++) {
        if (sprayAlpha.getX(i) > 0.01) {
          activeSpray++;
          expect(Number.isFinite(sprayPos.getX(i))).toBe(true);
          expect(Number.isFinite(sprayPos.getY(i))).toBe(true);
          expect(Number.isFinite(sprayPos.getZ(i))).toBe(true);
        }
      }
      if (activeSpray > peakActiveSpray) peakActiveSpray = activeSpray;

      let activeBubbles = 0;
      for (let i = 0; i < bubbleAlpha.count; i++) {
        if (bubbleAlpha.getX(i) > 0.01) activeBubbles++;
      }
      if (activeBubbles > peakActiveBubbles) peakActiveBubbles = activeBubbles;
    }

    expect(sawBreakthroughEvent).toBe(true);
    expect(sawSplashdownEvent).toBe(true);
    expect(peakActiveSpray).toBeGreaterThan(400);
    expect(peakActiveBubbles).toBeGreaterThan(80);
    expect(ocean.ripples.length).toBeGreaterThanOrEqual(1);
  });

  it('populates uWhaleSpine[8], uWhaleFlippers[6], and uWhalePresent with both trailing wing arrays and flipperL/flipperR fallback', () => {
    const ocean = createOceanSurface();
    const { uniforms, fragmentShader } = ocean.material;

    expect(uniforms.uWhaleSpine.value).toHaveLength(8);
    expect(uniforms.uWhaleFlippers.value).toHaveLength(6);
    expect(uniforms.uWhalePresent.value).toBe(0);

    // Verify GLSL above-water refracted subsurface silhouette & turquoise-white wing glow
    expect(fragmentShader).toContain('uniform vec4 uWhaleSpine[8]');
    expect(fragmentShader).toContain('uniform vec4 uWhaleFlippers[6]');
    expect(fragmentShader).toContain('uniform float uWhalePresent');
    expect(fragmentShader).toContain('refract(-V, N, 0.75)');
    expect(fragmentShader).toContain('0.784, 0.957, 0.941'); // #c8f4f0 near-surface white-aqua
    expect(fragmentShader).toContain('0.220, 0.839, 0.784'); // #38d6c8 turquoise wing glow

    // 1. Populate with full flipperTrailingL[6] & flipperTrailingR[6]
    const spineStations = Array.from({ length: 8 }, (_, i) => ({
      x: 0.1 * i,
      y: -2.4,
      z: -6.0 + i * 1.8,
      radius: 0.5 + 0.12 * i,
    }));
    const flipperTrailingL = Array.from({ length: 6 }, (_, i) => ({
      x: -1.2 - i * 0.68,
      y: -1.8,
      z: 0.8 - i * 0.1,
      radius: 0.46 - i * 0.03,
    }));
    const flipperTrailingR = Array.from({ length: 6 }, (_, i) => ({
      x: 1.2 + i * 0.68,
      y: -1.8,
      z: 0.8 - i * 0.1,
      radius: 0.46 - i * 0.03,
    }));

    ocean.update({
      time: 1.5,
      whaleAnchors: { spineStations, flipperTrailingL, flipperTrailingR },
    });

    expect(uniforms.uWhalePresent.value).toBe(1);
    for (let i = 0; i < 8; i++) {
      expect(uniforms.uWhaleSpine.value[i].x).toBeCloseTo(spineStations[i].x, 5);
      expect(uniforms.uWhaleSpine.value[i].y).toBeCloseTo(spineStations[i].y, 5);
      expect(uniforms.uWhaleSpine.value[i].z).toBeCloseTo(spineStations[i].z, 5);
      expect(uniforms.uWhaleSpine.value[i].w).toBeCloseTo(spineStations[i].radius, 5);
    }
    // Sampled root -> mid -> tip across left (0..2) and right (3..5) wings
    expect(uniforms.uWhaleFlippers.value[0].x).toBeCloseTo(flipperTrailingL[0].x, 5);
    expect(uniforms.uWhaleFlippers.value[2].x).toBeCloseTo(flipperTrailingL[5].x, 5);
    expect(uniforms.uWhaleFlippers.value[3].x).toBeCloseTo(flipperTrailingR[0].x, 5);
    expect(uniforms.uWhaleFlippers.value[5].x).toBeCloseTo(flipperTrailingR[5].x, 5);

    // 2. Clean fallback to flipperL / flipperR when trailing arrays are absent
    ocean.update({
      time: 1.8,
      whaleAnchors: {
        spineStations,
        flipperL: { x: -4.5, y: -2.1, z: 0.9 },
        flipperR: { x: 4.5, y: -2.1, z: 0.9 },
      },
    });
    expect(uniforms.uWhalePresent.value).toBe(1);
    expect(uniforms.uWhaleFlippers.value[2].x).toBeCloseTo(-4.5, 5);
    expect(uniforms.uWhaleFlippers.value[5].x).toBeCloseTo(4.5, 5);

    // 3. Omitting whaleAnchors resets uWhalePresent cleanly to 0
    ocean.update({ time: 2.0 });
    expect(uniforms.uWhalePresent.value).toBe(0);
  });

  it('computes Beer-Lambert refracted subsurface body silhouette & white-flipper glow during ascent (p=0.19) and recovery (p=0.73) with Fresnel grazing attenuation', () => {
    const ocean = createOceanSurface();
    const whale = createWhaleRig();
    const upNormal = { x: 0, y: 1, z: 0 };
    const aerialCam = { x: 0, y: 34, z: 0 };

    // 1. Deep start (p = 0.0, y = -21m > 10m below surface): invisible from above
    whale.update(evaluateBreachState(0.0), 0.0);
    ocean.update({ time: 0.0, whaleAnchors: whale.getWorldAnchors() });
    const deepOptics = evaluateSubsurfaceWhaleOptics(
      { x: 0, y: 0, z: -10 },
      aerialCam,
      upNormal,
      ocean.material.uniforms
    );
    expect(deepOptics.bodySilhouette).toBe(0);
    expect(deepOptics.wingGlow).toBe(0);

    // 2. Rising pre-breach (p = 0.19): submerged body & 4.6m white pectoral wings glow beneath surface
    whale.update(evaluateBreachState(0.19), 1.7);
    const ascentAnchors = whale.getWorldAnchors();
    ocean.update({ time: 1.7, whaleAnchors: ascentAnchors });

    const chestSt = ascentAnchors.spineStations[3];
    const overBodyAscent = evaluateSubsurfaceWhaleOptics(
      { x: chestSt.x, y: 0, z: chestSt.z },
      { x: chestSt.x, y: 30, z: chestSt.z },
      upNormal,
      ocean.material.uniforms
    );
    const overWingAscent = evaluateSubsurfaceWhaleOptics(
      { x: ascentAnchors.flipperL.x, y: 0, z: ascentAnchors.flipperL.z },
      { x: ascentAnchors.flipperL.x, y: 30, z: ascentAnchors.flipperL.z },
      upNormal,
      ocean.material.uniforms
    );
    expect(overBodyAscent.bodySilhouette).toBeGreaterThan(0.2);
    expect(overWingAscent.wingGlow).toBeGreaterThan(0.2);
    expect(overWingAscent.transmittedFraction).toBeGreaterThan(0.95);

    // Grazing camera angle reflects sky via Schlick Fresnel (fresnel > 0.8 -> transmitted < 0.2)
    const grazingWing = evaluateSubsurfaceWhaleOptics(
      { x: ascentAnchors.flipperL.x, y: 0, z: ascentAnchors.flipperL.z },
      { x: ascentAnchors.flipperL.x + 120, y: 0.6, z: ascentAnchors.flipperL.z },
      upNormal,
      ocean.material.uniforms
    );
    expect(grazingWing.fresnel).toBeGreaterThan(0.8);
    expect(grazingWing.transmittedFraction).toBeLessThan(0.2);

    // 3. Airborne apex (p = 0.47, y = +9.2m above surface): no underwater silhouette
    whale.update(evaluateBreachState(0.47), 4.2);
    ocean.update({ time: 4.2, whaleAnchors: whale.getWorldAnchors() });
    const apexOptics = evaluateSubsurfaceWhaleOptics(
      { x: 0.25, y: 0, z: 5.5 },
      { x: 0.25, y: 34, z: 5.5 },
      upNormal,
      ocean.material.uniforms
    );
    expect(apexOptics.bodySilhouette).toBe(0);
    expect(apexOptics.wingGlow).toBe(0);

    // 4. Post-splashdown recovery (p = 0.73): submerged torso & wings visible again before diving > 10m
    whale.update(evaluateBreachState(0.73), 6.5);
    const recovAnchors = whale.getWorldAnchors();
    ocean.update({ time: 6.5, whaleAnchors: recovAnchors });
    const recovChest = recovAnchors.spineStations[3];
    const overBodyRecov = evaluateSubsurfaceWhaleOptics(
      { x: recovChest.x, y: 0, z: recovChest.z },
      { x: recovChest.x, y: 30, z: recovChest.z },
      upNormal,
      ocean.material.uniforms
    );
    const overWingRecov = evaluateSubsurfaceWhaleOptics(
      { x: recovAnchors.flipperL.x, y: 0, z: recovAnchors.flipperL.z },
      { x: recovAnchors.flipperL.x, y: 30, z: recovAnchors.flipperL.z },
      upNormal,
      ocean.material.uniforms
    );
    expect(overBodyRecov.bodySilhouette).toBeGreaterThan(0.2);
    expect(overWingRecov.wingGlow).toBeGreaterThan(0.2);
  });
});
