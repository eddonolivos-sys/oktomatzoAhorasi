import { duckingGain } from '../space/audio-math';
import { AUDIO_CONFIG } from '../space/space-config';

export interface AudioState {
  masterMuted: boolean;
  masterVolume: number; // 0..1
  sfxMuted: boolean;
  projectMuted: Record<string, boolean>;
}

type AudioListener = (state: AudioState) => void;

const STORAGE_KEY = 'plataforma_audio';

const DEFAULT_STATE: AudioState = {
  masterMuted: false,
  masterVolume: AUDIO_CONFIG.defaultMasterVolume,
  sfxMuted: false,
  projectMuted: {},
};

/**
 * Estado y motor de audio (Hito 3): singleton con `subscribe()` (patrón de
 * `auth-client.ts`), persistido en localStorage. La parte de ESTADO (mute,
 * volumen, reducer) es pura y testeable sin tocar WebAudio; el AudioContext
 * solo se crea al llamar `unlock()` (política de autoplay: el contexto
 * arranca `suspended`, se resume en el primer gesto del usuario).
 */
export class AudioService {
  private state: AudioState = { ...DEFAULT_STATE };
  private listeners: Set<AudioListener> = new Set();

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private projectGain: GainNode | null = null;

  private musicSource: AudioBufferSourceNode | null = null;

  private thrusterBuffer: AudioBuffer | null = null;
  private thrusterGainNode: GainNode | null = null;
  private nitroBuffer: AudioBuffer | null = null;
  private nitroGainNode: GainNode | null = null;
  private collisionBuffer: AudioBuffer | null = null;

  private projectSource: AudioBufferSourceNode | null = null;
  private projectSourceGain: GainNode | null = null;
  private currentProjectId: string | null = null;

  private duckRafId = 0;
  private duckLevel = 1;
  private inCockpit = false;

  constructor() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.state = { ...DEFAULT_STATE, ...parsed, projectMuted: { ...parsed.projectMuted } };
        }
      } catch {
        // JSON corrupto: arranca con los valores por defecto.
      }
    }
  }

  getState(): AudioState {
    return { ...this.state, projectMuted: { ...this.state.projectMuted } };
  }

  subscribe(listener: AudioListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach((l) => l(s));
  }

  private persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  setMasterMuted(muted: boolean) {
    this.state = { ...this.state, masterMuted: muted };
    this.applyGains();
    this.persist();
    this.notify();
  }

  setMasterVolume(volume: number) {
    this.state = { ...this.state, masterVolume: Math.max(0, Math.min(1, volume)) };
    this.applyGains();
    this.persist();
    this.notify();
  }

  setSfxMuted(muted: boolean) {
    this.state = { ...this.state, sfxMuted: muted };
    this.applyGains();
    this.persist();
    this.notify();
  }

  setProjectMuted(appId: string, muted: boolean) {
    this.state = { ...this.state, projectMuted: { ...this.state.projectMuted, [appId]: muted } };
    this.applyProjectGain();
    this.persist();
    this.notify();
  }

  isProjectMuted(appId: string): boolean {
    return !!this.state.projectMuted[appId];
  }

  private applyGains() {
    if (this.masterGain) {
      this.masterGain.gain.value = this.state.masterMuted ? 0 : this.state.masterVolume;
    }
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.state.sfxMuted ? 0 : 1;
    }
  }

  private applyProjectGain() {
    if (this.projectSourceGain && this.currentProjectId) {
      this.projectSourceGain.gain.value = this.isProjectMuted(this.currentProjectId) ? 0 : 1;
    }
  }

  /** Desbloquea el AudioContext (política de autoplay): llamar en el primer gesto del usuario. */
  unlock() {
    if (!this.ctx) this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private initContext() {
    const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return; // navegador sin WebAudio: audio queda deshabilitado, no rompe el resto de la app
    this.ctx = new Ctor();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.masterGain);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.masterGain);
    this.projectGain = this.ctx.createGain();
    this.projectGain.connect(this.masterGain);
    this.applyGains();
    this.startDuckLoop();
    this.loadAmbientMusic();
  }

  private async loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      return await this.ctx.decodeAudioData(arr);
    } catch {
      return null; // audio opcional: si falta el archivo, no rompe nada (ver README)
    }
  }

  private async loadAmbientMusic() {
    const buf = await this.loadBuffer('/audio/ambient.ogg');
    if (!buf || !this.ctx || !this.musicGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.musicGain);
    src.start();
    this.musicSource = src;
  }

  async loadThrusterSfx() {
    if (this.thrusterBuffer || !this.ctx || !this.sfxGain) return;
    const buf = await this.loadBuffer('/audio/sfx/thruster.ogg');
    if (!buf || !this.ctx || !this.sfxGain) return;
    this.thrusterBuffer = buf;
    this.thrusterGainNode = this.ctx.createGain();
    this.thrusterGainNode.gain.value = 0;
    this.thrusterGainNode.connect(this.sfxGain);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.thrusterGainNode);
    src.start();
  }

  async loadNitroSfx() {
    if (this.nitroBuffer || !this.ctx || !this.sfxGain) return;
    const buf = await this.loadBuffer('/audio/sfx/nitro.ogg');
    if (!buf || !this.ctx || !this.sfxGain) return;
    this.nitroBuffer = buf;
    this.nitroGainNode = this.ctx.createGain();
    this.nitroGainNode.gain.value = 0;
    this.nitroGainNode.connect(this.sfxGain);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.nitroGainNode);
    src.start();
  }

  /** Gain del propulsor (0..1), llamado cada frame desde space-engine.ts. */
  setThrusterGain(gain: number) {
    if (this.thrusterGainNode) this.thrusterGainNode.gain.value = gain;
  }

  /** Gain del nitro (0..1), llamado cada frame desde space-engine.ts. */
  setNitroGain(gain: number) {
    if (this.nitroGainNode) this.nitroGainNode.gain.value = gain;
  }

  /**
   * Hook de colisión (Hito 5 la conectará de verdad a un evento real; por
   * ahora existe y es invocable, pero nada la llama todavía).
   */
  async playCollisionSfx() {
    if (!this.collisionBuffer) {
      const buf = await this.loadBuffer('/audio/sfx/collision.ogg');
      if (!buf) return;
      this.collisionBuffer = buf;
    }
    if (!this.ctx || !this.sfxGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.collisionBuffer;
    src.connect(this.sfxGain);
    src.start();
  }

  /** Al entrar en la cabina de un proyecto: reproduce su audio ambiental (si existe) y activa el ducking. */
  async enterProjectAudio(appId: string) {
    this.inCockpit = true;
    this.currentProjectId = appId;
    if (!this.ctx || !this.projectGain) return;
    const buf = await this.loadBuffer(`/audio/projects/${appId}.ogg`);
    if (!buf || !this.ctx || !this.projectGain || this.currentProjectId !== appId) return;
    this.stopProjectSource();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = this.isProjectMuted(appId) ? 0 : 1;
    src.connect(g).connect(this.projectGain);
    src.start();
    this.projectSource = src;
    this.projectSourceGain = g;
  }

  /** Al volver al espacio: detiene el audio del proyecto y desactiva el ducking. */
  exitProjectAudio() {
    this.inCockpit = false;
    this.currentProjectId = null;
    this.stopProjectSource();
  }

  private stopProjectSource() {
    try {
      this.projectSource?.stop();
    } catch {
      // ya detenido: ignorar
    }
    this.projectSource = null;
    this.projectSourceGain = null;
  }

  private startDuckLoop() {
    let last = performance.now();
    const tick = (t: number) => {
      const delta = Math.min(0.1, (t - last) / 1000);
      last = t;
      this.duckLevel = duckingGain(this.duckLevel, this.inCockpit, AUDIO_CONFIG.duckLevel, AUDIO_CONFIG.duckDamp, delta);
      if (this.musicGain) this.musicGain.gain.value = this.duckLevel;
      this.duckRafId = requestAnimationFrame(tick);
    };
    this.duckRafId = requestAnimationFrame(tick);
  }
}

export const audioService = new AudioService();
