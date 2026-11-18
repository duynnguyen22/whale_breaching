import { describe, expect, it } from 'vitest';
import {
  BREACH_CYCLE_DURATION,
  BREACH_VARIANTS,
  evaluateBreachState,
  createBreachController,
} from '../src/animation/breachTimeline.js';
import { createWhaleRig } from '../src/whale/whaleMesh.js';

describe('breachTimeline', () => {
  describe('BREACH_CYCLE_DURATION & phase mapping', () => {
    it('exports 9.0s BREACH_CYCLE_DURATION and wraps progress into [0, 1) across all 5 phases', () => {
      expect(BREACH_CYCLE_DURATION).toBe(9.0);

      expect(evaluateBreachState(0.0).phaseName).toBe('ascent');
      expect(evaluateBreachState(0.229).phaseName).toBe('ascent');
      expect(evaluateBreachState(0.23).phaseName).toBe('breakthrough');
      expect(evaluateBreachState(0.469).phaseName).toBe('breakthrough');
      expect(evaluateBreachState(0.47).phaseName).toBe('apex');
      expect(evaluateBreachState(0.639).phaseName).toBe('apex');
      expect(evaluateBreachState(0.64).phaseName).toBe('splashdown');
      expect(evaluateBreachState(0.759).phaseName).toBe('splashdown');
      expect(evaluateBreachState(0.76).phaseName).toBe('recovery');
      expect(evaluateBreachState(0.999).phaseName).toBe('recovery');

      // Wrapping for >= 1 and negative values
      const wrappedOne = evaluateBreachState(1.0);
      expect(wrappedOne.progress).toBe(0);
      expect(wrappedOne.phaseName).toBe('ascent');

      const wrappedNeg = evaluateBreachState(-0.2);
      expect(wrappedNeg.progress).toBeCloseTo(0.8, 6);
      expect(wrappedNeg.phaseName).toBe('recovery');

      const wrappedOver = evaluateBreachState(2.35);
      expect(wrappedOver.progress).toBeCloseTo(0.35, 6);
      expect(wrappedOver.phaseName).toBe('breakthrough');
    });
  });

  describe('evaluateBreachState kinematics & surface interactions', () => {
    it('follows realistic breach trajectory, surface crossings, barrel roll, and fin flare', () => {
      const start = evaluateBreachState(0.0);
      expect(start.position.x).toBeCloseTo(0, 3);
      expect(start.position.y).toBeCloseTo(-21, 2);
      expect(start.position.z).toBeCloseTo(-10, 2);
      expect(start.rotation.pitch).toBeCloseTo(1.05, 2);
      expect(start.rotation.roll).toBeCloseTo(0, 3);
      expect(start.tailBeatAmplitude).toBeGreaterThan(0.85);

      const preBreak = evaluateBreachState(0.23);
      expect(preBreak.position.x).toBeCloseTo(0, 3);
      expect(preBreak.position.y).toBeCloseTo(-1.0, 2);
      expect(preBreak.position.z).toBeCloseTo(-0.4, 2);
      expect(preBreak.rotation.pitch).toBeCloseTo(1.05, 1);

      // Crosses y = 0 upward near progress = 0.24 with strong upward velocity
      const atBreakthrough = evaluateBreachState(0.24);
      expect(Math.abs(atBreakthrough.position.y)).toBeLessThan(0.25);
      expect(atBreakthrough.velocity.y).toBeGreaterThan(8.0);
      expect(evaluateBreachState(0.25).position.y).toBeGreaterThan(0.5);

      // Emergence intensity peaks at 1.0 during breakthrough
      let maxEmergence = 0;
      for (let p = 0.23; p <= 0.47; p += 0.01) {
        maxEmergence = Math.max(maxEmergence, evaluateBreachState(p).emergenceIntensity);
      }
      expect(maxEmergence).toBeCloseTo(1.0, 2);

      // Reaches airborne apex near 0.47 with flared pectoral fins and barrel-roll twist
      const atApexStart = evaluateBreachState(0.47);
      expect(atApexStart.position.y).toBeCloseTo(9.2, 1);
      expect(atApexStart.position.z).toBeCloseTo(5.5, 1);
      expect(Math.abs(atApexStart.velocity.y)).toBeLessThan(0.5);
      expect(atApexStart.finSpread).toBeGreaterThan(0.95);
      expect(atApexStart.rotation.roll).toBeCloseTo(2.55, 1);
      expect(atApexStart.rotation.pitch).toBeCloseTo(0.18, 1);

      // Hang-time arch through apex (0.47..0.64)
      const midApex = evaluateBreachState(0.56);
      expect(midApex.spineArch).toBeGreaterThan(0.8);
      expect(midApex.bodyShedIntensity).toBeGreaterThan(0.8);
      expect(midApex.rotation.roll).toBeCloseTo(2.75, 1);

      const endApex = evaluateBreachState(0.64);
      expect(endApex.position.y).toBeCloseTo(1.8, 1);
      expect(endApex.position.z).toBeCloseTo(9.5, 1);
      expect(endApex.rotation.pitch).toBeCloseTo(-0.30, 1);

      // Crashes downward through y = 0 near 0.67 into splashdown
      const atSplashdown = evaluateBreachState(0.67);
      expect(Math.abs(atSplashdown.position.y)).toBeLessThan(0.25);
      expect(atSplashdown.velocity.y).toBeLessThan(-5.0);

      let maxSplashdown = 0;
      for (let p = 0.64; p <= 0.76; p += 0.01) {
        maxSplashdown = Math.max(
          maxSplashdown,
          evaluateBreachState(p).splashdownIntensity,
        );
      }
      expect(maxSplashdown).toBeCloseTo(1.0, 2);

      const endSplashdown = evaluateBreachState(0.76);
      expect(endSplashdown.position.y).toBeCloseTo(-6.5, 1);
      expect(endSplashdown.position.z).toBeCloseTo(12.5, 1);
    });

    it('swells pre-breach waterDome around (0, 0) over 0.15..0.27 peaking ~1.85m height and ~4.8m radius', () => {
      expect(evaluateBreachState(0.14).waterDome.height).toBe(0);
      expect(evaluateBreachState(0.14).waterDome.radius).toBeGreaterThan(0);
      expect(evaluateBreachState(0.28).waterDome.height).toBe(0);
      expect(evaluateBreachState(0.67).waterDome.height).toBe(0);

      let peakDome = { height: 0, radius: 0, x: 0, z: 0 };
      for (let p = 0.15; p <= 0.27; p += 0.005) {
        const { waterDome } = evaluateBreachState(p);
        if (waterDome.height > peakDome.height) {
          peakDome = waterDome;
        }
      }

      expect(peakDome.x).toBeCloseTo(0, 2);
      expect(peakDome.z).toBeCloseTo(0, 2);
      expect(peakDome.height).toBeCloseTo(1.85, 2);
      expect(peakDome.radius).toBeCloseTo(4.8, 2);
    });

    it('maintains C1 velocity consistency and seamless loop continuity across progress 1 -> 0', () => {
      const eps = 1e-4;
      for (const p of [0.05, 0.23, 0.35, 0.47, 0.64, 0.76, 0.9]) {
        const prev = evaluateBreachState(p - eps);
        const curr = evaluateBreachState(p);
        const next = evaluateBreachState(p + eps);
        const dt = 2 * eps * BREACH_CYCLE_DURATION;

        expect(curr.velocity.x).toBeCloseTo((next.position.x - prev.position.x) / dt, 2);
        expect(curr.velocity.y).toBeCloseTo((next.position.y - prev.position.y) / dt, 2);
        expect(curr.velocity.z).toBeCloseTo((next.position.z - prev.position.z) / dt, 2);
      }

      // Loop seam check between 0.9999 and 0.0001
      const beforeWrap = evaluateBreachState(0.9999);
      const afterWrap = evaluateBreachState(0.0001);

      expect(beforeWrap.position.x).toBeCloseTo(afterWrap.position.x, 1);
      expect(beforeWrap.position.y).toBeCloseTo(afterWrap.position.y, 1);
      expect(beforeWrap.position.z).toBeCloseTo(afterWrap.position.z, 1);
      expect(beforeWrap.velocity.x).toBeCloseTo(afterWrap.velocity.x, 1);
      expect(beforeWrap.velocity.y).toBeCloseTo(afterWrap.velocity.y, 1);
      expect(beforeWrap.velocity.z).toBeCloseTo(afterWrap.velocity.z, 1);
      expect(beforeWrap.rotation.pitch).toBeCloseTo(afterWrap.rotation.pitch, 2);
      expect(beforeWrap.rotation.yaw).toBeCloseTo(afterWrap.rotation.yaw, 2);
      // Roll completes 2*PI -> equivalent to 0 rad
      expect(beforeWrap.rotation.roll).toBeCloseTo(Math.PI * 2, 2);
      expect(Math.cos(beforeWrap.rotation.roll)).toBeCloseTo(
        Math.cos(afterWrap.rotation.roll),
        4,
      );
      expect(Math.sin(beforeWrap.rotation.roll)).toBeCloseTo(
        Math.sin(afterWrap.rotation.roll),
        3,
      );
      expect(Math.sin(beforeWrap.tailBeatPhase)).toBeCloseTo(
        Math.sin(afterWrap.tailBeatPhase),
        1,
      );
      expect(beforeWrap.wetness).toBeCloseTo(afterWrap.wetness, 3);
    });
  });

  describe('createBreachController', () => {
    it('emits breakthrough (0.24) and splashdown (0.67) events with exact contract payloads', () => {
      const controller = createBreachController({ cycleDuration: 9.0, autoLoop: true });
      const collected = [];
      let elapsed = 0;
      const dt = 0.05;

      // Advance one full 9.0s cycle
      for (let i = 0; i < 180; i += 1) {
        elapsed = Number(((i + 1) * dt).toFixed(4));
        const { state, events } = controller.update(dt, elapsed);
        expect(state).toBe(controller.getState());
        collected.push(...events);
      }

      expect(collected).toHaveLength(2);

      const [breakthrough, splashdown] = collected;
      expect(breakthrough.type).toBe('breakthrough');
      expect(breakthrough.strength).toBe(1.2);
      expect(breakthrough.speed).toBe(8.5);
      expect(breakthrough.startTime).toBeCloseTo(0.24 * 9.0, 1);
      expect(Number.isFinite(breakthrough.x)).toBe(true);
      expect(Number.isFinite(breakthrough.z)).toBe(true);

      expect(splashdown.type).toBe('splashdown');
      expect(splashdown.strength).toBe(1.75);
      expect(splashdown.speed).toBe(9.2);
      expect(splashdown.startTime).toBeCloseTo(0.67 * 9.0, 1);
      expect(splashdown.z).toBeGreaterThan(8.0);
    });

    it('supports triggerBreach, pause/resume, timeScale, and autoLoop=false', () => {
      const controller = createBreachController({ cycleDuration: 9.0, autoLoop: false });

      controller.setPaused(true);
      expect(controller.isPaused()).toBe(true);
      const frozen = controller.update(1.0, 1.0);
      expect(frozen.state.progress).toBe(0);
      expect(frozen.events).toEqual([]);

      // triggerBreach resets to 0.13 and unpauses
      controller.triggerBreach();
      expect(controller.isPaused()).toBe(false);
      expect(controller.getState().progress).toBeCloseTo(0.13, 6);

      // Slow-motion 0.25x
      controller.setTimeScale(0.25);
      expect(controller.getTimeScale()).toBe(0.25);
      controller.update(0.9, 2.0); // deltaProgress = (0.9 * 0.25) / 9 = 0.025 -> 0.155
      expect(controller.getState().progress).toBeCloseTo(0.155, 6);

      // Restore 1x and run past end of cycle with autoLoop=false
      controller.setTimeScale(1.0);
      let allEvents = [];
      for (let i = 0; i < 30; i += 1) {
        const { events } = controller.update(0.5, 3.0 + i * 0.5);
        allEvents.push(...events);
      }
      // Should only emit 1 breakthrough + 1 splashdown and NOT loop into a second breach
      expect(allEvents.map((e) => e.type)).toEqual(['breakthrough', 'splashdown']);

      // Enabling autoLoop resumes looping
      controller.setAutoLoop(true);
      const afterReenable = controller.update(3.0, 25.0);
      expect(afterReenable.events.some((e) => e.type === 'breakthrough')).toBe(true);
    });
  });

  describe('BREACH_VARIANTS, blowIntensity & variant cycling', () => {
    it('exports all 4 breach variants with C1-compatible start/end seams and distinct choreographies', () => {
      expect(BREACH_VARIANTS).toEqual([
        'classic',
        'chin-slam',
        'barrel-port',
        'tail-lob',
      ]);

      const eps = 1e-4;
      for (const variant of BREACH_VARIANTS) {
        const s0 = evaluateBreachState(0.0, { variant });
        const beforeWrap = evaluateBreachState(0.9999, { variant });
        const afterWrap = evaluateBreachState(0.0001, { variant });

        expect(s0.variant).toBe(variant);
        expect(s0.position.x).toBeCloseTo(0, 3);
        expect(s0.position.y).toBeCloseTo(-21, 2);
        expect(s0.position.z).toBeCloseTo(-10, 2);
        expect(s0.rotation.pitch).toBeCloseTo(1.05, 2);
        expect(s0.rotation.yaw).toBeCloseTo(0, 3);
        expect(s0.blowIntensity).toBe(0);
        expect(s0.wetness).toBe(1.0);

        // Seamless C1 wrap continuity across 1 -> 0
        expect(beforeWrap.position.x).toBeCloseTo(afterWrap.position.x, 1);
        expect(beforeWrap.position.y).toBeCloseTo(afterWrap.position.y, 1);
        expect(beforeWrap.position.z).toBeCloseTo(afterWrap.position.z, 1);
        expect(beforeWrap.velocity.x).toBeCloseTo(afterWrap.velocity.x, 1);
        expect(beforeWrap.velocity.y).toBeCloseTo(afterWrap.velocity.y, 1);
        expect(beforeWrap.velocity.z).toBeCloseTo(afterWrap.velocity.z, 1);
        expect(Math.cos(beforeWrap.rotation.roll)).toBeCloseTo(
          Math.cos(afterWrap.rotation.roll),
          4
        );
        expect(Math.sin(beforeWrap.rotation.roll)).toBeCloseTo(
          Math.sin(afterWrap.rotation.roll),
          3
        );

        // C1 analytical velocity parity across interior points
        for (const p of [0.1, 0.3, 0.5, 0.7, 0.88]) {
          const prev = evaluateBreachState(p - eps, { variant });
          const curr = evaluateBreachState(p, { variant });
          const next = evaluateBreachState(p + eps, { variant });
          const dt = 2 * eps * BREACH_CYCLE_DURATION;
          expect(curr.velocity.x).toBeCloseTo((next.position.x - prev.position.x) / dt, 2);
          expect(curr.velocity.y).toBeCloseTo((next.position.y - prev.position.y) / dt, 2);
          expect(curr.velocity.z).toBeCloseTo((next.position.z - prev.position.z) / dt, 2);
          expect(curr.blowIntensity).toBeGreaterThanOrEqual(0);
          expect(curr.blowIntensity).toBeLessThanOrEqual(1);
        }
      }

      // Distinct variant choreography checks
      const chinApex = evaluateBreachState(0.46, { variant: 'chin-slam' });
      expect(Math.abs(chinApex.rotation.roll)).toBeLessThan(0.35);
      expect(chinApex.jawOpen).toBeGreaterThan(0.3);
      expect(chinApex.finSpread).toBeGreaterThan(0.95);
      expect(evaluateBreachState(0.60, { variant: 'chin-slam' }).spineArch).toBeLessThan(-0.2);

      const portApex = evaluateBreachState(0.47, { variant: 'barrel-port' });
      expect(portApex.position.x).toBeLessThan(-1.2);
      expect(portApex.rotation.roll).toBeLessThan(-2.5);
      expect(portApex.rotation.yaw).toBeLessThan(-0.15);

      const lobBlow = evaluateBreachState(0.30, { variant: 'tail-lob' });
      expect(lobBlow.blowIntensity).toBeCloseTo(1.0, 2);
      const lobHoist = evaluateBreachState(0.52, { variant: 'tail-lob' });
      expect(lobHoist.rotation.pitch).toBeLessThan(-0.85);
    });

    it('pulses blowIntensity cleanly while the dorsal blowhole is above water in all variants', () => {
      const rig = createWhaleRig();

      for (const variant of BREACH_VARIANTS) {
        let peakBlow = 0;
        let blowholeYAtPeak = -Infinity;
        for (let p = 0; p < 1.0; p += 0.01) {
          const st = evaluateBreachState(p, { variant });
          if (st.blowIntensity > peakBlow) {
            peakBlow = st.blowIntensity;
            rig.update(st, p * BREACH_CYCLE_DURATION);
            blowholeYAtPeak = rig.getWorldAnchors().blowhole.y;
          }
        }
        expect(peakBlow).toBeGreaterThan(0.7);
        expect(blowholeYAtPeak).toBeGreaterThan(1.5);
      }
    });

    it('supports controller.setVariant/getVariant, auto-cycles through all 4 variants across loops, and enriches events', () => {
      const controller = createBreachController({ cycleDuration: 9.0, autoLoop: true });
      expect(controller.getVariant()).toBe('auto');
      expect(controller.getState().variant).toBe('classic');

      const seenCycleVariants = [];
      const allEvents = [];
      const dt = 0.1;
      let t = 0;

      // Advance 5 full 9.0s cycles (450 steps of 0.1s)
      for (let cycle = 0; cycle < 5; cycle += 1) {
        // Sample mid-cycle state at step 40 (4.0s into cycle)
        for (let step = 0; step < 90; step += 1) {
          t = Number((t + dt).toFixed(4));
          const { state, events } = controller.update(dt, t);
          if (step === 40) {
            seenCycleVariants.push(state.variant);
          }
          allEvents.push(...events);
        }
      }

      expect(seenCycleVariants).toEqual([
        'classic',
        'chin-slam',
        'barrel-port',
        'tail-lob',
        'classic',
      ]);

      expect(allEvents).toHaveLength(10);
      for (const ev of allEvents) {
        expect(BREACH_VARIANTS).toContain(ev.variant);
        expect(Number.isFinite(ev.heading)).toBe(true);
        expect(Number.isFinite(ev.roll)).toBe(true);
        expect(Number.isFinite(ev.x)).toBe(true);
        expect(Number.isFinite(ev.z)).toBe(true);
      }

      // Pinning a specific variant locks it across loops
      expect(controller.setVariant('barrel-port')).toBe('barrel-port');
      expect(controller.getVariant()).toBe('barrel-port');
      expect(controller.getState().variant).toBe('barrel-port');

      for (let i = 0; i < 120; i += 1) {
        t = Number((t + dt).toFixed(4));
        controller.update(dt, t);
      }
      expect(controller.getState().variant).toBe('barrel-port');

      // Invalid variant name is safely ignored
      controller.setVariant('unknown-style');
      expect(controller.getVariant()).toBe('barrel-port');

      // Switching back to auto resumes auto mode cleanly
      expect(controller.setVariant('auto')).toBe('auto');
      expect(controller.getVariant()).toBe('auto');
    });
  });
});
