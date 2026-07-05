/**
 * Máquina de estados pura de la carrera (Hito 5): checkpoint/vuelta/respawn.
 * Mismo patrón que orbit.ts. Sin Three.js.
 */

export type RacePhase = 'idle' | 'racing' | 'finished';

export interface RaceState {
  phase: RacePhase;
  currentCheckpoint: number;
  lap: number;
  offTrackSeconds: number;
}

export interface RaceInput {
  /** Distancia de la nave al segmento de circuito más cercano (race-math.ts). */
  distanceToNearestSegment: number;
  /** true si la nave entró en el radio del checkpoint actual este frame. */
  reachedCheckpoint: boolean;
  dt: number;
}

export interface RaceParams {
  totalCheckpoints: number;
  totalLaps: number;
  offTrackToleranceDistance: number;
  offTrackRespawnSeconds: number;
}

export type RaceAction = 'none' | 'checkpoint' | 'lap' | 'finish' | 'respawn';

export interface RaceStepResult {
  state: RaceState;
  action: RaceAction;
}

export function startRace(): RaceState {
  return { phase: 'racing', currentCheckpoint: 0, lap: 0, offTrackSeconds: 0 };
}

/**
 * Avanza un frame:
 * - `reachedCheckpoint` SIEMPRE se procesa primero (si alcanzaste un
 *   checkpoint, por definición estás sobre la pista en ese instante —
 *   resetea offTrackSeconds sin importar el valor previo).
 * - Si no, se evalúa fuera-de-pista: acumula `offTrackSeconds`; al superar
 *   `offTrackRespawnSeconds`, dispara `respawn` (conserva `currentCheckpoint`:
 *   vuelves al ÚLTIMO checkpoint validado, no al inicio del circuito).
 */
export function stepRace(prev: RaceState, input: RaceInput, params: RaceParams): RaceStepResult {
  if (prev.phase !== 'racing') return { state: prev, action: 'none' };

  if (input.reachedCheckpoint) {
    const nextCheckpoint = prev.currentCheckpoint + 1;
    if (nextCheckpoint >= params.totalCheckpoints) {
      const nextLap = prev.lap + 1;
      if (nextLap >= params.totalLaps) {
        return { state: { ...prev, phase: 'finished', offTrackSeconds: 0 }, action: 'finish' };
      }
      return { state: { phase: 'racing', currentCheckpoint: 0, lap: nextLap, offTrackSeconds: 0 }, action: 'lap' };
    }
    return { state: { ...prev, currentCheckpoint: nextCheckpoint, offTrackSeconds: 0 }, action: 'checkpoint' };
  }

  const offTrack = input.distanceToNearestSegment > params.offTrackToleranceDistance;
  const offTrackSeconds = offTrack ? prev.offTrackSeconds + input.dt : 0;
  if (offTrackSeconds >= params.offTrackRespawnSeconds) {
    return { state: { ...prev, offTrackSeconds: 0 }, action: 'respawn' };
  }

  return { state: { ...prev, offTrackSeconds }, action: 'none' };
}
