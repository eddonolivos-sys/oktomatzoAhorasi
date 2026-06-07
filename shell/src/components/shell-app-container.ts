import { LitElement, html, css } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { AppInfo } from '../services/protocol';

export class ShellAppContainer extends LitElement {
  static styles = css`
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes barIndeterminate {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(420%); }
    }

    :host { display: block; height: 100%; width: 100%; }

    /* ── Empty state ── */
    .welcome {
      height: 100%;
      width: 100%;
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background:
        radial-gradient(120% 70% at 50% -10%, var(--shell-surface-2), transparent 60%),
        var(--shell-bg);
    }
    .welcome-texture {
      position: absolute;
      inset: 0;
      background-image: radial-gradient(var(--shell-grain) 1px, transparent 1px);
      background-size: 4px 4px;
      pointer-events: none;
    }
    .welcome-content {
      position: relative;
      z-index: 10;
      text-align: center;
      padding: 40px;
      animation: fadeInUp 0.5s var(--ease-out) both;
    }
    .welcome-wordmark {
      font-size: 56px;
      font-weight: 700;
      letter-spacing: 0.01em;
      line-height: 1;
      margin-bottom: 20px;
      color: var(--shell-text);
      user-select: none;
    }
    .welcome-wordmark-dot { color: var(--shell-accent); }

    .welcome-content h2 {
      font-size: 20px;
      font-weight: 600;
      margin: 0 0 10px;
      color: var(--shell-text);
      letter-spacing: -0.01em;
    }
    .welcome-content p {
      font-size: 14px;
      color: var(--shell-text-secondary);
      margin: 0 auto;
      max-width: 280px;
      line-height: 1.7;
    }

    .welcome-hint {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 26px;
      padding: 7px 14px;
      border-radius: var(--shell-radius);
      border: 1px solid var(--shell-border);
      background: var(--shell-surface);
      box-shadow: var(--shell-elev-1);
      font-size: 12px;
      color: var(--shell-text-secondary);
    }
    .hint-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: var(--shell-accent);
    }

    /* ── Module wrapper (iframe) ── */
    .module-wrapper {
      height: 100%;
      width: 100%;
      position: relative;
      overflow: hidden;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity var(--shell-transition-smooth), transform var(--shell-transition-smooth);
    }
    .module-wrapper.visible {
      opacity: 1;
      transform: translateY(0);
    }

    iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: #fff;
      opacity: 0;
      transition: opacity var(--dur-slow) var(--ease-out);
    }
    iframe.loaded { opacity: 1; }

    /* Velo de carga */
    .loading-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 18px;
      background: var(--shell-bg);
      z-index: 5;
      transition: opacity var(--dur-slow) var(--ease-out);
    }
    .loading-overlay.hidden { opacity: 0; pointer-events: none; }

    /* Barra de progreso indeterminada (minimalista) */
    .progress {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      overflow: hidden;
      background: var(--shell-border);
    }
    .progress::before {
      content: '';
      position: absolute;
      top: 0; left: 0;
      height: 100%;
      width: 24%;
      background: var(--shell-accent);
      animation: barIndeterminate 1.1s var(--ease-inout) infinite;
    }
    .loading-text {
      font-size: 13px;
      font-weight: 500;
      color: var(--shell-text-secondary);
      letter-spacing: 0.01em;
    }

    /* Error */
    .error-state {
      height: 100%;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--shell-bg);
    }
    .error-box {
      text-align: center;
      padding: 50px 40px;
      animation: fadeInUp 0.4s var(--ease-out) both;
    }
    .error-box h3 {
      font-size: 18px; font-weight: 600;
      color: var(--shell-text); margin: 0 0 8px;
    }
    .error-box p {
      font-size: 14px; color: var(--shell-text-secondary);
      margin: 0 0 22px; line-height: 1.55;
    }
    .retry-btn {
      padding: 10px 24px;
      background: var(--shell-accent);
      color: #fff;
      border: none;
      border-radius: var(--shell-radius);
      font-size: 13.5px;
      font-family: inherit;
      font-weight: 600;
      cursor: pointer;
      box-shadow: var(--shell-elev-1);
      transition: transform var(--dur-fast) var(--ease-out), background var(--shell-transition), box-shadow var(--shell-transition);
    }
    .retry-btn:hover { background: var(--shell-accent-hover); transform: translateY(-1px); box-shadow: var(--shell-elev-2); }
    .retry-btn:active { transform: translateY(0) scale(0.99); }
  `;

  @property({ type: Object }) app: AppInfo | null = null;
  @property({ type: String }) theme: 'light' | 'dark' = 'light';

  @state() private loading = true;
  @state() private error = false;
  @state() private iframeLoaded = false;
  @state() private moduleVisible = false;

  updated(changed: Map<string, unknown>) {
    if (changed.has('app')) {
      this.loading = true;
      this.error = false;
      this.iframeLoaded = false;
      this.moduleVisible = false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { this.moduleVisible = true; });
      });
    }
  }

  private handleLoad() {
    this.loading = false;
    requestAnimationFrame(() => { this.iframeLoaded = true; });
  }

  private handleError() {
    this.loading = false;
    this.error = true;
  }

  private retry() {
    this.loading = true;
    this.error = false;
    this.iframeLoaded = false;
    this.moduleVisible = false;
    this.requestUpdate();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { this.moduleVisible = true; });
    });
  }

  render() {
    if (!this.app) {
      return html`
        <div class="welcome">
          <div class="welcome-texture"></div>
          <div class="welcome-content">
            <div class="welcome-wordmark">Ramatzo<span class="welcome-wordmark-dot">.</span></div>
            <h2>Bienvenido</h2>
            <p>Selecciona una aplicación del panel lateral para comenzar.</p>
            <div class="welcome-hint">
              <span class="hint-dot"></span>
              Elige una app en el menú
            </div>
          </div>
        </div>
      `;
    }

    if (this.error) {
      return html`
        <div class="error-state">
          <div class="error-box">
            <h3>Error al cargar</h3>
            <p>No se pudo cargar "${this.app.name}".<br>Verifica tu conexión e intenta de nuevo.</p>
            <button class="retry-btn" @click=${this.retry}>Reintentar</button>
          </div>
        </div>
      `;
    }

    return html`
      <div class="module-wrapper ${this.moduleVisible ? 'visible' : ''}">
        <div class="loading-overlay ${this.loading ? '' : 'hidden'}">
          <div class="progress"></div>
          <span class="loading-text">Cargando ${this.app.name}…</span>
        </div>
        <iframe
          class="${this.iframeLoaded ? 'loaded' : ''}"
          .src=${this.app.src}
          sandbox=${this.app.sandbox}
          title=${this.app.name}
          @load=${this.handleLoad}
          @error=${this.handleError}
        ></iframe>
      </div>
    `;
  }
}

customElements.define('shell-app-container', ShellAppContainer);
