import * as THREE from 'three';
import type { ShipState } from './ship-controller';
import { thrustGlow } from './thrust-visual';

/** Textura de estela: degradado longitudinal (brillante en la base, se apaga). */
function trailTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255, 210, 140, 0.95)'); // base (boquilla)
  g.addColorStop(0.35, 'rgba(255, 150, 70, 0.5)');
  g.addColorStop(1, 'rgba(255, 110, 50, 0)'); // cola desvanecida
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 128);
  return new THREE.CanvasTexture(c);
}

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

  // Registros para la animación reactiva.
  const cores: THREE.Mesh[] = [];
  const flames: THREE.Mesh[] = [];
  const FLAME_BASE_LEN = 1.4; // longitud del cono de llama a empuje máximo (z+).
  const trails: THREE.Mesh[] = [];
  const TRAIL_BASE_LEN = 4.5; // longitud del quad de estela a empuje máximo.

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

  // ── Detalle de superficie (Hito 4): costillas de panel + quilla + winglets ──
  // Reutiliza materiales ya trackeados (hull/hullLight/dark/trim); no crea
  // materiales nuevos, así que no hace falta registrar nada adicional.
  for (const side of [-1, 1] as const) {
    add(new THREE.BoxGeometry(0.04, 0.05, 2.2), trim, (m) => {
      m.position.set(side * 0.18, 0.3, 0.1);
    });
  }
  // Quilla ventral: aleta baja para equilibrio visual y silueta más afilada.
  add(new THREE.BoxGeometry(0.05, 0.5, 1.4), hullLight, (m) => {
    m.position.set(0, -0.55, 0.6);
    m.rotation.x = 0.05;
  });
  // Pod sensor bajo la nariz: refuerza la lectura de "morro".
  add(new THREE.CapsuleGeometry(0.08, 0.3, 6, 10), dark, (m) => {
    m.rotation.x = Math.PI / 2;
    m.position.set(0, -0.28, -1.9);
  });
  // Winglets: aletas verticales tras los pods de las puntas de ala.
  for (const side of [-1, 1] as const) {
    add(new THREE.BoxGeometry(0.05, 0.32, 0.4), hullLight, (m) => {
      m.position.set(side * 2.62, 0.12, 0.75);
      m.rotation.z = side * -0.08;
    });
  }

  // ── Toberas: boquilla oscura + núcleo emisivo + cono de llama estirable ──
  const flameMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xffb24d,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  for (const ex of [-0.3, 0.3] as const) {
    // Boquilla.
    add(new THREE.CylinderGeometry(0.24, 0.3, 0.5, 18), dark, (m) => {
      m.rotation.x = Math.PI / 2;
      m.position.set(ex, 0, 2.0);
    });
    // Anillo de boquilla ámbar.
    add(new THREE.TorusGeometry(0.24, 0.03, 8, 20), amber, (m) => {
      m.rotation.x = Math.PI / 2;
      m.position.set(ex, 0, 2.22);
    });
    // Núcleo emisivo.
    const core = add(
      new THREE.CircleGeometry(0.2, 18),
      track(new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb24d, emissiveIntensity: 2.5, side: THREE.DoubleSide })),
      (m) => {
        m.position.set(ex, 0, 2.24);
        m.rotation.y = Math.PI; // mira hacia +Z (atrás).
      },
    );
    cores.push(core);
    // Cono de llama (vértice hacia +Z). El pivote queda en la base (z=2.24);
    // escalando en Z la llama crece hacia atrás. ConeGeometry apunta +Y por
    // defecto, lo rotamos para que apunte +Z y desplazamos para que la base
    // quede en la boquilla.
    const flameGeo = track(new THREE.ConeGeometry(0.18, FLAME_BASE_LEN, 16, 1, true));
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.rotation.x = -Math.PI / 2; // eje del cono ahora a lo largo de +Z.
    flame.position.set(ex, 0, 2.24 + FLAME_BASE_LEN / 2);
    ship.add(flame);
    flames.push(flame);
  }

  // ── Auto-iluminación: revela el casco SIN iluminar el entorno ──
  // distance corta + decay 2 => la luz cae a ~0 mucho antes de alcanzar el
  // mundo (planetas/sol/asteroides están a cientos/miles de unidades).
  const keyLight = new THREE.PointLight(0xbcd4ff, 6, 14, 2); // frío, cenital
  keyLight.position.set(0.6, 2.4, -1.2);
  ship.add(keyLight);
  const rimLight = new THREE.PointLight(0x7fb0ff, 4, 12, 2); // azul de contorno
  rimLight.position.set(-1.6, -1.4, 2.2);
  ship.add(rimLight);
  const tailGlow = new THREE.PointLight(0xff9a3a, 5, 8, 2); // ámbar de cola
  tailGlow.position.set(0, 0, 3.0);
  ship.add(tailGlow);

  // ── Estela aditiva: un quad por tobera, anclado en +Z ──
  const trailTex = track(trailTexture());
  const trailMat = track(
    new THREE.MeshBasicMaterial({
      map: trailTex,
      color: 0xffb46a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  for (const ex of [-0.3, 0.3] as const) {
    const geo = track(new THREE.PlaneGeometry(0.5, TRAIL_BASE_LEN));
    const trail = new THREE.Mesh(geo, trailMat);
    // El plano (alto en Y) se tumba para extenderse a lo largo de +Z; la base
    // (parte brillante de la textura, v=0) queda en la boquilla.
    trail.rotation.x = -Math.PI / 2;
    trail.position.set(ex, 0, 2.24 + TRAIL_BASE_LEN / 2);
    ship.add(trail);
    trails.push(trail);
  }

  // Posición base del grupo para el bob en reposo (no toca rotación).
  const baseY = ship.position.y;

  return {
    object: ship,
    update(elapsed, state, _delta) {
      const t = thrustGlow(state.speed, state.isNitro);
      // Parpadeo de alta frecuencia (turbulencia de plasma).
      const flick = 0.85 + 0.12 * Math.sin(elapsed * 17) + 0.06 * Math.sin(elapsed * 41.3);
      // Al frenar, recorta las llamas a un mínimo.
      const brakeCut = state.isBraking ? 0.4 : 1;

      // Toberas: longitud (escala Z del cono) + brillo del núcleo.
      const lenScale = t.length * brakeCut * flick;
      for (const f of flames) {
        f.scale.z = lenScale;
        // Recoloca la base en la boquilla (z=2.24) al cambiar la longitud.
        f.position.z = 2.24 + (FLAME_BASE_LEN * lenScale) / 2;
        (f.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.55 * t.glow * brakeCut;
      }
      for (const c of cores) {
        (c.material as THREE.MeshStandardMaterial).emissiveIntensity = (1.5 + 2.5 * t.glow) * flick * brakeCut;
      }

      // Estela: longitud (escala Y del plano, que apunta a +Z) + opacidad.
      const trailLen = t.length * brakeCut;
      for (const tr of trails) {
        tr.scale.y = trailLen;
        tr.position.z = 2.24 + (TRAIL_BASE_LEN * trailLen) / 2;
        (tr.material as THREE.MeshBasicMaterial).opacity = t.trailOpacity * brakeCut;
      }

      // Estrobos de navegación (rojo babor / cian estribor, desfasados).
      for (const n of navLights) {
        const s = 0.5 + 0.5 * Math.sin(elapsed * 4 + n.phase);
        n.mat.emissiveIntensity = 1.2 + 3.0 * s * s;
      }

      // Costura ámbar emisiva: pulso lento "respiración" de energía.
      amber.emissiveIntensity = 1.4 + 0.8 * (0.5 + 0.5 * Math.sin(elapsed * 1.6));

      // Bob en reposo: leve levitación que se desvanece al acelerar.
      const idle = 1 - Math.min(1, state.speed / 60);
      ship.position.y = baseY + idle * 0.06 * Math.sin(elapsed * 1.3);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
