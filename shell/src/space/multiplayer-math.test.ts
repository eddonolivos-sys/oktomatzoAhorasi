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

import { lerpStateInto } from './multiplayer-math';

describe('lerpStateInto (mutación in-place, sin alocar)', () => {
  const mk = () => ({ x: 0, y: 0, z: 0, yaw: 0 });
  const B = { x: 10, y: 20, z: -30, yaw: 1 };

  it('t=0 deja el target en el estado origen', () => {
    const target = mk();
    lerpStateInto(target, B, 0);
    expect(target).toEqual({ x: 0, y: 0, z: 0, yaw: 0 });
  });

  it('t=1 deja el target en el estado destino', () => {
    const target = mk();
    lerpStateInto(target, B, 1);
    expect(target).toEqual({ x: 10, y: 20, z: -30, yaw: 1 });
  });

  it('muta el MISMO objeto (no aloca uno nuevo)', () => {
    const target = mk();
    const ret = lerpStateInto(target, B, 0.5);
    // El target original quedó modificado in-place.
    expect(target.x).toBeCloseTo(5, 10);
    // Si devuelve algo, es el mismo objeto (identidad).
    if (ret !== undefined) expect(ret).toBe(target);
  });

  it('t=0.5 interpola la posición a la mitad sobre el target', () => {
    const target = mk();
    lerpStateInto(target, B, 0.5);
    expect(target.x).toBeCloseTo(5, 10);
    expect(target.y).toBeCloseTo(10, 10);
    expect(target.z).toBeCloseTo(-15, 10);
  });

  it('hace clamp de t por debajo de 0', () => {
    const target = mk();
    lerpStateInto(target, B, -2);
    expect(target).toEqual({ x: 0, y: 0, z: 0, yaw: 0 });
  });

  it('hace clamp de t por encima de 1', () => {
    const target = mk();
    lerpStateInto(target, B, 5);
    expect(target).toEqual({ x: 10, y: 20, z: -30, yaw: 1 });
  });

  it('yaw: toma el arco más corto cruzando ±π (de 3.0 a -3.0 va hacia arriba)', () => {
    const target = { x: 0, y: 0, z: 0, yaw: 3.0 };
    lerpStateInto(target, { x: 0, y: 0, z: 0, yaw: -3.0 }, 0.5);
    expect(Math.abs(target.yaw)).toBeGreaterThan(3.0);
  });

  it('yaw: interpolación normal sin cruce de wrap', () => {
    const target = { x: 0, y: 0, z: 0, yaw: 0 };
    lerpStateInto(target, { x: 0, y: 0, z: 0, yaw: 1 }, 0.5);
    expect(target.yaw).toBeCloseTo(0.5, 10);
  });
});

import { toAbsolute, toScene } from './multiplayer-math';

describe('toAbsolute / toScene (conversión worldOffset)', () => {
  const offset = { x: 1000, y: -50, z: 2500 };

  it('toAbsolute suma el worldOffset a la posición de escena', () => {
    expect(toAbsolute({ x: 10, y: 5, z: -20 }, offset)).toEqual({ x: 1010, y: -45, z: 2480 });
  });

  it('toScene resta el worldOffset a la posición absoluta', () => {
    expect(toScene({ x: 1010, y: -45, z: 2480 }, offset)).toEqual({ x: 10, y: 5, z: -20 });
  });

  it('round-trip: toScene(toAbsolute(p)) === p', () => {
    const p = { x: 123.5, y: -7.25, z: 42 };
    const back = toScene(toAbsolute(p, offset), offset);
    expect(back.x).toBeCloseTo(p.x, 10);
    expect(back.y).toBeCloseTo(p.y, 10);
    expect(back.z).toBeCloseTo(p.z, 10);
  });

  it('offset cero es identidad', () => {
    const zero = { x: 0, y: 0, z: 0 };
    expect(toAbsolute({ x: 3, y: 4, z: 5 }, zero)).toEqual({ x: 3, y: 4, z: 5 });
    expect(toScene({ x: 3, y: 4, z: 5 }, zero)).toEqual({ x: 3, y: 4, z: 5 });
  });
});

import { rttEwma } from './multiplayer-math';

describe('rttEwma', () => {
  it('primera muestra (prevEwma=null) arranca en el valor crudo, sin sesgo', () => {
    expect(rttEwma(null, 80, 0.2)).toBe(80);
  });

  it('se mueve hacia la nueva muestra proporcionalmente a alpha', () => {
    // prev=100, sample=200, alpha=0.5 → punto medio exacto.
    expect(rttEwma(100, 200, 0.5)).toBeCloseTo(150, 10);
  });

  it('alpha bajo suaviza mucho (poco movimiento por muestra)', () => {
    const r = rttEwma(100, 200, 0.1);
    expect(r).toBeCloseTo(110, 10);
  });

  it('alpha=1 salta directo a la muestra nueva (sin suavizado)', () => {
    expect(rttEwma(100, 200, 1)).toBeCloseTo(200, 10);
  });

  it('converge hacia una señal constante tras varias muestras', () => {
    let ewma: number | null = null;
    for (let i = 0; i < 50; i++) ewma = rttEwma(ewma, 60, 0.2);
    expect(ewma).toBeCloseTo(60, 6);
  });

  it('una muestra estable no cambia la EWMA', () => {
    expect(rttEwma(75, 75, 0.3)).toBe(75);
  });
});

import { emoteWheelSector } from './multiplayer-math';

describe('emoteWheelSector', () => {
  it('centro muerto (cerca del centro) → null', () => {
    expect(emoteWheelSector(0, 0)).toBe(null);
    expect(emoteWheelSector(0.05, -0.05)).toBe(null); // magnitud < 0.2 (dead zone)
  });

  it('arriba (feliz) → sector 0', () => {
    expect(emoteWheelSector(0, -1)).toBe(0); // recto arriba
  });

  it('abajo-derecha (triste) → sector 1', () => {
    expect(emoteWheelSector(0.8, 0.6)).toBe(1);
  });

  it('abajo-izquierda (enojada) → sector 2', () => {
    expect(emoteWheelSector(-0.8, 0.6)).toBe(2);
  });

  it('los tres sectores cubren el círculo sin solaparse (12 muestras → 0|1|2, nunca null fuera del centro)', () => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const s = emoteWheelSector(Math.cos(a), Math.sin(a));
      expect([0, 1, 2]).toContain(s);
    }
  });
});
