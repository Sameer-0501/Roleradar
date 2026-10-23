/**
 * RoleRadar Verified Jobs Sub-Page View.
 *
 * Encapsulates the verified jobs directory (#/dashboard/verified-jobs),
 * natural-language and keyword search intelligence with autocomplete suggestions,
 * multi-dimensional filtering (role, sort, workplace, freshness, verified today),
 * candidate workspace actions (save, apply, dismiss), pagination, and 60-second polling.
 */

import {
  jobsService,
  workspaceService,
  type Job,
  type SearchSuggestionItem,
} from '../../services/api/index.js';
import {
  renderSidebar,
  verifiedJobCardHtml,
  defaultOpenJobDetailModal,
  escapeHtml,
  loadingHtml,
  emptyStateHtml,
  errorStateHtml,
} from './DashboardView.js';

export interface VerifiedJobsViewOptions {
  container: HTMLElement;
  routePath?: string;
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  onNavigate?: (route: string) => void;
  onLogout?: () => void;
  openJobDetailModal?: (jobId: string, onStateChange?: (action: string, id: string, val: boolean) => void) => void;
}

export interface VerifiedJobsViewController {
  destroy: () => void;
}

interface VerifiedJobsFilterState {
  page: number;
  limit: number;
  sort: string;
  q: string;
  roleFilter: string;
  workplace: string;
  freshness: string;
  isToday: boolean;
}

export function mountVerifiedJobsView(options: VerifiedJobsViewOptions): VerifiedJobsViewController {
  const {
    container,
    routePath = 'dashboard/verified-jobs',
    showToast = (msg: string) => { console.log(msg); },
    onLogout = () => { if (typeof window !== 'undefined') window.location.hash = '#/login'; },
    openJobDetailModal = defaultOpenJobDetailModal,
  } = options;

  let isDestroyed = false;
  let isFetching = false;
  let activePollTimer: ReturnType<typeof setInterval> | null = null;
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;
  const boundListeners: Array<{ target: EventTarget; event: string; handler: EventListenerOrEventListenerObject }> = [];

  function addTrackedListener(target: EventTarget, event: string, handler: EventListenerOrEventListenerObject): void {
    target.addEventListener(event, handler);
    boundListeners.push({ target, event, handler });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Initial DOM Layout Rendering
  // ───────────────────────────────────────────────────────────────────────────
  container.innerHTML = (
    '<div class="app-dashboard-layout">' +
      renderSidebar(routePath) +
      '<div class="app-dashboard-main">' +
        '<div class="app-verified-jobs">' +
          '<div class="vjp__header">' +
            '<div>' +
              '<h1 class="kn-heading-1">Verified Jobs</h1>' +
              '<p class="vjp__subtitle">Only active, verified listings from official company career portals — ranked by relevance.</p>' +
            '</div>' +
            '<a href="#/preferences" class="kn-btn kn-btn--secondary">✏️ Edit Preferences</a>' +
          '</div>' +

          '<!-- Phase 12 Search Intelligence Toolbar -->' +
          '<div class="vjp__toolbar" id="vjp-toolbar">' +
            '<div class="vjp__search-wrap" style="position:relative; flex:1;">' +
              '<input type="search" id="vjp-search-input" class="kn-input vjp__search-input" placeholder="🔍 Search naturally (e.g. \'fresher java developer in Bangalore\', \'finance analyst Mumbai\')..." autocomplete="off" />' +
              '<div id="vjp-suggestions" class="vjp__suggestions-dropdown" style="display:none;"></div>' +
            '</div>' +
            '<div class="vjp__filter-controls">' +
              '<div class="vjp__control-group">' +
                '<label for="vjp-role-select" class="vjp__control-label">Role:</label>' +
                '<select id="vjp-role-select" class="kn-select vjp__select">' +
                  '<option value="ALL" selected>All Roles</option>' +
                '</select>' +
              '</div>' +
              '<div class="vjp__control-group">' +
                '<label for="vjp-sort-select" class="vjp__control-label">Sort:</label>' +
                '<select id="vjp-sort-select" class="kn-select vjp__select">' +
                  '<option value="BEST_MATCH" selected>🎯 Best Match</option>' +
                  '<option value="NEWEST">⚡ Newest First</option>' +
                  '<option value="MOST_RELEVANT">🎯 Most Relevant</option>' +
                  '<option value="RECENTLY_VERIFIED">🕒 Recently Verified</option>' +
                '</select>' +
              '</div>' +
              '<div class="vjp__control-group">' +
                '<label for="vjp-workplace-select" class="vjp__control-label">Workplace:</label>' +
                '<select id="vjp-workplace-select" class="kn-select vjp__select">' +
                  '<option value="ANY" selected>All Workplaces</option>' +
                  '<option value="ONSITE">🏢 On-site</option>' +
                  '<option value="HYBRID">🏢 Hybrid</option>' +
                  '<option value="REMOTE">🌐 Remote</option>' +
                '</select>' +
              '</div>' +
              '<div class="vjp__control-group">' +
                '<label for="vjp-freshness-select" class="vjp__control-label">Freshness:</label>' +
                '<select id="vjp-freshness-select" class="kn-select vjp__select">' +
                  '<option value="ALL" selected>All Verified</option>' +
                  '<option value="FRESH">🟢 Fresh (&le; 48h)</option>' +
                  '<option value="RECENT">🕐 Recent (&le; 7d)</option>' +
                '</select>' +
              '</div>' +
              '<div class="vjp__control-group" style="margin-top: 24px;">' +
                '<button type="button" id="btn-today-filter" class="kn-btn kn-btn--secondary">📅 Today\'s Verified Jobs</button>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div id="vjp-intent-bar" class="vjp__intent-bar" style="display:none;"></div>' +
          '<div id="vjp-feed">' + loadingHtml('Finding verified jobs matching your profile...') + '</div>' +
          '<div id="vjp-pagination" class="vjp__pagination"></div>' +
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

  // Populate Role Select from User Preferences
  const roleSelect = container.querySelector<HTMLSelectElement>('#vjp-role-select');
  if (roleSelect && typeof localStorage !== 'undefined') {
    try {
      const rawPrefs = localStorage.getItem('roleradar_preferences');
      if (rawPrefs) {
        const prefs = JSON.parse(rawPrefs);
        const roles: string[] = prefs.roles || prefs.roleKeywords || [];
        if (Array.isArray(roles) && roles.length > 0) {
          roles.forEach((r) => {
            const opt = document.createElement('option');
            opt.value = r;
            opt.textContent = r;
            roleSelect.appendChild(opt);
          });
        }
      }
    } catch (e) {
      console.error('Failed to load roles for select', e);
    }
  }

  // View state defaults
  const state: VerifiedJobsFilterState = {
    page: 1,
    limit: 15,
    sort: 'BEST_MATCH',
    q: '',
    roleFilter: 'ALL',
    workplace: 'ANY',
    freshness: 'ALL',
    isToday: false,
  };

  const feedEl = container.querySelector<HTMLElement>('#vjp-feed');
  const paginationEl = container.querySelector<HTMLElement>('#vjp-pagination');
  const searchInput = container.querySelector<HTMLInputElement>('#vjp-search-input');
  const suggestionsEl = container.querySelector<HTMLElement>('#vjp-suggestions');
  const intentBarEl = container.querySelector<HTMLElement>('#vjp-intent-bar');
  const sortSelect = container.querySelector<HTMLSelectElement>('#vjp-sort-select');
  const workplaceSelect = container.querySelector<HTMLSelectElement>('#vjp-workplace-select');
  const freshnessSelect = container.querySelector<HTMLSelectElement>('#vjp-freshness-select');
  const todayBtn = container.querySelector<HTMLElement>('#btn-today-filter');

  // ───────────────────────────────────────────────────────────────────────────
  // Helper: Bind Interactive Job Card Actions (Save, Apply, Dismiss, Details)
  // ───────────────────────────────────────────────────────────────────────────
  const bindJobCardActions = (scopeContainer: HTMLElement): void => {
    if (!scopeContainer || isDestroyed) return;

    // Save / Unsave Toggle
    scopeContainer.querySelectorAll<HTMLElement>('[data-job-save-id]').forEach((btn) => {
      const handleSave = async (e: Event) => {
        e.stopPropagation();
        const jobId = btn.getAttribute('data-job-save-id');
        if (!jobId || isDestroyed) return;
        const isSaved = btn.classList.contains('vjc__btn-action--saved');
        btn.setAttribute('disabled', 'true');

        try {
          if (isSaved) {
            await workspaceService.unsaveJob(jobId);
            if (isDestroyed) return;
            btn.classList.remove('vjc__btn-action--saved');
            btn.textContent = '♡ Save';
            btn.setAttribute('aria-pressed', 'false');
            showToast('Job removed from saved list', 'info');
          } else {
            await workspaceService.saveJob(jobId);
            if (isDestroyed) return;
            btn.classList.add('vjc__btn-action--saved');
            btn.textContent = '♥ Saved';
            btn.setAttribute('aria-pressed', 'true');
            showToast('Job saved to your workspace!', 'success');
          }
        } catch (err) {
          showToast('Failed to update saved state', 'error');
        } finally {
          btn.removeAttribute('disabled');
        }
      };
      addTrackedListener(btn, 'click', handleSave);
    });

    // Mark Applied / Undo Applied Toggle
    scopeContainer.querySelectorAll<HTMLElement>('[data-job-apply-id]').forEach((btn) => {
      const handleApply = async (e: Event) => {
        e.stopPropagation();
        const jobId = btn.getAttribute('data-job-apply-id');
        if (!jobId || isDestroyed) return;
        const isApplied = btn.classList.contains('vjc__btn-action--applied');
        btn.setAttribute('disabled', 'true');

        try {
          if (isApplied) {
            await workspaceService.unmarkJobApplied(jobId);
            if (isDestroyed) return;
            btn.classList.remove('vjc__btn-action--applied');
            btn.textContent = 'Mark Applied';
            btn.setAttribute('aria-pressed', 'false');
            showToast('Application record undone', 'info');
          } else {
            await workspaceService.markJobApplied(jobId);
            if (isDestroyed) return;
            btn.classList.add('vjc__btn-action--applied');
            btn.textContent = '✓ Applied';
            btn.setAttribute('aria-pressed', 'true');
            showToast('Job marked as applied! Tracked in workspace.', 'success');
          }
        } catch (err) {
          showToast('Failed to update application state', 'error');
        } finally {
          btn.removeAttribute('disabled');
        }
      };
      addTrackedListener(btn, 'click', handleApply);
    });

    // Dismiss (Hide) Action
    scopeContainer.querySelectorAll<HTMLElement>('[data-job-dismiss-id]').forEach((btn) => {
      const handleDismiss = async (e: Event) => {
        e.stopPropagation();
        const jobId = btn.getAttribute('data-job-dismiss-id');
        if (!jobId || isDestroyed) return;
        btn.setAttribute('disabled', 'true');

        try {
          await workspaceService.dismissJob(jobId);
          if (isDestroyed) return;
          const card = container.querySelector<HTMLElement>('#job-card-' + jobId);
          if (card) {
            card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.95)';
            setTimeout(() => {
              if (card && card.parentNode) card.parentNode.removeChild(card);
            }, 250);
          }
          showToast('Job hidden from feed. You can restore it in Hidden Jobs.', 'info');
        } catch (err) {
          btn.removeAttribute('disabled');
          showToast('Failed to hide job', 'error');
        }
      };
      addTrackedListener(btn, 'click', handleDismiss);
    });

    // Details Modal Action
    scopeContainer.querySelectorAll<HTMLElement>('[data-job-detail-id]').forEach((btn) => {
      const handleDetail = (e: Event) => {
        e.stopPropagation();
        const jId = btn.getAttribute('data-job-detail-id');
        if (!jId || isDestroyed) return;
        openJobDetailModal(jId);
      };
      addTrackedListener(btn, 'click', handleDetail);
    });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Feed Fetching & Rendering
  // ───────────────────────────────────────────────────────────────────────────
  const fetchJobs = async (showLoading: boolean): Promise<void> => {
    if (isFetching || isDestroyed || !feedEl) return;
    isFetching = true;

    try {
      if (showLoading) {
        feedEl.innerHTML = loadingHtml('Finding verified jobs matching your profile...');
      }

      const data = await jobsService.getMatchedJobs(state);
      if (isDestroyed) return;

      const matches = data.jobs || [];
      const totalMatches = data.totalMatches !== undefined
        ? data.totalMatches
        : (data.pagination ? data.pagination.total : matches.length);
      const totalPages = Math.ceil(totalMatches / state.limit) || 1;

      // Render Interpreted Search Intent Bar
      if (intentBarEl) {
        if (data.searchIntent && data.searchIntent.isNaturalLanguage) {
          const intentPills: string[] = [];
          const si = data.searchIntent;
          if (si.experienceLevel) {
            intentPills.push('<span class="vjp__intent-pill">🎓 ' + escapeHtml(si.experienceLevel) + '</span>');
          }
          if (si.roles && si.roles.length > 0) {
            intentPills.push('<span class="vjp__intent-pill">🎯 ' + escapeHtml(si.roles.join(', ')) + '</span>');
          }
          if (si.skills && si.skills.length > 0) {
            intentPills.push('<span class="vjp__intent-pill">💻 ' + escapeHtml(si.skills.join(', ')) + '</span>');
          }
          if (si.locations && si.locations.length > 0) {
            intentPills.push('<span class="vjp__intent-pill">📍 ' + escapeHtml(si.locations.join(', ')) + '</span>');
          } else if (si.country) {
            intentPills.push('<span class="vjp__intent-pill">🌍 ' + escapeHtml(si.country) + '</span>');
          }
          if (si.workplaceTypes && si.workplaceTypes.length > 0) {
            intentPills.push('<span class="vjp__intent-pill">🏢 ' + escapeHtml(si.workplaceTypes.join('/')) + '</span>');
          }
          intentBarEl.innerHTML = '<div class="vjp__intent-inner"><span class="vjp__intent-label">Interpreted Intent:</span>' + intentPills.join('') + '</div>';
          intentBarEl.style.display = 'block';
        } else {
          intentBarEl.style.display = 'none';
        }
      }

      // Handle Empty Matches
      if (matches.length === 0) {
        const actionChips =
          '<div class="vjp__empty-actions">' +
            '<button type="button" class="kn-btn kn-btn--secondary" id="btn-empty-reset">🔄 Reset Filters</button>' +
            '<button type="button" class="kn-btn kn-btn--secondary" id="btn-empty-remote">🌐 Try Remote / Hybrid</button>' +
            '<a href="#/preferences" class="kn-btn kn-btn--secondary">✏️ Edit Preferences</a>' +
          '</div>';

        feedEl.innerHTML = emptyStateHtml(
          '🔍',
          'No Verified Jobs Match Current Filters',
          'We didn\'t find any active verified listings matching your current filter criteria.',
          actionChips
        );

        const resetBtn = container.querySelector<HTMLElement>('#btn-empty-reset');
        if (resetBtn) {
          addTrackedListener(resetBtn, 'click', () => {
            if (searchInput) searchInput.value = '';
            if (sortSelect) sortSelect.value = 'BEST_MATCH';
            if (workplaceSelect) workplaceSelect.value = 'ANY';
            if (freshnessSelect) freshnessSelect.value = 'ALL';
            if (roleSelect) roleSelect.value = 'ALL';
            state.q = '';
            state.sort = 'BEST_MATCH';
            state.workplace = 'ANY';
            state.freshness = 'ALL';
            state.roleFilter = 'ALL';
            state.page = 1;
            void fetchJobs(true);
          });
        }

        const tryRemoteBtn = container.querySelector<HTMLElement>('#btn-empty-remote');
        if (tryRemoteBtn) {
          addTrackedListener(tryRemoteBtn, 'click', () => {
            if (workplaceSelect) workplaceSelect.value = 'REMOTE';
            state.workplace = 'REMOTE';
            state.page = 1;
            void fetchJobs(true);
          });
        }

        if (paginationEl) paginationEl.innerHTML = '';
        return;
      }

      // Populated Feed Rendering
      const cardsHtml = matches.map((job: Job) => {
        return verifiedJobCardHtml(job, { context: 'feed', showVerifiedToday: state.isToday });
      }).join('');

      const totalInfo =
        '<div class="vjp__results-header">' +
          '<p class="vjp__total">Showing ' + matches.length + ' of ' + totalMatches + ' verified job matches</p>' +
        '</div>';

      feedEl.innerHTML = totalInfo + cardsHtml;
      bindJobCardActions(feedEl);

      // Render Pagination
      if (paginationEl) {
        if (totalPages > 1) {
          const prevDisabled = state.page <= 1 ? 'disabled' : '';
          const nextDisabled = state.page >= totalPages ? 'disabled' : '';
          paginationEl.innerHTML = (
            '<button type="button" class="kn-btn kn-btn--secondary vjp__page-btn" id="vjp-prev-page" ' + prevDisabled + '>« Previous</button>' +
            '<span class="vjp__page-indicator">Page ' + state.page + ' of ' + totalPages + '</span>' +
            '<button type="button" class="kn-btn kn-btn--secondary vjp__page-btn" id="vjp-next-page" ' + nextDisabled + '>Next »</button>'
          );

          const prevBtn = paginationEl.querySelector<HTMLElement>('#vjp-prev-page');
          const nextBtn = paginationEl.querySelector<HTMLElement>('#vjp-next-page');
          if (prevBtn && state.page > 1) {
            addTrackedListener(prevBtn, 'click', () => {
              state.page -= 1;
              void fetchJobs(true);
            });
          }
          if (nextBtn && state.page < totalPages) {
            addTrackedListener(nextBtn, 'click', () => {
              state.page += 1;
              void fetchJobs(true);
            });
          }
        } else {
          paginationEl.innerHTML = '';
        }
      }
    } catch (err: any) {
      if (isDestroyed) return;
      if (showLoading) {
        const errorMsg = err?.message || String(err);
        feedEl.innerHTML = errorStateHtml('Failed to load verified jobs. Error: ' + escapeHtml(errorMsg), 'btn-retry-vjp');
        const retryBtn = container.querySelector<HTMLElement>('#btn-retry-vjp');
        if (retryBtn) {
          addTrackedListener(retryBtn, 'click', () => {
            void fetchJobs(true);
          });
        }
      }
    } finally {
      isFetching = false;
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Search Input & Suggestions
  // ───────────────────────────────────────────────────────────────────────────
  if (searchInput) {
    addTrackedListener(searchInput, 'input', (e: Event) => {
      const target = e.target as HTMLInputElement;
      const query = (target.value || '').trim();
      if (searchTimeout) clearTimeout(searchTimeout);

      if (suggestionsEl && query.length >= 2) {
        jobsService.getSearchSuggestions(query, 6).then((suggestions: SearchSuggestionItem[]) => {
          if (isDestroyed) return;
          if (suggestions && suggestions.length > 0) {
            const suggHtml = suggestions.map((s) => {
              const text = typeof s === 'string' ? s : s.text;
              const badge = typeof s === 'string' ? '' : (s.badge || '');
              const badgeHtml = badge ? '<span class="vjp__sugg-badge">' + escapeHtml(badge) + '</span>' : '';
              return (
                '<div class="vjp__sugg-item" data-query="' + escapeHtml(text) + '">' +
                  '<span class="vjp__sugg-icon">🔍</span>' +
                  '<span class="vjp__sugg-text">' + escapeHtml(text) + '</span>' +
                  badgeHtml +
                '</div>'
              );
            }).join('');

            suggestionsEl.innerHTML = suggHtml;
            suggestionsEl.style.display = 'block';

            // Bind click on suggestion items
            suggestionsEl.querySelectorAll<HTMLElement>('.vjp__sugg-item').forEach((item) => {
              addTrackedListener(item, 'click', () => {
                const qVal = item.getAttribute('data-query') || '';
                searchInput.value = qVal;
                suggestionsEl.style.display = 'none';
                state.q = qVal;
                state.page = 1;
                void fetchJobs(true);
              });
            });
          } else {
            suggestionsEl.style.display = 'none';
          }
        }).catch(() => {
          if (suggestionsEl) suggestionsEl.style.display = 'none';
        });
      } else if (suggestionsEl) {
        suggestionsEl.style.display = 'none';
      }

      searchTimeout = setTimeout(() => {
        if (isDestroyed) return;
        state.q = query;
        state.page = 1;
        void fetchJobs(true);
      }, 300);
    });

    // Hide suggestions on outside click
    if (typeof document !== 'undefined') {
      const handleOutsideClick = (e: Event) => {
        if (
          suggestionsEl &&
          suggestionsEl.style.display !== 'none' &&
          !searchInput.contains(e.target as Node) &&
          !suggestionsEl.contains(e.target as Node)
        ) {
          suggestionsEl.style.display = 'none';
        }
      };
      addTrackedListener(document, 'click', handleOutsideClick);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Filter Dropdown & Button Handlers
  // ───────────────────────────────────────────────────────────────────────────
  if (roleSelect) {
    addTrackedListener(roleSelect, 'change', (e: Event) => {
      state.roleFilter = (e.target as HTMLSelectElement).value;
      state.page = 1;
      void fetchJobs(true);
    });
  }

  if (sortSelect) {
    addTrackedListener(sortSelect, 'change', (e: Event) => {
      state.sort = (e.target as HTMLSelectElement).value;
      state.page = 1;
      void fetchJobs(true);
    });
  }

  if (workplaceSelect) {
    addTrackedListener(workplaceSelect, 'change', (e: Event) => {
      state.workplace = (e.target as HTMLSelectElement).value;
      state.page = 1;
      void fetchJobs(true);
    });
  }

  if (freshnessSelect) {
    addTrackedListener(freshnessSelect, 'change', (e: Event) => {
      state.freshness = (e.target as HTMLSelectElement).value;
      state.page = 1;
      void fetchJobs(true);
    });
  }

  if (todayBtn) {
    addTrackedListener(todayBtn, 'click', () => {
      state.isToday = !state.isToday;
      if (state.isToday) {
        todayBtn.classList.add('kn-btn--primary');
        todayBtn.classList.remove('kn-btn--secondary');
      } else {
        todayBtn.classList.remove('kn-btn--primary');
        todayBtn.classList.add('kn-btn--secondary');
      }
      state.page = 1;
      void fetchJobs(true);
    });
  }

  // Initial feed retrieval
  void fetchJobs(true);

  // Visibility-aware background polling
  activePollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (isDestroyed || !container.querySelector('#vjp-feed')) {
      if (activePollTimer) {
        clearInterval(activePollTimer);
        activePollTimer = null;
      }
      return;
    }
    void fetchJobs(false);
  }, 60000);

  // ───────────────────────────────────────────────────────────────────────────
  // Teardown & Lifecycle Controller
  // ───────────────────────────────────────────────────────────────────────────
  return {
    destroy: () => {
      if (isDestroyed) return;
      isDestroyed = true;

      if (activePollTimer) {
        clearInterval(activePollTimer);
        activePollTimer = null;
      }

      if (searchTimeout) {
        clearTimeout(searchTimeout);
        searchTimeout = null;
      }

      boundListeners.forEach(({ target, event, handler }) => {
        try {
          target.removeEventListener(event, handler);
        } catch (e) {}
      });
      boundListeners.length = 0;
    },
  };
}
