/**
 * Instrumentación de rendimiento pura (sin Three.js), testeable con Vitest:
 * ring buffer de frame times (ms, delta CRUDO — antes del clamp de
 * space-engine.ts) y sus percentiles p50/p95/p99. Base de la puerta de
 * latencia (Hito 5/6); umbrales y ventanas en `PERF_CONFIG` (space-config.ts).
 */

export interface PerfWindowStats {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

/** Ring buffer de tamaño fijo; al llenarse, cada `push` sobreescribe la muestra más antigua. */
export class FrameTimeRingBuffer {
  private readonly samples: number[];
  private writeIndex = 0;
  private count = 0;

  constructor(private readonly capacity: number) {
    if (capacity < 1) throw new Error('capacity debe ser >= 1');
    this.samples = new Array(capacity).fill(0);
  }

  push(sampleMs: number) {
    this.samples[this.writeIndex] = sampleMs;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.count < this.capacity) this.count += 1;
  }

  /** Nº de muestras válidas actualmente (< capacity si la ventana aún no se llenó). */
  get size(): number {
    return this.count;
  }

  get capacityLimit(): number {
    return this.capacity;
  }

  /** Copia de las muestras válidas (ventana llena o parcial); orden no garantizado. */
  toArray(): number[] {
    return this.samples.slice(0, this.count);
  }

  clear() {
    this.count = 0;
    this.writeIndex = 0;
  }
}

/** Percentil `p` (0..100) por interpolación lineal. Vacío → 0. */
export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const first = sorted[0] ?? 0;
  if (sorted.length === 1) return first;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const loVal = sorted[lo] ?? first;
  const hiVal = sorted[hi] ?? loVal;
  if (lo === hi) return loVal;
  const frac = rank - lo;
  return loVal + (hiVal - loVal) * frac;
}

/** Estadísticas de una ventana de frame times (ms): p50/p95/p99 + min/max + conteo. Vacío → todo 0. */
export function computeStats(samples: number[]): PerfWindowStats {
  if (samples.length === 0) return { count: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}
