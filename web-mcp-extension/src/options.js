/**
 * options.js — Logique de la page d'options
 *
 * Gestion :
 *   - Lecture / écriture de la clé API Gemini dans chrome.storage.local
 *   - Liste des domaines autorisés (informative — nécessite rebuild du manifest)
 *   - Sélection du modèle Gemini utilisé par sidepanel.js
 */

'use strict';

// ---------------------------------------------------------------------------
// Références DOM
// ---------------------------------------------------------------------------
const apiKeyInput = document.getElementById('api-key-input');
const toggleKeyBtn = document.getElementById('toggle-key');
const domainsList = document.getElementById('domains-list');
const newDomainInput = document.getElementById('new-domain-input');
const addDomainBtn = document.getElementById('add-domain-btn');
const modelSelect = document.getElementById('model-select');
const saveBtn = document.getElementById('save-btn');
const saveStatus = document.getElementById('save-status');

// ---------------------------------------------------------------------------
// Domaines par défaut synchronisés avec le manifest
// ---------------------------------------------------------------------------
const DEFAULT_DOMAINS = [
  'http://localhost/*',
  'https://votre-portail-angular.com/*',
];

// ---------------------------------------------------------------------------
// Affichage du statut de sauvegarde
// ---------------------------------------------------------------------------
function showStatus(message, type = 'success') {
  saveStatus.textContent = message;
  saveStatus.className = `visible ${type}`;
  setTimeout(() => {
    saveStatus.className = '';
  }, 3000);
}

// ---------------------------------------------------------------------------
// Rendu de la liste des domaines
// ---------------------------------------------------------------------------
function renderDomains(domains) {
  domainsList.innerHTML = '';
  domains.forEach((domain, index) => {
    const li = document.createElement('li');
    li.className = 'domain-item';
    li.innerHTML = `
      <span>${domain}</span>
      <button data-index="${index}" title="Supprimer">✕</button>
    `;
    li.querySelector('button').addEventListener('click', () => {
      domains.splice(index, 1);
      renderDomains(domains);
    });
    domainsList.appendChild(li);
  });
  // Stocke temporairement en dataset pour lecture lors de la sauvegarde
  domainsList.dataset.domains = JSON.stringify(domains);
}

// ---------------------------------------------------------------------------
// Ajout d'un domaine
// ---------------------------------------------------------------------------
addDomainBtn.addEventListener('click', () => {
  const val = newDomainInput.value.trim();
  if (!val) return;

  const domains = JSON.parse(domainsList.dataset.domains || '[]');
  if (!domains.includes(val)) {
    domains.push(val);
    renderDomains(domains);
  }
  newDomainInput.value = '';
});

newDomainInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addDomainBtn.click();
});

// ---------------------------------------------------------------------------
// Afficher / masquer la clé API
// ---------------------------------------------------------------------------
toggleKeyBtn.addEventListener('click', () => {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    toggleKeyBtn.title = 'Masquer';
  } else {
    apiKeyInput.type = 'password';
    toggleKeyBtn.title = 'Afficher';
  }
});

// ---------------------------------------------------------------------------
// Chargement des options sauvegardées
// ---------------------------------------------------------------------------
function loadOptions() {
  chrome.storage.local.get(
    ['GEMINI_API_KEY', 'ALLOWED_DOMAINS', 'GEMINI_MODEL'],
    (res) => {
      if (res.GEMINI_API_KEY) {
        apiKeyInput.value = res.GEMINI_API_KEY;
      }

      const domains = res.ALLOWED_DOMAINS || DEFAULT_DOMAINS;
      renderDomains(domains);

      if (res.GEMINI_MODEL) {
        modelSelect.value = res.GEMINI_MODEL;
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Sauvegarde des options
// ---------------------------------------------------------------------------
saveBtn.addEventListener('click', () => {
  const apiKey = apiKeyInput.value.trim();
  const domains = JSON.parse(domainsList.dataset.domains || '[]');
  const model = modelSelect.value;

  if (!apiKey) {
    showStatus('⚠️ Veuillez renseigner une clé API.', 'error');
    return;
  }

  chrome.storage.local.set(
    {
      GEMINI_API_KEY: apiKey,
      ALLOWED_DOMAINS: domains,
      GEMINI_MODEL: model,
    },
    () => {
      if (chrome.runtime.lastError) {
        showStatus('❌ Erreur lors de la sauvegarde.', 'error');
      } else {
        showStatus('✅ Options sauvegardées !', 'success');
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
loadOptions();
