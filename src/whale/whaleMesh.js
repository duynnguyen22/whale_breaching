import * as THREE from 'three';
import {
  createWhaleGeometry,
  deformWhaleGeometry,
  evaluateSpineDeformation,
} from './whaleGeometry.js';

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Creates the articulated 3D Humpback Whale scene rig with wet cetacean skin material,
 * right-handed YXZ breach orientation, real-time biomechanical deformation, and world-space splash anchors.
 */
export function createWhaleRig() {
  const whaleData = createWhaleGeometry();

  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.18,
    metalness: 0.04,
    clearcoat: 0.92,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.35,
    reflectivity: 0.78,
    sheen: 0.16,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color('#3a546d'),
  });

  const mesh = new THREE.Mesh(whaleData.geometry, material);
  mesh.name = 'HumpbackWhaleMesh';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.name = 'HumpbackWhaleRig';
  group.rotation.order = 'YXZ';
  group.add(mesh);

  let currentAnimState = {
    spineArch: 0,
    tailBeatPhase: 0,
    tailBeatAmplitude: 0.5,
    finSpread: 0.5,
    jawOpen: 0,
  };

  const tmpVec = new THREE.Vector3();

  function readWorldVertex(vertexIndex) {
    const posAttr = whaleData.geometry.getAttribute('position');
    return new THREE.Vector3(
      posAttr.getX(vertexIndex),
      posAttr.getY(vertexIndex),
      posAttr.getZ(vertexIndex)
    ).applyMatrix4(mesh.matrixWorld);
  }

  function update(breachState = {}, time = 0) {
    const pos = breachState.position ?? { x: 0, y: 0, z: 0 };
    const rot = breachState.rotation ?? { pitch: 0, yaw: 0, roll: 0 };

    group.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0);

    // Three.js right-handed rule for +Z-facing whale:
    // Positive nose-up pitch lifts +Z snout toward +Y via NEGATIVE rotation around +X (rx = -pitch).
    // YXZ order rolls cleanly around longitudinal +Z spine first, then pitches nose up, then yaws heading.
    group.rotation.order = 'YXZ';
    group.rotation.y = rot.yaw ?? 0;
    group.rotation.x = -(rot.pitch ?? 0);
    group.rotation.z = rot.roll ?? 0;

    const wetness = clamp(breachState.wetness ?? 1.0, 0, 1);
    material.roughness = lerp(0.50, 0.18, wetness);
    material.clearcoatRoughness = lerp(0.28, 0.05, wetness);

    currentAnimState = {
      spineArch: breachState.spineArch ?? 0,
      tailBeatPhase: breachState.tailBeatPhase ?? time * 5.0,
      tailBeatAmplitude: breachState.tailBeatAmplitude ?? 0.5,
      finSpread: breachState.finSpread ?? 0.5,
      jawOpen: breachState.jawOpen ?? 0,
    };

    deformWhaleGeometry(whaleData, currentAnimState);
    group.updateMatrixWorld(true);
  }

  function getWorldAnchors() {
    group.updateMatrixWorld(true);
    const idx = whaleData.skinMeta.anchorIndices;

    const snout = readWorldVertex(idx.snout);
    const chin = readWorldVertex(idx.chin);
    const dorsal = readWorldVertex(idx.dorsal);
    const flipperL = readWorldVertex(idx.flipperL);
    const flipperR = readWorldVertex(idx.flipperR);
    const flukeL = readWorldVertex(idx.flukeL);
    const flukeR = readWorldVertex(idx.flukeR);

    const scaleFactor = Math.max(
      Math.abs(group.scale.x),
      Math.abs(group.scale.y),
      Math.abs(group.scale.z)
    ) || 1;

    const spineStations = whaleData.skinMeta.spineStations.map((st) => {
      const sp = evaluateSpineDeformation(
        st.z,
        currentAnimState.spineArch,
        currentAnimState.tailBeatPhase,
        currentAnimState.tailBeatAmplitude
      );
      const cosP = Math.cos(sp.slopeAngle);
      const sinP = Math.sin(sp.slopeAngle);
      const localY = sp.dy + st.y * cosP;
      const localZ = st.z + sp.dz - st.y * sinP;

      tmpVec.set(st.x, localY, localZ).applyMatrix4(mesh.matrixWorld);
      return {
        x: tmpVec.x,
        y: tmpVec.y,
        z: tmpVec.z,
        radius: st.radius * scaleFactor,
      };
    });

    return {
      snout,
      chin,
      dorsal,
      flipperL,
      flipperR,
      flukeL,
      flukeR,
      spineStations,
    };
  }

  // Initialize world matrices in rest state
  group.updateMatrixWorld(true);

  return {
    group,
    mesh,
    whaleData,
    update,
    getWorldAnchors,
  };
}
