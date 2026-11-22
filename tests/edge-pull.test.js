import test from 'node:test';
import assert from 'node:assert/strict';
import { edgePull } from '../web/src/edge-pull.js';

function makeNode({ scrollTop, clientHeight = 600, scrollHeight = 1200 }) {
  const listeners = new Map();
  return {
    scrollTop,
    clientHeight,
    scrollHeight,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    fire(type, event) {
      listeners.get(type)?.(event);
    },
    hasListener(type) {
      return listeners.has(type);
    },
  };
}

function touch(clientY, clientX = 0) {
  return {
    touches: [{ clientY, clientX }],
    target: { closest: () => null },
  };
}

function wheel(deltaY, deltaMode = 0) {
  let prevented = false;
  return {
    event: {
      deltaY,
      deltaX: 0,
      deltaMode,
      ctrlKey: false,
      preventDefault() {
        prevented = true;
      },
    },
    wasPrevented: () => prevented,
  };
}

test('a deliberate wheel pull opens the next paper and suppresses momentum on the new paper', () => {
  const node = makeNode({ scrollTop: 600 });
  const opened = [];
  const progress = [];
  const controller = edgePull(node, {
    can: () => true,
    onprogress: (direction, amount) => progress.push([direction, amount]),
    ongo: (direction) => opened.push(direction),
  });

  node.fire('wheel', wheel(300).event);
  assert.deepEqual(opened, []);
  node.fire('wheel', wheel(450).event);
  assert.deepEqual(opened, ['next']);
  assert.deepEqual(progress.at(-1), [null, 0]);

  const momentum = wheel(100);
  node.fire('wheel', momentum.event);
  assert.equal(momentum.wasPrevented(), true);
  assert.deepEqual(opened, ['next']);
  controller.destroy();
  assert.equal(node.hasListener('wheel'), false);
});

test('a pull at the top opens the previous paper only when allowed', () => {
  const node = makeNode({ scrollTop: 0 });
  const opened = [];
  const controller = edgePull(node, {
    can: (direction) => direction === 'prev',
    onprogress: () => {},
    ongo: (direction) => opened.push(direction),
  });

  node.fire('touchstart', touch(300));
  node.fire('touchmove', touch(300));
  node.fire('touchmove', touch(450));
  node.fire('touchend', { touches: [] });
  assert.deepEqual(opened, ['prev']);

  controller.destroy();
  assert.equal(node.hasListener('touchstart'), false);
});

test('a pull at the bottom advances only after the threshold is reached', () => {
  const node = makeNode({ scrollTop: 600 });
  const opened = [];
  const controller = edgePull(node, {
    can: () => true,
    onprogress: () => {},
    ongo: (direction) => opened.push(direction),
  });

  node.fire('touchstart', touch(400));
  node.fire('touchmove', touch(400));
  node.fire('touchmove', touch(370));
  node.fire('touchend', { touches: [] });
  assert.deepEqual(opened, []);

  node.fire('touchstart', touch(400));
  node.fire('touchmove', touch(400));
  node.fire('touchmove', touch(250));
  node.fire('touchend', { touches: [] });
  assert.deepEqual(opened, ['next']);
  controller.destroy();
});
