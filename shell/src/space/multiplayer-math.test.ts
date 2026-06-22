import { describe, it, expect } from 'vitest';
import { shouldSendState } from './multiplayer-math';

describe('shouldSendState', () => {
  it('permite enviar la primera vez (last = 0) si ya pasó el intervalo', () => {
    expect(shouldSendState(50, 0, 50)).toBe(true);
  });

  it('bloquea si no ha pasado el intervalo completo', () => {
    expect(shouldSendState(149, 100, 50)).toBe(false);
  });

  it('permite justo al cumplirse el intervalo (>=)', () => {
    expect(shouldSendState(150, 100, 50)).toBe(true);
  });

  it('permite muy por encima del intervalo', () => {
    expect(shouldSendState(1000, 100, 50)).toBe(true);
  });

  it('intervalo de 50ms ≈ 20Hz: a 49ms bloquea, a 50ms pasa', () => {
    expect(shouldSendState(149.9, 100, 50)).toBe(false);
    expect(shouldSendState(150.0, 100, 50)).toBe(true);
  });

  it('now anterior a last (reloj raro) no envía', () => {
    expect(shouldSendState(90, 100, 50)).toBe(false);
  });
});

import { lerpState } from './multiplayer-math';

describe('lerpState', () => {
  const A = { x: 0, y: 0, z: 0, yaw: 0 };
  const B = { x: 10, y: 20, z: -30, yaw: 1 };

  it('t=0 devuelve el estado origen', () => {
    expect(lerpState(A, B, 0)).toEqual({ x: 0, y: 0, z: 0, yaw: 0 });
  });

  it('t=1 devuelve el estado destino', () => {
    expect(lerpState(A, B, 1)).toEqual({ x: 10, y: 20, z: -30, yaw: 1 });
  });

  it('t=0.5 interpola la posición a la mitad', () => {
    const r = lerpState(A, B, 0.5);
    expect(r.x).toBeCloseTo(5, 10);
    expect(r.y).toBeCloseTo(10, 10);
    expect(r.z).toBeCloseTo(-15, 10);
  });

  it('hace clamp de t por debajo de 0', () => {
    expect(lerpState(A, B, -2)).toEqual({ x: 0, y: 0, z: 0, yaw: 0 });
  });

  it('hace clamp de t por encima de 1', () => {
    expect(lerpState(A, B, 5)).toEqual({ x: 10, y: 20, z: -30, yaw: 1 });
  });

  it('yaw: toma el arco más corto cruzando ±π (de 3.0 a -3.0 va hacia arriba, no da la vuelta)', () => {
    // diff "ingenuo" = -6.0 (vuelta larga). Arco corto = +0.283 (cruza π).
    const r = lerpState({ x: 0, y: 0, z: 0, yaw: 3.0 }, { x: 0, y: 0, z: 0, yaw: -3.0 }, 0.5);
    // El resultado debe estar cerca de ±π (el punto medio del arco corto), no cerca de 0.
    expect(Math.abs(r.yaw)).toBeGreaterThan(3.0);
  });

  it('yaw: interpolación normal sin cruce de wrap', () => {
    const r = lerpState({ x: 0, y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: 0, yaw: 1 }, 0.5);
    expect(r.yaw).toBeCloseTo(0.5, 10);
  });
});
