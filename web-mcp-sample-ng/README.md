# web-mcp-sample-ng — Portail de Démonstration MCP en Angular 14

Application Angular 14 servant de portail de démonstration pour l'extension Chrome **web-mcp-extension**. Elle expose 5 outils MCP via l'API `navigator.modelContext` et réagit aux requêtes d'exécution de l'extension.

## Structure du projet

```
web-mcp-sample-ng/
├── src/
│   ├── main.ts                   # Bootstrap Angular
│   ├── polyfills.ts              # zone.js
│   ├── index.html               # Point d'entrée HTML
│   ├── styles.css               # Styles globaux (portés depuis la version vanilla)
│   ├── typings.d.ts             # Déclaration de navigator.modelContext
│   ├── environments/
│   │   ├── environment.ts       # Environnement développement
│   │   └── environment.prod.ts  # Environnement production
│   └── app/
│       ├── app.module.ts        # Module racine (déclarations + imports)
│       ├── app.component.ts     # Composant racine (layout)
│       ├── models/              # Interfaces TypeScript
│       │   ├── user.model.ts
│       │   ├── document.model.ts
│       │   ├── notification.model.ts
│       │   ├── dashboard-stats.model.ts
│       │   ├── mcp-tool.model.ts
│       │   └── activity-log.model.ts
│       ├── data/
│       │   └── mock-data.ts     # Données de démonstration
│       ├── services/            # Services Angular (providedIn: root)
│       │   ├── mcp.service.ts           # Cœur MCP (registerTool + exécution)
│       │   ├── user.service.ts          # Gestion utilisateurs
│       │   ├── document.service.ts      # Recherche documents
│       │   ├── notification.service.ts  # Notifications
│       │   ├── dashboard.service.ts     # Stats tableau de bord (données live)
│       │   └── activity-log.service.ts  # Journal d'activité MCP
│       └── components/          # Composants Angular
│           ├── topbar/          # Barre de titre + badges MCP
│           ├── sidebar/         # Navigation + liste des outils MCP
│           ├── dashboard/       # Tableau de bord, stats, table utilisateurs
│           └── activity-log/    # Panneau de log d'activité MCP (droite)
├── angular.json                 # Configuration Angular CLI
├── tsconfig.json                # TypeScript (strict, skipLibCheck)
├── tsconfig.app.json            # Config TypeScript app uniquement
└── package.json                 # Dépendances Angular 14
```

## Architecture OOP

| Classe / Service | Rôle |
|---|---|
| `McpService` | Initialise `navigator.modelContext`, enregistre les 5 outils, écoute `EXECUTE_MCP_FROM_EXT`, dispatch `MCP_EXECUTION_RESULT`. Attend `MCP_INJECT_READY` avec fallback 3 s. |
| `UserService` | CRUD léger sur `MOCK_USERS`, expose `users$` (BehaviorSubject) pour la réactivité Angular |
| `DocumentService` | Recherche avec filtres `query`, `category`, `limit` |
| `NotificationService` | Filtrage des notifications par statut `read` |
| `DashboardService` | Expose `stats$`, simule un `activeUsers` vivant via `interval(5000)` |
| `ActivityLogService` | Journal d'activité (max 50 entrées), observable `entries$` |
| `AppComponent` | Composant racine — injecte `McpService` pour forcer son init |
| `TopbarComponent` | Badge "X outils exposés" réactif |
| `SidebarComponent` | Liste des outils et leurs compteurs d'appels |
| `DashboardComponent` | Statistiques et table utilisateurs, données live via `async` pipe |
| `ActivityLogComponent` | Log des événements MCP, animation d'entrée |

## Installation et démarrage

```bash
npm install --legacy-peer-deps
npm start              # → http://localhost:4200
npm run build          # Production
npm run build:prod     # Alias production
```

## Outils MCP exposés (5)

| Outil | Description |
|---|---|
| `get_user_profile` | Profil utilisateur par `userId` ou `name` |
| `list_notifications` | Notifications filtrables par `unread_only` |
| `search_documents` | Recherche par `query`, `category`, `limit` |
| `get_dashboard_stats` | Stats globales (toutes ou par `metrics[]`) |
| `update_user_status` | Mise à jour du statut (`active`/`pending`/`inactive`) |

## Intégration avec l'extension

1. L'extension injecte `inject.js` dans la page
2. `inject.js` dispatche `MCP_INJECT_READY`
3. `McpService` répond en appelant `navigator.modelContext.registerTool()` × 5
4. L'extension reçoit `MCP_TOOL_DISCOVERED` et affiche les outils dans le sidepanel
5. Quand l'IA exécute un outil, l'extension envoie `EXECUTE_MCP_FROM_EXT`
6. `McpService` exécute la logique métier via le service correspondant
7. Le résultat est renvoyé via `MCP_EXECUTION_RESULT`
