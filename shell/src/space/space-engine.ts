import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShipController } from './ship-controller';
import { ChaseCamera } from './chase-camera';
import { Hud } from './hud';
import { PauseMenu } from './pause-menu';
import { createGalaxy, type Galaxy } from './galaxy';
import { createRamatzoSun, type RamatzoSun } from './ramatzo-sun';
import { createFarStarfield, type FarStarfield } from './far-starfield';
import { createNebulae, type Nebulae } from './nebulae';
import { createComets, type Comets } from './comets';
import { createRamatzoBelt, type RamatzoBelt } from './asteroids';
import { ChunkManager } from './chunks';
import { setStarGasTime, disposeStarGasMaterial } from './star-gas';
import { SolarSystem } from './solar-system';
import { Radar } from './radar';
import { placeShips, floatShips } from './spaceships';
import { createPlayerShip, type PlayerShip } from './player-ship';
import { SpaceMultiplayer, type Emote } from './space-multiplayer';
import { RemoteShips } from './remote-ships';
import { EmoteWheel } from './emote-wheel';
import { toAbsolute } from './multiplayer-math';
import type { AppInfo } from '../services/protocol';
import './space.css';

export interface MountOpts {
  apps: AppInfo[];
  onEnterApp: (app: AppInfo) => void;
  onLogout: () => void;
  /** Identidad del usuario autenticado (de authState.user). Sin ella, el multijugador no se activa. */
  user?: { id: string; name: string };
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
  private controlPrompt!: HTMLElement;
  private menuBtn!: HTMLElement;
  private approachingApp: AppInfo | null = null;
  private hud!: Hud;
  private galaxy!: Galaxy;
  private ramatzoSun!: RamatzoSun;
  private farStars!: FarStarfield;
  private nebulae!: Nebulae;
  private comets!: Comets;
  private belt!: RamatzoBelt;
  private chunks!: ChunkManager;
  private solarSystem!: SolarSystem;
  private radar!: Radar;
  private ships: THREE.Group[] = [];
  private playerShip!: PlayerShip;
  private pauseMenu!: PauseMenu;
  private ramatzoLabel!: HTMLElement;

  private multiplayer: SpaceMultiplayer | null = null;
  private remoteShips: RemoteShips | null = null;
  private emoteWheel: EmoteWheel | null = null;
  /** Glifo del emoji propio flotante (id local) y su caducidad. */
  private selfEmoteEl: HTMLDivElement | null = null;
  private selfEmoteUntil = 0;

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
    this.renderer.toneMappingExposure = 1.05; // sobrio: evita lavar los acentos
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0503);
    this.scene.fog = new THREE.Fog(0x0a0503, 35000, 100000);

    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 110000);
    this.camera.position.set(0, 120, 2600);

    // Iluminación cálida y sobria: key cálido del sol, fill frío tenue y un
    // rim azulado para recortar nave y planetas del fondo (realismo sin neón).
    this.scene.add(new THREE.AmbientLight(0x2a2018, 0.35));
    const starLight = new THREE.DirectionalLight(0xffb070, 1.35);
    starLight.position.set(50, 100, -200);
    starLight.castShadow = true;
    starLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(starLight);
    const fillLight = new THREE.DirectionalLight(0x6a7488, 0.28);
    fillLight.position.set(-60, 20, 120);
    this.scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0x9fb6d8, 0.45);
    rimLight.position.set(-30, 60, -150); // contraluz: rim en nave/planetas
    this.scene.add(rimLight);

    // Post-procesado: bloom cálido
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Bloom final (plan 06): realza solo emisivos brillantes (sol, toberas,
    // acentos ámbar de la nave) sin halo lechoso global. El umbral alto recorta
    // el fondo y los planetas mates; strength/radius conservan el realce de la
    // nave afinado en plan 05. (strength, radius, threshold).
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.45, 0.6),
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

    this.farStars = createFarStarfield(this.renderer);
    this.scene.add(this.farStars.object);

    // Ambiente cósmico: nebulosas de fondo (telón lejano, no se rebasa, como
    // far-stars) y cometas ocasionales (transitorios de campo cercano).
    this.nebulae = createNebulae();
    this.scene.add(this.nebulae.object);
    this.comets = createComets();
    this.scene.add(this.comets.object);

    // Cinturon de asteroides Ramatzo: radios coordinados con plan 02 (orbita
    // externa de planetas ~3000 u; superficie/influencia hasta ~3260 u). Anillo
    // por fuera de esa franja, sin solaparse con los planetas.
    this.belt = createRamatzoBelt({ count: 240, innerRadius: 3400, outerRadius: 4400 });
    this.scene.add(this.belt.object);

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
    this.controlPrompt.textContent = 'Mueve el ratón para mirar · clic = modo inmersivo';
    host.appendChild(this.controlPrompt);

    // Botón de menú SIEMPRE accesible: abre pausa/cierre de sesión sin depender
    // del pointer lock, para que el menú nunca quede ligado a la captura del ratón.
    this.menuBtn = document.createElement('button');
    this.menuBtn.id = 'menuBtn';
    this.menuBtn.textContent = 'Menú';
    this.menuBtn.addEventListener('click', () => this.openMenu());
    host.appendChild(this.menuBtn);

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

    // ── Multijugador (solo con identidad de usuario) ──
    if (this.opts.user) {
      const user = this.opts.user;
      this.remoteShips = new RemoteShips(this.scene, host, user.id);

      // Emoji propio flotante (sobre la nave del jugador).
      this.selfEmoteEl = document.createElement('div');
      this.selfEmoteEl.className = 'remote-emote';
      host.appendChild(this.selfEmoteEl);

      this.multiplayer = new SpaceMultiplayer({
        onPlayers: (players) => this.remoteShips?.setSnapshot(players, this.worldOffset),
        onJoined: (player) => this.remoteShips?.addPlayer(player, this.worldOffset),
        onLeft: (id) => this.remoteShips?.removePlayer(id),
        onEmote: (id, emoji) => {
          if (id === user.id) this.showSelfEmote(emoji);
          else this.remoteShips?.showEmote(id, emoji);
        },
      });
      this.multiplayer.connect({ room: 'home', id: user.id, name: user.name });

      // Rueda de emoticonos: la tecla C la abre (ver onKeyDown).
      this.emoteWheel = new EmoteWheel(host, (emote: Emote) => this.multiplayer?.sendEmote(emote));
    }

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
    this.chaseCamera.update(this.ship.object, ship, delta);

    this.maybeRebase();

    // Parallax sobre la posicion de la NAVE (plan 01): el backdrop se desplaza a
    // una fraccion de la posicion de la nave, no se recentra en ella.
    this.galaxy.update(this.elapsed, delta, ship.position);
    // farStars es FIJA (anclada al origen): no recibe posicion ni se rebasa, es
    // la referencia absoluta de movimiento.
    this.farStars.update(this.elapsed);
    // Nebulosas: telón de fondo fijo (no se rebasa, como far-stars). Cometas:
    // transitorios de campo cercano (no se rebasan; ver comets.ts).
    this.nebulae.update(this.elapsed);
    this.comets.update(this.elapsed, delta);
    this.ramatzoSun.update(this.elapsed);
    this.belt.update(this.elapsed, delta);

    setStarGasTime(this.elapsed);
    this.chunks.update(ship.position.clone().add(this.worldOffset));
    // Sistema solar: órbitas + aproximación + permanencia. La nave es una entidad
    // del mundo (plan 01); su posición de escena es this.ship.object.position,
    // que coincide con ship.position (misma referencia de Vector3).
    const solar = this.solarSystem.update(this.elapsed, delta, ship.position);
    // Planeta en aproximación: se entra al pulsar E (ver onKeyDown), no de forma automática.
    this.approachingApp = solar.approaching?.app ?? null;

    // HUD reactivo: altitud real (y + worldOffset), rumbo (yaw) y planeta en
    // aproximación (prompt "Pulsa E").
    const altitude = ship.position.y + this.worldOffset.y;
    this.hud.update(ship, {
      altitude,
      heading: ship.yaw,
      approaching: solar.approaching
        ? {
            name: solar.approaching.app.name,
            description: solar.approaching.app.description,
            blurb: solar.approaching.app.blurb,
          }
        : null,
      dwellProgress: solar.dwellProgress,
    });

    // Frenado de aproximación aplicado a la nave (1 = normal, <1 cerca del núcleo).
    this.ship.setApproachBrake(this.solarSystem.brakeFactor(solar.approaching));
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

    // ── Multijugador por frame ──
    if (this.multiplayer) {
      const abs = toAbsolute(
        { x: ship.position.x, y: ship.position.y, z: ship.position.z },
        this.worldOffset,
      );
      this.multiplayer.sendState({ x: abs.x, y: abs.y, z: abs.z, yaw: ship.yaw }, time);
    }
    this.remoteShips?.update(delta);

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
    if (!this.running) return; // en cabina (motor pausado) no reaccionamos al lock
    // Perder el lock no abre ningún modal; la mirada (movementX) funciona igual sin
    // lock. El menú se abre solo de forma explícita (botón "Menú" o ESC).
    if (this.ship.isLocked && this.pauseMenu.visible) this.pauseMenu.close();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.running) return; // en cabina (motor pausado) el motor ignora las teclas
    // E: entra al proyecto del planeta en aproximación (no automático).
    if (e.code === 'KeyE') {
      this.enterApproaching();
      return;
    }
    // C: abre/cierra la rueda de emoticonos (solo si hay multijugador).
    if (e.code === 'KeyC') {
      this.emoteWheel?.toggle();
      return;
    }
    // ESC: abre el menú; si ya está abierto, reanuda. (Independiente del pointer lock.)
    if (e.code !== 'Escape') return;
    // Si la rueda de emoticonos está abierta, ESC solo la cierra (lo hace la propia
    // rueda); no abrimos el menú de pausa en el mismo pulso.
    if (this.emoteWheel?.visible) return;
    if (this.pauseMenu.visible) this.resumeControl();
    else this.openMenu();
  };

  // Entra al proyecto del planeta en aproximación (tecla E).
  private enterApproaching() {
    if (this.pauseMenu.visible || !this.approachingApp) return;
    const app = this.approachingApp;
    if (app.externalUrl) {
      // Proyecto externo (p. ej. repo de GitHub): abre en pestaña nueva, no iframe.
      window.open(app.externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    this.opts.onEnterApp(app);
  }

  // Abre el menú de pausa con cursor visible (suelta el lock si lo había).
  private openMenu() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.pauseMenu.open();
    this.controlPrompt.classList.remove('visible');
  }

  private resumeControl() {
    this.pauseMenu.close();
    // No forzamos pointer lock: la mirada por cursor ya funciona. Mostramos el
    // prompt por si el usuario quiere clic para el modo inmersivo.
    this.controlPrompt.classList.add('visible');
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

    // Etiquetas de nombre + emojis de las naves remotas (reusa project()).
    const now = performance.now();
    this.remoteShips?.updateLabels((w) => this.project(w), now);

    // Emoji propio flotante (anclado sobre la nave del jugador).
    if (this.selfEmoteEl) {
      const sp = this.project(this.ship.object.position);
      if (now < this.selfEmoteUntil && sp.visible) {
        this.selfEmoteEl.style.left = `${sp.x}px`;
        this.selfEmoteEl.style.top = `${sp.y}px`;
        this.selfEmoteEl.classList.add('visible');
      } else {
        this.selfEmoteEl.classList.remove('visible');
      }
    }
  }

  // Emoji propio flotante ~3 s (mapeo de glifos sobrios, igual que RemoteShips).
  private showSelfEmote(emoji: string) {
    if (!this.selfEmoteEl) return;
    const glyph: Record<string, string> = { happy: ':)', sad: ':(', angry: '>:(' };
    this.selfEmoteEl.textContent = glyph[emoji] ?? emoji;
    this.selfEmoteUntil = performance.now() + 3000;
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
    this.belt.rebase(delta);
    this.ramatzoSun.object.position.sub(delta);
    for (const s of this.ships) s.position.sub(delta);
    // farStars es fija (referencia absoluta): no se rebasa a proposito.
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
    // Al entrar a un proyecto: libera el puntero (cursor disponible en la cabina
    // SIN pulsar ESC) y cierra el menú/prompt para no volver a un estado bloqueado.
    if (document.pointerLockElement) document.exitPointerLock();
    this.pauseMenu?.close();
    this.controlPrompt?.classList.remove('visible');
  }

  resume() {
    if (document.hidden) return;
    // Vuelve del proyecto en estado limpio: menú cerrado (el bucle rehabilita la
    // nave) y prompt visible por si se quiere clic para el modo inmersivo.
    this.pauseMenu?.close();
    this.radar?.show();
    this.controlPrompt?.classList.add('visible');
    this.start();
  }

  dispose() {
    this.pause();
    this.multiplayer?.disconnect();
    this.multiplayer = null;
    this.remoteShips?.dispose();
    this.remoteShips = null;
    this.emoteWheel?.dispose();
    this.emoteWheel = null;
    this.selfEmoteEl?.remove();
    this.selfEmoteEl = null;
    this.ship?.detach();
    this.hud?.dispose();
    this.galaxy?.dispose();
    this.farStars?.dispose();
    this.nebulae?.dispose();
    this.comets?.dispose();
    this.belt?.dispose();
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
    this.menuBtn?.remove();
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
