import { LitElement, html } from 'lit';
import { state, property } from 'lit/decorators.js';
import { audioService, type AudioState } from '../services/audio-service';
import type { AppInfo } from '../services/protocol';
import './shell-settings.css';

/**
 * Configuración global de audio (Hito 3): botón flotante + modal. Montado
 * INCONDICIONALMENTE por <shell-space> (vive tanto en el espacio como dentro
 * de la cabina de un proyecto, con z-index 130 > cabina 120). Renderiza en
 * light DOM (patrón de ShellSpace) y se apoya en shell-settings.css (importado
 * como módulo, se inyecta globalmente vía Vite). El modal NO se cierra con
 * Esc (colisiona con el Esc de shell-cockpit) — solo con el botón de cierre
 * explícito o clicando el fondo.
 */
export class ShellSettings extends LitElement {
  protected createRenderRoot() {
    return this;
  }

  /** Proyecto activo (si estamos dentro de la cabina); null en el espacio. */
  @property({ type: Object }) cockpitApp: AppInfo | null = null;

  @state() private open = false;
  @state() private audioState: AudioState = audioService.getState();

  private unsubscribe: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.unsubscribe = audioService.subscribe((s) => {
      this.audioState = s;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  /** Abre el modal desde fuera (PauseMenu, cuando el botón fijo no es clicable con pointer lock). */
  openModal() {
    this.open = true;
  }

  private toggle = () => {
    this.open = !this.open;
  };

  private close = () => {
    this.open = false;
  };

  render() {
    return html`
      <button type="button" class="settings-fab" @click=${this.toggle} aria-label="Configuración de audio">
        Audio
      </button>
      ${this.open ? this.renderModal() : ''}
    `;
  }

  private renderModal() {
    const s = this.audioState;
    const app = this.cockpitApp;
    return html`
      <div class="settings-backdrop" @click=${this.close}></div>
      <div class="settings-modal" role="dialog" aria-label="Configuración de audio">
        <div class="settings-header">
          <span>Audio</span>
          <button type="button" class="settings-close" @click=${this.close} aria-label="Cerrar">×</button>
        </div>
        <div class="settings-row">
          <label>
            <input
              type="checkbox"
              .checked=${s.masterMuted}
              @change=${(e: Event) => audioService.setMasterMuted((e.target as HTMLInputElement).checked)}
            />
            Silenciar todo
          </label>
        </div>
        <div class="settings-row">
          <label class="settings-slider-label">Volumen general</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            .value=${String(s.masterVolume)}
            ?disabled=${s.masterMuted}
            @input=${(e: Event) => audioService.setMasterVolume(Number((e.target as HTMLInputElement).value))}
          />
        </div>
        <div class="settings-row">
          <label>
            <input
              type="checkbox"
              .checked=${s.sfxMuted}
              @change=${(e: Event) => audioService.setSfxMuted((e.target as HTMLInputElement).checked)}
            />
            Silenciar efectos (propulsor, nitro)
          </label>
        </div>
        ${app
          ? html`
              <div class="settings-row settings-project">
                <label>
                  <input
                    type="checkbox"
                    .checked=${audioService.isProjectMuted(app.id)}
                    @change=${(e: Event) => audioService.setProjectMuted(app.id, (e.target as HTMLInputElement).checked)}
                  />
                  Silenciar audio de ${app.name}
                </label>
              </div>
            `
          : ''}
      </div>
    `;
  }
}

customElements.define('shell-settings', ShellSettings);
