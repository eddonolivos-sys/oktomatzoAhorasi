import { LitElement, html } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { AppInfo } from '../services/protocol';
import type { SpaceEngine } from '../space/space-engine';

/**
 * Host de la experiencia espacial. Renderiza en light DOM (createRenderRoot → this)
 * para que el canvas y los overlays del motor vivan en el documento (CSS global de
 * space.css). Carga el motor (y Three.js) con import dinámico post-login.
 *
 * Entrada a proyectos: vista DESACOPLADA. Al "entrar", el proyecto se abre en una
 * PESTAÑA/PÁGINA independiente (`window.open`); el mapa permanece vivo en su pestaña
 * (el motor se auto-pausa al perder el foco y reanuda al volver, vía visibilitychange),
 * así que regresar restaura el estado sin recargar. No hay overlay ni iframe del mapa.
 */
export class ShellSpace extends LitElement {
  protected createRenderRoot() {
    return this;
  }

  @property({ type: Array }) apps: AppInfo[] = [];
  @property({ type: String }) theme: 'light' | 'dark' = 'dark';
  @property({ type: Object }) user: { id: string; name: string } | null = null;

  @state() private webglOk = true;
  @state() private igniting = true;

  private engine: SpaceEngine | null = null;

  private hasWebGL(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  }

  async firstUpdated() {
    if (!this.hasWebGL()) {
      this.webglOk = false;
      return;
    }
    const host = this.renderRoot.querySelector('#space-host') as HTMLDivElement | null;
    if (!host) return;
    const mod = await import('../space/space-engine');
    this.engine = new mod.SpaceEngine();
    this.engine.mount(host, {
      apps: this.apps,
      user: this.user ?? undefined,
      onEnterApp: (app) => {
        // Vista de proyecto en PESTAÑA/PÁGINA independiente. El mapa sigue vivo en su
        // pestaña (se auto-pausa al perder foco y reanuda al volver). Sin overlay/iframe.
        const url = app.externalUrl || app.src;
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      },
      onLogout: () => this.dispatchEvent(new CustomEvent('logout', { bubbles: true, composed: true })),
    });

    window.setTimeout(() => {
      this.igniting = false;
    }, 1500);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.engine?.dispose();
    this.engine = null;
  }

  render() {
    if (!this.webglOk) {
      return html`
        <div
          style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
                 background:#0A0503;color:#C8B898;font-family:'Cinzel',serif;text-align:center;padding:40px;"
        >
          <div>
            <h2 style="color:#E6A817;font-family:'Cinzel Decorative',serif;letter-spacing:0.1em;">
              WebGL no disponible
            </h2>
            <p style="color:#8A7A6A;line-height:1.7;max-width:420px;">
              Esta experiencia requiere un navegador con aceleración WebGL.
              Activa la aceleración por hardware o usa un equipo compatible.
            </p>
          </div>
        </div>
      `;
    }
    return html`
      <div
        id="space-host"
        class=${this.igniting ? 'igniting' : ''}
        style="position:fixed;inset:0;overflow:hidden;background:#0A0503;"
      ></div>
      ${this.igniting ? html`<div id="ignition"></div>` : ''}
    `;
  }
}

customElements.define('shell-space', ShellSpace);
