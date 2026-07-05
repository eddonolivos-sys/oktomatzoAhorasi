import { describe, it, expect } from 'vitest';
import { generateTrack } from './race-track';

const PARAMS = { checkpointCount: 10, baseRadius: 2200, radiusJitter: 0.4, heightJitter: 600 };

describe('generateTrack (Hito 5 — circuito determinista por semilla)', () => {
  it('la misma semilla produce siempre el mismo circuito', () => {
    expect(generateTrack(42, PARAMS)).toEqual(generateTrack(42, PARAMS));
  });

  it('semillas distintas producen circuitos distintos', () => {
    expect(generateTrack(1, PARAMS)).not.toEqual(generateTrack(2, PARAMS));
  });

  it('genera exactamente checkpointCount waypoints', () => {
    expect(generateTrack(7, PARAMS).waypoints).toHaveLength(10);
  });

  it('todos los waypoints quedan dentro de baseRadius*(1+radiusJitter) en XZ', () => {
    const track = generateTrack(7, PARAMS);
    const maxRadius = PARAMS.baseRadius * (1 + PARAMS.radiusJitter);
    for (const wp of track.waypoints) {
      expect(Math.hypot(wp.x, wp.z)).toBeLessThanOrEqual(maxRadius + 1e-6);
    }
  });

  it('todas las alturas quedan dentro de ±heightJitter/2', () => {
    const track = generateTrack(7, PARAMS);
    for (const wp of track.waypoints) {
      expect(Math.abs(wp.y)).toBeLessThanOrEqual(PARAMS.heightJitter / 2 + 1e-6);
    }
  });

  it('con checkpointCount=1 no revienta (caso degenerado)', () => {
    expect(generateTrack(1, { ...PARAMS, checkpointCount: 1 }).waypoints).toHaveLength(1);
  });
});
