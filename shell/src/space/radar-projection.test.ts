import { describe, it, expect } from 'vitest';
import { bearingToDisc } from './radar-projection';

describe('bearingToDisc', () => {
  it('un blip dentro del rango queda onDisc=true', () => {
    const r = bearingToDisc(100, 0, 0, 1000, 80);
    expect(r.onDisc).toBe(true);
  });

  it('escala la distancia linealmente respecto al rango', () => {
    // A la mitad del rango debe quedar a la mitad del radio del disco.
    const half = bearingToDisc(500, 0, 0, 1000, 80);
    const full = bearingToDisc(1000, 0, 0, 1000, 80);
    const dHalf = Math.hypot(half.x, half.y);
    const dFull = Math.hypot(full.x, full.y);
    expect(dHalf).toBeCloseTo(40, 5);
    expect(dFull).toBeCloseTo(80, 5);
  });

  it('un blip más lejano que el rango se fija al borde con onDisc=false', () => {
    const r = bearingToDisc(5000, 0, 0, 1000, 80);
    expect(r.onDisc).toBe(false);
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(80, 5);
  });

  it('rota el rumbo por yaw: con yaw=0, +X mapea al eje x del disco', () => {
    const r = bearingToDisc(1000, 0, 0, 1000, 80);
    expect(r.x).toBeCloseTo(80, 5);
    expect(r.y).toBeCloseTo(0, 5);
  });

  it('rota el rumbo por yaw: girar yaw +90° rota el punto -90° en pantalla', () => {
    // angle = atan2(0, 1000) - yaw = 0 - PI/2 = -PI/2
    const r = bearingToDisc(1000, 0, Math.PI / 2, 1000, 80);
    expect(r.x).toBeCloseTo(0, 5);
    expect(r.y).toBeCloseTo(-80, 5);
  });

  it('un blip prácticamente en el centro no genera NaN', () => {
    const r = bearingToDisc(0, 0, 0, 1000, 80);
    expect(Number.isNaN(r.x)).toBe(false);
    expect(Number.isNaN(r.y)).toBe(false);
    expect(r.onDisc).toBe(true);
  });
});
