/**
 * content.ts — Le Pont (The Bridge)
 *
 * S'exécute dans le contexte isolé de la page (document_start).
 * Joue le rôle d'intermédiaire entre :
 *   - La page web (inject.ts) via CustomEvents sur window
 *   - L'extension (background.ts / sidepanel.ts) via chrome.runtime
 */

import type { McpTool, ExtensionMessage, ToolResponse } from './types';

const TOOL_EXECUTION_TIMEOUT_MS = 10_000;

/**
 * ContentBridge injecte inject.js dans la page et sert de pont
 * bidirectionnel entre le contexte de page et le service worker.
 */
class ContentBridge {
  constructor() {
    this.injectScript();
    this.listenForDiscoveredTools();
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
  private listenForDiscoveredTools(): void {
    window.addEventListener('MCP_TOOL_DISCOVERED', (event: Event) => {
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
      },
    );
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
