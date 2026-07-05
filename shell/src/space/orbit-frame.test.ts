import { describe, it, expect } from 'vitest';
import { buildOrbitBasis, orbitPlaneNormal } from './orbit-frame';
import { dot, length } from './vec3-math';

describe('buildOrbitBasis (S3 — arregla Bug D: órbita "inestable")', () => {
  const center = { x: 100, y: 0, z: 0 };
  const sun = { x: 0, y: 0, z: 0 };
  const ship = { x: 150, y: 20, z: 10 };

  it('produce una base ortonormal (U,V,N unitarios y mutuamente perpendiculares)', () => {
    const { U, V, N } = buildOrbitBasis({ center, ship, sun });
    expect(length(U)).toBeCloseTo(1, 6);
    expect(length(V)).toBeCloseTo(1, 6);
    expect(length(N)).toBeCloseTo(1, 6);
    expect(dot(U, V)).toBeCloseTo(0, 6);
    expect(dot(U, N)).toBeCloseTo(0, 6);
    expect(dot(V, N)).toBeCloseTo(0, 6);
  });

  it('es determinista: la misma entrada produce siempre el mismo plano', () => {
    const a = buildOrbitBasis({ center, ship, sun });
    const b = buildOrbitBasis({ center, ship, sun });
    expect(a).toEqual(b);
  });

  it('la dirección planeta→sol queda DENTRO del plano (perpendicular a N)', () => {
    const { N } = buildOrbitBasis({ center, ship, sun });
    const sunDir = { x: sun.x - center.x, y: sun.y - center.y, z: sun.z - center.z };
    expect(dot(sunDir, N)).toBeCloseTo(0, 4);
  });

  it('N NO depende de la posición de llegada de la nave (antes dependía de su VELOCIDAD — causa del Bug D)', () => {
    const shipA = { x: 100, y: 50, z: 30 };
    const shipB = { x: 130, y: -40, z: 5 };
    const a = buildOrbitBasis({ center, ship: shipA, sun });
    const b = buildOrbitBasis({ center, ship: shipB, sun });
    expect(a.N).toEqual(b.N);
  });

  it('caso degenerado: la nave está exactamente sobre el eje planeta-sol → sin NaN, sigue ortonormal', () => {
    const shipOnAxis = { x: 100, y: 0, z: 50 }; // mismo x,y que center; difiere solo en z (paralelo a N)
    const { U, V, N } = buildOrbitBasis({ center, ship: shipOnAxis, sun });
    for (const v of [U, V, N]) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).toBe(true);
      expect(length(v)).toBeCloseTo(1, 6);
    }
  });

  it('caso degenerado: sunDir paralelo al "up" del mundo usa el fallback y sigue siendo válido', () => {
    const centerAxis = { x: 0, y: 0, z: 0 };
    const sunAboveCenter = { x: 0, y: 500, z: 0 }; // sunDir = (0,1,0) = WORLD_UP exacto
    const shipAnywhere = { x: 10, y: 0, z: 0 };
    const { U, V, N } = buildOrbitBasis({ center: centerAxis, ship: shipAnywhere, sun: sunAboveCenter });
    for (const v of [U, V, N]) {
      expect(length(v)).toBeCloseTo(1, 6);
    }
    expect(dot(N, { x: 0, y: 1, z: 0 })).toBeCloseTo(0, 4);
  });
});

describe('orbitPlaneNormal', () => {
  it('es perpendicular a sunDir y unitaria', () => {
    const sunDir = { x: 1, y: 0, z: 0 };
    const n = orbitPlaneNormal(sunDir);
    expect(dot(n, sunDir)).toBeCloseTo(0, 6);
    expect(length(n)).toBeCloseTo(1, 6);
  });
});
