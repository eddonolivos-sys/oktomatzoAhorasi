import * as THREE from 'three';
import { bankFromYawRate, limitAngularStep } from './flight-math';
import { CONTROL_CONFIG } from './space-config';

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
 * Ratón: movementX/Y acumulado en rawYaw/rawPitch (con o sin pointer lock). En
 * update() la mirada aplicada (yaw/pitch) se desliza hacia el raw con un límite de
 * velocidad angular (limitAngularStep): 1:1 exacto salvo picos bruscos, que se recortan.
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

  // Mirada: rawYaw/rawPitch reciben el delta del ratón 1:1; yaw/pitch (aplicados) se
  // deslizan hacia ellos en update() con un límite de velocidad angular (recorta picos).
  yaw = 0;
  pitch = 0;
  private rawYaw = 0;
  private rawPitch = 0;
  private roll = 0;
  private prevYaw = 0;

  private readonly velocity = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly tmp = new THREE.Vector3();

  // Sintonía
  sensitivity = CONTROL_CONFIG.sensitivity;
  maxLookRate = CONTROL_CONFIG.maxLookRate; // rad/s; límite de velocidad angular de la mirada (recorta picos)
  pitchLimit = 1.48; // ~85°
  rollDamp = 6;
  kRoll = 5.5;
  maxRoll = 0.55;
  acceleration = CONTROL_CONFIG.acceleration; // empuje continuo (u/s²); SIN maxSpeed
  strafeAccel = CONTROL_CONFIG.strafeAccel;
  // Damping expresado como factor POR FOTOGRAMA A 60FPS; se reescala con `delta`
  // (ver frameDamp) para que la velocidad terminal/manejo no dependan de los FPS.
  damping = 0.985; // inercia: cerca de 1 = conserva velocidad
  brakeDamping = 0.92; // damping extra al frenar (S/Shift)
  nitroMultiplier = CONTROL_CONFIG.nitroMultiplier;

  /** Frenado de aproximación: 1 normal; <1 amortigua la velocidad cerca de un planeta. */
  private approachBrake = 1;
  /** Modo órbita (#3): la posición la impone el motor; update() no integra empuje. */
  private orbiting = false;

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
    if (!on) {
      this.keys = {};
      this.velocity.set(0, 0, 0); // sin momento residual al reanudar
    }
  }

  /** Solicita el pointer lock sobre el canvas (botón "Tomar control" o clic). */
  requestControl() {
    if (document.pointerLockElement === this.canvas) return;
    // Chrome devuelve una Promise; si el lock falla (p.ej. cooldown ~1.2s tras
    // salir con ESC) no rompemos: el modo sin-lock sigue operativo. Captura el
    // rechazo para evitar un unhandled rejection.
    const r = this.canvas.requestPointerLock() as unknown;
    if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
  }

  get isLocked() {
    return this.locked;
  }

  /** Factor de frenado de aproximación (1 normal; <1 amortigua cerca de planeta). */
  setApproachBrake(factor: number) {
    this.approachBrake = Math.max(0, Math.min(1, factor));
  }

  /** Modo órbita (#3): el motor impone la posición; update() no integra empuje. */
  setOrbiting(on: boolean) {
    this.orbiting = on;
    if (on) this.velocity.set(0, 0, 0);
  }

  /** Añade un impulso a la velocidad (p. ej. expulsión radial al salir de la órbita). */
  applyImpulse(v: THREE.Vector3) {
    this.velocity.add(v);
  }

  /** ¿Hay alguna tecla de empuje/strafe/nitro/freno activa? (rompe la órbita en #3). */
  get isThrusting(): boolean {
    const k = this.keys;
    return !!(
      k['KeyW'] || k['ArrowUp'] || k['KeyS'] || k['ArrowDown'] ||
      k['KeyA'] || k['ArrowLeft'] || k['KeyD'] || k['ArrowRight'] ||
      k['ShiftLeft'] || k['ShiftRight']
    ); // Space ya NO es empuje (pasó a "entrar"); Shift es nitro (sí rompe la órbita)
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

  // Mirada con el delta del ratón (movementX/Y), que el navegador entrega haya o no
  // pointer lock. Acumula en rawYaw/rawPitch; update() desliza yaw/pitch hacia el raw con
  // un límite de velocidad angular (1:1 salvo picos). El clic solo añade la captura (lock)
  // para giro ilimitado sin tope del borde; la respuesta del ratón es igual en ambos modos.
  private onMouseMove = (e: MouseEvent) => {
    if (!this.enabled || this.orbiting) return; // en órbita no se controla la mirada (#3)
    this.rawYaw -= e.movementX * this.sensitivity;
    this.rawPitch -= e.movementY * this.sensitivity;
    this.rawPitch = Math.max(-this.pitchLimit, Math.min(this.pitchLimit, this.rawPitch));
  };

  // Al perder foco (alt-tab, foco al iframe de la cabina): soltar teclas.
  private onBlur = () => {
    this.keys = {};
  };

  /**
   * Reescala un factor de damping "por fotograma a 60fps" a un `delta` arbitrario.
   * factor^(delta·60): a 60fps (delta≈1/60) devuelve el factor original; a otros
   * FPS conserva la misma velocidad terminal (independiente del frame rate).
   */
  private frameDamp(factor: number, delta: number): number {
    return Math.pow(factor, delta * 60);
  }

  update(delta: number): ShipState {
    // Desliza la mirada aplicada hacia el objetivo crudo del ratón, recortando solo los
    // picos que superan maxLookRate (por debajo del umbral es 1:1 exacto, sin lag).
    this.yaw = limitAngularStep(this.yaw, this.rawYaw, this.maxLookRate, delta);
    this.pitch = limitAngularStep(this.pitch, this.rawPitch, this.maxLookRate, delta);

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

    // Deshabilitada (overlay de proyecto / menú ESC): la nave NO se traslada ni
    // amortigua. Mantiene su orientación actual; velocidad/estado se reportan a 0
    // para que el HUD y la cámara no muestren deriva detrás del menú abierto.
    if (!this.enabled) {
      return {
        position: this.object.position,
        velocity: this.velocity,
        quaternion: this.object.quaternion,
        yaw: this.yaw,
        pitch: this.pitch,
        roll: this.roll,
        speed: 0,
        isNitro: false,
        isBraking: false,
      };
    }

    if (this.orbiting) {
      // En órbita la posición la impone el motor (satélite): no se integra empuje
      // ni damping. La orientación (mirar con el ratón) ya se aplicó arriba.
      return {
        position: this.object.position,
        velocity: this.velocity,
        quaternion: this.object.quaternion,
        yaw: this.yaw,
        pitch: this.pitch,
        roll: this.roll,
        speed: 0,
        isNitro: false,
        isBraking: false,
      };
    }

    const isNitro = !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight']; // nitro en SHIFT
    const isBraking = !!this.keys['KeyS']; // freno/reversa en S (Shift pasó a nitro)

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

    // Damping: inercia normal, extra al frenar, y frenado de aproximación.
    // Cada factor está calibrado POR FOTOGRAMA A 60FPS y se reescala con `delta`
    // (frameDamp) → velocidad terminal/manejo independientes del frame rate.
    const base = isBraking ? this.brakeDamping : this.damping;
    const damp = this.frameDamp(base, delta) * this.frameDamp(this.approachBrake, delta);
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
