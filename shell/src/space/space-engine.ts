import type { AppInfo } from '../services/protocol';
import './space.css';

export interface MountOpts {
  apps: AppInfo[];
  onEnterApp: (app: AppInfo) => void;
  onLogout: () => void;
}

/**
 * Stub provisional del motor (Task 4). El motor real (Three.js) se implementa en Task 5.
 * Por ahora solo pinta un fondo para verificar el montaje, el import dinámico y space.css.
 */
export class SpaceEngine {
  private host: HTMLElement | null = null;

  mount(host: HTMLElement, _opts: MountOpts) {
    this.host = host;
    host.style.background = 'radial-gradient(circle at 50% 40%, #1A0E08, #0A0503)';
  }

  pause() {}
  resume() {}

  dispose() {
    if (this.host) {
      this.host.innerHTML = '';
      this.host = null;
    }
  }
}
