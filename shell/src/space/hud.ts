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
        <div class="pp-enter"><span class="key">E</span> Entrar al proyecto</div>
      </div>
      <div id="startMsg">
        <h1>Ramatzo</h1>
        <p>
          <span class="key">RAT&Oacute;N</span> Mirar &nbsp;&middot;&nbsp;
          <span class="key">W</span><span class="key">S</span> Avanzar &nbsp;&middot;&nbsp;
          <span class="key">A</span><span class="key">D</span> Lateral &nbsp;&middot;&nbsp;
          <span class="key">SPACE</span> Nitro<br/>
          Ac&eacute;rcate a un planeta y pulsa <span class="key">E</span> para entrar
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
        <span class="key">SPACE</span> nitro
        <span class="key">SHIFT</span> freno
        <span class="key">E</span> entrar
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
      dwellProgress: number;
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
    if (approaching) {
      const a = info.approaching!;
      this.reticleLabel.textContent = `Pulsa E · ${a.name}`;
      // Anillo lleno como marcador estático (la entrada es por tecla E, no por permanencia).
      this.dwellRing.style.strokeDashoffset = '0';
      // Panel de info del proyecto (esquina): nombre + descripción + texto editable.
      this.panelName.textContent = a.name;
      this.panelDesc.textContent = a.description ?? '';
      this.panelBlurb.textContent = a.blurb ?? '';
      this.projectPanel.classList.add('visible');
    } else {
      this.reticleLabel.textContent = '';
      this.dwellRing.style.strokeDashoffset = String(this.ringCircumference);
      this.projectPanel.classList.remove('visible');
    }
  }

  hideStartMessage() {
    this.startMsg.classList.add('hidden');
  }

  dispose() {
    this.root.remove();
  }
}
