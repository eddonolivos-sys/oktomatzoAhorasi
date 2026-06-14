import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FlightController, type FlightState } from './flight';
import { Hud } from './hud';
import { createGalaxy, type Galaxy } from './galaxy';
import { ChunkManager } from './chunks';
import { setStarGasTime, disposeStarGasMaterial } from './star-gas';
import { ConstellationManager } from './constellations';
import { Radar } from './radar';
import { placeShips, floatShips } from './spaceships';
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

  private flight!: FlightController;
  private lastFlight?: FlightState;
  private hud!: Hud;
  private galaxy!: Galaxy;
  private chunks!: ChunkManager;
  private constellations!: ConstellationManager;
  private radar!: Radar;
  private ships: THREE.Group[] = [];
  private overlay!: ProjectOverlay;
  private escMenu!: HTMLElement;

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
    this.scene.fog = new THREE.Fog(0x0a0503, 200, 600);

    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(0, 3, 8);

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

    this.chunks = new ChunkManager(this.scene, this.renderer);
    this.constellations = new ConstellationManager(this.scene, opts.apps, this.renderer);
    this.radar = new Radar(host);
    this.ships = placeShips(this.scene);

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

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.start();
  }

  private loop = (time: number) => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    let delta = (time - this.lastTime) / 1000;
    this.lastTime = time;
    if (!delta || delta > 0.1) delta = 0.016;
    this.elapsed += delta;

    this.trackFps(delta);

    // ── Actualización de subsistemas (se amplía en tareas posteriores) ──
    const flight = this.flight.update(delta);
    this.lastFlight = flight;
    this.maybeRebase();
    this.hud.update(
      flight,
      this.camera.position.x + this.worldOffset.x,
      this.camera.position.z + this.worldOffset.z,
      this.flight.maxSpeed * this.flight.nitroMultiplier,
    );

    this.galaxy.update(this.elapsed, delta, this.camera.position);

    setStarGasTime(this.elapsed);
    this.chunks.update(this.camera.position.clone().add(this.worldOffset));
    this.constellations.update(this.elapsed, delta);
    this.radar.draw(this.camera.position, flight.yaw, this.constellations.getRadarBlips());
    floatShips(this.ships, this.elapsed, delta);

    this.composer.render();
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
  private onCanvasClick = (e: MouseEvent) => {
    if (this.overlay.visible) return;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1),
    );
    const app = this.constellations.pickApp(this.camera, ndc);
    if (app) this.overlay.show(app);
  };

  private buildEscMenu(host: HTMLElement) {
    this.escMenu = document.createElement('div');
    this.escMenu.id = 'escMenu';
    this.escMenu.innerHTML = `
      <div class="panel">
        <h3>Ramatzo</h3>
        <button data-act="resume">Reanudar</button>
        <button data-act="logout">Cerrar sesión</button>
      </div>`;
    host.appendChild(this.escMenu);
    this.escMenu.querySelector('[data-act="resume"]')!.addEventListener('click', () => this.toggleEscMenu(false));
    this.escMenu.querySelector('[data-act="logout"]')!.addEventListener('click', () => this.opts.onLogout());
    document.addEventListener('keydown', this.onEscKey);
  }

  // Escape suelta el pointer lock de forma nativa; un segundo Escape (ya sin lock)
  // alterna el menú. No interferir mientras hay lock o el overlay de proyecto está abierto.
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
    this.chunks?.dispose();
    disposeStarGasMaterial();
    this.constellations?.dispose();
    this.radar?.dispose();
    this.overlay?.dispose();
    this.canvas?.removeEventListener('click', this.onCanvasClick);
    document.removeEventListener('keydown', this.onEscKey);
    this.escMenu?.remove();
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
