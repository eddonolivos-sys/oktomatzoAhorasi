import { ShellClient } from '@plataforma/shell-protocol';

const client = new ShellClient('test-dos');
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

function reportHeight() {
  client.reportHeight(document.documentElement.scrollHeight);
}
reportHeight();
window.addEventListener('resize', reportHeight);
new ResizeObserver(reportHeight).observe(document.body);

// Demo de navegación cross-app
setTimeout(() => {
  statusText.textContent = 'Navegando a Proyecto 1';
  statusEl.classList.remove('ok');
  statusEl.classList.add('running');
  setTimeout(() => client.navigate('/test-uno'), 1000);
}, 15000);
