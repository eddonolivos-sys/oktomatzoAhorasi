import { describe, it, expect } from 'vitest';
import { orbitCameraPose, type OrbitCameraParams } from './orbit-camera';
import { sub, dot, length } from './vec3-math';

const PARAMS: OrbitCameraParams = { distanceFactor: 5, targetSunBias: 0.4 };

describe('orbitCameraPose (S4 — composición planeta+sol en órbita)', () => {
  const center = { x: 1000, y: 0, z: 0 };
  const sun = { x: 0, y: 0, z: 0 };
  const planetRadius = 200;

  it('el sol queda en el semiespacio del FONDO respecto a la cámara (composición a contraluz)', () => {
    const pose = orbitCameraPose({ center, sun, planetRadius, params: PARAMS });
    const toSun = sub(sun, pose.position);
    const toTarget = sub(pose.target, pose.position);
    expect(dot(toSun, toTarget)).toBeGreaterThan(0);
  });

  it('la distancia cámara↔planeta es proporcional a planetRadius', () => {
    const poseSmall = orbitCameraPose({ center, sun, planetRadius: 100, params: PARAMS });
    const poseBig = orbitCameraPose({ center, sun, planetRadius: 400, params: PARAMS });
    const distSmall = length(sub(poseSmall.position, center));
    const distBig = length(sub(poseBig.position, center));
    expect(distBig).toBeCloseTo(distSmall * 4, 4);
  });

  it('el target está cerca del centro del planeta (a lo sumo unos pocos radios)', () => {
    const pose = orbitCameraPose({ center, sun, planetRadius, params: PARAMS });
    expect(length(sub(pose.target, center))).toBeLessThan(planetRadius * 2);
  });

  it('es determinista: misma entrada, misma salida', () => {
    const a = orbitCameraPose({ center, sun, planetRadius, params: PARAMS });
    const b = orbitCameraPose({ center, sun, planetRadius, params: PARAMS });
    expect(a).toEqual(b);
  });

  it('"up" es unitario y perpendicular a la dirección planeta→sol', () => {
    const pose = orbitCameraPose({ center, sun, planetRadius, params: PARAMS });
    const sunDir = sub(sun, center);
    expect(length(pose.up)).toBeCloseTo(1, 6);
    expect(dot(pose.up, sunDir)).toBeCloseTo(0, 3);
  });

  it('no produce NaN en un caso con el sol muy lejos en otro eje', () => {
    const pose = orbitCameraPose({
      center: { x: 0, y: 0, z: 0 },
      sun: { x: 0, y: 90000, z: 0 },
      planetRadius: 150,
      params: PARAMS,
    });
    for (const v of [pose.position, pose.target, pose.up]) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).toBe(true);
    }
  });
});
