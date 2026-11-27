import { EventBus } from './core/EventBus.js';
import { GameEngine } from './game/GameEngine.js';
import { MenuController } from './ui/MenuController.js';
import { TouchControls, shouldUseTouchControls } from './input/TouchControls.js';

// ============================================================================
// Application Composition Root (Dependency Inversion Principle)
// ============================================================================
const bus = new EventBus();
const stageWrap = document.getElementById('stage-wrap');

// On-screen joystick + Fire / Grab buttons for iPhone & iPad (landscape)
const touchControls = shouldUseTouchControls()
  ? new TouchControls(document.getElementById('touch-controls'), { stage: stageWrap })
  : null;

const game = new GameEngine({
  glCanvas: document.getElementById('gl-canvas'),
  hudCanvas: document.getElementById('hud-canvas'),
  stageWrap,
  bus,
  touchControls,
});

// One thumb-driven tank per touch device, so default the crew to 1P instead of 2P split-screen.
if (touchControls) game.playerCount = 1;

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
