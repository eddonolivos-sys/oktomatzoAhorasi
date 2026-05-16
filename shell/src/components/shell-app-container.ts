import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import type { AppInfo } from '../services/protocol';

export class ShellAppContainer extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      width: 100%;
    }

    .container {
      height: 100%;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .empty-state {
      text-align: center;
      color: var(--shell-text-secondary);
      padding: 40px;
    }

    .empty-state h2 {
      font-size: 20px;
      font-weight: 600;
      margin: 0 0 8px;
      color: var(--shell-text);
    }

    .empty-state p {
      font-size: 14px;
      margin: 0;
      line-height: 1.5;
    }

    .iframe-wrapper {
      height: 100%;
      width: 100%;
      position: relative;
    }

    iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: white;
    }

    .loading {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--shell-bg);
      color: var(--shell-text-secondary);
      font-size: 14px;
      z-index: 1;
      transition: opacity 0.3s;
    }

    .loading.hidden {
      opacity: 0;
      pointer-events: none;
    }

    .error {
      text-align: center;
      padding: 40px;
      color: var(--shell-error);
    }

    .error h3 {
      margin: 0 0 8px;
    }

    .retry-btn {
      margin-top: 12px;
      padding: 8px 20px;
      background: var(--shell-accent);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
  `;

  @property({ type: Object })
  app: AppInfo | null = null;

  @property({ type: String })
  theme: 'light' | 'dark' = 'light';

  private loading = true;
  private error = false;
  private iframeRef: HTMLIFrameElement | null = null;

  updated(changed: Map<string, unknown>) {
    if (changed.has('app')) {
      this.loading = true;
      this.error = false;
    }
  }

  private handleLoad() {
    this.loading = false;
  }

  private handleError() {
    this.loading = false;
    this.error = true;
  }

  private retry() {
    this.loading = true;
    this.error = false;
    const iframe = this.iframeRef;
    if (iframe) {
      iframe.src = iframe.src;
    }
  }

  render() {
    if (!this.app) {
      return html`
        <div class="container">
          <div class="empty-state">
            <h2>Selecciona una aplicación</h2>
            <p>Elige una aplicación del menú lateral para comenzar.</p>
          </div>
        </div>
      `;
    }

    if (this.error) {
      return html`
        <div class="container">
          <div class="error">
            <h3>Error al cargar la aplicación</h3>
            <p>No se pudo cargar "${this.app.name}".</p>
            <button class="retry-btn" @click=${this.retry}>Reintentar</button>
          </div>
        </div>
      `;
    }

    return html`
      <div class="iframe-wrapper">
        <div class="loading ${this.loading ? '' : 'hidden'}">Cargando ${this.app.name}...</div>
        <iframe
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
