/**
 * RoleRadar Hidden Jobs Workspace View.
 *
 * Encapsulates candidate dismissed jobs management (#/dashboard/dismissed),
 * search filtering, restoring dismissed jobs to active discovery feed,
 * verified employer portal links, job detail modals, and pagination with strict lifecycle teardown.
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

export interface HiddenJobsViewOptions {
  container: HTMLElement;
  routePath?: string;
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
  onNavigate?: (route: string) => void;
  onLogout?: () => void;
  openJobDetailModal?: (jobId: string, onStateChange?: (action: string, id: string, val: boolean) => void) => void;
}

export interface HiddenJobsViewController {
  destroy: () => void;
}

export interface HiddenJobsFilterState extends WorkspaceListOptions {
  page: number;
  limit: number;
  q: string;
}

export function mountHiddenJobsView(options: HiddenJobsViewOptions): HiddenJobsViewController {
  const {
    container,
    routePath = 'dashboard/dismissed',
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
        '<div class="app-dismissed-jobs">' +
          '<div class="vjp__header">' +
            '<div>' +
              '<h1 class="kn-heading-1">Hidden Jobs</h1>' +
              '<p class="vjp__subtitle">Positions you dismissed from your feed. You can restore them anytime.</p>' +
            '</div>' +
            '<a href="#/dashboard/verified-jobs" class="kn-btn kn-btn--secondary">Back to Feed →</a>' +
          '</div>' +

          '<div class="workspace-toolbar" id="dismissed-toolbar">' +
            '<div class="workspace-toolbar__search">' +
              '<input type="search" id="dismissed-search-input" class="kn-input" placeholder="🔍 Search hidden jobs..." />' +
            '</div>' +
          '</div>' +

          '<div id="dismissed-feed">' + loadingHtml('Loading hidden jobs...') + '</div>' +
          '<div id="dismissed-pagination" class="vjp__pagination"></div>' +
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
  const state: HiddenJobsFilterState = {
    page: 1,
    limit: 15,
    q: '',
  };

  const feedEl = container.querySelector<HTMLElement>('#dismissed-feed');
  const paginationEl = container.querySelector<HTMLElement>('#dismissed-pagination');
  const searchInput = container.querySelector<HTMLInputElement>('#dismissed-search-input');

  // ───────────────────────────────────────────────────────────────────────────
  // Helper: Bind Interactive Job Card Actions (Restore & Details)
  // ───────────────────────────────────────────────────────────────────────────
  const bindJobCardActions = (scopeContainer: HTMLElement): void => {
    if (!scopeContainer || isDestroyed) return;

    // Restore Action
    scopeContainer.querySelectorAll<HTMLElement>('[data-job-restore-id]').forEach((btn) => {
      const handleRestore = async (e: Event) => {
        e.stopPropagation();
        const jobId = btn.getAttribute('data-job-restore-id');
        if (!jobId || isDestroyed) return;

        btn.setAttribute('disabled', 'true');
        (btn as HTMLButtonElement).disabled = true;

        try {
          await workspaceService.restoreJob(jobId);
          if (isDestroyed) return;

          const card = scopeContainer.querySelector<HTMLElement>('#job-card-' + jobId);
          if (card) {
            card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.95)';
            setTimeout(() => {
              if (card && card.parentNode) {
                card.parentNode.removeChild(card);
              }
            }, 250);
          }

          showToast('Job restored to your feed!', 'success');
          void fetchDismissed(false);
        } catch (err) {
          if (isDestroyed) return;
          btn.removeAttribute('disabled');
          (btn as HTMLButtonElement).disabled = false;
          showToast('Failed to restore job', 'error');
        }
      };

      addTrackedListener(btn, 'click', handleRestore);
    });

    // Details Modal Action
    scopeContainer.querySelectorAll<HTMLElement>('[data-job-detail-id]').forEach((btn) => {
      const handleDetail = (e: Event) => {
        e.stopPropagation();
        const jobId = btn.getAttribute('data-job-detail-id');
        if (jobId && !isDestroyed) {
          openJobDetailModal(jobId, (action) => {
            if (action === 'restore' && !isDestroyed) {
              void fetchDismissed(false);
            }
          });
        }
      };

      addTrackedListener(btn, 'click', handleDetail);
    });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Data Fetching and View Re-rendering
  // ───────────────────────────────────────────────────────────────────────────
  const fetchDismissed = async (showLoading: boolean): Promise<void> => {
    if (isFetching || isDestroyed || !feedEl) return;
    isFetching = true;

    try {
      if (showLoading) {
        feedEl.innerHTML = loadingHtml('Loading hidden jobs...');
      }

      const data = await workspaceService.getDismissedJobs(state);
      if (isDestroyed) return;

      const items: Job[] = data.items || data.jobs || [];
      const total = typeof data.total === 'number' ? data.total : items.length;
      const totalPages = data.totalPages || Math.ceil(total / state.limit) || 1;

      if (items.length === 0) {
        feedEl.innerHTML = emptyStateHtml(
          '👁️',
          'No Hidden Jobs',
          'When you dismiss jobs you aren\'t interested in from the feed, they will appear here.',
          '<a href="#/dashboard/verified-jobs" class="kn-btn kn-btn--primary">Browse Verified Jobs →</a>'
        );
        if (paginationEl) paginationEl.innerHTML = '';
        return;
      }

      const cardsHtml = items.map((job) => {
        return verifiedJobCardHtml(job, { context: 'dismissed' });
      }).join('');

      const totalInfo =
        '<div class="vjp__results-header">' +
          '<p class="vjp__total">Showing ' + items.length + ' of ' + total + ' hidden job' + (total !== 1 ? 's' : '') + '</p>' +
        '</div>';

      feedEl.innerHTML = totalInfo + cardsHtml;
      bindJobCardActions(feedEl);

      // Render Pagination
      if (paginationEl) {
        if (totalPages > 1) {
          const prevDisabled = state.page <= 1 ? 'disabled' : '';
          const nextDisabled = state.page >= totalPages ? 'disabled' : '';
          paginationEl.innerHTML = (
            '<button type="button" class="kn-btn kn-btn--secondary vjp__page-btn" id="dism-prev-page" ' + prevDisabled + '>« Previous</button>' +
            '<span class="vjp__page-indicator">Page ' + state.page + ' of ' + totalPages + '</span>' +
            '<button type="button" class="kn-btn kn-btn--secondary vjp__page-btn" id="dism-next-page" ' + nextDisabled + '>Next »</button>'
          );

          const prevBtn = paginationEl.querySelector<HTMLElement>('#dism-prev-page');
          const nextBtn = paginationEl.querySelector<HTMLElement>('#dism-next-page');
          if (prevBtn && state.page > 1) {
            addTrackedListener(prevBtn, 'click', () => {
              state.page -= 1;
              void fetchDismissed(true);
            });
          }
          if (nextBtn && state.page < totalPages) {
            addTrackedListener(nextBtn, 'click', () => {
              state.page += 1;
              void fetchDismissed(true);
            });
          }
        } else {
          paginationEl.innerHTML = '';
        }
      }
    } catch (err) {
      if (isDestroyed) return;
      if (showLoading) {
        feedEl.innerHTML = errorStateHtml('Failed to load hidden jobs.', 'btn-retry-dismissed');
        const retryBtn = container.querySelector<HTMLElement>('#btn-retry-dismissed');
        if (retryBtn) {
          addTrackedListener(retryBtn, 'click', () => {
            void fetchDismissed(true);
          });
        }
      }
    } finally {
      isFetching = false;
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Search Listeners
  // ───────────────────────────────────────────────────────────────────────────
  if (searchInput) {
    addTrackedListener(searchInput, 'input', (e: Event) => {
      if (searchTimeout) clearTimeout(searchTimeout);
      const val = ((e.target as HTMLInputElement).value || '').trim();
      searchTimeout = setTimeout(() => {
        if (isDestroyed) return;
        state.q = val;
        state.page = 1;
        void fetchDismissed(true);
      }, 300);
    });
  }

  // Initial load
  void fetchDismissed(true);

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
        target.removeEventListener(event, handler);
      });
      boundListeners.length = 0;
    },
  };
}
