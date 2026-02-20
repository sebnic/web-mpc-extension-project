/**
 * src/sidepanel.js — Source du Side Panel (à bundler avec esbuild)
 *
 * Ce fichier utilise le SDK @google/genai et sera compilé en sidepanel.js
 * (à la racine du répertoire de l'extension) via : npm run build
 */

import { GoogleGenAI } from '@google/genai';

// ---------------------------------------------------------------------------
// État global du panneau
// ---------------------------------------------------------------------------
let genaiClient = null;
let chatSession = null;
let currentPortalTools = [];
let activeTabId = null;

// ---------------------------------------------------------------------------
// Références DOM
// ---------------------------------------------------------------------------
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const toolsList = document.getElementById('tools-list');
const statusBar = document.getElementById('status-bar');
const noToolsMsg = document.getElementById('no-tools-msg');
const toolsCountBadge = document.getElementById('tools-count-badge');
const toggleToolsBtn = document.getElementById('toggle-tools-btn');
const toolsPanelEl = document.getElementById('tools-panel');
const toggleToolsLabel = document.getElementById('toggle-tools-label');

// ---------------------------------------------------------------------------
// Utilitaires UI
// ---------------------------------------------------------------------------

/** Ajoute un message dans la fenêtre de chat */
function addMessage(role, text) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;

  wrapper.appendChild(bubble);
  chatContainer.appendChild(wrapper);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

/** Affiche ou masque un indicateur de chargement */
function setLoading(loading) {
  sendBtn.disabled = loading || currentPortalTools.length === 0;
  if (loading) {
    const indicator = document.createElement('div');
    indicator.id = 'loading-indicator';
    indicator.className = 'message assistant';
    indicator.innerHTML = '<div class="bubble typing"><span></span><span></span><span></span></div>';
    chatContainer.appendChild(indicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } else {
    document.getElementById('loading-indicator')?.remove();
  }
}

/** Met à jour la liste des outils dans le panneau latéral */
function renderTools(tools) {
  toolsList.innerHTML = '';
  const count = tools?.length || 0;
  // Met à jour le badge du compteur
  if (toolsCountBadge) {
    toolsCountBadge.textContent = count;
    toolsCountBadge.classList.toggle('visible', count > 0);
  }
  if (!tools || tools.length === 0) {
    noToolsMsg.style.display = 'block';
    return;
  }
  noToolsMsg.style.display = 'none';
  tools.forEach((tool) => {
    const item = document.createElement('li');
    item.className = 'tool-item';
    item.innerHTML = `
      <span class="tool-name">${tool.name}</span>
      <span class="tool-desc">${tool.description || 'Pas de description.'}</span>
    `;
    toolsList.appendChild(item);
  });
}

/** Met à jour la barre de statut */
function setStatus(msg, type = 'idle') {
  statusBar.textContent = msg;
  statusBar.className = `status-bar ${type}`;
}

// ---------------------------------------------------------------------------
// Récupération des paramètres depuis le stockage local de l'extension
// ---------------------------------------------------------------------------
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['GEMINI_API_KEY', 'GEMINI_MODEL'], (res) => {
      resolve({
        apiKey: res.GEMINI_API_KEY || null,
        model: res.GEMINI_MODEL || 'gemini-2.0-flash',
      });
    });
  });
}

// Réinitialise le client et la session si la config change dans les options
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.GEMINI_API_KEY || changes.GEMINI_MODEL) {
    genaiClient = null;
    chatSession = null;
    const changedKeys = Object.keys(changes).join(', ');
    setStatus(`⚠️ Config modifiée (${changedKeys}) — session réinitialisée.`, 'idle');
    // Met à jour le badge du modèle si le modèle a changé
    if (changes.GEMINI_MODEL) {
      const modelBadge = document.getElementById('model-badge');
      if (modelBadge) modelBadge.textContent = changes.GEMINI_MODEL.newValue || 'gemini-2.0-flash';
    }
  }
});

// ---------------------------------------------------------------------------
// Exécution d'un outil sur le portail Angular (via background + content)
// ---------------------------------------------------------------------------
async function executeToolOnPortal(toolName, args) {
  return new Promise((resolve, reject) => {
    if (!activeTabId) return reject('Aucun onglet actif trouvé.');

    chrome.runtime.sendMessage(
      {
        type: 'EXECUTE_TOOL_REQUEST',
        tabId: activeTabId,
        toolName,
        args,
        callId: crypto.randomUUID(),
      },
      (response) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError.message);
        }
        if (response?.status === 'success') {
          resolve(response.result);
        } else {
          reject(response?.result?.error || 'Erreur inconnue sur le portail.');
        }
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Boucle principale de chat avec Function Calling Gemini
// ---------------------------------------------------------------------------
async function handleUserMessage(userText) {
  const { apiKey, model } = await getSettings();
  if (!apiKey) {
    addMessage('error', '⚠️ Clé API Gemini manquante. Ouvrez les options de l\'extension pour la configurer.');
    return;
  }

  if (!genaiClient) {
    genaiClient = new GoogleGenAI({ apiKey });
  }

  // Formatage des outils pour l'API Gemini
  const formattedTools = currentPortalTools.length > 0
    ? [
        {
          functionDeclarations: currentPortalTools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          })),
        },
      ]
    : [];

  // Création ou réutilisation de la session de chat
  if (!chatSession) {
    chatSession = genaiClient.chats.create({
      model,
      config: {
        tools: formattedTools,
        systemInstruction:
          'Tu es un assistant IA intégré dans un portail Angular. ' +
          'Tu peux utiliser les outils mis à ta disposition pour répondre aux demandes de l\'utilisateur. ' +
          'Réponds toujours en français sauf si l\'utilisateur s\'exprime dans une autre langue.',
      },
    });
  }

  setLoading(true);

  try {
    let response = await chatSession.sendMessage({ message: userText });

    // ── Boucle de Function Calling ────────────────────────────────────────
    while (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      setStatus(`⚙️ Exécution de l'outil : ${call.name}…`, 'working');

      let portalResult;
      try {
        portalResult = await executeToolOnPortal(call.name, call.args);
      } catch (e) {
        portalResult = { error: String(e) };
      }

      // Renvoi du résultat de l'outil à Gemini
      response = await chatSession.sendMessage({
        message: [
          {
            functionResponse: {
              name: call.name,
              response: portalResult,
            },
          },
        ],
      });
    }

    // ── Affichage de la réponse textuelle finale ──────────────────────────
    const finalText = response.text;
    if (finalText) {
      addMessage('assistant', finalText);
    }

    setStatus('✅ Prêt', 'ready');
  } catch (err) {
    console.error('[MCP Extension] Erreur Gemini :', err);
    addMessage('error', `❌ Erreur : ${err.message || err}`);
    setStatus('Erreur', 'error');
    // Reset de la session pour permettre un nouvel essai propre
    chatSession = null;
  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// Initialisation au chargement du panneau
// ---------------------------------------------------------------------------
async function init() {
  // 0. Affiche le modèle actif
  const { model } = await getSettings();
  const modelBadge = document.getElementById('model-badge');
  if (modelBadge) modelBadge.textContent = model;

  // 1. Récupère l'onglet actif pour connaître le contexte
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      activeTabId = tabs[0].id;

      // Demande les outils déjà découverts pour cet onglet
      chrome.runtime.sendMessage(
        { type: 'GET_TOOLS_FOR_TAB', tabId: activeTabId },
        (res) => {
          if (res?.tools) {
            currentPortalTools = res.tools;
            renderTools(currentPortalTools);
            if (currentPortalTools.length > 0) {
              sendBtn.disabled = false;
              setStatus(`✅ ${currentPortalTools.length} outil(s) disponible(s)`, 'ready');
            } else {
              setStatus('En attente de la détection d\'outils sur la page…', 'idle');
            }
          }
        }
      );
    }
  });

  // 2. Écoute les mises à jour d'outils en temps réel
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'CONTEXT_UPDATED' && message.tabId === activeTabId) {
      currentPortalTools = message.tools;
      renderTools(currentPortalTools);
      sendBtn.disabled = false;
      setStatus(`✅ ${currentPortalTools.length} outil(s) disponible(s)`, 'ready');
      // On réinitialise la session pour que les nouveaux outils soient pris en compte
      chatSession = null;
    }
  });
}

// ---------------------------------------------------------------------------
// Gestion de l'envoi par le formulaire
// ---------------------------------------------------------------------------
sendBtn.addEventListener('click', async () => {
  const text = userInput.value.trim();
  if (!text) return;

  addMessage('user', text);
  userInput.value = '';
  await handleUserMessage(text);
});

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

// Bouton masquer/afficher les outils
if (toggleToolsBtn && toolsPanelEl) {
  toggleToolsBtn.addEventListener('click', () => {
    const isCollapsed = toolsPanelEl.classList.toggle('collapsed');
    toggleToolsBtn.classList.toggle('collapsed', isCollapsed);
    toggleToolsBtn.setAttribute('aria-expanded', String(!isCollapsed));
    if (toggleToolsLabel) {
      toggleToolsLabel.textContent = isCollapsed ? 'Afficher' : 'Masquer';
    }
  });
}

// Démarrage
init();
