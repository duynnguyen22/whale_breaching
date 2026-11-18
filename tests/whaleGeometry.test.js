import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createWhaleGeometry, deformWhaleGeometry } from '../src/whale/whaleGeometry.js';
import { createWhaleRig } from '../src/whale/whaleMesh.js';

describe('Procedural Humpback Whale Geometry (whaleGeometry.js)', () => {
  it('builds an indexed BufferGeometry within 5,000-8,500 vertices and exact anatomical bounds', () => {
    const whaleData = createWhaleGeometry();
    expect(whaleData).toBeDefined();

    const { geometry, restPositions, skinMeta, bounds } = whaleData;
    expect(geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(restPositions).toBeInstanceOf(Float32Array);
    expect(skinMeta).toBeDefined();

    const pos = geometry.getAttribute('position');
    const norm = geometry.getAttribute('normal');
    const col = geometry.getAttribute('color');

    expect(pos).toBeDefined();
    expect(norm).toBeDefined();
    expect(col).toBeDefined();

    // Vertex budget: ~5,000 - 8,500 vertices
    expect(pos.count).toBeGreaterThanOrEqual(5000);
    expect(pos.count).toBeLessThanOrEqual(8500);
    expect(restPositions.length).toBe(pos.count * 3);

    // Every position, normal, and color component must be finite and normals unit-length
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      expect(Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz)).toBe(true);

      const nx = norm.getX(i);
      const ny = norm.getY(i);
      const nz = norm.getZ(i);
      const nLen = Math.hypot(nx, ny, nz);
      expect(Number.isFinite(nLen)).toBe(true);
      expect(nLen).toBeGreaterThan(0.98);
      expect(nLen).toBeLessThan(1.02);

      const r = col.getX(i);
      const g = col.getY(i);
      const b = col.getZ(i);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
    }

    // Coordinate frame & anatomical dimensions:
    // +Z snout (~ +7.2m), -Z flukes (~ -7.8m), ~15.0m total length; +-X flippers (~9.5m span)
    expect(bounds.max.z).toBeGreaterThan(6.95);
    expect(bounds.max.z).toBeLessThan(7.45);
    expect(bounds.min.z).toBeGreaterThan(-8.05);
    expect(bounds.min.z).toBeLessThan(-7.55);
    expect(bounds.size.z).toBeGreaterThan(14.6);
    expect(bounds.size.z).toBeLessThan(15.4);

    // Symmetric pectoral flipper span ~9.5m
    expect(Math.abs(bounds.max.x + bounds.min.x)).toBeLessThan(0.05);
    expect(bounds.size.x).toBeGreaterThan(9.1);
    expect(bounds.size.x).toBeLessThan(9.9);

    // Realistic vertical depth (dorsal fin peak to deep ventral throat pouch)
    expect(bounds.max.y).toBeGreaterThan(1.0);
    expect(bounds.min.y).toBeLessThan(-1.35);
    expect(bounds.size.y).toBeGreaterThan(2.5);
    expect(bounds.size.y).toBeLessThan(3.8);
  });

  it('sculpts unmistakable humpback anatomy: dorsal hump/fin (~66% back), ventral pleats, narrow peduncle, and V-notched butterfly flukes', () => {
    const { geometry } = createWhaleGeometry();
    const pos = geometry.getAttribute('position');
    const col = geometry.getAttribute('color');
    const norm = geometry.getAttribute('normal');

    let maxDorsalFinZoneY = -Infinity; // around z ~ -2.7m (66% back from +7.2m snout)
    let maxAheadOfFinY = -Infinity; // z in [-1.4, -0.9]
    let maxPeduncleY = -Infinity; // z in [-5.6, -4.8]
    let maxPeduncleHalfWidth = 0;
    let maxChestBodyHalfWidth = 0;

    let flukeMaxSpanX = 0;
    let minCenterlineFlukeZ = Infinity;
    let minOuterFlukeZ = Infinity;

    let dorsalLumSum = 0;
    let dorsalCount = 0;
    let ventralLumSum = 0;
    let ventralCount = 0;
    let flipperUndersideLumSum = 0;
    let flipperUndersideCount = 0;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const ny = norm.getY(i);
      const lum = 0.2126 * col.getX(i) + 0.7152 * col.getY(i) + 0.0722 * col.getZ(i);

      if (Math.abs(x) < 0.35) {
        if (z >= -3.3 && z <= -2.1) maxDorsalFinZoneY = Math.max(maxDorsalFinZoneY, y);
        if (z >= -1.4 && z <= -0.9) maxAheadOfFinY = Math.max(maxAheadOfFinY, y);
        if (z >= -5.6 && z <= -4.8) maxPeduncleY = Math.max(maxPeduncleY, y);
      }

      if (z >= -5.8 && z <= -5.2) {
        maxPeduncleHalfWidth = Math.max(maxPeduncleHalfWidth, Math.abs(x));
      }
      if (z >= 1.8 && z <= 2.5 && Math.abs(x) < 2.2) {
        maxChestBodyHalfWidth = Math.max(maxChestBodyHalfWidth, Math.abs(x));
      }

      // Tail flukes region
      if (z < -6.2) {
        flukeMaxSpanX = Math.max(flukeMaxSpanX, Math.abs(x));
        if (Math.abs(x) < 0.05) {
          minCenterlineFlukeZ = Math.min(minCenterlineFlukeZ, z);
        }
        if (Math.abs(x) > 1.2) {
          minOuterFlukeZ = Math.min(minOuterFlukeZ, z);
        }
      }

      // Countershading checks
      if (z > -2.0 && z < 3.5 && Math.abs(x) < 0.75 && y > 0.75 && ny > 0.5) {
        dorsalLumSum += lum;
        dorsalCount++;
      }
      if (z > 0.0 && z < 4.5 && Math.abs(x) < 0.85 && y < -1.0 && ny < -0.4) {
        ventralLumSum += lum;
        ventralCount++;
      }
      if (Math.abs(x) > 2.4 && z > -1.8 && z < 1.5 && ny < -0.45) {
        flipperUndersideLumSum += lum;
        flipperUndersideCount++;
      }
    }

    // Dorsal hump + falcate fin rises distinctly above surrounding posterior back & peduncle
    expect(maxDorsalFinZoneY).toBeGreaterThan(maxAheadOfFinY + 0.12);
    expect(maxDorsalFinZoneY).toBeGreaterThan(maxPeduncleY + 0.45);

    // Laterally compressed caudal peduncle compared to wide anterior body
    expect(maxPeduncleHalfWidth).toBeLessThan(0.45);
    expect(maxChestBodyHalfWidth).toBeGreaterThan(1.25);

    // Butterfly tail flukes ~4.5m total span (~2.25m half-span) with distinct central V-notch
    expect(flukeMaxSpanX * 2).toBeGreaterThan(4.2);
    expect(flukeMaxSpanX * 2).toBeLessThan(4.8);
    expect(minCenterlineFlukeZ).toBeGreaterThan(minOuterFlukeZ + 0.22);

    // Realistic countershading: dark slate-navy dorsal back vs crisp bright off-white ventral belly & flipper undersides
    expect(dorsalCount).toBeGreaterThan(20);
    expect(ventralCount).toBeGreaterThan(20);
    expect(flipperUndersideCount).toBeGreaterThan(20);

    const avgDorsalLum = dorsalLumSum / dorsalCount;
    const avgVentralLum = ventralLumSum / ventralCount;
    const avgFlipperUnderLum = flipperUndersideLumSum / flipperUndersideCount;

    expect(avgDorsalLum).toBeLessThan(0.08);
    expect(avgVentralLum).toBeGreaterThan(0.45);
    expect(avgFlipperUnderLum).toBeGreaterThan(0.55);
  });

  it('sculpts ~20 longitudinal ventral throat pleats in both vertex radius and groove shading', () => {
    const { geometry } = createWhaleGeometry();
    const pos = geometry.getAttribute('position');
    const col = geometry.getAttribute('color');

    // Collect ventral slice vertices near z ~ +2.2m (throat pouch)
    const slice = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (Math.abs(z - 2.2) < 0.12 && y < -0.55 && Math.abs(x) < 1.35) {
        const angle = Math.atan2(x, -y);
        const r = Math.hypot(x, y);
        const lum = 0.2126 * col.getX(i) + 0.7152 * col.getY(i) + 0.0722 * col.getZ(i);
        slice.push({ angle, r, lum });
      }
    }

    // Group by unique circumferential angle to inspect a single cross-sectional ring
    slice.sort((a, b) => a.angle - b.angle);
    const ring = [];
    for (const pt of slice) {
      if (ring.length === 0 || Math.abs(pt.angle - ring[ring.length - 1].angle) > 0.01) {
        ring.push(pt);
      }
    }

    // Count local minima (grooves) across the ventral ring
    let grooveCount = 0;
    for (let i = 1; i < ring.length - 1; i++) {
      if (ring[i].r < ring[i - 1].r - 0.008 && ring[i].r < ring[i + 1].r - 0.008) {
        grooveCount++;
      }
    }
    expect(grooveCount).toBeGreaterThanOrEqual(16);
    expect(grooveCount).toBeLessThanOrEqual(24);
  });

  it('deforms spine arch, travelling caudal wave, pectoral fin spread, and jaw tension smoothly with zero NaNs', () => {
    const whaleData = createWhaleGeometry();
    const pos = whaleData.geometry.getAttribute('position');
    const norm = whaleData.geometry.getAttribute('normal');

    // Neutral pose matches restPositions closely
    deformWhaleGeometry(whaleData, {
      spineArch: 0,
      tailBeatPhase: 0,
      tailBeatAmplitude: 0,
      finSpread: 0.5,
      jawOpen: 0,
    });
    for (let i = 0; i < whaleData.restPositions.length; i++) {
      expect(pos.array[i]).toBeCloseTo(whaleData.restPositions[i], 4);
    }

    // Tail beat phase comparison (+pi/2 vs -pi/2) moves flukes strongly in Y
    deformWhaleGeometry(whaleData, {
      spineArch: 0,
      tailBeatPhase: Math.PI * 0.5,
      tailBeatAmplitude: 0.9,
      finSpread: 0.5,
      jawOpen: 0,
    });
    let flukeUpY = 0;
    let flukeCount = 0;
    for (let i = 0; i < pos.count; i++) {
      if (whaleData.restPositions[i * 3 + 2] < -7.2) {
        flukeUpY += pos.getY(i);
        flukeCount++;
      }
    }
    flukeUpY /= flukeCount;

    deformWhaleGeometry(whaleData, {
      spineArch: 0,
      tailBeatPhase: -Math.PI * 0.5,
      tailBeatAmplitude: 0.9,
      finSpread: 0.5,
      jawOpen: 0,
    });
    let flukeDownY = 0;
    for (let i = 0; i < pos.count; i++) {
      if (whaleData.restPositions[i * 3 + 2] < -7.2) {
        flukeDownY += pos.getY(i);
      }
    }
    flukeDownY /= flukeCount;
    expect(Math.abs(flukeUpY - flukeDownY)).toBeGreaterThan(1.0);

    // Fin spread comparison (0.0 tucked vs 1.0 flared wide) + jawOpen + strong spineArch
    deformWhaleGeometry(whaleData, {
      spineArch: 0,
      tailBeatPhase: 0,
      tailBeatAmplitude: 0,
      finSpread: 0.0,
      jawOpen: 0.0,
    });
    let tuckedMaxX = 0;
    let closedChinMinY = Infinity;
    for (let i = 0; i < pos.count; i++) {
      tuckedMaxX = Math.max(tuckedMaxX, pos.getX(i));
      if (whaleData.restPositions[i * 3 + 2] > 5.5) {
        closedChinMinY = Math.min(closedChinMinY, pos.getY(i));
      }
    }

    deformWhaleGeometry(whaleData, {
      spineArch: 0.85,
      tailBeatPhase: 1.7,
      tailBeatAmplitude: 0.8,
      finSpread: 1.0,
      jawOpen: 1.0,
    });
    let flaredMaxX = 0;
    let openChinMinY = Infinity;
    for (let i = 0; i < pos.count; i++) {
      flaredMaxX = Math.max(flaredMaxX, pos.getX(i));
      if (whaleData.restPositions[i * 3 + 2] > 5.5 && whaleData.skinMeta.jawWeight[i] > 0.5) {
        openChinMinY = Math.min(openChinMinY, pos.getY(i));
      }
      expect(Number.isFinite(pos.getX(i))).toBe(true);
      expect(Number.isFinite(norm.getX(i))).toBe(true);
      expect(Number.isFinite(norm.getY(i))).toBe(true);
      expect(Number.isFinite(norm.getZ(i))).toBe(true);
    }

    expect(flaredMaxX).toBeGreaterThan(tuckedMaxX + 0.35);
    // Reset spineArch=0 with jawOpen=1 to isolate pure jaw opening drop
    deformWhaleGeometry(whaleData, {
      spineArch: 0,
      tailBeatPhase: 0,
      tailBeatAmplitude: 0,
      finSpread: 0.5,
      jawOpen: 1.0,
    });
    let isolatedOpenChinMinY = Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (whaleData.restPositions[i * 3 + 2] > 5.5) {
        isolatedOpenChinMinY = Math.min(isolatedOpenChinMinY, pos.getY(i));
      }
    }
    expect(isolatedOpenChinMinY).toBeLessThan(closedChinMinY - 0.15);
  });
});

describe('Whale Rig, Wet Skin Material & Right-Handed Kinematics (whaleMesh.js)', () => {
  it('configures MeshPhysicalMaterial with clearcoat 0.92, envMapIntensity 1.35, and wetness-driven roughness', () => {
    const rig = createWhaleRig();
    expect(rig.group).toBeInstanceOf(THREE.Group);
    expect(rig.mesh).toBeInstanceOf(THREE.Mesh);
    expect(rig.mesh.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);

    const mat = rig.mesh.material;
    expect(mat.vertexColors).toBe(true);
    expect(mat.clearcoat).toBeCloseTo(0.92, 3);
    expect(mat.envMapIntensity).toBeCloseTo(1.35, 3);

    rig.update({ position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, wetness: 1.0 }, 0);
    const wetRoughness = mat.roughness;
    const wetClearcoatRoughness = mat.clearcoatRoughness;

    rig.update({ position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, wetness: 0.0 }, 1.0);
    expect(mat.roughness).toBeGreaterThan(wetRoughness + 0.15);
    expect(mat.clearcoatRoughness).toBeGreaterThan(wetClearcoatRoughness + 0.08);
  });

  it('pitches the +Z snout UP toward +Y for positive nose-up pitch (YXZ order, rotation.x = -pitch) even during barrel roll', () => {
    const rig = createWhaleRig();

    // Pure steep ascent: pitch = +1.05 rad (~60 deg nose-up)
    rig.update(
      {
        position: { x: 0, y: 2.0, z: 1.0 },
        rotation: { pitch: 1.05, yaw: 0, roll: 0 },
        spineArch: 0,
        tailBeatAmplitude: 0,
        finSpread: 0.5,
        wetness: 1.0,
      },
      0.5
    );

    expect(rig.group.rotation.order).toBe('YXZ');
    expect(rig.group.rotation.x).toBeCloseTo(-1.05, 5);
    expect(rig.group.rotation.y).toBeCloseTo(0, 5);
    expect(rig.group.rotation.z).toBeCloseTo(0, 5);

    const anchorsAscent = rig.getWorldAnchors();
    // Snout (+7.2m local Z) pitched up by 1.05 rad around y=2.0 -> y ~ 2.0 + 7.2*sin(1.05) ~ 8.2m!
    expect(anchorsAscent.snout.y).toBeGreaterThan(7.5);
    // Tail flukes (-7.8m local Z) pitched down -> y ~ 2.0 - 7.8*sin(1.05) ~ -4.7m!
    expect(anchorsAscent.flukeL.y).toBeLessThan(-3.8);
    expect(anchorsAscent.flukeR.y).toBeLessThan(-3.8);

    // Barrel-roll breakthrough: roll = 2.55 rad, yaw = 0.6 rad, nose-up pitch = +0.65 rad
    rig.update(
      {
        position: { x: -1.5, y: 5.0, z: 4.0 },
        rotation: { pitch: 0.65, yaw: 0.6, roll: 2.55 },
        spineArch: 0.3,
        tailBeatAmplitude: 0.4,
        finSpread: 1.0,
        wetness: 0.9,
      },
      1.2
    );

    const anchorsRoll = rig.getWorldAnchors();
    expect(anchorsRoll.snout.y).toBeGreaterThan(rig.group.position.y + 3.2);
    expect(anchorsRoll.snout.y).toBeGreaterThan(anchorsRoll.flukeL.y + 5.0);

    // Negative pitch (nose-down splashdown): pitch = -0.45 rad
    rig.update(
      {
        position: { x: 0, y: 1.0, z: 8.0 },
        rotation: { pitch: -0.45, yaw: 0, roll: 0 },
        spineArch: 0,
        tailBeatAmplitude: 0,
        finSpread: 0.5,
        wetness: 0.8,
      },
      2.0
    );
    const anchorsDive = rig.getWorldAnchors();
    expect(anchorsDive.snout.y).toBeLessThan(rig.group.position.y - 2.2);
    expect(anchorsDive.flukeL.y).toBeGreaterThan(rig.group.position.y + 2.2);
  });

  it('returns accurate world-space anchors and 8 ordered spineStations with radii from snout to flukes', () => {
    const rig = createWhaleRig();
    rig.update(
      {
        position: { x: 2.5, y: -3.0, z: 5.0 },
        rotation: { pitch: 0, yaw: 0, roll: 0 },
        spineArch: 0,
        tailBeatAmplitude: 0,
        finSpread: 0.5,
        wetness: 1.0,
      },
      0
    );

    const anchors = rig.getWorldAnchors();
    for (const key of ['snout', 'chin', 'dorsal', 'flipperL', 'flipperR', 'flukeL', 'flukeR']) {
      expect(anchors[key]).toBeDefined();
      expect(Number.isFinite(anchors[key].x)).toBe(true);
      expect(Number.isFinite(anchors[key].y)).toBe(true);
      expect(Number.isFinite(anchors[key].z)).toBe(true);
    }

    // Left (+X) vs Right (-X) anatomical anchors translated by x = +2.5
    expect(anchors.flipperL.x).toBeGreaterThan(2.5 + 4.2);
    expect(anchors.flipperR.x).toBeLessThan(2.5 - 4.2);
    expect(anchors.flukeL.x).toBeGreaterThan(2.5 + 1.8);
    expect(anchors.flukeR.x).toBeLessThan(2.5 - 1.8);
    expect(anchors.snout.z).toBeCloseTo(5.0 + 7.2, 1);

    // 8 spineStations from snout to flukes
    expect(Array.isArray(anchors.spineStations)).toBe(true);
    expect(anchors.spineStations).toHaveLength(8);
    for (let i = 0; i < 8; i++) {
      const st = anchors.spineStations[i];
      expect(Number.isFinite(st.x)).toBe(true);
      expect(Number.isFinite(st.y)).toBe(true);
      expect(Number.isFinite(st.z)).toBe(true);
      expect(st.radius).toBeGreaterThan(0.15);
      expect(st.radius).toBeLessThan(2.2);
      if (i > 0) {
        expect(st.z).toBeLessThan(anchors.spineStations[i - 1].z);
      }
    }
    // Mid-chest station radius is broader than snout & tail stations
    expect(anchors.spineStations[2].radius).toBeGreaterThan(anchors.spineStations[0].radius);
    expect(anchors.spineStations[2].radius).toBeGreaterThan(anchors.spineStations[7].radius);
  });

  it('maintains strictly outward-facing normals on body, both flippers, and flukes, plus scalloped flipper leading edges and live skinned anchors', () => {
    const rig = createWhaleRig();
    const { geometry, skinMeta } = rig.whaleData;
    const norm = geometry.getAttribute('normal');
    const pos = geometry.getAttribute('position');

    // Check tip normals point strictly outward on snout, left/right flippers, and left/right flukes
    const idx = skinMeta.anchorIndices;
    expect(norm.getZ(idx.snout)).toBeGreaterThan(0.85);
    expect(norm.getX(idx.flipperL)).toBeGreaterThan(0.8);
    expect(norm.getX(idx.flipperR)).toBeLessThan(-0.8);
    expect(norm.getX(idx.flukeL)).toBeGreaterThan(0.8);
    expect(norm.getX(idx.flukeR)).toBeLessThan(-0.8);

    // Both left (+X) and right (-X) flipper undersides have downward (-Y) normals and ~4.6m swept wing length
    const shoulderL = new THREE.Vector3(1.0, -0.56, 1.32);
    const tipL = new THREE.Vector3(
      pos.getX(idx.flipperL),
      pos.getY(idx.flipperL),
      pos.getZ(idx.flipperL)
    );
    const flipperLength = shoulderL.distanceTo(tipL);
    expect(flipperLength).toBeGreaterThan(4.3);
    expect(flipperLength).toBeLessThan(4.9);

    // Check scalloped leading-edge tubercles along left pectoral flipper
    const leadingEdgeSamples = [];
    for (let i = 0; i < pos.count; i++) {
      if (skinMeta.part[i] === 1 && skinMeta.partChord[i] > 0.98) {
        leadingEdgeSamples.push({ x: pos.getX(i), z: pos.getZ(i) });
      }
    }
    leadingEdgeSamples.sort((a, b) => a.x - b.x);
    // Second differences in Z along the swept leading edge reveal knobby tubercle waves
    let tubercleInflections = 0;
    for (let i = 1; i < leadingEdgeSamples.length - 1; i++) {
      const zMid = 0.5 * (leadingEdgeSamples[i - 1].z + leadingEdgeSamples[i + 1].z);
      if (leadingEdgeSamples[i].z - zMid > 0.015) {
        tubercleInflections++;
      }
    }
    expect(tubercleInflections).toBeGreaterThanOrEqual(5);

    // Verify getWorldAnchors() dynamically tracks live vertex deformation (tail beat & fin spread)
    rig.update(
      {
        position: { x: 0, y: 0, z: 0 },
        rotation: { pitch: 0, yaw: 0, roll: 0 },
        tailBeatPhase: Math.PI * 0.5,
        tailBeatAmplitude: 0.9,
        finSpread: 0.0,
      },
      0
    );
    const poseA = rig.getWorldAnchors();

    rig.update(
      {
        position: { x: 0, y: 0, z: 0 },
        rotation: { pitch: 0, yaw: 0, roll: 0 },
        tailBeatPhase: -Math.PI * 0.5,
        tailBeatAmplitude: 0.9,
        finSpread: 1.0,
      },
      0
    );
    const poseB = rig.getWorldAnchors();

    expect(Math.abs(poseA.flukeL.y - poseB.flukeL.y)).toBeGreaterThan(1.0);
    expect(poseB.flipperL.x).toBeGreaterThan(poseA.flipperL.x + 0.35);
    expect(Math.abs(poseA.spineStations[7].y - poseB.spineStations[7].y)).toBeGreaterThan(0.8);
  });
});
