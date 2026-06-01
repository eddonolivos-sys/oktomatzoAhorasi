import * as THREE from 'three';

const SIZE = 600;
const SEGMENTS = 200;

function noise2D(x: number, z: number): number {
  const n = Math.sin(x * 0.015) * Math.cos(z * 0.018)
    + Math.sin(x * 0.008 + z * 0.012) * 0.5
    + Math.cos(x * 0.025 - z * 0.020) * 0.3
    + Math.sin(x * 0.050 + z * 0.045) * 0.15;
  return n;
}

export function getTerrainHeight(x: number, z: number): number {
  const h =
    noise2D(x, z) * 18
    + Math.sin(x * 0.005) * Math.cos(z * 0.007) * 12
    + Math.sin(x * 0.020 + z * 0.025) * 5;
  return Math.max(h, -5);
}

export function getTerrainNormal(x: number, z: number): THREE.Vector3 {
  const d = 0.5;
  const hx = getTerrainHeight(x + d, z);
  const hz = getTerrainHeight(x, z + d);
  const h = getTerrainHeight(x, z);
  const n = new THREE.Vector3(h - hx, d, h - hz).normalize();
  if (n.y < 0) n.y = -n.y;
  return n;
}

export class Terrain {
  readonly mesh: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = getTerrainHeight(x, z);
      pos.setY(i, h);

      const ci = i * 3;
      if (h < 2) {
        colors[ci] = 0.22; colors[ci + 1] = 0.38; colors[ci + 2] = 0.18;
      } else if (h < 8) {
        const t = (h - 2) / 6;
        colors[ci] = 0.22 + t * 0.25; colors[ci + 1] = 0.38 - t * 0.15; colors[ci + 2] = 0.18 - t * 0.08;
      } else if (h < 16) {
        const t = (h - 8) / 8;
        colors[ci] = 0.47 - t * 0.2; colors[ci + 1] = 0.23 - t * 0.08; colors[ci + 2] = 0.10 - t * 0.02;
      } else {
        colors[ci] = 0.6; colors[ci + 1] = 0.6; colors[ci + 2] = 0.65;
      }
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.position.y = 0;
    scene.add(this.mesh);
  }

  getHeight(x: number, z: number): number {
    return getTerrainHeight(x, z);
  }

  destroy() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
