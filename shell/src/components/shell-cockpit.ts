import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import type { AppInfo } from '../services/protocol';
import './shell-app-container';

/**
 * Vista de cabina: marco metálico con remaches y scan-line que enmarca el módulo.
 * Reutiliza <shell-app-container> SIN cambios (iframe real, estados de carga, tema).
 * Emite `back` (volver al espacio) y `logout`.
 */
export class ShellCockpit extends LitElement {
  @property({ type: Object }) app: AppInfo | null = null;
  @property({ type: String }) theme: 'light' | 'dark' = 'dark';

  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 120;
      display: flex;
      flex-direction: column;
      background: rgba(10, 5, 3, 0.95);
      font-family: var(--font-serif, 'Cinzel', serif);
    }
    .titlebar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 24px;
      background: var(--metal-iron, #3a2a20);
      border-bottom: 1px solid var(--metal-steel, #5a4a3a);
      font-size: 12px;
      letter-spacing: 0.08em;
      color: var(--space-text-2, #8a7a6a);
    }
    .project-name {
      color: var(--orange-amber, #e6a817);
      font-family: var(--font-display, 'Cinzel Decorative', serif);
      font-size: 14px;
      letter-spacing: 0.12em;
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    .actions button {
      padding: 6px 18px;
      border: 1px solid var(--metal-steel, #5a4a3a);
      border-radius: 4px;
      background: transparent;
      color: var(--space-text, #c8b898);
      font-family: inherit;
      font-size: 11px;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      transition: all 0.3s;
    }
    .actions button:hover {
      border-color: var(--orange-burnt, #c84b31);
      color: var(--orange-burnt, #c84b31);
    }
    .actions button.danger:hover {
      border-color: var(--orange-ember, #ff6b35);
      color: var(--orange-ember, #ff6b35);
    }
    .frame {
      flex: 1;
      position: relative;
      margin: 40px;
      border: 2px solid var(--metal-iron, #3a2a20);
      border-radius: 16px;
      background: var(--space-deep, #0a0503);
      box-shadow: inset 0 0 80px rgba(58, 42, 32, 0.5), 0 0 40px rgba(0, 0, 0, 0.8);
    }
    .screen {
      position: absolute;
      inset: 20px;
      border: 1px solid var(--metal-brass, #8b7a5a);
      border-radius: 8px;
      overflow: hidden;
      background: var(--space-dark, #1a0e08);
    }
    .scan-line {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 2;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(200, 184, 152, 0.02) 2px,
        rgba(200, 184, 152, 0.02) 4px
      );
    }
    shell-app-container {
      display: block;
      width: 100%;
      height: 100%;
    }
    .rivets {
      position: absolute;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--metal-copper, #b86a3a);
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
    }
    .rivets.tl { top: 8px; left: 8px; }
    .rivets.tr { top: 8px; right: 8px; }
    .rivets.bl { bottom: 8px; left: 8px; }
    .rivets.br { bottom: 8px; right: 8px; }
    .controls {
      display: flex;
      gap: 14px;
      align-items: center;
      padding: 12px 24px;
      background: var(--metal-iron, #3a2a20);
      border-top: 1px solid var(--metal-steel, #5a4a3a);
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 9px;
      color: var(--space-text-dim, #5a4a3a);
      letter-spacing: 0.05em;
    }
    .controls .indicator {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .controls .dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
    }
    .controls .dot.green { background: var(--space-success, #6b8a3a); }
    .controls .dot.amber { background: var(--space-warning, #d4a017); }
    .controls .spacer { flex: 1; }
    @media (max-width: 768px) {
      .frame { margin: 12px; }
      .screen { inset: 10px; }
    }
  `;

  private onKey = (e: KeyboardEvent) => {
    // Salir del proyecto al mapa con Esc (además del botón "Volver al espacio").
    if (e.code === 'Escape') {
      e.preventDefault();
      this.dispatchEvent(new CustomEvent('back'));
    }
  };

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.onKey);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.onKey);
  }

  render() {
    return html`
      <div class="titlebar">
        <span class="project-name">${this.app?.name ?? ''}</span>
        <div class="actions">
          <button @click=${() => this.dispatchEvent(new CustomEvent('back'))}>Volver al espacio (Esc)</button>
          <button
            class="danger"
            @click=${() => this.dispatchEvent(new CustomEvent('logout', { bubbles: true, composed: true }))}
          >
            Salir
          </button>
        </div>
      </div>
      <div class="frame">
        <div class="screen">
          <div class="scan-line"></div>
          <shell-app-container .app=${this.app} .theme=${this.theme}></shell-app-container>
        </div>
        <div class="rivets tl"></div>
        <div class="rivets tr"></div>
        <div class="rivets bl"></div>
        <div class="rivets br"></div>
      </div>
      <div class="controls">
        <span style="color:var(--orange-amber,#e6a817);font-weight:500;">Esc &middot; Volver al mapa</span>
        <span>SISTEMAS</span>
        <span class="indicator"><span class="dot green"></span> Navegación</span>
        <span class="indicator"><span class="dot green"></span> Comunicación</span>
        <span class="indicator"><span class="dot green"></span> Energía</span>
        <span class="spacer"></span>
        <span class="indicator"><span class="dot amber"></span> Escudo 98%</span>
      </div>
    `;
  }
}

customElements.define('shell-cockpit', ShellCockpit);
