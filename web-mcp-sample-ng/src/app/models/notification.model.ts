export type NotificationType = 'info' | 'warning' | 'success' | 'error';

export interface Notification {
  readonly id: string;
  type: NotificationType;
  message: string;
  read: boolean;
  date: string;
}
