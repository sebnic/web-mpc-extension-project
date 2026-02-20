# MCP Portal Bridge — Workspace

Ce workspace contient deux projets complémentaires formant un pont entre un portail web et l'API Gemini via le protocole **Web MCP (Model Context Protocol)**.

---

## Projets

| Projet | Description | Docs |
|--------|-------------|------|
| [`web-mcp-extension/`](web-mcp-extension/) | Extension Chrome MV3 — intercepte `navigator.modelContext`, expose un assistant Gemini dans un Side Panel | [README →](web-mcp-extension/README.md) |
| [`web-mcp-sample/`](web-mcp-sample/) | Site de démonstration — portail vanilla JS exposant 5 outils MCP pour tester l'extension | [README →](web-mcp-sample/README.md) |

---

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│  web-mcp-sample (localhost:3000)                                │
│  Portail web exposant des outils via navigator.modelContext     │
└──────────────────────┬──────────────────────────────────────────┘
                       │ registerTool() → MCP_INJECT_READY
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  web-mcp-extension (dist/ chargé dans Chrome)                  │
│                                                                 │
│  inject.js  →  content.js  →  background.js  →  sidepanel.js  │
│  (patch MC)    (bridge)        (état/routage)    (UI + Gemini)  │
└─────────────────────────────────────────────────────────────────┘
```

**Flux complet :**
1. Le portail appelle `navigator.modelContext.registerTool(config)`
2. `inject.js` intercepte l'appel et émet `MCP_TOOL_DISCOVERED`
3. L'outil remonte jusqu'au Side Panel via `content.js` → `background.js`
4. Gemini reçoit les outils disponibles et les utilise lors du chat
5. Les résultats d'exécution redescendent vers le portail via `EXECUTE_MCP_FROM_EXT`

---

## Démarrage rapide

### 1. Lancer le site de démonstration

```bash
cd web-mcp-sample
npm install
npm start          # Démarre sur http://localhost:3000
```

### 2. Construire l'extension

```bash
cd web-mcp-extension
npm install
npm run build      # Génère dist/
```

### 3. Charger l'extension dans Chrome

1. Ouvrez `chrome://extensions`
2. Activez le **Mode développeur**
3. **Charger l'extension non empaquetée** → sélectionnez `web-mcp-extension/dist/`

### 4. Configurer

1. Cliquez sur ⚙️ **Options** dans l'extension
2. Renseignez votre **clé API Gemini** ([Google AI Studio](https://aistudio.google.com/app/apikey))
3. Choisissez le modèle Gemini souhaité

### 5. Tester

1. Naviguez vers `http://localhost:3000`
2. Ouvrez le **Side Panel** de l'extension
3. Les 5 outils du portail de démo apparaissent automatiquement
4. Posez une question — Gemini utilisera les outils disponibles

---

## Architecture MCP Bridge Extension.md

Le document de spécification complet de l'architecture est disponible à la racine : [Architecture MCP Bridge Extension.md](Architecture%20MCP%20Bridge%20Extension.md)
