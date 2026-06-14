import * as THREE from 'three';

/** Nave exploradora "Auriga": cápsula + alas + motores + antena. */
export function createShipAuriga(): THREE.Group {
  const group = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.4, metalness: 0.8, envMapIntensity: 0.3 });
  const cockpitMat = new THREE.MeshPhysicalMaterial({ color: 0x1a3a4a, roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.3 });
  const engineMat = new THREE.MeshStandardMaterial({ color: 0xd4602a, emissive: 0xff6b35, emissiveIntensity: 0.8 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.2, 8, 16), metalMat);
  body.scale.set(1, 1, 1.8);
  group.add(body);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), cockpitMat);
  cockpit.position.set(0, 0.25, 1.1);
  group.add(cockpit);

  const wingMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.6, metalness: 0.3 });
  const wingGeo = new THREE.BoxGeometry(0.08, 0.6, 1.2);
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(-0.8, -0.1, 0.2);
  wingL.rotation.z = 0.3;
  group.add(wingL);
  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.position.set(0.8, -0.1, 0.2);
  wingR.rotation.z = -0.3;
  group.add(wingR);

  const tipMat = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.5, metalness: 0.4 });
  for (let side = -1; side <= 1; side += 2) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.1), tipMat);
    tip.position.set(side * 0.95, -0.15, 0.2);
    group.add(tip);
  }

  const engineGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.2, 12);
  const engineL = new THREE.Mesh(engineGeo, engineMat);
  engineL.position.set(-0.3, 0, -1.2);
  engineL.rotation.x = Math.PI / 2;
  group.add(engineL);
  const engineR = new THREE.Mesh(engineGeo, engineMat);
  engineR.position.set(0.3, 0, -1.2);
  engineR.rotation.x = Math.PI / 2;
  group.add(engineR);
  const engineC = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.25, 12), engineMat);
  engineC.position.set(0, 0, -1.3);
  engineC.rotation.x = Math.PI / 2;
  group.add(engineC);

  const antennaMat = new THREE.MeshStandardMaterial({ color: 0x8b7a5a, roughness: 0.3, metalness: 0.7 });
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), antennaMat);
  antenna.position.set(0, 0.4, 0.8);
  group.add(antenna);
  const antennaBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xd4a84b, emissive: 0xd4a84b, emissiveIntensity: 0.3 }),
  );
  antennaBall.position.set(0, 0.55, 0.8);
  group.add(antennaBall);

  const edges = new THREE.EdgesGeometry(body.geometry);
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0x5a4a3a, transparent: true, opacity: 0.3 }),
  );
  line.scale.copy(body.scale);
  line.position.copy(body.position);
  group.add(line);

  group.scale.set(1.2, 1.2, 1.2);
  return group;
}

/** Nave carguero "Yunque": casco robusto + contenedores + 4 motores. */
export function createShipYunque(): THREE.Group {
  const group = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.7, metalness: 0.5 });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8, metalness: 0.2 });
  const engineMat = new THREE.MeshStandardMaterial({ color: 0xe6a817, emissive: 0xff8c42, emissiveIntensity: 0.6 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 2.4), metalMat);
  body.position.y = 0.1;
  group.add(body);

  const cockpitMat = new THREE.MeshPhysicalMaterial({ color: 0x2a3a4a, roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.25 });
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), cockpitMat);
  cockpit.position.set(0, 0.35, 1.0);
  cockpit.scale.set(1.2, 0.6, 0.8);
  group.add(cockpit);

  for (let i = -1; i <= 1; i += 2) {
    const container = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.7), rustMat);
    container.position.set(i * 0.5, -0.35, -0.1);
    group.add(container);
  }

  const armMat = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.5, metalness: 0.7 });
  for (let side = -1; side <= 1; side += 2) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1.2), armMat);
    arm.position.set(side * 1.05, 0.1, 0.2);
    group.add(arm);
  }

  for (let x = -0.6; x <= 0.6; x += 1.2) {
    for (let y = -0.25; y <= 0.25; y += 0.5) {
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.2, 10), engineMat);
      engine.position.set(x, y, -1.4);
      engine.rotation.x = Math.PI / 2;
      group.add(engine);
    }
  }

  const antMat = new THREE.MeshStandardMaterial({ color: 0x8b7a5a, metalness: 0.8, roughness: 0.2 });
  for (let i = 0; i < 3; i++) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4), antMat);
    ant.position.set(-0.3 + i * 0.3, 0.5, 0.6);
    group.add(ant);
  }

  return group;
}

/** Nave interceptor "Flecha": cono + alas en flecha + motor con anillo. */
export function createShipFlecha(): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8d8c8, roughness: 0.3, metalness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.8, metalness: 0.2 });
  const engineMat = new THREE.MeshStandardMaterial({ color: 0xff6b35, emissive: 0xff6b35, emissiveIntensity: 1.0 });

  const body = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.0, 12), bodyMat);
  body.rotation.x = Math.PI / 2;
  body.position.z = 0.3;
  group.add(body);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(1.4, 0);
  wingShape.lineTo(1.6, -0.6);
  wingShape.lineTo(0, -0.6);
  wingShape.closePath();
  const wingGeo = new THREE.ShapeGeometry(wingShape);
  for (let side = -1; side <= 1; side += 2) {
    const wing = new THREE.Mesh(wingGeo, darkMat);
    wing.position.set(0, side * 0.05, -0.5);
    wing.rotation.x = side * 0.4;
    wing.rotation.z = side * 0.1;
    group.add(wing);
  }

  for (let side = -1; side <= 1; side += 2) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.4), darkMat);
    fin.position.set(side * 0.2, 0, -0.8);
    fin.rotation.z = side * 0.2;
    group.add(fin);
  }

  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.3, 12), engineMat);
  engine.position.set(0, 0, -1.0);
  engine.rotation.x = Math.PI / 2;
  group.add(engine);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.25, 0.03, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0x8b7a5a, metalness: 0.8, roughness: 0.2 }),
  );
  ring.position.set(0, 0, -0.85);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const pod = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 12),
    new THREE.MeshPhysicalMaterial({ color: 0x2a3a4a, roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.2 }),
  );
  pod.position.set(0, 0.15, 0.8);
  group.add(pod);

  return group;
}

/** Coloca las 3 naves decorativas cerca del spawn. */
export function placeShips(scene: THREE.Scene): THREE.Group[] {
  const auriga = createShipAuriga();
  auriga.position.set(-25, 0, -40);
  auriga.rotation.y = 0.5;
  auriga.userData = { name: 'Auriga', type: 'ship' };

  const yunque = createShipYunque();
  yunque.position.set(30, -2, -80);
  yunque.rotation.y = -0.3;
  yunque.userData = { name: 'Yunque', type: 'ship' };

  const flecha = createShipFlecha();
  flecha.position.set(-10, 2, -120);
  flecha.rotation.y = 0.8;
  flecha.userData = { name: 'Flecha', type: 'ship' };

  const ships = [auriga, yunque, flecha];
  ships.forEach((s) => scene.add(s));
  return ships;
}

/** Flotación suave de las naves. */
export function floatShips(ships: THREE.Group[], elapsed: number, delta: number) {
  for (const ship of ships) {
    ship.position.y += Math.sin(elapsed * ship.position.x * 0.02 + ship.position.z) * delta * 0.3;
    ship.rotation.z = Math.sin(elapsed * 0.3 + ship.position.x) * 0.02;
  }
}
