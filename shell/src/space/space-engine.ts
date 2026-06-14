import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FlightController, type FlightState } from './flight';
import { Hud } from './hud';
import { createGalaxy, type Galaxy } from './galaxy';
import { createRamatzoSun, type RamatzoSun } from './ramatzo-sun';
import { ChunkManager } from './chunks';
import { setStarGasTime, disposeStarGasMaterial } from './star-gas';
import { ConstellationManager } from './constellations';
import { Radar } from './radar';
import { placeShips, floatShips } from './spaceships';
import { createPlayerShip, type PlayerShip } from './player-ship';
import { ProjectOverlay } from './project-overlay';
import type { AppInfo } from '../services/protocol';
import './space.css';

export interface MountOpts {
  apps: AppInfo[];
  onEnterApp: (app: AppInfo) => void;
  onLogout: () => void;
}

/**
 * Orquestador del mundo 3D: renderer, escena, luces, post-procesado (bloom),
 * bucle con delta time, resize, pausa por visibilidad, escala de resolución
 * adaptativa y dispose riguroso. Los subsistemas (vuelo, galaxia, chunks,
 * constelaciones, radar, naves) se añaden en tareas posteriores.
 */
export class SpaceEngine {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private canvas!: HTMLCanvasElement;
  private host: HTMLElement | null = null;
  private opts!: MountOpts;

  private rafId = 0;
  private running = false;
  private lastTime = 0;
  private elapsed = 0;

  private fpsSamples: number[] = [];
  private pixelRatio = Math.min(window.devicePixelRatio, 2);
  private readonly minPixelRatio = 1;

  /** Desplazamiento de origen para precisión en distancias largas (§5 spec). */
  readonly worldOffset = new THREE.Vector3();
  private readonly rebaseThreshold = 4000;
  private readonly centerNDC = new THREE.Vector2(0, 0);

  private flight!: FlightController;
  private lastFlight?: FlightState;
  private hud!: Hud;
  private galaxy!: Galaxy;
  private ramatzoSun!: RamatzoSun;
  private chunks!: ChunkManager;
  private constellations!: ConstellationManager;
  private radar!: Radar;
  private ships: THREE.Group[] = [];
  private playerShip!: PlayerShip;
  private overlay!: ProjectOverlay;
  private escMenu!: HTMLElement;
  private aimLabel!: HTMLElement;
  private ramatzoLabel!: HTMLElement;

  mount(host: HTMLElement, opts: MountOpts) {
    this.host = host;
    this.opts = opts;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'space-canvas';
    host.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0503);
    this.scene.fog = new THREE.Fog(0x0a0503, 3000, 18000);

    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 22000);
    this.camera.position.set(0, 4, 60);

    // Iluminación cálida
    this.scene.add(new THREE.AmbientLight(0x3a2a20, 0.4));
    const starLight = new THREE.DirectionalLight(0xff8c42, 1.5);
    starLight.position.set(50, 100, -200);
    starLight.castShadow = true;
    starLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(starLight);
    const fillLight = new THREE.DirectionalLight(0x8b7a5a, 0.3);
    fillLight.position.set(-50, 30, 100);
    this.scene.add(fillLight);
    const warmLight = new THREE.PointLight(0xff6b35, 0.5, 80);
    warmLight.position.set(20, 10, 30);
    this.scene.add(warmLight);

    // Post-procesado: bloom cálido
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.5, 0.15),
    );

    // Control de vuelo (ratón libre + WASD + nitro)
    this.flight = new FlightController(this.camera, this.canvas);
    this.flight.attach();

    // HUD (reticula, velocidad, nitro, coords, vignette)
    this.hud = new Hud(host);
    this.flight.onFirstInput = () => this.hud.hideStartMessage();

    // ── Mundo ──
    this.galaxy = createGalaxy(this.renderer);
    this.scene.add(this.galaxy.object);

    this.ramatzoSun = createRamatzoSun();
    this.scene.add(this.ramatzoSun.object);

    this.chunks = new ChunkManager(this.scene, this.renderer);
    this.constellations = new ConstellationManager(this.scene, opts.apps, this.renderer);
    this.radar = new Radar(host);
    this.ships = placeShips(this.scene);

    // Nave del jugador visible (vista de persecución): adjunta a la cámara.
    // La cámara debe estar en la escena para que sus hijos se rendericen.
    this.scene.add(this.camera);
    this.playerShip = createPlayerShip();
    this.playerShip.object.position.set(0, -2.0, -9);
    this.playerShip.object.scale.setScalar(0.85);
    this.camera.add(this.playerShip.object);

    // Selección de proyecto (reticula + click)
    this.overlay = new ProjectOverlay(host, {
      onEnter: (app) => {
        this.overlay.hide();
        this.opts.onEnterApp(app);
      },
      onCancel: () => {},
    });
    this.canvas.addEventListener('click', this.onCanvasClick);
    this.buildEscMenu(host);
    this.buildLabels(host);

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.start();
  }

  private loop = (time: number) => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    let delta = (time - this.lastTime) / 1000;
    this.lastTime = time;
    if (!delta || delta < 0 || delta > 0.1) delta = 0.016;
    this.elapsed += delta;

    this.trackFps(delta);

    // ── Actualización de subsistemas ──
    // Congela el vuelo (mirar + WASD) mientras hay overlay de proyecto o menú ESC.
    this.flight.setEnabled(!this.overlay.visible && !this.escMenu.classList.contains('visible'));
    // Frontera blanda: dentro de la esfera poblada (≈ los proyectos) vuelo normal;
    // al alejarse del origen, freno progresivo hasta un mínimo, con aviso de rumbo.
    const fromOrigin = this.camera.position.clone().add(this.worldOffset).length();
    const SOFT = 3400;
    const HARD = 5800;
    this.flight.setSpeedScale(fromOrigin <= SOFT ? 1 : Math.max(0.05, 1 - (fromOrigin - SOFT) / (HARD - SOFT)));
    const flight = this.flight.update(delta);
    this.lastFlight = flight;
    this.maybeRebase();
    this.hud.update(
      flight,
      this.camera.position.x + this.worldOffset.x,
      this.camera.position.z + this.worldOffset.z,
      this.flight.maxSpeed * this.flight.nitroMultiplier,
    );
    this.hud.setStray(fromOrigin > SOFT, fromOrigin > HARD * 0.85);

    this.galaxy.update(this.elapsed, delta, this.camera.position);
    this.ramatzoSun.update(this.elapsed);

    setStarGasTime(this.elapsed);
    this.chunks.update(this.camera.position.clone().add(this.worldOffset));
    this.constellations.update(this.elapsed, delta);
    this.radar.draw(this.camera.position, flight.yaw, this.constellations.getRadarBlips(), this.ramatzoSun.position);
    floatShips(this.ships, this.elapsed, delta);
    this.playerShip.update(this.elapsed);

    this.composer.render();
    this.updateLabels();
  };

  private trackFps(delta: number) {
    this.fpsSamples.push(1 / delta);
    if (this.fpsSamples.length < 60) return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fpsSamples.length = 0;
    const cap = Math.min(window.devicePixelRatio, 2);
    if (avg < 25 && this.pixelRatio > this.minPixelRatio) {
      this.pixelRatio = Math.max(this.minPixelRatio, this.pixelRatio - 0.5);
      this.renderer.setPixelRatio(this.pixelRatio);
    } else if (avg > 50 && this.pixelRatio < cap) {
      this.pixelRatio = Math.min(cap, this.pixelRatio + 0.5);
      this.renderer.setPixelRatio(this.pixelRatio);
    }
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  };

  private onVisibility = () => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  // Clic en el canvas: abre el proyecto de la constelación bajo el cursor
  // (raycast desde la posición del ratón). Sin pointer lock.
  // Clic: si el puntero no está bloqueado, FlightController lo bloquea (mirar).
  // Si ya está bloqueado, selecciona el proyecto bajo la reticula (centro) y suelta
  // el puntero para poder usar el overlay.
  private onCanvasClick = () => {
    if (this.overlay.visible || !this.flight.isPointerLocked) return;
    this.scene.updateMatrixWorld(); // posiciones de planetas en órbita al día para el raycast
    const app = this.constellations.pickApp(this.camera, this.centerNDC);
    if (app) {
      document.exitPointerLock();
      this.overlay.show(app);
    }
  };

  private buildEscMenu(host: HTMLElement) {
    this.escMenu = document.createElement('div');
    this.escMenu.id = 'escMenu';
    this.escMenu.innerHTML = `
      <div class="panel">
        <h3>Ramatzo</h3>
        <p class="esc-controls">RAT&Oacute;N mirar &middot; W/S avanzar &middot; A/D lateral &middot; SPACE nitro<br/>clic en una constelaci&oacute;n para entrar</p>
        <button data-act="resume">Reanudar</button>
        <button data-act="logout">Cerrar sesi&oacute;n</button>
      </div>`;
    host.appendChild(this.escMenu);
    this.escMenu.querySelector('[data-act="resume"]')!.addEventListener('click', () => this.toggleEscMenu(false));
    this.escMenu.querySelector('[data-act="logout"]')!.addEventListener('click', () => this.opts.onLogout());
    document.addEventListener('keydown', this.onEscKey);
  }

  // Escape: cierra el overlay de proyecto si está abierto; si no, alterna el menú.
  private onEscKey = (e: KeyboardEvent) => {
    if (e.code !== 'Escape') return;
    if (this.overlay.visible) {
      this.overlay.hide();
      return;
    }
    this.toggleEscMenu();
  };

  private toggleEscMenu(force?: boolean) {
    const show = force ?? !this.escMenu.classList.contains('visible');
    this.escMenu.classList.toggle('visible', show);
  }

  private buildLabels(host: HTMLElement) {
    this.aimLabel = document.createElement('div');
    this.aimLabel.className = 'space-label';
    host.appendChild(this.aimLabel);

    this.ramatzoLabel = document.createElement('div');
    this.ramatzoLabel.className = 'space-label ramatzo';
    this.ramatzoLabel.textContent = 'Ramatzo';
    host.appendChild(this.ramatzoLabel);
  }

  // Proyecta un punto del mundo a píxeles de pantalla; visible=false si está detrás.
  private project(world: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const cam = world.clone().applyMatrix4(this.camera.matrixWorldInverse);
    const ndc = world.clone().project(this.camera);
    const visible = cam.z < 0 && Math.abs(ndc.x) <= 1.05 && Math.abs(ndc.y) <= 1.05;
    return {
      x: (ndc.x * 0.5 + 0.5) * window.innerWidth,
      y: (-ndc.y * 0.5 + 0.5) * window.innerHeight,
      visible,
    };
  }

  // Etiqueta flotante de la constelación apuntada (cursor o centro) + etiqueta del sol.
  private updateLabels() {
    // Apuntado desde la reticula central (la vista se controla con el ratón bloqueado).
    const aimed = this.constellations.pickAimed(this.camera, this.centerNDC);
    if (aimed) {
      const p = this.project(aimed.center);
      if (p.visible) {
        this.aimLabel.textContent = aimed.app.name;
        this.aimLabel.style.left = `${p.x}px`;
        this.aimLabel.style.top = `${p.y}px`;
        this.aimLabel.classList.add('visible');
      } else {
        this.aimLabel.classList.remove('visible');
      }
    } else {
      this.aimLabel.classList.remove('visible');
    }

    const rp = this.project(this.ramatzoSun.position);
    if (rp.visible) {
      this.ramatzoLabel.style.left = `${rp.x}px`;
      this.ramatzoLabel.style.top = `${rp.y}px`;
      this.ramatzoLabel.classList.add('visible');
    } else {
      this.ramatzoLabel.classList.remove('visible');
    }
  }

  // Rebase de origen: al alejarse mucho, traslada cámara + mundo de vuelta hacia
  // el origen para evitar jitter de coma flotante. worldOffset preserva la posición
  // "real" (HUD/sector). Aditivo y separable: si causara problemas, basta subir el umbral.
  private maybeRebase() {
    if (this.camera.position.length() <= this.rebaseThreshold) return;
    const delta = new THREE.Vector3(
      Math.round(this.camera.position.x / 100) * 100,
      Math.round(this.camera.position.y / 100) * 100,
      Math.round(this.camera.position.z / 50) * 50,
    );
    this.camera.position.sub(delta);
    this.worldOffset.add(delta);
    this.chunks.rebase(delta);
    this.constellations.rebase(delta);
    this.ramatzoSun.object.position.sub(delta);
    for (const s of this.ships) s.position.sub(delta);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  pause() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.radar?.hide();
    this.flight?.setEnabled(false); // suelta teclas: evita nave acelerando al volver de la cabina
  }

  resume() {
    if (document.hidden) return;
    this.radar?.show();
    this.start();
  }

  dispose() {
    this.pause();
    this.flight?.detach();
    this.hud?.dispose();
    this.galaxy?.dispose();
    this.ramatzoSun?.dispose();
    this.playerShip?.dispose();
    this.chunks?.dispose();
    disposeStarGasMaterial();
    this.constellations?.dispose();
    this.radar?.dispose();
    this.overlay?.dispose();
    this.canvas?.removeEventListener('click', this.onCanvasClick);
    document.removeEventListener('keydown', this.onEscKey);
    this.escMenu?.remove();
    this.aimLabel?.remove();
    this.ramatzoLabel?.remove();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.scene?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
      else mat?.dispose?.();
    });
    this.composer?.dispose?.();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
    if (this.host) {
      this.host.innerHTML = '';
      this.host = null;
    }
  }
}
