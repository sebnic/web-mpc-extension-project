import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { McpToolConfig, McpToolInfo } from '../models/mcp-tool.model';
import { ActivityLogService } from './activity-log.service';
import { UserService } from './user.service';
import { DocumentService } from './document.service';
import { NotificationService } from './notification.service';
import { DashboardService } from './dashboard.service';
import { UserStatus } from '../models/user.model';
import { LoDeviceService } from './lo-device.service';
import { LoDocService } from './lo-doc.service';

/**
 * McpService — cœur de l'intégration MCP.
 *
 * Responsabilités :
 *  1. Crée navigator.modelContext si absent (simulation sans extension)
 *  2. Enregistre les 5 outils MCP via registerTool()
 *  3. Écoute EXECUTE_MCP_FROM_EXT (déclenché par content.js) et dispatch le résultat
 *  4. Attend MCP_INJECT_READY avant d'enregistrer (fallback 3 s si extension absente)
 */
@Injectable({ providedIn: 'root' })
export class McpService implements OnDestroy {
  private readonly toolExecutors = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
  private readonly callCounts = new Map<string, number>();
  private readonly _tools$ = new BehaviorSubject<McpToolInfo[]>([]);

  readonly tools$: Observable<McpToolInfo[]> = this._tools$.asObservable();

  private mcpReady = false;

  private readonly onInjectReady: () => void;
  private readonly onExecuteRequest: (event: Event) => void;

  constructor(
    private readonly zone: NgZone,
    private readonly activityLog: ActivityLogService,
    private readonly userService: UserService,
    private readonly documentService: DocumentService,
    private readonly notificationService: NotificationService,
    private readonly dashboardService: DashboardService,
    private readonly loDeviceService: LoDeviceService,
    private readonly loDocService: LoDocService,
  ) {
    this.ensureModelContext();

    // Binding des handlers pour pouvoir les removeEventListener plus tard
    this.onInjectReady = () => this.zone.run(() => {
      console.log('[MCP sample] MCP_INJECT_READY reçu — enregistrement des outils.');
      this.registerAllTools();
    });

    this.onExecuteRequest = (event: Event) => {
      const { callId, toolName, args } = (event as CustomEvent<{ callId: string; toolName: string; args: Record<string, unknown> }>).detail;
      this.zone.run(() => this.handleExecutionRequest(callId, toolName, args));
    };

    window.addEventListener('MCP_INJECT_READY', this.onInjectReady);
    window.addEventListener('EXECUTE_MCP_FROM_EXT', this.onExecuteRequest);

    // Fallback 3 s si l'extension n'est pas installée
    setTimeout(() => {
      if (!this.mcpReady) {
        console.warn('[MCP sample] MCP_INJECT_READY jamais reçu — fallback sans extension.');
        this.registerAllTools();
      }
    }, 3000);
  }

  // ---------------------------------------------------------------------------
  // API publique
  // ---------------------------------------------------------------------------

  incrementCallCount(toolName: string): void {
    const count = (this.callCounts.get(toolName) ?? 0) + 1;
    this.callCounts.set(toolName, count);
    this.refreshToolsSnapshot();
  }

  // ---------------------------------------------------------------------------
  // Privé — bootstrap ModelContext
  // ---------------------------------------------------------------------------

  private ensureModelContext(): void {
    if (!window.navigator.modelContext) {
      Object.defineProperty(window.navigator, 'modelContext', {
        value: {
          registerTool: () => {},
          registerResource: () => {},
          registerPrompt: () => {},
          requestSampling: () => Promise.resolve({ role: 'assistant', content: { type: 'text', text: '' } }),
        },
        writable: false,
        configurable: true,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Privé — enregistrement des outils
  // ---------------------------------------------------------------------------

  private registerTool(config: McpToolConfig): void {
    this.toolExecutors.set(config.name, config.execute as (args: Record<string, unknown>) => Promise<unknown>);
    this.callCounts.set(config.name, 0);

    (window.navigator.modelContext as { registerTool: (c: unknown) => void }).registerTool({
      name: config.name,
      description: config.description,
      inputSchema: config.inputSchema,
      execute: config.execute,
    });

    this.activityLog.log('info', { status: 'Outil enregistré' }, config.name);
    this.refreshToolsSnapshot();
  }

  private refreshToolsSnapshot(): void {
    const tools: McpToolInfo[] = [...this.toolExecutors.keys()].map(name => ({
      name,
      description: '',
      callCount: this.callCounts.get(name) ?? 0,
    }));
    this._tools$.next(tools);
  }

  private registerAllTools(): void {
    if (this.mcpReady) return;
    this.mcpReady = true;

    // ── Outil 1 : get_user_profile ───────────────────────────────────────────
    this.registerTool({
      name: 'get_user_profile',
      description: 'Retourne le profil complet d\'un utilisateur à partir de son identifiant ou de son nom.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'Identifiant unique de l\'utilisateur (ex: u1)' },
          name:   { type: 'string', description: 'Nom ou partie du nom de l\'utilisateur' },
        },
      },
      execute: async ({ userId, name } = {}) => {
        if (userId) {
          const user = this.userService.findById(userId as string);
          return user ? { ...user } : { error: 'Utilisateur introuvable.' };
        }
        if (name) {
          const user = this.userService.findByName(name as string);
          return user ? { ...user } : { error: 'Utilisateur introuvable.' };
        }
        return { users: this.userService.getAll().map(({ avatar: _a, ...u }) => u) };
      },
    });

    // ── Outil 2 : list_notifications ────────────────────────────────────────
    this.registerTool({
      name: 'list_notifications',
      description: 'Retourne la liste des notifications du portail. Peut filtrer par statut de lecture.',
      inputSchema: {
        type: 'object',
        properties: {
          unread_only: { type: 'boolean', description: 'Si true, retourne uniquement les notifications non lues' },
        },
      },
      execute: async ({ unread_only = false } = {}) =>
        this.notificationService.getAll(unread_only as boolean),
    });

    // ── Outil 3 : search_documents ───────────────────────────────────────────
    this.registerTool({
      name: 'search_documents',
      description: 'Recherche des documents dans la base documentaire à partir d\'un terme ou d\'une catégorie.',
      inputSchema: {
        type: 'object',
        properties: {
          query:    { type: 'string',  description: 'Terme de recherche dans le titre du document' },
          category: { type: 'string',  description: 'Filtre sur la catégorie (Finance, Technique, Design, Direction, RH)' },
          limit:    { type: 'number',  description: 'Nombre maximum de résultats (défaut : 10)' },
        },
      },
      execute: async ({ query = '', category = '', limit = 10 } = {}) =>
        this.documentService.search({ query: query as string, category: category as string, limit: limit as number }),
    });

    // ── Outil 4 : get_dashboard_stats ────────────────────────────────────────
    this.registerTool({
      name: 'get_dashboard_stats',
      description: 'Retourne les statistiques globales du tableau de bord (utilisateurs actifs, documents, tickets, charge serveur…).',
      inputSchema: {
        type: 'object',
        properties: {
          metrics: {
            type: 'array',
            items: { type: 'string' },
            description: 'Liste des métriques souhaitées. Si vide, toutes les métriques sont retournées.',
          },
        },
      },
      execute: async ({ metrics = [] } = {}) =>
        this.dashboardService.getByMetrics(metrics as string[]),
    });

    // ── Outil 5 : update_user_status ─────────────────────────────────────────
    this.registerTool({
      name: 'update_user_status',
      description: 'Met à jour le statut d\'un utilisateur (active, pending, inactive).',
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'Identifiant de l\'utilisateur' },
          status: { type: 'string', enum: ['active', 'pending', 'inactive'], description: 'Nouveau statut' },
        },
        required: ['userId', 'status'],
      },
      execute: async ({ userId, status } = {}) => {
        const result = this.userService.updateStatus(userId as string, status as UserStatus);
        if (!result) return { error: `Utilisateur "${userId as string}" introuvable.` };
        return { success: true, userId, oldStatus: result.oldStatus, newStatus: status };
      },
    });

    // ── Resource 1 : user_context ───────────────────────────────────────────
    const mc = window.navigator.modelContext as {
      registerResource: (c: unknown) => void;
      registerPrompt: (c: unknown) => void;
    };

    mc.registerResource({
      name: 'user_context',
      description: 'Contexte utilisateur courant : liste complète des utilisateurs du portail.',
      mimeType: 'application/json',
      read: async () => ({
        content: JSON.stringify({
          timestamp: new Date().toISOString(),
          users: this.userService.getAll(),
          totalUsers: this.userService.getAll().length,
          activeCount: this.userService.getAll().filter((u: { status: string }) => u.status === 'active').length,
        }),
      }),
    });
    this.activityLog.log('info', { status: 'Ressource enregistrée' }, 'user_context');

    // ── Resource 2 : dashboard_snapshot ─────────────────────────────────────
    mc.registerResource({
      name: 'dashboard_snapshot',
      description: 'Instantané des statistiques du tableau de bord au moment de la lecture.',
      mimeType: 'application/json',
      read: async () => ({
        content: JSON.stringify({
          timestamp: new Date().toISOString(),
          stats: this.dashboardService.getByMetrics([]),
        }),
      }),
    });
    this.activityLog.log('info', { status: 'Ressource enregistrée' }, 'dashboard_snapshot');

    // ── Prompt 1 : analyze_user ──────────────────────────────────────────────
    mc.registerPrompt({
      name: 'analyze_user',
      description: 'Génère un prompt d\'analyse pour un utilisateur spécifique.',
      arguments: [
        { name: 'userId', description: 'Identifiant de l\'utilisateur', required: true },
      ],
      get: async ({ userId = 'u1' }: Record<string, string> = {}) => {
        const user = this.userService.findById(userId) ?? this.userService.getAll()[0];
        return {
          messages: [{
            role: 'user',
            content: { type: 'text', text: `Analyse le profil suivant :\n${JSON.stringify(user, null, 2)}` },
          }],
        };
      },
    });
    this.activityLog.log('info', { status: 'Prompt enregistré' }, 'analyze_user');

    // ── Prompt 2 : generate_report ───────────────────────────────────────────
    mc.registerPrompt({
      name: 'generate_report',
      description: 'Génère un prompt pour produire un rapport de synthèse du portail.',
      arguments: [
        { name: 'period', description: 'Période du rapport (ex: Q1 2026)', required: false },
      ],
      get: async ({ period = 'Q1 2026' }: Record<string, string> = {}) => ({
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Génère un rapport de synthèse pour la période ${period}.\n` +
              `Stats : ${JSON.stringify(this.dashboardService.getByMetrics([]))}.`,
          },
        }],
      }),
    });
    this.activityLog.log('info', { status: 'Prompt enregistré' }, 'generate_report');

    // ── Live Objects tools ───────────────────────────────────────────────────

    this.registerTool({
      name: 'get_device_info',
      description: 'Retourne les métadonnées complètes d\'un device Live Objects : type de connectivité, statut, dernière vue, firmware, tags.',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Live Objects device URN, ex: urn:lo:nsid:mqtt:sensor-temp-paris-01' },
        },
        required: ['deviceId'],
      },
      execute: async ({ deviceId } = {}) => {
        const device = this.loDeviceService.findById(deviceId as string);
        if (!device) return { error: `Device not found: ${deviceId as string}` };
        return device;
      },
    });

    this.registerTool({
      name: 'get_audit_logs',
      description: 'Retourne les entrées d\'audit log pour un device LO. Chaque entrée contient : timestamp, level (INFO/WARNING/ERROR), errorCode, message. Utiliser pour diagnostiquer des problèmes de connectivité : MQTT_AUTH_FAILED, TLS_CERTIFICATE_EXPIRED, etc.',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'URN du device' },
          since: { type: 'string', description: 'Date ISO 8601 pour filtrer les événements depuis cette date (optionnel)' },
          limit: { type: 'number', description: 'Nombre maximum d\'entrées à retourner (défaut 20)' },
        },
        required: ['deviceId'],
      },
      execute: async ({ deviceId, since, limit } = {}) =>
        this.loDeviceService.getAuditLogs(deviceId as string, since as string | undefined, (limit as number) ?? 20),
    });

    this.registerTool({
      name: 'get_device_messages',
      description: 'Retourne les derniers messages de données envoyés par un device (payloads capteurs, coordonnées GPS, etc.).',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'URN du device' },
          limit: { type: 'number', description: 'Nombre maximum de messages (défaut 10)' },
        },
        required: ['deviceId'],
      },
      execute: async ({ deviceId, limit } = {}) =>
        this.loDeviceService.getMessages(deviceId as string, (limit as number) ?? 10),
    });

    this.registerTool({
      name: 'search_lo_docs',
      description: 'Recherche full-text dans la documentation développeur Live Objects. Retourne les extraits les plus pertinents pour une requête. Utiliser pour : codes d\'erreur, endpoints API, procédures de configuration, guides de dépannage.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Requête en langage naturel, ex: "MQTT_AUTH_FAILED" ou "renouvellement certificat TLS"' },
          categories: {
            type: 'array',
            items: { type: 'string', enum: ['connection', 'device', 'audit', 'data', 'command', 'alarm', 'api'] },
            description: 'Filtrer par catégorie de documentation (optionnel)',
          },
          limit: { type: 'number', description: 'Nombre max de chunks à retourner (défaut 6)' },
        },
        required: ['query'],
      },
      execute: async ({ query, categories, limit } = {}) =>
        this.loDocService.search(query as string, categories as string[] | undefined, (limit as number) ?? 6),
    });

    // ── LO Resource : selected_device ────────────────────────────────────────
    mc.registerResource({
      name: 'selected_device',
      description: 'Device actuellement sélectionné dans l\'interface Live Objects. Contient les métadonnées complètes du device. Lire cette ressource avant d\'appeler d\'autres outils pour connaître le device en cours d\'analyse.',
      mimeType: 'application/json',
      read: async () => ({
        content: JSON.stringify(this.loDeviceService.getSelectedDevice()),
      }),
    });
    this.activityLog.log('info', { status: 'Ressource enregistrée' }, 'selected_device');

    // ── LO Prompt : diagnose_connectivity ────────────────────────────────────
    mc.registerPrompt({
      name: 'diagnose_connectivity',
      description: 'Diagnostic guidé pour un device Live Objects qui ne se connecte pas. Analyse les audit logs, l\'état du device, consulte la documentation et formule un diagnostic avec étapes de résolution.',
      arguments: [
        { name: 'deviceId', description: 'URN du device Live Objects à diagnostiquer', required: true },
      ],
      get: async ({ deviceId = '' }: Record<string, string> = {}) => ({
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Je rencontre un problème de connectivité avec le device Live Objects : **${deviceId}**\n\nPeux-tu :\n1. Appeler \`get_device_info\` pour voir l'état actuel du device\n2. Appeler \`get_audit_logs\` pour analyser les erreurs récentes\n3. Si tu trouves un error code, appeler \`search_lo_docs\` pour trouver la procédure de résolution dans la documentation\n\nFormule un diagnostic clair et des étapes concrètes pour résoudre le problème.`,
          },
        }],
      }),
    });
    this.activityLog.log('info', { status: 'Prompt enregistré' }, 'diagnose_connectivity');
  }

  // ---------------------------------------------------------------------------
  // Privé — exécution des requêtes MCP entrantes
  // ---------------------------------------------------------------------------

  private async handleExecutionRequest(callId: string, toolName: string, args: Record<string, unknown>): Promise<void> {
    this.activityLog.log('call', args, toolName);
    this.incrementCallCount(toolName);

    const executeFn = this.toolExecutors.get(toolName);
    if (!executeFn) {
      const errResult = { error: `Outil inconnu : "${toolName}"` };
      this.activityLog.log('error', errResult, toolName);
      this.dispatchResult(callId, errResult);
      return;
    }

    try {
      // Simulation d'un délai réseau réaliste (50–200 ms)
      await new Promise<void>(r => setTimeout(r, 50 + Math.random() * 150));
      const result = await executeFn(args);
      this.activityLog.log('result', result, toolName);
      this.dispatchResult(callId, result);
    } catch (err) {
      const errResult = { error: err instanceof Error ? err.message : String(err) };
      this.activityLog.log('error', errResult, toolName);
      this.dispatchResult(callId, errResult);
    }
  }

  private dispatchResult(callId: string, result: unknown): void {
    window.dispatchEvent(new CustomEvent('MCP_EXECUTION_RESULT', {
      detail: { callId, result },
    }));
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnDestroy(): void {
    window.removeEventListener('MCP_INJECT_READY', this.onInjectReady);
    window.removeEventListener('EXECUTE_MCP_FROM_EXT', this.onExecuteRequest);
    this._tools$.complete();
  }
}
