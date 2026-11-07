/**
 * RoleRadar Virtual List Utility (Item 23).
 *
 * Implements recommendation: "virtualize long lists"
 * Efficiently renders only the visible slice of items (+ overscan buffer)
 * in long lists (e.g., verified jobs feed, audit logs, large search results).
 * Keeps DOM node count minimal, memory low, and scroll performance locked at 60fps.
 */

export interface VirtualListOptions<T> {
  container: HTMLElement;
  items: T[];
  itemHeight: number; // approximate or exact height of each row in px
  overscan?: number;  // extra items above and below visible window
  renderItem: (item: T, index: number) => string;
  onRender?: (container: HTMLElement) => void;
}

export interface VirtualListInstance {
  updateItems: (newItems: any[]) => void;
  destroy: () => void;
  scrollToIndex: (index: number) => void;
}

export function createVirtualList<T>(options: VirtualListOptions<T>): VirtualListInstance {
  const {
    container,
    items: initialItems,
    itemHeight,
    overscan = 3,
    renderItem,
    onRender,
  } = options;

  let items = [...initialItems];
  let isDestroyed = false;

  // Outer viewport styling
  container.style.position = 'relative';
  container.style.overflowY = 'auto';
  container.style.contain = 'strict';

  // Inner height spacer to allow full native scrollbar range
  const spacer = document.createElement('div');
  spacer.className = 'virtual-list-spacer';
  spacer.style.width = '100%';
  spacer.style.pointerEvents = 'none';
  spacer.style.visibility = 'hidden';

  // Content viewport wrapper
  const content = document.createElement('div');
  content.className = 'virtual-list-content';
  content.style.position = 'absolute';
  content.style.top = '0';
  content.style.left = '0';
  content.style.right = '0';

  container.innerHTML = '';
  container.appendChild(spacer);
  container.appendChild(content);

  let lastStartIndex = -1;
  let lastEndIndex = -1;

  const renderVisibleWindow = () => {
    if (isDestroyed || items.length === 0) {
      spacer.style.height = '0px';
      content.innerHTML = '';
      return;
    }

    const totalHeight = items.length * itemHeight;
    spacer.style.height = `${totalHeight}px`;

    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight || 600;

    const rawStartIndex = Math.floor(scrollTop / itemHeight);
    const rawEndIndex = Math.ceil((scrollTop + viewportHeight) / itemHeight);

    const startIndex = Math.max(0, rawStartIndex - overscan);
    const endIndex = Math.min(items.length, rawEndIndex + overscan);

    // Only update DOM if window indices shifted
    if (startIndex === lastStartIndex && endIndex === lastEndIndex) {
      return;
    }

    lastStartIndex = startIndex;
    lastEndIndex = endIndex;

    const offsetY = startIndex * itemHeight;
    content.style.transform = `translateY(${offsetY}px)`;

    const visibleItems = items.slice(startIndex, endIndex);
    content.innerHTML = visibleItems
      .map((item, idx) => renderItem(item, startIndex + idx))
      .join('');

    if (onRender) {
      onRender(content);
    }
  };

  const onScroll = () => {
    if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
      window.requestAnimationFrame(renderVisibleWindow);
    } else {
      renderVisibleWindow();
    }
  };

  container.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // Initial render
  renderVisibleWindow();

  return {
    updateItems: (newItems: T[]) => {
      items = [...newItems];
      lastStartIndex = -1;
      lastEndIndex = -1;
      renderVisibleWindow();
    },
    destroy: () => {
      isDestroyed = true;
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    },
    scrollToIndex: (index: number) => {
      const targetScroll = Math.max(0, Math.min(items.length * itemHeight, index * itemHeight));
      container.scrollTop = targetScroll;
    },
  };
}

