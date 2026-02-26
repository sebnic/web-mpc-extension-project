/**
 * options.ts — Logique de la page d'options
 *
 * Gestion :
 *   - Lecture / écriture de la clé API Gemini dans chrome.storage.local
 *   - Liste des domaines autorisés (informative — nécessite rebuild du manifest)
 *   - Sélection du modèle Gemini utilisé par sidepanel.ts
 */

const DEFAULT_DOMAINS: string[] = [
  'http://localhost/*',
  'https://votre-portail-angular.com/*',
];

/**
 * OptionsController gère l'intégralité de la page d'options :
 * lecture/écriture du stockage Chrome, rendu de la liste de domaines
 * et gestion des interactions utilisateur.
 */
class OptionsController {
  // Références DOM
  private readonly apiKeyInput    = document.getElementById('api-key-input')    as HTMLInputElement;
  private readonly toggleKeyBtn   = document.getElementById('toggle-key')       as HTMLButtonElement;
  private readonly domainsList    = document.getElementById('domains-list')     as HTMLUListElement;
  private readonly newDomainInput = document.getElementById('new-domain-input') as HTMLInputElement;
  private readonly addDomainBtn   = document.getElementById('add-domain-btn')   as HTMLButtonElement;
  private readonly modelSelect    = document.getElementById('model-select')     as HTMLSelectElement;
  private readonly saveBtn        = document.getElementById('save-btn')         as HTMLButtonElement;
  private readonly saveStatus     = document.getElementById('save-status')      as HTMLSpanElement;

  constructor() {
    this.bindToggleKey();
    this.bindAddDomain();
    this.bindSave();
    this.load();
  }

  // ── État ──────────────────────────────────────────────────────────────────

  private get currentDomains(): string[] {
    return JSON.parse(this.domainsList.dataset['domains'] ?? '[]');
  }

  // ── Rendu ────────────────────────────────────────────────────────────────

  /** Affiche/cache un message de statut pendant 3 secondes */
  private showStatus(message: string, type: 'success' | 'error' = 'success'): void {
    this.saveStatus.textContent = message;
    this.saveStatus.className = `visible ${type}`;
    setTimeout(() => { this.saveStatus.className = ''; }, 3000);
  }

  /** Re-rend la liste des domaines et persiste l'état dans le dataset */
  private renderDomains(domains: string[]): void {
    this.domainsList.innerHTML = '';
    domains.forEach((domain, index) => {
      const li = document.createElement('li');
      li.className = 'domain-item';
      li.innerHTML = `
        <span>${domain}</span>
        <button data-index="${index}" title="Supprimer">✕</button>
      `;
      (li.querySelector('button') as HTMLButtonElement).addEventListener('click', () => {
        const updated = [...domains];
        updated.splice(index, 1);
        this.renderDomains(updated);
      });
      this.domainsList.appendChild(li);
    });
    this.domainsList.dataset['domains'] = JSON.stringify(domains);
  }

  // ── Chargement / sauvegarde ─────────────────────────────────────────────────

  /** Charge les options depuis chrome.storage.local */
  private load(): void {
    chrome.storage.local.get(
      ['GEMINI_API_KEY', 'ALLOWED_DOMAINS', 'GEMINI_MODEL'],
      (res: { GEMINI_API_KEY?: string; ALLOWED_DOMAINS?: string[]; GEMINI_MODEL?: string }) => {
        if (res.GEMINI_API_KEY) this.apiKeyInput.value = res.GEMINI_API_KEY;
        this.renderDomains(res.ALLOWED_DOMAINS ?? DEFAULT_DOMAINS);
        if (res.GEMINI_MODEL) this.modelSelect.value = res.GEMINI_MODEL;
      },
    );
  }

  /** Sauvegarde les options dans chrome.storage.local */
  private save(): void {
    const apiKey = this.apiKeyInput.value.trim();
    if (!apiKey) {
      this.showStatus('⚠️ Veuillez renseigner une clé API.', 'error');
      return;
    }
    chrome.storage.local.set(
      { GEMINI_API_KEY: apiKey, ALLOWED_DOMAINS: this.currentDomains, GEMINI_MODEL: this.modelSelect.value },
      () => {
        if (chrome.runtime.lastError) {
          this.showStatus('❌ Erreur lors de la sauvegarde.', 'error');
        } else {
          this.showStatus('✅ Options sauvegardées !', 'success');
        }
      },
    );
  }

  // ── Écouteurs d'événements ────────────────────────────────────────────────

  private bindToggleKey(): void {
    this.toggleKeyBtn.addEventListener('click', () => {
      const isPassword = this.apiKeyInput.type === 'password';
      this.apiKeyInput.type = isPassword ? 'text' : 'password';
      this.toggleKeyBtn.title = isPassword ? 'Masquer' : 'Afficher';
    });
  }

  private bindAddDomain(): void {
    this.addDomainBtn.addEventListener('click', () => {
      const val = this.newDomainInput.value.trim();
      if (!val) return;
      const domains = this.currentDomains;
      if (!domains.includes(val)) {
        this.renderDomains([...domains, val]);
      }
      this.newDomainInput.value = '';
    });
    this.newDomainInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.addDomainBtn.click();
    });
  }

  private bindSave(): void {
    this.saveBtn.addEventListener('click', () => this.save());
  }
}

// Point d'entrée
new OptionsController();
