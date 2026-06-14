import * as THREE from 'three';

/**
 * Fábrica de campos de estrellas tipo gas (shader difuso, bordes suaves).
 * El material es un singleton compartido (un solo `uTime` que el motor actualiza
 * una vez por frame); `chunks.ts` lo usa para cada celda del grid.
 */

let sharedMaterial: THREE.ShaderMaterial | null = null;

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
      varying vec3 vColor;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio * (80.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      uniform float uTime;
      void main() {
        vec2 center = vec2(0.5);
        float dist = distance(gl_PointCoord, center);
        float alpha = 1.0 - smoothstep(0.2, 0.7, dist);
        float core = exp(-dist * 15.0);
        float pulse = 0.85 + 0.15 * sin(uTime * 0.5 + dist * 10.0);
        vec3 color = mix(vColor * 0.4, vColor * 1.2, core) * pulse;
        gl_FragColor = vec4(color, alpha * 0.85);
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

const PALETTE = [0xffe4c4, 0xff8c42, 0xd43a1a] as const;

export interface StarFieldOptions {
  count: number;
  sizeBounds: [number, number];
  box: { min: [number, number, number]; max: [number, number, number] };
  rng: () => number;
}

/** Construye la geometría de un campo de estrellas con posiciones/colores/tamaños sembrados. */
export function buildStarFieldGeometry(opts: StarFieldOptions): THREE.BufferGeometry {
  const { count, sizeBounds, box, rng } = opts;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    positions[i * 3] = box.min[0] + rng() * (box.max[0] - box.min[0]);
    positions[i * 3 + 1] = box.min[1] + rng() * (box.max[1] - box.min[1]);
    positions[i * 3 + 2] = box.min[2] + rng() * (box.max[2] - box.min[2]);

    const t = rng();
    c.setHex(t < 0.6 ? PALETTE[0] : t < 0.8 ? PALETTE[1] : PALETTE[2]);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    sizes[i] = sizeBounds[0] + rng() * (sizeBounds[1] - sizeBounds[0]);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  return g;
}

/** Conveniencia: geometría + material compartido en un Points. */
export function createStarField(renderer: THREE.WebGLRenderer, opts: StarFieldOptions): THREE.Points {
  return new THREE.Points(buildStarFieldGeometry(opts), getStarGasMaterial(renderer));
}
