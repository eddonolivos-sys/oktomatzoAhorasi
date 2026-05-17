const PREVENT_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown',
]);

export class InputController {
  private pressed = new Set<string>();

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (PREVENT_KEYS.has(e.code)) e.preventDefault();
    this.pressed.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.pressed.delete(e.code);
  };

  private onBlur = () => {
    this.pressed.clear();
  };

  isPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  get forward(): boolean  { return this.pressed.has('KeyW') || this.pressed.has('ArrowUp'); }
  get backward(): boolean { return this.pressed.has('KeyS') || this.pressed.has('ArrowDown'); }
  get turnLeft(): boolean { return this.pressed.has('KeyA') || this.pressed.has('ArrowLeft'); }
  get turnRight(): boolean{ return this.pressed.has('KeyD') || this.pressed.has('ArrowRight'); }
  get ascend(): boolean   { return this.pressed.has('KeyQ') || this.pressed.has('PageUp'); }
  get descend(): boolean  { return this.pressed.has('KeyE') || this.pressed.has('PageDown'); }
  get boost(): boolean    { return this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight'); }
  get brake(): boolean    { return this.pressed.has('Space'); }
  get cameraToggle(): boolean { return this.pressed.has('KeyV'); }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
