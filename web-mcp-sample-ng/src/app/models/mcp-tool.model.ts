export interface McpInputSchema {
  type: 'object';
  properties: Record<string, { type: string; description?: string; enum?: string[]; items?: { type: string; enum?: string[] }; }>;
  required?: string[];
}

export interface McpToolConfig<TArgs = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: McpInputSchema;
  execute: (args: TArgs) => Promise<unknown>;
}

export interface McpToolInfo {
  name: string;
  description: string;
  callCount: number;
}
