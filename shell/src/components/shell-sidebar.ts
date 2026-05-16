import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import type { AppInfo } from '../services/protocol';

export class ShellSidebar extends LitElement {
  static styles = css`
    :host {
      display: block;
      flex-shrink: 0;
      transition: width var(--shell-transition);
    }

    .sidebar {
      width: var(--shell-sidebar-width);
      height: 100%;
      background: var(--shell-sidebar-bg);
      border-right: 1px solid var(--shell-border);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      transition: width var(--shell-transition), margin var(--shell-transition);
    }

    .sidebar.collapsed {
      width: 0;
      overflow: hidden;
      border-right: none;
    }

    .section-title {
      padding: 16px 16px 8px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--shell-text-secondary);
    }

    .app-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 0 8px 16px;
    }

    .app-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border: none;
      background: transparent;
      color: var(--shell-text);
      cursor: pointer;
      border-radius: 6px;
      font-size: 14px;
      text-align: left;
      transition: background var(--shell-transition);
      width: 100%;
    }

    .app-item:hover {
      background: var(--shell-surface-hover);
    }

    .app-item.active {
      background: var(--shell-accent);
      color: white;
    }

    .app-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      background: var(--shell-surface);
      font-size: 16px;
      flex-shrink: 0;
    }

    .app-item.active .app-icon {
      background: rgba(255, 255, 255, 0.2);
    }

    .app-info {
      flex: 1;
      min-width: 0;
    }

    .app-name {
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .app-version {
      font-size: 11px;
      color: var(--shell-text-secondary);
      margin-top: 1px;
    }

    .app-item.active .app-version {
      color: rgba(255, 255, 255, 0.7);
    }

    .categories {
      flex: 1;
    }

    @media (max-width: 767px) {
      .sidebar {
        position: fixed;
        top: var(--shell-topbar-height);
        left: 0;
        bottom: 0;
        z-index: 100;
        width: var(--shell-sidebar-width);
        box-shadow: 2px 0 12px var(--shell-shadow);
      }

      .sidebar.collapsed {
        width: 0;
        box-shadow: none;
      }
    }
  `;

  @property({ type: Array })
  apps: AppInfo[] = [];

  @property({ type: String })
  currentApp: string | null = null;

  @property({ type: Boolean })
  open = true;

  private getCategories(): Map<string, AppInfo[]> {
    const categories = new Map<string, AppInfo[]>();
    for (const app of this.apps) {
      const cat = app.category || 'General';
      if (!categories.has(cat)) {
        categories.set(cat, []);
      }
      categories.get(cat)!.push(app);
    }
    return categories;
  }

  private getIconChar(icon: string): string {
    const icons: Record<string, string> = {
      'bar-chart': '📊',
      cube: '🧊',
      users: '👥',
      settings: '⚙️',
      home: '🏠',
    };
    return icons[icon] || '📄';
  }

  render() {
    const categories = this.getCategories();

    return html`
      <div class="sidebar ${this.open ? '' : 'collapsed'}">
        ${Array.from(categories.entries()).map(
          ([category, apps]) => html`
            <div class="categories">
              <div class="section-title">${category}</div>
              <div class="app-list">
                ${apps.map(
                  (app) => html`
                    <button
                      class="app-item ${this.currentApp === app.id ? 'active' : ''}"
                      @click=${() => this.dispatchEvent(new CustomEvent('app-select', { detail: app, bubbles: true, composed: true }))}
                    >
                      <div class="app-icon">${this.getIconChar(app.icon)}</div>
                      <div class="app-info">
                        <div class="app-name">${app.name}</div>
                        <div class="app-version">v${app.version}</div>
                      </div>
                    </button>
                  `,
                )}
              </div>
            </div>
          `,
        )}
      </div>
    `;
  }
}

customElements.define('shell-sidebar', ShellSidebar);
