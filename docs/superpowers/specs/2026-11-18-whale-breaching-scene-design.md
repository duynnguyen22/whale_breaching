# 3D Whale Breaching Scene (Three.js) — Design Spec

**Date:** 2026-11-18  
**Tech Stack:** Vite, Vanilla Three.js (ES Modules + GLSL Shaders), Vitest

## 1. Goal
Build an interactive, cinematic 3D humpback whale breaching scene in Three.js featuring a realistic procedural whale rising explosively out of an animated ocean water surface ("water face"), complete with pre-emergence water swelling, spray/curtain particle physics, barrel-roll airborne twist, splashdown shockwave ripples, underwater view support, and playback/camera controls.

## 2. Architecture & Modules

### 2.1 Shared Wave & Breach Surface Math (`src/math/oceanMath.js`)
- Evaluates deterministic multi-octave Gerstner wave height and surface displacement at any `(x, z, time)`.
- Evaluates localized **pre-emergence water dome** height (`domeCenter`, `domeRadius`, `domeHeight`) so the water face visibly swells upward just before the whale's rostrum pierces the surface.
- Evaluates expanding damped **radial shockwave ripples** (`ripples[]`) spawned when the whale breaks through the water face and when it crashes back down.
- Shared constants (`WAVE_COMPONENTS`) mirror the GLSL ocean vertex shader so CPU queries (camera submergence, particle spawns, hull crossing) match rendered wave geometry.

### 2.2 Breach Kinematic Timeline (`src/animation/breachTimeline.js`)
- Models a continuous 9.0-second breach cycle (`progress` in `[0, 1]`):
  1. `ascent` (`0.00–0.23`): Steep upward propulsion from `y = -21m` with vigorous tail beats; swells the water dome as the snout nears `y = 0`.
  2. `breakthrough` (`0.23–0.47`): Explosive rise out of the water face (`y` crosses `0` up to `+9.2m`), pectoral fins flaring wide, barrel-roll twist (`roll` rotating toward ~`2.6 rad`), continuous emergence spray intensity.
  3. `apex` (`0.47–0.63`): Airborne hang-time arch against the sky, shedding trailing droplets off flippers and flukes.
  4. `splashdown` (`0.63–0.76`): Back/side impact into the water face (`y` crosses `0` downward), triggering massive plume particles, foam patch, and shockwave ripples.
  5. `recovery` (`0.76–1.00`): Submerged glide returning smoothly to deep starting depth and upright roll for seamless looping.

### 2.3 Procedural Humpback Whale (`src/whale/whaleGeometry.js` & `src/whale/whaleMesh.js`)
- Procedurally sculpted humpback mesh (~15m total length) with zero external asset dependencies:
  - Lofted asymmetric body with flattened tubercled rostrum, arched lower mandible, longitudinal **ventral throat pleats**, fleshy dorsal hump + fin, and laterally compressed caudal peduncle.
  - Long wing-like **scalloped pectoral flippers** (left/right) with leading-edge tubercles and white undersides.
  - Broad butterfly **tail flukes** with central notch.
  - Countershaded vertex colors (deep slate-navy dorsal back, mottled flanks, white ventral pleats and flipper undersides).
- Per-frame smooth CPU vertex deformation (`deformWhaleGeometry`) applying spine arch, travelling tail-beat wave, fluke flex lag, and hydrodynamic pectoral fin pitch/flap, paired with wet-skin `MeshPhysicalMaterial` (`clearcoat` modulated by surface wetness).

### 2.4 Shader Ocean Water Face (`src/ocean/oceanSurface.js`)
- Radial/polar-graded circular mesh (`radius = 460m`) concentrating high triangle density around the breach origin `(0, 0)` for crisp water-dome and shockwave geometry while extending seamlessly to the horizon.
- Custom `ShaderMaterial` (`DoubleSide`):
  - Vertex shader: 6-octave Gerstner waves + pre-breach water dome + 6-slot expanding shockwave ripple buffer.
  - Fragment shader (above water): Fresnel sky/sun reflection, deep abyssal absorption, turquoise subsurface scattering through wave crests and the breach dome, multi-octave micro-normal sun glitter, and turbulent whitewater foam around the breach collar and shockwaves.
  - Fragment shader (underwater `!gl_FrontFacing`): Snell's window bright sky transmission and total internal reflection.

### 2.5 Water-Face Splash, Spray & Underwater Particles (`src/effects/splashSystem.js`)
- Soft procedural radial sprite texture driving GPU particle pools:
  - **Emergence Water Curtain & Splashdown Plume:** Thousands of ballistic water droplets & mist puffs with gravity, air drag, expansion, and sunlit alpha shading.
  - **Airborne Body/Fluke Droplets:** Fine water streams shedding from the rostrum, flipper tips, and flukes while the whale is above `y = waterHeight`.
  - **Underwater Bubbles & Sunbeams:** Rising cavitation bubbles along the submerged tail path + subtle volumetric light shafts beneath the water face.

### 2.6 Environment, Camera Rig & HUD (`src/scene/environment.js`, `src/scene/cameraRig.js`, `src/ui/hud.js`)
- Procedural `Sky` + PMREM environment reflections, directional sunlight, hemisphere ocean bounce, `EffectComposer` + subtle `UnrealBloomPass`, and automatic above/below-water fog switching.
- Camera presets (*Low-Angle*, *Underwater*, *Close Breach*, *Free Orbit*) with `OrbitControls` and subtle impact camera shake on breakthrough/splashdown.
- Minimal HUD: *Breach Now* (`Space`), *Play/Pause* (`P`), speed/slow-motion (`0.25x`, `0.5x`, `1x`), camera preset selector, lighting mood (*Golden Hour*, *High Noon*, *Twilight*), and live phase badge.
