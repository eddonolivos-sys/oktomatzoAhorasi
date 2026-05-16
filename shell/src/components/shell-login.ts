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

    .name-field {
      display: none;
    }

    .name-field.visible {
      display: block;
    }
  `;

  @state() private _mode: 'login' | 'register' = 'login';
  @state() private _loading = false;
  @state() private _error = '';

  private _switchMode(mode: 'login' | 'register') {
    this._mode = mode;
    this._error = '';
    // Clear inputs on mode switch
    this.updateComplete.then(() => {
      const inputs = this.shadowRoot?.querySelectorAll('input');
      inputs?.forEach((i) => { i.value = ''; });
    });
  }

  private async _handleSubmit(e: Event) {
    e.preventDefault();

    // Read values directly from shadow DOM - reliable regardless of reactive binding
    const email = (this.shadowRoot?.getElementById('email') as HTMLInputElement)?.value.trim() ?? '';
    const name = (this.shadowRoot?.getElementById('name') as HTMLInputElement)?.value.trim() ?? '';
    const password = (this.shadowRoot?.getElementById('password') as HTMLInputElement)?.value ?? '';

    if (!email) { this._error = 'El correo electrónico es obligatorio'; return; }
    if (this._mode === 'register' && !name) { this._error = 'El nombre es obligatorio'; return; }
    if (!password) { this._error = 'La contraseña es obligatoria'; return; }
    if (password.length < 6) { this._error = 'La contraseña debe tener al menos 6 caracteres'; return; }

    this._loading = true;
    this._error = '';

    try {
      if (this._mode === 'login') {
        await authClient.login(email, password);
      } else {
        await authClient.register(email, name, password);
      }
      this.dispatchEvent(new CustomEvent('login-success', { bubbles: true, composed: true }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      if (this._mode === 'login' && (msg.includes('invalid') || msg.includes('password') || msg.includes('credenciales'))) {
        this._error = 'Correo o contraseña incorrectos. ¿Primera vez aquí? Usa la pestaña Registrarse.';
      } else if (msg.includes('email already in use') || msg.includes('correo')) {
        this._error = 'Este correo ya está registrado. Usa la pestaña Iniciar sesión.';
      } else {
        this._error = msg;
      }
    } finally {
      this._loading = false;
    }
  }

  render() {
    return html`
      <div class="card">
        <div class="brand">Plataforma</div>
        <div class="subtitle">Accede a todas tus aplicaciones</div>

        <div class="tabs">
          <button
            type="button"
            class="tab ${this._mode === 'login' ? 'active' : ''}"
            @click=${() => this._switchMode('login')}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            class="tab ${this._mode === 'register' ? 'active' : ''}"
            @click=${() => this._switchMode('register')}
          >
            Registrarse
          </button>
        </div>

        <div class="error-msg ${this._error ? 'visible' : ''}">${this._error}</div>

        <form @submit=${this._handleSubmit}>
          <div class="name-field form-group ${this._mode === 'register' ? 'visible' : ''}">
            <label for="name">Nombre</label>
            <input id="name" type="text" placeholder="Tu nombre" />
          </div>

          <div class="form-group">
            <label for="email">Correo electrónico</label>
            <input id="email" type="email" placeholder="correo@ejemplo.com" />
          </div>

          <div class="form-group">
            <label for="password">Contraseña</label>
            <input id="password" type="password" placeholder="••••••••" />
          </div>

          <button class="submit-btn" type="submit" ?disabled=${this._loading}>
            ${this._loading
              ? 'Procesando...'
              : this._mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    `;
  }
}

customElements.define('shell-login', ShellLogin);
