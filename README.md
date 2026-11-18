# 🐋 Humpback Whale Breach — Interactive 3D Ocean Experience

**Watch a 15-meter humpback whale erupt from the deep, twist through the air, and crash back into the ocean—right in your browser.**

No downloads, no 3D modeling files, and no complicated setup. Switch camera angles, slow down time to `0.25×` mid-leap, dive underwater, or change the time of day from Golden Hour to Twilight with a single click.

---

## ✨ Why Try It?

- **Feel like you're on a whale-watching boat** — The camera gently bobs on real-time ocean swells and reacts to the impact when the whale breaks the surface and crashes back down.
- **Freeze time mid-air** — Hit **Pause** or **0.25× Slow-Mo** right as the whale reaches its airborne apex, then switch to **Free Orbit** to spin around it in 3D.
- **Dive beneath the waves** — Switch to the **Underwater** camera to see the whale surge upward from below, surrounded by rising bubble trails and sunlight refracting through the water's surface.
- **Pick your lighting** — Instantly switch between **Golden Hour**, **High Noon**, and **Twilight**.
- **Works on desktop & mobile** — Clean glassmorphic controls and responsive touch support.

---

## 🚀 Try It in Seconds

### Option 1: Open the Standalone File (No Coding Tools Needed)
Just download or open [`google-sites-embed.html`](google-sites-embed.html) in any modern browser (Chrome, Safari, Edge, or Firefox), or paste it into a Google Sites embed block.  
*(Requires an internet connection to load the 3D graphics library.)*

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
| **Speed** | Switch between `0.25× Slow-Mo`, `0.5×`, and `1×` | — |
| **Low-Angle** | Boat-level view bobbing on the ocean swells | `1` |
| **Close Breach** | Tight, dramatic framing that tracks the leap | `2` |
| **Underwater** | Subsurface view looking up through the waves | `3` |
| **Free Orbit** | Drag to orbit, scroll to zoom, right-drag to pan | `4` |
| **Light** | Switch between **Golden Hour**, **High Noon**, and **Twilight** | — |

In the top-left corner, a live readout tracks the **5 stages of every 9-second breach**:
1. **Deep Ascent** — Building speed underwater
2. **Breaking Water Face** — Piling up a dome of water and bursting through
3. **Airborne Apex** — Twisting in mid-air with pectoral fins spread
4. **Splashdown** — Crashing back down with expanding shockwave ripples
5. **Subsurface Glide** — Recovering smoothly beneath the surface

---

## 🛠️ For Developers

This project is built with **Vite**, **Three.js**, and **Vitest**, with every asset generated procedurally in JavaScript and GLSL—no external `.glb` models or image textures required.

- `src/whale/whaleGeometry.js` & `src/whale/whaleMesh.js` — Procedural 15 m humpback whale mesh (rostrum tubercles, ventral throat pleats, scalloped pectoral fins, flukes) with real-time spine, tail-wave, fin, and jaw deformation.
- `src/ocean/oceanSurface.js` & `src/math/oceanMath.js` — Polar ocean mesh with 6 Gerstner wave layers, dynamic breach water dome, expanding shockwave ripples, subsurface scattering, and underwater Snell's window refraction.
- `src/effects/splashSystem.js` — GPU-friendly particle pools for breakthrough/splashdown spray (4,000 droplets), underwater bubbles (900 particles), and lingering surface foam patches.
- `src/animation/breachTimeline.js` — Smooth Hermite-spline 9-second breach choreography and event triggers.
- `src/scene/cameraRig.js` & `src/scene/environment.js` — Preset & orbit cameras with wave-bobbing and impact shake, plus linear-HDR sky, PMREM reflections, and bloom post-processing.
- `src/ui/hud.js` — Telemetry HUD and control dock.

### Scripts

```bash
npm run dev      # Start local dev server
npm run build    # Build production bundle into dist/
npm run preview  # Preview production build
npm test         # Run Vitest unit & integration tests
```
