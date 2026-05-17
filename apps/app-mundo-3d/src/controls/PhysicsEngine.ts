import {
  Cartesian3,
  Cartographic,
  Transforms,
  Matrix4,
  Globe,
} from 'cesium';
import { VehicleSpec } from '../models/vehicles';
import { InputController } from './InputController';

export interface VehicleState {
  position: Cartesian3;
  heading: number;      // radians, 0=north, PI/2=east
  speed: number;        // m/s horizontal
  vertSpeed: number;    // m/s vertical
  altitude: number;     // m above ellipsoid
  terrainHeight: number;// m of terrain at current lon/lat
}

export class PhysicsEngine {
  private state: VehicleState;
  private spec: VehicleSpec;
  private readonly input: InputController;
  private readonly globe: Globe;
  private lastTime: number | null = null;

  constructor(
    globe: Globe,
    spec: VehicleSpec,
    initialPosition: Cartesian3,
    input: InputController
  ) {
    this.globe = globe;
    this.spec = spec;
    this.input = input;

    const carto = Cartographic.fromCartesian(initialPosition);
    this.state = {
      position: initialPosition.clone(),
      heading: 0,
      speed: 0,
      vertSpeed: 0,
      altitude: carto.height,
      terrainHeight: 0,
    };
  }

  get vehicleState(): VehicleState {
    return this.state;
  }

  switchSpec(spec: VehicleSpec, position?: Cartesian3) {
    this.spec = spec;
    this.state.speed = 0;
    this.state.vertSpeed = 0;
    if (position) {
      this.state.position = position.clone();
      const c = Cartographic.fromCartesian(position);
      this.state.altitude = c.height;
    }
  }

  setPosition(pos: Cartesian3) {
    this.state.position = pos.clone();
    const c = Cartographic.fromCartesian(pos);
    this.state.altitude = c.height;
  }

  // dt in seconds
  update(dt: number) {
    // clamp dt to avoid spiral of death on tab switch
    const safeDt = Math.min(dt, 0.1);
    const { spec, input, state } = this;
    const boostMult = input.boost ? 2.0 : 1.0;
    const maxSpd = spec.maxSpeed * boostMult;

    // — Rotation —
    if (input.turnLeft)  state.heading -= spec.turnRate * safeDt;
    if (input.turnRight) state.heading += spec.turnRate * safeDt;

    // — Horizontal speed —
    if (input.brake) {
      state.speed    *= Math.pow(0.85, safeDt * 60);
      state.vertSpeed *= Math.pow(0.85, safeDt * 60);
    } else {
      if (input.forward) {
        state.speed = Math.min(state.speed + spec.acceleration * safeDt, maxSpd);
      } else if (input.backward) {
        state.speed = Math.max(state.speed - spec.acceleration * safeDt, -maxSpd * 0.35);
      } else {
        // Inertial friction
        state.speed *= Math.pow(spec.friction, safeDt * 60);
        if (Math.abs(state.speed) < 0.05) state.speed = 0;
      }

      // — Vertical speed (aerial/marine) —
      if (spec.isAerial) {
        if (input.ascend) {
          state.vertSpeed = Math.min(state.vertSpeed + spec.verticalSpeed * safeDt, spec.verticalSpeed);
        } else if (input.descend) {
          state.vertSpeed = Math.max(state.vertSpeed - spec.verticalSpeed * safeDt, -spec.verticalSpeed);
        } else {
          state.vertSpeed *= Math.pow(0.97, safeDt * 60);
          if (Math.abs(state.vertSpeed) < 0.05) state.vertSpeed = 0;
        }
      }
    }

    if (state.speed === 0 && state.vertSpeed === 0) {
      this.sampleTerrainHeight();
      return;
    }

    // — Compute local ENU frame —
    const transform = Transforms.eastNorthUpToFixedFrame(state.position);
    const east  = Matrix4.getColumn(transform, 0, new Cartesian3());
    const north = Matrix4.getColumn(transform, 1, new Cartesian3());
    const up    = Matrix4.getColumn(transform, 2, new Cartesian3());

    const cosH = Math.cos(state.heading);
    const sinH = Math.sin(state.heading);

    // forward = sinH*east + cosH*north
    const fwd = Cartesian3.add(
      Cartesian3.multiplyByScalar(east,  sinH, new Cartesian3()),
      Cartesian3.multiplyByScalar(north, cosH, new Cartesian3()),
      new Cartesian3()
    );

    let newPos = Cartesian3.add(
      state.position,
      Cartesian3.multiplyByScalar(fwd, state.speed * safeDt, new Cartesian3()),
      new Cartesian3()
    );

    if (state.vertSpeed !== 0) {
      newPos = Cartesian3.add(
        newPos,
        Cartesian3.multiplyByScalar(up, state.vertSpeed * safeDt, new Cartesian3()),
        new Cartesian3()
      );
    }

    // — Terrain collision & altitude clamping —
    const carto = Cartographic.fromCartesian(newPos);
    const terrainH = this.globe.getHeight(carto) ?? 0;
    state.terrainHeight = terrainH;

    if (spec.isAerial) {
      const minH = terrainH + spec.minAltitude;
      if (carto.height < minH) {
        carto.height = minH;
        if (state.vertSpeed < 0) state.vertSpeed = 0;
      }
      if (carto.height > spec.maxAltitude) {
        carto.height = spec.maxAltitude;
        if (state.vertSpeed > 0) state.vertSpeed = 0;
      }
      newPos = Cartographic.toCartesian(carto);
    } else if (spec.isMarine) {
      carto.height = Math.max(spec.minAltitude, Math.min(spec.maxAltitude, carto.height));
      newPos = Cartographic.toCartesian(carto);
    } else {
      // Ground vehicle — roll with terrain
      carto.height = terrainH;
      newPos = Cartographic.toCartesian(carto);
    }

    state.altitude = carto.height;
    state.position = newPos;
  }

  private sampleTerrainHeight() {
    const carto = Cartographic.fromCartesian(this.state.position);
    this.state.terrainHeight = this.globe.getHeight(carto) ?? 0;
  }
}
