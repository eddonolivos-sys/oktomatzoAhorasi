export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'guest';
}

export interface AuthState {
  token: string | null;
  user: User | null;
}

type AuthListener = (state: AuthState) => void;

const API_BASE = '/api';
const STORAGE_KEY = 'plataforma_token';

export class AuthClient {
  private state: AuthState = { token: null, user: null };
  private listeners: Set<AuthListener> = new Set();
  private refreshInterval: number | null = null;

  constructor() {
    // S8 (arregla Bug A): persistencia en localStorage (sobrevive recargas y
    // pestañas nuevas). Migración desde el esquema previo (sessionStorage):
    // si no hay nada en localStorage pero sí en sessionStorage, se adopta y
    // se limpia el rastro viejo.
    const fromLocal = localStorage.getItem(STORAGE_KEY);
    const fromSession = sessionStorage.getItem(STORAGE_KEY);
    const raw = fromLocal ?? fromSession;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.state = parsed as AuthState;
        }
      } catch {
        // JSON corrupto: arranca sin sesión.
      }
    }
    if (fromSession) sessionStorage.removeItem(STORAGE_KEY);
    if (this.state.token) this.persist();
  }

  getState(): AuthState {
    return { ...this.state };
  }

  isAuthenticated(): boolean {
    return !!this.state.token;
  }

  /** S8: reemite el estado actual de inmediato al suscribirse, para que el
   * usuario rehidratado en el constructor no dependa de que `me()` resuelva
   * (arregla Bug A: re-pedía login en un montaje fresco). */
  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((l) => l(state));
  }

  private persist() {
    if (this.state.token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  async login(email: string, password: string): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const body = await res.json();
    if (!body.success) {
      throw new Error(body.error || 'Login failed');
    }

    this.state = { token: body.data.token, user: body.data.user };
    this.persist();
    this.startRefresh();
    this.notify();
    return body.data.user;
  }

  async register(email: string, name: string, password: string): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password }),
    });

    const body = await res.json();
    if (!body.success) {
      throw new Error(body.error || 'Registration failed');
    }

    this.state = { token: body.data.token, user: body.data.user };
    this.persist();
    this.startRefresh();
    this.notify();
    return body.data.user;
  }

  async loginAsGuest(): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/guest`, { method: 'POST' });

    const body = await res.json();
    if (!body.success) {
      throw new Error(body.error || 'Guest login failed');
    }

    this.state = { token: body.data.token, user: body.data.user };
    this.persist();
    this.startRefresh();
    this.notify();
    return body.data.user;
  }

  async me(): Promise<User> {
    if (!this.state.token) {
      throw new Error('No token');
    }

    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${this.state.token}` },
    });

    const body = await res.json();
    if (!body.success) {
      // S8 (arregla Bug A): solo una respuesta 401 EXPLÍCITA es sesión
      // inválida de verdad (backend/internal/handler/middleware.go y
      // auth_handler.go: TODAS las rutas de fallo de /auth/me devuelven 401).
      // Cualquier otro fallo (500, etc.) es transitorio del servidor: NO
      // cierra la sesión. Un fallo de RED (fetch rechaza) ni siquiera llega
      // aquí — se propaga antes, sin togar el estado.
      if (res.status === 401) {
        this.logout();
      }
      throw new Error(body.error || 'Session expired');
    }

    this.state = { ...this.state, user: body.data };
    this.persist();
    this.notify();
    return body.data;
  }

  logout() {
    this.state = { token: null, user: null };
    this.persist();
    this.stopRefresh();
    this.notify();
  }

  getToken(): string | null {
    return this.state.token;
  }

  private startRefresh() {
    this.stopRefresh();
    this.refreshInterval = window.setInterval(() => {
      this.me().catch(() => {});
    }, 15 * 60 * 1000);
  }

  private stopRefresh() {
    if (this.refreshInterval !== null) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
}

export const authClient = new AuthClient();
