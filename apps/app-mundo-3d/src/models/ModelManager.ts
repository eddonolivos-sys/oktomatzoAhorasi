import {
  Viewer,
  Entity,
  Cartesian3,
  Color,
  HeadingPitchRoll,
  Transforms,
  ConstantPositionProperty,
  ConstantProperty,
  BoxGraphics,
  CylinderGraphics,
  ModelGraphics,
  Quaternion,
  LabelGraphics,
  VerticalOrigin,
  Cartesian2,
  DistanceDisplayCondition,
  NearFarScalar,
} from 'cesium';
import { VehicleSpec, VehicleType } from './vehicles';
import { VehicleState } from '../controls/PhysicsEngine';

export class ModelManager {
  private viewer: Viewer;
  private entity: Entity | null = null;
  private currentSpec: VehicleSpec | null = null;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  loadVehicle(spec: VehicleSpec, position: Cartesian3, modelUrl?: string) {
    if (this.entity) {
      this.viewer.entities.remove(this.entity);
    }
    this.currentSpec = spec;

    const color = Color.fromBytes(
      Math.round(spec.colorRgb[0]! * 255),
      Math.round(spec.colorRgb[1]! * 255),
      Math.round(spec.colorRgb[2]! * 255),
      255
    );

    const hpr = new HeadingPitchRoll(0, 0, 0);
    const orientation = Transforms.headingPitchRollQuaternion(position, hpr);

    const entityOptions: Entity.ConstructorOptions = {
      position: new ConstantPositionProperty(position),
      orientation: new ConstantProperty(orientation),
      label: {
        text: spec.name,
        font: '14px sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -40),
        distanceDisplayCondition: new DistanceDisplayCondition(0, 50000),
        translucencyByDistance: new NearFarScalar(1000, 1.0, 30000, 0.0),
      },
    };

    if (modelUrl) {
      entityOptions.model = new ModelGraphics({
        uri: modelUrl,
        minimumPixelSize: 32,
        maximumScale: 20000,
      });
    } else {
      entityOptions.box = this.buildShapeForVehicle(spec, color);
    }

    this.entity = this.viewer.entities.add(entityOptions);
  }

  private buildShapeForVehicle(spec: VehicleSpec, color: Color): BoxGraphics {
    const dims: Record<VehicleType, Cartesian3> = {
      car: new Cartesian3(4, 2, 1.5),
      plane: new Cartesian3(3, 18, 2),   // narrow body, wide wings approx
      boat: new Cartesian3(8, 3, 2),
    };
    return new BoxGraphics({
      dimensions: dims[spec.id],
      material: color.withAlpha(0.9),
      outline: true,
      outlineColor: Color.WHITE.withAlpha(0.6),
    });
  }

  updatePose(state: VehicleState) {
    if (!this.entity) return;

    const hpr = new HeadingPitchRoll(state.heading, 0, 0);
    const orientation = Transforms.headingPitchRollQuaternion(state.position, hpr);

    (this.entity.position as ConstantPositionProperty).setValue(state.position);
    (this.entity.orientation as ConstantProperty).setValue(orientation);
  }

  select() {
    if (!this.entity) return;
    this.viewer.selectedEntity = this.entity;
  }

  deselect() {
    this.viewer.selectedEntity = undefined;
  }

  get currentEntity(): Entity | null {
    return this.entity;
  }

  get spec(): VehicleSpec | null {
    return this.currentSpec;
  }

  destroy() {
    if (this.entity) {
      this.viewer.entities.remove(this.entity);
      this.entity = null;
    }
  }
}
