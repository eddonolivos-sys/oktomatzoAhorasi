import { LitElement, html, css, svg } from 'lit';
import { property } from 'lit/decorators.js';
import type { User } from '../services/auth-client';

export class ShellTopbar extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: var(--shell-topbar-height);
      flex-shrink: 0;
      position: relative;
      z-index: 50;
    }

    .topbar {
      display: flex;
      align-items: center;
      height: 100%;
      padding: 0 20px;
      background: var(--shell-topbar-bg);
      border-bottom: 1px solid var(--shell-border);
      backdrop-filter: blur(20px) saturate(120%);
      -webkit-backdrop-filter: blur(20px) saturate(120%);
      gap: 10px;
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
      color: var(--shell-text-secondary);
      cursor: pointer;
      border-radius: 10px;
      padding: 0;
      transition:
        background var(--shell-transition),
        color var(--shell-transition),
        transform 0.18s ease;
      flex-shrink: 0;
    }
    .menu-btn:hover {
      background: var(--shell-surface-hover);
      color: var(--shell-text);
      transform: scale(1.06);
    }
    .menu-btn:active { transform: scale(0.94); }

    /* Brand */
    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }
    .brand {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--shell-text);
      line-height: 1;
    }
    .brand-dot {
      display: inline-block;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--shell-accent);
      flex-shrink: 0;
      margin-left: 3px;
    }

    /* Actions */
    .actions {
      display: flex;
      align-items: center;
      gap: 2px;
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
      border-radius: 10px;
      padding: 0;
      transition:
        background var(--shell-transition),
        color var(--shell-transition),
        transform 0.18s ease;
    }
    .icon-btn:hover {
      background: var(--shell-surface-hover);
      color: var(--shell-text);
      transform: scale(1.06);
    }
    .icon-btn:active { transform: scale(0.92); }

    .divider {
      width: 1px;
      height: 20px;
      background: var(--shell-border-bright);
      margin: 0 6px;
      flex-shrink: 0;
    }

    .user-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px 4px 5px;
      border-radius: 24px;
      border: 1px solid var(--shell-border-bright);
      background: var(--shell-surface);
      transition:
        background var(--shell-transition),
        border-color var(--shell-transition),
        box-shadow var(--shell-transition);
      cursor: default;
    }
    .user-pill:hover {
      background: var(--shell-surface-hover);
      border-color: var(--shell-border-bright);
      box-shadow: var(--shell-elev-1);
    }

    .user-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--shell-accent), var(--shell-accent-2));
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      flex-shrink: 0;
    }

    .user-name {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--shell-text);
      white-space: nowrap;
    }

    @media (max-width: 767px) {
      .user-name { display: none; }
      .user-pill { padding: 4px; border: none; background: transparent; }
      .user-pill:hover { background: var(--shell-surface-hover); box-shadow: none; }
    }
  `;

  @property({ type: String }) theme: 'light' | 'dark' = 'light';
  @property({ type: Object }) user: User | null = null;
  @property({ type: Boolean }) sidebarOpen = true;

  private getInitials(name: string): string {
    return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }

  render() {
    return html`
      <div class="topbar">
        <button
          class="menu-btn"
          @click=${() => this.dispatchEvent(new CustomEvent('toggle-sidebar'))}
          title="${this.sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}"
        >
          ${this.sidebarOpen
            ? svg`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
            : svg`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>`
          }
        </button>

        <div class="brand-wrap">
          <span class="brand">Ramatzo</span>
          <span class="brand-dot"></span>
        </div>

        <div class="actions">
          <button class="icon-btn" @click=${() => this.dispatchEvent(new CustomEvent('toggle-theme'))} title="Cambiar tema">
            ${this.theme === 'light'
              ? svg`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
              : svg`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
            }
          </button>

          ${this.user ? html`
            <div class="divider"></div>
            <div class="user-pill">
              <div class="user-avatar">${this.getInitials(this.user.name)}</div>
              <span class="user-name">${this.user.name}</span>
            </div>
            <button class="icon-btn" @click=${() => this.dispatchEvent(new CustomEvent('logout'))} title="Cerrar sesión">
              ${svg`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`}
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }
}

customElements.define('shell-topbar', ShellTopbar);
