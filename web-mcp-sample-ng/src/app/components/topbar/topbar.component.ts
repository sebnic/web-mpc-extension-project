import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { McpService } from '../../services/mcp.service';

@Component({
  selector: 'app-topbar',
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.css'],
})
export class TopbarComponent implements OnInit {
  toolCount$!: Observable<number>;

  constructor(private readonly mcpService: McpService) {}

  ngOnInit(): void {
    this.toolCount$ = this.mcpService.tools$.pipe(map(tools => tools.length));
  }
}
