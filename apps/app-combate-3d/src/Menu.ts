export interface MenuCallbacks {
  onStart: () => void;
  onTutorial: () => void;
  onToggleEffects: (val: boolean) => void;
  onToggleHitboxes: (val: boolean) => void;
}

export class Menu {
  private root: HTMLElement;
  private cb: MenuCallbacks;
  private effectsOn = true;
  private hitboxesOn = false;

  constructor(cb: MenuCallbacks) {
    this.cb = cb;
    this.root = document.getElementById('menu-root')!;
  }

  show() {
    this.root.innerHTML = `
      <div class="menu-overlay" id="menu-screen">
        <div class="menu-card">
          <h1>COMBATE 3D</h1>
          <p>Combate en un terreno infinito. Esquiva, dispara y sobrevive.</p>

          <input class="menu-input" id="name-input" type="text" placeholder="Tu nombre de piloto" maxlength="16" autocomplete="off" />

          <button class="menu-btn primary" id="btn-start">INICIAR PARTIDA</button>
          <button class="menu-btn secondary" id="btn-tutorial">Tutorial rápido</button>
          <button class="menu-btn secondary" id="btn-effects">Efectos visuales: ON</button>
          <button class="menu-btn secondary" id="btn-hitboxes">Mostrar hitboxes: OFF</button>
        </div>
      </div>
    `;

    this.root.querySelector('#btn-start')!.addEventListener('click', () => this.cb.onStart());
    this.root.querySelector('#btn-tutorial')!.addEventListener('click', () => this.cb.onTutorial());

    const efBtn = this.root.querySelector('#btn-effects')!;
    efBtn.addEventListener('click', () => {
      this.effectsOn = !this.effectsOn;
      efBtn.textContent = `Efectos visuales: ${this.effectsOn ? 'ON' : 'OFF'}`;
      this.cb.onToggleEffects(this.effectsOn);
    });

    const hbBtn = this.root.querySelector('#btn-hitboxes')!;
    hbBtn.addEventListener('click', () => {
      this.hitboxesOn = !this.hitboxesOn;
      hbBtn.textContent = `Mostrar hitboxes: ${this.hitboxesOn ? 'ON' : 'OFF'}`;
      this.cb.onToggleHitboxes(this.hitboxesOn);
    });

    document.getElementById('name-input')!.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.cb.onStart();
    });
  }

  showTutorial() {
    const overlay = document.createElement('div');
    overlay.className = 'tutorial-overlay';
    overlay.innerHTML = `
      <div class="tutorial-card">
        <h2>Tutorial rápido</h2>
        <ul>
          <li><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> — Moverse (adelante, girar, atrás)</li>
          <li><kbd>Espacio</kbd> — Disparar (cooldown breve)</li>
          <li><kbd>C</kbd> — Cambiar distancia de cámara (cerca / lejos)</li>
          <li><kbd>R</kbd> — Reiniciar partida</li>
          <li><kbd>ESC</kbd> — Menú de pausa</li>
        </ul>
        <br />
        <p style="color:#f59e0b;font-size:14px;line-height:1.5;">Cuidado con los objetos rojos: si caen sobre ti, muerte instantánea. Si los tocas, pierdes vida.</p>
        <br />
        <button class="menu-btn primary" id="btn-back-menu">Volver al menú</button>
      </div>
    `;
    overlay.querySelector('#btn-back-menu')!.addEventListener('click', () => {
      overlay.remove();
      this.show();
    });
    document.body.appendChild(overlay);
  }

  showPauseMenu(onResume: () => void, onRestart: () => void) {
    this.root.innerHTML = `
      <div class="menu-overlay" id="pause-screen">
        <div class="menu-card">
          <h1>PAUSA</h1>
          <button class="menu-btn primary" id="btn-resume">REANUDAR</button>
          <button class="menu-btn secondary" id="btn-restart">REINICIAR PARTIDA</button>
          <button class="menu-btn danger" id="btn-quit">SALIR AL MENÚ</button>
        </div>
      </div>
    `;
    this.root.querySelector('#btn-resume')!.addEventListener('click', onResume);
    this.root.querySelector('#btn-restart')!.addEventListener('click', onRestart);
    this.root.querySelector('#btn-quit')!.addEventListener('click', () => {
      this.hidePause();
      this.show();
    });
  }

  showDeathMenu(onRestart: () => void) {
    this.root.innerHTML = `
      <div class="menu-overlay" id="death-screen">
        <div class="menu-card">
          <h1 style="color:#f43f5e">HAS MUERTO</h1>
          <p>Tu vehículo fue destruido.</p>
          <button class="menu-btn danger" id="btn-respawn">REAPARECER</button>
          <button class="menu-btn secondary" id="btn-quit-death">SALIR AL MENÚ</button>
        </div>
      </div>
    `;
    this.root.querySelector('#btn-respawn')!.addEventListener('click', onRestart);
    this.root.querySelector('#btn-quit-death')!.addEventListener('click', () => {
      this.hidePause();
      this.show();
    });
  }

  hide() {
    this.root.innerHTML = '';
  }

  hidePause() {
    this.root.innerHTML = '';
  }
}
