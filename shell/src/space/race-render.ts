import * as THREE from 'three';
import type { RaceTrack, V3 } from './race-track';

export interface RaceRenderOpts {
  track: RaceTrack;
  checkpointRadius: number;
  gateRadius: number;
  asteroidCount: number;
  asteroidRadius: number;
  seed: number;
}

export interface RaceRender {
  object: THREE.Group;
  update(elapsed: number, delta: number, currentCheckpoint: number): void;
  /** Posiciones LOCALES (mismo marco que los waypoints) de los asteroides, para colisión. */
  obstaclePositions(): V3[];
  rebase(delta: THREE.Vector3): void;
  dispose(): void;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Cableado Three.js de la pista (Hito 5): esferas guía translúcidas por
 * checkpoint (la actual más brillante), 2 esferas "planetas masivos"
 * decorativas sin colisión a los lados de un tramo, y asteroides móviles
 * (con colisión real, resuelta fuera de este módulo vía `obstaclePositions()`
 * + `race-math.ts`). `object` se posiciona UNA vez en `RACE_CONFIG.center`
 * desde `space-engine.ts`; `rebase()` sigue el mismo patrón que
 * `solar-system.ts`/`asteroids.ts` para no desincronizarse del marco de mundo.
 */
export function createRaceRender(opts: RaceRenderOpts): RaceRender {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  // ── Aros guía (checkpoints): TORUS, no esfera rellena ──
  // Una esfera translúcida rellena de radio ~220 con depthWrite:false produce
  // overdraw severo cuando la cámara está cerca/dentro (todo el framebuffer
  // queda cubierto por una superficie transparente que hay que mezclar por
  // píxel). Un aro delgado cubre una fracción mucho menor de pantalla con el
  // MISMO radio exterior, y de paso es el patrón real de "gate" de F1/Mario
  // Kart (un anillo que atraviesas) en vez de una bola que hay que esquivar.
  const guideGeo = track(new THREE.TorusGeometry(1, 0.07, 12, 28));
  const guideMats: THREE.MeshBasicMaterial[] = [];
  const lookTarget = new THREE.Vector3();
  opts.track.waypoints.forEach((wp, i) => {
    const mat = track(
      new THREE.MeshBasicMaterial({ color: 0xe6a817, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    const mesh = new THREE.Mesh(guideGeo, mat);
    mesh.scale.setScalar(opts.checkpointRadius);
    mesh.position.set(wp.x, wp.y, wp.z);
    // Orienta el aro perpendicular a la dirección de viaje (hacia el siguiente
    // checkpoint), como una puerta que se atraviesa.
    const next = opts.track.waypoints[(i + 1) % opts.track.waypoints.length] ?? wp;
    lookTarget.set(next.x, next.y, next.z);
    mesh.lookAt(lookTarget);
    group.add(mesh);
    guideMats.push(mat);
  });

  // ── Gates (2 esferas "planetas masivos" decorativas, sin colisión) ──
  const gateGeo = track(new THREE.SphereGeometry(1, 24, 16));
  const gateMat = track(
    new THREE.MeshStandardMaterial({ color: 0x3a2a20, metalness: 0.3, roughness: 0.8, emissive: 0x1a0e08 }),
  );
  const midIndex = Math.floor(opts.track.waypoints.length / 2);
  const midpoint = opts.track.waypoints[midIndex] ?? { x: 0, y: 0, z: 0 };
  for (const side of [-1, 1] as const) {
    const gate = new THREE.Mesh(gateGeo, gateMat);
    gate.scale.setScalar(opts.gateRadius);
    gate.position.set(midpoint.x + side * opts.gateRadius * 2.6, midpoint.y, midpoint.z);
    group.add(gate);
  }

  // ── Asteroides móviles (obstáculos con colisión real) ──
  const rand = mulberry32(opts.seed + 1);
  const asteroidGeo = track(new THREE.IcosahedronGeometry(1, 0));
  const asteroidMat = track(new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9, metalness: 0.1 }));
  interface Asteroid {
    mesh: THREE.Mesh;
    center: V3;
    orbitRadius: number;
    orbitSpeed: number;
    phase: number;
  }
  const asteroids: Asteroid[] = [];
  for (let i = 0; i < opts.asteroidCount; i++) {
    const wp = opts.track.waypoints[i % opts.track.waypoints.length] ?? { x: 0, y: 0, z: 0 };
    const mesh = new THREE.Mesh(asteroidGeo, asteroidMat);
    mesh.scale.setScalar(opts.asteroidRadius);
    group.add(mesh);
    asteroids.push({
      mesh,
      center: wp,
      orbitRadius: 200 + rand() * 400,
      orbitSpeed: 0.2 + rand() * 0.3,
      phase: rand() * Math.PI * 2,
    });
  }

  return {
    object: group,
    update(elapsed, _delta, currentCheckpoint) {
      guideMats.forEach((mat, i) => {
        mat.opacity = i === currentCheckpoint ? 0.85 : 0.5;
      });
      for (const a of asteroids) {
        const angle = a.phase + elapsed * a.orbitSpeed;
        a.mesh.position.set(
          a.center.x + Math.cos(angle) * a.orbitRadius,
          a.center.y + Math.sin(angle * 0.7) * a.orbitRadius * 0.3,
          a.center.z + Math.sin(angle) * a.orbitRadius,
        );
      }
    },
    obstaclePositions() {
      return asteroids.map((a) => ({ x: a.mesh.position.x, y: a.mesh.position.y, z: a.mesh.position.z }));
    },
    rebase(delta) {
      group.position.sub(delta);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
