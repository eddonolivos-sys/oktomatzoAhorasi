import * as THREE from 'three';
import { assemblyFactor } from './asteroids-anim';

export interface RamatzoBelt {
  object: THREE.Group;
  update(elapsed: number, delta: number): void;
  rebase(delta: THREE.Vector3): void;
  dispose(): void;
}

export interface RamatzoBeltOptions {
  /**
   * Hint de densidad. El recuento real se decide internamente por el muestreo de
   * glifos (legibilidad de la palabra); este valor solo limita superiormente el
   * número de asteroides para no pasarnos de presupuesto. Ver muestreo abajo.
   */
  count?: number;
  innerRadius: number;
  outerRadius: number;
  /** Centro del cinturón en espacio de escena (default: por delante del sistema). */
  center?: { x: number; y: number; z: number };
}

/** Punto objetivo (en la palabra) muestreado de un glifo. */
interface GlyphPoint {
  x: number; // unidades de mundo, centrado en 0
  y: number;
  z: number; // jitter de profundidad
}

/**
 * Renderiza "RAMATZO" a un canvas offscreen y devuelve puntos de los píxeles
 * rellenos, mapeados a un plano centrado en el origen y escalado a `wordWidth`
 * unidades de ancho. Submuestrea la rejilla para acercarse a `maxPoints` sin
 * pasarse (la palabra debe quedar legible: unos cientos de puntos).
 */
function sampleWordPoints(text: string, wordWidth: number, maxPoints: number): GlyphPoint[] {
  // Canvas de resolución generosa para captar el trazo de las letras.
  const W = 720;
  const H = 180;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 120px "Inter", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2 + 4);

  const img = ctx.getImageData(0, 0, W, H).data;

  // Primera pasada: recolecta píxeles rellenos en una rejilla con paso `stride`.
  // Ajustamos `stride` para que el número de muestras se acerque a maxPoints.
  const collectWithStride = (stride: number): { px: number; py: number }[] => {
    const pts: { px: number; py: number }[] = [];
    for (let py = 0; py < H; py += stride) {
      for (let px = 0; px < W; px += stride) {
        const alpha = img[(py * W + px) * 4 + 3]!;
        if (alpha > 128) pts.push({ px, py });
      }
    }
    return pts;
  };

  // Busca un stride que produzca como mucho maxPoints muestras (de denso a ralo).
  let stride = 3;
  let raw = collectWithStride(stride);
  while (raw.length > maxPoints && stride < 12) {
    stride += 1;
    raw = collectWithStride(stride);
  }

  // Mapea píxeles → coordenadas de mundo. La palabra se centra en (0,0); el eje
  // Y de canvas (hacia abajo) se invierte para que mire bien en el mundo.
  const scale = wordWidth / W;
  const pts: GlyphPoint[] = [];
  for (const { px, py } of raw) {
    pts.push({
      x: (px - W / 2) * scale,
      y: -(py - H / 2) * scale,
      // Jitter de profundidad sutil para dar grosor a la palabra (no plana).
      z: (Math.random() - 0.5) * wordWidth * 0.012,
    });
  }
  return pts;
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

/** Textura radial suave (ámbar) para los puntos de brillo aditivo. */
function createGlowTexture(): THREE.CanvasTexture {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255, 222, 170, 1)');
  g.addColorStop(0.4, 'rgba(240, 170, 90, 0.55)');
  g.addColorStop(1, 'rgba(240, 170, 90, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/**
 * Cinturón "RAMATZO" dinámico: un campo de asteroides ámbar dispersos por un
 * gran volumen que, en un ciclo lento, CONVERGEN para formar la palabra
 * "RAMATZO" (legible desde el spawn, mirando hacia −Z), la mantienen unos
 * segundos y se dispersan de nuevo. Siempre hay deriva/twinkle, también cuando
 * la palabra está formada. Sobrio y cálido; brillo aditivo tasteful, sin neón.
 *
 * Mantiene la API previa (`object/update/rebase/dispose`). El `count` entrante
 * actúa como cota superior de densidad; el recuento real lo fija el muestreo de
 * glifos para garantizar legibilidad (es un landmark, no relleno ambiental).
 */
export function createRamatzoBelt(opts: RamatzoBeltOptions): RamatzoBelt {
  const { innerRadius, outerRadius } = opts;
  const maxPoints = opts.count ?? 240;

  const group = new THREE.Group();

  // ── Geometría/posición de la palabra ─────────────────────────────────────
  // Ancho de la palabra en unidades de mundo: amplio para leerse desde lejos.
  const wordWidth = (innerRadius + outerRadius) * 1.6; // p.ej. ~6240 u
  // Submuestreo de "RAMATZO" → objetivos de letra (unos cientos de puntos).
  const glyph = sampleWordPoints('RAMATZO', wordWidth, maxPoints);
  const count = Math.max(glyph.length, 60);

  // Plano de la palabra: centrado por delante del sistema y orientado para
  // verse de frente desde el spawn (z≈+2600 mirando a −Z). La colocamos algo
  // elevada y a media distancia, dentro del campo visible, sin tapar el sol.
  const c = opts.center ?? { x: 0, y: 900, z: -1800 };
  const wordCenter = new THREE.Vector3(c.x, c.y, c.z);
  group.position.copy(wordCenter);

  // ── Asteroides instanciados (roca) ────────────────────────────────────────
  const geometry = rockGeometry(7);
  const material = new THREE.MeshStandardMaterial({
    color: 0x7a6450,
    roughness: 0.92,
    metalness: 0.06,
    emissive: 0x3a2410, // brillo cálido tenue propio (visible a lo lejos)
    emissiveIntensity: 0.5,
    flatShading: true,
    fog: false, // landmark visible desde lejos (como el sol): la niebla no lo atenúa
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  group.add(mesh);

  // ── Halo aditivo: un punto de brillo por asteroide (sobrio) ──────────────
  const glowTex = createGlowTexture();
  const glowPositions = new Float32Array(count * 3);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
  const glowMat = new THREE.PointsMaterial({
    map: glowTex,
    color: 0xffc888,
    size: 90,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    opacity: 0.55,
  });
  const glow = new THREE.Points(glowGeo, glowMat);
  glow.frustumCulled = false;
  group.add(glow);

  // ── Parámetros por asteroide (precomputados; sin alocaciones en update) ───
  interface Param {
    // Posición "casa" dispersa (relativa al centro de la palabra).
    homeX: number;
    homeY: number;
    homeZ: number;
    // Objetivo en la palabra (relativo al centro de la palabra).
    targetX: number;
    targetY: number;
    targetZ: number;
    scale: number;
    spin: number;
    spinAxis: THREE.Vector3;
    // Deriva continua (lissajous lenta) para que "siempre se mueva".
    driftAmp: number;
    driftFreq: number;
    driftPhase: number;
    // Twinkle del halo.
    twinklePhase: number;
    twinkleFreq: number;
    baseGlow: number;
  }

  const params: Param[] = [];
  // Volumen de dispersión: mucho más grande que la palabra, para que estén
  // "muy separados" cuando el factor de ensamblado es 0.
  const spread = wordWidth * 0.9;
  for (let i = 0; i < count; i++) {
    const g = glyph[i % glyph.length]!;
    params.push({
      homeX: (Math.random() - 0.5) * spread * 2,
      homeY: (Math.random() - 0.5) * spread,
      homeZ: (Math.random() - 0.5) * spread * 1.4,
      targetX: g.x,
      targetY: g.y,
      targetZ: g.z,
      scale: 14 + Math.random() * 20,
      spin: (Math.random() - 0.5) * 0.5,
      spinAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
      driftAmp: 70 + Math.random() * 160,
      driftFreq: 0.05 + Math.random() * 0.12,
      driftPhase: Math.random() * Math.PI * 2,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleFreq: 0.6 + Math.random() * 1.6,
      baseGlow: 0.4 + Math.random() * 0.5,
    });
  }

  const dummy = new THREE.Object3D();
  const quat = new THREE.Quaternion();

  // Periodo del ciclo scatter→converge→hold→disperse (segundos). Lento: la
  // palabra aparece de tanto en tanto y se mantiene legible unos segundos.
  const PERIOD = 46;

  // Reutilizables (sin asignaciones por frame).
  let glowSum = 0;

  function frame(elapsed: number) {
    const a = assemblyFactor(elapsed, PERIOD); // 0 disperso … 1 ensamblado
    // Rotación lenta del conjunto: cuando está disperso gira un poco más; al
    // ensamblarse se "endereza" para que la palabra quede de frente (legible).
    group.rotation.y = (1 - a) * Math.sin(elapsed * 0.03) * 0.18;
    group.rotation.z = (1 - a) * Math.sin(elapsed * 0.021) * 0.06;

    glowSum = 0;
    for (let i = 0; i < count; i++) {
      const p = params[i]!;

      // Deriva continua (siempre en movimiento). Se atenúa cuando la palabra
      // está formada para no romper la legibilidad, pero nunca se anula del todo.
      const driftScale = p.driftAmp * (1 - a * 0.82);
      const dx = Math.sin(elapsed * p.driftFreq + p.driftPhase) * driftScale;
      const dy = Math.cos(elapsed * p.driftFreq * 0.8 + p.driftPhase) * driftScale * 0.7;
      const dz = Math.sin(elapsed * p.driftFreq * 1.2 + p.driftPhase * 1.3) * driftScale * 0.5;

      // Lerp casa↔objetivo según el factor de ensamblado.
      const x = p.homeX + (p.targetX - p.homeX) * a + dx;
      const y = p.homeY + (p.targetY - p.homeY) * a + dy;
      const z = p.homeZ + (p.targetZ - p.homeZ) * a + dz;

      dummy.position.set(x, y, z);
      quat.setFromAxisAngle(p.spinAxis, elapsed * p.spin);
      dummy.quaternion.copy(quat);
      // Los asteroides encogen un poco al ensamblarse para que la palabra se vea
      // nítida (trazos finos) y crecen al dispersarse (rocas sueltas mayores).
      dummy.scale.setScalar(p.scale * (1 - a * 0.35));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Halo en la misma posición.
      glowPositions[i * 3] = x;
      glowPositions[i * 3 + 1] = y;
      glowPositions[i * 3 + 2] = z;

      // Twinkle: parpadeo suave; el brillo medio sube cuando la palabra está
      // formada (más presencia como landmark), sin saturar.
      const tw = 0.55 + 0.45 * Math.sin(elapsed * p.twinkleFreq + p.twinklePhase);
      glowSum += p.baseGlow * tw;
    }
    mesh.instanceMatrix.needsUpdate = true;
    glowGeo.attributes['position']!.needsUpdate = true;

    // Opacidad global del halo: media de twinkle, realzada al ensamblarse.
    const meanGlow = glowSum / count;
    glowMat.opacity = Math.min(0.85, (0.32 + 0.5 * a) * (0.7 + 0.6 * meanGlow));
    // El emisivo de la roca también sube un poco con la palabra formada.
    material.emissiveIntensity = 0.4 + 0.45 * a;
  }

  // Posición inicial.
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
      glowGeo.dispose();
      glowMat.dispose();
      glowTex.dispose();
    },
  };
}
