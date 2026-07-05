import * as THREE from 'three';
import type { AppInfo } from '../services/protocol';
import { createPlanet } from './planet';
import { colorForCategory } from './layout';
import { planetLayout, orbitPosition, planetWorldCenter, captureState } from './orbits';
import { approachBrakeFactor } from './flight-math';
import { SOLAR_CONFIG, ORBIT_CONFIG } from './space-config';
import { initialsFor } from './initials';

export interface RadarBlip {
  name: string;
  position: THREE.Vector3;
  app: AppInfo;
}

export interface ApproachInfo {
  app: AppInfo;
  distance: number;
  influenceRadius: number;
  /** Posición (centro) del planeta en aproximación, en coordenadas de ESCENA (S1). */
  center: THREE.Vector3;
  /** Radio físico del planeta. */
  planetRadius: number;
}

export interface ApproachHint {
  app: AppInfo;
  distance: number;
}

export interface SolarUpdate {
  approaching: ApproachInfo | null;
  /** S2: planeta en radio de AVISO (más amplio que la captura), sin interacción. */
  hint: ApproachHint | null;
  dwellProgress: number;
  entered: AppInfo | null;
}

interface SolarPlanet {
  app: AppInfo;
  mesh: THREE.Mesh;
  /** Rótulo de iniciales (Hito 4), hijo de `mesh`. */
  initialsSprite: THREE.Sprite;
  /** Tamaño físico del planeta (radio de la esfera). */
  planetRadius: number;
  /** Radio de la esfera de influencia (gatillo de aproximación/dwell). */
  influenceRadius: number;
  radius: number;
  inclination: number;
  phase: number;
  speed: number;
  /** Material shader del planeta (para animar uTime). */
  mat: THREE.ShaderMaterial;
}

const PLANET_MIN = SOLAR_CONFIG.planetMin;
const PLANET_MAX = SOLAR_CONFIG.planetMax;
const INFLUENCE_FACTOR = SOLAR_CONFIG.influenceFactor;
const HINT_FACTOR = ORBIT_CONFIG.approachHintFactor;
const BRAKE_MIN_FACTOR = 0.25; // damping fuerte en el núcleo de la esfera

function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h || 1;
}

/** Sprite de iniciales (Hito 4): hijo del mesh del planeta, hereda su órbita y rebase gratis. */
function createInitialsSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `700 ${Math.floor(size * 0.4)}px "Cinzel Decorative", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Crema apagado (--space-text-2): luminancia ≈0.49, por debajo del umbral
  // de bloom (0.6) — no florece.
  ctx.fillStyle = '#8A7A6A';
  ctx.fillText(text, size / 2, size / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  return new THREE.Sprite(material);
}

/**
 * Sistema solar heliocéntrico: un planeta por app del registry orbitando el sol
 * Ramatzo (origen de escena). Calcula aproximación + frenado + permanencia por
 * frame y expone blips 3D para el radar.
 *
 * S1 (arregla Bug C — planetas que desaparecían): los meshes cuelgan de
 * `systemGroup`, un `THREE.Group` hijo de la escena. `update()` sigue
 * escribiendo `orbitPosition` en `mesh.position`, pero ahora son coordenadas
 * LOCALES al grupo. `rebase()` mueve el GRUPO (como `asteroids.ts`), no cada
 * mesh — así el rebase no queda anulado por el siguiente `update()`. El
 * centro entregado a la órbita de la nave (`ApproachInfo.center`) y los blips
 * del radar se calculan en coordenadas de ESCENA vía `planetWorldCenter`.
 */
export class SolarSystem {
  private planets: SolarPlanet[] = [];
  private readonly systemGroup = new THREE.Group();
  /** Vector de escaneo reutilizado por frame por planeta (evita allocs). */
  private readonly tmpWorld = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    apps: AppInfo[],
    _renderer: THREE.WebGLRenderer,
  ) {
    this.scene.add(this.systemGroup);
    const total = apps.length;
    apps.forEach((app, i) => {
      const layout = planetLayout(i, total, SOLAR_CONFIG.scale);
      // Tamaño compacto, determinista por índice (interiores algo menores).
      const planetRadius = PLANET_MIN + ((PLANET_MAX - PLANET_MIN) * (i % 4)) / 3;
      const seed = seedFromId(app.id);
      const mesh = createPlanet(planetRadius, seed, colorForCategory(app.category));
      const initialsSprite = createInitialsSprite(initialsFor(app.name));
      initialsSprite.position.y = planetRadius * 1.3;
      initialsSprite.scale.set(planetRadius * 0.8, planetRadius * 0.8, 1);
      mesh.add(initialsSprite);
      this.systemGroup.add(mesh);
      this.planets.push({
        app,
        mesh,
        initialsSprite,
        planetRadius,
        influenceRadius: planetRadius * INFLUENCE_FACTOR,
        radius: layout.radius,
        inclination: layout.inclination,
        phase: layout.phase,
        speed: layout.speed * SOLAR_CONFIG.orbitSpeedScale,
        mat: mesh.material as THREE.ShaderMaterial,
      });
    });
  }

  update(elapsed: number, delta: number, shipPos: THREE.Vector3): SolarUpdate {
    let nearestCapture: SolarPlanet | null = null;
    let nearestCaptureDist = Infinity;
    let nearestCaptureCenter: THREE.Vector3 | null = null;
    let nearestHint: SolarPlanet | null = null;
    let nearestHintDist = Infinity;

    for (const p of this.planets) {
      const pos = orbitPosition(p.radius, p.inclination, p.phase, p.speed, elapsed);
      p.mesh.position.set(pos.x, pos.y, pos.z);
      p.mesh.rotation.y += 0.05 * delta;
      const t = p.mat.uniforms['uTime'];
      if (t) t.value = elapsed;

      const world = planetWorldCenter(this.systemGroup.position, p.mesh.position);
      this.tmpWorld.set(world.x, world.y, world.z);
      const dist = this.tmpWorld.distanceTo(shipPos);
      const state = captureState(dist, p.planetRadius, {
        influenceFactor: INFLUENCE_FACTOR,
        approachHintFactor: HINT_FACTOR,
      });
      if (state === 'capture' && dist < nearestCaptureDist) {
        nearestCapture = p;
        nearestCaptureDist = dist;
        nearestCaptureCenter = this.tmpWorld.clone();
      } else if (state === 'hint' && dist < nearestHintDist) {
        nearestHint = p;
        nearestHintDist = dist;
      }
    }

    const approaching: ApproachInfo | null = nearestCapture
      ? {
          app: nearestCapture.app,
          distance: nearestCaptureDist,
          influenceRadius: nearestCapture.influenceRadius,
          center: nearestCaptureCenter!,
          planetRadius: nearestCapture.planetRadius,
        }
      : null;

    const hint: ApproachHint | null =
      !approaching && nearestHint ? { app: nearestHint.app, distance: nearestHintDist } : null;

    return { approaching, hint, dwellProgress: 0, entered: null };
  }

  /**
   * Factor de frenado [BRAKE_MIN_FACTOR..1] para `ship.setApproachBrake`.
   * 1 si no hay aproximación; <1 proporcional a la cercanía al núcleo.
   */
  brakeFactor(approaching: ApproachInfo | null): number {
    if (!approaching) return 1;
    return approachBrakeFactor(approaching.distance, approaching.influenceRadius, BRAKE_MIN_FACTOR);
  }

  getRadarBlips(): RadarBlip[] {
    return this.planets.map((p) => {
      const world = planetWorldCenter(this.systemGroup.position, p.mesh.position);
      return { name: p.app.name, position: new THREE.Vector3(world.x, world.y, world.z), app: p.app };
    });
  }

  /** S1: rebasa el GRUPO (patrón de `asteroids.ts`), no cada mesh — así no lo anula el próximo `update()`. */
  rebase(delta: THREE.Vector3): void {
    this.systemGroup.position.sub(delta);
  }

  dispose(): void {
    this.scene.remove(this.systemGroup);
    for (const p of this.planets) {
      p.mesh.geometry?.dispose?.();
      const mat = p.mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
      else mat?.dispose?.();
      p.initialsSprite.material.map?.dispose();
      p.initialsSprite.material.dispose();
    }
    this.planets = [];
  }
}
