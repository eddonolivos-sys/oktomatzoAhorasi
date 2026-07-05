import { shouldSendState, rttEwma, type PlayerState } from './multiplayer-math';
import { PERF_CONFIG } from './space-config';

/** Jugador tal como lo envía el servidor (coordenadas absolutas de mundo). */
export interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Emoticonos del protocolo (identificadores, no glifos). */
export type Emote = 'happy' | 'sad' | 'angry';

/** Mapa único identificador→glifo sobrio (sin emojis a color). Fuente compartida. */
export const EMOTE_GLYPH: Record<string, string> = { happy: ':)', sad: ':(', angry: '>:(' };

export interface SpaceMultiplayerHandlers {
  onPlayers: (players: Player[]) => void; // snapshot al unirse + state_update por tick
  onJoined: (player: Player) => void;
  onLeft: (id: string) => void;
  onEmote: (id: string, emoji: string) => void;
}

export interface ConnectOpts {
  room: string;
  id: string;
  name: string;
}

/**
 * Cliente WebSocket del espacio multijugador (espejo de MultiplayerClient de
 * app-combate-3d). Conecta a /space-ws, envía estado con throttle (~20 Hz vía
 * shouldSendState), envía emoticonos, expone callbacks y reconecta con backoff.
 * Sin Three.js. El parseo de mensajes sigue el protocolo anclado del plan.
 */
export class SpaceMultiplayer {
  private ws: WebSocket | null = null;
  private handlers: SpaceMultiplayerHandlers;
  private opts: ConnectOpts | null = null;

  private reconnectTimer: number | null = null;
  private reconnectDelay = 1000; // backoff inicial
  private readonly maxReconnectDelay = 15000;

  private lastSentAt = 0;
  private readonly sendIntervalMs = 50; // ~20 Hz

  private lastPingSentAt = 0;
  private rttEwmaMs: number | null = null;

  private closedByUser = false;

  constructor(handlers: SpaceMultiplayerHandlers) {
    this.handlers = handlers;
  }

  connect(opts: ConnectOpts) {
    this.opts = opts;
    this.closedByUser = false;
    this.open();
  }

  private open() {
    if (!this.opts) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = location.host;
    const q =
      `room=${encodeURIComponent(this.opts.room)}` +
      `&id=${encodeURIComponent(this.opts.id)}` +
      `&name=${encodeURIComponent(this.opts.name)}`;
    const url = `${protocol}//${host}/space-ws?${q}`;

    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.reconnectDelay = 1000; // reset del backoff al conectar
    };
    this.ws.onmessage = (event) => {
      try {
        this.handleMessage(JSON.parse(event.data));
      } catch {
        // mensaje no-JSON: ignora
      }
    };
    this.ws.onclose = () => {
      this.ws = null;
      if (this.closedByUser) return;
      this.scheduleReconnect();
    };
    // onerror no agenda reconexión: onclose siempre se dispara tras un error.
    this.ws.onerror = () => {};
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.maxReconnectDelay, this.reconnectDelay * 2);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private handleMessage(msg: { type?: string; [k: string]: unknown }) {
    switch (msg.type) {
      case 'players':
        this.handlers.onPlayers((msg.players as Player[]) || []);
        break;
      case 'state_update':
        this.handlers.onPlayers((msg.players as Player[]) || []);
        break;
      case 'joined':
        if (msg.player) this.handlers.onJoined(msg.player as Player);
        break;
      case 'left':
        if (typeof msg.id === 'string') this.handlers.onLeft(msg.id);
        break;
      case 'emote':
        if (typeof msg.id === 'string' && typeof msg.emoji === 'string') {
          this.handlers.onEmote(msg.id, msg.emoji);
        }
        break;
      case 'pong':
        if (typeof msg.t === 'number') {
          const sampleMs = performance.now() - msg.t;
          this.rttEwmaMs = rttEwma(this.rttEwmaMs, sampleMs, PERF_CONFIG.rttEwmaAlpha);
        }
        break;
    }
  }

  /**
   * Ping periódico (PERF_CONFIG.pingIntervalMs) para medir el RTT del WS. `now`
   * (timestamp del rAF, inicio del frame) regula SOLO el throttle; el `t` del
   * ping se toma con performance.now() EN el envío. El send ocurre al final del
   * update del frame: usar el `now` del rAF como `t` sumaría el coste de CPU
   * del frame a cada muestra (sesgo sistemático, máximo justo bajo el jank que
   * esta instrumentación existe para medir).
   */
  maybeSendPing(now: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (now - this.lastPingSentAt < PERF_CONFIG.pingIntervalMs) return;
    this.lastPingSentAt = now;
    this.ws.send(JSON.stringify({ type: 'ping', t: performance.now() }));
  }

  /** RTT suavizado (EWMA) en ms; null hasta el primer pong. Instrumentación (Hito 0). */
  get rttMs(): number | null {
    return this.rttEwmaMs;
  }

  /** Envía el estado absoluto de la nave, con throttle (~20 Hz). `now` en ms. */
  sendState(state: PlayerState, now: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!shouldSendState(now, this.lastSentAt, this.sendIntervalMs)) return;
    this.lastSentAt = now;
    this.ws.send(
      JSON.stringify({ type: 'state', x: state.x, y: state.y, z: state.z, yaw: state.yaw }),
    );
  }

  sendEmote(emoji: Emote) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'emote', emoji }));
  }

  disconnect() {
    this.closedByUser = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
