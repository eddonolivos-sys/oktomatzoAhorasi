import { Game } from './Game';

export class HUD {
  private root: HTMLElement;
  private healthFill: HTMLElement;
  private hazardCounter: HTMLElement;
  private waveTimer: HTMLElement;
  private cooldownRing: HTMLElement;
  private messageEl: HTMLElement;
  private messageTimer = 0;
  private menuBtn: HTMLElement;
  private debugBtn: HTMLElement;

  constructor(onMenu: () => void) {
    this.root = document.getElementById('hud-root')!;

    this.root.innerHTML = `
      <div class="hud-container">
        <div class="health-bar-bg">
          <div class="health-bar-fill" id="health-fill" style="width:100%;background:#2ed573;"></div>
        </div>
        <div class="hazard-counter" id="hazard-counter">Objetos: 0</div>
        <div class="wave-timer" id="wave-timer">Próxima oleada: 5.0s</div>
        <div class="cooldown-ring" id="cooldown-ring">✓</div>
        <div class="hud-message" id="hud-message"></div>
        <button class="menu-btn-hud" id="hud-menu-btn">⏸ Menú</button>
        <button class="debug-toggle" id="hud-debug">Hitboxes: OFF</button>
      </div>
    `;

    this.healthFill = document.getElementById('health-fill')!;
    this.hazardCounter = document.getElementById('hazard-counter')!;
    this.waveTimer = document.getElementById('wave-timer')!;
    this.cooldownRing = document.getElementById('cooldown-ring')!;
    this.messageEl = document.getElementById('hud-message')!;
    this.menuBtn = document.getElementById('hud-menu-btn')!;
    this.debugBtn = document.getElementById('hud-debug')!;

    this.menuBtn.addEventListener('click', onMenu);
    this.debugBtn.addEventListener('click', () => {
      Game.showHitboxes = !Game.showHitboxes;
      this.debugBtn.textContent = `Hitboxes: ${Game.showHitboxes ? 'ON' : 'OFF'}`;
    });
  }

  updateHealth(health: number, max: number) {
    const pct = (health / max) * 100;
    this.healthFill.style.width = `${Math.max(0, pct)}%`;
    if (pct > 60) this.healthFill.style.background = '#2ed573';
    else if (pct > 30) this.healthFill.style.background = '#ffa502';
    else this.healthFill.style.background = '#ff4757';
  }

  updateHazardCount(count: number) {
    this.hazardCounter.textContent = `Objetos: ${count}`;
  }

  updateWaveTimer(progress: number, interval: number) {
    const remaining = Math.max(0, interval * (1 - progress));
    this.waveTimer.textContent = `Próxima oleada: ${remaining.toFixed(1)}s`;
  }

  updateCooldown(ready: boolean, progress: number) {
    this.cooldownRing.classList.toggle('active', !ready);
    this.cooldownRing.textContent = ready ? '✓' : `${Math.ceil(progress * 100)}%`;
  }

  showMessage(text: string, type: 'damage' | 'info' | 'death' | 'warning', duration = 2) {
    this.messageEl.textContent = text;
    this.messageEl.className = `hud-message visible ${type}`;
    this.messageTimer = duration;
  }

  updateMessageTimer(dt: number) {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) {
        this.messageEl.classList.remove('visible');
        this.messageEl.className = 'hud-message';
      }
    }
  }

  updateDebugLabel() {
    this.debugBtn.textContent = `Hitboxes: ${Game.showHitboxes ? 'ON' : 'OFF'}`;
  }

  destroy() {
    this.root.innerHTML = '';
  }
}
