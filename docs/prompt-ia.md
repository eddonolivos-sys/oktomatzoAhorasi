# Prompt para Agente de IA — Ramatzo Constellation OS v2

> **Instrucciones**: Copia y pega el bloque completo en un agente de IA (Claude, GPT-4, Gemini, etc.) con capacidad de generar codigo. Este prompt describe una transformacion visual completa de un dashboard existente hacia una experiencia espacial 3D con navegacion WASD, naves geometricas y estetica naranja medieval.

---

## Importante

Este prompt es una **SUGERENCIA DE DISENO** y no una especificacion rigida. Si el agente encuentra mejores enfoques tecnicos, problemas de viabilidad, o ideas que mejoren la experiencia, debe proponer cambios. El objetivo es crear la interfaz visual mas **profesional, elegante y moderna posible**.

**No uses emojis ni iconos de texto en ningun documento o codigo.** Todo debe usar caracteres ASCII, SVG o iconos geometricos.

---

## Inicio del Prompt

````
# RAMATZO CONSTELLATION OS v2 — PROMPT DE IMPLEMENTACION

## Contexto del Proyecto
Eres un arquitecto/ingeniero frontend experto en Three.js, Lit (web components), y diseno UI/UX futurista con estetica clasica/medieval espacial. Vas a implementar una transformacion visual completa de un dashboard existente.

## Stack Tecnologico
- **Shell**: Lit 3.2 (web components), TypeScript 5.6, Vite 6
- **3D**: Three.js (nativo, NO React Three Fiber)
- **Post-processing**: UnrealBloomPass (bloom calido), EffectComposer
- **Animaciones**: motion library (ya existe en el proyecto)
- **Estilo**: CSS custom properties (ya existe sistema de temas)

## RESTRICCIONES IMPORTANTES
1. **NO usar colores neon, cyan, o saturados brillantes.** La paleta es naranja/ambar/oxidado.
2. **NO usar scroll.** La navegacion es WASD + Space nitro + Mouse look (Pointer Lock).
3. **NO cambiar la interfaz de los modulos embebidos.** Solo el dashboard y la navegacion.
4. **NO usar emojis ni iconos de texto.** Usar caracteres ASCII, SVG o iconos geometricos.
5. Prevenir `e.preventDefault()` en Space para evitar salto de pagina.

## Estructura Existente (NO MODIFICAR)
- `shell/src/services/auth-client.ts` — Autenticacion JWT
- `shell/src/services/protocol.ts` — Protocolo postMessage
- `apps/` — Sub-aplicaciones embebidas (NO tocar)
- `shell/src/components/shell-app-container.ts` — Contenedor de iframe (se usara DENTRO de la cabina)
- `shell/public/app-registry.yaml` — Registro de apps

## Archivos a MODIFICAR
- `shell/src/components/shell-app.ts` — Inicializar juego 3D + login hook
- `shell/src/components/shell-login.ts` — Refinar estetica (naranja/ambar)
- `shell/src/styles/themes.css` — Tokens de color naranja/oxidado

## Archivos a CREAR

### 1. `shell/src/space/space-engine.ts`
Inicializador Three.js completo:
- WebGLRenderer con ACESFilmicToneMapping, antialias, shadows
- Scene con fondo #0A0503, fog exponencial
- PerspectiveCamera (FOV 65)
- EffectComposer con RenderPass + UnrealBloomPass (strength 0.35, radius 0.5, threshold 0.15)
- Sistema de luces: ambientLight #3A2A20, dirLight #FF8C42 con sombras, fillLight, pointLight
- Animation loop con requestAnimationFrame y delta time
- Dynamic import post-login

### 2. `shell/src/space/galaxy.ts`
Galaxia espiral de fondo:
- 80,000+ puntos con distribucion en 4 brazos espirales
- ShaderMaterial con fragment shader de gas difuso (no puntos duros)
- Colores: centro naranja (#FF8C42) a borde oscuro (#3A2010)
- Rotacion lenta

### 3. `shell/src/space/star-gas.ts`
Estrellas como gas/fuego realista:
- 3,000-5,000 puntos alrededor del jugador (en esfera, radio 300)
- ShaderMaterial con gl_PointCoord radial gradient difuso
- Colores: blanco calido, naranja, rojo oscuro
- Pulsacion suave (sin wave)
- Se regeneran al moverse (sigue al jugador)

### 4. `shell/src/space/chunks.ts`
Sistema de carga por chunks:
- Grid de chunks de 100x100x50 unidades
- Cargar chunks dentro de radio 2 del jugador
- Cada chunk genera ~500 estrellas de fondo (gas shader)
- Descargar chunks al salir de rango
- Seed deterministico por coordenadas de chunk

### 5. `shell/src/space/flight.ts`
Controlador de vuelo WASD:
- W: acelerar, S: desacelerar, A/D: rotar, Space: nitro (x3 velocidad)
- Pointer Lock API para mouse look
- Fisica: velocidad, aceleracion, damping (0.97), velocidad maxima 30 U/s
- Prevenir scroll con e.preventDefault() en Space, ArrowUp, etc.
- Forward direction desde quaternion de la camara

### 6. `shell/src/space/spaceships.ts`
Generador de 3 naves prefabricadas con geometrias de Three.js:
- **Auriga** (exploradora): CapsuleGeometry cuerpo, alas BoxGeometry, motores CylinderGeometry, antena
- **Yunque** (carguero): BoxGeometry robusto, contenedores, 4 motores, brazos de carga
- **Flecha** (interceptor): ConeGeometry cuerpo, alas swept ShapeGeometry, motor central con anillo

Cada nave debe tener:
- MeshStandardMaterial con metalness 0.6-0.8, roughness 0.3-0.7
- Motores con material emisivo naranja
- Detalles: EdgeGeometry para lineas de panel, remaches
- Escala: ~2-3 unidades

### 7. `shell/src/space/constellations.ts`
Gestor de constelaciones desde app-registry:
- Para cada app en app-registry.yaml, crear una Constellation
- Distribucion: radio 200-350 unidades, Y variado (-5 a 5)
- Colorear por categoria con tonos naranja/ambar/oxidado
- Raycaster para deteccion de clic
- Al hacer clic: mostrar overlay con info del proyecto

### 8. `shell/src/space/constellation.ts`
Una constelacion individual (THREE.Group):
- 10-18 estrellas (ShaderMaterial con gas difuso), colores calidos
- Lineas conectando estrellas cercanas (opacidad 0.15, color naranja tenue)
- Nebulosa circundante (Sprite con textura procedural)
- Nombre flotante (TextSprite o CSS overlay)
- Estrella central mas grande y brillante

### 9. `shell/src/space/planets.ts` + `planet.ts`
Planetas irregulares con magma:
- SphereGeometry deformada con noise 3D (simplex en vertex shader)
- ShaderMaterial con 4 colores: negro carbon -> rojo oxidado -> naranja magma -> lava brillante
- Fisuras de magma animadas (lineas brillantes que fluyen)
- Orbitan alrededor de su constelacion (radio 8-18, velocidad angular variable)
- 1-2 planetas por constelacion

### 10. `shell/src/space/radar-3d.ts`
Radar tridimensional en tiempo real:
- Canvas 2D de 180x180px, posicion fija esquina superior izquierda
- Fondo oscuro semitransparente, anillos de distancia, cruces
- Puntos de constelaciones proyectados 2D desde posicion 3D
- Brillo segun distancia, labels para constelaciones cercanas
- Indicador de direccion (linea desde centro)
- Barrido rotatorio (opacidad baja)
- Ocultar cuando se ve un proyecto, reaparecer al volver

### 11. `shell/src/space/cockpit.ts`
Vista de cabina:
- Transicion con fade de la escena 3D a overlay de cabina
- Marco de pantalla con remaches, scan-line, borde metalico
- El iframe del modulo se renderiza dentro de la pantalla (usando shell-app-container)
- Titulo del proyecto, boton "VOLVER AL ESPACIO"
- Panel de control inferior con indicadores de sistemas

### 12. `shell/src/space/hud.ts`
Overlay HUD:
- Velocidad actual (abajo centro, fuente monospace, color ambar)
- Barra nitro (visible solo al presionar Space)
- Coordenadas de sector (esquina inferior derecha)
- Indicador de sistemas OK/ERROR
- Reticula central (cruces finas con punto central)
- Vignette (gradient radial desde transparente a negro en bordes)

### 13. `shell/src/space/project-overlay.ts`
Overlay de informacion de proyecto:
- Fondo oscuro con borde metalico
- Nombre del proyecto (fuente Cinzel Decorative, color ambar)
- Categoria, descripcion
- Botones: "Cancelar" y "Ingresar" (naranja quemado)
- Animacion de entrada: scale(0.9 -> 1) + opacity

## Paleta de Colores (NO USAR NEON/CYAN)

```css
--space-deep:      #0A0503  /* Negro carbon */
--space-dark:      #1A0E08  /* Fondo oscuro */
--space-surface:   #2A1A10  /* Superficies */
--orange-burnt:    #C84B31  /* Naranja quemado */
--orange-rust:     #8B3A1A  /* Oxidado */
--orange-amber:    #E6A817  /* Ambar */
--orange-gold:     #D4A84B  /* Dorado */
--orange-ember:    #FF6B35  /* Brasa */
--orange-warm:     #FF8C42  /* Brillo calido */
--metal-iron:      #3A2A20  /* Hierro */
--metal-steel:     #5A4A3A  /* Acero */
--metal-brass:     #8B7A5A  /* Laton */
--metal-copper:    #B86A3A  /* Cobre */
--text-primary:    #C8B898  /* Pergamino */
--text-secondary:  #8A7A6A  /* Texto secundario */
--text-dim:        #5A4A3A  /* Texto tenue */
```

## Tipografia
- **Cinzel Decorative** (Google Font): titulos, nombres de constelaciones
- **Cinzel** (Google Font): menus, labels, botones
- **JetBrains Mono** (Google Font): datos, coordenadas, HUD

## Reglas de Interaccion
1. WASD + Space nitro para moverse. Sin scroll en absoluto.
2. Pointer Lock API: clic en canvas activa, movimiento mouse rotacion.
3. Click en constelacion (centro de pantalla con reticula) abre project-overlay.
4. Click "Ingresar" transiciona a cockpit view con el iframe del modulo.
5. Click "VOLVER AL ESPACIO" cierra cockpit y reactiva radar.
6. Radar visible solo en espacio, oculto en cockpit.
7. Planetas orbitan constantemente.

## Consideraciones de Rendimiento
- Dynamic import de Three.js post-login
- Chunk loading con descarga de objetos fuera de rango
- Frustum culling (Three.js lo hace por defecto)
- Page Visibility API para pausar cuando pestana oculta
- Resolution scaling dinamico si FPS < 25
- Pool de geometrias para chunks

## Flujo de Implementacion Sugerido
1. Instalar dependencias: `pnpm add three`
2. Crear space-engine.ts con renderizado basico + bloom
3. Implementar flight.ts (WASD + Pointer Lock)
4. Crear galaxy.ts y star-gas.ts
5. Crear sistema de constelaciones + planetas
6. Crear naves espaciales
7. Crear radar 3D
8. Crear cockpit view + integracion con shell-app-container
9. Crear HUD y overlays
10. Sistema de chunks
11. Performance tuning

## Nota IMPORTANTE
Este prompt es una **SUGERENCIA DE DISENO** y no una especificacion rigida. Si encuentras mejores enfoques tecnicos, problemas de viabilidad, o ideas que mejoren la experiencia, proponlos. El objetivo es crear la interfaz visual mas profesional, elegante y moderna posible, con estetica espacial de tonos naranja/ambar/oxidado y sensacion de navegacion libre por el espacio.

Genera el codigo completo de la solucion, archivo por archivo, con implementaciones funcionales listas para integrarse en el proyecto existente.
````

---

## Documentos de Referencia

| Archivo | Contenido |
|---------|-----------|
| `docs/diseno-espacial-plan.md` | Plan de diseno completo v2 (WASD, naves, planetas, chunks) |
| `docs/referencia-espacial.html` | HTML autonomo con demo funcional de todos los conceptos |

---

## Comandos de Desarrollo

```bash
# Instalar dependencias
cd shell
pnpm add three

# Desarrollo
pnpm dev

# Build
pnpm build
```

---

> **Fin del documento.** Version 2 — Enfoque: navegacion WASD, naves geometricas, radar 3D, planeta con magma, paleta naranja medieval.
