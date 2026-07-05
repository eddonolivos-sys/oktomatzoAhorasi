import { describe, it, expect } from 'vitest';
import { startRace, stepRace, type RaceState } from './race-state';

const PARAMS = { totalCheckpoints: 4, totalLaps: 2, offTrackToleranceDistance: 450, offTrackRespawnSeconds: 4 };
const baseInput = { distanceToNearestSegment: 0, reachedCheckpoint: false, dt: 0.1 };

describe('startRace', () => {
  it('produce el estado inicial de carrera', () => {
    expect(startRace()).toEqual({ phase: 'racing', currentCheckpoint: 0, lap: 0, offTrackSeconds: 0 });
  });
});

describe('stepRace', () => {
  it('fuera de fase racing no hace nada', () => {
    const idle: RaceState = { phase: 'idle', currentCheckpoint: 0, lap: 0, offTrackSeconds: 0 };
    const r = stepRace(idle, { ...baseInput, reachedCheckpoint: true }, PARAMS);
    expect(r.action).toBe('none');
    expect(r.state).toEqual(idle);
  });

  it('alcanzar un checkpoint intermedio avanza currentCheckpoint y resetea offTrackSeconds', () => {
    const state = startRace();
    const r = stepRace({ ...state, offTrackSeconds: 1 }, { ...baseInput, reachedCheckpoint: true }, PARAMS);
    expect(r.action).toBe('checkpoint');
    expect(r.state.currentCheckpoint).toBe(1);
    expect(r.state.offTrackSeconds).toBe(0);
  });

  it('completar el último checkpoint de una vuelta (no la última) avanza de vuelta y reinicia currentCheckpoint', () => {
    const state: RaceState = { phase: 'racing', currentCheckpoint: 3, lap: 0, offTrackSeconds: 0 };
    const r = stepRace(state, { ...baseInput, reachedCheckpoint: true }, PARAMS);
    expect(r.action).toBe('lap');
    expect(r.state).toEqual({ phase: 'racing', currentCheckpoint: 0, lap: 1, offTrackSeconds: 0 });
  });

  it('completar la última vuelta termina la carrera', () => {
    const state: RaceState = { phase: 'racing', currentCheckpoint: 3, lap: 1, offTrackSeconds: 0 };
    const r = stepRace(state, { ...baseInput, reachedCheckpoint: true }, PARAMS);
    expect(r.action).toBe('finish');
    expect(r.state.phase).toBe('finished');
  });

  it('fuera de tolerancia acumula offTrackSeconds', () => {
    const state = startRace();
    const r = stepRace(state, { ...baseInput, distanceToNearestSegment: 500, dt: 0.5 }, PARAMS);
    expect(r.action).toBe('none');
    expect(r.state.offTrackSeconds).toBeCloseTo(0.5, 10);
  });

  it('dentro de tolerancia NO acumula (se resetea)', () => {
    const state: RaceState = { phase: 'racing', currentCheckpoint: 0, lap: 0, offTrackSeconds: 2 };
    const r = stepRace(state, { ...baseInput, distanceToNearestSegment: 100 }, PARAMS);
    expect(r.state.offTrackSeconds).toBe(0);
  });

  it('superar offTrackRespawnSeconds dispara respawn, resetea el contador y CONSERVA currentCheckpoint', () => {
    const state: RaceState = { phase: 'racing', currentCheckpoint: 2, lap: 0, offTrackSeconds: 3.95 };
    const r = stepRace(state, { ...baseInput, distanceToNearestSegment: 500, dt: 0.1 }, PARAMS);
    expect(r.action).toBe('respawn');
    expect(r.state.offTrackSeconds).toBe(0);
    expect(r.state.currentCheckpoint).toBe(2);
  });

  it('reachedCheckpoint tiene prioridad sobre el respawn por fuera-de-pista en el mismo frame', () => {
    const state: RaceState = { phase: 'racing', currentCheckpoint: 0, lap: 0, offTrackSeconds: 3.99 };
    const r = stepRace(
      state,
      { ...baseInput, distanceToNearestSegment: 500, reachedCheckpoint: true, dt: 0.1 },
      PARAMS,
    );
    expect(r.action).toBe('checkpoint');
  });
});
