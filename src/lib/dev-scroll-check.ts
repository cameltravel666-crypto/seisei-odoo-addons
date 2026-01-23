/**
 * Dev-only utility to check scrolling containers
 * Run in browser console: (() => { const check = await import('/lib/dev-scroll-check'); return check.checkScrollingContainers(); })()
 */

export function checkScrollingContainers() {
  const els = [...document.querySelectorAll('*')];
  const hits = els
    .map((el) => {
      const cs = getComputedStyle(el);
      const oy = cs.overflowY;
      if (!/(auto|scroll)/.test(oy)) return null;
      if (el.scrollHeight <= el.clientHeight + 4) return null;
      return {
        tag: el.tagName.toLowerCase(),
        cls: el.className,
        id: el.id,
        dataAttrs: Array.from(el.attributes)
          .filter((attr) => attr.name.startsWith('data-'))
          .map((attr) => `${attr.name}="${attr.value}"`)
          .join(' '),
        oy,
        h: el.clientHeight,
        sh: el.scrollHeight,
        scrollTop: el.scrollTop,
        element: el,
      };
    })
    .filter(Boolean);

  return {
    scrollingContainers: hits.slice(0, 25),
    total: hits.length,
    header: document.querySelector('[data-app-header]'),
    mainScroll: document.querySelector('[data-main-scroll]'),
  };
}

export function checkHeaderPosition() {
  const h = document.querySelector('[data-app-header]');
  if (!h) return { error: 'no [data-app-header] found' };
  const r = h.getBoundingClientRect();
  const cs = getComputedStyle(h);
  return {
    boundingRect: {
      top: r.top,
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    },
    computedStyles: {
      position: cs.position,
      zIndex: cs.zIndex,
      transform: cs.transform,
      top: cs.top,
      left: cs.left,
      right: cs.right,
    },
    parent: h.parentElement?.tagName,
    ancestorsWithTransform: (() => {
      const ancestors: Array<{ tag: string; cls: string; transform: string }> = [];
      let current: Element | null = h.parentElement;
      while (current) {
        const cs = getComputedStyle(current);
        if (cs.transform !== 'none' && cs.transform !== 'matrix(1, 0, 0, 1, 0, 0)') {
          ancestors.push({
            tag: current.tagName.toLowerCase(),
            cls: current.className.toString(),
            transform: cs.transform,
          });
        }
        current = current.parentElement;
      }
      return ancestors;
    })(),
  };
}
