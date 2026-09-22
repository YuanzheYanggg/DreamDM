import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame, sceneFor, choose, useItem, serializeSave, restoreSave} from './game.mjs';

const act = (state, id) => choose(state, id, state.revision);
const reachArchive = opening => {
  let s = act(newGame(12345), opening);
  s = act(s, 'read_bridge');
  return act(s, 'decline_raven');
};

test('an early decision unlocks its own later callback', () => {
  const alias = reachArchive('lend_name');
  const letter = reachArchive('buy_letter');
  assert.ok(sceneFor(alias).choices.some(c => c.id === 'use_alias'));
  assert.ok(!sceneFor(letter).choices.some(c => c.id === 'use_alias'));
  assert.ok(sceneFor(letter).choices.some(c => c.id === 'use_letter'));
  const after = act(alias, 'use_alias');
  assert.ok(after.journal.some(e => e.callback));
  assert.equal(after.flags.proof, true);
});

test('a stale choice cannot debit twice and transitions do not mutate inputs', () => {
  const initial = newGame(12345);
  const after = act(initial, 'buy_letter');
  assert.equal(initial.character.coins, 12);
  assert.equal(after.character.coins, 9);
  assert.equal(after.inventory.letter, 1);
  assert.throws(() => choose(after, 'buy_letter', initial.revision), /旧|过期/);
  assert.throws(() => act(after, 'invent_item'), /选项/);
});

test('food is consumed once, restores energy, and cannot be used when absent', () => {
  const initial = newGame(12345);
  let after = useItem(initial, 'ration', initial.revision);
  assert.equal(after.character.energy, 20);
  assert.equal(after.inventory.ration, 1);
  assert.equal(initial.inventory.ration, 2);
  after = act(after, 'ask_shadow');
  after = useItem(after, 'ration', after.revision);
  assert.equal(after.inventory.ration, undefined);
  assert.throws(() => useItem(after, 'ration', after.revision), /没有/);
});

test('saved progress round trips and incompatible/corrupt saves are rejected', () => {
  const state = reachArchive('help_find');
  assert.deepEqual(restoreSave(serializeSave(state)), state);
  assert.throws(() => restoreSave('{'), /存档/);
  assert.throws(() => restoreSave('{"world":"other"}'), /存档/);
  const bad = JSON.parse(serializeSave(state));
  bad.state.character.coins = -10;
  assert.throws(() => restoreSave(JSON.stringify(bad)), /存档/);
  bad.state.character.coins = 12;
  bad.state.inventory['<script>'] = 1;
  assert.throws(() => restoreSave(JSON.stringify(bad)), /存档/);
});

test('all offered branches finish and maintain valid resource bounds', () => {
  let endings = 0;
  const visit = (state, depth = 0) => {
    assert.ok(depth <= 6);
    assert.ok(state.character.health >= 0 && state.character.health <= 24);
    assert.ok(state.character.energy >= 0 && state.character.energy <= 20);
    assert.ok(state.character.stress >= 0 && state.character.stress <= 10);
    assert.ok(state.character.coins >= 0);
    assert.deepEqual(restoreSave(serializeSave(state)), state);
    const scene = sceneFor(state);
    if (scene.ending) {endings++; return;}
    assert.ok(scene.choices.length >= 2);
    for (const c of scene.choices) visit(act(state, c.id), depth + 1);
  };
  visit(newGame(12345));
  assert.ok(endings >= 40);
});

test('a recorded roll survives save and load and does not reroll on render', () => {
  const state = act(reachArchive('ask_shadow'), 'pick_lock');
  const saved = restoreSave(serializeSave(state));
  assert.ok(state.lastRoll.die >= 1 && state.lastRoll.die <= 20);
  assert.deepEqual(saved.lastRoll, state.lastRoll);
  sceneFor(saved); sceneFor(saved);
  assert.deepEqual(saved.lastRoll, state.lastRoll);
});

test('choices cannot spend missing resources', () => {
  const state = newGame(12345);
  state.character.coins = 0;
  assert.throws(() => act(state, 'buy_letter'), /不足/);
  assert.equal(sceneFor(state).choices.find(c => c.id === 'buy_letter').disabled, true);
});

test('the dawn ending advances the story clock to dawn', () => {
  const tower = act(reachArchive('lend_name'), 'use_alias');
  const ending = act(tower, 'free_names');
  assert.equal(ending.minutes % 1440, 360);
  assert.ok(ending.minutes > tower.minutes);
});

test('a failed difficult action applies its advertised cost and keeps the story playable', () => {
  let state = newGame(5);
  for (const id of ['ask_shadow','read_bridge','decline_raven','pick_lock']) state = act(state,id);
  assert.equal(state.lastRoll.success,false);
  assert.equal(state.character.health,22);
  assert.ok(state.character.effects.includes('手部擦伤'));
  assert.equal(sceneFor(state).choices.length,3);
  assert.equal(act(state,'keep_proof').scene,'ending');
});
