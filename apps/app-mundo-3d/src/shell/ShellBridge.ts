import { ShellClient } from '@plataforma/shell-protocol';

export type ThemeMode = 'light' | 'dark';

export class ShellBridge {
  private client: ShellClient;
  private token: string | null = null;
  private theme: ThemeMode = 'dark';

  onThemeChange: ((mode: ThemeMode) => void) | null = null;

  constructor(appId: string) {
    this.client = new ShellClient(appId);

    this.client.onToken = (token, user) => {
      this.token = token;
      console.log('[mundo-3d] autenticado como', user.name);
    };

    this.client.onTheme = (mode) => {
      this.theme = mode as ThemeMode;
      this.onThemeChange?.(this.theme);
    };

    this.client.onLogout = () => {
      this.token = null;
    };

    this.setupHeightReporting();
    this.client.requestAuth();
  }

  private setupHeightReporting() {
    const report = () => this.client.reportHeight(document.documentElement.scrollHeight);
    window.addEventListener('resize', report);
    new ResizeObserver(report).observe(document.body);
    report();
  }

  get authToken(): string | null {
    return this.token;
  }

  get currentTheme(): ThemeMode {
    return this.theme;
  }

  notify(type: 'success' | 'error' | 'info' | 'warning', message: string) {
    this.client.notify(type, message);
  }

  destroy() {
    this.client.destroy();
  }
}
