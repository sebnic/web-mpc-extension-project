import { Injectable } from '@angular/core';
import { Notification } from '../models/notification.model';
import { MOCK_NOTIFICATIONS } from '../data/mock-data';

export interface NotificationListResult {
  total: number;
  unread: number;
  notifications: Notification[];
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly notifications: Notification[] = JSON.parse(JSON.stringify(MOCK_NOTIFICATIONS)) as Notification[];

  getAll(unreadOnly = false): NotificationListResult {
    const list = unreadOnly
      ? this.notifications.filter(n => !n.read)
      : [...this.notifications];
    return {
      total: list.length,
      unread: this.notifications.filter(n => !n.read).length,
      notifications: list,
    };
  }
}
