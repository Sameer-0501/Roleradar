/**
 * RoleRadar Shared UI: Job Detail Modal Component.
 *
 * Provides the canonical, full-featured Job Details Modal with official verification audits,
 * resume fit analysis, application readiness checklist, cover letter drafting, interview notes,
 * and workspace action tracking.
 */

import { apiClient as defaultApiClient } from '../modules/preferences-client.js';
import { showToast as defaultShowToast } from '../services/ui/toast.js';

export type JobModalStateChangeCallback = (
  action: 'save' | 'apply' | 'dismiss' | 'note' | 'status' | string,
  jobId: string,
  payload?: any
) => void;

export interface JobDetailModalOptions {
  apiClient?: any;
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  rootContainerId?: string;
}

let activeAbortController: AbortController | null = null;
let currentModalJobId: string | null = null;
let keydownListenerAttached = false;

function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUrl(urlStr: string | null | undefined): string {
  if (!urlStr) return '#';
  const trimmed = String(urlStr).trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return escapeHtml(trimmed);
  }
  return '#';
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeJobDetailModal();
  }
}

/**
 * Closes the active job detail modal, unbinds all event listeners, and empties the modal DOM root.
 */
export function closeJobDetailModal(rootId = 'job-detail-modal-root'): void {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }

  if (keydownListenerAttached && typeof document !== 'undefined') {
    document.removeEventListener('keydown', handleKeyDown);
    keydownListenerAttached = false;
  }

  currentModalJobId = null;

  if (typeof document !== 'undefined') {
    const modalRoot = document.getElementById(rootId);
    if (modalRoot) {
      modalRoot.innerHTML = '';
      if (modalRoot.parentNode) {
        modalRoot.parentNode.removeChild(modalRoot);
      }
    }
  }
}

/**
 * Returns the currently open modal's jobId, or null if no modal is active.
 */
export function getActiveModalJobId(): string | null {
  return currentModalJobId;
}

/**
 * Opens the Job Detail Modal for a specific job, fetching authoritative details,
 * official verifications, fit score, and application assistant data.
 *
 * @param jobId The unique ID of the job to display.
 * @param onStateChange Optional callback invoked when candidate workspace state updates.
 * @param options Configuration options including custom apiClient and showToast instances.
 */
export async function openJobDetailModal(
  jobId: string,
  onStateChange?: JobModalStateChangeCallback,
  options: JobDetailModalOptions = {}
): Promise<void> {
  if (typeof document === 'undefined') return;

  const rootId = options.rootContainerId || 'job-detail-modal-root';

  // Prevent duplicate modals or reset previous instance cleanly
  closeJobDetailModal(rootId);

  let modalRoot = document.getElementById(rootId);
  if (!modalRoot) {
    modalRoot = document.createElement('div');
    modalRoot.id = rootId;
    document.body.appendChild(modalRoot);
  }

  const abortController = new AbortController();
  activeAbortController = abortController;
  currentModalJobId = jobId;

  const apiClient = options.apiClient || defaultApiClient;
  const showToast = options.showToast || defaultShowToast;

  // Render initial loading dialog
  modalRoot.innerHTML = (
    '<div class="app-modal-backdrop" id="job-modal-backdrop">' +
      '<div class="app-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-job-title">' +
        '<div class="app-modal-header">' +
          '<lemniscate-loader></lemniscate-loader>' +
          '<p class="kn-text-muted">Loading official job details...</p>' +
          '<button type="button" class="app-modal-close" id="btn-close-job-modal" aria-label="Close">✕</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  );

  const closeModal = () => closeJobDetailModal(rootId);

  const closeBtn = document.getElementById('btn-close-job-modal');
  const backdrop = document.getElementById('job-modal-backdrop');
  if (closeBtn) closeBtn.addEventListener('click', closeModal, { signal: abortController.signal });
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    }, { signal: abortController.signal });
  }

  if (!keydownListenerAttached) {
    document.addEventListener('keydown', handleKeyDown);
    keydownListenerAttached = true;
  }

  // Authenticated view tracking (Principle 15)
  const isAuth = Boolean(apiClient.getToken && apiClient.getToken());
  if (isAuth && typeof apiClient.recordJobView === 'function') {
    apiClient.recordJobView(jobId).catch(() => {});
  }

  try {
    const fetchJob = typeof apiClient.getJobById === 'function'
      ? apiClient.getJobById.bind(apiClient)
      : typeof apiClient.getJob === 'function'
        ? apiClient.getJob.bind(apiClient)
        : null;

    if (!fetchJob) {
      throw new Error('No getJobById or getJob method found on apiClient');
    }

    const jobRes = await fetchJob(jobId);
    if (abortController.signal.aborted) return;

    const job = jobRes?.job || jobRes;
    const verifications = jobRes?.verifications || [];

    let interaction: any = null;
    let jobFit: any = null;
    let readiness: any = null;

    if (isAuth) {
      try {
        const results = await Promise.allSettled([
          apiClient.getJobInteraction(jobId),
          typeof apiClient.compareJobWithProfile === 'function'
            ? apiClient.compareJobWithProfile(jobId)
            : Promise.resolve(null),
          typeof apiClient.getApplicationReadiness === 'function'
            ? apiClient.getApplicationReadiness(jobId)
            : Promise.resolve(null),
        ]);
        if (abortController.signal.aborted) return;

        if (results[0].status === 'fulfilled') interaction = results[0].value;
        if (results[1].status === 'fulfilled') jobFit = results[1].value;
        if (results[2].status === 'fulfilled') readiness = results[2].value;
      } catch (e) {}
    }

    if (!job) {
      closeModal();
      showToast('Job not found', 'error');
      return;
    }

    const title = escapeHtml(job.title);
    const company = escapeHtml(job.company_name || job.companyName || job.company || 'Official Employer');
    const location = escapeHtml(job.location || 'Location Unspecified');
    const officialUrl = sanitizeUrl(job.official_url || job.officialUrl);
    const workplace = escapeHtml(job.workplace_type || job.workplaceType || 'Unspecified');
    const expText = escapeHtml(job.experience_reason || job.experience_classification || 'Standard compatibility');
    const freshnessState = escapeHtml(job.freshness_state || job.freshnessState || 'ACTIVE');
    const freshnessReason = escapeHtml(job.freshness_reason || job.freshnessReason || 'Verified active');
    const isClosed = (job.status === 'CLOSED');

    const isSaved = readiness?.interaction ? Boolean(readiness.interaction.isSaved) : Boolean(interaction?.isSaved);
    const isApplied = readiness?.interaction ? Boolean(readiness.interaction.isApplied) : Boolean(interaction?.isApplied);
    const currentNotes = (readiness?.interaction?.notes !== undefined)
      ? readiness.interaction.notes
      : (interaction?.notes || '');

    // Resume & Candidate Fit Analysis Section
    const fitSectionHtml = jobFit ? (
      '<div class="modal-section modal-fit-section">' +
        '<h3 class="modal-section-title">⚡ Resume & Candidate Fit Analysis</h3>' +
        '<div class="modal-fit-card">' +
          '<div class="modal-fit-header">' +
            '<span class="modal-fit-score-badge modal-fit-score--' + escapeHtml((jobFit.fitTier || 'exploratory').toLowerCase()) + '">' +
              '🎯 ' + jobFit.fitScore + '% Match · ' + escapeHtml((jobFit.fitTier || '').replace('_', ' ')) +
            '</span>' +
          '</div>' +
          (jobFit.fitReasons && jobFit.fitReasons.length > 0 ? (
            '<ul class="modal-fit-reasons">' +
              jobFit.fitReasons.map((r: string) => '<li>' + escapeHtml(r) + '</li>').join('') +
            '</ul>'
          ) : '') +
          '<div class="modal-fit-skills-grid">' +
            '<div>' +
              '<strong>Matching Skills (' + (jobFit.matchingSkills ? jobFit.matchingSkills.length : 0) + ')</strong>' +
              '<div class="modal-skill-tags">' +
                (jobFit.matchingSkills && jobFit.matchingSkills.length > 0
                  ? jobFit.matchingSkills.map((s: string) => '<span class="skill-tag skill-tag--matching">✓ ' + escapeHtml(s) + '</span>').join('')
                  : '<span class="kn-text-muted" style="font-size:0.8rem;">No exact keyword matches found</span>') +
              '</div>' +
            '</div>' +
            '<div>' +
              '<strong>Skills Not Found in Profile (' + (jobFit.missingSkills ? jobFit.missingSkills.length : 0) + ')</strong>' +
              '<div class="modal-skill-tags">' +
                (jobFit.missingSkills && jobFit.missingSkills.length > 0
                  ? jobFit.missingSkills.map((s: string) => '<span class="skill-tag skill-tag--missing" title="Not found in your current profile">⚠ ' + escapeHtml(s) + '</span>').join('')
                  : '<span class="kn-text-muted" style="font-size:0.8rem;">No missing required skills detected</span>') +
              '</div>' +
            '</div>' +
          '</div>' +
          (jobFit.fresherReadiness && jobFit.fresherReadiness.actionableAdvice && jobFit.fresherReadiness.actionableAdvice.length > 0 ? (
            '<div class="modal-fresher-advice">' +
              '<strong>🎓 Fresher Optimization Tip:</strong> ' +
              escapeHtml(jobFit.fresherReadiness.actionableAdvice[0]) +
            '</div>'
          ) : '') +
        '</div>' +
      '</div>'
    ) : '';

    const readinessScore = readiness?.readinessScore || 0;
    const readinessPillClass = readinessScore >= 75
      ? 'readiness-score-pill--high'
      : readinessScore >= 45
        ? 'readiness-score-pill--medium'
        : 'readiness-score-pill--low';

    const appStatus = readiness?.interaction?.applicationStatus || interaction?.applicationStatus || 'SAVED';
    const selectedResumeId = readiness?.interaction?.selectedResumeId || '';
    const checklist = Array.isArray(readiness?.interaction?.checklist) ? readiness.interaction.checklist : [];
    const coverLetter = readiness?.interaction?.coverLetter || '';
    const reminderAt = readiness?.interaction?.reminderAt ? readiness.interaction.reminderAt.slice(0, 16) : '';
    const interviewNotes = readiness?.interaction?.interviewNotes || '';
    const availableResumes = readiness?.availableResumes || [];
    const missingReqs = readiness?.missingRequirements || [];

    const resumeOptionsHtml = '<option value="">-- Select Resume Version --</option>' +
      availableResumes.map((r: any) => {
        const isSel = (r.id === selectedResumeId) || (!selectedResumeId && r.isActive);
        return '<option value="' + escapeHtml(r.id) + '" ' + (isSel ? 'selected' : '') + '>' + escapeHtml(r.filename) + (r.isActive ? ' (Active)' : '') + '</option>';
      }).join('');

    const statusOptionsHtml = ['SAVED', 'PREPARING', 'APPLIED', 'INTERVIEWING', 'OFFERED', 'REJECTED', 'WITHDRAWN'].map((s) => {
      return '<option value="' + s + '" ' + (appStatus === s ? 'selected' : '') + '>' + s + '</option>';
    }).join('');

    const checklistItemsHtml = checklist.map((item: any, idx: number) => {
      const itemClass = 'checklist-item-row' + (item.done ? ' is-done' : '');
      return '<li class="' + itemClass + '" data-checklist-id="' + escapeHtml(item.id) + '">' +
        '<input type="checkbox" id="chk-item-' + idx + '" class="checklist-item-chk" data-item-id="' + escapeHtml(item.id) + '" ' + (item.done ? 'checked' : '') + ' />' +
        '<span>' + escapeHtml(item.text) + '</span>' +
      '</li>';
    }).join('');

    const missingReqsHtml = missingReqs.length > 0 ? (
      '<div style="margin-top:8px; padding:8px 10px; background:#fff1f2; border-left:3px solid #f43f5e; border-radius:4px; font-size:0.8rem; color:#9f1239;">' +
        '<strong>Missing Requirements / Preparation Recommendations:</strong>' +
        '<ul style="margin:4px 0 0 16px; padding:0;">' +
          missingReqs.map((m: string) => '<li>' + escapeHtml(m) + '</li>').join('') +
        '</ul>' +
      '</div>'
    ) : '';

    const assistantSectionHtml = isAuth ? (
      '<div class="modal-section modal-assistant-section">' +
        '<h3 class="modal-section-title">🚀 Job Application Assistant & Readiness</h3>' +
        '<div class="modal-assistant-card">' +
          '<div class="modal-readiness-header">' +
            '<div class="readiness-score-pill ' + readinessPillClass + '" id="readiness-score-display">' +
              '🎯 ' + readinessScore + '% Application Ready' +
            '</div>' +
            '<div class="modal-readiness-controls">' +
              '<label style="font-size:0.8rem; font-weight:600;">Status: ' +
                '<select id="modal-app-status-select" class="modal-select-control">' + statusOptionsHtml + '</select>' +
              '</label>' +
              '<label style="font-size:0.8rem; font-weight:600;">Resume: ' +
                '<select id="modal-resume-select" class="modal-select-control">' + resumeOptionsHtml + '</select>' +
              '</label>' +
            '</div>' +
          '</div>' +
          missingReqsHtml +
          '<div class="official-apply-banner">' +
            '<span class="official-apply-banner__text">🛡️ <strong>Official Application:</strong> RoleRadar never submits applications automatically. Review checklist, tailor resume, apply on official site, then mark applied.</span>' +
            (isClosed ? '' : '<a href="' + officialUrl + '" target="_blank" rel="noopener noreferrer" class="kn-btn kn-btn--primary" style="font-size:0.8rem; padding:6px 12px;">Go to Official Career Portal ↗</a>') +
          '</div>' +
          '<div class="modal-assistant-grid">' +
            '<div class="checklist-container">' +
              '<div class="checklist-title">' +
                '<span>✓ Application Checklist</span>' +
                '<span id="checklist-progress-text" class="kn-text-muted" style="font-size:0.75rem;">' +
                  (checklist.filter((i: any) => i.done).length) + '/' + checklist.length + ' done' +
                '</span>' +
              '</div>' +
              '<ul class="checklist-items-list" id="modal-checklist-list">' +
                (checklistItemsHtml || '<li class="kn-text-muted" style="font-size:0.8rem;">No checklist items yet</li>') +
              '</ul>' +
              '<div class="checklist-add-row">' +
                '<input type="text" id="checklist-new-input" class="checklist-add-input" placeholder="Add task (max 300 chars)..." maxlength="300" />' +
                '<button type="button" class="kn-btn kn-btn--secondary" id="btn-add-checklist-item" style="font-size:0.78rem; padding:4px 8px;">+ Add</button>' +
              '</div>' +
            '</div>' +
            '<div class="assistant-box">' +
              '<div class="assistant-box-title">' +
                '<span>✍️ Tailored Cover Letter</span>' +
                '<button type="button" class="kn-btn kn-btn--secondary" id="btn-generate-cover-draft" style="font-size:0.75rem; padding:2px 8px;">⚡ Auto-Draft</button>' +
              '</div>' +
              '<textarea id="modal-cover-letter-input" class="assistant-textarea" rows="5" placeholder="Draft a customized cover letter for this employer..." maxlength="5000">' + escapeHtml(coverLetter) + '</textarea>' +
              '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">' +
                '<span id="cover-letter-char-count" class="kn-text-muted" style="font-size:0.72rem;">' + coverLetter.length + '/5000</span>' +
                '<div style="display:flex; gap:6px;">' +
                  '<button type="button" class="kn-btn kn-btn--secondary" id="btn-clear-cover-letter" style="font-size:0.75rem; padding:3px 8px;">Clear</button>' +
                  '<button type="button" class="kn-btn kn-btn--primary" id="btn-save-cover-letter" style="font-size:0.75rem; padding:3px 8px;">Save Letter</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="modal-assistant-grid">' +
            '<div class="assistant-box">' +
              '<div class="assistant-box-title">' +
                '<span>⏰ Application Follow-up Reminder</span>' +
              '</div>' +
              '<div style="display:flex; gap:6px; margin-top:4px; align-items:center; flex-wrap:wrap;">' +
                '<input type="datetime-local" id="modal-reminder-input" class="modal-select-control" value="' + escapeHtml(reminderAt) + '" />' +
                '<button type="button" class="kn-btn kn-btn--primary" id="btn-save-reminder" style="font-size:0.75rem; padding:4px 10px;">Set Reminder</button>' +
                '<button type="button" class="kn-btn kn-btn--secondary" id="btn-clear-reminder" style="font-size:0.75rem; padding:4px 8px;">Clear</button>' +
              '</div>' +
            '</div>' +
            '<div class="assistant-box">' +
              '<div class="assistant-box-title">' +
                '<span>🎯 Interview Preparation Notes</span>' +
                '<button type="button" class="kn-btn kn-btn--primary" id="btn-save-interview-notes" style="font-size:0.75rem; padding:3px 8px;">Save Prep</button>' +
              '</div>' +
              '<textarea id="modal-interview-notes-input" class="assistant-textarea" rows="3" placeholder="Company questions, technical rounds prep, questions to ask interviewer..." maxlength="10000">' + escapeHtml(interviewNotes) + '</textarea>' +
              '<span id="interview-notes-char-count" class="kn-text-muted" style="font-size:0.72rem; text-align:right;">' + interviewNotes.length + '/10000</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    ) : '';

    const verifListHtml = verifications.length > 0
      ? verifications.slice(0, 3).map((v: any) => {
          const dateStr = new Date(v.checked_at).toLocaleDateString();
          const score = v.verification_score ? Math.round(v.verification_score * 100) + '%' : '100%';
          return '<div class="modal-verif-item"><span>✓ ' + dateStr + '</span><span>Official Portal Check: ' + (v.job_exists_check ? 'Active' : 'Passed') + '</span><span>Score: ' + score + '</span></div>';
        }).join('')
      : '<p class="kn-text-muted">Verified directly on company career portal.</p>';

    const descHtml = job.description
      ? '<div class="modal-job-desc">' + job.description + '</div>'
      : '<p class="kn-text-muted">Direct description available on the official company careers page.</p>';

    const reqHtml = job.requirements
      ? '<div class="modal-job-reqs"><h4>Requirements</h4>' + job.requirements + '</div>'
      : '';

    const closedBannerHtml = isClosed
      ? '<div class="vjc__closed-warning" style="margin-bottom: 12px;">⚠ This position is no longer active on the official career portal. You can keep your private notes and history.</div>'
      : '';

    const applyButtonHtml = isClosed
      ? '<button type="button" class="kn-btn kn-btn--secondary" disabled>Position Closed</button>'
      : '<a href="' + officialUrl + '" target="_blank" rel="noopener noreferrer" class="kn-btn kn-btn--primary">View Official Job & Apply ↗</a>';

    const notesSectionHtml = isAuth ? (
      '<div class="modal-notes-section">' +
        '<div class="modal-notes-title">' +
          '<span>📝 Private Notes (Only visible to you)</span>' +
          '<span id="notes-save-status" class="kn-text-muted" style="font-size:0.75rem;"></span>' +
        '</div>' +
        '<textarea id="modal-notes-input" class="modal-notes-textarea" placeholder="Add private notes (e.g. revise system design, interview rounds, contact info)...">' + escapeHtml(currentNotes) + '</textarea>' +
        '<div class="modal-notes-actions">' +
          '<button type="button" class="kn-btn kn-btn--secondary" id="btn-modal-clear-notes" style="font-size:0.8rem; padding:4px 10px;">Clear Note</button>' +
          '<button type="button" class="kn-btn kn-btn--primary" id="btn-modal-save-notes" style="font-size:0.8rem; padding:4px 10px;">Save Note</button>' +
        '</div>' +
      '</div>'
    ) : '';

    modalRoot.innerHTML = (
      '<div class="app-modal-backdrop" id="job-modal-backdrop">' +
        '<div class="app-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-job-title">' +
          '<div class="app-modal-header">' +
            '<div>' +
              '<span class="app-modal-company">' + company + ' · ' + (isClosed ? '<span class="vjc__closed-badge">⚠ Closed</span>' : '<span class="app-modal-verif-tag">✓ Verified Official</span>') + '</span>' +
              '<h2 class="app-modal-title" id="modal-job-title">' + title + '</h2>' +
            '</div>' +
            '<button type="button" class="app-modal-close" id="btn-close-job-modal" aria-label="Close">✕</button>' +
          '</div>' +
          '<div class="app-modal-body">' +
            closedBannerHtml +
            '<div class="modal-meta-grid">' +
              '<div class="modal-meta-card"><strong>Location</strong><span>📍 ' + location + '</span></div>' +
              '<div class="modal-meta-card"><strong>Workplace</strong><span>🏢 ' + workplace + '</span></div>' +
              '<div class="modal-meta-card"><strong>Freshness</strong><span>🟢 ' + freshnessState + ' (' + freshnessReason + ')</span></div>' +
              '<div class="modal-meta-card"><strong>Experience Level</strong><span>🎓 ' + expText + '</span></div>' +
            '</div>' +
            fitSectionHtml +
            assistantSectionHtml +
            '<div class="modal-section">' +
              '<h3 class="modal-section-title">🛡️ Official Verification Audit</h3>' +
              '<div class="modal-verif-box">' + verifListHtml + '</div>' +
            '</div>' +
            notesSectionHtml +
            '<div class="modal-section">' +
              '<h3 class="modal-section-title">📄 Job Description</h3>' +
              descHtml +
              reqHtml +
            '</div>' +
          '</div>' +
          '<div class="app-modal-footer">' +
            '<div class="vjc__actions-group">' +
              (isAuth ? '<button type="button" class="' + (isSaved ? 'vjc__btn-action vjc__btn-action--saved' : 'vjc__btn-action') + '" id="btn-modal-toggle-save">' + (isSaved ? '♥ Saved' : '♡ Save') + '</button>' : '') +
              (isAuth ? '<button type="button" class="' + (isApplied ? 'vjc__btn-action vjc__btn-action--applied' : 'vjc__btn-action') + '" id="btn-modal-toggle-apply">' + (isApplied ? '✓ Applied' : 'Mark as Applied') + '</button>' : '') +
              (isAuth ? '<button type="button" class="vjc__btn-action vjc__btn-action--dismiss" id="btn-modal-dismiss-job">⋯ Hide</button>' : '') +
            '</div>' +
            '<div style="display:flex; gap:8px;">' +
              '<button type="button" class="kn-btn kn-btn--secondary" id="btn-modal-dismiss">Close</button>' +
              applyButtonHtml +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    const newCloseBtn = document.getElementById('btn-close-job-modal');
    const newDismissBtn = document.getElementById('btn-modal-dismiss');
    const newBackdrop = document.getElementById('job-modal-backdrop');

    if (newCloseBtn) newCloseBtn.addEventListener('click', closeModal, { signal: abortController.signal });
    if (newDismissBtn) newDismissBtn.addEventListener('click', closeModal, { signal: abortController.signal });
    if (newBackdrop) {
      newBackdrop.addEventListener('click', (e) => {
        if (e.target === newBackdrop) closeModal();
      }, { signal: abortController.signal });
    }

    // Modal Save Toggle
    const modalSaveBtn = document.getElementById('btn-modal-toggle-save');
    if (modalSaveBtn) {
      modalSaveBtn.addEventListener('click', async () => {
        const curSaved = modalSaveBtn.classList.contains('vjc__btn-action--saved');
        modalSaveBtn.setAttribute('disabled', 'true');
        try {
          if (curSaved) {
            await apiClient.unsaveJob(jobId);
            modalSaveBtn.classList.remove('vjc__btn-action--saved');
            modalSaveBtn.textContent = '♡ Save';
            showToast('Job removed from saved list', 'info');
          } else {
            await apiClient.saveJob(jobId);
            modalSaveBtn.classList.add('vjc__btn-action--saved');
            modalSaveBtn.textContent = '♥ Saved';
            showToast('Job saved to your workspace!', 'success');
          }
          if (onStateChange) onStateChange('save', jobId, !curSaved);
        } catch (err) {
          showToast('Failed to update saved state', 'error');
        } finally {
          modalSaveBtn.removeAttribute('disabled');
        }
      }, { signal: abortController.signal });
    }

    // Modal Apply Toggle
    const modalApplyBtn = document.getElementById('btn-modal-toggle-apply');
    if (modalApplyBtn) {
      modalApplyBtn.addEventListener('click', async () => {
        const curApplied = modalApplyBtn.classList.contains('vjc__btn-action--applied');
        modalApplyBtn.setAttribute('disabled', 'true');
        try {
          if (curApplied) {
            await apiClient.unmarkJobApplied(jobId);
            modalApplyBtn.classList.remove('vjc__btn-action--applied');
            modalApplyBtn.textContent = 'Mark as Applied';
            showToast('Application tracking undone', 'info');
          } else {
            await apiClient.markJobApplied(jobId);
            modalApplyBtn.classList.add('vjc__btn-action--applied');
            modalApplyBtn.textContent = '✓ Applied';
            showToast('Job marked as applied! Tracked in workspace.', 'success');
          }
          if (onStateChange) onStateChange('apply', jobId, !curApplied);
        } catch (err) {
          showToast('Failed to update application state', 'error');
        } finally {
          modalApplyBtn.removeAttribute('disabled');
        }
      }, { signal: abortController.signal });
    }

    // Modal Dismiss Toggle
    const modalDismissJobBtn = document.getElementById('btn-modal-dismiss-job');
    if (modalDismissJobBtn) {
      modalDismissJobBtn.addEventListener('click', async () => {
        modalDismissJobBtn.setAttribute('disabled', 'true');
        try {
          await apiClient.dismissJob(jobId);
          showToast('Job hidden from feed.', 'info');
          closeModal();
          if (onStateChange) onStateChange('dismiss', jobId, true);
        } catch (err) {
          modalDismissJobBtn.removeAttribute('disabled');
          showToast('Failed to hide job', 'error');
        }
      }, { signal: abortController.signal });
    }

    // Modal Notes Handlers
    const saveNotesBtn = document.getElementById('btn-modal-save-notes');
    const clearNotesBtn = document.getElementById('btn-modal-clear-notes');
    const notesInput = document.getElementById('modal-notes-input') as HTMLTextAreaElement | null;
    const notesStatus = document.getElementById('notes-save-status');

    if (saveNotesBtn && notesInput) {
      saveNotesBtn.addEventListener('click', async () => {
        const text = notesInput.value.trim();
        saveNotesBtn.setAttribute('disabled', 'true');
        if (notesStatus) notesStatus.textContent = 'Saving...';
        try {
          if (typeof apiClient.setJobNotes === 'function') {
            await apiClient.setJobNotes(jobId, text);
          } else if (typeof apiClient.saveJobNote === 'function') {
            await apiClient.saveJobNote(jobId, text);
          }
          if (notesStatus) notesStatus.textContent = '✓ Saved';
          showToast('Private note saved', 'success');
          setTimeout(() => { if (notesStatus) notesStatus.textContent = ''; }, 2000);
          if (onStateChange) onStateChange('note', jobId, text);
        } catch (err) {
          showToast('Failed to save notes', 'error');
          if (notesStatus) notesStatus.textContent = 'Failed';
        } finally {
          saveNotesBtn.removeAttribute('disabled');
        }
      }, { signal: abortController.signal });
    }

    if (clearNotesBtn && notesInput) {
      clearNotesBtn.addEventListener('click', async () => {
        clearNotesBtn.setAttribute('disabled', 'true');
        try {
          if (typeof apiClient.deleteJobNotes === 'function') {
            await apiClient.deleteJobNotes(jobId);
          } else if (typeof apiClient.setJobNotes === 'function') {
            await apiClient.setJobNotes(jobId, '');
          } else if (typeof apiClient.saveJobNote === 'function') {
            await apiClient.saveJobNote(jobId, '');
          }
          notesInput.value = '';
          if (notesStatus) notesStatus.textContent = 'Cleared';
          showToast('Private note cleared', 'info');
          setTimeout(() => { if (notesStatus) notesStatus.textContent = ''; }, 2000);
          if (onStateChange) onStateChange('note', jobId, '');
        } catch (err) {
          showToast('Failed to delete notes', 'error');
        } finally {
          clearNotesBtn.removeAttribute('disabled');
        }
      }, { signal: abortController.signal });
    }

    // Phase 14 Application Assistant Event Listeners
    const statusSelect = document.getElementById('modal-app-status-select') as HTMLSelectElement | null;
    if (statusSelect) {
      statusSelect.addEventListener('change', async () => {
        const newStatus = statusSelect.value;
        statusSelect.setAttribute('disabled', 'true');
        try {
          await apiClient.setApplicationStatus(jobId, newStatus);
          showToast('Application status set to ' + newStatus, 'success');
          if (newStatus === 'APPLIED' && modalApplyBtn) {
            modalApplyBtn.classList.add('vjc__btn-action--applied');
            modalApplyBtn.textContent = '✓ Applied';
          }
          if (onStateChange) onStateChange('status', jobId, newStatus);
        } catch (err) {
          showToast('Failed to update status', 'error');
        } finally {
          statusSelect.removeAttribute('disabled');
        }
      }, { signal: abortController.signal });
    }

    const resumeSelect = document.getElementById('modal-resume-select') as HTMLSelectElement | null;
    if (resumeSelect) {
      resumeSelect.addEventListener('change', async () => {
        const resumeId = resumeSelect.value || null;
        resumeSelect.setAttribute('disabled', 'true');
        try {
          await apiClient.selectResumeForJob(jobId, resumeId);
          showToast('Resume version selected for this application', 'success');
        } catch (err) {
          showToast('Failed to select resume version', 'error');
        } finally {
          resumeSelect.removeAttribute('disabled');
        }
      }, { signal: abortController.signal });
    }

    // Checklist checkboxes
    function bindChecklistListeners(): void {
      const chks = document.querySelectorAll('.checklist-item-chk');
      const list = document.getElementById('modal-checklist-list');
      const progText = document.getElementById('checklist-progress-text');
      chks.forEach((chk) => {
        chk.addEventListener('change', async () => {
          const input = chk as HTMLInputElement;
          const isDone = input.checked;
          const row = input.closest('li');
          if (row) {
            if (isDone) row.classList.add('is-done');
            else row.classList.remove('is-done');
          }

          const updated: Array<{ id: string; text: string; done: boolean }> = [];
          const rows = list ? list.querySelectorAll('li[data-checklist-id]') : [];
          rows.forEach((r) => {
            const id = r.getAttribute('data-checklist-id');
            const c = r.querySelector('.checklist-item-chk') as HTMLInputElement | null;
            const t = r.querySelector('span');
            if (id && t) {
              updated.push({
                id,
                text: t.textContent?.trim() || '',
                done: c ? c.checked : false,
              });
            }
          });

          if (progText) {
            const doneCount = updated.filter((u) => u.done).length;
            progText.textContent = doneCount + '/' + updated.length + ' done';
          }

          try {
            await apiClient.setChecklist(jobId, updated);
          } catch (err) {
            showToast('Failed to save checklist state', 'error');
          }
        }, { signal: abortController.signal });
      });
    }
    bindChecklistListeners();

    // Add Checklist Item
    const addChecklistBtn = document.getElementById('btn-add-checklist-item');
    const addChecklistInput = document.getElementById('checklist-new-input') as HTMLInputElement | null;

    async function handleAddChecklistItem(): Promise<void> {
      if (!addChecklistInput) return;
      const text = addChecklistInput.value.trim();
      if (!text) return;
      if (text.length > 300) {
        showToast('Checklist task cannot exceed 300 characters', 'error');
        return;
      }
      const list = document.getElementById('modal-checklist-list');
      const rows = list ? list.querySelectorAll('li[data-checklist-id]') : [];
      if (rows.length >= 20) {
        showToast('Maximum 20 checklist tasks allowed per job', 'error');
        return;
      }

      const newItem = {
        id: 'item-' + Date.now(),
        text,
        done: false,
      };

      const currentItems: Array<{ id: string; text: string; done: boolean }> = [];
      rows.forEach((r) => {
        const id = r.getAttribute('data-checklist-id');
        const c = r.querySelector('.checklist-item-chk') as HTMLInputElement | null;
        const t = r.querySelector('span');
        if (id && t) {
          currentItems.push({ id, text: t.textContent?.trim() || '', done: c ? c.checked : false });
        }
      });
      currentItems.push(newItem);

      try {
        await apiClient.setChecklist(jobId, currentItems);
        addChecklistInput.value = '';
        const newLi = document.createElement('li');
        newLi.className = 'checklist-item-row';
        newLi.setAttribute('data-checklist-id', newItem.id);
        newLi.innerHTML =
          '<input type="checkbox" class="checklist-item-chk" data-item-id="' + escapeHtml(newItem.id) + '" />' +
          '<span>' + escapeHtml(newItem.text) + '</span>';
        if (list) list.appendChild(newLi);
        bindChecklistListeners();
        const progText = document.getElementById('checklist-progress-text');
        if (progText) {
          const doneCount = currentItems.filter((u) => u.done).length;
          progText.textContent = doneCount + '/' + currentItems.length + ' done';
        }
        showToast('Task added to application checklist', 'success');
      } catch (err) {
        showToast('Failed to add checklist task', 'error');
      }
    }

    if (addChecklistBtn) addChecklistBtn.addEventListener('click', handleAddChecklistItem, { signal: abortController.signal });
    if (addChecklistInput) {
      addChecklistInput.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void handleAddChecklistItem();
        }
      }, { signal: abortController.signal });
    }

    // Cover Letter Draft, Save, Clear
    const coverDraftBtn = document.getElementById('btn-generate-cover-draft');
    const coverInput = document.getElementById('modal-cover-letter-input') as HTMLTextAreaElement | null;
    const coverSaveBtn = document.getElementById('btn-save-cover-letter');
    const coverClearBtn = document.getElementById('btn-clear-cover-letter');
    const coverCharCount = document.getElementById('cover-letter-char-count');

    if (coverInput && coverCharCount) {
      coverInput.addEventListener('input', () => {
        coverCharCount.textContent = coverInput.value.length + '/5000';
      }, { signal: abortController.signal });
    }

    if (coverDraftBtn && coverInput) {
      coverDraftBtn.addEventListener('click', async () => {
        coverDraftBtn.setAttribute('disabled', 'true');
        coverDraftBtn.textContent = 'Generating...';
        try {
          const draftRes = await apiClient.generateCoverLetterDraft(jobId);
          if (draftRes && draftRes.coverLetter) {
            coverInput.value = draftRes.coverLetter;
            if (coverCharCount) coverCharCount.textContent = coverInput.value.length + '/5000';
            showToast('Tailored cover letter draft generated!', 'success');
          }
        } catch (err) {
          showToast('Failed to generate draft', 'error');
        } finally {
          coverDraftBtn.removeAttribute('disabled');
          coverDraftBtn.textContent = '⚡ Auto-Draft';
        }
      }, { signal: abortController.signal });
    }

    if (coverSaveBtn && coverInput) {
      coverSaveBtn.addEventListener('click', async () => {
        const text = coverInput.value.trim();
        coverSaveBtn.setAttribute('disabled', 'true');
        try {
          await apiClient.setCoverLetter(jobId, text);
          showToast('Cover letter saved to application record', 'success');
        } catch (err) {
          showToast('Failed to save cover letter', 'error');
        } finally {
          coverSaveBtn.removeAttribute('disabled');
        }
      }, { signal: abortController.signal });
    }

    if (coverClearBtn && coverInput) {
      coverClearBtn.addEventListener('click', async () => {
        coverClearBtn.setAttribute('disabled', 'true');
        try {
          await apiClient.deleteCoverLetter(jobId);
          coverInput.value = '';
          if (coverCharCount) coverCharCount.textContent = '0/5000';
          showToast('Cover letter cleared', 'info');
        } catch (err) {
          showToast('Failed to clear cover letter', 'error');
        } finally {
          coverClearBtn.removeAttribute('disabled');
        }
      }, { signal: abortController.signal });
    }

    // Reminder Set & Clear
    const reminderInput = document.getElementById('modal-reminder-input') as HTMLInputElement | null;
    const reminderSaveBtn = document.getElementById('btn-save-reminder');
    const reminderClearBtn = document.getElementById('btn-clear-reminder');

    if (reminderSaveBtn && reminderInput) {
      reminderSaveBtn.addEventListener('click', async () => {
        const dateVal = reminderInput.value;
        if (!dateVal) {
          showToast('Please select a date and time for follow-up', 'info');
          return;
        }
        reminderSaveBtn.setAttribute('disabled', 'true');
        try {
          const isoDate = new Date(dateVal).toISOString();
          await apiClient.setReminder(jobId, isoDate);
          showToast('Follow-up reminder set!', 'success');
        } catch (err) {
          showToast('Failed to set reminder', 'error');
        } finally {
          reminderSaveBtn.removeAttribute('disabled');
        }
      }, { signal: abortController.signal });
    }

    if (reminderClearBtn && reminderInput) {
      reminderClearBtn.addEventListener('click', async () => {
        reminderClearBtn.setAttribute('disabled', 'true');
        try {
          await apiClient.setReminder(jobId, null);
          reminderInput.value = '';
          showToast('Follow-up reminder cleared', 'info');
        } catch (err) {
          showToast('Failed to clear reminder', 'error');
        } finally {
          reminderClearBtn.removeAttribute('disabled');
        }
      }, { signal: abortController.signal });
    }

    // Interview Notes Save
    const interviewNotesInput = document.getElementById('modal-interview-notes-input') as HTMLTextAreaElement | null;
    const interviewNotesSaveBtn = document.getElementById('btn-save-interview-notes');
    const interviewNotesCharCount = document.getElementById('interview-notes-char-count');

    if (interviewNotesInput && interviewNotesCharCount) {
      interviewNotesInput.addEventListener('input', () => {
        interviewNotesCharCount.textContent = interviewNotesInput.value.length + '/10000';
      }, { signal: abortController.signal });
    }

    if (interviewNotesSaveBtn && interviewNotesInput) {
      interviewNotesSaveBtn.addEventListener('click', async () => {
        const text = interviewNotesInput.value.trim();
        interviewNotesSaveBtn.setAttribute('disabled', 'true');
        try {
          await apiClient.setInterviewNotes(jobId, text);
          showToast('Interview preparation notes saved!', 'success');
        } catch (err) {
          showToast('Failed to save interview notes', 'error');
        } finally {
          interviewNotesSaveBtn.removeAttribute('disabled');
        }
      }, { signal: abortController.signal });
    }
  } catch (err) {
    if (abortController.signal.aborted) return;
    closeModal();
    showToast('Failed to load job details', 'error');
  }
}
