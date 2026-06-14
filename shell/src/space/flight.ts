import * as THREE from 'three';

export interface FlightState {
  speed: number;
  isNitro: boolean;
  yaw: number;
  pitch: number;
}

/**
 * Control de vuelo WASD + nitro (Space) + mirar con el mouse (Pointer Lock).
 * Mueve la cámara directamente. Previene scroll de página con Space/flechas.
 */
export class FlightController {
  private keys: Record<string, boolean> = {};
  private pointerLocked = false;
  private mouseDX = 0;
  private mouseDY = 0;
  private velocity = new THREE.Vector3();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private forward = new THREE.Vector3();

  yaw = 0;
  pitch = 0;
  maxSpeed = 30;
  acceleration = 20;
  damping = 0.97;
  rotationSpeed = 1.2;
  nitroMultiplier = 3;
  sensitivity = 0.002;

  onPointerLockChange?: (locked: boolean) => void;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private canvas: HTMLCanvasElement,
  ) {}

  attach() {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('click', this.onCanvasClick);
    document.addEventListener('pointerlockchange', this.onPLChange);
    document.addEventListener('mousemove', this.onMouseMove);
  }

  detach() {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('click', this.onCanvasClick);
    document.removeEventListener('pointerlockchange', this.onPLChange);
    document.removeEventListener('mousemove', this.onMouseMove);
  }

  get isPointerLocked() {
    return this.pointerLocked;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onCanvasClick = () => {
    if (!this.pointerLocked) this.canvas.requestPointerLock();
  };

  private onPLChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    this.onPointerLockChange?.(this.pointerLocked);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.pointerLocked) {
      this.mouseDX = e.movementX;
      this.mouseDY = e.movementY;
    }
  };

  update(delta: number): FlightState {
    if (this.pointerLocked) {
      this.yaw -= this.mouseDX * this.sensitivity;
      this.pitch -= this.mouseDY * this.sensitivity;
      this.pitch = Math.max(-0.8, Math.min(0.8, this.pitch));
      this.mouseDX = 0;
      this.mouseDY = 0;
    }

    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);

    this.forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);

    const isNitro = !!this.keys['Space'];
    const mult = isNitro ? this.nitroMultiplier : 1;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) {
      this.velocity.add(this.forward.clone().multiplyScalar(this.acceleration * delta * mult));
    }
    if (this.keys['KeyS'] || this.keys['ArrowDown']) {
      this.velocity.sub(this.forward.clone().multiplyScalar(this.acceleration * delta * 0.5));
    }
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
      this.yaw -= this.rotationSpeed * delta;
    }
    if (this.keys['KeyD'] || this.keys['ArrowRight']) {
      this.yaw += this.rotationSpeed * delta;
    }

    const max = this.maxSpeed * mult;
    if (this.velocity.length() > max) this.velocity.normalize().multiplyScalar(max);
    this.velocity.multiplyScalar(this.damping);
    this.camera.position.add(this.velocity.clone().multiplyScalar(delta));

    return { speed: this.velocity.length(), isNitro, yaw: this.yaw, pitch: this.pitch };
  }
}
