# Ramatzo Constellation OS — Plan de Diseno Espacial v2

> **Documento de especificacion conceptual y tecnica para la refactorizacion visual de la plataforma Ramatzo hacia una experiencia espacial inmersiva con navegacion WASD, naves geometricas y estetica naranja medieval.**

---

## Indice

1.  [Resumen Ejecutivo](#1-resumen-ejecutivo)
2.  [Experiencia de Usuario (UX Flow)](#2-experiencia-de-usuario-ux-flow)
3.  [Sistema de Navegacion WASD](#3-sistema-de-navegacion-wasd)
4.  [Arquitectura Tecnica](#4-arquitectura-tecnica)
5.  [Sistema de Componentes](#5-sistema-de-componentes)
6.  [Naves Espaciales Prefabricadas](#6-naves-espaciales-prefabricadas)
7.  [Planetas y Constelaciones](#7-planetas-y-constelaciones)
8.  [Galaxia y Efectos Visuales](#8-galaxia-y-efectos-visuales)
9.  [Radar 3D en Tiempo Real](#9-radar-3d-en-tiempo-real)
10. [Vista Cabina (Cockpit View)](#10-vista-cabina-cockpit-view)
11. [Sistema de Chunks y Rendimiento](#11-sistema-de-chunks-y-rendimiento)
12. [Paleta Visual](#12-paleta-visual)
13. [Desafios Tecnicos y Soluciones](#13-desafios-tecnicos-y-soluciones)
14. [Plan de Implementacion por Fases](#14-plan-de-implementacion-por-fases)

---

## 1. Resumen Ejecutivo

### Estado Actual
Plataforma orquestadora con shell en Lit (web components), 7 modulos embebidos via iframe con tecnologias dispares (React, Three.js, CesiumJS, Next.js, vanilla TS). Autenticacion JWT con backend Go.

### Vision
Transformar el dashboard en un **espacio 3D navegable con WASD** donde el usuario pilota una nave espacial geometrica. Los modulos son **constelaciones con planetas** distribuidos en un vasto espacio. Al acercarse a una constelacion y hacer clic, la vista transiciona a la **cabina de la nave** donde el modulo se muestra en pantallas holograficas.

### Principios de Diseno

| Principio | Descripcion |
|-----------|-------------|
| **Navegacion libre** | WASD + Space nitro, sin scroll, sin teletransporte |
| **Inmersion total** | Mundo 3D continuo, la UI es parte del mundo |
| **Cabina fisica** | Los proyectos se ven desde la nave, no en paneles flotantes |
| **Escala epica** | Planetas enormes, distancias reales, sensacion de inmensidad |
| **Realismo cinematografico** | Fuego, gas, magma con shaders, no particulas simples |
| **Paleta naranja medieval** | Tonos calidos, ambar, oxidados. Nada de neon saturado |

---

## 2. Experiencia de Usuario (UX Flow)

### 2.1 Login Dashboard (Transicion "Ignicion")

```
Pantalla de Login (refinada, tonos naranja/ambar)
       |
       v  Usuario ingresa credenciales
       |
       v  Efecto IGNICION (2.0s):
          +-----------------------------------------+
          | 1. Pantalla se oscurece desde bordes   |
          | 2. Particulas de fuego ascienden        |
          | 3. Ruido de motor (vibracion CSS)       |
          | 4. Disolve a: interior de la nave       |
          |    (vista desde la cabina al espacio)   |
          +-----------------------------------------+
       |
       v  Cabina de la Nave (vista interior)
          - Panel de instrumentos visible abajo
          - Ventanal frontal muestra el espacio
          - Radar en esquina superior izquierda
          - HUD con coordenadas, velocidad, combustible
```

### 2.2 Exploracion del Espacio (WASD)

```
El usuario esta en la cabina mirando al espacio.

  W = Acelerar hacia adelante (en direccion de la mira)
  A = Girar nave a la izquierda
  S = Retroceder / Desacelerar
  D = Girar nave a la derecha
  SPACE = Nitro (aceleracion x3, efecto de estela intenso)

  Sin scroll, sin salto de pagina con espacio.
  Pointer Lock API para control de camara con mouse.

       |
       v  Al navegar, el radar 3D se actualiza en tiempo real
       v  Las constelaciones se acercan/alejan con movimiento natural
       v  Los planetas orbitan lentamente, visibles desde lejos
       v  Chunks se cargan/descargan segun distancia
```

### 2.3 Encuentro con Constelacion

```
Mientras navega, el usuario ve:

  - Una CONSTELACION: grupo de estrellas conectadas
  - 1-2 PLANETAS IRREGULARES orbitando alrededor
  - Efecto de gas/fuego en la nebulosa circundante
  - La constelacion brilla mas al acercarse

       |
       v  Al hacer CLIC en la constelacion:
       |
       v  TRANSICION (1.0s):
          1. Zoom automatico hacia la constelacion
          2. La nave se orienta hacia el planeta principal
          3. El radar se desvanece
          4. Aparece OVERLAY con info del proyecto:
             - Nombre, descripcion, categoria, version
             - Boton "INGRESAR" con glow anaranjado
       |
       v  Al hacer clic en "INGRESAR":
       |
       v  TRANSICION A CABINA (1.5s):
          1. La camara se mueve al interior de la nave
          2. Las pantallas de la cabina se encienden
          3. El modulo se renderiza en la pantalla central
          4. Controles de navegacion secundarios aparecen
          5. El iframe del modulo se carga en la pantalla
```

### 2.4 Visualizacion del Proyecto (Cockpit View)

```
Vista de la cabina con el proyecto cargado:

  +----------------------------------------------+
  |  [VOLVER]  [MAPA]                    [AJUSTES]|
  |                                               |
  |  +----------------------------------------+  |
  |  |                                        |  |
  |  |      PANTALLA PRINCIPAL                |  |
  |  |      (iframe del modulo, sin cambios)  |  |
  |  |                                        |  |
  |  |      El modulo se ve exactamente        |  |
  |  |      igual que antes                    |  |
  |  |                                        |  |
  |  +----------------------------------------+  |
  |                                               |
  |  [PANEL DE CONTROL]  [SISTEMAS]  [COMUNICACION]|
  +----------------------------------------------+

  - El iframe mantiene su comportamiento original
  - La nave rotara lentamente en orbita estacionaria
  - El usuario puede hacer clic en "VOLVER" para salir al espacio
  - Al salir, la nave se aleja de la constelacion
```

---

## 3. Sistema de Navegacion WASD

### 3.1 Controles

| Tecla | Accion | Detalle |
|-------|--------|---------|
| **W** | Acelerar | Empuja la nave en la direccion que mira la camara |
| **A** | Rotar izquierda | Gira nave 1.5 grados/frame |
| **S** | Retroceder/Parar | Frena progresivamente o invierte |
| **D** | Rotar derecha | Gira nave 1.5 grados/frame |
| **SPACE** | Nitro | Multiplica velocidad x3, activa efecto estela |
| **Mouse** | Mirar alrededor | Pointer Lock, sensibilidad configurable |
| **Click** | Seleccionar constelacion | Raycaster desde el centro de la pantalla |

### 3.2 Fisica de Vuelo

```typescript
interface FlightPhysics {
  velocity: Vector3;        // Velocidad actual
  direction: Vector3;       // Direccion de la nave
  speed: number;            // Velocidad escalar (0 - maxSpeed)
  maxSpeed: number;         // 50 unidades/s
  nitroMultiplier: number;  // 3x cuando Space presionado
  damping: number;          // 0.98 (friccion espacial)
  rotationSpeed: number;    // 0.02 rad/frame
}

// Cada frame:
function updateFlight(delta: number, input: InputState) {
  // Rotacion
  if (input.left)  nave.rotation.y += rotationSpeed * delta * 60;
  if (input.right) nave.rotation.y -= rotationSpeed * delta * 60;

  // Direccion desde la rotacion de la nave
  const forward = new Vector3(0, 0, -1);
  forward.applyQuaternion(nave.quaternion);

  // Aceleracion
  if (input.forward) {
    velocity.add(forward.multiplyScalar(acceleration * delta));
  }
  if (input.backward) {
    velocity.sub(forward.multiplyScalar(acceleration * delta * 0.5));
  }

  // Nitro
  const multiplier = input.space ? nitroMultiplier : 1;

  // Limitar velocidad
  if (velocity.length() > maxSpeed * multiplier) {
    velocity.normalize().multiplyScalar(maxSpeed * multiplier);
  }

  // Damping (friccion)
  velocity.multiplyScalar(damping);

  // Mover nave
  nave.position.add(velocity.clone().multiplyScalar(delta));

  // Actualizar camara (sigue a la nave)
  camera.position.copy(nave.position);
  camera.quaternion.copy(nave.quaternion);

  // Actualizar radar
  radar.update(playerPosition, allConstellations);

  // Actualizar chunks
  chunkManager.update(playerPosition);
}
```

### 3.3 Pointer Lock

```typescript
// Al hacer clic en el canvas, activar pointer lock
renderer.domElement.addEventListener('click', () => {
  renderer.domElement.requestPointerLock();
});

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement) {
    const sensitivity = 0.002;
    nave.rotation.y -= e.movementX * sensitivity;
    camera.rotation.x -= e.movementY * sensitivity;
    camera.rotation.x = Math.max(-PI/3, Math.min(PI/3, camera.rotation.x));
  }
});
```

### 3.4 Prevencion de Scroll

```typescript
// Prevenir scroll y salto con espacio
document.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
});

// Quitar scrollbar
document.body.style.overflow = 'hidden';
```

---

## 4. Arquitectura Tecnica

### 4.1 Diagrama de Capas

```
+------------------------------------------------------------------+
|                    CAPA 6 — COCKPIT UI                            |
|  +------------------+  +------------------+  +----------------+  |
|  | CockpitFrame     |  | ProjectScreen    |  | ControlPanel   |  |
|  | (Lit component)  |  | (iframe wrapper) |  | (botones)      |  |
|  +------------------+  +------------------+  +----------------+  |
+------------------------------------------------------------------+
|                    CAPA 5 — HUD & RADAR                           |
|  +------------------+  +------------------+  +----------------+  |
|  | Radar3D          |  | HUDCoords        |  | SpeedIndicator|  |
|  | (Canvas/WebGL)   |  | (CSS overlay)    |  | (barra nitro)  |  |
|  +------------------+  +------------------+  +----------------+  |
+------------------------------------------------------------------+
|                    CAPA 4 — NAVEGACION                             |
|  +------------------+  +------------------+  +----------------+  |
|  | FlightController |  | WASD Input       |  | PointerLock    |  |
|  | (fisica 3D)      |  | (keyboard)       |  | (mouse look)   |  |
|  +------------------+  +------------------+  +----------------+  |
+------------------------------------------------------------------+
|                    CAPA 3 — MUNDO 3D (Three.js)                   |
|  +------------------+  +------------------+  +----------------+  |
|  | GalaxyScene      |  | StarGasSystem    |  | ChunkManager   |  |
|  | (fondo espiral)  |  | (fuego realista) |  | (grid espacial) |  |
|  +------------------+  +------------------+  +----------------+  |
|  +------------------+  +------------------+  +----------------+  |
|  | Constellation    |  | PlanetSystem     |  | Spaceship3D   |  |
|  | (estrellas+lines)|  | (irregular+magma)|  | (geometrica)   |  |
|  +------------------+  +------------------+  +----------------+  |
+------------------------------------------------------------------+
|                    CAPA 2 — POST-PROCESADO                        |
|  +------------------+  +------------------+  +----------------+  |
|  | UnrealBloomPass  |  | GodRayPass       |  | VignettePass   |  |
|  | (glow calido)    |  | (rayos de luz)   |  | (oscuro bordes) |  |
|  +------------------+  +------------------+  +----------------+  |
+------------------------------------------------------------------+
|                    CAPA 1 — EMBEDDED CONTENT                       |
|  +----------+ +----------+ +----------+ +----------+ +----------+ |
|  |Dashboard | | Visor 3D | |Combate 3D| |Tattoo AR | | CesiumJS | |
|  | (React)  | |(Three.js)| |(Three.js)| |(Next.js) | | (WebGL)  | |
|  +----------+ +----------+ +----------+ +----------+ +----------+ |
|  Todos embebidos como iframes, comunicacion via postMessage      |
+------------------------------------------------------------------+
```

---

## 5. Sistema de Componentes

### 5.1 Estructura de Archivos

```
shell/src/
  components/
    shell-app.ts              # Root - inicializa juego 3D
    shell-login.ts            # Login (refinar estetica)
    shell-topbar.ts           # REDISENADO: HUD orbital inferior
    shell-app-container.ts    # SE MANTIENE: wrapper de iframe

  space/                      # NUEVO: Sistema espacial completo
    space-engine.ts           # Inicializador Three.js scene + post-proc
    galaxy.ts                 # Fondo galactico espiral
    star-gas.ts               # Sistema de estrellas como gas/fuego
    chunks.ts                 # Gestor de carga por chunks
    flight.ts                 # Controlador WASD + fisica
    spaceships.ts             # Generador de 3 naves prefabricadas
    spaceship.ts              # Una nave individual (geometria)
    constellations.ts         # Gestor de constelaciones
    constellation.ts          # Una constelacion (estrellas + lineas)
    planets.ts                # Generador de planetas orbitales
    planet.ts                 # Planeta irregular con magma
    radar-3d.ts               # Radar tridimensional en tiempo real
    cockpit.ts                # Vista de cabina con pantallas
    hud.ts                    # Overlay HUD (coordenadas, velocidad)
    project-overlay.ts        # Overlay de info de proyecto

  styles/
    themes.css                # MODIFICAR: tokens naranja/ambar
    cockpit.css               # NUEVO: estilos de cabina
```

### 5.2 Espacio de Juego (Coordenadas)

```
El espacio se organiza en un grid 3D.

Centro del mundo: (0, 0, 0) — Punto de spawn de la nave
Eje Y: arriba/abajo (las constelaciones estan en Y=0)
Eje X y Z: plano horizontal

Distribucion de constelaciones:
  - 7 constelaciones distribuidas en un radio de 200-500 unidades
  - Cada constelacion tiene 1-2 planetas orbitando a 20-40 unidades
  - Planetas: escala 10-30 unidades de radio
  - Nave: escala 2-3 unidades

Chunks:
  - Grid de 100x100x50 unidades por chunk
  - Solo se cargan chunks dentro de radio 200 unidades del jugador
  - Cada chunk contiene: estrellas de fondo, nebulosas lejanas
  - Constelaciones se cargan completas si alguna parte esta en rango
```

---

## 6. Naves Espaciales Prefabricadas

### 6.1 Nave Tipo 1: "Auriga" (Exploradora)

```
Geometria:
  + Cuerpo principal: CapsuleGeometry alargada (radio 0.5, altura 2)
  + Cabina: SphereGeometry (radio 0.3) frontal, vidrio azulado
  + Alas: BoxGeometry (4 x 0.1 x 1) a los lados, inclinadas 30grados
  + Motores: CylinderGeometry (2) traseros, con glow anaranjado
  + Paneles solares: PlaneGeometry rectangulares en los extremos de alas
  + Antena: CylinderGeometry delgado vertical

Materiales:
  + Cuerpo: metal oscuro con rugosidad 0.4, metalness 0.8
  + Cabina: vidrio semitransparente (opacity 0.3, envMap)
  + Motores: emisivo naranja (#D4602A)
  + Detalles: lineas de panel con EdgeGeometry

Tamano: 2.5 x 1.5 x 4 unidades
```

### 6.2 Nave Tipo 2: "Yunque" (Carguero)

```
Geometria:
  + Cuerpo principal: BoxGeometry (2 x 0.8 x 2.5) robusto
  + Cabina: inset en la parte frontal, estilo "ventanal"
  + Brazos de carga: BoxGeometry (0.2 x 0.5 x 1.5) a los lados
  + Contenedores: BoxGeometry (1 x 0.6 x 1) acoplados en la parte inferior
  + Motores: 4 CylinderGeometry grandes traseros
  + Torretas: esferas pequenas en la parte superior

Materiales:
  + Cuerpo: metal gastado, rugosidad 0.7, color #4A3A2A (oxidado)
  + Contenedores: naranja oscuro #8B4513
  + Motores: emisivo ambar #E6A817

Tamano: 3 x 2 x 4 unidades
```

### 6.3 Nave Tipo 3: "Flecha" (Interceptor)

```
Geometria:
  + Cuerpo principal: un cono alargado (ConeGeometry, radio 0.3, altura 2.5)
  + Alas en flecha: TriangleGeometry personalizado, barridas 45grados
  + Estabilizadores: 3 aletas traseras (BoxGeometry delgados)
  + Motor central: CylinderGeometry ancho, con detalle de anillos
  + Puntas de ala: pequenos cilindros con glow

Materiales:
  + Cuerpo: blanco rotura con detalles naranja (#C84B31)
  + Ala: carbono oscuro
  + Motor: emisivo intenso #FF6B35

Tamano: 1.8 x 1.2 x 3.5 unidades
```

### 6.4 Nave del Jugador (Seleccionable al inicio)

```
El jugador comienza con la nave "Auriga" por defecto.
Las otras naves aparecen como NPCs o estacionadas cerca de constelaciones.
Se puede implementar seleccion de nave en el futuro.
```

---

## 7. Planetas y Constelaciones

### 7.1 Constelacion (Estructura 3D)

```
Cada constelacion es un THREE.Group que contiene:

  + ESTRELLAS: 12-20 puntos brillantes (gas shader, no particulas simples)
    - Colores: blanco calido (#FFE4C4), naranja (#FF8C42), rojo (#D43A1A)
    - Tamanos: 0.5-2.0 unidades
    - Animacion: pulso lento (sin wave)

  + LINEAS: conexiones entre estrellas cercanas
    - Opacidad: 0.15 base, 0.6 cerca
    - Color: naranja tenue (#8B5A2B)
    - Animacion: flujo de luz a lo largo de la linea

  + NEBULOSA: gas circundante (Sprite con textura procedural)
    - Tamano: 20-40 unidades
    - Color: naranja/magenta diluido
    - Opacidad: 0.08

  + NOMBRE: TextSprite flotante
    - Fuente: "Cinzel" o "Cinzel Decorative" (estilo clasico)
    - Color: #E6A817
    - Aparece al 80% de distancia

  + HALO: circulo de particulas orbitando alrededor del centro
    - 100-200 particulas tenues
    - Orbita lenta (periodo 60s)
```

### 7.2 Planeta Irregular

```typescript
class IrregularPlanet {
  constructor(radius: number, seed: number) {
    // Esfera base
    const geometry = new THREE.SphereGeometry(radius, 64, 64);

    // Deformacion para hacerlo irregular
    const positions = geometry.attributes.position;
    const rng = seedRandom(seed);

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      const noise = simplex3D(x * 0.3, y * 0.3, z * 0.3) * radius * 0.2;
      const len = Math.sqrt(x*x + y*y + z*z);
      const scale = 1 + noise / len;

      positions.setXYZ(i, x * scale, y * scale, z * scale);
    }
    geometry.computeVertexNormals();

    // Textura de magma (shader procedural)
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color1: { value: new THREE.Color('#1A0A00') },  // negro carbon
        color2: { value: new THREE.Color('#8B3A1A') },  // oxidado
        color3: { value: new THREE.Color('#D4602A') },  // magma
        color4: { value: new THREE.Color('#FF8C42') },  // lava brillante
      },
      vertexShader: `...`,
      fragmentShader: `
        // Noise 3D para magma fluyendo
        // Colores interpolados por altitud + tiempo
        // Fisuras brillantes (lineas de lava)
      `,
    });
  }

  // Orbita alrededor de la constelacion
  update(time: number) {
    const angle = time * 0.05 + this.orbitOffset;
    this.position.x = this.orbitRadius * Math.cos(angle);
    this.position.z = this.orbitRadius * Math.sin(angle);
    this.rotation.y += 0.005;

    // Actualizar shader de magma
    this.material.uniforms.time.value = time;
  }
}
```

### 7.3 Distribucion de Planetas por Constelacion

| App ID | Constelacion | Planetas | Tamano Planeta |
|--------|------------|----------|----------------|
| dashboard | Dashboard Comercial | 2 | 12, 8 |
| viewer-3d | Visor 3D | 1 | 15 |
| combate-3d | Combate 3D | 2 | 18, 10 |
| oktomatzo2 | TattooAR | 1 | 14 |
| busqueda | Busqueda | 1 | 8 |
| mundo-3d | Mundo 3D | 2 | 25, 12 |
| test-uno | Proyecto de prueba 1 | 1 | 6 |
| test-dos | Proyecto de prueba 2 | 1 | 7 |

Cada planeta orbita a distancia 20-40 unidades de su constelacion, con velocidades angulares distintas.

---

## 8. Galaxia y Efectos Visuales

### 8.1 Galaxia Espiral (Fondo)

```typescript
class GalaxyBackground {
  // Genera un disco galactic con brazos espirales
  // Usando ~100,000 puntos con distribucion espiral

  generate() {
    const count = 100000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const arm = Math.floor(Math.random() * 4);  // 4 brazos
      const angleOffset = (arm / 4) * Math.PI * 2;
      const radius = 50 + Math.random() * 300;
      const angle = radius * 0.02 + angleOffset + (Math.random() - 0.5) * 0.3;
      const scatter = (Math.random() - 0.5) * 10;

      positions[i*3]   = Math.cos(angle) * radius + scatter;
      positions[i*3+1] = (Math.random() - 0.5) * 5;  // delgado en Y
      positions[i*3+2] = Math.sin(angle) * radius + scatter;

      // Color segun distancia al centro
      const t = radius / 400;
      const c = new THREE.Color();
      c.lerpColors(
        new THREE.Color('#FF8C42'),  // centro naranja
        new THREE.Color('#4A3020'),  // borde oscuro
        t
      );
      colors[i*3] = c.r;
      colors[i*3+1] = c.g;
      colors[i*3+2] = c.b;

      sizes[i] = 0.3 + Math.random() * 1.5;
    }

    // Material con shader de gas (no puntos duros)
  }
}
```

### 8.2 Estrellas como Gas/Fuego

```typescript
class StarGasSystem {
  // En lugar de Points con circulos duros:
  // Usar ShaderMaterial con fragment shader que dibuja
  // gas con bordes difusos y centro brillante

  fragmentShader = `
    varying float vAlpha;

    void main() {
      // Calcular distancia desde el centro del punto
      vec2 center = vec2(0.5, 0.5);
      float dist = distance(gl_PointCoord, center);

      // Borde difuso (gas)
      float alpha = 1.0 - smoothstep(0.1, 0.6, dist);
      // Centro brillante (nucleo de la estrella)
      float core = exp(-dist * 10.0);

      vec3 color = mix(
        vec3(0.8, 0.4, 0.1),  // borde naranja
        vec3(1.0, 0.9, 0.6),  // centro blanco calido
        core
      );

      gl_FragColor = vec4(color, alpha * vAlpha);
    }
  `;
}
```

### 8.3 Magma en Planetas

El shader de magma combina:
- **Noise 3D simplex** para crear patrones de fluido
- **Desplazamiento UV** por tiempo para simular flujo
- **Paleta termal**: negro -> rojo oscuro -> naranja -> amarillo
- **Fisuras brillantes**: lineas delgadas donde el magma es mas intenso
- **Efecto de brillo**: emision en las zonas mas calientes

### 8.4 God Rays (Rayo de Luz)

```typescript
// Post-processing: GodRays desde las estrellas brillantes
import { GodRaysPass } from 'three/addons/postprocessing/GodRaysPass.js';

const godRays = new GodRaysPass(
  starLightPosition,  // posicion de la estrella mas brillante
  camera,
  {
    density: 0.96,
    decay: 0.92,
    weight: 0.3,
    samples: 60,
  }
);
composer.addPass(godRays);
```

### 8.5 Bloom Calido (Warm Bloom)

```typescript
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.4,   // strength - moderado
  0.5,   // radius
  0.1    // threshold
);
// Nota: el bloom se aplica sobre el render completo,
// pero como la paleta es calida, el glow sera naranja/ambar
```

---

## 9. Radar 3D en Tiempo Real

### 9.1 Implementacion

```typescript
class Radar3D {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private size: number = 180;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.ctx = this.canvas.getContext('2d')!;
    // CSS: posicion fija, esquina superior izquierda, z-index alto
  }

  update(
    playerPosition: Vector3,
    playerRotation: number,
    constellations: ConstellationData[]
  ) {
    const ctx = this.ctx;
    const cx = this.size / 2;
    const cy = this.size / 2;
    const radius = 80;

    ctx.clearRect(0, 0, this.size, this.size);

    // Fondo oscuro semitransparente
    ctx.fillStyle = 'rgba(10, 5, 3, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Anillos
    ctx.strokeStyle = 'rgba(196, 75, 49, 0.15)';  // naranja tenue
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * i / 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cruces
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius);
    ctx.strokeStyle = 'rgba(196, 75, 49, 0.1)';
    ctx.stroke();

    // Puntos de constelaciones (proyeccion 3D -> 2D radar)
    for (const constel of constellations) {
      const dx = constel.position.x - playerPosition.x;
      const dz = constel.position.z - playerPosition.z;
      const dist = Math.sqrt(dx*dx + dz*dz);

      if (dist < 10) continue;  // muy cerca, omitir

      // Rotar segun orientacion del jugador
      const angle = Math.atan2(dz, dx) - playerRotation;
      const radarDist = Math.min(dist / 500 * radius, radius - 10);

      const x = cx + Math.cos(angle) * radarDist;
      const y = cy + Math.sin(angle) * radarDist;

      // Brillo segun distancia
      const brightness = Math.max(0.2, 1 - dist / 500);

      // Dibujar punto
      ctx.fillStyle = `rgba(230, 168, 23, ${brightness})`;
      ctx.shadowColor = 'rgba(230, 168, 23, 0.3)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, 2 + brightness * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label
      if (dist < 200) {
        ctx.fillStyle = `rgba(192, 176, 144, ${brightness * 0.6})`;
        ctx.font = '7px "Cinzel", serif';
        ctx.fillText(constel.name, x + 5, y + 3);
      }
    }

    // Nave del jugador (centro)
    ctx.fillStyle = '#E6A817';
    ctx.shadowColor = '#E6A817';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Brújula (N)
    ctx.fillStyle = 'rgba(196, 75, 49, 0.5)';
    ctx.font = '7px serif';
    ctx.fillText('N', cx, cy - radius + 10);
  }

  show() { this.canvas.style.display = 'block'; }
  hide() { this.canvas.style.display = 'none'; }
}
```

### 9.2 Comportamiento

- **Visible**: mientras se explora el espacio
- **Oculto**: cuando se ve un proyecto (cockpit view)
- **Reaparece**: al volver al espacio
- Actualizacion: 30fps (no necesita 60fps)

---

## 10. Vista Cabina (Cockpit View)

### 10.1 Transicion

```typescript
class CockpitTransition {
  async enter(projectInfo: ProjectInfo) {
    // 1. Desvanecer radar
    radar.hide();

    // 2. Animacion de camara: desde exterior a interior
    await gsap.to(camera.position, {
      x: cockpitPosition.x,
      y: cockpitPosition.y,
      z: cockpitPosition.z,
      duration: 1.0,
      ease: 'power2.inOut',
    });

    // 3. Encender pantallas (efecto fade-in del iframe)
    cockpitScreen.show(projectInfo);

    // 4. Mostrar HUD de cabina (panel de control)
    cockpitHUD.show();
  }

  async exit() {
    // 1. Apagar pantallas
    cockpitScreen.hide();

    // 2. Restaurar camara a posicion exterior
    await gsap.to(camera.position, {
      x: exteriorPosition.x,
      y: exteriorPosition.y,
      z: exteriorPosition.z,
      duration: 0.8,
      ease: 'power2.inOut',
    });

    // 3. Mostrar radar de nuevo
    radar.show();
  }
}
```

### 10.2 Layout de la Cabina

```
La cabina se compone de:

+ PANEL PRINCIPAL (centro, 70% ancho):
  - Marco de pantalla con efecto scan-line tenue
  - El iframe del modulo se renderiza aqui
  - Borde con remaches y esquinas de metal

+ PANELES LATERALES (izquierda y derecha, 15% cada uno):
  - Izquierdo: informacion del proyecto, nombre, version
  - Derecho: controles de navegacion, boton VOLVER

+ PANEL INFERIOR (control):
  - Indicadores de sistemas (estilo medieval/futurista)
  - Palancas y botones decorativos (CSS 3D)

+ MATERIALES:
  - Metal oscuro con detalles naranja (#4A3020, #8B5A2B)
  - Pantallas con glow ambar (#E6A817)
  - Remaches: cilindros pequenos en las esquinas
  - Texto: fuente "Cinzel" para titulos, "JetBrains Mono" para datos
```

### 10.3 Proyecto Embebido

```typescript
class CockpitScreen extends LitElement {
  render() {
    return html`
      <div class="cockpit-frame">
        <div class="screen-border">
          <div class="scan-line"></div>
          <div class="screen-content">
            <shell-app-container
              .app=${this.app}
              .theme=${this.theme}
            ></shell-app-container>
          </div>
        </div>
        <div class="screen-info">
          <span class="project-name">${this.app.name}</span>
          <span class="project-version">v${this.app.version}</span>
        </div>
      </div>
    `;
  }
}
```

El `shell-app-container` es el mismo componente existente, sin cambios. Solo cambia el contenedor (antes era un div en el dashboard, ahora es una pantalla dentro de la cabina).

---

## 11. Sistema de Chunks y Rendimiento

### 11.1 Grid de Chunks

```typescript
interface Chunk {
  id: string;           // "16_32_0"
  x: number;            // indice en grid X
  z: number;            // indice en grid Z
  y: number;            // indice en grid Y
  loaded: boolean;
  objects: THREE.Object3D[];  // estrellas de fondo, etc.
}

class ChunkManager {
  private chunkSize = 100;  // unidades por chunk
  private loadRadius = 2;   // chunks alrededor del jugador
  private chunks: Map<string, Chunk> = new Map();
  private activeChunks: Set<string> = new Set();

  update(playerPosition: Vector3) {
    const cx = Math.floor(playerPosition.x / this.chunkSize);
    const cy = Math.floor(playerPosition.y / this.chunkSize);
    const cz = Math.floor(playerPosition.z / this.chunkSize);

    // Calcular que chunks deberian estar activos
    const needed = new Set<string>();
    for (let dx = -this.loadRadius; dx <= this.loadRadius; dx++) {
      for (let dy = -this.loadRadius; dy <= this.loadRadius; dy++) {
        for (let dz = -this.loadRadius; dz <= this.loadRadius; dz++) {
          const key = `${cx+dx}_${cy+dy}_${cz+dz}`;
          needed.add(key);

          if (!this.chunks.has(key)) {
            this.loadChunk(cx+dx, cy+dy, cz+dz);
          }
        }
      }
    }

    // Descargar chunks que ya no son necesarios
    for (const key of this.activeChunks) {
      if (!needed.has(key)) {
        this.unloadChunk(key);
      }
    }
    this.activeChunks = needed;
  }

  private loadChunk(x: number, y: number, z: number) {
    // Generar estrellas de fondo para este chunk
    // Usar seed basado en coordenadas para consistencia
    const stars = this.generateStarsForChunk(x, y, z);
    scene.add(stars);

    this.chunks.set(`${x}_${y}_${z}`, {
      id: `${x}_${y}_${z}`,
      x, y, z,
      loaded: true,
      objects: [stars],
    });
  }

  private generateStarsForChunk(x: number, y: number, z: number): THREE.Points {
    // ~500 estrellas por chunk
    // Posiciones relativas al chunk
    // Seed = hash(x, y, z) para que sea deterministico
  }
}
```

### 11.2 Optimizaciones de Rendimiento

| Tecnica | Descripcion |
|---------|-------------|
| **Frustum culling** | No renderizar objetos fuera del view frustum |
| **LOD (Level of Detail)** | Planetas lejanos tienen menos poligonos |
| **Resolution scaling** | Bajar resolucion si FPS < 30 |
| **Object pooling** | Reutilizar objetos en lugar de crear/destruir |
| **InstancedMesh** | Estrellas de fondo (misma geometria, diferentes posiciones) |
| **Page Visibility** | Pausar renderer cuando la pestana no esta visible |
| **Delta time** | Física basada en delta, no en framerate |
| **Shadow distance** | Sombras solo para objetos cercanos (< 50 unidades) |

### 11.3 Limites de Seguridad

| Parametro | Valor |
|-----------|-------|
| Velocidad maxima | 80 unidades/s (con nitro) |
| Distancia maxima desde origen | 2000 unidades |
| Chunks maximos cargados | 125 (5x5x5) |
| Poligonos por planeta | 4096 (cerca), 1024 (lejos) |
| Particulas totales | 150,000 maximo |

---

## 12. Paleta Visual

### 12.1 Colores (Medieval Orange / Space)

```
FONDO
  Deep Space      #0A0503  — Negro carbon con tinte marron
  Space Dark      #1A0E08  — Fondo secundario
  Space Surface   #2A1A10  — Superficies UI

NARANJA (Paleta principal)
  Burnt Orange    #C84B31  — Naranja quemado (acento principal)
  Rust            #8B3A1A  — Oxidado (bordes, detalles)
  Amber           #E6A817  — Ambar (luces, highlights)
  Gold            #D4A84B  — Dorado (elementos importantes)
  Ember           #FF6B35  — Brasa (motores, fuego)
  Warm Glow       #FF8C42  — Brillo calido (bloom)

METAL
  Iron            #3A2A20  — Hierro oscuro (cuerpo nave)
  Steel           #5A4A3A  — Acero (detalles mecanicos)
  Brass           #8B7A5A  — Laton (instrumentos)
  Copper          #B86A3A  — Cobre (cables, tuberias)

TEXTO
  Text Primary    #C8B898  — Pergamino (texto principal)
  Text Secondary  #8A7A6A  — Texto secundario
  Text Dim        #5A4A3A  — Texto tenue

ESTADOS
  Error           #CC3333  — Rojo oscuro
  Success         #6B8A3A  — Verde aceituna
  Warning         #D4A017  — Mostaza
```

### 12.2 Tipografia

```
TITULOS / EPICOS
  Fuente: "Cinzel Decorative", serif
  Pesos: 700 (bold), 900 (black)
  Usos: Nombre de constelaciones, titulos de pantalla

DATOS / HUD
  Fuente: "JetBrains Mono", monospace
  Pesos: 300, 400, 700
  Usos: Coordenadas, velocidad, datos de sistemas

INTERFAZ GENERAL
  Fuente: "Cinzel", serif
  Pesos: 400 (regular), 600 (semi-bold)
  Usos: Labels, menus, botones
```

### 12.3 Texturas y Efectos

```
PAPEL / PERGAMINO (para overlays de informacion):
  background: rgba(42, 26, 16, 0.9);
  border-image: repeating-linear-gradient(
    45deg, #8B3A1A, #3A2A20 2px
  ) 1;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);

METAL (para naves y paneles):
  Material: MeshStandardMaterial
  color: #3A2A20
  roughness: 0.6
  metalness: 0.8
  envMapIntensity: 0.3

VIDRIO (para cabinas y pantallas):
  Material: MeshPhysicalMaterial
  color: #1A3A4A
  roughness: 0.1
  metalness: 0.0
  transparent: true
  opacity: 0.3
  envMapIntensity: 0.5

BLOOM (glow calido):
  UnrealBloomPass
  strength: 0.3 (moderado)
  radius: 0.5
  threshold: 0.15
  // El bloom solo resalta naranjas y rojos
```

---

## 13. Desafios Tecnicos y Soluciones

### 13.1 WASD + Pointer Lock en Navegador

| Desafio | Solucion |
|---------|----------|
| Pointer Lock no funciona en iframes | El canvas Three.js esta en el shell (Lit), no en iframe. Funciona. |
| Scroll con teclas de flecha | `e.preventDefault()` en keydown para Space, ArrowUp, etc. |
| Salto con Space | `e.preventDefault()` + `e.stopPropagation()` |
| Movimiento suave | Interpolacion lineal (lerp) + delta time |
| Desorientacion | Vignette en bordes + punto de referencia fijo (reticula) |

### 13.2 Chunks y Mundo Grande

| Desafio | Solucion |
|---------|----------|
| Floating point precision | Usar `Float64Array` para posiciones de camara. Resetear origen cada 1000 unidades. |
| Carga async de chunks | `requestIdleCallback` para generar estrellas de fondo. Web Workers para generacion procedural. |
| Memoria | Pool de geometrias. Descartar chunks fuera de rango inmediatamente. |
| Pop-in de objetos | Fade-in de 0.5s para chunks nuevos. Neblina de distancia (fog). |

### 13.3 Planetas con Magma Shader

| Desafio | Solucion |
|---------|----------|
| Shader complejo | Usar ShaderMaterial con noise 3D pre-calculado en textura |
| Rendimiento de shader | Reducir iteraciones de noise para planetas lejanos (LOD) |
| Actualizacion uniforme | Solo actualizar uniforms de tiempo, no recrear shaders |

### 13.4 Vista Cabina + Iframe

| Desafio | Solucion |
|---------|----------|
| Iframe dentro de escena 3D | Usar CSS absolute positioning sobre el canvas, no dentro de Three.js |
| Click en iframe vs click 3D | Cuando cabina activa, desactivar raycaster. Cuando espacio, ocultar iframe. |
| Proporciones de pantalla | El marco de la cabina se ajusta con aspect-ratio. El iframe se adapta. |

---

## 14. Plan de Implementacion por Fases

### Fase 0: Foundation (Dias 1-2)

- [ ] Instalar Three.js + GSAP en shell/
- [ ] Configurar dynamic imports
- [ ] Crear estructura de directorios en shell/src/space/
- [ ] Implementar pointer lock + prevencion de scroll
- [ ] Probar renderizado basico de Three.js en Lit

### Fase 1: Flight System (Dias 3-5)

- [ ] **flight.ts**: Sistema WASD completo con fisica
- [ ] **space-engine.ts**: Escena base con camara y renderer
- [ ] Sistema de delta time y actualizacion por frame
- [ ] Pointer lock + mouse look
- [ ] Nitro con Space

### Fase 2: Universe (Dias 6-9)

- [ ] **galaxy.ts**: Galaxia espiral de fondo (100k puntos)
- [ ] **star-gas.ts**: Estrellas como gas (shader difuso)
- [ ] **chunks.ts**: Sistema de chunks 3D
- [ ] Neblina de distancia (fog)
- [ ] **Post-processing**: Bloom calido + vignette

### Fase 3: Constellations & Planets (Dias 10-14)

- [ ] **constellations.ts**: Leer app-registry, generar constelaciones
- [ ] **constellation.ts**: Estrellas + lineas + label
- [ ] **planets.ts + planet.ts**: Planetas irregulares con magma shader
- [ ] Orbitas alrededor de constelaciones
- [ ] Raycaster para deteccion de clic

### Fase 4: Spaceships (Dias 15-17)

- [ ] **spaceships.ts**: Generador de 3 naves
- [ ] Nave "Auriga" (exploradora)
- [ ] Nave "Yunque" (carguero)
- [ ] Nave "Flecha" (interceptor)
- [ ] Nave del jugador (Auriga por defecto)
- [ ] Efecto de motor con particulas

### Fase 5: Cockpit & Radar (Dias 18-21)

- [ ] **cockpit.ts**: Vista de cabina con transicion
- [ ] **radar-3d.ts**: Radar en tiempo real
- [ ] **hud.ts**: Overlay con coordenadas, velocidad, nitro
- [ ] **project-overlay.ts**: Info de proyecto al hacer clic
- [ ] Integracion con shell-app-container (iframe)

### Fase 6: Polish (Dias 22-25)

- [ ] Refinar estetica general
- [ ] Performance optimization
- [ ] Mobile fallback (modo clasico)
- [ ] Testing con todos los modulos
- [ ] Animaciones de transicion pulidas

---

> **Fin del documento.** Este plan reemplaza la version anterior. Todos los conceptos de neon/cyan han sido eliminados en favor de una paleta naranja medieval que transmite calidez, poder y elegancia clasica.
