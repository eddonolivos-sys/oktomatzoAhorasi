import * as THREE from 'three';
import type { AppInfo } from '../services/protocol';
import { createPlanet } from './planet';
import { colorForCategory } from './layout';
import { planetLayout, orbitPosition } from './orbits';
import { dwellStep, type DwellState } from './dwell';
import { approachBrakeFactor } from './flight-math';

export interface RadarBlip {
  name: string;
  position: THREE.Vector3;
  app: AppInfo;
}

export interface ApproachInfo {
  app: AppInfo;
  distance: number;
  influenceRadius: number;
}

export interface SolarUpdate {
  approaching: ApproachInfo | null;
  dwellProgress: number;
  entered: AppInfo | null;
}

interface SolarPlanet {
  app: AppInfo;
  mesh: THREE.Mesh;
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

const PLANET_MIN = 120;
const PLANET_MAX = 260;
const INFLUENCE_FACTOR = 2.5;
const DWELL_THRESHOLD = 1.0; // segundos dentro de la esfera para entrar
const BRAKE_MIN_FACTOR = 0.25; // damping fuerte en el núcleo de la esfera

function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h || 1;
}

/**
 * Sistema solar heliocéntrico: un planeta por app del registry orbitando el sol
 * Ramatzo (origen de escena). Calcula aproximación + frenado + permanencia por
 * frame y expone blips 3D para el radar. Reemplaza ConstellationManager, el
 * raycast a la reticula y el ProjectOverlay por mecánica de proximidad.
 */
export class SolarSystem {
  private planets: SolarPlanet[] = [];
  /** Estado de permanencia del planeta actualmente "dentro", o null. */
  private dwell: DwellState = { inside: false, elapsed: 0 };
  /** App sobre la que se acumula la permanencia (para reiniciar al cambiar). */
  private dwellApp: AppInfo | null = null;

  constructor(
    private scene: THREE.Scene,
    apps: AppInfo[],
    _renderer: THREE.WebGLRenderer,
  ) {
    const total = apps.length;
    apps.forEach((app, i) => {
      const layout = planetLayout(i, total);
      // Tamaño compacto, determinista por índice (interiores algo menores).
      const planetRadius = PLANET_MIN + ((PLANET_MAX - PLANET_MIN) * (i % 4)) / 3;
      const seed = seedFromId(app.id);
      const mesh = createPlanet(planetRadius, seed, colorForCategory(app.category));
      this.scene.add(mesh);
      this.planets.push({
        app,
        mesh,
        planetRadius,
        influenceRadius: planetRadius * INFLUENCE_FACTOR,
        radius: layout.radius,
        inclination: layout.inclination,
        phase: layout.phase,
        speed: layout.speed,
        mat: mesh.material as THREE.ShaderMaterial,
      });
    });
  }

  update(elapsed: number, delta: number, shipPos: THREE.Vector3): SolarUpdate {
    // 1) Avanza órbitas y rotación; encuentra el planeta más cercano dentro de su esfera.
    let nearest: SolarPlanet | null = null;
    let nearestDist = Infinity;

    for (const p of this.planets) {
      const pos = orbitPosition(p.radius, p.inclination, p.phase, p.speed, elapsed);
      p.mesh.position.set(pos.x, pos.y, pos.z);
      p.mesh.rotation.y += 0.05 * delta;
      const t = p.mat.uniforms['uTime'];
      if (t) t.value = elapsed;

      const dist = p.mesh.position.distanceTo(shipPos);
      if (dist <= p.influenceRadius && dist < nearestDist) {
        nearest = p;
        nearestDist = dist;
      }
    }

    // 2) Aproximación + frenado.
    const approaching: ApproachInfo | null = nearest
      ? { app: nearest.app, distance: nearestDist, influenceRadius: nearest.influenceRadius }
      : null;

    // 3) Permanencia: si cambió el planeta objetivo, reinicia el contador.
    const inside = nearest !== null;
    if (nearest && nearest.app !== this.dwellApp) {
      this.dwell = { inside: false, elapsed: 0 };
      this.dwellApp = nearest.app;
    }
    if (!inside) this.dwellApp = null;

    const step = dwellStep(this.dwell, inside, delta, DWELL_THRESHOLD);
    this.dwell = step.state;

    return {
      approaching,
      dwellProgress: step.progress,
      entered: step.entered ? (nearest as SolarPlanet).app : null,
    };
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
    return this.planets.map((p) => ({
      name: p.app.name,
      position: p.mesh.position.clone(), // posición completa, incluida Y
      app: p.app,
    }));
  }

  rebase(delta: THREE.Vector3): void {
    for (const p of this.planets) p.mesh.position.sub(delta);
  }

  dispose(): void {
    for (const p of this.planets) {
      this.scene.remove(p.mesh);
      p.mesh.geometry?.dispose?.();
      const mat = p.mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
      else mat?.dispose?.();
    }
    this.planets = [];
    this.dwell = { inside: false, elapsed: 0 };
    this.dwellApp = null;
  }
}
