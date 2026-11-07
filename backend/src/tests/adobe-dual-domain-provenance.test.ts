import { describe, it, expect } from 'vitest';
import { validateJobUrl } from '../collectors/url-validator.js';
import { catalog } from '../sources/catalog.js';

describe('Adobe Dual-Domain Provenance Hardening Suite', () => {
  const adobeSource = catalog.find((s) => s.companyName === 'Adobe')!;

  describe('Positive Canonical Validations', () => {
    it('accepts standard primary Workday requisition URLs', () => {
      const url =
        'https://adobe.wd5.myworkdayjobs.com/external_experienced/job/San-Jose/Senior-Software-Engineer_R142055';
      const result = validateJobUrl(url, adobeSource.officialDomain, {
        allowedAlternateDomains: adobeSource.allowedAlternateDomains,
      });
      expect(result.isValid).toBe(true);
    });

    it('accepts internationalized Workday requisition URLs', () => {
      const url =
        'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/Bengaluru/Software-Engineer_R149920-1';
      const result = validateJobUrl(url, adobeSource.officialDomain, {
        allowedAlternateDomains: adobeSource.allowedAlternateDomains,
      });
      expect(result.isValid).toBe(true);
    });

    it('accepts valid corporate careers portal links (careers.adobe.com)', () => {
      const url =
        'https://careers.adobe.com/us/en/job/R142055/Senior-Software-Engineer';
      const result = validateJobUrl(url, adobeSource.officialDomain, {
        allowedAlternateDomains: adobeSource.allowedAlternateDomains,
      });
      expect(result.isValid).toBe(true);
    });

    it('accepts valid regional corporate careers links (careers.adobe.com/in)', () => {
      const url =
        'https://careers.adobe.com/in/job/R149920/Software-Development-Engineer';
      const result = validateJobUrl(url, adobeSource.officialDomain, {
        allowedAlternateDomains: adobeSource.allowedAlternateDomains,
      });
      expect(result.isValid).toBe(true);
    });

    it('accepts valid www.adobe.com careers requisition links', () => {
      const url =
        'https://www.adobe.com/careers/job/R142055/Senior-Software-Engineer';
      const result = validateJobUrl(url, adobeSource.officialDomain, {
        allowedAlternateDomains: adobeSource.allowedAlternateDomains,
      });
      expect(result.isValid).toBe(true);
    });
  });

  describe('Negative Security & Anti-Spoofing Validations', () => {
    it('rejects generic corporate careers homepage', () => {
      const url = 'https://www.adobe.com/careers';
      const result = validateJobUrl(url, adobeSource.officialDomain, {
        allowedAlternateDomains: adobeSource.allowedAlternateDomains,
      });
      expect(result.isValid).toBe(false);
    });

    it('rejects generic subdomain careers root', () => {
      const url = 'https://careers.adobe.com';
      const result = validateJobUrl(url, adobeSource.officialDomain, {
        allowedAlternateDomains: adobeSource.allowedAlternateDomains,
      });
      expect(result.isValid).toBe(false);
    });

    it('rejects non-standard generic numeric test slug (regression guard)', () => {
      const url = 'https://adobe.com/careers/job/12345';
      const result = validateJobUrl(url, adobeSource.officialDomain, {
        allowedAlternateDomains: adobeSource.allowedAlternateDomains,
      });
      expect(result.isValid).toBe(false);
    });

    it('rejects non-career corporate pages on valid domain', () => {
      const url = 'https://www.adobe.com/products/photoshop.html';
      const result = validateJobUrl(url, adobeSource.officialDomain, {
        allowedAlternateDomains: adobeSource.allowedAlternateDomains,
      });
      expect(result.isValid).toBe(false);
    });

    it('rejects unauthorized Adobe subdomains', () => {
      const urls = [
        'https://community.adobe.com/job/R142055',
        'https://helpx.adobe.com/careers/job/R142055',
        'https://blog.adobe.com/careers/job/R142055',
      ];
      for (const url of urls) {
        const result = validateJobUrl(url, adobeSource.officialDomain, {
          allowedAlternateDomains: adobeSource.allowedAlternateDomains,
        });
        expect(result.isValid).toBe(false);
      }
    });

    it('rejects domain suffix lookalike attacks', () => {
      const url = 'https://careers.adobe.com.attacker.com/job/R142055';
      const result = validateJobUrl(url, adobeSource.officialDomain, {
        allowedAlternateDomains: adobeSource.allowedAlternateDomains,
      });
      expect(result.isValid).toBe(false);
    });

    it('rejects userinfo credential injection attacks', () => {
      const url =
        'https://admin:pass@adobe.wd5.myworkdayjobs.com/external_experienced/job/R142055';
      const result = validateJobUrl(url, adobeSource.officialDomain, {
        allowedAlternateDomains: adobeSource.allowedAlternateDomains,
      });
      expect(result.isValid).toBe(false);
    });

    it('rejects non-standard ports', () => {
      const url = 'https://careers.adobe.com:8443/us/en/job/R142055';
      const result = validateJobUrl(url, adobeSource.officialDomain, {
        allowedAlternateDomains: adobeSource.allowedAlternateDomains,
      });
      expect(result.isValid).toBe(false);
    });

    it('rejects unencrypted HTTP protocol', () => {
      const url = 'http://careers.adobe.com/us/en/job/R142055';
      const result = validateJobUrl(url, adobeSource.officialDomain, {
        allowedAlternateDomains: adobeSource.allowedAlternateDomains,
      });
      expect(result.isValid).toBe(false);
    });
  });
});
