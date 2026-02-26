import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { McpToolInfo } from '../../models/mcp-tool.model';
import { McpService } from '../../services/mcp.service';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
})
export class SidebarComponent implements OnInit {
  readonly navItems: { icon: string; label: string; active?: boolean }[] = [
    { icon: '📊', label: 'Tableau de bord', active: true },
    { icon: '👥', label: 'Utilisateurs' },
    { icon: '📄', label: 'Documents' },
    { icon: '🔔', label: 'Notifications' },
    { icon: '⚙️', label: 'Paramètres' },
  ];

  tools$!: Observable<McpToolInfo[]>;

  constructor(private readonly mcpService: McpService) {}

  ngOnInit(): void {
    this.tools$ = this.mcpService.tools$;
  }
}
