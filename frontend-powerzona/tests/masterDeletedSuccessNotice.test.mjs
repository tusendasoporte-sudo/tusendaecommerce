import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeDeletedSuccessNotice } from '../src/lib/masterDeletedSuccessNotice.ts';

function harness(href, reducedMotion = false) {
  let nextTimer = 1;
  const timers = new Map();
  const cleared = [];
  const classes = [];
  const replaced = [];
  let removed = false;
  let pageHide = null;
  let listenerReleased = false;
  const notice = {
    classList: { add(value) { classes.push(value); } },
    remove() { removed = true; },
  };
  const root = {
    querySelector(selector) {
      return selector === '[data-deleted-success]' ? notice : null;
    },
  };
  const environment = {
    href,
    replaceUrl(value) { replaced.push(value); },
    setTimer(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimer(id) {
      cleared.push(id);
      timers.delete(id);
    },
    prefersReducedMotion() { return reducedMotion; },
    listenPageHide(callback) {
      pageHide = callback;
      return () => { listenerReleased = true; pageHide = null; };
    },
  };
  const runDelay = (delay) => {
    const entry = [...timers.entries()].find(([, timer]) => timer.delay === delay);
    assert.ok(entry, `timer ${delay} ms`);
    timers.delete(entry[0]);
    entry[1].callback();
  };
  return {
    root,
    environment,
    runDelay,
    pageHide: () => pageHide?.(),
    state: () => ({ timers: [...timers.values()], cleared, classes, replaced, removed, listenerReleased }),
  };
}

test('deleted=1 limpia la URL, sale a los 4 segundos y se elimina a los 4.3', () => {
  const testHarness = harness('https://powerzona.test/master/stores/storetest000001/users?deleted=1&status=active');
  initializeDeletedSuccessNotice(testHarness.root, testHarness.environment);
  assert.deepEqual(testHarness.state().replaced, ['/master/stores/storetest000001/users?status=active']);
  assert.equal(testHarness.state().removed, false);
  testHarness.runDelay(4000);
  assert.deepEqual(testHarness.state().classes, ['is-leaving']);
  assert.equal(testHarness.state().removed, false);
  testHarness.runDelay(300);
  assert.equal(testHarness.state().removed, true);
  assert.equal(testHarness.state().listenerReleased, true);
});

test('reduced motion elimina al terminar el tiempo sin exigir animación', () => {
  const testHarness = harness('https://powerzona.test/users?deleted=1', true);
  initializeDeletedSuccessNotice(testHarness.root, testHarness.environment);
  testHarness.runDelay(4000);
  assert.equal(testHarness.state().removed, true);
  assert.deepEqual(testHarness.state().classes, []);
  assert.deepEqual(testHarness.state().timers, []);
});

test('sin deleted=1 no muestra, no programa y no modifica la URL', () => {
  const testHarness = harness('https://powerzona.test/users?status=active');
  initializeDeletedSuccessNotice(testHarness.root, testHarness.environment);
  assert.deepEqual(testHarness.state().replaced, []);
  assert.deepEqual(testHarness.state().timers, []);
  assert.equal(testHarness.state().removed, false);
});

test('pagehide cancela timers y una recarga con URL limpia no reaparece', () => {
  const first = harness('https://powerzona.test/users?deleted=1');
  initializeDeletedSuccessNotice(first.root, first.environment);
  first.pageHide();
  assert.equal(first.state().cleared.length, 1);
  assert.deepEqual(first.state().timers, []);
  assert.equal(first.state().removed, false);

  const reload = harness(`https://powerzona.test${first.state().replaced[0]}`);
  initializeDeletedSuccessNotice(reload.root, reload.environment);
  assert.deepEqual(reload.state().timers, []);
  assert.deepEqual(reload.state().replaced, []);
});
