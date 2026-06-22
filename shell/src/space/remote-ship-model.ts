import * as THREE from 'three';

export interface RemoteShipModel {
  object: THREE.Group;
  dispose(): void;
}

/**
 * Nave remota LIGERA: silueta de la nave del jugador (casco en flecha + cabina +
 * alas + toberas) pero SIN point lights, SIN estela ni llamas animadas. Pensada
 * para instanciarse N veces sin coste de iluminación. Eje: nariz a −Z, motores a +Z.
 * Auto-iluminación mínima por materiales emisivos sobrios (sin neón).
 */
export function createRemoteShip(): RemoteShipModel {
  const ship = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  const hull = track(
    new THREE.MeshStandardMaterial({
      color: 0x2a3340,
      metalness: 0.85,
      roughness: 0.4,
      emissive: 0x141b26,
      emissiveIntensity: 0.6,
    }),
  );
  const hullLight = track(new THREE.MeshStandardMaterial({ color: 0x3d4a5c, metalness: 0.8, roughness: 0.45 }));
  const dark = track(new THREE.MeshStandardMaterial({ color: 0x10151c, metalness: 0.6, roughness: 0.7 }));
  const glass = track(
    new THREE.MeshStandardMaterial({
      color: 0x0a1820,
      metalness: 0,
      roughness: 0.15,
      emissive: 0x0c3a4a,
      emissiveIntensity: 0.7,
    }),
  );
  // Núcleo de tobera emisivo sobrio (estático: las remotas no animan toberas).
  const core = track(new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb24d, emissiveIntensity: 1.6 }));

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, cfg: (m: THREE.Mesh) => void) => {
    track(geo);
    const m = new THREE.Mesh(geo, mat);
    cfg(m);
    ship.add(m);
  };

  // Cuerpo central.
  add(new THREE.CapsuleGeometry(0.5, 2.6, 8, 16), hull, (m) => {
    m.rotation.x = Math.PI / 2;
    m.position.z = 0.1;
  });
  // Nariz cónica.
  add(new THREE.ConeGeometry(0.5, 1.8, 16), hullLight, (m) => {
    m.rotation.x = -Math.PI / 2;
    m.position.z = -2.5;
  });
  // Bloque trasero de motores.
  add(new THREE.CylinderGeometry(0.62, 0.5, 0.7, 16), dark, (m) => {
    m.rotation.x = Math.PI / 2;
    m.position.z = 1.7;
  });
  // Cabina.
  add(new THREE.SphereGeometry(0.4, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, (m) => {
    m.position.set(0, 0.34, -0.95);
    m.scale.set(1, 0.8, 1.8);
  });
  // Alas en flecha + núcleos de tobera.
  const wingGeo = new THREE.BoxGeometry(2.2, 0.07, 0.9);
  for (const side of [-1, 1] as const) {
    add(wingGeo, hull, (m) => {
      m.position.set(side * 1.35, -0.05, 0.45);
      m.rotation.y = side * -0.32;
      m.rotation.z = side * 0.08;
    });
  }
  for (const ex of [-0.3, 0.3] as const) {
    add(new THREE.CylinderGeometry(0.24, 0.3, 0.5, 14), dark, (m) => {
      m.rotation.x = Math.PI / 2;
      m.position.set(ex, 0, 2.0);
    });
    add(new THREE.CircleGeometry(0.2, 14), core, (m) => {
      m.position.set(ex, 0, 2.24);
      m.rotation.y = Math.PI;
    });
  }

  return {
    object: ship,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
