import { Component, OnInit } from '@angular/core';
import { McpService } from './services/mcp.service';

/**
 * AppComponent — composant racine.
 * Injecte McpService au démarrage pour initialiser la couche MCP
 * (enregistrement des outils, écoute des événements d'exécution).
 */
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  constructor(
    // McpService est injecté ici pour forcer son instanciation dès le boot
    private readonly mcpService: McpService,
  ) {}

  ngOnInit(): void {
    // Le service MCP s'auto-initialise dans son constructeur.
    // Cette injection garantit qu'il est créé au lancement de l'app.
  }
}
