# web-mcp-sample — Site de démonstration MCP

Portail web vanilla JS servant de site de test pour l'extension **MCP Portal Bridge**. Il expose 5 outils MCP via `navigator.modelContext.registerTool()` et simule un environnement de portail d'entreprise.

> Fait partie du workspace [`web-mcp-extension-project`](../README.md)

---

## Outils exposés

| Outil | Description |
|-------|-------------|
| `get_user_profile` | Retourne le profil de l'utilisateur connecté |
| `list_notifications` | Liste les notifications avec filtre par statut (`all`, `unread`, `read`) |
| `search_documents` | Recherche dans la base documentaire par mot-clé et type |
| `get_dashboard_stats` | Retourne les KPIs du tableau de bord (avec plage temporelle optionnelle) |
| `update_user_status` | Met à jour le statut de l'utilisateur (`available`, `busy`, `away`, `offline`) |

---

## Démarrage

```bash
npm install
npm start             # http://localhost:3000
npm run start:5500    # http://localhost:5500 (port alternatif)
```

---

## Compatibilité avec l'extension

Le site attend l'événement `MCP_INJECT_READY` dispatché par `inject.js` avant d'appeler `registerAllTools()`. Cela garantit que tous les outils sont bien interceptés, même si l'injection du script est asynchrone.

```js
// Pattern utilisé dans app.js
window.addEventListener('MCP_INJECT_READY', () => registerAllTools());

// Fallback si l'extension n'est pas installée
setTimeout(() => {
  if (!toolsRegistered) registerAllTools();
}, 3000);
```

Les résultats d'exécution remontent via le CustomEvent `MCP_EXECUTION_RESULT` :

```js
window.addEventListener('EXECUTE_MCP_FROM_EXT', async (event) => {
  const { callId, toolName, args } = event.detail;
  // ... exécution ...
  window.dispatchEvent(new CustomEvent('MCP_EXECUTION_RESULT', {
    detail: { callId, result }
  }));
});
```

---

## Structure

```
web-mcp-sample/
├── index.html    # UI du portail (tableau de bord fictif)
├── app.js        # Logique MCP — déclaration et exécution des outils
├── style.css     # Styles du portail
└── package.json  # Script de démarrage (npx serve)
```
