import {
  Viewer,
  Cartesian3,
  HeadingPitchRange,
  HeadingPitchRoll,
  Math as CesiumMath,
} from 'cesium';
import { InputController } from './InputController';
import { VehicleState } from './PhysicsEngine';

export type CameraMode = 'follow' | 'free';

const FOLLOW_DISTANCE = 80;   // m behind vehicle
const FOLLOW_HEIGHT   = 25;   // m above vehicle
const FOLLOW_PITCH    = CesiumMath.toRadians(-15);

export class CameraController {
  private viewer: Viewer;
  private input: InputController;
  private mode: CameraMode = 'follow';
  private vKeyWasDown = false;

  constructor(viewer: Viewer, input: InputController) {
    this.viewer = viewer;
    this.input = input;
    this.setMode('follow');
  }

  get currentMode(): CameraMode {
    return this.mode;
  }

  setMode(mode: CameraMode) {
    this.mode = mode;
    this.viewer.scene.screenSpaceCameraController.enableRotate = mode === 'free';
    this.viewer.scene.screenSpaceCameraController.enableTranslate = mode === 'free';
    this.viewer.scene.screenSpaceCameraController.enableZoom = mode === 'free';
    this.viewer.scene.screenSpaceCameraController.enableTilt = mode === 'free';
    this.viewer.scene.screenSpaceCameraController.enableLook = mode === 'free';
  }

  toggleMode() {
    this.setMode(this.mode === 'follow' ? 'free' : 'follow');
  }

  update(state: VehicleState) {
    // Toggle camera on V key edge
    const vDown = this.input.cameraToggle;
    if (vDown && !this.vKeyWasDown) this.toggleMode();
    this.vKeyWasDown = vDown;

    if (this.mode !== 'follow') return;

    // Position camera behind and above the vehicle
    this.viewer.camera.lookAt(
      state.position,
      new HeadingPitchRange(
        state.heading,
        FOLLOW_PITCH,
        FOLLOW_DISTANCE
      )
    );
  }

  // Release camera lock (call when switching to free mode)
  release() {
    this.viewer.camera.lookAtTransform(
      // @ts-expect-error: IDENTITY is not in typedefs for lookAtTransform directly
      Cartesian3.ZERO as never
    );
  }
}
