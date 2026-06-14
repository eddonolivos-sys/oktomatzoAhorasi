import * as THREE from 'three';
import { seededRng } from './layout';

/**
 * Planeta irregular con shader de magma (negro carbón -> oxidado -> color base -> lava).
 * Esfera deformada por ruido sembrado; LOD por tamaño. El llamador asigna userData
 * de órbita. El uniform `uTime` se anima desde el gestor de constelaciones.
 */
export function createPlanet(radius: number, seed: number, baseColor: number): THREE.Mesh {
  const detail = radius < 4 ? 16 : 32;
  const geometry = new THREE.SphereGeometry(radius, detail, detail);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const rng = seededRng(seed);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const noise = (rng() - 0.5) * radius * 0.3;
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    const scale = 1 + noise / len;
    positions.setXYZ(i, x * scale, y * scale, z * scale);
  }
  geometry.computeVertexNormals();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color(0x1a0a00) },
      uColor2: { value: new THREE.Color(0x5a2a10) },
      uColor3: { value: new THREE.Color(baseColor) },
      uColor4: { value: new THREE.Color(0xd4602a) },
    },
    vertexShader: `
      varying vec3 vPosition;
      varying vec3 vNormal;
      void main() {
        vPosition = position;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uColor3;
      uniform vec3 uColor4;
      uniform float uTime;
      varying vec3 vPosition;
      varying vec3 vNormal;

      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(12.9898, 78.233, 45.5432))) * 43758.5453);
      }
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
              mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
              mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }

      void main() {
        vec3 pos = vPosition * 0.3;
        float n = noise(pos + uTime * 0.02);
        float n2 = noise(pos * 2.0 + uTime * 0.03);
        float height = n * 0.7 + n2 * 0.3;

        vec3 color;
        if (height < 0.3) color = mix(uColor1, uColor2, height / 0.3);
        else if (height < 0.6) color = mix(uColor2, uColor3, (height - 0.3) / 0.3);
        else color = mix(uColor3, uColor4, (height - 0.6) / 0.4);

        float fissure = smoothstep(0.65, 0.8, n2);
        color += fissure * uColor4 * 0.5;

        vec3 light = normalize(vec3(1.0, 1.0, 0.5));
        float diff = max(0.0, dot(vNormal, light)) * 0.7 + 0.3;
        color *= diff;

        float glow = smoothstep(0.7, 0.9, n);
        color += glow * uColor4 * 0.15;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
