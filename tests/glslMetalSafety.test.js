import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createEnvironment } from '../src/scene/environment.js';
import { createOceanSurface } from '../src/ocean/oceanSurface.js';
import { createSplashSystem } from '../src/effects/splashSystem.js';
import { createWhaleRig } from '../src/whale/whaleMesh.js';

/**
 * Extracts all balanced `smoothstep(edge0, edge1, x)` invocations from GLSL source text.
 */
function extractSmoothstepCalls(glslSource) {
  const results = [];
  const regex = /\bsmoothstep\s*\(/g;
  let match;

  while ((match = regex.exec(glslSource)) !== null) {
    // Skip function declarations such as `float smoothstep(...)` if any
    const prefix = glslSource.slice(Math.max(0, match.index - 12), match.index);
    if (/\bfloat\s+$/.test(prefix)) continue;

    const openParenIdx = match.index + match[0].length - 1;
    let depth = 1;
    let cursor = openParenIdx + 1;
    const args = [];
    let argStart = cursor;

    while (cursor < glslSource.length && depth > 0) {
      const ch = glslSource[cursor];
      if (ch === '(') {
        depth += 1;
      } else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          args.push(glslSource.slice(argStart, cursor).trim());
          break;
        }
      } else if (ch === ',' && depth === 1) {
        args.push(glslSource.slice(argStart, cursor).trim());
        argStart = cursor + 1;
      }
      cursor += 1;
    }

    if (args.length === 3) {
      const line = glslSource.slice(0, match.index).split('\n').length;
      results.push({
        raw: glslSource.slice(match.index, cursor + 1),
        edge0: args[0],
        edge1: args[1],
        x: args[2],
        line,
      });
    }
  }

  return results;
}

/**
 * Evaluates a GLSL scalar edge expression over representative domain samples of all shader variables
 * to verify `edge0 < edge1` holds strictly under every compile-time and runtime state.
 */
function verifyEdge0StrictlyLessThanEdge1(call, label) {
  const { edge0, edge1, raw, line } = call;
  const clean0 = edge0.replace(/\s+/g, '');
  const clean1 = edge1.replace(/\s+/g, '');

  const pureNumeric = /^[0-9.+\-*/()eE]+$/;
  if (pureNumeric.test(clean0) && pureNumeric.test(clean1)) {
    const v0 = Function(`"use strict"; return (${clean0});`)();
    const v1 = Function(`"use strict"; return (${clean1});`)();
    expect(
      v0 < v1,
      `Inverted or degenerate constant smoothstep in ${label} (line ${line}): ${raw} -> edge0=${v0}, edge1=${v1}`,
    ).toBe(true);
    return;
  }

  // Known symbolic variables across project shaders and their full valid/extreme runtime ranges
  const variableSamples = [
    {
      coverageEdge: 0.0,
      farIslandH: 0.0,
      nearIslandH: 0.0,
      threshold: 0.0,
      radius: 0.0012,
      lobe: 0.72,
      wisp: 0.64,
      uAgeNorm: 0.0,
      ageClamped: 0.0,
      uWaterLevel: -5.0,
      scatterBlur: 0.42,
      uOceanRadius: 1.0,
      safeOceanRadius: 1.0,
      sunAngularDiameterCos: 0.99995,
    },
    {
      coverageEdge: 0.46,
      farIslandH: 0.012,
      nearIslandH: 0.018,
      threshold: 0.28,
      radius: 0.048,
      lobe: 0.86,
      wisp: 0.82,
      uAgeNorm: 0.5,
      ageClamped: 0.5,
      uWaterLevel: 0.0,
      scatterBlur: 0.85,
      uOceanRadius: 460.0,
      safeOceanRadius: 460.0,
      sunAngularDiameterCos: 0.99995,
    },
    {
      coverageEdge: 1.0,
      farIslandH: 0.028,
      nearIslandH: 0.028,
      threshold: 0.56,
      radius: 1.85,
      lobe: 1.0,
      wisp: 1.0,
      uAgeNorm: 1.0,
      ageClamped: 1.0,
      uWaterLevel: 12.0,
      scatterBlur: 1.75,
      uOceanRadius: 900.0,
      safeOceanRadius: 900.0,
      sunAngularDiameterCos: 0.99995,
    },
  ];

  const varKeys = Object.keys(variableSamples[0]).join(', ');
  const preamble = `"use strict"; const min = Math.min, max = Math.max, abs = Math.abs, clamp = (x,a,b)=>Math.min(b,Math.max(a,x)); const { ${varKeys} } = vars;`;
  const fn0 = new Function('vars', `${preamble} return (${edge0});`);
  const fn1 = new Function('vars', `${preamble} return (${edge1});`);

  for (const sample of variableSamples) {
    const v0 = fn0(sample);
    const v1 = fn1(sample);
    expect(Number.isFinite(v0) && Number.isFinite(v1)).toBe(true);
    expect(
      v0 < v1,
      `Inverted or degenerate dynamic smoothstep in ${label} (line ${line}): ${raw} -> edge0=${v0}, edge1=${v1}`,
    ).toBe(true);
  }
}

/**
 * Extracts /* glsl *\/ template literals from a JS source file.
 */
function extractGlslBlocksFromJsFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const blocks = [];
  const regex = /\/\*\s*glsl\s*\*\/\s*`([\s\S]*?)`/g;
  let match;
  while ((match = regex.exec(src)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

describe('Apple Metal WebGL GLSL safety & real-life bokeh lens optics', () => {
  it('contains zero inverted smoothstep(edge0, edge1, x) calls across all GLSL shader sources in src/', () => {
    const shaderFiles = [
      'src/scene/environment.js',
      'src/ocean/oceanSurface.js',
      'src/effects/splashSystem.js',
      'src/whale/whaleMesh.js',
    ];

    let totalCallsChecked = 0;

    for (const relPath of shaderFiles) {
      const absPath = path.resolve(process.cwd(), relPath);
      const glslBlocks = extractGlslBlocksFromJsFile(absPath);
      expect(glslBlocks.length, `Expected GLSL blocks in ${relPath}`).toBeGreaterThan(0);

      glslBlocks.forEach((block, idx) => {
        const calls = extractSmoothstepCalls(block);
        for (const call of calls) {
          verifyEdge0StrictlyLessThanEdge1(call, `${relPath}#block${idx}`);
          totalCallsChecked += 1;
        }
      });
    }

    expect(totalCallsChecked).toBeGreaterThanOrEqual(35);
  });

  it('verifies compiled runtime shaders (Sky, LensAndWaterline, Ocean, Splash, Whale physical) have strictly valid smoothstep bounds', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 2000);
    const env = createEnvironment({ scene, camera });
    const ocean = createOceanSurface();
    const splash = createSplashSystem();
    const whale = createWhaleRig();

    const physicalShader = {
      uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.physical.uniforms),
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    whale.mesh.material.onBeforeCompile(physicalShader);

    const runtimeShaders = [
      ['Sky.vertex', env.sky.material.vertexShader],
      ['Sky.fragment', env.sky.material.fragmentShader],
      ['LensAndWaterline.vertex', env.lensAndWaterlinePass.material.vertexShader],
      ['LensAndWaterline.fragment', env.lensAndWaterlinePass.material.fragmentShader],
      ['Ocean.vertex', ocean.material.vertexShader],
      ['Ocean.fragment', ocean.material.fragmentShader],
      ['WhalePhysical.fragment', physicalShader.fragmentShader],
    ];

    // Collect all ShaderMaterials inside splashSystem group (spray, spout, bubbles, sunbeams, foam)
    splash.group.traverse((obj) => {
      if (obj.material && obj.material.isShaderMaterial) {
        runtimeShaders.push([`${obj.name || 'splashChild'}.vertex`, obj.material.vertexShader]);
        runtimeShaders.push([`${obj.name || 'splashChild'}.fragment`, obj.material.fragmentShader]);
      }
    });

    for (const [label, glsl] of runtimeShaders) {
      const calls = extractSmoothstepCalls(glsl);
      for (const call of calls) {
        verifyEdge0StrictlyLessThanEdge1(call, label);
      }
    }

    // Whale normal relief derivative must clamp dFdx/dFdy to prevent 2x2 pixel quad facets on Metal
    expect(physicalShader.fragmentShader).toContain('clamp( dFdx( whRelief )');
    expect(physicalShader.fragmentShader).toContain('clamp( dFdy( whRelief )');

    env.dispose();
    ocean.mesh.geometry.dispose();
    ocean.material.dispose();
  });

  it('models camera lens water as grid-free out-of-focus bokeh blur with bounded UV offsets (<= 0.018) and zero fract(st) grid cells', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 2000);
    const env = createEnvironment({ scene, camera });
    const frag = env.lensAndWaterlinePass.material.fragmentShader;

    // Grid-cell droplet & rectangular trail smearing code must be completely absent
    expect(frag).not.toContain('evaluateDropletLayer');
    expect(frag).not.toContain('fract( st )');
    expect(frag).not.toContain('fract(st)');
    expect(frag).not.toContain('cellId');
    expect(frag).not.toContain('trailMask');
    expect(frag).not.toContain('trailWidth');

    // Continuous grid-free out-of-focus bokeh droplets + multi-tap blur + strict offset clamp
    expect(frag).toContain('evaluateBokehDroplets');
    expect(frag).toContain('for ( int i = 0; i < 12; i++ )');
    expect(frag).toContain('dropMask > 0.002');
    expect(frag).toContain('0.018');

    // Count tDiffuse taps: base sample + chromatic dispersion + multi-tap bokeh defocus kernel (>= 8 taps)
    const diffuseSamples = frag.match(/texture2D\s*\(\s*tDiffuse/g) ?? [];
    expect(diffuseSamples.length).toBeGreaterThanOrEqual(8);

    env.dispose();
  });

  it('ensures standalone google-sites-embed.html also contains zero inverted GLSL smoothsteps and zero fract(st) droplet cells', () => {
    const embedPath = path.resolve(process.cwd(), 'google-sites-embed.html');
    const html = fs.readFileSync(embedPath, 'utf8');

    expect(html).not.toContain('evaluateDropletLayer');
    expect(html).not.toContain('trailWidth');
    expect(html).toContain('evaluateBokehDroplets');

    // Extract all GLSL smoothstep calls inside bundled shader template strings
    const calls = extractSmoothstepCalls(html).filter(
      (c) => !c.raw.includes('=>') && !c.edge0.includes('{'),
    );
    expect(calls.length).toBeGreaterThanOrEqual(30);
    for (const call of calls) {
      verifyEdge0StrictlyLessThanEdge1(call, 'google-sites-embed.html');
    }
  });
});
