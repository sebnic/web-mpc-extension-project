import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ActivityLogEntry, ActivityLogType } from '../models/activity-log.model';

@Injectable({ providedIn: 'root' })
export class ActivityLogService implements OnDestroy {
  private readonly _entries$ = new BehaviorSubject<ActivityLogEntry[]>([]);
  readonly entries$: Observable<ActivityLogEntry[]> = this._entries$.asObservable();

  private entryCounter = 0;

  log(type: ActivityLogType, body: unknown, toolName?: string): void {
    const entry: ActivityLogEntry = {
      id: `log-${++this.entryCounter}`,
      type,
      toolName,
      body,
      timestamp: new Date(),
    };
    // Prepend + limit to 50 entries
    const current = this._entries$.getValue();
    this._entries$.next([entry, ...current].slice(0, 50));
  }

  clear(): void {
    this._entries$.next([]);
  }

  ngOnDestroy(): void {
    this._entries$.complete();
  }
}
