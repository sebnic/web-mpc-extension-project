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
}

interface Navigator {
  modelContext?: ModelContextApi;
}
