import { EventBus } from './core/EventBus.js';
import { GameEngine } from './game/GameEngine.js';
import { MenuController } from './ui/MenuController.js';

// ============================================================================
// Application Composition Root (Dependency Inversion Principle)
// ============================================================================
const bus = new EventBus();

const game = new GameEngine({
  glCanvas: document.getElementById('gl-canvas'),
  hudCanvas: document.getElementById('hud-canvas'),
  stageWrap: document.getElementById('stage-wrap'),
  bus,
});

const menuController = new MenuController(game);

window.tankGame = game;
window.menuController = menuController;

const params = new URLSearchParams(window.location.search);
const joinCode = params.get('join');
if (joinCode) {
  menuController.openLanJoinFromUrl(joinCode);
} else if (params.get('autostart') === '1') {
  game.startMatch();
  game.state = 'PLAYING';
}
