import * as THREE from 'three';
import { getTerrainHeight } from './Terrain';
import { Game } from './Game';

const MAX_LIFETIME = 4;
const SPEED = 60;

export class Projectile {
  readonly mesh: THREE.Mesh;
  private direction: THREE.Vector3;
  private lifetime = 0;
  private alive = true;
  private heightOffset: number;
  private posX = 0;
  private posZ = 0;

  constructor(origin: THREE.Vector3, direction: THREE.Vector3, scene: THREE.Scene, heightOffset: number) {
    this.direction = direction.clone();
    this.direction.y = 0;
    this.direction.normalize();
    this.heightOffset = heightOffset;

    const geo = new THREE.SphereGeometry(0.4, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(origin);
    scene.add(this.mesh);

    this.posX = origin.x;
    this.posZ = origin.z;
    this.updateY();
  }

  get active() { return this.alive; }

  update(dt: number) {
    if (!this.alive) return;
    this.lifetime += dt;
    if (this.lifetime > MAX_LIFETIME) { this.destroy(); return; }

    this.posX += this.direction.x * SPEED * dt;
    this.posZ += this.direction.z * SPEED * dt;
    this.mesh.position.x = this.posX;
    this.mesh.position.z = this.posZ;
    this.updateY();
  }

  private updateY() {
    const terrainH = getTerrainHeight(this.posX, this.posZ);
    this.mesh.position.y = terrainH + this.heightOffset;
  }

  destroy() {
    this.alive = false;
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
