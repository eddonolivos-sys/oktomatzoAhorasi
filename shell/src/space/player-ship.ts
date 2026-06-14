import * as THREE from 'three';
import { seededRng } from './layout';

export interface PlayerShip {
  object: THREE.Group;
  update(elapsed: number): void;
  dispose(): void;
}

function thrusterTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255, 230, 180, 0.95)');
  g.addColorStop(0.3, 'rgba(255, 140, 66, 0.55)');
  g.addColorStop(0.7, 'rgba(200, 75, 49, 0.15)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/**
 * Nave del jugador: modelo detallado con casco metálico por capas, cabina de
 * cristal, alas en flecha con luces de navegación, motores emisivos, greebles y
 * líneas de panel. Lleva luz propia (PointLights cálidas + materiales emisivos)
 * para que se aprecien sus detalles en el espacio oscuro. Pensada para vista de
 * persecución (adjunta a la cámara). Eje: nariz hacia -Z, motores hacia +Z.
 */
export function createPlayerShip(): PlayerShip {
  const ship = new THREE.Group();
  const rng = seededRng(7);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  const hull = track(new THREE.MeshStandardMaterial({ color: 0x3a2a20, metalness: 0.85, roughness: 0.45, emissive: 0x140a04, emissiveIntensity: 1 }));
  const hullLight = track(new THREE.MeshStandardMaterial({ color: 0x5a4a3a, metalness: 0.8, roughness: 0.5 }));
  const brass = track(new THREE.MeshStandardMaterial({ color: 0x8b7a5a, metalness: 0.9, roughness: 0.3 }));
  const copper = track(new THREE.MeshStandardMaterial({ color: 0xb86a3a, metalness: 0.85, roughness: 0.35 }));
  const dark = track(new THREE.MeshStandardMaterial({ color: 0x1a1008, metalness: 0.6, roughness: 0.7 }));
  const glass = track(new THREE.MeshPhysicalMaterial({ color: 0x4a3a2a, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.4, emissive: 0x2a1a0a, emissiveIntensity: 0.5 }));
  const engineMat = track(new THREE.MeshStandardMaterial({ color: 0xffae5a, emissive: 0xffae5a, emissiveIntensity: 2.5, side: THREE.DoubleSide }));
  const navAmber = track(new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xffaa33, emissiveIntensity: 3 }));
  const navRed = track(new THREE.MeshStandardMaterial({ color: 0xcc3322, emissive: 0xcc3322, emissiveIntensity: 3 }));
  const accent = track(new THREE.MeshStandardMaterial({ color: 0xffae5a, emissive: 0xff8c42, emissiveIntensity: 1.8 }));
  const lineMat = track(new THREE.LineBasicMaterial({ color: 0x6a5a48, transparent: true, opacity: 0.5 }));

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, cfg: (m: THREE.Mesh) => void): THREE.Mesh => {
    track(geo);
    const m = new THREE.Mesh(geo, mat);
    cfg(m);
    ship.add(m);
    return m;
  };
  const addEdges = (mesh: THREE.Mesh) => {
    const e = track(new THREE.EdgesGeometry(mesh.geometry as THREE.BufferGeometry, 25));
    const seg = new THREE.LineSegments(e, lineMat);
    seg.position.copy(mesh.position);
    seg.quaternion.copy(mesh.quaternion);
    seg.scale.copy(mesh.scale);
    ship.add(seg);
  };

  // Fuselaje principal
  const body = add(new THREE.CylinderGeometry(0.55, 0.7, 3.4, 18), hull, (m) => {
    m.rotation.x = Math.PI / 2;
  });
  addEdges(body);

  // Nariz cónica
  add(new THREE.CylinderGeometry(0.1, 0.55, 1.7, 18), hullLight, (m) => {
    m.rotation.x = Math.PI / 2;
    m.position.z = -2.55;
  });

  // Bloque trasero de motores
  add(new THREE.CylinderGeometry(0.72, 0.56, 0.8, 18), dark, (m) => {
    m.rotation.x = Math.PI / 2;
    m.position.z = 2.0;
  });

  // Aleta dorsal
  add(new THREE.BoxGeometry(0.06, 0.6, 1.2), hullLight, (m) => {
    m.position.set(0, 0.6, 1.0);
    m.rotation.x = 0.2;
  });

  // Cabina (cristal) + marco
  const canopy = add(new THREE.SphereGeometry(0.42, 22, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass, (m) => {
    m.position.set(0, 0.42, -0.9);
    m.scale.set(1, 0.85, 1.7);
  });
  void canopy;
  add(new THREE.TorusGeometry(0.42, 0.04, 8, 26), brass, (m) => {
    m.position.set(0, 0.42, -0.9);
    m.rotation.x = Math.PI / 2;
    m.scale.set(1, 1.7, 1);
  });

  // Alas en flecha + pods + luces de navegación
  const wingGeo = new THREE.BoxGeometry(2.4, 0.08, 1.0);
  for (const side of [-1, 1] as const) {
    const wing = add(wingGeo, hull, (m) => {
      m.position.set(side * 1.5, -0.05, 0.35);
      m.rotation.y = side * -0.35;
      m.rotation.z = side * 0.1;
    });
    addEdges(wing);
    add(new THREE.CapsuleGeometry(0.1, 0.5, 6, 10), copper, (m) => {
      m.rotation.x = Math.PI / 2;
      m.position.set(side * 2.7, -0.05, 0.5);
    });
    add(new THREE.SphereGeometry(0.08, 10, 10), side < 0 ? navRed : navAmber, (m) => {
      m.position.set(side * 2.95, -0.05, 0.2);
    });
  }

  // Greebles (detalle mecánico) deterministas
  for (let i = 0; i < 12; i++) {
    const w = 0.1 + rng() * 0.22;
    const d = 0.16 + rng() * 0.4;
    add(new THREE.BoxGeometry(w, 0.1, d), i % 2 ? brass : hullLight, (m) => {
      m.position.set((rng() - 0.5) * 1.0, (rng() < 0.5 ? 0.3 : -0.32) + (rng() - 0.5) * 0.2, -1.2 + rng() * 3.0);
    });
  }

  // Tiras emisivas (líneas de energía) a lo largo del casco
  for (const side of [-1, 1] as const) {
    add(new THREE.BoxGeometry(0.04, 0.04, 2.4), accent, (m) => {
      m.position.set(side * 0.5, 0.12, 0.1);
    });
  }
  // Tomas laterales con brillo
  for (const side of [-1, 1] as const) {
    add(new THREE.BoxGeometry(0.18, 0.22, 0.9), dark, (m) => {
      m.position.set(side * 0.62, -0.08, 0.8);
      m.rotation.y = side * 0.08;
    });
    add(new THREE.BoxGeometry(0.1, 0.16, 0.7), accent, (m) => {
      m.position.set(side * 0.66, -0.08, 0.8);
    });
  }
  // Aletas ventrales
  for (const side of [-1, 1] as const) {
    add(new THREE.BoxGeometry(0.05, 0.45, 0.7), hullLight, (m) => {
      m.position.set(side * 0.35, -0.5, 1.4);
      m.rotation.z = side * -0.35;
    });
  }
  // Anillos de refuerzo del fuselaje
  for (const z of [-1.4, -0.2, 1.0]) {
    add(new THREE.TorusGeometry(0.58, 0.035, 8, 20), brass, (m) => {
      m.rotation.x = Math.PI / 2;
      m.position.z = z;
    });
  }

  // Antena con punta luminosa
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), brass, (m) => {
    m.position.set(0.2, 0.55, -0.2);
  });
  add(new THREE.SphereGeometry(0.05, 8, 8), navAmber, (m) => {
    m.position.set(0.2, 0.82, -0.2);
  });

  // Motores: tobera + núcleo emisivo + estela (sprite)
  const cores: THREE.Mesh[] = [];
  const glows: THREE.Sprite[] = [];
  const thrusterTex = track(thrusterTexture());
  for (const ex of [-0.33, 0.33]) {
    add(new THREE.CylinderGeometry(0.27, 0.33, 0.6, 16), dark, (m) => {
      m.rotation.x = Math.PI / 2;
      m.position.set(ex, 0, 2.45);
    });
    add(new THREE.TorusGeometry(0.27, 0.04, 8, 18), copper, (m) => {
      m.rotation.x = Math.PI / 2;
      m.position.set(ex, 0, 2.7);
    });
    const core = add(new THREE.CircleGeometry(0.22, 18), engineMat, (m) => {
      m.position.set(ex, 0, 2.72);
    });
    cores.push(core);
    const glowMat = track(
      new THREE.SpriteMaterial({ map: thrusterTex, color: 0xff8c42, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.9 }),
    );
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(ex, 0, 2.95);
    glow.scale.set(1.5, 1.5, 1);
    ship.add(glow);
    glows.push(glow);
  }

  // Luz propia: ilumina el casco en el espacio oscuro (faro de la nave).
  const keyLight = new THREE.PointLight(0xffd2a0, 3.4, 85, 2);
  keyLight.position.set(0.5, 3.4, -1.5);
  ship.add(keyLight);
  const rimLight = new THREE.PointLight(0xff9050, 2.4, 60, 2);
  rimLight.position.set(-1.2, -2.4, 2.8);
  ship.add(rimLight);
  const fillLight = new THREE.PointLight(0xffc070, 1.6, 55, 2);
  fillLight.position.set(0, 0.6, -3);
  ship.add(fillLight);

  return {
    object: ship,
    update(elapsed) {
      const flick = 0.8 + 0.18 * Math.sin(elapsed * 9) + 0.1 * Math.sin(elapsed * 23.3);
      for (const c of cores) (c.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.6 * flick;
      const s = 1.5 * (0.85 + 0.25 * Math.sin(elapsed * 11));
      for (const g of glows) g.scale.set(s, s, 1);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
