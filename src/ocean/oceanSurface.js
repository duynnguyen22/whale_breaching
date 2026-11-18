import * as THREE from 'three';
import { WAVE_COMPONENTS } from '../math/oceanMath.js';

const TWO_PI = Math.PI * 2;
const MAX_RIPPLE_SLOTS = 6;
const WHALE_SPINE_SLOTS = 8;
const WHALE_FLIPPER_SLOTS = 6;
const MAX_RIPPLE_AGE = 8.5;
const RIPPLE_WAVELENGTH = 3.6;
const RIPPLE_K = TWO_PI / RIPPLE_WAVELENGTH;
const RIPPLE_LEAD_WIDTH = 2.0;
const RIPPLE_TRAIL_CUTOFF = 16.0;
const RIPPLE_TRAIL_SIGMA = 4.6;

function smoothstep01(t) {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

export function createPolarOceanGeometry({
  radius = 460,
  radialSegments = 168,
  angularSegments = 180,
} = {}) {
  const radSegs = Math.max(2, Math.floor(radialSegments));
  const angSegs = Math.max(3, Math.floor(angularSegments));
  const vertexCount = 1 + radSegs * angSegs;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  positions[0] = 0;
  positions[1] = 0;
  positions[2] = 0;
  normals[0] = 0;
  normals[1] = 1;
  normals[2] = 0;
  uvs[0] = 0.5;
  uvs[1] = 0.5;

  const invRadius = radius > 0 ? 1 / radius : 1;
  let ptr = 1;
  for (let i = 1; i <= radSegs; i++) {
    const t = i / radSegs;
    const r = radius * Math.pow(t, 2.35);
    for (let j = 0; j < angSegs; j++) {
      const theta = (j / angSegs) * TWO_PI;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;

      const i3 = ptr * 3;
      positions[i3] = x;
      positions[i3 + 1] = 0;
      positions[i3 + 2] = z;

      normals[i3] = 0;
      normals[i3 + 1] = 1;
      normals[i3 + 2] = 0;

      const i2 = ptr * 2;
      uvs[i2] = 0.5 + 0.5 * x * invRadius;
      uvs[i2 + 1] = 0.5 + 0.5 * z * invRadius;
      ptr++;
    }
  }

  const triCount = angSegs + (radSegs - 1) * angSegs * 2;
  const IndexArray = vertexCount > 65535 ? Uint32Array : Uint16Array;
  const indices = new IndexArray(triCount * 3);
  let idxPtr = 0;

  for (let j = 0; j < angSegs; j++) {
    const jNext = (j + 1) % angSegs;
    indices[idxPtr++] = 0;
    indices[idxPtr++] = 1 + jNext;
    indices[idxPtr++] = 1 + j;
  }

  for (let i = 1; i < radSegs; i++) {
    const ringA = 1 + (i - 1) * angSegs;
    const ringB = 1 + i * angSegs;
    for (let j = 0; j < angSegs; j++) {
      const jNext = (j + 1) % angSegs;
      const a0 = ringA + j;
      const a1 = ringA + jNext;
      const b0 = ringB + j;
      const b1 = ringB + jNext;

      indices[idxPtr++] = a0;
      indices[idxPtr++] = a1;
      indices[idxPtr++] = b0;

      indices[idxPtr++] = a1;
      indices[idxPtr++] = b1;
      indices[idxPtr++] = b0;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();

  return geometry;
}

export function evaluateShaderOceanHeightFromUniforms(x, z, uniforms) {
  const time = uniforms.uTime.value;
  const waves = uniforms.uWaves.value;
  const waveParams = uniforms.uWaveParams.value;
  const dome = uniforms.uDome.value;
  const ripples = uniforms.uRipples.value;
  const rippleSpeeds = uniforms.uRippleSpeeds.value;

  let dy = 0;
  for (let i = 0; i < 6; i++) {
    const w = waves[i];
    const lp = waveParams[i];
    const k = TWO_PI / lp.x;
    const phase = k * (w.x * x + w.y * z - lp.y * time);
    dy += w.w * Math.sin(phase);
  }

  if (dome.w > 0 && dome.z > 0) {
    const dx = x - dome.x;
    const dz = z - dome.y;
    const r2 = dx * dx + dz * dz;
    const radius = dome.z;
    const maxR = 3 * radius;
    if (r2 < maxR * maxR) {
      const gaussian = dome.w * Math.exp(-r2 / (radius * radius));
      if (r2 <= 4 * radius * radius) {
        dy += gaussian;
      } else {
        const r = Math.sqrt(r2);
        dy += gaussian * smoothstep01((maxR - r) / radius);
      }
    }
  }

  for (let i = 0; i < MAX_RIPPLE_SLOTS; i++) {
    const rip = ripples[i];
    const strength = rip.w;
    const age = time - rip.z;
    if (strength !== 0 && age > 0 && age < MAX_RIPPLE_AGE) {
      const speed = rippleSpeeds[i];
      const dist = Math.hypot(x - rip.x, z - rip.y);
      const front = age * speed;
      const delta = dist - front;

      if (delta < RIPPLE_LEAD_WIDTH && delta > -RIPPLE_TRAIL_CUTOFF) {
        let spatialEnvelope;
        if (delta > 0) {
          const lead = smoothstep01(1 - delta / RIPPLE_LEAD_WIDTH);
          spatialEnvelope = lead * Math.exp(-delta * delta * 0.8);
        } else {
          const trailWindow = smoothstep01(1 + delta / RIPPLE_TRAIL_CUTOFF);
          spatialEnvelope =
            trailWindow *
            Math.exp(-(delta * delta) / (2 * RIPPLE_TRAIL_SIGMA * RIPPLE_TRAIL_SIGMA));
        }

        const rampIn = age < 0.08 ? smoothstep01(age / 0.08) : 1.0;
        const lifeLeft = 1 - age / MAX_RIPPLE_AGE;
        const timeDecay = lifeLeft * lifeLeft * Math.exp(-age * 0.25);
        const radialDecay = 1 / Math.sqrt(1 + dist * 0.08);

        dy +=
          0.38 *
          strength *
          rampIn *
          timeDecay *
          radialDecay *
          spatialEnvelope *
          Math.cos(RIPPLE_K * delta);
      }
    }
  }

  return dy;
}

const OCEAN_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec4 uWaves[6];
  uniform vec2 uWaveParams[6];
  uniform vec4 uDome;
  uniform vec4 uRipples[6];
  uniform float uRippleSpeeds[6];

  varying vec3 vWorldPos;
  varying vec3 vRestPos;
  varying vec3 vSurfaceNormal;
  varying float vWaveElevation;
  varying float vDomeMask;
  varying float vRippleFoam;

  const float TWO_PI = 6.283185307179586;
  const float MAX_RIPPLE_AGE = 8.5;
  const float RIPPLE_K = 6.283185307179586 / 3.6;
  const float RIPPLE_LEAD_WIDTH = 2.0;
  const float RIPPLE_TRAIL_CUTOFF = 16.0;
  const float RIPPLE_TRAIL_SIGMA = 4.6;

  float smoothstep01(float t) {
    float c = clamp(t, 0.0, 1.0);
    return c * c * (3.0 - 2.0 * c);
  }

  void main() {
    vec3 restPos = position;
    vRestPos = restPos;

    vec3 disp = vec3(0.0);
    vec3 tangent = vec3(1.0, 0.0, 0.0);
    vec3 binormal = vec3(0.0, 0.0, 1.0);

    // 1. 6-component Gerstner wave sum + analytical tangent & binormal
    for (int i = 0; i < 6; i++) {
      vec4 w = uWaves[i];       // (dirX, dirZ, steepness, amplitude)
      vec2 lp = uWaveParams[i]; // (wavelength, speed)
      float k = TWO_PI / lp.x;
      float phase = k * (w.x * restPos.x + w.y * restPos.z - lp.y * uTime);
      float s = sin(phase);
      float c = cos(phase);
      float qa = w.z * w.w;

      disp.x += w.x * qa * c;
      disp.z += w.y * qa * c;
      disp.y += w.w * s;

      float kqaSin = k * qa * s;
      float kaCos = k * w.w * c;

      tangent.x -= w.x * w.x * kqaSin;
      tangent.y += w.x * kaCos;
      tangent.z -= w.x * w.y * kqaSin;

      binormal.x -= w.x * w.y * kqaSin;
      binormal.y += w.y * kaCos;
      binormal.z -= w.y * w.y * kqaSin;
    }

    // 2. Pre-breach Gaussian water dome swelling + analytical slope
    float domeHeight = 0.0;
    vec2 domeSlope = vec2(0.0);
    float domeMask = 0.0;

    if (uDome.w > 0.0 && uDome.z > 0.0) {
      vec2 d = restPos.xz - uDome.xy;
      float r2 = dot(d, d);
      float radius = uDome.z;
      float maxR = 3.0 * radius;

      if (r2 < maxR * maxR) {
        float invR2 = 1.0 / (radius * radius);
        float gaussian = uDome.w * exp(-r2 * invR2);
        float cutoff = 1.0;
        float dCutoffDr = 0.0;
        float r = sqrt(r2);

        if (r > 2.0 * radius) {
          float tCut = clamp((maxR - r) / radius, 0.0, 1.0);
          cutoff = tCut * tCut * (3.0 - 2.0 * tCut);
          dCutoffDr = -6.0 * tCut * (1.0 - tCut) / radius;
        }

        domeHeight = gaussian * cutoff;
        domeMask = clamp(domeHeight / max(0.35, uDome.w), 0.0, 1.0);

        vec2 dGauss = gaussian * (-2.0 * invR2) * d;
        vec2 dCut = (r > 1e-4) ? (dCutoffDr * (d / r)) : vec2(0.0);
        domeSlope = dGauss * cutoff + gaussian * dCut;
      }
    }

    // 3. 6-slot expanding damped shockwave ripple rings + analytical slope
    float rippleHeight = 0.0;
    vec2 rippleSlope = vec2(0.0);
    float rippleFoam = 0.0;

    for (int i = 0; i < 6; i++) {
      vec4 rip = uRipples[i]; // (rx, rz, startTime, strength)
      float strength = rip.w;
      float age = uTime - rip.z;

      if (strength != 0.0 && age > 0.0 && age < MAX_RIPPLE_AGE) {
        float speed = uRippleSpeeds[i];
        vec2 rel = restPos.xz - rip.xy;
        float dist = length(rel);
        float front = age * speed;
        float delta = dist - front;

        if (delta < RIPPLE_LEAD_WIDTH && delta > -RIPPLE_TRAIL_CUTOFF) {
          float spatialEnvelope;
          if (delta > 0.0) {
            float lead = smoothstep01(1.0 - delta / RIPPLE_LEAD_WIDTH);
            spatialEnvelope = lead * exp(-delta * delta * 0.8);
          } else {
            float trailWindow = smoothstep01(1.0 + delta / RIPPLE_TRAIL_CUTOFF);
            spatialEnvelope = trailWindow * exp(-(delta * delta) / (2.0 * RIPPLE_TRAIL_SIGMA * RIPPLE_TRAIL_SIGMA));
          }

          float rampIn = age < 0.08 ? smoothstep01(age / 0.08) : 1.0;
          float lifeLeft = 1.0 - age / MAX_RIPPLE_AGE;
          float timeDecay = lifeLeft * lifeLeft * exp(-age * 0.25);
          float radialDecay = 1.0 / sqrt(1.0 + dist * 0.08);

          float env = 0.38 * strength * rampIn * timeDecay * radialDecay * spatialEnvelope;
          float cosWave = cos(RIPPLE_K * delta);
          float sinWave = sin(RIPPLE_K * delta);

          rippleHeight += env * cosWave;
          vec2 radialDir = dist > 1e-4 ? (rel / dist) : vec2(0.0);
          rippleSlope += radialDir * (-env * RIPPLE_K * sinWave);
          rippleFoam += clamp(abs(env) * 2.4 * max(0.0, cosWave + 0.28), 0.0, 1.0);
        }
      }
    }

    tangent.y += domeSlope.x + rippleSlope.x;
    binormal.y += domeSlope.y + rippleSlope.y;

    vec3 displaced = vec3(
      restPos.x + disp.x,
      disp.y + domeHeight + rippleHeight,
      restPos.z + disp.z
    );

    vec3 localNormal = normalize(cross(binormal, tangent));
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);

    vWorldPos = worldPosition.xyz;
    vSurfaceNormal = normalize(mat3(modelMatrix) * localNormal);
    vWaveElevation = disp.y;
    vDomeMask = domeMask;
    vRippleFoam = clamp(rippleFoam, 0.0, 1.5);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const OCEAN_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform vec3 uDeepColor;
  uniform vec3 uMidWaterColor;
  uniform vec3 uScatterColor;
  uniform vec3 uSkyZenithColor;
  uniform float uOceanRadius;
  uniform float uMoodSubsurface;
  uniform float uMoodGlitter;
  uniform vec4 uWhaleSpine[8];
  uniform vec4 uWhaleFlippers[6];
  uniform float uWhalePresent;

  varying vec3 vWorldPos;
  varying vec3 vRestPos;
  varying vec3 vSurfaceNormal;
  varying float vWaveElevation;
  varying float vDomeMask;
  varying float vRippleFoam;

  float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbmDetail(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
    for (int i = 0; i < 4; i++) {
      v += amp * noise2(p);
      p = rot * p * 2.06;
      amp *= 0.5;
    }
    return v;
  }

  vec2 computeDetailGradient(vec2 xz, float distAtten) {
    vec2 p1 = xz * 0.42 + vec2(uTime * 0.24, -uTime * 0.19);
    vec2 p2 = xz * 1.35 + vec2(-uTime * 0.46, uTime * 0.37);
    float eps = 0.14;

    float h0 = fbmDetail(p1) * 0.68 + fbmDetail(p2) * 0.32;
    float hx = fbmDetail(p1 + vec2(eps, 0.0)) * 0.68 + fbmDetail(p2 + vec2(eps, 0.0)) * 0.32;
    float hz = fbmDetail(p1 + vec2(0.0, eps)) * 0.68 + fbmDetail(p2 + vec2(0.0, eps)) * 0.32;

    return vec2(hx - h0, hz - h0) * (1.85 * distAtten);
  }

  // Evaluates refracted ray optical proximity to a submerged capsule segment (0m..10m below surface)
  vec3 evalSubsurfaceCapsule(vec3 rayOrigin, vec3 rayDir, vec4 segA, vec4 segB, float radiusScale, float haloPad) {
    if (segA.w <= 0.001) return vec3(0.0, 20.0, 0.0);

    vec3 a = segA.xyz;
    vec3 b = segB.w > 0.001 ? segB.xyz : segA.xyz;
    float rA = segA.w * radiusScale;
    float rB = (segB.w > 0.001 ? segB.w : segA.w) * radiusScale;

    vec3 ab = b - a;
    vec3 ap = rayOrigin - a;
    float ab2 = dot(ab, ab);
    float u = 0.0;

    if (ab2 > 1e-4) {
      float dDotAb = dot(rayDir, ab);
      float apDotD = dot(ap, rayDir);
      float apDotAb = dot(ap, ab);
      float denom = ab2 - dDotAb * dDotAb;
      if (denom > 1e-5) {
        u = clamp((apDotAb - apDotD * dDotAb) / denom, 0.0, 1.0);
      } else {
        u = 0.5;
      }
    }

    vec3 segPt = a + ab * u;
    float tRay = max(0.0, dot(segPt - rayOrigin, rayDir));
    vec3 rayPt = rayOrigin + rayDir * tRay;

    if (ab2 > 1e-4) {
      u = clamp(dot(rayPt - a, ab) / ab2, 0.0, 1.0);
      segPt = a + ab * u;
      tRay = max(0.0, dot(segPt - rayOrigin, rayDir));
      rayPt = rayOrigin + rayDir * tRay;
    }

    float subDepth = rayOrigin.y - segPt.y;
    float radius = mix(rA, rB, u);
    if (subDepth < -radius * 0.55 || subDepth > 11.8) {
      return vec3(0.0, 20.0, tRay);
    }

    float effDepth = max(0.0, subDepth);
    float scatterBlur = haloPad + 0.11 * effDepth;
    float dist = length(rayPt - segPt);
    float radialMask = 1.0 - smoothstep(radius * 0.35, radius + scatterBlur, dist);
    float depthWindow = smoothstep(-radius * 0.55, 0.10, subDepth) * (1.0 - smoothstep(8.4, 11.6, effDepth));

    return vec3(radialMask * depthWindow, effDepth, tRay);
  }

  void main() {
    vec3 toCam = cameraPosition - vWorldPos;
    float camDist = length(toCam);
    vec3 V = toCam / max(camDist, 1e-4);
    vec3 L = normalize(uSunDirection);

    float detailAtten = 1.0 - smoothstep(18.0, 195.0, camDist);
    vec2 microGrad = computeDetailGradient(vWorldPos.xz, detailAtten);

    vec3 N = normalize(vSurfaceNormal + vec3(-microGrad.x * 0.26, 0.0, -microGrad.y * 0.26));

    // Multi-scale organic foam lace noise
    float foamNoiseCoarse = fbmDetail(vWorldPos.xz * 0.36 + vec2(uTime * 0.12, -uTime * 0.09));
    float foamNoiseFine = fbmDetail(vWorldPos.xz * 1.45 - vec2(uTime * 0.28, uTime * 0.22));
    float foamPattern = foamNoiseCoarse * 0.62 + foamNoiseFine * 0.38;

    if (gl_FrontFacing) {
      // ==================== ABOVE WATER ====================
      float NdotV = max(dot(N, V), 0.001);

      // Schlick Fresnel (water/air F0 = 0.02)
      float fresnel = 0.02 + 0.98 * pow(clamp(1.0 - NdotV, 0.0, 1.0), 5.0);

      // Sky reflection gradient + warm sun sky glow
      vec3 R = reflect(-V, N);
      float skyElev = clamp(R.y, 0.0, 1.0);
      vec3 skyRefl = mix(uHorizonColor, uSkyZenithColor, pow(skyElev, 0.55));
      float sunSkyHalo = pow(max(dot(R, L), 0.0), 8.0);
      skyRefl += uSunColor * sunSkyHalo * 0.38;

      // Deep ocean absorption (#041829) blending to rich mid-water teal
      float depthView = pow(NdotV, 0.68);
      vec3 waterBody = mix(uMidWaterColor, uDeepColor, depthView);

      // Backlit emerald-turquoise subsurface scattering (#0ea5a0) through thin crests & rising water dome
      float backLight = pow(clamp(dot(V, -L) * 0.5 + 0.5, 0.0, 1.0), 2.4);
      float sunGrazing = pow(clamp(1.0 - NdotV, 0.0, 1.0), 1.8);
      float crestThinness = smoothstep(-0.1, 0.85, vWaveElevation) * (0.45 + 0.55 * (1.0 - N.y));
      float domeThinness = vDomeMask * (0.65 + 0.35 * (1.0 - N.y));
      float sssFactor = clamp((crestThinness * 0.72 + domeThinness * 1.15) * (0.35 + 0.65 * backLight + 0.3 * sunGrazing), 0.0, 1.35);
      waterBody += uScatterColor * sssFactor * uMoodSubsurface;

      // Subsurface refracted whale silhouette & glowing turquoise-white pectoral wings (0m..10m below surface)
      if (uWhalePresent > 0.5 && camDist < 190.0) {
        vec3 underRay = refract(-V, N, 0.75);
        if (length(underRay) < 0.001) {
          underRay = vec3(0.0, -1.0, 0.0);
        } else {
          underRay = normalize(underRay);
        }

        float bodySilhouette = 0.0;
        for (int i = 0; i < 7; i++) {
          vec3 hit = evalSubsurfaceCapsule(vWorldPos, underRay, uWhaleSpine[i], uWhaleSpine[i + 1], 1.12, 0.42);
          if (hit.x > 0.001) {
            float beerBody = exp(-hit.y * 0.15 - hit.z * 0.025);
            bodySilhouette = max(bodySilhouette, hit.x * beerBody);
          }
        }

        float wingGlow = 0.0;
        float wingDepth = 4.0;
        for (int i = 0; i < 2; i++) {
          vec3 hitL = evalSubsurfaceCapsule(vWorldPos, underRay, uWhaleFlippers[i], uWhaleFlippers[i + 1], 1.42, 0.48);
          if (hitL.x > 0.001) {
            float beerWingL = exp(-hitL.y * 0.125 - hitL.z * 0.022);
            float contribL = hitL.x * beerWingL;
            if (contribL > wingGlow) {
              wingGlow = contribL;
              wingDepth = hitL.y;
            }
          }

          vec3 hitR = evalSubsurfaceCapsule(vWorldPos, underRay, uWhaleFlippers[3 + i], uWhaleFlippers[4 + i], 1.42, 0.48);
          if (hitR.x > 0.001) {
            float beerWingR = exp(-hitR.y * 0.125 - hitR.z * 0.022);
            float contribR = hitR.x * beerWingR;
            if (contribR > wingGlow) {
              wingGlow = contribR;
              wingDepth = hitR.y;
            }
          }
        }

        float distAttenWhale = 1.0 - smoothstep(110.0, 185.0, camDist);
        bodySilhouette *= distAttenWhale;
        wingGlow *= distAttenWhale;

        // Pelagic deep body shadow over submerged 15m dorsal torso
        vec3 pelagicSilhouette = uDeepColor * 0.32;
        waterBody = mix(waterBody, pelagicSilhouette, clamp(bodySilhouette * 0.80, 0.0, 0.80));

        // Unmistakable turquoise-white humpback pectoral wing glow (#c8f4f0 shallow -> #38d6c8 deeper via Beer-Lambert)
        if (wingGlow > 0.001) {
          vec3 wingNearWhite = vec3(0.784, 0.957, 0.941); // #c8f4f0
          vec3 wingTurquoise = vec3(0.220, 0.839, 0.784); // #38d6c8
          float depthBlend = clamp(wingDepth / 3.4, 0.0, 1.0);
          vec3 beerSpectrum = exp(-wingDepth * vec3(0.24, 0.08, 0.10));
          float sunIrradiance = clamp(0.48 + 0.52 * max(L.y, 0.0), 0.38, 1.05);
          vec3 wingSubsurfaceCol = mix(wingNearWhite, wingTurquoise, depthBlend) * beerSpectrum * sunIrradiance;
          waterBody = mix(waterBody, wingSubsurfaceCol, clamp(wingGlow * 0.88, 0.0, 0.86));
          waterBody += wingTurquoise * wingGlow * 0.18 * uMoodSubsurface;
        }
      }

      // Combine refracted ocean body + Fresnel sky reflection (grazing angles naturally reflect sky)
      vec3 color = mix(waterBody, skyRefl, fresnel);

      // Blazing sun specular path (tight solar disk + shimmering micro-ripple glitter trail)
      vec3 H = normalize(L + V);
      float NdotH = max(dot(N, H), 0.0);
      float sunCore = pow(NdotH, 520.0) * 2.15;
      float sunGlitter = pow(NdotH, 46.0) * 0.28;
      float sunMask = smoothstep(-0.04, 0.12, L.y);
      color += uSunColor * (sunCore + sunGlitter) * uMoodGlitter * sunMask;

      // Organic whitewater foam concentrated on breach dome collar, shockwaves, and steep choppy crests
      float steepChop = smoothstep(0.16, 0.48, 1.0 - vSurfaceNormal.y) * smoothstep(0.12, 0.78, vWaveElevation);
      float domeCollar = smoothstep(0.12, 0.72, vDomeMask) * (0.7 + 0.6 * (1.0 - vSurfaceNormal.y));
      float rawFoam = domeCollar * 0.92 + vRippleFoam * 0.85 + steepChop * 0.65;
      float foamMask = smoothstep(0.36, 0.86, rawFoam * (0.55 + 0.75 * foamPattern));
      foamMask *= 1.0 - smoothstep(120.0, 340.0, camDist);

      vec3 foamColor = mix(vec3(0.66, 0.76, 0.80), mix(vec3(0.84, 0.87, 0.90), uSunColor, 0.26), clamp(L.y * 1.8 + 0.35, 0.2, 0.9));
      color = mix(color, foamColor, clamp(foamMask, 0.0, 0.92));

      // Smooth horizon + exponential fog blend
      float radialDist = length(vRestPos.xz);
      float safeOceanRadius = max(1.0, uOceanRadius);
      float horizonBlend = smoothstep(safeOceanRadius * 0.68, safeOceanRadius * 0.995, radialDist);
      float fogDist = camDist * max(0.0, uFogDensity);
      float expFog = 1.0 - exp(-fogDist * fogDist);
      float totalFog = clamp(max(expFog, horizonBlend), 0.0, 1.0);
      vec3 distantTarget = mix(uFogColor, uHorizonColor, smoothstep(0.15, 0.85, horizonBlend));
      color = mix(color, distantTarget, totalFog);

      gl_FragColor = vec4(color, 1.0);
    } else {
      // ==================== UNDERWATER (Snell's Window ~48.6° critical angle) ====================
      vec3 underN = normalize(-N);
      float cosThetaI = clamp(dot(underN, V), 0.0, 1.0);

      // Water-to-air relative IOR = 1.333 -> critical angle arcsin(1 / 1.333) ≈ 48.6°
      const float WATER_TO_AIR_IOR = 1.333;
      float sin2ThetaT = WATER_TO_AIR_IOR * WATER_TO_AIR_IOR * (1.0 - cosThetaI * cosThetaI);

      // Smooth anti-aliased transition across Snell's window boundary (sin2ThetaT = 1.0)
      float snellWindow = 1.0 - smoothstep(0.90, 1.04, sin2ThetaT);

      // Transmitted sky & blazing refracted sun inside Snell's window
      vec3 refractedDir = refract(-V, underN, WATER_TO_AIR_IOR);
      if (length(refractedDir) < 0.001) {
        refractedDir = vec3(0.0, 1.0, 0.0);
      } else {
        refractedDir = normalize(refractedDir);
      }

      float skyUp = clamp(refractedDir.y, 0.0, 1.0);
      vec3 aboveSky = mix(uHorizonColor * 1.08, mix(uSkyZenithColor, vec3(0.45, 0.78, 0.92), 0.55), pow(skyUp, 0.5));
      float underSun = pow(max(dot(refractedDir, L), 0.0), 36.0) * 1.45 + pow(max(dot(refractedDir, L), 0.0), 6.0) * 0.35;
      aboveSky += uSunColor * underSun;

      // Prismatic cyan/silver rim right along the 48.6° Snell's window edge
      float rimDelta = (sin2ThetaT - 0.94) / 0.11;
      float windowRim = exp(-rimDelta * rimDelta);
      aboveSky += mix(uScatterColor, vec3(0.75, 0.92, 0.96), 0.5) * windowRim * 0.45;

      // Total Internal Reflection (TIR) outside Snell's window: deep teal ocean depths
      vec3 tirBase = mix(uDeepColor * 1.35, uMidWaterColor * 1.45, 0.35 + 0.45 * foamPattern);
      tirBase += uScatterColor * (0.14 + 0.18 * (1.0 - cosThetaI));

      vec3 underColor = mix(tirBase, aboveSky, snellWindow);

      // Breach dome & shockwave whitewater turbulence glowing overhead
      float overheadTurbulence = clamp((vDomeMask * 0.95 + vRippleFoam * 0.85) * (0.45 + 0.75 * foamPattern), 0.0, 1.0);
      vec3 aeratedGlow = mix(uScatterColor * 1.3, vec3(0.78, 0.92, 0.95), 0.65);
      underColor = mix(underColor, aeratedGlow, overheadTurbulence * 0.78);

      // Underwater teal absorption over distance
      float underFog = 1.0 - exp(-camDist * 0.022);
      vec3 deepTealFog = mix(uDeepColor, uScatterColor * 0.32, 0.42);
      underColor = mix(underColor, deepTealFog, clamp(underFog, 0.0, 0.92));

      gl_FragColor = vec4(underColor, 1.0);
    }
  }
`;

const MOOD_PRESETS = {
  golden: {
    deep: '#041829',
    mid: '#08334a',
    scatter: '#0ea5a0',
    zenith: '#1c4468',
    subsurface: 1.18,
    glitter: 1.25,
  },
  noon: {
    deep: '#041829',
    mid: '#0a4462',
    scatter: '#0ea5a0',
    zenith: '#2167a6',
    subsurface: 1.32,
    glitter: 1.1,
  },
  twilight: {
    deep: '#031120',
    mid: '#072238',
    scatter: '#0c8b8e',
    zenith: '#111e38',
    subsurface: 0.85,
    glitter: 0.95,
  },
};

function isValidAnchorPoint(pt) {
  return Boolean(
    pt &&
      Number.isFinite(pt.x) &&
      Number.isFinite(pt.y) &&
      Number.isFinite(pt.z)
  );
}

function refractIntoWater(viewDir, normal, eta = 0.75) {
  // Incident ray from camera into water is -viewDir
  const ix = -viewDir.x;
  const iy = -viewDir.y;
  const iz = -viewDir.z;
  const nDotI = normal.x * ix + normal.y * iy + normal.z * iz;
  const k = 1 - eta * eta * (1 - nDotI * nDotI);
  if (k < 0) {
    return { x: 0, y: -1, z: 0 };
  }
  const s = eta * nDotI + Math.sqrt(k);
  const rx = eta * ix - s * normal.x;
  const ry = eta * iy - s * normal.y;
  const rz = eta * iz - s * normal.z;
  const len = Math.hypot(rx, ry, rz);
  if (len < 1e-4) {
    return { x: 0, y: -1, z: 0 };
  }
  return { x: rx / len, y: ry / len, z: rz / len };
}

function evalSubsurfaceCapsuleCpu(rayOrigin, rayDir, segA, segB, radiusScale, haloPad) {
  if (!segA || segA.w <= 0.001) return { hit: 0, depth: 20, tRay: 0 };

  const ax = segA.x;
  const ay = segA.y;
  const az = segA.z;
  const hasB = segB && segB.w > 0.001;
  const bx = hasB ? segB.x : ax;
  const by = hasB ? segB.y : ay;
  const bz = hasB ? segB.z : az;
  const rA = segA.w * radiusScale;
  const rB = (hasB ? segB.w : segA.w) * radiusScale;

  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = rayOrigin.x - ax;
  const apy = rayOrigin.y - ay;
  const apz = rayOrigin.z - az;
  const ab2 = abx * abx + aby * aby + abz * abz;

  let u = 0;
  if (ab2 > 1e-4) {
    const dDotAb = rayDir.x * abx + rayDir.y * aby + rayDir.z * abz;
    const apDotD = apx * rayDir.x + apy * rayDir.y + apz * rayDir.z;
    const apDotAb = apx * abx + apy * aby + apz * abz;
    const denom = ab2 - dDotAb * dDotAb;
    if (denom > 1e-5) {
      u = Math.min(1, Math.max(0, (apDotAb - apDotD * dDotAb) / denom));
    } else {
      u = 0.5;
    }
  }

  let segX = ax + abx * u;
  let segY = ay + aby * u;
  let segZ = az + abz * u;
  let tRay = Math.max(
    0,
    (segX - rayOrigin.x) * rayDir.x +
      (segY - rayOrigin.y) * rayDir.y +
      (segZ - rayOrigin.z) * rayDir.z
  );
  let rayX = rayOrigin.x + rayDir.x * tRay;
  let rayY = rayOrigin.y + rayDir.y * tRay;
  let rayZ = rayOrigin.z + rayDir.z * tRay;

  if (ab2 > 1e-4) {
    u = Math.min(
      1,
      Math.max(0, ((rayX - ax) * abx + (rayY - ay) * aby + (rayZ - az) * abz) / ab2)
    );
    segX = ax + abx * u;
    segY = ay + aby * u;
    segZ = az + abz * u;
    tRay = Math.max(
      0,
      (segX - rayOrigin.x) * rayDir.x +
        (segY - rayOrigin.y) * rayDir.y +
        (segZ - rayOrigin.z) * rayDir.z
    );
    rayX = rayOrigin.x + rayDir.x * tRay;
    rayY = rayOrigin.y + rayDir.y * tRay;
    rayZ = rayOrigin.z + rayDir.z * tRay;
  }

  const subDepth = rayOrigin.y - segY;
  const radius = rA + (rB - rA) * u;
  if (subDepth < -radius * 0.55 || subDepth > 11.8) {
    return { hit: 0, depth: 20, tRay };
  }

  const effDepth = Math.max(0, subDepth);
  const scatterBlur = haloPad + 0.11 * effDepth;
  const dist = Math.hypot(rayX - segX, rayY - segY, rayZ - segZ);
  const radialMask =
    1 - smoothstep01((dist - radius * 0.35) / Math.max(1e-4, radius + scatterBlur - radius * 0.35));
  const depthWindow =
    smoothstep01((subDepth + radius * 0.55) / Math.max(1e-4, 0.10 + radius * 0.55)) *
    (1 - smoothstep01((effDepth - 8.4) / (11.6 - 8.4)));

  return { hit: radialMask * depthWindow, depth: effDepth, tRay };
}

export function evaluateSubsurfaceWhaleOptics(worldPos, cameraPos, normal, uniforms) {
  const toCamX = cameraPos.x - worldPos.x;
  const toCamY = cameraPos.y - worldPos.y;
  const toCamZ = cameraPos.z - worldPos.z;
  const camDist = Math.hypot(toCamX, toCamY, toCamZ);
  const invDist = 1 / Math.max(camDist, 1e-4);
  const V = { x: toCamX * invDist, y: toCamY * invDist, z: toCamZ * invDist };
  const nLen = Math.hypot(normal.x, normal.y, normal.z) || 1;
  const N = { x: normal.x / nLen, y: normal.y / nLen, z: normal.z / nLen };

  const NdotV = Math.max(0.001, N.x * V.x + N.y * V.y + N.z * V.z);
  const fresnel = 0.02 + 0.98 * Math.pow(Math.min(1, Math.max(0, 1 - NdotV)), 5);

  if (!uniforms?.uWhalePresent || uniforms.uWhalePresent.value <= 0.5 || camDist >= 190) {
    return { bodySilhouette: 0, wingGlow: 0, fresnel, transmittedFraction: 1 - fresnel };
  }

  const underRay = refractIntoWater(V, N, 0.75);
  const spine = uniforms.uWhaleSpine.value;
  const flippers = uniforms.uWhaleFlippers.value;

  let bodySilhouette = 0;
  for (let i = 0; i < 7; i++) {
    const res = evalSubsurfaceCapsuleCpu(worldPos, underRay, spine[i], spine[i + 1], 1.12, 0.42);
    if (res.hit > 0.001) {
      const beer = Math.exp(-res.depth * 0.15 - res.tRay * 0.025);
      bodySilhouette = Math.max(bodySilhouette, res.hit * beer);
    }
  }

  let wingGlow = 0;
  let wingDepth = 4.0;
  for (let i = 0; i < 2; i++) {
    const resL = evalSubsurfaceCapsuleCpu(
      worldPos,
      underRay,
      flippers[i],
      flippers[i + 1],
      1.42,
      0.48
    );
    if (resL.hit > 0.001) {
      const contribL = resL.hit * Math.exp(-resL.depth * 0.125 - resL.tRay * 0.022);
      if (contribL > wingGlow) {
        wingGlow = contribL;
        wingDepth = resL.depth;
      }
    }

    const resR = evalSubsurfaceCapsuleCpu(
      worldPos,
      underRay,
      flippers[3 + i],
      flippers[4 + i],
      1.42,
      0.48
    );
    if (resR.hit > 0.001) {
      const contribR = resR.hit * Math.exp(-resR.depth * 0.125 - resR.tRay * 0.022);
      if (contribR > wingGlow) {
        wingGlow = contribR;
        wingDepth = resR.depth;
      }
    }
  }

  const distAtten = 1 - smoothstep01((camDist - 110) / (185 - 110));
  bodySilhouette *= distAtten;
  wingGlow *= distAtten;

  return {
    bodySilhouette,
    wingGlow,
    wingDepth,
    fresnel,
    transmittedFraction: 1 - fresnel,
  };
}

export function createOceanSurface({ radius = 460 } = {}) {
  const geometry = createPolarOceanGeometry({ radius });

  const waveVecs = WAVE_COMPONENTS.map(
    (w) => new THREE.Vector4(w.dirX, w.dirZ, w.steepness, w.amplitude)
  );
  const waveParams = WAVE_COMPONENTS.map((w) => new THREE.Vector2(w.wavelength, w.speed));

  const rippleVecs = Array.from(
    { length: MAX_RIPPLE_SLOTS },
    () => new THREE.Vector4(0, 0, -100, 0)
  );
  const rippleSpeeds = new Float32Array(MAX_RIPPLE_SLOTS).fill(8.5);

  const whaleSpineVecs = Array.from(
    { length: WHALE_SPINE_SLOTS },
    () => new THREE.Vector4(0, -100, 0, 0)
  );
  const whaleFlipperVecs = Array.from(
    { length: WHALE_FLIPPER_SLOTS },
    () => new THREE.Vector4(0, -100, 0, 0)
  );

  const uniforms = {
    uTime: { value: 0 },
    uWaves: { value: waveVecs },
    uWaveParams: { value: waveParams },
    uDome: { value: new THREE.Vector4(0, 0, 4.8, 0) },
    uRipples: { value: rippleVecs },
    uRippleSpeeds: { value: rippleSpeeds },
    uWhaleSpine: { value: whaleSpineVecs },
    uWhaleFlippers: { value: whaleFlipperVecs },
    uWhalePresent: { value: 0.0 },
    uSunDirection: { value: new THREE.Vector3(0.45, 0.22, -0.86).normalize() },
    uSunColor: { value: new THREE.Color('#ffd394') },
    uHorizonColor: { value: new THREE.Color('#e89968') },
    uFogColor: { value: new THREE.Color('#1d3a4f') },
    uFogDensity: { value: 0.0022 },
    uDeepColor: { value: new THREE.Color('#041829') },
    uMidWaterColor: { value: new THREE.Color('#08334a') },
    uScatterColor: { value: new THREE.Color('#0ea5a0') },
    uSkyZenithColor: { value: new THREE.Color('#1c4468') },
    uOceanRadius: { value: radius },
    uMoodSubsurface: { value: 1.18 },
    uMoodGlitter: { value: 1.25 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: OCEAN_VERTEX_SHADER,
    fragmentShader: OCEAN_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'oceanSurface';
  mesh.frustumCulled = false;

  const ripples = [];
  let currentMood = '';
  let lastTime = 0;

  function syncRippleUniforms() {
    for (let i = 0; i < MAX_RIPPLE_SLOTS; i++) {
      const r = ripples[i];
      if (r) {
        rippleVecs[i].set(r.x, r.z, r.startTime, r.strength);
        rippleSpeeds[i] = r.speed;
      } else {
        rippleVecs[i].set(0, 0, -100, 0);
        rippleSpeeds[i] = 8.5;
      }
    }
  }

  function populateFlipperWingSlots(offset, trailingList, fallbackTip, chestStation) {
    const validTrail = Array.isArray(trailingList)
      ? trailingList.filter(isValidAnchorPoint)
      : [];

    if (validTrail.length >= 3) {
      const i0 = 0;
      const i1 = Math.floor((validTrail.length - 1) * 0.5);
      const i2 = validTrail.length - 1;
      const picks = [validTrail[i0], validTrail[i1], validTrail[i2]];
      for (let k = 0; k < 3; k++) {
        const pt = picks[k];
        const rad = Math.max(0.15, Number.isFinite(pt.radius) ? pt.radius : 0.45);
        whaleFlipperVecs[offset + k].set(pt.x, pt.y, pt.z, rad);
      }
      return true;
    }

    if (validTrail.length === 2) {
      const a = validTrail[0];
      const b = validTrail[1];
      const rA = Math.max(0.15, Number.isFinite(a.radius) ? a.radius : 0.48);
      const rB = Math.max(0.15, Number.isFinite(b.radius) ? b.radius : 0.36);
      whaleFlipperVecs[offset].set(a.x, a.y, a.z, rA);
      whaleFlipperVecs[offset + 1].set(
        (a.x + b.x) * 0.5,
        (a.y + b.y) * 0.5,
        (a.z + b.z) * 0.5,
        (rA + rB) * 0.5
      );
      whaleFlipperVecs[offset + 2].set(b.x, b.y, b.z, rB);
      return true;
    }

    if (validTrail.length === 1) {
      const pt = validTrail[0];
      const rad = Math.max(0.15, Number.isFinite(pt.radius) ? pt.radius : 0.5);
      for (let k = 0; k < 3; k++) {
        whaleFlipperVecs[offset + k].set(pt.x, pt.y, pt.z, rad);
      }
      return true;
    }

    if (isValidAnchorPoint(fallbackTip)) {
      const tipRad = Math.max(
        0.18,
        Number.isFinite(fallbackTip.radius) ? fallbackTip.radius : 0.38
      );
      if (isValidAnchorPoint(chestStation)) {
        const fractions = [0.24, 0.62, 1.0];
        const radii = [0.58, 0.48, tipRad];
        for (let k = 0; k < 3; k++) {
          const f = fractions[k];
          whaleFlipperVecs[offset + k].set(
            chestStation.x + (fallbackTip.x - chestStation.x) * f,
            chestStation.y + (fallbackTip.y - chestStation.y) * f,
            chestStation.z + (fallbackTip.z - chestStation.z) * f,
            radii[k]
          );
        }
      } else {
        for (let k = 0; k < 3; k++) {
          whaleFlipperVecs[offset + k].set(
            fallbackTip.x,
            fallbackTip.y,
            fallbackTip.z,
            Math.max(0.45, tipRad)
          );
        }
      }
      return true;
    }

    for (let k = 0; k < 3; k++) {
      whaleFlipperVecs[offset + k].set(0, -100, 0, 0);
    }
    return false;
  }

  function syncWhaleUniforms(whaleAnchors) {
    if (!whaleAnchors || typeof whaleAnchors !== 'object') {
      uniforms.uWhalePresent.value = 0.0;
      for (let i = 0; i < WHALE_SPINE_SLOTS; i++) {
        whaleSpineVecs[i].set(0, -100, 0, 0);
      }
      for (let i = 0; i < WHALE_FLIPPER_SLOTS; i++) {
        whaleFlipperVecs[i].set(0, -100, 0, 0);
      }
      return;
    }

    const validSpine = Array.isArray(whaleAnchors.spineStations)
      ? whaleAnchors.spineStations.filter(isValidAnchorPoint)
      : [];

    let hasSpine = false;
    if (validSpine.length > 0) {
      hasSpine = true;
      for (let i = 0; i < WHALE_SPINE_SLOTS; i++) {
        if (i < validSpine.length) {
          const st = validSpine[i];
          const rad = Math.max(0.1, Number.isFinite(st.radius) ? st.radius : 0.85);
          whaleSpineVecs[i].set(st.x, st.y, st.z, rad);
        } else {
          whaleSpineVecs[i].set(0, -100, 0, 0);
        }
      }
    } else {
      for (let i = 0; i < WHALE_SPINE_SLOTS; i++) {
        whaleSpineVecs[i].set(0, -100, 0, 0);
      }
    }

    const chestRef =
      validSpine.length >= 3
        ? validSpine[2]
        : validSpine.length > 0
          ? validSpine[0]
          : null;

    const hasLeftFlipper = populateFlipperWingSlots(
      0,
      whaleAnchors.flipperTrailingL,
      whaleAnchors.flipperL,
      chestRef
    );
    const hasRightFlipper = populateFlipperWingSlots(
      3,
      whaleAnchors.flipperTrailingR,
      whaleAnchors.flipperR,
      chestRef
    );

    uniforms.uWhalePresent.value =
      hasSpine || hasLeftFlipper || hasRightFlipper ? 1.0 : 0.0;
  }

  function pushRipple(event = {}) {
    const entry = {
      x: Number.isFinite(event.x) ? event.x : 0,
      z: Number.isFinite(event.z) ? event.z : 0,
      startTime: Number.isFinite(event.startTime) ? event.startTime : lastTime,
      strength: Number.isFinite(event.strength) ? event.strength : 1.0,
      speed: Number.isFinite(event.speed) ? event.speed : 8.5,
    };

    if (ripples.length >= MAX_RIPPLE_SLOTS) {
      ripples.shift();
    }
    ripples.push(entry);
    syncRippleUniforms();
    return entry;
  }

  function applyMood(moodKey) {
    const key = MOOD_PRESETS[moodKey] ? moodKey : 'golden';
    if (key === currentMood) return;
    currentMood = key;
    const preset = MOOD_PRESETS[key];
    uniforms.uDeepColor.value.set(preset.deep);
    uniforms.uMidWaterColor.value.set(preset.mid);
    uniforms.uScatterColor.value.set(preset.scatter);
    uniforms.uSkyZenithColor.value.set(preset.zenith);
    uniforms.uMoodSubsurface.value = preset.subsurface;
    uniforms.uMoodGlitter.value = preset.glitter;
  }

  applyMood('golden');

  function update({
    time = 0,
    sunDirection,
    sunColor,
    skyHorizonColor,
    fogColor,
    fogDensity,
    waterDome,
    dome,
    mood,
    whaleAnchors,
  } = {}) {
    lastTime = time;
    uniforms.uTime.value = time;

    if (mood) {
      applyMood(mood);
    }

    if (sunDirection) {
      uniforms.uSunDirection.value.set(sunDirection.x, sunDirection.y, sunDirection.z);
      if (uniforms.uSunDirection.value.lengthSq() > 1e-8) {
        uniforms.uSunDirection.value.normalize();
      }
    }

    if (sunColor !== undefined) {
      uniforms.uSunColor.value.set(sunColor);
    }
    if (skyHorizonColor !== undefined) {
      uniforms.uHorizonColor.value.set(skyHorizonColor);
    }
    if (fogColor !== undefined) {
      uniforms.uFogColor.value.set(fogColor);
    }
    if (Number.isFinite(fogDensity)) {
      uniforms.uFogDensity.value = fogDensity;
    }

    const activeDome = waterDome ?? dome;
    if (activeDome && activeDome.height > 0 && activeDome.radius > 0) {
      uniforms.uDome.value.set(
        activeDome.x ?? 0,
        activeDome.z ?? 0,
        activeDome.radius,
        activeDome.height
      );
    } else {
      uniforms.uDome.value.set(0, 0, 4.8, 0);
    }

    syncWhaleUniforms(whaleAnchors);

    // Prune expired ripples in-place so shared array references stay valid
    for (let i = ripples.length - 1; i >= 0; i--) {
      const age = time - ripples[i].startTime;
      if (age >= MAX_RIPPLE_AGE || age < -0.05) {
        ripples.splice(i, 1);
      }
    }
    syncRippleUniforms();
  }

  return {
    mesh,
    material,
    ripples,
    pushRipple,
    update,
  };
}
