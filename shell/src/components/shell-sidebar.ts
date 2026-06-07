import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import type { AppInfo } from '../services/protocol';
import { appIcon } from '../icons/app-icons';

export class ShellSidebar extends LitElement {
  static styles = css`
    @keyframes slideInItem {
      from { opacity: 0; transform: translateX(-8px); }
      to   { opacity: 1; transform: translateX(0); }
    }

    :host { display: block; flex-shrink: 0; }

    .sidebar {
      width: var(--shell-sidebar-width);
      height: 100%;
      background: var(--shell-sidebar-bg);
      border-right: 1px solid var(--shell-border);
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      transition: width var(--shell-transition-smooth), opacity var(--shell-transition);
      scrollbar-width: thin;
      scrollbar-color: var(--shell-border-bright) transparent;
    }
    .sidebar::-webkit-scrollbar { width: 3px; }
    .sidebar::-webkit-scrollbar-track { background: transparent; }
    .sidebar::-webkit-scrollbar-thumb { background: var(--shell-border-bright); border-radius: 2px; }

    .sidebar.collapsed {
      width: 0;
      overflow: hidden;
      border-right: none;
      opacity: 0;
    }

    /* Header */
    .sidebar-header {
      padding: 20px 16px 16px;
      border-bottom: 1px solid var(--shell-border);
      flex-shrink: 0;
    }
    .sidebar-label {
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--shell-text-secondary);
    }

    /* Section */
    .section-title {
      padding: 14px 16px 5px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--shell-text-secondary);
      opacity: 0.55;
    }
    .app-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: 4px 10px 10px;
    }

    /* Items */
    .app-item {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 9px 10px;
      border: none;
      background: transparent;
      color: var(--shell-text-secondary);
      cursor: pointer;
      border-radius: 10px;
      text-align: left;
      width: 100%;
      position: relative;
      border-left: 2px solid transparent;
      transition:
        background var(--shell-transition),
        color var(--shell-transition),
        border-color var(--shell-transition),
        box-shadow var(--shell-transition),
        transform 0.16s ease;
      animation: slideInItem 0.3s ease both;
    }
    .app-item:hover {
      background: var(--shell-surface-hover);
      color: var(--shell-text);
      border-left-color: var(--shell-border-bright);
    }
    .app-item:active { transform: scale(0.985); }

    .app-item.active {
      background: var(--shell-surface-hover);
      color: var(--shell-text);
      border-left-color: var(--shell-accent);
    }

    /* Active dot — sólido, sin glow */
    .app-item.active::after {
      content: '';
      position: absolute;
      right: 11px;
      top: 50%;
      transform: translateY(-50%);
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--shell-accent);
    }

    /* Icon */
    .app-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 9px;
      background: var(--shell-surface-2);
      color: var(--shell-text-secondary);
      flex-shrink: 0;
      border: 1px solid var(--shell-border);
      transition:
        background var(--shell-transition),
        border-color var(--shell-transition),
        color var(--shell-transition);
    }
    .app-icon svg { width: 17px; height: 17px; display: block; }
    .app-item.active .app-icon {
      background: var(--shell-surface);
      border-color: var(--shell-border-bright);
      color: var(--shell-accent);
    }
    .app-item:hover .app-icon {
      background: var(--shell-surface);
      border-color: var(--shell-border-bright);
      color: var(--shell-text);
    }

    /* Info */
    .app-info { flex: 1; min-width: 0; }
    .app-name {
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.35;
    }
    .app-version {
      font-size: 10px;
      color: var(--shell-text-secondary);
      margin-top: 1px;
      font-weight: 400;
    }
    .app-item.active .app-name { color: var(--shell-text); font-weight: 600; }
    .app-item.active .app-version { color: var(--shell-accent); opacity: 0.8; }

    .categories { flex: 1; }

    /* Footer */
    .sidebar-footer {
      padding: 14px 16px;
      border-top: 1px solid var(--shell-border);
      flex-shrink: 0;
      margin-top: auto;
    }
    .footer-brand {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--shell-text-secondary);
      opacity: 0.4;
    }
    .footer-version {
      font-size: 10px;
      color: var(--shell-text-secondary);
      opacity: 0.3;
      margin-top: 2px;
    }

    @media (max-width: 767px) {
      .sidebar {
        position: fixed;
        top: var(--shell-topbar-height);
        left: 0;
        bottom: 0;
        z-index: 100;
        width: var(--shell-sidebar-width);
        box-shadow: 8px 0 32px var(--shell-shadow-lg);
      }
      .sidebar.collapsed { width: 0; box-shadow: none; opacity: 0; }
    }
  `;

  @property({ type: Array }) apps: AppInfo[] = [];
  @property({ type: String }) currentApp: string | null = null;
  @property({ type: Boolean }) open = true;

  private getCategories(): Map<string, AppInfo[]> {
    const categories = new Map<string, AppInfo[]>();
    for (const app of this.apps) {
      const cat = app.category || 'General';
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat)!.push(app);
    }
    return categories;
  }

  render() {
    const categories = this.getCategories();
    const multi = categories.size > 1;
    let itemIndex = 0;

    return html`
      <div class="sidebar ${this.open ? '' : 'collapsed'}">
        <div class="sidebar-header">
          <div class="sidebar-label">Aplicaciones</div>
        </div>

        ${Array.from(categories.entries()).map(([category, apps]) => html`
          <div class="categories">
            ${multi ? html`<div class="section-title">${category}</div>` : ''}
            <div class="app-list">
              ${apps.map((app) => {
                const delay = itemIndex++ * 55;
                return html`
                  <button
                    class="app-item ${this.currentApp === app.id ? 'active' : ''}"
                    style="animation-delay: ${delay}ms"
                    @click=${() => this.dispatchEvent(new CustomEvent('app-select', { detail: app, bubbles: true, composed: true }))}
                  >
                    <div class="app-icon">${appIcon(app.icon)}</div>
                    <div class="app-info">
                      <div class="app-name">${app.name}</div>
                      <div class="app-version">v${app.version}</div>
                    </div>
                  </button>
                `;
              })}
            </div>
          </div>
        `)}

        <div class="sidebar-footer">
          <div class="footer-brand">Ramatzo</div>
          <div class="footer-version">Platform v1.0</div>
        </div>
      </div>
    `;
  }
}

customElements.define('shell-sidebar', ShellSidebar);
