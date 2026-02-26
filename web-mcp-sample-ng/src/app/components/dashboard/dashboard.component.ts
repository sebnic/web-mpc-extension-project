import { Component, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { User } from '../../models/user.model';
import { DashboardStats } from '../../models/dashboard-stats.model';
import { UserService } from '../../services/user.service';
import { DashboardService } from '../../services/dashboard.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  users$!: Observable<User[]>;
  stats$!: Observable<DashboardStats>;

  readonly examples: string[] = [
    '« Qui sont les utilisateurs avec le statut pending ? »',
    '« Combien d\'utilisateurs actifs y a-t-il et quelle est la charge du serveur ? »',
    '« Cherche les documents de catégorie Technique et liste mes notifications non lues. »',
    '« Donne-moi le profil de Bob Martin et passe David Petit en statut actif. »',
  ];

  private subscriptions = new Subscription();

  constructor(
    private readonly userService: UserService,
    private readonly dashboardService: DashboardService,
  ) {}

  ngOnInit(): void {
    this.users$ = this.userService.users$;
    this.stats$ = this.dashboardService.stats$;
  }

  formatTime(isoString: string): string {
    return new Date(isoString).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  avatarBg(userId: string): string {
    return `hsl(${userId.charCodeAt(1) * 40}, 60%, 30%)`;
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
