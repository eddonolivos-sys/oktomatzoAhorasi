import * as THREE from 'three';
import { lifeProgress, makeScheduler, type Scheduler } from './comets-anim';

export interface Comets {
  object: THREE.Group;
  update(elapsed: number, delta: number): void;
  dispose(): void;
}

/** Cometas vivos como mucho a la vez (pool fijo, sin crecimiento ilimitado). */
const POOL_SIZE = 3;
/** Segmentos de la cola de cada cometa (vértices = SEGMENTS + 1). */
const TAIL_SEGMENTS = 12;
/** Vida de un cometa (s): cruza el campo y se desvanece. */
const LIFE_MIN = 1.6;
const LIFE_MAX = 2.6;
/** Esperas entre apariciones (s): ocasional, sobrio. */
const SPAWN_MIN = 6;
const SPAWN_MAX = 14;
/** Longitud del recorrido y de la cola (unidades de mundo). */
const TRAVEL = 4200;
const TAIL_LEN = 320;
/** Color cálido/blanco del cometa (sin neón). */
const HEAD_COLOR = new THREE.Color(0xfff0d8);

/** Estado de un slot del pool. */
interface CometSlot {
  active: boolean;
  age: number;
  life: number;
  /** Origen y dirección del trazo (precomputados al spawnear). */
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  head: THREE.Sprite;
  headMat: THREE.SpriteMaterial;
  tail: THREE.Line;
  tailGeo: THREE.BufferGeometry;
  tailMat: THREE.LineBasicMaterial;
  /** Buffer de posiciones de la cola (reutilizado, sin alocación por frame). */
  tailPos: Float32Array;
}

/** Textura radial suave para la cabeza del cometa (mismo patrón que glow). */
function createHeadTexture(): THREE.CanvasTexture {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,250,240,1)');
  g.addColorStop(0.3, 'rgba(255,228,180,0.7)');
  g.addColorStop(1, 'rgba(255,228,180,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

/**
 * Cometas: un pool pequeño (≤3) de destellos que aparecen a intervalos
 * aleatorios, cruzan el campo medio/cercano (cabeza brillante + cola corta que
 * se desvanece, aditiva, cálida) y desaparecen. Sin alocaciones por frame: los
 * objetos del pool se reutilizan y la cola se actualiza in-place.
 *
 * Transitorios y de vida muy corta: NO se rebasan. Si el motor rebasa el origen
 * mientras un cometa está vivo, ese cometa simplemente termina su breve trazo en
 * coordenadas viejas (≤2.6 s) y el siguiente nace en el nuevo marco; el coste
 * visual es nulo y se evita acoplar el pool al worldOffset.
 */
export function createComets(): Comets {
  const group = new THREE.Group();
  const headTex = createHeadTexture();

  const slots: CometSlot[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const headMat = new THREE.SpriteMaterial({
      map: headTex,
      color: HEAD_COLOR,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const head = new THREE.Sprite(headMat);
    head.scale.setScalar(60);
    head.frustumCulled = false;
    head.visible = false;

    // Cola: línea con gradiente de color por vértice (brillante en la cabeza →
    // negro en la punta), atenuada aditivamente. Color por vértice precomputado.
    const tailPos = new Float32Array((TAIL_SEGMENTS + 1) * 3);
    const tailCol = new Float32Array((TAIL_SEGMENTS + 1) * 3);
    for (let v = 0; v <= TAIL_SEGMENTS; v++) {
      const f = 1 - v / TAIL_SEGMENTS; // 1 en la cabeza, 0 en la punta
      tailCol[v * 3] = HEAD_COLOR.r * f;
      tailCol[v * 3 + 1] = HEAD_COLOR.g * f;
      tailCol[v * 3 + 2] = HEAD_COLOR.b * f;
    }
    const tailGeo = new THREE.BufferGeometry();
    tailGeo.setAttribute('position', new THREE.BufferAttribute(tailPos, 3));
    tailGeo.setAttribute('color', new THREE.BufferAttribute(tailCol, 3));
    const tailMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const tail = new THREE.Line(tailGeo, tailMat);
    tail.frustumCulled = false;
    tail.visible = false;

    group.add(head);
    group.add(tail);
    slots.push({
      active: false,
      age: 0,
      life: 0,
      origin: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      head,
      headMat,
      tail,
      tailGeo,
      tailMat,
      tailPos,
    });
  }

  // Planificador puro: decide cuándo spawnear (Math.random en runtime).
  const scheduler: Scheduler = makeScheduler({ min: SPAWN_MIN, max: SPAWN_MAX, rng: Math.random });

  // Reutilizables (sin alocación por frame).
  const headPos = new THREE.Vector3();
  const tailTip = new THREE.Vector3();

  /** Inicializa el primer slot libre con un trazo aleatorio en el campo cercano. */
  function spawn() {
    const slot = slots.find((s) => !s.active);
    if (!slot) return; // pool lleno: no spawnea (cota dura ≤ POOL_SIZE)

    // Origen aleatorio en una banda alrededor del jugador (que mira a −Z desde
    // z≈+2600). Lo colocamos por delante, en el campo visible, con jitter.
    slot.origin.set(
      (Math.random() - 0.5) * 5000,
      400 + (Math.random() - 0.5) * 2600,
      2600 - Math.random() * 5000,
    );
    // Dirección mayormente transversal (cruza la vista), con leve componente Z.
    slot.dir
      .set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.8)
      .normalize();

    slot.age = 0;
    slot.life = LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN);
    slot.active = true;
    slot.head.visible = true;
    slot.tail.visible = true;
  }

  function deactivate(slot: CometSlot) {
    slot.active = false;
    slot.head.visible = false;
    slot.tail.visible = false;
    slot.headMat.opacity = 0;
    slot.tailMat.opacity = 0;
  }

  return {
    object: group,
    update(_elapsed, delta) {
      // ¿Toca un nuevo cometa? (como mucho uno por frame).
      if (scheduler.tick(delta)) spawn();

      for (const slot of slots) {
        if (!slot.active) continue;
        slot.age += delta;
        const p = lifeProgress(slot.age, slot.life); // 0 nace … 1 muere
        if (p >= 1) {
          deactivate(slot);
          continue;
        }

        // Posición de la cabeza a lo largo del trazo.
        headPos.copy(slot.origin).addScaledVector(slot.dir, p * TRAVEL);
        slot.head.position.copy(headPos);

        // Cola: desde la cabeza hacia atrás (contra la dirección de avance).
        for (let v = 0; v <= TAIL_SEGMENTS; v++) {
          const f = v / TAIL_SEGMENTS; // 0 cabeza, 1 punta
          tailTip.copy(headPos).addScaledVector(slot.dir, -f * TAIL_LEN);
          slot.tailPos[v * 3] = tailTip.x;
          slot.tailPos[v * 3 + 1] = tailTip.y;
          slot.tailPos[v * 3 + 2] = tailTip.z;
        }
        slot.tailGeo.attributes['position']!.needsUpdate = true;

        // Desvanecido: aparece rápido y se apaga al final de la vida (envolvente
        // tipo "fade in/out" suave). Brillo sobrio.
        const env = Math.sin(Math.PI * p); // 0 en extremos, 1 en el centro
        slot.headMat.opacity = 0.9 * env;
        slot.tailMat.opacity = 0.6 * env;
      }
    },
    dispose() {
      for (const slot of slots) {
        slot.headMat.dispose();
        slot.tailGeo.dispose();
        slot.tailMat.dispose();
      }
      headTex.dispose();
    },
  };
}
