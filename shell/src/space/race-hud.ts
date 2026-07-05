import { bearingToDisc } from './radar-projection';
import type { RaceState } from './race-state';
import type { V3 } from './race-track';

/**
 * HUD de la carrera (Hito 5): estado (checkpoint/vuelta/aviso) + minimapa que
 * reutiliza `bearingToDisc` (radar-projection.ts, Hito 1-4) en vez de
 * reinventar la proyección. Oculto por defecto; `showPrompt()` mientras estás
 * en la zona sin correr, `update()` mientras `phase==='racing'`.
 */
export class RaceHud {
  private root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private statusEl: HTMLDivElement;
  private readonly size = 140;
  private readonly cx = 70;
  private readonly cy = 70;
  private readonly r = 58;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'raceHud';
    this.root.innerHTML = `
      <div class="race-status"></div>
      <canvas width="140" height="140"></canvas>
    `;
    host.appendChild(this.root);
    this.statusEl = this.root.querySelector('.race-status') as HTMLDivElement;
    this.canvas = this.root.querySelector('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** En la zona, sin correr todavía: solo el prompt, sin minimapa. */
  showPrompt() {
    this.root.classList.add('visible');
    this.canvas.style.display = 'none';
    this.statusEl.textContent = 'Pulsa E para iniciar la carrera';
    this.statusEl.classList.remove('warning');
  }

  /** Cuenta atrás antes de startRace() (mejora 3b) — también en SP, no solo en sala. */
  showCountdown(secondsLeft: number) {
    this.root.classList.add('visible');
    this.canvas.style.display = 'none';
    this.statusEl.textContent = `Saliendo en ${Math.ceil(secondsLeft)}...`;
    this.statusEl.classList.remove('warning');
  }

  hide() {
    this.root.classList.remove('visible');
  }

  /** `shipPosLocal` en el mismo marco que los waypoints (relativo al centro de la zona). */
  update(
    state: RaceState,
    waypoints: V3[],
    shipPosLocal: V3,
    yaw: number,
    totalLaps: number,
    offTrackWarning: boolean,
  ) {
    this.root.classList.add('visible');
    this.canvas.style.display = 'block';
    const total = waypoints.length;
    this.statusEl.textContent =
      `Checkpoint ${state.currentCheckpoint + 1}/${total} · Vuelta ${state.lap + 1}/${totalLaps}` +
      (offTrackWarning ? ' · FUERA DE PISTA' : '');
    this.statusEl.classList.toggle('warning', offTrackWarning);

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.fillStyle = 'rgba(10, 5, 3, 0.7)';
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.r, 0, Math.PI * 2);
    ctx.fill();

    for (let k = 0; k < Math.min(3, total); k++) {
      const idx = (state.currentCheckpoint + k) % total;
      const wp = waypoints[idx];
      if (!wp) continue;
      const disc = bearingToDisc(wp.x - shipPosLocal.x, wp.z - shipPosLocal.z, yaw, 3000, this.r);
      const px = this.cx + disc.x;
      const py = this.cy + disc.y;
      ctx.fillStyle = k === 0 ? 'rgba(255, 196, 120, 0.95)' : 'rgba(230, 168, 23, 0.4)';
      ctx.beginPath();
      ctx.arc(px, py, k === 0 ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#E6A817';
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  dispose() {
    this.root.remove();
  }
}
