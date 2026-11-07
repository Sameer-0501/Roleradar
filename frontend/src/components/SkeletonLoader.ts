/**
 * RoleRadar Skeleton Loader Component (Item 1).
 *
 * Implements recommendation: "add skeleton loading screens"
 * Generates semantic shimmer placeholder HTML structures for views, cards, and tables.
 */

export function renderJobCardsSkeleton(count: number = 4): string {
  let cards = '';
  for (let i = 0; i < count; i++) {
    cards += `
      <div class="rr-skeleton-card" aria-hidden="true">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div class="rr-skeleton rr-skeleton-title" style="width: 55%;"></div>
          <div class="rr-skeleton rr-skeleton-badge" style="width: 70px;"></div>
        </div>
        <div class="rr-skeleton rr-skeleton-sub" style="width: 35%;"></div>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <div class="rr-skeleton rr-skeleton-badge" style="width: 90px;"></div>
          <div class="rr-skeleton rr-skeleton-badge" style="width: 110px;"></div>
          <div class="rr-skeleton rr-skeleton-badge" style="width: 80px;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid #f3f4f6;">
          <div class="rr-skeleton rr-skeleton-line" style="width: 120px;"></div>
          <div class="rr-skeleton rr-skeleton-badge" style="width: 100px; height: 32px;"></div>
        </div>
      </div>
    `;
  }
  return `<div class="rr-skeleton-list" role="status" aria-label="Loading job listings...">${cards}</div>`;
}

export function renderMetricsSkeleton(count: number = 4): string {
  let cards = '';
  for (let i = 0; i < count; i++) {
    cards += `
      <div class="rr-skeleton-metric-card" aria-hidden="true">
        <div class="rr-skeleton rr-skeleton-line" style="width: 50%; margin-bottom: 8px;"></div>
        <div class="rr-skeleton rr-skeleton-line" style="width: 30%; height: 28px;"></div>
      </div>
    `;
  }
  return `<div class="rr-skeleton-metrics" role="status" aria-label="Loading metrics...">${cards}</div>`;
}

export function renderTableSkeleton(rows: number = 5, cols: number = 4): string {
  let rowsHtml = '';
  for (let r = 0; r < rows; r++) {
    rowsHtml += '<tr>';
    for (let c = 0; c < cols; c++) {
      const width = c === 0 ? '70%' : c === 1 ? '50%' : '80%';
      rowsHtml += `<td><div class="rr-skeleton rr-skeleton-line" style="width: ${width};"></div></td>`;
    }
    rowsHtml += '</tr>';
  }
  return `
    <table class="rr-skeleton-table" role="status" aria-label="Loading table data...">
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

export function renderFullViewSkeleton(): string {
  return `
    <div class="vjp-container" style="max-width: 1200px; margin: 0 auto; padding: 1.5rem;" role="status" aria-label="Loading view...">
      <div class="rr-skeleton rr-skeleton-title" style="width: 280px; height: 32px; margin-bottom: 8px;"></div>
      <div class="rr-skeleton rr-skeleton-sub" style="width: 450px; margin-bottom: 24px;"></div>
      ${renderMetricsSkeleton(4)}
      <div style="height: 48px; border-radius: 6px; margin-bottom: 20px;" class="rr-skeleton"></div>
      ${renderJobCardsSkeleton(4)}
    </div>
  `;
}

