import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const ATMOSPHERE_MOODS = {
  golden: {
    label: 'Golden Hour',
    elevationDeg: 10.5,
    azimuthDeg: 278,
    turbidity: 6.2,
    rayleigh: 2.1,
    mieCoefficient: 0.0042,
    mieDirectionalG: 0.78,
    sunColor: '#ffb469',
    sunGlowColor: '#ff9d47',
    sunIntensity: 1.95,
    skyHorizonColor: '#c8784e',
    skyMidColor: '#485678',
    skyZenithColor: '#192f52',
    preethamScale: 0.11,
    sunGlowStrength: 0.32,
    cloudCoverage: 0.54,
    cloudBrightness: 1.0,
    fogColor: '#b56e4b',
    fogDensity: 0.00135,
    hemiSkyColor: '#e8b68e',
    hemiGroundColor: '#0e3647',
    hemiIntensity: 0.52,
    fillColor: '#719ec2',
    fillIntensity: 0.34,
    envIntensity: 0.52,
    exposure: 0.90,
    bloomStrength: 0.26,
    underwaterFogColor: '#062839',
    underwaterBgColor: '#052536',
    underwaterFogDensity: 0.025,
    underwaterHemiSky: '#3cc2d6',
    underwaterHemiGround: '#03131f',
    underwaterExposure: 1.04,
  },
  noon: {
    label: 'High Noon',
    elevationDeg: 48.0,
    azimuthDeg: 145,
    turbidity: 2.2,
    rayleigh: 1.25,
    mieCoefficient: 0.0028,
    mieDirectionalG: 0.74,
    sunColor: '#fff7e8',
    sunGlowColor: '#fff2d6',
    sunIntensity: 2.15,
    skyHorizonColor: '#69a8cf',
    skyMidColor: '#2b6fb5',
    skyZenithColor: '#123e7a',
    preethamScale: 0.09,
    sunGlowStrength: 0.20,
    cloudCoverage: 0.48,
    cloudBrightness: 1.08,
    fogColor: '#69a8cf',
    fogDensity: 0.00095,
    hemiSkyColor: '#9ed2f5',
    hemiGroundColor: '#0d5669',
    hemiIntensity: 0.56,
    fillColor: '#58b8c9',
    fillIntensity: 0.34,
    envIntensity: 0.50,
    exposure: 0.88,
    bloomStrength: 0.22,
    underwaterFogColor: '#0a4f66',
    underwaterBgColor: '#063547',
    underwaterFogDensity: 0.022,
    underwaterHemiSky: '#53d8eb',
    underwaterHemiGround: '#052233',
    underwaterExposure: 1.02,
  },
  twilight: {
    label: 'Twilight',
    elevationDeg: 5.5,
    azimuthDeg: 282,
    turbidity: 4.5,
    rayleigh: 2.6,
    mieCoefficient: 0.0035,
    mieDirectionalG: 0.80,
    sunColor: '#bdd4ff',
    sunGlowColor: '#9cbeff',
    sunIntensity: 1.48,
    skyHorizonColor: '#364d73',
    skyMidColor: '#1b2b4d',
    skyZenithColor: '#0a1326',
    preethamScale: 0.05,
    sunGlowStrength: 0.28,
    cloudCoverage: 0.56,
    cloudBrightness: 0.78,
    fogColor: '#263959',
    fogDensity: 0.00175,
    hemiSkyColor: '#5675ab',
    hemiGroundColor: '#061729',
    hemiIntensity: 0.46,
    fillColor: '#4c6ea6',
    fillIntensity: 0.30,
    envIntensity: 0.48,
    exposure: 0.95,
    bloomStrength: 0.26,
    underwaterFogColor: '#06253d',
    underwaterBgColor: '#031526',
    underwaterFogDensity: 0.028,
    underwaterHemiSky: '#2d7aa8',
    underwaterHemiGround: '#020c18',
    underwaterExposure: 1.08,
  },
};

function smoothstepRange(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function computeDerivedWaterlineFraction(relY) {
  const halfSpan = 0.55;
  if (relY >= halfSpan) return 0;
  if (relY <= -halfSpan) return 1;
  const norm = Math.abs(relY) / halfSpan;
  return THREE.MathUtils.clamp(
    0.5 - 0.5 * Math.sign(relY) * Math.pow(norm, 1.35),
    0,
    1,
  );
}

function computeSunDirection(elevationDeg, azimuthDeg, out = new THREE.Vector3()) {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  return out.setFromSphericalCoords(1, phi, theta).normalize();
}

/**
 * Calibrates Three.js Preetham `Sky` for a linear-HDR EffectComposer + OutputPass pipeline,
 * adding procedural FBM cumulus/cirrus cloud layers and distant volcanic island silhouettes.
 */
function upgradeSkyMaterialToLinearHDR(skyMesh) {
  const mat = skyMesh.material;
  mat.uniforms.uHorizonColor = { value: new THREE.Color('#c8784e') };
  mat.uniforms.uMidSkyColor = { value: new THREE.Color('#485678') };
  mat.uniforms.uZenithColor = { value: new THREE.Color('#192f52') };
  mat.uniforms.uSunGlowColor = { value: new THREE.Color('#ff9d47') };
  mat.uniforms.uPreethamScale = { value: 0.11 };
  mat.uniforms.uSunGlowStrength = { value: 0.32 };
  mat.uniforms.uCloudCoverage = { value: 0.54 };
  mat.uniforms.uCloudBrightness = { value: 1.0 };
  mat.uniforms.uTime = { value: 0.0 };

  mat.fragmentShader = mat.fragmentShader
    .replace(
      'uniform vec3 up;',
      /* glsl */ `
      uniform vec3 up;
      uniform vec3 uHorizonColor;
      uniform vec3 uMidSkyColor;
      uniform vec3 uZenithColor;
      uniform vec3 uSunGlowColor;
      uniform float uPreethamScale;
      uniform float uSunGlowStrength;
      uniform float uCloudCoverage;
      uniform float uCloudBrightness;
      uniform float uTime;

      float skyHash21( vec2 p ) {
        p = fract( p * vec2( 127.1, 311.7 ) );
        p += dot( p, p + 34.23 );
        return fract( p.x * p.y );
      }

      float skyNoise2( vec2 p ) {
        vec2 i = floor( p );
        vec2 f = fract( p );
        vec2 u = f * f * ( 3.0 - 2.0 * f );
        float a = skyHash21( i );
        float b = skyHash21( i + vec2( 1.0, 0.0 ) );
        float c = skyHash21( i + vec2( 0.0, 1.0 ) );
        float d = skyHash21( i + vec2( 1.0, 1.0 ) );
        return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
      }

      float skyFbm( vec2 p ) {
        float sum = 0.0;
        float amp = 0.5;
        mat2 rot = mat2( 0.80, -0.60, 0.60, 0.80 );
        for ( int i = 0; i < 5; i++ ) {
          sum += amp * skyNoise2( p );
          p = rot * p * 2.03 + vec2( 17.1, 31.7 );
          amp *= 0.5;
        }
        return sum;
      }

      float skySqr( float x ) {
        return x * x;
      }

      float skyWrapAngle( float a, float center ) {
        float d = a - center;
        return atan( sin( d ), cos( d ) );
      }

      float skyIslandProfile( float az ) {
        // West-southwest volcanic caldera & twin-peak island group (flanks left of main view)
        float d1 = skyWrapAngle( az, -2.78 );
        float env1 = exp( -skySqr( d1 / 0.24 ) ) * smoothstep( 0.36, 0.08, abs( d1 ) );
        float ridge1 = 0.56 + 0.28 * cos( d1 * 13.5 - 0.6 ) + 0.16 * ( 1.0 - abs( sin( d1 * 29.0 + 0.4 ) ) );
        float calderaNotch = 1.0 - 0.22 * exp( -skySqr( ( d1 + 0.03 ) / 0.035 ) );
        float h1 = 0.0255 * env1 * ridge1 * calderaNotch;

        // South-southeast coastal headland & sea-stack chain (flanks right of main view)
        float d2 = skyWrapAngle( az, -1.88 );
        float env2 = exp( -skySqr( d2 / 0.20 ) ) * smoothstep( 0.31, 0.06, abs( d2 ) );
        float cliffSlope = smoothstep( -0.24, 0.12, d2 );
        float ridge2 = 0.52 + 0.30 * ( 1.0 - abs( sin( d2 * 24.0 - 0.8 ) ) ) + 0.18 * sin( d2 * 43.0 );
        float seaStack = 0.0065 * exp( -skySqr( ( d2 - 0.21 ) / 0.018 ) );
        float h2 = 0.0185 * env2 * mix( 0.65, 1.0, cliffSlope ) * ridge2 + seaStack;

        // Far northeast archipelago for 360-degree orbit / aerial views
        float d3 = skyWrapAngle( az, 0.86 );
        float env3 = exp( -skySqr( d3 / 0.28 ) ) * smoothstep( 0.40, 0.10, abs( d3 ) );
        float ridge3 = 0.58 + 0.26 * ( 1.0 - abs( sin( d3 * 19.0 + 1.1 ) ) ) + 0.16 * cos( d3 * 37.0 );
        float h3 = 0.0215 * env3 * ridge3;

        return clamp( max( max( h1, h2 ), h3 ), 0.0, 0.028 );
      }
      `,
    )
    .replace(
      /vec3 texColor =[\s\S]*?#include <colorspace_fragment>/,
      /* glsl */ `
      vec3 preethamLinear = clamp( Lin * 0.004, vec3( 0.0 ), vec3( 0.65 ) ) * uPreethamScale;

      float elev = clamp( direction.y, 0.0, 1.0 );
      float lowBand = smoothstep( 0.0, 0.24, elev );
      float highBand = smoothstep( 0.16, 0.82, elev );
      vec3 baseGrad = mix( uHorizonColor, uMidSkyColor, lowBand );
      baseGrad = mix( baseGrad, uZenithColor, highBand );

      float sunAlign = max( cosTheta, 0.0 );
      float horizonMask = exp( -elev * 5.0 );
      float wideGlow = pow( sunAlign, 5.0 ) * ( 0.32 + 0.68 * horizonMask );
      float tightCorona = pow( sunAlign, 44.0 ) * 0.48;
      float crispDisc = smoothstep( 0.99935, 0.99985, cosTheta ) * 1.25;

      vec3 linearSky = baseGrad + preethamLinear;
      linearSky += uSunGlowColor * ( ( wideGlow + tightCorona ) * uSunGlowStrength );

      // Procedural multi-layered clouds (cumulus deck + windswept high cirrus bands)
      if ( direction.y > 0.003 ) {
        vec2 domeUv = direction.xz / ( direction.y + 0.14 );
        float cloudHorizonFade = smoothstep( 0.010, 0.14, elev );
        float cloudZenithFade = 1.0 - smoothstep( 0.52, 0.92, elev );

        // High altitude cirrus wisps
        vec2 cirrusWind = vec2( uTime * 0.0032, -uTime * 0.0014 );
        vec2 cirrusUv = domeUv * vec2( 0.72, 1.85 ) + cirrusWind;
        float cirrusWarp = skyFbm( cirrusUv * 0.55 + vec2( 4.2, -2.7 ) );
        float cirrusRaw = skyFbm( cirrusUv + vec2( cirrusWarp * 0.85, -cirrusWarp * 0.45 ) );
        float cirrusMask = smoothstep( 0.54, 0.84, cirrusRaw ) * smoothstep( 0.05, 0.24, elev ) * ( 1.0 - smoothstep( 0.62, 0.95, elev ) );
        vec3 cirrusColor = mix(
          mix( uMidSkyColor * 1.22, uHorizonColor * 1.08, horizonMask ),
          uSunGlowColor * 0.95 + vec3( 0.16 ),
          0.32 + 0.55 * pow( sunAlign, 3.5 )
        ) * uCloudBrightness;
        cirrusColor = min( cirrusColor, vec3( 1.25 ) );
        linearSky = mix( linearSky, cirrusColor, cirrusMask * 0.38 * cloudHorizonFade );

        // Lower marine cumulus / stratocumulus bands with directional sun self-shadowing
        vec2 cumulusWind = vec2( uTime * 0.0065, uTime * 0.0028 );
        vec2 cumulusUv = domeUv * 1.08 + cumulusWind;
        float baseBillow = skyFbm( cumulusUv );
        float detailBillow = skyFbm( cumulusUv * 2.35 - cumulusWind * 1.4 );
        float cloudField = baseBillow * 0.72 + detailBillow * 0.28;
        float coverageEdge = 1.0 - uCloudCoverage;
        float cumulusMask = smoothstep( coverageEdge - 0.06, coverageEdge + 0.28, cloudField ) * cloudHorizonFade * cloudZenithFade;

        if ( cumulusMask > 0.001 ) {
          vec2 sunOffsetUv = cumulusUv + vSunDirection.xz * 0.09;
          float sunSample = skyFbm( sunOffsetUv ) * 0.75 + detailBillow * 0.25;
          float selfLit = clamp( ( cloudField - sunSample ) * 2.4 + 0.56, 0.0, 1.0 );
          float silverLining = ( pow( sunAlign, 6.0 ) * 0.52 + pow( sunAlign, 26.0 ) * 0.55 ) * ( 1.0 - cumulusMask * 0.45 );

          vec3 cloudShadowCol = mix( uZenithColor * 0.85, uMidSkyColor * 0.76, 0.62 );
          cloudShadowCol = mix( cloudShadowCol, uHorizonColor * 0.72, horizonMask * 0.55 );
          vec3 cloudLitCol = mix(
            uHorizonColor * 1.12 + vec3( 0.07 ),
            uSunGlowColor * 0.96 + vec3( 0.14 ),
            0.52 + 0.38 * sunAlign
          ) * uCloudBrightness;
          vec3 cloudCol = mix( cloudShadowCol, cloudLitCol, selfLit );
          cloudCol += uSunGlowColor * silverLining * uSunGlowStrength * 1.35;
          cloudCol = min( cloudCol, vec3( 1.32 ) );

          // Blend distant clouds softly into horizon atmospheric scattering
          cloudCol = mix( linearSky, cloudCol, smoothstep( 0.012, 0.18, elev ) );
          linearSky = mix( linearSky, cloudCol, cumulusMask * 0.76 );
        }
      }

      // Crisp solar disc occluded naturally behind thick cloud cores
      linearSky += uSunGlowColor * crispDisc;

      // Subtle distant volcanic island & coastal headland silhouettes along horizon azimuths
      float az = atan( direction.z, direction.x );
      float farIslandH = skyIslandProfile( az + 0.19 ) * 0.66;
      float nearIslandH = skyIslandProfile( az );
      float horizonFloor = smoothstep( -0.0025, 0.0012, direction.y );

      if ( farIslandH > 0.0005 && direction.y < farIslandH + 0.002 ) {
        float farMask = horizonFloor * smoothstep( farIslandH + 0.0012, farIslandH - 0.0010, direction.y );
        vec3 farRock = mix( uZenithColor * 0.42, uMidSkyColor * 0.48, 0.5 );
        vec3 farHaze = linearSky + uSunGlowColor * pow( sunAlign, 4.0 ) * 0.04;
        vec3 farCol = mix( farRock, farHaze, 0.85 );
        linearSky = mix( linearSky, farCol, farMask * 0.88 );
      }

      if ( nearIslandH > 0.0005 && direction.y < nearIslandH + 0.002 ) {
        float nearMask = horizonFloor * smoothstep( nearIslandH + 0.0011, nearIslandH - 0.0011, direction.y );
        float relElev = clamp( direction.y / max( nearIslandH, 0.001 ), 0.0, 1.0 );
        vec3 basaltBase = mix( uZenithColor * 0.32, uMidSkyColor * 0.40, 0.45 + 0.35 * relElev );
        float seaMist = exp( -max( direction.y, 0.0 ) * 140.0 ) * 0.16;
        float atmoHaze = clamp( 0.70 + 0.14 * pow( sunAlign, 3.0 ) + seaMist, 0.0, 0.92 );
        vec3 islandCol = mix( basaltBase, linearSky, atmoHaze );
        linearSky = mix( linearSky, islandCol, nearMask );
      }

      float belowMask = smoothstep( -0.06, 0.004, direction.y );
      linearSky = mix( uHorizonColor * 0.72, linearSky, belowMask );

      gl_FragColor = vec4( linearSky, 1.0 );
      `,
    );

  mat.needsUpdate = true;
}

function applySkyUniforms(skyMesh, moodConfig, sunDir) {
  const uniforms = skyMesh.material.uniforms;
  uniforms.turbidity.value = moodConfig.turbidity;
  uniforms.rayleigh.value = moodConfig.rayleigh;
  uniforms.mieCoefficient.value = moodConfig.mieCoefficient;
  uniforms.mieDirectionalG.value = moodConfig.mieDirectionalG;
  uniforms.sunPosition.value.copy(sunDir);
  uniforms.uHorizonColor.value.set(moodConfig.skyHorizonColor);
  uniforms.uMidSkyColor.value.set(moodConfig.skyMidColor);
  uniforms.uZenithColor.value.set(moodConfig.skyZenithColor);
  uniforms.uSunGlowColor.value.set(moodConfig.sunGlowColor);
  uniforms.uPreethamScale.value = moodConfig.preethamScale;
  uniforms.uSunGlowStrength.value = moodConfig.sunGlowStrength;
  uniforms.uCloudCoverage.value = moodConfig.cloudCoverage ?? 0.52;
  uniforms.uCloudBrightness.value = moodConfig.cloudBrightness ?? 1.0;
}

const LensAndWaterlineShader = {
  name: 'LensAndWaterlineShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 16 / 9 },
    uWaterlineFraction: { value: 0 },
    uSplitActive: { value: 0 },
    uLensWetness: { value: 0 },
    uUnderwaterColor: { value: new THREE.Color('#062839') },
    uUnderwaterShallowColor: { value: new THREE.Color('#3cc2d6') },
    uSunGlowColor: { value: new THREE.Color('#ff9d47') },
    uSunScreenDir: { value: new THREE.Vector2(-0.5, 0.65) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAspect;
    uniform float uWaterlineFraction;
    uniform float uSplitActive;
    uniform float uLensWetness;
    uniform vec3 uUnderwaterColor;
    uniform vec3 uUnderwaterShallowColor;
    uniform vec3 uSunGlowColor;
    uniform vec2 uSunScreenDir;

    varying vec2 vUv;

    float lwSqr( float x ) {
      return x * x;
    }

    vec2 lwSafeNorm2( vec2 v ) {
      float l = length( v );
      return l > 1e-5 ? v / l : vec2( 0.0, 1.0 );
    }

    float lwHash21( vec2 p ) {
      p = fract( p * vec2( 234.34, 435.345 ) );
      p += dot( p, p + 34.23 );
      return fract( p.x * p.y );
    }

    vec2 lwHash22( vec2 p ) {
      float n = lwHash21( p );
      return vec2( n, lwHash21( p + n + 19.19 ) );
    }

    float lwNoise( vec2 p ) {
      vec2 i = floor( p );
      vec2 f = fract( p );
      vec2 u = f * f * ( 3.0 - 2.0 * f );
      return mix(
        mix( lwHash21( i ), lwHash21( i + vec2( 1.0, 0.0 ) ), u.x ),
        mix( lwHash21( i + vec2( 0.0, 1.0 ) ), lwHash21( i + vec2( 1.0, 1.0 ) ), u.x ),
        u.y
      );
    }

    // Returns vec3( normalX, normalY, mask ) for a grid of refractive water beads & trails
    vec3 evaluateDropletLayer( vec2 p, float scale, float slideSpeed, float wetness ) {
      vec2 st = p * scale;
      float colSeed = lwHash21( vec2( floor( st.x ), scale ) );
      float slide = uTime * slideSpeed * ( 0.55 + 0.75 * colSeed );
      st.y += slide;

      vec2 cellId = floor( st );
      vec2 local = fract( st ) - 0.5;
      vec2 rnd = lwHash22( cellId + scale * 0.37 );

      // Staggered evaporation so smaller/sparser droplets vanish naturally as wetness decays
      float threshold = rnd.x * 0.72;
      float presence = smoothstep( threshold, min( 1.0, threshold + 0.26 ), wetness );
      if ( presence <= 0.001 ) {
        return vec3( 0.0 );
      }

      float wobble = sin( uTime * ( 1.8 + rnd.y * 2.2 ) + rnd.x * 6.2831 ) * 0.06;
      vec2 center = ( rnd - 0.5 ) * vec2( 0.52, 0.44 ) + vec2( wobble, 0.0 );
      vec2 d = local - center;

      // Slight teardrop elongation vertically
      vec2 dShape = vec2( d.x * 1.08, d.y * ( d.y > 0.0 ? 1.15 : 0.88 ) );
      float radius = ( 0.14 + 0.17 * rnd.y ) * ( 0.55 + 0.45 * presence );
      float dist = length( dShape );
      float dropMask = smoothstep( radius, radius * 0.62, dist ) * presence;

      vec2 normXY = vec2( 0.0 );
      if ( dropMask > 0.001 ) {
        normXY = ( d / max( radius, 0.001 ) ) * dropMask;
      }

      // Gravity rivulet trail above sliding bead
      if ( slideSpeed > 0.01 ) {
        float above = local.y - center.y;
        float trailLen = 0.42 * presence;
        float inTrailY = smoothstep( 0.0, 0.05, above ) * smoothstep( trailLen, 0.04, above );
        float trailWidth = radius * 0.32 * ( 1.0 - above / max( trailLen, 0.01 ) * 0.45 );
        float trailMask = smoothstep( trailWidth, trailWidth * 0.25, abs( d.x ) ) * inTrailY * presence * 0.65;
        float subBeads = smoothstep( 0.35, 0.85, fract( above * 9.0 - slide * 1.5 ) );
        trailMask *= ( 0.45 + 0.55 * subBeads );
        normXY.x += ( d.x / max( trailWidth, 0.002 ) ) * trailMask * 0.6;
        dropMask = max( dropMask, trailMask );
      }

      return vec3( normXY, dropMask );
    }

    void main() {
      vec2 p = vec2( ( vUv.x - 0.5 ) * uAspect, vUv.y - 0.5 );
      vec2 refractOffset = vec2( 0.0 );

      // 1. Over/Under Split-Waterline Meniscus wave & refraction
      float meniscusY = uWaterlineFraction;
      float signedDist = vUv.y - meniscusY;
      float meniscusBand = 0.0;
      float submergeMask = 0.0;
      float meniscusSlope = 0.0;

      if ( uSplitActive > 0.001 ) {
        float xCoord = p.x;
        float wave1 = sin( xCoord * 4.4 + uTime * 2.25 ) * 0.0135;
        float wave2 = sin( xCoord * 10.2 - uTime * 3.55 + 1.4 ) * 0.0062;
        float wave3 = sin( xCoord * 21.0 + uTime * 5.3 ) * 0.0024;
        float capNoise = ( lwNoise( vec2( xCoord * 3.8 + uTime * 0.65, uTime * 0.9 ) ) - 0.5 ) * 0.011;
        float meniscusWave = ( wave1 + wave2 + wave3 + capNoise ) * uSplitActive;

        meniscusSlope = (
          cos( xCoord * 4.4 + uTime * 2.25 ) * 0.059 -
          cos( xCoord * 10.2 - uTime * 3.55 + 1.4 ) * 0.063
        ) * uSplitActive;

        meniscusY = uWaterlineFraction + meniscusWave;
        signedDist = vUv.y - meniscusY;

        meniscusBand = exp( -lwSqr( signedDist / 0.0135 ) ) * uSplitActive;
        submergeMask = ( 1.0 - smoothstep( -0.0055, 0.0055, signedDist ) ) * uSplitActive;

        // Surface-tension meniscus lens warp + subtle underwater wave refraction
        refractOffset.x += meniscusSlope * 0.16 * meniscusBand;
        refractOffset.y -= signedDist * 0.46 * meniscusBand;

        vec2 uwWobble = vec2(
          sin( vUv.y * 19.0 + uTime * 2.3 + vUv.x * 5.0 ),
          cos( vUv.x * 15.0 - uTime * 1.85 + vUv.y * 7.0 )
        ) * 0.0028 * submergeMask;
        refractOffset += uwWobble;
      }

      // 2. Refractive Camera Lens Water Droplets & Sliding Streaks
      vec2 dropNormal = vec2( 0.0 );
      float dropMask = 0.0;
      if ( uLensWetness > 0.01 ) {
        float wet = clamp( uLensWetness, 0.0, 1.0 );
        vec3 heroDrops = evaluateDropletLayer( p, 5.2, 0.055, wet );
        vec3 midDrops = evaluateDropletLayer( p + vec2( 0.37, -0.21 ), 9.6, 0.11, wet * 0.92 );
        vec3 fineMist = evaluateDropletLayer( p + vec2( -0.61, 0.43 ), 16.5, 0.0, wet * 0.82 );

        dropNormal = heroDrops.xy * 1.0 + midDrops.xy * 0.72 + fineMist.xy * 0.45;
        dropMask = clamp( max( max( heroDrops.z, midDrops.z * 0.88 ), fineMist.z * 0.68 ), 0.0, 1.0 );

        refractOffset -= dropNormal * 0.028;
      }

      vec2 sampleUv = clamp( vUv + refractOffset, vec2( 0.001 ), vec2( 0.999 ) );
      vec4 baseTex = texture2D( tDiffuse, sampleUv );
      vec3 col = baseTex.rgb;

      // Subtle chromatic dispersion across meniscus & heavy droplets
      float dispersionAmt = meniscusBand * 0.0032 + dropMask * 0.0022;
      if ( dispersionAmt > 0.0002 ) {
        vec2 dispDir = lwSafeNorm2( refractOffset ) * dispersionAmt;
        col.r = texture2D( tDiffuse, clamp( sampleUv + dispDir, vec2( 0.001 ), vec2( 0.999 ) ) ).r;
        col.b = texture2D( tDiffuse, clamp( sampleUv - dispDir, vec2( 0.001 ), vec2( 0.999 ) ) ).b;
      }

      // 3. Submerged lower-frame teal absorption, shallow scatter & meniscus sunlit rim
      if ( uSplitActive > 0.001 ) {
        if ( submergeMask > 0.001 ) {
          float depthBelow = clamp( -signedDist / max( meniscusY, 0.12 ), 0.0, 1.0 );
          vec3 absorption = mix( vec3( 0.74, 0.96, 1.04 ), vec3( 0.34, 0.72, 0.88 ), depthBelow );
          vec3 graded = col * absorption;

          vec3 waterScatter = mix(
            uUnderwaterShallowColor * 0.22,
            uUnderwaterColor * 0.88,
            pow( max( depthBelow, 1e-5 ), 0.72 )
          );
          float scatterWeight = mix( 0.24, 0.56, depthBelow );
          graded = mix( graded, waterScatter + graded * 0.45, scatterWeight );

          // Shimmering sub-surface caustic shafts just beneath the meniscus
          float shaftWave = sin( p.x * 16.0 + uTime * 1.9 + signedDist * 9.0 ) * 0.5 + 0.5;
          float shaftWave2 = sin( p.x * 29.0 - uTime * 2.6 - signedDist * 12.0 ) * 0.5 + 0.5;
          float shafts = pow( max( shaftWave * shaftWave2, 1e-5 ), 2.2 ) * exp( -depthBelow * 3.2 );
          graded += ( uUnderwaterShallowColor * 0.55 + uSunGlowColor * 0.25 ) * shafts * 0.22;

          col = mix( col, graded, submergeMask );
        }

        // Crisp air-water meniscus total-internal-reflection silver & sunlit rim glow
        float thinCore = exp( -lwSqr( signedDist / 0.0034 ) ) * uSplitActive;
        float sunSide = clamp( 0.6 + 0.4 * dot( lwSafeNorm2( vec2( -meniscusSlope, 0.25 ) ), lwSafeNorm2( uSunScreenDir + vec2( 0.0, 0.4 ) ) ), 0.0, 1.0 );
        float microBead = 0.78 + 0.22 * lwNoise( vec2( p.x * 48.0 - uTime * 1.7, uTime * 2.5 ) );
        vec3 rimColor = mix( uUnderwaterShallowColor * 0.85 + vec3( 0.22 ), uSunGlowColor * 0.95 + vec3( 0.28 ), 0.48 * sunSide );
        col = mix( col, col * 0.72 + rimColor * 0.55, meniscusBand * 0.42 );
        col += rimColor * thinCore * microBead * 0.46;
      }

      // 4. Droplet internal Fresnel shading & warm solar specular glints
      if ( dropMask > 0.001 ) {
        vec2 sunDir2D = lwSafeNorm2( uSunScreenDir );
        vec3 dropN3 = normalize( vec3( dropNormal * 1.65, 0.68 ) );
        vec3 sunDir3 = normalize( vec3( sunDir2D * 0.68, 0.73 ) );

        float spec = pow( max( dot( dropN3, sunDir3 ), 0.0 ), 26.0 );
        float causticFocus = max( dot( -dropNormal, sunDir2D ), 0.0 );
        float rimDark = clamp( length( dropNormal ) * 0.55, 0.0, 0.28 );

        col *= ( 1.0 - rimDark * dropMask * 0.45 );
        col += ( vec3( 0.10 ) + uSunGlowColor * 0.14 ) * causticFocus * dropMask;
        col += mix( vec3( 1.0 ), uSunGlowColor, 0.55 ) * spec * ( 0.45 + 0.55 * clamp( uLensWetness, 0.0, 1.0 ) );
      }

      gl_FragColor = vec4( max( col, vec3( 0.0 ) ), baseTex.a );
    }
  `,
};

export function createEnvironment({
  scene,
  renderer = null,
  camera,
  initialMood = 'golden',
  width = 1280,
  height = 720,
}) {
  if (renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  let currentMood = ATMOSPHERE_MOODS[initialMood] ? initialMood : 'golden';
  let isSubmerged = false;
  let currentWaterlineFraction = 0;
  let internalLensWetness = 0;
  let activeLensWetness = 0;
  let currentTime = 0;

  const sunDirection = new THREE.Vector3();
  const sunColor = new THREE.Color();
  const skyHorizonColor = new THREE.Color();
  const fogColor = new THREE.Color();
  const backgroundColor = new THREE.Color();
  const desiredFogColor = new THREE.Color();
  const desiredBgColor = new THREE.Color();
  const aboveColorScratch = new THREE.Color();
  const underColorScratch = new THREE.Color();
  const projectedSunScratch = new THREE.Vector3();
  let fogDensity = ATMOSPHERE_MOODS[currentMood].fogDensity;

  // Main calibrated linear-HDR Sky dome
  const sky = new Sky();
  upgradeSkyMaterialToLinearHDR(sky);
  sky.scale.setScalar(1800);
  sky.frustumCulled = false;
  scene.add(sky);

  // Scene Fog (exponential squared for seamless horizon & underwater depth)
  const sceneFog = new THREE.FogExp2('#b56e4b', fogDensity);
  scene.fog = sceneFog;

  // Directional Sun Light + Hemisphere Sky/Ocean Light + Subtle Camera-Side Sky/Water Bounce Fill
  const sunLight = new THREE.DirectionalLight('#ffb469', 1.95);
  sunLight.position.set(-100, 22, 14);
  scene.add(sunLight);

  const hemiLight = new THREE.HemisphereLight('#e8b68e', '#0e3647', 0.52);
  scene.add(hemiLight);

  const fillLight = new THREE.DirectionalLight('#719ec2', 0.34);
  fillLight.position.set(36, 20, 34);
  scene.add(fillLight);

  // PMREM Environment reflection map from dedicated clean sky scene (shares cloud/island shader!)
  let pmremGenerator = null;
  let envRenderTarget = null;
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  upgradeSkyMaterialToLinearHDR(envSky);
  envSky.scale.setScalar(500);
  envScene.add(envSky);

  if (renderer) {
    pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
  }

  // Post-processing: EffectComposer + RenderPass + UnrealBloomPass + lensAndWaterlinePass + OutputPass
  const safeInitW = Math.max(1, width);
  const safeInitH = Math.max(1, height);
  const lensAndWaterlinePass = new ShaderPass(LensAndWaterlineShader);
  lensAndWaterlinePass.uniforms.uAspect.value = safeInitW / safeInitH;
  lensAndWaterlinePass.enabled = false;

  let composer = null;
  let renderPass = null;
  let bloomPass = null;
  let outputPass = null;

  if (renderer && camera) {
    const pixelRatio = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
    const rtWidth = Math.max(1, Math.floor(safeInitW * pixelRatio));
    const rtHeight = Math.max(1, Math.floor(safeInitH * pixelRatio));
    const isWebGL2 = Boolean(renderer.capabilities?.isWebGL2);

    const composerTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight, {
      type: THREE.HalfFloatType,
      samples: isWebGL2 ? 4 : 0,
    });

    composer = new EffectComposer(renderer, composerTarget);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(safeInitW, safeInitH);

    renderPass = new RenderPass(scene, camera);
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(safeInitW, safeInitH),
      0.26,
      0.5,
      0.82,
    );
    outputPass = new OutputPass();

    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(lensAndWaterlinePass);
    composer.addPass(outputPass);
  }

  function updatePostProcessUniforms() {
    const moodCfg = ATMOSPHERE_MOODS[currentMood];
    const u = lensAndWaterlinePass.uniforms;
    u.uTime.value = currentTime;
    u.uWaterlineFraction.value = currentWaterlineFraction;

    const isSplit =
      !isSubmerged &&
      currentWaterlineFraction > 0.02 &&
      currentWaterlineFraction < 0.98;
    const splitStrength = isSplit
      ? smoothstepRange(0.02, 0.06, currentWaterlineFraction) *
        (1 - smoothstepRange(0.94, 0.98, currentWaterlineFraction))
      : 0;
    u.uSplitActive.value = isSplit ? Math.max(0.15, splitStrength) : 0;
    u.uLensWetness.value = activeLensWetness;
    u.uUnderwaterColor.value.set(moodCfg.underwaterFogColor);
    u.uUnderwaterShallowColor.value.set(moodCfg.underwaterHemiSky);
    u.uSunGlowColor.value.set(moodCfg.sunGlowColor);

    if (camera) {
      projectedSunScratch
        .copy(camera.position)
        .addScaledVector(sunDirection, 200)
        .project(camera);
      const sx = THREE.MathUtils.clamp(projectedSunScratch.x, -1.2, 1.2);
      const sy = THREE.MathUtils.clamp(projectedSunScratch.y, -1.2, 1.2);
      if (Number.isFinite(sx) && Number.isFinite(sy)) {
        u.uSunScreenDir.value.set(sx, Math.max(0.25, sy));
      }
    }

    lensAndWaterlinePass.enabled = isSplit || activeLensWetness > 0.01;
  }

  function applyAtmosphereMedium(
    submergedFlag,
    waterlineFrac = submergedFlag ? 1 : 0,
    immediate = false,
    dt = 1 / 60,
  ) {
    const moodCfg = ATMOSPHERE_MOODS[currentMood];
    isSubmerged = Boolean(submergedFlag);
    currentWaterlineFraction = THREE.MathUtils.clamp(waterlineFrac, 0, 1);

    const isSplit =
      !isSubmerged &&
      currentWaterlineFraction > 0.02 &&
      currentWaterlineFraction < 0.98;

    let targetFogDensity;
    let targetExposure;

    if (isSubmerged) {
      desiredFogColor.set(moodCfg.underwaterFogColor);
      desiredBgColor.set(moodCfg.underwaterBgColor);
      targetFogDensity = moodCfg.underwaterFogDensity;
      targetExposure = moodCfg.underwaterExposure;
    } else if (isSplit) {
      // Keep sky visible for upper dome while gently blending humid surface haze
      const colorMix = currentWaterlineFraction * 0.42;
      const densityMix = Math.pow(currentWaterlineFraction, 2.3) * 0.34;
      desiredFogColor
        .set(moodCfg.fogColor)
        .lerp(underColorScratch.set(moodCfg.underwaterFogColor), colorMix);
      desiredBgColor
        .set(moodCfg.skyHorizonColor)
        .lerp(underColorScratch.set(moodCfg.underwaterBgColor), colorMix);
      targetFogDensity = THREE.MathUtils.lerp(
        moodCfg.fogDensity,
        moodCfg.underwaterFogDensity,
        densityMix,
      );
      targetExposure = THREE.MathUtils.lerp(
        moodCfg.exposure,
        moodCfg.underwaterExposure,
        currentWaterlineFraction * 0.38,
      );
    } else {
      desiredFogColor.set(moodCfg.fogColor);
      desiredBgColor.set(moodCfg.skyHorizonColor);
      targetFogDensity = moodCfg.fogDensity;
      targetExposure = moodCfg.exposure;
    }

    const blend = immediate
      ? 1
      : 1 - Math.exp(-8.5 * Math.min(0.1, Math.max(0, dt)));

    if (immediate) {
      fogColor.copy(desiredFogColor);
      backgroundColor.copy(desiredBgColor);
      fogDensity = targetFogDensity;
    } else {
      fogColor.lerp(desiredFogColor, blend);
      backgroundColor.lerp(desiredBgColor, blend);
      fogDensity = THREE.MathUtils.lerp(fogDensity, targetFogDensity, blend);
    }

    sceneFog.color.copy(fogColor);
    sceneFog.density = fogDensity;
    sky.visible = !isSubmerged;
    scene.background = backgroundColor;
    scene.environmentIntensity = isSubmerged
      ? moodCfg.envIntensity * 0.72
      : isSplit
        ? THREE.MathUtils.lerp(
            moodCfg.envIntensity,
            moodCfg.envIntensity * 0.84,
            currentWaterlineFraction,
          )
        : moodCfg.envIntensity;

    if (isSubmerged) {
      hemiLight.color.set(moodCfg.underwaterHemiSky);
      hemiLight.groundColor.set(moodCfg.underwaterHemiGround);
      hemiLight.intensity = moodCfg.hemiIntensity * 1.2;
      sunLight.intensity = moodCfg.sunIntensity * 0.65;
      fillLight.color.set(moodCfg.underwaterHemiSky);
      fillLight.intensity = moodCfg.fillIntensity * 0.9;
    } else if (isSplit) {
      const lightMix = currentWaterlineFraction * 0.45;
      hemiLight.color
        .copy(aboveColorScratch.set(moodCfg.hemiSkyColor))
        .lerp(underColorScratch.set(moodCfg.underwaterHemiSky), lightMix);
      hemiLight.groundColor
        .copy(aboveColorScratch.set(moodCfg.hemiGroundColor))
        .lerp(underColorScratch.set(moodCfg.underwaterHemiGround), lightMix);
      hemiLight.intensity = THREE.MathUtils.lerp(
        moodCfg.hemiIntensity,
        moodCfg.hemiIntensity * 1.15,
        lightMix,
      );
      sunLight.intensity = THREE.MathUtils.lerp(
        moodCfg.sunIntensity,
        moodCfg.sunIntensity * 0.82,
        lightMix,
      );
      fillLight.color
        .copy(aboveColorScratch.set(moodCfg.fillColor))
        .lerp(underColorScratch.set(moodCfg.underwaterHemiSky), lightMix);
      fillLight.intensity = moodCfg.fillIntensity;
    } else {
      hemiLight.color.set(moodCfg.hemiSkyColor);
      hemiLight.groundColor.set(moodCfg.hemiGroundColor);
      hemiLight.intensity = moodCfg.hemiIntensity;
      sunLight.intensity = moodCfg.sunIntensity;
      fillLight.color.set(moodCfg.fillColor);
      fillLight.intensity = moodCfg.fillIntensity;
    }

    if (bloomPass) {
      bloomPass.strength = isSubmerged
        ? moodCfg.bloomStrength * 0.75
        : isSplit
          ? THREE.MathUtils.lerp(
              moodCfg.bloomStrength,
              moodCfg.bloomStrength * 0.85,
              currentWaterlineFraction,
            )
          : moodCfg.bloomStrength;
    }

    if (renderer) {
      renderer.toneMappingExposure = immediate
        ? targetExposure
        : THREE.MathUtils.lerp(
            renderer.toneMappingExposure,
            targetExposure,
            blend,
          );
    }

    updatePostProcessUniforms();
  }

  function setMood(moodName) {
    if (!ATMOSPHERE_MOODS[moodName]) {
      return getAtmosphereState();
    }
    currentMood = moodName;
    const moodCfg = ATMOSPHERE_MOODS[currentMood];

    computeSunDirection(moodCfg.elevationDeg, moodCfg.azimuthDeg, sunDirection);
    sunColor.set(moodCfg.sunColor);
    skyHorizonColor.set(moodCfg.skyHorizonColor);

    applySkyUniforms(sky, moodCfg, sunDirection);
    applySkyUniforms(envSky, moodCfg, sunDirection);

    sunLight.color.copy(sunColor);
    sunLight.position.copy(sunDirection).multiplyScalar(120);

    if (pmremGenerator) {
      const nextEnv = pmremGenerator.fromScene(envScene, 0.02);
      if (envRenderTarget) {
        envRenderTarget.dispose();
      }
      envRenderTarget = nextEnv;
      scene.environment = envRenderTarget.texture;
    }

    applyAtmosphereMedium(isSubmerged, currentWaterlineFraction, true);
    return getAtmosphereState();
  }

  function getMood() {
    return currentMood;
  }

  function triggerLensSplash(amount = 0.6) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    internalLensWetness = Math.min(1.0, internalLensWetness + amount);
    activeLensWetness = Math.max(activeLensWetness, internalLensWetness);
    updatePostProcessUniforms();
  }

  function getAtmosphereState() {
    return {
      mood: currentMood,
      sunDirection: sunDirection.clone(),
      sunColor: sunColor.clone(),
      skyHorizonColor: skyHorizonColor.clone(),
      fogColor: fogColor.clone(),
      fogDensity,
      isSubmerged,
      waterlineFraction: currentWaterlineFraction,
      lensWetness: activeLensWetness,
    };
  }

  function update({
    dt = 1 / 60,
    cameraPosition = camera?.position,
    waterHeightAtCamera = 0,
    waterlineFraction,
    lensWetness,
    time,
  } = {}) {
    const safeDt = THREE.MathUtils.clamp(dt, 0, 0.1);
    currentTime = Number.isFinite(time) ? time : currentTime + safeDt;
    sky.material.uniforms.uTime.value = currentTime;

    if (internalLensWetness > 0 && safeDt > 0) {
      internalLensWetness = Math.max(
        0,
        internalLensWetness * Math.exp(-0.85 * safeDt) - 0.008 * safeDt,
      );
      if (internalLensWetness < 1e-4) {
        internalLensWetness = 0;
      }
    }

    const passedWetness = Number.isFinite(lensWetness)
      ? THREE.MathUtils.clamp(lensWetness, 0, 1)
      : 0;
    activeLensWetness = THREE.MathUtils.clamp(
      Math.max(internalLensWetness, passedWetness),
      0,
      1,
    );

    const camY = cameraPosition?.y ?? 0;
    const effectiveWaterline = Number.isFinite(waterlineFraction)
      ? THREE.MathUtils.clamp(waterlineFraction, 0, 1)
      : computeDerivedWaterlineFraction(camY - waterHeightAtCamera);

    const fullySubmerged =
      effectiveWaterline >= 0.98 || camY < waterHeightAtCamera - 0.55;
    const switchedMedium = fullySubmerged !== isSubmerged;

    applyAtmosphereMedium(
      fullySubmerged,
      fullySubmerged ? 1 : effectiveWaterline,
      switchedMedium,
      safeDt,
    );
    return getAtmosphereState();
  }

  function resize(nextWidth, nextHeight, pixelRatio = 1) {
    const safeW = Math.max(1, nextWidth);
    const safeH = Math.max(1, nextHeight);
    lensAndWaterlinePass.uniforms.uAspect.value = safeW / safeH;
    if (renderer) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(safeW, safeH, false);
    }
    if (composer) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(safeW, safeH);
    }
    if (bloomPass) {
      bloomPass.resolution.set(safeW, safeH);
    }
  }

  function render(dt = 1 / 60) {
    if (composer) {
      composer.render(dt);
    } else if (renderer && camera) {
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    if (envRenderTarget) {
      envRenderTarget.dispose();
      envRenderTarget = null;
    }
    if (pmremGenerator) {
      pmremGenerator.dispose();
      pmremGenerator = null;
    }
    if (composer) {
      composer.dispose();
      composer = null;
    }
    if (bloomPass?.dispose) {
      bloomPass.dispose();
    }
    if (outputPass?.dispose) {
      outputPass.dispose();
    }
    lensAndWaterlinePass.dispose();
    sky.geometry.dispose();
    sky.material.dispose();
    envSky.geometry.dispose();
    envSky.material.dispose();
  }

  setMood(currentMood);

  return {
    sky,
    envSky,
    sunLight,
    hemiLight,
    fillLight,
    composer,
    bloomPass,
    lensAndWaterlinePass,
    moods: ATMOSPHERE_MOODS,
    setMood,
    getMood,
    getAtmosphereState,
    triggerLensSplash,
    getLensWetness: () => activeLensWetness,
    update,
    resize,
    render,
    dispose,
  };
}
