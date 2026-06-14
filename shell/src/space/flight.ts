import * as THREE from 'three';

export interface FlightState {
  speed: number;
  isNitro: boolean;
  yaw: number;
  pitch: number;
}

/**
 * Control de vuelo: mirar DIRECTO con el ratón (movementX/Y aplicados sin
 * suavizado). FUNCIONA SIN clic ni pointer lock — mover el ratón gira la vista de
 * inmediato. Un clic en vacío activa Pointer Lock (giro ilimitado, cursor oculto);
 * el motor maneja el clic (seleccionar vs. bloquear). W/S avanzar/retroceder, A/D
 * strafe lateral, Space nitro. setSpeedScale() aplica la frontera blanda.
 */
export class FlightController {
  private keys: Record<string, boolean> = {};
  private pointerLocked = false;
  private mouseDX = 0;
  private mouseDY = 0;
  private velocity = new THREE.Vector3();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  yaw = 0;
  pitch = 0;
  maxSpeed = 90;
  acceleration = 120;
  damping = 0.96;
  nitroMultiplier = 28;
  sensitivity = 0.0022;
  pitchLimit = 1.35;
  enabled = true;
  private speedScale = 1;

  onPointerLockChange?: (locked: boolean) => void;
  onFirstInput?: () => void;
  private firstInputDone = false;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private canvas: HTMLCanvasElement,
  ) {}

  attach() {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('pointerlockchange', this.onPLChange);
    document.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('blur', this.onBlur);
  }

  detach() {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('pointerlockchange', this.onPLChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('blur', this.onBlur);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  get isPointerLocked() {
    return this.pointerLocked;
  }

  setEnabled(on: boolean) {
    if (this.enabled === on) return;
    this.enabled = on;
    if (!on) {
      this.keys = {};
      this.velocity.set(0, 0, 0);
      this.mouseDX = 0;
      this.mouseDY = 0;
    }
  }

  /** Escala de velocidad para la frontera blanda (1 = normal, →0.05 lejos de proyectos). */
  setSpeedScale(s: number) {
    this.speedScale = Math.max(0.05, Math.min(1, s));
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

  private onPLChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    if (this.pointerLocked) this.markInput();
    this.onPointerLockChange?.(this.pointerLocked);
  };

  // Acumula el desplazamiento del ratón SIEMPRE (con o sin pointer lock): así la
  // cámara responde de inmediato al mover el ratón, sin depender del bloqueo.
  private onMouseMove = (e: MouseEvent) => {
    if (!this.enabled) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
    this.markInput();
  };

  // Al perder foco (alt-tab, foco al iframe de la cabina) soltar todas las teclas.
  private onBlur = () => {
    this.keys = {};
  };

  update(delta: number): FlightState {
    if (!this.enabled) {
      return { speed: 0, isNitro: false, yaw: this.yaw, pitch: this.pitch };
    }

    // Mirar DIRECTO (sin suavizado): aplicar el desplazamiento acumulado del ratón,
    // haya o no pointer lock.
    if (this.mouseDX !== 0 || this.mouseDY !== 0) {
      this.yaw -= this.mouseDX * this.sensitivity;
      this.pitch -= this.mouseDY * this.sensitivity;
      this.pitch = Math.max(-this.pitchLimit, Math.min(this.pitchLimit, this.pitch));
      this.mouseDX = 0;
      this.mouseDY = 0;
    }
    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);

    this.forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.right.crossVectors(this.forward, this.up).normalize();

    const isNitro = !!this.keys['Space'];
    const mult = (isNitro ? this.nitroMultiplier : 1) * this.speedScale;
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
