import { api } from './client';

export interface NotificationDto {
  id: number;
  title: string;
  body: string;
  link?: string | null;
  isRead: boolean;
  entityType?: string | null;
  entityId?: string | null;
  createdAt: string;
}

export const notificationsApi = {
  list: async (): Promise<NotificationDto[]> => {
    const { data } = await api.get<{ success: boolean; data: NotificationDto[] }>('/notifications');
    return data.data;
  },

  unreadCount: async (): Promise<number> => {
    const { data } = await api.get<{ success: boolean; count: number }>('/notifications/unread-count');
    return data.count;
  },

  markRead: async (id: number): Promise<void> => {
    await api.post(`/notifications/${id}/read`);
  },

  markAllRead: async (): Promise<void> => {
    await api.post('/notifications/read-all');
  },
};
