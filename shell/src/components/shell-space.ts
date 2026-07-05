import { LitElement, html } from 'lit';
import { property, state, query } from 'lit/decorators.js';
import './shell-cockpit'; // registra <shell-cockpit> (no depender del orden de main.ts)
import type { AppInfo } from '../services/protocol';
import type { SpaceEngine } from '../space/space-engine';
import type { ShellSettings } from './shell-settings';

/**
 * Host de la experiencia espacial. Renderiza en light DOM (createRenderRoot → this)
 * para que el canvas y los overlays del motor vivan en el documento (CSS global de
 * space.css). Carga el motor (y Three.js) con import dinámico post-login.
 *
 * Entrada a proyectos: vista de cabina en la MISMA pestaña. Al "entrar", se monta
 * <shell-cockpit> a pantalla completa (iframe del proyecto) y el motor se PAUSA; al
 * volver ("Volver al espacio" o Esc) se reanuda sin recargar y la nave sigue
 * orbitando el planeta visitado. Solo los proyectos externos (externalUrl, p. ej. el
 * repo de GitHub) abren pestaña nueva, porque no se pueden incrustar.
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
  @state() private cockpitApp: AppInfo | null = null;

  private engine: SpaceEngine | null = null;

  @query('shell-settings') private settingsEl?: ShellSettings;

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
        // Cabina en la MISMA pestaña: monta el proyecto y pausa el mapa.
        this.cockpitApp = app;
        this.engine?.pause();
      },
      onLogout: () => this.dispatchEvent(new CustomEvent('logout', { bubbles: true, composed: true })),
      onOpenSettings: () => this.settingsEl?.openModal(),
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
      <shell-settings .cockpitApp=${this.cockpitApp}></shell-settings>
      ${this.cockpitApp
        ? html`<shell-cockpit
            .app=${this.cockpitApp}
            .theme=${this.theme}
            @back=${this.exitCockpit}
            @logout=${() => this.dispatchEvent(new CustomEvent('logout', { bubbles: true, composed: true }))}
          ></shell-cockpit>`
        : ''}
    `;
  }

  private exitCockpit = () => {
    this.cockpitApp = null;
    this.engine?.resume(); // reanuda el mapa; la nave sigue orbitando el planeta visitado
  };
}

customElements.define('shell-space', ShellSpace);
