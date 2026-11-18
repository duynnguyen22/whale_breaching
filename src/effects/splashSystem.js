import * as THREE from 'three';

const SPRAY_POOL_SIZE = 4400;
const BUBBLE_POOL_SIZE = 900;
const SPOUT_POOL_SIZE = 650;
const FOAM_PATCH_POOL_SIZE = 12;
const GRAVITY = -9.81;

const SPOUT_WIND_X = 1.45;
const SPOUT_WIND_Y = 0.26;
const SPOUT_WIND_Z = 0.72;

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
      attribute vec3 aVelocity;

      uniform float uPixelScale;

      varying float vAlpha;
      varying float vSeed;
      varying float vWorldY;
      varying vec2 vScreenVelDir;
      varying float vStretch;

      void main() {
        vAlpha = aAlpha;
        vSeed = aSeed;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldY = worldPos.y;
        vec4 mvPosition = viewMatrix * worldPos;
        vec4 clip0 = projectionMatrix * mvPosition;
        gl_Position = clip0;

        vec3 worldVel = mat3(modelMatrix) * aVelocity;
        vec3 viewVel = mat3(viewMatrix) * worldVel;
        vec4 clip1 = projectionMatrix * (mvPosition + vec4(viewVel * 0.035, 0.0));
        vec2 ndc0 = clip0.xy / max(0.1, abs(clip0.w));
        vec2 ndc1 = clip1.xy / max(0.1, abs(clip1.w));
        vec2 screenDelta = vec2(ndc1.x - ndc0.x, -(ndc1.y - ndc0.y));
        float screenLen = length(screenDelta);
        float speed = length(worldVel);

        // Fast ballistic spray stretches along screen-projected velocity into ragged liquid ligaments;
        // slow drifting mist keeps vStretch = 1.0 so billboards stay soft and round.
        float stretch = 1.0 + clamp((speed - 2.4) * 0.21, 0.0, 2.35) * smoothstep(0.0015, 0.032, screenLen);
        vStretch = stretch;
        vScreenVelDir = screenLen > 1e-5 ? (screenDelta / screenLen) : vec2(0.0, -1.0);

        if (aAlpha <= 0.001 || aSize <= 0.001) {
          gl_PointSize = 0.0;
        } else {
          float dist = max(1.2, -mvPosition.z);
          float quadScale = mix(1.0, stretch, 0.58);
          gl_PointSize = clamp(aSize * quadScale * uPixelScale / dist, 1.2, 108.0);
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
      varying vec2 vScreenVelDir;
      varying float vStretch;

      void main() {
        if (vAlpha <= 0.001) discard;

        vec2 centered = gl_PointCoord - 0.5;
        vec2 dir = length(vScreenVelDir) > 1e-5 ? normalize(vScreenVelDir) : vec2(0.0, -1.0);
        vec2 perp = vec2(-dir.y, dir.x);
        float along = dot(centered, dir);
        float across = dot(centered, perp);

        float fastMask = clamp((vStretch - 1.0) / 2.2, 0.0, 1.0);
        float acrossScale = mix(1.0, 1.85, fastMask);
        vec2 anisoCentered = dir * along + perp * (across * acrossScale);

        float dist2 = dot(anisoCentered, anisoCentered) * 4.0;
        if (dist2 > 1.0) discard;

        float angle = vSeed * 6.2831853 + uTime * (0.35 + 0.3 * fract(vSeed * 7.13));
        float ca = cos(angle);
        float sa = sin(angle);
        vec2 rotatedUv = vec2(
          anisoCentered.x * ca - anisoCentered.y * sa,
          anisoCentered.x * sa + anisoCentered.y * ca
        ) + 0.5;

        vec4 texel = texture2D(uSprite, clamp(rotatedUv, 0.0, 1.0));

        // Organic mist lobe + ragged liquid ligament breakup on high-velocity sheets
        float lobe = 0.86 + 0.14 * sin(atan(anisoCentered.y, anisoCentered.x + 1e-5) * 5.0 + vSeed * 31.0);
        float ligamentBreakup = 1.0 - fastMask * 0.24 * (0.5 + 0.5 * sin(along * 19.0 + vSeed * 53.0));
        float alpha = texel.a * vAlpha * ligamentBreakup * smoothstep(1.0, 0.15 * lobe, dist2);
        if (alpha <= 0.003) discard;

        vec3 baseFoam = vec3(0.68, 0.78, 0.84);
        vec3 sunLit = mix(vec3(0.85, 0.87, 0.90), uSunColor, 0.34);
        float heightGlow = clamp(0.45 + vWorldY * 0.06 + fastMask * 0.12, 0.35, 1.0);
        vec3 color = mix(baseFoam * 0.88, sunLit, heightGlow * (0.65 + 0.35 * texel.a));

        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.95));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
}

function createSpoutMaterial(spriteTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSprite: { value: spriteTexture },
      uSunColor: { value: new THREE.Color(0xfff1dc) },
      uSunDirection: { value: new THREE.Vector3(0.45, 0.22, -0.86).normalize() },
      uTime: { value: 0 },
      uPixelScale: { value: 520.0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      attribute float aSeed;
      attribute vec3 aVelocity;

      uniform float uPixelScale;

      varying float vAlpha;
      varying float vSeed;
      varying vec3 vWorldPos;
      varying vec2 vScreenVelDir;
      varying float vStretch;

      void main() {
        vAlpha = aAlpha;
        vSeed = aSeed;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vec4 mvPosition = viewMatrix * worldPos;
        vec4 clip0 = projectionMatrix * mvPosition;
        gl_Position = clip0;

        vec3 worldVel = mat3(modelMatrix) * aVelocity;
        vec3 viewVel = mat3(viewMatrix) * worldVel;
        vec4 clip1 = projectionMatrix * (mvPosition + vec4(viewVel * 0.03, 0.0));
        vec2 ndc0 = clip0.xy / max(0.1, abs(clip0.w));
        vec2 ndc1 = clip1.xy / max(0.1, abs(clip1.w));
        vec2 screenDelta = vec2(ndc1.x - ndc0.x, -(ndc1.y - ndc0.y));
        float screenLen = length(screenDelta);
        float speed = length(worldVel);

        float stretch = 1.0 + clamp((speed - 3.5) * 0.14, 0.0, 1.45) * smoothstep(0.0015, 0.03, screenLen);
        vStretch = stretch;
        vScreenVelDir = screenLen > 1e-5 ? (screenDelta / screenLen) : vec2(0.0, -1.0);

        if (aAlpha <= 0.001 || aSize <= 0.001) {
          gl_PointSize = 0.0;
        } else {
          float dist = max(1.1, -mvPosition.z);
          gl_PointSize = clamp(aSize * mix(1.0, stretch, 0.45) * uPixelScale / dist, 1.5, 118.0);
        }
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSprite;
      uniform vec3 uSunColor;
      uniform vec3 uSunDirection;
      uniform float uTime;

      varying float vAlpha;
      varying float vSeed;
      varying vec3 vWorldPos;
      varying vec2 vScreenVelDir;
      varying float vStretch;

      void main() {
        if (vAlpha <= 0.001) discard;

        vec2 centered = gl_PointCoord - 0.5;
        vec2 dir = length(vScreenVelDir) > 1e-5 ? normalize(vScreenVelDir) : vec2(0.0, -1.0);
        vec2 perp = vec2(-dir.y, dir.x);
        float along = dot(centered, dir);
        float across = dot(centered, perp);
        float jetMask = clamp((vStretch - 1.0) / 1.45, 0.0, 1.0);
        vec2 aniso = dir * along + perp * (across * mix(1.0, 1.5, jetMask));

        float r2 = dot(aniso, aniso) * 4.0;
        if (r2 > 1.0) discard;

        float swirl = vSeed * 6.2831853 + uTime * (0.45 + 0.35 * fract(vSeed * 11.7));
        float cs = cos(swirl);
        float sn = sin(swirl);
        vec2 uv = vec2(aniso.x * cs - aniso.y * sn, aniso.x * sn + aniso.y * cs) + 0.5;
        vec4 texel = texture2D(uSprite, clamp(uv, 0.0, 1.0));

        float wisp = 0.82 + 0.18 * sin(atan(aniso.y, aniso.x + 1e-5) * 4.0 - uTime * 1.4 + vSeed * 29.0);
        float alpha = texel.a * vAlpha * smoothstep(1.0, 0.08 * wisp, r2);
        if (alpha <= 0.003) discard;

        // Forward-scattered sunlit vapor glow (Mie backlit rim)
        vec3 viewDelta = vWorldPos - cameraPosition;
        vec3 viewRay = length(viewDelta) > 1e-4 ? normalize(viewDelta) : vec3(0.0, 0.0, -1.0);
        vec3 sunDir = normalize(uSunDirection);
        float mieScatter = pow(clamp(dot(viewRay, sunDir) * 0.5 + 0.5, 0.0, 1.0), 2.6);
        vec3 coolVapor = vec3(0.76, 0.86, 0.92);
        vec3 sunlitMist = mix(vec3(0.95, 0.96, 0.98), uSunColor * 1.08, 0.44);
        vec3 color = mix(coolVapor, sunlitMist, clamp(0.42 + 0.58 * mieScatter, 0.0, 1.0));

        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.78));
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

function computeSnellRefractedSun(sunDirection) {
  let lx = Number.isFinite(sunDirection?.x) ? sunDirection.x : 0.45;
  let ly = Number.isFinite(sunDirection?.y) ? sunDirection.y : 0.22;
  let lz = Number.isFinite(sunDirection?.z) ? sunDirection.z : -0.86;
  const len = Math.hypot(lx, ly, lz) || 1;
  lx /= len;
  ly = Math.max(0.04, ly / len);
  lz /= len;
  const nLen = Math.hypot(lx, ly, lz) || 1;
  lx /= nLen;
  ly /= nLen;
  lz /= nLen;

  // Air (1.0) -> Water (1.333) Snell refraction for incident sunlight ray -L across normal +Y
  const eta = 0.75;
  const ix = -lx;
  const iy = -ly;
  const iz = -lz;
  const cosI = -iy; // dot(N, -I) = -iy > 0
  const sin2T = eta * eta * Math.max(0, 1 - cosI * cosI);
  const cosT = Math.sqrt(Math.max(0.1, 1 - sin2T));

  const rx = eta * ix;
  const ry = -cosT;
  const rz = eta * iz;
  const rLen = Math.hypot(rx, ry, rz) || 1;

  return {
    rx: rx / rLen,
    ry: ry / rLen,
    rz: rz / rLen,
    sunElev: ly,
  };
}

function alignSunbeamsToSun(sunbeams, sunDirection) {
  const { rx, ry, rz, sunElev } = computeSnellRefractedSun(sunDirection);
  const last = sunbeams.userData.lastRefracted;
  if (
    last &&
    Math.abs(last.rx - rx) < 1e-5 &&
    Math.abs(last.ry - ry) < 1e-5 &&
    Math.abs(last.rz - rz) < 1e-5
  ) {
    return;
  }
  sunbeams.userData.lastRefracted = { rx, ry, rz };
  sunbeams.userData.refractedDirection.set(rx, ry, rz);

  const invDown = 1 / Math.max(0.45, -ry);
  const worldShearX = rx * invDown;
  const worldShearZ = rz * invDown;
  const sunAzimuth = Math.atan2(rx, rz);

  sunbeams.userData.material.uniforms.uSunIntensity.value = Math.min(
    1.3,
    0.58 + sunElev * 0.85
  );

  const shafts = sunbeams.children;
  for (let i = 0; i < shafts.length; i++) {
    const mesh = shafts[i];
    const spec = mesh.userData.spec;
    if (!spec) continue;

    const yaw = sunAzimuth + spec.relYaw;
    mesh.rotation.set(0, yaw, 0);
    mesh.position.set(spec.x, 0, spec.z);

    // Inverse rotate world horizontal shear into shaft local XZ space so world Y stays strictly pinned
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const localShearX = worldShearX * cosY - worldShearZ * sinY;
    const localShearZ = worldShearX * sinY + worldShearZ * cosY;

    const posAttr = mesh.geometry.getAttribute('position');
    const baseX = spec.baseX;
    const baseU = spec.baseDepthFrac;

    for (let v = 0; v < posAttr.count; v++) {
      const depth = baseU[v] * spec.height;
      const ly = spec.topY - depth; // topY = -0.35.. -0.55 <= 0.05; bottom <= -19 < -8
      const lx = baseX[v] + localShearX * depth;
      const lz = localShearZ * depth;
      posAttr.setXYZ(v, lx, ly, lz);
    }

    posAttr.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
    mesh.userData.worldShear = { x: worldShearX, z: worldShearZ };
  }
}

function createUnderwaterSunbeams() {
  const group = new THREE.Group();
  group.name = 'underwaterSunbeams';

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunColor: { value: new THREE.Color(0xbef6ff) },
      uSunIntensity: { value: 0.9 },
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
      uniform float uSunIntensity;

      varying vec2 vUv;
      varying float vWorldY;

      void main() {
        if (vWorldY > -0.15) discard;
        // Soft horizontal curtain sheared along Snell-refracted sun rays
        float edgeFade = sin(vUv.x * 3.14159265);
        edgeFade = pow(max(0.0, edgeFade), 1.55);

        float topFade = smoothstep(-0.18, -2.3, vWorldY);
        float depthFade = 1.0 - smoothstep(-5.5, -22.5, vWorldY);

        float ray1 = 0.5 + 0.5 * sin(vUv.x * 19.0 + uTime * 0.92);
        float ray2 = 0.5 + 0.5 * sin(vUv.x * 35.0 - uTime * 1.38);
        float rays = pow(ray1 * 0.6 + ray2 * 0.4, 2.15);

        float alpha = edgeFade * topFade * depthFade * (0.036 + 0.082 * rays) * uSunIntensity;
        if (alpha <= 0.001) discard;

        vec3 shaftColor = mix(vec3(0.14, 0.68, 0.78), uSunColor, 0.44);
        gl_FragColor = vec4(shaftColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const shaftSpecs = [
    { x: -3.4, z: -2.2, width: 7.8, height: 20.5, topY: -0.35, relYaw: 0.0 },
    { x: 1.9, z: 1.4, width: 8.6, height: 21.5, topY: -0.38, relYaw: 0.72 },
    { x: 5.1, z: 5.8, width: 7.2, height: 20.0, topY: -0.42, relYaw: -0.68 },
    { x: -1.6, z: 7.0, width: 6.8, height: 19.2, topY: -0.40, relYaw: 1.38 },
    { x: 0.4, z: -5.4, width: 7.4, height: 19.8, topY: -0.36, relYaw: -1.32 },
  ];

  for (const spec of shaftSpecs) {
    const geom = new THREE.PlaneGeometry(spec.width, spec.height, 1, 1);
    const posAttr = geom.getAttribute('position');
    const baseX = new Float32Array(posAttr.count);
    const baseDepthFrac = new Float32Array(posAttr.count);

    for (let v = 0; v < posAttr.count; v++) {
      baseX[v] = posAttr.getX(v);
      // PlaneGeometry has +height/2 at top and -height/2 at bottom -> map to [0..1] depth fraction
      baseDepthFrac[v] = 0.5 - posAttr.getY(v) / spec.height;
    }

    const mesh = new THREE.Mesh(geom, material);
    mesh.userData.spec = {
      ...spec,
      baseX,
      baseDepthFrac,
    };
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  group.userData.material = material;
  group.userData.refractedDirection = new THREE.Vector3(0, -1, 0);
  alignSunbeamsToSun(group, new THREE.Vector3(0.45, 0.22, -0.86).normalize());

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
  const velocities = new Float32Array(count * 3);
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
  geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));

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
    velocities,
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

function markPoolNeedsUpdate(pool) {
  pool.geometry.attributes.position.needsUpdate = true;
  pool.geometry.attributes.aSize.needsUpdate = true;
  pool.geometry.attributes.aAlpha.needsUpdate = true;
  pool.geometry.attributes.aVelocity.needsUpdate = true;
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
  const i3 = idx * 3;
  pool.lifetimes[idx] = 0;
  pool.alphas[idx] = 0;
  pool.sizes[idx] = 0;
  pool.positions[i3 + 1] = -999;
  pool.velocities[i3] = 0;
  pool.velocities[i3 + 1] = 0;
  pool.velocities[i3 + 2] = 0;
}

function isValidStation(pt) {
  return Boolean(pt && Number.isFinite(pt.x) && Number.isFinite(pt.z));
}

function buildBasisFromUp(upDir, sideHint) {
  let ux = Number.isFinite(upDir?.x) ? upDir.x : 0;
  let uy = Number.isFinite(upDir?.y) ? upDir.y : 1;
  let uz = Number.isFinite(upDir?.z) ? upDir.z : 0;
  let uLen = Math.hypot(ux, uy, uz);
  if (uLen < 1e-4) {
    ux = 0;
    uy = 1;
    uz = 0;
  } else {
    ux /= uLen;
    uy /= uLen;
    uz /= uLen;
  }
  // Keep blowhole exhalation predominantly skyward even during steep rolls
  if (uy < 0.25) {
    uy = 0.45;
    uLen = Math.hypot(ux, uy, uz) || 1;
    ux /= uLen;
    uy /= uLen;
    uz /= uLen;
  }

  let sx = Number.isFinite(sideHint?.x) ? sideHint.x : 0;
  let sy = Number.isFinite(sideHint?.y) ? sideHint.y : 0;
  let sz = Number.isFinite(sideHint?.z) ? sideHint.z : 0;
  // Gram-Schmidt orthogonalize side against up
  const dotSU = sx * ux + sy * uy + sz * uz;
  sx -= dotSU * ux;
  sy -= dotSU * uy;
  sz -= dotSU * uz;
  let sLen = Math.hypot(sx, sy, sz);
  if (sLen < 1e-4) {
    // Cross up with +Z or +X
    if (Math.abs(uz) < 0.9) {
      sx = uy;
      sy = -ux;
      sz = 0;
    } else {
      sx = 0;
      sy = uz;
      sz = -uy;
    }
    sLen = Math.hypot(sx, sy, sz) || 1;
  }
  sx /= sLen;
  sy /= sLen;
  sz /= sLen;

  // fwd = cross(side, up)
  const fx = sy * uz - sz * uy;
  const fy = sz * ux - sx * uz;
  const fz = sx * uy - sy * ux;

  return {
    ux,
    uy,
    uz,
    sx,
    sy,
    sz,
    fx,
    fy,
    fz,
  };
}

export function createSplashSystem() {
  const group = new THREE.Group();
  group.name = 'splashSystem';

  const rand = createRng(133791);
  const spriteTexture = createSpriteTexture(64);
  const sprayMaterial = createSprayMaterial(spriteTexture);
  const spoutMaterial = createSpoutMaterial(spriteTexture);
  const bubbleMaterial = createBubbleMaterial(spriteTexture);

  const sprayPool = createParticlePool(SPRAY_POOL_SIZE, sprayMaterial, 'sprayParticles');
  const bubblePool = createParticlePool(BUBBLE_POOL_SIZE, bubbleMaterial, 'cavitationBubbles');
  const spoutPool = createParticlePool(SPOUT_POOL_SIZE, spoutMaterial, 'blowholeSpout');
  const foamPool = createFoamPatchPool(FOAM_PATCH_POOL_SIZE);
  const sunbeams = createUnderwaterSunbeams();

  group.add(sunbeams);
  group.add(bubblePool.points);
  group.add(foamPool.foamGroup);
  group.add(sprayPool.points);
  group.add(spoutPool.points);

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

    const burstCount = 280;
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

    markPoolNeedsUpdate(sprayPool);
  }

  function resolveSplashdownTrenchStations(event, cx, cz) {
    if (Array.isArray(event.spineStations)) {
      const valid = event.spineStations.filter(isValidStation);
      if (valid.length >= 2) {
        return valid.map((st) => ({
          x: st.x,
          y: Number.isFinite(st.y) ? st.y : 0,
          z: st.z,
          radius: Math.max(0.28, Number.isFinite(st.radius) ? st.radius : 0.95),
        }));
      }
    }

    if (Number.isFinite(event.length) || Number.isFinite(event.heading)) {
      const trenchLen =
        Number.isFinite(event.length) && event.length > 0.5 ? event.length : 14.5;
      const heading = Number.isFinite(event.heading) ? event.heading : 0;
      const fwdX = Math.sin(heading);
      const fwdZ = Math.cos(heading);
      const profileRadii = [0.45, 0.72, 1.12, 1.48, 1.56, 1.32, 0.92, 0.54];
      const stations = [];
      for (let i = 0; i < profileRadii.length; i++) {
        const u = i / (profileRadii.length - 1) - 0.5;
        const dist = u * trenchLen;
        stations.push({
          x: cx + fwdX * dist,
          y: 0,
          z: cz + fwdZ * dist,
          radius: profileRadii[i],
        });
      }
      return stations;
    }

    return null;
  }

  function triggerSplashdown(event = {}) {
    const cx = Number.isFinite(event.x) ? event.x : 0;
    const cz = Number.isFinite(event.z) ? event.z : 0;
    const strength = Number.isFinite(event.strength) ? event.strength : 1.75;
    const scale = Math.min(1.25, Math.max(0.85, strength / 1.75));

    const trenchStations = resolveSplashdownTrenchStations(event, cx, cz);

    if (trenchStations && trenchStations.length >= 2) {
      // ==================== ELONGATED 15m BODY-SLAM TRENCH ====================
      const n = trenchStations.length;
      const foamFractions = [0.15, 0.5, 0.85];
      for (let f = 0; f < foamFractions.length; f++) {
        const rawIdx = foamFractions[f] * (n - 1);
        const i0 = Math.min(n - 2, Math.floor(rawIdx));
        const frac = rawIdx - i0;
        const sA = trenchStations[i0];
        const sB = trenchStations[i0 + 1];
        const fx = sA.x + (sB.x - sA.x) * frac;
        const fz = sA.z + (sB.z - sA.z) * frac;
        const localR = sA.radius + (sB.radius - sA.radius) * frac;
        const radScale = 0.78 + 0.22 * Math.min(1.6, localR);

        spawnFoamPatch({
          x: fx,
          z: fz,
          startTime: event.startTime,
          minRadius: 2.2 * radScale,
          maxRadius: 13.6 * scale * radScale,
          duration: 5.9 + f * 0.15,
          peakOpacity: f === 1 ? 0.93 : 0.88,
        });
      }

      // 1. Multi-station central splashdown whitewater wall (~12m+ eruption along 15m body)
      const wallCount = 520;
      for (let i = 0; i < wallCount; i++) {
        const segFloat = rand() * (n - 1);
        const segIdx = Math.min(n - 2, Math.floor(segFloat));
        const u = segFloat - segIdx;
        const sA = trenchStations[segIdx];
        const sB = trenchStations[segIdx + 1];

        const bx = sA.x + (sB.x - sA.x) * u;
        const bz = sA.z + (sB.z - sA.z) * u;
        const radius = sA.radius + (sB.radius - sA.radius) * u;
        const torsoWeight = Math.min(1.06, 0.72 + 0.24 * radius);

        const jitterAng = rand() * Math.PI * 2;
        const jitterR = Math.sqrt(rand()) * (0.55 + radius * 0.75);
        const dirX = Math.cos(jitterAng);
        const dirZ = Math.sin(jitterAng);
        const x = bx + dirX * jitterR;
        const z = bz + dirZ * jitterR;
        const waterY = lastWaterHeightFn(x, z);
        const isMist = rand() < 0.28;
        const radialSpeed = (0.55 + rand() * 2.3) * scale;
        const vy = (10.5 + Math.pow(rand(), 0.62) * 7.1) * scale * torsoWeight;

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

      // 2. Bilateral inclined whitewater trench curtains peeling off both sides of the 15m slam
      const curtainCount = 620;
      for (let i = 0; i < curtainCount; i++) {
        const segFloat = rand() * (n - 1);
        const segIdx = Math.min(n - 2, Math.floor(segFloat));
        const u = segFloat - segIdx;
        const sA = trenchStations[segIdx];
        const sB = trenchStations[segIdx + 1];

        const bx = sA.x + (sB.x - sA.x) * u;
        const bz = sA.z + (sB.z - sA.z) * u;
        const radius = sA.radius + (sB.radius - sA.radius) * u;

        let tx = sB.x - sA.x;
        let tz = sB.z - sA.z;
        const tLen = Math.hypot(tx, tz);
        if (tLen > 1e-4) {
          tx /= tLen;
          tz /= tLen;
        } else {
          tx = 0;
          tz = 1;
        }

        const sideSign = i % 2 === 0 ? -1 : 1;
        const perpX = -tz * sideSign;
        const perpZ = tx * sideSign;
        const alongSpread = (rand() - 0.5) * 0.45;
        let dirX = perpX + tx * alongSpread;
        let dirZ = perpZ + tz * alongSpread;
        const dLen = Math.hypot(dirX, dirZ) || 1;
        dirX /= dLen;
        dirZ /= dLen;

        const collarR = radius * (0.85 + rand() * 0.65) + 0.45;
        const x = bx + dirX * collarR;
        const z = bz + dirZ * collarR;
        const waterY = lastWaterHeightFn(x, z);
        const isMist = rand() < 0.34;
        const curtainOut = (4.2 + rand() * 6.0) * scale * (0.78 + 0.2 * radius);
        const curtainUp = (6.4 + rand() * 6.5) * scale * (0.8 + 0.18 * radius);

        spawnParticle(sprayPool, {
          x,
          y: waterY + 0.08 + rand() * 0.24,
          z,
          vx: dirX * curtainOut,
          vy: isMist ? curtainUp * 0.72 : curtainUp,
          vz: dirZ * curtainOut,
          size: isMist ? 0.65 + rand() * 0.85 : 0.24 + rand() * 0.42,
          growth: isMist ? 2.2 : 0.9,
          alpha: isMist ? 0.4 + rand() * 0.25 : 0.76 + rand() * 0.22,
          lifetime: 1.6 + rand() * 1.2,
          drag: isMist ? 1.1 : 0.36,
          gravityScale: isMist ? 0.68 : 1.0,
        });
      }

      // 3. Elongated 15m underwater cavitation bubble cylinder
      const trenchBubbleCount = 240;
      for (let i = 0; i < trenchBubbleCount; i++) {
        const segFloat = rand() * (n - 1);
        const segIdx = Math.min(n - 2, Math.floor(segFloat));
        const u = segFloat - segIdx;
        const sA = trenchStations[segIdx];
        const sB = trenchStations[segIdx + 1];
        const bx = sA.x + (sB.x - sA.x) * u;
        const bz = sA.z + (sB.z - sA.z) * u;
        const radius = sA.radius + (sB.radius - sA.radius) * u;

        const angle = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * (1.2 + radius * 1.45);
        const x = bx + Math.cos(angle) * r;
        const z = bz + Math.sin(angle) * r;
        const waterY = lastWaterHeightFn(x, z);

        spawnParticle(bubblePool, {
          x,
          y: waterY - 0.4 - rand() * 4.4,
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

      markPoolNeedsUpdate(sprayPool);
      markPoolNeedsUpdate(bubblePool);
      return;
    }

    // ==================== DEFAULT SINGLE-POINT SPLASHDOWN ====================
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

    markPoolNeedsUpdate(sprayPool);
    markPoolNeedsUpdate(bubblePool);
  }

  function spawnSpoutParticles(origin, upDir, sideHint, intensity, count, whaleVel) {
    const basis = buildBasisFromUp(upDir, sideHint);
    const clampedIntensity = Math.min(1.6, Math.max(0.2, intensity));
    const vxBase = (whaleVel?.x ?? 0) * 0.2;
    const vyBase = Math.max(0, (whaleVel?.y ?? 0) * 0.15);
    const vzBase = (whaleVel?.z ?? 0) * 0.2;

    for (let i = 0; i < count; i++) {
      // Paired Mysticeti nares: V-shaped雙-lobe blowhole plume
      const lobeSign = i % 2 === 0 ? -1 : 1;
      const vAngle = (0.13 + rand() * 0.15) * lobeSign;
      const fwdSpread = (rand() - 0.5) * 0.2;

      let dx = basis.ux + basis.sx * vAngle + basis.fx * fwdSpread;
      let dy = basis.uy + basis.sy * vAngle + basis.fy * fwdSpread;
      let dz = basis.uz + basis.sz * vAngle + basis.fz * fwdSpread;
      const dLen = Math.hypot(dx, dy, dz) || 1;
      dx /= dLen;
      dy /= dLen;
      dz /= dLen;

      const jetSpeed =
        (9.2 + Math.pow(rand(), 0.72) * 6.8) * (0.62 + 0.52 * clampedIntensity);
      const nareOffset = 0.09 * lobeSign;
      const jitter = 0.08;

      spawnParticle(spoutPool, {
        x: origin.x + basis.sx * nareOffset + (rand() - 0.5) * jitter,
        y: origin.y + basis.sy * nareOffset + rand() * 0.08,
        z: origin.z + basis.sz * nareOffset + (rand() - 0.5) * jitter,
        vx: dx * jetSpeed + vxBase,
        vy: dy * jetSpeed + vyBase,
        vz: dz * jetSpeed + vzBase,
        size: 0.22 + rand() * 0.26,
        growth: 3.5 + rand() * 1.9,
        alpha: (0.48 + rand() * 0.3) * Math.min(1.0, 0.55 + 0.55 * clampedIntensity),
        lifetime: 1.85 + rand() * 1.15,
        drag: 1.85 + rand() * 0.65,
        gravityScale: 0.06,
      });
    }
  }

  function triggerSpout(event = {}) {
    const posSrc = event.position ?? event.blowhole ?? event;
    const ox = Number.isFinite(posSrc?.x) ? posSrc.x : 0;
    const oz = Number.isFinite(posSrc?.z) ? posSrc.z : 0;
    const defaultY = lastWaterHeightFn(ox, oz) + 0.4;
    const oy = Number.isFinite(posSrc?.y) ? posSrc.y : defaultY;

    const intensity = Number.isFinite(event.intensity)
      ? event.intensity
      : Number.isFinite(event.strength)
        ? event.strength
        : 1.0;

    const burstCount = Math.max(
      24,
      Math.round(115 * Math.min(1.5, Math.max(0.3, intensity)))
    );
    spawnSpoutParticles(
      { x: ox, y: oy, z: oz },
      event.upDir ?? { x: 0, y: 1, z: 0 },
      event.sideDir ?? null,
      intensity,
      burstCount,
      event.velocity
    );
    markPoolNeedsUpdate(spoutPool);
  }

  function emitBlowholeSpout(dt, breachState, whaleAnchors, safeWaterHeight) {
    if (!(dt > 0)) return;
    const blowIntensity = breachState?.blowIntensity ?? 0;
    if (!(blowIntensity > 0.02)) return;

    const bh = whaleAnchors?.blowhole;
    if (!bh || !Number.isFinite(bh.x) || !Number.isFinite(bh.y) || !Number.isFinite(bh.z)) {
      return;
    }

    const waterY = safeWaterHeight(bh.x, bh.z);
    if (bh.y <= waterY) return;

    let sideHint = null;
    if (
      whaleAnchors.flipperR &&
      whaleAnchors.flipperL &&
      Number.isFinite(whaleAnchors.flipperR.x) &&
      Number.isFinite(whaleAnchors.flipperL.x)
    ) {
      sideHint = {
        x: whaleAnchors.flipperR.x - whaleAnchors.flipperL.x,
        y: whaleAnchors.flipperR.y - whaleAnchors.flipperL.y,
        z: whaleAnchors.flipperR.z - whaleAnchors.flipperL.z,
      };
    }

    const count = emitCount(dt * (190 + 340 * Math.min(1.5, blowIntensity)));
    if (count <= 0) return;

    spawnSpoutParticles(
      bh,
      whaleAnchors.upDir ?? { x: 0, y: 1, z: 0 },
      sideHint,
      blowIntensity,
      count,
      breachState?.velocity
    );
  }

  function integrateSpout(dt, time, safeWaterHeight) {
    if (!(dt > 0)) return;
    let dirty = false;

    for (let i = 0; i < spoutPool.count; i++) {
      const life = spoutPool.lifetimes[i];
      if (life <= 0) continue;
      dirty = true;

      const age = spoutPool.ages[i] + dt;
      if (age >= life) {
        deactivateParticle(spoutPool, i);
        continue;
      }
      spoutPool.ages[i] = age;

      const i3 = i * 3;
      const seed = spoutPool.seeds[i];
      const damp = Math.exp(-spoutPool.drags[i] * dt);
      const t = age / life;

      // Progressive atmospheric wind drift & billowing curl as high-speed exhalation slows into mist
      const windCoupling = Math.min(1.0, age * 1.45) * dt * 1.35;
      const turbX = Math.sin(time * 2.6 + seed * 37.0) * 0.55 * dt;
      const turbZ = Math.cos(time * 2.3 + seed * 41.0) * 0.55 * dt;

      const vx =
        spoutPool.velocities[i3] * damp + SPOUT_WIND_X * windCoupling + turbX;
      const vy =
        (spoutPool.velocities[i3 + 1] + GRAVITY * spoutPool.gravityScales[i] * dt) * damp +
        SPOUT_WIND_Y * windCoupling;
      const vz =
        spoutPool.velocities[i3 + 2] * damp + SPOUT_WIND_Z * windCoupling + turbZ;

      const x = spoutPool.positions[i3] + vx * dt;
      const y = spoutPool.positions[i3 + 1] + vy * dt;
      const z = spoutPool.positions[i3 + 2] + vz * dt;

      const waterY = safeWaterHeight(x, z);
      if (y <= waterY - 0.05) {
        deactivateParticle(spoutPool, i);
        continue;
      }

      spoutPool.velocities[i3] = vx;
      spoutPool.velocities[i3 + 1] = vy;
      spoutPool.velocities[i3 + 2] = vz;

      spoutPool.positions[i3] = x;
      spoutPool.positions[i3 + 1] = y;
      spoutPool.positions[i3 + 2] = z;

      const fadeIn = Math.min(1, t * 10.0);
      const fadeOut = Math.pow(1 - t, 1.45);
      spoutPool.sizes[i] = spoutPool.baseSizes[i] * (1 + spoutPool.growthRates[i] * t);
      spoutPool.alphas[i] = spoutPool.baseAlphas[i] * fadeIn * fadeOut;
    }

    if (dirty) {
      markPoolNeedsUpdate(spoutPool);
    }
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

  function emitPointAnchorShedding(anchor, dt, shedIntensity, whaleVel, safeWaterHeight, rateScale = 1.0) {
    if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return;

    const waterY = safeWaterHeight(anchor.x, anchor.z);
    if (anchor.y <= waterY + 0.4) return;

    const heightFactor = Math.min(1.5, 0.6 + (anchor.y - waterY) * 0.12);
    const count = emitCount(dt * (85 + 145 * shedIntensity) * heightFactor * rateScale);

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

  function emitTrailingEdgeWaterCurtain(
    stations,
    dt,
    shedIntensity,
    whaleVel,
    safeWaterHeight,
    baseRate
  ) {
    const valid = stations.filter(
      (s) => s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z)
    );
    if (valid.length === 0) return;

    if (valid.length === 1) {
      emitPointAnchorShedding(valid[0], dt, shedIntensity, whaleVel, safeWaterHeight, 1.0);
      return;
    }

    const segCount = valid.length - 1;
    for (let s = 0; s < segCount; s++) {
      const a = valid[s];
      const b = valid[s + 1];
      const midX = (a.x + b.x) * 0.5;
      const midY = (a.y + b.y) * 0.5;
      const midZ = (a.z + b.z) * 0.5;
      const midWaterY = safeWaterHeight(midX, midZ);

      // Skip segment if both endpoints lie below airborne threshold
      if (a.y <= midWaterY + 0.4 && b.y <= midWaterY + 0.4) continue;

      const spanFrac = (s + 0.5) / segCount;
      const tipBoost = 0.8 + 0.5 * spanFrac;
      const heightFactor = Math.min(1.55, 0.65 + Math.max(0, midY - midWaterY) * 0.12);
      const count = emitCount(
        (dt * (baseRate * (0.45 + 0.75 * shedIntensity)) * heightFactor * tipBoost) / segCount
      );

      for (let i = 0; i < count; i++) {
        const u = rand();
        const px = a.x + (b.x - a.x) * u;
        const py = a.y + (b.y - a.y) * u;
        const pz = a.z + (b.z - a.z) * u;
        const localWaterY = safeWaterHeight(px, pz);
        if (py <= localWaterY + 0.4) continue;

        const isMist = rand() < 0.3;
        const jitter = 0.14;
        const ox = (rand() - 0.5) * jitter * 2;
        const oy = -rand() * 0.22;
        const oz = (rand() - 0.5) * jitter * 2;

        spawnParticle(sprayPool, {
          x: px + ox,
          y: Math.max(localWaterY + 0.16, py + oy),
          z: pz + oz,
          vx: (whaleVel.x ?? 0) * 0.26 + (rand() - 0.5) * 1.15,
          vy: Math.min(1.15, (whaleVel.y ?? 0) * 0.18) - (0.35 + rand() * 1.15),
          vz: (whaleVel.z ?? 0) * 0.26 + (rand() - 0.5) * 1.15,
          size: isMist ? 0.24 + rand() * 0.3 : 0.1 + rand() * 0.16,
          growth: isMist ? 1.45 : 0.42,
          alpha: isMist ? 0.36 + rand() * 0.22 : 0.74 + rand() * 0.22,
          lifetime: 1.85 + rand() * 0.85,
          drag: isMist ? 0.92 : 0.3,
          gravityScale: 1.0,
        });
      }
    }
  }

  function emitAirborneShedding(dt, breachState, whaleAnchors, safeWaterHeight) {
    if (!whaleAnchors) return;
    const shedIntensity =
      breachState?.bodyShedIntensity !== undefined ? breachState.bodyShedIntensity : 0.75;
    if (shedIntensity <= 0.02) return;

    const whaleVel = breachState?.velocity ?? { x: 0, y: 0, z: 0 };

    const hasLeftWing =
      Array.isArray(whaleAnchors.flipperTrailingL) && whaleAnchors.flipperTrailingL.length > 0;
    const hasRightWing =
      Array.isArray(whaleAnchors.flipperTrailingR) && whaleAnchors.flipperTrailingR.length > 0;
    const hasFlukeTrail =
      Array.isArray(whaleAnchors.flukeTrailing) && whaleAnchors.flukeTrailing.length > 0;

    if (!hasLeftWing && !hasRightWing && !hasFlukeTrail) {
      // Exact fallback when trailing arrays are absent
      for (let k = 0; k < SHED_ANCHOR_KEYS.length; k++) {
        emitPointAnchorShedding(
          whaleAnchors[SHED_ANCHOR_KEYS[k]],
          dt,
          shedIntensity,
          whaleVel,
          safeWaterHeight,
          1.0
        );
      }
      return;
    }

    // Continuous cascading waterfall curtains along the entire 4.6m pectoral wings & 4.5m flukes
    if (hasLeftWing) {
      emitTrailingEdgeWaterCurtain(
        whaleAnchors.flipperTrailingL,
        dt,
        shedIntensity,
        whaleVel,
        safeWaterHeight,
        360
      );
    } else {
      emitPointAnchorShedding(
        whaleAnchors.flipperL,
        dt,
        shedIntensity,
        whaleVel,
        safeWaterHeight,
        1.0
      );
    }

    if (hasRightWing) {
      emitTrailingEdgeWaterCurtain(
        whaleAnchors.flipperTrailingR,
        dt,
        shedIntensity,
        whaleVel,
        safeWaterHeight,
        360
      );
    } else {
      emitPointAnchorShedding(
        whaleAnchors.flipperR,
        dt,
        shedIntensity,
        whaleVel,
        safeWaterHeight,
        1.0
      );
    }

    if (hasFlukeTrail) {
      emitTrailingEdgeWaterCurtain(
        whaleAnchors.flukeTrailing,
        dt,
        shedIntensity,
        whaleVel,
        safeWaterHeight,
        280
      );
    } else {
      emitPointAnchorShedding(
        whaleAnchors.flukeL,
        dt,
        shedIntensity,
        whaleVel,
        safeWaterHeight,
        1.0
      );
      emitPointAnchorShedding(
        whaleAnchors.flukeR,
        dt,
        shedIntensity,
        whaleVel,
        safeWaterHeight,
        1.0
      );
    }

    // Throat & chin ventral pleat runoff
    emitPointAnchorShedding(
      whaleAnchors.chin,
      dt,
      shedIntensity,
      whaleVel,
      safeWaterHeight,
      1.15
    );
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
      const vx = sprayPool.velocities[i3] * damp;
      const vy = (sprayPool.velocities[i3 + 1] + GRAVITY * sprayPool.gravityScales[i] * dt) * damp;
      const vz = sprayPool.velocities[i3 + 2] * damp;

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
      markPoolNeedsUpdate(sprayPool);
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
      markPoolNeedsUpdate(bubblePool);
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
    sunDirection,
  } = {}) {
    const clampedDt = Math.min(Math.max(dt, 0), 0.1);
    const safeWaterHeight =
      typeof getWaterHeight === 'function' ? getWaterHeight : lastWaterHeightFn;
    lastWaterHeightFn = safeWaterHeight;

    sprayMaterial.uniforms.uTime.value = time;
    spoutMaterial.uniforms.uTime.value = time;
    bubbleMaterial.uniforms.uTime.value = time;
    sunbeams.userData.material.uniforms.uTime.value = time;

    if (sunColor) {
      sprayMaterial.uniforms.uSunColor.value.set(sunColor);
      spoutMaterial.uniforms.uSunColor.value.set(sunColor);
      bubbleMaterial.uniforms.uSunColor.value.set(sunColor);
    }

    if (sunDirection) {
      spoutMaterial.uniforms.uSunDirection.value.set(
        sunDirection.x,
        sunDirection.y,
        sunDirection.z
      );
      if (spoutMaterial.uniforms.uSunDirection.value.lengthSq() > 1e-8) {
        spoutMaterial.uniforms.uSunDirection.value.normalize();
      }
      alignSunbeamsToSun(sunbeams, sunDirection);
    }

    integrateSpray(clampedDt, safeWaterHeight);
    emitDomeBoil(clampedDt, breachState?.waterDome, safeWaterHeight);
    emitSpineCurtain(clampedDt, breachState, whaleAnchors, safeWaterHeight);
    emitAirborneShedding(clampedDt, breachState, whaleAnchors, safeWaterHeight);

    integrateSpout(clampedDt, time, safeWaterHeight);
    emitBlowholeSpout(clampedDt, breachState, whaleAnchors, safeWaterHeight);

    integrateBubbles(clampedDt, time, safeWaterHeight);
    emitUnderwaterBubbles(clampedDt, whaleAnchors, safeWaterHeight);
    updateFoamPatches(clampedDt, time, safeWaterHeight, sunColor);

    markPoolNeedsUpdate(sprayPool);
    markPoolNeedsUpdate(spoutPool);
    markPoolNeedsUpdate(bubblePool);
  }

  return {
    group,
    triggerBreakthrough,
    triggerSplashdown,
    triggerSpout,
    update,
  };
}
