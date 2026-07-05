/**
 * Panel de salas multijugador (Hito 6): listado (crear/unirse) y lobby
 * (jugadores, host, countdown). Vanilla DOM, sin Three.js — mismo patrón que
 * race-hud.ts/perf-hud.ts. Oculto por defecto.
 */
export interface RoomSummary {
  name: string;
  count: number;
  phase: string;
}

export interface LobbyView {
  room: string;
  players: { id: string; name: string }[];
  hostId: string;
  selfId: string;
  /** `null` = sin cuenta atrás en curso (aún esperando al host). */
  countdown: number | null;
}

export interface RoomsPanelCallbacks {
  onCreateRoom: () => void;
  onJoinRoom: (name: string) => void;
  onStartRace: () => void;
  /** Cierra el panel: en el listado equivale a "Cerrar"; en el lobby, a salir de la sala. */
  onLeaveRoom: () => void;
}

const RACE_PREFIX = 'race:';

/** Serializa lo que decide el HTML del listado, para saltar el re-render si no cambió (mejora 3c). */
function listKey(rooms: RoomSummary[]): string {
  return rooms.map((r) => `${r.name}:${r.count}:${r.phase}`).join('|');
}

/** Serializa lo que decide el HTML del lobby, para saltar el re-render si no cambió (mejora 3c). */
function lobbyKey(view: LobbyView): string {
  const players = view.players.map((p) => `${p.id}:${p.name}`).join(',');
  // El countdown se redondea: solo importa el número entero que se MUESTRA
  // (Math.ceil), no cada micro-decremento por frame — si no, seguiría
  // reconstruyendo el DOM ~60 veces por segundo durante la cuenta atrás.
  const countdown = view.countdown === null ? 'null' : Math.ceil(view.countdown);
  return `${view.room}|${view.hostId}|${view.selfId}|${countdown}|${players}`;
}

export class RoomsPanel {
  private root: HTMLDivElement;
  private callbacks: RoomsPanelCallbacks;
  /** Última clave renderizada (mejora 3c): evita reconstruir el DOM (y con
   * él, perder los listeners de los botones) en cada llamada de un mismo
   * frame — antes, showLobby() se llamaba ~60 veces/s mientras el lobby
   * estaba visible, reemplazando el botón "Iniciar carrera" bajo el propio
   * click del usuario (mousedown y mouseup caían en nodos DOM distintos y el
   * evento "click" nunca llegaba a dispararse). */
  private lastKey: string | null = null;

  constructor(host: HTMLElement, callbacks: RoomsPanelCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.id = 'roomsPanel';
    host.appendChild(this.root);
    // Delegación de eventos (mejora 3c, defensa en profundidad junto al
    // salto de re-render de arriba): un único listener persistente en la
    // raíz, nunca destruido por un innerHTML posterior, así que un click
    // sigue funcionando aunque el contenido SÍ llegue a reconstruirse.
    this.root.addEventListener('click', this.onClick);
  }

  private onClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('.rooms-create')) {
      this.callbacks.onCreateRoom();
      return;
    }
    if (target.closest('.rooms-close')) {
      this.callbacks.onLeaveRoom();
      return;
    }
    if (target.closest('.rooms-start')) {
      this.callbacks.onStartRace();
      return;
    }
    const joinBtn = target.closest<HTMLButtonElement>('.rooms-join');
    if (joinBtn && !joinBtn.disabled) {
      const room = joinBtn.dataset.room;
      if (room) this.callbacks.onJoinRoom(room);
    }
  };

  showList(rooms: RoomSummary[]) {
    this.root.classList.add('visible');
    const key = 'list:' + listKey(rooms);
    if (key === this.lastKey) return;
    this.lastKey = key;

    const raceRooms = rooms.filter((r) => r.name.startsWith(RACE_PREFIX));
    this.root.innerHTML = `
      <div class="rooms-title">Salas de carrera</div>
      <button class="rooms-create">Crear sala nueva</button>
      <div class="rooms-list">
        ${
          raceRooms.length === 0
            ? '<div class="rooms-empty">No hay salas activas.</div>'
            : raceRooms
                .map(
                  (r) => `
          <div class="rooms-row">
            <span class="rooms-row-name">${r.name.slice(RACE_PREFIX.length)}</span>
            <span class="rooms-row-count">${r.count} jugador${r.count === 1 ? '' : 'es'}</span>
            <button class="rooms-join" ${r.phase === 'racing' ? 'disabled' : ''} data-room="${r.name}">
              ${r.phase === 'racing' ? 'En curso' : 'Unirse'}
            </button>
          </div>`,
                )
                .join('')
        }
      </div>
      <button class="rooms-close">Cerrar</button>
    `;
  }

  showLobby(view: LobbyView) {
    this.root.classList.add('visible');
    const key = 'lobby:' + lobbyKey(view);
    if (key === this.lastKey) return;
    this.lastKey = key;

    if (view.countdown !== null) {
      this.root.innerHTML = `<div class="rooms-countdown">${Math.ceil(view.countdown)}</div>`;
      return;
    }
    const isHost = view.selfId === view.hostId;
    this.root.innerHTML = `
      <div class="rooms-title">Sala ${view.room.slice(RACE_PREFIX.length)}</div>
      <div class="rooms-players">
        ${view.players
          .map(
            (p) =>
              `<div class="rooms-player${p.id === view.hostId ? ' is-host' : ''}">${p.name}${
                p.id === view.hostId ? ' (host)' : ''
              }</div>`,
          )
          .join('')}
      </div>
      ${
        isHost
          ? '<button class="rooms-start">Iniciar carrera</button>'
          : '<div class="rooms-waiting">Esperando al host...</div>'
      }
      <button class="rooms-close">Salir de la sala</button>
    `;
  }

  hide() {
    this.root.classList.remove('visible');
    this.root.innerHTML = '';
    this.lastKey = null;
  }

  dispose() {
    this.root.removeEventListener('click', this.onClick);
    this.root.remove();
  }
}
