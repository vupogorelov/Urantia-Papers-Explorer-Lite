// A two-finger pinch changes the reading font size while keeping the text under the gesture in place.

/**
 * @typedef {{
 *   get: () => number,
 *   set: (size: number) => void,
 *   min: number,
 *   max: number,
 *   anchor: string,
 *   adjustScroll: (delta: number) => void,
 *   onCommit: () => void,
 * }} PinchFontOptions
 */

/** @param {HTMLElement} node @param {PinchFontOptions} options */
export function pinchFont(node, options) {
  const previousTouchAction = node.style.touchAction;
  node.style.touchAction = 'pan-x pan-y';
  let startDistance = 0;
  let startSize = 0;
  /** @type {Element | null} */
  let anchor = null;
  let anchorTop = 0;
  const distance = (touches) => Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  );

  function onTouchStart(event) {
    if (event.touches.length !== 2 || event.target?.closest?.('button, input, textarea, [contenteditable]')) return;
    startDistance = distance(event.touches);
    startSize = options.get();
    const x = (event.touches[0].clientX + event.touches[1].clientX) / 2;
    const y = (event.touches[0].clientY + event.touches[1].clientY) / 2;
    anchor = document.elementFromPoint(x, y)?.closest(options.anchor) ?? null;
    anchorTop = anchor?.getBoundingClientRect().top ?? 0;
  }

  function onTouchMove(event) {
    if (event.touches.length !== 2 || !startDistance) return;
    event.preventDefault();
    const size = Math.max(options.min, Math.min(options.max, Math.round(startSize * (distance(event.touches) / startDistance))));
    if (size === options.get()) return;
    options.set(size);
    requestAnimationFrame(() => {
      if (anchor?.isConnected) options.adjustScroll(anchor.getBoundingClientRect().top - anchorTop);
    });
  }

  function onTouchEnd(event) {
    if (event.touches.length < 2 && startDistance) {
      startDistance = 0;
      anchor = null;
      options.onCommit();
    }
  }

  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchmove', onTouchMove, { passive: false });
  node.addEventListener('touchend', onTouchEnd, { passive: true });
  node.addEventListener('touchcancel', onTouchEnd, { passive: true });
  return {
    destroy() {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchEnd);
      node.style.touchAction = previousTouchAction;
    },
  };
}
