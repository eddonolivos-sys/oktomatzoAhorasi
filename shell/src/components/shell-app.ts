import { LitElement, html } from 'lit';
import { state } from 'lit/decorators.js';
import { authClient, type AuthState } from '../services/auth-client';
import { listen, sendMessage, type AppInfo, type AppMessage, type ShellMessage } from '../services/protocol';
import '../styles/themes.css';

export class ShellApp extends LitElement {
  // Light DOM (sin shadow root): <shell-login>/<shell-space> y todo lo que
  // cuelga de ellas (HUD, radar, pause-menu, shell-settings...) dependen de
  // hojas de estilo GLOBALES (space.css, themes.css, shell-settings.css)
  // inyectadas por Vite en document.head. Un shadow root aquí las bloquea por
  // completo (la encapsulación de Shadow DOM no deja que selectores externos
  // apliquen dentro) — <shell-login> y <shell-cockpit> siguen con SU PROPIO
  // shadow root vía `static styles`, eso no cambia; es solo este contenedor
  // de nivel superior el que pasa a light DOM. El bloque `static styles`
  // anterior (`.shell-layout`/`.shell-main`/`.shell-content`) era CSS muerto:
  // `render()` nunca genera esas clases.
  protected createRenderRoot() {
    return this;
  }

  @state()
  private authState: AuthState = { token: null, user: null };

  @state()
  private apps: AppInfo[] = [];

  @state()
  private currentApp: string | null = null;

  @state()
  private sidebarOpen = window.innerWidth >= 768;

  @state()
  private theme: 'light' | 'dark' = 'light';

  private cleanupListeners: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.detectTheme();
    this.cleanupListeners = listen(this.handleAppMessage);
    this.unsubscribe = authClient.subscribe((state) => {
      this.authState = state;
    });
    this.loadApps();

    if (authClient.isAuthenticated()) {
      authClient.me().catch(() => {});
    }

    window.addEventListener('resize', this.handleResize);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanupListeners?.();
    this.unsubscribe?.();
    window.removeEventListener('resize', this.handleResize);
  }

  private unsubscribe: (() => void) | null = null;

  private detectTheme() {
    const stored = localStorage.getItem('plataforma_theme');
    if (stored === 'dark' || stored === 'light') {
      this.theme = stored;
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.theme = prefersDark ? 'dark' : 'light';
    }
    this.applyTheme();
  }

  private applyTheme() {
    document.documentElement.setAttribute('data-theme', this.theme);
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', this.theme);
  }

  private toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('plataforma_theme', this.theme);
    this.applyTheme();
    this.broadcastTheme();
  }

  private broadcastTheme() {
    const iframes = this.shadowRoot?.querySelectorAll('iframe');
    iframes?.forEach((iframe) => {
      if (iframe.contentWindow) {
        sendMessage(iframe.contentWindow, {
          type: 'theme',
          payload: { mode: this.theme },
        });
      }
    });
  }

  private handleResize = () => {
    if (window.innerWidth >= 768) {
      this.sidebarOpen = true;
    }
  };

  private toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  private async loadApps() {
    const token = authClient.getToken();
    if (token) {
      try {
        const res = await fetch('/api/apps', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        if (body.success) {
          this.apps = body.data.filter((a: AppInfo) => a.enabled);
          return;
        }
      } catch {
        // Fallback: load from YAML
      }
    }

    // Fallback: fetch static YAML
    try {
      const res = await fetch('/app-registry.yaml');
      const text = await res.text();
      const parsed = this.parseYamlApps(text);
      this.apps = parsed;
    } catch (err) {
      console.error('Failed to load apps:', err);
    }
  }

  private parseYamlApps(yaml: string): AppInfo[] {
    const lines = yaml.split('\n');
    const apps: AppInfo[] = [];
    let current: Record<string, unknown> | null = null;

    for (const line of lines) {
      if (line.startsWith('  - id:')) {
        if (current) {
          apps.push(current as unknown as AppInfo);
        }
        current = { id: line.split(':')[1]?.trim() ?? '', enabled: true };
      } else if (current) {
        const match = line.match(/^\s+(\w+):\s*(.*)$/);
        if (match) {
          const key = match[1] as string;
          const value = match[2]?.trim() ?? '';
          if (key === 'tags') {
            const nextLines = lines.slice(lines.indexOf(line) + 1);
            const tagMatch = line.match(/^\s+tags:\s*\[?(.*?)\]?$/);
            if (tagMatch?.[1]) {
              current.tags = tagMatch[1].split(',').map((t) => t.trim().replace(/['"]/g, ''));
            }
          } else if (key !== 'tags') {
            (current as Record<string, unknown>)[key] = value;
          }
        }
      }
    }
    if (current) {
      apps.push(current as unknown as AppInfo);
    }
    return apps;
  }

  private handleAppMessage = (event: MessageEvent<AppMessage | ShellMessage>) => {
    const msg = event.data;

    switch (msg.type) {
      case 'app:ready': {
        // Send current auth token to the app
        if (this.authState.token && event.source) {
          sendMessage(event.source as Window, {
            type: 'auth:token',
            payload: {
              token: this.authState.token,
              user: this.authState.user,
            },
          });
        }
        break;
      }

      case 'auth:request': {
        if (this.authState.token && event.source) {
          sendMessage(event.source as Window, {
            type: 'auth:token',
            payload: {
              token: this.authState.token,
              user: this.authState.user,
            },
          });
        }
        break;
      }

      case 'navigate': {
        const payload = msg.payload as { path: string };
        if (payload?.path) {
          this.navigateTo(payload.path);
        }
        break;
      }

      case 'notify': {
        const payload = msg.payload as { type: string; message: string };
        if (payload?.message) {
          this.showNotification(payload.type, payload.message);
        }
        break;
      }
    }
  };

  private navigateTo(path: string) {
    // Extract app route from path
    for (const app of this.apps) {
      if (path.startsWith(app.route) || app.route.startsWith(path)) {
        this.currentApp = app.id;
        // Update URL without reload
        window.history.pushState(null, '', app.route);
        return;
      }
    }
    // If path has an app prefix
    const parts = path.split('/').filter(Boolean);
    if (parts.length > 0) {
      const appPrefix = '/' + parts[0]!;
      this.currentApp = appPrefix;
      window.history.pushState(null, '', path);
    }
  }

  private showNotification(type: string, message: string) {
    const event = new CustomEvent('shell-notify', {
      detail: { type, message },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  private handleLogin() {
    this.loadApps();
    this.broadcastAuth();
  }

  private broadcastAuth() {
    const iframes = this.shadowRoot?.querySelectorAll('iframe');
    iframes?.forEach((iframe) => {
      if (iframe.contentWindow && this.authState.token) {
        sendMessage(iframe.contentWindow, {
          type: 'auth:token',
          payload: {
            token: this.authState.token,
            user: this.authState.user,
          },
        });
      }
    });
  }

  private handleLogout() {
    authClient.logout();
    this.currentApp = null;
    window.history.pushState(null, '', '/');
  }

  private handleAppSelect(app: AppInfo) {
    this.currentApp = app.id;
    window.history.pushState(null, '', app.route);
    // Close sidebar on mobile
    if (window.innerWidth < 768) {
      this.sidebarOpen = false;
    }
  }

  render() {
    if (!this.authState.user) {
      return html`
        <shell-login
          @login-success=${this.handleLogin}
        ></shell-login>
      `;
    }

    return html`
      <shell-space
        .apps=${this.apps}
        .theme=${this.theme}
        .user=${this.authState.user}
        @logout=${this.handleLogout}
      ></shell-space>
    `;
  }
}

customElements.define('shell-app', ShellApp);
