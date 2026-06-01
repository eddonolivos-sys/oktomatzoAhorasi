import { LitElement, html, css } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { AppInfo } from '../services/protocol';

export class ShellAppContainer extends LitElement {
  static styles = css`
    /* ── Keyframes ── */
    @keyframes pulseRing {
      0%   { transform: scale(0.7); opacity: 0.9; }
      100% { transform: scale(1.7); opacity: 0; }
    }
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes moduleIn {
      from { opacity: 0; transform: translateX(18px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes gridFloat {
      0%   { background-position: 0 0; }
      100% { background-position: 48px 48px; }
    }
    @keyframes orbDrift {
      0%, 100% { transform: translate(0,0) scale(1); }
      50%       { transform: translate(30px,-30px) scale(1.05); }
    }
    @keyframes shimmerText {
      0%   { background-position: 0% center; }
      100% { background-position: 200% center; }
    }

    /* ── Base ── */
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
      background: var(--shell-bg);
    }

    /* 3D perspective grid floor */
    .grid-3d {
      position: absolute;
      bottom: -10px;
      left: -15%;
      right: -15%;
      height: 55%;
      background-image:
        linear-gradient(rgba(99,102,241,0.22) 1px, transparent 1px),
        linear-gradient(90deg, rgba(99,102,241,0.22) 1px, transparent 1px);
      background-size: 48px 48px;
      animation: gridFloat 6s linear infinite;
      transform: perspective(700px) rotateX(72deg);
      transform-origin: bottom center;
      mask-image: linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 45%, transparent 100%);
      -webkit-mask-image: linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 45%, transparent 100%);
      pointer-events: none;
    }

    /* Top vignette */
    .welcome-vignette {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse 70% 60% at 50% 30%, transparent 30%, var(--shell-bg) 90%);
      pointer-events: none;
    }

    /* Orbs */
    .w-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(60px);
      pointer-events: none;
    }
    .w-orb-1 {
      width: 320px; height: 320px;
      background: radial-gradient(circle, rgba(99,102,241,0.2), transparent 70%);
      top: 5%; left: 5%;
      animation: orbDrift 10s ease-in-out infinite;
    }
    .w-orb-2 {
      width: 250px; height: 250px;
      background: radial-gradient(circle, rgba(167,139,250,0.16), transparent 70%);
      bottom: 15%; right: 8%;
      animation: orbDrift 13s ease-in-out infinite reverse;
    }

    /* Content */
    .welcome-content {
      position: relative;
      z-index: 10;
      text-align: center;
      padding: 40px;
      animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .welcome-wordmark {
      font-size: 68px;
      font-weight: 800;
      letter-spacing: 0.02em;
      line-height: 1;
      margin-bottom: 24px;
      background: linear-gradient(
        135deg,
        var(--shell-text) 0%,
        var(--shell-accent-2) 38%,
        var(--shell-accent) 62%,
        var(--shell-text) 100%
      );
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: shimmerText 5s linear infinite;
      user-select: none;
    }
    .welcome-wordmark-dot { color: var(--shell-accent); }

    .welcome-content h2 {
      font-size: 21px;
      font-weight: 600;
      margin: 0 0 10px;
      color: var(--shell-text);
      letter-spacing: -0.01em;
    }
    .welcome-content p {
      font-size: 14px;
      color: var(--shell-text-secondary);
      margin: 0 auto;
      max-width: 260px;
      line-height: 1.7;
    }

    /* Kbd hint */
    .welcome-hint {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 28px;
      padding: 7px 14px;
      border-radius: 8px;
      border: 1px solid var(--shell-border-bright);
      background: var(--shell-surface);
      font-size: 12px;
      color: var(--shell-text-secondary);
    }
    .hint-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--shell-accent);
      box-shadow: 0 0 8px var(--shell-accent-glow);
    }

    /* ── Module wrapper (iframe) ── */
    .module-wrapper {
      height: 100%;
      width: 100%;
      position: relative;
      overflow: hidden;
      opacity: 0;
      transform: translateX(18px);
      transition: opacity 0.38s ease, transform 0.38s ease;
    }
    .module-wrapper.visible {
      opacity: 1;
      transform: translateX(0);
    }

    iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: white;
      opacity: 0;
      transition: opacity 0.4s ease;
    }
    iframe.loaded { opacity: 1; }

    /* Loading overlay */
    .loading-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      background: var(--shell-bg);
      z-index: 5;
      transition: opacity 0.3s ease;
    }
    .loading-overlay.hidden { opacity: 0; pointer-events: none; }

    /* Pulsing rings loader */
    .loader {
      position: relative;
      width: 44px;
      height: 44px;
    }
    .loader-ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 2px solid var(--shell-accent);
      opacity: 0;
      animation: pulseRing 1.4s ease-out infinite;
    }
    .loader-ring:nth-child(2) { animation-delay: 0.45s; }
    .loader-ring:nth-child(3) { animation-delay: 0.90s; }
    .loader-core {
      position: absolute;
      inset: 30%;
      border-radius: 50%;
      background: var(--shell-accent);
      box-shadow: 0 0 14px var(--shell-accent-glow);
    }
    .loading-text {
      font-size: 13px;
      font-weight: 500;
      color: var(--shell-text-secondary);
      letter-spacing: 0.02em;
    }

    /* Error */
    .error-state {
      height: 100%;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .error-box {
      text-align: center;
      padding: 50px 40px;
      animation: fadeInUp 0.35s ease forwards;
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
      border-radius: 10px;
      font-size: 13.5px;
      font-family: inherit;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 16px var(--shell-accent-shadow);
      transition: transform 0.16s ease, box-shadow var(--shell-transition);
    }
    .retry-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px var(--shell-accent-shadow); }
    .retry-btn:active { transform: translateY(0); }
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
      // Slight delay before sliding in the wrapper
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
          <div class="grid-3d"></div>
          <div class="welcome-vignette"></div>
          <div class="w-orb w-orb-1"></div>
          <div class="w-orb w-orb-2"></div>
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
          <div class="loader">
            <div class="loader-ring"></div>
            <div class="loader-ring"></div>
            <div class="loader-ring"></div>
            <div class="loader-core"></div>
          </div>
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
