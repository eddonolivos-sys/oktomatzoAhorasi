import * as THREE from 'three';
import type { AppInfo } from '../services/protocol';
import { createPlanet } from './planet';
import { seededRng } from './layout';

export interface ConstellationLayout {
  position: THREE.Vector3;
  color: number;
}

interface Star {
  x: number;
  y: number;
  z: number;
  size: number;
  phase: number;
}

export interface ConstellationUserData {
  app: AppInfo;
  points: THREE.Points;
  planets: THREE.Mesh[];
  mat: THREE.ShaderMaterial;
  lineMat: THREE.LineBasicMaterial;
}

function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h || 1;
}

function createGlowTexture(color: THREE.Color): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  const r = (color.r * 255) | 0;
  const g = (color.g * 255) | 0;
  const b = (color.b * 255) | 0;
  grad.addColorStop(0, `rgba(${r},${g},${b},0.3)`);
  grad.addColorStop(0.3, `rgba(${r},${g},${b},0.1)`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Constelación individual (THREE.Group): estrellas (shader de gas), líneas de
 * conexión, nebulosa (sprite) y 1-2 planetas de magma orbitando. El raycaster
 * usa `userData.points`; las órbitas/uTime se animan desde ConstellationManager.
 */
export function createConstellation(
  app: AppInfo,
  layout: ConstellationLayout,
  renderer: THREE.WebGLRenderer,
): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(layout.position);

  const seed = seedFromId(app.id);
  const rng = seededRng(seed);
  const starCount = 10 + Math.floor(rng() * 8);

  const stars: Star[] = [];
  for (let i = 0; i < starCount; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 1.5 + rng() * 3.5;
    stars.push({
      x: Math.cos(angle) * radius + (rng() - 0.5) * 1.5,
      y: Math.sin(angle) * radius * 0.6 + (rng() - 0.5) * 1.5,
      z: (rng() - 0.5) * 0.8,
      size: 0.3 + rng() * 0.7,
      phase: rng() * Math.PI * 2,
    });
  }
  // Estrella central más grande y brillante.
  const central = stars[0]!;
  central.size = 3.0;
  central.x = 0;
  central.y = 0;
  central.z = 0;

  const positions = new Float32Array(stars.flatMap((p) => [p.x, p.y, p.z]));
  const sizes = new Float32Array(stars.map((p) => p.size));

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const color = new THREE.Color(layout.color);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: `
      attribute float size;
      uniform float uPixelRatio;
      varying vec3 vColor;
      void main() {
        vColor = vec3(1.0);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio * (100.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec3 vColor;
      void main() {
        vec2 center = vec2(0.5);
        float dist = distance(gl_PointCoord, center);
        float alpha = 1.0 - smoothstep(0.1, 0.6, dist);
        float core = exp(-dist * 18.0);
        float pulse = 0.85 + 0.15 * sin(uTime * 0.8 + dist * 8.0);
        vec3 col = mix(uColor * 0.3, uColor * 1.3, core) * pulse;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geom, mat);
  group.add(points);

  // Líneas de conexión entre estrellas cercanas.
  const linePositions: number[] = [];
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const a = stars[i]!;
      const b = stars[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 4) {
        linePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
  }
  const lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: layout.color,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
  });
  group.add(new THREE.LineSegments(lineGeom, lineMat));

  // Nebulosa circundante (sprite con textura radial procedural).
  const glowMat = new THREE.SpriteMaterial({
    map: createGlowTexture(color),
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(28, 20, 1);
  group.add(glow);

  // 1-2 planetas orbitando.
  const planetCount = 1 + Math.floor(rng() * 2);
  const planets: THREE.Mesh[] = [];
  for (let i = 0; i < planetCount; i++) {
    const planet = createPlanet(900 + rng() * 1300, seed + i + 1, layout.color);
    const orbitRadius = 2800 + i * 4500 + rng() * 1500;
    const orbitSpeed = 0.01 + rng() * 0.03;
    const orbitOffset = rng() * Math.PI * 2;
    planet.position.set(orbitRadius * Math.cos(orbitOffset), 0, orbitRadius * Math.sin(orbitOffset));
    planet.userData = { orbitRadius, orbitSpeed, orbitOffset };
    group.add(planet);
    planets.push(planet);
  }

  const userData: ConstellationUserData = { app, points, planets, mat, lineMat };
  group.userData = userData;
  return group;
}
