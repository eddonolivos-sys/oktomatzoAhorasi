import { ShellClient } from '@plataforma/shell-protocol';

const client = new ShellClient('test-dos');
const statusEl = document.getElementById('status')!;

client.onToken = (token, user) => {
  statusEl.textContent = `✅ Autenticado como ${user.name} (${user.email})`;
  statusEl.style.background = 'rgba(52,199,89,0.2)';
};

client.onTheme = (mode) => {
  if (mode === 'dark') {
    document.body.style.background = 'linear-gradient(135deg, #2d1b69 0%, #1a1a2e 100%)';
  } else {
    document.body.style.background = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
  }
};

function reportHeight() {
  client.reportHeight(document.documentElement.scrollHeight);
}
reportHeight();
window.addEventListener('resize', reportHeight);
new ResizeObserver(reportHeight).observe(document.body);

// Navigate to test-uno after 10 seconds (demo de navegación cross-app)
setTimeout(() => {
  statusEl.textContent = '🔀 Navegando a Proyecto 1...';
  setTimeout(() => client.navigate('/test-uno'), 1000);
}, 15000);
