import type { PerfWindowStats } from './perf-stats';

export interface PerfSnapshot {
  frame: PerfWindowStats; // ms, delta CRUDO (sin el clamp del loop)
  drawCalls: number;
  triangles: number;
  pixelRatio: number;
  rttMs: number | null;
}

/**
 * Panel de diagnóstico de rendimiento (Hito 0), oculto por defecto y alternado
 * con la tecla P. Solo lectura, sin Three.js; instrumentación para capturar el
 * baseline y, más adelante, la puerta de latencia de los Hitos 5/6.
 */
export class PerfHud {
  private root: HTMLDivElement;
  private visibleState = false;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'perfHud';
    host.appendChild(this.root);
  }

  toggle() {
    this.visibleState = !this.visibleState;
    this.root.classList.toggle('visible', this.visibleState);
  }

  get visible(): boolean {
    return this.visibleState;
  }

  update(snapshot: PerfSnapshot) {
    if (!this.visibleState) return;
    const { frame, drawCalls, triangles, pixelRatio, rttMs } = snapshot;
    this.root.textContent =
      `frame ms  p50 ${frame.p50.toFixed(2)}  p95 ${frame.p95.toFixed(2)}  p99 ${frame.p99.toFixed(2)}  (n=${frame.count})\n` +
      `drawCalls ${drawCalls}  tris ${triangles}\n` +
      `pixelRatio ${pixelRatio.toFixed(2)}\n` +
      `RTT ${rttMs === null ? '—' : `${rttMs.toFixed(0)} ms`}`;
  }

  dispose() {
    this.root.remove();
  }
}
