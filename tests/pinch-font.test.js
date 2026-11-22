import test from 'node:test';
import assert from 'node:assert/strict';
import { pinchFont } from '../web/src/pinch-font.js';

function makeNode() {
  const listeners = new Map();
  return {
    style: { touchAction: '' },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    fire(type, event) {
      listeners.get(type)?.(event);
    },
  };
}

function fingers(distance) {
  return [
    { clientX: 100 - distance / 2, clientY: 100 },
    { clientX: 100 + distance / 2, clientY: 100 },
  ];
}

test('pinching resizes the font, preserves the anchor position, and commits once', () => {
  const oldDocument = globalThis.document;
  const oldRequestAnimationFrame = globalThis.requestAnimationFrame;
  const node = makeNode();
  let size = 18;
  let top = 120;
  let adjustedBy = 0;
  let commits = 0;
  const anchor = {
    isConnected: true,
    closest: () => anchor,
    getBoundingClientRect: () => ({ top }),
  };

  globalThis.document = { elementFromPoint: () => anchor };
  globalThis.requestAnimationFrame = (callback) => callback();
  try {
    const controller = pinchFont(node, {
      get: () => size,
      set: (nextSize) => {
        size = nextSize;
        top = 145;
      },
      min: 14,
      max: 26,
      anchor: '.paragraph',
      adjustScroll: (delta) => { adjustedBy += delta; },
      onCommit: () => { commits += 1; },
    });

    assert.equal(node.style.touchAction, 'pan-x pan-y');
    node.fire('touchstart', { touches: fingers(100), target: {} });
    let prevented = false;
    node.fire('touchmove', { touches: fingers(200), preventDefault: () => { prevented = true; } });
    assert.equal(size, 26);
    assert.equal(adjustedBy, 25);
    assert.equal(prevented, true);
    node.fire('touchend', { touches: [] });
    assert.equal(commits, 1);

    controller.destroy();
    assert.equal(node.style.touchAction, '');
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
    if (oldRequestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = oldRequestAnimationFrame;
  }
});
