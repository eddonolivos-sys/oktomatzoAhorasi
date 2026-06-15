import * as THREE from 'three';
import { bankFromYawRate } from './flight-math';

/**
 * Estado de la nave que consumen HUD, radar, cámara de persecución y player-ship.
 * Contrato compartido del subsistema espacial.
 */
export interface ShipState {
  position: THREE.Vector3; // espacio de escena; suma worldOffset para HUD/altitud
  velocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  isNitro: boolean;
  isBraking: boolean;
}

/**
 * Control de vuelo: la nave es una ENTIDAD en el mundo. El raíz (`object`)
 * recibe posición + yaw/pitch (marco que orienta la velocidad). Un pivote interno
 * recibe SOLO el roll → el visual de la nave se inclina en los giros pero la cámara,
 * que sigue al raíz, nunca rota en roll (no marea).
 *
 * Ratón: SOLO con pointer lock (movementX/Y), acumulado en targetYaw/targetPitch
 * y suavizado (damp) → sin tirones ni bloqueo en el borde de la ventana.
 * Teclado: W empuje continuo (sin tope), S/Shift freno, A/D strafe, Space nitro.
 */
export class ShipController {
  /** Raíz: posición + yaw/pitch. La cámara de persecución lo sigue. */
  readonly object = new THREE.Group();
  /** Pivote interno que recibe el roll; el visual de la nave cuelga de aquí. */
  private readonly rollPivot = new THREE.Group();

  private enabled = true;
  private locked = false;
  private keys: Record<string, boolean> = {};

  // Mirada: target acumula el ratón; yaw/pitch siguen con damp.
  private targetYaw = 0;
  private targetPitch = 0;
  yaw = 0;
  pitch = 0;
  private roll = 0;
  private prevYaw = 0;

  private readonly velocity = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly tmp = new THREE.Vector3();

  // Sintonía
  sensitivity = 0.0022;
  pitchLimit = 1.48; // ~85°
  lookDamp = 12; // mayor = mirada más directa
  rollDamp = 6;
  kRoll = 5.5;
  maxRoll = 0.55;
  acceleration = 140; // empuje continuo (u/s²); SIN maxSpeed
  strafeAccel = 90;
  damping = 0.985; // inercia: cerca de 1 = conserva velocidad
  brakeDamping = 0.92; // damping extra al frenar (S/Shift)
  nitroMultiplier = 6;

  /** Frenado de aproximación: 1 normal; <1 amortigua la velocidad cerca de un planeta. */
  private approachBrake = 1;

  onLockChange?: (locked: boolean) => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.object.add(this.rollPivot);
  }

  /** Adjunta el visual de la nave bajo el pivote de roll. */
  attachVisual(g: THREE.Object3D) {
    this.rollPivot.add(g);
  }

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

  setEnabled(on: boolean) {
    if (this.enabled === on) return;
    this.enabled = on;
    if (!on) this.keys = {};
  }

  /** Solicita el pointer lock sobre el canvas (botón "Tomar control" o clic). */
  requestControl() {
    if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock();
  }

  get isLocked() {
    return this.locked;
  }

  /** Factor de frenado de aproximación (1 normal; <1 amortigua cerca de planeta). */
  setApproachBrake(factor: number) {
    this.approachBrake = Math.max(0, Math.min(1, factor));
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onPLChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    this.onLockChange?.(this.locked);
  };

  // Solo con pointer lock: acumula el delta del ratón en el target de la mirada.
  private onMouseMove = (e: MouseEvent) => {
    if (!this.enabled || !this.locked) return;
    this.targetYaw -= e.movementX * this.sensitivity;
    this.targetPitch -= e.movementY * this.sensitivity;
    this.targetPitch = Math.max(-this.pitchLimit, Math.min(this.pitchLimit, this.targetPitch));
  };

  // Al perder foco (alt-tab, foco al iframe de la cabina): soltar teclas.
  private onBlur = () => {
    this.keys = {};
  };

  update(delta: number): ShipState {
    if (this.enabled) {
      // Mirada suavizada hacia el target (sin tirones). Si no hay lock, target no
      // cambia → la mirada se congela pero la nave conserva inercia.
      const t = 1 - Math.exp(-this.lookDamp * delta);
      this.yaw += (this.targetYaw - this.yaw) * t;
      this.pitch += (this.targetPitch - this.pitch) * t;
    }

    // Tasa de giro de yaw → alabeo objetivo (clamp). El roll lerp hacia el target.
    const yawRate = delta > 0 ? (this.yaw - this.prevYaw) / delta : 0;
    this.prevYaw = this.yaw;
    const targetRoll = bankFromYawRate(yawRate, this.kRoll, this.maxRoll);
    const rt = 1 - Math.exp(-this.rollDamp * delta);
    this.roll += (targetRoll - this.roll) * rt;

    // Raíz: yaw/pitch. Pivote: solo roll (la cámara no rota en roll).
    this.euler.set(this.pitch, this.yaw, 0);
    this.object.quaternion.setFromEuler(this.euler);
    this.rollPivot.rotation.set(0, 0, this.roll);

    // Ejes en el marco del raíz.
    this.forward.set(0, 0, -1).applyQuaternion(this.object.quaternion);
    this.right.crossVectors(this.forward, this.up).normalize();

    const isNitro = !!this.keys['Space'];
    const isBraking = !!this.keys['KeyS'] || !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight'];

    if (this.enabled) {
      const mult = isNitro ? this.nitroMultiplier : 1;
      // Empuje continuo SIN tope: mientras se mantiene W, la velocidad crece.
      if (this.keys['KeyW'] || this.keys['ArrowUp']) {
        this.velocity.add(this.tmp.copy(this.forward).multiplyScalar(this.acceleration * mult * delta));
      }
      // Strafe.
      if (this.keys['KeyD'] || this.keys['ArrowRight']) {
        this.velocity.add(this.tmp.copy(this.right).multiplyScalar(this.strafeAccel * delta));
      }
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
        this.velocity.sub(this.tmp.copy(this.right).multiplyScalar(this.strafeAccel * delta));
      }
    }

    // Damping: inercia normal, extra al frenar, y frenado de aproximación.
    let damp = isBraking ? this.brakeDamping : this.damping;
    damp *= this.approachBrake; // <1 amortigua cerca de un planeta
    this.velocity.multiplyScalar(damp);

    // Integración de la posición del raíz.
    this.object.position.add(this.tmp.copy(this.velocity).multiplyScalar(delta));

    return {
      position: this.object.position,
      velocity: this.velocity,
      quaternion: this.object.quaternion,
      yaw: this.yaw,
      pitch: this.pitch,
      roll: this.roll,
      speed: this.velocity.length(),
      isNitro,
      isBraking,
    };
  }

  /** Rebase de origen: traslada la nave junto con el mundo (preserva worldOffset fuera). */
  rebase(delta: THREE.Vector3) {
    this.object.position.sub(delta);
  }
}
