# ROLERADAR — PRODUCT MASTER BLUEPRINT

**Document ID:** RR-PRODUCT-MASTER-BLUEPRINT-001  
**Version:** 1.0  
**Date:** 8 November 2026  
**Product:** RoleRadar  
**Strategic scope:** Job discovery, candidate intelligence, resume building, career preparation and application outcomes  
**Status:** `STATUS: SAFE TO SHARE` / Approved Master Blueprint  
**Governance Authority:** Aligned with `docs/PROJECT_RULES.md` and `docs/ENGINEERING_STANDARDS.md`

> [!IMPORTANT]
> **Target Architecture & Governance Notice:**  
> This document (`ROLERADAR_PRODUCT_MASTER_BLUEPRINT.md`) defines the authoritative target product architecture, strategic specifications, and multi-engine roadmap for the RoleRadar platform. It establishes target architectural invariants, functional requirements, and delivery standards; it is **NOT** a claim that future product releases (Releases 1 through 7) are already implemented in code. For current verified code, test, and database state, refer strictly to `ROLERADAR_MASTER_HANDOFF.md`.

---

# 1. Executive vision

## 1.1 Product vision

RoleRadar will evolve from a job discovery platform into an integrated job-to-career execution platform.

Its purpose is to help people:

1. Discover trustworthy job opportunities.
2. Understand whether they genuinely qualify.
3. Identify the evidence supporting their suitability.
4. Understand and close their skill gaps.
5. Create truthful, job-specific resumes.
6. Prepare for real selection processes.
7. Track applications and learn from actual outcomes.

**Core product promise:**

Find the right opportunity. Prove your readiness. Prepare to earn it.

## 1.2 The central product philosophy

RoleRadar should not optimize for the number of jobs displayed, resumes generated, applications submitted or AI interactions completed.

It should optimize for:

- Trustworthy opportunities.
- Relevant recommendations.
- Truthful candidate representation.
- Demonstrable skill development.
- Better application preparation.
- Meaningful candidate outcomes.

The product must be useful to a fresher who has no employment experience and equally useful to an experienced professional seeking a career transition.

## 1.3 Product differentiation

RoleRadar's long-term differentiation should come from connecting evidence across the complete candidate journey.

The same job requirements should inform:
- Job matching.
- Candidate eligibility.
- Resume tailoring.
- Skill-gap analysis.
- Preparation plans.
- Mock interviews.
- Application insights.

The same candidate evidence should be reusable across these experiences.

This integrated model is the proposed competitive advantage. It is not a claim that no competitor offers any individual component.

---

# 2. Problems RoleRadar should solve

| Problem | Candidate impact | Proposed RoleRadar response |
|---|---|---|
| Fake and suspicious vacancies | Wasted time, money and trust | Opportunity Trust Passport |
| Stale and closed listings | Applications to unavailable roles | Continuous verification and freshness intelligence |
| Duplicate listings | Repeated applications | Deterministic requisition identity and deduplication |
| Poor job matching | Irrelevant applications | Proof-Based Job Fit |
| Unclear eligibility | Candidates apply without understanding requirements | Requirement-level eligibility explanation |
| Lack of work experience | Freshers struggle to demonstrate ability | Career Evidence Profile and project-based evidence |
| Generic resumes | Candidates fail to demonstrate relevant experience | Job-specific, truth-preserving Resume Studio |
| Skill gaps | Candidates don't know what to improve | Adaptive Career Readiness |
| Generic interview preparation | Poor preparation for actual selection processes | Vacancy-specific interview and assessment preparation |
| Employer silence | Candidates don't know application status | Application and Outcome Intelligence |
| Limited opportunity access | Qualified people miss opportunities due to geography, language or rigid filters | Inclusive Job Access |

## 2.1 Important design principle

Every identified problem should map to a measurable feature outcome.

Do not introduce a feature merely because a competitor has it or because an AI model can implement it.

---

# 3. Overall product architecture

RoleRadar should be organized around five connected product engines.

## Engine 1 — Opportunity Trust Intelligence

Purpose: Help candidates understand whether a particular opportunity is authentic, current and safe to apply for.

## Engine 2 — Proof-Based Job Fit

Purpose: Help candidates understand whether they qualify and what evidence supports their suitability.

## Engine 3 — Career Evidence and Resume Studio

Purpose: Maintain a reusable candidate profile and generate truthful, job-specific application documents.

## Engine 4 — Adaptive Career Readiness

Purpose: Help candidates improve actual capabilities through personalized learning, projects, assessments and interview practice.

## Engine 5 — Application and Outcome Intelligence

Purpose: Help candidates understand and manage their application journey, while producing reliable aggregate insights.

All five engines must use shared identity, job, candidate, skill, evidence and event concepts. They must not become disconnected products with separate, conflicting data.

---

# 4. Engine 1 — Opportunity Trust Intelligence

**Priority: P0**

**Proposed user-facing name:** Opportunity Trust Passport

## 4.1 Problem

Candidates often cannot confidently determine:
- Whether the employer is genuine.
- Whether a vacancy is still open.
- Whether an application link is official.
- Whether the same job appears multiple times.
- When the listing was last checked.
- Whether the job details have changed.

A company being genuine does not automatically make every vacancy genuine or currently available.

## 4.2 Proposed functionality

Every job should have a transparent trust record.

### A. Employer provenance

Show:
- Employer identity.
- Official employer domain.
- Official career-site origin.
- ATS provider, where applicable.
- Verified application hostname.
- Source identifier and requisition identifier, where available.

### B. Vacancy verification

Show:
- Current verification status.
- Last successful source check.
- Last observed content change.
- Requisition identity.
- Source health.
- Whether the vacancy was independently confirmed as open.

### C. Application destination security

Show:
- Official application destination.
- Domain validation result.
- HTTPS status.
- Redirect validation result, where relevant.
- Whether the application URL is available and valid.

### D. Job change history

Where evidence exists, record:
- First discovered.
- Last observed active.
- Important content changes.
- Reverification events.
- Closure evidence.

### E. Transparent status vocabulary

Use distinct statuses:

| Status | Meaning |
|---|---|
| VERIFIED ACTIVE | Current source evidence confirms the vacancy is active |
| VERIFICATION PENDING | Insufficient current evidence |
| SOURCE UNAVAILABLE | The upstream source could not currently be reached |
| CLOSED | Reliable evidence confirms closure |
| URL INVALID | Application destination failed security validation |
| DUPLICATE | Another record represents the same requisition |

Never treat source unavailability as proof that a job is closed.

Never show a job as verified merely because its employer is genuine.

## 4.3 Trust dimensions

Avoid a single opaque authenticity percentage.

Show separate dimensions:

1. Employer provenance.
2. Vacancy freshness.
3. Application URL integrity.
4. Requisition identity.
5. Availability evidence.
6. Job-detail completeness.

Each dimension must have its own evidence and uncertainty.

## 4.4 User journey

1. Candidate opens a job.
2. Candidate sees the trust summary.
3. Candidate opens verification details.
4. Candidate checks the official employer and application destination.
5. Candidate understands the last verification time.
6. Candidate decides whether to continue.

## 4.5 Proposed data model

Logical entities, subject to existing schema inspection:

- `job_verification_events`
- `job_source_provenance`
- `job_status_evidence`
- `job_url_validation_events`
- `job_change_history`

Reuse existing jobs, companies, ATS sources and requisition identity.

Do not introduce duplicate company or job records just to support this feature.

## 4.6 Acceptance criteria

- Official employer source is traceable.
- Application URL validation preserves existing security rules.
- Job status is evidence-based.
- Partial and failed scans cannot trigger global absence-based closure.
- Reverification history is auditable.
- Source failures are isolated.
- Uncertain states are represented honestly.
- Runtime engine scan demonstrates actual behavior.
- Database records remain consistent through repeated scans.
- Existing discovery and notification behavior remains intact.

## 4.7 Competitive positioning

Job verification signals already exist in products such as LinkedIn.

RoleRadar's intended differentiator is vacancy-level, inspectable provenance and operational verification evidence.

Do not claim exclusivity without a documented competitor benchmark.

---

# 5. Engine 2 — Proof-Based Job Fit

**Priority: P0**

**Proposed user-facing name:** RoleRadar Job Fit Intelligence

## 5.1 Problem

A conventional match percentage does not explain whether a candidate can actually perform a role.

A candidate may have relevant skills but fail a mandatory experience or work-authorization requirement.

Another candidate may lack one preferred skill but still be a strong applicant.

These situations must not be treated identically.

## 5.2 Proposed functionality

Extract and structure job requirements into:

### Mandatory requirements
- Education.
- Experience.
- Work authorization.
- Required skills.
- Certifications.
- Location restrictions.
- Language requirements.
- Other explicit eligibility conditions.

### Preferred requirements
- Additional technologies.
- Industry experience.
- Specific tools.
- Preferred certifications.
- Additional qualifications.

### Responsibilities
- Daily tasks.
- Expected technical capabilities.
- Team responsibilities.
- Operational responsibilities.

### Employment conditions
- Work location.
- Remote or hybrid arrangements.
- Contract type.
- Salary, where disclosed.
- Working hours, where disclosed.

## 5.3 Requirement-level candidate evidence

Every requirement should be evaluated against candidate evidence.

Example:

| Requirement | Evidence | Result |
|---|---|---|
| Java | Completed project | Supported |
| SQL | Coursework and project | Supported |
| Spring Boot | No available evidence | Gap |
| Two years of experience | Candidate has no employment history | Eligibility concern |
| Communication | Practice assessment | Partially demonstrated |

The system must distinguish:

- Supported.
- Partially supported.
- Not supported.
- Unknown.
- Hard eligibility concern.
- Not applicable.

Missing information must not automatically become a rejection.

## 5.4 Explainable matching

A candidate should be able to open any match result and understand:

- Which requirements were evaluated.
- Which evidence supported the result.
- Which requirements remain unverified.
- Which conditions may prevent eligibility.
- Which gaps can realistically be improved.
- Which requirements are preferred rather than mandatory.

## 5.5 Candidate controls

Allow candidates to:
- Correct extracted information.
- Add missing profile details.
- Dispute a requirement interpretation.
- Mark evidence as outdated.
- Update their preferences.
- Request a new evaluation.

Never silently alter the candidate's profile to improve a match.

## 5.6 Proposed data model

- `job_requirements`
- `job_requirement_groups`
- `candidate_requirement_evaluations`
- `candidate_skill_evidence`
- `job_fit_assessments`
- `job_fit_explanations`

Reuse existing job and candidate data wherever possible.

## 5.7 Acceptance criteria

- Mandatory and preferred requirements remain separate.
- Eligibility blockers are distinguishable from learnable gaps.
- Evidence sources are inspectable.
- Missing profile information is not treated as proven failure.
- The system does not fabricate qualifications.
- Match explanations are reproducible and auditable.
- Matching is tested against representative fresher, experienced and international profiles.
- Job and candidate data are protected by existing authorization rules.

## 5.8 Success metrics

- Eligibility precision.
- False-positive match rate.
- Evidence coverage.
- Percentage of recommendations with explainable evidence.
- Candidate correction rate.
- Candidate-reported relevance.

---

# 6. Engine 3 — Career Evidence and Resume Studio

**Priority: P1**

**Proposed user-facing name:** RoleRadar Career Profile and Resume Studio

This is an upgrade of the existing Resume Builder, not a separate resume product.

## 6.1 Strategic objective

Move from AI resume generation to a reusable Career Evidence Profile.

The candidate should create their professional profile once and generate multiple truthful resume variants from it.

## 6.2 Master Career Evidence Profile

The profile should support:

### Personal and professional information
- Candidate-controlled personal details.
- Professional headline.
- Career objective, where useful.
- Contact information.
- Location and work preferences.

### Education
- Institutions.
- Degrees.
- Qualifications.
- Academic projects.
- Relevant coursework.

### Employment
- Employer.
- Position.
- Dates.
- Responsibilities.
- Achievements.
- Technologies used.

### Projects
- Project name.
- Problem solved.
- Candidate contribution.
- Technologies used.
- Outcomes.
- Repository or portfolio links.
- Demonstration links.

### Skills
- Technical skills.
- Soft skills.
- Tools.
- Languages.
- Domain knowledge.

### Certifications and achievements
- Certification details.
- Issuing organization.
- Dates.
- Verification links where supported.

### Assessment evidence
- Assessment results.
- Completed exercises.
- Practical demonstrations.
- Interview practice records.

## 6.3 Evidence classification

Each claim must have an evidence classification.

| Classification | Meaning |
|---|---|
| SELF-REPORTED | Candidate entered the information |
| DOCUMENT-SUPPORTED | Supporting document supplied |
| PROJECT-SUPPORTED | Connected to a project or portfolio record |
| ASSESSMENT-SUPPORTED | Demonstrated through an assessment |
| EXTERNALLY VERIFIED | Confirmed through a supported independent source |

Do not call self-reported information verified.

Do not claim that a project proves professional employment experience.

## 6.4 Job-specific resume generation

When a candidate selects a RoleRadar job:

1. Extract its requirements.
2. Retrieve relevant candidate evidence.
3. Compare requirements with available evidence.
4. Identify the strongest relevant experience and projects.
5. Recommend appropriate resume emphasis.
6. Generate a tailored draft.
7. Validate generated statements against the source profile.
8. Highlight unsupported claims.
9. Let the candidate edit and approve the result.
10. Save a version associated with the selected job.

## 6.5 Claim provenance

Every AI-generated resume statement should be traceable to its source.

Example:

Generated statement:

"Developed a full-stack application using React, Node.js and PostgreSQL."

Supporting records:
- Project: Candidate's actual application.
- Frontend: React.
- Backend: Node.js.
- Database: PostgreSQL.
- Evidence classification: Project-supported.

If a statement cannot be supported, the system must:
- Avoid generating it as a factual claim, or
- Clearly flag it for candidate correction.

## 6.6 Resume quality checks

Provide separate evaluations:

### Parsing quality
- Text extraction.
- Section recognition.
- Heading recognition.
- Date extraction.
- Layout complexity.
- PDF/DOCX readability.

### Role relevance
- Relevant skills.
- Experience alignment.
- Project relevance.
- Job requirement coverage.
- Appropriate terminology.

### Evidence integrity
- Unsupported claims.
- Inconsistent dates.
- Conflicting employment details.
- Skill claims without evidence.
- AI-generated statements that exceed supplied facts.

Do not promise universal ATS acceptance.

## 6.7 Resume variants

Allow multiple editable variants:

- Software Developer.
- Java Developer.
- Data Analyst.
- QA Engineer.
- Business Analyst.
- Graduate Trainee.
- Internship Applicant.
- Experienced Professional.

Variants must reuse the master profile and preserve version history.

## 6.8 Fresher-specific resume workflow

A fresher should not be forced to invent employment experience.

Provide appropriate sections for:
- Academic projects.
- Personal projects.
- Internships.
- Coursework.
- Practical assessments.
- Open-source contributions.
- Certifications.
- Demonstrated skills.

## 6.9 Proposed data model

- `candidate_career_profiles`
- `candidate_experiences`
- `candidate_education`
- `candidate_projects`
- `candidate_skills`
- `candidate_evidence`
- `candidate_certifications`
- `resume_documents`
- `resume_versions`
- `resume_claims`
- `resume_claim_evidence`
- `resume_job_associations`

All proposed entities must be reconciled against the existing schema before implementation.

## 6.10 Acceptance criteria

- Master profile is reusable.
- Resume versions do not corrupt the source profile.
- Generated claims are traceable.
- Unsupported claims are flagged.
- Candidate edits remain authoritative.
- Multiple resume variants work independently.
- PDF/DOCX exports are readable and parse correctly in representative parsers.
- Sensitive personal information is protected.
- Candidate deletion and data-retention policies are respected.

---

# 7. Engine 4 — Adaptive Career Readiness

**Priority: P1**

**Proposed user-facing name:** RoleRadar Career Readiness

This is an upgrade of the existing Preparation Plan.

## 7.1 Strategic objective

Replace generic preparation schedules with personalized, job-linked preparation.

A candidate should understand:
- What they already know.
- What they need to improve.
- Why it matters for their target job.
- How to practice.
- How progress is measured.
- What evidence demonstrates improvement.

## 7.2 Diagnostic assessment

Before generating a plan, evaluate the candidate's current capabilities.

For software engineering:

- Programming fundamentals.
- Data structures.
- Algorithms.
- SQL.
- Database concepts.
- Backend or frontend fundamentals.
- Testing.
- Debugging.
- Project explanation.
- Communication.

For non-technical roles, use role-specific assessment categories.

Do not give every candidate the same diagnostic.

## 7.3 Job-linked preparation

The preparation engine should consume:

- Selected target jobs.
- Job requirements.
- Candidate profile.
- Existing skill evidence.
- Diagnostic results.
- Previous assessment results.
- Candidate's available preparation time.
- Candidate's preferred learning methods.

It should prioritize gaps based on job relevance and candidate goals.

## 7.4 Adaptive learning plan

Example: Java Backend Developer.

| Period | Focus | Required output |
|---|---|---|
| Week 1 | Java and OOP | Coding exercises |
| Week 2 | SQL and database design | Database project |
| Week 3 | Spring Boot and APIs | Working REST API |
| Week 4 | Testing and debugging | Test suite and debugging tasks |
| Week 5 | Technical interviews | Interview practice |
| Week 6 | Target-job preparation | Role-specific assessment |

The schedule must adapt when:
- The candidate completes a task.
- The candidate struggles.
- An assessment exposes a new gap.
- The target job changes.
- The candidate changes available preparation time.

## 7.5 Practical skill evidence

Every important skill should have a practical demonstration option.

Examples:
- Coding tasks.
- Debugging exercises.
- SQL challenges.
- Mini-projects.
- Technical explanations.
- Written communication.
- Spoken communication.
- Scenario-based assessments.

Watching a video or completing a course does not automatically prove practical competence.

## 7.6 Interview Studio

Generate job-specific practice based on:
- Actual job description.
- Candidate's resume.
- Candidate's projects.
- Relevant skill gaps.
- Role level.
- Known selection format, where available.

Support:
- Technical interviews.
- HR interviews.
- Coding rounds.
- Aptitude.
- SQL assessments.
- Group discussions.
- Case studies.
- Situational judgement.
- Project explanation.

Questions should adapt to candidate responses.

Feedback should explain:
- What was correct.
- What was incomplete.
- What was inaccurate.
- What a stronger answer would include.
- What the candidate should practice next.

AI assessment scores must not be represented as guaranteed predictors of employer decisions.

## 7.7 Readiness dashboard

Show distinct evidence dimensions:

- Skills demonstrated.
- Skills requiring improvement.
- Projects completed.
- Assessments attempted.
- Assessment performance.
- Interview practice progress.
- Job-specific readiness gaps.

Do not compress everything into one unexplained readiness percentage.

## 7.8 Proposed data model

- `readiness_assessments`
- `assessment_attempts`
- `assessment_questions`
- `assessment_responses`
- `candidate_skill_levels`
- `learning_plans`
- `learning_plan_tasks`
- `candidate_practice_sessions`
- `candidate_projects`
- `readiness_evidence`
- `interview_sessions`
- `interview_feedback`

Use shared career evidence and job requirement records wherever possible.

## 7.9 Acceptance criteria

- Plans are role-specific.
- Plans adapt to assessment outcomes.
- Completed work is recorded accurately.
- Assessment evidence is inspectable.
- Practical tasks produce reusable evidence.
- Candidates can correct mistakes and retry where appropriate.
- Interview feedback is explainable.
- Candidate data remains private.
- No unsupported claims of job readiness are made.

---

# 8. Engine 5 — Application and Outcome Intelligence

**Priority: P2**

**Proposed user-facing name:** RoleRadar Application Journey

## 8.1 Problem

Candidates frequently lose track of:
- Which job they applied to.
- Which resume they used.
- When they applied.
- Which assessment they completed.
- Whether they received an interview invitation.
- Whether an employer responded.

Silence is often incorrectly interpreted as rejection.

## 8.2 Application timeline

Support explicit application events:

- SAVED.
- APPLICATION_STARTED.
- APPLIED.
- ASSESSMENT_INVITED.
- ASSESSMENT_COMPLETED.
- INTERVIEW_SCHEDULED.
- INTERVIEW_COMPLETED.
- OFFER_RECEIVED.
- OFFER_ACCEPTED.
- OFFER_DECLINED.
- REJECTED.
- WITHDRAWN.

These states must only be recorded when supported by an authorized action or evidence.

## 8.3 Evidence sources

Classify application updates:

- Candidate-confirmed.
- User-uploaded evidence.
- Supported connected-service evidence.
- Employer-confirmed integration, where available.

Never invent employer status updates.

## 8.4 No-response handling

A period without a response must be represented as:

"Awaiting employer response" or "No response recorded."

It must not automatically become:
- Rejected.
- Closed by employer.
- Unsuccessful.

Job closure and candidate rejection are separate events.

## 8.5 Outcome intelligence

Aggregate data may eventually help answer:
- How long candidates wait for first responses.
- Which application stages take longer.
- Which skill gaps frequently appear.
- Which preparation activities correlate with candidate-reported progression.
- Which job categories have meaningful outcome data.

Every aggregate insight must include:
- Sample size.
- Time window.
- Geographic scope.
- Data collection method.
- Confidence or uncertainty.
- Privacy safeguards.

Do not rank employers using unreliable small samples.

## 8.6 Proposed data model

- `candidate_applications`
- `application_events`
- `application_evidence`
- `application_resume_versions`
- `application_outcomes`
- `candidate_feedback`
- `aggregated_outcome_metrics`

## 8.7 Acceptance criteria

- Application records are candidate-specific.
- Every status change has a source.
- User-confirmed and externally verified events remain distinguishable.
- No response does not mean rejection.
- Job closure does not imply candidate rejection.
- Analytics respect consent and privacy.
- Small samples are not presented as reliable statistics.
- Duplicate application records are handled safely.

---

# 9. Supporting capabilities

These should be considered after the five main engines have a stable foundation.

## 9.1 Recruitment Scam Shield

Detect and flag:
- Suspicious application domains.
- Requests for payment.
- Impersonated recruiters.
- Misleading contact channels.
- Suspicious job claims.
- Potential impersonation of legitimate employers.

Use evidence-based risk indicators.

A single user report must not automatically label an employer fraudulent.

## 9.2 Salary and Opportunity Reality

Show:
- Employer-disclosed salary.
- Currency.
- Employment type.
- Location.
- Remote/hybrid/onsite status.
- Benefits, where disclosed.
- Other relevant conditions.

Estimated salary must be clearly labelled as an estimate and include source, date, location and uncertainty.

## 9.3 Career Proof Portfolio

Provide a candidate-controlled shareable portfolio of:
- Projects.
- Certifications.
- Assessments.
- Demonstrated skills.
- Work samples.
- Candidate-approved resume.

The candidate must control access and sharing.

## 9.4 Inclusive Job Access

Improve:
- Regional-language support.
- Mobile usability.
- Low-bandwidth performance.
- Accessibility.
- Internship discovery.
- Apprenticeship discovery.
- Flexible employment filters.
- Non-degree and transferable-skill discovery.

Do not introduce overly restrictive filters that unintentionally exclude qualified candidates.

---

# 10. End-to-end user journeys

## Journey A — Fresher seeking a first job

1. Creates a candidate account.
2. Completes Career Evidence Profile.
3. Adds education, projects and skills.
4. Receives a diagnostic assessment.
5. Searches verified fresher opportunities.
6. Opens Opportunity Trust Passport.
7. Reviews Proof-Based Job Fit.
8. Selects a target role.
9. Receives a personalized preparation plan.
10. Completes practical projects and assessments.
11. Generates a truthful, job-specific resume.
12. Applies through the official employer destination.
13. Records application events.
14. Receives appropriate preparation recommendations based on progress.

## Journey B — Experienced professional changing careers

1. Imports or builds employment history.
2. Adds professional achievements and projects.
3. Selects a new target role.
4. Reviews transferable skills.
5. Identifies experience and technology gaps.
6. Builds a role-specific resume.
7. Completes focused assessments.
8. Practices interviews based on target vacancies.
9. Applies and tracks outcomes.

## Journey C — Candidate who discovers a suspicious job

1. Opens a listing.
2. Sees a source or URL warning.
3. Reviews the evidence.
4. Sees what is verified and what remains uncertain.
5. Avoids unsafe application routes.
6. Reports suspicious evidence where appropriate.

## Journey D — Candidate who repeatedly fails technical interviews

1. Records interview outcomes.
2. Completes diagnostic assessments.
3. Identifies recurring skill gaps.
4. Receives targeted preparation tasks.
5. Practices with adaptive interview simulation.
6. Demonstrates improvement through new assessments.
7. Updates the Career Evidence Profile.
8. Reassesses suitable opportunities.

---

# 11. Shared logical data architecture

The five engines should share a coherent information model.

These are conceptual entities, not approved database migration instructions.

| Domain | Logical entities | Responsibility |
|---|---|---|
| Employer and source | Companies, sources, source provenance | Employer identity and official sources |
| Jobs | Jobs, requisitions, job requirements | Vacancy identity and requirements |
| Verification | Verification events, status evidence | Job trust and freshness |
| Candidate | Career profiles, education, experiences | Candidate background |
| Evidence | Skills, projects, certifications, assessments | Supporting evidence |
| Matching | Fit assessments, requirement evaluations | Explainable job fit |
| Resumes | Documents, versions, claims, evidence links | Truthful document generation |
| Preparation | Plans, tasks, attempts, feedback | Candidate development |
| Interviews | Sessions, questions, responses, feedback | Practice and evaluation |
| Applications | Applications, events, outcomes | Application lifecycle |
| Analytics | Aggregated metrics, consent records | Privacy-safe insights |

## 11.1 Data ownership principles

- The candidate owns and controls their personal career information.
- Job source evidence remains tied to the source that produced it.
- Generated documents must retain their source profile relationship.
- Application events must retain their evidence origin.
- AI-generated content must not silently become authoritative candidate data.
- Deletion, retention and export must be considered in the design.
- Sensitive data must not be copied unnecessarily between services.

## 11.2 Data consistency

- Reuse canonical job and company identity.
- Reuse candidate identity and authorization.
- Avoid duplicated skill dictionaries and inconsistent skill names.
- Use explicit versioning for generated documents and assessments.
- Keep an auditable history for important state changes.
- Use idempotent processing where operations can be retried.

---

# 12. AI architecture and safeguards

AI should assist the platform, not become the authority for facts.

## 12.1 AI responsibilities

AI may:
- Extract job requirements.
- Classify skills.
- Explain matching results.
- Recommend resume emphasis.
- Rewrite candidate-provided content.
- Generate learning recommendations.
- Produce interview questions.
- Provide structured feedback.

## 12.2 Deterministic responsibilities

Deterministic code must control:
- Authentication.
- Authorization.
- URL validation.
- Source provenance.
- Job identity.
- Deduplication.
- Job lifecycle.
- Scan completeness.
- Database writes.
- Application state transitions.
- Notification budgets.
- Data access and deletion permissions.

## 12.3 AI safety rules

- Never invent candidate experience.
- Never fabricate job requirements.
- Never treat AI inference as confirmed source evidence.
- Preserve original candidate information.
- Show uncertainty.
- Allow correction.
- Avoid unsupported hiring predictions.
- Avoid discriminatory candidate rankings.
- Do not expose sensitive information to unnecessary AI processing.
- Maintain appropriate auditability.

---

# 13. Competitive differentiation strategy

RoleRadar must compete through integrated product quality, not imitation.

| Capability | Market presence | RoleRadar differentiation opportunity |
|---|---|---|
| Job discovery | Established | Strong official-source coverage and verification |
| Resume tailoring | Established | Evidence-backed claims and reusable master profile |
| ATS optimization | Established | Separate parsing quality, role relevance and claim integrity |
| Job tracking | Established | Evidence-based application timeline |
| AI interview practice | Established | Real-vacancy-linked preparation |
| Job matching | Established | Requirement-level proof and eligibility explanations |
| Skill learning | Established | Preparation driven by actual target-job gaps |
| Job trust | Existing verification signals | Vacancy-level provenance and verification history |
| Career portfolio | Established concept | Portfolio integrated with resume, job requirements and assessments |
| Application analytics | Existing market category | Consent-based outcome insights with uncertainty and sample sizes |

## 13.1 What RoleRadar should never claim

- First application in the world to combine these features.
- Guaranteed ATS acceptance.
- Guaranteed job placement.
- Guaranteed interview calls.
- 100% genuine jobs.
- 100% accurate AI skill evaluation.
- Employer response predictions without adequate evidence.

## 13.2 Product identity

RoleRadar's interface should have its own visual language, information hierarchy, terminology and workflows.

Use competitor research for benchmarking usability and functionality, not copying designs.

---

# 14. Prioritized delivery roadmap

This is the proposed product roadmap. It does not override the approved technical roadmap.

## Product Foundation — Existing Phase 20.5 completion

**Objective:** Establish the stable discovery, verification, source coverage and engineering foundation.

Dependencies:
- Reconcile actual Git history.
- Verify engineering standards.
- Reconcile Workday Batch 6 and Batch 8.
- Resolve Adobe provenance.
- Complete final Phase 20.5 acceptance.

No product feature roadmap work should bypass required Phase 20.5 gates.

## Product Release 1 — Trustworthy Opportunity Experience

**Priority: P0**

Scope:
- Opportunity Trust Passport.
- Job freshness visibility.
- Verification history.
- Clear status explanations.
- Proof-Based Job Fit foundation.

Acceptance:
- Actual job source evidence.
- Explainable requirements.
- Reliable database behavior.
- Runtime scan and acceptance evidence.
- No regression in discovery or verification.

## Product Release 2 — Career Evidence Foundation

**Priority: P1**

Scope:
- Master Career Evidence Profile.
- Skill evidence model.
- Project and experience records.
- Evidence classification.
- Candidate data controls.

Acceptance:
- Reusable candidate profile.
- Data ownership and privacy.
- Evidence provenance.
- Existing profile compatibility.
- No unsupported verified claims.

## Product Release 3 — Resume Studio 2.0

**Priority: P1**

Scope:
- Job-specific resume tailoring.
- Claim provenance.
- Multiple resume variants.
- Parsing quality checks.
- Evidence integrity checks.
- Resume version history.

Acceptance:
- Generated claims traceable to profile evidence.
- Unsupported statements flagged.
- Reliable exports.
- Candidate-controlled approval.
- Privacy and authorization tests.

## Product Release 4 — Adaptive Career Readiness

**Priority: P1**

Scope:
- Diagnostic assessments.
- Personalized preparation plans.
- Practical exercises.
- Projects.
- Skill evidence.
- Readiness dashboard.

Acceptance:
- Role-specific plans.
- Adaptive task sequencing.
- Reproducible assessment results.
- Evidence-backed progress.
- Candidate correction and retry workflows.

## Product Release 5 — Interview Studio

**Priority: P2**

Scope:
- Job-specific interview questions.
- Adaptive follow-ups.
- Technical and non-technical practice.
- Coding and aptitude assessments.
- Structured feedback.

Acceptance:
- Relevant questions.
- Explainable feedback.
- Candidate privacy.
- Appropriate performance and failure handling.
- No unsupported hiring predictions.

## Product Release 6 — Application Intelligence

**Priority: P2**

Scope:
- Application timeline.
- Resume association.
- Candidate-confirmed events.
- Outcome analytics.
- Aggregate insights.

Acceptance:
- Evidence-based status transitions.
- No-response and rejection remain separate.
- Consent and privacy controls.
- Reliable aggregate sample thresholds.

## Product Release 7 — Extended Career Ecosystem

**Priority: P3**

Scope:
- Recruitment Scam Shield expansion.
- Salary transparency.
- Career Proof Portfolio.
- Regional-language support.
- Accessibility improvements.
- Inclusive opportunity discovery.

Acceptance:
- Evidence-based warnings.
- Transparent salary sources.
- Candidate-controlled sharing.
- Accessibility validation.
- Internationalization and privacy validation.

---

# 15. Product metrics and success criteria

RoleRadar should measure whether the candidate experience improves.

| Metric | Purpose |
|---|---|
| Verified-job freshness | Measure opportunity currency |
| Invalid or stale listing exposure | Measure wasted opportunity reduction |
| Duplicate requisition rate | Measure discovery quality |
| Eligibility precision | Measure matching quality |
| Evidence coverage | Measure explainability |
| Resume claim integrity | Measure truthful generation |
| Resume parsing quality | Measure document reliability |
| Skill-gap completion | Measure preparation progress |
| Practical assessment improvement | Measure actual capability development |
| Application-to-response rate | Measure candidate-reported progression |
| Interview progression | Measure hiring journey progression |
| Candidate satisfaction | Measure usefulness and trust |

## 15.1 Measurement safeguards

- Define denominators.
- Define reporting windows.
- Separate verified events from candidate reports.
- Avoid tiny-sample conclusions.
- Avoid presenting correlation as causation.
- Preserve privacy.
- Record measurement limitations.

---

# 16. Engineering and release acceptance gates

Every feature must satisfy the permanent engineering standards.

## Architecture
- Reuse existing architecture.
- Reuse shared services.
- Avoid duplicate data models.
- Preserve existing contracts.

## Security
- Authentication and authorization.
- Input validation.
- Secure URL handling.
- Least-privilege data access.
- Safe error handling.

## Privacy
- Candidate data minimization.
- Consent where required.
- Appropriate retention.
- Safe exports and deletion.
- No PII in external reports.

## Reliability
- Idempotency.
- Retry safety.
- Failure isolation.
- Database consistency.
- Safe migrations.

## Performance
- Bounded queries.
- Pagination.
- Efficient indexing.
- Caching where appropriate.
- Runtime measurements.

## Accessibility
- Keyboard navigation.
- Screen-reader compatibility.
- Responsive layouts.
- Accessible contrast.
- Clear error states.

## Testing
- Unit tests.
- Integration tests.
- Regression tests.
- Runtime acceptance.
- Database verification.
- Frontend build.
- Backend typecheck.

## Observability
- Structured operational logs.
- Appropriate metrics.
- Error visibility.
- Traceability.
- No sensitive data leakage.

## Feature acceptance classification

Every applicable requirement must be classified:

- Applicable and satisfied.
- Applicable but unsatisfied.
- Not applicable, with reason.
- Blocked by external operational dependency.
- Deferred with explicit approval.

A feature is not production-ready merely because code compiles.

For discovery, scanning, verification, matching, source coverage and alerts, real runtime engine acceptance is mandatory.

---

# 17. Delivery and change-control rules

1. Preserve the established RoleRadar roadmap.
2. Do not skip technical phases to implement product features.
3. Do not introduce unapproved architecture redesigns.
4. Inspect actual repository state before planning implementation.
5. Produce implementation plans before substantial changes.
6. Protect existing business logic.
7. Maintain evidence-based reports.
8. Preserve interrupted work.
9. Keep unrelated changes out of feature commits.
10. Never push without explicit user permission.

## 17.1 Required completion report

Every implementation task must include:

- Objective.
- Scope.
- Files modified.
- Database changes.
- Architecture decisions.
- Implemented functionality.
- Tests actually executed.
- Runtime evidence.
- Security and privacy review.
- Performance considerations.
- Deferred requirements.
- External dependencies.
- Git commit information.
- Remaining risks.
- Sanitized external report.

## 17.2 Reporting vocabulary

IMPLEMENTED = Code or configuration exists.

TESTED = Relevant tests were actually executed successfully.

VERIFIED = Required behavior was demonstrated with evidence.

PRODUCTION-READY = Applicable engineering gates and operational dependencies have been addressed and deployment readiness demonstrated.

DEFERRED = Intentionally incomplete with a documented reason or dependency.

---

# 18. Explicit non-goals

The following must not become automatic implementation goals:

- Mass application automation.
- Fabricated candidate credentials.
- Guaranteed job placement.
- Universal ATS pass guarantees.
- Unexplained AI rankings.
- Unsupported employer response predictions.
- Copying competitor interfaces.
- Replacing existing discovery architecture.
- Introducing unnecessary microservices.
- Creating duplicate candidate or job records.
- Unapproved roadmap changes.

---

# 19. Immediate project-state reconciliation

Before any new product implementation, the technical roadmap must be reconciled.

The supplied project history contains reported work involving:

- Performance Engineering finalization.
- Phase 20.5 P0 remediation.
- Omnissa Workday admission.
- Engineering standards.
- Workday Batch 6.
- Adobe dual-domain provenance.
- Workday Batch 8.

The actual current state must be determined from the repository, Git history, tests and reports.

The latest Batch 8 report claims Salesforce, Workday Corporate and Teladoc Health were admitted, but its claims must be independently verified.

The three Digest remediation files previously identified as requiring preservation must not be modified or committed without explicit authorization.

The reconciliation must identify:
1. Current branch and Git state.
2. Existing commits.
3. Engineering standards status.
4. Batch 6 status.
5. Batch 8 implementation and test status.
6. Adobe provenance status.
7. Preserved Digest file status.
8. Exact Phase 20.5 position.
9. Single next approved technical task.

Do not implement product features during this reconciliation.

---

# 20. Final product direction

RoleRadar should become a platform where every major candidate action is connected to evidence.

A job should connect to its official source and verification history.

A match should connect to actual job requirements and candidate evidence.

A resume should connect to real candidate experience and projects.

A preparation plan should connect to specific skill gaps.

An assessment should produce evidence of improvement.

An application should connect to the exact job and resume version used.

An outcome should be recorded only when supported by evidence.

This connected information model is the foundation of RoleRadar's long-term differentiation.

**The objective is not to build the largest collection of AI career tools. The objective is to build a trustworthy system that helps people make better career decisions and become better prepared for real opportunities.**

