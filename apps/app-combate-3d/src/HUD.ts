import { Game } from './Game';

type PowerKey = 'dash' | 'shield' | 'attract' | 'repel' | 'invis' | 'teleport';

const SVG = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

const POWER_ICONS: Record<PowerKey, string> = {
  dash: SVG('<polyline points="13 5 20 12 13 19"/><polyline points="4 5 11 12 4 19"/>'),
  shield: SVG('<path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/>'),
  attract: SVG('<path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="5" y1="4" x2="9" y2="4"/><line x1="15" y1="4" x2="19" y2="4"/>'),
  repel: SVG('<line x1="12" y1="3" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="3" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="21" y2="12"/><line x1="6" y1="6" x2="8.5" y2="8.5"/><line x1="15.5" y1="15.5" x2="18" y2="18"/><line x1="18" y1="6" x2="15.5" y2="8.5"/><line x1="8.5" y1="15.5" x2="6" y2="18"/>'),
  invis: SVG('<path d="M3 3l18 18"/><path d="M10.6 5.1A9 9 0 0 1 21 12a16 16 0 0 1-2.1 2.9"/><path d="M6.6 6.6A16 16 0 0 0 3 12a9 9 0 0 0 12 5.3"/>'),
  teleport: SVG('<path d="M13 2 4 14h7l-1 8 10-13h-7z"/>'),
};

const POWER_LABELS: Record<PowerKey, string> = {
  dash: 'Q',
  shield: 'F',
  attract: 'C',
  repel: 'V',
  invis: 'Z',
  teleport: 'E',
};

const CHECK_SVG = SVG('<polyline points="5 12 10 17 19 7"/>');
const PAUSE_SVG = SVG('<line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/>');

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
      <div id="power-${k}" class="power-slot" style="width:44px;height:44px;border-radius:10px;background:rgba(2,6,18,0.55);border:1px solid rgba(255,255,255,0.16);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;position:relative;backdrop-filter:blur(6px);">
        <span style="line-height:0">${POWER_ICONS[k]}</span>
        <span style="font-size:9px;color:#8892a4;letter-spacing:0.04em">${POWER_LABELS[k]}</span>
        <div id="power-overlay-${k}" style="position:absolute;inset:0;border-radius:10px;background:rgba(2,6,18,0.78);display:flex;align-items:center;justify-content:center;font-size:11px;color:#f59e0b;font-weight:700;"></div>
      </div>
    `).join('');

    this.root.innerHTML = `
      <div class="hud-container">
        <div class="health-bar-bg">
          <div class="health-bar-fill" id="health-fill" style="width:100%;background:#22c55e;"></div>
        </div>
        <div class="hazard-counter" id="hazard-counter">Objetos: 0</div>
        <div class="wave-timer" id="wave-timer">Próxima oleada: 5.0s</div>
        <div class="cooldown-ring" id="cooldown-ring">${CHECK_SVG}</div>
        <div class="hud-message" id="hud-message"></div>
        <div style="position:absolute;top:70px;left:50%;transform:translateX(-50%);background:rgba(2,6,18,0.6);padding:6px 14px;border-radius:10px;font-size:13px;color:#eef2ff;border:1px solid rgba(255,255,255,0.16);backdrop-filter:blur(6px);" id="score-display">Puntos: 0</div>
        <div style="position:absolute;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(2,6,18,0.5);padding:4px 10px;border-radius:6px;font-size:11px;color:#8892a4;display:none;" id="pickup-hint">Suelta Shift para soltar · Lleva el objeto a un aro verde</div>
        <div style="position:absolute;bottom:20px;right:20px;display:flex;gap:6px;" id="power-bar">${powerSlots}</div>
        <button class="menu-btn-hud" id="hud-menu-btn">${PAUSE_SVG}Menú</button>
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
    if (pct > 60) this.healthFill.style.background = '#22c55e';
    else if (pct > 30) this.healthFill.style.background = '#f59e0b';
    else this.healthFill.style.background = '#f43f5e';
  }

  updateHazardCount(count: number) { this.hazardCounter.textContent = `Objetos: ${count}`; }
  updateWaveTimer(progress: number, interval: number) {
    this.waveTimer.textContent = `Próxima oleada: ${Math.max(0, interval * (1 - progress)).toFixed(1)}s`;
  }
  updateCooldown(ready: boolean, progress: number) {
    this.cooldownRing.classList.toggle('active', !ready);
    this.cooldownRing.innerHTML = ready ? CHECK_SVG : `${Math.ceil(progress * 100)}%`;
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

  updateScore(score: number) { this.scoreEl.textContent = `Puntos: ${score}`; }
  updatePickupHint(visible: boolean) { this.pickupHint.style.display = visible ? 'block' : 'none'; }

  destroy() { this.root.innerHTML = ''; }
}
