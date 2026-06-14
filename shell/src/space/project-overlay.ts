import type { AppInfo } from '../services/protocol';

export interface ProjectOverlayCallbacks {
  onEnter: (app: AppInfo) => void;
  onCancel: () => void;
}

/**
 * Overlay (DOM) con la info del proyecto seleccionado y los botones
 * Cancelar / Ingresar. Estilos en space.css (#projectInfo).
 */
export class ProjectOverlay {
  private root: HTMLDivElement;
  private nameEl: HTMLElement;
  private catEl: HTMLElement;
  private descEl: HTMLElement;
  private current: AppInfo | null = null;

  constructor(
    host: HTMLElement,
    private cb: ProjectOverlayCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'projectInfo';
    this.root.innerHTML = `
      <div class="constellation-icon">&#9733;</div>
      <h2 id="ovName"></h2>
      <div class="category" id="ovCat"></div>
      <div class="desc" id="ovDesc"></div>
      <div class="actions">
        <button data-act="cancel">Cancelar</button>
        <button class="primary" data-act="enter">Ingresar</button>
      </div>`;
    host.appendChild(this.root);

    this.nameEl = this.root.querySelector('#ovName') as HTMLElement;
    this.catEl = this.root.querySelector('#ovCat') as HTMLElement;
    this.descEl = this.root.querySelector('#ovDesc') as HTMLElement;
    this.root.querySelector('[data-act="cancel"]')!.addEventListener('click', () => {
      this.hide();
      this.cb.onCancel();
    });
    this.root.querySelector('[data-act="enter"]')!.addEventListener('click', () => {
      if (this.current) this.cb.onEnter(this.current);
    });
  }

  get visible(): boolean {
    return this.root.classList.contains('visible');
  }

  show(app: AppInfo) {
    this.current = app;
    this.nameEl.textContent = app.name;
    this.catEl.textContent = app.category;
    this.descEl.textContent = app.description;
    this.root.classList.add('visible');
  }

  hide() {
    this.root.classList.remove('visible');
    this.current = null;
  }

  dispose() {
    this.root.remove();
  }
}
