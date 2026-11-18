# 3D Whale Breaching Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans with superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vite + Vanilla Three.js interactive 3D humpback whale breaching scene where a procedurally sculpted, articulated whale rises explosively out of a Gerstner shader ocean surface with water dome, spray curtain, splashdown shockwaves, camera presets, and slow-motion controls.

**Architecture:** Pure deterministic math modules (`oceanMath.js`, `breachTimeline.js`, `whaleGeometry.js`) power both Vitest unit tests and the real-time WebGL2 render loop (`oceanSurface.js`, `whaleMesh.js`, `splashSystem.js`, `environment.js`, `cameraRig.js`, `hud.js`).

**Tech Stack:** Vite, Three.js (`three`), Vitest (`vitest`).

**Spec:** `docs/superpowers/specs/2026-11-18-whale-breaching-scene-design.md`

## Global Constraints
- Zero external 3D model/texture network requests so the scene runs offline and never fails on missing assets.
- CPU `oceanMath` and GLSL `oceanSurface` must share identical Gerstner wave parameters so water crossings and underwater camera switches align with rendered waves.
- Follow strict TDD (`Red -> Green -> Refactor`) for all math, timeline, and geometry/skinning modules.

---

### Task 1: Project Scaffolding & Vitest Setup
- Create `package.json`, `vite.config.js`, `.gitignore`, `index.html`, `src/style.css`.
- Install `three`, `vite`, `vitest`.

### Task 2: Ocean Wave, Water Dome & Shockwave Math (`src/math/oceanMath.js`)
- TDD `evaluateGerstnerWaves`, `evaluateWaterDome`, `evaluateShockwaveRipples`, and `evaluateOceanHeight` in `tests/oceanMath.test.js`.

### Task 3: Cinematic Breach Timeline (`src/animation/breachTimeline.js`)
- TDD `evaluateBreachState` and `BreachController` in `tests/breachTimeline.test.js` covering deep ascent, water-face dome & breakthrough, airborne barrel-roll apex, splashdown trigger, and seamless loop recovery.

### Task 4: Procedural Humpback Whale Geometry & Articulation (`src/whale/whaleGeometry.js`, `src/whale/whaleMesh.js`)
- TDD `createWhaleGeometryData` and `deformWhaleVertices` in `tests/whaleGeometry.test.js` verifying bounds (~15m length, ~9.5m flipper span), ventral pleat detail, valid normals/UVs/colors, and NaN-free dynamic spine/flipper/fluke deformation.
- Build `createWhaleMesh` with wet-skin `MeshPhysicalMaterial`.

### Task 5: Shader Ocean Surface & Splash/Bubble Particle Systems (`src/ocean/oceanSurface.js`, `src/effects/splashSystem.js`)
- Build polar-graded ocean mesh + GLSL vertex/fragment shaders (Gerstner waves, breach dome, ripple rings, Fresnel, SSS, whitewater foam, underwater Snell's window).
- Build coupled `SplashSystem` (emergence curtain, airborne body droplets, splashdown geyser, expanding surface foam rings, underwater bubbles & sunbeams).

### Task 6: Scene Environment, Camera Rig, HUD & Entry Point (`src/scene/environment.js`, `src/scene/cameraRig.js`, `src/ui/hud.js`, `src/main.js`)
- Wire `Sky` + PMREM lighting moods, `EffectComposer` bloom, dynamic underwater fog, 4 camera presets + `OrbitControls` + subtle breach camera shake, and interactive HUD controls.
- Run full test suite (`npm test`), production build (`npm run build`), and live visual verification in the browser.
