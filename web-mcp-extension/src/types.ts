/**
 * types.ts — Types partagés entre tous les scripts de l'extension
 */

// L'export vide est requis pour que ce fichier soit traité comme un module
// et que les blocs `declare global` fonctionnent correctement.
export {};

// ---------------------------------------------------------------------------
// Primitive 1 — Tool
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

// ---------------------------------------------------------------------------
// Primitive 2 — Resource
// ---------------------------------------------------------------------------

/** Ressource MCP exposée par le portail via navigator.modelContext.registerResource() */
export interface McpResource {
  name: string;
  description: string;
  mimeType?: string;
}

/** Configuration passée à registerResource() */
export interface McpResourceConfig {
  name: string;
  description?: string;
  mimeType?: string;
  read: () => Promise<{ content: string }>;
}

// ---------------------------------------------------------------------------
// Primitive 3 — Prompt
// ---------------------------------------------------------------------------

/** Argument déclaré par un prompt template MCP */
export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/** Prompt template MCP exposé par le portail via navigator.modelContext.registerPrompt() */
export interface McpPrompt {
  name: string;
  description: string;
  arguments?: McpPromptArgument[];
}

/** Configuration passée à registerPrompt() */
export interface McpPromptConfig {
  name: string;
  description?: string;
  arguments?: McpPromptArgument[];
  get: (args: Record<string, string>) => Promise<{
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  }>;
}

// ---------------------------------------------------------------------------
// Primitive 4 — requestSampling (reverse : la page demande à l'IA)
// ---------------------------------------------------------------------------

export interface SamplingMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string } | string;
}

export interface SamplingRequest {
  messages: SamplingMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  modelPreferences?: Record<string, unknown>;
}

export interface SamplingResponse {
  role: 'assistant';
  content: { type: 'text'; text: string };
  model?: string;
  stopReason?: 'endTurn' | 'maxTokens' | 'stopSequence';
}

// ---------------------------------------------------------------------------
// Résultats d'exécution génériques
// ---------------------------------------------------------------------------

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
  // ── Tools ─────────────────────────────────────────────────────────────────
  | { type: 'NEW_TOOL_AVAILABLE'; tool: McpTool }
  | { type: 'GET_TOOLS_FOR_TAB'; tabId: number }
  | { type: 'CONTEXT_UPDATED'; tabId: number; tools: McpTool[] }
  | { type: 'EXECUTE_TOOL_REQUEST'; tabId: number; toolName: string; args: Record<string, unknown>; callId: string }
  | { type: 'EXECUTE_ON_PAGE'; toolName: string; args: Record<string, unknown>; callId: string }
  // ── Resources ─────────────────────────────────────────────────────────────
  | { type: 'NEW_RESOURCE_AVAILABLE'; resource: McpResource }
  | { type: 'GET_RESOURCES_FOR_TAB'; tabId: number }
  | { type: 'RESOURCE_CONTEXT_UPDATED'; tabId: number; resources: McpResource[] }
  | { type: 'READ_RESOURCE_REQUEST'; tabId: number; resourceName: string; callId: string }
  | { type: 'READ_RESOURCE_ON_PAGE'; resourceName: string; callId: string }
  // ── Prompts ───────────────────────────────────────────────────────────────
  | { type: 'NEW_PROMPT_AVAILABLE'; prompt: McpPrompt }
  | { type: 'GET_PROMPTS_FOR_TAB'; tabId: number }
  | { type: 'PROMPT_CONTEXT_UPDATED'; tabId: number; prompts: McpPrompt[] }
  | { type: 'GET_PROMPT_REQUEST'; tabId: number; promptName: string; promptArgs: Record<string, string>; callId: string }
  | { type: 'GET_PROMPT_ON_PAGE'; promptName: string; promptArgs: Record<string, string>; callId: string }
  // ── Sampling ──────────────────────────────────────────────────────────────
  | { type: 'SAMPLING_REQUEST'; requestId: string; tabId?: number; params: SamplingRequest }
  | { type: 'SAMPLING_RESPONSE'; requestId: string; result?: SamplingResponse; error?: string }
  // ── Thinking ──────────────────────────────────────────────────────────────
  | { type: 'THINKING_UPDATE'; tabId: number; text: string };

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
  /** API Web MCP native étendue avec les 4 primitives */
  interface ModelContext {
    registerTool(config: McpToolConfig): void;
    registerResource(config: McpResourceConfig): void;
    registerPrompt(config: McpPromptConfig): void;
    requestSampling(params: SamplingRequest): Promise<SamplingResponse>;
  }

  interface Navigator {
    modelContext?: ModelContext;
  }
}
