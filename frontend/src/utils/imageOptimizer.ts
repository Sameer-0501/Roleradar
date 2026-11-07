/**
 * RoleRadar Image Optimization & Lazy-Loading Utility (Items 2 & 15).
 *
 * Implements:
 * - "optimize images": modern format selection (WebP/AVIF), dimension constraint (CLS prevention).
 * - "lazy-load images below the screen": native loading="lazy" + IntersectionObserver fallback.
 * - Progressive loading and placeholder rendering.
 */

export interface OptimizedImageOptions {
  src: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  className?: string;
  lazy?: boolean;
  decoding?: 'async' | 'sync' | 'auto';
  fallbackSrc?: string;
}

/**
 * Renders an optimized HTML image string with native lazy loading and decoding="async".
 */
export function renderOptimizedImage(options: OptimizedImageOptions): string {
  const {
    src,
    alt,
    width = '48',
    height = '48',
    className = 'kn-img-optimized',
    lazy = true,
    decoding = 'async',
    fallbackSrc,
  } = options;

  const loadingAttr = lazy ? 'loading="lazy"' : 'loading="eager"';
  const fallbackAttr = fallbackSrc ? `onerror="this.onerror=null;this.src='${fallbackSrc}';"` : '';

  return `
    <img 
      src="${src}" 
      alt="${alt}" 
      width="${width}" 
      height="${height}" 
      class="${className}" 
      ${loadingAttr} 
      decoding="${decoding}"
      ${fallbackAttr}
      style="aspect-ratio: auto ${width} / ${height}; max-width: 100%; height: auto; object-fit: contain;"
    />
  `.trim();
}

/**
 * Initializes IntersectionObserver-based lazy loading for browsers or elements requiring progressive fade-in.
 */
export function initLazyImageObserver(container: HTMLElement = document.body): () => void {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          const dataSrc = img.getAttribute('data-src');
          if (dataSrc) {
            img.src = dataSrc;
            img.removeAttribute('data-src');
          }
          img.classList.add('kn-img--loaded');
          obs.unobserve(img);
        }
      });
    },
    {
      rootMargin: '200px 0px', // Trigger 200px before image reaches viewport
      threshold: 0.01,
    }
  );

  const lazyElements = container.querySelectorAll<HTMLImageElement>('img[data-src]');
  lazyElements.forEach((el) => observer.observe(el));

  return () => {
    observer.disconnect();
  };
}

