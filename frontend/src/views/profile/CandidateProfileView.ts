/**
 * RoleRadar Candidate Profile & Resume Intelligence View.
 *
 * Encapsulates candidate profile data rendering (#/dashboard/profile),
 * completeness score & actionable optimization tips, parsed skill chips,
 * education, experience, portfolio projects, resume uploading (.pdf, .docx, .txt),
 * resume activation and deletion with strict lifecycle management.
 */

import {
  profileService,
  type CandidateProfile,
  type Resume,
  type ProfileCompleteness,
} from '../../services/api/index.js';
import {
  renderSidebar,
  loadingHtml,
} from '../dashboard/DashboardView.js';

export interface CandidateProfileViewOptions {
  container: HTMLElement;
  routePath?: string;
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  onNavigate?: (route: string) => void;
  onLogout?: () => void;
}

export interface CandidateProfileViewController {
  destroy: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML & Formatting Helpers
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main View Mount Function
// ─────────────────────────────────────────────────────────────────────────────

export function mountCandidateProfileView(options: CandidateProfileViewOptions): CandidateProfileViewController {
  const {
    container,
    routePath = 'dashboard/profile',
    showToast = (msg: string) => { console.log(msg); },
    onLogout = () => { if (typeof window !== 'undefined') window.location.hash = '#/login'; },
  } = options;

  let isDestroyed = false;
  let isFetching = false;
  const boundListeners: Array<{ target: EventTarget; event: string; handler: EventListenerOrEventListenerObject }> = [];

  function addTrackedListener(target: EventTarget, event: string, handler: EventListenerOrEventListenerObject): void {
    target.addEventListener(event, handler);
    boundListeners.push({ target, event, handler });
  }

  // Initial Layout Rendering
  container.innerHTML = (
    '<div class="app-dashboard-layout">' +
      renderSidebar(routePath) +
      '<div class="app-dashboard-main">' +
        '<div class="app-profile-view">' +
          '<div class="cpp__header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">' +
            '<div>' +
              '<h1 class="kn-heading-1">Candidate Profile & Resumes</h1>' +
              '<p class="kn-text-muted" style="margin-top:4px;">Structured career intelligence extracted from your verified resumes and credentials.</p>' +
            '</div>' +
            '<button type="button" id="btn-refresh-profile" class="kn-btn kn-btn--secondary">🔄 Refresh</button>' +
          '</div>' +
          '<div id="profile-content-slot">' + loadingHtml('Loading candidate profile and resumes...') + '</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );

  // Wire up sidebar Sign Out button
  const logoutBtn = container.querySelector<HTMLElement>('#btn-sidebar-logout');
  if (logoutBtn) {
    addTrackedListener(logoutBtn, 'click', () => {
      onLogout();
    });
  }

  const slotEl = container.querySelector<HTMLElement>('#profile-content-slot');
  const refreshBtn = container.querySelector<HTMLElement>('#btn-refresh-profile');

  // ───────────────────────────────────────────────────────────────────────────
  // Helper: Bind Profile Actions (Resume Upload, Activation, Deletion)
  // ───────────────────────────────────────────────────────────────────────────
  const bindProfileEvents = (scopeContainer: HTMLElement): void => {
    if (!scopeContainer || isDestroyed) return;

    // Upload button and hidden file input
    const browseBtn = scopeContainer.querySelector<HTMLButtonElement>('#btn-browse-resume');
    const fileInput = scopeContainer.querySelector<HTMLInputElement>('#resume-file-input');

    if (browseBtn && fileInput) {
      addTrackedListener(browseBtn, 'click', () => {
        fileInput.click();
      });

      addTrackedListener(fileInput, 'change', (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files && target.files[0];
        if (!file || isDestroyed) return;

        browseBtn.disabled = true;
        browseBtn.textContent = '⏳ Parsing Resume...';

        const reader = new FileReader();
        reader.onload = async () => {
          if (isDestroyed) return;
          try {
            const content = reader.result;
            await profileService.uploadResume({
              filename: file.name,
              content: typeof content === 'string' ? content : '',
              mimeType: file.type || 'text/plain',
            });
            if (isDestroyed) return;

            showToast('Resume uploaded and parsed successfully!', 'success');
            void loadProfileData();
          } catch (err: any) {
            if (isDestroyed) return;
            showToast(err?.message || 'Failed to upload resume', 'error');
            browseBtn.disabled = false;
            browseBtn.textContent = '📤 Upload Resume (.pdf, .docx, .txt)';
          }
        };

        reader.readAsText(file);
      });
    }

    // Activate Resume Buttons
    scopeContainer.querySelectorAll<HTMLButtonElement>('.btn-activate-resume').forEach((btn) => {
      const handleActivate = async () => {
        const rId = btn.getAttribute('data-resume-id');
        if (!rId || isDestroyed) return;

        btn.disabled = true;
        try {
          await profileService.activateResume(rId);
          if (isDestroyed) return;

          showToast('Active resume updated', 'success');
          void loadProfileData();
        } catch (err: any) {
          if (isDestroyed) return;
          showToast(err?.message || 'Failed to activate resume', 'error');
          btn.disabled = false;
        }
      };

      addTrackedListener(btn, 'click', handleActivate);
    });

    // Delete Resume Buttons
    scopeContainer.querySelectorAll<HTMLButtonElement>('.btn-delete-resume').forEach((btn) => {
      const handleDelete = async () => {
        const rId = btn.getAttribute('data-resume-id');
        if (!rId || isDestroyed) return;

        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
          if (!window.confirm('Are you sure you want to delete this resume?')) return;
        }

        btn.disabled = true;
        try {
          await profileService.deleteResume(rId);
          if (isDestroyed) return;

          showToast('Resume deleted', 'success');
          void loadProfileData();
        } catch (err: any) {
          if (isDestroyed) return;
          showToast(err?.message || 'Failed to delete resume', 'error');
          btn.disabled = false;
        }
      };

      addTrackedListener(btn, 'click', handleDelete);
    });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Data Fetching and Layout Construction
  // ───────────────────────────────────────────────────────────────────────────
  const loadProfileData = async (): Promise<void> => {
    if (isFetching || isDestroyed || !slotEl) return;
    isFetching = true;

    try {
      slotEl.innerHTML = loadingHtml('Loading candidate profile and resumes...');

      const [profile, resumes, completeness]: [CandidateProfile | null, Resume[], ProfileCompleteness | null] = await Promise.all([
        profileService.getCandidateProfile(),
        profileService.listResumes(),
        profileService.getProfileCompleteness().catch(() => null),
      ]);

      if (isDestroyed) return;

      const score = completeness ? completeness.score : (profile ? profile.completenessScore ?? 0 : 0);
      const tips = completeness && completeness.actionableTips ? completeness.actionableTips : [];

      const tipsHtml = tips.length > 0
        ? '<ul class="profile-tips-list">' + tips.map((t) => '<li>⚡ ' + escapeHtml(t) + '</li>').join('') + '</ul>'
        : '<p class="kn-text-muted" style="color:var(--color-success,#10b981);">✓ Your candidate profile is 100% complete and fully optimized for discovery!</p>';

      const resumesListHtml = resumes.length > 0
        ? resumes.map((r) => {
            const sizeKb = Math.round(r.fileSize / 1024);
            const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '';
            const activeBadge = r.isActive
              ? '<span class="resume-badge resume-badge--active">✓ Active</span>'
              : '<button type="button" class="kn-btn kn-btn--secondary btn-activate-resume" data-resume-id="' + escapeHtml(r.id) + '" style="font-size:0.75rem; padding:2px 8px;">Make Active</button>';

            return (
              '<div class="resume-item-card">' +
                '<div class="resume-item-info">' +
                  '<span class="resume-item-icon">📄</span>' +
                  '<div>' +
                    '<strong class="resume-item-name">' + escapeHtml(r.filename) + '</strong>' +
                    '<div class="resume-item-meta">' + sizeKb + ' KB' + (dateStr ? ' · Uploaded ' + dateStr : '') + '</div>' +
                  '</div>' +
                '</div>' +
                '<div class="resume-item-actions">' +
                  activeBadge +
                  '<button type="button" class="kn-btn kn-btn--secondary btn-delete-resume" data-resume-id="' + escapeHtml(r.id) + '" style="font-size:0.75rem; padding:2px 8px; color:var(--color-danger,#ef4444); margin-left:6px;">Delete</button>' +
                '</div>' +
              '</div>'
            );
          }).join('')
        : '<p class="kn-text-muted">No resumes uploaded yet. Upload a PDF, DOCX, or TXT resume to auto-populate your skills.</p>';

      const skillsHtml = profile && profile.skills && profile.skills.length > 0
        ? profile.skills.map((s) => {
            return '<span class="profile-skill-chip">' + escapeHtml(s.canonicalName) + '<span class="profile-skill-cat">' + escapeHtml(s.category || 'Tech') + '</span></span>';
          }).join('')
        : '<p class="kn-text-muted">No skills parsed yet. Upload your resume or add target skills.</p>';

      const eduHtml = profile && profile.educations && profile.educations.length > 0
        ? profile.educations.map((e) => {
            const years = e.startYear && e.endYear ? e.startYear + ' - ' + e.endYear : (e.endYear || '');
            return (
              '<div class="profile-history-item">' +
                '<strong>' + escapeHtml(e.degree) + (e.fieldOfStudy ? ' in ' + escapeHtml(e.fieldOfStudy) : '') + '</strong>' +
                '<div>' + escapeHtml(e.institution) + (years ? ' · ' + years : '') + '</div>' +
              '</div>'
            );
          }).join('')
        : '<p class="kn-text-muted">No education history recorded.</p>';

      const projHtml = profile && profile.projects && profile.projects.length > 0
        ? profile.projects.map((p) => {
            const techChips = p.technologies && p.technologies.length > 0
              ? '<div class="profile-proj-techs">' + p.technologies.map((t) => '<span class="profile-tech-mini">' + escapeHtml(t) + '</span>').join('') + '</div>'
              : '';
            return (
              '<div class="profile-history-item">' +
                '<strong>' + escapeHtml(p.title) + '</strong>' +
                (p.description ? '<p class="kn-text-muted" style="margin:4px 0;">' + escapeHtml(p.description) + '</p>' : '') +
                techChips +
              '</div>'
            );
          }).join('')
        : '<p class="kn-text-muted">No projects recorded yet.</p>';

      const expHtml = profile && profile.experiences && profile.experiences.length > 0
        ? profile.experiences.map((exp) => {
            return (
              '<div class="profile-history-item">' +
                '<strong>' + escapeHtml(exp.title) + ' at ' + escapeHtml(exp.companyName) + ' ' + (exp.isInternship ? '<span class="resume-badge">Internship</span>' : '') + '</strong>' +
                (exp.description ? '<p class="kn-text-muted" style="margin:4px 0;">' + escapeHtml(exp.description) + '</p>' : '') +
              '</div>'
            );
          }).join('')
        : '<p class="kn-text-muted">No experience or internships recorded.</p>';

      slotEl.innerHTML = (
        '<div class="profile-grid">' +
          '<!-- Column 1: Identity & Completeness -->' +
          '<div class="profile-col-left">' +
            '<div class="kn-card profile-card">' +
              '<div class="profile-identity">' +
                '<div class="profile-avatar">👤</div>' +
                '<div>' +
                  '<h2 class="profile-name">' + escapeHtml(profile && profile.fullName ? profile.fullName : 'Candidate Profile') + '</h2>' +
                  '<p class="profile-headline">' + escapeHtml(profile && profile.headline ? profile.headline : 'Job Seeker') + '</p>' +
                  '<span class="profile-tier-badge">🎓 ' + escapeHtml(profile && profile.experienceLevel ? profile.experienceLevel : 'FRESHER') + '</span>' +
                '</div>' +
              '</div>' +
            '</div>' +

            '<div class="kn-card profile-card">' +
              '<div class="profile-completeness-header">' +
                '<h3 style="font-size:1.1rem; font-weight:600;">Profile Completeness</h3>' +
                '<span class="profile-score-num">' + score + '%</span>' +
              '</div>' +
              '<div class="profile-progress-bar-bg">' +
                '<div class="profile-progress-bar-fill" style="width:' + score + '%;"></div>' +
              '</div>' +
              '<div class="profile-tips-container">' +
                '<h4 style="font-size:0.85rem; font-weight:600; margin-bottom:6px;">Optimization Suggestions:</h4>' +
                tipsHtml +
              '</div>' +
            '</div>' +

            '<div class="kn-card profile-card">' +
              '<h3 style="font-size:1.1rem; font-weight:600; margin-bottom:8px;">Manage Resumes</h3>' +
              '<p class="kn-text-muted" style="font-size:0.85rem; margin-bottom:12px;">Upload a resume file to automatically extract your skills, education, and experience.</p>' +
              '<div class="resume-upload-zone" id="resume-drop-zone">' +
                '<input type="file" id="resume-file-input" accept=".pdf,.docx,.txt" style="display:none;" />' +
                '<button type="button" id="btn-browse-resume" class="kn-btn kn-btn--primary" style="width:100%;">📤 Upload Resume (.pdf, .docx, .txt)</button>' +
                '<p class="kn-text-muted" style="font-size:0.75rem; margin-top:6px; text-align:center;">Max size: 5MB · Private & securely stored</p>' +
              '</div>' +
              '<div class="resume-list-container kn-mt-3">' +
                resumesListHtml +
              '</div>' +
            '</div>' +
          '</div>' +

          '<!-- Column 2: Extracted Structured Data -->' +
          '<div class="profile-col-right">' +
            '<div class="kn-card profile-card">' +
              '<div class="profile-section-header">' +
                '<h3 style="font-size:1.1rem; font-weight:600; margin-bottom:12px;">⚡ Extracted Skills (' + (profile && profile.skills ? profile.skills.length : 0) + ')</h3>' +
              '</div>' +
              '<div class="profile-skills-wrap">' +
                skillsHtml +
              '</div>' +
            '</div>' +

            '<div class="kn-card profile-card">' +
              '<h3 style="font-size:1.1rem; font-weight:600; margin-bottom:12px;">🎓 Education</h3>' +
              '<div class="profile-section-content">' +
                eduHtml +
              '</div>' +
            '</div>' +

            '<div class="kn-card profile-card">' +
              '<h3 style="font-size:1.1rem; font-weight:600; margin-bottom:12px;">💼 Experience & Internships</h3>' +
              '<div class="profile-section-content">' +
                expHtml +
              '</div>' +
            '</div>' +

            '<div class="kn-card profile-card">' +
              '<h3 style="font-size:1.1rem; font-weight:600; margin-bottom:12px;">🚀 Projects & Portfolio</h3>' +
              '<div class="profile-section-content">' +
                projHtml +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>'
      );

      bindProfileEvents(slotEl);
    } catch (err: any) {
      if (isDestroyed) return;
      slotEl.innerHTML = (
        '<div class="kn-card kn-p-4">' +
          '<p class="kn-text-danger">Failed to load candidate profile: ' + escapeHtml(err?.message || 'Network error') + '</p>' +
          '<button type="button" id="btn-retry-profile" class="kn-btn kn-btn--secondary kn-mt-2">🔄 Retry</button>' +
        '</div>'
      );
      const retryBtn = slotEl.querySelector<HTMLElement>('#btn-retry-profile');
      if (retryBtn) {
        addTrackedListener(retryBtn, 'click', () => {
          void loadProfileData();
        });
      }
    } finally {
      isFetching = false;
    }
  };

  // Bind Refresh button
  if (refreshBtn) {
    addTrackedListener(refreshBtn, 'click', () => {
      void loadProfileData();
    });
  }

  // Initial load
  void loadProfileData();

  // ───────────────────────────────────────────────────────────────────────────
  // Teardown & Lifecycle Controller
  // ───────────────────────────────────────────────────────────────────────────
  return {
    destroy: () => {
      if (isDestroyed) return;
      isDestroyed = true;

      boundListeners.forEach(({ target, event, handler }) => {
        target.removeEventListener(event, handler);
      });
      boundListeners.length = 0;
    },
  };
}
