/**
 * inject.js — Le Monkey Patcher
 *
 * Ce script est injecté directement dans le contexte de la page web (non isolé)
 * afin d'intercepter les appels à navigator.modelContext.registerTool()
 * effectués par l'application Angular.
 *
 * Il émet un CustomEvent "MCP_TOOL_DISCOVERED" capturable par content.js.
 */
(function () {
  'use strict';

  console.log('[MCP inject.js] Script chargé dans le contexte de la page.');
  console.log('[MCP inject.js] navigator.modelContext =', window.navigator.modelContext);
  console.log('[MCP inject.js] typeof navigator.modelContext =', typeof window.navigator.modelContext);

  // Si modelContext n'existe pas encore, on crée un objet de substitution
  if (!window.navigator.modelContext) {
    console.log('[MCP inject.js] modelContext absent — création du fallback.');
    Object.defineProperty(window.navigator, 'modelContext', {
      value: Object.create(null),
      writable: false,
      configurable: true,
    });
  }

  const _mc = window.navigator.modelContext;
  console.log('[MCP inject.js] _mc =', _mc);
  console.log('[MCP inject.js] typeof _mc.registerTool =', typeof _mc.registerTool);

  const originalRegister = typeof _mc.registerTool === 'function'
    ? _mc.registerTool.bind(_mc)
    : null;
  console.log('[MCP inject.js] originalRegister préservé =', !!originalRegister);

  function patchedRegisterTool(config) {
    console.log('[MCP inject.js] patchedRegisterTool appelé ! config =', config);
    if (!config || !config.name) {
      console.warn('[MCP inject.js] registerTool appelé sans config valide.', config);
      return;
    }

    console.log('[MCP inject.js] Outil découvert :', config.name, '— dispatch MCP_TOOL_DISCOVERED');

    // Émission de l'événement interceptable par content.js
    window.dispatchEvent(
      new CustomEvent('MCP_TOOL_DISCOVERED', {
        detail: {
          name: config.name,
          description: config.description || '',
          inputSchema: config.inputSchema || {},
        },
      })
    );

    // Préserve l'implémentation native si elle existe
    if (originalRegister) {
      try {
        return originalRegister(config);
      } catch (e) {
        // L'API native peut rejeter l'appel dans certains contextes — on ignore
        console.warn('[MCP Extension] Appel natif registerTool ignoré :', e.message);
      }
    }
  }

  // Object.defineProperty force l'écriture même sur une propriété non-writable
  // d'un objet natif, là où une simple assignation échouerait silencieusement.
  try {
    Object.defineProperty(_mc, 'registerTool', {
      value: patchedRegisterTool,
      writable: true,
      configurable: true,
    });
    console.log('[MCP inject.js] ✅ registerTool patché avec succès.');
    console.log('[MCP inject.js] Vérification — navigator.modelContext.registerTool === patchedRegisterTool :', window.navigator.modelContext.registerTool === patchedRegisterTool);
  } catch (e) {
    console.error('[MCP inject.js] ❌ Impossible de patcher registerTool :', e);
  }

  // Signal aux scripts de la page que le patch est en place
  console.log('[MCP inject.js] Dispatch MCP_INJECT_READY');
  window.dispatchEvent(new CustomEvent('MCP_INJECT_READY'));
})();
