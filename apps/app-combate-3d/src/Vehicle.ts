import * as THREE from 'three';

export interface VehicleState {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  heading: number;
  speed: number;
  alive: boolean;
}

const MAX_SPEED = 25;
const ACCELERATION = 35;
const BRAKE_FORCE = 50;
const TURN_SPEED = 1.8;
const FRICTION = 0.92;

export class Vehicle {
  readonly group: THREE.Group;
  private body: THREE.Mesh;
  private cabin: THREE.Mesh;
  private cannon: THREE.Mesh;
  private wheels: THREE.Mesh[] = [];

  private _speed = 0;
  private _heading = 0;
  private _alive = true;
  private _invulnerable = false;

  readonly halfExtents: THREE.Vector3 = new THREE.Vector3(1.5, 0.6, 1);

  private flashTimer = 0;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(3, 1.2, 2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2d6cdf, metalness: 0.4, roughness: 0.6 });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.position.y = 0.6;
    this.group.add(this.body);

    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x4a8af4, metalness: 0.3, roughness: 0.7 });
    this.cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.4), cabinMat);
    this.cabin.position.set(0, 1.4, -0.2);
    this.group.add(this.cabin);

    const cannonMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.3 });
    this.cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.2, 8), cannonMat);
    this.cannon.position.set(0, 1.9, 0.4);
    this.cannon.rotation.x = 0.3;
    this.group.add(this.cannon);

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.2, 12);
    const positions = [
      [-1.3, 0.35, 1.2], [1.3, 0.35, 1.2],
      [-1.3, 0.35, -1.2], [1.3, 0.35, -1.2],
    ];
    for (const pos of positions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(pos[0], pos[1], pos[2]);
      wheel.rotation.x = Math.PI / 2;
      this.wheels.push(wheel);
      this.group.add(wheel);
    }

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
    dir.y += 0.15;
    dir.normalize();
    return dir;
  }

  getColliderBox(): THREE.Box3 {
    const center = this.group.position.clone();
    return new THREE.Box3(
      center.clone().sub(this.halfExtents),
      center.clone().add(this.halfExtents)
    );
  }

  update(dt: number, input: { forward: boolean; backward: boolean; left: boolean; right: boolean }) {
    if (!this._alive) return;

    if (input.left) this._heading += TURN_SPEED * dt;
    if (input.right) this._heading -= TURN_SPEED * dt;

    if (input.forward) {
      this._speed = Math.min(this._speed + ACCELERATION * dt, MAX_SPEED);
    } else if (input.backward) {
      this._speed = Math.max(this._speed - ACCELERATION * dt, -MAX_SPEED * 0.4);
    } else {
      this._speed *= FRICTION;
      if (Math.abs(this._speed) < 0.05) this._speed = 0;
    }

    const dx = Math.sin(this._heading) * this._speed * dt;
    const dz = Math.cos(this._heading) * this._speed * dt;

    this.group.position.x += dx;
    this.group.position.z += dz;

    const halfWorld = 490;
    this.group.position.x = Math.max(-halfWorld, Math.min(halfWorld, this.group.position.x));
    this.group.position.z = Math.max(-halfWorld, Math.min(halfWorld, this.group.position.z));

    this.group.rotation.y = this._heading;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      const on = Math.floor(this.flashTimer * 10) % 2 === 0;
      (this.body.material as THREE.MeshStandardMaterial).emissive = on ? new THREE.Color(0xff0000) : new THREE.Color(0x000000);
      (this.cabin.material as THREE.MeshStandardMaterial).emissive = on ? new THREE.Color(0xff0000) : new THREE.Color(0x000000);
      (this.body.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0.5 : 0;
      (this.cabin.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0.5 : 0;
    } else {
      (this.body.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x000000);
      (this.cabin.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x000000);
    }

    for (const w of this.wheels) {
      w.rotation.z += this._speed * dt * 3;
    }
  }

  flashDamage() {
    this.flashTimer = 0.4;
  }

  kill() {
    this._alive = false;
    this._speed = 0;
    (this.body.material as THREE.MeshStandardMaterial).color.setHex(0x666666);
    (this.cabin.material as THREE.MeshStandardMaterial).color.setHex(0x888888);
  }

  respawn() {
    this._alive = true;
    this._speed = 0;
    this._heading = 0;
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
    (this.body.material as THREE.MeshStandardMaterial).color.setHex(0x2d6cdf);
    (this.cabin.material as THREE.MeshStandardMaterial).color.setHex(0x4a8af4);
    this.flashTimer = 0;
  }

  destroy() {
    this.group.parent?.remove(this.group);
    this.body.geometry.dispose();
    (this.body.material as THREE.MeshStandardMaterial).dispose();
    this.cabin.geometry.dispose();
    (this.cabin.material as THREE.MeshStandardMaterial).dispose();
    this.cannon.geometry.dispose();
    (this.cannon.material as THREE.MeshStandardMaterial).dispose();
    for (const w of this.wheels) {
      w.geometry.dispose();
      (w.material as THREE.MeshStandardMaterial).dispose();
    }
  }
}
