/**
 * Decide si mostrar el aviso "se requiere teclado y ratón" (mejora 4). No hay
 * API web para detectar un teclado físico conectado; el proxy estándar es
 * comprobar si existe ALGÚN puntero fino disponible (mouse/trackpad) además
 * del primario: un dispositivo puramente táctil (móvil/tablet sin teclado)
 * no tiene ninguno, mientras que un portátil con pantalla táctil sí. Pura,
 * sin DOM — el llamador pasa los resultados de matchMedia.
 */
export function shouldWarnDesktopOnly(pointerCoarse: boolean, anyPointerFine: boolean): boolean {
  return pointerCoarse && !anyPointerFine;
}
