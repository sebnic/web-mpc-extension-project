import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, interval, Subscription } from 'rxjs';
import { DashboardStats } from '../models/dashboard-stats.model';
import { DASHBOARD_STATS } from '../data/mock-data';

@Injectable({ providedIn: 'root' })
export class DashboardService implements OnDestroy {
  private readonly stats: DashboardStats = { ...DASHBOARD_STATS };
  private readonly _stats$ = new BehaviorSubject<DashboardStats>({ ...this.stats });
  private readonly liveSubscription: Subscription;

  readonly stats$: Observable<DashboardStats> = this._stats$.asObservable();

  constructor() {
    // Simule des données en direct pour activeUsers (toutes les 5 s)
    this.liveSubscription = interval(5000).subscribe(() => {
      this.stats.activeUsers = 95 + Math.floor(Math.random() * 10);
      this._stats$.next({ ...this.stats });
    });
  }

  getByMetrics(metrics: string[]): Partial<DashboardStats> {
    if (!metrics || metrics.length === 0) return { ...this.stats };
    const result: Partial<DashboardStats> = {};
    metrics.forEach(m => {
      const key = m as keyof DashboardStats;
      if (this.stats[key] !== undefined) {
        (result as Record<string, unknown>)[key] = this.stats[key];
      }
    });
    return result;
  }

  ngOnDestroy(): void {
    this.liveSubscription.unsubscribe();
    this._stats$.complete();
  }
}
