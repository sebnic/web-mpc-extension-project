/**
 * web-lo-sample / app.js
 * Live Objects Diagnostic Assistant — MCP portal
 */

import { MOCK_DEVICES, MOCK_AUDIT_LOGS, MOCK_MESSAGES } from './mock-data.js';
import { LO_DOC_CHUNKS } from './lo-doc-data.js';

// ── State ──────────────────────────────────────────────────────────────────
let selectedDeviceId = null;
const toolCallCount = {};

// ── Utility ────────────────────────────────────────────────────────────────
function fmt(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
}
function short(str, max = 48) {
  return str && str.length > max ? str.slice(0, max) + '…' : str;
}

// ── Activity log ────────────────────────────────────────────────────────────
const $log = document.getElementById('log-list');

function addLog(type, name, detail) {
  const el = document.createElement('div');
  el.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString('fr-FR');
  el.innerHTML = `
    <div class="log-type ${type}">${type}</div>
    <div class="log-name">${name}</div>
    ${detail ? `<div class="log-detail">${short(detail, 120)}</div>` : ''}
    <div class="log-time">${time}</div>
  `;
  const empty = $log.querySelector('.activity-empty');
  if (empty) empty.remove();
  $log.prepend(el);
  // keep last 50
  while ($log.children.length > 50) $log.removeChild($log.lastChild);
}

document.getElementById('clear-log-btn').addEventListener('click', () => {
  $log.innerHTML = '<div class="activity-empty">Aucune activité MCP.</div>';
});

// ── Search engine ──────────────────────────────────────────────────────────
function searchLoDocs({ query, categories, limit = 6 }) {
  if (!query || !query.trim()) return LO_DOC_CHUNKS.slice(0, limit);

  const words = query.toLowerCase().split(/[\s,;]+/).filter(w => w.length > 2);
  return LO_DOC_CHUNKS
    .filter(chunk => {
      if (categories && categories.length > 0) {
        return chunk.categories && chunk.categories.some(c => categories.includes(c));
      }
      return true;
    })
    .map(chunk => {
      const hay = `${chunk.title} ${chunk.content}`.toLowerCase();
      const score = words.reduce((s, w) => s + (hay.includes(w) ? (chunk.title?.toLowerCase().includes(w) ? 3 : 1) : 0), 0);
      return { score, chunk };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk }) => ({
      title: chunk.title,
      content: chunk.content,
      categories: chunk.categories,
      pageStart: chunk.pageStart,
    }));
}

// ── MCP tool handlers ──────────────────────────────────────────────────────
const MCP_TOOLS = {

  get_device_info: ({ deviceId }) => {
    const device = MOCK_DEVICES.find(d => d.id === deviceId);
    if (!device) return { error: `Device not found: ${deviceId}` };
    return device;
  },

  get_audit_logs: ({ deviceId, since, limit = 20 }) => {
    const logs = MOCK_AUDIT_LOGS[deviceId] ?? [];
    let filtered = logs;
    if (since) {
      const sinceDate = new Date(since);
      filtered = logs.filter(l => new Date(l.timestamp) >= sinceDate);
    }
    return filtered.slice(0, limit);
  },

  get_device_messages: ({ deviceId, limit = 10 }) => {
    const msgs = MOCK_MESSAGES[deviceId] ?? [];
    return msgs.slice(0, limit);
  },

  search_lo_docs: ({ query, categories, limit = 6 }) => {
    return searchLoDocs({ query, categories, limit });
  },
};

// ── MCP resource: selected_device ──────────────────────────────────────────
function readSelectedDeviceResource() {
  const device = MOCK_DEVICES.find(d => d.id === selectedDeviceId) ?? null;
  return JSON.stringify(device);
}

// ── Sidebar tools indicator ────────────────────────────────────────────────
function refreshSidebarTools() {
  const $tools = document.getElementById('sidebar-tools');
  $tools.innerHTML = '';
  const toolNames = Object.keys(MCP_TOOLS);
  toolNames.forEach(name => {
    const calls = toolCallCount[name] ?? 0;
    const li = document.createElement('li');
    li.className = 'tool-badge-item';
    li.innerHTML = `
      <span class="tool-status"></span>
      <span class="tool-name">${name}</span>
      ${calls > 0 ? `<span class="tool-calls">${calls}x</span>` : ''}
    `;
    $tools.appendChild(li);
  });
  // Resource
  const resLi = document.createElement('li');
  resLi.className = 'tool-badge-item';
  resLi.innerHTML = `
    <span class="tool-status" style="background:var(--info)"></span>
    <span class="tool-name">📄 selected_device</span>
  `;
  $tools.appendChild(resLi);
}

// ── modelContext fallback ──────────────────────────────────────────────────
// Provides a no-op stub so the page works without the extension
if (!navigator.modelContext) {
  const _tools = {};
  const _resources = {};
  const _prompts = {};

  navigator.modelContext = {
    registerTool(definition, handler) {
      _tools[definition.name] = { definition, handler };
      console.log('[modelContext-stub] registerTool', definition.name);
    },
    registerResource(definition) {
      _resources[definition.name] = definition;
      console.log('[modelContext-stub] registerResource', definition.name);
    },
    registerPrompt(definition) {
      _prompts[definition.name] = definition;
      console.log('[modelContext-stub] registerPrompt', definition.name);
    },
    async requestSampling(options) {
      console.log('[modelContext-stub] requestSampling', options);
      return { content: '[Stub: extension non connectée]' };
    },
  };
}

// ── MCP registration ───────────────────────────────────────────────────────
function registerAllMCP() {
  addLog('info', 'MCP', 'Enregistrement des outils Live Objects…');

  // Tools
  navigator.modelContext.registerTool(
    {
      name: 'get_device_info',
      description: 'Returns full metadata for a Live Objects device: connectivity type, status, last-seen, firmware version, tags.',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Live Objects device URN, e.g. urn:lo:nsid:mqtt:sensor-temp-paris-01' },
        },
        required: ['deviceId'],
      },
    },
    async ({ deviceId }) => {
      toolCallCount['get_device_info'] = (toolCallCount['get_device_info'] ?? 0) + 1;
      addLog('call', 'get_device_info', deviceId);
      const result = MCP_TOOLS.get_device_info({ deviceId });
      addLog('result', 'get_device_info', JSON.stringify(result).slice(0, 200));
      refreshSidebarTools();
      return { content: JSON.stringify(result, null, 2) };
    }
  );

  navigator.modelContext.registerTool(
    {
      name: 'get_audit_logs',
      description: 'Returns audit log entries for a device. Each entry has: timestamp, level (INFO/WARNING/ERROR), errorCode, message, metadata. Use this to diagnose connectivity failures: look for MQTT_AUTH_FAILED, TLS_CERTIFICATE_EXPIRED, etc.',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device URN' },
          since:    { type: 'string', description: 'ISO 8601 date to filter events after (optional)' },
          limit:    { type: 'number', description: 'Max number of entries to return (default 20)' },
        },
        required: ['deviceId'],
      },
    },
    async ({ deviceId, since, limit }) => {
      toolCallCount['get_audit_logs'] = (toolCallCount['get_audit_logs'] ?? 0) + 1;
      addLog('call', 'get_audit_logs', `deviceId=${deviceId}${since ? ` since=${since}` : ''}`);
      const result = MCP_TOOLS.get_audit_logs({ deviceId, since, limit });
      addLog('result', 'get_audit_logs', `${result.length} entrée(s)`);
      refreshSidebarTools();
      return { content: JSON.stringify(result, null, 2) };
    }
  );

  navigator.modelContext.registerTool(
    {
      name: 'get_device_messages',
      description: 'Returns the last data messages sent by a device (sensor payloads, GPS coordinates, etc.).',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', description: 'Device URN' },
          limit:    { type: 'number', description: 'Max messages to return (default 10)' },
        },
        required: ['deviceId'],
      },
    },
    async ({ deviceId, limit }) => {
      toolCallCount['get_device_messages'] = (toolCallCount['get_device_messages'] ?? 0) + 1;
      addLog('call', 'get_device_messages', `deviceId=${deviceId}`);
      const result = MCP_TOOLS.get_device_messages({ deviceId, limit });
      addLog('result', 'get_device_messages', `${result.length} message(s)`);
      refreshSidebarTools();
      return { content: JSON.stringify(result, null, 2) };
    }
  );

  navigator.modelContext.registerTool(
    {
      name: 'search_lo_docs',
      description: 'Full-text search over the Live Objects developer documentation. Returns the most relevant documentation excerpts for a query. Use this to look up: error codes, API endpoints, protocol details, configuration procedures, troubleshooting guides.',
      inputSchema: {
        type: 'object',
        properties: {
          query:      { type: 'string', description: 'Natural language search query, e.g. "MQTT_AUTH_FAILED" or "certificate expiry renewal"' },
          categories: {
            type: 'array',
            items: { type: 'string', enum: ['connection', 'device', 'audit', 'data', 'command', 'alarm', 'api'] },
            description: 'Optional: filter by documentation category',
          },
          limit: { type: 'number', description: 'Max chunks to return (default 6)' },
        },
        required: ['query'],
      },
    },
    async ({ query, categories, limit }) => {
      toolCallCount['search_lo_docs'] = (toolCallCount['search_lo_docs'] ?? 0) + 1;
      addLog('call', 'search_lo_docs', `"${query}"${categories ? ` [${categories.join(',')}]` : ''}`);
      const result = searchLoDocs({ query, categories, limit });
      addLog('result', 'search_lo_docs', `${result.length} chunk(s) trouvé(s)`);
      refreshSidebarTools();
      return { content: JSON.stringify(result, null, 2) };
    }
  );

  // Resource
  navigator.modelContext.registerResource({
    name: 'selected_device',
    description: 'The device currently selected in the portal UI. Contains full device metadata. Before calling other tools, read this resource to know which device the user is looking at.',
    mimeType: 'application/json',
    read: async () => ({ content: readSelectedDeviceResource() }),
  });

  // Prompt
  navigator.modelContext.registerPrompt({
    name: 'diagnose_connectivity',
    description: 'Diagnostic guidé pour un device Live Objects qui ne se connecte pas. Fournit l\'ID du device et l\'assistant va analyser les audit logs, vérifier l\'état, consulter la documentation et formuler un diagnostic avec les étapes de résolution.',
    arguments: [
      {
        name: 'deviceId',
        description: 'URN du device Live Objects à diagnostiquer',
        required: true,
      },
    ],
    get: async ({ deviceId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Je rencontre un problème de connectivité avec le device Live Objects : **${deviceId}**

Peux-tu :
1. Appeler \`get_device_info\` pour voir l'état actuel du device
2. Appeler \`get_audit_logs\` pour analyser les erreurs récentes
3. Si tu trouves un error code, appeler \`search_lo_docs\` pour trouver la procédure de résolution dans la documentation

Formule un diagnostic clair et des étapes concrètes pour résoudre le problème.`,
          },
        },
      ],
    }),
  });

  addLog('info', 'MCP', `✅ 4 outils + 1 ressource + 1 prompt enregistrés`);
  document.getElementById('mcp-status-badge').textContent = '✅ MCP prêt';
  document.getElementById('mcp-status-badge').style.color = 'var(--success)';
  document.getElementById('mcp-status-badge').style.background = 'rgba(34,197,94,0.10)';
  document.getElementById('mcp-status-badge').style.borderColor = 'rgba(34,197,94,0.25)';
  refreshSidebarTools();
}

// ── Extension event listeners ───────────────────────────────────────────────
window.addEventListener('MCP_INJECT_READY', () => {
  addLog('info', 'Extension', 'MCP_INJECT_READY reçu');
  registerAllMCP();
});

window.addEventListener('EXECUTE_MCP_FROM_EXT', async (event) => {
  const { toolName, args, requestId } = event.detail ?? {};
  if (!toolName) return;

  const handler = MCP_TOOLS[toolName];
  if (!handler) {
    window.dispatchEvent(new CustomEvent('MCP_RESULT', {
      detail: { requestId, error: `Unknown tool: ${toolName}` },
    }));
    return;
  }

  try {
    const result = await handler(args ?? {});
    window.dispatchEvent(new CustomEvent('MCP_RESULT', {
      detail: { requestId, result: JSON.stringify(result, null, 2) },
    }));
  } catch (err) {
    window.dispatchEvent(new CustomEvent('MCP_RESULT', {
      detail: { requestId, error: err.message },
    }));
  }
});

window.addEventListener('READ_RESOURCE_ON_PAGE', (event) => {
  const { resourceName, requestId } = event.detail ?? {};
  if (resourceName === 'selected_device') {
    window.dispatchEvent(new CustomEvent('RESOURCE_READ_RESULT', {
      detail: { requestId, content: readSelectedDeviceResource() },
    }));
  }
});

// ── UI rendering ────────────────────────────────────────────────────────────
function renderDeviceList() {
  const $list = document.getElementById('device-list');
  document.getElementById('device-count').textContent = MOCK_DEVICES.length;
  $list.innerHTML = '';

  MOCK_DEVICES.forEach(device => {
    const status = device.status?.connectivity?.value ?? 'UNKNOWN';
    const type = device.type ?? 'MQTT';
    const shortId = device.id.split(':').pop(); // last segment

    const li = document.createElement('li');
    li.className = `device-item${device.id === selectedDeviceId ? ' active' : ''}`;
    li.setAttribute('data-id', device.id);
    li.innerHTML = `
      <div class="device-item-name">${device.name}</div>
      <div class="device-item-id">${device.id}</div>
      <div class="device-item-row">
        <span class="status-dot ${status}"></span>
        <span class="status-label ${status}">${status}</span>
        <span class="device-type-badge">${type}</span>
      </div>
    `;
    li.addEventListener('click', () => selectDevice(device.id));
    $list.appendChild(li);
  });
}

function selectDevice(deviceId) {
  selectedDeviceId = deviceId;
  renderDeviceList();
  renderMain();
}

function renderMain() {
  const $main = document.getElementById('main-panel');
  if (!selectedDeviceId) {
    $main.innerHTML = `<div class="empty-state"><div class="icon">🔌</div><p>Sélectionnez un device.</p></div>`;
    return;
  }

  const device = MOCK_DEVICES.find(d => d.id === selectedDeviceId);
  if (!device) return;

  const status = device.status?.connectivity?.value ?? 'UNKNOWN';
  const auditLogs = MOCK_AUDIT_LOGS[selectedDeviceId] ?? [];
  const messages = MOCK_MESSAGES[selectedDeviceId] ?? [];

  // Device info card
  const capabilities = device.defaultDataStreamId
    ? `<span style="font-size:10px;color:var(--text-muted)">stream: ${device.defaultDataStreamId}</span>` : '';

  const infoCard = `
    <div class="card">
      <div class="card-header">
        Device Info
        <span style="font-size:10px;font-family:monospace;color:var(--orange)">${device.id}</span>
      </div>
      <div class="card-body">
        <div class="detail-grid">
          <div class="detail-field">
            <div class="detail-label">Nom</div>
            <div class="detail-value">${device.name}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Statut</div>
            <div class="detail-value ${status.toLowerCase()}">${status}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Type</div>
            <div class="detail-value">${device.type ?? 'MQTT'}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Firmware</div>
            <div class="detail-value">${device.firmware?.version ?? '—'}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Groupe</div>
            <div class="detail-value">${device.group?.label ?? '—'}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Dernière connexion</div>
            <div class="detail-value">${device.lastConnectionDate ? fmt(device.lastConnectionDate) : '—'}</div>
          </div>
          <div class="detail-field" style="grid-column:1/-1">
            <div class="detail-label">Tags</div>
            <div class="detail-value">${device.tags?.join(', ') ?? '—'}</div>
          </div>
        </div>
      </div>
    </div>`;

  // Audit log card
  const auditHtml = auditLogs.length === 0
    ? `<div class="no-logs">✅ Aucun événement d'audit récent.</div>`
    : auditLogs.map(log => `
        <div class="audit-item">
          <div class="audit-level ${log.level}"></div>
          <div class="audit-content">
            <div class="audit-message">${log.message}</div>
            ${log.errorCode ? `<div class="audit-code">${log.errorCode}</div>` : ''}
            ${log.metadata ? `<div class="audit-code" style="color:var(--text-muted)">${JSON.stringify(log.metadata)}</div>` : ''}
          </div>
          <div class="audit-time">${fmt(log.timestamp)}</div>
        </div>
      `).join('');

  const auditCard = `
    <div class="card">
      <div class="card-header">
        Audit Logs
        <span style="font-size:10px">${auditLogs.length} entrée(s)</span>
      </div>
      <div class="card-body">
        <div class="audit-list">${auditHtml}</div>
      </div>
    </div>`;

  // Messages card
  const msgHtml = messages.length === 0
    ? `<div class="no-logs">Aucun message de données.</div>`
    : messages.map(msg => `
        <div class="msg-item">
          <div class="msg-topic">${msg.streamId}</div>
          <div class="msg-payload">${JSON.stringify(msg.value, null, 2)}</div>
          <div class="msg-time">${fmt(msg.timestamp)}</div>
        </div>
      `).join('');

  const msgCard = `
    <div class="card">
      <div class="card-header">
        Derniers Messages
        <span style="font-size:10px">${messages.length} message(s)</span>
      </div>
      <div class="card-body">
        <div class="msg-list">${msgHtml}</div>
      </div>
    </div>`;

  $main.innerHTML = infoCard + auditCard + msgCard;
}

// ── Init ───────────────────────────────────────────────────────────────────
renderDeviceList();
registerAllMCP();

// Toggle outils MCP
const $toolsHeader = document.getElementById('sidebar-tools-header');
const $toolsList   = document.getElementById('sidebar-tools');
const $chevron     = document.getElementById('sidebar-tools-chevron');
$toolsHeader?.addEventListener('click', () => {
  const hidden = $toolsList?.classList.toggle('collapsed');
  $chevron?.classList.toggle('collapsed', hidden);
});

// Toggle activité MCP — contenu (clic sur l'en-tête interne)
const $activityHeader  = document.getElementById('activity-header');
const $activityList    = document.getElementById('log-list');
const $activityChevron = document.getElementById('activity-chevron');
$activityHeader?.addEventListener('click', (e) => {
  if (e.target?.closest('#clear-log-btn')) return;
  const hidden = $activityList?.classList.toggle('collapsed');
  $activityChevron?.classList.toggle('collapsed', hidden);
});

// Toggle activité MCP — panneau entier (bouton header principal)
const $toggleActivityBtn = document.getElementById('toggle-activity-btn');
const $app = document.querySelector('.app');
$toggleActivityBtn?.addEventListener('click', () => {
  const hidden = $app?.classList.toggle('activity-hidden');
  if ($toggleActivityBtn) {
    $toggleActivityBtn.textContent = hidden ? '☰ Activité ▪▪' : '☰ Activité';
    $toggleActivityBtn.title = hidden ? 'Afficher le panneau Activité MCP' : 'Masquer le panneau Activité MCP';
  }
});

