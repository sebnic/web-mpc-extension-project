/**
 * content.ts — Le Pont (The Bridge)
 *
 * S'exécute dans le contexte isolé de la page (document_start).
 * Joue le rôle d'intermédiaire entre :
 *   - La page web (inject.ts) via CustomEvents sur window
 *   - L'extension (background.ts / sidepanel.ts) via chrome.runtime
 */

import type { McpTool, McpResource, McpPrompt, ExtensionMessage, ToolResponse } from './types';

const TOOL_EXECUTION_TIMEOUT_MS = 10_000;

/**
 * ContentBridge injecte inject.js dans la page et sert de pont
 * bidirectionnel entre le contexte de page et le service worker.
 */
class ContentBridge {
  constructor() {
    this.injectScript();
    this.listenForDiscoveredTools();
    this.listenForDiscoveredResources();
    this.listenForDiscoveredPrompts();
    this.listenForSamplingRequests();
    this.listenForExecutionRequests();
  }

  // ── Injection ─────────────────────────────────────────────────────────────

  /** Injecte inject.js dans le contexte non-isolé de la page */
  private injectScript(): void {
    console.log('[MCP ContentBridge] Chargé. Injection de inject.js…');
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = () => {
      console.log('[MCP ContentBridge] inject.js chargé dans la page.');
      script.remove();
    };
    script.onerror = (e: string | Event) =>
      console.error('[MCP ContentBridge] ❌ Échec du chargement de inject.js :', e);
    (document.head ?? document.documentElement).appendChild(script);
  }

  // ── Page → Extension ─────────────────────────────────────────────────────

  /** Écoute les outils découverts par inject.ts et les relaie au background */
  private listenForDiscoveredTools(): void {    window.addEventListener('MCP_TOOL_DISCOVERED', (event: Event) => {
      const tool = (event as CustomEvent<McpTool>).detail;
      if (!tool?.name) {
        console.warn("[MCP ContentBridge] Événement sans nom d'outil, ignoré.");
        return;
      }
      console.log('[MCP ContentBridge] Outil découvert :', tool.name);
      chrome.runtime.sendMessage(
        { type: 'NEW_TOOL_AVAILABLE', tool } as ExtensionMessage,
        (resp: unknown) => {
          if (chrome.runtime.lastError) {
            console.error('[MCP ContentBridge] ❌ sendMessage erreur :', chrome.runtime.lastError.message);
          } else {
            console.log('[MCP ContentBridge] ✅ NEW_TOOL_AVAILABLE transmis, réponse :', resp);
          }
        },
      );
    });
  }

  // ── Page → Extension (Resources & Prompts) ──────────────────────────────

  /** Écoute les ressources découvertes par inject.ts et les relaie au background */
  private listenForDiscoveredResources(): void {
    window.addEventListener('MCP_RESOURCE_DISCOVERED', (event: Event) => {
      const resource = (event as CustomEvent<McpResource>).detail;
      if (!resource?.name) return;
      console.log('[MCP ContentBridge] Ressource découverte :', resource.name);
      chrome.runtime.sendMessage(
        { type: 'NEW_RESOURCE_AVAILABLE', resource } as ExtensionMessage,
        (resp: unknown) => {
          if (chrome.runtime.lastError) {
            console.error('[MCP ContentBridge] ❌ NEW_RESOURCE_AVAILABLE erreur :', chrome.runtime.lastError.message);
          } else {
            console.log('[MCP ContentBridge] ✅ NEW_RESOURCE_AVAILABLE transmis :', resp);
          }
        },
      );
    });
  }

  /** Écoute les prompts découverts par inject.ts et les relaie au background */
  private listenForDiscoveredPrompts(): void {
    window.addEventListener('MCP_PROMPT_DISCOVERED', (event: Event) => {
      const prompt = (event as CustomEvent<McpPrompt>).detail;
      if (!prompt?.name) return;
      console.log('[MCP ContentBridge] Prompt découvert :', prompt.name);
      chrome.runtime.sendMessage(
        { type: 'NEW_PROMPT_AVAILABLE', prompt } as ExtensionMessage,
        (resp: unknown) => {
          if (chrome.runtime.lastError) {
            console.error('[MCP ContentBridge] ❌ NEW_PROMPT_AVAILABLE erreur :', chrome.runtime.lastError.message);
          } else {
            console.log('[MCP ContentBridge] ✅ NEW_PROMPT_AVAILABLE transmis :', resp);
          }
        },
      );
    });
  }

  /** Écoute les demandes requestSampling de la page et les envoie au background */
  private listenForSamplingRequests(): void {
    window.addEventListener('MCP_SAMPLING_REQUEST', (event: Event) => {
      const { requestId, params } = (event as CustomEvent<{ requestId: string; params: unknown }>).detail;
      if (!requestId) return;
      console.log('[MCP ContentBridge] SAMPLING_REQUEST :', requestId);
      chrome.runtime.sendMessage(
        { type: 'SAMPLING_REQUEST', requestId, params } as ExtensionMessage,
        (response: { result?: unknown; error?: string }) => {
          if (chrome.runtime.lastError) {
            window.dispatchEvent(new CustomEvent('MCP_SAMPLING_RESULT', {
              detail: { requestId, error: chrome.runtime.lastError.message },
            }));
            return;
          }
          window.dispatchEvent(new CustomEvent('MCP_SAMPLING_RESULT', {
            detail: { requestId, result: response?.result, error: response?.error },
          }));
        },
      );
    });
  }

  // ── Extension → Page ─────────────────────────────────────────────────────

  /** Écoute les demandes d'exécution du Side Panel et les relaie à la page */
  private listenForExecutionRequests(): void {
    chrome.runtime.onMessage.addListener(
      (
        request: ExtensionMessage,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void,
      ): boolean | void => {
        if (request.type === 'EXECUTE_ON_PAGE') {
          this.executeOnPage(request, sendResponse);
          return true; // canal asynchrone
        }
        if (request.type === 'READ_RESOURCE_ON_PAGE') {
          this.readResourceOnPage(request, sendResponse);
          return true;
        }
        if (request.type === 'GET_PROMPT_ON_PAGE') {
          this.getPromptOnPage(request, sendResponse);
          return true;
        }
      },
    );
  }

  /** Demande la lecture d'une ressource MCP à la page */
  private readResourceOnPage(
    request: Extract<ExtensionMessage, { type: 'READ_RESOURCE_ON_PAGE' }>,
    sendResponse: (response?: unknown) => void,
  ): void {
    const { resourceName, callId } = request;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ callId: string; result?: unknown; error?: string }>).detail;
      if (detail?.callId !== callId) return;
      window.removeEventListener('READ_RESOURCE_RESULT', handler);
      sendResponse(detail.error ? { status: 'error', result: { error: detail.error } } : { status: 'success', result: detail.result });
    };
    window.addEventListener('READ_RESOURCE_RESULT', handler);
    window.dispatchEvent(new CustomEvent('READ_RESOURCE_ON_PAGE', { detail: { resourceName, callId } }));
  }

  /** Demande l'invocation d'un prompt MCP à la page */
  private getPromptOnPage(
    request: Extract<ExtensionMessage, { type: 'GET_PROMPT_ON_PAGE' }>,
    sendResponse: (response?: unknown) => void,
  ): void {
    const { promptName, promptArgs, callId } = request;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ callId: string; result?: unknown; error?: string }>).detail;
      if (detail?.callId !== callId) return;
      window.removeEventListener('GET_PROMPT_RESULT', handler);
      sendResponse(detail.error ? { status: 'error', result: { error: detail.error } } : { status: 'success', result: detail.result });
    };
    window.addEventListener('GET_PROMPT_RESULT', handler);
    window.dispatchEvent(new CustomEvent('GET_PROMPT_ON_PAGE', { detail: { promptName, promptArgs, callId } }));
  }

  /**
   * Dispatche l'exécution vers la page via CustomEvent et attend
   * MCP_EXECUTION_RESULT avec le callId correspondant.
   */
  private executeOnPage(
    request: Extract<ExtensionMessage, { type: 'EXECUTE_ON_PAGE' }>,
    sendResponse: (response?: unknown) => void,
  ): void {
    const { callId, toolName, args } = request;

    const responseHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ callId: string; result: unknown }>).detail;
      if (detail?.callId === callId) {
        cleanup();
        sendResponse({ status: 'success', result: detail.result } as ToolResponse);
      }
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      sendResponse({
        status: 'error',
        result: { error: "Timeout : la page n'a pas répondu." },
      } as ToolResponse);
    }, TOOL_EXECUTION_TIMEOUT_MS);

    const wrappedHandler = (e: Event) => {
      clearTimeout(timeoutId);
      responseHandler(e);
    };

    const cleanup = () => window.removeEventListener('MCP_EXECUTION_RESULT', wrappedHandler);

    window.addEventListener('MCP_EXECUTION_RESULT', wrappedHandler);
    window.dispatchEvent(new CustomEvent('EXECUTE_MCP_FROM_EXT', { detail: { callId, toolName, args } }));
  }
}

// Point d'entrée
new ContentBridge();
