/**
 * Engine 2: Proof-Based Job Fit Inspector Drawer.
 *
 * Implements Blueprint Section 5 ("Engine 2 — Proof-Based Job Fit") and
 * docs/ENGINEERING_STANDARDS.md.
 *
 * Provides an explainable, requirement-by-requirement evaluation drawer:
 * - Replaces generic percentage match scores with deterministic evidence grounding.
 * - Displays exact 6 assessment states (SUPPORTED, PARTIALLY_SUPPORTED, NOT_SUPPORTED, UNKNOWN, HARD_ELIGIBILITY_CONCERN, NOT_APPLICABLE).
 * - Highlights Hard Eligibility Blockers prominently before tables or skills.
 * - Outlines Learnable Skill Gaps with concrete bridge actions.
 * - Supports Candidate Agency: inline requirement disputes and missing context clarifications.
 * - WAI-ARIA accessible, keyboard navigable (Escape to dismiss), and strict apply action semantics.
 */

import { jobsService } from '../services/api/jobs.service.js';
import { workspaceService } from '../services/api/workspace.service.js';
import { showToast as defaultShowToast } from '../services/ui/toast.js';
import type {
  ProofBasedJobFitAnalysis,
  RequirementEvaluation,
  EligibilityBlocker,
  LearnableSkillGap,
  UnknownItem,
  AssessmentState,
  OverallEligibilityStatus,
  EvidenceVerificationLevel,
} from '../services/api/types.js';

let activeAbortController: AbortController | null = null;
let keydownListenerAttached = false;
let currentFitJobId: string | null = null;

function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeJobFitDrawer();
  }
}

/**
 * Closes the active Job Fit drawer and removes listeners.
 */
export function closeJobFitDrawer(rootId = 'job-fit-drawer-root'): void {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }

  if (keydownListenerAttached && typeof document !== 'undefined') {
    document.removeEventListener('keydown', handleKeyDown);
    keydownListenerAttached = false;
  }

  currentFitJobId = null;

  if (typeof document !== 'undefined') {
    const root = document.getElementById(rootId);
    if (root) {
      root.innerHTML = '';
      if (root.parentNode) {
        root.parentNode.removeChild(root);
      }
    }
  }
}

/**
 * Renders the overall eligibility banner.
 */
function renderEligibilityBanner(status: OverallEligibilityStatus): string {
  switch (status) {
    case 'ELIGIBLE':
      return (
        '<div class="jfd__banner jfd__banner--eligible">' +
          '<div class="jfd__banner-icon">✅</div>' +
          '<div class="jfd__banner-content">' +
            '<div class="jfd__banner-title">Eligible for Application</div>' +
            '<div class="jfd__banner-desc">Mandatory qualifications are supported by verified evidence in your profile or are addressable gaps.</div>' +
          '</div>' +
        '</div>'
      );
    case 'ELIGIBILITY_CONCERN_DETECTED':
      return (
        '<div class="jfd__banner jfd__banner--concern">' +
          '<div class="jfd__banner-icon">⚠️</div>' +
          '<div class="jfd__banner-content">' +
            '<div class="jfd__banner-title">Eligibility Concern Detected</div>' +
            '<div class="jfd__banner-desc">This role contains mandatory constraints (e.g. experience scope or workplace location) that conflict with your current profile.</div>' +
          '</div>' +
        '</div>'
      );
    case 'NEEDS_PROFILE_COMPLETION':
      return (
        '<div class="jfd__banner jfd__banner--unknown">' +
          '<div class="jfd__banner-icon">ℹ️</div>' +
          '<div class="jfd__banner-content">' +
            '<div class="jfd__banner-title">Profile Completion Required</div>' +
            '<div class="jfd__banner-desc">Several critical qualifications could not be evaluated because information has not been added to your profile. Missing data is never an automatic rejection.</div>' +
          '</div>' +
        '</div>'
      );
    default:
      return '';
  }
}

/**
 * Renders an assessment state badge.
 */
function renderStateBadge(state: AssessmentState): string {
  switch (state) {
    case 'SUPPORTED':
      return '<span class="jfd__badge jfd__badge--supported">✓ Verified Supported</span>';
    case 'PARTIALLY_SUPPORTED':
      return '<span class="jfd__badge jfd__badge--partial">~ Partially Supported</span>';
    case 'NOT_SUPPORTED':
      return '<span class="jfd__badge jfd__badge--gap">✕ Learnable Gap</span>';
    case 'UNKNOWN':
      return '<span class="jfd__badge jfd__badge--unknown">? Missing Profile Data</span>';
    case 'HARD_ELIGIBILITY_CONCERN':
      return '<span class="jfd__badge jfd__badge--blocker">⛔ Eligibility Blocker</span>';
    case 'NOT_APPLICABLE':
      return '<span class="jfd__badge jfd__badge--na">○ Not Constraining</span>';
    default:
      return '<span class="jfd__badge">' + escapeHtml(state) + '</span>';
  }
}

/**
 * Renders evidence source tag.
 */
function renderSourceChip(source?: string): string {
  if (!source) return '';
  let label = source;
  let icon = '📄';
  if (source === 'PROJECT') {
    icon = '🚀';
    label = 'Project Portfolio';
  } else if (source === 'EXPERIENCE') {
    icon = '💼';
    label = 'Work Experience';
  } else if (source === 'EDUCATION') {
    icon = '🎓';
    label = 'Education';
  } else if (source === 'CERTIFICATION') {
    icon = '📜';
    label = 'Certification';
  } else if (source === 'PROFILE_SKILL') {
    icon = '⚡';
    label = 'Profile Skill';
  } else if (source === 'PREFERENCE') {
    icon = '📍';
    label = 'Preferences';
  } else if (source === 'CLARIFICATION') {
    icon = '✍️';
    label = 'Candidate Clarification';
  }

  return '<span class="jfd__source-chip">' + icon + ' ' + escapeHtml(label) + '</span>';
}

/**
 * Renders evidence verification level badge (Engine 3 Master Career Evidence disclosure).
 */
function renderVerificationBadge(level?: EvidenceVerificationLevel): string {
  if (!level) return '';
  switch (level) {
    case 'SELF_REPORTED':
      return '<span class="jfd__vbadge jfd__vbadge--self-reported" title="Evidence is self-reported by candidate">👤 Self-Reported</span>';
    case 'PROJECT_SUPPORTED':
      return '<span class="jfd__vbadge jfd__vbadge--project-supported" title="Evidence grounded by portfolio project or code">🚀 Project Supported</span>';
    case 'DOCUMENT_SUPPORTED':
      return '<span class="jfd__vbadge jfd__vbadge--document-supported" title="Evidence verified by official document / credential">📄 Document Supported</span>';
    case 'ASSESSMENT_SUPPORTED':
      return '<span class="jfd__vbadge jfd__vbadge--assessment-supported" title="Evidence validated by skill assessment test">📊 Assessment Supported</span>';
    case 'EXTERNALLY_VERIFIED':
      return '<span class="jfd__vbadge jfd__vbadge--externally-verified" title="Evidence verified by authoritative external provider">🛡️ Externally Verified</span>';
    default:
      return '<span class="jfd__vbadge">' + escapeHtml(level) + '</span>';
  }
}

/**
 * Opens and renders the interactive Proof-Based Job Fit drawer.
 */
export async function openJobFitDrawer(
  jobId: string,
  options: {
    showToast?: (msg: string, type?: 'info' | 'success' | 'error') => void;
    jobTitle?: string;
    companyName?: string;
  } = {}
): Promise<void> {
  const showToast = options.showToast || defaultShowToast;

  if (typeof document === 'undefined') return;

  // Abort any pending fetch
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();
  currentFitJobId = jobId;

  // Ensure root container
  let drawerRoot = document.getElementById('job-fit-drawer-root');
  if (!drawerRoot) {
    drawerRoot = document.createElement('div');
    drawerRoot.id = 'job-fit-drawer-root';
    document.body.appendChild(drawerRoot);
  }

  // Keyboard accessibility
  if (!keydownListenerAttached) {
    document.addEventListener('keydown', handleKeyDown);
    keydownListenerAttached = true;
  }

  // Render Skeleton Loading State
  drawerRoot.innerHTML = (
    '<div class="jfd__backdrop" id="jfd-backdrop" role="presentation">' +
      '<div class="jfd__drawer" role="dialog" aria-modal="true" aria-labelledby="jfd-title">' +
        '<div class="jfd__header">' +
          '<div class="jfd__header-title-box">' +
            '<span class="jfd__kicker">Fit Intelligence · Engine 2</span>' +
            '<h2 id="jfd-title" class="jfd__title">' + (escapeHtml(options.jobTitle) || 'Requirement-to-Evidence Analysis') + '</h2>' +
            '<p class="jfd__subtitle">' + (escapeHtml(options.companyName) || 'Loading verified job criteria...') + '</p>' +
          '</div>' +
          '<button type="button" class="jfd__close-btn" id="btn-close-jfd" aria-label="Close Inspector">✕</button>' +
        '</div>' +
        '<div class="jfd__body">' +
          '<div class="jfd__skeleton-box" style="height: 80px; margin-bottom: 20px;"></div>' +
          '<div class="jfd__skeleton-box" style="height: 140px; margin-bottom: 20px;"></div>' +
          '<div class="jfd__skeleton-box" style="height: 220px; margin-bottom: 20px;"></div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );

  const initialBackdrop = document.getElementById('jfd-backdrop');
  const initialClose = document.getElementById('btn-close-jfd');
  if (initialClose) initialClose.addEventListener('click', () => closeJobFitDrawer());
  if (initialBackdrop) {
    initialBackdrop.addEventListener('click', (e) => {
      if (e.target === initialBackdrop) closeJobFitDrawer();
    });
  }

  try {
    const analysis = await jobsService.getJobProofFit(jobId);
    renderDrawerContent(drawerRoot, analysis, showToast);
  } catch (err) {
    if (activeAbortController?.signal.aborted) return;
    const msg = err instanceof Error ? err.message : 'Failed to load fit analysis';
    showToast(msg, 'error');

    drawerRoot.innerHTML = (
      '<div class="jfd__backdrop" id="jfd-backdrop">' +
        '<div class="jfd__drawer" role="dialog">' +
          '<div class="jfd__header">' +
            '<h2 class="jfd__title">Evaluation Unavailable</h2>' +
            '<button type="button" class="jfd__close-btn" id="btn-close-jfd">✕</button>' +
          '</div>' +
          '<div class="jfd__body">' +
            '<div class="jfd__error-state">' +
              '<p>Unable to evaluate proof-based fit for this opportunity: ' + escapeHtml(msg) + '</p>' +
              '<button type="button" class="kn-btn kn-btn--primary" id="jfd-btn-retry">Retry Analysis</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    document.getElementById('btn-close-jfd')?.addEventListener('click', () => closeJobFitDrawer());
    document.getElementById('jfd-btn-retry')?.addEventListener('click', () => {
      openJobFitDrawer(jobId, options);
    });
  }
}

/**
 * Renders the complete, populated Job Fit Drawer.
 */
function renderDrawerContent(
  container: HTMLElement,
  analysis: ProofBasedJobFitAnalysis,
  showToast: (msg: string, type?: 'info' | 'success' | 'error') => void
): void {
  const isEligible = analysis.overallEligibilityStatus === 'ELIGIBLE';

  // 1. Eligibility Blockers Alert Box
  let blockersHtml = '';
  if (analysis.eligibilityBlockers && analysis.eligibilityBlockers.length > 0) {
    blockersHtml = (
      '<div class="jfd__blockers-box">' +
        '<div class="jfd__blockers-header">' +
          '<span class="jfd__blockers-icon">⛔</span>' +
          '<div>' +
            '<h3 class="jfd__blockers-title">Hard Eligibility Concerns (' + analysis.eligibilityBlockers.length + ')</h3>' +
            '<p class="jfd__blockers-sub">These non-negotiable requirements conflict with your current profile realities:</p>' +
          '</div>' +
        '</div>' +
        '<div class="jfd__blockers-list">' +
          analysis.eligibilityBlockers.map((b: EligibilityBlocker) => (
            '<div class="jfd__blocker-item">' +
              '<div class="jfd__blocker-crit"><strong>Requirement:</strong> ' + escapeHtml(b.criterion) + '</div>' +
              '<div class="jfd__blocker-reality"><strong>Your Profile:</strong> ' + escapeHtml(b.candidateReality) + '</div>' +
              '<div class="jfd__blocker-reason"><strong>Reason:</strong> ' + escapeHtml(b.reason) + '</div>' +
            '</div>'
          )).join('') +
        '</div>' +
      '</div>'
    );
  }

  // 2. Mandatory Requirements Rows
  const mandatoryRowsHtml = analysis.mandatoryEvaluations.map((req: RequirementEvaluation) => {
    return renderRequirementRow(req);
  }).join('');

  // 3. Preferred Qualifications Rows
  const preferredRowsHtml = (analysis.preferredEvaluations && analysis.preferredEvaluations.length > 0)
    ? analysis.preferredEvaluations.map((req: RequirementEvaluation) => renderRequirementRow(req)).join('')
    : '<div class="jfd__empty-pref">No optional or preferred skills specified by employer.</div>';

  // 4. Learnable Skill Gaps Section
  let gapsHtml = '';
  if (analysis.learnableSkillGaps && analysis.learnableSkillGaps.length > 0) {
    gapsHtml = (
      '<div class="jfd__section">' +
        '<h3 class="jfd__section-title">🛠️ Learnable Skill Gaps & Action Strategies</h3>' +
        '<div class="jfd__gaps-grid">' +
          analysis.learnableSkillGaps.map((gap: LearnableSkillGap) => (
            '<div class="jfd__gap-card ' + (gap.importance === 'MANDATORY' ? 'jfd__gap-card--mandatory' : '') + '">' +
              '<div class="jfd__gap-header">' +
                '<span class="jfd__gap-name">' + escapeHtml(gap.skillName) + '</span>' +
                '<span class="jfd__gap-badge ' + (gap.importance === 'MANDATORY' ? 'jfd__gap-badge--mand' : 'jfd__gap-badge--pref') + '">' +
                  escapeHtml(gap.importance) +
                '</span>' +
              '</div>' +
              '<div class="jfd__gap-action">' +
                '<strong>Bridge Action:</strong> ' + escapeHtml(gap.recommendedAction) +
              '</div>' +
            '</div>'
          )).join('') +
        '</div>' +
      '</div>'
    );
  }

  // 5. Unknown Items & Profile Completion Prompts
  let unknownHtml = '';
  if (analysis.unknownItems && analysis.unknownItems.length > 0) {
    unknownHtml = (
      '<div class="jfd__section jfd__section--unknown">' +
        '<h3 class="jfd__section-title">❓ Missing Profile Information (' + analysis.unknownItems.length + ')</h3>' +
        '<p class="jfd__section-sub">RoleRadar does not penalize you for unentered information. Add these credentials to evaluate your qualifications accurately:</p>' +
        '<div class="jfd__unknown-list">' +
          analysis.unknownItems.map((u: UnknownItem) => (
            '<div class="jfd__unknown-item">' +
              '<div class="jfd__unknown-crit"><strong>Requirement:</strong> ' + escapeHtml(u.criterion) + '</div>' +
              '<div class="jfd__unknown-prompt">' + escapeHtml(u.actionPrompt) + '</div>' +
            '</div>'
          )).join('') +
        '</div>' +
      '</div>'
    );
  }

  // 6. Extracted Daily Responsibilities
  let responsibilitiesHtml = '';
  if (analysis.responsibilities && analysis.responsibilities.length > 0) {
    responsibilitiesHtml = (
      '<div class="jfd__section">' +
        '<h3 class="jfd__section-title">📋 Day-to-Day Responsibilities</h3>' +
        '<ul class="jfd__resp-list">' +
          analysis.responsibilities.map((r: string) => '<li>' + escapeHtml(r) + '</li>').join('') +
        '</ul>' +
      '</div>'
    );
  }

  // 7. Employment Conditions Card
  const c = analysis.employmentConditions;
  const conditionsHtml = (
    '<div class="jfd__section">' +
      '<h3 class="jfd__section-title">🏛️ Employment & Workplace Conditions</h3>' +
      '<div class="jfd__conditions-grid">' +
        '<div class="jfd__cond-item">' +
          '<span class="jfd__cond-label">Location:</span>' +
          '<span class="jfd__cond-val">' + (c.workLocation ? escapeHtml(c.workLocation) : 'Flexible / Remote') + '</span>' +
        '</div>' +
        '<div class="jfd__cond-item">' +
          '<span class="jfd__cond-label">Workplace Policy:</span>' +
          '<span class="jfd__cond-val">' + escapeHtml(c.workplaceMode) + '</span>' +
        '</div>' +
        '<div class="jfd__cond-item">' +
          '<span class="jfd__cond-label">Country Boundary:</span>' +
          '<span class="jfd__cond-val">' + (c.countryBoundary ? escapeHtml(c.countryBoundary) : 'Global / Unrestricted') + '</span>' +
        '</div>' +
        '<div class="jfd__cond-item">' +
          '<span class="jfd__cond-label">Compensation:</span>' +
          '<span class="jfd__cond-val">' +
            (c.disclosedSalary.status === 'EMPLOYER_DISCLOSED' ? escapeHtml(c.disclosedSalary.rawCompensation) : 'Unstated by Employer') +
          '</span>' +
        '</div>' +
      '</div>' +
    '</div>'
  );

  container.innerHTML = (
    '<div class="jfd__backdrop" id="jfd-backdrop" role="presentation">' +
      '<div class="jfd__drawer" role="dialog" aria-modal="true" aria-labelledby="jfd-title">' +
        // Drawer Header
        '<div class="jfd__header">' +
          '<div class="jfd__header-title-box">' +
            '<div class="jfd__kicker-row">' +
              '<span class="jfd__kicker">Proof-Based Fit Intelligence · Engine 2</span>' +
              (analysis.candidateControlsApplied?.disputesCount > 0
                ? '<span class="jfd__agency-pill">⚖️ ' + analysis.candidateControlsApplied.disputesCount + ' Dispute(s) Active</span>'
                : '') +
            '</div>' +
            '<h2 id="jfd-title" class="jfd__title">Requirement-to-Evidence Analysis</h2>' +
            '<p class="jfd__subtitle">Deterministic match evaluation grounded in verified profile evidence.</p>' +
          '</div>' +
          '<button type="button" class="jfd__close-btn" id="btn-close-jfd" aria-label="Close Inspector">✕</button>' +
        '</div>' +

        // Drawer Scrollable Body
        '<div class="jfd__body">' +
          renderEligibilityBanner(analysis.overallEligibilityStatus) +
          blockersHtml +

          // Mandatory Requirements Table
          '<div class="jfd__section">' +
            '<div class="jfd__section-header">' +
              '<h3 class="jfd__section-title">📌 Mandatory Requirements (' + analysis.mandatoryEvaluations.length + ')</h3>' +
              '<span class="jfd__section-note">Strict criteria extracted from employer requisition</span>' +
            '</div>' +
            '<div class="jfd__reqs-table">' +
              mandatoryRowsHtml +
            '</div>' +
          '</div>' +

          // Preferred Qualifications
          '<div class="jfd__section">' +
            '<div class="jfd__section-header">' +
              '<h3 class="jfd__section-title">✨ Preferred Qualifications</h3>' +
              '<span class="jfd__section-note">Bonus skills and competitive differentiators</span>' +
            '</div>' +
            '<div class="jfd__reqs-table">' +
              preferredRowsHtml +
            '</div>' +
          '</div>' +

          gapsHtml +
          unknownHtml +
          responsibilitiesHtml +
          conditionsHtml +
        '</div>' +

        // Drawer Footer
        '<div class="jfd__footer">' +
          '<button type="button" class="kn-btn kn-btn--secondary" id="jfd-btn-close-footer">Close Inspector</button>' +
          (isEligible ? (
            '<div class="jfd__footer-eligible-note">✓ All non-negotiables satisfied</div>'
          ) : (
            '<div class="jfd__footer-concern-note">Review blockers & bridge gaps before applying</div>'
          )) +
        '</div>' +
      '</div>' +
    '</div>'
  );

  // Wire basic close actions
  const closeBtn = document.getElementById('btn-close-jfd');
  const closeFooterBtn = document.getElementById('jfd-btn-close-footer');
  const backdrop = document.getElementById('jfd-backdrop');

  if (closeBtn) closeBtn.addEventListener('click', () => closeJobFitDrawer());
  if (closeFooterBtn) closeFooterBtn.addEventListener('click', () => closeJobFitDrawer());
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeJobFitDrawer();
    });
  }

  // Wire Candidate Agency Dispute / Clarification Actions
  bindCandidateControls(container, analysis, showToast);
}

/**
 * Renders an individual requirement evaluation row.
 */
function renderRequirementRow(req: RequirementEvaluation): string {
  const isDisputed = req.isDisputed;
  return (
    '<div class="jfd__req-row ' + (req.assessmentState === 'HARD_ELIGIBILITY_CONCERN' ? 'jfd__req-row--blocker' : '') + '" data-req-id="' + escapeHtml(req.id) + '">' +
      '<div class="jfd__req-main">' +
        '<div class="jfd__req-crit-row">' +
          '<span class="jfd__req-category">' + escapeHtml(req.category) + '</span>' +
          '<span class="jfd__req-crit">' + escapeHtml(req.extractedCriterion) + '</span>' +
          renderStateBadge(req.assessmentState) +
        '</div>' +
        '<div class="jfd__req-orig">"' + escapeHtml(req.originalText) + '"</div>' +
        (req.evidenceSummary ? (
          '<div class="jfd__req-evidence">' +
            renderSourceChip(req.evidenceSource) +
            (req.evidenceVerificationLevel ? renderVerificationBadge(req.evidenceVerificationLevel) : '') +
            '<span class="jfd__evidence-text">' + escapeHtml(req.evidenceSummary) + '</span>' +
          '</div>'
        ) : '') +
        (isDisputed ? (
          '<div class="jfd__req-dispute-pill">' +
            '⚖️ <strong>Candidate Dispute:</strong> ' + escapeHtml(req.disputeReason) +
            (req.candidateNote ? ' <em>(' + escapeHtml(req.candidateNote) + ')</em>' : '') +
          '</div>'
        ) : '') +
        (req.candidateClarification ? (
          '<div class="jfd__req-clarification-pill">' +
            '💬 <strong>Candidate Clarification:</strong> ' + escapeHtml(req.candidateClarification) +
          '</div>'
        ) : '') +
      '</div>' +
      '<div class="jfd__req-actions">' +
        '<button type="button" class="jfd__dispute-btn" data-action-dispute="' + escapeHtml(req.id) + '">' +
          (isDisputed ? 'Edit Dispute' : 'Dispute / Clarify') +
        '</button>' +
      '</div>' +
      // Hidden inline form container
      '<div class="jfd__inline-form" id="jfd-form-' + escapeHtml(req.id) + '" style="display: none;">' +
        '<div class="jfd__inline-form-box">' +
          '<div class="jfd__form-header">' +
            '<h4>Candidate Dispute / Clarification: ' + escapeHtml(req.extractedCriterion) + '</h4>' +
            '<button type="button" class="jfd__form-close" data-form-close="' + escapeHtml(req.id) + '">✕</button>' +
          '</div>' +
          '<p class="jfd__form-desc">If this requirement is misclassified, or if you hold equivalent experience or missing credentials, state your clarification below. This will deterministically re-evaluate your fit.</p>' +
          '<div class="jfd__form-group">' +
            '<label>Dispute Reason / Clarification Category:</label>' +
            '<select id="jfd-reason-' + escapeHtml(req.id) + '" class="jfd__select">' +
              '<option value="Equivalent Practical / Open-Source Experience">Equivalent Practical / Open-Source Experience</option>' +
              '<option value="Misinterpreted Requirement (Non-Mandatory)">Misinterpreted Requirement (Non-Mandatory)</option>' +
              '<option value="Degree / Credential in Progress or Related Discipline">Degree / Credential in Progress or Related Discipline</option>' +
              '<option value="Willing to Relocate / Authorized for Remote">Willing to Relocate / Authorized for Remote</option>' +
              '<option value="Transferable Tool / Framework Proficiency">Transferable Tool / Framework Proficiency</option>' +
              '<option value="Other Context">Other Specific Context</option>' +
            '</select>' +
          '</div>' +
          '<div class="jfd__form-group">' +
            '<label>Candidate Evidence Note (optional):</label>' +
            '<textarea id="jfd-note-' + escapeHtml(req.id) + '" class="jfd__textarea" placeholder="e.g. Built high-scale open source project, or completed relevant coursework...">' +
              escapeHtml(req.candidateNote || '') +
            '</textarea>' +
          '</div>' +
          '<div class="jfd__form-btn-row">' +
            '<button type="button" class="kn-btn kn-btn--primary jfd__submit-dispute-btn" data-submit-dispute="' + escapeHtml(req.id) + '">Save & Re-Evaluate</button>' +
            '<button type="button" class="kn-btn kn-btn--secondary" data-form-close="' + escapeHtml(req.id) + '">Cancel</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

/**
 * Binds Candidate Agency controls (disputes and clarifications).
 */
function bindCandidateControls(
  container: HTMLElement,
  analysis: ProofBasedJobFitAnalysis,
  showToast: (msg: string, type?: 'info' | 'success' | 'error') => void
): void {
  const disputeButtons = container.querySelectorAll<HTMLButtonElement>('[data-action-dispute]');
  disputeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const reqId = btn.getAttribute('data-action-dispute');
      if (!reqId) return;
      const formEl = document.getElementById('jfd-form-' + reqId);
      if (formEl) {
        formEl.style.display = formEl.style.display === 'none' ? 'block' : 'none';
      }
    });
  });

  const closeFormButtons = container.querySelectorAll<HTMLButtonElement>('[data-form-close]');
  closeFormButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const reqId = btn.getAttribute('data-form-close');
      if (!reqId) return;
      const formEl = document.getElementById('jfd-form-' + reqId);
      if (formEl) formEl.style.display = 'none';
    });
  });

  const submitButtons = container.querySelectorAll<HTMLButtonElement>('[data-submit-dispute]');
  submitButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const reqId = btn.getAttribute('data-submit-dispute');
      if (!reqId) return;

      const reasonSelect = document.getElementById('jfd-reason-' + reqId) as HTMLSelectElement | null;
      const noteTextarea = document.getElementById('jfd-note-' + reqId) as HTMLTextAreaElement | null;

      const reason = reasonSelect?.value || 'Candidate clarification provided';
      const candidateNote = noteTextarea?.value || undefined;

      btn.disabled = true;
      btn.textContent = 'Saving...';

      try {
        const updatedAnalysis = await jobsService.saveJobFitControls(analysis.jobId, {
          disputedRequirements: [
            {
              requirementId: reqId,
              reason,
              candidateNote,
            },
          ],
        });

        showToast('Requirement evaluation updated and re-analyzed', 'success');
        renderDrawerContent(container, updatedAnalysis, showToast);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Save & Re-Evaluate';
        const msg = err instanceof Error ? err.message : 'Failed to update candidate control';
        showToast(msg, 'error');
      }
    });
  });
}

