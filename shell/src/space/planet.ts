import * as THREE from 'three';

/**
 * Planeta tipo Tierra: esfera lisa de alto detalle + shader procedural con
 * continentes (océano azul, tierra verde, montañas marrones), casquetes polares
 * blancos, nubes y atmósfera (borde fresnel). `seed` varía los continentes.
 */
export function createPlanet(radius: number, seed: number, baseColor: number): THREE.Mesh {
  void baseColor;
  const geometry = new THREE.SphereGeometry(radius, 64, 44);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: (Math.abs(seed) % 1000) * 0.137 },
      uOcean: { value: new THREE.Color(0x1f5fa8) },
      uOceanDeep: { value: new THREE.Color(0x0a2c55) },
      uLandLow: { value: new THREE.Color(0x2f7a36) },
      uLandHigh: { value: new THREE.Color(0x7a5a32) },
      uIce: { value: new THREE.Color(0xeef4ff) },
      uAtmo: { value: new THREE.Color(0x3a78c8) },
    },
    vertexShader: `
      varying vec3 vPos;
      varying vec3 vNormalV;
      void main() {
        vPos = position;
        vNormalV = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uSeed;
      uniform vec3 uOcean;
      uniform vec3 uOceanDeep;
      uniform vec3 uLandLow;
      uniform vec3 uLandHigh;
      uniform vec3 uIce;
      uniform vec3 uAtmo;
      varying vec3 vPos;
      varying vec3 vNormalV;

      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.5432))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }
      float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; } return v; }

      void main() {
        vec3 dir = normalize(vPos);
        vec3 sp = dir * 2.2 + uSeed;
        float cont = fbm(sp);
        float lat = abs(dir.y);

        vec3 col;
        if (cont < 0.5) {
          col = mix(uOceanDeep, uOcean, smoothstep(0.25, 0.5, cont));
        } else {
          float l = (cont - 0.5) / 0.5;
          col = mix(uLandLow, uLandHigh, smoothstep(0.25, 0.95, l));
        }

        // Casquetes polares
        float ice = smoothstep(0.74, 0.92, lat + cont * 0.08);
        col = mix(col, uIce, ice);

        // Nubes (capa de ruido en deriva)
        float cl = fbm(sp * 1.6 + vec3(uTime * 0.015, 0.0, 0.0));
        col = mix(col, vec3(1.0), smoothstep(0.55, 0.78, cl) * 0.55);

        // Iluminación
        vec3 lightDir = normalize(vec3(0.6, 0.45, 0.7));
        float diff = max(0.0, dot(vNormalV, lightDir)) * 0.85 + 0.18;
        col *= diff;

        // Atmósfera (fresnel en el borde)
        float rim = pow(1.0 - abs(vNormalV.z), 3.0);
        col += uAtmo * rim * 0.5;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  return new THREE.Mesh(geometry, material);
}
