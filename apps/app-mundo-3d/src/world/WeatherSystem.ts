import {
  Viewer,
  JulianDate,
  ParticleSystem,
  Cartesian3,
  Color,
  CircleEmitter,
  Math as CesiumMath,
} from 'cesium';

export type WeatherMode = 'clear' | 'cloudy' | 'overcast';

export class WeatherSystem {
  private viewer: Viewer;
  private mode: WeatherMode = 'clear';
  private cloudiness = 0;
  private fogBase = 0.0002;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
    this.setMode('clear');
  }

  setMode(mode: WeatherMode) {
    this.mode = mode;
    switch (mode) {
      case 'clear':
        this.cloudiness = 0;
        this.viewer.scene.fog!.density = this.fogBase;
        this.viewer.scene.skyAtmosphere!.hueShift = 0;
        this.viewer.scene.skyAtmosphere!.saturationShift = 0;
        break;
      case 'cloudy':
        this.cloudiness = 0.5;
        this.viewer.scene.fog!.density = this.fogBase * 4;
        this.viewer.scene.skyAtmosphere!.hueShift = -0.05;
        this.viewer.scene.skyAtmosphere!.saturationShift = -0.3;
        break;
      case 'overcast':
        this.cloudiness = 1.0;
        this.viewer.scene.fog!.density = this.fogBase * 12;
        this.viewer.scene.skyAtmosphere!.hueShift = -0.1;
        this.viewer.scene.skyAtmosphere!.saturationShift = -0.6;
        this.viewer.scene.skyAtmosphere!.brightnessShift = -0.2;
        break;
    }
  }

  // Called each frame — adjusts atmosphere based on simulated time-of-day
  update(julianDate: JulianDate) {
    const date = JulianDate.toDate(julianDate);
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60;

    // Sunrise ~6, sunset ~18
    const dayFactor = Math.max(0, Math.min(1, Math.sin(((hour - 6) / 12) * Math.PI)));

    // Atmosphere colour shift: cooler at dawn/dusk
    const isTransition = hour < 7 || hour > 17;
    if (isTransition) {
      this.viewer.scene.skyAtmosphere!.hueShift = -0.03 + (1 - dayFactor) * -0.05;
    }

    // Globe lighting intensity follows sun angle
    if (this.viewer.scene.globe) {
      this.viewer.scene.globe.dynamicAtmosphereLighting = true;
    }
  }

  get currentMode(): WeatherMode {
    return this.mode;
  }
}
