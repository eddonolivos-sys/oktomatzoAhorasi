import { describe, it, expect, beforeEach, vi } from 'vitest';

const STORAGE_KEY = 'plataforma_token';

// `function` (no `const`/arrow) para que el hoisting normal de JS la deje
// disponible desde el arranque del módulo, incluida la llamada a vi.hoisted
// de abajo (el transform de Vitest reubica ESA llamada antes que los imports,
// pero no reordena declaraciones de función — el hoisting nativo sí cubre eso).
function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

// `auth-client.ts` instancia `export const authClient = new AuthClient()` a
// nivel de módulo, y el constructor lee `localStorage`/`sessionStorage` de
// inmediato. Con `environment: 'node'` esos globals no existen hasta que se
// stubean — y `vi.stubGlobal` en `beforeEach` corre DESPUÉS de que Vitest
// resuelva los imports (fase de colección), demasiado tarde para el import de
// abajo. `vi.hoisted` sí se reubica ANTES de los imports: lo usamos para dejar
// los 3 globals listos antes de que `import './auth-client'` se ejecute.
vi.hoisted(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = makeStorage();
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = makeStorage();
  (globalThis as unknown as { fetch: unknown }).fetch = vi.fn();
});

import { AuthClient } from './auth-client';

describe('AuthClient (S8 — persistencia de sesión, arregla Bug A)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage());
    vi.stubGlobal('sessionStorage', makeStorage());
    vi.stubGlobal('fetch', vi.fn());
  });

  it('subscribe reemite el estado actual de inmediato (sin esperar a me())', () => {
    const client = new AuthClient();
    const received: unknown[] = [];
    client.subscribe((state) => received.push(state));
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ token: null, user: null });
  });

  it('rehidrata el usuario desde localStorage al construirse (sin llamar a me())', () => {
    const persisted = { token: 'tok-123', user: { id: '1', email: 'a@b.com', name: 'A', role: 'user' } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    const client = new AuthClient();
    expect(client.getState()).toEqual(persisted);
  });

  it('migra una sesión previa en sessionStorage a localStorage y limpia el rastro viejo', () => {
    const persisted = { token: 'tok-456', user: { id: '2', email: 'c@d.com', name: 'C', role: 'user' } };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    const client = new AuthClient();
    expect(client.getState()).toEqual(persisted);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(persisted));
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('JSON corrupto en storage no revienta: arranca sin sesión', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const client = new AuthClient();
    expect(client.getState()).toEqual({ token: null, user: null });
  });

  it('me(): un fallo de RED (fetch rechaza) NO cierra la sesión', async () => {
    const persisted = { token: 'tok-789', user: { id: '3', email: 'e@f.com', name: 'E', role: 'user' } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    const client = new AuthClient();
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network down'));
    await expect(client.me()).rejects.toThrow();
    expect(client.getState()).toEqual(persisted);
  });

  it('me(): una respuesta 401 explícita SÍ cierra la sesión', async () => {
    const persisted = { token: 'tok-bad', user: { id: '4', email: 'g@h.com', name: 'G', role: 'user' } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    const client = new AuthClient();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 401,
      json: async () => ({ success: false, error: 'invalid or expired token' }),
    });
    await expect(client.me()).rejects.toThrow();
    expect(client.getState()).toEqual({ token: null, user: null });
  });

  it('me(): un 500 del servidor (success:false, no 401) NO cierra la sesión', async () => {
    const persisted = { token: 'tok-500', user: { id: '5', email: 'i@j.com', name: 'I', role: 'user' } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    const client = new AuthClient();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 500,
      json: async () => ({ success: false, error: 'internal error' }),
    });
    await expect(client.me()).rejects.toThrow();
    expect(client.getState()).toEqual(persisted);
  });

  it('me() exitoso actualiza el user y persiste', async () => {
    const persisted = { token: 'tok-ok', user: { id: '6', email: 'k@l.com', name: 'K old', role: 'user' } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    const client = new AuthClient();
    const fresh = { id: '6', email: 'k@l.com', name: 'K new', role: 'user' };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, data: fresh }),
    });
    const result = await client.me();
    expect(result).toEqual(fresh);
    expect(client.getState().user).toEqual(fresh);
  });
});
