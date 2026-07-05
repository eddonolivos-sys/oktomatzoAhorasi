import type { ShipState } from './ship-controller';
import { formatAltitude, formatHeading } from './hud-format';

/**
 * Overlay HUD in-space (DOM en light DOM). Reactivo: reticula con estado
 * (idle / aproximando con anillo de permanencia), velocidad real (sin tope),
 * altitud real y rumbo/brújula, leyenda de controles persistente y vignette.
 * Sin campo "Z … AU" (engañoso). Estilos en space.css. Sin Three.js.
 */
export class Hud {
  private root: HTMLDivElement;
  private reticle: HTMLElement;
  private dwellRing: SVGCircleElement;
  private reticleLabel: HTMLElement;
  private projectPanel: HTMLElement;
  private panelName: HTMLElement;
  private panelDesc: HTMLElement;
  private panelBlurb: HTMLElement;
  private speedValue: HTMLElement;
  private speedUnit: HTMLElement;
  private altValue: HTMLElement;
  private headingValue: HTMLElement;
  private startMsg: HTMLElement;
  private enterBtn: HTMLElement;
  private exitBtn: HTMLElement;

  /** Se invoca al pulsar el botón "Entrar" del panel de proyecto (#3). */
  onEnter?: () => void;
  /** Se invoca al pulsar el botón "Salir de la órbita" (S5). */
  onExit?: () => void;

  /** Circunferencia del círculo de progreso (r = 16). */
  private readonly ringCircumference = 2 * Math.PI * 16;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.innerHTML = `
      <div id="vignette"></div>
      <div id="reticle">
        <svg class="dwell" viewBox="0 0 40 40" aria-hidden="true">
          <circle class="dwell-track" cx="20" cy="20" r="16"></circle>
          <circle class="dwell-fill" cx="20" cy="20" r="16"></circle>
        </svg>
        <div class="center-dot"></div>
        <div class="reticle-label"></div>
      </div>
      <div id="projectPanel">
        <div class="pp-name"></div>
        <div class="pp-desc"></div>
        <div class="pp-blurb"></div>
        <button type="button" class="pp-enter" style="pointer-events:auto;cursor:pointer;background:transparent;border:1px solid rgba(230,168,23,0.5);color:#E6A817;font:inherit;padding:6px 14px;border-radius:6px;margin-top:8px;">Entrar al proyecto (Space/E)</button>
        <button type="button" class="pp-exit" hidden style="pointer-events:auto;cursor:pointer;background:transparent;border:1px solid rgba(200,184,152,0.4);color:#C8B898;font:inherit;padding:6px 14px;border-radius:6px;margin-top:8px;margin-left:8px;">Salir de la órbita (S)</button>
      </div>
      <div id="startMsg">
        <h1>Ramatzo</h1>
        <p>
          <span class="key">RAT&Oacute;N</span> Mirar &nbsp;&middot;&nbsp;
          <span class="key">W</span><span class="key">S</span> Avanzar &nbsp;&middot;&nbsp;
          <span class="key">A</span><span class="key">D</span> Lateral &nbsp;&middot;&nbsp;
          <span class="key">SHIFT</span> Nitro<br/>
          Ac&eacute;rcate a un planeta y pulsa <span class="key">SPACE</span>/<span class="key">E</span> para entrar
        </p>
      </div>
      <div id="hud">
        <div class="speed-display"><span class="value" id="speedValue">0</span> <span id="speedUnit">U/s</span></div>
        <div class="speed-unit">Velocidad</div>
      </div>
      <div id="flightData">
        <div class="row"><span class="label">ALT</span> <span id="altValue">+0 u</span></div>
        <div class="row"><span class="label">RUMBO</span> <span id="headingValue">000</span>&deg;</div>
      </div>
      <div id="controlsLegend">
        <span class="key">RAT&Oacute;N</span> mirar
        <span class="key">W</span><span class="key">S</span> avanzar
        <span class="key">A</span><span class="key">D</span> lateral
        <span class="key">SHIFT</span> nitro
        <span class="key">S</span> freno
        <span class="key">SPACE</span><span class="key">E</span> entrar
        <span class="key">ESC</span> men&uacute;
      </div>`;
    host.appendChild(this.root);

    const q = (sel: string) => this.root.querySelector(sel) as HTMLElement;
    this.reticle = q('#reticle');
    this.dwellRing = this.root.querySelector('#reticle .dwell-fill') as unknown as SVGCircleElement;
    this.reticleLabel = q('#reticle .reticle-label');
    this.projectPanel = q('#projectPanel');
    this.panelName = q('#projectPanel .pp-name');
    this.panelDesc = q('#projectPanel .pp-desc');
    this.panelBlurb = q('#projectPanel .pp-blurb');
    this.speedValue = q('#speedValue');
    this.speedUnit = q('#speedUnit');
    this.altValue = q('#altValue');
    this.headingValue = q('#headingValue');
    this.startMsg = q('#startMsg');
    this.enterBtn = q('#projectPanel .pp-enter');
    this.enterBtn.addEventListener('click', () => this.onEnter?.());
    this.exitBtn = q('#projectPanel .pp-exit');
    this.exitBtn.addEventListener('click', () => this.onExit?.());

    // Estado inicial del anillo de permanencia: vacío.
    this.dwellRing.style.strokeDasharray = String(this.ringCircumference);
    this.dwellRing.style.strokeDashoffset = String(this.ringCircumference);
  }

  update(
    state: ShipState,
    info: {
      altitude: number;
      heading: number;
      approaching: { name: string; description?: string; blurb?: string } | null;
      /** S2: planeta en radio de aviso, sin interacción todavía. */
      hint: { name: string } | null;
      dwellProgress: number;
      orbiting: boolean;
    },
  ) {
    // Velocidad real, sin tope.
    this.speedValue.textContent = state.speed.toFixed(0);

    if (state.isNitro) {
      this.speedUnit.textContent = 'NITRO';
      this.speedUnit.style.color = 'var(--orange-ember)';
    } else {
      this.speedUnit.textContent = 'U/s';
      this.speedUnit.style.color = '';
    }

    // Altitud real y rumbo (formateadores puros).
    this.altValue.textContent = formatAltitude(info.altitude);
    this.headingValue.textContent = formatHeading(info.heading);

    // Estado de la reticula: idle vs aproximando con anillo de permanencia.
    const approaching = info.approaching != null;
    this.reticle.classList.toggle('approaching', approaching);
    this.reticle.classList.toggle('hinting', !approaching && info.hint != null);
    if (approaching) {
      const a = info.approaching!;
      this.reticleLabel.textContent = info.orbiting ? `S · Salir de órbita · ${a.name}` : `Space/E · ${a.name}`;
      this.dwellRing.style.strokeDashoffset = '0';
      this.panelName.textContent = a.name;
      this.panelDesc.textContent = a.description ?? '';
      this.panelBlurb.textContent = a.blurb ?? '';
      this.projectPanel.classList.add('visible');
      this.exitBtn.hidden = !info.orbiting;
    } else if (info.hint) {
      this.reticleLabel.textContent = info.hint.name;
      this.dwellRing.style.strokeDashoffset = String(this.ringCircumference);
      this.projectPanel.classList.remove('visible');
      this.exitBtn.hidden = true;
    } else {
      this.reticleLabel.textContent = '';
      this.dwellRing.style.strokeDashoffset = String(this.ringCircumference);
      this.projectPanel.classList.remove('visible');
      this.exitBtn.hidden = true;
    }
  }

  hideStartMessage() {
    this.startMsg.classList.add('hidden');
  }

  dispose() {
    this.root.remove();
  }
}
