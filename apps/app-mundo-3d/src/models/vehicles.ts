export type VehicleType = 'car' | 'plane' | 'boat';

export interface VehicleSpec {
  id: VehicleType;
  name: string;
  description: string;
  maxSpeed: number;      // m/s
  acceleration: number;  // m/s²
  friction: number;      // velocity multiplier per tick (0-1)
  turnRate: number;      // rad/s
  minAltitude: number;   // m above terrain (car=0, boat~0, plane=200)
  maxAltitude: number;   // m above ellipsoid
  verticalSpeed: number; // m/s vertical capability (0 = none)
  isAerial: boolean;
  isMarine: boolean;
  colorRgb: [number, number, number]; // normalized 0-1
  modelUrl?: string;     // injected from env at runtime
}

export const VEHICLES: Record<VehicleType, VehicleSpec> = {
  car: {
    id: 'car',
    name: 'Vehículo Terrestre',
    description: 'Se desplaza sobre la superficie del terreno',
    maxSpeed: 55,
    acceleration: 12,
    friction: 0.88,
    turnRate: 1.4,
    minAltitude: 0,
    maxAltitude: 0,       // clamped to terrain height
    verticalSpeed: 0,
    isAerial: false,
    isMarine: false,
    colorRgb: [0.2, 0.6, 1.0],
  },
  plane: {
    id: 'plane',
    name: 'Aeronave',
    description: 'Vuelo libre en tres dimensiones',
    maxSpeed: 280,
    acceleration: 35,
    friction: 0.985,      // low air drag
    turnRate: 0.5,
    minAltitude: 150,     // minimum height above terrain
    maxAltitude: 18000,
    verticalSpeed: 90,
    isAerial: true,
    isMarine: false,
    colorRgb: [1.0, 0.82, 0.2],
  },
  boat: {
    id: 'boat',
    name: 'Embarcación',
    description: 'Navegación en superficie acuática',
    maxSpeed: 28,
    acceleration: 5,
    friction: 0.92,
    turnRate: 0.7,
    minAltitude: -1,
    maxAltitude: 3,       // stays near sea level
    verticalSpeed: 0,
    isAerial: false,
    isMarine: true,
    colorRgb: [0.2, 0.88, 0.5],
  },
};
