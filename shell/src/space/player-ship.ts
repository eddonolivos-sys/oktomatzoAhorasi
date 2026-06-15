import * as THREE from 'three';
import type { ShipState } from './ship-controller';
import { thrustGlow } from './thrust-visual';

export interface PlayerShip {
  object: THREE.Group;
  update(elapsed: number, state: ShipState, delta: number): void;
  dispose(): void;
}

/**
 * Nave del jugador "Constellation OS v3": casco aerodinámico en flecha,
 * cabina de cristal frío, alas con luces de navegación, toberas reactivas y
 * estela aditiva. AUTO-ILUMINADA (luces propias acotadas + materiales emisivos)
 * para destacar en la oscuridad SIN iluminar el entorno (rangos de luz cortos).
 * Estética sci-fi luminosa y sobria (Star Citizen / No Man's Sky), nunca neón
 * chillón. Eje: nariz hacia -Z, motores hacia +Z. Vista de persecución.
 *
 * IMPORTANTE: el alabeo (roll) lo aplica el pivote visual de ShipController
 * (plan 01) sobre el contenedor al que se adjunta esta nave. Este update SOLO
 * anima toberas, estela, luces y bob; NUNCA toca la rotación del objeto raíz.
 */
export function createPlayerShip(): PlayerShip {
  const ship = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  // ── Paleta (fría + ámbar) ──
  const hull = track(
    new THREE.MeshStandardMaterial({ color: 0x2a3340, metalness: 0.9, roughness: 0.32, emissive: 0x070b12, emissiveIntensity: 1 }),
  );
  const hullLight = track(
    new THREE.MeshStandardMaterial({ color: 0x3d4a5c, metalness: 0.85, roughness: 0.4 }),
  );
  const dark = track(new THREE.MeshStandardMaterial({ color: 0x10151c, metalness: 0.7, roughness: 0.6 }));
  const glass = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x0a1820,
      metalness: 0,
      roughness: 0.05,
      transparent: true,
      opacity: 0.55,
      emissive: 0x0c3a4a,
      emissiveIntensity: 0.6,
    }),
  );
  const trim = track(new THREE.MeshStandardMaterial({ color: 0x8aa0b8, metalness: 0.95, roughness: 0.2 }));
  // Acento ámbar (costuras de energía) y luces de navegación.
  const amber = track(new THREE.MeshStandardMaterial({ color: 0xffb24d, emissive: 0xff8c2a, emissiveIntensity: 2.0 }));
  const navPort = track(new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 3 }));
  const navStarboard = track(new THREE.MeshStandardMaterial({ color: 0x33e0c0, emissive: 0x33e0c0, emissiveIntensity: 3 }));

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, cfg: (m: THREE.Mesh) => void): THREE.Mesh => {
    track(geo);
    const m = new THREE.Mesh(geo, mat);
    cfg(m);
    ship.add(m);
    return m;
  };

  // Registro de luces de navegación: material emisivo + desfase de estrobo.
  const navLights: { mat: THREE.MeshStandardMaterial; phase: number }[] = [];

  // ── Casco: fuselaje aerodinámico en flecha ──
  // Cuerpo central (cápsula alargada hacia -Z).
  add(new THREE.CapsuleGeometry(0.5, 2.6, 10, 20), hull, (m) => {
    m.rotation.x = Math.PI / 2;
    m.position.z = 0.1;
  });
  // Nariz cónica afilada.
  add(new THREE.ConeGeometry(0.5, 1.8, 20), hullLight, (m) => {
    m.rotation.x = -Math.PI / 2;
    m.position.z = -2.5;
  });
  // Bloque trasero de motores (donde irán las toberas).
  add(new THREE.CylinderGeometry(0.62, 0.5, 0.7, 20), dark, (m) => {
    m.rotation.x = Math.PI / 2;
    m.position.z = 1.7;
  });
  // Espina dorsal (acento metálico claro a lo largo del lomo).
  add(new THREE.BoxGeometry(0.06, 0.12, 3.0), trim, (m) => {
    m.position.set(0, 0.42, 0.0);
  });

  // ── Cabina de cristal frío + marco ──
  add(new THREE.SphereGeometry(0.4, 22, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass, (m) => {
    m.position.set(0, 0.34, -0.95);
    m.scale.set(1, 0.8, 1.8);
  });
  add(new THREE.TorusGeometry(0.4, 0.035, 8, 28), trim, (m) => {
    m.position.set(0, 0.34, -0.95);
    m.rotation.x = Math.PI / 2;
    m.scale.set(1, 1.8, 1);
  });

  // ── Alas en flecha + pods + luces de navegación ──
  const wingGeo = new THREE.BoxGeometry(2.2, 0.07, 0.9);
  for (const side of [-1, 1] as const) {
    add(wingGeo, hull, (m) => {
      m.position.set(side * 1.35, -0.05, 0.45);
      m.rotation.y = side * -0.32;
      m.rotation.z = side * 0.08;
    });
    // Pod en la punta.
    add(new THREE.CapsuleGeometry(0.09, 0.5, 6, 10), hullLight, (m) => {
      m.rotation.x = Math.PI / 2;
      m.position.set(side * 2.5, -0.05, 0.55);
    });
    // Borde de fuga ámbar.
    add(new THREE.BoxGeometry(1.6, 0.03, 0.05), amber, (m) => {
      m.position.set(side * 1.4, -0.04, 0.92);
      m.rotation.y = side * -0.32;
    });
    // Luz de navegación: roja a babor (-1), cian a estribor (+1).
    const navMat = side < 0 ? navPort : navStarboard;
    add(new THREE.SphereGeometry(0.07, 10, 10), navMat, (m) => {
      m.position.set(side * 2.78, -0.05, 0.3);
    });
    navLights.push({ mat: navMat, phase: side < 0 ? 0 : Math.PI });
  }

  return {
    object: ship,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    update(_elapsed, _state, _delta) {
      // Las capas reactivas (toberas, estela, luces, bob) se añaden en tareas
      // posteriores. Nunca aplicar roll aquí.
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
