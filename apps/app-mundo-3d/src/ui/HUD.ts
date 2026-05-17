import { Cartographic, Math as CesiumMath } from 'cesium';
import { VehicleState } from '../controls/PhysicsEngine';
import { CameraMode } from '../controls/CameraController';
import { VehicleSpec } from '../models/vehicles';

const CSS = `
#hud {
  position: fixed;
  top: 12px;
  left: 12px;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 10px;
  padding: 12px 16px;
  color: #e8f4ff;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.7;
  min-width: 220px;
  pointer-events: none;
  z-index: 1000;
}
#hud .hud-title {
  font-size: 11px;
  font-family: sans-serif;
  color: #88aacc;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 6px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding-bottom: 4px;
}
#hud .hud-row { display: flex; justify-content: space-between; gap: 12px; }
#hud .hud-label { color: #88aacc; font-size: 11px; }
#hud .hud-value { color: #ffffff; font-weight: bold; }
#hud .hud-mode {
  margin-top: 6px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  text-align: center;
  font-family: sans-serif;
}
#hud .hud-mode.follow { background: rgba(0,120,255,0.3); color: #66bbff; }
#hud .hud-mode.free   { background: rgba(255,160,0,0.3); color: #ffcc66; }
#hud .hud-speed-bar {
  margin-top: 8px;
  height: 3px;
  background: rgba(255,255,255,0.1);
  border-radius: 2px;
  overflow: hidden;
}
#hud .hud-speed-fill {
  height: 100%;
  background: linear-gradient(90deg, #0088ff, #00ccff);
  border-radius: 2px;
  transition: width 0.1s;
}
`;

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
    this.modeBadge.textContent = '📷 Seguimiento';
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
      this.modeBadge.textContent = '📷 Seguimiento  [V]';
    } else {
      this.modeBadge.className = 'hud-mode free';
      this.modeBadge.textContent = '🎥 Cámara libre  [V]';
    }
  }

  destroy() {
    this.el.remove();
  }
}
