import * as THREE from 'three';
import { planetArchetype, Archetype } from './planet-archetype';

/**
 * Planeta procedural. El ARQUETIPO (terrestre, desértico, helado, volcánico,
 * gigante gaseoso, lunar) se elige de forma DETERMINISTA a partir de `seed`
 * (ver `planet-archetype.ts`), de modo que cada planeta del sistema luce
 * claramente distinto. `baseColor` (color de categoría de la app) se usa como
 * TINTE/acento sutil — borde de atmósfera o matiz de bandas — pero el arquetipo
 * domina la identidad. El shader reutiliza el mismo hash/noise/fbm + fresnel
 * conocido-bueno; solo se ramifica el sombreado de superficie por arquetipo.
 *
 * Mantiene la firma y un uniform `uTime` (solar-system lo anima por frame); la
 * rotación la maneja solar-system (no rotar aquí).
 */
export function createPlanet(radius: number, seed: number, baseColor: number): THREE.Mesh {
  const archetype = planetArchetype(seed);
  const geometry = new THREE.SphereGeometry(radius, 64, 44);

  const tint = new THREE.Color(baseColor);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: (Math.abs(seed) % 1000) * 0.137 },
      uArch: { value: archetype },
      uTint: { value: tint },
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
      uniform int uArch;
      uniform vec3 uTint;
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

      // Cráteres sutiles: campo de "hoyos" suaves a partir de ruido umbralizado.
      float craters(vec3 p) {
        float n = fbm(p * 3.0);
        float c = smoothstep(0.62, 0.48, n); // hoyos donde n es bajo
        return c;
      }

      // ── Arquetipo 0: Terrestre (océano/tierra/hielo + nubes + atmósfera) ──
      vec3 shadeTerrestrial(vec3 dir, vec3 sp, float lat, out vec3 atmo, out float atmoStr) {
        vec3 ocean = vec3(0.122, 0.373, 0.659);
        vec3 oceanDeep = vec3(0.039, 0.173, 0.333);
        vec3 landLow = vec3(0.184, 0.478, 0.212);
        vec3 landHigh = vec3(0.478, 0.353, 0.196);
        vec3 ice = vec3(0.933, 0.957, 1.0);
        float cont = fbm(sp);
        vec3 col;
        if (cont < 0.5) {
          col = mix(oceanDeep, ocean, smoothstep(0.25, 0.5, cont));
        } else {
          float l = (cont - 0.5) / 0.5;
          col = mix(landLow, landHigh, smoothstep(0.25, 0.95, l));
        }
        float iceM = smoothstep(0.74, 0.92, lat + cont * 0.08);
        col = mix(col, ice, iceM);
        float cl = fbm(sp * 1.6 + vec3(uTime * 0.015, 0.0, 0.0));
        col = mix(col, vec3(1.0), smoothstep(0.55, 0.78, cl) * 0.55);
        atmo = vec3(0.227, 0.471, 0.784);
        atmoStr = 0.5;
        return col;
      }

      // ── Arquetipo 1: Desértico/rocoso (ocres, marrones, dunas/cráteres) ──
      vec3 shadeDesert(vec3 dir, vec3 sp, float lat, out vec3 atmo, out float atmoStr) {
        vec3 sand = vec3(0.706, 0.518, 0.298);
        vec3 ochre = vec3(0.545, 0.353, 0.180);
        vec3 rock = vec3(0.345, 0.235, 0.157);
        float dunes = fbm(sp * 1.3);
        vec3 col = mix(rock, ochre, smoothstep(0.3, 0.55, dunes));
        col = mix(col, sand, smoothstep(0.55, 0.85, dunes));
        // Bandas finas de dunas en latitud.
        float band = 0.5 + 0.5 * sin(dir.y * 22.0 + fbm(sp * 2.0) * 4.0);
        col *= 0.9 + 0.1 * band;
        // Cráteres sutiles oscurecen.
        col *= 1.0 - craters(sp) * 0.35;
        atmo = vec3(0.706, 0.451, 0.235);
        atmoStr = 0.28;
        return col;
      }

      // ── Arquetipo 2: Helado (blancos/azul pálido, grietas) ──
      vec3 shadeIce(vec3 dir, vec3 sp, float lat, out vec3 atmo, out float atmoStr) {
        vec3 snow = vec3(0.886, 0.929, 0.973);
        vec3 paleBlue = vec3(0.643, 0.769, 0.871);
        vec3 deepBlue = vec3(0.388, 0.553, 0.706);
        float f = fbm(sp * 1.1);
        vec3 col = mix(paleBlue, snow, smoothstep(0.4, 0.7, f));
        col = mix(deepBlue, col, smoothstep(0.18, 0.4, f));
        // Grietas: líneas finas de ruido absoluto cercano a cero.
        float crackN = fbm(sp * 4.0 + 7.3);
        float crack = smoothstep(0.04, 0.0, abs(crackN - 0.5));
        col = mix(col, deepBlue * 0.7, crack * 0.6);
        atmo = vec3(0.580, 0.745, 0.902);
        atmoStr = 0.42;
        return col;
      }

      // ── Arquetipo 3: Volcánico (basalto oscuro + vetas de magma emisivas) ──
      vec3 shadeVolcanic(vec3 dir, vec3 sp, float lat, out vec3 atmo, out float atmoStr) {
        vec3 basalt = vec3(0.090, 0.078, 0.082);
        vec3 basaltHi = vec3(0.196, 0.176, 0.169);
        vec3 magma = vec3(0.902, 0.439, 0.118); // ámbar cálido
        vec3 magmaHot = vec3(1.0, 0.737, 0.314);
        float rock = fbm(sp * 1.4);
        vec3 col = mix(basalt, basaltHi, smoothstep(0.35, 0.7, rock));
        // Vetas de magma: ruido en deriva lenta umbralizado en finas líneas.
        float veinN = fbm(sp * 2.6 + vec3(0.0, uTime * 0.01, 0.0));
        float vein = smoothstep(0.5, 0.62, veinN) * (1.0 - smoothstep(0.62, 0.78, veinN));
        float pulse = 0.85 + 0.15 * sin(uTime * 0.8 + veinN * 6.2831);
        vec3 glow = mix(magma, magmaHot, smoothstep(0.55, 0.7, veinN)) * vein * pulse;
        col += glow * 1.4; // brillo controlado: las vetas destacan sin saturar la esfera
        atmo = vec3(0.784, 0.314, 0.118);
        atmoStr = 0.30;
        return col;
      }

      // ── Arquetipo 4: Gigante gaseoso (bandas de nubes en deriva) ──
      vec3 shadeGasGiant(vec3 dir, vec3 sp, float lat, out vec3 atmo, out float atmoStr) {
        // Tonalidades derivadas del tinte (categoría) para variar entre gigantes.
        vec3 baseA = mix(vec3(0.55, 0.47, 0.36), uTint, 0.35);
        vec3 baseB = baseA * 0.62;
        vec3 highlight = mix(baseA, vec3(1.0), 0.35);
        // Latitud distorsionada por turbulencia → bandas onduladas en deriva.
        float turb = fbm(sp * vec3(2.5, 1.0, 2.5) + vec3(uTime * 0.02, 0.0, 0.0)) * 0.18;
        float bands = 0.5 + 0.5 * sin(dir.y * 9.0 + turb * 18.0);
        vec3 col = mix(baseB, baseA, bands);
        // Cinturones claros y un "óvalo" tipo tormenta.
        col = mix(col, highlight, smoothstep(0.82, 0.97, bands) * 0.6);
        float storm = smoothstep(0.86, 0.93, fbm(sp * 1.8 + vec3(uTime * 0.01, 0.0, 0.0)));
        col = mix(col, highlight * 0.9, storm * 0.5);
        atmo = mix(baseA, vec3(1.0), 0.2);
        atmoStr = 0.45;
        return col;
      }

      // ── Arquetipo 5: Lunar/baldío (gris, cráteres, sin atmósfera) ──
      vec3 shadeBarren(vec3 dir, vec3 sp, float lat, out vec3 atmo, out float atmoStr) {
        vec3 dark = vec3(0.196, 0.196, 0.208);
        vec3 light = vec3(0.494, 0.494, 0.510);
        float f = fbm(sp * 1.6);
        vec3 col = mix(dark, light, smoothstep(0.3, 0.7, f));
        // Cráteres marcados (con borde claro) y "maria" oscuros.
        float cr = craters(sp * 1.2);
        col *= 1.0 - cr * 0.55;
        float maria = smoothstep(0.62, 0.42, fbm(sp * 0.7));
        col = mix(col, dark * 0.8, maria * 0.5);
        atmo = vec3(0.0);
        atmoStr = 0.0; // sin atmósfera
        return col;
      }

      void main() {
        vec3 dir = normalize(vPos);
        vec3 sp = dir * 2.2 + uSeed;
        float lat = abs(dir.y);

        vec3 atmo = vec3(0.0);
        float atmoStr = 0.0;
        vec3 col;

        if (uArch == ${Archetype.Desert}) {
          col = shadeDesert(dir, sp, lat, atmo, atmoStr);
        } else if (uArch == ${Archetype.Ice}) {
          col = shadeIce(dir, sp, lat, atmo, atmoStr);
        } else if (uArch == ${Archetype.Volcanic}) {
          col = shadeVolcanic(dir, sp, lat, atmo, atmoStr);
        } else if (uArch == ${Archetype.GasGiant}) {
          col = shadeGasGiant(dir, sp, lat, atmo, atmoStr);
        } else if (uArch == ${Archetype.Barren}) {
          col = shadeBarren(dir, sp, lat, atmo, atmoStr);
        } else {
          col = shadeTerrestrial(dir, sp, lat, atmo, atmoStr);
        }

        // Iluminación direccional (común a todos los arquetipos).
        vec3 lightDir = normalize(vec3(0.6, 0.45, 0.7));
        float diff = max(0.0, dot(vNormalV, lightDir)) * 0.85 + 0.18;
        col *= diff;

        // Atmósfera (fresnel en el borde). El tinte de categoría matiza el halo.
        float rim = pow(1.0 - abs(vNormalV.z), 3.0);
        vec3 atmoCol = mix(atmo, uTint, 0.25);
        col += atmoCol * rim * atmoStr;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  return new THREE.Mesh(geometry, material);
}
