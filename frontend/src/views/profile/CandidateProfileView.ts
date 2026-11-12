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
  resumesService,
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
            '<div>' +
              '<a href="#/dashboard/resume" class="kn-btn kn-btn--primary" style="margin-right:8px;">⚡ Resume Studio 2.0</a>' +
              '<button type="button" id="btn-refresh-profile" class="kn-btn kn-btn--secondary">🔄 Refresh</button>' +
            '</div>' +
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
            const rawResult = typeof reader.result === 'string' ? reader.result : '';
            let base64 = '';
            let content: string | undefined;

            if (rawResult.startsWith('data:')) {
              base64 = rawResult.includes(',') ? rawResult.split(',')[1] : '';
            } else {
              content = rawResult;
              try {
                base64 = typeof btoa === 'function' ? btoa(rawResult) : Buffer.from(rawResult).toString('base64');
              } catch {
                base64 = '';
              }
            }

            const uploadRes = await profileService.uploadResume({
              filename: file.name,
              base64,
              content,
              mimeType: file.type || 'application/octet-stream',
            });
            if (isDestroyed) return;

            if (uploadRes?.syncError) {
              showToast(
                `Resume uploaded, but evidence synchronization had an issue. You can safely retry from Evidence Vault.`,
                'warning'
              );
            } else {
              showToast('Resume uploaded and parsed successfully!', 'success');
            }
            void loadProfileData();
          } catch (err: any) {
            if (isDestroyed) return;
            showToast(err?.message || 'Failed to upload resume', 'error');
            browseBtn.disabled = false;
            browseBtn.textContent = '📤 Upload Resume (.pdf, .docx, .txt)';
          } finally {
            if (fileInput) {
              fileInput.value = '';
            }
          }
        };

        if (typeof reader.readAsDataURL === 'function') {
          reader.readAsDataURL(file);
        } else {
          reader.readAsText(file);
        }
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

    // ── Direct Candidate Controls: Skills ──
    const addSkillInput = scopeContainer.querySelector<HTMLInputElement>('#input-add-skill');
    const addSkillBtn = scopeContainer.querySelector<HTMLButtonElement>('#btn-add-profile-skill');
    if (addSkillBtn && addSkillInput) {
      addTrackedListener(addSkillBtn, 'click', async () => {
        const val = addSkillInput.value.trim();
        if (!val || isDestroyed) return;
        addSkillBtn.disabled = true;
        try {
          await resumesService.addSkill(val);
          showToast(`Skill "${val}" added!`, 'success');
          void loadProfileData();
        } catch (err: any) {
          showToast(err?.message || 'Failed to add skill', 'error');
          addSkillBtn.disabled = false;
        }
      });
    }

    scopeContainer.querySelectorAll<HTMLButtonElement>('.btn-delete-profile-skill').forEach((btn) => {
      addTrackedListener(btn, 'click', async () => {
        const skillId = btn.getAttribute('data-skill-id');
        if (!skillId || isDestroyed) return;
        try {
          await resumesService.deleteSkill(skillId);
          showToast('Skill removed', 'success');
          void loadProfileData();
        } catch (err: any) {
          showToast(err?.message || 'Failed to remove skill', 'error');
        }
      });
    });

    // ── Direct Candidate Controls: Projects ──
    const toggleProjBtn = scopeContainer.querySelector<HTMLButtonElement>('#btn-toggle-add-project');
    const projFormBox = scopeContainer.querySelector<HTMLElement>('#form-add-project-box');
    const cancelProjBtn = scopeContainer.querySelector<HTMLButtonElement>('#btn-cancel-proj');
    const submitProjBtn = scopeContainer.querySelector<HTMLButtonElement>('#btn-submit-proj');

    if (toggleProjBtn && projFormBox) {
      addTrackedListener(toggleProjBtn, 'click', () => {
        projFormBox.style.display = projFormBox.style.display === 'none' ? 'block' : 'none';
      });
    }
    if (cancelProjBtn && projFormBox) {
      addTrackedListener(cancelProjBtn, 'click', () => {
        projFormBox.style.display = 'none';
      });
    }
    if (submitProjBtn && projFormBox) {
      addTrackedListener(submitProjBtn, 'click', async () => {
        const titleEl = scopeContainer.querySelector<HTMLInputElement>('#input-proj-title');
        const techsEl = scopeContainer.querySelector<HTMLInputElement>('#input-proj-techs');
        const descEl = scopeContainer.querySelector<HTMLTextAreaElement>('#input-proj-desc');
        const title = titleEl?.value.trim();
        if (!title) {
          showToast('Project title is required', 'error');
          return;
        }
        submitProjBtn.disabled = true;
        try {
          const techs = techsEl?.value.split(',').map((t) => t.trim()).filter(Boolean) || [];
          await resumesService.addProject({
            title,
            technologies: techs,
            description: descEl?.value.trim(),
          });
          showToast('Project added to profile!', 'success');
          void loadProfileData();
        } catch (err: any) {
          showToast(err?.message || 'Failed to add project', 'error');
          submitProjBtn.disabled = false;
        }
      });
    }

    scopeContainer.querySelectorAll<HTMLButtonElement>('.btn-delete-profile-proj').forEach((btn) => {
      addTrackedListener(btn, 'click', async () => {
        const projId = btn.getAttribute('data-proj-id');
        if (!projId || isDestroyed) return;
        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
          if (!window.confirm('Delete this project?')) return;
        }
        try {
          await resumesService.deleteProject(projId);
          showToast('Project removed', 'success');
          void loadProfileData();
        } catch (err: any) {
          showToast(err?.message || 'Failed to delete project', 'error');
        }
      });
    });

    // ── Direct Candidate Controls: Experience ──
    const toggleExpBtn = scopeContainer.querySelector<HTMLButtonElement>('#btn-toggle-add-exp');
    const expFormBox = scopeContainer.querySelector<HTMLElement>('#form-add-exp-box');
    const cancelExpBtn = scopeContainer.querySelector<HTMLButtonElement>('#btn-cancel-exp');
    const submitExpBtn = scopeContainer.querySelector<HTMLButtonElement>('#btn-submit-exp');

    if (toggleExpBtn && expFormBox) {
      addTrackedListener(toggleExpBtn, 'click', () => {
        expFormBox.style.display = expFormBox.style.display === 'none' ? 'block' : 'none';
      });
    }
    if (cancelExpBtn && expFormBox) {
      addTrackedListener(cancelExpBtn, 'click', () => {
        expFormBox.style.display = 'none';
      });
    }
    if (submitExpBtn && expFormBox) {
      addTrackedListener(submitExpBtn, 'click', async () => {
        const titleEl = scopeContainer.querySelector<HTMLInputElement>('#input-exp-title');
        const companyEl = scopeContainer.querySelector<HTMLInputElement>('#input-exp-company');
        const descEl = scopeContainer.querySelector<HTMLTextAreaElement>('#input-exp-desc');
        const title = titleEl?.value.trim();
        const company = companyEl?.value.trim();
        if (!title || !company) {
          showToast('Title and Company are required', 'error');
          return;
        }
        submitExpBtn.disabled = true;
        try {
          await resumesService.addExperience({
            title,
            company,
            description: descEl?.value.trim(),
          });
          showToast('Experience added to profile!', 'success');
          void loadProfileData();
        } catch (err: any) {
          showToast(err?.message || 'Failed to add experience', 'error');
          submitExpBtn.disabled = false;
        }
      });
    }

    scopeContainer.querySelectorAll<HTMLButtonElement>('.btn-delete-profile-exp').forEach((btn) => {
      addTrackedListener(btn, 'click', async () => {
        const expId = btn.getAttribute('data-exp-id');
        if (!expId || isDestroyed) return;
        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
          if (!window.confirm('Delete this experience record?')) return;
        }
        try {
          await resumesService.deleteExperience(expId);
          showToast('Experience record removed', 'success');
          void loadProfileData();
        } catch (err: any) {
          showToast(err?.message || 'Failed to delete experience', 'error');
        }
      });
    });

    // ── Direct Candidate Controls: Education ──
    const toggleEduBtn = scopeContainer.querySelector<HTMLButtonElement>('#btn-toggle-add-edu');
    const eduFormBox = scopeContainer.querySelector<HTMLElement>('#form-add-edu-box');
    const cancelEduBtn = scopeContainer.querySelector<HTMLButtonElement>('#btn-cancel-edu');
    const submitEduBtn = scopeContainer.querySelector<HTMLButtonElement>('#btn-submit-edu');

    if (toggleEduBtn && eduFormBox) {
      addTrackedListener(toggleEduBtn, 'click', () => {
        eduFormBox.style.display = eduFormBox.style.display === 'none' ? 'block' : 'none';
      });
    }
    if (cancelEduBtn && eduFormBox) {
      addTrackedListener(cancelEduBtn, 'click', () => {
        eduFormBox.style.display = 'none';
      });
    }
    if (submitEduBtn && eduFormBox) {
      addTrackedListener(submitEduBtn, 'click', async () => {
        const degreeEl = scopeContainer.querySelector<HTMLInputElement>('#input-edu-degree');
        const instEl = scopeContainer.querySelector<HTMLInputElement>('#input-edu-inst');
        const fieldEl = scopeContainer.querySelector<HTMLInputElement>('#input-edu-field');
        const startEl = scopeContainer.querySelector<HTMLInputElement>('#input-edu-start');
        const endEl = scopeContainer.querySelector<HTMLInputElement>('#input-edu-end');

        const degree = degreeEl?.value.trim();
        const institution = instEl?.value.trim();
        if (!degree || !institution) {
          showToast('Degree and Institution are required', 'error');
          return;
        }

        submitEduBtn.disabled = true;
        try {
          await resumesService.addEducation({
            degree,
            institution,
            fieldOfStudy: fieldEl?.value.trim() || undefined,
            startYear: startEl?.value ? parseInt(startEl.value, 10) : undefined,
            endYear: endEl?.value ? parseInt(endEl.value, 10) : undefined,
          });
          showToast('Education added to profile!', 'success');
          void loadProfileData();
        } catch (err: any) {
          showToast(err?.message || 'Failed to add education', 'error');
          submitEduBtn.disabled = false;
        }
      });
    }

    scopeContainer.querySelectorAll<HTMLButtonElement>('.btn-delete-profile-edu').forEach((btn) => {
      addTrackedListener(btn, 'click', async () => {
        const eduId = btn.getAttribute('data-edu-id');
        if (!eduId || isDestroyed) return;
        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
          if (!window.confirm('Delete this education record from your profile?')) return;
        }
        btn.disabled = true;
        btn.textContent = '...';
        try {
          await resumesService.deleteEducation(eduId);
          showToast('Education record removed', 'success');
          void loadProfileData();
        } catch (err: any) {
          showToast(err?.message || 'Failed to delete education', 'error');
          btn.disabled = false;
          btn.textContent = 'Delete';
        }
      });
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
            return (
              '<span class="profile-skill-chip" style="display:inline-flex; align-items:center; gap:6px;">' +
                escapeHtml(s.canonicalName) +
                '<span class="profile-skill-cat">' + escapeHtml(s.category || 'Tech') + '</span>' +
                '<button type="button" class="btn-delete-profile-skill" data-skill-id="' + escapeHtml(s.id) + '" title="Remove skill" style="border:none; background:none; color:#ef4444; font-size:12px; cursor:pointer; padding:0 2px; font-weight:bold;">×</button>' +
              '</span>'
            );
          }).join('')
        : '<p class="kn-text-muted">No skills parsed yet. Add your target skills below or upload your resume.</p>';

      const eduHtml = profile && profile.educations && profile.educations.length > 0
        ? profile.educations.map((e) => {
            const years = e.startYear && e.endYear ? e.startYear + ' - ' + e.endYear : (e.endYear || '');
            return (
              '<div class="profile-history-item" style="display:flex; justify-content:space-between; align-items:flex-start;">' +
                '<div>' +
                  '<strong>' + escapeHtml(e.degree) + (e.fieldOfStudy ? ' in ' + escapeHtml(e.fieldOfStudy) : '') + '</strong>' +
                  '<div>' + escapeHtml(e.institution) + (years ? ' · ' + years : '') + '</div>' +
                '</div>' +
                '<button type="button" class="btn-delete-profile-edu" data-edu-id="' + escapeHtml(e.id) + '" style="border:none; background:none; color:#ef4444; font-size:0.75rem; cursor:pointer; padding:2px 6px;" title="Remove education">Delete</button>' +
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
              '<div class="profile-history-item" style="display:flex; justify-content:space-between; align-items:flex-start;">' +
                '<div>' +
                  '<strong>' + escapeHtml(p.title) + '</strong>' +
                  (p.description ? '<p class="kn-text-muted" style="margin:4px 0;">' + escapeHtml(p.description) + '</p>' : '') +
                  techChips +
                '</div>' +
                '<button type="button" class="btn-delete-profile-proj" data-proj-id="' + escapeHtml(p.id) + '" style="border:none; background:none; color:#ef4444; font-size:0.75rem; cursor:pointer; padding:2px 6px;">Delete</button>' +
              '</div>'
            );
          }).join('')
        : '<p class="kn-text-muted">No projects recorded yet. Add an academic or portfolio project below (+15% completeness).</p>';

      const expHtml = profile && profile.experiences && profile.experiences.length > 0
        ? profile.experiences.map((exp) => {
            return (
              '<div class="profile-history-item" style="display:flex; justify-content:space-between; align-items:flex-start;">' +
                '<div>' +
                  '<strong>' + escapeHtml(exp.title) + ' at ' + escapeHtml(exp.companyName) + ' ' + (exp.isInternship ? '<span class="resume-badge">Internship</span>' : '') + '</strong>' +
                  (exp.description ? '<p class="kn-text-muted" style="margin:4px 0;">' + escapeHtml(exp.description) + '</p>' : '') +
                '</div>' +
                '<button type="button" class="btn-delete-profile-exp" data-exp-id="' + escapeHtml(exp.id) + '" style="border:none; background:none; color:#ef4444; font-size:0.75rem; cursor:pointer; padding:2px 6px;">Delete</button>' +
              '</div>'
            );
          }).join('')
        : '<p class="kn-text-muted">No experience or internships recorded. Add work or internship experience below (+15% completeness).</p>';

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
              '<div class="profile-section-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">' +
                '<h3 style="font-size:1.1rem; font-weight:600; margin:0;">⚡ Extracted Skills (' + (profile && profile.skills ? profile.skills.length : 0) + ')</h3>' +
              '</div>' +
              '<div style="display:flex; gap:6px; margin-bottom:12px;">' +
                '<input type="text" id="input-add-skill" class="kn-input" placeholder="Add skill (e.g. React, Docker, Python)..." style="font-size:0.85rem; padding:4px 8px; flex:1;" />' +
                '<button type="button" id="btn-add-profile-skill" class="kn-btn kn-btn--secondary" style="font-size:0.85rem; padding:4px 12px;">+ Add Skill</button>' +
              '</div>' +
              '<div class="profile-skills-wrap">' +
                skillsHtml +
              '</div>' +
            '</div>' +

            '<div class="kn-card profile-card">' +
              '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">' +
                '<h3 style="font-size:1.1rem; font-weight:600; margin:0;">🎓 Education</h3>' +
                '<button type="button" id="btn-toggle-add-edu" class="kn-btn kn-btn--secondary" style="font-size:0.8rem; padding:2px 8px;">+ Add Education</button>' +
              '</div>' +
              '<div id="form-add-edu-box" style="display:none; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px; margin-bottom:12px;">' +
                '<input type="text" id="input-edu-degree" class="kn-input" placeholder="Degree (e.g. B.Tech / B.E., BCA, Master of Science)" style="width:100%; margin-bottom:6px; font-size:0.85rem;" />' +
                '<input type="text" id="input-edu-inst" class="kn-input" placeholder="Institution / College / University" style="width:100%; margin-bottom:6px; font-size:0.85rem;" />' +
                '<input type="text" id="input-edu-field" class="kn-input" placeholder="Field of Study (e.g. Computer Science & Engineering)" style="width:100%; margin-bottom:6px; font-size:0.85rem;" />' +
                '<div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:6px;">' +
                  '<input type="number" id="input-edu-start" class="kn-input" placeholder="Start Year (e.g. 2020)" style="font-size:0.85rem;" />' +
                  '<input type="number" id="input-edu-end" class="kn-input" placeholder="Graduation Year (e.g. 2024)" style="font-size:0.85rem;" />' +
                '</div>' +
                '<div style="display:flex; justify-content:flex-end; gap:6px;">' +
                  '<button type="button" id="btn-cancel-edu" class="kn-btn kn-btn--secondary" style="font-size:0.8rem; padding:2px 8px;">Cancel</button>' +
                  '<button type="button" id="btn-submit-edu" class="kn-btn kn-btn--primary" style="font-size:0.8rem; padding:2px 8px;">Save Education</button>' +
                '</div>' +
              '</div>' +
              '<div class="profile-section-content">' +
                eduHtml +
              '</div>' +
            '</div>' +

            '<div class="kn-card profile-card">' +
              '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">' +
                '<h3 style="font-size:1.1rem; font-weight:600; margin:0;">💼 Experience & Internships</h3>' +
                '<button type="button" id="btn-toggle-add-exp" class="kn-btn kn-btn--secondary" style="font-size:0.8rem; padding:2px 8px;">+ Add Experience</button>' +
              '</div>' +
              '<div id="form-add-exp-box" style="display:none; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px; margin-bottom:12px;">' +
                '<input type="text" id="input-exp-title" class="kn-input" placeholder="Role / Job Title" style="width:100%; margin-bottom:6px; font-size:0.85rem;" />' +
                '<input type="text" id="input-exp-company" class="kn-input" placeholder="Company Name" style="width:100%; margin-bottom:6px; font-size:0.85rem;" />' +
                '<textarea id="input-exp-desc" class="kn-input" placeholder="Responsibilities and accomplishments" rows="2" style="width:100%; margin-bottom:6px; font-size:0.85rem;"></textarea>' +
                '<div style="display:flex; justify-content:flex-end; gap:6px;">' +
                  '<button type="button" id="btn-cancel-exp" class="kn-btn kn-btn--secondary" style="font-size:0.8rem; padding:2px 8px;">Cancel</button>' +
                  '<button type="button" id="btn-submit-exp" class="kn-btn kn-btn--primary" style="font-size:0.8rem; padding:2px 8px;">Save Experience</button>' +
                '</div>' +
              '</div>' +
              '<div class="profile-section-content">' +
                expHtml +
              '</div>' +
            '</div>' +

            '<div class="kn-card profile-card">' +
              '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">' +
                '<h3 style="font-size:1.1rem; font-weight:600; margin:0;">🚀 Projects & Portfolio</h3>' +
                '<button type="button" id="btn-toggle-add-project" class="kn-btn kn-btn--secondary" style="font-size:0.8rem; padding:2px 8px;">+ Add Project</button>' +
              '</div>' +
              '<div id="form-add-project-box" style="display:none; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px; margin-bottom:12px;">' +
                '<input type="text" id="input-proj-title" class="kn-input" placeholder="Project Name" style="width:100%; margin-bottom:6px; font-size:0.85rem;" />' +
                '<input type="text" id="input-proj-techs" class="kn-input" placeholder="Technologies (comma separated)" style="width:100%; margin-bottom:6px; font-size:0.85rem;" />' +
                '<textarea id="input-proj-desc" class="kn-input" placeholder="Project description and key outcomes" rows="2" style="width:100%; margin-bottom:6px; font-size:0.85rem;"></textarea>' +
                '<div style="display:flex; justify-content:flex-end; gap:6px;">' +
                  '<button type="button" id="btn-cancel-proj" class="kn-btn kn-btn--secondary" style="font-size:0.8rem; padding:2px 8px;">Cancel</button>' +
                  '<button type="button" id="btn-submit-proj" class="kn-btn kn-btn--primary" style="font-size:0.8rem; padding:2px 8px;">Save Project</button>' +
                '</div>' +
              '</div>' +
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
