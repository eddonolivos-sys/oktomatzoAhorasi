import * as THREE from 'three';
import { parallaxOffset } from './parallax';

/**
 * Fraccion de seguimiento de la galaxia al jugador. Pequena (~6%) para que el
 * backdrop se desplace lento respecto a la nave (parallax visible) sin que la
 * nave llegue nunca a "alcanzarlo". 0 = totalmente fija; 1 = pegada (bug previo).
 */
const GALAXY_PARALLAX = 0.06;

export interface Galaxy {
  object: THREE.Points;
  update(elapsed: number, delta: number, playerPos: THREE.Vector3): void;
  dispose(): void;
}

/**
 * Galaxia espiral de fondo (4 brazos, shader de gas difuso).
 * Backdrop lejano: rota lento y sigue al jugador solo a una fraccion pequena
 * (parallax) para que el avance sea visible sin que la nave la "alcance".
 * Densidad reducida (~50%) para menos saturación visual y mejor rendimiento.
 */
export function createGalaxy(renderer: THREE.WebGLRenderer): Galaxy {
  const count = 2000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  const colorCenter = new THREE.Color(0xff8c42);
  const colorEdge = new THREE.Color(0x3a2010);
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const arm = Math.floor(Math.random() * 4);
    const angleOffset = (arm / 4) * Math.PI * 2;
    const radius = 80 + Math.random() * 250;
    const angle = radius * 0.015 + angleOffset + (Math.random() - 0.5) * 0.4;
    const scatter = (Math.random() - 0.5) * 8;

    positions[i * 3] = Math.cos(angle) * radius + scatter;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 3;
    positions[i * 3 + 2] = Math.sin(angle) * radius + scatter;

    const t = Math.min(1, radius / 350);
    tmp.lerpColors(colorCenter, colorEdge, t);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;

    sizes[i] = 0.4 + Math.random() * 1.8;
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
        gl_PointSize = size * uPixelRatio * (120.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 center = vec2(0.5);
        float dist = distance(gl_PointCoord, center);
        float alpha = 1.0 - smoothstep(0.15, 0.55, dist);
        float core = exp(-dist * 12.0);
        vec3 color = mix(vColor * 0.6, vColor + vec3(0.3, 0.15, 0.05), core);
        gl_FragColor = vec4(color, alpha * 0.9);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const object = new THREE.Points(geometry, material);
  object.position.y = -20;
  object.frustumCulled = false;

  return {
    object,
    update(elapsed, delta, playerPos) {
      object.rotation.y += delta * 0.008;
      object.rotation.x = Math.sin(elapsed * 0.003) * 0.05;
      // Parallax: el backdrop sigue al jugador solo a una fraccion pequena, de
      // modo que la nave avanza visiblemente respecto a el (fix galaxy.ts:88).
      const o = parallaxOffset({ x: playerPos.x, y: playerPos.y, z: playerPos.z }, GALAXY_PARALLAX);
      object.position.set(o.x, o.y - 20, o.z);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
