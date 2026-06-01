import * as THREE from 'three';
import { getTerrainHeight } from './Terrain';

const MAX_OBJECTS = 30;

function randomShape(): THREE.BufferGeometry {
  const type = Math.floor(Math.random() * 5);
  const s = 0.5 + Math.random() * 0.8;
  switch (type) {
    case 0: return new THREE.DodecahedronGeometry(s, 0);
    case 1: return new THREE.OctahedronGeometry(s, 0);
    case 2: return new THREE.ConeGeometry(s * 0.7, s, 5 + Math.floor(Math.random() * 3));
    case 3: return new THREE.TorusGeometry(s * 0.5, s * 0.25, 6, 8);
    default: return new THREE.IcosahedronGeometry(s, 0);
  }
}

export interface PickupObject {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  velY: number;
  landed: boolean;
  held: boolean;
  id: number;
  originalEmissiveIntensity: number;
  heavy: boolean; // true = can't be grabbed with Shift
}

export class IrregularObjects {
  private scene: THREE.Scene;
  private objects: PickupObject[] = [];
  private spawnTimer = 0;
  private nextId = 0;
  private readonly WORLD_HALF = 280;
  private readonly MIN_SPAWN_DIST = 20;

  activeCount = 0;
  hoveredId: number | null = null;

  constructor(scene: THREE.Scene) { this.scene = scene; }

  update(dt: number, vehiclePos: THREE.Vector3) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1 + Math.random() * 2;
      const count = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) this.spawnOne(vehiclePos);
    }

    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      if (o.held) continue;
      if (!o.landed) {
        o.velY -= 25 * dt;
        o.pos.y += o.velY * dt;
        const th = getTerrainHeight(o.pos.x, o.pos.z);
        if (o.pos.y <= th) { o.pos.y = th; o.landed = true; o.velY = 0; }
      }
      o.mesh.position.copy(o.pos);
    }
    this.activeCount = this.objects.length;
  }

  private spawnOne(vehiclePos: THREE.Vector3) {
    if (this.objects.length >= MAX_OBJECTS) return;
    for (let a = 0; a < 30; a++) {
      const x = (Math.random() - 0.5) * this.WORLD_HALF * 2;
      const z = (Math.random() - 0.5) * this.WORLD_HALF * 2;
      if (new THREE.Vector3(x, 0, z).distanceTo(vehiclePos) <= this.MIN_SPAWN_DIST) continue;
      const geo = randomShape();
      const ei = 0.2 + Math.random() * 0.3;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.05 + Math.random() * 0.2, 0.8, 0.5 + Math.random() * 0.3),
        emissive: 0xff6600,
        emissiveIntensity: ei,
        roughness: 0.7,
      });
      const mesh = new THREE.Mesh(geo, mat);
        const sy = 100 + Math.random() * 50;
        mesh.position.set(x, sy, z);
        mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        mesh.userData.pickupId = this.nextId;
        const heavy = Math.random() < 0.25; // 25% are heavy
        if (heavy) { mat.color.multiplyScalar(0.6); mat.emissive.setHex(0x884400); }
        this.scene.add(mesh);
        this.objects.push({
          mesh, pos: mesh.position, velY: -2 - Math.random() * 3,
          landed: false, held: false, id: this.nextId++,
          originalEmissiveIntensity: ei, heavy,
        });
        return;
    }
  }

  highlight(id: number | null) {
    for (const o of this.objects) {
      const mat = o.mesh.material as THREE.MeshStandardMaterial;
      if (o.id === id && id !== null) {
        mat.emissive.setHex(0xffff00);
        mat.emissiveIntensity = 1.0;
        o.mesh.scale.setScalar(1.15);
      } else {
        mat.emissive.setHex(0xff6600);
        mat.emissiveIntensity = o.originalEmissiveIntensity;
        o.mesh.scale.setScalar(1);
      }
    }
    this.hoveredId = id;
  }

  pickupHovered(): number | null {
    if (this.hoveredId === null) return null;
    const o = this.objects.find(x => x.id === this.hoveredId);
    if (o && o.landed && !o.held && !o.heavy) {
      o.held = true;
      this.highlight(null);
      return o.id;
    }
    return null;
  }

  drop(id: number) {
    const o = this.objects.find(x => x.id === id);
    if (o && o.held) { o.held = false; o.velY = 0; const th = getTerrainHeight(o.pos.x, o.pos.z); o.pos.y = Math.max(th, o.pos.y); return true; }
    return false;
  }

  releaseAll() { for (const o of this.objects) if (o.held) { o.held = false; o.velY = 0; } }

  getAllMeshes(): THREE.Mesh[] { return this.objects.filter(o => o.landed && !o.held).map(o => o.mesh); }
  getObjectById(id: number | null): PickupObject | undefined { return id === null ? undefined : this.objects.find(o => o.id === id); }
  getObjectByMesh(mesh: THREE.Mesh): PickupObject | undefined { return this.objects.find(o => o.mesh === mesh); }

  removeAll() {
    for (const o of this.objects) { this.scene.remove(o.mesh); o.mesh.geometry.dispose(); (o.mesh.material as THREE.Material).dispose(); }
    this.objects = [];
  }
  destroy() { this.removeAll(); }
}
