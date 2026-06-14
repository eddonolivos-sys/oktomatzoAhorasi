import * as THREE from 'three';

export interface FlightState {
  speed: number;
  isNitro: boolean;
  yaw: number;
  pitch: number;
}

/**
 * Control de vuelo libre (sin pointer lock):
 *  - Ratón: mirar. La vista rota según el desplazamiento del cursor respecto al
 *    centro (rate-based, con zona muerta central). No hace falta clic.
 *  - W/S: avanzar / retroceder (en la dirección de la vista, navegación 3D).
 *  - A/D: desplazamiento lateral (strafe), no rotación.
 *  - Space: nitro.
 * Previene scroll de página con Space/flechas. Expone el cursor en NDC para
 * raycast de selección y etiquetas.
 */
export class FlightController {
  private keys: Record<string, boolean> = {};
  private velocity = new THREE.Vector3();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  /** Cursor relativo al centro del canvas, en [-1, 1] (y hacia abajo positivo). */
  private cursorX = 0;
  private cursorY = 0;
  hasCursor = false;

  yaw = 0;
  pitch = 0;
  maxSpeed = 90;
  acceleration = 95;
  damping = 0.96;
  nitroMultiplier = 10;
  lookSpeed = 1.9; // rad/s al borde de la pantalla
  deadZone = 0.14; // fracción central sin rotación
  pitchLimit = 1.3;
  enabled = true;

  onFirstInput?: () => void;
  private firstInputDone = false;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private canvas: HTMLCanvasElement,
  ) {}

  attach() {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);
    window.addEventListener('blur', this.onBlur);
  }

  detach() {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    window.removeEventListener('blur', this.onBlur);
  }

  /** Activa/desactiva el control (overlay de proyecto o cabina abiertos). */
  setEnabled(on: boolean) {
    if (this.enabled === on) return;
    this.enabled = on;
    if (!on) {
      this.keys = {};
      this.velocity.set(0, 0, 0);
    }
  }

  /** Cursor en coordenadas NDC (-1..1, y hacia arriba) para raycast. */
  get cursorNDC(): THREE.Vector2 {
    return new THREE.Vector2(this.cursorX, -this.cursorY);
  }

  private markInput() {
    if (!this.firstInputDone) {
      this.firstInputDone = true;
      this.onFirstInput?.();
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    this.markInput();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.cursorX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.cursorY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    this.hasCursor = true;
    this.markInput();
  };

  private onMouseLeave = () => {
    this.hasCursor = false;
  };

  // Al perder foco (alt-tab, foco al iframe de la cabina) soltar todas las teclas
  // para que la nave no quede acelerando sola.
  private onBlur = () => {
    this.keys = {};
  };

  private applyDeadZone(v: number): number {
    const a = Math.abs(v);
    if (a < this.deadZone) return 0;
    const t = (a - this.deadZone) / (1 - this.deadZone);
    return Math.sign(v) * t * t; // curva cuadrática: suave cerca del centro
  }

  update(delta: number): FlightState {
    if (!this.enabled) {
      return { speed: 0, isNitro: false, yaw: this.yaw, pitch: this.pitch };
    }
    // Mirar: rotación proporcional al offset del cursor (sin pointer lock).
    if (this.hasCursor) {
      this.yaw -= this.applyDeadZone(this.cursorX) * this.lookSpeed * delta;
      this.pitch -= this.applyDeadZone(this.cursorY) * this.lookSpeed * delta;
      this.pitch = Math.max(-this.pitchLimit, Math.min(this.pitchLimit, this.pitch));
    }
    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);

    this.forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.right.crossVectors(this.forward, this.up).normalize();

    const isNitro = !!this.keys['Space'];
    const mult = isNitro ? this.nitroMultiplier : 1;
    const accel = this.acceleration * delta * mult;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) this.velocity.add(this.forward.clone().multiplyScalar(accel));
    if (this.keys['KeyS'] || this.keys['ArrowDown']) this.velocity.sub(this.forward.clone().multiplyScalar(accel * 0.6));
    if (this.keys['KeyD'] || this.keys['ArrowRight']) this.velocity.add(this.right.clone().multiplyScalar(accel));
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) this.velocity.sub(this.right.clone().multiplyScalar(accel));

    const max = this.maxSpeed * mult;
    if (this.velocity.length() > max) this.velocity.normalize().multiplyScalar(max);
    this.velocity.multiplyScalar(this.damping);
    this.camera.position.add(this.velocity.clone().multiplyScalar(delta));

    return { speed: this.velocity.length(), isNitro, yaw: this.yaw, pitch: this.pitch };
  }
}
