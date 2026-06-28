# Spec — Vista de proyecto independiente (pieza 1 del rework de proyecto/multijugador)

- **Fecha:** 2026-06-27
- **Rama:** `ramatzo`
- **Contexto:** tras repetidos fallos para ver proyectos (resultó ser entrega de build viejo + fragilidad del overlay), el usuario pide desacoplar la vista del proyecto del render del mapa, con retorno por botón **o** botón-atrás del navegador (idénticos).
- **Alcance:** solo `shell/src/components/shell-space.ts`. No toca el motor 3D, las apps ni el iframe interno (`shell-cockpit`/`shell-app-container` se reutilizan tal cual).

## Decisiones (confirmadas en brainstorming)

| Eje | Decisión |
|---|---|
| Mecanismo | **Ocultar el mapa (`display:none`) + pausar el motor** y mostrar el proyecto como única vista. Bajo riesgo, conserva el estado exacto, sin conflicto de capas (el mapa no queda debajo) |
| Navegación | **History API (`pushState`)**: entrar → `?app=id`; volver → `popstate` |
| Retorno | El botón "Volver al espacio" llama a `history.back()`; el atrás del navegador dispara `popstate`. **Ambos pasan por el mismo manejador** → resultado idéntico por construcción |
| Orden global | Esta es la **pieza 1**. Siguen: (2) órbitas realistas; (3-4) multijugador determinista + persistencia/idle (specs aparte) |

## Diseño (solo `shell-space.ts`)

- **Entrar** (`onEnterApp(app)`): `history.pushState({ cockpit: app.id }, '', '?app=' + id)` → `this.cockpitApp = app` → `engine.pause()`. El render oculta `#space-host` (`display:none`) cuando `cockpitApp != null`, y monta `<shell-cockpit>` como única vista visible.
- **Volver**:
  - Botón del cockpit (`@back`) → `history.back()`.
  - Atrás del navegador → `popstate`.
  - Manejador único `onPopState(e)`: `const id = e.state?.cockpit`; si hay app con ese id → mostrarla (`cockpitApp = app`, `pause()`); si no → volver al mapa (`cockpitApp = null`, `engine.resume()`). Maneja atrás **y** adelante simétricamente.
- **Carga limpia**: en `firstUpdated`, tras montar, `history.replaceState({}, '', location.pathname)` para empezar siempre en el mapa (ignora un `?app=` de una recarga previa).
- **Ciclo de vida**: añadir el listener `popstate` en `firstUpdated`; quitarlo en `disconnectedCallback` (antes del `engine.dispose()`).
- `externalUrl` (p. ej. el planeta "ramatzo" → GitHub) sigue abriendo pestaña nueva (no entra al cockpit, no toca el historial).

## Estado conservado

El motor **no se destruye**: se pausa y su `#space-host` se oculta. Al volver, `resume()` + `display:block` restauran el mapa con la nave y los planetas donde estaban. (La reconstrucción determinista desde params mínimos es la pieza 3-4, para multijugador.)

## Verificación

- Lógica pura: mínima (no aplica TDD; es History API + Lit).
- **Arnés dev-only** (montando el `<shell-space>` real): entrar → `#space-host` `display:none`, `engine.running === false`, URL `?app=id`, `<shell-cockpit>` visible; `history.back()` → mapa visible, `engine.running === true`, URL limpia; `popstate` (atrás del navegador) → mismo resultado que el botón.
- `pnpm --filter @plataforma/shell test/lint/build` + **rebuild de `shell/dist`** (lo que sirve Caddy en local por bind-mount).

## Riesgos

- `display:none` sobre el canvas WebGL: no debería perder el contexto (se verifica en arnés con resume).
- Recarga con `?app=` en la URL: mitigado con `replaceState` al cargar (empieza en el mapa).
- Entrega: el cambio solo se ve si el navegador carga el build nuevo; la propia URL `?app=` al entrar sirve de prueba de versión.

## Fuera de alcance

- Órbitas realistas (pieza 2), multijugador determinista/persistencia/idle (piezas 3-4).
- Cambios en el motor 3D, apps o iframe interno.
