import { ShellClient } from '@plataforma/shell-protocol';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const client = new ShellClient('viewer-3d');

const container = document.getElementById('app')!;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(5, 5, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lights
const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);

const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
fillLight.position.set(-5, 0, 5);
scene.add(fillLight);

// Ground plane
const groundGeometry = new THREE.PlaneGeometry(20, 20);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x2a2a4e,
  roughness: 0.8,
  metalness: 0.2,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.5;
ground.receiveShadow = true;
scene.add(ground);

// Main object: Icosahedron with wireframe
const geometry = new THREE.IcosahedronGeometry(2, 0);
const material = new THREE.MeshPhysicalMaterial({
  color: 0x0071e3,
  metalness: 0.3,
  roughness: 0.4,
  clearcoat: 0.8,
  clearcoatRoughness: 0.3,
  emissive: 0x002244,
  emissiveIntensity: 0.2,
});
const mesh = new THREE.Mesh(geometry, material);
mesh.castShadow = true;
mesh.position.y = 1;
scene.add(mesh);

// Wireframe overlay
const wireGeo = new THREE.IcosahedronGeometry(2.05, 0);
const wireMat = new THREE.MeshBasicMaterial({
  color: 0x00aaff,
  wireframe: true,
  transparent: true,
  opacity: 0.3,
});
const wireframe = new THREE.Mesh(wireGeo, wireMat);
wireframe.position.y = 1;
scene.add(wireframe);

// Floating particles
const particlesGeo = new THREE.BufferGeometry();
const particleCount = 500;
const positions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount * 3; i++) {
  positions[i] = (Math.random() - 0.5) * 30;
}
particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const particlesMat = new THREE.PointsMaterial({
  color: 0x4488ff,
  size: 0.05,
  transparent: true,
  opacity: 0.6,
});
const particles = new THREE.Points(particlesGeo, particlesMat);
scene.add(particles);

// Animation
let time = 0;

function animate() {
  requestAnimationFrame(animate);
  time += 0.005;

  mesh.rotation.x += 0.003;
  mesh.rotation.y += 0.005;
  wireframe.rotation.x = mesh.rotation.x;
  wireframe.rotation.y = mesh.rotation.y;

  mesh.position.y = 1 + Math.sin(time) * 0.3;
  wireframe.position.y = mesh.position.y;

  controls.update();
  renderer.render(scene, camera);
}

animate();

// Handle resize
function resize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

window.addEventListener('resize', resize);

// Report height to shell
function reportHeight() {
  client.reportHeight(container.clientHeight);
}
reportHeight();
window.addEventListener('resize', reportHeight);

// Auth handling
client.onToken = (token, user) => {
  console.log('3D Viewer: authenticated as', user.name);
};

// Theme handling
client.onTheme = (mode) => {
  if (mode === 'dark') {
    scene.background = new THREE.Color(0x1a1a2e);
  } else {
    scene.background = new THREE.Color(0xf0f0f5);
  }
};

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  renderer.dispose();
  geometry.dispose();
  material.dispose();
  wireGeo.dispose();
  wireMat.dispose();
  particlesGeo.dispose();
  particlesMat.dispose();
  groundGeometry.dispose();
  groundMaterial.dispose();
  controls.dispose();
  client.destroy();
});
