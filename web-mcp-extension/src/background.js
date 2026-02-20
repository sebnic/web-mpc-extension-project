/**
 * background.js — Service Worker (Background)
 *
 * Responsabilités :
 *   - Maintenir la liste des outils MCP découverts par onglet
 *   - Router les messages entre content.js et sidepanel.js
 *   - Ouvrir automatiquement le Side Panel au clic sur l'action
 */

'use strict';

/** @type {Map<number, Array<{name: string, description: string, inputSchema: object}>>} */
const portalContexts = new Map();

// ---------------------------------------------------------------------------
// Ouvre le side panel lorsque l'utilisateur clique sur l'icône de l'extension
// ---------------------------------------------------------------------------
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// ---------------------------------------------------------------------------
// Routeur de messages central
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[MCP background.js] Message reçu :', message.type, '| sender.tab :', sender.tab?.id);

  // ── A. Nouvel outil découvert sur la page ──────────────────────────────
  if (message.type === 'NEW_TOOL_AVAILABLE' && sender.tab) {
    console.log('[MCP background.js] Nouvel outil :', message.tool?.name, '| tabId :', sender.tab.id);
    const tabId = sender.tab.id;
    const currentTools = portalContexts.get(tabId) || [];

    // Dédoublonnage par nom
    if (!currentTools.find((t) => t.name === message.tool.name)) {
      currentTools.push(message.tool);
      portalContexts.set(tabId, currentTools);
    }

    // Badge visuel sur l'icône de l'extension
    chrome.action.setBadgeText({ tabId, text: 'AI' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#4285F4' });

    // Notification du Side Panel (peut être fermé ; on ignore l'erreur)
    chrome.runtime
      .sendMessage({ type: 'CONTEXT_UPDATED', tabId, tools: currentTools })
      .catch(() => {});

    return;
  }

  // ── B. Side Panel demande les outils de l'onglet actif ─────────────────
  if (message.type === 'GET_TOOLS_FOR_TAB') {
    const tools = portalContexts.get(message.tabId) || [];
    sendResponse({ tools });
    return true;
  }

  // ── C. Side Panel demande l'exécution d'un outil ────────────────────────
  if (message.type === 'EXECUTE_TOOL_REQUEST') {
    chrome.tabs.sendMessage(
      message.tabId,
      {
        type: 'EXECUTE_ON_PAGE',
        toolName: message.toolName,
        args: message.args,
        callId: message.callId,
      },
      (response) => {
        sendResponse(response);
      }
    );
    // Maintien du canal pour la réponse asynchrone
    return true;
  }
});

// ---------------------------------------------------------------------------
// Nettoyage de la mémoire lors de la fermeture d'un onglet
// ---------------------------------------------------------------------------
chrome.tabs.onRemoved.addListener((tabId) => {
  portalContexts.delete(tabId);
});
