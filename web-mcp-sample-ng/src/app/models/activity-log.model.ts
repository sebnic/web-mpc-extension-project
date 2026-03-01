export type ActivityLogType = 'call' | 'result' | 'error' | 'info' | 'thinking';

export interface ActivityLogEntry {
  id: string;
  type: ActivityLogType;
  toolName?: string;
  body: unknown;
  timestamp: Date;
}
