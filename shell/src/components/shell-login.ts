import { LitElement, html, css } from 'lit';
import { state } from 'lit/decorators.js';
import { authClient } from '../services/auth-client';

export class ShellLogin extends LitElement {
  static styles = css`
    @keyframes cardIn {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Host / fondo sobrio ── */
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      width: 100vw;
      overflow: hidden;
      position: relative;
      background:
        radial-gradient(125% 85% at 50% -15%, var(--shell-surface-2), transparent 62%),
        var(--shell-bg);
    }

    /* Grano fino: textura material, no luz */
    .bg-texture {
      position: absolute;
      inset: 0;
      background-image: radial-gradient(var(--shell-grain) 1px, transparent 1px);
      background-size: 4px 4px;
      pointer-events: none;
    }

    /* ── Card ── */
    .card {
      position: relative;
      z-index: 10;
      background: var(--shell-surface);
      border: 1px solid var(--shell-border);
      border-radius: var(--shell-radius-xl);
      padding: 44px 40px 40px;
      width: 100%;
      max-width: 400px;
      margin: 20px;
      box-sizing: border-box;
      box-shadow: var(--shell-elev-4);
      animation: cardIn 0.5s var(--ease-out) both;
    }

    /* Brand */
    .brand-wrap { text-align: center; margin-bottom: 6px; }
    .brand {
      font-size: 30px;
      font-weight: 700;
      letter-spacing: 0.005em;
      color: var(--shell-text);
      line-height: 1;
    }
    .brand-dot { color: var(--shell-accent); }

    .subtitle {
      font-size: 13.5px;
      color: var(--shell-text-secondary);
      text-align: center;
      margin-bottom: 28px;
      line-height: 1.5;
    }

    /* Tabs */
    .tabs {
      display: flex;
      background: var(--shell-surface-2);
      border: 1px solid var(--shell-border);
      border-radius: var(--shell-radius);
      padding: 3px;
      margin-bottom: 24px;
    }
    .tab {
      flex: 1;
      padding: 9px 12px;
      text-align: center;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      background: transparent;
      color: var(--shell-text-secondary);
      border: none;
      border-radius: var(--shell-radius-sm);
      transition:
        background var(--shell-transition),
        color var(--shell-transition),
        box-shadow var(--shell-transition);
    }
    .tab:hover { color: var(--shell-text); }
    .tab.active {
      background: var(--shell-surface);
      color: var(--shell-text);
      box-shadow: var(--shell-elev-1);
    }

    /* Form */
    .form-group { margin-bottom: 14px; }
    label {
      display: block;
      font-size: 11.5px;
      font-weight: 600;
      margin-bottom: 7px;
      color: var(--shell-text-secondary);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    input {
      width: 100%;
      padding: 11px 14px;
      border: 1px solid var(--shell-input-border);
      border-radius: var(--shell-radius-sm);
      font-size: 14px;
      font-family: inherit;
      background: var(--shell-input-bg);
      color: var(--shell-text);
      box-sizing: border-box;
      outline: none;
      transition:
        border-color var(--shell-transition),
        box-shadow var(--shell-transition);
    }
    input:focus {
      border-color: var(--shell-accent);
      box-shadow: var(--shell-ring);
    }
    input::placeholder { color: var(--shell-text-secondary); opacity: 0.45; }

    /* Button */
    .submit-btn {
      width: 100%;
      padding: 13px;
      border: none;
      border-radius: var(--shell-radius);
      font-size: 14px;
      font-weight: 650;
      font-family: inherit;
      cursor: pointer;
      margin-top: 10px;
      letter-spacing: 0.01em;
      background: var(--shell-accent);
      color: #fff;
      box-shadow: var(--shell-elev-1);
      transition:
        transform var(--dur-fast) var(--ease-out),
        background var(--shell-transition),
        box-shadow var(--shell-transition);
    }
    .submit-btn:hover:not(:disabled) {
      background: var(--shell-accent-hover);
      transform: translateY(-1px);
      box-shadow: var(--shell-elev-2);
    }
    .submit-btn:active:not(:disabled) { transform: translateY(0) scale(0.99); }
    .submit-btn:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }

    /* Error */
    .error-msg {
      background: color-mix(in srgb, var(--shell-error) 10%, transparent);
      color: var(--shell-error);
      border: 1px solid color-mix(in srgb, var(--shell-error) 24%, transparent);
      padding: 10px 14px;
      border-radius: var(--shell-radius-sm);
      font-size: 13px;
      margin-bottom: 14px;
      display: none;
      line-height: 1.5;
    }
    .error-msg.visible { display: block; }

    .name-field { display: none; }
    .name-field.visible { display: block; }
  `;

  @state() private _mode: 'login' | 'register' = 'login';
  @state() private _loading = false;
  @state() private _error = '';

  private _switchMode(mode: 'login' | 'register') {
    this._mode = mode;
    this._error = '';
    this.updateComplete.then(() => {
      this.shadowRoot?.querySelectorAll('input').forEach((i) => { i.value = ''; });
    });
  }

  private async _handleSubmit(e: Event) {
    e.preventDefault();
    const email    = (this.shadowRoot?.getElementById('email')    as HTMLInputElement)?.value.trim() ?? '';
    const name     = (this.shadowRoot?.getElementById('name')     as HTMLInputElement)?.value.trim() ?? '';
    const password = (this.shadowRoot?.getElementById('password') as HTMLInputElement)?.value ?? '';

    if (!email)                                      { this._error = 'El correo es obligatorio'; return; }
    if (this._mode === 'register' && !name)          { this._error = 'El nombre es obligatorio'; return; }
    if (!password)                                   { this._error = 'La contraseña es obligatoria'; return; }
    if (password.length < 6)                         { this._error = 'Mínimo 6 caracteres'; return; }

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
      if (this._mode === 'login' && (msg.includes('invalid') || msg.includes('credenciales') || msg.includes('incorrectos'))) {
        this._error = 'Correo o contraseña incorrectos.';
      } else if (this._mode === 'register' && msg.includes('email already')) {
        this._error = 'Este correo ya está registrado.';
      } else {
        this._error = msg;
      }
    } finally {
      this._loading = false;
    }
  }

  render() {
    return html`
      <div class="bg-texture"></div>

      <div class="card">
        <div class="brand-wrap">
          <span class="brand">Ramatzo<span class="brand-dot">.</span></span>
        </div>
        <div class="subtitle">Accede a todas tus aplicaciones</div>

        <div class="tabs">
          <button type="button" class="tab ${this._mode === 'login'    ? 'active' : ''}" @click=${() => this._switchMode('login')}>Iniciar sesión</button>
          <button type="button" class="tab ${this._mode === 'register' ? 'active' : ''}" @click=${() => this._switchMode('register')}>Registrarse</button>
        </div>

        <div class="error-msg ${this._error ? 'visible' : ''}">${this._error}</div>

        <form @submit=${this._handleSubmit}>
          <div class="name-field form-group ${this._mode === 'register' ? 'visible' : ''}">
            <label for="name">Nombre</label>
            <input id="name" type="text" placeholder="Tu nombre" autocomplete="name" />
          </div>
          <div class="form-group">
            <label for="email">Correo</label>
            <input id="email" type="email" placeholder="correo@ejemplo.com" autocomplete="email" />
          </div>
          <div class="form-group">
            <label for="password">Contraseña</label>
            <input id="password" type="password" placeholder="••••••••"
              autocomplete="${this._mode === 'login' ? 'current-password' : 'new-password'}" />
          </div>
          <button class="submit-btn" type="submit" ?disabled=${this._loading}>
            ${this._loading ? 'Procesando…' : this._mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    `;
  }
}

customElements.define('shell-login', ShellLogin);
