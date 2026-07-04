import { describe, it, expect } from 'vitest';
import { FrameTimeRingBuffer, percentile, computeStats } from './perf-stats';

describe('FrameTimeRingBuffer', () => {
  it('acumula muestras sin sobrepasar la capacidad (ventana parcial)', () => {
    const buf = new FrameTimeRingBuffer(5);
    buf.push(1);
    buf.push(2);
    expect(buf.size).toBe(2);
    expect(buf.toArray()).toEqual([1, 2]);
  });

  it('al llenarse, sobreescribe la muestra más antigua (ventana llena)', () => {
    const buf = new FrameTimeRingBuffer(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4); // sobreescribe el 1
    expect(buf.size).toBe(3);
    expect(buf.toArray().sort((a, b) => a - b)).toEqual([2, 3, 4]);
  });

  it('clear() vacía el buffer', () => {
    const buf = new FrameTimeRingBuffer(3);
    buf.push(1);
    buf.push(2);
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.toArray()).toEqual([]);
  });

  it('capacity < 1 lanza', () => {
    expect(() => new FrameTimeRingBuffer(0)).toThrow();
  });
});

describe('percentile', () => {
  it('vacío devuelve 0', () => {
    expect(percentile([], 95)).toBe(0);
  });

  it('un solo elemento devuelve ese elemento para cualquier p', () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 99)).toBe(42);
  });

  it('p50 de 1..101 (101 muestras) es la mediana exacta', () => {
    const samples = Array.from({ length: 101 }, (_, i) => i + 1); // 1..101
    expect(percentile(samples, 50)).toBe(51);
  });

  it('p95 de 1..101 corresponde al rango esperado (interpolación lineal)', () => {
    const samples = Array.from({ length: 101 }, (_, i) => i + 1); // 1..101
    // rank = 0.95 * 100 = 95 → índice exacto (0-based) → valor 96.
    expect(percentile(samples, 95)).toBe(96);
  });

  it('no depende del orden de entrada', () => {
    const ordered = [1, 2, 3, 4, 5];
    const shuffled = [3, 1, 5, 2, 4];
    expect(percentile(shuffled, 95)).toBe(percentile(ordered, 95));
  });
});

describe('computeStats', () => {
  it('ventana vacía: todo en 0, count 0', () => {
    expect(computeStats([])).toEqual({ count: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 });
  });

  it('ventana parcial (pocas muestras) calcula p95 correctamente', () => {
    const stats = computeStats([10, 20, 30]);
    expect(stats.count).toBe(3);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(30);
    expect(stats.p95).toBeCloseTo(29, 5); // rank=0.95*2=1.9 → interpola entre 20 y 30
  });

  it('ventana llena (300 muestras uniformes 1..300) da p95/p99 coherentes', () => {
    const samples = Array.from({ length: 300 }, (_, i) => i + 1);
    const stats = computeStats(samples);
    expect(stats.count).toBe(300);
    expect(stats.p50).toBeCloseTo(150.5, 5);
    expect(stats.p95).toBeGreaterThan(stats.p50);
    expect(stats.p99).toBeGreaterThan(stats.p95);
    expect(stats.max).toBe(300);
    expect(stats.min).toBe(1);
  });

  it('un pico aislado de frame time (jank) no se oculta en max, aunque no mueva p50 (delta CRUDO sin clamp)', () => {
    const smooth = Array.from({ length: 299 }, () => 16.6); // ~60fps
    const withJank = [...smooth, 500]; // un frame congelado (p. ej. hitch de GC)
    const stats = computeStats(withJank);
    expect(stats.p50).toBeCloseTo(16.6, 5); // la mediana ignora el outlier
    expect(stats.max).toBe(500); // el peor frame NO queda oculto (a diferencia del delta clamp del loop)
  });

  it('con outliers frecuentes (10%), sí se reflejan en p95/p99', () => {
    const smooth = Array.from({ length: 90 }, () => 16.6);
    const withJank = [...smooth, ...Array.from({ length: 10 }, () => 500)];
    const stats = computeStats(withJank);
    expect(stats.p50).toBeCloseTo(16.6, 5);
    expect(stats.p95).toBeGreaterThan(100);
    expect(stats.p99).toBeGreaterThan(100);
  });

  it('integración con FrameTimeRingBuffer: p95 correcto tras llenar y sobreescribir', () => {
    const buf = new FrameTimeRingBuffer(10);
    for (let i = 1; i <= 15; i++) buf.push(i); // 15 empujes en un buffer de 10 → quedan 6..15
    expect(buf.size).toBe(10);
    const stats = computeStats(buf.toArray());
    expect(stats.count).toBe(10);
    expect(stats.min).toBe(6);
    expect(stats.max).toBe(15);
  });
});
