/**
 * Deriva 2-3 iniciales legibles a partir del nombre de un proyecto (Hito 4 —
 * rótulo del planeta). Varias palabras → primera letra de hasta 3; una sola
 * palabra → sus 3 primeras letras. Pura, sin Three.js.
 */
export function initialsFor(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return '';
  if (words.length === 1) {
    return (words[0] ?? '').slice(0, 3).toUpperCase();
  }
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
