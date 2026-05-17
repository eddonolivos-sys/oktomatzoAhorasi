import { MapLayer } from '../world/LayerManager';
import { WeatherMode } from '../world/WeatherSystem';
import { VehicleType, VEHICLES } from '../models/vehicles';

export interface ControlPanelCallbacks {
  onLayerChange: (layer: MapLayer) => void;
  onVehicleChange: (type: VehicleType) => void;
  onWeatherChange: (mode: WeatherMode) => void;
}

const CSS = `
#ctrl-panel {
  position: fixed;
  top: 12px;
  right: 12px;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 10px;
  padding: 14px 16px;
  color: #e8f4ff;
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
  min-width: 200px;
  z-index: 1000;
  user-select: none;
}
#ctrl-panel h3 {
  margin: 0 0 10px;
  font-size: 11px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #88aacc;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding-bottom: 6px;
}
#ctrl-panel .ctrl-section { margin-bottom: 12px; }
#ctrl-panel .ctrl-label {
  font-size: 10px;
  color: #88aacc;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 5px;
}
#ctrl-panel .btn-group { display: flex; gap: 4px; flex-wrap: wrap; }
#ctrl-panel button {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  background: rgba(255,255,255,0.06);
  color: #cce4ff;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}
#ctrl-panel button:hover { background: rgba(255,255,255,0.14); }
#ctrl-panel button.active {
  background: rgba(0,120,255,0.35);
  border-color: rgba(0,160,255,0.6);
  color: #fff;
}
#ctrl-panel select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  background: rgba(255,255,255,0.06);
  color: #cce4ff;
  font-size: 13px;
  cursor: pointer;
}
#ctrl-panel .ctrl-keys {
  font-size: 10px;
  color: #667799;
  line-height: 1.8;
  margin-top: 4px;
}
#ctrl-panel .ctrl-keys kbd {
  display: inline-block;
  padding: 1px 5px;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 3px;
  background: rgba(255,255,255,0.08);
  font-family: monospace;
  font-size: 10px;
}
`;

export class ControlPanel {
  private el: HTMLDivElement;
  private layerBtns: Map<MapLayer, HTMLButtonElement> = new Map();
  private weatherBtns: Map<WeatherMode, HTMLButtonElement> = new Map();
  private vehicleSelect!: HTMLSelectElement;
  private callbacks: ControlPanelCallbacks;

  constructor(callbacks: ControlPanelCallbacks) {
    this.callbacks = callbacks;
    this.injectStyles();
    this.el = this.buildDOM();
    document.body.appendChild(this.el);
  }

  private injectStyles() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  private buildDOM(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'ctrl-panel';

    panel.innerHTML = '<h3>⚙ Panel de Control</h3>';

    // — Map layer —
    panel.appendChild(this.buildSection('Mapa base', this.buildLayerButtons()));

    // — Vehicle selector —
    panel.appendChild(this.buildSection('Vehículo', this.buildVehicleSelect()));

    // — Weather —
    panel.appendChild(this.buildSection('Clima', this.buildWeatherButtons()));

    // — Key bindings —
    panel.appendChild(this.buildKeyBindings());

    return panel;
  }

  private buildSection(label: string, content: HTMLElement): HTMLDivElement {
    const sec = document.createElement('div');
    sec.className = 'ctrl-section';
    const lbl = document.createElement('div');
    lbl.className = 'ctrl-label';
    lbl.textContent = label;
    sec.appendChild(lbl);
    sec.appendChild(content);
    return sec;
  }

  private buildLayerButtons(): HTMLDivElement {
    const group = document.createElement('div');
    group.className = 'btn-group';

    const layers: [MapLayer, string][] = [
      ['satellite', '🛰 Satélite'],
      ['street',    '🗺 Callejero'],
      ['topo',      '🏔 Topo'],
    ];

    for (const [id, label] of layers) {
      const btn = document.createElement('button');
      btn.textContent = label;
      if (id === 'satellite') btn.classList.add('active');
      btn.onclick = () => {
        this.layerBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.callbacks.onLayerChange(id);
      };
      this.layerBtns.set(id, btn);
      group.appendChild(btn);
    }

    return group;
  }

  private buildVehicleSelect(): HTMLSelectElement {
    const sel = document.createElement('select');
    for (const spec of Object.values(VEHICLES)) {
      const opt = document.createElement('option');
      opt.value = spec.id;
      opt.textContent = spec.name;
      sel.appendChild(opt);
    }
    sel.value = 'plane';
    sel.onchange = () => {
      this.callbacks.onVehicleChange(sel.value as VehicleType);
    };
    this.vehicleSelect = sel;
    return sel;
  }

  private buildWeatherButtons(): HTMLDivElement {
    const group = document.createElement('div');
    group.className = 'btn-group';

    const modes: [WeatherMode, string][] = [
      ['clear',   '☀ Despejado'],
      ['cloudy',  '⛅ Nublado'],
      ['overcast','🌧 Cubierto'],
    ];

    for (const [id, label] of modes) {
      const btn = document.createElement('button');
      btn.textContent = label;
      if (id === 'clear') btn.classList.add('active');
      btn.onclick = () => {
        this.weatherBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.callbacks.onWeatherChange(id);
      };
      this.weatherBtns.set(id, btn);
      group.appendChild(btn);
    }

    return group;
  }

  private buildKeyBindings(): HTMLDivElement {
    const sec = document.createElement('div');
    sec.className = 'ctrl-section';
    const lbl = document.createElement('div');
    lbl.className = 'ctrl-label';
    lbl.textContent = 'Controles de teclado';
    const keys = document.createElement('div');
    keys.className = 'ctrl-keys';
    keys.innerHTML = [
      '<kbd>W/S</kbd> Avanzar / Retroceder',
      '<kbd>A/D</kbd> Girar izq / der',
      '<kbd>Q/E</kbd> Subir / Bajar (aéreo)',
      '<kbd>Shift</kbd> Turbo × 2',
      '<kbd>Space</kbd> Frenar',
      '<kbd>V</kbd> Alternar cámara',
    ].join('<br>');
    sec.appendChild(lbl);
    sec.appendChild(keys);
    return sec;
  }

  setActiveVehicle(type: VehicleType) {
    this.vehicleSelect.value = type;
  }

  destroy() {
    this.el.remove();
  }
}
