import * as THREE from 'three';
import { STAR_FIELD_CONFIG as CFG } from './space-config';
import { buildStarSeeds } from './layout';

/**
 * Fábrica del campo de estrellas como HACES de luz (cruz de 4 puntas con
 * parpadeo independiente por estrella). Sprites GPU (`THREE.Points`) con un
 * `ShaderMaterial` singleton compartido (un solo `uTime` que el motor actualiza
 * una vez por frame); `chunks.ts` lo reutiliza para cada celda del grid.
 *
 * Cada estrella lleva un atributo `aSeed` ∈ [0,1) del que el shader deriva la
 * rotación de la cruz, la fase y la velocidad del parpadeo. La forma y el
 * parpadeo se afinan desde `STAR_FIELD_CONFIG` (space-config.ts).
 */

let sharedMaterial: THREE.ShaderMaterial | null = null;

/** Formatea un número como literal float de GLSL (evita ruido de coma flotante). */
function glf(n: number): string {
  const v = Number(n.toPrecision(7));
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

export function getStarGasMaterial(renderer: THREE.WebGLRenderer): THREE.ShaderMaterial {
  if (sharedMaterial) return sharedMaterial;
  sharedMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: renderer.getPixelRatio() },
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute float size;
      attribute vec3 color;
      attribute float aSeed;
      varying vec3 vColor;
      varying float vRot;
      varying float vPhase;
      varying float vSpeed;
      uniform float uPixelRatio;
      float hash(float n) { return fract(sin(n) * 43758.5453123); }
      void main() {
        vColor = color;
        vRot = aSeed * 6.2831853;
        vPhase = hash(aSeed * 1.7) * 6.2831853;
        vSpeed = ${glf(CFG.flickerSpeedMin)} + hash(aSeed * 3.1) * ${glf(CFG.flickerSpeedMax - CFG.flickerSpeedMin)};
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio * (80.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vRot;
      varying float vPhase;
      varying float vSpeed;
      uniform float uTime;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float c = cos(vRot), s = sin(vRot);
        vec2 r = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
        float d = length(uv);
        float core = exp(-d * ${glf(CFG.coreFalloff)});
        float spikeH = exp(-abs(r.y) * ${glf(CFG.spikeAcross)}) * exp(-abs(r.x) * ${glf(CFG.spikeAlong)});
        float spikeV = exp(-abs(r.x) * ${glf(CFG.spikeAcross)}) * exp(-abs(r.y) * ${glf(CFG.spikeAlong)});
        float beam = core + (spikeH + spikeV) * ${glf(CFG.spikeIntensity)};
        float flicker = ${glf(CFG.flickerBase)} + ${glf(CFG.flickerAmplitude)} * sin(uTime * vSpeed + vPhase);
        vec3 color = mix(vColor * 0.5, vColor * 1.25, core) * flicker;
        gl_FragColor = vec4(color, clamp(beam, 0.0, 1.0) * ${glf(CFG.baseAlpha)} * flicker);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return sharedMaterial;
}

export function setStarGasTime(t: number) {
  if (sharedMaterial) sharedMaterial.uniforms['uTime']!.value = t;
}

export function disposeStarGasMaterial() {
  sharedMaterial?.dispose();
  sharedMaterial = null;
}

export interface StarFieldOptions {
  count: number;
  sizeBounds: [number, number];
  box: { min: [number, number, number]; max: [number, number, number] };
  rng: () => number;
}

/** Construye la geometría de un campo de estrellas con posiciones/colores/tamaños/semillas sembrados. */
export function buildStarFieldGeometry(opts: StarFieldOptions): THREE.BufferGeometry {
  const { count, sizeBounds, box, rng } = opts;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const c = new THREE.Color();
  const [cream, amber, red] = CFG.palette;
  const [tCream, tAmber] = CFG.paletteThresholds;

  for (let i = 0; i < count; i++) {
    positions[i * 3] = box.min[0] + rng() * (box.max[0] - box.min[0]);
    positions[i * 3 + 1] = box.min[1] + rng() * (box.max[1] - box.min[1]);
    positions[i * 3 + 2] = box.min[2] + rng() * (box.max[2] - box.min[2]);

    const t = rng();
    c.setHex(t < tCream! ? cream! : t < tAmber! ? amber! : red!);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    sizes[i] = sizeBounds[0] + rng() * (sizeBounds[1] - sizeBounds[0]);
  }

  const seeds = buildStarSeeds(count, rng);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  return g;
}

/** Conveniencia: geometría + material compartido en un Points. */
export function createStarField(renderer: THREE.WebGLRenderer, opts: StarFieldOptions): THREE.Points {
  return new THREE.Points(buildStarFieldGeometry(opts), getStarGasMaterial(renderer));
}
