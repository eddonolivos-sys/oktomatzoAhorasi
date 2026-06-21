/**
 * Menú de pausa con cursor. Un overlay a pantalla completa que muestra el
 * cursor (el host recupera pointer-events) con botones "Reanudar control",
 * "Controles", "Cerrar sesión". El cuándo abrirlo (intercepción del primer
 * ESC vía pointerlockchange) lo decide space-engine; esta clase solo dibuja
 * el overlay y emite callbacks. Sin Three.js. Estilos en space.css.
 */
export class PauseMenu {
  private root: HTMLDivElement;
  private controlsPanel: HTMLElement;
  private _visible = false;

  constructor(host: HTMLElement, cb: { onResume: () => void; onLogout: () => void }) {
    this.root = document.createElement('div');
    this.root.id = 'pauseMenu';
    this.root.innerHTML = `
      <div class="panel">
        <h3>Pausa</h3>
        <button data-act="resume">Reanudar control</button>
        <button data-act="controls">Controles</button>
        <button data-act="logout">Cerrar sesi&oacute;n</button>
        <div class="controls-panel" hidden>
          <p>
            <span class="key">RAT&Oacute;N</span> mirar<br/>
            <span class="key">W</span> avanzar &middot; <span class="key">S</span>/<span class="key">SHIFT</span> freno<br/>
            <span class="key">A</span><span class="key">D</span> desplazamiento lateral<br/>
            <span class="key">SPACE</span> nitro<br/>
            <span class="key">ESC</span> abrir / cerrar este men&uacute;<br/>
            Acerca la nave a un planeta y mant&eacute;n el rumbo para entrar.
          </p>
        </div>
      </div>`;
    host.appendChild(this.root);

    this.controlsPanel = this.root.querySelector('.controls-panel') as HTMLElement;

    this.root.querySelector('[data-act="resume"]')!.addEventListener('click', () => cb.onResume());
    this.root.querySelector('[data-act="controls"]')!.addEventListener('click', () => {
      this.controlsPanel.hidden = !this.controlsPanel.hidden;
    });
    this.root.querySelector('[data-act="logout"]')!.addEventListener('click', () => cb.onLogout());
  }

  open() {
    this._visible = true;
    this.controlsPanel.hidden = true;
    this.root.classList.add('visible');
  }

  close() {
    this._visible = false;
    this.root.classList.remove('visible');
  }

  get visible(): boolean {
    return this._visible;
  }

  dispose() {
    this.root.remove();
  }
}
