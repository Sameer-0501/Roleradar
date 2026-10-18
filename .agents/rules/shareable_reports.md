---
name: Shareable Reports and Plans
description: Enforces mandatory shareability assessment and delivery of sanitized shareable versions for all reports, plans, walkthroughs, and audits.
---

# Mandatory Shareable Reports & Plans Policy

Whenever completing any task and producing an implementation plan, walkthrough, audit report, milestone summary, or technical report:

1. **Shareability Status Banner**:
   - At the top of every report/walkthrough/plan, explicitly state the shareability status:
     - `STATUS: SAFE TO SHARE` (No credentials, secrets, personal data, or private internal infra exposed)
     - `STATUS: SENSITIVE / INTERNAL ONLY` (Contains private credentials, API keys, internal paths, tokens, or personal identifiers)
2. **Provide a Shareable / Sanitized Report**:
   - If the main artifact or output contains any sensitive credentials, environment secrets, tokens, personal machine paths, or private data, you MUST provide a sanitized **Shareable Version** (or clearly marked sanitized section) with all sensitive items redacted (e.g. `[REDACTED_API_KEY]`, `[REDACTED_SECRET]`, `[USER_HOME]`).
3. **Proactive & Non-Negotiable**:
   - Do NOT wait for the user to ask. Every delivery must proactively include this verification and sanitized shareable output.

