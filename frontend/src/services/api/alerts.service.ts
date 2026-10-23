/**
 * RoleRadar Alerts & Notifications API Service.
 *
 * Encapsulates listing dispatched verified job alerts, unread counters,
 * read-status updates, and delivery retries.
 */

import { httpClient } from './client.js';
import type {
  NotificationsResponse,
  UnreadCountResponse,
} from './types.js';

export const alertsService = {
  /**
   * Retrieves paginated job alert notifications for the authenticated user.
   */
  async getNotifications(page = 1, limit = 30): Promise<NotificationsResponse> {
    return httpClient.get<NotificationsResponse>('/notifications', {
      params: { page, limit },
    });
  },

  /**
   * Returns count of unread alert notifications.
   */
  async getUnreadCount(): Promise<number> {
    const data = await httpClient.get<UnreadCountResponse>('/notifications/unread-count');
    return data.unreadCount || 0;
  },

  /**
   * Marks a specific alert notification as read.
   */
  async markNotificationRead(id: string): Promise<{ success: boolean; message: string }> {
    return httpClient.put<{ success: boolean; message: string }>(
      `/notifications/${encodeURIComponent(id)}/read`
    );
  },

  /**
   * Marks all alert notifications as read.
   */
  async markAllNotificationsRead(): Promise<{ success: boolean; message: string }> {
    return httpClient.post<{ success: boolean; message: string }>(
      '/notifications/read-all'
    );
  },

  /**
   * Triggers an immediate delivery retry for a failed or permanently failed notification.
   */
  async retryNotification(id: string): Promise<{ success: boolean; message: string }> {
    return httpClient.post<{ success: boolean; message: string }>(
      `/notifications/${encodeURIComponent(id)}/retry`
    );
  },
};
