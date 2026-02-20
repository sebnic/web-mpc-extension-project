# MCP Portal Assistant — Extension Chrome

Extension Chrome qui simule le support natif **Web MCP (Model Context Protocol)** pour un portail Angular, en servant de pont bidirectionnel entre le portail et l'API Gemini.

---

## Architecture

```
Page Angular  ←→  inject.js  ←→  content.js  ←→  background.js  ←→  sidepanel.js
                  (contexte       (contexte        (service          (UI + Gemini)
                   de la page)     isolé)           worker)
```

**Flux principal :**
1. Angular appelle `navigator.modelContext.registerTool(config)`
2. `inject.js` intercepte l'appel et émet l'événement `MCP_TOOL_DISCOVERED`
3. `content.js` relaie l'outil vers `background.js` via `chrome.runtime`
4. Le **Side Panel** affiche l'outil et l'utilise pour enrichir Gemini
5. Quand Gemini appelle un outil, le résultat remonte via `EXECUTE_MCP_FROM_EXT` → Angular → `MCP_EXECUTION_RESULT`

---

## Installation

### Prérequis

- Node.js ≥ 18
- Chrome ≥ 114 (support Side Panel)

### Build

```bash
cd web-mcp-extension
npm install
npm run build       # Production (minifié)
# ou
npm run build:dev   # Développement (avec source maps)
# ou
npm run watch       # Rebuild automatique en développement
```

### Chargement dans Chrome

1. Ouvrez `chrome://extensions`
2. Activez le **Mode développeur** (coin supérieur droit)
3. Cliquez sur **Charger l'extension non empaquetée**
4. Sélectionnez le répertoire **`dist/`** (et non la racine du projet)

---

## Configuration

1. Cliquez sur l'icône de l'extension puis sur ⚙️ **Options**
2. Renseignez votre **clé API Gemini** (obtenue sur [Google AI Studio](https://aistudio.google.com/app/apikey))
3. Ajustez les domaines autorisés si nécessaire
4. Sauvegardez

> **Note :** La clé API est stockée dans `chrome.storage.local` et ne quitte jamais votre navigateur.

---

## Utilisation

1. Naviguez vers votre portail Angular (ex : `http://localhost:4200`)
2. Cliquez sur l'icône de l'extension pour ouvrir le **Side Panel**
3. Dès qu'Angular appelle `registerTool()`, les outils apparaissent dans le panneau
4. Posez vos questions — Gemini utilisera automatiquement les outils disponibles

---

## Implémentation côté Angular

Utilisez le service fourni pour déclarer vos outils :

```typescript
// web-mcp.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WebMcpService {
  private toolExecutors = new Map<string, (args: any) => Promise<any>>();

  constructor() {
    this.listenToExtensionRequests();
  }

  registerTool(config: {
    name: string;
    description: string;
    inputSchema: object;
    execute: (args: any) => Promise<any>;
  }) {
    this.toolExecutors.set(config.name, config.execute);

    if ((window.navigator as any).modelContext) {
      (window.navigator as any).modelContext.registerTool({
        name: config.name,
        description: config.description,
        inputSchema: config.inputSchema,
      });
    }
  }

  private listenToExtensionRequests() {
    window.addEventListener('EXECUTE_MCP_FROM_EXT', async (event: any) => {
      const { callId, toolName, args } = event.detail;
      const executeFn = this.toolExecutors.get(toolName);

      if (executeFn) {
        try {
          const result = await executeFn(args);
          window.dispatchEvent(new CustomEvent('MCP_EXECUTION_RESULT', {
            detail: { callId, result },
          }));
        } catch (error) {
          window.dispatchEvent(new CustomEvent('MCP_EXECUTION_RESULT', {
            detail: { callId, result: { error: "Erreur d'exécution dans Angular" } },
          }));
        }
      }
    });
  }
}
```

**Exemple d'utilisation dans un composant :**

```typescript
constructor(private mcpService: WebMcpService) {
  this.mcpService.registerTool({
    name: 'get_user_info',
    description: 'Retourne les informations de l\'utilisateur connecté',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'ID de l\'utilisateur' },
      },
      required: ['userId'],
    },
    execute: async (args) => {
      return this.userService.getUser(args.userId);
    },
  });
}
```

---

## Structure du projet

```
web-mcp-extension/
├── src/                 # ← Tout le code source (éditer ici)
│   ├── background.js    # Service Worker — gestion d'état & routage
│   ├── content.js       # Content Script — pont page ↔ extension
│   ├── inject.js        # Script injecté — monkey-patch navigator.modelContext
│   ├── sidepanel.js     # Source du Side Panel (importe @google/genai)
│   ├── sidepanel.html   # UI du Side Panel
│   ├── options.js       # Logique de la page d'options
│   └── options.html     # Page d'options
├── dist/                # ← Output de build (charger CE dossier dans Chrome)
│   ├── manifest.json    # Copié depuis la racine
│   ├── background.js    # Copié depuis src/
│   ├── content.js       # Copié depuis src/
│   ├── inject.js        # Copié depuis src/
│   ├── sidepanel.js     # Bundle généré (256 kb, inclut @google/genai)
│   ├── sidepanel.html   # Copié depuis src/
│   ├── options.js       # Copié depuis src/
│   └── options.html     # Copié depuis src/
├── manifest.json        # Source de vérité du manifest (copié dans dist/)
├── build.mjs            # Script de build (copie + bundle esbuild)
└── package.json         # Dépendances & scripts npm
```

---

## Développement

```bash
npm run build:dev   # Build avec source maps (inline) pour le débogage
npm run watch       # Rebuild automatique à chaque modification de src/
```

> **Rappel :** après chaque `build`, rechargez l'extension dans `chrome://extensions` (bouton 🔄) pour que Chrome prenne en compte les nouveaux fichiers de `dist/`.

Pour déboguer :
- **Content Script / inject.js** : DevTools de la page → Console
- **Background Worker** : `chrome://extensions` → bouton "Service Worker"
- **Side Panel** : Clic droit dans le panneau → Inspecter

---

## Remarques importantes

- Les `host_permissions` dans `manifest.json` doivent lister tous les domaines où l'extension doit s'activer
- Après chaque modification de `manifest.json`, rechargez l'extension dans `chrome://extensions`
- Cette architecture est conçue pour être compatible avec une future implémentation native Web MCP : le code Angular ne devra pas être modifié le jour où le support natif arrivera
