import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Observable } from 'rxjs';
import { McpToolInfo } from '../../models/mcp-tool.model';
import { McpService } from '../../services/mcp.service';

export type AppView = 'dashboard' | 'devices';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
})
export class SidebarComponent implements OnInit {
  @Output() readonly viewChange = new EventEmitter<AppView>();

  activeView: AppView = 'dashboard';

  readonly navItems: { icon: string; label: string; view: AppView | null }[] = [
    { icon: '📊', label: 'Tableau de bord', view: 'dashboard' },
    { icon: '📡', label: 'Devices Live Objects', view: 'devices' },
    { icon: '👥', label: 'Utilisateurs', view: null },
    { icon: '📄', label: 'Documents', view: null },
    { icon: '⚙️', label: 'Paramètres', view: null },
  ];

  tools$!: Observable<McpToolInfo[]>;
  toolsVisible = true;

  constructor(private readonly mcpService: McpService) {}

  ngOnInit(): void {
    this.tools$ = this.mcpService.tools$;
  }

  navigate(view: AppView | null): void {
    if (view) {
      this.activeView = view;
      this.viewChange.emit(view);
    }
  }

  toggleTools(): void {
    this.toolsVisible = !this.toolsVisible;
  }
}
