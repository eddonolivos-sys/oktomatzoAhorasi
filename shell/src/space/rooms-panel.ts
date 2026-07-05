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

export class RoomsPanel {
  private root: HTMLDivElement;
  private callbacks: RoomsPanelCallbacks;

  constructor(host: HTMLElement, callbacks: RoomsPanelCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.id = 'roomsPanel';
    host.appendChild(this.root);
  }

  showList(rooms: RoomSummary[]) {
    const raceRooms = rooms.filter((r) => r.name.startsWith(RACE_PREFIX));
    this.root.classList.add('visible');
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
    this.root.querySelector('.rooms-create')?.addEventListener('click', () => this.callbacks.onCreateRoom());
    this.root.querySelector('.rooms-close')?.addEventListener('click', () => this.callbacks.onLeaveRoom());
    this.root.querySelectorAll<HTMLButtonElement>('.rooms-join').forEach((btn) => {
      btn.addEventListener('click', () => {
        const room = btn.dataset.room;
        if (room) this.callbacks.onJoinRoom(room);
      });
    });
  }

  showLobby(view: LobbyView) {
    this.root.classList.add('visible');
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
    this.root.querySelector('.rooms-start')?.addEventListener('click', () => this.callbacks.onStartRace());
    this.root.querySelector('.rooms-close')?.addEventListener('click', () => this.callbacks.onLeaveRoom());
  }

  hide() {
    this.root.classList.remove('visible');
    this.root.innerHTML = '';
  }

  dispose() {
    this.root.remove();
  }
}
