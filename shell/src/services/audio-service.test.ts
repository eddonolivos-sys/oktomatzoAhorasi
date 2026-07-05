import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.hoisted(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = makeStorage();
});

import { AudioService } from './audio-service';

const STORAGE_KEY = 'plataforma_audio';

describe('AudioService (Hito 3 — reducer de estado, sin WebAudio)', () => {
  beforeEach(() => {
    // Reinicia el localStorage stubeado entre tests (aislamiento) — mismo
    // patrón que auth-client.test.ts; sin esto, el estado persistido por un
    // test contamina la rehidratación del siguiente.
    vi.stubGlobal('localStorage', makeStorage());
  });

  it('estado inicial: sin persistencia previa, usa los valores por defecto', () => {
    const svc = new AudioService();
    expect(svc.getState()).toEqual({
      masterMuted: false,
      masterVolume: 0.8,
      sfxMuted: false,
      projectMuted: {},
    });
  });

  it('subscribe reemite el estado actual de inmediato', () => {
    const svc = new AudioService();
    const received: unknown[] = [];
    svc.subscribe((s) => received.push(s));
    expect(received).toHaveLength(1);
  });

  it('setMasterMuted actualiza el estado, persiste y notifica', () => {
    const svc = new AudioService();
    const received: unknown[] = [];
    svc.subscribe((s) => received.push(s));
    svc.setMasterMuted(true);
    expect(svc.getState().masterMuted).toBe(true);
    expect(received).toHaveLength(2); // reemisión inicial + el cambio
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"masterMuted":true');
  });

  it('setMasterVolume acota el valor a [0,1]', () => {
    const svc = new AudioService();
    svc.setMasterVolume(1.5);
    expect(svc.getState().masterVolume).toBe(1);
    svc.setMasterVolume(-0.5);
    expect(svc.getState().masterVolume).toBe(0);
  });

  it('setSfxMuted actualiza independientemente de masterMuted', () => {
    const svc = new AudioService();
    svc.setSfxMuted(true);
    expect(svc.getState()).toEqual({
      masterMuted: false,
      masterVolume: 0.8,
      sfxMuted: true,
      projectMuted: {},
    });
  });

  it('setProjectMuted/isProjectMuted funcionan por appId, sin afectar a otros proyectos', () => {
    const svc = new AudioService();
    svc.setProjectMuted('dashboard', true);
    expect(svc.isProjectMuted('dashboard')).toBe(true);
    expect(svc.isProjectMuted('viewer-3d')).toBe(false);
  });

  it('rehidrata el estado persistido al construirse', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ masterMuted: true, masterVolume: 0.3, sfxMuted: true, projectMuted: { x: true } }),
    );
    const svc = new AudioService();
    expect(svc.getState()).toEqual({ masterMuted: true, masterVolume: 0.3, sfxMuted: true, projectMuted: { x: true } });
  });

  it('JSON corrupto en storage no revienta: arranca con los valores por defecto', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const svc = new AudioService();
    expect(svc.getState().masterMuted).toBe(false);
  });

  it('getState() devuelve una copia (mutar el resultado no afecta el estado interno)', () => {
    const svc = new AudioService();
    const s = svc.getState();
    s.masterMuted = true;
    s.projectMuted['x'] = true;
    expect(svc.getState().masterMuted).toBe(false);
    expect(svc.getState().projectMuted).toEqual({});
  });
});
