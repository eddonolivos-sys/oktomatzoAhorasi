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
import { createFarStarfield, type FarStarfield } from './far-starfield';
import { createNebulae, type Nebulae } from './nebulae';
import { createComets, type Comets } from './comets';
import { createRamatzoBelt, type RamatzoBelt } from './asteroids';
import { ChunkManager } from './chunks';
import { setStarGasTime, disposeStarGasMaterial } from './star-gas';
import { SolarSystem, type ApproachInfo } from './solar-system';
import { Radar } from './radar';
import { placeShips, floatShips } from './spaceships';
import { createPlayerShip, type PlayerShip } from './player-ship';
import { SpaceMultiplayer, EMOTE_GLYPH, type Emote } from './space-multiplayer';
import { RemoteShips } from './remote-ships';
import { EmoteWheel } from './emote-wheel';
import { toAbsolute } from './multiplayer-math';
import { SOLAR_CONFIG, CAMERA_CONFIG, ORBIT_CONFIG, PERF_CONFIG, AUDIO_CONFIG } from './space-config';
import { stepOrbit, ejectVelocity, freeAfterExit, type OrbitState } from './orbit';
import { buildOrbitBasis } from './orbit-frame';
import { orbitCameraPose } from './orbit-camera';
import { FrameTimeRingBuffer, computeStats } from './perf-stats';
import { PerfHud, type PerfSnapshot } from './perf-hud';
import { audioService } from '../services/audio-service';
import { thrusterGain } from './audio-math';
import type { AppInfo } from '../services/protocol';
import './space.css';

export interface MountOpts {
  apps: AppInfo[];
  onEnterApp: (app: AppInfo) => void;
  onLogout: () => void;
  /** Abre el modal de configuración de audio (botón "Configuración" del PauseMenu). */
  onOpenSettings: () => void;
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

  // ── Instrumentación de rendimiento (Hito 0) ──
  private readonly frameStats = new FrameTimeRingBuffer(PERF_CONFIG.frameWindowSize);
  private lastDrawCalls = 0;
  private lastTriangles = 0;
  private perfHud!: PerfHud;

  /** Desplazamiento de origen para precisión en distancias largas (§5 spec). */
  readonly worldOffset = new THREE.Vector3();
  private readonly rebaseThreshold = 200000;

  // ── Interacción orbital (#3) ──
  private orbit: OrbitState = { phase: 'free', cooldown: 0 };
  /** One-shot: botón "Salir de la órbita" del HUD (S5); se consume en `updateOrbit`. */
  private exitOrbitRequested = false;
  private readonly orbitCenter = new THREE.Vector3();
  private readonly orbitU = new THREE.Vector3();
  private readonly orbitV = new THREE.Vector3();
  private readonly orbitImpulse = new THREE.Vector3();
  private orbitRadius = 0;
  private orbitAngle = 0;

  // ── Transición cámara persecución↔órbita (S4) ──
  private orbitCamBlend = 0; // 0=persecución, 1=pose orbital
  private readonly orbitCamPos = new THREE.Vector3();
  private readonly orbitCamTarget = new THREE.Vector3();
  private readonly orbitCamUp = new THREE.Vector3();
  private readonly blendedLookTarget = new THREE.Vector3();

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
    // autoReset=false + reset manual en el loop (antes de composer.render()): el
    // EffectComposer llama renderer.render() varias veces por frame (escena +
    // pasadas de bloom) y el autoReset por defecto solo dejaría ver la ÚLTIMA
    // pasada interna en renderer.info, subestimando muchísimo drawCalls/tris.
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0503);
    this.scene.fog = new THREE.Fog(0x0a0503, SOLAR_CONFIG.fogNear, SOLAR_CONFIG.fogFar);

    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 110000);
    this.camera.position.set(SOLAR_CONFIG.spawn.x, SOLAR_CONFIG.spawn.y, SOLAR_CONFIG.spawn.z);

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
    this.ship.object.position.set(SOLAR_CONFIG.spawn.x, SOLAR_CONFIG.spawn.y, SOLAR_CONFIG.spawn.z); // spawn mirando al sistema
    this.scene.add(this.ship.object);
    this.chaseCamera = new ChaseCamera(this.camera, {
      offset: new THREE.Vector3(
        CAMERA_CONFIG.chaseOffset.x,
        CAMERA_CONFIG.chaseOffset.y,
        CAMERA_CONFIG.chaseOffset.z,
      ),
    });

    // HUD (reticula, velocidad, altitud/rumbo, leyenda, vignette)
    this.hud = new Hud(host);
    // Panel de diagnóstico de rendimiento (Hito 0), oculto salvo alternar con P.
    this.perfHud = new PerfHud(host);
    this.hud.onEnter = this.enterCurrentProject; // botón "Entrar" del panel de proyecto (#3)
    this.hud.onExit = this.exitOrbit; // botón "Salir de la órbita" del HUD (S5)
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
    this.belt = createRamatzoBelt({
      count: 240,
      innerRadius: SOLAR_CONFIG.ramatzoInnerRadius,
      outerRadius: SOLAR_CONFIG.ramatzoOuterRadius,
      center: SOLAR_CONFIG.ramatzoCenter,
    });
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

    audioService.loadThrusterSfx();
    audioService.loadNitroSfx();

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
      onSettings: () => this.opts.onOpenSettings(),
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

    const rawDelta = (time - this.lastTime) / 1000;
    this.lastTime = time;
    // Delta CRUDO (ms) para el ring buffer de perf: SIN el clamp de abajo, para
    // que p95/p99/max reflejen los peores frames de verdad (§3.5 del plan).
    if (rawDelta > 0 && Number.isFinite(rawDelta)) this.frameStats.push(rawDelta * 1000);
    let delta = rawDelta;
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
    const approaching = solar.approaching;
    this.approachingApp = approaching?.app ?? null;

    // ── Interacción orbital (#3): captura → órbita → entrar/expulsar ──
    if (!this.pauseMenu.visible) this.updateOrbit(approaching, ship, delta);
    this.updateOrbitCameraBlend(delta, approaching);

    // HUD reactivo: altitud real (y + worldOffset), rumbo (yaw) y planeta en aproximación.
    const altitude = ship.position.y + this.worldOffset.y;
    this.hud.update(ship, {
      altitude,
      heading: ship.yaw,
      approaching: approaching
        ? {
            name: approaching.app.name,
            description: approaching.app.description,
            blurb: approaching.app.blurb,
          }
        : null,
      hint: solar.hint ? { name: solar.hint.app.name } : null,
      dwellProgress: solar.dwellProgress,
      orbiting: this.orbit.phase === 'orbiting',
    });
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

    // Audio del propulsor/nitro (Hito 3): gain proporcional a la velocidad.
    const thrustGain = thrusterGain(ship.speed, AUDIO_CONFIG.thrusterSpeedRef);
    audioService.setThrusterGain(ship.isNitro ? 0 : thrustGain);
    audioService.setNitroGain(ship.isNitro ? thrustGain : 0);

    // ── Multijugador por frame ──
    if (this.multiplayer) {
      const abs = toAbsolute(
        { x: ship.position.x, y: ship.position.y, z: ship.position.z },
        this.worldOffset,
      );
      this.multiplayer.sendState({ x: abs.x, y: abs.y, z: abs.z, yaw: ship.yaw }, time);
      this.multiplayer.maybeSendPing(time);
    }
    this.remoteShips?.update(delta);

    // Reset manual (autoReset=false, ver mount()): antes de renderizar el frame,
    // para que info.render acumule TODAS las pasadas internas del composer.
    this.renderer.info.reset();
    this.composer.render();
    // Draw calls/triángulos: lectura de renderer.info tras el render (coste cero).
    this.lastDrawCalls = this.renderer.info.render.calls;
    this.lastTriangles = this.renderer.info.render.triangles;
    if (this.perfHud.visible) this.perfHud.update(this.getPerfSnapshot());
    this.updateLabels();
  };

  /** Snapshot de instrumentación de rendimiento (Hito 0): frame p50/p95/p99, draw calls, pixelRatio, RTT. */
  getPerfSnapshot(): PerfSnapshot {
    return {
      frame: computeStats(this.frameStats.toArray()),
      drawCalls: this.lastDrawCalls,
      triangles: this.lastTriangles,
      pixelRatio: this.pixelRatio,
      rttMs: this.multiplayer?.rttMs ?? null,
    };
  }

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
    audioService.unlock();
    if (this.pauseMenu.visible) return;
    // En órbita el cursor queda libre para clicar "Entrar": no recapturamos el puntero.
    if (this.orbit.phase === 'orbiting') return;
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
    if (e.code === 'KeyE' || e.code === 'Space') {
      // Space o E: entrar al proyecto del planeta en aproximación/órbita.
      this.enterCurrentProject();
      return;
    }
    // C: abre/cierra la rueda de emoticonos (solo si hay multijugador).
    if (e.code === 'KeyC') {
      this.emoteWheel?.toggle();
      return;
    }
    // P: alterna el panel de diagnóstico de rendimiento (Hito 0).
    if (e.code === 'KeyP') {
      this.perfHud.toggle();
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

  // ── Interacción orbital (#3): máquina de estados libre/órbita/expulsión ──
  private updateOrbit(approaching: ApproachInfo | null, shipState: ShipState, delta: number) {
    const prevPhase = this.orbit.phase;
    const exitPressed = this.ship.exitOrbitPressed || this.exitOrbitRequested;
    this.exitOrbitRequested = false; // consumido este frame
    const r = stepOrbit(
      this.orbit,
      {
        insideInfluence: !!approaching,
        enterPressed: false, // la entrada al proyecto la dispara onKeyDown(E)/botón de forma síncrona (pestaña nueva)
        exitPressed,
        dt: delta,
      },
      { cooldownDuration: ORBIT_CONFIG.ejectCooldownSeconds },
    );
    this.orbit = r.state;

    if (prevPhase !== 'orbiting' && this.orbit.phase === 'orbiting' && approaching) {
      this.beginOrbit(approaching);
    }
    if (this.orbit.phase === 'orbiting' && approaching) {
      this.advanceOrbit(approaching, delta);
    }

    if (r.action === 'eject' && approaching) {
      this.ship.setOrbiting(false);
      const v = ejectVelocity(approaching.center, this.ship.object.position, ORBIT_CONFIG.ejectStrength);
      this.ship.applyImpulse(this.orbitImpulse.set(v.x, v.y, v.z));
    }
  }

  /** Botón "Salir de la órbita" del HUD (S5): marca la solicitud para el próximo `updateOrbit`. */
  private exitOrbit = () => {
    this.exitOrbitRequested = true;
  };

  /** Captura: fija centro, radio (distancia acotada) y el plano orbital (S3: determinista, orientado al sol). */
  private beginOrbit(approaching: ApproachInfo) {
    this.orbitCenter.copy(approaching.center);
    const dist = this.ship.object.position.distanceTo(this.orbitCenter) || 1;
    this.orbitRadius = Math.max(
      approaching.planetRadius * 1.5,
      Math.min(dist, approaching.influenceRadius),
    );
    const basis = buildOrbitBasis({
      center: this.orbitCenter,
      ship: this.ship.object.position,
      sun: this.ramatzoSun.position,
    });
    this.orbitU.set(basis.U.x, basis.U.y, basis.U.z);
    this.orbitV.set(basis.V.x, basis.V.y, basis.V.z);
    this.orbitAngle = 0;
    this.ship.setOrbiting(true);
    // En órbita no hay control: libera el puntero para que el cursor se vea y pueda
    // clicar el botón "Entrar"/"Salir" del HUD.
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Avanza la órbita un frame, relativa al centro VIVO del planeta (órbita + rebase). */
  private advanceOrbit(approaching: ApproachInfo, delta: number) {
    this.orbitCenter.copy(approaching.center);
    this.orbitAngle += ORBIT_CONFIG.angularSpeed * delta;
    const cos = Math.cos(this.orbitAngle);
    const sin = Math.sin(this.orbitAngle);
    this.ship.object.position
      .copy(this.orbitCenter)
      .addScaledVector(this.orbitU, cos * this.orbitRadius)
      .addScaledVector(this.orbitV, sin * this.orbitRadius);
  }

  /** S4: transición suave (lerp) entre la cámara de persecución y la pose orbital (sol+planeta). */
  private updateOrbitCameraBlend(delta: number, approaching: ApproachInfo | null) {
    const wantOrbitCam = this.orbit.phase === 'orbiting' && !!approaching;
    const blendRate = delta / CAMERA_CONFIG.orbit.easeSeconds;
    this.orbitCamBlend = wantOrbitCam
      ? Math.min(1, this.orbitCamBlend + blendRate)
      : Math.max(0, this.orbitCamBlend - blendRate);
    if (this.orbitCamBlend <= 0) return;

    const center = approaching ? approaching.center : this.orbitCenter;
    const planetRadius = approaching ? approaching.planetRadius : 1;
    const pose = orbitCameraPose({
      center: { x: center.x, y: center.y, z: center.z },
      sun: { x: this.ramatzoSun.position.x, y: this.ramatzoSun.position.y, z: this.ramatzoSun.position.z },
      planetRadius,
      params: CAMERA_CONFIG.orbit,
    });
    this.orbitCamPos.set(pose.position.x, pose.position.y, pose.position.z);
    this.orbitCamTarget.set(pose.target.x, pose.target.y, pose.target.z);
    this.orbitCamUp.set(pose.up.x, pose.up.y, pose.up.z);

    this.camera.position.lerp(this.orbitCamPos, this.orbitCamBlend);
    this.blendedLookTarget.copy(this.chaseCamera.currentLookTarget).lerp(this.orbitCamTarget, this.orbitCamBlend);
    this.camera.up.lerp(this.orbitCamUp, this.orbitCamBlend).normalize();
    this.camera.lookAt(this.blendedLookTarget);
  }

  /** Entra al proyecto en aproximación/órbita (tecla E o botón "Entrar" del HUD). */
  private enterCurrentProject = () => {
    if (this.pauseMenu.visible) return;
    const app = this.approachingApp;
    if (app) this.enterProject(app);
  };

  /** Entrada al proyecto. COSTURA del circuito (#6): por ahora abre directo; #6 la envolverá. */
  private enterProject(app: AppInfo) {
    if (app.externalUrl) {
      window.open(app.externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    // S6 (arregla Bug B): deja el estado orbital en vuelo libre con cooldown
    // anti-recaptura ANTES de pausar. Al volver (resume), WASD integra empuje
    // de inmediato — la nave ya no queda re-anclada al mismo planeta.
    this.orbit = freeAfterExit({ cooldownDuration: ORBIT_CONFIG.ejectCooldownSeconds });
    this.ship.setOrbiting(false);
    this.approachingApp = null;
    audioService.enterProjectAudio(app.id);
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

  // Emoji propio flotante ~3 s (mapeo de glifos sobrios compartido, igual que RemoteShips).
  private showSelfEmote(emoji: string) {
    if (!this.selfEmoteEl) return;
    this.selfEmoteEl.textContent = EMOTE_GLYPH[emoji] ?? emoji;
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
    this.emoteWheel?.close(); // no dejar la rueda interactuable en pausa/cabina
    this.controlPrompt?.classList.remove('visible');
  }

  resume() {
    if (document.hidden) return;
    audioService.exitProjectAudio();
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
    this.perfHud?.dispose();
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
