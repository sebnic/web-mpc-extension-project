/**
 * sidepanel.ts — Source du Side Panel (bundlé avec esbuild)
 *
 * Ce fichier utilise le SDK @google/genai et sera compilé en sidepanel.js
 * (dans dist/) via : npm run build
 */

import { GoogleGenAI } from '@google/genai';
import type { McpTool, ExtensionMessage, ExtensionSettings } from './types';

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

  constructor() {
    this.bindSendForm();
    this.bindTogglePanel();
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

        response = await this.chatSession.sendMessage({
          message: [{ functionResponse: { name: toolName, response: portalResult as Record<string, unknown> } }],
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
    });

    chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
      if (message.type === 'CONTEXT_UPDATED' && message.tabId === this.activeTabId) {
        this.currentTools = message.tools;
        this.renderTools(this.currentTools);
        this.sendBtn.disabled = false;
        this.setStatus(`✅ ${this.currentTools.length} outil(s) disponible(s)`, 'ready');
        this.chatSession = null;
      }
    });
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
}

// Point d'entrée
new SidePanelController();

