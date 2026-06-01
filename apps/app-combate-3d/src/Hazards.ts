import * as THREE from 'three';

const HAZARD_SIZE = 10;
const SPAWN_HEIGHT = 180;
const GROUND_Y = HAZARD_SIZE / 2;
const MAX_HAZARDS = 80;

export interface Hazard {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  landed: boolean;
  wasDirectHit: boolean;
  highlightTimer: number;
}

export class Hazards {
  private scene: THREE.Scene;
  private hazards: Hazard[] = [];
  private spawnTimer = 0;
  private readonly SPAWN_INTERVAL = 5;
  private readonly WAVE_COUNT = 20;
  private readonly WORLD_HALF = 280;
  private readonly MIN_VEHICLE_DIST = 25;

  activeCount = 0;
  waveProgress = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(dt: number, vehiclePos: THREE.Vector3) {
    this.spawnTimer += dt;
    this.waveProgress = Math.min(this.spawnTimer / this.SPAWN_INTERVAL, 1);

    if (this.spawnTimer >= this.SPAWN_INTERVAL) {
      this.spawnTimer = 0;
      this.spawnWave(vehiclePos);
    }

    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];

      if (h.highlightTimer > 0) {
        h.highlightTimer -= dt;
        if (h.highlightTimer <= 0) {
          h.mesh.scale.setScalar(1);
          (h.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
        }
      }

      if (!h.landed) {
        h.velocity.y -= 40 * dt;
        h.position.addScaledVector(h.velocity, dt);

        if (h.position.y <= GROUND_Y) {
          h.position.y = GROUND_Y;
          h.landed = true;
          h.velocity.set(0, 0, 0);
        }
      }

      h.mesh.position.copy(h.position);
    }

    this.activeCount = this.hazards.length;
  }

  private spawnWave(vehiclePos: THREE.Vector3) {
    let spawned = 0;
    let attempts = 0;
    const maxAttempts = this.WAVE_COUNT * 20;

    while (spawned < this.WAVE_COUNT && attempts < maxAttempts) {
      attempts++;
      const x = (Math.random() - 0.5) * this.WORLD_HALF * 2;
      const z = (Math.random() - 0.5) * this.WORLD_HALF * 2;

      if (new THREE.Vector3(x, 0, z).distanceTo(vehiclePos) < this.MIN_VEHICLE_DIST) continue;

      this.createHazard(x, z);
      spawned++;
    }

    while (this.hazards.length > MAX_HAZARDS) {
      this.removeHazard(0);
    }
  }

  private createHazard(x: number, z: number) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff0000,
      emissiveIntensity: 0.6,
      roughness: 0.8,
      metalness: 0.2,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(HAZARD_SIZE, HAZARD_SIZE, HAZARD_SIZE), mat);
    mesh.position.set(x, SPAWN_HEIGHT, z);
    this.scene.add(mesh);

    const velocity = new THREE.Vector3(0, -4, 0);

    this.hazards.push({
      mesh, position: mesh.position, velocity,
      landed: false, wasDirectHit: false, highlightTimer: 0,
    });
  }

  getHazards(): Hazard[] { return this.hazards; }

  removeHazard(index: number, vehiclePos?: THREE.Vector3) {
    const h = this.hazards[index];
    if (!h) return;

    if (vehiclePos && h.position.distanceTo(vehiclePos) < HAZARD_SIZE / 2 + 1.5) {
      h.wasDirectHit = true;
      h.highlightTimer = 1;
      h.mesh.scale.setScalar(1.5);
      (h.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 2;
      setTimeout(() => this.removeHazard(index), 1000);
      return;
    }

    this.scene.remove(h.mesh);
    h.mesh.geometry.dispose();
    (h.mesh.material as THREE.MeshStandardMaterial).dispose();
    this.hazards.splice(index, 1);
  }

  removeAll() {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      this.removeHazard(i);
    }
  }

  resetTimer() {
    this.spawnTimer = 0;
  }

  destroy() {
    this.removeAll();
  }
}
