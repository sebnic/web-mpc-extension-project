/**
 * sidepanel.ts — Source du Side Panel (bundlé avec esbuild)
 *
 * Ce fichier utilise le SDK @google/genai et sera compilé en sidepanel.js
 * (dans dist/) via : npm run build
 */

import { GoogleGenAI } from '@google/genai';
import type { McpTool, McpResource, McpPrompt, ExtensionMessage, ExtensionSettings, SamplingRequest, SamplingResponse } from './types';

type StatusType = 'idle' | 'ready' | 'working' | 'error';
type MessageRole = 'user' | 'assistant' | 'error';

/**
 * SidePanelController gère l'intégralité du panneau latéral :
 * - Affichage des outils découverts
 * - Session de chat avec Gemini via Function Calling
 * - Exécution des outils sur le portail
 */
class SidePanelController {
  // ── État ───────────────────────────────────────────────────────────────
  private genaiClient: GoogleGenAI | null = null;
  private chatSession: ReturnType<GoogleGenAI['chats']['create']> | null = null;
  private currentTools: McpTool[] = [];
  private currentResources: McpResource[] = [];
  private currentPrompts: McpPrompt[] = [];
  private activeTabId: number | null = null;

  // ── Références DOM ────────────────────────────────────────────────────────
  private readonly chatContainer   = document.getElementById('chat-container')    as HTMLDivElement;
  private readonly userInput        = document.getElementById('user-input')        as HTMLTextAreaElement;
  private readonly sendBtn          = document.getElementById('send-btn')          as HTMLButtonElement;
  private readonly toolsList        = document.getElementById('tools-list')        as HTMLUListElement;
  private readonly statusBar        = document.getElementById('status-bar')        as HTMLDivElement;
  private readonly noToolsMsg       = document.getElementById('no-tools-msg')      as HTMLParagraphElement;
  private readonly toolsCountBadge  = document.getElementById('tools-count-badge') as HTMLSpanElement | null;
  private readonly toggleToolsBtn   = document.getElementById('toggle-tools-btn')  as HTMLButtonElement | null;
  private readonly toolsPanelEl     = document.getElementById('tools-panel')       as HTMLElement | null;
  private readonly toggleToolsLabel = document.getElementById('toggle-tools-label')as HTMLSpanElement | null;
  private readonly modelBadge       = document.getElementById('model-badge')       as HTMLSpanElement | null;
  // Resources panel
  private readonly resourcesList        = document.getElementById('resources-list')        as HTMLUListElement | null;
  private readonly resourcesCountBadge  = document.getElementById('resources-count-badge') as HTMLSpanElement | null;
  private readonly toggleResourcesBtn   = document.getElementById('toggle-resources-btn')  as HTMLButtonElement | null;
  private readonly resourcesPanelEl     = document.getElementById('resources-panel')       as HTMLElement | null;
  private readonly noResourcesMsg       = document.getElementById('no-resources-msg')      as HTMLParagraphElement | null;
  // Prompts panel
  private readonly promptsList        = document.getElementById('prompts-list')        as HTMLUListElement | null;
  private readonly promptsCountBadge  = document.getElementById('prompts-count-badge') as HTMLSpanElement | null;
  private readonly togglePromptsBtn   = document.getElementById('toggle-prompts-btn')  as HTMLButtonElement | null;
  private readonly promptsPanelEl     = document.getElementById('prompts-panel')       as HTMLElement | null;
  private readonly noPromptsMsg       = document.getElementById('no-prompts-msg')      as HTMLParagraphElement | null;

  constructor() {
    this.bindSendForm();
    this.bindTogglePanel();
    this.bindToggleResourcesPanel();
    this.bindTogglePromptsPanel();
    this.bindStorageChanges();
    this.init().catch(console.error);
  }

  // ── UI helpers ──────────────────────────────────────────────────────────

  private addMessage(role: MessageRole, text: string): void {
    const wrapper = document.createElement('div');
    wrapper.className = `message ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    wrapper.appendChild(bubble);
    this.chatContainer.appendChild(wrapper);
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  private setLoading(loading: boolean): void {
    this.sendBtn.disabled = loading || this.currentTools.length === 0;
    if (loading) {
      const indicator = document.createElement('div');
      indicator.id = 'loading-indicator';
      indicator.className = 'message assistant';
      indicator.innerHTML = '<div class="bubble typing"><span></span><span></span><span></span></div>';
      this.chatContainer.appendChild(indicator);
      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    } else {
      document.getElementById('loading-indicator')?.remove();
    }
  }

  private renderTools(tools: McpTool[]): void {
    this.toolsList.innerHTML = '';
    const count = tools?.length ?? 0;
    if (this.toolsCountBadge) {
      this.toolsCountBadge.textContent = String(count);
      this.toolsCountBadge.classList.toggle('visible', count > 0);
    }
    if (!tools || tools.length === 0) {
      this.noToolsMsg.style.display = 'block';
      return;
    }
    this.noToolsMsg.style.display = 'none';
    tools.forEach((tool) => {
      const item = document.createElement('li');
      item.className = 'tool-item';
      item.innerHTML = `
        <span class="tool-name">${tool.name}</span>
        <span class="tool-desc">${tool.description || 'Pas de description.'}</span>
      `;
      this.toolsList.appendChild(item);
    });
  }

  private renderResources(resources: McpResource[]): void {
    if (!this.resourcesList) return;
    this.resourcesList.innerHTML = '';
    const count = resources?.length ?? 0;
    if (this.resourcesCountBadge) {
      this.resourcesCountBadge.textContent = String(count);
      this.resourcesCountBadge.classList.toggle('visible', count > 0);
    }
    if (!resources || resources.length === 0) {
      if (this.noResourcesMsg) this.noResourcesMsg.style.display = 'block';
      return;
    }
    if (this.noResourcesMsg) this.noResourcesMsg.style.display = 'none';
    resources.forEach((resource) => {
      const item = document.createElement('li');
      item.className = 'tool-item';
      item.innerHTML = `
        <span class="tool-name">${resource.name}</span>
        <span class="tool-desc">${resource.description || 'Pas de description.'}${resource.mimeType ? ` <em>(${resource.mimeType})</em>` : ''}</span>
      `;
      this.resourcesList!.appendChild(item);
    });
  }

  private renderPrompts(prompts: McpPrompt[]): void {
    if (!this.promptsList) return;
    this.promptsList.innerHTML = '';
    const count = prompts?.length ?? 0;
    if (this.promptsCountBadge) {
      this.promptsCountBadge.textContent = String(count);
      this.promptsCountBadge.classList.toggle('visible', count > 0);
    }
    if (!prompts || prompts.length === 0) {
      if (this.noPromptsMsg) this.noPromptsMsg.style.display = 'block';
      return;
    }
    if (this.noPromptsMsg) this.noPromptsMsg.style.display = 'none';
    prompts.forEach((prompt) => {
      const args = prompt.arguments?.map((a) => a.name).join(', ') ?? '';
      const item = document.createElement('li');
      item.className = 'tool-item';
      item.innerHTML = `
        <span class="tool-name">${prompt.name}</span>
        <span class="tool-desc">${prompt.description || 'Pas de description.'}${args ? ` <em>[${args}]</em>` : ''}</span>
      `;
      this.promptsList!.appendChild(item);
    });
  }

  private setStatus(msg: string, type: StatusType = 'idle'): void {
    this.statusBar.textContent = msg;
    this.statusBar.className = `status-bar ${type}`;
  }

  // ── Paramètres ──────────────────────────────────────────────────────────

  private getSettings(): Promise<ExtensionSettings> {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ['GEMINI_API_KEY', 'GEMINI_MODEL'],
        (res: { GEMINI_API_KEY?: string; GEMINI_MODEL?: string }) => {
          resolve({
            apiKey: res.GEMINI_API_KEY ?? null,
            model: res.GEMINI_MODEL ?? 'gemini-2.0-flash',
          });
        },
      );
    });
  }

  /** Réinitialise le client et la session si la config change */
  private bindStorageChanges(): void {
    chrome.storage.onChanged.addListener(
      (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area !== 'local') return;
        if (changes['GEMINI_API_KEY'] || changes['GEMINI_MODEL']) {
          this.genaiClient = null;
          this.chatSession = null;
          this.setStatus(`⚠️ Config modifiée (${Object.keys(changes).join(', ')}) — session réinitialisée.`, 'idle');
          if (changes['GEMINI_MODEL'] && this.modelBadge) {
            this.modelBadge.textContent = (changes['GEMINI_MODEL'].newValue as string) ?? 'gemini-2.0-flash';
          }
        }
      },
    );
  }

  // ── Exécution d'outil ──────────────────────────────────────────────────────

  private executeToolOnPortal(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.activeTabId) {
        reject('Aucun onglet actif trouvé.');
        return;
      }
      chrome.runtime.sendMessage(
        {
          type: 'EXECUTE_TOOL_REQUEST',
          tabId: this.activeTabId,
          toolName,
          args,
          callId: crypto.randomUUID(),
        } as ExtensionMessage,
        (response: { status: 'success' | 'error'; result: unknown }) => {
          if (chrome.runtime.lastError) { reject(chrome.runtime.lastError.message); return; }
          if (response?.status === 'success') {
            resolve(response.result);
          } else {
            reject((response?.result as { error?: string } | undefined)?.error ?? 'Erreur inconnue.');
          }
        },
      );
    });
  }

  // ── Chat Gemini ───────────────────────────────────────────────────────────

  private async handleUserMessage(userText: string): Promise<void> {
    const { apiKey, model } = await this.getSettings();
    if (!apiKey) {
      this.addMessage('error', "⚠️ Clé API Gemini manquante. Ouvrez les options de l'extension.");
      return;
    }

    if (!this.genaiClient) {
      this.genaiClient = new GoogleGenAI({ apiKey });
    }

    const formattedTools =
      this.currentTools.length > 0
        ? [{ functionDeclarations: this.currentTools.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema })) }]
        : [];

    if (!this.chatSession) {
      this.chatSession = this.genaiClient.chats.create({
        model,
        config: {
          tools: formattedTools,
          systemInstruction:
            'Tu es un assistant IA intégré dans un portail Angular. ' +
            "Tu peux utiliser les outils mis à ta disposition pour répondre aux demandes de l'utilisateur. " +
            "Réponds toujours en français sauf si l'utilisateur s'exprime dans une autre langue.",
        },
      });
    }

    this.setLoading(true);
    try {
      let response = await this.chatSession.sendMessage({ message: userText });

      // Boucle de Function Calling
      while (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        const toolName = call.name ?? '';
        const toolArgs = (call.args ?? {}) as Record<string, unknown>;
        this.setStatus(`⚙️ Exécution de l'outil : ${toolName}…`, 'working');

        let portalResult: unknown;
        try {
          portalResult = await this.executeToolOnPortal(toolName, toolArgs);
        } catch (e) {
          portalResult = { error: String(e) };
        }

        // Gemini function_response.response must be a JSON object, not an array.
        // Wrap arrays (e.g. search_lo_docs results) in { result: [...] }.
        const responsePayload: Record<string, unknown> =
          Array.isArray(portalResult)
            ? { result: portalResult }
            : (portalResult as Record<string, unknown>);

        response = await this.chatSession.sendMessage({
          message: [{ functionResponse: { name: toolName, response: responsePayload } }],
        });
      }

      if (response.text) this.addMessage('assistant', response.text);
      this.setStatus('✅ Prêt', 'ready');
    } catch (err) {
      const error = err as Error;
      console.error('[MCP SidePanelController] Erreur Gemini :', error);
      this.addMessage('error', `❌ Erreur : ${error.message ?? String(err)}`);
      this.setStatus('Erreur', 'error');
      this.chatSession = null;
    } finally {
      this.setLoading(false);
    }
  }

  // ── Initialisation ───────────────────────────────────────────────────────────

  private async init(): Promise<void> {
    const { model } = await this.getSettings();
    if (this.modelBadge) this.modelBadge.textContent = model;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id === undefined) return;
      this.activeTabId = tabs[0].id;

      // Load tools
      chrome.runtime.sendMessage(
        { type: 'GET_TOOLS_FOR_TAB', tabId: this.activeTabId } as ExtensionMessage,
        (res: { tools?: McpTool[] }) => {
          if (!res?.tools) return;
          this.currentTools = res.tools;
          this.renderTools(this.currentTools);
          if (this.currentTools.length > 0) {
            this.sendBtn.disabled = false;
            this.setStatus(`✅ ${this.currentTools.length} outil(s) disponible(s)`, 'ready');
          } else {
            this.setStatus("En attente de la détection d'outils sur la page…", 'idle');
          }
        },
      );

      // Load resources
      chrome.runtime.sendMessage(
        { type: 'GET_RESOURCES_FOR_TAB', tabId: this.activeTabId! } as ExtensionMessage,
        (res: { resources?: McpResource[] }) => {
          if (res?.resources) {
            this.currentResources = res.resources;
            this.renderResources(this.currentResources);
          }
        },
      );

      // Load prompts
      chrome.runtime.sendMessage(
        { type: 'GET_PROMPTS_FOR_TAB', tabId: this.activeTabId! } as ExtensionMessage,
        (res: { prompts?: McpPrompt[] }) => {
          if (res?.prompts) {
            this.currentPrompts = res.prompts;
            this.renderPrompts(this.currentPrompts);
          }
        },
      );
    });

    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse): boolean | void => {
      if (message.type === 'CONTEXT_UPDATED' && message.tabId === this.activeTabId) {
        this.currentTools = message.tools;
        this.renderTools(this.currentTools);
        this.sendBtn.disabled = false;
        this.setStatus(`✅ ${this.currentTools.length} outil(s) disponible(s)`, 'ready');
        this.chatSession = null;
      }
      if (message.type === 'RESOURCE_CONTEXT_UPDATED' && message.tabId === this.activeTabId) {
        this.currentResources = message.resources;
        this.renderResources(this.currentResources);
      }
      if (message.type === 'PROMPT_CONTEXT_UPDATED' && message.tabId === this.activeTabId) {
        this.currentPrompts = message.prompts;
        this.renderPrompts(this.currentPrompts);
      }
      if (message.type === 'SAMPLING_REQUEST') {
        this.handleSamplingRequest(message.requestId, message.params)
          .then((result) => sendResponse({ result }))
          .catch((err) => sendResponse({ error: (err as Error).message ?? String(err) }));
        return true; // async response
      }
    });
  }

  // ── Sampling (Primitive 4) ────────────────────────────────────────────────

  /**
   * Traite une demande requestSampling via Gemini et retourne le résultat.
   */
  private async handleSamplingRequest(requestId: string, params: SamplingRequest): Promise<SamplingResponse> {
    this.setStatus('🧠 Sampling en cours…', 'working');
    try {
      const { apiKey, model } = await this.getSettings();
      if (!apiKey) throw new Error("Clé API Gemini manquante.");

      if (!this.genaiClient) this.genaiClient = new GoogleGenAI({ apiKey });

      const userMessages = params.messages.map((m) => {
        const text = typeof m.content === 'string' ? m.content : m.content.text;
        return { role: m.role === 'user' ? 'user' : 'model', parts: [{ text }] };
      });

      const lastUser = userMessages.filter((m) => m.role === 'user').pop();
      const messageText = lastUser?.parts[0]?.text ?? '';

      const session = this.genaiClient.chats.create({
        model,
        config: {
          systemInstruction: params.systemPrompt,
          maxOutputTokens: params.maxTokens,
        },
        history: userMessages.slice(0, -1) as Parameters<GoogleGenAI['chats']['create']>[0]['history'],
      });

      const response = await session.sendMessage({ message: messageText });
      const reply: SamplingResponse = {
        role: 'assistant',
        content: { type: 'text', text: response.text ?? '' },
        model,
        stopReason: 'endTurn',
      };

      this.setStatus(`✅ Sampling complété (${requestId.slice(0, 8)}…)`, 'ready');
      return reply;
    } catch (err) {
      const errMsg = (err as Error).message ?? String(err);
      this.setStatus(`❌ Erreur sampling : ${errMsg}`, 'error');
      throw new Error(errMsg);
    }
  }

  // ── Écouteurs formulaire ───────────────────────────────────────────────────

  private bindSendForm(): void {
    this.sendBtn.addEventListener('click', async () => {
      const text = this.userInput.value.trim();
      if (!text) return;
      this.addMessage('user', text);
      this.userInput.value = '';
      await this.handleUserMessage(text);
    });
    this.userInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendBtn.click(); }
    });
  }

  private bindTogglePanel(): void {
    if (!this.toggleToolsBtn || !this.toolsPanelEl) return;
    this.toggleToolsBtn.addEventListener('click', () => {
      const isCollapsed = this.toolsPanelEl!.classList.toggle('collapsed');
      this.toggleToolsBtn!.classList.toggle('collapsed', isCollapsed);
      this.toggleToolsBtn!.setAttribute('aria-expanded', String(!isCollapsed));
      if (this.toggleToolsLabel) {
        this.toggleToolsLabel.textContent = isCollapsed ? 'Afficher' : 'Masquer';
      }
    });
  }

  private bindToggleResourcesPanel(): void {
    if (!this.toggleResourcesBtn || !this.resourcesPanelEl) return;
    this.toggleResourcesBtn.addEventListener('click', () => {
      const isCollapsed = this.resourcesPanelEl!.classList.toggle('collapsed');
      this.toggleResourcesBtn!.classList.toggle('collapsed', isCollapsed);
      this.toggleResourcesBtn!.setAttribute('aria-expanded', String(!isCollapsed));
      const labelEl = this.toggleResourcesBtn!.querySelector('.toggle-label');
      if (labelEl) labelEl.textContent = isCollapsed ? 'Afficher' : 'Masquer';
    });
  }

  private bindTogglePromptsPanel(): void {
    if (!this.togglePromptsBtn || !this.promptsPanelEl) return;
    this.togglePromptsBtn.addEventListener('click', () => {
      const isCollapsed = this.promptsPanelEl!.classList.toggle('collapsed');
      this.togglePromptsBtn!.classList.toggle('collapsed', isCollapsed);
      this.togglePromptsBtn!.setAttribute('aria-expanded', String(!isCollapsed));
      const labelEl = this.togglePromptsBtn!.querySelector('.toggle-label');
      if (labelEl) labelEl.textContent = isCollapsed ? 'Afficher' : 'Masquer';
    });
  }
}

// Point d'entrée
new SidePanelController();

