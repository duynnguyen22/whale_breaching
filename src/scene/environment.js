import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
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

function computeSunDirection(elevationDeg, azimuthDeg, out = new THREE.Vector3()) {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  return out.setFromSphericalCoords(1, phi, theta).normalize();
}

/**
 * Calibrates Three.js Preetham `Sky` for a linear-HDR EffectComposer + OutputPass pipeline.
 * `Sky.js` natively applies `pow(texColor, 1 / 2.4)` in its shader, which double-gammas and
 * blows out UnrealBloomPass when paired with ACESFilmicToneMapping + SRGB OutputPass.
 */
function upgradeSkyMaterialToLinearHDR(skyMesh) {
  const mat = skyMesh.material;
  mat.uniforms.uHorizonColor = { value: new THREE.Color('#c8784e') };
  mat.uniforms.uMidSkyColor = { value: new THREE.Color('#485678') };
  mat.uniforms.uZenithColor = { value: new THREE.Color('#192f52') };
  mat.uniforms.uSunGlowColor = { value: new THREE.Color('#ff9d47') };
  mat.uniforms.uPreethamScale = { value: 0.11 };
  mat.uniforms.uSunGlowStrength = { value: 0.32 };

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
      linearSky += uSunGlowColor * crispDisc;

      float belowMask = smoothstep( -0.06, 0.01, direction.y );
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
}

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

  const sunDirection = new THREE.Vector3();
  const sunColor = new THREE.Color();
  const skyHorizonColor = new THREE.Color();
  const fogColor = new THREE.Color();
  const backgroundColor = new THREE.Color();
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

  // PMREM Environment reflection map from dedicated clean sky scene
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

  // Post-processing: EffectComposer + RenderPass + subtle UnrealBloomPass + OutputPass
  let composer = null;
  let renderPass = null;
  let bloomPass = null;
  let outputPass = null;

  if (renderer && camera) {
    const pixelRatio = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
    const rtWidth = Math.max(1, Math.floor(width * pixelRatio));
    const rtHeight = Math.max(1, Math.floor(height * pixelRatio));
    const isWebGL2 = Boolean(renderer.capabilities?.isWebGL2);

    const composerTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight, {
      type: THREE.HalfFloatType,
      samples: isWebGL2 ? 4 : 0,
    });

    composer = new EffectComposer(renderer, composerTarget);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);

    renderPass = new RenderPass(scene, camera);
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.26,
      0.5,
      0.82,
    );
    outputPass = new OutputPass();

    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);
  }

  function applyAtmosphereMedium(submergedFlag, immediate = false, dt = 1 / 60) {
    const moodCfg = ATMOSPHERE_MOODS[currentMood];
    isSubmerged = Boolean(submergedFlag);

    const targetFogHex = isSubmerged
      ? moodCfg.underwaterFogColor
      : moodCfg.fogColor;
    const targetBgHex = isSubmerged
      ? moodCfg.underwaterBgColor
      : moodCfg.skyHorizonColor;
    const targetFogDensity = isSubmerged
      ? moodCfg.underwaterFogDensity
      : moodCfg.fogDensity;
    const targetExposure = isSubmerged
      ? moodCfg.underwaterExposure
      : moodCfg.exposure;

    const blend = immediate
      ? 1
      : 1 - Math.exp(-8.5 * Math.min(0.1, Math.max(0, dt)));

    const desiredFogColor = new THREE.Color(targetFogHex);
    const desiredBgColor = new THREE.Color(targetBgHex);

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
      : moodCfg.envIntensity;

    if (isSubmerged) {
      hemiLight.color.set(moodCfg.underwaterHemiSky);
      hemiLight.groundColor.set(moodCfg.underwaterHemiGround);
      hemiLight.intensity = moodCfg.hemiIntensity * 1.2;
      sunLight.intensity = moodCfg.sunIntensity * 0.65;
      fillLight.color.set(moodCfg.underwaterHemiSky);
      fillLight.intensity = moodCfg.fillIntensity * 0.9;
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

    applyAtmosphereMedium(isSubmerged, true);
    return getAtmosphereState();
  }

  function getMood() {
    return currentMood;
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
    };
  }

  function update({
    dt = 1 / 60,
    cameraPosition = camera?.position,
    waterHeightAtCamera = 0,
  } = {}) {
    const camY = cameraPosition?.y ?? 0;
    const submergedNow = camY < waterHeightAtCamera;
    const switchedMedium = submergedNow !== isSubmerged;
    applyAtmosphereMedium(submergedNow, switchedMedium, dt);
    return getAtmosphereState();
  }

  function resize(nextWidth, nextHeight, pixelRatio = 1) {
    const safeW = Math.max(1, nextWidth);
    const safeH = Math.max(1, nextHeight);
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
    sky.geometry.dispose();
    sky.material.dispose();
    envSky.geometry.dispose();
    envSky.material.dispose();
  }

  setMood(currentMood);

  return {
    sky,
    sunLight,
    hemiLight,
    fillLight,
    composer,
    bloomPass,
    moods: ATMOSPHERE_MOODS,
    setMood,
    getMood,
    getAtmosphereState,
    update,
    resize,
    render,
    dispose,
  };
}
