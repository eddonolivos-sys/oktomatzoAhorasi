import { describe, it, expect } from 'vitest';
import { initialsFor } from './initials';

describe('initialsFor (Hito 4 — rótulo de planeta)', () => {
  it('varias palabras: primera letra de cada una, hasta 3', () => {
    expect(initialsFor('Dashboard Comercial')).toBe('DC');
    expect(initialsFor('Visor 3D')).toBe('V3');
    expect(initialsFor('Proyecto de prueba 1')).toBe('PDP');
  });

  it('una sola palabra: sus 3 primeras letras', () => {
    expect(initialsFor('TattooAR')).toBe('TAT');
    expect(initialsFor('Ramatzo')).toBe('RAM');
  });

  it('palabra corta (menos de 3 letras) devuelve lo que haya', () => {
    expect(initialsFor('Go')).toBe('GO');
  });

  it('espacios extra no afectan el resultado', () => {
    expect(initialsFor('  Mundo   3D  ')).toBe('M3');
  });

  it('cadena vacía devuelve cadena vacía', () => {
    expect(initialsFor('')).toBe('');
    expect(initialsFor('   ')).toBe('');
  });

  it('siempre en mayúsculas', () => {
    expect(initialsFor('búsqueda')).toBe('BÚS');
  });
});
