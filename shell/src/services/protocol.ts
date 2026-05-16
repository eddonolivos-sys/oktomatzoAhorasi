export interface AppInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  route: string;
  src: string;
  version: string;
  sandbox: string;
  category: string;
  tags: string[];
  enabled: boolean;
}

export type ShellMessageType =
  | 'auth:token'
  | 'auth:clear'
  | 'theme'
  | 'navigate'
  | 'shell:ready';

export type AppMessageType =
  | 'app:ready'
  | 'auth:request'
  | 'navigate'
  | 'resize'
  | 'notify';

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

export interface ThemePayload {
  mode: 'light' | 'dark';
  variables?: Record<string, string>;
}

export function isAppMessage(data: unknown): data is AppMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  return typeof msg.type === 'string' && msg.type.startsWith('app:');
}

export function isShellMessage(data: unknown): data is ShellMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  return typeof msg.type === 'string' && (msg.type.startsWith('auth:') || msg.type.startsWith('shell:') || msg.type === 'theme' || msg.type === 'navigate');
}

export function sendMessage(target: Window, message: ShellMessage, targetOrigin: string = '*') {
  target.postMessage(message, targetOrigin);
}

export function listen(callback: (event: MessageEvent<AppMessage | ShellMessage>) => void) {
  const handler = (event: MessageEvent) => {
    if (isAppMessage(event.data) || isShellMessage(event.data)) {
      callback(event as MessageEvent<AppMessage | ShellMessage>);
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
