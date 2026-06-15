import * as THREE from 'three';
import type { ShipState } from './ship-controller';

/**
 * Velocidad de referencia (u/s) que SATURA el kick de FOV y normaliza la barra de
 * nitro del HUD. Compartida para que cámara y HUD no se desincronicen.
 */
export const SPEED_FOV_REF = 600;

/**
 * Cámara de persecución: sigue al raíz de la nave con un resorte (lerp) y aplica
 * un kick de FOV según la velocidad/nitro (sensación de velocidad). Mira a la nave
 * con un adelanto en la dirección de la velocidad. La cámara NO rota en roll
 * (el alabeo lo lleva el visual de la nave en su pivote) → no marea.
 */
export class ChaseCamera {
  private readonly offset: THREE.Vector3;
  private readonly stiffness: number;
  private readonly fovBase: number;
  private readonly fovMax: number;

  // Sintonía del adelanto de mirada y del kick de FOV.
  /** Segundos de velocidad proyectados hacia delante al fijar el punto de mira. */
  private readonly lookAheadSeconds = 0.15;
  /** Velocidad (u/s) a la que el kick de FOV satura. */
  private readonly fovSpeedRef = SPEED_FOV_REF;
  /** Factor extra de saturación de FOV con nitro activo. */
  private readonly nitroFovBoost = 1.15;
  /** Tasa de suavizado del FOV (mayor = converge más rápido). */
  private readonly fovDamp = 4;

  private readonly desiredPos = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private camera: THREE.PerspectiveCamera,
    opts?: { offset?: THREE.Vector3; stiffness?: number; fovBase?: number; fovMax?: number },
  ) {
    this.offset = opts?.offset?.clone() ?? new THREE.Vector3(0, 9, 34);
    this.stiffness = opts?.stiffness ?? 8;
    this.fovBase = opts?.fovBase ?? 65;
    this.fovMax = opts?.fovMax ?? 86;
    this.camera.fov = this.fovBase;
    this.camera.updateProjectionMatrix();
  }

  update(shipRoot: THREE.Object3D, state: ShipState, delta: number) {
    // Posición deseada: detrás y arriba de la nave, en el marco de su orientación.
    this.desiredPos.copy(this.offset).applyQuaternion(shipRoot.quaternion).add(shipRoot.position);

    // Lerp de resorte (estable con delta variable).
    const t = 1 - Math.exp(-this.stiffness * delta);
    this.camera.position.lerp(this.desiredPos, t);

    // Mira a la nave con un pequeño adelanto en la dirección de la velocidad.
    this.lookTarget.copy(shipRoot.position).add(this.tmp.copy(state.velocity).multiplyScalar(this.lookAheadSeconds));
    this.camera.up.set(0, 1, 0); // nunca rueda
    this.camera.lookAt(this.lookTarget);

    // Kick de FOV: satura suave con la velocidad; nitro lo empuja más rápido.
    const speedNorm = Math.min(1, state.speed / this.fovSpeedRef) * (state.isNitro ? this.nitroFovBoost : 1);
    const targetFov = this.fovBase + (this.fovMax - this.fovBase) * Math.min(1, speedNorm);
    this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-this.fovDamp * delta));
    this.camera.updateProjectionMatrix();
  }
}
