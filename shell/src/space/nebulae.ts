import * as THREE from 'three';

export interface Nebulae {
  object: THREE.Group;
  update(elapsed: number): void;
  dispose(): void;
}

/** Una nebulosa: posición fija lejana, tinte sobrio y velocidad de giro propia. */
interface NebulaSpec {
  position: [number, number, number];
  /** Color RGB normalizado (0..1) del centro de la nube. */
  color: [number, number, number];
  /** Diámetro del sprite en unidades de mundo. */
  size: number;
  /** Opacidad base (muy baja: backdrop, no debe lavar la escena). */
  opacity: number;
  /** Velocidad de rotación del sprite (rad/s, lenta). */
  spin: number;
  /** Fase del latido de opacidad (para que no respiren al unísono). */
  phase: number;
}

/**
 * Paleta sobria: ámbar apagado + azul/violeta frío. Sin neón: valores
 * desaturados y oscuros, la suma aditiva ya los aclara lo justo.
 */
const AMBER: [number, number, number] = [0.42, 0.28, 0.16];
const BLUE: [number, number, number] = [0.16, 0.22, 0.36];
const VIOLET: [number, number, number] = [0.26, 0.18, 0.34];

/**
 * Posiciones fijas MUY lejanas (varios miles de unidades; más allá de los
 * planetas y por delante del shell de far-stars en 18000–26000) para que lean
 * como telón de fondo y nunca como obstáculos. Repartidas alrededor del sistema.
 */
const SPECS: NebulaSpec[] = [
  { position: [-7000, 1800, -9000], color: AMBER, size: 9000, opacity: 0.1, spin: 0.004, phase: 0.0 },
  { position: [8200, -1200, -7600], color: BLUE, size: 10500, opacity: 0.09, spin: -0.003, phase: 1.7 },
  { position: [-3000, 2600, 9500], color: VIOLET, size: 8000, opacity: 0.08, spin: 0.005, phase: 3.1 },
  { position: [6000, 3200, 8800], color: AMBER, size: 7500, opacity: 0.07, spin: -0.0045, phase: 4.6 },
  { position: [-9500, -2200, 2000], color: BLUE, size: 9500, opacity: 0.085, spin: 0.0035, phase: 2.3 },
];

/**
 * Textura radial difusa (gradiente gaussiano suave) para las nubes de gas.
 * Núcleo tenue que se desvanece a transparente: bordes blandos, sin anillo.
 * Reutilizada por todos los sprites (una sola textura, dispose-safe).
 */
function createNebulaTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  // Blanco escalado por la opacidad del material+color del sprite; aquí solo el
  // perfil alfa. Caída suave para que no se note el recorte del sprite.
  g.addColorStop(0.0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.16)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

/**
 * Nebulosas de fondo: unas pocas nubes de gas grandes y MUY tenues como telón
 * cósmico. Sprites aditivos con textura radial suave, paleta sobria (ámbar
 * apagado + azul/violeta frío), opacidad baja para no saturar. Derivan/rotan
 * lentamente con un latido de opacidad apenas perceptible.
 *
 * Telón de fondo lejano: NO se rebasa (igual que far-starfield, es la referencia
 * absoluta); el rebase del motor las dejaría intactas a propósito.
 */
export function createNebulae(): Nebulae {
  const group = new THREE.Group();
  group.renderOrder = -1; // detrás de la escena, junto al far-starfield

  const texture = createNebulaTexture();

  interface Item {
    sprite: THREE.Sprite;
    material: THREE.SpriteMaterial;
    baseOpacity: number;
    spin: number;
    phase: number;
  }
  const items: Item[] = [];

  for (const s of SPECS) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: new THREE.Color(s.color[0], s.color[1], s.color[2]),
      transparent: true,
      opacity: s.opacity,
      depthWrite: false,
      depthTest: false, // backdrop puro: nunca ocluye ni es ocluido
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(s.position[0], s.position[1], s.position[2]);
    sprite.scale.setScalar(s.size);
    sprite.frustumCulled = false;
    group.add(sprite);
    items.push({ sprite, material, baseOpacity: s.opacity, spin: s.spin, phase: s.phase });
  }

  return {
    object: group,
    update(elapsed) {
      for (const it of items) {
        // Giro lento (los sprites siempre miran a cámara; el roll del material
        // se aplica vía `rotation`, una propiedad escalar del SpriteMaterial).
        it.material.rotation = elapsed * it.spin + it.phase;
        // Latido de opacidad apenas perceptible (±15% sobre la base, ya tenue).
        it.material.opacity = it.baseOpacity * (0.85 + 0.15 * Math.sin(elapsed * 0.05 + it.phase));
      }
    },
    dispose() {
      for (const it of items) it.material.dispose();
      texture.dispose();
    },
  };
}
