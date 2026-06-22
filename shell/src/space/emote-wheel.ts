import type { Emote } from './space-multiplayer';

/** Glifos sobrios (sin emojis a color) por sector e identificador de protocolo. */
const SECTORS: { sector: 0 | 1 | 2; emote: Emote; glyph: string; key: string }[] = [
  { sector: 0, emote: 'happy', glyph: ':)', key: '1' },
  { sector: 1, emote: 'sad', glyph: ':(', key: '2' },
  { sector: 2, emote: 'angry', glyph: '>:(', key: '3' },
];

/**
 * Rueda radial de emoticonos (overlay DOM, light DOM, estilos en space.css).
 * El motor la abre con la tecla `C`; cierra con `Esc` o al elegir. Selección por
 * clic en el sector o teclas 1/2/3. No usa Three.js.
 */
export class EmoteWheel {
  private root: HTMLDivElement;
  private onPick: (emote: Emote) => void;
  private isOpen = false;

  constructor(host: HTMLElement, onPick: (emote: Emote) => void) {
    this.onPick = onPick;
    this.root = document.createElement('div');
    this.root.id = 'emoteWheel';
    this.root.innerHTML = SECTORS.map(
      (s) =>
        `<button class="ew-sector" data-sector="${s.sector}" data-emote="${s.emote}" type="button">` +
        `${s.glyph}<span class="ew-key">${s.key}</span></button>`,
    ).join('');
    host.appendChild(this.root);

    this.root.querySelectorAll<HTMLButtonElement>('.ew-sector').forEach((btn) => {
      btn.addEventListener('click', () => {
        const emote = btn.dataset.emote as Emote;
        this.pick(emote);
      });
    });
    document.addEventListener('keydown', this.onKeyDown);
  }

  get visible(): boolean {
    return this.isOpen;
  }

  open() {
    this.isOpen = true;
    this.root.classList.add('visible');
  }

  close() {
    this.isOpen = false;
    this.root.classList.remove('visible');
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  private pick(emote: Emote) {
    this.onPick(emote);
    this.close();
  }

  // Teclas mientras la rueda está abierta: 1/2/3 eligen; Esc cierra sin enviar.
  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.isOpen) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    const match = SECTORS.find((s) => e.key === s.key);
    if (match) {
      e.preventDefault();
      this.pick(match.emote);
    }
  };

  dispose() {
    document.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
  }
}
