const SVG_NS = 'http://www.w3.org/2000/svg';

export class LemniscateLoader extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.renderLoop = null;
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-grid;
          place-items: center;
          width: var(--loader-size, 120px);
          aspect-ratio: 1;
        }
        svg {
          width: 100%;
          height: 100%;
          overflow: visible;
          color: var(--kn-color-accent, #6366f1);
        }
      </style>
      <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <g id="group">
          <path id="path" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"></path>
        </g>
      </svg>
    `;

    const config = {
      name: "Lemniscate Bloom",
      rotate: false,
      particleCount: 70,
      trailSpan: 0.4,
      durationMs: 5600,
      rotationDurationMs: 34000,
      pulseDurationMs: 5000,
      strokeWidth: 4.8,
      lemniscateA: 20,
      lemniscateBoost: 7,
      point(progress, detailScale, config) {
        const t = progress * Math.PI * 2;
        const scale = config.lemniscateA + detailScale * config.lemniscateBoost;
        const denom = 1 + Math.sin(t) ** 2;
        return {
          x: 50 + (scale * Math.cos(t)) / denom,
          y: 50 + (scale * Math.sin(t) * Math.cos(t)) / denom,
        };
      },
    };

    const group = this.shadowRoot.querySelector('#group');
    const path = this.shadowRoot.querySelector('#path');
    path.setAttribute('stroke-width', String(config.strokeWidth));

    const particles = Array.from({ length: config.particleCount }, () => {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('fill', 'currentColor');
      group.appendChild(circle);
      return circle;
    });

    function normalizeProgress(progress) {
      return ((progress % 1) + 1) % 1;
    }

    function getDetailScale(time) {
      const pulseProgress = (time % config.pulseDurationMs) / config.pulseDurationMs;
      const pulseAngle = pulseProgress * Math.PI * 2;
      return 0.52 + ((Math.sin(pulseAngle + 0.55) + 1) / 2) * 0.48;
    }

    function getRotation(time) {
      if (!config.rotate) return 0;
      return -((time % config.rotationDurationMs) / config.rotationDurationMs) * 360;
    }

    function buildPath(detailScale, steps = 120) { // reduced steps for performance
      return Array.from({ length: steps + 1 }, (_, index) => {
        const point = config.point(index / steps, detailScale, config);
        return `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
      }).join(' ');
    }

    function getParticle(index, progress, detailScale) {
      const tailOffset = index / (config.particleCount - 1);
      const point = config.point(normalizeProgress(progress - tailOffset * config.trailSpan), detailScale, config);
      const fade = Math.pow(1 - tailOffset, 0.56);
      return {
        x: point.x,
        y: point.y,
        radius: 0.9 + fade * 2.7,
        opacity: 0.04 + fade * 0.96,
      };
    }

    const startedAt = performance.now();
    const render = (now) => {
      const time = now - startedAt;
      const progress = (time % config.durationMs) / config.durationMs;
      const detailScale = getDetailScale(time);
      
      group.setAttribute('transform', `rotate(${getRotation(time)} 50 50)`);
      path.setAttribute('d', buildPath(detailScale));
      
      particles.forEach((node, index) => {
        const particle = getParticle(index, progress, detailScale);
        node.setAttribute('cx', particle.x.toFixed(2));
        node.setAttribute('cy', particle.y.toFixed(2));
        node.setAttribute('r', particle.radius.toFixed(2));
        node.setAttribute('opacity', particle.opacity.toFixed(3));
      });
      
      this.renderLoop = requestAnimationFrame(render);
    };

    this.renderLoop = requestAnimationFrame(render);
  }

  disconnectedCallback() {
    if (this.renderLoop) {
      cancelAnimationFrame(this.renderLoop);
    }
  }
}

if (!customElements.get('lemniscate-loader')) {
  customElements.define('lemniscate-loader', LemniscateLoader);
}
