import * as THREE from 'three';

export interface RamatzoBelt {
  object: THREE.Group;
  update(elapsed: number, delta: number): void;
  rebase(delta: THREE.Vector3): void;
  dispose(): void;
}

export interface RamatzoBeltOptions {
  count?: number;
  innerRadius: number;
  outerRadius: number;
}

/** Textura de canvas con la palabra "Ramatzo" en relieve ambar sobre transparente. */
function createBrandTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.font = '700 76px "Inter", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Sombra sutil para dar relieve.
  ctx.fillStyle = 'rgba(20, 10, 4, 0.85)';
  ctx.fillText('Ramatzo', c.width / 2 + 3, c.height / 2 + 3);
  // Cuerpo ambar sobrio (sin neon).
  ctx.fillStyle = 'rgba(240, 196, 130, 0.95)';
  ctx.fillText('Ramatzo', c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

/** Geometria de roca irregular (icosaedro deformado por seed). */
function rockGeometry(seed: number): THREE.IcosahedronGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes['position'] as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(0.78 + rand() * 0.5);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Cinturon de asteroides instanciados orbitando el sol (entre innerRadius y
 * outerRadius, inclinaciones leves para usar las 3D). Un subconjunto lleva la
 * marca "Ramatzo" (decal de canvas) para presencia de marca en el entorno.
 * Sobrio y coherente con la iluminacion calida; sin neon.
 */
export function createRamatzoBelt(opts: RamatzoBeltOptions): RamatzoBelt {
  const count = opts.count ?? 240;
  const { innerRadius, outerRadius } = opts;

  const group = new THREE.Group();

  // ── Asteroides instanciados ──
  const geometry = rockGeometry(7);
  const material = new THREE.MeshStandardMaterial({
    color: 0x6b5a47,
    roughness: 0.95,
    metalness: 0.05,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  group.add(mesh);

  interface OrbitParam {
    radius: number;
    phase: number;
    speed: number;
    inclination: number;
    scale: number;
    spin: number;
    spinAxis: THREE.Vector3;
  }
  const params: OrbitParam[] = [];
  const dummy = new THREE.Object3D();
  const quat = new THREE.Quaternion();

  for (let i = 0; i < count; i++) {
    params.push({
      radius: innerRadius + Math.random() * (outerRadius - innerRadius),
      phase: Math.random() * Math.PI * 2,
      speed: 0.02 + Math.random() * 0.05, // lento
      inclination: (Math.random() - 0.5) * 0.32,
      scale: 6 + Math.random() * 22,
      spin: (Math.random() - 0.5) * 0.6,
      spinAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
    });
  }

  // ── Subconjunto con marca "Ramatzo" (decals planos sobre algunos asteroides) ──
  const brandTex = createBrandTexture();
  const brandMat = new THREE.MeshBasicMaterial({
    map: brandTex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const brandGeo = new THREE.PlaneGeometry(120, 30);
  const brandCount = Math.min(8, Math.max(3, Math.round(count * 0.03)));
  const brandPanels: { mesh: THREE.Mesh; param: OrbitParam }[] = [];
  for (let i = 0; i < brandCount; i++) {
    const p = params[Math.floor((i / brandCount) * count)]!;
    const panel = new THREE.Mesh(brandGeo, brandMat);
    group.add(panel);
    brandPanels.push({ mesh: panel, param: p });
  }

  function placeInstance(target: THREE.Object3D, p: OrbitParam, angle: number) {
    const x = Math.cos(angle) * p.radius;
    const z = Math.sin(angle) * p.radius;
    const y = Math.sin(angle * 1.3 + p.phase) * p.radius * p.inclination;
    target.position.set(x, y, z);
  }

  function frame(elapsed: number) {
    for (let i = 0; i < count; i++) {
      const p = params[i]!;
      const angle = p.phase + elapsed * p.speed * 0.1;
      placeInstance(dummy, p, angle);
      quat.setFromAxisAngle(p.spinAxis, elapsed * p.spin);
      dummy.quaternion.copy(quat);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    for (const { mesh: panel, param: p } of brandPanels) {
      const angle = p.phase + elapsed * p.speed * 0.1;
      placeInstance(panel, p, angle);
      panel.position.y += p.scale * 1.4; // flotar junto al asteroide
      // Orientacion tangencial a la orbita (mira hacia fuera del centro).
      panel.lookAt(panel.position.x * 2, panel.position.y, panel.position.z * 2);
    }
  }

  // Posicion inicial.
  frame(0);

  return {
    object: group,
    update(elapsed) {
      frame(elapsed);
    },
    rebase(delta) {
      group.position.sub(delta);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      brandGeo.dispose();
      brandMat.dispose();
      brandTex.dispose();
    },
  };
}
