# RoleRadar — Agent Operational Rules & Guidelines

## 1. Mandatory Sharing & Security Classification on All Deliverables

Whenever completing any task, implementation plan, walkthrough, competitive analysis, architecture summary, or audit report:

1. **Always declare the Sharing & Privacy Classification** at the top of the deliverable and in the chat response:
   - `[PUBLIC / EXTERNAL SHAREABLE]`: Clean of all secrets, credentials, internal IPs, and sensitive user data. Suitable for investors, partners, or public distribution.
   - `[INTERNAL CONFIDENTIAL / TECHNICAL DUE DILIGENCE]`: Contains no credentials/passwords, but includes sensitive internal code paths, engineering gap analysis, or architectural trade-offs suitable only for core team members and NDA-bound technical evaluators.
   - `[RESTRICTED / CONTAINS SECRETS - DO NOT SHARE]`: Contains live environment variables, connection strings, or private data that MUST NOT leave the local machine.

2. **Automated Credential Sanitization Check**:
   Before delivering any report or walkthrough, verify that:
   - Zero API keys, private tokens, or secrets (e.g., JWT secret, Resend key, SMTP passwords) are printed in plaintext.
   - Zero database passwords or raw connection strings (`DATABASE_URL`) are displayed.
   - Zero personal user emails, phone numbers, or candidate PII are included.
   - If code examples or env configurations are discussed, only use placeholder values (e.g., `your_api_key_here`, `postgres://user:***@localhost:5432/db`).

3. **Mandatory In-Depth External Shareable Reports on All Tasks**:
   For every completed milestone, audit, or deliverable, always generate a dedicated `[PUBLIC / EXTERNAL SHAREABLE]` deliverable alongside any internal due diligence notes. The external shareable report must be **extensively detailed, exhaustive, enterprise-grade, and comprehensive** (never brief summaries or abridged notes), containing complete tabular matrices, sector breakdowns, architectural case studies, and verification proofs, while containing ZERO personal credentials, ZERO personal emails, ZERO API keys/secrets, and ZERO candidate PII, suitable for external partners, investors, or public distribution.

## 2. Report Storage Policy — Artifact Directory Only

1. **Never store generated audit reports, competitive analyses, implementation plans, or walkthrough documents inside the project workspace directory** (`c:\Users\Samee\Documents\RoleRadar\`).
2. **Always write deliverables and reports exclusively to the dedicated IDE Artifact directory** (`<appDataDir>\brain\<conversation-id>\`).
3. Keep the project repository clean of non-code artifacts and untracked documentation files unless explicitly requested by the user.

## 3. Git Push Policy — Strict Permission Required

1. **Never execute `git push` without explicit user permission.**
2. All commits and staged changes must remain in the local Git repository until the user explicitly directs or authorizes a push to the remote repository (`origin`).

## 4. Mandatory Pre-Execution Blueprint & Strategy Alignment Check

For every prompt and task received in Antigravity, **BEFORE** beginning any implementation:
1. **Cross-Reference Authoritative Documents:**
   - `docs/RR_PRODUCT_MASTER_BLUEPRINT.md` (Document ID: `RR-PRODUCT-MASTER-BLUEPRINT-001`)
   - `docs/PRODUCT_STRATEGY_AND_FEATURE_ROADMAP.md` (Document ID: `RR-DOC-2026-PROD-V1`)
2. **Alignment Verification:**
   - Verify whether the requested prompt/feature directly aligns with the 5 core connected engines, 7 prioritized releases, and strict non-goals defined in the blueprint.
3. **Execution Protocol:**
   - **If Aligned:** Confirm alignment and proceed with implementation according to the technical acceptance gates and engineering standards.
   - **If Deviating / Mismatched:** Do not implement off-roadmap or conflicting code. Adapt the requested work so it strictly conforms to the blueprint and strategy, explicitly highlighting the adaptation and rationale before proceeding.


