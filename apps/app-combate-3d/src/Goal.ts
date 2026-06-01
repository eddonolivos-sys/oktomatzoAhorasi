import * as THREE from 'three';
import { getTerrainHeight } from './Terrain';

export interface Goal {
  ring: THREE.Mesh;
  pos: THREE.Vector3;
}

const GOAL_COUNT = 8;
const WORLD_HALF = 260;
const MIN_DIST = 40;

export class GoalManager {
  private scene: THREE.Scene;
  private goals: Goal[] = [];
  private scoredObjectIds: Set<number> = new Set();
  score = 0;

  constructor(scene: THREE.Scene) { this.scene = scene; this.spawnGoals(); }

  private spawnGoals() {
    const positions: THREE.Vector3[] = [];
    for (let i = 0; i < GOAL_COUNT * 10 && positions.length < GOAL_COUNT; i++) {
      const x = (Math.random() - 0.5) * WORLD_HALF * 2;
      const z = (Math.random() - 0.5) * WORLD_HALF * 2;
      if (positions.some(p => p.distanceTo(new THREE.Vector3(x, 0, z)) < MIN_DIST)) continue;
      positions.push(new THREE.Vector3(x, 0, z));
    }
    for (const p of positions) this.createGoal(p);
  }

  private createGoal(pos: THREE.Vector3) {
    const h = getTerrainHeight(pos.x, pos.z);
    const group = new THREE.Group();
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.7,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.3, 8, 24), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.5;
    group.add(ring);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 0.2 });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.5, 6), pillarMat);
    pillar.position.y = 0.25;
    group.add(pillar);
    group.position.set(pos.x, h, pos.z);
    this.scene.add(group);
    this.goals.push({ ring, pos: new THREE.Vector3(pos.x, h + 0.5, pos.z) });
  }

  update(_dt: number, droppedPos: THREE.Vector3 | null, droppedObjectId: number | null, onScore: () => void) {
    if (droppedPos === null || droppedObjectId === null) return;

    for (const g of this.goals) {
      if (droppedPos.distanceTo(g.pos) < 5) {
        if (!this.scoredObjectIds.has(droppedObjectId)) {
          this.scoredObjectIds.add(droppedObjectId);
          this.score += 10;
          onScore();
        }
        return;
      }
    }
    // If object is moved away from all goals, remove from scored set so it can score again
    if (this.scoredObjectIds.has(droppedObjectId)) {
      const away = this.goals.every(g => droppedPos.distanceTo(g.pos) >= 5);
      if (away) this.scoredObjectIds.delete(droppedObjectId);
    }
  }

  getGoals(): Goal[] { return this.goals; }

  destroy() {
    for (const g of this.goals) { g.ring.parent?.remove(g.ring); g.ring.geometry.dispose(); }
    this.goals = [];
  }
}
