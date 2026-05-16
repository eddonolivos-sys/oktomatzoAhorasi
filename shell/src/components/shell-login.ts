import { LitElement, html, css } from 'lit';
import { state } from 'lit/decorators.js';
import { authClient } from '../services/auth-client';

export class ShellLogin extends LitElement {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      width: 100vw;
      background: var(--shell-bg);
    }

    .card {
      background: var(--shell-surface);
      border-radius: 12px;
      padding: 40px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 2px 20px var(--shell-shadow);
    }

    .brand {
      font-size: 24px;
      font-weight: 700;
      text-align: center;
      margin-bottom: 8px;
    }

    .subtitle {
      font-size: 14px;
      color: var(--shell-text-secondary);
      text-align: center;
      margin-bottom: 32px;
    }

    .tabs {
      display: flex;
      gap: 0;
      margin-bottom: 24px;
      border: 1px solid var(--shell-border);
      border-radius: 8px;
      overflow: hidden;
    }

    .tab {
      flex: 1;
      padding: 10px;
      text-align: center;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      background: transparent;
      color: var(--shell-text-secondary);
      border: none;
      transition: background var(--shell-transition), color var(--shell-transition);
    }

    .tab.active {
      background: var(--shell-accent);
      color: white;
    }

    .form-group {
      margin-bottom: 16px;
    }

    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 6px;
      color: var(--shell-text);
    }

    input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--shell-input-border);
      border-radius: 6px;
      font-size: 14px;
      background: var(--shell-input-bg);
      color: var(--shell-text);
      box-sizing: border-box;
      transition: border-color var(--shell-transition);
    }

    input:focus {
      outline: none;
      border-color: var(--shell-accent);
      box-shadow: 0 0 0 2px rgba(0, 125, 250, 0.2);
    }

    .submit-btn {
      width: 100%;
      padding: 12px;
      background: var(--shell-accent);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background var(--shell-transition);
      margin-top: 8px;
    }

    .submit-btn:hover {
      background: var(--shell-accent-hover);
    }

    .submit-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .error-msg {
      background: rgba(255, 59, 48, 0.1);
      color: var(--shell-error);
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 16px;
      display: none;
    }

    .error-msg.visible {
      display: block;
    }
  `;

  @state()
  private mode: 'login' | 'register' = 'login';

  @state()
  private email = '';

  @state()
  private name = '';

  @state()
  private password = '';

  @state()
  private loading = false;

  @state()
  private error = '';

  private async handleSubmit(e: Event) {
    e.preventDefault();
    this.loading = true;
    this.error = '';

    try {
      if (this.mode === 'login') {
        await authClient.login(this.email, this.password);
      } else {
        await authClient.register(this.email, this.name, this.password);
      }
      this.dispatchEvent(new CustomEvent('login-success', { bubbles: true, composed: true }));
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Error desconocido';
    } finally {
      this.loading = false;
    }
  }

  render() {
    return html`
      <div class="card">
        <div class="brand">Plataforma</div>
        <div class="subtitle">Accede a todas tus aplicaciones</div>

        <div class="tabs">
          <button
            class="tab ${this.mode === 'login' ? 'active' : ''}"
            @click=${() => { this.mode = 'login'; this.error = ''; }}
          >
            Iniciar sesión
          </button>
          <button
            class="tab ${this.mode === 'register' ? 'active' : ''}"
            @click=${() => { this.mode = 'register'; this.error = ''; }}
          >
            Registrarse
          </button>
        </div>

        <div class="error-msg ${this.error ? 'visible' : ''}">${this.error}</div>

        <form @submit=${this.handleSubmit}>
          ${this.mode === 'register' ? html`
            <div class="form-group">
              <label for="name">Nombre</label>
              <input
                id="name"
                type="text"
                .value=${this.name}
                @input=${(e: InputEvent) => this.name = (e.target as HTMLInputElement).value}
                required
                placeholder="Tu nombre"
              />
            </div>
          ` : ''}

          <div class="form-group">
            <label for="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              .value=${this.email}
              @input=${(e: InputEvent) => this.email = (e.target as HTMLInputElement).value}
              required
              placeholder="correo@ejemplo.com"
            />
          </div>

          <div class="form-group">
            <label for="password">Contraseña</label>
            <input
              id="password"
              type="password"
              .value=${this.password}
              @input=${(e: InputEvent) => this.password = (e.target as HTMLInputElement).value}
              required
              placeholder="••••••••"
              minlength=${6}
            />
          </div>

          <button class="submit-btn" type="submit" ?disabled=${this.loading}>
            ${this.loading ? 'Procesando...' : this.mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    `;
  }
}

customElements.define('shell-login', ShellLogin);
