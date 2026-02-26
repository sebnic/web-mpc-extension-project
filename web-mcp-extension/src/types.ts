/**
 * types.ts — Types partagés entre tous les scripts de l'extension
 */

// L'export vide est requis pour que ce fichier soit traité comme un module
// et que les blocs `declare global` fonctionnent correctement.
export {};

// ---------------------------------------------------------------------------
// Modèles de données
// ---------------------------------------------------------------------------

/** Outil MCP exposé par le portail via navigator.modelContext.registerTool() */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Configuration passée à registerTool() */
export interface McpToolConfig {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  execute?: (args: Record<string, unknown>) => Promise<unknown>;
}

/** Résultat d'une exécution d'outil côté portail */
export interface ToolExecutionResult {
  callId: string;
  result: unknown;
}

/** Réponse renvoyée après l'exécution d'un outil */
export interface ToolResponse {
  status: 'success' | 'error';
  result: unknown;
}

// ---------------------------------------------------------------------------
// Messages inter-composants de l'extension
// ---------------------------------------------------------------------------

export type ExtensionMessage =
  | { type: 'NEW_TOOL_AVAILABLE'; tool: McpTool }
  | { type: 'GET_TOOLS_FOR_TAB'; tabId: number }
  | { type: 'CONTEXT_UPDATED'; tabId: number; tools: McpTool[] }
  | {
      type: 'EXECUTE_TOOL_REQUEST';
      tabId: number;
      toolName: string;
      args: Record<string, unknown>;
      callId: string;
    }
  | {
      type: 'EXECUTE_ON_PAGE';
      toolName: string;
      args: Record<string, unknown>;
      callId: string;
    };

// ---------------------------------------------------------------------------
// Paramètres de configuration Gemini
// ---------------------------------------------------------------------------

export interface ExtensionSettings {
  apiKey: string | null;
  model: string;
}

// ---------------------------------------------------------------------------
// Augmentations globales
// ---------------------------------------------------------------------------

declare global {
  /** API Web MCP native simulée par l'extension */
  interface ModelContext {
    registerTool(config: McpToolConfig): void;
  }

  interface Navigator {
    modelContext?: ModelContext;
  }
}
