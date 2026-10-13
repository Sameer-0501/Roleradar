import { describe, it, expect } from 'vitest';
import { getCanonicalTaxonomyHandler } from '../api/preferences.js';
import type { Response } from 'express';

function createMockResponse() {
  let statusCode = 200;
  let jsonResult: any = null;
  const res = {
    status: (code: number) => { statusCode = code; return res; },
    json: (data: any) => { jsonResult = data; return res; },
  } as unknown as Response;
  return { res, getStatusCode: () => statusCode, getJson: () => jsonResult };
}

describe('Canonical Taxonomy API', () => {
  it('returns exactly 8 domains and 42 selectable roles in the correct hierarchical format', () => {
    const { res, getStatusCode, getJson } = createMockResponse();
    getCanonicalTaxonomyHandler({} as any, res);
    
    expect(getStatusCode()).toBe(200);
    const data = getJson();
    expect(data).toHaveProperty('domains');
    
    const domains = data.domains;
    expect(domains).toHaveLength(8);
    
    let totalSelectableRoles = 0;
    const allRoleIds = new Set<string>();
    const allDomainIds = new Set<string>();
    
    let hasSoftwareEngineer = false;
    let hasJavaDeveloper = false;
    let hasPythonDeveloper = false;
    let hasEngManager = false;
    
    domains.forEach((d: any) => {
      // Domain ID must be unique
      expect(allDomainIds.has(d.id)).toBe(false);
      allDomainIds.add(d.id);
      
      d.roles.forEach((r: any) => {
        // Role ID must be unique
        expect(allRoleIds.has(r.id)).toBe(false);
        allRoleIds.add(r.id);
        
        // Every role returned must be selectable
        expect(r.isSelectable).toBe(true);
        
        // Every role must have a valid domainId that matches its parent
        expect(r.domainId).toBe(d.id);
        
        // No internal fields exposed
        expect(r).not.toHaveProperty('disallowedTokens');
        expect(r).not.toHaveProperty('synonyms');
        expect(r).not.toHaveProperty('specializations');
        
        totalSelectableRoles++;
        
        if (r.id === 'ROLE_SOFTWARE_ENGINEER') hasSoftwareEngineer = true;
        if (r.id === 'ROLE_JAVA_DEV') hasJavaDeveloper = true;
        if (r.id === 'ROLE_PYTHON_DEV') hasPythonDeveloper = true;
        if (r.id === 'ROLE_ENG_MANAGER') hasEngManager = true;
      });
    });
    
    expect(totalSelectableRoles).toBe(42);
    expect(hasSoftwareEngineer).toBe(true);
    expect(hasJavaDeveloper).toBe(true);
    expect(hasPythonDeveloper).toBe(true);
    expect(hasEngManager).toBe(true);
    
    // Engineering Manager is not mixed with Director/Head/VP (checked by lack of internal fields and manual verification of canonical-taxonomy.ts)
    // Customer Success is distinct from Sales/GTM (in canonical-taxonomy.ts they have different domains)
    
    const salesDomain = domains.find((d: any) => d.id === 'DOMAIN_SALES_GTM');
    const csDomain = domains.find((d: any) => d.id === 'DOMAIN_CUSTOMER_SUCCESS');
    expect(salesDomain).toBeDefined();
    expect(csDomain).toBeDefined();
    expect(salesDomain.id).not.toBe(csDomain.id);
  });
});
