import { LitElement, html, css } from 'lit';
import { state } from 'lit/decorators.js';
import { authClient } from '../services/auth-client';

export class ShellLogin extends LitElement {
  static styles = css`
    /* ── Keyframes ── */
    @keyframes orbFloat1 {
      0%, 100% { transform: translate(0, 0) scale(1); }
      33%       { transform: translate(40px, -50px) scale(1.06); }
      66%       { transform: translate(-25px, 30px) scale(0.94); }
    }
    @keyframes orbFloat2 {
      0%, 100% { transform: translate(0, 0) scale(1); }
      40%       { transform: translate(-45px, 35px) scale(1.09); }
      70%       { transform: translate(30px, -30px) scale(0.91); }
    }
    @keyframes orbFloat3 {
      0%, 100% { transform: translate(0, 0) scale(1); }
      50%       { transform: translate(20px, 20px) scale(1.04); }
    }
    @keyframes gridPan {
      0%   { background-position: 0 0; }
      100% { background-position: 40px 40px; }
    }
    @keyframes cardIn {
      from { opacity: 0; transform: perspective(1200px) translateY(30px) scale(0.96); }
      to   { opacity: 1; transform: perspective(1200px) translateY(0) scale(1); }
    }
    @keyframes shimmerBrand {
      0%   { background-position: 0% center; }
      100% { background-position: 200% center; }
    }
    @keyframes inputGlow {
      0%, 100% { box-shadow: 0 0 0 2px var(--shell-accent-shadow); }
      50%       { box-shadow: 0 0 0 4px var(--shell-accent-shadow), 0 0 20px var(--shell-accent-glow); }
    }
    @keyframes btnShimmer {
      0%   { background-position: 200% center; }
      100% { background-position: -200% center; }
    }

    /* ── Host / Background ── */
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      width: 100vw;
      overflow: hidden;
      position: relative;
      background: var(--shell-bg);
    }

    /* Animated mesh grid */
    .bg-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(var(--shell-border) 1px, transparent 1px),
        linear-gradient(90deg, var(--shell-border) 1px, transparent 1px);
      background-size: 40px 40px;
      animation: gridPan 8s linear infinite;
      opacity: 0.6;
      pointer-events: none;
    }

    /* Radial vignette */
    .bg-vignette {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse 75% 65% at 50% 50%, transparent 20%, var(--shell-bg) 85%);
      pointer-events: none;
    }

    /* Orbs */
    .orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(70px);
      pointer-events: none;
    }
    .orb-1 {
      width: 500px; height: 500px;
      background: radial-gradient(circle, rgba(99,102,241,0.38), rgba(139,92,246,0.15) 60%, transparent);
      top: -160px; left: -160px;
      animation: orbFloat1 11s ease-in-out infinite;
    }
    .orb-2 {
      width: 420px; height: 420px;
      background: radial-gradient(circle, rgba(139,92,246,0.28), rgba(59,130,246,0.1) 60%, transparent);
      bottom: -120px; right: -100px;
      animation: orbFloat2 14s ease-in-out infinite;
    }
    .orb-3 {
      width: 220px; height: 220px;
      background: radial-gradient(circle, rgba(99,102,241,0.2), transparent 70%);
      top: 55%; right: 18%;
      animation: orbFloat3 9s ease-in-out infinite;
    }

    /* ── Card ── */
    .card {
      position: relative;
      z-index: 10;
      background: var(--shell-surface);
      border: 1px solid var(--shell-border-bright);
      border-radius: 24px;
      padding: 44px 40px 40px;
      width: 100%;
      max-width: 400px;
      margin: 20px;
      box-sizing: border-box;
      box-shadow:
        0 0 0 1px var(--shell-border),
        0 8px 40px var(--shell-shadow-lg),
        0 0 80px var(--shell-accent-shadow);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      animation: cardIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      will-change: transform;
      transition: box-shadow 0.3s ease;
    }
    .card:hover {
      box-shadow:
        0 0 0 1px var(--shell-border-bright),
        0 12px 50px var(--shell-shadow-lg),
        0 0 100px var(--shell-accent-shadow);
    }

    /* Brand */
    .brand-wrap { text-align: center; margin-bottom: 8px; }
    .brand {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: 0.03em;
      display: inline-block;
      background: linear-gradient(
        135deg,
        var(--shell-text) 0%,
        var(--shell-accent-2) 35%,
        var(--shell-accent) 60%,
        var(--shell-text) 100%
      );
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: shimmerBrand 4s linear infinite;
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
      background: var(--shell-surface-2, var(--shell-bg));
      border: 1px solid var(--shell-border);
      border-radius: 12px;
      padding: 3px;
      margin-bottom: 24px;
      gap: 0;
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
      border-radius: 9px;
      transition:
        background var(--shell-transition),
        color var(--shell-transition),
        box-shadow var(--shell-transition);
    }
    .tab.active {
      background: var(--shell-surface);
      color: var(--shell-text);
      box-shadow: 0 1px 6px var(--shell-shadow);
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
      border-radius: 10px;
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
      animation: inputGlow 2s ease-in-out infinite;
    }
    input::placeholder { color: var(--shell-text-secondary); opacity: 0.4; }

    /* Button */
    .submit-btn {
      width: 100%;
      padding: 13px;
      border: none;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      margin-top: 10px;
      letter-spacing: 0.02em;
      position: relative;
      overflow: hidden;
      background: linear-gradient(
        135deg,
        var(--shell-accent) 0%,
        var(--shell-accent-2) 50%,
        var(--shell-accent) 100%
      );
      background-size: 200% auto;
      color: #fff;
      box-shadow: 0 4px 20px var(--shell-accent-shadow);
      transition:
        transform 0.18s ease,
        box-shadow var(--shell-transition);
    }
    .submit-btn::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(255,255,255,0.15), transparent 50%, rgba(255,255,255,0.08));
      border-radius: inherit;
      pointer-events: none;
    }
    .submit-btn:hover:not(:disabled) {
      animation: btnShimmer 1.5s linear infinite;
      transform: translateY(-2px);
      box-shadow: 0 8px 28px var(--shell-accent-shadow), 0 0 40px var(--shell-accent-glow);
    }
    .submit-btn:active:not(:disabled) { transform: translateY(0); }
    .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }

    /* Error */
    .error-msg {
      background: rgba(244, 63, 94, 0.08);
      color: var(--shell-error);
      border: 1px solid rgba(244, 63, 94, 0.2);
      padding: 10px 14px;
      border-radius: 10px;
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

  private _onMouseMove = (e: MouseEvent) => {
    const card = this.shadowRoot?.querySelector('.card') as HTMLElement;
    if (!card) return;
    const rect = this.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(1200px) rotateX(${-y * 10}deg) rotateY(${x * 10}deg) translateZ(8px)`;
  };

  private _onMouseLeave = () => {
    const card = this.shadowRoot?.querySelector('.card') as HTMLElement;
    if (card) card.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg) translateZ(0)';
  };

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('mousemove', this._onMouseMove);
    this.addEventListener('mouseleave', this._onMouseLeave);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('mousemove', this._onMouseMove);
    this.removeEventListener('mouseleave', this._onMouseLeave);
  }

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
      <div class="bg-grid"></div>
      <div class="bg-vignette"></div>
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>

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
