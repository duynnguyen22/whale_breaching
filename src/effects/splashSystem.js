import * as THREE from 'three';

const SPRAY_POOL_SIZE = 4000;
const BUBBLE_POOL_SIZE = 900;
const FOAM_PATCH_POOL_SIZE = 8;
const GRAVITY = -9.81;

function createSpriteTexture(size = 64) {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (ctx) {
      const half = size * 0.5;
      const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
      grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.28, 'rgba(248, 253, 255, 0.88)');
      grad.addColorStop(0.62, 'rgba(225, 245, 252, 0.36)');
      grad.addColorStop(1.0, 'rgba(210, 238, 248, 0.0)');
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    }
  }

  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) * 0.5;
  const invHalf = 1 / Math.max(1, half);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) * invHalf;
      const dy = (y - half) * invHalf;
      const r = Math.min(1, Math.hypot(dx, dy));
      const falloff = Math.pow(1 - r * r, 2.2);
      const idx = (y * size + x) * 4;
      data[idx] = 248;
      data[idx + 1] = 253;
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(255 * falloff);
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function createSprayMaterial(spriteTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSprite: { value: spriteTexture },
      uSunColor: { value: new THREE.Color(0xfff1dc) },
      uTime: { value: 0 },
      uPixelScale: { value: 420.0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      attribute float aSeed;

      uniform float uPixelScale;

      varying float vAlpha;
      varying float vSeed;
      varying float vWorldY;

      void main() {
        vAlpha = aAlpha;
        vSeed = aSeed;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldY = worldPos.y;
        vec4 mvPosition = viewMatrix * worldPos;
        gl_Position = projectionMatrix * mvPosition;

        if (aAlpha <= 0.001 || aSize <= 0.001) {
          gl_PointSize = 0.0;
        } else {
          float dist = max(1.2, -mvPosition.z);
          gl_PointSize = clamp(aSize * uPixelScale / dist, 1.2, 92.0);
        }
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSprite;
      uniform vec3 uSunColor;
      uniform float uTime;

      varying float vAlpha;
      varying float vSeed;
      varying float vWorldY;

      void main() {
        if (vAlpha <= 0.001) discard;

        float angle = vSeed * 6.2831853 + uTime * (0.35 + 0.3 * fract(vSeed * 7.13));
        float ca = cos(angle);
        float sa = sin(angle);
        vec2 centered = gl_PointCoord - 0.5;
        vec2 rotatedUv = vec2(
          centered.x * ca - centered.y * sa,
          centered.x * sa + centered.y * ca
        ) + 0.5;

        vec4 texel = texture2D(uSprite, clamp(rotatedUv, 0.0, 1.0));
        float dist2 = dot(centered, centered) * 4.0;
        if (dist2 > 1.0) discard;

        // Subtle organic mist breakup toward outer rim while keeping crisp droplet core
        float lobe = 0.86 + 0.14 * sin(atan(centered.y, centered.x) * 5.0 + vSeed * 31.0);
        float alpha = texel.a * vAlpha * smoothstep(1.0, 0.15 * lobe, dist2);
        if (alpha <= 0.003) discard;

        vec3 baseFoam = vec3(0.68, 0.78, 0.84);
        vec3 sunLit = mix(vec3(0.85, 0.87, 0.90), uSunColor, 0.34);
        float heightGlow = clamp(0.45 + vWorldY * 0.06, 0.35, 1.0);
        vec3 color = mix(baseFoam * 0.88, sunLit, heightGlow * (0.65 + 0.35 * texel.a));

        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.95));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
}

function createBubbleMaterial(spriteTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSprite: { value: spriteTexture },
      uSunColor: { value: new THREE.Color(0xfff1dc) },
      uTime: { value: 0 },
      uPixelScale: { value: 320.0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      attribute float aSeed;

      uniform float uPixelScale;

      varying float vAlpha;
      varying float vSeed;

      void main() {
        vAlpha = aAlpha;
        vSeed = aSeed;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        if (aAlpha <= 0.001 || aSize <= 0.001) {
          gl_PointSize = 0.0;
        } else {
          float dist = max(1.0, -mvPosition.z);
          gl_PointSize = clamp(aSize * uPixelScale / dist, 1.0, 44.0);
        }
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSprite;
      uniform vec3 uSunColor;
      uniform float uTime;

      varying float vAlpha;
      varying float vSeed;

      void main() {
        if (vAlpha <= 0.001) discard;
        vec2 p = (gl_PointCoord - 0.5) * 2.0;
        float r2 = dot(p, p);
        if (r2 > 1.0) discard;

        float r = sqrt(r2);
        // Hollow air-bubble rim + specular glint near top-left
        float rim = smoothstep(0.28, 0.86, r) * (1.0 - smoothstep(0.86, 1.0, r));
        float spec = exp(-dot(p - vec2(-0.28, -0.32), p - vec2(-0.28, -0.32)) * 12.0);
        float shimmer = 0.82 + 0.18 * sin(uTime * 7.0 + vSeed * 43.0);
        float alpha = clamp((rim * 0.72 + spec * 0.85 + 0.12 * (1.0 - r2)) * vAlpha * shimmer, 0.0, 0.92);
        if (alpha <= 0.004) discard;

        vec3 tealTint = vec3(0.55, 0.92, 0.96);
        vec3 color = mix(tealTint, mix(vec3(1.0), uSunColor, 0.3), clamp(spec + rim * 0.45, 0.0, 1.0));
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function createUnderwaterSunbeams() {
  const group = new THREE.Group();
  group.name = 'underwaterSunbeams';

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunColor: { value: new THREE.Color(0xbef6ff) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vWorldY;

      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldY = worldPos.y;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunColor;

      varying vec2 vUv;
      varying float vWorldY;

      void main() {
        if (vWorldY > -0.15) discard;
        // Soft horizontal curtain with animated caustic rays
        float edgeFade = sin(vUv.x * 3.14159265);
        edgeFade = pow(max(0.0, edgeFade), 1.6);

        float topFade = smoothstep(-0.18, -2.4, vWorldY);
        float depthFade = 1.0 - smoothstep(-5.0, -22.0, vWorldY);

        float ray1 = 0.5 + 0.5 * sin(vUv.x * 19.0 + uTime * 0.9 + vWorldY * 0.12);
        float ray2 = 0.5 + 0.5 * sin(vUv.x * 33.0 - uTime * 1.35 - vWorldY * 0.08);
        float rays = pow(ray1 * 0.6 + ray2 * 0.4, 2.2);

        float alpha = edgeFade * topFade * depthFade * (0.035 + 0.075 * rays);
        if (alpha <= 0.001) discard;

        vec3 shaftColor = mix(vec3(0.14, 0.68, 0.78), uSunColor, 0.42);
        gl_FragColor = vec4(shaftColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const shaftSpecs = [
    { x: -3.2, z: -2.0, width: 7.5, height: 20.0, rotY: 0.35, tiltX: 0.14, tiltZ: -0.1 },
    { x: 1.8, z: 1.5, width: 8.5, height: 21.0, rotY: -0.62, tiltX: 0.12, tiltZ: 0.09 },
    { x: 5.0, z: 6.0, width: 7.0, height: 19.5, rotY: 1.08, tiltX: -0.11, tiltZ: 0.13 },
    { x: -1.5, z: 7.2, width: 6.5, height: 18.5, rotY: -1.45, tiltX: 0.1, tiltZ: -0.08 },
  ];

  for (const spec of shaftSpecs) {
    const geom = new THREE.PlaneGeometry(spec.width, spec.height, 1, 1);
    // Shift geometry so top sits safely below y = -0.35 even when tilted
    geom.translate(0, -spec.height * 0.5 - 0.85, 0);
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.set(spec.x, 0, spec.z);
    mesh.rotation.set(spec.tiltX, spec.rotY, spec.tiltZ);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  group.userData.material = material;
  return group;
}

function createFoamPatchPool(poolSize = FOAM_PATCH_POOL_SIZE) {
  const foamGroup = new THREE.Group();
  foamGroup.name = 'foamRings';

  const radialRings = 24;
  const angularSegs = 64;
  const vertCount = 1 + radialRings * angularSegs;

  const baseUnitX = new Float32Array(vertCount);
  const baseUnitZ = new Float32Array(vertCount);
  const baseUvs = new Float32Array(vertCount * 2);
  const indices = [];

  baseUnitX[0] = 0;
  baseUnitZ[0] = 0;
  baseUvs[0] = 0;
  baseUvs[1] = 0;

  let ptr = 1;
  for (let r = 1; r <= radialRings; r++) {
    const radFrac = r / radialRings;
    for (let a = 0; a < angularSegs; a++) {
      const angFrac = a / angularSegs;
      const theta = angFrac * Math.PI * 2;
      const ux = Math.cos(theta) * radFrac;
      const uz = Math.sin(theta) * radFrac;
      baseUnitX[ptr] = ux;
      baseUnitZ[ptr] = uz;
      baseUvs[ptr * 2] = ux;
      baseUvs[ptr * 2 + 1] = uz;
      ptr++;
    }
  }

  for (let a = 0; a < angularSegs; a++) {
    const aNext = (a + 1) % angularSegs;
    indices.push(0, 1 + aNext, 1 + a);
  }

  for (let r = 1; r < radialRings; r++) {
    const rowA = 1 + (r - 1) * angularSegs;
    const rowB = 1 + r * angularSegs;
    for (let a = 0; a < angularSegs; a++) {
      const aNext = (a + 1) % angularSegs;
      const a0 = rowA + a;
      const a1 = rowA + aNext;
      const b0 = rowB + a;
      const b1 = rowB + aNext;
      indices.push(a0, a1, b0);
      indices.push(a1, b1, b0);
    }
  }

  const patches = [];
  for (let i = 0; i < poolSize; i++) {
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(vertCount * 3);
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(baseUvs.slice(), 2));
    geom.setIndex(indices);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uAgeNorm: { value: 0 },
        uOpacity: { value: 0 },
        uSeed: { value: i * 1.73 + 0.37 },
        uSunColor: { value: new THREE.Color(0xfff1dc) },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUnitPos;
        varying vec3 vWorldPos;

        void main() {
          vUnitPos = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uAgeNorm;
        uniform float uOpacity;
        uniform float uSeed;
        uniform vec3 uSunColor;
        uniform float uTime;

        varying vec2 vUnitPos;
        varying vec3 vWorldPos;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbm(vec2 p) {
          float sum = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            sum += amp * noise2(p);
            p *= 2.07;
            amp *= 0.5;
          }
          return sum;
        }

        void main() {
          if (uOpacity <= 0.002) discard;
          if (cameraPosition.y < vWorldPos.y - 0.08) discard;

          float r = length(vUnitPos);
          if (r > 1.0) discard;
          vec2 p = vUnitPos * 5.5 + vec2(uSeed * 3.1, -uTime * 0.18);

          float n = fbm(p) * 0.7 + fbm(p * 2.3 - uTime * 0.25) * 0.3;
          float ringCenter = mix(0.42, 0.78, uAgeNorm);
          float ringDelta = (r - ringCenter) / 0.22;
          float ringBand = exp(-ringDelta * ringDelta);
          float innerBoil = (1.0 - smoothstep(0.0, 0.68, r)) * (1.0 - uAgeNorm * 0.65);

          float lace = smoothstep(0.32 + uAgeNorm * 0.24, 0.82, n * 0.72 + ringBand * 0.58 + innerBoil * 0.42);
          float outerFade = 1.0 - smoothstep(0.76, 1.0, r);
          float alpha = lace * outerFade * uOpacity;
          if (alpha <= 0.004) discard;

          vec3 turquoiseFoam = vec3(0.48, 0.74, 0.78);
          vec3 whiteCrest = mix(vec3(0.82, 0.85, 0.88), uSunColor, 0.26);
          vec3 col = mix(turquoiseFoam, whiteCrest, clamp(lace * 1.15, 0.0, 1.0));
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.88));
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.userData = {
      active: false,
      cx: 0,
      cz: 0,
      startTime: null,
      elapsed: 0,
      duration: 6.0,
      minRadius: 2.2,
      maxRadius: 11.0,
      currentRadius: 0,
      peakOpacity: 0.85,
    };
    foamGroup.add(mesh);
    patches.push({ mesh, geom, mat, pos });
  }

  return {
    foamGroup,
    patches,
    baseUnitX,
    baseUnitZ,
    vertCount,
    cursor: 0,
  };
}

function createParticlePool(count, material, name) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3 + 1] = -999;
    sizes[i] = 0;
    alphas[i] = 0;
    seeds[i] = ((i * 0.61803398875) % 1 + 1) % 1;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const points = new THREE.Points(geometry, material);
  points.name = name;
  points.frustumCulled = false;

  return {
    count,
    points,
    geometry,
    positions,
    sizes,
    alphas,
    seeds,
    velocities: new Float32Array(count * 3),
    ages: new Float32Array(count),
    lifetimes: new Float32Array(count),
    baseSizes: new Float32Array(count),
    growthRates: new Float32Array(count),
    drags: new Float32Array(count),
    gravityScales: new Float32Array(count),
    baseAlphas: new Float32Array(count),
    cursor: 0,
  };
}

function createRng(seed = 0x51a54) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function spawnParticle(pool, opts) {
  const idx = pool.cursor;
  pool.cursor = (pool.cursor + 1) % pool.count;

  const i3 = idx * 3;
  pool.positions[i3] = opts.x;
  pool.positions[i3 + 1] = opts.y;
  pool.positions[i3 + 2] = opts.z;

  pool.velocities[i3] = opts.vx;
  pool.velocities[i3 + 1] = opts.vy;
  pool.velocities[i3 + 2] = opts.vz;

  pool.ages[idx] = 0;
  pool.lifetimes[idx] = opts.lifetime;
  pool.baseSizes[idx] = opts.size;
  pool.growthRates[idx] = opts.growth ?? 0.6;
  pool.drags[idx] = opts.drag ?? 0.55;
  pool.gravityScales[idx] = opts.gravityScale ?? 1.0;
  pool.baseAlphas[idx] = opts.alpha ?? 0.85;

  pool.sizes[idx] = opts.size;
  pool.alphas[idx] = opts.alpha ?? 0.85;
}

function deactivateParticle(pool, idx) {
  pool.lifetimes[idx] = 0;
  pool.alphas[idx] = 0;
  pool.sizes[idx] = 0;
  pool.positions[idx * 3 + 1] = -999;
}

export function createSplashSystem() {
  const group = new THREE.Group();
  group.name = 'splashSystem';

  const rand = createRng(133791);
  const spriteTexture = createSpriteTexture(64);
  const sprayMaterial = createSprayMaterial(spriteTexture);
  const bubbleMaterial = createBubbleMaterial(spriteTexture);

  const sprayPool = createParticlePool(SPRAY_POOL_SIZE, sprayMaterial, 'sprayParticles');
  const bubblePool = createParticlePool(BUBBLE_POOL_SIZE, bubbleMaterial, 'cavitationBubbles');
  const foamPool = createFoamPatchPool(FOAM_PATCH_POOL_SIZE);
  const sunbeams = createUnderwaterSunbeams();

  group.add(sunbeams);
  group.add(bubblePool.points);
  group.add(foamPool.foamGroup);
  group.add(sprayPool.points);

  let lastWaterHeightFn = () => 0;

  function emitCount(expected) {
    const whole = Math.floor(expected);
    return whole + (rand() < expected - whole ? 1 : 0);
  }

  function spawnFoamPatch({
    x = 0,
    z = 0,
    startTime = null,
    minRadius = 2.2,
    maxRadius = 11.5,
    duration = 6.0,
    peakOpacity = 0.85,
  }) {
    const slot = foamPool.patches[foamPool.cursor];
    foamPool.cursor = (foamPool.cursor + 1) % foamPool.patches.length;

    const { mesh } = slot;
    mesh.visible = true;
    mesh.position.set(x, 0, z);
    mesh.userData.active = true;
    mesh.userData.cx = x;
    mesh.userData.cz = z;
    mesh.userData.startTime = Number.isFinite(startTime) ? startTime : null;
    mesh.userData.elapsed = 0;
    mesh.userData.duration = duration;
    mesh.userData.minRadius = minRadius;
    mesh.userData.maxRadius = maxRadius;
    mesh.userData.currentRadius = minRadius;
    mesh.userData.peakOpacity = peakOpacity;
  }

  function triggerBreakthrough(event = {}) {
    const cx = Number.isFinite(event.x) ? event.x : 0;
    const cz = Number.isFinite(event.z) ? event.z : 0;
    const strength = Number.isFinite(event.strength) ? event.strength : 1.2;

    spawnFoamPatch({
      x: cx,
      z: cz,
      startTime: event.startTime,
      minRadius: 2.0,
      maxRadius: 10.5 * Math.min(1.35, 0.75 + 0.25 * strength),
      duration: 6.0,
      peakOpacity: 0.82,
    });

    const burstCount = 260;
    for (let i = 0; i < burstCount; i++) {
      const angle = rand() * Math.PI * 2;
      const r = 0.7 + rand() * 2.1;
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);
      const x = cx + dirX * r;
      const z = cz + dirZ * r;
      const waterY = lastWaterHeightFn(x, z);
      const isMist = rand() < 0.35;
      const outSpeed = (1.8 + rand() * 4.2) * Math.min(1.4, strength);
      const upSpeed = (5.2 + rand() * 6.8) * Math.min(1.35, 0.7 + 0.3 * strength);

      spawnParticle(sprayPool, {
        x,
        y: waterY + 0.08 + rand() * 0.2,
        z,
        vx: dirX * outSpeed,
        vy: isMist ? upSpeed * 0.75 : upSpeed,
        vz: dirZ * outSpeed,
        size: isMist ? 0.55 + rand() * 0.75 : 0.22 + rand() * 0.36,
        growth: isMist ? 2.1 : 0.85,
        alpha: isMist ? 0.38 + rand() * 0.24 : 0.74 + rand() * 0.22,
        lifetime: 1.1 + rand() * 1.1,
        drag: isMist ? 1.25 : 0.38,
        gravityScale: isMist ? 0.65 : 1.0,
      });
    }

    sprayPool.geometry.attributes.position.needsUpdate = true;
    sprayPool.geometry.attributes.aSize.needsUpdate = true;
    sprayPool.geometry.attributes.aAlpha.needsUpdate = true;
  }

  function triggerSplashdown(event = {}) {
    const cx = Number.isFinite(event.x) ? event.x : 0;
    const cz = Number.isFinite(event.z) ? event.z : 0;
    const strength = Number.isFinite(event.strength) ? event.strength : 1.75;
    const scale = Math.min(1.25, Math.max(0.85, strength / 1.75));

    spawnFoamPatch({
      x: cx,
      z: cz,
      startTime: event.startTime,
      minRadius: 2.8,
      maxRadius: 14.8 * scale,
      duration: 6.0,
      peakOpacity: 0.92,
    });

    // 1. Vertical 12-meter central geyser plume
    const plumeCount = 420;
    for (let i = 0; i < plumeCount; i++) {
      const angle = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 2.1;
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);
      const x = cx + dirX * r;
      const z = cz + dirZ * r;
      const waterY = lastWaterHeightFn(x, z);
      const isMist = rand() < 0.3;
      const radialSpeed = (0.6 + rand() * 2.4) * scale;
      // Calibrated with drag = 0.22 and g = -9.81 so top of plume reaches ~12m above waterY
      const vy = (10.5 + Math.pow(rand(), 0.62) * 7.1) * scale;

      spawnParticle(sprayPool, {
        x,
        y: waterY + 0.1 + rand() * 0.3,
        z,
        vx: dirX * radialSpeed,
        vy: isMist ? vy * 0.8 : vy,
        vz: dirZ * radialSpeed,
        size: isMist ? 0.72 + rand() * 0.95 : 0.28 + rand() * 0.45,
        growth: isMist ? 2.4 : 0.95,
        alpha: isMist ? 0.42 + rand() * 0.24 : 0.78 + rand() * 0.2,
        lifetime: 2.2 + rand() * 1.3,
        drag: isMist ? 0.85 : 0.22,
        gravityScale: isMist ? 0.72 : 1.0,
      });
    }

    // 2. Inclined 360-degree whitewater impact crown
    const crownCount = 520;
    for (let i = 0; i < crownCount; i++) {
      const angle = (i / crownCount) * Math.PI * 2 + (rand() - 0.5) * 0.08;
      const collarR = 2.0 + rand() * 1.9;
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);
      const x = cx + dirX * collarR;
      const z = cz + dirZ * collarR;
      const waterY = lastWaterHeightFn(x, z);
      const isMist = rand() < 0.36;
      const crownOut = (4.2 + rand() * 5.8) * scale;
      const crownUp = (6.5 + rand() * 6.4) * scale;

      spawnParticle(sprayPool, {
        x,
        y: waterY + 0.08 + rand() * 0.22,
        z,
        vx: dirX * crownOut,
        vy: isMist ? crownUp * 0.72 : crownUp,
        vz: dirZ * crownOut,
        size: isMist ? 0.65 + rand() * 0.85 : 0.24 + rand() * 0.42,
        growth: isMist ? 2.2 : 0.9,
        alpha: isMist ? 0.4 + rand() * 0.25 : 0.76 + rand() * 0.22,
        lifetime: 1.6 + rand() * 1.2,
        drag: isMist ? 1.1 : 0.36,
        gravityScale: isMist ? 0.68 : 1.0,
      });
    }

    // 3. Underwater impact cavitation cloud
    for (let i = 0; i < 160; i++) {
      const angle = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 3.4;
      const x = cx + Math.cos(angle) * r;
      const z = cz + Math.sin(angle) * r;
      const waterY = lastWaterHeightFn(x, z);
      spawnParticle(bubblePool, {
        x,
        y: waterY - 0.4 - rand() * 4.2,
        z,
        vx: Math.cos(angle) * (0.4 + rand() * 1.6),
        vy: 1.1 + rand() * 2.1,
        vz: Math.sin(angle) * (0.4 + rand() * 1.6),
        size: 0.09 + rand() * 0.19,
        growth: 0.45,
        alpha: 0.58 + rand() * 0.34,
        lifetime: 2.0 + rand() * 2.2,
        drag: 0.95,
        gravityScale: 1.0,
      });
    }

    sprayPool.geometry.attributes.position.needsUpdate = true;
    sprayPool.geometry.attributes.aSize.needsUpdate = true;
    sprayPool.geometry.attributes.aAlpha.needsUpdate = true;
    bubblePool.geometry.attributes.position.needsUpdate = true;
    bubblePool.geometry.attributes.aSize.needsUpdate = true;
    bubblePool.geometry.attributes.aAlpha.needsUpdate = true;
  }

  function emitDomeBoil(dt, dome, safeWaterHeight) {
    if (!dome || !(dome.height > 0.25) || !(dome.radius > 0)) return;
    const strength = Math.min(1.6, (dome.height - 0.25) / 1.1);
    const count = emitCount(dt * (420 + 620 * strength));
    const cx = dome.x ?? 0;
    const cz = dome.z ?? 0;

    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * dome.radius * 0.76;
      const x = cx + Math.cos(angle) * dist;
      const z = cz + Math.sin(angle) * dist;
      const waterY = safeWaterHeight(x, z);
      const radialSpeed = (0.7 + rand() * 2.1) * (0.5 + strength * 0.6);

      spawnParticle(sprayPool, {
        x,
        y: waterY + 0.03 + rand() * 0.09,
        z,
        vx: Math.cos(angle) * radialSpeed,
        vy: 1.3 + rand() * 2.8 * (0.55 + strength * 0.65),
        vz: Math.sin(angle) * radialSpeed,
        size: 0.24 + rand() * 0.42,
        growth: 1.25,
        alpha: 0.48 + rand() * 0.34,
        lifetime: 0.38 + rand() * 0.48,
        drag: 1.35,
        gravityScale: 0.85,
      });
    }
  }

  function emitSpineCurtain(dt, breachState, whaleAnchors, safeWaterHeight) {
    const stations = whaleAnchors?.spineStations;
    if (!Array.isArray(stations) || stations.length === 0) return;

    const emergence = breachState?.emergenceIntensity ?? 0;
    const splashdown = breachState?.splashdownIntensity ?? 0;
    const whaleVel = breachState?.velocity ?? { x: 0, y: 0, z: 0 };
    const domeHeight = breachState?.waterDome?.height ?? 0;
    const velY = whaleVel.y ?? 0;

    // Early rostrum/jaw breakthrough drive while snout pierces the rising water dome (progress ~0.19..0.24)
    const rostrumPierce =
      domeHeight > 0.25 && velY > 4.0
        ? Math.min(1.0, ((domeHeight - 0.25) / 0.75) * Math.min(1.0, (velY - 3.5) / 4.5))
        : 0;

    const intensity = Math.max(emergence, splashdown, rostrumPierce);
    if (intensity <= 0.05) return;

    const upwardBoost = Math.max(0, velY) * 0.42;

    for (let s = 0; s < stations.length; s++) {
      const st = stations[s];
      if (!st) continue;
      const radius = Math.max(0.2, st.radius ?? 0.8);
      const waterY = safeWaterHeight(st.x, st.z);
      const band = radius * 1.75 + 1.25;
      const distY = Math.abs(st.y - waterY);
      if (distY > band) continue;

      const proximity = 1 - distY / band;
      const count = emitCount(dt * intensity * (0.5 + 0.5 * proximity) * (220 + 380 * radius));

      for (let i = 0; i < count; i++) {
        const angle = rand() * Math.PI * 2;
        const collarR = radius * (0.78 + rand() * 0.42);
        const dirX = Math.cos(angle);
        const dirZ = Math.sin(angle);
        const x = st.x + dirX * collarR;
        const z = st.z + dirZ * collarR;
        const localWaterY = safeWaterHeight(x, z);

        const isMist = rand() < 0.34;
        const radialOut = (1.8 + rand() * 4.0) * (0.58 + 0.55 * radius) * intensity;
        const jetUp =
          (4.0 + rand() * 6.4) * (0.62 + 0.45 * radius) * intensity +
          upwardBoost * (0.5 + 0.55 * rand());

        spawnParticle(sprayPool, {
          x,
          y: localWaterY + 0.06 + rand() * 0.16,
          z,
          vx: dirX * radialOut + (whaleVel.x ?? 0) * 0.18,
          vy: isMist ? jetUp * 0.74 : jetUp,
          vz: dirZ * radialOut + (whaleVel.z ?? 0) * 0.18,
          size: (isMist ? 0.56 + rand() * 0.72 : 0.24 + rand() * 0.4) * (0.68 + 0.35 * radius),
          growth: isMist ? 1.95 : 0.8,
          alpha: isMist ? 0.48 + rand() * 0.26 : 0.78 + rand() * 0.2,
          lifetime: isMist ? 0.9 + rand() * 0.85 : 0.8 + rand() * 0.95,
          drag: isMist ? 1.35 : 0.44,
          gravityScale: isMist ? 0.62 : 1.0,
        });
      }
    }
  }

  const SHED_ANCHOR_KEYS = ['flipperL', 'flipperR', 'chin', 'flukeL', 'flukeR'];

  function emitAirborneShedding(dt, breachState, whaleAnchors, safeWaterHeight) {
    if (!whaleAnchors) return;
    const shedIntensity =
      breachState?.bodyShedIntensity !== undefined ? breachState.bodyShedIntensity : 0.75;
    if (shedIntensity <= 0.02) return;

    const whaleVel = breachState?.velocity ?? { x: 0, y: 0, z: 0 };

    for (let k = 0; k < SHED_ANCHOR_KEYS.length; k++) {
      const anchor = whaleAnchors[SHED_ANCHOR_KEYS[k]];
      if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) continue;

      const waterY = safeWaterHeight(anchor.x, anchor.z);
      if (anchor.y <= waterY + 0.4) continue;

      const heightFactor = Math.min(1.5, 0.6 + (anchor.y - waterY) * 0.12);
      const count = emitCount(dt * (85 + 145 * shedIntensity) * heightFactor);

      for (let i = 0; i < count; i++) {
        const isMist = rand() < 0.28;
        const spread = 0.28;
        const ox = (rand() - 0.5) * spread * 2;
        const oy = (rand() - 0.5) * spread;
        const oz = (rand() - 0.5) * spread * 2;

        spawnParticle(sprayPool, {
          x: anchor.x + ox,
          y: Math.max(waterY + 0.15, anchor.y + oy),
          z: anchor.z + oz,
          vx: (whaleVel.x ?? 0) * 0.28 + (rand() - 0.5) * 1.4,
          vy: Math.min(1.2, (whaleVel.y ?? 0) * 0.2) - rand() * 0.85,
          vz: (whaleVel.z ?? 0) * 0.28 + (rand() - 0.5) * 1.4,
          size: isMist ? 0.26 + rand() * 0.32 : 0.11 + rand() * 0.16,
          growth: isMist ? 1.4 : 0.35,
          alpha: isMist ? 0.34 + rand() * 0.2 : 0.72 + rand() * 0.22,
          lifetime: 2.2 + rand() * 0.8,
          drag: isMist ? 0.95 : 0.32,
          gravityScale: 1.0,
        });
      }
    }
  }

  function integrateSpray(dt, safeWaterHeight) {
    if (!(dt > 0)) return;
    let dirty = false;

    for (let i = 0; i < sprayPool.count; i++) {
      const life = sprayPool.lifetimes[i];
      if (life <= 0) continue;
      dirty = true;

      const age = sprayPool.ages[i] + dt;
      if (age >= life) {
        deactivateParticle(sprayPool, i);
        continue;
      }
      sprayPool.ages[i] = age;

      const i3 = i * 3;
      const damp = Math.exp(-sprayPool.drags[i] * dt);
      let vx = sprayPool.velocities[i3] * damp;
      let vy = (sprayPool.velocities[i3 + 1] + GRAVITY * sprayPool.gravityScales[i] * dt) * damp;
      let vz = sprayPool.velocities[i3 + 2] * damp;

      const x = sprayPool.positions[i3] + vx * dt;
      let y = sprayPool.positions[i3 + 1] + vy * dt;
      const z = sprayPool.positions[i3 + 2] + vz * dt;

      const waterY = safeWaterHeight(x, z);
      if (y <= waterY) {
        if (age < 0.12 && vy > 0) {
          y = waterY + 0.03;
        } else {
          deactivateParticle(sprayPool, i);
          continue;
        }
      }

      sprayPool.velocities[i3] = vx;
      sprayPool.velocities[i3 + 1] = vy;
      sprayPool.velocities[i3 + 2] = vz;

      sprayPool.positions[i3] = x;
      sprayPool.positions[i3 + 1] = y;
      sprayPool.positions[i3 + 2] = z;

      const t = age / life;
      const fadeIn = Math.min(1, t * 8.0);
      const fadeOut = Math.pow(1 - t, 1.3);
      sprayPool.sizes[i] = sprayPool.baseSizes[i] * (1 + sprayPool.growthRates[i] * t);
      sprayPool.alphas[i] = sprayPool.baseAlphas[i] * fadeIn * fadeOut;
    }

    if (dirty) {
      sprayPool.geometry.attributes.position.needsUpdate = true;
      sprayPool.geometry.attributes.aSize.needsUpdate = true;
      sprayPool.geometry.attributes.aAlpha.needsUpdate = true;
    }
  }

  const BUBBLE_ANCHOR_KEYS = ['flukeL', 'flukeR', 'flipperL', 'flipperR', 'snout', 'dorsal'];

  function emitUnderwaterBubbles(dt, whaleAnchors, safeWaterHeight) {
    if (!whaleAnchors || !(dt > 0)) return;

    const candidates = [];
    for (let k = 0; k < BUBBLE_ANCHOR_KEYS.length; k++) {
      const a = whaleAnchors[BUBBLE_ANCHOR_KEYS[k]];
      if (a && Number.isFinite(a.x) && Number.isFinite(a.y)) {
        candidates.push({ x: a.x, y: a.y, z: a.z, radius: 0.45 });
      }
    }

    if (Array.isArray(whaleAnchors.spineStations)) {
      for (let s = 0; s < whaleAnchors.spineStations.length; s++) {
        const st = whaleAnchors.spineStations[s];
        if (st && Number.isFinite(st.x) && Number.isFinite(st.y)) {
          candidates.push({ x: st.x, y: st.y, z: st.z, radius: st.radius ?? 0.8 });
        }
      }
    }

    for (let c = 0; c < candidates.length; c++) {
      const pt = candidates[c];
      const waterY = safeWaterHeight(pt.x, pt.z);
      if (pt.y >= waterY - 0.15) continue;

      const count = emitCount(dt * 52);
      const spread = Math.max(0.25, pt.radius * 0.75);
      for (let i = 0; i < count; i++) {
        const angle = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * spread;
        spawnParticle(bubblePool, {
          x: pt.x + Math.cos(angle) * r,
          y: Math.min(waterY - 0.12, pt.y + (rand() - 0.5) * 0.4),
          z: pt.z + Math.sin(angle) * r,
          vx: (rand() - 0.5) * 0.85,
          vy: 0.9 + rand() * 1.35,
          vz: (rand() - 0.5) * 0.85,
          size: 0.07 + rand() * 0.16,
          growth: 0.55,
          alpha: 0.55 + rand() * 0.35,
          lifetime: 2.2 + rand() * 2.4,
          drag: 1.15,
          gravityScale: 1.0,
        });
      }
    }
  }

  function integrateBubbles(dt, time, safeWaterHeight) {
    if (!(dt > 0)) return;
    let dirty = false;

    for (let i = 0; i < bubblePool.count; i++) {
      const life = bubblePool.lifetimes[i];
      if (life <= 0) continue;
      dirty = true;

      const age = bubblePool.ages[i] + dt;
      if (age >= life) {
        deactivateParticle(bubblePool, i);
        continue;
      }
      bubblePool.ages[i] = age;

      const i3 = i * 3;
      const seed = bubblePool.seeds[i];
      const damp = Math.exp(-bubblePool.drags[i] * dt);
      const wobbleX = Math.cos(time * 4.5 + seed * 37.0) * 0.9;
      const wobbleZ = Math.sin(time * 4.1 + seed * 29.0) * 0.9;

      const vx = (bubblePool.velocities[i3] + wobbleX * dt) * damp;
      const vy = (bubblePool.velocities[i3 + 1] + 2.35 * dt) * damp;
      const vz = (bubblePool.velocities[i3 + 2] + wobbleZ * dt) * damp;

      const x = bubblePool.positions[i3] + vx * dt;
      const y = bubblePool.positions[i3 + 1] + vy * dt;
      const z = bubblePool.positions[i3 + 2] + vz * dt;

      const waterY = safeWaterHeight(x, z);
      if (y >= waterY - 0.04) {
        deactivateParticle(bubblePool, i);
        continue;
      }

      bubblePool.velocities[i3] = vx;
      bubblePool.velocities[i3 + 1] = vy;
      bubblePool.velocities[i3 + 2] = vz;

      bubblePool.positions[i3] = x;
      bubblePool.positions[i3 + 1] = y;
      bubblePool.positions[i3 + 2] = z;

      const t = age / life;
      const fadeIn = Math.min(1, t * 7.0);
      const fadeOut = Math.pow(1 - t, 1.15);
      bubblePool.sizes[i] = bubblePool.baseSizes[i] * (1 + bubblePool.growthRates[i] * t);
      bubblePool.alphas[i] = bubblePool.baseAlphas[i] * fadeIn * fadeOut;
    }

    if (dirty) {
      bubblePool.geometry.attributes.position.needsUpdate = true;
      bubblePool.geometry.attributes.aSize.needsUpdate = true;
      bubblePool.geometry.attributes.aAlpha.needsUpdate = true;
    }
  }

  function updateFoamPatches(dt, time, safeWaterHeight, sunColor) {
    const { patches, baseUnitX, baseUnitZ, vertCount } = foamPool;

    for (let p = 0; p < patches.length; p++) {
      const slot = patches[p];
      const { mesh, geom, mat, pos } = slot;
      if (!mesh.userData.active) continue;

      mesh.userData.elapsed += dt;
      const age =
        mesh.userData.startTime !== null && time >= mesh.userData.startTime
          ? Math.max(mesh.userData.elapsed, time - mesh.userData.startTime)
          : mesh.userData.elapsed;

      const duration = mesh.userData.duration;
      if (age >= duration) {
        mesh.userData.active = false;
        mesh.visible = false;
        mat.uniforms.uOpacity.value = 0;
        continue;
      }

      const t = Math.min(1, Math.max(0, age / duration));
      const easeOut = 1 - Math.pow(1 - t, 2.15);
      const currentRadius =
        mesh.userData.minRadius + (mesh.userData.maxRadius - mesh.userData.minRadius) * easeOut;
      mesh.userData.currentRadius = currentRadius;

      const cx = mesh.userData.cx;
      const cz = mesh.userData.cz;
      mesh.position.set(cx, 0, cz);

      for (let v = 0; v < vertCount; v++) {
        const lx = baseUnitX[v] * currentRadius;
        const lz = baseUnitZ[v] * currentRadius;
        const wy = safeWaterHeight(cx + lx, cz + lz) + 0.06;
        pos[v * 3] = lx;
        pos[v * 3 + 1] = wy;
        pos[v * 3 + 2] = lz;
      }
      geom.attributes.position.needsUpdate = true;

      const fadeIn = Math.min(1, t * 14.0);
      const fadeOut = Math.pow(1 - t, 1.45);
      mat.uniforms.uAgeNorm.value = t;
      mat.uniforms.uOpacity.value = mesh.userData.peakOpacity * fadeIn * fadeOut;
      mat.uniforms.uTime.value = time;
      if (sunColor) {
        mat.uniforms.uSunColor.value.set(sunColor);
      }
    }
  }

  function update({
    dt = 1 / 60,
    time = 0,
    breachState,
    whaleAnchors,
    getWaterHeight,
    sunColor,
  } = {}) {
    const clampedDt = Math.min(Math.max(dt, 0), 0.1);
    const safeWaterHeight =
      typeof getWaterHeight === 'function' ? getWaterHeight : lastWaterHeightFn;
    lastWaterHeightFn = safeWaterHeight;

    sprayMaterial.uniforms.uTime.value = time;
    bubbleMaterial.uniforms.uTime.value = time;
    sunbeams.userData.material.uniforms.uTime.value = time;
    if (sunColor) {
      sprayMaterial.uniforms.uSunColor.value.set(sunColor);
      bubbleMaterial.uniforms.uSunColor.value.set(sunColor);
    }

    integrateSpray(clampedDt, safeWaterHeight);
    emitDomeBoil(clampedDt, breachState?.waterDome, safeWaterHeight);
    emitSpineCurtain(clampedDt, breachState, whaleAnchors, safeWaterHeight);
    emitAirborneShedding(clampedDt, breachState, whaleAnchors, safeWaterHeight);

    integrateBubbles(clampedDt, time, safeWaterHeight);
    emitUnderwaterBubbles(clampedDt, whaleAnchors, safeWaterHeight);
    updateFoamPatches(clampedDt, time, safeWaterHeight, sunColor);

    sprayPool.geometry.attributes.position.needsUpdate = true;
    sprayPool.geometry.attributes.aSize.needsUpdate = true;
    sprayPool.geometry.attributes.aAlpha.needsUpdate = true;
    bubblePool.geometry.attributes.position.needsUpdate = true;
    bubblePool.geometry.attributes.aSize.needsUpdate = true;
    bubblePool.geometry.attributes.aAlpha.needsUpdate = true;
  }

  return {
    group,
    triggerBreakthrough,
    triggerSplashdown,
    update,
  };
}
