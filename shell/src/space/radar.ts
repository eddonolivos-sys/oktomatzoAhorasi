import * as THREE from 'three';
import type { RadarBlip } from './constellations';

/**
 * Radar 2D (canvas) fijo arriba-izquierda. Proyecta las constelaciones al plano
 * XZ relativo al jugador y al rumbo. Trabaja en espacio de escena (jugador y blips
 * comparten el mismo marco), por lo que el rebase de origen no lo afecta.
 */
export class Radar {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private readonly size = 180;
  private readonly cx = 90;
  private readonly cy = 90;
  private readonly r = 78;

  constructor(host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.canvas.style.cssText =
      'position:fixed;top:24px;left:24px;z-index:100;border-radius:50%;pointer-events:none;';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  draw(playerPos: THREE.Vector3, yaw: number, blips: RadarBlip[]) {
    const ctx = this.ctx;
    const { cx, cy, r } = this;
    ctx.clearRect(0, 0, this.size, this.size);

    // Fondo
    ctx.fillStyle = 'rgba(10, 5, 3, 0.88)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Anillos
    ctx.strokeStyle = 'rgba(196, 75, 49, 0.08)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (r * i) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cruz
    ctx.strokeStyle = 'rgba(196, 75, 49, 0.06)';
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    // Borde
    ctx.strokeStyle = 'rgba(200, 184, 152, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Blips de constelaciones
    for (const blip of blips) {
      const dx = blip.position.x - playerPos.x;
      const dz = blip.position.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 5) continue;

      const angle = Math.atan2(dz, dx) - yaw;
      const rDist = Math.min((dist / 600) * r, r - 10);
      const x = cx + Math.cos(angle) * rDist;
      const y = cy + Math.sin(angle) * rDist;
      const brightness = Math.max(0.15, 1 - dist / 600);

      ctx.fillStyle = `rgba(230, 168, 23, ${brightness})`;
      ctx.shadowColor = 'rgba(230, 168, 23, 0.2)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + brightness * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (dist < 250) {
        ctx.fillStyle = `rgba(200, 184, 152, ${brightness * 0.5})`;
        ctx.font = '6px "Cinzel", serif';
        ctx.fillText(blip.name.substring(0, 10), x + 4, y + 2);
      }
    }

    // Nave del jugador (centro)
    ctx.fillStyle = '#E6A817';
    ctx.shadowColor = '#E6A817';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Indicador de rumbo
    ctx.strokeStyle = 'rgba(230, 168, 23, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(-yaw) * r * 0.7, cy + Math.sin(-yaw) * r * 0.7);
    ctx.stroke();

    // Norte
    ctx.fillStyle = 'rgba(200, 184, 152, 0.3)';
    ctx.font = '7px serif';
    ctx.fillText('N', cx - 3, cy - r + 12);

    // Barrido
    const sweep = Date.now() * 0.001;
    ctx.strokeStyle = 'rgba(230, 168, 23, 0.06)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, sweep - 0.2, sweep);
    ctx.stroke();
  }

  show() {
    this.canvas.style.display = 'block';
  }

  hide() {
    this.canvas.style.display = 'none';
  }

  dispose() {
    this.canvas.remove();
  }
}
