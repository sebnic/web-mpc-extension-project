/**
 * Déclaration globale pour navigator.modelContext
 * Utilisé par l'API native MCP et intercepté par l'extension.
 */
interface ModelContextApi {
  registerTool(config: {
    name: string;
    description: string;
    inputSchema: object;
    execute?: (...args: unknown[]) => unknown;
  }): void;

  registerResource(config: {
    name: string;
    description?: string;
    mimeType?: string;
    read: () => Promise<{ content: string }>;
  }): void;

  registerPrompt(config: {
    name: string;
    description?: string;
    arguments?: Array<{ name: string; description?: string; required?: boolean }>;
    get: (args: Record<string, string>) => Promise<{ messages: unknown[] }>;
  }): void;

  requestSampling(params: {
    messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } | string }>;
    systemPrompt?: string;
    maxTokens?: number;
    modelPreferences?: Record<string, unknown>;
  }): Promise<{ role: 'assistant'; content: { type: 'text'; text: string }; model?: string; stopReason?: string }>;
}

interface Navigator {
  modelContext?: ModelContextApi;
}
