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

3. **Provide Shareable / Redacted Versions Proactively**:
   If an audit or technical report contains deep internal vulnerability notes that a user may not want to share with general customers or external parties, explicitly offer or provide a sanitized, external-ready summary.

## 2. Report Storage Policy — Artifact Directory Only

1. **Never store generated audit reports, competitive analyses, implementation plans, or walkthrough documents inside the project workspace directory** (`c:\Users\Samee\Documents\RoleRadar\`).
2. **Always write deliverables and reports exclusively to the dedicated IDE Artifact directory** (`<appDataDir>\brain\<conversation-id>\`).
3. Keep the project repository clean of non-code artifacts and untracked documentation files unless explicitly requested by the user.

