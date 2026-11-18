# 🐋 Humpback Whale Breach — Interactive 3D Ocean Experience

**Watch a 15-meter humpback whale erupt from the deep, twist through the air, and crash back into the ocean—right in your browser.**

No downloads, no external 3D model files, and no complicated setup. Switch across 6 cinematic cameras (including an over/under **Split Waterline** dome port and **Aerial Drone**), cycle 4 distinct humpback breach styles, turn on the procedural ocean & whale song soundscape, slow down time to `0.25×` mid-leap, or shift the atmosphere from Golden Hour to Twilight with a single click.

---

## ✨ Highlights

- **Up-close anatomical & shader realism** — Glossy cetacean eyes, articulated baleen mouth cavity, procedural dermal pores, rake-mark scars, crusty chin/flipper barnacles, airborne water-runoff streaks, and submerged sunlight caustics across a 15 m humpback rig.
- **4 breach choreographies + Auto cycle** — Watch **Classic**, **Chin Slam**, **Barrel Spin**, and **Tail Lob** breaches (or leave **Auto** active to cycle seamlessly across loops) complete with backlit V-shaped blowhole mist spouts.
- **Subsurface wing glow & fluid FX** — See the whale's dark pelagic silhouette and glowing turquoise-white 4.6 m pectoral wings through refracted surface waves, velocity-stretched liquid spray ligaments, continuous full-wing water curtains, an elongated 15 m body-slam splashdown trench, and sun-aligned underwater god rays.
- **6 cinematic cameras & lens physics** — Boat-level wave-slope horizon roll, per-preset focal lengths (`35°` telephoto to `64°` underwater dome), an undulating over/under **Split Waterline** meniscus, and refractive water droplets splashing onto the camera lens.
- **Procedural Web Audio soundscape** — Zero-asset ocean surf swell, underwater hydrophone shimmer, expressive humpback FM/formant vocalizations, dynamic underwater low-pass muffling, slow-motion thunder, and multi-layered splashdown/blowhole acoustics.
- **Works on desktop & mobile** — Sleek, responsive glassmorphic dock and touch controls.

---

## 🚀 Try It in Seconds

### Option 1: Open the Standalone File (No Coding Tools Needed)
Just download or open [`google-sites-embed.html`](google-sites-embed.html) in any modern browser (Chrome, Safari, Edge, or Firefox), or paste it into a Google Sites embed block.  
*(Requires an internet connection to load the Three.js module from CDN; all geometry, shaders, choreography, and audio are 100% self-contained.)*

### Option 2: Run Locally
If you have [Node.js](https://nodejs.org/) installed:

```bash
npm install
npm run dev
```

Open the URL shown in your terminal (typically `http://localhost:5173`).

---

## 🎮 Controls & Shortcuts

Everything is clickable in the bottom dock, or you can use keyboard shortcuts:

| Control | What It Does | Shortcut |
| :--- | :--- | :---: |
| **Breach Now** | Jump straight to the start of a fresh breach | `Space` |
| **Pause / Play** | Freeze or resume the animation at any moment | `P` |
| **Sound Off / On** | Toggle procedural ocean swell, whale song & impact audio | `M` |
| **Speed** | Switch between `0.25× Slow-Mo`, `0.5×`, and `1×` | — |
| **Breach Style** | Cycle `Auto`, `Classic`, `Chin Slam`, `Barrel Spin`, `Tail Lob` | `V` |
| **Low-Angle** | Telephoto boat-level view (`35°`) bobbing & rolling on swells | `1` |
| **Close Breach** | Tight, dramatic wide framing (`56°`) with lens spray droplets | `2` |
| **Underwater** | Subsurface dome view (`64°`) with Snell's window & god rays | `3` |
| **Free Orbit** | Drag to orbit, scroll to zoom, right-drag to pan | `4` |
| **Split Waterline** | Over/under dome port (`60°`) straddling the live air-water meniscus | `5` |
| **Aerial Drone** | High banking top-down view (`44°`) of subsurface wings & shockwaves | `6` |
| **Light** | Switch between **Golden Hour**, **High Noon**, and **Twilight** | — |

In the top-left corner, a live telemetry card tracks the active **Breach Style**, altitude, and the **5 stages of every 9-second cycle**:
1. **Deep Ascent** — Building speed underwater with sub-bass fluke propulsion
2. **Breaking Water Face** — Piling up a dome of water, bursting through, and exhaling a sunlit mist spout
3. **Airborne Apex** — Twisting in mid-air with 4.6 m pectoral wings cascading water curtains
4. **Splashdown** — Carving a 15 m whitewater trench and expanding shockwave ripples
5. **Subsurface Glide** — Recovering smoothly beneath the surface

---

## 🛠️ For Developers

This project is built with **Vite**, **Three.js**, **Web Audio API**, and **Vitest**, with every visual and acoustic element generated procedurally in JavaScript and GLSL—zero external `.glb` models, textures, or audio files required.

- `src/whale/whaleGeometry.js` & `src/whale/whaleMesh.js` — Procedural 15 m humpback whale mesh (rostrum tubercles, ventral throat pleats, scalloped pectoral fins, flukes, glossy eyes, baleen mouth cavity) with `onBeforeCompile` dermal pores, barnacles, rake scars, airborne runoff streaks, and underwater skin caustics.
- `src/animation/breachTimeline.js` — Smooth C1-continuous Hermite-spline choreography across 4 breach variants (`classic`, `chin-slam`, `barrel-port`, `tail-lob`) plus `auto` cycling and blowhole spout intensity.
- `src/ocean/oceanSurface.js` & `src/math/oceanMath.js` — Polar ocean mesh with 6 Gerstner wave layers, dynamic breach water dome, expanding shockwave ripples, subsurface whale/white-flipper visibility from above, and underwater Snell's window refraction.
- `src/effects/splashSystem.js` — Velocity-stretched liquid spray ligaments, continuous full-wing water curtains, 15 m multi-station splashdown trench, backlit V-lobe blowhole mist spout, cavitation bubbles, wave-hugging foam rings, and sun-aligned underwater god rays.
- `src/scene/cameraRig.js` & `src/scene/environment.js` — 6 camera presets with dynamic FOV, wave-slope boat horizon roll, impact shake, procedural sky clouds & distant volcanic horizon islands, split-waterline meniscus shader pass, and refractive lens water droplets.
- `src/audio/soundscape.js` — Procedural Web Audio ocean surf, hydrophone ambience, humpback FM/formant vocalizations, dynamic underwater low-pass filtering, slow-motion pitch scaling, and breakthrough/splashdown/blow synthesis.
- `src/ui/hud.js` & `src/main.js` — Glassmorphic telemetry HUD, keyboard shortcuts, and end-to-end scene orchestration.

### Scripts

```bash
npm run dev      # Start local dev server
npm run build    # Build production bundle into dist/
npm run preview  # Preview production build
npm test         # Run Vitest unit & integration tests
```
