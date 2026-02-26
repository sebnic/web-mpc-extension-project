/**
 * background.ts — Service Worker (Background)
 *
 * Responsabilités :
 *   - Maintenir la liste des outils MCP découverts par onglet
 *   - Router les messages entre content.ts et sidepanel.ts
 *   - Ouvrir automatiquement le Side Panel au clic sur l'action
 */

import type { McpTool, ExtensionMessage, ToolResponse } from './types';

/**
 * BackgroundService gère l'état global de l'extension (service worker).
 * Un seul singleton est instancié à la fin de ce fichier.
 */
class BackgroundService {
  /** Outils MCP découverts, indexés par identifiant d'onglet */
  private readonly portalContexts = new Map<number, McpTool[]>();

  constructor() {
    this.configureSidePanel();
    this.bindMessageRouter();
    this.bindTabCleanup();
  }

  // ── Configuration ────────────────────────────────────────────────────────

  /** Ouvre le Side Panel lors du clic sur l'icône de l'extension */
  private configureSidePanel(): void {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(console.error);
  }

  // ── Routeur de messages ───────────────────────────────────────────────────

  private bindMessageRouter(): void {
    chrome.runtime.onMessage.addListener(
      (
        message: ExtensionMessage,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void,
      ): boolean | void => {
        console.log(
          '[MCP BackgroundService] Message reçu :',
          message.type,
          '| sender.tab :',
          sender.tab?.id,
        );

        if (message.type === 'NEW_TOOL_AVAILABLE' && sender.tab?.id !== undefined) {
          this.handleNewTool(sender.tab.id, message.tool);
          return;
        }

        if (message.type === 'GET_TOOLS_FOR_TAB') {
          sendResponse({ tools: this.getToolsForTab(message.tabId) });
          return true;
        }

        if (message.type === 'EXECUTE_TOOL_REQUEST') {
          this.forwardExecutionToTab(message, sendResponse);
          return true;
        }
      },
    );
  }

  // ── Gestion des outils ───────────────────────────────────────────────────

  /** Enregistre un nouvel outil pour un onglet et notifie le Side Panel */
  private handleNewTool(tabId: number, tool: McpTool): void {
    const tools = this.portalContexts.get(tabId) ?? [];

    if (!tools.find((t) => t.name === tool.name)) {
      tools.push(tool);
      this.portalContexts.set(tabId, tools);
    }

    chrome.action.setBadgeText({ tabId, text: 'AI' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#ff7900' });

    // Notification du Side Panel (peut être fermé — on ignore l'erreur)
    chrome.runtime
      .sendMessage({ type: 'CONTEXT_UPDATED', tabId, tools } as ExtensionMessage)
      .catch(() => {});
  }

  /** Retourne les outils enregistrés pour un onglet donné */
  private getToolsForTab(tabId: number): McpTool[] {
    return this.portalContexts.get(tabId) ?? [];
  }

  // ── Exécution d'outil ────────────────────────────────────────────────────

  /** Transmet une demande d'exécution au content script de l'onglet cible */
  private forwardExecutionToTab(
    message: Extract<ExtensionMessage, { type: 'EXECUTE_TOOL_REQUEST' }>,
    sendResponse: (response?: unknown) => void,
  ): void {
    chrome.tabs.sendMessage(
      message.tabId,
      {
        type: 'EXECUTE_ON_PAGE',
        toolName: message.toolName,
        args: message.args,
        callId: message.callId,
      } as ExtensionMessage,
      (response: ToolResponse) => sendResponse(response),
    );
  }

  // ── Nettoyage ────────────────────────────────────────────────────────────

  /** Libère la mémoire d'un onglet fermé */
  private bindTabCleanup(): void {
    chrome.tabs.onRemoved.addListener((tabId: number) => {
      this.portalContexts.delete(tabId);
    });
  }
}

// Point d'entrée — instanciation du singleton
new BackgroundService();
