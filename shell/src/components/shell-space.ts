import { LitElement, html } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { AppInfo } from '../services/protocol';
import type { SpaceEngine } from '../space/space-engine';

/**
 * Host de la experiencia espacial. Renderiza en light DOM (createRenderRoot → this)
 * para que el canvas y los overlays del motor vivan en el documento (pointer lock +
 * CSS global de space.css). Carga el motor (y Three.js) con import dinámico post-login.
 */
export class ShellSpace extends LitElement {
  protected createRenderRoot() {
    return this;
  }

  @property({ type: Array }) apps: AppInfo[] = [];
  @property({ type: String }) theme: 'light' | 'dark' = 'dark';

  @state() private webglOk = true;

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
      onEnterApp: (app) => this.dispatchEvent(new CustomEvent('enter-app', { detail: app })),
      onLogout: () => this.dispatchEvent(new CustomEvent('logout', { bubbles: true, composed: true })),
    });
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
    return html`<div id="space-host" style="position:fixed;inset:0;overflow:hidden;background:#0A0503;"></div>`;
  }
}

customElements.define('shell-space', ShellSpace);
