import 'cesium/Build/Cesium/Widgets/widgets.css';
import { Cartesian3, Cartographic, JulianDate, Math as CesiumMath } from 'cesium';
import { ShellBridge } from './shell/ShellBridge';
import { WorldEngine } from './world/WorldEngine';
import { LayerManager } from './world/LayerManager';
import { WeatherSystem } from './world/WeatherSystem';
import { ModelManager } from './models/ModelManager';
import { VEHICLES, VehicleType } from './models/vehicles';
import { InputController } from './controls/InputController';
import { PhysicsEngine } from './controls/PhysicsEngine';
import { CameraController } from './controls/CameraController';
import { HUD } from './ui/HUD';
import { ControlPanel } from './ui/ControlPanel';

// — Initial geographic position: Grand Teton, Wyoming —
const INITIAL_POS = Cartesian3.fromDegrees(-110.6818, 43.7904, 3500);

// — Shell integration —
const shell = new ShellBridge('mundo-3d');

// — World engine (reads Ion token from env, no fallback hardcoded) —
const world = new WorldEngine(import.meta.env.VITE_CESIUM_ION_TOKEN ?? '');

// — Subsystems —
const layers  = new LayerManager(world.viewer);
const weather = new WeatherSystem(world.viewer);
const input   = new InputController();

// — Initial vehicle: plane —
let activeType: VehicleType = 'plane';
let activeSpec = VEHICLES[activeType];

const modelMgr = new ModelManager(world.viewer);
const modelUrl = import.meta.env.VITE_MODEL_PLANE_URL;
modelMgr.loadVehicle(activeSpec, INITIAL_POS, modelUrl);

const physics = new PhysicsEngine(world.globe, activeSpec, INITIAL_POS, input);
const camera  = new CameraController(world.viewer, input);
const hud     = new HUD();
hud.setVehicleSpec(activeSpec);

// — Control panel wired to subsystems —
const panel = new ControlPanel({
  onLayerChange: (layer) => layers.setLayer(layer),

  onVehicleChange: (type) => {
    activeType = type;
    activeSpec = VEHICLES[type];

    const urls: Record<VehicleType, string | undefined> = {
      car:   import.meta.env.VITE_MODEL_CAR_URL,
      plane: import.meta.env.VITE_MODEL_PLANE_URL,
      boat:  import.meta.env.VITE_MODEL_BOAT_URL,
    };

    const currentPos = physics.vehicleState.position;
    modelMgr.loadVehicle(activeSpec, currentPos, urls[type]);
    physics.switchSpec(activeSpec);
    hud.setVehicleSpec(activeSpec);
    panel.setActiveVehicle(type);
    shell.notify('info', `Vehículo: ${activeSpec.name}`);
  },

  onWeatherChange: (mode) => weather.setMode(mode),
});

// — Fly to initial position —
world.viewer.camera.flyTo({
  destination: Cartesian3.fromDegrees(-110.6818, 43.7904, 12000),
  duration: 3,
});

// — Main update loop —
let prevTime: number | null = null;

world.viewer.scene.preUpdate.addEventListener((_scene, time) => {
  const nowMs = Date.now();
  const dt = prevTime !== null ? (nowMs - prevTime) / 1000 : 0.016;
  prevTime = nowMs;

  physics.update(dt);

  const state = physics.vehicleState;
  modelMgr.updatePose(state);
  camera.update(state);
  hud.update(state, camera.currentMode);
  weather.update(time as JulianDate);
});

// — Shell theme sync —
shell.onThemeChange = (mode) => {
  document.documentElement.setAttribute('data-theme', mode);
};

// — Cleanup —
window.addEventListener('beforeunload', () => {
  input.destroy();
  modelMgr.destroy();
  hud.destroy();
  panel.destroy();
  shell.destroy();
  world.destroy();
});
