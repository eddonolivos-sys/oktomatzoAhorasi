/**
 * Geometría pura de la cámara en órbita (S4): durante la órbita, la cámara
 * encuadra el PLANETA con el SOL al fondo (composición a contraluz),
 * estable, sin perseguir a la nave. Sin Three.js.
 */
import { type V3, sub, add, scale, normalize } from './vec3-math';
import { orbitPlaneNormal } from './orbit-frame';

export interface OrbitCameraParams {
  /** Distancia cámara↔planeta, como múltiplo de `planetRadius`. */
  distanceFactor: number;
  /** Desplazamiento del target hacia el sol (fracción de `planetRadius`), para dejar aire en el encuadre. */
  targetSunBias: number;
}

export interface CameraPose {
  position: V3;
  target: V3;
  up: V3;
}

/**
 * Pose de cámara en órbita: se posiciona en el lado del planeta OPUESTO al
 * sol (a `planetRadius * distanceFactor` del centro) y mira hacia el planeta
 * con un pequeño desplazamiento del target hacia el sol — así el sol queda
 * "al fondo" del encuadre, detrás/alrededor del planeta (contraluz).
 */
export function orbitCameraPose(args: {
  center: V3;
  sun: V3;
  planetRadius: number;
  params: OrbitCameraParams;
}): CameraPose {
  const { center, sun, planetRadius, params } = args;
  const sunDir = normalize(sub(sun, center)); // planeta → sol
  const back = scale(sunDir, -1); // se aleja del sol: la cámara queda del lado opuesto
  const dist = planetRadius * params.distanceFactor;
  const position = add(center, scale(back, dist));
  const target = add(center, scale(sunDir, planetRadius * params.targetSunBias));
  const up = orbitPlaneNormal(sunDir);
  return { position, target, up };
}
