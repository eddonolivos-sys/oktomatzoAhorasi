/**
 * Lógica pura del layout orbital del sistema solar (sin Three.js, testeable).
 * Cada app del registry ocupa una órbita heliocéntrica inclinada y de escala
 * compacta. `planetLayout` es determinista; `orbitPosition` evalúa la posición
 * 3D en un instante `t` (segundos transcurridos).
 */

const MIN_RADIUS = 1200;
const MAX_RADIUS = 6000;
const GOLDEN = 2.399963267; // ángulo áureo (rad), para fases sin alineación

/**
 * Parámetros orbitales deterministas del planeta `index` de `total`.
 * `scale` multiplica el radio (escala global del sistema, manteniendo la
 * proporción entre órbitas); la velocidad ANGULAR no escala (mismo ritmo orbital).
 */
export function planetLayout(
  index: number,
  total: number,
  scale = 1,
): { radius: number; inclination: number; phase: number; speed: number } {
  const n = Math.max(1, total);
  // Radio creciente, repartido linealmente en [MIN, MAX]; con un solo planeta,
  // se coloca a un radio medio cómodo. `scale` agranda el sistema sin alterar proporciones.
  const f = n === 1 ? 0.5 : index / (n - 1);
  const radius = (MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * f) * scale;
  // Inclinación alternada y variada (|inc| <= ~32°) → uso real de las 3 dimensiones.
  const inclination = Math.sin(index * 1.7 + 0.5) * 0.56 * (index % 2 === 0 ? 1 : -1);
  // Fase por ángulo áureo, normalizada a [0, 2π).
  const phase = (index * GOLDEN) % (Math.PI * 2);
  // Velocidad angular lenta y decreciente con el radio (interiores más rápidos).
  const speed = 0.05 - 0.03 * f;
  return { radius, inclination, phase, speed };
}

/**
 * Posición 3D del planeta en el instante `t`: círculo en el plano XZ de radio
 * `radius`, rotado por `inclination` alrededor del eje X (introduce Y), avanzando
 * con `phase + speed * t`.
 */
export function orbitPosition(
  radius: number,
  inclination: number,
  phase: number,
  speed: number,
  t: number,
): { x: number; y: number; z: number } {
  const a = phase + speed * t;
  const x = Math.cos(a) * radius;
  const zFlat = Math.sin(a) * radius;
  const cosI = Math.cos(inclination);
  const sinI = Math.sin(inclination);
  // Rotación alrededor de X: el plano de la órbita se inclina, generando Y.
  return { x, y: zFlat * sinI, z: zFlat * cosI };
}

interface V3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Centro del planeta en coordenadas de ESCENA (S1 — arregla Bug C: los
 * planetas desaparecían porque `solar-system.ts` los movía en coordenadas
 * absolutas sin restar `worldOffset`, cayendo fuera de niebla/far tras el
 * rebase). `groupPos` es la posición del grupo "sistema" (afectada por
 * rebase); `localPos` es la posición del planeta DENTRO de ese grupo
 * (calculada por `orbitPosition`, sin cambios). worldCenter = groupPos + localPos.
 */
export function planetWorldCenter(groupPos: V3, localPos: V3): V3 {
  return { x: groupPos.x + localPos.x, y: groupPos.y + localPos.y, z: groupPos.z + localPos.z };
}

export type CaptureState = 'far' | 'hint' | 'capture';

/**
 * Estado de aproximación a un planeta según la distancia (S2 — recalibra la
 * esfera de captura, antes excesiva). `capture` dispara la órbita (#3);
 * `hint` es SOLO aviso en el HUD (no interactúa); `far` no muestra nada.
 */
export function captureState(
  distance: number,
  planetRadius: number,
  factors: { influenceFactor: number; approachHintFactor: number },
): CaptureState {
  if (distance <= planetRadius * factors.influenceFactor) return 'capture';
  if (distance <= planetRadius * factors.approachHintFactor) return 'hint';
  return 'far';
}
