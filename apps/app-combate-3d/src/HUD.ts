import { Game } from './Game';

type PowerKey = 'dash' | 'shield' | 'attract' | 'repel' | 'invis' | 'teleport';

const POWER_ICONS: Record<PowerKey, string> = {
  dash: '💨',
  shield: '🛡️',
  attract: '🧲',
  repel: '💥',
  invis: '👻',
  teleport: '⚡',
};

const POWER_LABELS: Record<PowerKey, string> = {
  dash: 'Q',
  shield: 'F',
  attract: 'C',
  repel: 'V',
  invis: 'Z',
  teleport: 'E',
};

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
  private scoreEl: HTMLElement;
  private pickupHint: HTMLElement;
  private powerEls: Map<PowerKey, HTMLElement> = new Map();

  constructor(onMenu: () => void) {
    this.root = document.getElementById('hud-root')!;

    const powerSlots = (Object.keys(POWER_ICONS) as PowerKey[]).map(k => `
      <div id="power-${k}" class="power-slot" style="width:44px;height:44px;border-radius:8px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10px;position:relative;">
        <span style="font-size:16px;line-height:1">${POWER_ICONS[k]}</span>
        <span style="font-size:9px;color:#888;margin-top:1px">${POWER_LABELS[k]}</span>
        <div id="power-overlay-${k}" style="position:absolute;inset:0;border-radius:8px;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;font-size:11px;color:#ff6b6b;font-weight:700;"></div>
      </div>
    `).join('');

    this.root.innerHTML = `
      <div class="hud-container">
        <div class="health-bar-bg">
          <div class="health-bar-fill" id="health-fill" style="width:100%;background:#2ed573;"></div>
        </div>
        <div class="hazard-counter" id="hazard-counter">Objetos: 0</div>
        <div class="wave-timer" id="wave-timer">Próxima oleada: 5.0s</div>
        <div class="cooldown-ring" id="cooldown-ring">✓</div>
        <div class="hud-message" id="hud-message"></div>
        <div style="position:absolute;top:70px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.6);padding:6px 14px;border-radius:8px;font-size:14px;border:1px solid rgba(0,255,136,0.3);" id="score-display">🏆 Puntos: 0</div>
        <div style="position:absolute;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.5);padding:4px 10px;border-radius:6px;font-size:11px;color:#aaa;display:none;" id="pickup-hint">Suelta Shift para soltar | Lleva el objeto a un aro verde</div>
        <div style="position:absolute;bottom:20px;right:20px;display:flex;gap:6px;" id="power-bar">${powerSlots}</div>
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
    this.scoreEl = document.getElementById('score-display')!;
    this.pickupHint = document.getElementById('pickup-hint')!;

    for (const k of Object.keys(POWER_ICONS) as PowerKey[]) {
      this.powerEls.set(k, document.getElementById(`power-overlay-${k}`)!);
    }

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

  updateHazardCount(count: number) { this.hazardCounter.textContent = `Objetos: ${count}`; }
  updateWaveTimer(progress: number, interval: number) {
    this.waveTimer.textContent = `Próxima oleada: ${Math.max(0, interval * (1 - progress)).toFixed(1)}s`;
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
      if (this.messageTimer <= 0) { this.messageEl.classList.remove('visible'); this.messageEl.className = 'hud-message'; }
    }
  }

  updateDebugLabel() { this.debugBtn.textContent = `Hitboxes: ${Game.showHitboxes ? 'ON' : 'OFF'}`; }

  updatePowerCooldowns(cooldowns: Record<string, number>, fractions: Record<string, number>) {
    for (const [k, el] of this.powerEls) {
      const cd = fractions[k] || 0;
      if (cd > 0) {
        el.style.display = 'flex';
        el.textContent = `${Math.ceil((cooldowns[k] || 0) * 10) / 10}s`;
      } else {
        el.style.display = 'none';
      }
    }
  }

  updateScore(score: number) { this.scoreEl.textContent = `🏆 Puntos: ${score}`; }
  updatePickupHint(visible: boolean) { this.pickupHint.style.display = visible ? 'block' : 'none'; }

  destroy() { this.root.innerHTML = ''; }
}
