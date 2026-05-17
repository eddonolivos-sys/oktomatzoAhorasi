import { ShellClient } from '@plataforma/shell-protocol';
import { Menu } from './Menu';
import { Game } from './Game';

let game: Game | null = null;

const client = new ShellClient('combate-3d');

client.onToken = () => {};
client.onTheme = (mode) => {
  document.documentElement.setAttribute('data-theme', mode);
};

const menu = new Menu({
  onStart() {
    const nameInput = document.getElementById('name-input') as HTMLInputElement;
    const playerName = nameInput?.value?.trim() || 'Jugador';
    menu.hide();
    if (game) { game.destroy(); }
    game = new Game();
    game.start(playerName);
  },
  onTutorial() {
    menu.showTutorial();
  },
  onToggleEffects(val: boolean) {
    Game.effectsEnabled = val;
  },
  onToggleHitboxes(val: boolean) {
    Game.showHitboxes = val;
  },
});

menu.show();

function reportHeight() {
  client.reportHeight(document.documentElement.scrollHeight);
}
window.addEventListener('resize', reportHeight);
new ResizeObserver(reportHeight).observe(document.body);
reportHeight();

window.addEventListener('unload', () => {
  game?.destroy();
  client.destroy();
});
