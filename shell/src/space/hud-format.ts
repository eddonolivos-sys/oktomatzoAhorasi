/**
 * Formateadores puros del HUD (sin Three.js, testeables en node).
 * Patrón de layout.ts: numbers in, strings out.
 */

const MINUS = '−'; // signo menos tipográfico
const THIN = ' '; // separador de miles (espacio fino no separable)

function groupThousands(n: number): string {
  // n es un entero no negativo; agrupa de 3 en 3 con THIN.
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

/** Altitud real en unidades de escena (ship.y + worldOffset.y). */
export function formatAltitude(y: number): string {
  const rounded = Math.round(y);
  const sign = rounded < 0 ? MINUS : '+';
  return `${sign}${groupThousands(Math.abs(rounded))} u`;
}

/** Rumbo en grados 0..359 (3 dígitos) a partir del yaw en radianes. */
export function formatHeading(yaw: number): string {
  let deg = Math.round((yaw * 180) / Math.PI) % 360;
  if (deg < 0) deg += 360;
  if (deg === 360) deg = 0;
  return String(deg).padStart(3, '0');
}
