import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import type { User } from '../services/auth-client';

export class ShellTopbar extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: var(--shell-topbar-height);
      flex-shrink: 0;
    }

    .topbar {
      display: flex;
      align-items: center;
      height: 100%;
      padding: 0 16px;
      background: var(--shell-topbar-bg);
      border-bottom: 1px solid var(--shell-border);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      gap: 12px;
      user-select: none;
    }

    .menu-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      background: transparent;
      color: var(--shell-text);
      cursor: pointer;
      border-radius: 6px;
      font-size: 20px;
      transition: background var(--shell-transition);
    }

    .menu-btn:hover {
      background: var(--shell-surface-hover);
    }

    .brand {
      font-size: 15px;
      font-weight: 600;
      color: var(--shell-text);
      flex: 1;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      background: transparent;
      color: var(--shell-text-secondary);
      cursor: pointer;
      border-radius: 6px;
      font-size: 18px;
      transition: background var(--shell-transition), color var(--shell-transition);
    }

    .icon-btn:hover {
      background: var(--shell-surface-hover);
      color: var(--shell-text);
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      border-radius: var(--shell-border-radius);
      font-size: 13px;
      color: var(--shell-text-secondary);
    }

    .user-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--shell-accent);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
    }

    @media (max-width: 767px) {
      .user-info .name {
        display: none;
      }
    }
  `;

  @property({ type: String })
  theme: 'light' | 'dark' = 'light';

  @property({ type: Object })
  user: User | null = null;

  @property({ type: Boolean })
  sidebarOpen = true;

  private getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  render() {
    return html`
      <div class="topbar">
        <button class="menu-btn" @click=${() => this.dispatchEvent(new CustomEvent('toggle-sidebar'))}>
          ${this.sidebarOpen ? '✕' : '☰'}
        </button>

        <span class="brand">Plataforma</span>

        <div class="actions">
          <button class="icon-btn" @click=${() => this.dispatchEvent(new CustomEvent('toggle-theme'))} title="Cambiar tema">
            ${this.theme === 'light' ? '🌙' : '☀️'}
          </button>

          ${this.user ? html`
            <div class="user-info">
              <span class="user-avatar">${this.getInitials(this.user.name)}</span>
              <span class="name">${this.user.name}</span>
            </div>
            <button class="icon-btn" @click=${() => this.dispatchEvent(new CustomEvent('logout'))} title="Cerrar sesión">
              ⏻
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }
}

customElements.define('shell-topbar', ShellTopbar);
