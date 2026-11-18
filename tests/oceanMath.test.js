import { describe, expect, it } from 'vitest';
import {
  WAVE_COMPONENTS,
  evaluateGerstnerWaves,
  evaluateWaterDome,
  evaluateShockwaveRipples,
  evaluateOceanHeight,
} from '../src/math/oceanMath.js';

describe('oceanMath', () => {
  describe('WAVE_COMPONENTS & evaluateGerstnerWaves', () => {
    it('exports 6 normalized multi-octave WAVE_COMPONENTS without loop-over steepness', () => {
      expect(Array.isArray(WAVE_COMPONENTS)).toBe(true);
      expect(WAVE_COMPONENTS).toHaveLength(6);

      let totalSteepnessFactor = 0;
      for (const w of WAVE_COMPONENTS) {
        expect(Number.isFinite(w.dirX)).toBe(true);
        expect(Number.isFinite(w.dirZ)).toBe(true);
        expect(Math.hypot(w.dirX, w.dirZ)).toBeCloseTo(1.0, 6);
        expect(w.wavelength).toBeGreaterThan(0);
        expect(w.amplitude).toBeGreaterThan(0);
        expect(w.speed).toBeGreaterThan(0);
        expect(w.steepness).toBeGreaterThan(0);

        const k = (2 * Math.PI) / w.wavelength;
        totalSteepnessFactor += k * w.steepness * w.amplitude;
      }

      expect(totalSteepnessFactor).toBeLessThan(1.0);
      expect(WAVE_COMPONENTS[0].wavelength).toBeCloseTo(42, 0);
      expect(WAVE_COMPONENTS[1].wavelength).toBeCloseTo(27, 0);
      expect(WAVE_COMPONENTS[2].wavelength).toBeCloseTo(16.5, 1);
      expect(WAVE_COMPONENTS[3].wavelength).toBeCloseTo(10.2, 1);
      expect(WAVE_COMPONENTS[4].wavelength).toBeCloseTo(6.1, 1);
      expect(WAVE_COMPONENTS[5].wavelength).toBeCloseTo(3.7, 1);

      expect(WAVE_COMPONENTS[0].amplitude).toBeCloseTo(0.48, 2);
      expect(WAVE_COMPONENTS[5].amplitude).toBeCloseTo(0.045, 3);
    });

    it('evaluates Gerstner wave displacement matching exact GLSL formula', () => {
      const x = 12.5;
      const z = -7.25;
      const time = 3.4;

      let expectedDx = 0;
      let expectedDy = 0;
      let expectedDz = 0;
      for (const w of WAVE_COMPONENTS) {
        const k = (2 * Math.PI) / w.wavelength;
        const phase = k * (w.dirX * x + w.dirZ * z - w.speed * time);
        expectedDx += w.dirX * (w.steepness * w.amplitude) * Math.cos(phase);
        expectedDz += w.dirZ * (w.steepness * w.amplitude) * Math.cos(phase);
        expectedDy += w.amplitude * Math.sin(phase);
      }

      const actual = evaluateGerstnerWaves(x, z, time);
      expect(actual.dx).toBeCloseTo(expectedDx, 10);
      expect(actual.dy).toBeCloseTo(expectedDy, 10);
      expect(actual.dz).toBeCloseTo(expectedDz, 10);
    });
  });

  describe('evaluateWaterDome', () => {
    it('returns 0 for missing, zero-height, or zero-radius domes', () => {
      expect(evaluateWaterDome(0, 0, null)).toBe(0);
      expect(evaluateWaterDome(0, 0, undefined)).toBe(0);
      expect(evaluateWaterDome(0, 0, { x: 0, z: 0, radius: 4.8, height: 0 })).toBe(0);
      expect(evaluateWaterDome(0, 0, { x: 0, z: 0, radius: 4.8, height: -1 })).toBe(0);
      expect(evaluateWaterDome(0, 0, { x: 0, z: 0, radius: 0, height: 1.85 })).toBe(0);
    });

    it('produces smooth Gaussian swelling inside 3*radius and 0 at/beyond 3*radius', () => {
      const dome = { x: 1.5, z: -2.0, radius: 4.8, height: 1.85 };

      // Peak at dome center
      expect(evaluateWaterDome(1.5, -2.0, dome)).toBeCloseTo(1.85, 6);

      // 1-sigma Gaussian falloff
      expect(evaluateWaterDome(1.5 + 4.8, -2.0, dome)).toBeCloseTo(
        1.85 * Math.exp(-1),
        4,
      );

      // Monotonically decreasing and smoothly vanishing at 3 * radius
      const nearBoundary = evaluateWaterDome(1.5 + 4.8 * 2.95, -2.0, dome);
      expect(nearBoundary).toBeGreaterThan(0);
      expect(nearBoundary).toBeLessThan(1e-4);

      expect(evaluateWaterDome(1.5 + 4.8 * 3.0, -2.0, dome)).toBe(0);
      expect(evaluateWaterDome(1.5 + 20.0, -2.0, dome)).toBe(0);
    });
  });

  describe('evaluateShockwaveRipples', () => {
    it('returns 0 when empty, before startTime, or after age >= 8.5s', () => {
      expect(evaluateShockwaveRipples(3, 4, 2.0)).toBe(0);
      expect(evaluateShockwaveRipples(3, 4, 2.0, [])).toBe(0);

      const ripple = { x: 0, z: 0, startTime: 5.0, strength: 1.2, speed: 8.5 };
      expect(evaluateShockwaveRipples(0, 0, 4.5, [ripple])).toBe(0);
      expect(evaluateShockwaveRipples(0, 0, 5.0, [ripple])).toBe(0);
      expect(evaluateShockwaveRipples(20, 0, 5.0 + 8.5, [ripple])).toBe(0);
      expect(evaluateShockwaveRipples(20, 0, 15.0, [ripple])).toBe(0);
    });

    it('produces an expanding damped cosine wave packet localized around front = age * speed', () => {
      const ripple = { x: 2.0, z: -1.0, startTime: 1.0, strength: 1.2, speed: 8.5 };
      const time = 2.5; // age = 1.5s -> front = 12.75m
      const front = 1.5 * 8.5;

      // Positive wave crest at the expanding front
      const atFront = evaluateShockwaveRipples(2.0 + front, -1.0, time, [ripple]);
      expect(atFront).toBeGreaterThan(0.05);

      // Zero well ahead of the wavefront
      const wellAhead = evaluateShockwaveRipples(2.0 + front + 6.0, -1.0, time, [ripple]);
      expect(wellAhead).toBe(0);

      // Oscillatory cosine packet has a negative trough behind the leading crest
      let minBehind = Infinity;
      for (let offset = 0.2; offset <= 4.0; offset += 0.2) {
        const h = evaluateShockwaveRipples(2.0 + front - offset, -1.0, time, [ripple]);
        if (h < minBehind) minBehind = h;
      }
      expect(minBehind).toBeLessThan(-0.02);

      // Damps over age as the ring expands toward 8.5s
      const lateAge = 6.5; // time = 7.5s
      const lateFront = lateAge * 8.5;
      const lateCrest = evaluateShockwaveRipples(2.0 + lateFront, -1.0, 1.0 + lateAge, [
        ripple,
      ]);
      expect(lateCrest).toBeGreaterThan(0);
      expect(lateCrest).toBeLessThan(atFront);

      // Scales linearly with strength and superposes multiple ripples
      const stronger = { ...ripple, strength: 2.4 };
      expect(evaluateShockwaveRipples(2.0 + front, -1.0, time, [stronger])).toBeCloseTo(
        atFront * 2,
        6,
      );
      expect(
        evaluateShockwaveRipples(2.0 + front, -1.0, time, [ripple, stronger]),
      ).toBeCloseTo(atFront * 3, 6);
    });
  });

  describe('evaluateOceanHeight', () => {
    it('sums Gerstner dy, water dome, and shockwave ripples cleanly', () => {
      const x = 1.2;
      const z = -0.8;
      const time = 3.2;
      const dome = { x: 0, z: 0, radius: 4.8, height: 1.6 };
      const ripples = [{ x: 0, z: 0, startTime: 2.9, strength: 1.2, speed: 8.5 }];

      expect(evaluateOceanHeight(x, z, time)).toBeCloseTo(
        evaluateGerstnerWaves(x, z, time).dy,
        10,
      );

      const expected =
        evaluateGerstnerWaves(x, z, time).dy +
        evaluateWaterDome(x, z, dome) +
        evaluateShockwaveRipples(x, z, time, ripples);

      expect(evaluateOceanHeight(x, z, time, { dome, ripples })).toBeCloseTo(
        expected,
        10,
      );
    });
  });
});
