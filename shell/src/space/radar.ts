import * as THREE from 'three';
import type { RadarBlip } from './solar-system';
import type { AppInfo } from '../services/protocol';
import { bearingToDisc, elevationStalk } from './radar-projection';
import { SOLAR_CONFIG } from './space-config';

/**
 * Radar 3D holográfico (canvas 2D) fijo arriba-izquierda. Lee el plano XZ del
 * sistema relativo a la nave y al rumbo (yaw), lo proyecta a un disco táctico
 * inclinado por el pitch, y comunica la altitud con postes verticales + chevrons.
 * Anillos con distancia numérica de escala FIJA (no autoescala por frame).
 * El objetivo en aproximación se marca con corchetes + distancia; si queda fuera
 * del disco, un puntero de rumbo en el borde indica hacia dónde girar.
 *
 * Trabaja en espacio de escena (nave y blips comparten el mismo marco), por lo
 * que el rebase de origen no lo afecta. Estilo ámbar sobrio (sin neón).
 */
export class Radar {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private readonly size = 200;
  private readonly cx = 100;
  private readonly cy = 104; // ligero desplazamiento: deja aire arriba para los postes
  private readonly r = 84;

  /** Rango total FIJO del radar en unidades de mundo (escala estable, no autoscale). */
  private readonly range = SOLAR_CONFIG.radarRange;
  /** Escala del poste de altitud: unidades de mundo (Y) → píxeles. */
  private readonly altScale = SOLAR_CONFIG.radarAltScale;
  private readonly maxStalk = 26;

  constructor(host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.canvas.style.cssText =
      'position:fixed;top:24px;left:24px;z-index:100;pointer-events:none;';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  draw(
    shipPos: THREE.Vector3,
    yaw: number,
    pitch: number,
    blips: RadarBlip[],
    lockedApp: AppInfo | null,
    sunPos?: THREE.Vector3,
  ): void {
    const ctx = this.ctx;
    const { cx, cy, r } = this;
    ctx.clearRect(0, 0, this.size, this.size);

    // Escorzo vertical del disco por el pitch: mirando al frente (pitch≈0) el
    // disco se ve casi de canto; mirando arriba/abajo se aplana hacia un círculo.
    // squash ∈ [0.34, 0.95]: nunca totalmente plano (legibilidad).
    const squash = 0.34 + 0.61 * Math.min(1, Math.abs(Math.sin(pitch)) + 0.0);

    // ── Carcasa (elipse de fondo) ──
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, squash);
    ctx.fillStyle = 'rgba(10, 5, 3, 0.78)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Anillos de distancia (escala FIJA), proyectados como elipses.
    ctx.lineWidth = 0.6;
    for (let i = 1; i <= 3; i++) {
      ctx.strokeStyle = `rgba(196, 130, 60, ${0.08 + i * 0.02})`;
      ctx.beginPath();
      ctx.arc(0, 0, (r * i) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cruz de orientación.
    ctx.strokeStyle = 'rgba(196, 130, 60, 0.07)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r);
    ctx.stroke();
    ctx.restore();

    // Borde superior (sin escorzo de trazo) para enmarcar el disco.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, squash);
    ctx.strokeStyle = 'rgba(210, 184, 140, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Etiquetas numéricas de distancia de los anillos (sin escorzo: legibles).
    ctx.fillStyle = 'rgba(210, 184, 140, 0.45)';
    ctx.font = '7px "Cinzel", serif';
    for (let i = 1; i <= 3; i++) {
      const ringDist = Math.round((this.range * i) / 3);
      const label = ringDist >= 1000 ? `${(ringDist / 1000).toFixed(1)}k` : `${ringDist}`;
      const yPix = cy - ((r * i) / 3) * squash;
      ctx.fillText(label, cx + 3, yPix - 1);
    }

    // ── Sol Ramatzo (faro central) — rombo distintivo ──
    if (sunPos) {
      this.drawBlip(shipPos, yaw, squash, sunPos, '#FF8C42', true);
    }

    // ── Blips de proyectos (planetas) con postes de altitud ──
    let lockedScreen: { x: number; y: number; onDisc: boolean } | null = null;
    let lockedDist = 0;
    for (const blip of blips) {
      const relX = blip.position.x - shipPos.x;
      const relZ = blip.position.z - shipPos.z;
      const relY = blip.position.y - shipPos.y;
      const dist = Math.hypot(relX, relZ);
      if (dist < 2) continue;

      const isLocked = lockedApp != null && blip.app.id === lockedApp.id;
      const disc = bearingToDisc(relX, relZ, yaw, this.range, r);
      const px = cx + disc.x;
      const py = cy + disc.y * squash;
      const brightness = Math.max(0.25, 1 - dist / this.range);

      // Poste de altitud + chevron.
      const stalk = elevationStalk(relY, this.altScale, this.maxStalk);
      if (stalk.len > 0) {
        const topY = py - stalk.sign * stalk.len;
        ctx.strokeStyle = `rgba(230, 168, 23, ${brightness * 0.6})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, topY);
        ctx.stroke();
        // Chevron ▲ (sign +1) / ▼ (sign -1).
        ctx.fillStyle = `rgba(230, 168, 23, ${brightness})`;
        ctx.beginPath();
        if (stalk.sign === 1) {
          ctx.moveTo(px - 3, topY + 3);
          ctx.lineTo(px + 3, topY + 3);
          ctx.lineTo(px, topY - 1);
        } else {
          ctx.moveTo(px - 3, topY - 3);
          ctx.lineTo(px + 3, topY - 3);
          ctx.lineTo(px, topY + 1);
        }
        ctx.closePath();
        ctx.fill();
      }

      // Punto del blip en el disco.
      ctx.fillStyle = `rgba(230, 168, 23, ${brightness})`;
      ctx.shadowColor = 'rgba(230, 168, 23, 0.25)';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(px, py, 1.6 + brightness * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Etiqueta del proyecto.
      ctx.fillStyle = `rgba(210, 196, 168, ${Math.max(0.5, brightness)})`;
      ctx.font = '7px "Cinzel", serif';
      ctx.fillText(blip.name.substring(0, 9), px + 5, py + 2);

      if (isLocked) {
        lockedScreen = { x: px, y: py, onDisc: disc.onDisc };
        lockedDist = dist;
      }
    }

    // ── Objetivo bloqueado / en aproximación: corchetes + distancia, o puntero ──
    if (lockedScreen) {
      ctx.strokeStyle = 'rgba(255, 140, 66, 0.9)';
      ctx.fillStyle = 'rgba(255, 196, 120, 0.95)';
      ctx.lineWidth = 1.2;
      if (lockedScreen.onDisc) {
        // Corchetes [ ] alrededor del objetivo.
        const b = 6;
        const { x, y } = lockedScreen;
        ctx.beginPath();
        ctx.moveTo(x - b, y - b + 2); ctx.lineTo(x - b, y - b); ctx.lineTo(x - b + 2, y - b);
        ctx.moveTo(x + b, y - b + 2); ctx.lineTo(x + b, y - b); ctx.lineTo(x + b - 2, y - b);
        ctx.moveTo(x - b, y + b - 2); ctx.lineTo(x - b, y + b); ctx.lineTo(x - b + 2, y + b);
        ctx.moveTo(x + b, y + b - 2); ctx.lineTo(x + b, y + b); ctx.lineTo(x + b - 2, y + b);
        ctx.stroke();
        const distLabel =
          lockedDist >= 1000 ? `${(lockedDist / 1000).toFixed(1)}k` : `${Math.round(lockedDist)}`;
        ctx.font = '8px "Cinzel", serif';
        ctx.fillText(distLabel, x + b + 2, y + b + 6);
      } else {
        // Fuera del disco: puntero de rumbo en el borde apuntando al objetivo.
        const ang = Math.atan2(lockedScreen.y - cy, lockedScreen.x - cx);
        const tipX = cx + Math.cos(ang) * (r - 2);
        const tipY = cy + Math.sin(ang) * (r - 2) * squash;
        ctx.save();
        ctx.translate(tipX, tipY);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-7, -3.5);
        ctx.lineTo(-7, 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // ── Nave del jugador (centro) ──
    ctx.fillStyle = '#E6A817';
    ctx.shadowColor = '#E6A817';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Indicador de rumbo (hacia arriba = adelante de la nave).
    ctx.strokeStyle = 'rgba(230, 168, 23, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - r * 0.7 * squash);
    ctx.stroke();

    // Marca de "adelante".
    ctx.fillStyle = 'rgba(200, 184, 152, 0.32)';
    ctx.font = '7px serif';
    ctx.fillText('PROA', cx - 9, cy - r * squash + 11);
  }

  /** Dibuja un blip simple (rombo) sin poste; usado para el sol Ramatzo. */
  private drawBlip(
    shipPos: THREE.Vector3,
    yaw: number,
    squash: number,
    pos: THREE.Vector3,
    color: string,
    diamond: boolean,
  ): void {
    const ctx = this.ctx;
    const relX = pos.x - shipPos.x;
    const relZ = pos.z - shipPos.z;
    const disc = bearingToDisc(relX, relZ, yaw, this.range, this.r);
    const px = this.cx + disc.x;
    const py = this.cy + disc.y * squash;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    if (diamond) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  show(): void {
    this.canvas.style.display = 'block';
  }

  hide(): void {
    this.canvas.style.display = 'none';
  }

  dispose(): void {
    this.canvas.remove();
  }
}
