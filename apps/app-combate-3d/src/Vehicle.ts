import * as THREE from 'three';

const MAX_SPEED = 25;
const ACCELERATION = 35;
const TURN_SPEED = 1.8;
const FRICTION = 0.92;

export class Vehicle {
  readonly group: THREE.Group;
  private bodyMesh: THREE.Mesh;
  private cannon: THREE.Mesh;
  private ring: THREE.Mesh;

  private _speed = 0;
  private _heading = 0;
  private _alive = true;
  private _invulnerable = false;

  readonly radius = 0.9;
  private flashTimer = 0;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2d6cdf,
      metalness: 0.5,
      roughness: 0.3,
    });
    this.bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 20, 20), bodyMat);
    this.bodyMesh.position.y = this.radius;
    this.group.add(this.bodyMesh);

    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x4a8af4,
      metalness: 0.6,
      roughness: 0.2,
      emissive: 0x4a8af4,
      emissiveIntensity: 0.1,
    });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(this.radius * 1.05, 0.05, 8, 24), ringMat);
    this.ring.position.y = this.radius;
    this.ring.rotation.x = Math.PI / 2;
    this.group.add(this.ring);

    const cannonMat = new THREE.MeshStandardMaterial({
      color: 0x666688,
      metalness: 0.7,
      roughness: 0.3,
    });
    this.cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.0, 8), cannonMat);
    this.cannon.position.set(0, this.radius + 0.5, 0);
    this.group.add(this.cannon);

    this.group.position.set(0, 0, 0);
    scene.add(this.group);
  }

  get speed() { return this._speed; }
  get heading() { return this._heading; }
  get alive() { return this._alive; }
  get invulnerable() { return this._invulnerable; }

  setInvulnerable(v: boolean) { this._invulnerable = v; }

  get cannonPosition(): THREE.Vector3 {
    const pos = new THREE.Vector3();
    this.cannon.getWorldPosition(pos);
    return pos;
  }

  get cannonDirection(): THREE.Vector3 {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.group.quaternion);
    dir.normalize();
    return dir;
  }

  getColliderBox(): THREE.Box3 {
    const c = this.group.position.clone();
    const r = this.radius;
    return new THREE.Box3(
      new THREE.Vector3(c.x - r, c.y, c.z - r),
      new THREE.Vector3(c.x + r, c.y + r * 2, c.z + r)
    );
  }

  update(dt: number, input: { forward: boolean; backward: boolean }, targetHeading: number | null = null) {
    if (!this._alive) return;

    if (targetHeading !== null) {
      let diff = targetHeading - this._heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turnAmount = TURN_SPEED * dt;
      if (Math.abs(diff) < turnAmount) this._heading = targetHeading;
      else this._heading += Math.sign(diff) * turnAmount;
    }

    if (input.forward) {
      this._speed = Math.min(this._speed + ACCELERATION * dt, MAX_SPEED);
    } else if (input.backward) {
      this._speed = Math.max(this._speed - ACCELERATION * dt, -MAX_SPEED * 0.4);
    } else {
      this._speed *= FRICTION;
      if (Math.abs(this._speed) < 0.05) this._speed = 0;
    }

    const dx = Math.sin(this._heading) * this._speed * dt;
    const dz = -Math.cos(this._heading) * this._speed * dt;
    this.group.position.x += dx;
    this.group.position.z += dz;

    const halfWorld = 490;
    this.group.position.x = Math.max(-halfWorld, Math.min(halfWorld, this.group.position.x));
    this.group.position.z = Math.max(-halfWorld, Math.min(halfWorld, this.group.position.z));

    this.group.rotation.y = this._heading;

    this.ring.rotation.z += this._speed * dt * 0.05;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      const on = Math.floor(this.flashTimer * 10) % 2 === 0;
      (this.bodyMesh.material as THREE.MeshStandardMaterial).emissive = on ? new THREE.Color(0xff0000) : new THREE.Color(0x000000);
      (this.bodyMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0.5 : 0;
    } else {
      (this.bodyMesh.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x000000);
    }
  }

  flashDamage() { this.flashTimer = 0.4; }

  kill() {
    this._alive = false;
    this._speed = 0;
    (this.bodyMesh.material as THREE.MeshStandardMaterial).color.setHex(0x666666);
  }

  respawn() {
    this._alive = true;
    this._speed = 0;
    this._heading = 0;
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
    (this.bodyMesh.material as THREE.MeshStandardMaterial).color.setHex(0x2d6dcf);
    this.flashTimer = 0;
  }

  destroy() {
    this.group.parent?.remove(this.group);
    this.bodyMesh.geometry.dispose();
    (this.bodyMesh.material as THREE.MeshStandardMaterial).dispose();
    this.cannon.geometry.dispose();
    (this.cannon.material as THREE.MeshStandardMaterial).dispose();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.MeshStandardMaterial).dispose();
  }
}
