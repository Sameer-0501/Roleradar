/**
 * RoleRadar Saved Jobs Workspace View.
 *
 * Encapsulates the candidate's bookmarked jobs directory (#/dashboard/saved),
 * keyword filtering, status & application filtering, saved-job removal/undo,
 * official job detail modal triggers, and pagination with strict lifecycle management.
 */

import {
  workspaceService,
  type Job,
  type WorkspaceListOptions,
} from '../../services/api/index.js';
import {
  renderSidebar,
  verifiedJobCardHtml,
  defaultOpenJobDetailModal,
  loadingHtml,
  emptyStateHtml,
  errorStateHtml,
} from '../dashboard/DashboardView.js';

export interface SavedJobsViewOptions {
  container: HTMLElement;
  routePath?: string;
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  onNavigate?: (route: string) => void;
  onLogout?: () => void;
  openJobDetailModal?: (jobId: string, onStateChange?: (action: string, id: string, val: boolean) => void) => void;
}

export interface SavedJobsViewController {
  destroy: () => void;
}

interface SavedJobsFilterState extends WorkspaceListOptions {
  page: number;
  limit: number;
  status: string;
  applied: string;
  q: string;
}

export function mountSavedJobsView(options: SavedJobsViewOptions): SavedJobsViewController {
  const {
    container,
    routePath = 'dashboard/saved',
    showToast = (msg: string) => { console.log(msg); },
    onLogout = () => { if (typeof window !== 'undefined') window.location.hash = '#/login'; },
    openJobDetailModal = defaultOpenJobDetailModal,
  } = options;

  let isDestroyed = false;
  let isFetching = false;
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
        '<div class="app-saved-jobs">' +
          '<div class="vjp__header">' +
            '<div>' +
              '<h1 class="kn-heading-1">Saved Jobs</h1>' +
              '<p class="vjp__subtitle">Positions bookmarked for later review. Closed listings remain for your records.</p>' +
            '</div>' +
            '<a href="#/dashboard/verified-jobs" class="kn-btn kn-btn--secondary">Explore Verified Feed →</a>' +
          '</div>' +

          '<div class="workspace-toolbar" id="saved-toolbar">' +
            '<div class="workspace-toolbar__search">' +
              '<input type="search" id="saved-search-input" class="kn-input" placeholder="🔍 Search saved jobs by title, company, or location..." />' +
            '</div>' +
            '<div class="workspace-toolbar__filters">' +
              '<label for="saved-status-select" class="workspace-toolbar__label">Status:</label>' +
              '<select id="saved-status-select" class="kn-select workspace-toolbar__select">' +
                '<option value="ALL" selected>All Statuses</option>' +
                '<option value="ACTIVE">🟢 Active Only</option>' +
                '<option value="CLOSED">⚠ Closed Only</option>' +
              '</select>' +
              '<label for="saved-applied-select" class="workspace-toolbar__label">Application:</label>' +
              '<select id="saved-applied-select" class="kn-select workspace-toolbar__select">' +
                '<option value="ALL" selected>All</option>' +
                '<option value="APPLIED">✓ Applied</option>' +
                '<option value="NOT_APPLIED">Unapplied</option>' +
              '</select>' +
            '</div>' +
          '</div>' +

          '<div id="saved-feed">' + loadingHtml('Loading saved jobs...') + '</div>' +
          '<div id="saved-pagination" class="vjp__pagination"></div>' +
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

  // View filter state
  const state: SavedJobsFilterState = {
    page: 1,
    limit: 15,
    status: 'ALL',
    applied: 'ALL',
    q: '',
  };

  const feedEl = container.querySelector<HTMLElement>('#saved-feed');
  const paginationEl = container.querySelector<HTMLElement>('#saved-pagination');
  const searchInput = container.querySelector<HTMLInputElement>('#saved-search-input');
  const statusSelect = container.querySelector<HTMLSelectElement>('#saved-status-select');
  const appliedSelect = container.querySelector<HTMLSelectElement>('#saved-applied-select');

  // ───────────────────────────────────────────────────────────────────────────
  // Helper: Bind Interactive Job Card Actions (Save/Unsave, Apply, Dismiss, Details)
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
            // Refresh list to update workspace view
            void fetchSaved(false);
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
        openJobDetailModal(jId, (action) => {
          if (action === 'save') {
            void fetchSaved(false);
          }
        });
      };
      addTrackedListener(btn, 'click', handleDetail);
    });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Feed Fetching & Rendering
  // ───────────────────────────────────────────────────────────────────────────
  const fetchSaved = async (showLoading: boolean): Promise<void> => {
    if (isFetching || isDestroyed || !feedEl) return;
    isFetching = true;

    try {
      if (showLoading) {
        feedEl.innerHTML = loadingHtml('Loading saved jobs...');
      }

      const data = await workspaceService.getSavedJobs(state);
      if (isDestroyed) return;

      const items: Job[] = (data.items || data.jobs || []) as Job[];
      const total = data.total !== undefined ? data.total : (data.pagination ? data.pagination.total : items.length);
      const totalPages = data.totalPages || Math.ceil(total / state.limit) || 1;

      // Empty State
      if (items.length === 0) {
        feedEl.innerHTML = emptyStateHtml(
          '♥',
          'No Saved Jobs Found',
          'Save jobs you want to revisit later from the verified job feed or search results.',
          '<a href="#/dashboard/verified-jobs" class="kn-btn kn-btn--primary">Browse Verified Jobs →</a>'
        );
        if (paginationEl) paginationEl.innerHTML = '';
        return;
      }

      // Populated Feed
      const cardsHtml = items.map((job) => {
        return verifiedJobCardHtml(job, { context: 'saved' });
      }).join('');

      const totalInfo =
        '<div class="vjp__results-header">' +
          '<p class="vjp__total">Showing ' + items.length + ' of ' + total + ' saved job' + (total !== 1 ? 's' : '') + '</p>' +
        '</div>';

      feedEl.innerHTML = totalInfo + cardsHtml;
      bindJobCardActions(feedEl);

      // Pagination Controls
      if (paginationEl) {
        if (totalPages > 1) {
          const prevDisabled = state.page <= 1 ? 'disabled' : '';
          const nextDisabled = state.page >= totalPages ? 'disabled' : '';
          paginationEl.innerHTML = (
            '<button type="button" class="kn-btn kn-btn--secondary vjp__page-btn" id="saved-prev-page" ' + prevDisabled + '>« Previous</button>' +
            '<span class="vjp__page-indicator">Page ' + state.page + ' of ' + totalPages + '</span>' +
            '<button type="button" class="kn-btn kn-btn--secondary vjp__page-btn" id="saved-next-page" ' + nextDisabled + '>Next »</button>'
          );

          const prevBtn = paginationEl.querySelector<HTMLElement>('#saved-prev-page');
          const nextBtn = paginationEl.querySelector<HTMLElement>('#saved-next-page');
          if (prevBtn && state.page > 1) {
            addTrackedListener(prevBtn, 'click', () => {
              state.page -= 1;
              void fetchSaved(true);
            });
          }
          if (nextBtn && state.page < totalPages) {
            addTrackedListener(nextBtn, 'click', () => {
              state.page += 1;
              void fetchSaved(true);
            });
          }
        } else {
          paginationEl.innerHTML = '';
        }
      }
    } catch (err) {
      if (isDestroyed) return;
      if (showLoading) {
        feedEl.innerHTML = errorStateHtml('Failed to load saved jobs.', 'btn-retry-saved');
        const retryBtn = container.querySelector<HTMLElement>('#btn-retry-saved');
        if (retryBtn) {
          addTrackedListener(retryBtn, 'click', () => {
            void fetchSaved(true);
          });
        }
      }
    } finally {
      isFetching = false;
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Search & Filter Listeners
  // ───────────────────────────────────────────────────────────────────────────
  if (searchInput) {
    addTrackedListener(searchInput, 'input', (e: Event) => {
      if (searchTimeout) clearTimeout(searchTimeout);
      const val = ((e.target as HTMLInputElement).value || '').trim();
      searchTimeout = setTimeout(() => {
        if (isDestroyed) return;
        state.q = val;
        state.page = 1;
        void fetchSaved(true);
      }, 300);
    });
  }

  if (statusSelect) {
    addTrackedListener(statusSelect, 'change', (e: Event) => {
      state.status = (e.target as HTMLSelectElement).value;
      state.page = 1;
      void fetchSaved(true);
    });
  }

  if (appliedSelect) {
    addTrackedListener(appliedSelect, 'change', (e: Event) => {
      state.applied = (e.target as HTMLSelectElement).value;
      state.page = 1;
      void fetchSaved(true);
    });
  }

  // Initial load
  void fetchSaved(true);

  // ───────────────────────────────────────────────────────────────────────────
  // Teardown & Lifecycle Controller
  // ───────────────────────────────────────────────────────────────────────────
  return {
    destroy: () => {
      if (isDestroyed) return;
      isDestroyed = true;

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
