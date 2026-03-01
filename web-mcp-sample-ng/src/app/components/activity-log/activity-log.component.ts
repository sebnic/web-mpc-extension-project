import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { ActivityLogEntry, ActivityLogType } from '../../models/activity-log.model';
import { ActivityLogService } from '../../services/activity-log.service';

@Component({
  selector: 'app-activity-log',
  templateUrl: './activity-log.component.html',
  styleUrls: ['./activity-log.component.css'],
})
export class ActivityLogComponent implements OnInit {
  entries$!: Observable<ActivityLogEntry[]>;
  visible = true;

  constructor(private readonly activityLogService: ActivityLogService) {}

  ngOnInit(): void {
    this.entries$ = this.activityLogService.entries$;
  }

  clear(): void {
    this.activityLogService.clear();
  }

  toggle(): void {
    this.visible = !this.visible;
  }

  labelFor(type: ActivityLogType): string {
    switch (type) {
      case 'call':   return '▶ Appel reçu';
      case 'result': return '✔ Résultat envoyé';
      case 'error':  return '✖ Erreur';
      default:       return 'ℹ Info';
    }
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  trackById(_index: number, entry: ActivityLogEntry): string {
    return entry.id;
  }
}
