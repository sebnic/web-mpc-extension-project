import { Component, OnInit } from '@angular/core';
import { McpService } from './services/mcp.service';
import { AppView } from './components/sidebar/sidebar.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  currentView: AppView = 'dashboard';
  activityVisible = true;

  constructor(private readonly mcpService: McpService) {}

  ngOnInit(): void {}

  onViewChange(view: AppView): void {
    this.currentView = view;
  }

  toggleActivity(): void {
    this.activityVisible = !this.activityVisible;
  }
}
