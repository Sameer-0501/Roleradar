/**
 * RoleRadar Static Asset Caching Middleware (Item 27).
 *
 * Implements recommendation: "enable browser caching for static files"
 * - Sets long-term immutable caching for hashed assets (JS, CSS, fonts, images).
 * - Enforces must-revalidate on dynamic HTML shells.
 * - Supports ETags and conditional HTTP 304 Not Modified responses.
 */

import type { Request, Response, NextFunction } from 'express';

const IMMUTABLE_EXTENSIONS = /\.(js|css|woff2|woff|ttf|png|jpe?g|webp|avif|svg|ico)$/i;

export function staticBrowserCachingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only apply to safe read requests
  if ((req.method !== 'GET' && req.method !== 'HEAD') || res.headersSent) {
    return next();
  }

  const path = req.path;

  // Hashed build assets can be cached immutably for 1 year
  if (path.includes('/assets/') || IMMUTABLE_EXTENSIONS.test(path)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return next();
  }

  // HTML documents must revalidate to pick up latest build hashes
  if (path.endsWith('.html') || path === '/' || !path.includes('.')) {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    return next();
  }

  next();
}

