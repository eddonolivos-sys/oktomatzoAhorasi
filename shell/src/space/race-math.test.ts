import { describe, it, expect } from 'vitest';
import { distanceToSegment, nearestSegmentDistance, sweptSphereHitsSphere } from './race-math';

describe('distanceToSegment', () => {
  it('punto perpendicular al segmento', () => {
    expect(distanceToSegment({ x: 5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })).toBeCloseTo(0, 10);
    expect(distanceToSegment({ x: 5, y: 3, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })).toBeCloseTo(3, 10);
  });

  it('proyección acotada: punto más allá del extremo B usa la distancia a B', () => {
    expect(distanceToSegment({ x: 15, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })).toBeCloseTo(5, 10);
  });

  it('proyección acotada: punto antes del extremo A usa la distancia a A', () => {
    expect(distanceToSegment({ x: -5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })).toBeCloseTo(5, 10);
  });

  it('segmento degenerado (a===b) no revienta', () => {
    expect(distanceToSegment({ x: 3, y: 4, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBeCloseTo(5, 10);
  });
});

describe('nearestSegmentDistance', () => {
  const square = [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
    { x: 10, y: 0, z: 10 },
    { x: 0, y: 0, z: 10 },
  ];

  it('encuentra el segmento más cercano de un circuito cerrado', () => {
    expect(nearestSegmentDistance({ x: 5, y: 0, z: -1 }, square)).toBeCloseTo(1, 10);
  });

  it('incluye la vuelta de cierre (último → primero)', () => {
    expect(nearestSegmentDistance({ x: 5, y: 0, z: 11 }, square)).toBeCloseTo(1, 10);
  });

  it('circuito de un solo punto: distancia directa', () => {
    expect(nearestSegmentDistance({ x: 3, y: 4, z: 0 }, [{ x: 0, y: 0, z: 0 }])).toBeCloseTo(5, 10);
  });

  it('circuito vacío: Infinity', () => {
    expect(nearestSegmentDistance({ x: 0, y: 0, z: 0 }, [])).toBe(Infinity);
  });
});

describe('sweptSphereHitsSphere (evita tunneling)', () => {
  it('detecta colisión cuando el punto final está dentro del radio', () => {
    expect(
      sweptSphereHitsSphere({ x: -10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 5, 1),
    ).toBe(true);
  });

  it('detecta colisión con un obstáculo que el segmento ATRAVIESA sin que ningún extremo quede dentro (tunneling)', () => {
    // El objeto viaja de x=-10 a x=10 en un frame; el obstáculo está en x=0.
    // Ni el extremo inicial ni el final están a menos de 5 unidades de (0,0,0),
    // pero el TRAMO sí pasa a distancia 0 del obstáculo.
    const hit = sweptSphereHitsSphere({ x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 5, 1);
    expect(hit).toBe(true);
    expect(Math.hypot(-10, 0, 0)).toBeGreaterThan(6); // confirma que un chequeo puntual NO lo habría visto
    expect(Math.hypot(10, 0, 0)).toBeGreaterThan(6);
  });

  it('no detecta colisión si el tramo pasa lejos del obstáculo', () => {
    expect(
      sweptSphereHitsSphere({ x: -10, y: 100, z: 0 }, { x: 10, y: 100, z: 0 }, { x: 0, y: 0, z: 0 }, 5, 1),
    ).toBe(false);
  });
});
