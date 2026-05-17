import * as THREE from 'three';
import { Game } from './Game';

const MAX_LIFETIME = 2;
const SPEED = 60;
const TRAIL_INTERVAL = 0.05;

export class Projectile {
  readonly mesh: THREE.Mesh;
  private direction: THREE.Vector3;
  private lifetime = 0;
  private trailTimer = 0;
  private trailParticles: THREE.Mesh[] = [];
  private alive = true;

  constructor(origin: THREE.Vector3, direction: THREE.Vector3, scene: THREE.Scene) {
    this.direction = direction.normalize();

    const geo = new THREE.SphereGeometry(0.5, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(origin);
    scene.add(this.mesh);
  }

  get active() { return this.alive; }

  update(dt: number) {
    if (!this.alive) return;

    this.lifetime += dt;
    if (this.lifetime > MAX_LIFETIME) {
      this.destroy();
      return;
    }

    this.mesh.position.addScaledVector(this.direction, SPEED * dt);

    this.trailTimer += dt;
    if (this.trailTimer >= TRAIL_INTERVAL && Game.effectsEnabled) {
      this.trailTimer = 0;
      this.spawnTrailParticle();
    }

    for (let i = this.trailParticles.length - 1; i >= 0; i--) {
      const p = this.trailParticles[i];
      const life = (p.userData as { life: number }).life;
      p.scale.setScalar(life);
      (p.userData as { life: number }).life -= dt * 3;
      if ((p.userData as { life: number }).life <= 0) {
        p.parent?.remove(p);
        p.geometry.dispose();
        (p.material as THREE.Material).dispose();
        this.trailParticles.splice(i, 1);
      }
    }
  }

  private spawnTrailParticle() {
    const geo = new THREE.SphereGeometry(0.1, 3, 3);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.5 });
    const p = new THREE.Mesh(geo, mat);
    p.position.copy(this.mesh.position);
    p.userData = { life: 1 };
    this.trailParticles.push(p);
    this.mesh.parent?.add(p);
  }

  destroy() {
    this.alive = false;
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    for (const p of this.trailParticles) {
      p.parent?.remove(p);
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    }
    this.trailParticles = [];
  }
}
