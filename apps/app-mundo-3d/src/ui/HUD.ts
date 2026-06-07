import { Cartographic, Math as CesiumMath } from 'cesium';
import { VehicleState } from '../controls/PhysicsEngine';
import { CameraMode } from '../controls/CameraController';
import { VehicleSpec } from '../models/vehicles';

const CSS = `
#hud {
  position: fixed;
  top: 12px;
  left: 12px;
  background: rgba(2,6,18,0.55);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 12px;
  padding: 12px 16px;
  color: #eef2ff;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.7;
  min-width: 220px;
  pointer-events: none;
  z-index: 1000;
  box-shadow: 0 10px 30px rgba(0,0,0,0.45);
}
#hud .hud-title {
  font-size: 10.5px;
  color: #8892a4;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  padding-bottom: 6px;
}
#hud .hud-row { display: flex; justify-content: space-between; gap: 12px; }
#hud .hud-label { color: #8892a4; font-size: 11px; }
#hud .hud-value { color: #eef2ff; font-weight: 600; font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace; font-size: 12px; }
#hud .hud-mode {
  margin-top: 8px;
  padding: 4px 10px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
#hud .hud-mode svg { width: 13px; height: 13px; display: block; }
#hud .hud-mode.follow { background: rgba(99,102,241,0.2); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.34); }
#hud .hud-mode.free   { background: rgba(245,158,11,0.18); color: #fcd34d; border: 1px solid rgba(245,158,11,0.32); }
#hud .hud-speed-bar {
  margin-top: 10px;
  height: 3px;
  background: rgba(255,255,255,0.1);
  border-radius: 2px;
  overflow: hidden;
}
#hud .hud-speed-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #a78bfa);
  border-radius: 2px;
  transition: width 0.1s;
}
`;

const ICON = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const CAM_FOLLOW = ICON('<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>');
const CAM_FREE = ICON('<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>');

export class HUD {
  private el: HTMLDivElement;
  private rows: Record<string, HTMLSpanElement> = {};
  private speedFill!: HTMLDivElement;
  private modeBadge!: HTMLDivElement;
  private currentMaxSpeed = 1;

  constructor() {
    this.injectStyles();
    this.el = this.buildDOM();
    document.body.appendChild(this.el);
  }

  private injectStyles() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  private buildDOM(): HTMLDivElement {
    const hud = document.createElement('div');
    hud.id = 'hud';

    const title = document.createElement('div');
    title.className = 'hud-title';
    title.textContent = 'Mundo 3D · HUD';
    hud.appendChild(title);

    const fields: [string, string, string][] = [
      ['lat',     'Latitud',    '–'],
      ['lon',     'Longitud',   '–'],
      ['alt',     'Altitud',    '–'],
      ['speed',   'Velocidad',  '–'],
      ['heading', 'Rumbo',      '–'],
    ];

    for (const [key, label, init] of fields) {
      const row = document.createElement('div');
      row.className = 'hud-row';
      row.innerHTML = `<span class="hud-label">${label}</span><span class="hud-value" id="hud-${key}">${init}</span>`;
      hud.appendChild(row);
      this.rows[key] = row.querySelector(`#hud-${key}`)!;
    }

    // Speed bar
    const barWrap = document.createElement('div');
    barWrap.className = 'hud-speed-bar';
    this.speedFill = document.createElement('div');
    this.speedFill.className = 'hud-speed-fill';
    this.speedFill.style.width = '0%';
    barWrap.appendChild(this.speedFill);
    hud.appendChild(barWrap);

    // Camera mode badge
    this.modeBadge = document.createElement('div');
    this.modeBadge.className = 'hud-mode follow';
    this.modeBadge.innerHTML = `${CAM_FOLLOW}<span>Seguimiento</span>`;
    hud.appendChild(this.modeBadge);

    return hud;
  }

  setVehicleSpec(spec: VehicleSpec) {
    this.currentMaxSpeed = spec.maxSpeed;
  }

  update(state: VehicleState, cameraMode: CameraMode) {
    const carto = Cartographic.fromCartesian(state.position);
    const lat = CesiumMath.toDegrees(carto.latitude);
    const lon = CesiumMath.toDegrees(carto.longitude);
    const headingDeg = ((CesiumMath.toDegrees(state.heading) % 360) + 360) % 360;
    const speedKmh = state.speed * 3.6;

    this.rows['lat']!.textContent     = `${lat.toFixed(5)}°`;
    this.rows['lon']!.textContent     = `${lon.toFixed(5)}°`;
    this.rows['alt']!.textContent     = `${state.altitude.toFixed(0)} m`;
    this.rows['speed']!.textContent   = `${speedKmh.toFixed(1)} km/h`;
    this.rows['heading']!.textContent = `${headingDeg.toFixed(1)}°`;

    const pct = Math.min(100, (Math.abs(state.speed) / this.currentMaxSpeed) * 100);
    this.speedFill.style.width = `${pct}%`;

    if (cameraMode === 'follow') {
      this.modeBadge.className = 'hud-mode follow';
      this.modeBadge.innerHTML = `${CAM_FOLLOW}<span>Seguimiento · V</span>`;
    } else {
      this.modeBadge.className = 'hud-mode free';
      this.modeBadge.innerHTML = `${CAM_FREE}<span>Cámara libre · V</span>`;
    }
  }

  destroy() {
    this.el.remove();
  }
}
