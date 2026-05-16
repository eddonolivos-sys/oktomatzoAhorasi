export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

export interface AuthState {
  token: string | null;
  user: User | null;
}

type AuthListener = (state: AuthState) => void;

const API_BASE = '/api';
const STORAGE_KEY = 'plataforma_token';

class AuthClient {
  private state: AuthState = { token: null, user: null };
  private listeners: Set<AuthListener> = new Set();
  private refreshInterval: number | null = null;

  constructor() {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          this.state = parsed as AuthState;
        }
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }

  getState(): AuthState {
    return { ...this.state };
  }

  isAuthenticated(): boolean {
    return !!this.state.token;
  }

  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((l) => l(state));
  }

  private persist() {
    if (this.state.token) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
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

  async me(): Promise<User> {
    if (!this.state.token) {
      throw new Error('No token');
    }

    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${this.state.token}` },
    });

    const body = await res.json();
    if (!body.success) {
      this.logout();
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
      this.me().catch(() => this.logout());
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
