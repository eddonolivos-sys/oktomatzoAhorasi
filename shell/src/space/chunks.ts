import * as THREE from 'three';
import { getStarGasMaterial, buildStarFieldGeometry } from './star-gas';
import { chunkCoord, chunkKey, hashChunk, seededRng, neededChunkKeys } from './layout';

interface Chunk {
  key: string;
  points: THREE.Points;
}

export interface ChunkManagerOptions {
  chunkSize?: [number, number, number];
  loadRadius?: number;
  starsPerChunk?: number;
  maxLoadedChunks?: number;
}

/**
 * Streaming del campo estelar para espacio vasto. Grid 3D alrededor del jugador:
 * carga celdas cercanas, descarga las lejanas (a un pool reutilizable), genera
 * contenido determinista por celda y limita el trabajo por frame. Mantiene el
 * número de objetos acotado sin importar cuánto se vuele.
 */
export class ChunkManager {
  private chunkSize: THREE.Vector3;
  private loadRadius: number;
  private starsPerChunk: number;
  private maxLoaded: number;

  private active = new Map<string, Chunk>();
  private pool: THREE.Points[] = [];
  private queue: { cx: number; cy: number; cz: number; key: string }[] = [];
  private worldOffset = new THREE.Vector3();
  private readonly perFrameBudget = 4;

  constructor(
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
    opts: ChunkManagerOptions = {},
  ) {
    this.chunkSize = new THREE.Vector3(...(opts.chunkSize ?? [100, 100, 50]));
    this.loadRadius = opts.loadRadius ?? 2;
    this.starsPerChunk = opts.starsPerChunk ?? 16; // densidad muy reducida (−80%) para claridad/rendimiento
    this.maxLoaded = opts.maxLoadedChunks ?? 125;
  }

  setLoadRadius(r: number) {
    this.loadRadius = Math.max(1, r);
  }

  get loadedCount(): number {
    return this.active.size;
  }

  update(playerWorldPos: THREE.Vector3) {
    const cx = chunkCoord(playerWorldPos.x, this.chunkSize.x);
    const cy = chunkCoord(playerWorldPos.y, this.chunkSize.y);
    const cz = chunkCoord(playerWorldPos.z, this.chunkSize.z);
    const needed = new Set(neededChunkKeys(cx, cy, cz, this.loadRadius));

    // Descargar celdas fuera de rango (al pool).
    for (const [key, ch] of this.active) {
      if (!needed.has(key)) {
        this.scene.remove(ch.points);
        this.pool.push(ch.points);
        this.active.delete(key);
      }
    }

    // Encolar faltantes ordenadas por cercanía.
    this.queue.length = 0;
    for (let dx = -this.loadRadius; dx <= this.loadRadius; dx++) {
      for (let dy = -this.loadRadius; dy <= this.loadRadius; dy++) {
        for (let dz = -this.loadRadius; dz <= this.loadRadius; dz++) {
          const k = chunkKey(cx + dx, cy + dy, cz + dz);
          if (!this.active.has(k)) this.queue.push({ cx: cx + dx, cy: cy + dy, cz: cz + dz, key: k });
        }
      }
    }
    this.queue.sort(
      (a, b) =>
        Math.abs(a.cx - cx) + Math.abs(a.cy - cy) + Math.abs(a.cz - cz) -
        (Math.abs(b.cx - cx) + Math.abs(b.cy - cy) + Math.abs(b.cz - cz)),
    );

    // Generar dentro del presupuesto por frame, respetando el cap.
    let budget = this.perFrameBudget;
    while (budget > 0 && this.queue.length > 0 && this.active.size < this.maxLoaded) {
      const job = this.queue.shift()!;
      this.loadChunk(job.cx, job.cy, job.cz, job.key);
      budget--;
    }
    if (this.queue.length > 0 && this.active.size >= this.maxLoaded) {
      console.debug(`[chunks] cap ${this.maxLoaded} alcanzado; ${this.queue.length} celda(s) en espera`);
    }
  }

  private loadChunk(cx: number, cy: number, cz: number, key: string) {
    const rng = seededRng(hashChunk(cx, cy, cz));
    const geometry = buildStarFieldGeometry({
      count: this.starsPerChunk,
      sizeBounds: [0.5, 1.6],
      box: { min: [0, 0, 0], max: [this.chunkSize.x, this.chunkSize.y, this.chunkSize.z] },
      rng,
    });

    let points = this.pool.pop();
    if (points) {
      points.geometry.dispose();
      points.geometry = geometry;
    } else {
      points = new THREE.Points(geometry, getStarGasMaterial(this.renderer));
      points.frustumCulled = true;
    }
    points.position.set(
      cx * this.chunkSize.x - this.worldOffset.x,
      cy * this.chunkSize.y - this.worldOffset.y,
      cz * this.chunkSize.z - this.worldOffset.z,
    );
    this.scene.add(points);
    this.active.set(key, { key, points });
  }

  /** Reposiciona los chunks activos al rebasar el origen (§5 spec). */
  rebase(delta: THREE.Vector3) {
    this.worldOffset.add(delta);
    for (const { points } of this.active.values()) points.position.sub(delta);
  }

  dispose() {
    for (const { points } of this.active.values()) {
      this.scene.remove(points);
      points.geometry.dispose();
    }
    for (const p of this.pool) p.geometry.dispose();
    this.active.clear();
    this.pool.length = 0;
    this.queue.length = 0;
  }
}
