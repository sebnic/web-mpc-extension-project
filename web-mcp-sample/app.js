/**
 * app.js — Logique du portail de démonstration MCP
 *
 * Ce fichier simule ce que ferait un service Angular (WebMcpService) :
 *   1. Crée un objet navigator.modelContext si absent (simulation)
 *   2. Enregistre des outils MCP via navigator.modelContext.registerTool()
 *      → interceptés par inject.js de l'extension
 *   3. Écoute l'événement EXECUTE_MCP_FROM_EXT (déclenché par content.js)
 *      pour exécuter la logique métier réelle
 *   4. Renvoie le résultat via l'événement MCP_EXECUTION_RESULT
 */

'use strict';

// ---------------------------------------------------------------------------
// Données de démonstration (mock database)
// ---------------------------------------------------------------------------
const MOCK_USERS = [
  { id: 'u1', name: 'Alice Dupont',   email: 'alice@demo.fr',   role: 'Admin',       status: 'active',   avatar: '👩‍💼', lastLogin: '2026-02-20T09:14:00Z' },
  { id: 'u2', name: 'Bob Martin',     email: 'bob@demo.fr',     role: 'Développeur', status: 'active',   avatar: '👨‍💻', lastLogin: '2026-02-19T17:42:00Z' },
  { id: 'u3', name: 'Clara Lebrun',   email: 'clara@demo.fr',   role: 'Designer',    status: 'active',   avatar: '👩‍🎨', lastLogin: '2026-02-18T11:30:00Z' },
  { id: 'u4', name: 'David Petit',    email: 'david@demo.fr',   role: 'Manager',     status: 'pending',  avatar: '👨‍💼', lastLogin: '2026-02-15T08:00:00Z' },
  { id: 'u5', name: 'Emma Bernard',   email: 'emma@demo.fr',    role: 'Analyste',    status: 'inactive', avatar: '👩‍🔬', lastLogin: '2026-01-30T14:20:00Z' },
];

const MOCK_DOCUMENTS = [
  { id: 'd1', title: 'Rapport Q4 2025',         category: 'Finance',     author: 'Alice Dupont', date: '2026-01-15', size: '2.4 MB' },
  { id: 'd2', title: 'Spécifications API v3',   category: 'Technique',   author: 'Bob Martin',   date: '2026-02-01', size: '840 KB' },
  { id: 'd3', title: 'Charte graphique 2026',   category: 'Design',      author: 'Clara Lebrun', date: '2026-02-10', size: '5.1 MB' },
  { id: 'd4', title: 'Plan stratégique 2026',   category: 'Direction',   author: 'David Petit',  date: '2026-02-12', size: '1.2 MB' },
  { id: 'd5', title: 'Bilan de formation S1',   category: 'RH',          author: 'Emma Bernard', date: '2026-02-18', size: '380 KB' },
  { id: 'd6', title: 'Architecture microservices', category: 'Technique', author: 'Bob Martin',  date: '2026-02-19', size: '1.8 MB' },
];

const MOCK_NOTIFICATIONS = [
  { id: 'n1', type: 'info',    message: 'Mise à jour système prévue le 25/02', read: false, date: '2026-02-20T08:00:00Z' },
  { id: 'n2', type: 'warning', message: '3 utilisateurs en attente de validation', read: false, date: '2026-02-19T14:30:00Z' },
  { id: 'n3', type: 'success', message: 'Déploiement v3.2.1 effectué avec succès', read: true,  date: '2026-02-18T16:00:00Z' },
  { id: 'n4', type: 'info',    message: 'Nouveau document partagé par Alice Dupont', read: true, date: '2026-02-17T10:15:00Z' },
];

const DASHBOARD_STATS = {
  totalUsers: 142,
  activeUsers: 98,
  documentsCount: 1247,
  openTickets: 14,
  serverLoad: '23%',
  lastBackup: '2026-02-20T03:00:00Z',
  uptime: '99.97%',
  storageUsed: '68%',
};

// ---------------------------------------------------------------------------
// Compteurs d'appels par outil (affiché dans la sidebar)
// ---------------------------------------------------------------------------
const callCounts = {};

// ---------------------------------------------------------------------------
// Utilitaires UI
// ---------------------------------------------------------------------------

/** Formate une date ISO en heure locale lisible */
function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Ajoute une entrée dans le panneau de log d'activité */
function logActivity(type, toolName, bodyObj) {
  const list = document.getElementById('log-list');
  const empty = document.getElementById('log-empty');
  if (empty) empty.remove();

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `
    <div class="log-type log-type-${type}">${
      type === 'call' ? '▶ Appel reçu' :
      type === 'result' ? '✔ Résultat envoyé' :
      type === 'error' ? '✖ Erreur' : 'ℹ Info'
    }</div>
    ${toolName ? `<div class="log-tool">${toolName}</div>` : ''}
    <div class="log-body">${JSON.stringify(bodyObj, null, 2)}</div>
    <div class="log-time">${formatTime(new Date().toISOString())}</div>
  `;

  list.insertBefore(entry, list.firstChild);

  // Limite à 50 entrées
  while (list.children.length > 50) list.removeChild(list.lastChild);
}

/** Met à jour le compteur d'appels d'un outil dans la sidebar */
function incrementCallCount(toolName) {
  callCounts[toolName] = (callCounts[toolName] || 0) + 1;
  const el = document.querySelector(`[data-calls="${toolName}"]`);
  if (el) el.textContent = callCounts[toolName];
}

// ---------------------------------------------------------------------------
// Simulation de navigator.modelContext (si non présent nativement)
// ---------------------------------------------------------------------------
if (!window.navigator.modelContext) {
  Object.defineProperty(window.navigator, 'modelContext', {
    value: { registerTool: () => {} },
    writable: false,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Registre des outils et de leurs fonctions d'exécution
// ---------------------------------------------------------------------------
const toolExecutors = new Map();

/**
 * Enregistre un outil MCP :
 *   - Stocke sa fonction d'exécution localement
 *   - Appelle navigator.modelContext.registerTool() (intercepté par inject.js)
 */
function registerTool(config) {
  toolExecutors.set(config.name, config.execute);
  window.navigator.modelContext.registerTool({
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    // Requis par l'API native ModelContext ; intercepté mais préservé par inject.js
    execute: config.execute,
  });
  logActivity('info', config.name, { status: 'Outil enregistré' });
}

// ---------------------------------------------------------------------------
// Écoute des requêtes d'exécution provenant de l'extension
// ---------------------------------------------------------------------------
window.addEventListener('EXECUTE_MCP_FROM_EXT', async (event) => {
  const { callId, toolName, args } = event.detail;

  logActivity('call', toolName, args);
  incrementCallCount(toolName);

  const executeFn = toolExecutors.get(toolName);
  if (!executeFn) {
    const errResult = { error: `Outil inconnu : "${toolName}"` };
    logActivity('error', toolName, errResult);
    window.dispatchEvent(new CustomEvent('MCP_EXECUTION_RESULT', {
      detail: { callId, result: errResult },
    }));
    return;
  }

  try {
    // Simulation d'un délai réseau réaliste (50–200 ms)
    await new Promise(r => setTimeout(r, 50 + Math.random() * 150));
    const result = await executeFn(args);
    logActivity('result', toolName, result);
    window.dispatchEvent(new CustomEvent('MCP_EXECUTION_RESULT', {
      detail: { callId, result },
    }));
  } catch (err) {
    const errResult = { error: err.message || String(err) };
    logActivity('error', toolName, errResult);
    window.dispatchEvent(new CustomEvent('MCP_EXECUTION_RESULT', {
      detail: { callId, result: errResult },
    }));
  }
});

// ---------------------------------------------------------------------------
// Déclaration des outils MCP
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Attente du signal MCP_INJECT_READY avant d'enregistrer les outils
//
// inject.js de l'extension est chargé de manière asynchrone par le content
// script. Si on appelle registerTool() immédiatement, le patch n'est pas encore
// en place et l'appel part vers l'API native sans émettre MCP_TOOL_DISCOVERED.
// On attend donc l'événement MCP_INJECT_READY, avec un fallback à 3 s au cas
// où l'extension ne serait pas installée (appels directs à l'API native).
// ---------------------------------------------------------------------------
let mcpReady = false;

function registerAllTools() {
  if (mcpReady) return;
  mcpReady = true;
  console.log('[MCP sample] Enregistrement des outils MCP…');

  registerTool({
    name: 'get_user_profile',
    description: 'Retourne le profil complet d\'un utilisateur à partir de son identifiant ou de son nom.',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Identifiant unique de l\'utilisateur (ex: u1)' },
        name:   { type: 'string', description: 'Nom ou partie du nom de l\'utilisateur' },
      },
    },
    execute: async ({ userId, name } = {}) => {
      let user;
      if (userId) {
        user = MOCK_USERS.find(u => u.id === userId);
      } else if (name) {
        user = MOCK_USERS.find(u => u.name.toLowerCase().includes(name.toLowerCase()));
      } else {
        return { users: MOCK_USERS.map(({ avatar: _a, ...u }) => u) };
      }
      if (!user) return { error: 'Utilisateur introuvable.' };
      return { ...user };
    },
  });

  registerTool({
    name: 'list_notifications',
    description: 'Retourne la liste des notifications du portail. Peut filtrer par statut de lecture.',
    inputSchema: {
      type: 'object',
      properties: {
        unread_only: { type: 'boolean', description: 'Si true, retourne uniquement les notifications non lues' },
      },
    },
    execute: async ({ unread_only = false } = {}) => {
      const notifs = unread_only
        ? MOCK_NOTIFICATIONS.filter(n => !n.read)
        : MOCK_NOTIFICATIONS;
      return {
        total: notifs.length,
        unread: MOCK_NOTIFICATIONS.filter(n => !n.read).length,
        notifications: notifs,
      };
    },
  });

  registerTool({
    name: 'search_documents',
    description: 'Recherche des documents dans la base documentaire à partir d\'un terme ou d\'une catégorie.',
    inputSchema: {
      type: 'object',
      properties: {
        query:    { type: 'string', description: 'Terme de recherche dans le titre du document' },
        category: { type: 'string', description: 'Filtre sur la catégorie (Finance, Technique, Design, Direction, RH)' },
        limit:    { type: 'number', description: 'Nombre maximum de résultats (défaut : 10)' },
      },
    },
    execute: async ({ query = '', category = '', limit = 10 } = {}) => {
      let results = MOCK_DOCUMENTS;
      if (query) {
        results = results.filter(d => d.title.toLowerCase().includes(query.toLowerCase()));
      }
      if (category) {
        results = results.filter(d => d.category.toLowerCase() === category.toLowerCase());
      }
      results = results.slice(0, limit);
      return { total: results.length, documents: results };
    },
  });

  registerTool({
    name: 'get_dashboard_stats',
    description: 'Retourne les statistiques globales du tableau de bord du portail (utilisateurs actifs, documents, tickets, charge serveur, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        metrics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Liste des métriques souhaitées. Si vide, toutes les métriques sont retournées.',
        },
      },
    },
    execute: async ({ metrics = [] } = {}) => {
      if (!metrics || metrics.length === 0) return { ...DASHBOARD_STATS };
      const result = {};
      metrics.forEach(m => { if (DASHBOARD_STATS[m] !== undefined) result[m] = DASHBOARD_STATS[m]; });
      return result;
    },
  });

  registerTool({
    name: 'update_user_status',
    description: 'Met à jour le statut d\'un utilisateur (active, pending, inactive).',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Identifiant de l\'utilisateur' },
        status: { type: 'string', enum: ['active', 'pending', 'inactive'], description: 'Nouveau statut' },
      },
      required: ['userId', 'status'],
    },
    execute: async ({ userId, status } = {}) => {
      const user = MOCK_USERS.find(u => u.id === userId);
      if (!user) return { error: `Utilisateur "${userId}" introuvable.` };
      const oldStatus = user.status;
      user.status = status;
      renderUsersTable();
      return { success: true, userId, oldStatus, newStatus: status };
    },
  });
}

// Écoute du signal inject.js prêt
window.addEventListener('MCP_INJECT_READY', () => {
  console.log('[MCP sample] MCP_INJECT_READY reçu — enregistrement des outils.');
  registerAllTools();
});

// Fallback : si l'extension n'est pas là, on enregistre quand même après 3 s
setTimeout(() => {
  if (!mcpReady) {
    console.warn('[MCP sample] MCP_INJECT_READY jamais reçu — fallback sans extension.');
    registerAllTools();
  }
}, 3000);

// ---------------------------------------------------------------------------
// Rendu des composants UI
// ---------------------------------------------------------------------------

function renderUsersTable() {
  const tbody = document.querySelector('#users-table tbody');
  if (!tbody) return;
  tbody.innerHTML = MOCK_USERS.map(u => `
    <tr>
      <td>
        <span class="avatar" style="background: hsl(${u.id.charCodeAt(1) * 40}, 60%, 30%)">${u.avatar}</span>
        ${u.name}
      </td>
      <td>${u.email}</td>
      <td>${u.role}</td>
      <td><span class="status-pill status-${u.status}">${u.status}</span></td>
      <td style="color: var(--text-muted); font-size: 12px;">${formatTime(u.lastLogin)}</td>
    </tr>
  `).join('');
}

function renderSidebarTools() {
  const list = document.getElementById('sidebar-tools');
  if (!list) return;
  list.innerHTML = [...toolExecutors.keys()].map(name => `
    <li class="tool-badge-item">
      <div class="tool-status"></div>
      <span class="tool-name">${name}</span>
      <span class="tool-calls" data-calls="${name}">0</span>
    </li>
  `).join('');
}

// ---------------------------------------------------------------------------
// Initialisation de l'UI au chargement
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  renderUsersTable();
  renderSidebarTools();

  document.getElementById('clear-log-btn')?.addEventListener('click', () => {
    const list = document.getElementById('log-list');
    list.innerHTML = `
      <div id="log-empty" class="log-empty">
        Aucune activité MCP pour l'instant.<br>
        Ouvrez le panneau de l'extension et posez une question.
      </div>
    `;
  });

  // Mise à jour dynamique des stats (simulation live)
  setInterval(() => {
    const el = document.getElementById('stat-active-users');
    if (el) el.textContent = 95 + Math.floor(Math.random() * 10);
  }, 5000);
});
