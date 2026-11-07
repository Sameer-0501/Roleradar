# RoleRadar — Adobe Dual-Domain Provenance Hardening & Verification Report

**Document Classification:** `[PUBLIC / EXTERNAL SHAREABLE]`  
**Execution Context:** Phase 20.5 Source Provenance Hardening  
**Commit Reference:** `05d8e4f29dd844ee14416724705763bdce476907`  
**Compliance Standard:** `docs/ENGINEERING_STANDARDS.md`  
**Security Sanitization Check:** PASS (0 secrets, 0 API keys, 0 user tokens, 0 credentials, 0 PII)

---

## 1. Executive Summary

In Phase 20.5 Step 3, RoleRadar hardened its job URL provenance validation engine to support **Adobe Dual-Domain Provenance**. 

Prior to this implementation, RoleRadar strictly enforced that all candidate application URLs for an employer must reside on the primary ATS domain (`adobe.wd5.myworkdayjobs.com`). However, direct candidate links for Adobe frequently originate from official corporate recruitment domains (`careers.adobe.com`, `www.adobe.com`, and `adobe.com`). 

To accommodate legitimate corporate portal URLs without compromising security, RoleRadar implemented a strict, **opt-in alternate-domain provenance architecture**:
- **Zero Global Permissiveness:** Broad wildcards (e.g. `*.adobe.com`) were strictly prohibited.
- **Employer-Scoped Opt-in:** Alternate domains are bound strictly to the specific company configuration in the catalog.
- **Strict Path Requisition Enforcement:** Only verified requisition paths containing authentic Adobe requisition IDs (`R` followed by digits, e.g. `R142055`) are admitted. Generic portal roots, search pages, and corporate non-career pages are rejected.
- **Full Security Guardrails:** Standard HTTPS (port 443 only), zero embedded userinfo (`user:pass@`), and lookalike subdomain rejection are enforced sequentially.
- **100% Backwards Compatibility:** All existing catalog employers and previous test suites pass without regression.

---

## 2. Architectural Design & Security Guardrails

```
                    Incoming Job URL (candidate.officialUrl)
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │ Step 1: Syntactic Parse (new URL)                │
             │         Protocol Check: protocol === 'https:'    │
             └────────────────────────┬─────────────────────────┘
                                      │ PASS
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │ Step 2: Credentials & Port Invariants            │
             │         - No userinfo (!username && !password)   │
             │         - Port 443 only (!port || port === '443')│
             └────────────────────────┬─────────────────────────┘
                                      │ PASS
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │ Step 3: Primary Host Match?                      │
             │         hostname === officialDomain ||           │
             │         hostname.endsWith('.' + officialDomain)  │
             └───────────────┬──────────────────┬───────────────┘
                             │ YES              │ NO
                             ▼                  ▼
     ┌──────────────────────────────┐   ┌──────────────────────────────┐
     │ Step 4A: Primary Path Check  │   │ Step 4B: Alternate Domains?  │
     │ - >= 2 path segments         │   │ - Lookup matching rule       │
     │ - Individual job identifier  │   │   where rule.domain === host │
     │ - Reject /jobs, /careers     │   │ - Evaluate allowedPatterns   │
     └──────────────┬───────────────┘   └──────────────┬───────────────┘
                    │ PASS                             │ PASS
                    ▼                                  ▼
     ┌──────────────────────────────┐   ┌──────────────────────────────┐
     │ RETURN: valid (canonicalUrl) │   │ RETURN: valid (canonicalUrl) │
     └──────────────────────────────┘   └──────────────────────────────┘
```

### Invariant Rules
1. **No Wildcard Subdomain Matching:** Rather than allowing arbitrary subdomains of `adobe.com`, only explicitly whitelisted hosts (`careers.adobe.com`, `www.adobe.com`, `adobe.com`) are allowed. Unauthorized subdomains (e.g., `community.adobe.com`, `helpx.adobe.com`, `blog.adobe.com`) are rejected with `DOMAIN_MISMATCH`.
2. **Anti-Tampering Invariants:**
   - **Credentials in URL:** `https://admin:pass@adobe.wd5.myworkdayjobs.com/...` is rejected with `INVALID_CREDENTIALS_OR_PORT`.
   - **Non-Standard Ports:** `https://careers.adobe.com:8443/...` is rejected with `INVALID_CREDENTIALS_OR_PORT`.
   - **Unencrypted HTTP:** `http://careers.adobe.com/...` is rejected with `INVALID_PROTOCOL`.
   - **Domain Suffix Lookalikes:** `https://careers.adobe.com.attacker.com/...` is rejected with `DOMAIN_MISMATCH`.
3. **Requisition Pattern Enforcement:**
   - Alternate paths must match `/^\/(?:[a-z]{2}\/)?(?:us\/en|en|in)\/job\/R[0-9]{5,12}(?:\/[a-zA-Z0-9_\-]+)?\/?$/i` or `/^\/(?:[a-z]{2}\/)?careers\/(?:job|requisition)\/R[0-9]{5,12}(?:\/[a-zA-Z0-9_\-]+)?\/?$/i`.
   - Generic numeric slugs (e.g., `https://adobe.com/careers/job/12345`) are rejected as non-standard test slugs.

---

## 3. Codebase Modifications

### 3.1 Catalog Schema Extension (`backend/src/sources/catalog.ts`)
- Defined `AlternateDomainRule` interface:
  ```typescript
  export interface AlternateDomainRule {
    domain: string;
    allowedPathPatterns: RegExp[];
  }
  ```
- Extended `BaseSourceDefinition` with `allowedAlternateDomains?: AlternateDomainRule[]`.
- Configured `'Adobe'` entry with explicit alternate domain rules:
  ```typescript
  {
    companyName: 'Adobe',
    officialDomain: 'adobe.wd5.myworkdayjobs.com',
    careersUrl: 'https://www.adobe.com/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'adobe.wd5.myworkdayjobs.com',
      tenant: 'adobe',
      clientSite: 'external_experienced',
    },
    allowedAlternateDomains: [
      {
        domain: 'careers.adobe.com',
        allowedPathPatterns: [
          /^\/(?:[a-z]{2}\/)?(?:us\/en|en|in)\/job\/R[0-9]{5,12}(?:\/[a-zA-Z0-9_\-]+)?\/?$/i,
        ],
      },
      {
        domain: 'www.adobe.com',
        allowedPathPatterns: [
          /^\/(?:[a-z]{2}\/)?careers\/(?:job|requisition)\/R[0-9]{5,12}(?:\/[a-zA-Z0-9_\-]+)?\/?$/i,
        ],
      },
      {
        domain: 'adobe.com',
        allowedPathPatterns: [
          /^\/(?:[a-z]{2}\/)?careers\/(?:job|requisition)\/R[0-9]{5,12}(?:\/[a-zA-Z0-9_\-]+)?\/?$/i,
        ],
      },
    ],
  }
  ```
- Exported `catalog = SOURCE_CATALOG` alias.

### 3.2 URL Validator Hardening (`backend/src/collectors/url-validator.ts`)
- Extended `UrlValidationOptions` and `validateJobUrl` signature:
  ```typescript
  export function validateJobUrl(
    url: string,
    officialDomain: string,
    optionsOrAlternateDomains?: UrlValidationOptions | AlternateDomainRule[]
  ): UrlValidationResult
  ```
- Extended return type with backwards-compatible dual booleans and canonical URL:
  ```typescript
  export interface UrlValidationResult {
    valid: boolean;
    isValid: boolean;
    reason?: string;
    canonicalUrl?: string;
  }
  ```
- Standardized failure reason prefixes (`INVALID_PROTOCOL:`, `INVALID_CREDENTIALS_OR_PORT:`, `DOMAIN_MISMATCH:`, `ALTERNATE_DOMAIN_PATH_DISALLOWED:`, `PATH_INVALID:`, `SYNTAX_ERROR:`).

---

## 4. Verification Evidence & Test Results

### 4.1 Adobe Dual-Domain Provenance Test Suite
**File:** `backend/src/tests/adobe-dual-domain-provenance.test.ts`  
**Execution:** `npx vitest run src/tests/adobe-dual-domain-provenance.test.ts`  
**Result:** **14 passed / 14 total** (10ms)

| Category | Test Case | Target URL | Expected | Result |
| :--- | :--- | :--- | :---: | :---: |
| **Positive** | Standard primary Workday | `https://adobe.wd5.myworkdayjobs.com/external_experienced/job/San-Jose/Senior-Software-Engineer_R142055` | `valid: true` | **PASS** |
| **Positive** | Internationalized Workday | `https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/Bengaluru/Software-Engineer_R149920-1` | `valid: true` | **PASS** |
| **Positive** | Corporate US careers portal | `https://careers.adobe.com/us/en/job/R142055/Senior-Software-Engineer` | `valid: true` | **PASS** |
| **Positive** | Regional corporate portal | `https://careers.adobe.com/in/job/R149920/Software-Development-Engineer` | `valid: true` | **PASS** |
| **Positive** | Apex corporate careers job | `https://www.adobe.com/careers/job/R142055/Senior-Software-Engineer` | `valid: true` | **PASS** |
| **Negative** | Generic corporate root | `https://www.adobe.com/careers` | `valid: false` | **PASS** |
| **Negative** | Generic subdomain root | `https://careers.adobe.com` | `valid: false` | **PASS** |
| **Negative** | Non-standard numeric slug | `https://adobe.com/careers/job/12345` | `valid: false` | **PASS** |
| **Negative** | Non-career corporate page | `https://www.adobe.com/products/photoshop.html` | `valid: false` | **PASS** |
| **Negative** | Unauthorized subdomains | `community.adobe.com`, `helpx.adobe.com`, `blog.adobe.com` | `valid: false` | **PASS** |
| **Negative** | Domain suffix lookalike | `https://careers.adobe.com.attacker.com/job/R142055` | `valid: false` | **PASS** |
| **Negative** | Embedded userinfo | `https://admin:pass@adobe.wd5.myworkdayjobs.com/...` | `valid: false` | **PASS** |
| **Negative** | Non-standard port | `https://careers.adobe.com:8443/us/en/job/R142055` | `valid: false` | **PASS** |
| **Negative** | Unencrypted HTTP | `http://careers.adobe.com/us/en/job/R142055` | `valid: false` | **PASS** |

### 4.2 Full System Regression Suite
- `url-validator.test.ts`: **23 passed / 23 total**
- `source-catalog.test.ts`: **4 passed / 4 total**
- `collector-timeout-safety.test.ts`: **3 passed / 3 total**
- `apply-action-semantics.test.ts`: **4 passed / 4 total**
- `workday-batch6-integration.test.ts`: **30 passed / 30 total**
- **Backend Typecheck (`npx tsc --noEmit`):** Exit Code 0 (0 errors)
- **Frontend Production Build (`npm run build`):** Exit Code 0 (built in 10.69s, 0 errors)

---

## 5. Controlled Git History & Invariant Preservation

### 5.1 Local Commit
- **Commit SHA:** `05d8e4f29dd844ee14416724705763bdce476907`
- **Commit Message:** `feat(validation): implement strict alternate-domain provenance validation for Adobe`
- **Committed Files:**
  - `backend/src/sources/catalog.ts`
  - `backend/src/collectors/url-validator.ts`
  - `backend/src/tests/adobe-dual-domain-provenance.test.ts`
- **Remote Pushes:** **0** (`git push` strictly prohibited).

### 5.2 Digest Remediation Files Invariant
All three unstaged digest remediation files remain completely intact and uncommitted:
- `backend/src/notifications/digest-worker.ts`
- `backend/src/notifications/email/providers/smtp-provider.ts`
- `backend/src/tests/digest-concurrency-integration.test.ts`

