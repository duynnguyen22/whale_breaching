import * as THREE from 'three';
import {
  createWhaleGeometry,
  deformWhaleGeometry,
  evaluateBodyStation,
  evaluateSpineDeformation,
} from './whaleGeometry.js';

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Builds an articulated inner baleen curtain & oral cavity mesh tucked inside the upper/lower rostrum
 * that becomes visible and expands smoothly whenever `jawOpen > 0`.
 */
function createBaleenCavityMesh() {
  const zRings = 16;
  const zStart = 6.88;
  const zEnd = 3.12;

  const positions = [];
  const restUpper = [];
  const restLower = [];
  const colors = [];
  const indices = [];

  // Per Z-station: 5 cross-section points forming an inverted U-arch of baleen plates + oral floor
  // 0: right lower gum (-x), 1: right upper baleen root (-x), 2: palate crown (x=0),
  // 3: left upper baleen root (+x), 4: left lower gum (+x)
  const ptsPerRing = 5;

  for (let i = 0; i < zRings; i++) {
    const t = i / (zRings - 1);
    const z = lerp(zStart, zEnd, t);
    const st = evaluateBodyStation(z);
    const halfW = Math.max(0.08, st.halfWidth * 0.80);
    const upperY = st.mouthY + 0.045;
    const palateY = st.mouthY + 0.11;
    const lowerClosedY = st.mouthY - 0.035;

    // Alternating fibrous keratinous baleen plate shading along Z
    const comb = 0.5 + 0.5 * Math.sin(z * 64.0);
    const baleenR = lerp(0.16, 0.38, comb);
    const baleenG = lerp(0.12, 0.28, comb);
    const baleenB = lerp(0.09, 0.19, comb);

    const ringSpec = [
      { x: -halfW * 0.94, yU: upperY, yL: lowerClosedY, lowerFactor: 1.0, cr: 0.24, cg: 0.12, cb: 0.15 },
      { x: -halfW, yU: upperY, yL: upperY, lowerFactor: 0.0, cr: baleenR, cg: baleenG, cb: baleenB },
      { x: 0.0, yU: palateY, yL: palateY, lowerFactor: 0.0, cr: 0.20, cg: 0.11, cb: 0.13 },
      { x: halfW, yU: upperY, yL: upperY, lowerFactor: 0.0, cr: baleenR, cg: baleenG, cb: baleenB },
      { x: halfW * 0.94, yU: upperY, yL: lowerClosedY, lowerFactor: 1.0, cr: 0.24, cg: 0.12, cb: 0.15 },
    ];

    for (let j = 0; j < ptsPerRing; j++) {
      const p = ringSpec[j];
      positions.push(p.x, p.yL, z);
      restUpper.push(p.x, p.yU, z);
      restLower.push(p.lowerFactor);
      colors.push(p.cr, p.cg, p.cb);
    }
  }

  for (let i = 0; i < zRings - 1; i++) {
    const rA = i * ptsPerRing;
    const rB = (i + 1) * ptsPerRing;
    // Baleen curtains & palate arch
    for (let j = 0; j < ptsPerRing - 1; j++) {
      const a = rA + j;
      const b = rB + j;
      const c = rB + j + 1;
      const d = rA + j + 1;
      indices.push(a, b, c, a, c, d);
    }
    // Oral floor connecting right lower gum (0) to left lower gum (4)
    indices.push(rA + 0, rA + 4, rB + 4, rA + 0, rB + 4, rB + 0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.56,
    metalness: 0.02,
    clearcoat: 0.45,
    clearcoatRoughness: 0.25,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'WhaleBaleenCavity';
  mesh.visible = false;

  return {
    mesh,
    restUpper: new Float32Array(restUpper),
    restLower: new Float32Array(restLower),
  };
}

function updateBaleenCavity(baleenData, animState, jawPivot) {
  const jawOpen = clamp(animState.jawOpen ?? 0, 0, 1.5);
  const { mesh, restUpper, restLower } = baleenData;
  if (jawOpen <= 0.002) {
    mesh.visible = false;
    return;
  }

  mesh.visible = true;
  const posAttr = mesh.geometry.getAttribute('position');
  const out = posAttr.array;
  const jawAngle = jawOpen * 0.26;
  const cosJaw = Math.cos(jawAngle);
  const sinJaw = Math.sin(jawAngle);
  const count = restLower.length;

  for (let i = 0; i < count; i++) {
    const idx3 = i * 3;
    let x = restUpper[idx3];
    let y = restUpper[idx3 + 1];
    let z = restUpper[idx3 + 2];

    if (restLower[i] > 0.5) {
      const yBase = y - 0.06;
      const dyJ = yBase - jawPivot.y;
      const dzJ = z - jawPivot.z;
      y = jawPivot.y + dyJ * cosJaw - dzJ * sinJaw - 0.05 * jawOpen;
      z = jawPivot.z + dyJ * sinJaw + dzJ * cosJaw;
    }

    const sp = evaluateSpineDeformation(
      z,
      animState.spineArch,
      animState.tailBeatPhase,
      animState.tailBeatAmplitude
    );
    const cosP = Math.cos(sp.slopeAngle);
    const sinP = Math.sin(sp.slopeAngle);

    out[idx3] = x;
    out[idx3 + 1] = sp.dy + y * cosP;
    out[idx3 + 2] = z + sp.dz - y * sinP;
  }

  posAttr.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

/**
 * Enhances HumpbackWhaleMesh's MeshPhysicalMaterial via onBeforeCompile with:
 * - Procedural micro-skin dermal pores & subtle bump/roughness breakup
 * - White cetacean rake-mark scars & crusty ochre-white barnacle detail on chin/flipper tubercle zones
 * - Animated water-runoff streaks draining downward when airborne (uWetness < 1.0)
 * - Animated underwater sunlight caustic light ripples on submerged skin (vWorldPos.y < uWaterLevel)
 * - Inner-mouth baleen striation enhancement when uJawOpen > 0
 */
function installWhaleSkinShader(material, shaderUniforms) {
  material.userData.shaderUniforms = shaderUniforms;
  material.userData.uniforms = shaderUniforms;
  material.customProgramCacheKey = () => 'humpback-whale-skin-v2';

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shaderUniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        attribute vec3 aRestPos;
        varying vec3 vRestPos;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        `
      )
      .replace(
        '#include <worldpos_vertex>',
        /* glsl */ `
        #include <worldpos_vertex>
        vRestPos = aRestPos;
        vWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        vWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform float uWetness;
        uniform float uWaterLevel;
        uniform vec3 uSunDirection;
        uniform float uJawOpen;

        varying vec3 vRestPos;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        float whaleHash31( vec3 p ) {
          p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) );
          p += dot( p, p.yxz + 33.33 );
          return fract( ( p.x + p.y ) * p.z );
        }

        float whaleNoise3( vec3 p ) {
          vec3 i = floor( p );
          vec3 f = fract( p );
          f = f * f * ( 3.0 - 2.0 * f );
          float n000 = whaleHash31( i + vec3( 0.0, 0.0, 0.0 ) );
          float n100 = whaleHash31( i + vec3( 1.0, 0.0, 0.0 ) );
          float n010 = whaleHash31( i + vec3( 0.0, 1.0, 0.0 ) );
          float n110 = whaleHash31( i + vec3( 1.0, 1.0, 0.0 ) );
          float n001 = whaleHash31( i + vec3( 0.0, 0.0, 1.0 ) );
          float n101 = whaleHash31( i + vec3( 1.0, 0.0, 1.0 ) );
          float n011 = whaleHash31( i + vec3( 0.0, 1.0, 1.0 ) );
          float n111 = whaleHash31( i + vec3( 1.0, 1.0, 1.0 ) );
          float nx00 = mix( n000, n100, f.x );
          float nx10 = mix( n010, n110, f.x );
          float nx01 = mix( n001, n101, f.x );
          float nx11 = mix( n011, n111, f.x );
          float nxy0 = mix( nx00, nx10, f.y );
          float nxy1 = mix( nx01, nx11, f.y );
          return mix( nxy0, nxy1, f.z );
        }

        // Micro-skin dermal pores & fine cetacean epidermal grain
        float whaleDermalPores( vec3 rp ) {
          float coarse = whaleNoise3( rp * 24.0 );
          float pores = whaleNoise3( rp * 68.0 + vec3( 4.1, -2.7, 7.3 ) );
          float poreDimple = smoothstep( 0.68, 0.92, pores );
          return ( coarse - 0.5 ) * 0.55 - poreDimple * 0.45;
        }

        // Parallel cetacean tooth rake-mark scars across flanks & peduncle
        float whaleRakeScars( vec3 rp ) {
          float flankZone = smoothstep( -5.8, -4.4, rp.z ) * smoothstep( 4.2, 2.2, rp.z ) * smoothstep( -0.55, 0.05, rp.y );
          vec2 uvA = vec2( rp.z * 1.45 + rp.y * 0.95, rp.y * 1.65 - rp.z * 0.62 );
          float patchA = smoothstep( 0.63, 0.80, whaleNoise3( vec3( rp * 0.85 + 2.3 ) ) );
          float combA = pow( max( 1e-4, cos( uvA.y * 54.0 + sin( uvA.x * 3.2 ) * 1.4 ) ), 18.0 );
          float lenMaskA = smoothstep( 0.45, 0.72, whaleNoise3( vec3( uvA.x * 2.1, rp.x * 1.5, 5.1 ) ) );

          vec2 uvB = vec2( rp.z * 1.2 - rp.y * 1.1, rp.y * 1.8 + rp.z * 0.78 );
          float patchB = smoothstep( 0.66, 0.83, whaleNoise3( vec3( rp * 0.95 - 6.4 ) ) );
          float combB = pow( max( 1e-4, cos( uvB.y * 48.0 + cos( uvB.x * 2.7 ) * 1.2 ) ), 20.0 );

          return clamp( flankZone * ( patchA * combA * lenMaskA + patchB * combB * 0.85 ), 0.0, 1.0 );
        }

        // Crusty ochre-white Coronula barnacles localized on chin knob, rostrum knobs & flipper leading tubercles
        float whaleBarnacles( vec3 rp ) {
          float chinZone = smoothstep( 5.65, 6.45, rp.z ) * smoothstep( 0.12, -0.22, rp.y );
          float rostrumTubercleZone = smoothstep( 4.10, 5.10, rp.z ) * smoothstep( -0.05, 0.25, rp.y ) * 0.65;

          float absX = abs( rp.x );
          float wingS = clamp( ( absX - 0.76 ) / 3.95, 1e-4, 1.0 );
          float wingLeadZ = 1.36 - 2.48 * pow( wingS, 1.06 ) + 0.14 * sin( wingS * 3.14159 );
          float wingLeadDelta = ( rp.z - ( wingLeadZ + 0.34 ) ) / 0.24;
          float flipperLeadZone = smoothstep( 1.05, 1.55, absX )
            * smoothstep( 4.65, 3.85, absX )
            * exp( -wingLeadDelta * wingLeadDelta );

          float zoneMask = max( max( chinZone, rostrumTubercleZone ), flipperLeadZone );
          if ( zoneMask <= 0.005 ) return 0.0;

          float cluster = smoothstep( 0.48, 0.76, whaleNoise3( rp * 5.6 + vec3( 1.7, 3.4, -2.1 ) ) );
          float cells = whaleNoise3( rp * 21.0 + vec3( -4.2, 6.1, 2.8 ) );
          // Ring-like barnacle crown wall with central cup depression
          float ring = smoothstep( 0.46, 0.68, cells ) * ( 1.0 - 0.48 * smoothstep( 0.80, 0.95, cells ) );
          return clamp( zoneMask * cluster * ring, 0.0, 1.0 );
        }

        // Gravity-draining water-runoff streaks when whale is airborne (uWetness < 1.0)
        float whaleRunoffStreaks( vec3 rp, vec3 wp, vec3 wn, float wetness, float time ) {
          float airborne = smoothstep( 0.995, 0.70, wetness );
          if ( airborne <= 0.001 ) return 0.0;
          float verticalWall = 1.0 - 0.42 * abs( wn.y );
          float wobble = whaleNoise3( rp * 4.5 + vec3( 0.0, time * 0.35, 0.0 ) ) * 1.4;
          float colCoord = rp.x * 11.5 + rp.z * 9.2 + wobble;
          float drainCoord = wp.y * 1.85 + time * 2.45;
          float streamA = whaleNoise3( vec3( colCoord, drainCoord * 0.55, rp.z * 2.2 ) );
          float streamB = whaleNoise3( vec3( colCoord * 2.3 + 7.1, drainCoord * 0.95, rp.x * 2.7 ) );
          float rivulet = smoothstep( 0.56, 0.84, streamA * 0.65 + streamB * 0.35 );
          return clamp( airborne * verticalWall * rivulet, 0.0, 1.0 );
        }

        // Dual-layer refracted underwater sunlight caustic network
        float whaleCaustics( vec2 uv, float time ) {
          vec2 p1 = uv * 0.82 + vec2( time * 0.42, -time * 0.31 );
          vec2 p2 = uv * 1.18 + vec2( -time * 0.36, time * 0.48 );
          float w1 = sin( p1.x * 3.1 + sin( p1.y * 2.7 + time * 0.9 ) )
                   * cos( p1.y * 3.3 - cos( p1.x * 2.5 - time * 0.7 ) );
          float w2 = sin( ( p2.x + p2.y ) * 2.6 + sin( p2.x * 2.2 - time * 1.1 ) )
                   * cos( ( p2.x - p2.y ) * 2.9 + cos( p2.y * 2.4 + time * 0.8 ) );
          float ridge1 = 1.0 - abs( w1 );
          float ridge2 = 1.0 - abs( w2 );
          float net = pow( clamp( ridge1 * ridge2, 1e-4, 1.0 ), 2.6 );
          return net;
        }
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        float whPoreField = whaleDermalPores( vRestPos );
        float whRakeMask = whaleRakeScars( vRestPos );
        float whBarnacleMask = whaleBarnacles( vRestPos );
        float whStreakMask = whaleRunoffStreaks( vRestPos, vWorldPos, vWorldNormal, uWetness, uTime );

        // Subtle epidermal pore tone variation
        diffuseColor.rgb *= 1.0 + whPoreField * 0.045;

        // Weathered pale cetacean rake-mark scars
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.75, 0.81, 0.86 ), whRakeMask * 0.58 );

        // Crusty ochre-white barnacle colonies on chin & leading-edge tubercles
        float barnacleTintMix = whaleNoise3( vRestPos * 32.0 );
        vec3 barnacleCol = mix( vec3( 0.68, 0.58, 0.43 ), vec3( 0.86, 0.83, 0.74 ), barnacleTintMix );
        diffuseColor.rgb = mix( diffuseColor.rgb, barnacleCol, whBarnacleMask * 0.82 );

        // Baleen plate keratine striations along gape when jawOpen > 0
        if ( uJawOpen > 0.01 && vRestPos.z > 2.95 && vRestPos.z < 7.08 ) {
          float gapeDy = ( vRestPos.y - 0.08 ) / 0.22;
          float gapeBand = exp( -gapeDy * gapeDy ) * clamp( uJawOpen * 2.0, 0.0, 1.0 );
          float baleenFibers = 0.5 + 0.5 * sin( vRestPos.z * 92.0 );
          vec3 baleenShade = mix( vec3( 0.13, 0.10, 0.08 ), vec3( 0.36, 0.27, 0.18 ), baleenFibers );
          diffuseColor.rgb = mix( diffuseColor.rgb, baleenShade, gapeBand * 0.35 );
        }
        `
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        // Micro-skin dermal pore breakup + rough crusty barnacles + glossy draining water streaks
        roughnessFactor = clamp(
          roughnessFactor
            + whPoreField * 0.04
            + whRakeMask * 0.06
            + whBarnacleMask * 0.48
            - whStreakMask * 0.22,
          0.04,
          0.95
        );
        `
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        #include <normal_fragment_maps>
        {
          float whRelief = whPoreField * 0.012 + whBarnacleMask * 0.055 - whRakeMask * 0.018 + whStreakMask * 0.010;
          vec3 dPosX = dFdx( vViewPosition );
          vec3 dPosY = dFdy( vViewPosition );
          float dHx = dFdx( whRelief );
          float dHy = dFdy( whRelief );
          vec3 r1 = cross( dPosY, normal );
          vec3 r2 = cross( normal, dPosX );
          float det = dot( dPosX, r1 );
          if ( abs( det ) > 1e-7 ) {
            vec3 surfGrad = sign( det ) * ( dHx * r1 + dHy * r2 );
            normal = normalize( abs( det ) * normal - surfGrad );
          }
        }
        `
      )
      .replace(
        '#include <lights_physical_fragment>',
        /* glsl */ `
        #include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat = clamp( material.clearcoat * ( 1.0 - whBarnacleMask * 0.72 ), 0.0, 1.0 );
          material.clearcoatRoughness = clamp(
            material.clearcoatRoughness - whStreakMask * 0.16 + whBarnacleMask * 0.35,
            0.03,
            1.0
          );
        #endif
        `
      )
      .replace(
        '#include <lights_fragment_end>',
        /* glsl */ `
        #include <lights_fragment_end>
        // Animated underwater sunlight caustic light ripples on submerged skin (vWorldPos.y < uWaterLevel)
        if ( vWorldPos.y < uWaterLevel ) {
          float submergeMask = smoothstep( uWaterLevel, uWaterLevel - 0.35, vWorldPos.y );
          float waterDepth = max( 0.0, uWaterLevel - vWorldPos.y );
          float depthAtten = exp( -waterDepth * 0.095 );
          vec3 worldN = normalize( vWorldNormal + vec3( 0.0, 1e-6, 0.0 ) );
          vec3 sunDir = normalize( uSunDirection + vec3( 0.0, 1e-6, 0.0 ) );
          float sunFacing = clamp( dot( worldN, sunDir ) * 0.65 + worldN.y * 0.45, 0.0, 1.0 );
          vec2 refractedXZ = vWorldPos.xz - sunDir.xz * ( waterDepth * 0.42 / max( 0.25, abs( sunDir.y ) ) );
          float causticVal = whaleCaustics( refractedXZ, uTime );
          vec3 causticTint = vec3( 0.36, 0.86, 0.96 );
          reflectedLight.directDiffuse += diffuseColor.rgb * causticTint * ( causticVal * submergeMask * depthAtten * sunFacing * 1.65 );
          reflectedLight.directSpecular += causticTint * ( causticVal * submergeMask * depthAtten * sunFacing * 0.22 );
        }
        `
      );
  };
}

/**
 * Creates the articulated 3D Humpback Whale scene rig with wet cetacean skin material,
 * glossy dark cetacean eyes, baleen inner-mouth cavity, custom skin/caustic/runoff shader,
 * right-handed YXZ breach orientation, real-time biomechanical deformation, and world-space splash anchors.
 */
export function createWhaleRig() {
  const whaleData = createWhaleGeometry();

  const shaderUniforms = {
    uTime: { value: 0 },
    uWetness: { value: 1.0 },
    uWaterLevel: { value: 0.0 },
    uSunDirection: { value: new THREE.Vector3(-0.45, 0.25, 0.85).normalize() },
    uJawOpen: { value: 0.0 },
  };

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
  installWhaleSkinShader(material, shaderUniforms);

  const mesh = new THREE.Mesh(whaleData.geometry, material);
  mesh.name = 'HumpbackWhaleMesh';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Glossy dark cetacean eyes positioned in the supraorbital sockets (z ~ 2.92, y ~ -0.02, x ~ +-halfWidth)
  const eyeGeometry = new THREE.SphereGeometry(0.068, 16, 12);
  const eyeMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0b0f14'),
    emissive: new THREE.Color('#040609'),
    roughness: 0.035,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.015,
    reflectivity: 0.96,
    envMapIntensity: 1.85,
  });

  const eyeL = new THREE.Mesh(eyeGeometry, eyeMaterial);
  eyeL.name = 'WhaleEyeL';
  eyeL.scale.set(0.58, 0.88, 1.14);

  const eyeR = new THREE.Mesh(eyeGeometry, eyeMaterial);
  eyeR.name = 'WhaleEyeR';
  eyeR.scale.set(0.58, 0.88, 1.14);

  // Articulated baleen & inner-mouth cavity mesh visible when jawOpen > 0
  const baleenData = createBaleenCavityMesh();

  const group = new THREE.Group();
  group.name = 'HumpbackWhaleRig';
  group.rotation.order = 'YXZ';
  group.add(mesh);
  group.add(eyeL);
  group.add(eyeR);
  group.add(baleenData.mesh);

  let currentAnimState = {
    spineArch: 0,
    tailBeatPhase: 0,
    tailBeatAmplitude: 0.5,
    finSpread: 0.5,
    jawOpen: 0,
  };

  const tmpVec = new THREE.Vector3();

  function syncHeadAttachments() {
    const { eyeRest, pivots } = whaleData.skinMeta;
    const spEye = evaluateSpineDeformation(
      eyeRest.left.z,
      currentAnimState.spineArch,
      currentAnimState.tailBeatPhase,
      currentAnimState.tailBeatAmplitude
    );
    const cosE = Math.cos(spEye.slopeAngle);
    const sinE = Math.sin(spEye.slopeAngle);
    const eyeY = spEye.dy + eyeRest.left.y * cosE;
    const eyeZ = eyeRest.left.z + spEye.dz - eyeRest.left.y * sinE;

    eyeL.position.set(eyeRest.left.x, eyeY, eyeZ);
    eyeL.rotation.set(-spEye.slopeAngle, 0.14, 0);

    eyeR.position.set(eyeRest.right.x, eyeY, eyeZ);
    eyeR.rotation.set(-spEye.slopeAngle, -0.14, 0);

    updateBaleenCavity(baleenData, currentAnimState, pivots.jaw);
  }

  function readWorldVertex(vertexIndex) {
    const posAttr = whaleData.geometry.getAttribute('position');
    return new THREE.Vector3(
      posAttr.getX(vertexIndex),
      posAttr.getY(vertexIndex),
      posAttr.getZ(vertexIndex)
    ).applyMatrix4(mesh.matrixWorld);
  }

  function readWorldStationList(stationMetaList, scaleFactor) {
    const posAttr = whaleData.geometry.getAttribute('position');
    return stationMetaList.map((st) => {
      tmpVec
        .set(
          posAttr.getX(st.vertexIndex),
          posAttr.getY(st.vertexIndex),
          posAttr.getZ(st.vertexIndex)
        )
        .applyMatrix4(mesh.matrixWorld);
      return {
        x: tmpVec.x,
        y: tmpVec.y,
        z: tmpVec.z,
        radius: st.radius * scaleFactor,
      };
    });
  }

  function update(breachState = {}, time = 0, envInfo = {}) {
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

    // Update custom shader uniforms safely (defaulting cleanly when envInfo is omitted)
    shaderUniforms.uTime.value = Number.isFinite(time) ? time : 0;
    shaderUniforms.uWetness.value = wetness;
    shaderUniforms.uJawOpen.value = clamp(currentAnimState.jawOpen, 0, 1.5);
    shaderUniforms.uWaterLevel.value = Number.isFinite(envInfo?.waterLevel)
      ? envInfo.waterLevel
      : 0.0;

    const sunDir = envInfo?.sunDirection;
    if (
      sunDir &&
      Number.isFinite(sunDir.x) &&
      Number.isFinite(sunDir.y) &&
      Number.isFinite(sunDir.z)
    ) {
      shaderUniforms.uSunDirection.value.set(sunDir.x, sunDir.y, sunDir.z);
      if (shaderUniforms.uSunDirection.value.lengthSq() > 1e-8) {
        shaderUniforms.uSunDirection.value.normalize();
      } else {
        shaderUniforms.uSunDirection.value.set(-0.45, 0.25, 0.85).normalize();
      }
    }

    deformWhaleGeometry(whaleData, currentAnimState);
    syncHeadAttachments();
    group.updateMatrixWorld(true);
  }

  function getWorldAnchors() {
    group.updateMatrixWorld(true);
    const meta = whaleData.skinMeta;
    const idx = meta.anchorIndices;

    const snout = readWorldVertex(idx.snout);
    const chin = readWorldVertex(idx.chin);
    const dorsal = readWorldVertex(idx.dorsal);
    const flipperL = readWorldVertex(idx.flipperL);
    const flipperR = readWorldVertex(idx.flipperR);
    const flukeL = readWorldVertex(idx.flukeL);
    const flukeR = readWorldVertex(idx.flukeR);

    // Dorsal blowhole (z = 3.70) & head dorsal up-direction in world space
    const bhRest = meta.blowholeRest;
    const bhSpine = evaluateSpineDeformation(
      bhRest.z,
      currentAnimState.spineArch,
      currentAnimState.tailBeatPhase,
      currentAnimState.tailBeatAmplitude
    );
    const cosBh = Math.cos(bhSpine.slopeAngle);
    const sinBh = Math.sin(bhSpine.slopeAngle);
    const blowhole = new THREE.Vector3(
      bhRest.x,
      bhSpine.dy + bhRest.y * cosBh,
      bhRest.z + bhSpine.dz - bhRest.y * sinBh
    ).applyMatrix4(mesh.matrixWorld);

    const upDir = new THREE.Vector3(0, cosBh, -sinBh)
      .transformDirection(mesh.matrixWorld)
      .normalize();

    const scaleFactor =
      Math.max(
        Math.abs(group.scale.x),
        Math.abs(group.scale.y),
        Math.abs(group.scale.z)
      ) || 1;

    const spineStations = meta.spineStations.map((st) => {
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

    const flipperTrailingL = readWorldStationList(meta.flipperTrailingL, scaleFactor);
    const flipperTrailingR = readWorldStationList(meta.flipperTrailingR, scaleFactor);
    const flukeTrailing = readWorldStationList(meta.flukeTrailing, scaleFactor);

    const eyeWorldL = eyeL.getWorldPosition(new THREE.Vector3());
    const eyeWorldR = eyeR.getWorldPosition(new THREE.Vector3());

    return {
      snout,
      chin,
      dorsal,
      blowhole,
      upDir,
      eyeL: eyeWorldL,
      eyeR: eyeWorldR,
      flipperL,
      flipperR,
      flukeL,
      flukeR,
      flipperTrailingL,
      flipperTrailingR,
      flukeTrailing,
      spineStations,
    };
  }

  // Initialize head attachments and world matrices in rest state
  syncHeadAttachments();
  group.updateMatrixWorld(true);

  return {
    group,
    mesh,
    eyes: { left: eyeL, right: eyeR },
    baleenMesh: baleenData.mesh,
    shaderUniforms,
    whaleData,
    update,
    getWorldAnchors,
  };
}
