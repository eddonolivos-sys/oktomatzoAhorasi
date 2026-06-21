import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShipController, type ShipState } from './ship-controller';
import { ChaseCamera } from './chase-camera';
import { Hud } from './hud';
import { PauseMenu } from './pause-menu';
import { createGalaxy, type Galaxy } from './galaxy';
import { createRamatzoSun, type RamatzoSun } from './ramatzo-sun';
import { ChunkManager } from './chunks';
import { setStarGasTime, disposeStarGasMaterial } from './star-gas';
import { SolarSystem } from './solar-system';
import { Radar } from './radar';
import { placeShips, floatShips } from './spaceships';
import { createPlayerShip, type PlayerShip } from './player-ship';
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
  private readonly rebaseThreshold = 200000;

  private ship!: ShipController;
  private chaseCamera!: ChaseCamera;
  private lastShip?: ShipState;
  private controlPrompt!: HTMLElement;
  private hud!: Hud;
  private galaxy!: Galaxy;
  private ramatzoSun!: RamatzoSun;
  private chunks!: ChunkManager;
  private solarSystem!: SolarSystem;
  private radar!: Radar;
  private ships: THREE.Group[] = [];
  private playerShip!: PlayerShip;
  private pauseMenu!: PauseMenu;
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
    this.scene.fog = new THREE.Fog(0x0a0503, 35000, 100000);

    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 110000);
    this.camera.position.set(0, 120, 2600);

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
    // Bloom sobrio pero marcado: realza los emisivos de la nave (núcleos,
    // llamas, costura ámbar, luces nav) sin emborronar el sistema.
    // (strength, radius, threshold). NOTA: el plan 06 finaliza la iluminación
    // y el bloom globales; este ajuste es para los acentos de la nave.
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.45, 0.08),
    );

    // Control de vuelo: la nave es una entidad en el mundo; la cámara la sigue.
    this.ship = new ShipController(this.canvas);
    this.ship.attach();
    this.ship.object.position.set(0, 120, 2600); // spawn mirando al sistema
    this.scene.add(this.ship.object);
    this.chaseCamera = new ChaseCamera(this.camera);

    // HUD (reticula, velocidad, altitud/rumbo, leyenda, vignette)
    this.hud = new Hud(host);
    this.ship.onLockChange = (locked) => {
      // El prompt "Clic para tomar control" no aparece si el menú de pausa está
      // visible (ese caso lo cubre el propio menú con su botón "Reanudar control").
      this.controlPrompt.classList.toggle('visible', !locked && !this.pauseMenu?.visible);
      if (locked) this.hud.hideStartMessage();
    };

    // ── Mundo ──
    this.galaxy = createGalaxy(this.renderer);
    this.scene.add(this.galaxy.object);

    this.ramatzoSun = createRamatzoSun();
    this.scene.add(this.ramatzoSun.object);

    this.chunks = new ChunkManager(this.scene, this.renderer);
    this.solarSystem = new SolarSystem(this.scene, opts.apps, this.renderer);
    this.radar = new Radar(host);
    this.ships = placeShips(this.scene);

    // Nave del jugador visible: cuelga del pivote de roll del ShipController
    // (se inclina en los giros); el raíz lleva posición + yaw/pitch.
    this.playerShip = createPlayerShip();
    this.playerShip.object.scale.setScalar(0.85);
    this.ship.attachVisual(this.playerShip.object);

    // Prompt "Clic para tomar control" (visible cuando no hay pointer lock).
    this.controlPrompt = document.createElement('div');
    this.controlPrompt.id = 'controlPrompt';
    this.controlPrompt.className = 'visible';
    this.controlPrompt.textContent = 'Clic para tomar control';
    host.appendChild(this.controlPrompt);

    // La entrada a proyectos es por permanencia (dwell) dentro de la esfera de
    // influencia del planeta; no hay pick por clic ni overlay de proyecto.
    this.canvas.addEventListener('click', this.onCanvasClick);

    this.pauseMenu = new PauseMenu(host, {
      onResume: () => this.resumeControl(),
      onLogout: () => this.opts.onLogout(),
    });
    // Truco clave (§5.6): el navegador consume el primer ESC liberando el lock.
    // Escuchamos pointerlockchange: si se pierde el lock y no hay menú abierto,
    // lo interpretamos como "abrir pausa" → el primer ESC libera ratón Y muestra menú.
    document.addEventListener('pointerlockchange', this.onLockChange);
    // Un ESC posterior (con cursor ya libre) cierra el menú.
    document.addEventListener('keydown', this.onKeyDown);
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
    // Congela el vuelo (mirar + WASD) mientras el menú de pausa está visible.
    this.ship.setEnabled(!this.pauseMenu.visible);

    // Vuelo: la nave se mueve; la cámara la sigue.
    const ship = this.ship.update(delta);
    this.lastShip = ship;
    this.chaseCamera.update(this.ship.object, ship, delta);

    this.maybeRebase();

    this.galaxy.update(this.elapsed, delta, this.camera.position);
    this.ramatzoSun.update(this.elapsed);

    setStarGasTime(this.elapsed);
    this.chunks.update(ship.position.clone().add(this.worldOffset));
    // Sistema solar: órbitas + aproximación + permanencia. La nave es una entidad
    // del mundo (plan 01); su posición de escena es this.ship.object.position,
    // que coincide con ship.position (misma referencia de Vector3).
    const solar = this.solarSystem.update(this.elapsed, delta, ship.position);

    // HUD reactivo: altitud real (y + worldOffset), rumbo (yaw), estado de
    // aproximación y progreso de permanencia (dwell) del sistema solar.
    const altitude = ship.position.y + this.worldOffset.y;
    this.hud.update(ship, {
      altitude,
      heading: ship.yaw,
      approaching: solar.approaching ? { name: solar.approaching.app.name } : null,
      dwellProgress: solar.dwellProgress,
    });

    // Frenado de aproximación aplicado a la nave (1 = normal, <1 cerca del núcleo).
    this.ship.setApproachBrake(this.solarSystem.brakeFactor(solar.approaching));
    // Entrada confirmada por permanencia: mismo contrato existente, app sin cambios.
    if (solar.entered) this.opts.onEnterApp(solar.entered);
    this.radar.draw(
      ship.position,
      ship.yaw,
      ship.pitch,
      this.solarSystem.getRadarBlips(),
      solar.approaching?.app ?? null,
      this.ramatzoSun.position,
    );
    floatShips(this.ships, this.elapsed, delta);
    // Animación reactiva de la nave: lee el ShipState del frame (toberas/estela/
    // estrobos escalan con speed/nitro/braking). El roll lo aplica el pivote de
    // ShipController, NO player-ship.
    this.playerShip.update(this.elapsed, ship, delta);

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

  // Clic en el canvas: solicita el control de la nave (pointer lock). La entrada
  // a proyectos ya no es por clic, sino por permanencia dentro de la esfera de
  // influencia de un planeta.
  private onCanvasClick = () => {
    if (this.pauseMenu.visible) return;
    if (!this.ship.isLocked) this.ship.requestControl();
  };

  // El navegador sale del pointer lock al primer ESC. Si se pierde el lock con el
  // motor en marcha (no en cabina) y no hay menú abierto, abrimos la pausa (cursor
  // visible) → el primer ESC libera el ratón Y muestra el menú. Si reentramos al
  // lock con el menú abierto, lo cerramos. NO abrimos el menú cuando el lock se
  // pierde por entrar a la cabina/ocultar la pestaña (motor pausado: !running) ni
  // en el teardown.
  private onLockChange = () => {
    const locked = this.ship.isLocked;
    if (!locked && !this.pauseMenu.visible && this.running) {
      this.pauseMenu.open();
      // Oculta el prompt "Clic para tomar control" mientras el menú está abierto.
      this.controlPrompt.classList.remove('visible');
    } else if (locked && this.pauseMenu.visible) {
      this.pauseMenu.close();
    }
  };

  // ESC con el cursor libre (menú abierto): vuelve a tomar control.
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape' && this.pauseMenu.visible) {
      this.resumeControl();
    }
  };

  private resumeControl() {
    this.pauseMenu.close();
    this.ship.requestControl(); // vuelve a pedir pointer lock al canvas
  }

  private buildLabels(host: HTMLElement) {
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

  // Etiqueta flotante del sol Ramatzo. (La entrada a proyectos es por permanencia;
  // ya no hay raycast ni etiqueta de constelación apuntada.)
  private updateLabels() {
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
    if (this.ship.object.position.length() <= this.rebaseThreshold) return;
    const delta = new THREE.Vector3(
      Math.round(this.ship.object.position.x / 100) * 100,
      Math.round(this.ship.object.position.y / 100) * 100,
      Math.round(this.ship.object.position.z / 50) * 50,
    );
    this.ship.rebase(delta);
    this.camera.position.sub(delta);
    this.worldOffset.add(delta);
    this.chunks.rebase(delta);
    this.solarSystem.rebase(delta);
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
    this.ship?.setEnabled(false); // suelta teclas: evita nave acelerando al volver de la cabina
  }

  resume() {
    if (document.hidden) return;
    this.radar?.show();
    this.start();
  }

  dispose() {
    this.pause();
    this.ship?.detach();
    this.hud?.dispose();
    this.galaxy?.dispose();
    this.ramatzoSun?.dispose();
    this.playerShip?.dispose();
    this.chunks?.dispose();
    disposeStarGasMaterial();
    this.solarSystem?.dispose();
    this.radar?.dispose();
    this.canvas?.removeEventListener('click', this.onCanvasClick);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('keydown', this.onKeyDown);
    this.pauseMenu?.dispose();
    this.controlPrompt?.remove();
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
