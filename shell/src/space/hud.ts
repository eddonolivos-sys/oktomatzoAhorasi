import type { FlightState } from './flight';
import { sectorOf } from './layout';

/**
 * Overlay HUD in-space (DOM en light DOM). Crea reticula, velocidad, barra nitro,
 * coordenadas/sector, vignette y mensaje de inicio. Estilos en space.css.
 */
export class Hud {
  private root: HTMLDivElement;
  private speedValue: HTMLElement;
  private speedUnit: HTMLElement;
  private nitroBar: HTMLElement;
  private nitroFill: HTMLElement;
  private sectorVal: HTMLElement;
  private zVal: HTMLElement;
  private sysVal: HTMLElement;
  private startMsg: HTMLElement;
  private strayWarn: HTMLElement;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.innerHTML = `
      <div id="vignette"></div>
      <div id="reticle"><div class="center-dot"></div></div>
      <div id="startMsg">
        <h1>Ramatzo</h1>
        <p>
          <span class="key">RAT&Oacute;N</span> Mirar &nbsp;&middot;&nbsp;
          <span class="key">W</span><span class="key">S</span> Avanzar &nbsp;&middot;&nbsp;
          <span class="key">A</span><span class="key">D</span> Lateral &nbsp;&middot;&nbsp;
          <span class="key">SPACE</span> Nitro<br/>
          Apunta con la mira a una constelaci&oacute;n y haz clic para entrar
        </p>
      </div>
      <div id="hud">
        <div class="speed-display"><span class="value" id="speedValue">0</span> <span id="speedUnit">U/s</span></div>
        <div class="speed-unit">Velocidad de crucero</div>
      </div>
      <div id="nitroBar"><div class="fill" id="nitroFill"></div></div>
      <div id="coords">
        <span class="label">SECTOR</span> <span id="sectorVal">0:0</span><br/>
        <span class="label">Z</span> <span id="zVal">0.00</span> AU<br/>
        <span class="label">SISTEMAS</span> <span id="sysVal">OK</span>
      </div>
      <div id="strayWarn"></div>`;
    host.appendChild(this.root);

    const q = (id: string) => this.root.querySelector('#' + id) as HTMLElement;
    this.speedValue = q('speedValue');
    this.speedUnit = q('speedUnit');
    this.nitroBar = q('nitroBar');
    this.nitroFill = q('nitroFill');
    this.sectorVal = q('sectorVal');
    this.zVal = q('zVal');
    this.sysVal = q('sysVal');
    this.startMsg = q('startMsg');
    this.strayWarn = q('strayWarn');
  }

  update(state: FlightState, worldX: number, worldZ: number, maxNitroSpeed: number) {
    this.speedValue.textContent = state.speed.toFixed(1);
    this.zVal.textContent = (Math.abs(worldZ) * 0.01).toFixed(2);

    const { sx, sz } = sectorOf(worldX, worldZ);
    this.sectorVal.textContent = `${sx}:${sz}`;

    if (state.isNitro) {
      this.nitroBar.classList.add('active');
      this.nitroFill.style.width = Math.min(100, (state.speed / maxNitroSpeed) * 100) + '%';
      this.speedUnit.textContent = 'NITRO';
      this.speedUnit.style.color = 'var(--orange-ember)';
    } else {
      this.nitroBar.classList.remove('active');
      this.speedUnit.textContent = 'U/s';
      this.speedUnit.style.color = '';
    }

    this.sysVal.textContent = 'OK';
  }

  hideStartMessage() {
    this.startMsg.classList.add('hidden');
  }

  /** Aviso de orientación cuando el jugador se aleja de la zona de proyectos. */
  setStray(straying: boolean, urgent: boolean) {
    if (straying) {
      this.strayWarn.textContent = urgent
        ? 'SIN RUMBO — regresa hacia los proyectos'
        : 'Te alejas de la zona de proyectos';
      this.strayWarn.classList.add('visible');
      this.strayWarn.classList.toggle('urgent', urgent);
    } else {
      this.strayWarn.classList.remove('visible');
    }
  }

  dispose() {
    this.root.remove();
  }
}
