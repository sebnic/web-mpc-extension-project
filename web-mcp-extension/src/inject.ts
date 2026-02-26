/**
 * inject.ts — Le Monkey Patcher
 *
 * Ce script est injecté directement dans le contexte de la page web (non isolé)
 * afin d'intercepter les appels à navigator.modelContext.registerTool()
 * effectués par l'application web.
 *
 * Il émet un CustomEvent "MCP_TOOL_DISCOVERED" capturable par content.ts.
 *
 * Note : compilé par esbuild avec format=iife — pas de wrapper IIFE manuel.
 */

// import type est effacé à la compilation : aucune dépendance runtime.
import type { McpToolConfig } from './types';

/**
 * ModelContextPatcher crée ou complète navigator.modelContext et remplace
 * registerTool() par une version instrumentée qui émet MCP_TOOL_DISCOVERED.
 */
class ModelContextPatcher {
  private readonly mc: ModelContext;
  private readonly originalRegister: ((config: McpToolConfig) => void) | null;

  constructor() {
    console.log('[MCP ModelContextPatcher] Script chargé dans le contexte de la page.');
    this.mc = this.ensureModelContext();
    this.originalRegister = this.captureOriginalRegister();
    this.patch();
    this.signalReady();
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  /**
   * Garantit l'existence de navigator.modelContext.
   * Si l'API native est absente, un objet de substitution est créé.
   */
  private ensureModelContext(): ModelContext {
    if (!window.navigator.modelContext) {
      console.log('[MCP ModelContextPatcher] modelContext absent — création du fallback.');
      Object.defineProperty(window.navigator, 'modelContext', {
        value: Object.create(null) as ModelContext,
        writable: false,
        configurable: true,
      });
    }
    return window.navigator.modelContext!;
  }

  /** Capture l'implémentation native de registerTool avant de la remplacer */
  private captureOriginalRegister(): ((config: McpToolConfig) => void) | null {
    const original =
      typeof this.mc.registerTool === 'function'
        ? this.mc.registerTool.bind(this.mc)
        : null;
    console.log('[MCP ModelContextPatcher] originalRegister préservé =', Boolean(original));
    return original;
  }

  // ── Patch ─────────────────────────────────────────────────────────────────

  /**
   * Remplace registerTool() par la version instrumentée.
   * Object.defineProperty est nécessaire car la propriété peut être
   * non-writable sur l'objet natif.
   */
  private patch(): void {
    try {
      Object.defineProperty(this.mc, 'registerTool', {
        value: (config: McpToolConfig) => this.patchedRegisterTool(config),
        writable: true,
        configurable: true,
      });
      console.log('[MCP ModelContextPatcher] ✅ registerTool patché avec succès.');
    } catch (e) {
      console.error('[MCP ModelContextPatcher] ❌ Impossible de patcher registerTool :', e);
    }
  }

  /**
   * Remplaçant de registerTool() :
   * 1. Émet MCP_TOOL_DISCOVERED pour content.ts
   * 2. Délègue à l'implémentation native si elle existe
   */
  private patchedRegisterTool(config: McpToolConfig): void {
    console.log('[MCP ModelContextPatcher] registerTool intercepté, config =', config);

    if (!config?.name) {
      console.warn('[MCP ModelContextPatcher] Config invalide, ignorée.', config);
      return;
    }

    window.dispatchEvent(
      new CustomEvent('MCP_TOOL_DISCOVERED', {
        detail: {
          name: config.name,
          description: config.description ?? '',
          inputSchema: config.inputSchema ?? {},
        },
      }),
    );

    if (this.originalRegister) {
      try {
        this.originalRegister(config);
      } catch (e) {
        console.warn('[MCP ModelContextPatcher] Appel natif ignoré :', (e as Error).message);
      }
    }
  }

  // ── Signal ────────────────────────────────────────────────────────────────

  /** Notifie les scripts de la page que le patch est opérationnel */
  private signalReady(): void {
    console.log('[MCP ModelContextPatcher] Dispatch MCP_INJECT_READY');
    window.dispatchEvent(new CustomEvent('MCP_INJECT_READY'));
  }
}

// Point d'entrée
new ModelContextPatcher();
