import { describe, it, expect } from 'vitest';
import { bearingToDisc, elevationStalk } from './radar-projection';

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

  it('con yaw=0 (proa hacia -Z): +X (estribor) mapea a la derecha del disco', () => {
    // A yaw=0 la proa es -Z; un blip en +X está a estribor → derecha (x>0, y≈0).
    const r = bearingToDisc(1000, 0, 0, 1000, 80);
    expect(r.x).toBeCloseTo(80, 5);
    expect(r.y).toBeCloseTo(0, 5);
  });

  it('con yaw=0, un blip de frente (-Z) mapea ARRIBA del disco', () => {
    // Convención del motor: a yaw=0 forward=-Z. relZ<0 debe ir arriba (y<0).
    const r = bearingToDisc(0, -1000, 0, 1000, 80);
    expect(r.x).toBeCloseTo(0, 5);
    expect(r.y).toBeCloseTo(-80, 5);
  });

  // ── Estabilización al rumbo: la PROA siempre queda arriba para cualquier yaw ──
  // forward en XZ = (-sin(yaw), -cos(yaw)); un blip en esa dirección debe ir
  // ARRIBA en pantalla (x≈centro, y<centro) sin importar el yaw. Bloquea la
  // regresión del bug (restar solo `yaw` solo acertaba a 0°/180°).
  const FORWARD_YAWS = [
    ['0', 0],
    ['π/2', Math.PI / 2],
    ['π', Math.PI],
    ['3π/2', (3 * Math.PI) / 2],
  ] as const;

  for (const [label, yaw] of FORWARD_YAWS) {
    it(`un blip de frente mapea ARRIBA con yaw=${label}`, () => {
      const D = 1000;
      const relX = -Math.sin(yaw) * D; // dirección de la proa en XZ
      const relZ = -Math.cos(yaw) * D;
      const r = bearingToDisc(relX, relZ, yaw, 1000, 80);
      expect(r.x).toBeCloseTo(0, 5);
      expect(r.y).toBeCloseTo(-80, 5);
      expect(r.y).toBeLessThan(0);
    });

    it(`un blip a estribor mapea a la DERECHA con yaw=${label}`, () => {
      // estribor = proa girada -90° en XZ = (cos(yaw), -sin(yaw)).
      const D = 1000;
      const relX = Math.cos(yaw) * D;
      const relZ = -Math.sin(yaw) * D;
      const r = bearingToDisc(relX, relZ, yaw, 1000, 80);
      expect(r.x).toBeCloseTo(80, 5);
      expect(r.y).toBeCloseTo(0, 5);
      expect(r.x).toBeGreaterThan(0);
    });
  }

  it('un blip prácticamente en el centro no genera NaN', () => {
    const r = bearingToDisc(0, 0, 0, 1000, 80);
    expect(Number.isNaN(r.x)).toBe(false);
    expect(Number.isNaN(r.y)).toBe(false);
    expect(r.onDisc).toBe(true);
  });
});

describe('elevationStalk', () => {
  it('blip por encima → sign +1 y len positiva', () => {
    const r = elevationStalk(200, 0.05, 40);
    expect(r.sign).toBe(1);
    expect(r.len).toBeCloseTo(10, 5);
  });

  it('blip por debajo → sign -1 y len positiva (longitud usa magnitud)', () => {
    const r = elevationStalk(-200, 0.05, 40);
    expect(r.sign).toBe(-1);
    expect(r.len).toBeCloseTo(10, 5);
  });

  it('mismo nivel (banda muerta) → sign 0 y len 0', () => {
    const r = elevationStalk(0, 0.05, 40);
    expect(r.sign).toBe(0);
    expect(r.len).toBe(0);
  });

  it('una diferencia muy pequeña cae en la banda muerta → sign 0', () => {
    const r = elevationStalk(0.5, 0.05, 40);
    expect(r.sign).toBe(0);
  });

  it('la longitud se acota a maxLen', () => {
    const r = elevationStalk(100000, 0.05, 40);
    expect(r.len).toBe(40);
    expect(r.sign).toBe(1);
  });

  it('len es monótona creciente con |relY| hasta el tope', () => {
    const a = elevationStalk(100, 0.05, 40).len;
    const b = elevationStalk(300, 0.05, 40).len;
    expect(b).toBeGreaterThan(a);
  });
});
