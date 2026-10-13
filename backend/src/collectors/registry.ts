/**
 * Collector registry.
 *
 * A central registry where ICollector instances are registered
 * and looked up by company name. The scheduler uses this registry
 * to know which collectors to run during a scan cycle.
 *
 * Usage:
 *   CollectorRegistry.register(new AcmeWorkdayCollector());
 *   const collector = CollectorRegistry.findForCompany('Acme');
 */

import type { ICollector } from './types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('collector:registry');

class CollectorRegistryClass {
  private readonly collectors: Map<string, ICollector> = new Map();

  /**
   * Register a collector. The key is the collector's source name.
   * Registering the same source name twice will overwrite the previous entry.
   */
  register(collector: ICollector): void {
    const name = collector.getSourceName();
    this.collectors.set(name, collector);
    log.debug({ name }, 'Collector registered');
  }

  /**
   * Find a collector that supports the given company name.
   * Returns undefined if no collector is registered for that company.
   */
  findForCompany(companyName: string): ICollector | undefined {
    for (const collector of this.collectors.values()) {
      if (collector.supports(companyName)) {
        return collector;
      }
    }
    return undefined;
  }

  /** Return all registered collectors */
  getAll(): ICollector[] {
    return Array.from(this.collectors.values());
  }

  /** Return the number of registered collectors */
  count(): number {
    return this.collectors.size;
  }

  /** Remove all collectors (useful in tests) */
  clear(): void {
    this.collectors.clear();
  }

  /** List all registered source names */
  listNames(): string[] {
    return Array.from(this.collectors.keys());
  }
}

export const CollectorRegistry = new CollectorRegistryClass();
