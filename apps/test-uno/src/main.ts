import { ShellClient } from '@plataforma/shell-protocol';

const client = new ShellClient('test-uno');
const statusEl = document.getElementById('status')!;

client.onToken = (token, user) => {
  statusEl.textContent = `✅ Autenticado como ${user.name} (${user.email})`;
  statusEl.style.background = 'rgba(52,199,89,0.2)';
};

client.onTheme = (mode) => {
  if (mode === 'dark') {
    document.body.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)';
  } else {
    document.body.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
  }
};

// Report height for iframe sizing
function reportHeight() {
  client.reportHeight(document.documentElement.scrollHeight);
}
reportHeight();
window.addEventListener('resize', reportHeight);
new ResizeObserver(reportHeight).observe(document.body);

// Update status periodically to show it's alive
let count = 0;
setInterval(() => {
  count++;
  if (!statusEl.textContent?.startsWith('✅')) {
    statusEl.textContent = `⏳ Ejecutándose... (${count}s)`;
  }
}, 1000);
