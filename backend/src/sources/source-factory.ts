/**
 * Source Factory.
 *
 * Dynamically instantiates the appropriate ICollector implementation
 * for a given SourceDefinition from the declarative catalog.
 */

import type { ICollector } from '../collectors/types.js';
import type { SourceDefinition } from './catalog.js';
import { GreenhouseCollector } from '../collectors/ats/greenhouse-collector.js';
import { LeverCollector } from '../collectors/ats/lever-collector.js';
import { WorkdayCollector } from '../collectors/ats/workday-collector.js';
import { CustomCollector } from '../collectors/custom/custom-collector.js';
import { AshbyCollector } from '../collectors/ats/ashby-collector.js';
import { WorkableCollector } from '../collectors/ats/workable-collector.js';
import { SmartrecruitersCollector } from '../collectors/ats/smartrecruiters-collector.js';
import { SapCollector } from '../collectors/ats/sap-collector.js';

export function createCollectorForSource(source: SourceDefinition): ICollector {
  switch (source.atsType) {
    case 'GREENHOUSE':
      return new GreenhouseCollector({
        boardToken: source.config.boardToken,
        companyName: source.companyName,
        officialDomain: source.officialDomain,
      });

    case 'LEVER':
      return new LeverCollector({
        siteToken: source.config.siteToken,
        companyName: source.companyName,
        officialDomain: source.officialDomain,
      });

    case 'WORKDAY':
      return new WorkdayCollector({
        host: source.config.host,
        tenant: source.config.tenant,
        clientSite: source.config.clientSite ?? source.config.site ?? '',
        companyName: source.companyName,
        officialDomain: source.officialDomain,
        appliedFacets: source.config.appliedFacets,
      });

    case 'ASHBY':
      return new AshbyCollector({
        jobBoardName: source.config.jobBoardName,
        companyName: source.companyName,
        officialDomain: source.officialDomain,
      });

    case 'WORKABLE':
      return new WorkableCollector({
        accountSlug: source.config.accountSlug,
        companyName: source.companyName,
        officialDomain: source.officialDomain,
      });

    case 'CUSTOM':
      return new CustomCollector(source.config);

    case 'SMARTRECRUITERS':
      return new SmartrecruitersCollector({
        companyIdentifier: source.config.companyIdentifier,
        companyName: source.companyName,
        officialDomain: source.officialDomain,
      });

    case 'SAP':
      return new SapCollector({
        apiBaseUrl: source.config.apiBaseUrl,
        companyName: source.companyName,
        officialDomain: source.officialDomain,
      });

    default:
      throw new Error(`Unsupported ATS type: ${(source as SourceDefinition).atsType}`);
  }
}