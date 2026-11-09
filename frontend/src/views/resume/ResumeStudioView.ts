/**
 * RoleRadar — Career Evidence Profile & Resume Studio 2.0 View (Engine 3).
 *
 * Implements Blueprint Section 6:
 * - Master Career Evidence Vault (Claim synchronization, verification statuses)
 * - Truth-Preserving Resume Studio & Variant Tailoring
 * - Interactive Claim Provenance Inspector (bullet-to-evidence inspection)
 * - Local Machine Extraction (ATS) Simulator
 * - Multi-variant management without data duplication
 */

import {
  resumesService,
  type CareerProfile,
  type CandidateEvidence,
  type ResumeVariant,
  type ResumeBullet,
  type TailoredResumeResult,
  type ATSInspectionReport,
  type EvidenceType,
} from '../../services/api/resumes.service.js';
import { jobsService } from '../../services/api/jobs.service.js';
import { renderSidebar, loadingHtml } from '../dashboard/DashboardView.js';

export interface ResumeStudioViewOptions {
  container: HTMLElement;
  routePath?: string;
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  onNavigate?: (route: string) => void;
  onLogout?: () => void;
}

export interface ResumeStudioViewController {
  destroy: () => void;
}

function escapeHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function mountResumeStudioView(options: ResumeStudioViewOptions): ResumeStudioViewController {
  const {
    container,
    routePath = 'dashboard/resume',
    showToast = (msg: string) => { console.log(msg); },
    onLogout = () => { if (typeof window !== 'undefined') window.location.hash = '#/login'; },
  } = options;

  let isDestroyed = false;
  let activeTab: 'vault' | 'studio' | 'variants' = 'studio';
  let evidenceFilter: EvidenceType | 'ALL' = 'ALL';

  let careerProfile: CareerProfile | null = null;
  let evidenceList: CandidateEvidence[] = [];
  let variants: ResumeVariant[] = [];
  let selectedVariant: ResumeVariant | null = null;
  let verifiedJobs: Array<{ id: string; title: string; companyName: string }> = [];
  let selectedJobId: string = '';
  let selectedBullet: ResumeBullet | null = null;
  let atsReport: ATSInspectionReport | null = null;
  let isTailoring = false;
  let isInspectingATS = false;

  const boundListeners: Array<{ target: EventTarget; event: string; handler: EventListenerOrEventListenerObject }> = [];

  function addTrackedListener(target: EventTarget, event: string, handler: EventListenerOrEventListenerObject): void {
    target.addEventListener(event, handler);
    boundListeners.push({ target, event, handler });
  }

  // 1. Initial Shell Layout
  container.innerHTML = (
    '<div class="app-dashboard-layout">' +
      renderSidebar(routePath) +
      '<div class="app-dashboard-main">' +
        '<div class="rs-container">' +
          '<div class="rs-header">' +
            '<div class="rs-header-title">' +
              '<h1>Career Evidence & Resume Studio 2.0</h1>' +
              '<p>Truth-preserving resume tailoring with immutable evidence grounding and claim provenance.</p>' +
            '</div>' +
            '<div class="rs-header-actions" style="display:flex; gap:0.5rem;">' +
              '<button type="button" id="btn-sync-evidence" class="kn-btn kn-btn--secondary">🔄 Sync Evidence Vault</button>' +
              '<a href="#/dashboard/profile" class="kn-btn kn-btn--secondary">Candidate Profile</a>' +
            '</div>' +
          '</div>' +
          '<div class="rs-nav-tabs">' +
            '<button type="button" class="rs-nav-tab" data-tab="studio">🎯 Tailoring Studio</button>' +
            '<button type="button" class="rs-nav-tab" data-tab="vault">🏛 Master Evidence Vault</button>' +
            '<button type="button" class="rs-nav-tab" data-tab="variants">📑 Role Variants (<span id="variant-tab-count">0</span>)</button>' +
          '</div>' +
          '<div id="rs-tab-content-slot">' + loadingHtml('Loading Resume Studio 2.0...') + '</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );

  // Wire up sidebar Sign Out button
  const logoutBtn = container.querySelector<HTMLElement>('#btn-sidebar-logout');
  if (logoutBtn) {
    addTrackedListener(logoutBtn, 'click', () => onLogout());
  }

  const slotEl = container.querySelector<HTMLElement>('#rs-tab-content-slot')!;
  const syncBtn = container.querySelector<HTMLButtonElement>('#btn-sync-evidence');

  if (syncBtn) {
    addTrackedListener(syncBtn, 'click', async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = '⏳ Syncing...';
      try {
        const res = await resumesService.syncEvidence();
        showToast(`Vault synced: ${res.syncedCount} atomic claims up to date!`, 'success');
        await loadInitialData();
      } catch (err: any) {
        showToast(err?.message || 'Failed to sync evidence', 'error');
      } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = '🔄 Sync Evidence Vault';
      }
    });
  }

  // Tab Switching
  const tabButtons = container.querySelectorAll<HTMLButtonElement>('.rs-nav-tab');
  tabButtons.forEach((btn) => {
    addTrackedListener(btn, 'click', () => {
      const tab = btn.getAttribute('data-tab') as 'vault' | 'studio' | 'variants';
      if (tab && tab !== activeTab) {
        activeTab = tab;
        renderActiveTab();
      }
    });
  });

  function updateTabButtonsUi(): void {
    tabButtons.forEach((btn) => {
      const tab = btn.getAttribute('data-tab');
      if (tab === activeTab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // 2. Fetch Initial Studio Data
  async function loadInitialData(): Promise<void> {
    try {
      const [profile, evList, varList, jobsRes] = await Promise.all([
        resumesService.getCareerProfile(),
        resumesService.listEvidence(),
        resumesService.listResumeVariants(),
        jobsService.listVerifiedJobs().catch(() => ({ jobs: [] })),
      ]);

      if (isDestroyed) return;
      careerProfile = profile;
      evidenceList = evList;
      variants = varList;

      const vCountEl = container.querySelector<HTMLElement>('#variant-tab-count');
      if (vCountEl) vCountEl.textContent = String(variants.length);

      verifiedJobs = (jobsRes.jobs || []).map((j: any) => ({
        id: j.id,
        title: j.title,
        companyName: j.company?.name || 'Verified Employer',
      }));

      if (verifiedJobs.length > 0 && !selectedJobId) {
        selectedJobId = verifiedJobs[0].id;
      }

      if (variants.length > 0 && !selectedVariant) {
        const fullVariant = await resumesService.getResumeVariant(variants[0].id);
        selectedVariant = fullVariant;
        if (fullVariant.bullets && fullVariant.bullets.length > 0) {
          selectedBullet = fullVariant.bullets[0];
        }
      }

      renderActiveTab();
    } catch (err: any) {
      if (isDestroyed) return;
      slotEl.innerHTML = `<div class="kn-card" style="padding:2rem; text-align:center;"><p style="color:var(--color-danger,#ef4444);">Failed to load Resume Studio: ${escapeHtml(err.message)}</p></div>`;
    }
  }

  // 3. Tab Render Orchestrator
  function renderActiveTab(): void {
    if (isDestroyed || !slotEl) return;
    updateTabButtonsUi();

    if (activeTab === 'vault') {
      renderVaultTab();
    } else if (activeTab === 'studio') {
      renderStudioTab();
    } else if (activeTab === 'variants') {
      renderVariantsTab();
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TAB 1: Master Evidence Vault
  // ───────────────────────────────────────────────────────────────────────────
  function renderVaultTab(): void {
    const stats = careerProfile?.evidenceStats || {
      totalClaims: evidenceList.length,
      skillsCount: 0,
      projectsCount: 0,
      experiencesCount: 0,
      educationsCount: 0,
      certificationsCount: 0,
    };

    const filteredClaims = evidenceFilter === 'ALL'
      ? evidenceList
      : evidenceList.filter((e) => e.evidenceType === evidenceFilter);

    const filterPills = [
      { key: 'ALL', label: `All Claims (${evidenceList.length})` },
      { key: 'PROJECT', label: `Projects (${stats.projectsCount})` },
      { key: 'EXPERIENCE', label: `Work History (${stats.experiencesCount})` },
      { key: 'PROFILE_SKILL', label: `Skills (${stats.skillsCount})` },
      { key: 'EDUCATION', label: `Education (${stats.educationsCount})` },
    ];

    const pillsHtml = filterPills.map((p) => {
      const activeClass = evidenceFilter === p.key ? 'active' : '';
      return `<button type="button" class="kn-btn kn-btn--secondary btn-filter-ev ${activeClass}" data-filter="${p.key}" style="padding:4px 10px; font-size:0.8rem; margin-right:6px; margin-bottom:6px;">${escapeHtml(p.label)}</button>`;
    }).join('');

    const claimsHtml = filteredClaims.length > 0
      ? filteredClaims.map((c) => {
          const typeBadge = `<span class="rs-badge rs-badge-${c.evidenceType.toLowerCase().replace('_', '-')}">${escapeHtml(c.evidenceType)}</span>`;
          const statusBadge = `<span class="rs-badge rs-badge-verified">✓ ${escapeHtml(c.verifiedStatus)}</span>`;
          return (
            `<div class="rs-evidence-card">
              <div class="rs-evidence-main">
                <div style="display:flex; gap:0.5rem; align-items:center;">
                  ${typeBadge}
                  ${statusBadge}
                </div>
                <div class="rs-evidence-claim">${escapeHtml(c.claimText)}</div>
                <div class="rs-evidence-meta">
                  <span>ID: ${escapeHtml(c.id.slice(0, 8))}...</span>
                  <span>Recorded: ${new Date(c.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div>
                <button type="button" class="kn-btn kn-btn--secondary btn-delete-claim" data-claim-id="${escapeHtml(c.id)}" style="color:var(--color-danger,#ef4444); font-size:0.75rem; padding:3px 8px;">Delete</button>
              </div>
            </div>`
          );
        }).join('')
      : '<p class="kn-text-muted" style="text-align:center; padding:2rem;">No evidence claims found in this category. Click "Sync Evidence Vault" to import your skills and projects.</p>';

    slotEl.innerHTML = (
      `<div class="rs-vault-view">
        <div class="rs-stats-grid">
          <div class="rs-stat-card">
            <div class="label">Total Evidence Units</div>
            <div class="value">${stats.totalClaims}</div>
          </div>
          <div class="rs-stat-card">
            <div class="label">Project Proofs</div>
            <div class="value">${stats.projectsCount}</div>
          </div>
          <div class="rs-stat-card">
            <div class="label">Work Experiences</div>
            <div class="value">${stats.experiencesCount}</div>
          </div>
          <div class="rs-stat-card">
            <div class="label">Verified Skills</div>
            <div class="value">${stats.skillsCount}</div>
          </div>
        </div>

        <div class="kn-card" style="padding:1.5rem; margin-bottom:1.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:0.5rem;">
            <div style="display:flex; flex-wrap:wrap;">${pillsHtml}</div>
            <button type="button" id="btn-open-add-claim" class="kn-btn kn-btn--primary" style="font-size:0.85rem;">+ Add Custom Claim</button>
          </div>
          <div class="rs-evidence-list">
            ${claimsHtml}
          </div>
        </div>

        <!-- Add Custom Claim Modal/Container -->
        <div id="add-claim-form-container" style="display:none; margin-top:1rem;" class="kn-card">
          <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:1rem;">Add Custom Evidence Claim</h3>
          <div style="display:grid; grid-template-columns:1fr 2fr; gap:1rem; margin-bottom:1rem;">
            <div>
              <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:4px;">Evidence Type</label>
              <select id="input-claim-type" class="kn-input" style="width:100%;">
                <option value="PROJECT">PROJECT</option>
                <option value="EXPERIENCE">EXPERIENCE</option>
                <option value="PROFILE_SKILL">PROFILE_SKILL</option>
                <option value="EDUCATION">EDUCATION</option>
                <option value="CERTIFICATION">CERTIFICATION</option>
              </select>
            </div>
            <div>
              <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:4px;">Verification Status</label>
              <select id="input-claim-status" class="kn-input" style="width:100%;">
                <option value="SELF_REPORTED">SELF_REPORTED</option>
                <option value="PROJECT_SUPPORTED">PROJECT_SUPPORTED</option>
                <option value="DOCUMENT_SUPPORTED">DOCUMENT_SUPPORTED</option>
                <option value="EXTERNALLY_VERIFIED">EXTERNALLY_VERIFIED</option>
              </select>
            </div>
          </div>
          <div style="margin-bottom:1rem;">
            <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:4px;">Claim Statement / Achievement</label>
            <textarea id="input-claim-text" class="kn-input" rows="2" placeholder="e.g. Architected Redis caching layer reducing API latency by 45%" style="width:100%;"></textarea>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
            <button type="button" id="btn-cancel-claim" class="kn-btn kn-btn--secondary">Cancel</button>
            <button type="button" id="btn-submit-claim" class="kn-btn kn-btn--primary">Save Claim to Vault</button>
          </div>
        </div>
      </div>`
    );

    // Bind Vault events
    slotEl.querySelectorAll<HTMLButtonElement>('.btn-filter-ev').forEach((btn) => {
      addTrackedListener(btn, 'click', () => {
        evidenceFilter = btn.getAttribute('data-filter') as EvidenceType | 'ALL';
        renderVaultTab();
      });
    });

    slotEl.querySelectorAll<HTMLButtonElement>('.btn-delete-claim').forEach((btn) => {
      addTrackedListener(btn, 'click', async () => {
        const id = btn.getAttribute('data-claim-id');
        if (!id) return;
        if (!window.confirm('Delete this claim from your Master Evidence Vault?')) return;
        try {
          await resumesService.deleteEvidence(id);
          showToast('Claim deleted from vault', 'success');
          evidenceList = evidenceList.filter((e) => e.id !== id);
          renderVaultTab();
        } catch (err: any) {
          showToast(err.message || 'Failed to delete claim', 'error');
        }
      });
    });

    const openAddClaimBtn = slotEl.querySelector<HTMLButtonElement>('#btn-open-add-claim');
    const claimFormBox = slotEl.querySelector<HTMLElement>('#add-claim-form-container');
    const cancelClaimBtn = slotEl.querySelector<HTMLButtonElement>('#btn-cancel-claim');
    const submitClaimBtn = slotEl.querySelector<HTMLButtonElement>('#btn-submit-claim');

    if (openAddClaimBtn && claimFormBox) {
      addTrackedListener(openAddClaimBtn, 'click', () => {
        claimFormBox.style.display = claimFormBox.style.display === 'none' ? 'block' : 'none';
      });
    }

    if (cancelClaimBtn && claimFormBox) {
      addTrackedListener(cancelClaimBtn, 'click', () => {
        claimFormBox.style.display = 'none';
      });
    }

    if (submitClaimBtn && claimFormBox) {
      addTrackedListener(submitClaimBtn, 'click', async () => {
        const typeEl = slotEl.querySelector<HTMLSelectElement>('#input-claim-type');
        const statusEl = slotEl.querySelector<HTMLSelectElement>('#input-claim-status');
        const textEl = slotEl.querySelector<HTMLTextAreaElement>('#input-claim-text');

        if (!textEl || !textEl.value.trim()) {
          showToast('Please enter claim statement', 'error');
          return;
        }

        submitClaimBtn.disabled = true;
        try {
          const created = await resumesService.addEvidence({
            evidenceType: typeEl ? (typeEl.value as EvidenceType) : 'PROJECT',
            verifiedStatus: statusEl ? (statusEl.value as any) : 'SELF_REPORTED',
            claimText: textEl.value.trim(),
          });
          evidenceList.unshift(created);
          showToast('Claim added to Master Evidence Vault', 'success');
          renderVaultTab();
        } catch (err: any) {
          showToast(err.message || 'Failed to add claim', 'error');
          submitClaimBtn.disabled = false;
        }
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TAB 2: Resume Studio & Tailoring
  // ───────────────────────────────────────────────────────────────────────────
  function renderStudioTab(): void {
    const jobOptionsHtml = verifiedJobs.length > 0
      ? verifiedJobs.map((j) => `<option value="${escapeHtml(j.id)}" ${j.id === selectedJobId ? 'selected' : ''}>${escapeHtml(j.title)} · ${escapeHtml(j.companyName)}</option>`).join('')
      : '<option value="">No verified jobs found</option>';

    const activeBullets = selectedVariant?.bullets || [];
    const truthfulnessScore = selectedVariant?.truthfulnessScore ?? 100;

    const bulletsListHtml = activeBullets.length > 0
      ? activeBullets.map((b) => {
          const isSelected = selectedBullet && selectedBullet.id === b.id;
          const badgeClass = b.provenanceState === 'PROVENANCE_BACKED' ? 'rs-badge-provenance' : 'rs-badge-unlinked';
          const badgeText = b.provenanceState === 'PROVENANCE_BACKED' ? '🛡 PROVENANCE BACKED' : '⚠ UNLINKED CLAIM';

          return (
            `<div class="rs-bullet-item ${isSelected ? 'selected' : ''}" data-bullet-id="${escapeHtml(b.id)}">
              <div class="rs-bullet-text">${escapeHtml(b.bulletText)}</div>
              <div class="rs-bullet-footer">
                <span class="rs-badge ${badgeClass}">${badgeText}</span>
                <button type="button" class="btn-delete-bullet" data-bullet-id="${escapeHtml(b.id)}" style="background:none; border:none; color:#ef4444; font-size:0.75rem; cursor:pointer;">Delete</button>
              </div>
            </div>`
          );
        }).join('')
      : '<p class="kn-text-muted" style="text-align:center; padding:2rem;">No bullets yet in this resume variant. Select a target job and click "Tailor Resume" to generate truth-preserving bullets.</p>';

    // Selected Bullet Provenance Inspector Box
    let provenanceInspectorHtml = '';
    if (selectedBullet) {
      if (selectedBullet.provenanceState === 'PROVENANCE_BACKED') {
        provenanceInspectorHtml = (
          `<div class="rs-provenance-inspector-box">
            <h4 style="font-size:0.95rem; font-weight:700; color:#065f46; margin:0 0 0.5rem 0;">🛡 Claim Provenance Backed</h4>
            <p style="font-size:0.85rem; color:#1e293b; margin:0 0 0.5rem 0;"><strong>Grounding Evidence:</strong> ${escapeHtml(selectedBullet.evidenceClaimText || 'Linked to Master Evidence Vault')}</p>
            <div style="font-size:0.8rem; color:#64748b;">
              <span>Category: <strong>${escapeHtml(selectedBullet.evidenceType || 'Profile Asset')}</strong></span> · 
              <span>Zero Fact Invention Passed</span>
            </div>
          </div>`
        );
      } else {
        provenanceInspectorHtml = (
          `<div class="rs-provenance-inspector-box unlinked">
            <h4 style="font-size:0.95rem; font-weight:700; color:#92400e; margin:0 0 0.5rem 0;">⚠ Unlinked Synthesized Claim</h4>
            <p style="font-size:0.85rem; color:#1e293b; margin:0 0 0.5rem 0;">This bullet contains general career synthesis or headline targeting without a 1:1 backing claim in your Master Evidence Vault.</p>
            <p style="font-size:0.8rem; color:#64748b; margin:0;">Add concrete project or experience claims to upgrade this bullet to Provenance-Backed.</p>
          </div>`
        );
      }
    }

    // ATS Simulation Panel HTML
    let atsContentHtml = '';
    if (atsReport) {
      atsContentHtml = (
        `<div class="rs-ats-panel-results">
          <div class="rs-ats-score-banner">
            <div>
              <h3>Enterprise ATS Match Score</h3>
              <p style="font-size:0.85rem; opacity:0.85; margin:0;">Simulated screening based on Parsing Quality, Keyword Density, and Truth Preservation</p>
            </div>
            <div class="rs-ats-score-num">${atsReport.overallScore}%</div>
          </div>

          <!-- Dimension 1: Parsing Quality -->
          <div class="rs-ats-dimension-card">
            <h4>
              <span>1. Parsing Quality (${atsReport.parsingQuality.score}%)</span>
              <span class="rs-badge rs-badge-verified">${atsReport.parsingQuality.status}</span>
            </h4>
            <div style="font-size:0.85rem; color:#475569;">
              <div>Detected Sections: ${atsReport.parsingQuality.detectedSections.map((s) => s.standardCategory).join(', ') || 'Standard headers'}</div>
              ${atsReport.parsingQuality.missingSections.length > 0 ? `<div style="color:#b91c1c; margin-top:4px;">Missing Standard Sections: ${atsReport.parsingQuality.missingSections.join(', ')}</div>` : ''}
            </div>
          </div>

          <!-- Dimension 2: Role Relevance -->
          <div class="rs-ats-dimension-card">
            <h4>
              <span>2. Role Relevance (${atsReport.roleRelevance.score}%)</span>
              <span class="rs-badge rs-badge-verified">${atsReport.roleRelevance.status}</span>
            </h4>
            <div style="font-size:0.85rem; color:#475569;">
              <div>Keyword Density: <strong>${atsReport.roleRelevance.keywordDensityPercent}%</strong> (Industry Target: 2.0% - 4.5%)</div>
              <div class="rs-keyword-cloud">
                ${atsReport.roleRelevance.matchedKeywords.slice(0, 10).map((k) => `<span class="rs-keyword-pill">✓ ${escapeHtml(k)}</span>`).join('')}
                ${atsReport.roleRelevance.missingKeywords.slice(0, 6).map((k) => `<span class="rs-keyword-pill missing">✕ ${escapeHtml(k)}</span>`).join('')}
              </div>
            </div>
          </div>

          <!-- Dimension 3: Evidence Integrity -->
          <div class="rs-ats-dimension-card">
            <h4>
              <span>3. Evidence Integrity (${atsReport.evidenceIntegrity.score}%)</span>
              <span class="rs-badge rs-badge-provenance">${atsReport.evidenceIntegrity.status}</span>
            </h4>
            <div style="font-size:0.85rem; color:#475569;">
              <div>Provenance Backed: <strong>${atsReport.evidenceIntegrity.provenanceBackedCount}</strong> / Total Bullets: <strong>${atsReport.evidenceIntegrity.totalClaimsCount}</strong></div>
              ${atsReport.evidenceIntegrity.unlinkedCount > 0 ? `<div style="color:#b45309; margin-top:4px;">${atsReport.evidenceIntegrity.unlinkedCount} unlinked bullet(s) detected.</div>` : ''}
            </div>
          </div>
        </div>`
      );
    } else {
      atsContentHtml = (
        `<div style="text-align:center; padding:2rem; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:6px;">
          <p class="kn-text-muted" style="margin-bottom:1rem;">Simulate enterprise ATS parsers across Parsing Quality, Role Relevance, and Evidence Integrity.</p>
          <button type="button" id="btn-run-ats-sim" class="kn-btn kn-btn--primary" ${activeBullets.length === 0 ? 'disabled' : ''}>🔍 Run ATS Parsing Simulation</button>
        </div>`
      );
    }

    slotEl.innerHTML = (
      `<div class="rs-studio-view">
        <!-- Top Toolbar: Job Tailoring Form -->
        <div class="kn-card" style="padding:1.25rem 1.5rem; margin-bottom:1.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
            <div style="flex:1; min-width:280px;">
              <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:4px;">Target Verified Job Posting</label>
              <select id="select-target-job" class="kn-input" style="width:100%;">
                ${jobOptionsHtml}
              </select>
            </div>
            <div style="flex:1; min-width:220px;">
              <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:4px;">Role Variant Name</label>
              <input type="text" id="input-variant-name" class="kn-input" placeholder="e.g. Software Engineer Variant" style="width:100%;" value="${escapeHtml(selectedVariant?.variantName || '')}" />
            </div>
            <div style="align-self:flex-end;">
              <button type="button" id="btn-tailor-resume" class="kn-btn kn-btn--primary" ${isTailoring ? 'disabled' : ''} style="height:38px;">
                ${isTailoring ? '⏳ Tailoring Resume...' : '🎯 Tailor Resume for Job'}
              </button>
            </div>
          </div>
        </div>

        <!-- Studio Two-Column Grid -->
        <div class="rs-studio-grid">
          <!-- Left Column: Active Bullets -->
          <div class="rs-panel">
            <div class="rs-panel-header">
              <div>
                <h2>${escapeHtml(selectedVariant?.variantName || 'Tailored Resume Bullets')}</h2>
                <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">Click any bullet to inspect its claim provenance</div>
              </div>
              <div style="text-align:right;">
                <span class="rs-badge rs-badge-provenance" style="font-size:0.85rem;">🛡 ${truthfulnessScore}% Truth-Preserved</span>
              </div>
            </div>

            <div class="rs-bullets-container">
              ${bulletsListHtml}
            </div>

            <!-- Add Manual Bullet -->
            <div style="margin-top:1.25rem; padding-top:1rem; border-top:1px solid #e2e8f0;">
              <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:4px;">Add Bullet to Resume</label>
              <div style="display:flex; gap:0.5rem;">
                <input type="text" id="input-add-bullet" class="kn-input" placeholder="Enter bullet text..." style="flex:1;" />
                <button type="button" id="btn-add-bullet" class="kn-btn kn-btn--secondary" ${!selectedVariant ? 'disabled' : ''}>Add</button>
              </div>
            </div>
          </div>

          <!-- Right Column: Claim Provenance & ATS Inspection -->
          <div class="rs-panel">
            <div class="rs-panel-header">
              <h2>Claim Provenance Inspector</h2>
              ${atsReport ? '<button type="button" id="btn-re-run-ats" class="kn-btn kn-btn--secondary" style="font-size:0.75rem; padding:2px 8px;">Re-run ATS Audit</button>' : ''}
            </div>

            ${provenanceInspectorHtml}

            <div style="margin-top:1.5rem;">
              <h3 style="font-size:1.05rem; font-weight:700; color:#0f172a; margin-bottom:0.75rem;">Machine Extraction (ATS) Audit</h3>
              ${atsContentHtml}
            </div>
          </div>
        </div>
      </div>`
    );

    // Bind Studio Events
    const jobSelect = slotEl.querySelector<HTMLSelectElement>('#select-target-job');
    if (jobSelect) {
      addTrackedListener(jobSelect, 'change', () => {
        selectedJobId = jobSelect.value;
      });
    }

    const tailorBtn = slotEl.querySelector<HTMLButtonElement>('#btn-tailor-resume');
    if (tailorBtn) {
      addTrackedListener(tailorBtn, 'click', async () => {
        if (!selectedJobId) {
          showToast('Please select a target job posting', 'error');
          return;
        }

        const variantNameInput = slotEl.querySelector<HTMLInputElement>('#input-variant-name');
        const variantName = variantNameInput?.value.trim() || undefined;

        isTailoring = true;
        tailorBtn.disabled = true;
        tailorBtn.textContent = '⏳ Tailoring Resume...';

        try {
          const res = await resumesService.tailorResume({
            jobId: selectedJobId,
            variantName,
          });

          showToast(`Resume tailored: ${res.truthfulnessScore}% truth-preserved (${res.provenanceBackedCount} verified bullets)!`, 'success');
          variants = await resumesService.listResumeVariants();
          selectedVariant = await resumesService.getResumeVariant(res.id);
          if (selectedVariant.bullets && selectedVariant.bullets.length > 0) {
            selectedBullet = selectedVariant.bullets[0];
          }
          atsReport = null; // reset ATS inspection for new variant
          renderStudioTab();
        } catch (err: any) {
          showToast(err.message || 'Failed to tailor resume', 'error');
        } finally {
          isTailoring = false;
        }
      });
    }

    // Bullet Click for Provenance Inspection
    slotEl.querySelectorAll<HTMLElement>('.rs-bullet-item').forEach((item) => {
      addTrackedListener(item, 'click', (e: Event) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('btn-delete-bullet')) return;

        const bulletId = item.getAttribute('data-bullet-id');
        const b = selectedVariant?.bullets?.find((x) => x.id === bulletId);
        if (b) {
          selectedBullet = b;
          renderStudioTab();
        }
      });
    });

    // Delete Bullet
    slotEl.querySelectorAll<HTMLButtonElement>('.btn-delete-bullet').forEach((btn) => {
      addTrackedListener(btn, 'click', async () => {
        const bulletId = btn.getAttribute('data-bullet-id');
        if (!selectedVariant || !bulletId) return;

        try {
          await resumesService.deleteResumeBullet(selectedVariant.id, bulletId);
          showToast('Bullet removed from variant', 'success');
          selectedVariant = await resumesService.getResumeVariant(selectedVariant.id);
          selectedBullet = selectedVariant.bullets && selectedVariant.bullets.length > 0 ? selectedVariant.bullets[0] : null;
          renderStudioTab();
        } catch (err: any) {
          showToast(err.message || 'Failed to delete bullet', 'error');
        }
      });
    });

    // Add Bullet
    const addBulletInput = slotEl.querySelector<HTMLInputElement>('#input-add-bullet');
    const addBulletBtn = slotEl.querySelector<HTMLButtonElement>('#btn-add-bullet');
    if (addBulletBtn && addBulletInput && selectedVariant) {
      addTrackedListener(addBulletBtn, 'click', async () => {
        const text = addBulletInput.value.trim();
        if (!text) return;

        addBulletBtn.disabled = true;
        try {
          await resumesService.addResumeBullet(selectedVariant!.id, { bulletText: text });
          showToast('Bullet added', 'success');
          selectedVariant = await resumesService.getResumeVariant(selectedVariant!.id);
          renderStudioTab();
        } catch (err: any) {
          showToast(err.message || 'Failed to add bullet', 'error');
          addBulletBtn.disabled = false;
        }
      });
    }

    // Run ATS Simulation
    const runAtsBtn = slotEl.querySelector<HTMLButtonElement>('#btn-run-ats-sim') || slotEl.querySelector<HTMLButtonElement>('#btn-re-run-ats');
    if (runAtsBtn && selectedVariant) {
      addTrackedListener(runAtsBtn, 'click', async () => {
        runAtsBtn.disabled = true;
        runAtsBtn.textContent = '⏳ Simulating ATS Extraction...';
        try {
          const report = await resumesService.inspectATSResume({
            resumeId: selectedVariant!.id,
            targetJobId: selectedJobId || undefined,
          });
          atsReport = report;
          showToast(`ATS Simulation Complete: Score ${report.overallScore}%`, 'success');
          renderStudioTab();
        } catch (err: any) {
          showToast(err.message || 'ATS simulation failed', 'error');
          runAtsBtn.disabled = false;
        }
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TAB 3: Role Variants
  // ───────────────────────────────────────────────────────────────────────────
  function renderVariantsTab(): void {
    const variantsHtml = variants.length > 0
      ? variants.map((v) => {
          const isCurrent = selectedVariant && selectedVariant.id === v.id;
          return (
            `<div class="kn-card" style="padding:1.25rem; margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <strong style="font-size:1.1rem; color:#0f172a;">${escapeHtml(v.variantName)}</strong>
                  ${v.isMaster ? '<span class="rs-badge rs-badge-verified">Master Document</span>' : ''}
                  ${isCurrent ? '<span class="rs-badge rs-badge-provenance">Active in Studio</span>' : ''}
                </div>
                <div style="font-size:0.85rem; color:#64748b; margin-top:4px;">
                  Created: ${new Date(v.createdAt).toLocaleDateString()} · Updated: ${new Date(v.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <div style="display:flex; gap:0.5rem;">
                <button type="button" class="kn-btn kn-btn--primary btn-open-variant" data-variant-id="${escapeHtml(v.id)}" style="font-size:0.85rem;">Open in Studio</button>
                <button type="button" class="kn-btn kn-btn--secondary btn-delete-variant" data-variant-id="${escapeHtml(v.id)}" style="color:var(--color-danger,#ef4444); font-size:0.85rem;">Delete</button>
              </div>
            </div>`
          );
        }).join('')
      : '<p class="kn-text-muted" style="text-align:center; padding:2rem;">No role variants created yet. Open the Tailoring Studio to generate your first job-tailored variant!</p>';

    slotEl.innerHTML = (
      `<div class="rs-variants-view">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
          <div>
            <h2 style="font-size:1.25rem; font-weight:700; margin:0 0 4px 0;">Your Tailored Resume Variants</h2>
            <p style="color:#64748b; font-size:0.9rem; margin:0;">Maintain role-specific resume documents without duplicating candidate profile data.</p>
          </div>
          <button type="button" id="btn-goto-studio" class="kn-btn kn-btn--primary">+ Tailor New Variant</button>
        </div>
        <div>
          ${variantsHtml}
        </div>
      </div>`
    );

    // Bind Variant Events
    const gotoStudioBtn = slotEl.querySelector<HTMLButtonElement>('#btn-goto-studio');
    if (gotoStudioBtn) {
      addTrackedListener(gotoStudioBtn, 'click', () => {
        activeTab = 'studio';
        renderActiveTab();
      });
    }

    slotEl.querySelectorAll<HTMLButtonElement>('.btn-open-variant').forEach((btn) => {
      addTrackedListener(btn, 'click', async () => {
        const vId = btn.getAttribute('data-variant-id');
        if (!vId) return;
        try {
          selectedVariant = await resumesService.getResumeVariant(vId);
          selectedBullet = selectedVariant.bullets && selectedVariant.bullets.length > 0 ? selectedVariant.bullets[0] : null;
          atsReport = null;
          activeTab = 'studio';
          renderActiveTab();
        } catch (err: any) {
          showToast(err.message || 'Failed to open variant', 'error');
        }
      });
    });

    slotEl.querySelectorAll<HTMLButtonElement>('.btn-delete-variant').forEach((btn) => {
      addTrackedListener(btn, 'click', async () => {
        const vId = btn.getAttribute('data-variant-id');
        if (!vId) return;
        if (!window.confirm('Delete this resume variant?')) return;
        try {
          await resumesService.deleteResumeVariant(vId);
          showToast('Resume variant deleted', 'success');
          variants = variants.filter((x) => x.id !== vId);
          if (selectedVariant && selectedVariant.id === vId) {
            selectedVariant = null;
            selectedBullet = null;
          }
          renderVariantsTab();
        } catch (err: any) {
          showToast(err.message || 'Failed to delete variant', 'error');
        }
      });
    });
  }

  // Load Initial Data
  void loadInitialData();

  // 4. Teardown Lifecycle
  return {
    destroy: () => {
      if (isDestroyed) return;
      isDestroyed = true;
      for (const { target, event, handler } of boundListeners) {
        target.removeEventListener(event, handler);
      }
      boundListeners.length = 0;
    },
  };
}
