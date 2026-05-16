export type ShellMessageType =
  | 'auth:token'
  | 'auth:clear'
  | 'theme'
  | 'navigate'
  | 'shell:ready'
  | 'event:emit'
  | 'event:receive';

export type AppMessageType =
  | 'app:ready'
  | 'auth:request'
  | 'navigate'
  | 'resize'
  | 'notify'
  | 'event:emit';

export interface ShellMessage {
  type: ShellMessageType;
  payload?: unknown;
}

export interface AppMessage {
  type: AppMessageType;
  payload?: unknown;
}

export interface AuthTokenPayload {
  token: string;
  user: { id: string; email: string; name: string; role: string };
}

export interface ThemePayload {
  mode: 'light' | 'dark';
  variables?: Record<string, string>;
}

export interface ResizePayload {
  height: number;
}

export interface NavigatePayload {
  path: string;
}

export interface NotifyPayload {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

export interface CrossAppEvent {
  channel: string;
  data: unknown;
}

export type MessagePayload =
  | AuthTokenPayload
  | ThemePayload
  | ResizePayload
  | NavigatePayload
  | NotifyPayload
  | CrossAppEvent;

export function isAppMessage(data: unknown): data is AppMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  return typeof msg.type === 'string' && msg.type.startsWith('app:');
}

export function isShellMessage(data: unknown): data is ShellMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  return typeof msg.type === 'string' && (
    msg.type.startsWith('auth:') ||
    msg.type.startsWith('shell:') ||
    msg.type === 'theme' ||
    msg.type === 'navigate' ||
    msg.type.startsWith('event:')
  );
}

export function postMessage(target: Window, message: ShellMessage | AppMessage, targetOrigin: string = '*') {
  target.postMessage(message, targetOrigin);
}

export function listen(
  callback: (event: MessageEvent<AppMessage | ShellMessage>) => void,
): () => void {
  const handler = (event: MessageEvent) => {
    const data = event.data as unknown;
    if (isAppMessage(data) || isShellMessage(data)) {
      callback(event as MessageEvent<AppMessage | ShellMessage>);
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

export class ShellClient {
  private appId: string;
  private ready = false;
  private cleanup: (() => void) | null = null;
  private eventListeners = new Map<string, Set<(data: unknown) => void>>();

  constructor(appId: string) {
    this.appId = appId;
    this.cleanup = listen(this.handleMessage);
    this.notifyReady();
  }

  private notifyReady() {
    postMessage(window.parent, { type: 'app:ready' });
    this.ready = true;
  }

  private handleMessage = (event: MessageEvent<AppMessage | ShellMessage>) => {
    const msg = event.data;

    switch (msg.type) {
      case 'auth:token': {
        const payload = msg.payload as AuthTokenPayload;
        this.onToken?.(payload.token, payload.user);
        break;
      }

      case 'auth:clear': {
        this.onLogout?.();
        break;
      }

      case 'theme': {
        const payload = msg.payload as ThemePayload;
        this.onTheme?.(payload.mode, payload.variables);
        break;
      }

      case 'event:receive': {
        const payload = msg.payload as CrossAppEvent;
        const handlers = this.eventListeners.get(payload.channel);
        if (handlers) {
          handlers.forEach((h) => h(payload.data));
        }
        break;
      }
    }
  };

  onToken: ((token: string, user: AuthTokenPayload['user']) => void) | null = null;
  onTheme: ((mode: 'light' | 'dark', variables?: Record<string, string>) => void) | null = null;
  onLogout: (() => void) | null = null;

  requestAuth() {
    postMessage(window.parent, { type: 'auth:request' });
  }

  reportHeight(height: number) {
    postMessage(window.parent, { type: 'resize', payload: { height } });
  }

  navigate(path: string) {
    postMessage(window.parent, { type: 'navigate', payload: { path } });
  }

  notify(type: NotifyPayload['type'], message: string, duration?: number) {
    postMessage(window.parent, { type: 'notify', payload: { type, message, duration } });
  }

  emit(channel: string, data: unknown) {
    postMessage(window.parent, { type: 'event:emit', payload: { channel, data } });
  }

  on(channel: string, handler: (data: unknown) => void): () => void {
    if (!this.eventListeners.has(channel)) {
      this.eventListeners.set(channel, new Set());
    }
    this.eventListeners.get(channel)!.add(handler);
    return () => {
      this.eventListeners.get(channel)?.delete(handler);
    };
  }

  destroy() {
    this.cleanup?.();
    this.eventListeners.clear();
    this.onToken = null;
    this.onTheme = null;
    this.onLogout = null;
  }
}
