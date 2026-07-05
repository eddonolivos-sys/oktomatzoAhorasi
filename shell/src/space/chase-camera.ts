import * as THREE from 'three';
import type { ShipState } from './ship-controller';
import { CAMERA_CONFIG } from './space-config';

/**
 * Velocidad de referencia (u/s) que SATURA el kick de FOV y normaliza la barra de
 * nitro del HUD. Compartida para que cámara y HUD no se desincronicen.
 */
export const SPEED_FOV_REF = 3000;

/**
 * Cámara de persecución: en modo rígido (mejora 1, por defecto) sigue al raíz de
 * la nave 1:1 — posición = offset rotado por el quaternion del raíz, orientación
 * = quaternion del raíz — sin resorte ni adelanto de mirada por velocidad, para
 * que la nave quede clavada en el encuadre. `CAMERA_CONFIG.chaseRigid=false`
 * revierte al modo resorte (lerp de posición + mirar con adelanto por velocidad),
 * conservado tal cual para poder comparar/revertir el feel. En ambos modos aplica
 * el kick de FOV según velocidad/nitro. La cámara nunca rota en roll (el alabeo
 * lo lleva el visual de la nave en su pivote; el raíz solo lleva yaw/pitch).
 */
export class ChaseCamera {
  private readonly offset: THREE.Vector3;
  private readonly rigid: boolean;
  private readonly stiffness: number;
  private readonly fovBase: number;
  private readonly fovMax: number;

  // Sintonía del adelanto de mirada (solo modo resorte) y del kick de FOV.
  /** Segundos de velocidad proyectados hacia delante al fijar el punto de mira (modo resorte). */
  private readonly lookAheadSeconds = 0.15;
  /** Distancia (u) proyectada al frente de la nave para el punto de mira en modo rígido. */
  private readonly rigidLookAheadDistance = 100;
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
    opts?: { offset?: THREE.Vector3; rigid?: boolean; stiffness?: number; fovBase?: number; fovMax?: number },
  ) {
    this.offset = opts?.offset?.clone() ?? new THREE.Vector3(0, 9, 34);
    this.rigid = opts?.rigid ?? CAMERA_CONFIG.chaseRigid;
    this.stiffness = opts?.stiffness ?? CAMERA_CONFIG.chaseStiffness;
    this.fovBase = opts?.fovBase ?? 65;
    this.fovMax = opts?.fovMax ?? 86;
    this.camera.fov = this.fovBase;
    this.camera.updateProjectionMatrix();
  }

  update(shipRoot: THREE.Object3D, state: ShipState, delta: number) {
    // Posición deseada: detrás y arriba de la nave, en el marco de su orientación.
    this.desiredPos.copy(this.offset).applyQuaternion(shipRoot.quaternion).add(shipRoot.position);

    if (this.rigid) {
      // Rígido (mejora 1): sin lerp de posición ni lookAt — la orientación de la
      // cámara ES la del raíz de la nave (que solo lleva yaw/pitch, sin roll).
      this.camera.position.copy(this.desiredPos);
      this.camera.quaternion.copy(shipRoot.quaternion);
      this.camera.up.set(0, 1, 0); // mantiene un `up` sano para el blend orbital (S4)
      // Punto de mira delante de la nave (NO depende de la velocidad): solo lo
      // consume la transición hacia la pose orbital (S4, updateOrbitCameraBlend).
      this.tmp.set(0, 0, -1).applyQuaternion(shipRoot.quaternion);
      this.lookTarget.copy(shipRoot.position).addScaledVector(this.tmp, this.rigidLookAheadDistance);
    } else {
      // Resorte (feel anterior a la mejora 1, conservado para poder revertir).
      const t = 1 - Math.exp(-this.stiffness * delta);
      this.camera.position.lerp(this.desiredPos, t);
      this.lookTarget
        .copy(shipRoot.position)
        .add(this.tmp.copy(state.velocity).multiplyScalar(this.lookAheadSeconds));
      this.camera.up.set(0, 1, 0); // nunca rueda
      this.camera.lookAt(this.lookTarget);
    }

    // Kick de FOV: satura suave con la velocidad; nitro lo empuja más rápido.
    const speedNorm = Math.min(1, state.speed / this.fovSpeedRef) * (state.isNitro ? this.nitroFovBoost : 1);
    const targetFov = this.fovBase + (this.fovMax - this.fovBase) * Math.min(1, speedNorm);
    this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-this.fovDamp * delta));
    this.camera.updateProjectionMatrix();
  }

  /** Punto de mira calculado en el último `update()` (S4: base para la transición hacia la pose orbital). */
  get currentLookTarget(): THREE.Vector3 {
    return this.lookTarget;
  }
}
