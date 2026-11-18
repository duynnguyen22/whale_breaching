import * as THREE from 'three';

const PART_BODY = 0;
const PART_FLIPPER_L = 1;
const PART_FLIPPER_R = 2;
const PART_FLUKES = 3;

const SNOUT_Z = 7.2;
const FLUKE_TIP_Z = -7.8;
const TOTAL_LENGTH = SNOUT_Z - FLUKE_TIP_Z; // 15.0m

const SHOULDER_PIVOT_L = { x: 1.0, y: -0.56, z: 1.32 };
const SHOULDER_PIVOT_R = { x: -1.0, y: -0.56, z: 1.32 };
const JAW_PIVOT = { x: 0.0, y: -0.16, z: 2.95 };

// Spine station normalized positions along [0..1] from snout (+7.2m) to flukes (-7.4m)
const SPINE_STATION_Z = [6.65, 4.85, 2.55, 0.35, -1.75, -3.65, -5.45, -7.15];

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Deterministic organic 3D fbm-like spatial noise in [-1, 1] for natural skin mottling & speckles.
 */
function organicMottle(x, y, z) {
  const n1 = Math.sin(x * 2.7 + z * 1.9 + y * 2.3) * Math.cos(z * 2.4 - x * 1.8);
  const n2 = Math.sin(x * 6.3 - z * 5.1 + y * 4.7) * 0.5;
  const n3 = Math.cos(x * 13.7 + y * 11.3 - z * 9.7) * 0.25;
  return clamp((n1 + n2 + n3) / 1.75, -1, 1);
}

/**
 * Evaluates longitudinal Humpback Whale fuselage cross-section envelopes at local z in [-6.76, +7.20].
 */
export function evaluateBodyStation(z) {
  // u = 0 at snout (+7.20), u = 1 at peduncle end (-6.76)
  const bodyLen = SNOUT_Z - -6.76; // 13.96m
  const u = clamp((SNOUT_Z - z) / bodyLen, 0, 1);

  // 1. Half-width (X): Gothic-arch flat rostrum -> broad chest -> narrow laterally compressed peduncle
  let halfWidth;
  if (u < 0.28) {
    const t = u / 0.28;
    // Rounded snout tip widening along bowed upper-jaw arch
    halfWidth = 0.13 + 1.30 * Math.pow(Math.sin(t * Math.PI * 0.5), 0.74);
  } else if (u < 0.46) {
    const t = (u - 0.28) / 0.18;
    halfWidth = 1.43 - 0.10 * smoothstep(0, 1, t);
  } else {
    const t = (u - 0.46) / 0.54;
    // Dramatic cetacean lateral compression into the tail stock (peduncle)
    halfWidth = 1.33 * Math.pow(1 - t, 1.55) + 0.12 * (1 - t * 0.35);
  }

  // 2. Dorsal height (+Y): flat rostrum shelf -> blowhole guard -> arched back -> fleshy dorsal hump + falcate fin -> peduncle keel
  let dorsalY;
  if (u < 0.21) {
    // Broad flattened rostrum rising gently from snout tip
    const t = u / 0.21;
    dorsalY = 0.07 + 0.43 * Math.pow(t, 0.85);
  } else if (u < 0.38) {
    // Cranial rise over blowhole splashguard onto thick nape/shoulders
    const t = (u - 0.21) / 0.17;
    const blowholeGuard = 0.11 * Math.exp(-Math.pow((u - 0.245) / 0.026, 2));
    dorsalY = lerp(0.50, 1.08, smoothstep(0, 1, t)) + blowholeGuard;
  } else if (u < 0.62) {
    // Broad dorsal back sloping slightly aft toward the dorsal hump
    const t = (u - 0.38) / 0.24;
    dorsalY = lerp(1.08, 0.82, smoothstep(0, 1, t));
  } else {
    // Posterior back & strong dorsal peduncle keel tapering to fluke notch
    const t = (u - 0.62) / 0.38;
    const peduncleKnuckles =
      0.025 * Math.sin((u - 0.74) * 58.0) * smoothstep(0.73, 0.78, u) * smoothstep(0.95, 0.88, u);
    dorsalY = lerp(0.82, 0.17, Math.pow(t, 1.18)) + peduncleKnuckles;
  }

  // Fleshy humpback basal hump centered ~66% of 15m body length (z ~ -2.70m => u ~ 0.709 of fuselage)
  const finCenterZ = -2.72;
  const humpBell = Math.exp(-Math.pow((z - (finCenterZ + 0.12)) / 0.72, 2));
  dorsalY += 0.16 * humpBell;

  // 3. Ventral depth (-Y, returned as positive magnitude below y=0):
  // Mandibular chin knob -> deep capacious rorqual throat pouch -> smooth belly -> deep peduncle keel
  let ventralDepth;
  if (u < 0.36) {
    const t = u / 0.36;
    const chinKnob = 0.09 * Math.exp(-Math.pow((z - 7.02) / 0.22, 2));
    ventralDepth = 0.15 + 1.50 * Math.pow(Math.sin(t * Math.PI * 0.5), 0.78) + chinKnob;
  } else if (u < 0.60) {
    const t = (u - 0.36) / 0.24;
    ventralDepth = lerp(1.65, 1.06, smoothstep(0, 1, t));
  } else {
    const t = (u - 0.60) / 0.40;
    ventralDepth = lerp(1.06, 0.17, Math.pow(t, 1.12));
  }

  // Arched baleen mouthline elevation in head region (z in [+2.85, +7.20])
  let mouthY = -0.04;
  if (z > 2.8) {
    const mt = clamp((7.2 - z) / (7.2 - 2.9), 0, 1);
    // Bows upward mid-rostrum, dips down toward eye/corner of mouth
    mouthY = -0.05 + 0.31 * Math.sin(mt * Math.PI) - 0.14 * Math.pow(mt, 2.2);
  }

  return { u, halfWidth, dorsalY, ventralDepth, mouthY };
}

/**
 * Builds circumferential angle table (N = 68) with:
 * - j = 0 at exact ventral midline (theta = 0, x = 0, y < 0)
 * - j = 1..20 (+X) and j = 67..48 (-X) phase-locked to 20 ventral throat pleats (10 per side)
 * - j = 34 at exact dorsal midline (theta = pi, x = 0, y > 0) with tight sampling for falcate dorsal fin
 */
function buildBodyCircumferenceTable() {
  const N = 68;
  const entries = new Array(N);
  const pleatMaxTheta = 0.37 * Math.PI; // +-66.6 deg ventral throat/belly arc holds all 20 pleats cleanly below flippers

  for (let j = 0; j < N; j++) {
    // Signed index k in [-33 .. +34] where +k is +X (left), -k is -X (right)
    const k = j <= 34 ? j : j - N;
    const absK = Math.abs(k);
    const sign = k < 0 ? -1 : 1;

    let absTheta;
    let pleatCos = 1.0; // +1 on ridge, -1 in groove trough
    let pleatMask = 0.0;

    if (absK <= 20) {
      // Exact phase-locked ventral zone: odd absK = groove trough (-1), even absK = ridge (+1)
      const frac = absK / 20;
      absTheta = frac * pleatMaxTheta;
      pleatCos = absK % 2 === 1 ? -1.0 : 1.0;
      // Smooth circumferential taper only at outermost edge so all 20 grooves stay crisp
      pleatMask = 1.0 - 0.28 * smoothstep(0.82, 1.0, frac);
    } else {
      // Flank up to dorsal crest (absK in 21..34 => 14 steps covering pi/2 to pi)
      // Concentrate points near absK = 34 (theta = pi) so dorsal fin & median rostrum ridge are crisp
      const t = (absK - 20) / 14; // (0, 1]
      const eased = 1 - Math.pow(1 - t, 1.48);
      absTheta = lerp(pleatMaxTheta, Math.PI, eased);
      pleatCos = 1.0;
      pleatMask = 0.0;
    }

    const theta = k === 34 ? Math.PI : sign * absTheta;
    entries[j] = { k, absK, sign, theta, absTheta, pleatCos, pleatMask };
  }
  return entries;
}

const CRANIAL_TUBERCLES = (() => {
  const list = [];
  // Median dorsal rostrum row (snout to blowhole guard)
  const medianZs = [6.96, 6.52, 6.04, 5.52, 4.98, 4.44];
  for (const tz of medianZs) {
    list.push({ xFrac: 0.0, z: tz, radius: 0.13, height: 0.042, onUpper: true });
  }
  // Paired lateral upper-lip rows
  const lateralZs = [6.82, 6.38, 5.90, 5.38, 4.84, 4.30, 3.82];
  for (let idx = 0; idx < lateralZs.length; idx++) {
    const tz = lateralZs[idx];
    const xFrac = 0.66 + 0.08 * (idx / lateralZs.length);
    list.push({ xFrac, z: tz, radius: 0.125, height: 0.044, onUpper: true });
    list.push({ xFrac: -xFrac, z: tz, radius: 0.125, height: 0.044, onUpper: true });
  }
  // Clustered mandibular chin-knob tubercles
  const chinBumps = [
    { xFrac: 0.0, z: 7.08, radius: 0.14, height: 0.045 },
    { xFrac: 0.24, z: 6.95, radius: 0.12, height: 0.038 },
    { xFrac: -0.24, z: 6.95, radius: 0.12, height: 0.038 },
    { xFrac: 0.42, z: 6.72, radius: 0.11, height: 0.034 },
    { xFrac: -0.42, z: 6.72, radius: 0.11, height: 0.034 },
  ];
  for (const cb of chinBumps) {
    list.push({ ...cb, onUpper: false });
  }
  return list;
})();

/**
 * Evaluates a single 3D vertex + vertex color + jawWeight on the Humpback Whale body loft.
 */
function evaluateBodyVertex(z, circ, palette) {
  const st = evaluateBodyStation(z);
  const sinT = Math.sin(circ.theta);
  const cosT = Math.cos(circ.theta); // +1 at bottom (theta=0), -1 at top (theta=pi)

  let x = st.halfWidth * sinT;
  let y = cosT >= 0 ? -st.ventralDepth * cosT : st.dorsalY * -cosT;

  // 1. Asymmetric head shaping: flattened broad upper rostrum shelf + deep bowed lower mandible + mouth crease
  const headMask = smoothstep(2.65, 3.85, z);
  let mouthCreaseFactor = 0;
  if (headMask > 0) {
    if (y > st.mouthY) {
      // Flatten upper rostrum cross-section into characteristic broad shelf with raised median ridge
      const aboveFrac = clamp((y - st.mouthY) / Math.max(0.18, st.dorsalY - st.mouthY), 0, 1);
      const shelfFlatten = headMask * smoothstep(3.8, 6.6, z) * 0.34;
      y = lerp(y, st.mouthY + (st.dorsalY - st.mouthY) * Math.pow(aboveFrac, 1.45), shelfFlatten);
      // Slight lateral flare of upper rostrum lip margin
      const lipFlare = Math.exp(-Math.pow((y - st.mouthY - 0.05) / 0.16, 2)) * 0.08 * headMask;
      x *= 1 + lipFlare;
    } else {
      // U-shaped wide lower mandible fullness (rorqual scoop)
      const jawFullness = headMask * 0.14 * Math.sin(clamp(circ.absTheta / (Math.PI * 0.55), 0, 1) * Math.PI);
      x += circ.sign * jawFullness * st.halfWidth * 0.45;
    }

    // Labial mouthline crease along arched baleen gape
    const distMouth = Math.abs(y - st.mouthY);
    const gapeLongMask = smoothstep(2.85, 3.25, z) * smoothstep(7.19, 6.85, z);
    mouthCreaseFactor = Math.exp(-Math.pow(distMouth / 0.085, 2)) * gapeLongMask * (1 - Math.abs(cosT) * 0.7);
    x *= 1 - 0.075 * mouthCreaseFactor;
  }

  // Subtle supraorbital eye ridge just above/behind the gape corner (z ~ +2.92, y ~ -0.04)
  const eyeDist2 = Math.pow((z - 2.92) / 0.26, 2) + Math.pow((y - -0.02) / 0.16, 2);
  if (eyeDist2 < 4.0 && Math.abs(sinT) > 0.75) {
    x += circ.sign * 0.065 * Math.exp(-eyeDist2);
  }

  // Paired blowhole longitudinal furrow at top of head (z ~ +3.72)
  if (circ.absTheta > 2.75 && z > 3.35 && z < 4.05) {
    const bhZ = Math.exp(-Math.pow((z - 3.70) / 0.19, 2));
    const centerSlit = Math.exp(-Math.pow((Math.PI - circ.absTheta) / 0.09, 2));
    y -= 0.028 * bhZ * centerSlit;
  }

  // 2. Stubby falcate dorsal fin sculpted cleanly along dorsal crest (~66% back from snout: z in [-3.40, -2.05])
  if (circ.absTheta > 2.68 && z > -3.45 && z < -1.95) {
    // Leading edge sweeps smoothly from z = -2.02 back to peak at z = -2.84; falcate trailing edge drops at z = -2.95..-3.30
    const finRise = smoothstep(-2.00, -2.78, z);
    const finDrop = smoothstep(-3.32, -2.86, z);
    const finProfile = finRise * finDrop;
    const ridgeTightness = Math.exp(-Math.pow((Math.PI - circ.absTheta) / 0.155, 2));
    // Concave falcate hook shift in Z near fin apex
    y += 0.34 * finProfile * ridgeTightness;
    x *= 1 - 0.58 * finProfile * smoothstep(2.72, 3.02, circ.absTheta);
  }

  // 3. ~20 Longitudinal Ventral Throat Pleats (sculpted in BOTH vertex radius and groove shading!)
  let pleatGrooveShade = 0;
  if (circ.pleatMask > 0 && z > -1.45 && z < 6.92) {
    const longMask = smoothstep(-1.40, 0.35, z) * smoothstep(6.90, 6.25, z);
    const grooveAmount = (1 - circ.pleatCos) * 0.5; // 0 on ridge, 1 in trough
    const indent = 0.054 * grooveAmount * circ.pleatMask * longMask;
    const r = Math.hypot(x, y);
    if (r > 1e-4) {
      const scale = (r - indent) / r;
      x *= scale;
      y *= scale;
    }
    pleatGrooveShade = grooveAmount * circ.pleatMask * longMask;
  }

  // 4. Cranial & Chin Dermal Tubercles (iconic Humpback snout knobs)
  let tubercleHighlight = 0;
  if (z > 3.55) {
    const xNorm = st.halfWidth > 0.05 ? x / st.halfWidth : 0;
    for (let tIdx = 0; tIdx < CRANIAL_TUBERCLES.length; tIdx++) {
      const tb = CRANIAL_TUBERCLES[tIdx];
      if (tb.onUpper && y < st.mouthY + 0.02) continue;
      if (!tb.onUpper && y > st.mouthY - 0.02) continue;
      const dz = (z - tb.z) / tb.radius;
      if (Math.abs(dz) > 2.2) continue;
      const dx = ((xNorm - tb.xFrac) * st.halfWidth) / tb.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < 4.2) {
        const bump = Math.exp(-d2);
        const r = Math.hypot(x, y);
        if (r > 1e-4) {
          x += (x / r) * tb.height * bump;
          y += (y / r) * tb.height * bump;
        }
        tubercleHighlight = Math.max(tubercleHighlight, bump);
      }
    }
  }

  // 5. Realistic Countershaded Vertex Color (deep slate-navy dorsal, mottled flanks, #e8eef2 ventral pleats)
  const mottle = organicMottle(x, y, z);
  // Countershading transition height varies longitudinally (higher white sweep on throat/chest flanks, darker tail stock)
  const ventralExtent = smoothstep(-4.8, 0.8, z);
  const shadeSignal = -cosT + 0.22 * mottle - 0.32 * ventralExtent + 0.38 * (1 - ventralExtent);
  // whiteFactor: 1 on ventral throat/belly, 0 on dorsal back
  let whiteFactor = 1 - smoothstep(-0.28, 0.26, shadeSignal);
  whiteFactor *= smoothstep(-5.6, -2.4, z); // Caudal peduncle stays dark slate-charcoal

  // Chin tip has characteristic dark-and-white humpback speckling
  if (z > 6.1 && y < 0) {
    const chinSpeckle = smoothstep(6.1, 6.95, z) * (0.45 + 0.35 * mottle);
    whiteFactor *= 1 - 0.55 * chinSpeckle;
  }

  const dorsalMix = clamp(0.5 + 0.5 * mottle, 0, 1);
  const rBase = lerp(palette.dorsalDark.r, palette.dorsalMid.r, dorsalMix);
  const gBase = lerp(palette.dorsalDark.g, palette.dorsalMid.g, dorsalMix);
  const bBase = lerp(palette.dorsalDark.b, palette.dorsalMid.b, dorsalMix);

  let cr = lerp(rBase, palette.ventralWhite.r, whiteFactor);
  let cg = lerp(gBase, palette.ventralWhite.g, whiteFactor);
  let cb = lerp(bBase, palette.ventralWhite.b, whiteFactor);

  // Darken pleat troughs into realistic cool slate-pink/grey rorqual groove skin
  if (pleatGrooveShade > 0.01) {
    const grooveDarken = 0.72 * pleatGrooveShade;
    cr = lerp(cr, palette.pleatGroove.r, grooveDarken);
    cg = lerp(cg, palette.pleatGroove.g, grooveDarken);
    cb = lerp(cb, palette.pleatGroove.b, grooveDarken);
  }

  // Darken labial mouthline crease
  if (mouthCreaseFactor > 0.02) {
    cr = lerp(cr, palette.dorsalDark.r * 0.65, mouthCreaseFactor * 0.8);
    cg = lerp(cg, palette.dorsalDark.g * 0.65, mouthCreaseFactor * 0.8);
    cb = lerp(cb, palette.dorsalDark.b * 0.65, mouthCreaseFactor * 0.8);
  }

  // Subtle weathered barnacle/skin highlight on tubercle crowns
  if (tubercleHighlight > 0.15) {
    const th = (tubercleHighlight - 0.15) * 0.28;
    cr = lerp(cr, palette.tubercleTint.r, th);
    cg = lerp(cg, palette.tubercleTint.g, th);
    cb = lerp(cb, palette.tubercleTint.b, th);
  }

  // Lower-jaw skinning weight (smooth C1 mask below mouthY and ahead of shoulder/throat base)
  let jawWeight = 0;
  if (z > 0.2 && y < st.mouthY - 0.03) {
    const zJaw = smoothstep(0.3, 3.1, z);
    const yJaw = smoothstep(st.mouthY - 0.03, st.mouthY - 0.35, y);
    jawWeight = zJaw * yJaw;
  }

  // Signed gape/baleen zone weight (+1 upper baleen fringe, -1 lower inner oral margin) for jawOpen shading
  let gapeZone = 0;
  if (z > 2.92 && z < 7.12) {
    const zGape = smoothstep(2.92, 3.30, z) * smoothstep(7.12, 6.75, z);
    const dyMouth = y - st.mouthY;
    const band = Math.exp(-Math.pow(dyMouth / 0.14, 2)) * (1 - Math.abs(cosT) * 0.65);
    gapeZone = (dyMouth >= 0 ? 1 : -1) * zGape * band;
  }

  return { x, y, z, cr, cg, cb, jawWeight, gapeZone };
}

/**
 * Appends a closed-ring lofted tube (with optional startPole and endPole) into shared mesh arrays,
 * automatically enforcing outward-pointing CCW triangle winding.
 */
function appendClosedTube(builder, rings, startPole, endPole) {
  const numRings = rings.length;
  const ringSize = rings[0].length;
  const ringOffsets = new Array(numRings);

  for (let i = 0; i < numRings; i++) {
    ringOffsets[i] = builder.vertexCount;
    const ring = rings[i];
    for (let j = 0; j < ringSize; j++) {
      builder.pushVertex(ring[j]);
    }
  }

  // Determine outward winding orientation using mid-loft ring geometry
  const mid = Math.floor(numRings * 0.45);
  const next = Math.min(numRings - 1, mid + 1);
  let c0x = 0, c0y = 0, c0z = 0;
  let c1x = 0, c1y = 0, c1z = 0;
  for (let j = 0; j < ringSize; j++) {
    c0x += rings[mid][j].x;
    c0y += rings[mid][j].y;
    c0z += rings[mid][j].z;
    c1x += rings[next][j].x;
    c1y += rings[next][j].y;
    c1z += rings[next][j].z;
  }
  c0x /= ringSize; c0y /= ringSize; c0z /= ringSize;
  c1x /= ringSize; c1y /= ringSize; c1z /= ringSize;

  const ax = c1x - c0x;
  const ay = c1y - c0y;
  const az = c1z - c0z;

  const p0 = rings[mid][0];
  const p1 = rings[mid][1];
  const tx = p1.x - p0.x;
  const ty = p1.y - p0.y;
  const tz = p1.z - p0.z;

  const rx = p0.x - c0x;
  const ry = p0.y - c0y;
  const rz = p0.z - c0z;

  // (axis x tangent) . radialOutward
  const cx = ay * tz - az * ty;
  const cy = az * tx - ax * tz;
  const cz = ax * ty - ay * tx;
  const standardWinding = cx * rx + cy * ry + cz * rz >= 0;

  let startPoleIdx = -1;
  if (startPole) {
    startPoleIdx = builder.pushVertex(startPole);
    const r0 = ringOffsets[0];
    for (let j = 0; j < ringSize; j++) {
      const jNext = (j + 1) % ringSize;
      if (standardWinding) {
        builder.pushTri(startPoleIdx, r0 + j, r0 + jNext);
      } else {
        builder.pushTri(startPoleIdx, r0 + jNext, r0 + j);
      }
    }
  }

  for (let i = 0; i < numRings - 1; i++) {
    const rA = ringOffsets[i];
    const rB = ringOffsets[i + 1];
    for (let j = 0; j < ringSize; j++) {
      const jNext = (j + 1) % ringSize;
      const a = rA + j;
      const b = rB + j;
      const c = rB + jNext;
      const d = rA + jNext;
      if (standardWinding) {
        builder.pushTri(a, b, c);
        builder.pushTri(a, c, d);
      } else {
        builder.pushTri(a, d, c);
        builder.pushTri(a, c, b);
      }
    }
  }

  let endPoleIdx = -1;
  if (endPole) {
    endPoleIdx = builder.pushVertex(endPole);
    const rLast = ringOffsets[numRings - 1];
    for (let j = 0; j < ringSize; j++) {
      const jNext = (j + 1) % ringSize;
      if (standardWinding) {
        builder.pushTri(rLast + j, endPoleIdx, rLast + jNext);
      } else {
        builder.pushTri(rLast + jNext, endPoleIdx, rLast + j);
      }
    }
  }

  return { ringOffsets, startPoleIdx, endPoleIdx };
}

/**
 * Builds one long swept scalloped Humpback Pectoral Flipper (~4.6m wing length, 9.50m tip-to-tip span).
 * sideSign = +1 for Left (+X), -1 for Right (-X).
 */
function appendPectoralFlipper(builder, sideSign, palette) {
  const partId = sideSign > 0 ? PART_FLIPPER_L : PART_FLIPPER_R;
  const spanRings = 34;
  const airfoilSegs = 22;

  // Root skirt starts tucked inside chest flank (|x| = 0.76m), tip reaches |x| = 4.75m (total span = 9.50m)
  // Swept wing vector from shoulder (1.00, -0.56, 1.32) to tip (4.75, -1.20, -1.16) => length ~ 4.58m!
  const tuberclePositions = [0.16, 0.25, 0.34, 0.44, 0.53, 0.62, 0.71, 0.79, 0.87, 0.93];
  const tubercleSizes = [0.05, 0.08, 0.125, 0.14, 0.09, 0.12, 0.095, 0.085, 0.065, 0.045];

  function evalSpanFrame(s) {
    // s in [0, 1]: s = 0 tucked root skirt, s = 0.07 shoulder surface, s = 1 near rounded tip
    const spanX = sideSign * lerp(0.76, 4.71, s);
    // Gentle organic downward & swept-back humpback wing arc
    const sweepZ = 1.36 - 2.48 * Math.pow(s, 1.06) + 0.14 * Math.sin(s * Math.PI);
    const dropY = -0.54 - 0.64 * Math.pow(s, 0.95) + 0.08 * Math.sin(s * Math.PI * 1.15);

    // Base chord profile (~1.06m max chord, tapering to sleek narrow tip)
    let chord = 0.96 * Math.pow(Math.sin(clamp(s * 0.92 + 0.08, 0.05, 0.99) * Math.PI), 0.58) * (1 - 0.52 * Math.pow(s, 2.2));
    chord = Math.max(0.11, chord);

    // Prominent Humpback leading-edge knobby tubercles!
    let leadBump = 0;
    for (let k = 0; k < tuberclePositions.length; k++) {
      const dist = (s - tuberclePositions[k]) / 0.028;
      leadBump += tubercleSizes[k] * Math.exp(-dist * dist);
    }
    // Gentle trailing-edge scalloping
    const trailScallop = 0.025 * Math.sin(s * 34.0) * smoothstep(0.15, 0.35, s) * smoothstep(0.98, 0.80, s);

    // Root fillet flare so shoulder junction blends smoothly into body wall
    const rootFillet = 0.16 * Math.exp(-Math.pow(s / 0.08, 2));
    const halfThick = (0.095 * (1 - 0.76 * Math.pow(s, 0.85)) + rootFillet) * (1 + 0.18 * leadBump);

    return { spanX, sweepZ, dropY, chord, leadBump, trailScallop, halfThick };
  }

  const rings = [];
  for (let i = 0; i < spanRings; i++) {
    const s = (i / (spanRings - 1)) * 0.985;
    const fr = evalSpanFrame(s);
    const ring = [];

    // Skinning span weight: 0 inside tucked root skirt -> 1 along free wing
    const skinSpan = smoothstep(0.02, 0.14, s) * lerp(0.15, 1.0, s);

    for (let j = 0; j < airfoilSegs; j++) {
      const phi = (j / airfoilSegs) * Math.PI * 2;
      // phi = 0 at leading edge (+Z), phi = pi/2 dorsal (+Y), phi = pi trailing edge (-Z), phi = 3pi/2 ventral (-Y)
      const cosP = Math.cos(phi); // +1 leading edge, -1 trailing edge
      const sinP = Math.sin(phi); // +1 dorsal, -1 ventral

      // NACA-inspired asymmetric hydrofoil thickness distribution (thicker near rounded leading edge, thin trailing edge)
      const chordFrac = (1 - cosP) * 0.5; // 0 at leading edge, 1 at trailing edge
      const foilEnv = Math.sin(phi) * (0.62 + 0.38 * Math.cos(phi * 0.5));
      // Slight hydrofoil positive camber & slight washout twist (-6 deg toward tip)
      const camber = 0.024 * Math.sin(chordFrac * Math.PI) * (1 - 0.5 * s);

      const leadExt = fr.chord * 0.46 + fr.leadBump;
      const trailExt = fr.chord * 0.54 + fr.trailScallop;
      const localZ = cosP >= 0 ? cosP * leadExt : cosP * trailExt;
      const localY = foilEnv * fr.halfThick + camber;

      const x = fr.spanX;
      const y = fr.dropY + localY;
      const z = fr.sweepZ + localZ;

      // Iconic Humpback pectoral coloration:
      // Ventral side (sinP < 0), leading-edge tubercles (cosP > 0.45), and distal upper patches are luminous off-white (#e8eef2)!
      const mottle = organicMottle(x * 1.4, y * 1.4, z * 1.4);
      const ventralWhiteMask = smoothstep(0.18, -0.22, sinP);
      const leadingKnobWhite = smoothstep(0.35, 0.85, cosP) * smoothstep(0.10, 0.25, s);
      const distalDorsalWhite = smoothstep(0.38, 0.82, s + 0.18 * mottle) * 0.88;
      const whiteMix = clamp(Math.max(ventralWhiteMask, leadingKnobWhite, distalDorsalWhite), 0, 1);

      const cr = lerp(palette.dorsalMid.r, palette.ventralWhite.r, whiteMix);
      const cg = lerp(palette.dorsalMid.g, palette.ventralWhite.g, whiteMix);
      const cb = lerp(palette.dorsalMid.b, palette.ventralWhite.b, whiteMix);

      const spineU = clamp((SNOUT_Z - z) / TOTAL_LENGTH, 0, 1);
      ring.push({
        x,
        y,
        z,
        cr,
        cg,
        cb,
        u: s,
        v: j / airfoilSegs,
        part: partId,
        spineU,
        partSpan: skinSpan,
        partChord: cosP,
        jawWeight: 0,
      });
    }
    rings.push(ring);
  }

  // Rounded wingtip cap at |x| = 4.75m (exact 9.50m total span!)
  const tipFrame = evalSpanFrame(1.0);
  const tipX = sideSign * 4.75;
  const tipY = tipFrame.dropY;
  const tipZ = tipFrame.sweepZ - 0.02;
  const tipPole = {
    x: tipX,
    y: tipY,
    z: tipZ,
    cr: palette.ventralWhite.r,
    cg: palette.ventralWhite.g,
    cb: palette.ventralWhite.b,
    u: 1,
    v: 0.5,
    part: partId,
    spineU: clamp((SNOUT_Z - tipZ) / TOTAL_LENGTH, 0, 1),
    partSpan: 1.0,
    partChord: 0,
    jawWeight: 0,
  };

  const { ringOffsets, endPoleIdx } = appendClosedTube(builder, rings, null, tipPole);

  // 6 ordered trailing-edge stations from root to tip along the 4.6m pectoral wing (j = 11 => phi = pi trailing edge)
  const trailingRingIndices = [3, 9, 15, 21, 27];
  const trailingEdgeJ = Math.floor(airfoilSegs / 2);
  const trailingStations = trailingRingIndices.map((rIdx) => {
    const s = (rIdx / (spanRings - 1)) * 0.985;
    const fr = evalSpanFrame(s);
    return {
      vertexIndex: ringOffsets[rIdx] + trailingEdgeJ,
      radius: Math.max(0.16, fr.chord * 0.52),
    };
  });
  trailingStations.push({
    vertexIndex: endPoleIdx,
    radius: 0.16,
  });

  return { tipIdx: endPoleIdx, trailingStations };
}

/**
 * Builds unified Butterfly Tail Flukes (~4.50m span from x = -2.25m to +2.25m, tips at z = -7.80m)
 * with S-curved leading edge, central V-notch at x = 0, crenelated trailing edge, and white ventral pattern.
 */
function appendTailFlukes(builder, palette) {
  const spanStations = 49; // Odd so i = 24 lands exactly on s = 0 (central V-notch!)
  const airfoilSegs = 20;
  const halfSpan = 2.25; // Total span = 4.50m

  function evalFlukeStation(s) {
    // s in [-1, +1]
    const absS = Math.abs(s);
    const x = s * halfSpan;

    // Graceful S-curved leading edge: merges into peduncle keel at z = -6.02m, sweeps to -7.64m at tips
    const zLead =
      -6.02 -
      1.62 * Math.pow(absS, 1.22) +
      0.11 * Math.sin(absS * Math.PI * 2.0) * (1 - absS * 0.4);

    // Trailing edge with unmistakable central V-notch at s = 0 (z = -7.22m),
    // convex lobes reaching -7.62m, crenelated scallops, and recurved tips reaching -7.80m!
    const notch = 0.34 * Math.exp(-Math.pow(absS / 0.085, 2));
    const crenelations =
      0.022 * Math.sin(absS * 38.0) * smoothstep(0.08, 0.20, absS) * smoothstep(0.98, 0.85, absS);
    const lobeCurve = -7.54 - 0.14 * Math.sin(absS * Math.PI * 0.85) - 0.26 * Math.pow(absS, 2.6);
    const zTrail = lobeCurve + notch + crenelations;

    // Thickness blends cleanly with peduncle at s=0 and thins to sleek hydrofoil blades
    const centerHub = 0.13 * Math.exp(-Math.pow(absS / 0.11, 2));
    const halfThick = 0.078 * Math.pow(1 - absS * 0.84, 0.9) + centerHub;

    // Slight graceful upward fluke dihedral toward tips
    const yCenter = 0.08 * Math.pow(absS, 1.7);

    return { x, yCenter, zLead, zTrail, halfThick, absS };
  }

  const rings = [];
  for (let i = 0; i < spanStations; i++) {
    // Span from s = -0.988 (near right tip) to s = +0.988 (near left tip)
    const s = lerp(-0.988, 0.988, i / (spanStations - 1));
    const st = evalFlukeStation(s);
    const zMid = 0.5 * (st.zLead + st.zTrail);
    const halfChord = Math.max(0.055, 0.5 * (st.zLead - st.zTrail));

    const ring = [];
    for (let j = 0; j < airfoilSegs; j++) {
      const phi = (j / airfoilSegs) * Math.PI * 2;
      const cosP = Math.cos(phi); // +1 leading edge (+Z), -1 trailing edge (-Z)
      const sinP = Math.sin(phi); // +1 dorsal (+Y), -1 ventral (-Y)

      // Sleek symmetric hydrofoil section (fuller near leading edge, razor-clean trailing edge)
      const foilThick = sinP * (0.64 + 0.36 * Math.cos(phi * 0.5)) * st.halfThick;
      const x = st.x;
      const y = st.yCenter + foilThick;
      const z = zMid + cosP * halfChord;

      // Classic Humpback fluke ventral ID pattern: bright off-white central ventral lobes with dark leading/trailing borders
      const mottle = organicMottle(x * 2.1, y * 2.1, z * 2.1);
      const isVentral = smoothstep(0.10, -0.28, sinP);
      const lobeInterior =
        smoothstep(0.05, 0.18, st.absS) *
        smoothstep(-0.92, -0.42, cosP) *
        smoothstep(0.92, 0.55, cosP);
      const whitePatch = clamp(isVentral * (0.78 * lobeInterior + 0.22 * smoothstep(0.0, 0.5, mottle)), 0, 1);

      const cr = lerp(palette.dorsalDark.r, palette.ventralWhite.r, whitePatch);
      const cg = lerp(palette.dorsalDark.g, palette.ventralWhite.g, whitePatch);
      const cb = lerp(palette.dorsalDark.b, palette.ventralWhite.b, whitePatch);

      ring.push({
        x,
        y,
        z,
        cr,
        cg,
        cb,
        u: (s + 1) * 0.5,
        v: j / airfoilSegs,
        part: PART_FLUKES,
        spineU: clamp((SNOUT_Z - z) / TOTAL_LENGTH, 0, 1),
        partSpan: st.absS,
        partChord: cosP,
        jawWeight: 0,
      });
    }
    rings.push(ring);
  }

  const rightTipPole = {
    x: -halfSpan,
    y: 0.08,
    z: FLUKE_TIP_Z,
    cr: palette.dorsalDark.r,
    cg: palette.dorsalDark.g,
    cb: palette.dorsalDark.b,
    u: 0,
    v: 0.5,
    part: PART_FLUKES,
    spineU: 1.0,
    partSpan: 1.0,
    partChord: -0.5,
    jawWeight: 0,
  };

  const leftTipPole = {
    x: halfSpan,
    y: 0.08,
    z: FLUKE_TIP_Z,
    cr: palette.dorsalDark.r,
    cg: palette.dorsalDark.g,
    cb: palette.dorsalDark.b,
    u: 1,
    v: 0.5,
    part: PART_FLUKES,
    spineU: 1.0,
    partSpan: 1.0,
    partChord: -0.5,
    jawWeight: 0,
  };

  const { ringOffsets, startPoleIdx: flukeRIdx, endPoleIdx: flukeLIdx } = appendClosedTube(
    builder,
    rings,
    rightTipPole,
    leftTipPole
  );

  // 5 stations across the 4.5m tail flukes trailing edge (right tip -> right lobe -> center notch -> left lobe -> left tip)
  const trailJ = Math.floor(airfoilSegs / 2);
  const flukeTrailing = [
    { vertexIndex: flukeRIdx, radius: 0.22 },
    { vertexIndex: ringOffsets[12] + trailJ, radius: 0.42 },
    { vertexIndex: ringOffsets[24] + trailJ, radius: 0.48 },
    { vertexIndex: ringOffsets[36] + trailJ, radius: 0.42 },
    { vertexIndex: flukeLIdx, radius: 0.22 },
  ];

  return { flukeRIdx, flukeLIdx, flukeTrailing };
}

/**
 * Evaluates spine centerline deformation (vertical displacement + pitch angle + axial foreshortening)
 * at rest local longitudinal coordinate z0.
 */
export function evaluateSpineDeformation(z0, spineArch = 0, tailBeatPhase = 0, tailBeatAmplitude = 0) {
  if (z0 >= 0) {
    // Anterior torso & head: graceful upward/backward breach bow
    const sHead = clamp(z0 / SNOUT_Z, 0, 1);
    const dy = spineArch * 0.58 * sHead * sHead;
    const dYdZ = (spineArch * 1.16 * sHead) / SNOUT_Z;
    const dz = -0.25 * dYdZ * dYdZ * z0;
    return { dy, dz, slopeAngle: Math.atan(dYdZ), waveAngle: 0 };
  }

  // Posterior torso, caudal peduncle & flukes (z0 < 0):
  // Combines continuous breach arch + travelling dorsoventral cetacean propulsive wave
  const tailRef = 6.9;
  const sTail = clamp(-z0 / tailRef, 0, 1.18);
  const archY = spineArch * 1.28 * Math.pow(sTail, 1.85);
  const dArchdS = spineArch * 1.28 * 1.85 * Math.pow(Math.max(1e-4, sTail), 0.85);

  const envT = clamp((sTail - 0.06) / 0.94, 0, 1.2);
  const env = Math.pow(envT, 1.85);
  const dEnvdS = envT > 0 ? (1.85 / 0.94) * Math.pow(envT, 0.85) : 0;

  const kWave = 2.45;
  const phase = tailBeatPhase - sTail * kWave;
  const sinP = Math.sin(phase);
  const cosP = Math.cos(phase);

  const beatScale = 1.38 * tailBeatAmplitude;
  const beatY = beatScale * env * sinP;
  const dBeatdS = beatScale * (dEnvdS * sinP - env * kWave * cosP);

  const dy = archY + beatY;
  // Since sTail = -z0 / tailRef, dy/dz = -(d/dsTail) / tailRef
  const dYdZ = -(dArchdS + dBeatdS) / tailRef;
  const dz = 0.24 * dYdZ * dYdZ * -z0; // pulls tail slightly forward (+Z) when strongly bent

  // Passive hydrodynamic fluke pitch lag (proportional to vertical velocity ~ cos(phase))
  const flukeLagPitch = -0.32 * tailBeatAmplitude * cosP * smoothstep(0.78, 1.02, sTail);

  return {
    dy,
    dz,
    slopeAngle: Math.atan(dYdZ),
    waveAngle: flukeLagPitch,
  };
}

/**
 * Procedurally sculpts an organic ~15.0m Humpback Whale BufferGeometry (~7,786 vertices)
 * with smooth normals, countershaded vertex colors, and biomechanical skinning metadata.
 */
export function createWhaleGeometry() {
  const palette = {
    dorsalDark: new THREE.Color('#131d29'),
    dorsalMid: new THREE.Color('#1e2e40'),
    ventralWhite: new THREE.Color('#e8eef2'),
    pleatGroove: new THREE.Color('#6f8296'),
    tubercleTint: new THREE.Color('#47586b'),
  };

  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];

  const partArr = [];
  const spineUArr = [];
  const partSpanArr = [];
  const partChordArr = [];
  const jawWeightArr = [];
  const gapeZoneArr = [];

  const builder = {
    vertexCount: 0,
    pushVertex(v) {
      const idx = this.vertexCount++;
      positions.push(v.x, v.y, v.z);
      colors.push(v.cr, v.cg, v.cb);
      uvs.push(v.u ?? 0, v.v ?? 0);
      partArr.push(v.part ?? PART_BODY);
      spineUArr.push(v.spineU ?? 0);
      partSpanArr.push(v.partSpan ?? 0);
      partChordArr.push(v.partChord ?? 0);
      jawWeightArr.push(v.jawWeight ?? 0);
      gapeZoneArr.push(v.gapeZone ?? 0);
      return idx;
    },
    pushTri(a, b, c) {
      indices.push(a, b, c);
    },
  };

  // 1. Main Body Fuselage (78 longitudinal stations x 68 circumferential vertices + 2 end poles = 5,306 verts)
  const numBodyRings = 78;
  const circTable = buildBodyCircumferenceTable();
  const bodyRings = [];

  let chinIdx = 0;
  let bestChinScore = -Infinity;
  let dorsalIdx = 0;
  let bestDorsalScore = -Infinity;
  let blowholeIdx = 0;
  let bestBlowholeDist = Infinity;

  for (let i = 0; i < numBodyRings; i++) {
    // Cosine-blended spacingnear snout & peduncle for crisp nose & tail-stock curvature
    const tLin = (i + 0.65) / (numBodyRings + 0.3);
    const tRefined = lerp(tLin, 0.5 - 0.5 * Math.cos(tLin * Math.PI), 0.32);
    const z = lerp(7.16, -6.70, tRefined);
    const spineU = clamp((SNOUT_Z - z) / TOTAL_LENGTH, 0, 1);

    const ring = [];
    for (let j = 0; j < circTable.length; j++) {
      const vt = evaluateBodyVertex(z, circTable[j], palette);
      const prospectiveIdx = builder.vertexCount + i * circTable.length + j;

      if (circTable[j].k === 0 && z > 5.8 && z < 7.05) {
        const chinScore = z - vt.y * 2.0;
        if (chinScore > bestChinScore) {
          bestChinScore = chinScore;
          chinIdx = prospectiveIdx;
        }
      }
      if (circTable[j].k === 34 && z > -3.1 && z < -2.5) {
        if (vt.y > bestDorsalScore) {
          bestDorsalScore = vt.y;
          dorsalIdx = prospectiveIdx;
        }
      }
      if (circTable[j].k === 34) {
        const bhDist = Math.abs(z - 3.70);
        if (bhDist < bestBlowholeDist) {
          bestBlowholeDist = bhDist;
          blowholeIdx = prospectiveIdx;
        }
      }

      ring.push({
        ...vt,
        u: tRefined,
        v: j / circTable.length,
        part: PART_BODY,
        spineU,
        partSpan: 0,
        partChord: 0,
      });
    }
    bodyRings.push(ring);
  }

  const snoutPole = {
    x: 0,
    y: -0.02,
    z: SNOUT_Z,
    cr: palette.dorsalMid.r,
    cg: palette.dorsalMid.g,
    cb: palette.dorsalMid.b,
    u: 0,
    v: 0.5,
    part: PART_BODY,
    spineU: 0,
    partSpan: 0,
    partChord: 0,
    jawWeight: 0,
  };

  const pedunclePole = {
    x: 0,
    y: 0.02,
    z: -6.76,
    cr: palette.dorsalDark.r,
    cg: palette.dorsalDark.g,
    cb: palette.dorsalDark.b,
    u: 1,
    v: 0.5,
    part: PART_BODY,
    spineU: clamp((SNOUT_Z - -6.76) / TOTAL_LENGTH, 0, 1),
    partSpan: 0,
    partChord: 0,
    jawWeight: 0,
  };

  const { startPoleIdx: snoutIdx } = appendClosedTube(builder, bodyRings, snoutPole, pedunclePole);

  // 2. Left (+X) & Right (-X) Scalloped Pectoral Flippers (749 verts each)
  const { tipIdx: flipperLIdx, trailingStations: flipperTrailingL } = appendPectoralFlipper(
    builder,
    +1,
    palette
  );
  const { tipIdx: flipperRIdx, trailingStations: flipperTrailingR } = appendPectoralFlipper(
    builder,
    -1,
    palette
  );

  // 3. Unified Butterfly Tail Flukes (982 verts)
  const { flukeLIdx, flukeRIdx, flukeTrailing } = appendTailFlukes(builder, palette);

  // Build THREE.BufferGeometry
  const geometry = new THREE.BufferGeometry();
  const restPositions = new Float32Array(positions);
  const livePositions = new Float32Array(positions);
  const restColors = new Float32Array(colors);
  const liveColors = new Float32Array(colors);

  geometry.setAttribute('position', new THREE.BufferAttribute(livePositions, 3));
  geometry.setAttribute('aRestPos', new THREE.BufferAttribute(restPositions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(liveColors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  const bb = geometry.boundingBox;
  const bounds = {
    min: { x: bb.min.x, y: bb.min.y, z: bb.min.z },
    max: { x: bb.max.x, y: bb.max.y, z: bb.max.z },
    size: {
      x: bb.max.x - bb.min.x,
      y: bb.max.y - bb.min.y,
      z: bb.max.z - bb.min.z,
    },
  };

  // Precompute 8 anatomical spine stations (centerline y, z, and effective splash radius) from snout to flukes
  const spineStations = SPINE_STATION_Z.map((sz) => {
    if (sz >= -6.6) {
      const st = evaluateBodyStation(sz);
      const yMid = 0.5 * (st.dorsalY - st.ventralDepth);
      const radius = Math.max(0.22, 0.5 * (st.halfWidth + 0.5 * (st.dorsalY + st.ventralDepth)));
      return { x: 0, y: yMid, z: sz, radius };
    }
    return { x: 0, y: 0.04, z: sz, radius: 0.55 };
  });

  // Exact rest coordinates for dorsal blowhole (z = 3.70) and supraorbital cetacean eyes (z = 2.92, y = -0.02)
  const blowholeVert = evaluateBodyVertex(3.70, circTable[34], palette);
  const blowholeRest = { x: 0, y: blowholeVert.y, z: 3.70 };

  const eyeSt = evaluateBodyStation(2.92);
  const eyeTheta = Math.acos(clamp(0.02 / Math.max(0.2, eyeSt.ventralDepth), -1, 1));
  const eyeCircL = {
    k: 22,
    absK: 22,
    sign: 1,
    theta: eyeTheta,
    absTheta: eyeTheta,
    pleatCos: 1,
    pleatMask: 0,
  };
  const eyeSurfaceL = evaluateBodyVertex(2.92, eyeCircL, palette);
  const eyeSocketX = Math.max(0.8, eyeSurfaceL.x - 0.02);
  const eyeRest = {
    left: { x: eyeSocketX, y: -0.02, z: 2.92 },
    right: { x: -eyeSocketX, y: -0.02, z: 2.92 },
  };

  const skinMeta = {
    vertexCount: builder.vertexCount,
    part: new Uint8Array(partArr),
    spineU: new Float32Array(spineUArr),
    partSpan: new Float32Array(partSpanArr),
    partChord: new Float32Array(partChordArr),
    jawWeight: new Float32Array(jawWeightArr),
    gapeZone: new Float32Array(gapeZoneArr),
    pivots: {
      flipperL: SHOULDER_PIVOT_L,
      flipperR: SHOULDER_PIVOT_R,
      jaw: JAW_PIVOT,
    },
    anchorIndices: {
      snout: snoutIdx,
      chin: chinIdx,
      dorsal: dorsalIdx,
      blowhole: blowholeIdx,
      flipperL: flipperLIdx,
      flipperR: flipperRIdx,
      flukeL: flukeLIdx,
      flukeR: flukeRIdx,
    },
    blowholeRest,
    eyeRest,
    flipperTrailingL,
    flipperTrailingR,
    flukeTrailing,
    spineStations,
  };

  return { geometry, restPositions, restColors, skinMeta, bounds };
}

/**
 * Smoothly deforms whale geometry in-place from restPositions using biomechanical spine arch,
 * travelling caudal propulsive wave + fluke pitch lag, pectoral fin flare/sweep/flex, and jaw tension.
 */
export function deformWhaleGeometry(whaleData, animState = {}) {
  const { geometry, restPositions, restColors, skinMeta } = whaleData;
  const posAttr = geometry.getAttribute('position');
  const out = posAttr.array;
  const colAttr = geometry.getAttribute('color');
  const colOut = colAttr ? colAttr.array : null;

  const spineArch = Number.isFinite(animState.spineArch) ? animState.spineArch : 0;
  const tailBeatPhase = Number.isFinite(animState.tailBeatPhase) ? animState.tailBeatPhase : 0;
  const tailBeatAmplitude = Number.isFinite(animState.tailBeatAmplitude) ? animState.tailBeatAmplitude : 0.5;
  const finSpread = Number.isFinite(animState.finSpread) ? animState.finSpread : 0.5;
  const jawOpen = Number.isFinite(animState.jawOpen) ? clamp(animState.jawOpen, 0, 1.5) : 0;

  const spreadDelta = finSpread - 0.5; // 0 in neutral rest pose (finSpread = 0.5)
  const jawAngle = jawOpen * 0.26; // radians downward opening around temporomandibular joint
  const cosJaw = Math.cos(jawAngle);
  const sinJaw = Math.sin(jawAngle);

  // Pre-evaluate shoulder spine offsets so pectoral flippers stay locked cleanly onto the chest
  const shoulderSpine = evaluateSpineDeformation(SHOULDER_PIVOT_L.z, spineArch, tailBeatPhase, tailBeatAmplitude);

  const count = skinMeta.vertexCount;
  const part = skinMeta.part;
  const partSpan = skinMeta.partSpan;
  const partChord = skinMeta.partChord;
  const jawWeight = skinMeta.jawWeight;
  const gapeZone = skinMeta.gapeZone;
  const gapeShadeAmount = clamp(jawOpen * 2.2, 0, 1);

  for (let i = 0; i < count; i++) {
    const idx3 = i * 3;
    let x = restPositions[idx3];
    let y = restPositions[idx3 + 1];
    let z = restPositions[idx3 + 2];

    const pType = part[i];

    // Update baleen keratin fringe & vascular inner-mouth cavity shading along gape when jaw opens
    if (colOut && restColors && gapeZone) {
      const gz = gapeZone[i];
      if (gz !== 0) {
        if (gapeShadeAmount > 1e-4) {
          const absGz = Math.abs(gz) * gapeShadeAmount;
          if (gz > 0) {
            // Upper rostrum baleen keratin plates (fibrous warm amber-slate striations)
            const plateComb = 0.5 + 0.5 * Math.sin(z * 78.0);
            const targetR = lerp(0.18, 0.42, plateComb);
            const targetG = lerp(0.14, 0.32, plateComb);
            const targetB = lerp(0.11, 0.23, plateComb);
            colOut[idx3] = lerp(restColors[idx3], targetR, absGz * 0.85);
            colOut[idx3 + 1] = lerp(restColors[idx3 + 1], targetG, absGz * 0.85);
            colOut[idx3 + 2] = lerp(restColors[idx3 + 2], targetB, absGz * 0.85);
          } else {
            // Lower gape / oral cavity mucosal shading
            colOut[idx3] = lerp(restColors[idx3], 0.24, absGz * 0.82);
            colOut[idx3 + 1] = lerp(restColors[idx3 + 1], 0.13, absGz * 0.82);
            colOut[idx3 + 2] = lerp(restColors[idx3 + 2], 0.16, absGz * 0.82);
          }
        } else {
          colOut[idx3] = restColors[idx3];
          colOut[idx3 + 1] = restColors[idx3 + 1];
          colOut[idx3 + 2] = restColors[idx3 + 2];
        }
      }
    }

    // 1. Pectoral flipper articulation in local chest space BEFORE global spine bend
    if (pType === PART_FLIPPER_L || pType === PART_FLIPPER_R) {
      const sideSign = pType === PART_FLIPPER_L ? 1 : -1;
      const piv = sideSign > 0 ? SHOULDER_PIVOT_L : SHOULDER_PIVOT_R;
      const wSpan = partSpan[i];

      if (wSpan > 0 && (Math.abs(spreadDelta) > 1e-6 || Math.abs(tailBeatAmplitude) > 1e-6)) {
        let lx = x - piv.x;
        let ly = y - piv.y;
        let lz = z - piv.z;

        // Sweep forward (+spreadDelta) vs tucked backward (-spreadDelta) around local Y
        const sweepAngle = sideSign * (-spreadDelta * 0.62) * smoothstep(0, 0.35, wSpan);
        if (Math.abs(sweepAngle) > 1e-6) {
          const cs = Math.cos(sweepAngle);
          const sn = Math.sin(sweepAngle);
          const nx = lx * cs + lz * sn;
          const nz = -lx * sn + lz * cs;
          lx = nx;
          lz = nz;
        }

        // Dihedral lift + hydrodynamic secondary wave flex around local Z
        const fluidWave =
          tailBeatAmplitude * 0.11 * Math.sin(tailBeatPhase - 0.9 - wSpan * 1.4) * Math.pow(wSpan, 1.3);
        const dihedralAngle = sideSign * (spreadDelta * 0.44 * smoothstep(0, 0.3, wSpan) + fluidWave);
        if (Math.abs(dihedralAngle) > 1e-6) {
          const cd = Math.cos(dihedralAngle);
          const sd = Math.sin(dihedralAngle);
          const nx = lx * cd - ly * sd;
          const ny = lx * sd + ly * cd;
          lx = nx;
          ly = ny;
        }

        // Subtle wingtip upward bow & chord pitch washout when flared wide
        ly += spreadDelta * 0.28 * wSpan * wSpan - partChord[i] * spreadDelta * 0.06 * wSpan;

        x = piv.x + lx;
        y = piv.y + ly;
        z = piv.z + lz;
      }

      // Apply chest/shoulder spine deformation coherently to the entire flipper
      const cosS = Math.cos(shoulderSpine.slopeAngle);
      const sinS = Math.sin(shoulderSpine.slopeAngle);
      const yRel = y;
      y = shoulderSpine.dy + yRel * cosS;
      z = z + shoulderSpine.dz - yRel * sinS;

      out[idx3] = x;
      out[idx3 + 1] = y;
      out[idx3 + 2] = z;
      continue;
    }

    // 2. Lower mandible & ventral throat pleat tension/gape
    const jw = jawWeight[i];
    if (jw > 0 && jawOpen > 1e-5) {
      const dyJ = y - JAW_PIVOT.y;
      const dzJ = z - JAW_PIVOT.z;
      // Positive jawOpen rotates +Z chin downward (-Y) and slightly aft (-Z)
      const rotY = JAW_PIVOT.y + dyJ * cosJaw - dzJ * sinJaw;
      const rotZ = JAW_PIVOT.z + dyJ * sinJaw + dzJ * cosJaw;
      y = lerp(y, rotY - 0.06 * jawOpen * jw, jw);
      z = lerp(z, rotZ, jw);
      // Slight lateral pouch expansion during throat tension
      x *= 1 + 0.04 * jawOpen * jw;
    }

    // 3. Fluke spanwise hydrodynamic flex & pitch lag before spine bend
    if (pType === PART_FLUKES && Math.abs(tailBeatAmplitude) > 1e-6) {
      const fSpan = partSpan[i];
      const flukeTipLag =
        -0.22 * tailBeatAmplitude * Math.cos(tailBeatPhase - 2.45) * Math.pow(fSpan, 1.55);
      const pitchTwist = -0.10 * tailBeatAmplitude * Math.cos(tailBeatPhase - 2.45) * partChord[i] * fSpan;
      y += flukeTipLag + pitchTwist;
    }

    // 4. Longitudinal spine arch & travelling propulsive caudal wave
    const sp = evaluateSpineDeformation(z, spineArch, tailBeatPhase, tailBeatAmplitude);
    const totalPitch = sp.slopeAngle + (pType === PART_FLUKES ? sp.waveAngle * partSpan[i] : 0);
    const cosP = Math.cos(totalPitch);
    const sinP = Math.sin(totalPitch);

    const deformedY = sp.dy + y * cosP;
    const deformedZ = z + sp.dz - y * sinP;

    out[idx3] = x;
    out[idx3 + 1] = deformedY;
    out[idx3 + 2] = deformedZ;
  }

  posAttr.needsUpdate = true;
  if (colAttr) {
    colAttr.needsUpdate = true;
  }
  geometry.computeVertexNormals();
}
