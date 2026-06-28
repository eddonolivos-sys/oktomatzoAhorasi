import { LitElement, html } from 'lit';
import { property, state } from 'lit/decorators.js';
import './shell-cockpit'; // registra <shell-cockpit> (no depender del orden de main.ts)
import type { AppInfo } from '../services/protocol';
import type { SpaceEngine } from '../space/space-engine';

/**
 * Host de la experiencia espacial. Renderiza en light DOM (createRenderRoot → this)
 * para que el canvas y los overlays del motor vivan en el documento (CSS global de
 * space.css). Carga el motor (y Three.js) con import dinámico post-login.
 */
export class ShellSpace extends LitElement {
  protected createRenderRoot() {
    return this;
  }

  @property({ type: Array }) apps: AppInfo[] = [];
  @property({ type: String }) theme: 'light' | 'dark' = 'dark';
  @property({ type: Object }) user: { id: string; name: string } | null = null;

  @state() private webglOk = true;
  @state() private cockpitApp: AppInfo | null = null;
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
        history.pushState({ cockpit: app.id }, '', `?app=${encodeURIComponent(app.id)}`);
        this.cockpitApp = app;
        this.engine?.pause();
      },
      onLogout: () => this.dispatchEvent(new CustomEvent('logout', { bubbles: true, composed: true })),
    });

    // Empezar siempre en el mapa: ignora un ?app= de una recarga previa.
    if (location.search) history.replaceState({}, '', location.pathname);
    window.addEventListener('popstate', this.onPopState);

    window.setTimeout(() => {
      this.igniting = false;
    }, 1500);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this.onPopState);
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
        style="position:fixed;inset:0;overflow:hidden;background:#0A0503;display:${this.cockpitApp ? 'none' : 'block'};"
      ></div>
      ${this.igniting ? html`<div id="ignition"></div>` : ''}
      ${this.cockpitApp
        ? html`<shell-cockpit
            .app=${this.cockpitApp}
            .theme=${this.theme}
            @back=${this.onBack}
            @logout=${() => this.dispatchEvent(new CustomEvent('logout', { bubbles: true, composed: true }))}
          ></shell-cockpit>`
        : ''}
    `;
  }

  // El botón "Volver al espacio" navega atrás en el historial → mismo camino que el
  // botón de retroceso del navegador (ambos disparan popstate).
  private onBack = () => history.back();

  // Manejador ÚNICO de retorno: lo invocan TANTO el botón (vía history.back) como el
  // retroceso del navegador. Reconstruye la vista según el estado del historial.
  private onPopState = (e: PopStateEvent) => {
    const id = e.state && (e.state as { cockpit?: string }).cockpit;
    const app = id ? this.apps.find((a) => a.id === id) ?? null : null;
    if (app) {
      this.cockpitApp = app;
      this.engine?.pause();
    } else {
      this.cockpitApp = null;
      this.engine?.resume();
    }
  };
}

customElements.define('shell-space', ShellSpace);
