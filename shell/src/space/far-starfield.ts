import * as THREE from 'three';

export interface FarStarfield {
  object: THREE.Points;
  update(elapsed: number): void;
  dispose(): void;
}

/**
 * Capa de estrellas lejanas FIJA (anclada al origen del mundo). No sigue al
 * jugador ni rebasa: es la referencia absoluta de movimiento. Estrellas frias
 * con acentos ambar muy tenues, distribucion esferica hueca a gran radio, sin
 * pulso ni neon. Rota imperceptiblemente para sensacion de profundidad.
 */
export function createFarStarfield(renderer: THREE.WebGLRenderer): FarStarfield {
  const count = 700; // densidad reducida para menos saturación visual
  const inner = 18000;
  const outer = 26000;

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  const cool = new THREE.Color(0xcdd6e6);
  const warm = new THREE.Color(0xffd9a8);
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    // Punto aleatorio sobre una cascara esferica (distribucion uniforme).
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r = inner + Math.random() * (outer - inner);
    const s = Math.sqrt(1 - u * u);
    positions[i * 3] = r * s * Math.cos(theta);
    positions[i * 3 + 1] = r * u;
    positions[i * 3 + 2] = r * s * Math.sin(theta);

    // Mayoria frias, una minoria con tinte ambar tenue (sobrio).
    tmp.copy(Math.random() < 0.16 ? warm : cool);
    const dim = 0.55 + Math.random() * 0.45;
    colors[i * 3] = tmp.r * dim;
    colors[i * 3 + 1] = tmp.g * dim;
    colors[i * 3 + 2] = tmp.b * dim;

    sizes[i] = 1.0 + Math.random() * 2.4;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float d = distance(gl_PointCoord, vec2(0.5));
        float alpha = 1.0 - smoothstep(0.1, 0.5, d);
        gl_FragColor = vec4(vColor, alpha * 0.85);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });

  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = -1; // detras de todo

  return {
    object,
    update(elapsed) {
      object.rotation.y = elapsed * 0.0006;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
