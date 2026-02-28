/**
 * background.ts — Service Worker (Background)
 *
 * Responsabilités :
 *   - Maintenir la liste des outils MCP découverts par onglet
 *   - Router les messages entre content.ts et sidepanel.ts
 *   - Ouvrir automatiquement le Side Panel au clic sur l'action
 */

import type { McpTool, McpResource, McpPrompt, ExtensionMessage, ToolResponse } from './types';

/**
 * BackgroundService gère l'état global de l'extension (service worker).
 * Un seul singleton est instancié à la fin de ce fichier.
 */
class BackgroundService {
  /** Outils MCP découverts, indexés par identifiant d'onglet */
  private readonly portalContexts = new Map<number, McpTool[]>();
  /** Ressources MCP découvertes, indexées par identifiant d'onglet */
  private readonly portalResources = new Map<number, McpResource[]>();
  /** Prompts MCP découverts, indexés par identifiant d'onglet */
  private readonly portalPrompts = new Map<number, McpPrompt[]>();

  constructor() {
    console.log('[MCP BackgroundService] Service Worker démarré.');
    this.configureSidePanel();
    this.bindMessageRouter();
    this.bindTabCleanup();
    this.restoreFromStorage();
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
          chrome.storage.local.get('mcp_portal_contexts', (res) => {
            const map = (res?.mcp_portal_contexts ?? {}) as Record<string, McpTool[]>;
            const tools: McpTool[] = map[String(message.tabId)] ?? [];
            sendResponse({ tools });
          });
          return true;
        }

        if (message.type === 'EXECUTE_TOOL_REQUEST') {
          this.forwardExecutionToTab(message, sendResponse);
          return true;
        }

        // ── Primitive 2 — Resources ──────────────────────────────────────
        if (message.type === 'NEW_RESOURCE_AVAILABLE' && sender.tab?.id !== undefined) {
          this.handleNewResource(sender.tab.id, message.resource);
          return;
        }

        if (message.type === 'GET_RESOURCES_FOR_TAB') {
          const resources = this.portalResources.get(message.tabId) ?? [];
          sendResponse({ resources });
          return;
        }

        if (message.type === 'READ_RESOURCE_REQUEST') {
          this.forwardReadResourceToTab(message, sendResponse);
          return true;
        }

        // ── Primitive 3 — Prompts ────────────────────────────────────────
        if (message.type === 'NEW_PROMPT_AVAILABLE' && sender.tab?.id !== undefined) {
          this.handleNewPrompt(sender.tab.id, message.prompt);
          return;
        }

        if (message.type === 'GET_PROMPTS_FOR_TAB') {
          const prompts = this.portalPrompts.get(message.tabId) ?? [];
          sendResponse({ prompts });
          return;
        }

        if (message.type === 'GET_PROMPT_REQUEST') {
          this.forwardGetPromptToTab(message, sendResponse);
          return true;
        }

        // ── Primitive 4 — Sampling ───────────────────────────────────────
        if (message.type === 'SAMPLING_REQUEST') {
          // Forward to side panel (which has Gemini client)
          const tabId = sender.tab?.id;
          chrome.runtime
            .sendMessage({ type: 'SAMPLING_REQUEST', requestId: message.requestId, tabId, params: message.params } as ExtensionMessage)
            .then((result: unknown) => sendResponse(result))
            .catch((e: Error) => sendResponse({ error: e.message }));
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

    // Persister l'état pour survivre au cycle de vie du service worker
    this.persistContexts();
  }

  /** Retourne les outils enregistrés pour un onglet donné */
  private getToolsForTab(tabId: number): McpTool[] {
    return this.portalContexts.get(tabId) ?? [];
  }

  // ── Gestion des ressources ────────────────────────────────────────────────

  private handleNewResource(tabId: number, resource: McpResource): void {
    const resources = this.portalResources.get(tabId) ?? [];
    if (!resources.find((r) => r.name === resource.name)) {
      resources.push(resource);
      this.portalResources.set(tabId, resources);
    }
    chrome.runtime
      .sendMessage({ type: 'RESOURCE_CONTEXT_UPDATED', tabId, resources } as ExtensionMessage)
      .catch(() => {});
  }

  private forwardReadResourceToTab(
    message: Extract<ExtensionMessage, { type: 'READ_RESOURCE_REQUEST' }>,
    sendResponse: (response?: unknown) => void,
  ): void {
    chrome.tabs.sendMessage(
      message.tabId,
      { type: 'READ_RESOURCE_ON_PAGE', resourceName: message.resourceName, callId: message.callId } as ExtensionMessage,
      (response: unknown) => sendResponse(response),
    );
  }

  // ── Gestion des prompts ───────────────────────────────────────────────────

  private handleNewPrompt(tabId: number, prompt: McpPrompt): void {
    const prompts = this.portalPrompts.get(tabId) ?? [];
    if (!prompts.find((p) => p.name === prompt.name)) {
      prompts.push(prompt);
      this.portalPrompts.set(tabId, prompts);
    }
    chrome.runtime
      .sendMessage({ type: 'PROMPT_CONTEXT_UPDATED', tabId, prompts } as ExtensionMessage)
      .catch(() => {});
  }

  private forwardGetPromptToTab(
    message: Extract<ExtensionMessage, { type: 'GET_PROMPT_REQUEST' }>,
    sendResponse: (response?: unknown) => void,
  ): void {
    chrome.tabs.sendMessage(
      message.tabId,
      { type: 'GET_PROMPT_ON_PAGE', promptName: message.promptName, promptArgs: message.promptArgs, callId: message.callId } as ExtensionMessage,
      (response: unknown) => sendResponse(response),
    );
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
      this.portalResources.delete(tabId);
      this.portalPrompts.delete(tabId);
      this.persistContexts();
    });
  }

  /** Persiste le mapping tabId -> tools/resources/prompts dans chrome.storage.local */
  private persistContexts(): void {
    try {
      const tools: Record<string, McpTool[]> = {};
      const resources: Record<string, McpResource[]> = {};
      const prompts: Record<string, McpPrompt[]> = {};
      for (const [tabId, t] of this.portalContexts.entries()) { tools[String(tabId)] = t; }
      for (const [tabId, r] of this.portalResources.entries()) { resources[String(tabId)] = r; }
      for (const [tabId, p] of this.portalPrompts.entries()) { prompts[String(tabId)] = p; }
      chrome.storage.local.set({ mcp_portal_contexts: tools, mcp_portal_resources: resources, mcp_portal_prompts: prompts });
    } catch (e) {
      console.error('[MCP BackgroundService] Erreur persistContexts :', e);
    }
  }

  /** Restaure l'état précédemment persisté (appelé au démarrage du SW) */
  private restoreFromStorage(): void {
    chrome.storage.local.get(
      ['mcp_portal_contexts', 'mcp_portal_resources', 'mcp_portal_prompts'],
      (res) => {
        const toolsMap = (res?.mcp_portal_contexts ?? {}) as Record<string, unknown>;
        for (const [k, v] of Object.entries(toolsMap)) {
          const tabId = Number(k);
          if (!Number.isNaN(tabId) && Array.isArray(v)) {
            this.portalContexts.set(tabId, v as McpTool[]);
          }
        }
        const resourcesMap = (res?.mcp_portal_resources ?? {}) as Record<string, unknown>;
        for (const [k, v] of Object.entries(resourcesMap)) {
          const tabId = Number(k);
          if (!Number.isNaN(tabId) && Array.isArray(v)) {
            this.portalResources.set(tabId, v as McpResource[]);
          }
        }
        const promptsMap = (res?.mcp_portal_prompts ?? {}) as Record<string, unknown>;
        for (const [k, v] of Object.entries(promptsMap)) {
          const tabId = Number(k);
          if (!Number.isNaN(tabId) && Array.isArray(v)) {
            this.portalPrompts.set(tabId, v as McpPrompt[]);
          }
        }
      },
    );
  }
}

// Point d'entrée — instanciation du singleton
new BackgroundService();
