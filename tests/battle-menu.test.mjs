import test from 'node:test';
import assert from 'node:assert/strict';
import { UIManager } from '../src/ui/UIManager.js';

function setup() {
  const nodes = new Map();
  const events = [];
  const node = id => {
    if (!nodes.has(id)) {
      const classes = new Set(['hidden']);
      nodes.set(id, {
        handlers: {}, hidden: true, style: {}, dataset: {},
        classList: {
          add: value => classes.add(value), remove: value => classes.delete(value),
          contains: value => classes.has(value),
          toggle(value, force) { if (force) classes.add(value); else classes.delete(value); }
        },
        addEventListener(type, handler) { this.handlers[type] = handler; },
        setAttribute() {}, focus() {}
      });
    }
    return nodes.get(id);
  };
  globalThis.document = { getElementById: node, addEventListener() {} };
  globalThis.window = { addEventListener() {} };
  const world = { isPaused: false, gameSpeed: 2, eventBus: { emit: (...args) => events.push(args) } };
  const ui = new UIManager(world, null, null);
  ui._bindEvents();
  return { ui, world, events };
}

test('next level button requests progression only from a finished victory',()=>{
  const {ui,world,events}=setup();
  ui.dom.btnNextStage.handlers.click();assert.equal(events.length,0);
  world.isGameOver=true;ui.dom.btnNextStage.handlers.click();assert.equal(events.length,0);
  world.runOutcome='victory';ui.dom.btnNextStage.handlers.click();assert.equal(events.at(-1)[0],'NEXT_STAGE');
});

test('permanent upgrades can be requested only from victory; continuation uses its unlocked stage',()=>{
  const {ui,world,events}=setup();ui.dom.btnVictoryUpgrades.handlers.click();assert.equal(events.length,0);
  Object.assign(world,{isGameOver:true,runOutcome:'victory',inMenu:false});ui.dom.btnVictoryUpgrades.handlers.click();assert.equal(events.at(-1)[0],'VICTORY_UPGRADES');
  world.inMenu=true;ui.betweenStageId=3;ui.selectedStage=1;ui.playerProgress={isStageUnlocked:id=>id===3};
  ui.dom.btnUpgradesNextStage.handlers.click();assert.equal(events.at(-1)[0],'START_GAME');assert.equal(ui.selectedStage,3);
});

test('pause menu stops combat once and blocks simulation shortcuts until explicitly resumed', () => {
  const { ui, world, events } = setup();
  ui.dom.btnToMenu.handlers.click();
  ui.openBattleMenu();
  assert.equal(world.isPaused, true);
  assert.equal(ui.dom.modalBattleMenu.classList.contains('hidden'), false);
  assert.equal(events.length, 1);
  for (const [key, code] of [['p', 'KeyP'], [' ', 'Space'], ['1', 'Digit1'], ['3', 'Digit3']]) {
    ui._handleKeyDown({ key, code, preventDefault() {} });
    assert.equal(world.isPaused, true);
    assert.equal(world.gameSpeed, 2);
  }
  ui.dom.btnBattleResume.handlers.click();
  assert.equal(world.isPaused, false);
  assert.equal(ui.dom.modalBattleMenu.classList.contains('hidden'), true);
  assert.equal(events.at(-1)[1].isPaused, false);
});

test('Escape resumes a manually paused battle and closes the volume popup with the menu', () => {
  const { ui, world } = setup();
  world.isPaused = true;
  ui.openBattleMenu();
  ui.dom.volumePopover.hidden = false;
  ui._handleKeyDown({ key: 'Escape' });
  assert.equal(world.isPaused, false);
  assert.equal(ui.dom.volumePopover.hidden, true);
  assert.equal(ui.dom.modalBattleMenu.classList.contains('hidden'), true);
});

for (const [button, event] of [['btnBattleRestart', 'RESTART_GAME'], ['btnBattleExit', 'RETURN_TO_MENU']]) {
  test(`${event} closes menu and volume popup before changing the game session`, () => {
    const { ui, events } = setup();
    ui.openBattleMenu();
    ui.dom.volumePopover.hidden = false;
    ui.dom[button].handlers.click();
    assert.equal(ui.dom.modalBattleMenu.classList.contains('hidden'), true);
    assert.equal(ui.dom.volumePopover.hidden, true);
    assert.equal(events.at(-1)[0], event);
  });
  test(`${event} warns about pending crystals, allows cancellation, and requires explicit confirmation`, () => {
    const { ui, world, events } = setup();
    const economy = { runCrystals: 17, crystalsSettled: false };
    world.getEntitiesWith = () => [1]; world.getComponent = () => economy;
    ui.openBattleMenu();
    ui.dom[button].handlers.click();
    assert.equal(ui.dom.abandonConfirm.hidden, false);
    assert.equal(ui.dom.battleMenuMain.hidden, true);
    assert.match(ui.dom.abandonText.textContent, /микрочипы за этот бой: 17\./);
    assert.equal(events.some(e => e[0] === event), false);
    ui._handleKeyDown({ key: 'Escape' });
    assert.equal(ui.dom.abandonConfirm.hidden, true); assert.equal(world.isPaused, true);
    assert.equal(economy.runCrystals, 17);
    ui.dom[button].handlers.click(); ui.dom.abandonCancel.handlers.click();
    assert.equal(events.some(e => e[0] === event), false);
    ui.dom[button].handlers.click(); ui.dom.abandonAccept.handlers.click();
    assert.equal(events.filter(e => e[0] === event).length, 1);
    assert.equal(ui.dom.modalBattleMenu.classList.contains('hidden'), true);
    ui.dom.abandonAccept.handlers.click();
    assert.equal(events.filter(e => e[0] === event).length, 1);
  });
}
