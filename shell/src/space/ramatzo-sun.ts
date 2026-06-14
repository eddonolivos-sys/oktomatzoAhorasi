import * as THREE from 'three';

export interface RamatzoSun {
  object: THREE.Group;
  /** Posición en espacio de escena (se desplaza con el rebase de origen). */
  readonly position: THREE.Vector3;
  update(elapsed: number): void;
  dispose(): void;
}

function createCoronaTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255, 220, 160, 0.9)');
  g.addColorStop(0.25, 'rgba(255, 140, 66, 0.5)');
  g.addColorStop(0.6, 'rgba(200, 75, 49, 0.15)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/**
 * Sol central "Ramatzo": hub de origen, visible desde lejos como faro
 * (materiales con fog desactivado). Núcleo emisivo (brilla con bloom) + capa
 * aditiva pulsante + corona (sprite) + luz cálida.
 */
export function createRamatzoSun(): RamatzoSun {
  const group = new THREE.Group();
  const radius = 14;

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false }),
  );
  group.add(core);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.05, 48, 48),
    new THREE.MeshBasicMaterial({
      color: 0xff8c42,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  group.add(shell);

  const coronaTex = createCoronaTexture();
  const corona = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: coronaTex,
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.9,
      fog: false,
    }),
  );
  corona.scale.set(radius * 9, radius * 9, 1);
  group.add(corona);

  const light = new THREE.PointLight(0xffb060, 2.2, 700, 2);
  group.add(light);

  return {
    object: group,
    get position() {
      return group.position;
    },
    update(elapsed) {
      core.rotation.y += 0.0008;
      const pulse = 0.85 + 0.15 * Math.sin(elapsed * 0.6);
      (shell.material as THREE.MeshBasicMaterial).opacity = 0.4 * pulse;
      const s = radius * (8.5 + 0.5 * Math.sin(elapsed * 0.5));
      corona.scale.set(s, s, 1);
    },
    dispose() {
      core.geometry.dispose();
      (core.material as THREE.Material).dispose();
      shell.geometry.dispose();
      (shell.material as THREE.Material).dispose();
      const cm = corona.material as THREE.SpriteMaterial;
      cm.map?.dispose();
      cm.dispose();
    },
  };
}
