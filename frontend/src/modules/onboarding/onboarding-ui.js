/**
 * Onboarding & Preferences UI Module — Phase 7.3.
 *
 * Provides structured accordion-based preference editing with:
 * - Dynamic multi-select role chips + custom adder
 * - Location multi-select chips + custom adder
 * - Workplace type multi-select pills (On-site, Hybrid, Remote)
 * - Experience level selector (Fresher vs Experienced)
 * - Searchable company grid with dynamic total count and 'All Companies' master toggle
 * - Alert and notification delivery settings
 */

import { apiClient } from '../preferences-client.js';

const DEFAULT_ROLES = [
  'Software Engineer',
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'Java Developer',
  'Python Developer',
  'DevOps Engineer',
  'Data Analyst',
  'Data Scientist',
  'QA Engineer',
  'Cloud Engineer',
  'Business Analyst',
];

const DEFAULT_LOCATIONS = [
  'Bangalore',
  'Hyderabad',
  'Pune',
  'Chennai',
  'Mumbai',
  'Delhi NCR',
  'Noida',
  'Gurgaon',
  'Remote',
];

const WORKPLACE_OPTIONS = [
  { id: 'ONSITE', label: 'On-site', icon: '🏢', desc: 'Working from physical office locations' },
  { id: 'HYBRID', label: 'Hybrid', icon: '🏢', desc: 'Split between office and remote' },
  { id: 'REMOTE', label: 'Remote', icon: '🌐', desc: 'Work from anywhere within country/region' },
];

function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
}

export async function renderOnboardingView(containerEl, options = {}) {
  const isEditing = options.isEditing || false;
  let isDestroyed = false;
  let isSaving = false;
  let handleDocClick = null;
  let handleDocKeydown = null;

  let initialPrefs = null;
  // If editing, always attempt to fetch fresh preferences directly from API
  if (isEditing && apiClient.getToken()) {
    try {
      const fetched = await apiClient.getPreferences();
      if (isDestroyed) return { destroy: () => {} };
      if (fetched) {
        initialPrefs = (fetched && fetched.preferences) ? fetched.preferences : fetched;
        localStorage.setItem('roleradar_preferences', JSON.stringify(initialPrefs));
      }
    } catch (e) {
      console.warn('Could not fetch preferences from API, falling back to options', e);
    }
  }

  if (isDestroyed) return { destroy: () => {} };

  if (!initialPrefs) {
    initialPrefs = options.currentPreferences;
  }

  if (!initialPrefs) {
    initialPrefs = {
      roles: isEditing ? [] : ['Software Engineer'],
      locations: isEditing ? [] : ['Bangalore', 'Remote'],
      workplaceTypes: [],
      experienceLevel: 'FRESHER',
      companyIds: [],
      emailAlertsEnabled: true,
      instantNotifications: true,
      dailyDigest: false,
    };
  }

  let supportedCompanies = [];
  try {
    supportedCompanies = await apiClient.getCompanies();
  } catch (e) {
    console.warn('Could not load companies from API, using defaults');
  }

  const selectedRoles = new Set(initialPrefs.roles || initialPrefs.roleKeywords || []);
  const selectedLocations = new Set(initialPrefs.locations || initialPrefs.preferredLocations || []);
  const selectedWorkplaces = new Set(
    (initialPrefs.workplaceTypes || initialPrefs.workplace_types || []).map((w) => w.toUpperCase())
  );
  let selectedExperience = initialPrefs.experienceLevel || initialPrefs.experience_level || 'FRESHER';
  const selectedCompanyIds = new Set(initialPrefs.companyIds || initialPrefs.company_ids || []);
  let emailAlertsEnabled = initialPrefs.emailAlertsEnabled !== false && initialPrefs.email_alerts_enabled !== false;
  let instantNotifications = initialPrefs.instantNotifications !== false && initialPrefs.instant_notifications !== false;
  let dailyDigest = initialPrefs.dailyDigest === true || initialPrefs.daily_digest === true;

  const selectedCanonicalRoles = new Set(initialPrefs.canonicalRoles || initialPrefs.canonical_roles || []);
  let canonicalTaxonomy = { domains: [] };
  let mappedLegacyToCanonical = new Map();
  let canonicalRoleMap = new Map();
  let roleSearchQuery = '';
  let isRoleDropdownOpen = false;

  if (isEditing) {
    try {
      if (apiClient.getCanonicalTaxonomy) {
        canonicalTaxonomy = await apiClient.getCanonicalTaxonomy();
        canonicalTaxonomy.domains.forEach(d => {
          d.roles.forEach(r => canonicalRoleMap.set(r.id, r));
        });
      }

      if (apiClient.getToken() && apiClient.getMigrationPreview) {
        const preview = await apiClient.getMigrationPreview();
        if (preview && preview.roles) {
          preview.roles.forEach(r => {
            if (r.canonicalRoleId) {
              if (!mappedLegacyToCanonical.has(r.canonicalRoleId)) {
                mappedLegacyToCanonical.set(r.canonicalRoleId, []);
              }
              mappedLegacyToCanonical.get(r.canonicalRoleId).push(r.legacyValue);
            }
          });
        }
      }

      // ONLY map legacy roles that are actually currently present in selectedRoles
      if (selectedCanonicalRoles.size === 0 && selectedRoles.size > 0) {
        mappedLegacyToCanonical.forEach((legacyValues, canonicalId) => {
          if (legacyValues.some(val => selectedRoles.has(val))) {
            selectedCanonicalRoles.add(canonicalId);
          }
        });
      }
    } catch (e) {
      console.warn('Failed to load canonical taxonomy or migration preview', e);
    }
  }

  let companySearchQuery = '';
  let wasRoleSearchFocused = false;
  const openSections = new Set(['roles', 'locations', 'workplace', 'experience', 'companies', 'notifications']);

  function toggleSection(sectionKey) {
    if (openSections.has(sectionKey)) {
      openSections.delete(sectionKey);
    } else {
      openSections.add(sectionKey);
    }
    updateView();
  }

  function updateView() {
    if (isDestroyed) return;
    const roleInput = document.getElementById('role-search-input');
    if (roleInput && document.activeElement === roleInput) {
      wasRoleSearchFocused = true;
    } else {
      wasRoleSearchFocused = false;
    }

    const totalCompanies = supportedCompanies.length || 41;
    const filteredCompanies = supportedCompanies.filter((c) => {
      if (!companySearchQuery) return true;
      const q = companySearchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.atsType && c.atsType.toLowerCase().includes(q))
      );
    });

    const workplaceSummary =
      selectedWorkplaces.size === 0
        ? 'Any Workplace (On-site · Hybrid · Remote)'
        : Array.from(selectedWorkplaces)
            .map((w) => (w === 'ONSITE' ? 'On-site' : w === 'HYBRID' ? 'Hybrid' : 'Remote'))
            .join(' · ');

    const companySummary =
      selectedCompanyIds.size === 0
        ? `All Companies (${totalCompanies} Active Companies)`
        : `${selectedCompanyIds.size} of ${totalCompanies} Companies Selected`;

    containerEl.innerHTML = `
      <div class="onboarding-container">
        <div class="onboarding-header">
          <h1 class="onboarding-title">${isEditing ? 'Edit Job Preferences' : 'FIND YOUR NEXT JOB'}</h1>
          <p class="onboarding-subtitle">${
            isEditing
              ? 'Customize your target roles, locations, workplace mode, and companies.'
              : 'Configure your target roles, preferred locations, and companies to get verified job alerts.'
          }</p>
        </div>

        <div id="onboarding-error" class="error-banner" style="display: none;"></div>

        <div class="pref-accordion-list">
          <!-- 1. Roles Accordion -->
          <div class="pref-accordion-item ${openSections.has('roles') ? 'is-open' : ''}" id="section-roles">
            <button type="button" class="pref-accordion-header" data-toggle-section="roles">
              <div class="pref-accordion-header-left">
                <span class="pref-accordion-title">🎯 Target Job Roles</span>
                <span class="pref-accordion-badge ${selectedRoles.size > 0 ? 'pref-accordion-badge--active' : ''}">
                  ${selectedRoles.size} selected
                </span>
              </div>
              <span class="pref-accordion-icon">▼</span>
            </button>
            <div class="pref-accordion-body">
              <p class="onboarding-step__hint">Select one or more roles that match your career focus.</p>
              ${isEditing ? `
                <div style="margin-bottom: 1rem;">
                  <input type="text" id="role-search-input" class="kn-input" style="width: 100%; margin-bottom: 0.5rem; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 4px;" placeholder="🔎 Search roles..." value="${escapeHtml(roleSearchQuery)}" autocomplete="off" />
                  
                  <div style="position: relative; margin-bottom: 1rem;" id="role-dropdown-wrapper">
                    <button type="button" id="btn-browse-roles" class="kn-btn" style="width: 100%; display: flex; justify-content: space-between; align-items: center; background: #fff; border: 1px solid #cbd5e1; color: #334155; padding: 0.6rem 1rem; border-radius: 4px;">
                      <span>Select a role</span>
                      <span>${isRoleDropdownOpen ? '▲' : '▼'}</span>
                    </button>
                    
                    <div id="roles-hierarchy-container" style="display: ${isRoleDropdownOpen ? 'flex' : 'none'}; flex-direction: column; position: absolute; top: 100%; left: 0; right: 0; z-index: 100; background: #fff; border: 1px solid #cbd5e1; border-radius: 4px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); margin-top: 4px; max-height: 350px;">
                      <div style="overflow-y: auto; flex-grow: 1;">
                        ${(() => {
                          const allRoles = canonicalTaxonomy.domains.flatMap(d => d.roles.map(r => ({...r, domainName: d.displayName})));
                          const sortedRoles = allRoles.sort((a, b) => a.displayName.localeCompare(b.displayName));
                          const filteredRoles = sortedRoles.filter(r => 
                            !roleSearchQuery || 
                            r.displayName.toLowerCase().includes(roleSearchQuery.toLowerCase()) || 
                            r.domainName.toLowerCase().includes(roleSearchQuery.toLowerCase())
                          );
                          if (filteredRoles.length === 0) {
                            return '<div style="padding: 12px; color: #64748b; text-align: center; font-size: 0.9rem;">No matching roles found.</div>';
                          }
                          return filteredRoles.map(r => {
                            const isSelected = selectedCanonicalRoles.has(r.id);
                            return `
                              <div class="vjp-role-option canonical-role-btn ${isSelected ? 'is-selected' : ''}" data-canonical-id="${r.id}" style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; display: flex; justify-content: space-between; align-items: center; ${isSelected ? 'background-color: #eff6ff; color: #1d4ed8; font-weight: 500;' : 'color: #334155;'}">
                                <div>${escapeHtml(r.displayName)}</div>
                                <div>${isSelected ? '✓' : ''}</div>
                              </div>
                            `;
                          }).join('');
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                <div style="margin-bottom: 1rem;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <h4 style="margin: 0; font-weight: 600; font-size: 0.85rem; color: #64748b;">Selected Roles</h4>
                    <div style="display: flex; gap: 8px; align-items: center;">
                      <button type="button" id="btn-select-all-roles" class="kn-btn kn-btn--text kn-btn--sm" style="color: #2563eb; font-size: 0.8rem; padding: 2px 8px; cursor: pointer; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px; font-weight: 500;">
                        ✓ Select All
                      </button>
                      ${(selectedCanonicalRoles.size > 0 || selectedRoles.size > 0) ? `
                        <button type="button" id="btn-clear-all-roles" class="kn-btn kn-btn--text kn-btn--sm" style="color: #ef4444; font-size: 0.8rem; padding: 2px 8px; cursor: pointer; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; font-weight: 500;">
                          🗑️ Clear All
                        </button>
                      ` : ''}
                    </div>
                  </div>
                  <div class="chip-group">
                    ${Array.from(selectedCanonicalRoles).map(canonicalId => {
                      const r = canonicalRoleMap.get(canonicalId);
                      return r ? `
                        <button type="button" class="chip-btn canonical-role-btn is-selected" data-canonical-id="${r.id}">
                          ${escapeHtml(r.displayName)} ×
                        </button>
                      ` : '';
                    }).join('')}
                    ${Array.from(selectedRoles).filter(lr => !canonicalRoleMap.has(lr) && !Array.from(mappedLegacyToCanonical.values()).flat().includes(lr)).map(lr => `
                      <button type="button" class="chip-btn legacy-role-btn is-selected" data-legacy-role="${escapeHtml(lr)}">
                        ${escapeHtml(lr)} ×
                      </button>
                    `).join('')}
                    ${(selectedCanonicalRoles.size === 0 && selectedRoles.size === 0) ? '<span style="color: #94a3b8; font-size: 0.9rem;">No roles selected</span>' : ''}
                  </div>
                </div>
              ` : `
              <div style="display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 0.5rem;">
                <button type="button" id="btn-select-all-roles" class="kn-btn kn-btn--text kn-btn--sm" style="color: #2563eb; font-size: 0.8rem; padding: 2px 8px; cursor: pointer; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px; font-weight: 500;">
                  ✓ Select All
                </button>
                <button type="button" id="btn-clear-all-roles" class="kn-btn kn-btn--text kn-btn--sm" style="color: #ef4444; font-size: 0.8rem; padding: 2px 8px; cursor: pointer; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; font-weight: 500;">
                  🗑️ Clear All
                </button>
              </div>
              <div class="chip-group" id="roles-chip-group">
                ${DEFAULT_ROLES.map(
                  (r) => `<button type="button" class="chip-btn ${selectedRoles.has(r) ? 'is-selected' : ''}" data-role="${r}">${r}</button>`
                ).join('')}
                ${Array.from(selectedRoles)
                  .filter((r) => !DEFAULT_ROLES.includes(r))
                  .map((r) => `<button type="button" class="chip-btn is-selected" data-role="${r}">${r} ✕</button>`)
                  .join('')}
              </div>
              `}
              <div class="custom-add-group" ${isEditing ? 'style="margin-top: 1rem;"' : ''}>
                <input type="text" id="custom-role-input" class="custom-add-input" placeholder="Add custom role (e.g. Site Reliability Engineer)" />
                <button type="button" id="btn-add-custom-role" class="custom-add-btn">+ Add Role</button>
              </div>
            </div>
          </div>

          <!-- 2. Locations Accordion -->
          <div class="pref-accordion-item ${openSections.has('locations') ? 'is-open' : ''}" id="section-locations">
            <button type="button" class="pref-accordion-header" data-toggle-section="locations">
              <div class="pref-accordion-header-left">
                <span class="pref-accordion-title">📍 Preferred Locations</span>
                <span class="pref-accordion-badge ${selectedLocations.size > 0 ? 'pref-accordion-badge--active' : ''}">
                  ${selectedLocations.size} selected
                </span>
              </div>
              <span class="pref-accordion-icon">▼</span>
            </button>
            <div class="pref-accordion-body">
              <p class="onboarding-step__hint">Select your target cities or Remote.</p>
              <div class="chip-group" id="locations-chip-group">
                ${DEFAULT_LOCATIONS.map(
                  (l) => `<button type="button" class="chip-btn ${selectedLocations.has(l) ? 'is-selected' : ''}" data-location="${l}">${l}</button>`
                ).join('')}
                ${Array.from(selectedLocations)
                  .filter((l) => !DEFAULT_LOCATIONS.includes(l))
                  .map((l) => `<button type="button" class="chip-btn is-selected" data-location="${l}">${l} ✕</button>`)
                  .join('')}
              </div>
              <div class="custom-add-group">
                <input type="text" id="custom-loc-input" class="custom-add-input" placeholder="Add other location (e.g. Kolkata)" />
                <button type="button" id="btn-add-custom-loc" class="custom-add-btn">+ Add Location</button>
              </div>
            </div>
          </div>

          <!-- 3. Workplace Type Accordion -->
          <div class="pref-accordion-item ${openSections.has('workplace') ? 'is-open' : ''}" id="section-workplace">
            <button type="button" class="pref-accordion-header" data-toggle-section="workplace">
              <div class="pref-accordion-header-left">
                <span class="pref-accordion-title">🏢 Workplace Type</span>
                <span class="pref-accordion-badge ${selectedWorkplaces.size > 0 ? 'pref-accordion-badge--active' : ''}">
                  ${workplaceSummary}
                </span>
              </div>
              <span class="pref-accordion-icon">▼</span>
            </button>
            <div class="pref-accordion-body">
              <p class="onboarding-step__hint">Select acceptable work modes (choose multiple or leave all unselected for any workplace).</p>
              <div class="workplace-options">
                ${WORKPLACE_OPTIONS.map(
                  (w) => `
                  <button type="button" class="workplace-pill ${selectedWorkplaces.has(w.id) ? 'is-selected' : ''}" data-workplace="${w.id}">
                    <span>${w.icon}</span>
                    <span>${w.label}</span>
                    ${selectedWorkplaces.has(w.id) ? '<span style="font-size: 0.8rem;">✓</span>' : ''}
                  </button>
                `
                ).join('')}
              </div>
              <div style="font-size: 0.82rem; color: #64748b; margin-top: 10px;">
                ${
                  selectedWorkplaces.size === 0
                    ? '💡 No restriction: On-site, Hybrid, and Remote jobs will all be matched.'
                    : `💡 Only matching <strong>${Array.from(selectedWorkplaces).map((w) => (w === 'ONSITE' ? 'On-site' : w === 'HYBRID' ? 'Hybrid' : 'Remote')).join(', ')}</strong> opportunities.`
                }
              </div>
            </div>
          </div>

          <!-- 4. Experience Level Accordion -->
          <div class="pref-accordion-item ${openSections.has('experience') ? 'is-open' : ''}" id="section-experience">
            <button type="button" class="pref-accordion-header" data-toggle-section="experience">
              <div class="pref-accordion-header-left">
                <span class="pref-accordion-title">👤 Experience Level</span>
                <span class="pref-accordion-badge pref-accordion-badge--active">
                  ${selectedExperience === 'FRESHER' ? '🎓 Fresher / Entry-Level' : '💼 Experienced'}
                </span>
              </div>
              <span class="pref-accordion-icon">▼</span>
            </button>
            <div class="pref-accordion-body">
              <p class="onboarding-step__hint">Strictly filters verified openings based on genuine entry vs senior criteria.</p>
              <div class="experience-options">
                <div class="experience-card ${selectedExperience === 'FRESHER' ? 'is-selected' : ''}" data-exp="FRESHER">
                  <div class="experience-card__title">🎓 Fresher / Entry-Level</div>
                  <div class="experience-card__desc">0 to 1 years experience, recent university graduates, or career starters.</div>
                </div>
                <div class="experience-card ${selectedExperience === 'EXPERIENCED' ? 'is-selected' : ''}" data-exp="EXPERIENCED">
                  <div class="experience-card__title">💼 Experienced Professional</div>
                  <div class="experience-card__desc">1+ years of professional experience across industry engineering roles.</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 5. Target Companies Accordion -->
          <div class="pref-accordion-item ${openSections.has('companies') ? 'is-open' : ''}" id="section-companies">
            <button type="button" class="pref-accordion-header" data-toggle-section="companies">
              <div class="pref-accordion-header-left">
                <span class="pref-accordion-title">🏢 Target Companies</span>
                <span class="pref-accordion-badge ${selectedCompanyIds.size > 0 ? 'pref-accordion-badge--active' : ''}">
                  ${companySummary}
                </span>
              </div>
              <span class="pref-accordion-icon">▼</span>
            </button>
            <div class="pref-accordion-body">
              <p class="onboarding-step__hint">Search and select specific companies, or leave in 'All Companies' mode.</p>
              
              <div class="company-toolbar">
                <input
                  type="text"
                  id="company-search-input"
                  class="company-search-input"
                  placeholder="🔍 Search ${totalCompanies} supported companies..."
                  value="${companySearchQuery}"
                />
                <button
                  type="button"
                  id="btn-toggle-all-companies"
                  class="kn-btn kn-btn--secondary company-select-all-btn"
                >
                  ${selectedCompanyIds.size === 0 ? '✓ All Companies Active' : 'Select All (' + totalCompanies + ')'}
                </button>
              </div>

              <div class="company-grid" style="max-height: 280px; overflow-y: auto; padding-right: 4px;">
                ${
                  filteredCompanies.length === 0
                    ? '<div style="grid-column: 1 / -1; padding: 20px; text-align: center; color: #64748b;">No companies match your search.</div>'
                    : filteredCompanies
                        .map(
                          (c) => `
                    <div class="company-card ${selectedCompanyIds.has(c.id) ? 'is-selected' : ''}" data-company-id="${c.id}">
                      <input type="checkbox" ${selectedCompanyIds.has(c.id) ? 'checked' : ''} style="pointer-events: none;" />
                      <span class="company-card__name">${c.name}</span>
                      <span class="company-card__badge">${c.atsType}</span>
                    </div>
                  `
                        )
                        .join('')
                }
              </div>

              <div class="scope-banner" style="margin-top: 14px;">
                <span>ℹ️</span>
                <span>
                  ${
                    selectedCompanyIds.size === 0
                      ? `<strong>All Supported Companies:</strong> Matches verified jobs across all active companies (${totalCompanies} companies).`
                      : `<strong>Targeted Mode:</strong> Matches verified jobs only from the <strong>${selectedCompanyIds.size}</strong> selected compan${selectedCompanyIds.size === 1 ? 'y' : 'ies'}.`
                  }
                </span>
              </div>
            </div>
          </div>

          <!-- 6. Notifications Accordion -->
          <div class="pref-accordion-item ${openSections.has('notifications') ? 'is-open' : ''}" id="section-notifications">
            <button type="button" class="pref-accordion-header" data-toggle-section="notifications">
              <div class="pref-accordion-header-left">
                <span class="pref-accordion-title">🔔 Job Alerts & Notifications</span>
                <span class="pref-accordion-badge ${emailAlertsEnabled ? 'pref-accordion-badge--active' : ''}">
                  ${emailAlertsEnabled ? 'Alerts Enabled' : 'Alerts Disabled'}
                </span>
              </div>
              <span class="pref-accordion-icon">▼</span>
            </button>
            <div class="pref-accordion-body">
              <p class="onboarding-step__hint">Configure how RoleRadar delivers verified job matches to your inbox.</p>
              <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 10px;">
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 0.95rem;">
                  <input type="checkbox" id="pref-email-alerts" ${emailAlertsEnabled ? 'checked' : ''} />
                  <span><strong>Alerts Enabled</strong> (receive matching job email alerts)</span>
                </label>
                <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 0.95rem; margin-left: 24px;">
                  <input type="checkbox" id="pref-instant-alerts" ${instantNotifications ? 'checked' : ''} style="margin-top: 4px;" />
                  <div>
                    <strong>Instant Alerts (Windowed):</strong> Eligible matching jobs are delivered through available digest windows.<br>
                    <span style="font-size: 0.85rem; color: #64748b;">Window times: 09:00, 11:30, 14:00, 16:30, 19:00, 21:30 (Local Time)</span>
                  </div>
                </label>
                <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 0.95rem; margin-left: 24px;">
                  <input type="checkbox" id="pref-daily-digest" ${dailyDigest ? 'checked' : ''} style="margin-top: 4px;" />
                  <div>
                    <strong>Daily Digest Only:</strong> One daily summary of verified jobs at 09:00 AM.
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div class="onboarding-actions" style="margin-top: 24px;">
          ${isEditing ? '<button type="button" id="btn-cancel-edit" class="kn-btn kn-btn--secondary">Cancel</button>' : ''}
          <button type="button" id="btn-save-onboarding" class="kn-btn kn-btn--primary">
            ${isEditing ? 'Save Preferences' : 'Start Finding Jobs →'}
          </button>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // Accordion Toggle
    containerEl.querySelectorAll('[data-toggle-section]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sec = btn.getAttribute('data-toggle-section');
        toggleSection(sec);
      });
    });

    // Role chip toggle (legacy)
    containerEl.querySelectorAll('[data-role]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const role = btn.getAttribute('data-role');
        if (selectedRoles.has(role)) {
          selectedRoles.delete(role);
        } else {
          selectedRoles.add(role);
        }
        updateView();
      });
    });

    // Canonical Role Toggle
    containerEl.querySelectorAll('.canonical-role-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const canonicalId = btn.getAttribute('data-canonical-id');
        const roleDef = canonicalRoleMap.get(canonicalId);
        
        if (selectedCanonicalRoles.has(canonicalId)) {
          selectedCanonicalRoles.delete(canonicalId);
          // Also clean up from selectedRoles so it doesn't resurrect
          if (roleDef) {
            selectedRoles.delete(roleDef.displayName);
          }
          const legacyAliases = mappedLegacyToCanonical.get(canonicalId) || [];
          for (const alias of legacyAliases) {
            selectedRoles.delete(alias);
          }
        } else {
          selectedCanonicalRoles.add(canonicalId);
          // If we want to guarantee the legacy 'roles' array still works for the matching engine:
          if (roleDef && !selectedRoles.has(roleDef.displayName)) {
            selectedRoles.add(roleDef.displayName);
          }
        }
        updateView();
      });
    });

    // Custom Legacy Role removal in Canonical UI
    containerEl.querySelectorAll('.legacy-role-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const lr = btn.getAttribute('data-legacy-role');
        selectedRoles.delete(lr);
        for (const [canonicalId, aliases] of mappedLegacyToCanonical.entries()) {
          if (aliases.includes(lr)) {
            selectedCanonicalRoles.delete(canonicalId);
          }
        }
        updateView();
      });
    });

    // Select All Roles button
    const selectAllRolesBtn = containerEl.querySelector('#btn-select-all-roles');
    if (selectAllRolesBtn) {
      selectAllRolesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isEditing && canonicalRoleMap.size > 0) {
          if (roleSearchQuery) {
            const q = roleSearchQuery.toLowerCase();
            canonicalRoleMap.forEach((roleDef, id) => {
              if (roleDef.displayName.toLowerCase().includes(q)) {
                selectedCanonicalRoles.add(id);
                selectedRoles.add(roleDef.displayName);
              }
            });
          } else {
            canonicalRoleMap.forEach((roleDef, id) => {
              selectedCanonicalRoles.add(id);
              if (!selectedRoles.has(roleDef.displayName)) {
                selectedRoles.add(roleDef.displayName);
              }
            });
          }
        } else {
          DEFAULT_ROLES.forEach((r) => selectedRoles.add(r));
        }
        updateView();
      });
    }

    // Clear All Roles button
    const clearAllRolesBtn = containerEl.querySelector('#btn-clear-all-roles');
    if (clearAllRolesBtn) {
      clearAllRolesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedCanonicalRoles.clear();
        selectedRoles.clear();
        updateView();
      });
    }

    // Dropdown toggle
    const browseRolesBtn = containerEl.querySelector('#btn-browse-roles');
    if (browseRolesBtn) {
      browseRolesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isRoleDropdownOpen = !isRoleDropdownOpen;
        updateView();
      });
    }

    // Role search interactions
    const roleSearchInput = containerEl.querySelector('#role-search-input');
    if (roleSearchInput) {
      roleSearchInput.value = roleSearchQuery;
      if (wasRoleSearchFocused) {
        roleSearchInput.focus();
        roleSearchInput.setSelectionRange(roleSearchQuery.length, roleSearchQuery.length);
      }
      roleSearchInput.addEventListener('input', (e) => {
        roleSearchQuery = e.target.value;
        if (roleSearchQuery) isRoleDropdownOpen = true;
        updateView();
      });
      roleSearchInput.addEventListener('click', (e) => e.stopPropagation());
    }

    // Close on escape or outside click
    handleDocClick = (e) => {
      const rolesContainer = containerEl.querySelector('#roles-hierarchy-container');
      const browseBtn = containerEl.querySelector('#btn-browse-roles');
      if (isRoleDropdownOpen && rolesContainer && browseBtn) {
        if (!rolesContainer.contains(e.target) && !browseBtn.contains(e.target)) {
          isRoleDropdownOpen = false;
          updateView();
        }
      }
    };
    handleDocKeydown = (e) => {
      if (e.key === 'Escape' && isRoleDropdownOpen) {
        isRoleDropdownOpen = false;
        updateView();
      }
    };

    if (!containerEl.dataset.roleDropdownEventsBound) {
      document.addEventListener('click', handleDocClick);
      document.addEventListener('keydown', handleDocKeydown);
      containerEl.dataset.roleDropdownEventsBound = 'true';
    }

    // Custom Role Add
    const addRoleBtn = containerEl.querySelector('#btn-add-custom-role');
    const roleInput = containerEl.querySelector('#custom-role-input');
    if (addRoleBtn && roleInput) {
      addRoleBtn.addEventListener('click', () => {
        const val = roleInput.value.trim();
        if (val) {
          selectedRoles.add(val);
          roleInput.value = '';
          updateView();
        }
      });
      roleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addRoleBtn.click();
        }
      });
    }

    // Location chip toggle
    containerEl.querySelectorAll('[data-location]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const loc = btn.getAttribute('data-location');
        if (selectedLocations.has(loc)) {
          selectedLocations.delete(loc);
        } else {
          selectedLocations.add(loc);
        }
        updateView();
      });
    });

    // Custom Location Add
    const addLocBtn = containerEl.querySelector('#btn-add-custom-loc');
    const locInput = containerEl.querySelector('#custom-loc-input');
    if (addLocBtn && locInput) {
      addLocBtn.addEventListener('click', () => {
        const val = locInput.value.trim();
        if (val) {
          selectedLocations.add(val);
          updateView();
        }
      });
      locInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addLocBtn.click();
        }
      });
    }

    // Workplace Pill Toggle
    containerEl.querySelectorAll('[data-workplace]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const wp = btn.getAttribute('data-workplace');
        if (selectedWorkplaces.has(wp)) {
          selectedWorkplaces.delete(wp);
        } else {
          selectedWorkplaces.add(wp);
        }
        updateView();
      });
    });

    // Experience Card Toggle
    containerEl.querySelectorAll('[data-exp]').forEach((card) => {
      card.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedExperience = card.getAttribute('data-exp');
        updateView();
      });
    });

    // Company Search
    const searchInput = containerEl.querySelector('#company-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        companySearchQuery = e.target.value;
        const grid = containerEl.querySelector('.company-grid');
        if (grid) {
          const totalCompanies = supportedCompanies.length || 41;
          const filtered = supportedCompanies.filter((c) => {
            if (!companySearchQuery) return true;
            const q = companySearchQuery.toLowerCase();
            return (
              c.name.toLowerCase().includes(q) ||
              (c.atsType && c.atsType.toLowerCase().includes(q))
            );
          });
          grid.innerHTML =
            filtered.length === 0
              ? '<div style="grid-column: 1 / -1; padding: 20px; text-align: center; color: #64748b;">No companies match your search.</div>'
              : filtered
                  .map(
                    (c) => `
                <div class="company-card ${selectedCompanyIds.has(c.id) ? 'is-selected' : ''}" data-company-id="${c.id}">
                  <input type="checkbox" ${selectedCompanyIds.has(c.id) ? 'checked' : ''} style="pointer-events: none;" />
                  <span class="company-card__name">${c.name}</span>
                  <span class="company-card__badge">${c.atsType}</span>
                </div>
              `
                  )
                  .join('');

          // Re-bind company cards
          grid.querySelectorAll('[data-company-id]').forEach((card) => {
            card.addEventListener('click', () => {
              const id = card.getAttribute('data-company-id');
              if (selectedCompanyIds.has(id)) {
                selectedCompanyIds.delete(id);
              } else {
                selectedCompanyIds.add(id);
              }
              updateView();
            });
          });
        }
      });
    }

    // Toggle All Companies button
    const toggleAllBtn = containerEl.querySelector('#btn-toggle-all-companies');
    if (toggleAllBtn) {
      toggleAllBtn.addEventListener('click', () => {
        if (selectedCompanyIds.size === 0) {
          // If in all companies mode, clicking can select all explicitly or do nothing
          selectedCompanyIds.clear();
        } else {
          // Clear all to return to 'All Companies' mode
          selectedCompanyIds.clear();
        }
        updateView();
      });
    }

    // Company Card Toggle
    containerEl.querySelectorAll('[data-company-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-company-id');
        if (selectedCompanyIds.has(id)) {
          selectedCompanyIds.delete(id);
        } else {
          selectedCompanyIds.add(id);
        }
        updateView();
      });
    });

    // Notification Checkboxes
    const emailAlertsCb = containerEl.querySelector('#pref-email-alerts');
    if (emailAlertsCb) {
      emailAlertsCb.addEventListener('change', () => {
        emailAlertsEnabled = emailAlertsCb.checked;
      });
    }
    const instantAlertsCb = containerEl.querySelector('#pref-instant-alerts');
    if (instantAlertsCb) {
      instantAlertsCb.addEventListener('change', () => {
        instantNotifications = instantAlertsCb.checked;
      });
    }
    const dailyDigestCb = containerEl.querySelector('#pref-daily-digest');
    if (dailyDigestCb) {
      dailyDigestCb.addEventListener('change', () => {
        dailyDigest = dailyDigestCb.checked;
      });
    }

    // Cancel Button (for editing)
    const cancelBtn = containerEl.querySelector('#btn-cancel-edit');
    if (cancelBtn && options.onCancel) {
      cancelBtn.addEventListener('click', options.onCancel);
    }

    // Submit Button
    const submitBtn = containerEl.querySelector('#btn-save-onboarding');
    const errorEl = containerEl.querySelector('#onboarding-error');

    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        if (isSaving || isDestroyed) return;
        isSaving = true;
        errorEl.style.display = 'none';

        // Calculate effective roles directly from explicitly selected canonical roles + custom roles
        const effectiveRoles = new Set(selectedRoles);
        selectedCanonicalRoles.forEach((id) => {
          const r = canonicalRoleMap.get(id);
          if (r && !effectiveRoles.has(r.displayName)) {
            effectiveRoles.add(r.displayName);
          }
        });

        if (effectiveRoles.size === 0 && selectedCanonicalRoles.size === 0) {
          errorEl.textContent = 'Please select or add at least one job role.';
          errorEl.style.display = 'block';
          isSaving = false;
          return;
        }

        if (selectedLocations.size === 0) {
          errorEl.textContent = 'Please select or add at least one preferred location.';
          errorEl.style.display = 'block';
          isSaving = false;
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving preferences...';

        try {
          const payload = {
            roles: Array.from(effectiveRoles),
            locations: Array.from(selectedLocations),
            workplaceTypes: Array.from(selectedWorkplaces),
            experienceLevel: selectedExperience,
            companyIds: Array.from(selectedCompanyIds),
            emailAlertsEnabled,
            instantNotifications,
            dailyDigest,
          };
          
          if (isEditing) {
            payload.canonicalRoles = Array.from(selectedCanonicalRoles);
          }

          // Save preferences to backend API
          const saved = await apiClient.savePreferences(payload);

          if (isDestroyed) return;

          // Save local mirror
          localStorage.setItem('roleradar_preferences', JSON.stringify(saved));
          localStorage.setItem('roleradar_onboarding_completed', 'true');

          if (options.onComplete) {
            options.onComplete(saved);
          } else {
            window.location.hash = '#/dashboard';
          }
        } catch (err) {
          if (isDestroyed) return;
          errorEl.textContent = err.message || 'Failed to save preferences. Please try again.';
          errorEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = isEditing ? 'Save Preferences' : 'Start Finding Jobs →';
        } finally {
          if (!isDestroyed) {
            isSaving = false;
          }
        }
      });
    }
  }

  updateView();

  return {
    destroy: () => {
      isDestroyed = true;
      isSaving = false;
      if (handleDocClick) document.removeEventListener('click', handleDocClick);
      if (handleDocKeydown) document.removeEventListener('keydown', handleDocKeydown);
      if (containerEl) {
        delete containerEl.dataset.roleDropdownEventsBound;
      }
    },
  };
}

/**
 * Render the preference summary shell inside the dashboard.
 */
export function renderDashboardPreferencesSummary(containerEl, preferences, onEdit) {
  if (!preferences) return;

  const roles = preferences.roles || preferences.roleKeywords || [];
  const locations = preferences.locations || preferences.preferredLocations || [];
  const workplaceTypes = preferences.workplaceTypes || preferences.workplace_types || [];
  const exp = preferences.experienceLevel || preferences.experience_level || 'FRESHER';
  const companyIds = preferences.companyIds || preferences.company_ids || [];
  const isAllCompanies = companyIds.length === 0;

  const workplaceText =
    workplaceTypes.length === 0
      ? 'On-site · Hybrid · Remote (Any)'
      : workplaceTypes.map((w) => (w === 'ONSITE' ? 'On-site' : w === 'HYBRID' ? 'Hybrid' : 'Remote')).join(' · ');

  const html = `
    <div class="prefs-summary-card">
      <div class="prefs-summary-header">
        <span class="prefs-summary-title">🎯 Your Job Matching Profile</span>
        <button type="button" id="btn-edit-prefs" class="kn-btn kn-btn--secondary" style="font-size: 0.85rem; padding: 0.35rem 0.85rem;">
          ✏️ Edit Preferences
        </button>
      </div>

      <div class="prefs-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px;">
        <div class="prefs-item">
          <div class="prefs-item__label">Target Roles</div>
          <div class="prefs-item__content">
            ${roles.map((r) => `<span class="tag-badge">${r}</span>`).join('')}
          </div>
        </div>

        <div class="prefs-item">
          <div class="prefs-item__label">Locations</div>
          <div class="prefs-item__content">
            ${locations.map((l) => `<span class="tag-badge">${l}</span>`).join('')}
          </div>
        </div>

        <div class="prefs-item">
          <div class="prefs-item__label">Workplace</div>
          <div class="prefs-item__content">
            <span class="tag-badge">🏢 ${workplaceText}</span>
          </div>
        </div>

        <div class="prefs-item">
          <div class="prefs-item__label">Experience Level</div>
          <div class="prefs-item__content">
            <span class="tag-badge ${exp === 'FRESHER' ? 'badge-exp-fresher' : 'badge-exp-exp'}">
              ${exp === 'FRESHER' ? '🌱 Fresher / Entry-Level' : '💼 Experienced'}
            </span>
          </div>
        </div>

        <div class="prefs-item">
          <div class="prefs-item__label">Company Scope</div>
          <div class="prefs-item__content">
            <span class="tag-badge ${isAllCompanies ? 'badge-scope-all' : ''}">
              ${isAllCompanies ? '🌐 All Active Companies (41)' : `🏢 ${companyIds.length} Selected`}
            </span>
          </div>
        </div>
      </div>
    </div>
  `;

  containerEl.innerHTML = html;

  const editBtn = containerEl.querySelector('#btn-edit-prefs');
  if (editBtn && onEdit) {
    editBtn.addEventListener('click', onEdit);
  }
}
