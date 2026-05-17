import * as THREE from 'three';
import { Vehicle } from './Vehicle';
import { Projectile } from './Projectile';
import { Hazards } from './Hazards';
import { HUD } from './HUD';
import { Menu } from './Menu';
import { MultiplayerClient, type RemotePlayer, type ShootData } from './MultiplayerClient';

function generateId(): string {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

type GameState = 'playing' | 'dead' | 'respawning';

const NEAR_DIST = 10;
const FAR_DIST = 22;
const CAM_HEIGHT = 5;
const LERP_FACTOR = 0.06;
const MAX_HEALTH = 100;
const COLLISION_DAMAGE = 25;
const SHOOT_COOLDOWN = 0.6;
const DEATH_TRACK_WINDOW = 30_000;
const DEATH_TRACK_THRESHOLD = 3;

interface Particle {
  mesh: THREE.Mesh;
  dir: THREE.Vector3;
  speed: number;
  life: number;
}

export class Game {
  static effectsEnabled = true;
  static showHitboxes = false;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;

  private vehicle!: Vehicle;
  private hazards!: Hazards;
  private hud!: HUD;
  private menu!: Menu;

  private state: GameState = 'playing';
  private health = MAX_HEALTH;
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private shootCooldown = 0;

  private deathTimes: number[] = [];
  private respawnTimer = 0;
  private invulnTimer = 0;

  private input = { forward: false, backward: false, left: false, right: false };
  private keys: Set<string> = new Set();

  private cameraNear = false;
  private cameraTarget = new THREE.Vector3();
  private cameraSmoothPos = new THREE.Vector3();

  private cameraAzimuth = Math.PI;
  private cameraElevation = 0.4;
  private isOrbiting = false;
  private orbitLastX = 0;
  private orbitLastY = 0;

  private hitboxHelpers: THREE.LineSegments[] = [];

  private paused = false;
  private animFrameId = 0;

  private multiplayer: MultiplayerClient | null = null;
  private playerName = '';
  private remoteVehicles: Map<string, { group: THREE.Group; body: THREE.Mesh }> = new Map();
  private remoteProjectiles: Map<string, { mesh: THREE.Mesh; lifetime: number; dir: THREE.Vector3 }> = new Map();
  private stateSyncTimer = 0;

  constructor() {
    const container = document.getElementById('app')!;
    container.innerHTML = '';

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 200, 500);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, CAM_HEIGHT, FAR_DIST);

    this.clock = new THREE.Clock();

    this.setupScene();
    this.setupControls();
    this.setupMouseOrbit();
    this.setupResize();
  }

  private setupScene() {
    const ambient = new THREE.AmbientLight(0x404060, 0.5);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
    sun.position.set(50, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    this.scene.add(sun);

    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3a3a5c, 0.6);
    this.scene.add(hemi);

    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3d5a3d, roughness: 0.95, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(1000, 20, 0x555555, 0x333333);
    grid.position.y = 0.05;
    this.scene.add(grid);
  }

  private setupControls() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      this.updateInput();

      if (e.key === ' ') { e.preventDefault(); this.shoot(); }
      if (e.key.toLowerCase() === 'c') { this.toggleCamera(); }
      if (e.key.toLowerCase() === 'r' && this.state === 'dead') { this.restart(); }
      if (e.key === 'Escape') { this.togglePause(); }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      this.updateInput();
    });
  }

  private setupMouseOrbit() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.isOrbiting = true;
        this.orbitLastX = e.clientX;
        this.orbitLastY = e.clientY;
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.isOrbiting) return;
      const dx = e.clientX - this.orbitLastX;
      const dy = e.clientY - this.orbitLastY;
      this.cameraAzimuth -= dx * 0.008;
      this.cameraElevation = Math.max(0.1, Math.min(1.3, this.cameraElevation + dy * 0.008));
      this.orbitLastX = e.clientX;
      this.orbitLastY = e.clientY;
    });
    window.addEventListener('mouseup', () => { this.isOrbiting = false; });
  }

  private updateInput() {
    this.input.forward = this.keys.has('w');
    this.input.backward = this.keys.has('s');
    this.input.left = this.keys.has('a');
    this.input.right = this.keys.has('d');
  }

  private computeTargetHeading(): number | null {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0; right.normalize();

    let dx = 0, dz = 0;
    if (this.input.forward) { dx += fwd.x; dz += fwd.z; }
    if (this.input.backward) { dx -= fwd.x; dz -= fwd.z; }
    if (this.input.left) { dx -= right.x; dz -= right.z; }
    if (this.input.right) { dx += right.x; dz += right.z; }

    if (dx === 0 && dz === 0) return null;
    return Math.atan2(dx, -dz);
  }

  private setupResize() {
    const onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);
  }

  start(playerName?: string) {
    this.playerName = playerName || 'Jugador';
    this.vehicle = new Vehicle(this.scene);
    this.hazards = new Hazards(this.scene);
    this.hud = new HUD(() => this.togglePause());
    this.menu = new Menu({
      onStart: () => {},
      onTutorial: () => {},
      onToggleEffects: () => {},
      onToggleHitboxes: () => {},
    });

    this.setupMultiplayer();

    this.cameraSmoothPos.copy(this.camera.position);
    this.clock.start();
    this.loop();
  }

  private setupMultiplayer() {
    const id = generateId();
    this.multiplayer = new MultiplayerClient(id, {
      onPlayers: (players) => this.syncRemotePlayers(players),
      onPlayerJoined: (player) => this.addRemoteVehicle(player),
      onPlayerLeft: (id) => this.removeRemoteVehicle(id),
      onHazards: (hazards) => this.syncHazards(hazards),
      onShoot: (data) => this.onRemoteShoot(data),
    });
    this.multiplayer.connect(this.playerName);
  }

  private loop = () => {
    const dt = this.clock.getDelta();

    if (!this.paused) {
      this.update(dt);
    }

    this.renderer.render(this.scene, this.camera);
    this.animFrameId = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    const safeDt = Math.min(dt, 0.05);

    this.updateParticles(safeDt);

    if (this.state === 'dead') {
      this.hazards.update(safeDt, this.vehicle.group.position);
      this.hud.updateHazardCount(this.hazards.activeCount);
      this.hud.updateWaveTimer(this.hazards.waveProgress, 5);
      this.hud.updateMessageTimer(safeDt);
      return;
    }

    if (this.state === 'respawning') {
      this.respawnTimer -= safeDt;
      this.invulnTimer -= safeDt;
      this.hazards.update(safeDt, this.vehicle.group.position);
      this.hud.updateHazardCount(this.hazards.activeCount);
      this.hud.updateWaveTimer(this.hazards.waveProgress, 5);
      this.hud.updateMessageTimer(safeDt);
      this.updateCamera(safeDt);
      this.updateHitboxHelpers();
      if (this.respawnTimer <= 0) {
        this.state = 'playing';
        this.vehicle.setInvulnerable(false);
        this.hud.showMessage('¡Has reaparecido!', 'info', 2);
      }
      return;
    }

    const targetHeading = this.computeTargetHeading();
    this.vehicle.update(safeDt, this.input, targetHeading);
    this.hazards.update(safeDt, this.vehicle.group.position);
    this.updateProjectiles(safeDt);
    this.updateCamera(safeDt);
    this.checkCollisions();

    if (this.shootCooldown > 0) this.shootCooldown -= safeDt;

    this.stateSyncTimer += safeDt;
    if (this.stateSyncTimer >= 0.05 && this.multiplayer?.connected) {
      this.stateSyncTimer = 0;
      this.multiplayer.sendState({
        x: this.vehicle.group.position.x,
        z: this.vehicle.group.position.z,
        heading: this.vehicle.heading,
        speed: this.vehicle.speed,
        alive: this.vehicle.alive,
        health: this.health,
      });
    }

    this.hud.updateHealth(this.health, MAX_HEALTH);
    this.hud.updateHazardCount(this.hazards.activeCount);
    this.hud.updateWaveTimer(this.hazards.waveProgress, 5);
    this.hud.updateCooldown(this.shootCooldown <= 0, this.shootCooldown / SHOOT_COOLDOWN);
    this.hud.updateMessageTimer(safeDt);
    this.hud.updateDebugLabel();

    this.updateHitboxHelpers();
  }

  private updateCamera(dt: number) {
    const pos = this.vehicle.group.position;
    const dist = this.cameraNear ? NEAR_DIST : FAR_DIST;

    this.cameraTarget.set(
      pos.x + dist * Math.sin(this.cameraAzimuth) * Math.cos(this.cameraElevation),
      pos.y + CAM_HEIGHT + dist * Math.sin(this.cameraElevation),
      pos.z + dist * Math.cos(this.cameraAzimuth) * Math.cos(this.cameraElevation),
    );

    this.cameraSmoothPos.lerp(this.cameraTarget, LERP_FACTOR);
    this.camera.position.copy(this.cameraSmoothPos);
    this.camera.lookAt(pos.x, pos.y + 1, pos.z);
  }

  private toggleCamera() {
    this.cameraNear = !this.cameraNear;
  }

  private shoot() {
    if (this.shootCooldown > 0 || this.state === 'dead' || this.state === 'respawning' || !this.vehicle.alive) {
      return;
    }

    this.shootCooldown = SHOOT_COOLDOWN;
    const origin = this.vehicle.cannonPosition;
    const dir = this.vehicle.cannonDirection;
    const p = new Projectile(origin, dir, this.scene);
    this.projectiles.push(p);
    this.multiplayer?.sendShoot([origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z]);
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      if (!p.active) {
        this.projectiles.splice(i, 1);
        continue;
      }
      this.checkProjectileHit(p, i);
    }
  }

  private checkProjectileHit(p: Projectile, idx: number) {
    const hazards = this.hazards.getHazards();
    for (let hi = hazards.length - 1; hi >= 0; hi--) {
      const h = hazards[hi];
      if (p.mesh.position.distanceTo(h.position) < 6) {
        this.spawnExplosion(h.position);
        this.hazards.removeHazard(hi);
        p.destroy();
        this.projectiles.splice(idx, 1);
        return;
      }
    }

    for (const [pid, g] of this.remoteVehicles) {
      const dist = p.mesh.position.distanceTo(g.group.position);
      if (dist < 2.5) {
        this.spawnExplosion(g.group.position);
        p.destroy();
        this.projectiles.splice(idx, 1);
        this.multiplayer?.sendDamage(pid, 25);
        return;
      }
    }
  }

  private spawnExplosion(pos: THREE.Vector3) {
    if (!Game.effectsEnabled) return;
    const count = 8;
    for (let i = 0; i < count && this.particles.length < 30; i++) {
      const size = 0.1 + Math.random() * 0.3;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.05 + Math.random() * 0.1, 1, 0.5),
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() * 0.5 + 0.5,
        Math.random() - 0.5
      ).normalize();
      const speed = 5 + Math.random() * 10;
      this.scene.add(mesh);
      this.particles.push({ mesh, dir, speed, life: 1 });
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.mesh.position.addScaledVector(p.dir, p.speed * dt);
      p.life -= dt * 2;
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, p.life);
      p.mesh.scale.setScalar(Math.max(0, p.life));
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        mat.dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  private checkCollisions() {
    if (!this.vehicle.alive || this.invulnTimer > 0) return;

    const vPos = this.vehicle.group.position;
    const vR = this.vehicle.radius;
    const vMin = new THREE.Vector3(vPos.x - vR, 0, vPos.z - vR);
    const vMax = new THREE.Vector3(vPos.x + vR, vR * 2, vPos.z + vR);

    const hazards = this.hazards.getHazards();
    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i];
      const hMin = h.position.clone().subScalar(2.5);
      const hMax = h.position.clone().addScalar(2.5);

      if (vMin.x <= hMax.x && vMax.x >= hMin.x &&
          vMin.y <= hMax.y && vMax.y >= hMin.y &&
          vMin.z <= hMax.z && vMax.z >= hMin.z) {

        if (!h.landed && h.position.y > 2.5) {
          this.die(true);
          this.hazards.removeHazard(i);
          return;
        }

        this.health -= COLLISION_DAMAGE;
        this.vehicle.flashDamage();
        this.hud.showMessage('Has perdido vida', 'damage', 1.5);
        this.hazards.removeHazard(i, vPos);

        if (this.health <= 0) {
          this.die(false);
          return;
        }
      }
    }
  }

  private die(instant: boolean) {
    this.vehicle.kill();
    this.state = 'dead';

    this.deathTimes.push(Date.now());
    this.deathTimes = this.deathTimes.filter(t => Date.now() - t < DEATH_TRACK_WINDOW);
    if (this.deathTimes.length >= DEATH_TRACK_THRESHOLD) {
      this.hud.showMessage('¿Necesitas ayuda? Prueba a moverte constantemente hacia un lado.', 'warning', 5);
    }

    this.hud.showMessage(instant ? '¡Golpe directo! Muerte instantánea' : 'Has muerto', 'death', 3);

    this.spawnExplosion(this.vehicle.group.position);
    this.menu.showDeathMenu(() => this.restart());
  }

  private restart() {
    this.state = 'respawning';
    this.health = MAX_HEALTH;
    this.respawnTimer = 3;
    this.invulnTimer = 3;
    this.shootCooldown = 0;

    this.vehicle.respawn();
    this.hazards.removeAll();
    this.hazards.resetTimer();

    for (const p of this.projectiles) p.destroy();
    this.projectiles = [];

    this.menu.hidePause();
    this.hud.showMessage('¡Has reaparecido! Los objetos volverán en 3 segundos', 'info', 3);
  }

  private togglePause() {
    if (this.state === 'dead') return;
    this.paused = !this.paused;
    if (this.paused) {
      this.menu.showPauseMenu(
        () => { this.paused = false; this.menu.hidePause(); },
        () => { this.paused = false; this.restart(); }
      );
    } else {
      this.menu.hidePause();
    }
  }

  private updateHitboxHelpers() {
    for (const h of this.hitboxHelpers) {
      this.scene.remove(h);
      h.geometry.dispose();
      (h.material as THREE.Material).dispose();
    }
    this.hitboxHelpers = [];

    if (!Game.showHitboxes) return;

    const vPos = this.vehicle.group.position;
    const vR = this.vehicle.radius;
    const vHelper = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(vR * 2, vR * 2, vR * 2)),
      new THREE.LineBasicMaterial({ color: 0x00ff00 })
    );
    vHelper.position.copy(vPos);
    this.scene.add(vHelper);
    this.hitboxHelpers.push(vHelper);

    for (const h of this.hazards.getHazards()) {
      const helper = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(5, 5, 5)),
        new THREE.LineBasicMaterial({ color: 0xff0000 })
      );
      helper.position.copy(h.position);
      this.scene.add(helper);
      this.hitboxHelpers.push(helper);
    }
  }

  // ── Multiplayer ──────────────────────────────────────────────────

  private syncRemotePlayers(players: RemotePlayer[]) {
    const seen = new Set<string>();
    for (const p of players) {
      seen.add(p.id);
      if (p.id === this.multiplayer?.playerId) continue;
      if (!this.remoteVehicles.has(p.id)) {
        this.addRemoteVehicle(p);
      }
      const g = this.remoteVehicles.get(p.id)!;
      g.group.position.x = p.x;
      g.group.position.z = p.z;
      g.group.rotation.y = p.heading;
      g.group.visible = p.alive;
    }
    for (const [id] of this.remoteVehicles) {
      if (!seen.has(id)) this.removeRemoteVehicle(id);
    }
  }

  private addRemoteVehicle(player: RemotePlayer) {
    if (this.remoteVehicles.has(player.id)) return;
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff4444, metalness: 0.3, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 2), bodyMat);
    body.position.y = 0.6;
    group.add(body);

    const cabinMat = new THREE.MeshStandardMaterial({ color: 0xff6666, metalness: 0.2, roughness: 0.7 });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.4), cabinMat);
    cabin.position.set(0, 1.2, -0.2);
    group.add(cabin);

    group.position.set(player.x, 0, player.z);
    group.rotation.y = player.heading;
    this.scene.add(group);
    this.remoteVehicles.set(player.id, { group, body });

    const nameLabel = this.createNameLabel(player.name);
    nameLabel.position.y = 2.2;
    group.add(nameLabel);
  }

  private createNameLabel(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.roundRect?.(0, 0, 256, 64, 8);
    ctx.fill();
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2, 0.5, 1);
    return sprite;
  }

  private removeRemoteVehicle(id: string) {
    const g = this.remoteVehicles.get(id);
    if (g) {
      this.scene.remove(g.group);
      g.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      this.remoteVehicles.delete(id);
    }
  }

  private syncHazards(serverHazards: { x: number; y: number; z: number; landed: boolean; index: number }[]) {
    // If no hazards locally, use server hazards
    if (this.hazards.getHazards().length === 0 && serverHazards.length > 0) {
      for (const h of serverHazards) {
        // Simple: let the local hazard system handle it
      }
    }
  }

  private onRemoteShoot(data: ShootData) {
    const origin = new THREE.Vector3(data.origin[0], data.origin[1], data.origin[2]);
    const dir = new THREE.Vector3(data.dir[0], data.dir[1], data.dir[2]);
    const p = new Projectile(origin, dir, this.scene);
    this.projectiles.push(p);
  }

  destroy() {
    this.multiplayer?.disconnect();
    cancelAnimationFrame(this.animFrameId);
    this.vehicle?.destroy();
    this.hazards?.destroy();
    for (const [, g] of this.remoteVehicles) {
      this.scene.remove(g.group);
      g.group.traverse((child) => {
        if (child instanceof THREE.Mesh) { child.geometry.dispose(); (child.material as THREE.Material).dispose(); }
      });
    }
    this.remoteVehicles.clear();
    for (const p of this.projectiles) p.destroy();
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
    this.hud?.destroy();
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }
}
