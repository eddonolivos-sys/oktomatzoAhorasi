import {
  Viewer,
  Ion,
  Cartesian3,
  createWorldTerrainAsync,
  EllipsoidTerrainProvider,
  Color,
  JulianDate,
  ClockRange,
  ClockStep,
  SkyBox,
} from 'cesium';

export class WorldEngine {
  readonly viewer: Viewer;

  constructor(ionToken: string) {
    if (ionToken) {
      Ion.defaultAccessToken = ionToken;
    }

    const container = document.getElementById('cesium-container');
    if (!container) throw new Error('cesium-container not found');

    this.viewer = new Viewer(container, {
      animation: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      vrButton: false,
      shouldAnimate: true,
      terrainProvider: new EllipsoidTerrainProvider(),
    });

    this.viewer.scene.globe.enableLighting = true;
    this.viewer.scene.globe.depthTestAgainstTerrain = true;
    this.viewer.scene.fog.enabled = true;
    this.viewer.scene.fog.density = 0.0002;
    if (this.viewer.scene.skyAtmosphere) {
      this.viewer.scene.skyAtmosphere.show = true;
    }

    // Set clock for day/night cycle (1 simulated hour per real second)
    this.viewer.clock.clockRange = ClockRange.LOOP_STOP;
    this.viewer.clock.clockStep = ClockStep.SYSTEM_CLOCK_MULTIPLIER;
    this.viewer.clock.multiplier = 60;

    if (ionToken) {
      this.loadTerrain();
    }
  }

  private async loadTerrain() {
    try {
      const terrain = await createWorldTerrainAsync({ requestVertexNormals: true });
      this.viewer.scene.terrainProvider = terrain;
    } catch {
      console.warn('[mundo-3d] terrain unavailable, using ellipsoid');
    }
  }

  flyTo(position: Cartesian3, altitude = 5000) {
    this.viewer.camera.flyTo({
      destination: Cartesian3.fromElements(
        position.x,
        position.y,
        position.z + altitude
      ),
      duration: 2,
    });
  }

  get globe() {
    return this.viewer.scene.globe;
  }

  get scene() {
    return this.viewer.scene;
  }

  get clock() {
    return this.viewer.clock;
  }

  destroy() {
    this.viewer.destroy();
  }
}
