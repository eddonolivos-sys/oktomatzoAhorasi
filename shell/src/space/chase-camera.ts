import * as THREE from 'three';
import type { ShipState } from './ship-controller';

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
    this.lookTarget.copy(shipRoot.position).add(this.tmp.copy(state.velocity).multiplyScalar(0.15));
    this.camera.up.set(0, 1, 0); // nunca rueda
    this.camera.lookAt(this.lookTarget);

    // Kick de FOV: satura suave con la velocidad; nitro lo empuja más rápido.
    const speedNorm = Math.min(1, state.speed / 600) * (state.isNitro ? 1.15 : 1);
    const targetFov = this.fovBase + (this.fovMax - this.fovBase) * Math.min(1, speedNorm);
    this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-4 * delta));
    this.camera.updateProjectionMatrix();
  }
}
