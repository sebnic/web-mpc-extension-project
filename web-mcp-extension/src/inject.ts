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
import type { McpToolConfig, McpResourceConfig, McpPromptConfig, SamplingRequest, SamplingResponse } from './types';

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
    this.patchRegisterResource();
    this.patchRegisterPrompt();
    this.patchRequestSampling();
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

  // ── Primitive 2 — registerResource ────────────────────────────────────────

  /**
   * Instrumente registerResource() pour émettre MCP_RESOURCE_DISCOVERED.
   * Le callback `read()` est conservé dans une Map afin que content.ts
   * puisse déclencher la lecture via READ_RESOURCE_ON_PAGE.
   */
  private patchRegisterResource(): void {
    const resourceHandlers = new Map<string, () => Promise<{ content: string }>>();

    // Expose la Map pour que l'event handler puisse l'atteindre
    (window as any).__MCP_RESOURCE_HANDLERS = resourceHandlers;

    try {
      Object.defineProperty(this.mc, 'registerResource', {
        value: (config: McpResourceConfig) => {
          if (!config?.name) {
            console.warn('[MCP ModelContextPatcher] registerResource: config invalide.', config);
            return;
          }
          console.log('[MCP ModelContextPatcher] registerResource intercepté :', config.name);
          resourceHandlers.set(config.name, config.read);
          window.dispatchEvent(
            new CustomEvent('MCP_RESOURCE_DISCOVERED', {
              detail: {
                name: config.name,
                description: config.description ?? '',
                mimeType: config.mimeType,
              },
            }),
          );
        },
        writable: true,
        configurable: true,
      });
      console.log('[MCP ModelContextPatcher] ✅ registerResource patché.');
    } catch (e) {
      console.error('[MCP ModelContextPatcher] ❌ Impossible de patcher registerResource :', e);
    }

    // Écoute les demandes de lecture venant de content.ts
    window.addEventListener('READ_RESOURCE_ON_PAGE', async (event: Event) => {
      const { resourceName, callId } = (event as CustomEvent<{ resourceName: string; callId: string }>).detail;
      const handler = resourceHandlers.get(resourceName);
      if (!handler) {
        window.dispatchEvent(new CustomEvent('READ_RESOURCE_RESULT', {
          detail: { callId, error: `Ressource inconnue : ${resourceName}` },
        }));
        return;
      }
      try {
        const result = await handler();
        window.dispatchEvent(new CustomEvent('READ_RESOURCE_RESULT', { detail: { callId, result } }));
      } catch (e) {
        window.dispatchEvent(new CustomEvent('READ_RESOURCE_RESULT', {
          detail: { callId, error: String(e) },
        }));
      }
    });
  }

  // ── Primitive 3 — registerPrompt ──────────────────────────────────────────

  /**
   * Instrumente registerPrompt() pour émettre MCP_PROMPT_DISCOVERED.
   * Le callback `get()` est stocké pour être rappelé via GET_PROMPT_ON_PAGE.
   */
  private patchRegisterPrompt(): void {
    const promptHandlers = new Map<string, (args: Record<string, string>) => Promise<{ messages: unknown[] }>>();
    (window as any).__MCP_PROMPT_HANDLERS = promptHandlers;

    try {
      Object.defineProperty(this.mc, 'registerPrompt', {
        value: (config: McpPromptConfig) => {
          if (!config?.name) {
            console.warn('[MCP ModelContextPatcher] registerPrompt: config invalide.', config);
            return;
          }
          console.log('[MCP ModelContextPatcher] registerPrompt intercepté :', config.name);
          promptHandlers.set(config.name, config.get);
          window.dispatchEvent(
            new CustomEvent('MCP_PROMPT_DISCOVERED', {
              detail: {
                name: config.name,
                description: config.description ?? '',
                arguments: config.arguments ?? [],
              },
            }),
          );
        },
        writable: true,
        configurable: true,
      });
      console.log('[MCP ModelContextPatcher] ✅ registerPrompt patché.');
    } catch (e) {
      console.error('[MCP ModelContextPatcher] ❌ Impossible de patcher registerPrompt :', e);
    }

    // Écoute les demandes d'invocation de prompt
    window.addEventListener('GET_PROMPT_ON_PAGE', async (event: Event) => {
      const { promptName, promptArgs, callId } = (event as CustomEvent<{
        promptName: string;
        promptArgs: Record<string, string>;
        callId: string;
      }>).detail;
      const handler = promptHandlers.get(promptName);
      if (!handler) {
        window.dispatchEvent(new CustomEvent('GET_PROMPT_RESULT', {
          detail: { callId, error: `Prompt inconnu : ${promptName}` },
        }));
        return;
      }
      try {
        const result = await handler(promptArgs ?? {});
        window.dispatchEvent(new CustomEvent('GET_PROMPT_RESULT', { detail: { callId, result } }));
      } catch (e) {
        window.dispatchEvent(new CustomEvent('GET_PROMPT_RESULT', {
          detail: { callId, error: String(e) },
        }));
      }
    });
  }

  // ── Primitive 4 — requestSampling ─────────────────────────────────────────

  /**
   * Instrumente requestSampling() : retourne une Promise que l'extension
   * résoudra après avoir interrogé Gemini dans le Side Panel.
   */
  private patchRequestSampling(): void {
    try {
      Object.defineProperty(this.mc, 'requestSampling', {
        value: (params: SamplingRequest): Promise<unknown> => {
          const requestId = ([1e7].toString() + -1e3 + -4e3 + -8e3 + -1e11).replace(
            /[018]/g,
            (c: string) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
          );
          console.log('[MCP ModelContextPatcher] requestSampling intercepté, id =', requestId);

          return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              cleanup();
              reject(new Error('requestSampling timeout (30s)'));
            }, 30_000);

            const handler = (event: Event) => {
              const detail = (event as CustomEvent<{ requestId: string; result?: unknown; error?: string }>).detail;
              if (detail?.requestId !== requestId) return;
              cleanup();
              if (detail.error) {
                reject(new Error(detail.error));
              } else {
                resolve(detail.result);
              }
            };

            const cleanup = () => {
              clearTimeout(timeoutId);
              window.removeEventListener('MCP_SAMPLING_RESULT', handler);
            };

            window.addEventListener('MCP_SAMPLING_RESULT', handler);
            window.dispatchEvent(
              new CustomEvent('MCP_SAMPLING_REQUEST', {
                detail: { requestId, params },
              }),
            );
          });
        },
        writable: true,
        configurable: true,
      });
      console.log('[MCP ModelContextPatcher] ✅ requestSampling patché.');
    } catch (e) {
      console.error('[MCP ModelContextPatcher] ❌ Impossible de patcher requestSampling :', e);
    }
  }

  // ── Signal ────────────────────────────────────────────────────────────────

  /** Notifie les scripts de la page que le patch est opérationnel */
  private signalReady(): void {
    console.log('[MCP ModelContextPatcher] Dispatch MCP_INJECT_READY');
    // Flag global pour que les pages qui s'initialisent après l'injection
    // puissent vérifier l'état sans dépendre d'un event listener timing-sensitive.
    try {
      (window as any).__MCP_INJECT_READY = true;
    } catch (e) {
      // ignore
    }
    window.dispatchEvent(new CustomEvent('MCP_INJECT_READY'));
    // Rediffuse légèrement plus tard pour couvrir le cas où l'app
    // attache son listener juste après le dispatch initial.
    setTimeout(() => window.dispatchEvent(new CustomEvent('MCP_INJECT_READY')), 50);
  }
}

// Point d'entrée
new ModelContextPatcher();
