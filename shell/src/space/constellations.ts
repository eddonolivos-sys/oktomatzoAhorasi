import * as THREE from 'three';
import type { AppInfo } from '../services/protocol';
import { createConstellation, type ConstellationUserData } from './constellation';
import { colorForCategory, constellationPosition } from './layout';

export interface RadarBlip {
  name: string;
  position: THREE.Vector3;
}

interface PlanetOrbit {
  orbitRadius: number;
  orbitSpeed: number;
  orbitOffset: number;
}

/**
 * Gestor de constelaciones: una por app del registry, distribuidas de forma
 * determinista. Anima uTime y órbitas, resuelve el raycast desde el centro de la
 * pantalla y expone blips para el radar (todo en espacio de escena).
 */
export class ConstellationManager {
  private groups: THREE.Group[] = [];
  private points: THREE.Points[] = [];
  private raycaster = new THREE.Raycaster();

  constructor(
    private scene: THREE.Scene,
    apps: AppInfo[],
    renderer: THREE.WebGLRenderer,
  ) {
    // Umbral generoso para que apuntar con la reticula sea cómodo.
    this.raycaster.params.Points = { threshold: 3 };

    apps.forEach((app, i) => {
      const p = constellationPosition(i);
      const group = createConstellation(
        app,
        { position: new THREE.Vector3(p.x, p.y, p.z), color: colorForCategory(app.category) },
        renderer,
      );
      scene.add(group);
      this.groups.push(group);
      this.points.push((group.userData as ConstellationUserData).points);
    });
  }

  update(elapsed: number, _delta: number) {
    for (const g of this.groups) {
      const ud = g.userData as ConstellationUserData;
      const matTime = ud.mat.uniforms['uTime'];
      if (matTime) matTime.value = elapsed;

      for (const planet of ud.planets) {
        const orbit = planet.userData as PlanetOrbit;
        const angle = elapsed * orbit.orbitSpeed + orbit.orbitOffset;
        planet.position.x = orbit.orbitRadius * Math.cos(angle);
        planet.position.z = orbit.orbitRadius * Math.sin(angle);
        planet.rotation.y += 0.005;
        const planetTime = (planet.material as THREE.ShaderMaterial).uniforms?.['uTime'];
        if (planetTime) planetTime.value = elapsed;
      }
    }
  }

  private raycastGroup(camera: THREE.Camera, ndc: THREE.Vector2): THREE.Group | null {
    this.raycaster.setFromCamera(ndc, camera);
    const hits = this.raycaster.intersectObjects(this.points, false);
    const first = hits[0];
    return first ? (first.object.parent as THREE.Group | null) : null;
  }

  /** App de la constelación bajo el punto NDC dado, o null. */
  pickApp(camera: THREE.Camera, ndc: THREE.Vector2): AppInfo | null {
    const g = this.raycastGroup(camera, ndc);
    return g ? ((g.userData as ConstellationUserData).app ?? null) : null;
  }

  /** Constelación apuntada (app + centro en espacio de escena) para etiqueta flotante. */
  pickAimed(camera: THREE.Camera, ndc: THREE.Vector2): { app: AppInfo; center: THREE.Vector3 } | null {
    const g = this.raycastGroup(camera, ndc);
    if (!g) return null;
    const ud = g.userData as ConstellationUserData;
    return { app: ud.app, center: g.position.clone() };
  }

  getRadarBlips(): RadarBlip[] {
    return this.groups.map((g) => ({
      name: (g.userData as ConstellationUserData).app.name,
      position: g.position.clone(),
    }));
  }

  rebase(delta: THREE.Vector3) {
    for (const g of this.groups) g.position.sub(delta);
  }

  dispose() {
    for (const g of this.groups) {
      this.scene.remove(g);
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
        else mat?.dispose?.();
      });
    }
    this.groups = [];
    this.points = [];
  }
}
