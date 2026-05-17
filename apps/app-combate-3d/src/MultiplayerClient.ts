export interface RemotePlayer {
  id: string;
  name: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  alive: boolean;
  health: number;
}

export interface HazardData {
  x: number;
  y: number;
  z: number;
  landed: boolean;
  index: number;
}

export interface ShootData {
  shooter: string;
  origin: [number, number, number];
  dir: [number, number, number];
}

type MsgHandler = {
  onPlayers: (players: RemotePlayer[]) => void;
  onPlayerJoined: (player: RemotePlayer) => void;
  onPlayerLeft: (id: string) => void;
  onHazards: (hazards: HazardData[]) => void;
  onShoot: (data: ShootData) => void;
};

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  readonly playerId: string;
  private handlers: MsgHandler;
  private reconnectTimer: number | null = null;
  private stateInterval: number | null = null;

  constructor(playerId: string, handlers: MsgHandler) {
    this.playerId = playerId;
    this.handlers = handlers;
  }

  connect(name: string) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = location.host;
    const url = `${protocol}//${host}/ws?id=${this.playerId}&name=${encodeURIComponent(name)}`;

    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.startStateSync();
    };
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch {}
    };
    this.ws.onclose = () => {
      this.stopStateSync();
      this.reconnectTimer = window.setTimeout(() => this.connect(name), 3000);
    };
  }

  private handleMessage(msg: any) {
    switch (msg.type) {
      case 'players':
        this.handlers.onPlayers(msg.players || []);
        break;
      case 'state_update':
        this.handlers.onPlayers(msg.players || []);
        break;
      case 'player_joined':
        if (msg.player) this.handlers.onPlayerJoined(msg.player);
        break;
      case 'player_left':
        this.handlers.onPlayerLeft(msg.id);
        break;
      case 'hazards':
        this.handlers.onHazards(msg.hazards || []);
        break;
      case 'shoot':
        if (msg.shooter !== this.playerId) {
          this.handlers.onShoot(msg);
        }
        break;
    }
  }

  sendState(state: { x: number; z: number; heading: number; speed: number; alive: boolean; health: number }) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'state',
      id: this.playerId,
      x: state.x,
      z: state.z,
      heading: state.heading,
      speed: state.speed,
      alive: state.alive,
      health: state.health,
    }));
  }

  sendShoot(origin: [number, number, number], dir: [number, number, number]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'shoot',
      id: this.playerId,
      origin,
      dir,
    }));
  }

  sendDamage(targetId: string, amount: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'damage',
      id: this.playerId,
      targetId,
      amount,
    }));
  }

  sendHitHazard(index: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'hit_hazard',
      id: this.playerId,
      index,
    }));
  }

  private startStateSync() {
    this.stateInterval = window.setInterval(() => {
      // State is sent from the game loop via sendState
    }, 50);
  }

  private stopStateSync() {
    if (this.stateInterval !== null) {
      clearInterval(this.stateInterval);
      this.stateInterval = null;
    }
  }

  disconnect() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopStateSync();
    this.ws?.close();
    this.ws = null;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
