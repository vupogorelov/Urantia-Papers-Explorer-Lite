// Pull past a paper's edge to continue reading. A fresh wheel turn or a deliberate touch pull
// advances; ordinary momentum at the edge does not.

/**
 * @typedef {'next' | 'prev'} PullDirection
 * @typedef {{
 *   can: (direction: PullDirection) => boolean,
 *   onprogress: (direction: PullDirection | null, progress: number) => void,
 *   ongo: (direction: PullDirection) => void,
 * }} PullOptions
 */

/** @param {HTMLElement} node @param {PullOptions} options */
export function edgePull(node, options) {
  let currentOptions = options;
  const touchDistance = 110;
  const wheelDistance = 700;
  const freshWheelDelay = 200;
  const atTop = () => node.scrollTop <= 1;
  const atBottom = () => node.scrollTop + node.clientHeight >= node.scrollHeight - 2;

  /** @type {PullDirection | null} */
  let direction = null;
  let progress = 0;
  let quietUntil = 0;
  /** @param {PullDirection | null} nextDirection @param {number} nextProgress */
  const show = (nextDirection, nextProgress) => {
    direction = nextDirection;
    progress = nextDirection ? Math.max(0, nextProgress) : 0;
    currentOptions.onprogress(direction, Math.min(1, progress));
  };
  const go = () => {
    const nextDirection = direction;
    show(null, 0);
    quietUntil = Date.now() + 700;
    if (nextDirection) currentOptions.ongo(nextDirection);
  };

  let touchStartY = null;
  let touchStartX = 0;
  /** @type {PullDirection | null} */
  let touchEdge = null;
  let touchOff = false;
  function onTouchStart(event) {
    touchOff = event.touches.length !== 1 || Date.now() < quietUntil
      || !!event.target?.closest?.('input, textarea, [contenteditable]');
    touchStartY = null;
    touchEdge = null;
    touchStartX = event.touches[0]?.clientX ?? 0;
  }
  function onTouchMove(event) {
    if (touchOff) return;
    if (event.touches.length !== 1 || globalThis.getSelection?.()?.isCollapsed === false) {
      touchOff = true;
      show(null, 0);
      return;
    }

    const touch = event.touches[0];
    if (touchStartY === null) {
      const edge = atBottom() && currentOptions.can('next')
        ? 'next'
        : atTop() && currentOptions.can('prev') ? 'prev' : null;
      if (!edge) return;
      touchEdge = edge;
      touchStartY = touch.clientY;
      touchStartX = touch.clientX;
      return;
    }

    const deltaY = touch.clientY - touchStartY;
    const distance = touchEdge === 'next' ? -deltaY : deltaY;
    if (distance <= 0) {
      if (direction) show(null, 0);
      if ((touchEdge === 'next' && !atBottom()) || (touchEdge === 'prev' && !atTop())) touchStartY = null;
      return;
    }
    if (Math.abs(touch.clientX - touchStartX) > distance * 1.2) return;
    show(touchEdge, (distance - 12) / touchDistance);
  }
  function onTouchEnd() {
    if (direction && progress >= 1) go();
    else if (direction) show(null, 0);
    touchStartY = null;
  }

  let wheelAmount = 0;
  /** @type {PullDirection | null} */
  let wheelEdge = null;
  let lastWheelAt = 0;
  let idleTimer;
  const releaseWheel = () => {
    wheelAmount = 0;
    wheelEdge = null;
    if (direction) show(null, 0);
  };
  function onWheel(event) {
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const now = Date.now();
    const fresh = now - lastWheelAt >= freshWheelDelay;
    lastWheelAt = now;
    const edge = event.deltaY > 0 && atBottom()
      ? 'next'
      : event.deltaY < 0 && atTop() ? 'prev' : null;

    if (now < quietUntil) {
      event.preventDefault();
      releaseWheel();
      return;
    }
    if (!edge || !currentOptions.can(edge)) {
      releaseWheel();
      return;
    }
    if (wheelEdge !== edge) {
      if (!fresh) return;
      wheelEdge = edge;
      wheelAmount = 0;
    }

    clearTimeout(idleTimer);
    idleTimer = setTimeout(releaseWheel, 700);
    const step = event.deltaMode === 1 ? event.deltaY * 40
      : event.deltaMode === 2 ? event.deltaY * node.clientHeight
        : event.deltaY;
    wheelAmount += Math.abs(step);
    show(edge, wheelAmount / wheelDistance);
    if (progress >= 1) {
      clearTimeout(idleTimer);
      wheelAmount = 0;
      wheelEdge = null;
      go();
    }
  }

  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchmove', onTouchMove, { passive: true });
  node.addEventListener('touchend', onTouchEnd, { passive: true });
  node.addEventListener('touchcancel', onTouchEnd, { passive: true });
  node.addEventListener('wheel', onWheel, { passive: false });

  return {
    /** @param {PullOptions} nextOptions */
    update(nextOptions) {
      currentOptions = nextOptions;
    },
    destroy() {
      clearTimeout(idleTimer);
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchEnd);
      node.removeEventListener('wheel', onWheel);
    },
  };
}
