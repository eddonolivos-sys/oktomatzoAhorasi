import * as THREE from 'three';
import { createRemoteShip, type RemoteShipModel } from './remote-ship-model';
import { lerpStateInto, toScene, type PlayerState, type Vec3 } from './multiplayer-math';
import { EMOTE_GLYPH, type Player } from './space-multiplayer';

/** Resultado de la proyección mundo→pantalla (lo provee el motor). */
export interface Projected {
  x: number;
  y: number;
  visible: boolean;
}

const EMOTE_MS = 3000; // duración del emoji flotante
const LERP_RATE = 12; // suavizado del seguimiento (mayor = más rápido)

interface RemoteShip {
  model: RemoteShipModel;
  name: string;
  from: PlayerState; // estado de escena actual (interpolado)
  to: PlayerState; // último target de escena recibido
  nameEl: HTMLDivElement;
  emoteEl: HTMLDivElement;
  emoteUntil: number; // performance.now() hasta el que se muestra el emoji
}

/**
 * Gestor de naves remotas: alta/baja, interpolación entre snapshots, etiqueta de
 * nombre flotante y emoji temporal. El servidor envía coords absolutas; este gestor
 * las convierte a escena con `toScene(worldOffset)` cada snapshot, de modo que un
 * rebase del origen recoloca las naves automáticamente (siempre se posicionan desde
 * coords absolutas vía el worldOffset vigente). No abre WebSocket.
 */
export class RemoteShips {
  private ships = new Map<string, RemoteShip>();
  private localId: string;
  private scene: THREE.Scene;
  private host: HTMLElement;

  constructor(scene: THREE.Scene, host: HTMLElement, localId: string) {
    this.scene = scene;
    this.host = host;
    this.localId = localId;
  }

  /** Aplica un snapshot del servidor (lista completa de la sala). */
  setSnapshot(players: Player[], worldOffset: Vec3) {
    const seen = new Set<string>();
    for (const p of players) {
      if (p.id === this.localId) continue; // la nave propia la dibuja el motor
      seen.add(p.id);
      const scenePos = toScene({ x: p.x, y: p.y, z: p.z }, worldOffset);
      const target: PlayerState = { x: scenePos.x, y: scenePos.y, z: scenePos.z, yaw: p.yaw };
      const existing = this.ships.get(p.id);
      if (existing) {
        existing.to = target;
        existing.name = p.name;
        existing.nameEl.textContent = p.name;
      } else {
        this.add(p.id, p.name, target);
      }
    }
    // Baja de naves ausentes del snapshot (salida sin "left" explícito).
    for (const id of [...this.ships.keys()]) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  /** Alta explícita (mensaje "joined"). */
  addPlayer(p: Player, worldOffset: Vec3) {
    if (p.id === this.localId || this.ships.has(p.id)) return;
    const scenePos = toScene({ x: p.x, y: p.y, z: p.z }, worldOffset);
    this.add(p.id, p.name, { x: scenePos.x, y: scenePos.y, z: scenePos.z, yaw: p.yaw });
  }

  /** Baja explícita (mensaje "left"). */
  removePlayer(id: string) {
    this.remove(id);
  }

  private add(id: string, name: string, target: PlayerState) {
    const model = createRemoteShip();
    model.object.scale.setScalar(0.85);
    model.object.position.set(target.x, target.y, target.z);
    model.object.rotation.y = target.yaw;
    this.scene.add(model.object);

    const nameEl = document.createElement('div');
    nameEl.className = 'remote-name';
    nameEl.textContent = name;
    this.host.appendChild(nameEl);

    const emoteEl = document.createElement('div');
    emoteEl.className = 'remote-emote';
    this.host.appendChild(emoteEl);

    this.ships.set(id, { model, name, from: { ...target }, to: target, nameEl, emoteEl, emoteUntil: 0 });
  }

  private remove(id: string) {
    const s = this.ships.get(id);
    if (!s) return;
    this.scene.remove(s.model.object);
    s.model.dispose();
    s.nameEl.remove();
    s.emoteEl.remove();
    this.ships.delete(id);
  }

  /** Interpola `from→to` y aplica posición + yaw a cada nave. */
  update(delta: number) {
    const t = Math.min(1, LERP_RATE * delta); // seguimiento exponencial estable
    for (const s of this.ships.values()) {
      lerpStateInto(s.from, s.to, t); // muta s.from in-place (sin alocar por frame)
      s.model.object.position.set(s.from.x, s.from.y, s.from.z);
      s.model.object.rotation.y = s.from.yaw;
    }
  }

  /** Muestra un emoji flotante ~3 s sobre la nave indicada. */
  showEmote(id: string, emoji: string) {
    const s = this.ships.get(id);
    if (!s) return;
    s.emoteEl.textContent = EMOTE_GLYPH[emoji] ?? emoji;
    s.emoteUntil = performance.now() + EMOTE_MS;
  }

  /** Reposiciona etiquetas de nombre y emojis con la proyección del motor. */
  updateLabels(project: (world: THREE.Vector3) => Projected, now: number) {
    const tmp = new THREE.Vector3();
    for (const s of this.ships.values()) {
      tmp.set(s.from.x, s.from.y, s.from.z);
      const p = project(tmp);
      if (p.visible) {
        s.nameEl.style.left = `${p.x}px`;
        s.nameEl.style.top = `${p.y}px`;
        s.nameEl.classList.add('visible');
      } else {
        s.nameEl.classList.remove('visible');
      }
      // Emoji: visible mientras no expire Y la nave esté en pantalla.
      const showEmote = now < s.emoteUntil && p.visible;
      if (showEmote) {
        s.emoteEl.style.left = `${p.x}px`;
        s.emoteEl.style.top = `${p.y}px`;
        s.emoteEl.classList.add('visible');
      } else {
        s.emoteEl.classList.remove('visible');
      }
    }
  }

  dispose() {
    for (const id of [...this.ships.keys()]) this.remove(id);
    this.ships.clear();
  }
}
