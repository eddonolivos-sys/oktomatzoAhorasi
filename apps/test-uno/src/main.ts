import { ShellClient } from '@plataforma/shell-protocol';

const client = new ShellClient('test-uno');
const statusEl = document.getElementById('status')!;
const statusText = document.getElementById('status-text')!;

client.onToken = (_token, user) => {
  statusText.textContent = `Autenticado como ${user.name}`;
  statusEl.classList.remove('running');
  statusEl.classList.add('ok');
};

client.onTheme = (mode) => {
  document.documentElement.setAttribute('data-theme', mode);
};

// Report height for iframe sizing
function reportHeight() {
  client.reportHeight(document.documentElement.scrollHeight);
}
reportHeight();
window.addEventListener('resize', reportHeight);
new ResizeObserver(reportHeight).observe(document.body);

// Heartbeat de actividad mientras no haya sesión
let count = 0;
setInterval(() => {
  count++;
  if (!statusEl.classList.contains('ok')) {
    statusText.textContent = `Ejecutándose · ${count}s`;
    statusEl.classList.add('running');
  }
}, 1000);
