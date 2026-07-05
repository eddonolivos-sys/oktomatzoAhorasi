/**
 * Generación determinista del circuito de la pista de carreras (Hito 5).
 * Sin Three.js. PRNG sembrado (mulberry32): misma semilla → mismo circuito.
 */
import type { V3 } from './vec3-math';

export type { V3 };

export interface TrackParams {
  checkpointCount: number;
  baseRadius: number;
  /** Fracción de baseRadius que puede variar el radio de cada checkpoint (0..1). */
  radiusJitter: number;
  /** Variación máxima de altura por checkpoint (unidades, ± la mitad). */
  heightJitter: number;
}

export interface RaceTrack {
  /** Waypoints LOCALES al centro de la zona (el motor suma RACE_CONFIG.center). */
  waypoints: V3[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Circuito cerrado: `checkpointCount` waypoints repartidos en ángulo uniforme
 * alrededor del origen local, con radio y altura perturbados de forma
 * determinista por la semilla. El circuito se cierra implícitamente de
 * waypoints[n-1] a waypoints[0] (lo consume race-math.ts).
 */
export function generateTrack(seed: number, params: TrackParams): RaceTrack {
  const rand = mulberry32(seed);
  const waypoints: V3[] = [];
  for (let i = 0; i < params.checkpointCount; i++) {
    const angle = (i / params.checkpointCount) * Math.PI * 2;
    const radius = params.baseRadius * (1 + (rand() - 0.5) * params.radiusJitter);
    const height = (rand() - 0.5) * params.heightJitter;
    waypoints.push({
      x: Math.cos(angle) * radius,
      y: height,
      z: Math.sin(angle) * radius,
    });
  }
  return { waypoints };
}
