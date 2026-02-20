/**
 * content.js — Le Pont (The Bridge)
 *
 * S'exécute dans le contexte isolé de la page (document_start).
 * Joue le rôle d'intermédiaire entre :
 *   - La page web (inject.js) via CustomEvents sur window
 *   - L'extension (background.js / sidepanel.js) via chrome.runtime
 */

// ---------------------------------------------------------------------------
// 1. Injection du script d'interception dans le contexte de la PAGE
// ---------------------------------------------------------------------------
console.log('[MCP content.js] Content script chargé. Injection de inject.js…');
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = () => {
  console.log('[MCP content.js] inject.js chargé dans la page.');
  script.remove();
};
script.onerror = (e) => console.error('[MCP content.js] ❌ Échec du chargement de inject.js :', e);
(document.head || document.documentElement).appendChild(script);
console.log('[MCP content.js] <script> inject.js ajouté au DOM.');

// ---------------------------------------------------------------------------
// 2. Page → Extension : écoute des outils découverts par inject.js
// ---------------------------------------------------------------------------
console.log('[MCP content.js] Écoute de MCP_TOOL_DISCOVERED activée.');
window.addEventListener('MCP_TOOL_DISCOVERED', (event) => {
  console.log('[MCP content.js] MCP_TOOL_DISCOVERED reçu :', event.detail);
  const tool = event.detail;
  if (!tool || !tool.name) {
    console.warn('[MCP content.js] Événement reçu sans nom d\'outil, ignoré.');
    return;
  }
  console.log('[MCP content.js] Envoi NEW_TOOL_AVAILABLE au background pour :', tool.name);
  chrome.runtime.sendMessage({ type: 'NEW_TOOL_AVAILABLE', tool }, (resp) => {
    if (chrome.runtime.lastError) {
      console.error('[MCP content.js] ❌ sendMessage erreur :', chrome.runtime.lastError.message);
    } else {
      console.log('[MCP content.js] ✅ NEW_TOOL_AVAILABLE envoyé, réponse :', resp);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Extension → Page : écoute des ordres d'exécution depuis le Side Panel
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'EXECUTE_ON_PAGE') {
    const { callId, toolName, args } = request;

    // Écoute de la réponse qu'Angular renverra via CustomEvent
    const responseHandler = (e) => {
      if (e.detail && e.detail.callId === callId) {
        window.removeEventListener('MCP_EXECUTION_RESULT', responseHandler);
        sendResponse({ status: 'success', result: e.detail.result });
      }
    };

    // Timeout de sécurité (10 s) pour éviter les fuites de mémoire
    const timeoutId = setTimeout(() => {
      window.removeEventListener('MCP_EXECUTION_RESULT', responseHandler);
      sendResponse({ status: 'error', result: { error: 'Timeout: Angular n\'a pas répondu.' } });
    }, 10_000);

    const wrappedHandler = (e) => {
      clearTimeout(timeoutId);
      responseHandler(e);
    };

    window.addEventListener('MCP_EXECUTION_RESULT', wrappedHandler);

    // Demande à Angular d'exécuter l'outil
    window.dispatchEvent(
      new CustomEvent('EXECUTE_MCP_FROM_EXT', {
        detail: { callId, toolName, args },
      })
    );

    // Indispensable pour que sendResponse reste valide de manière asynchrone
    return true;
  }
});
