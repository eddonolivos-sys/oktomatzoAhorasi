import { describe, it, expect } from 'vitest';
import { lifeProgress, makeScheduler, type CometState } from './comets-anim';

describe('lifeProgress', () => {
  it('está acotado en [0,1] a lo largo de toda la vida (y más allá)', () => {
    const life = 3;
    for (let i = -50; i <= 200; i++) {
      const age = (i / 100) * life;
      const p = lifeProgress(age, life);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('arranca en 0 (recién spawneado) y termina en 1 (muerto)', () => {
    expect(lifeProgress(0, 3)).toBe(0);
    expect(lifeProgress(3, 3)).toBe(1);
  });

  it('es monótona creciente con la edad', () => {
    let prev = lifeProgress(0, 4);
    for (let age = 0.1; age <= 4; age += 0.1) {
      const cur = lifeProgress(age, 4);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });

  it('es determinista (misma entrada → misma salida)', () => {
    expect(lifeProgress(1.23, 3)).toBe(lifeProgress(1.23, 3));
  });

  it('satura a 1 cuando la edad excede la vida', () => {
    expect(lifeProgress(10, 3)).toBe(1);
  });

  it('clampa edades negativas a 0', () => {
    expect(lifeProgress(-5, 3)).toBe(0);
  });

  it('devuelve 1 ante una vida no válida (evita división por cero)', () => {
    expect(lifeProgress(1, 0)).toBe(1);
    expect(lifeProgress(1, -2)).toBe(1);
  });
});

describe('makeScheduler', () => {
  // RNG determinista (LCG) sembrado para tests reproducibles.
  function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
  }

  it('no spawnea antes de alcanzar el primer intervalo', () => {
    const sched = makeScheduler({ min: 4, max: 8, rng: lcg(1) });
    // Avanzamos un poco; con min=4 no debería disparar en t<4.
    expect(sched.tick(1)).toBe(false);
    expect(sched.tick(1)).toBe(false);
    expect(sched.tick(1)).toBe(false);
  });

  it('spawnea periódicamente al acumular tiempo (en una ventana larga)', () => {
    const sched = makeScheduler({ min: 3, max: 6, rng: lcg(42) });
    let spawns = 0;
    // 100 s a 0.1 s/paso. Con intervalos 3..6 s esperamos ~16-33 spawns.
    for (let i = 0; i < 1000; i++) {
      if (sched.tick(0.1)) spawns++;
    }
    expect(spawns).toBeGreaterThan(10);
    expect(spawns).toBeLessThan(40);
  });

  it('respeta los límites del intervalo (min ≤ espera ≤ max)', () => {
    const sched = makeScheduler({ min: 5, max: 5, rng: lcg(7) });
    // min==max==5 → siempre dispara exactamente cada 5 s.
    let fireTimes: number[] = [];
    let t = 0;
    for (let i = 0; i < 200; i++) {
      t += 0.1;
      if (sched.tick(0.1)) fireTimes.push(t);
    }
    // El primer disparo cae al primer tick que cruza 5 s (granularidad 0.1 s).
    expect(fireTimes[0]).toBeGreaterThanOrEqual(5);
    expect(fireTimes[0]).toBeLessThan(5.15);
    // Los siguientes están separados ~5 s (con tolerancia de un paso de 0.1 s).
    for (let i = 1; i < fireTimes.length; i++) {
      const gap = fireTimes[i]! - fireTimes[i - 1]!;
      expect(gap).toBeGreaterThanOrEqual(5 - 1e-6);
      expect(gap).toBeLessThan(5.15);
    }
  });

  it('es determinista para una misma semilla', () => {
    const a = makeScheduler({ min: 2, max: 9, rng: lcg(99) });
    const b = makeScheduler({ min: 2, max: 9, rng: lcg(99) });
    const fa: boolean[] = [];
    const fb: boolean[] = [];
    for (let i = 0; i < 500; i++) {
      fa.push(a.tick(0.05));
      fb.push(b.tick(0.05));
    }
    expect(fa).toEqual(fb);
  });

  it('no dispara más de una vez por tick aunque el delta sea grande', () => {
    const sched = makeScheduler({ min: 2, max: 4, rng: lcg(3) });
    // Un delta enorme no debe producir un "burst": como mucho un spawn.
    expect(sched.tick(100)).toBe(true);
    // Tras consumir el disparo, vuelve a esperar el siguiente intervalo.
    expect(sched.tick(0.01)).toBe(false);
  });
});

describe('CometState (tipo)', () => {
  it('compone vida normalizada y disparo en un flujo coherente', () => {
    // Smoke test integrando ambas piezas como las usará comets.ts.
    const state: CometState = { age: 0, life: 3 };
    state.age += 1.5;
    const p = lifeProgress(state.age, state.life);
    expect(p).toBeCloseTo(0.5, 5);
  });
});
