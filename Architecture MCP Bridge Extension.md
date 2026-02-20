Voici l'intégralité du document technique, réunissant toutes les pièces du puzzle (y compris la toute dernière étape côté Angular). Il est structuré et formaté en Markdown, parfait pour être fourni comme contexte complet à GitHub Copilot ou à votre équipe.

Vous pouvez copier l'intégralité du bloc ci-dessous et le sauvegarder dans un fichier nommé, par exemple, ARCHITECTURE\_MCP\_BRIDGE.md.

---

Markdown

\# Architecture et Spécifications : Extension "MCP Portal Bridge"  
**\*\*Date :\*\*** Février 2026  
**\*\*Objectif :\*\*** Créer une extension Chrome simulant le support natif Web MCP (Model Context Protocol) pour un portail Angular, permettant de contourner les restrictions géographiques de déploiement de Gemini dans le navigateur.

\---

\#\# 1\. Vue d'ensemble de l'Architecture

L'extension agit comme un pont bidirectionnel entre le portail Angular (qui déclare ses outils via \`navigator.modelContext\`) et l'API Gemini 3.x.

1\. **\*\*Angular\*\*** déclare un outil (ex: \`get\_user\_info\`).  
2\. L'**\*\*Inject Script\*\*** de l'extension intercepte cette déclaration et prévient le **\*\*Content Script\*\***.  
3\. Le **\*\*Content Script\*\*** relaie l'information au **\*\*Background Worker\*\*** qui gère l'état de l'onglet.  
4\. Le **\*\*Side Panel\*\*** (Panneau latéral de l'extension) affiche l'outil, instancie le client Gemini, et gère le chat.  
5\. Quand Gemini veut exécuter l'outil, le flux redescend jusqu'à Angular via des \`CustomEvents\`.

\---

\#\# 2\. Configuration de l'Extension

\#\#\# Fichier : \`manifest.json\`  
\`\`\`json  
{  
  "manifest\_version": 3,  
  "name": "MCP Portal Assistant",  
  "version": "1.0.0",  
  "description": "Assistant IA pour portail Angular (Simulateur Web MCP)",  
  "permissions": \["sidePanel", "activeTab", "scripting", "storage"\],  
  "host\_permissions": \["http://localhost/\*", "\[https://votre-portail-angular.com/\](https://votre-portail-angular.com/)\*"\],  
  "background": {  
    "service\_worker": "background.js"  
  },  
  "side\_panel": {  
    "default\_path": "sidepanel.html"  
  },  
  "action": {  
    "default\_title": "Ouvrir l'assistant MCP"  
  },  
  "options\_page": "options.html",  
  "content\_scripts": \[  
    {  
      "matches": \["http://localhost/\*", "\[https://votre-portail-angular.com/\](https://votre-portail-angular.com/)\*"\],  
      "js": \["content.js"\],  
      "run\_at": "document\_start"  
    }  
  \],  
  "web\_accessible\_resources": \[  
    {  
      "resources": \["inject.js"\],  
      "matches": \["\<all\_urls\>"\]  
    }  
  \]  
}

## ---

**3\. Interception sur la Page Web**

### **Fichier : inject.js (Le Monkey Patcher)**

Injecté directement dans le contexte de la page pour lire l'objet navigator.

JavaScript

(function() {  
  const originalRegister \= navigator.modelContext?.registerTool;

  if (navigator.modelContext) {  
    navigator.modelContext.registerTool \= function(config) {  
      // Émission d'un événement capturable par l'extension  
      window.dispatchEvent(new CustomEvent('MCP\_TOOL\_DISCOVERED', {   
        detail: {   
          name: config.name,   
          description: config.description,  
          inputSchema: config.inputSchema  
        }   
      }));

      // Exécution de la fonction native (optionnel si non supporté nativement)  
      if (originalRegister) {  
        return originalRegister.apply(navigator.modelContext, \[config\]);  
      }  
    };  
  }  
})();

### **Fichier : content.js (Le Pont / The Bridge)**

Il fait le lien entre la page sécurisée et l'extension.

JavaScript

// 1\. Injection du script d'interception  
const script \= document.createElement('script');  
script.src \= chrome.runtime.getURL('inject.js');  
(document.head || document.documentElement).appendChild(script);

// 2\. Écoute des outils découverts \-\> Envoi vers l'extension  
window.addEventListener('MCP\_TOOL\_DISCOVERED', (event) \=\> {  
  chrome.runtime.sendMessage({   
    type: 'NEW\_TOOL\_AVAILABLE',   
    tool: event.detail   
  });  
});

// 3\. Écoute des ordres de l'IA \-\> Envoi vers Angular  
chrome.runtime.onMessage.addListener((request, sender, sendResponse) \=\> {  
  if (request.type \=== 'EXECUTE\_ON\_PAGE') {  
      
    // On crée un écouteur unique pour la réponse d'Angular  
    const responseHandler \= (e) \=\> {  
      if (e.detail.callId \=== request.callId) {  
        window.removeEventListener('MCP\_EXECUTION\_RESULT', responseHandler);  
        sendResponse({ status: 'success', result: e.detail.result });  
      }  
    };  
    window.addEventListener('MCP\_EXECUTION\_RESULT', responseHandler);

    // On demande à Angular d'exécuter l'action  
    window.dispatchEvent(new CustomEvent('EXECUTE\_MCP\_FROM\_EXT', {  
      detail: { callId: request.callId, toolName: request.toolName, args: request.args }  
    }));

    return true; // Maintient le canal ouvert pour sendResponse  
  }  
});

## ---

**4\. Gestion d'État (Background)**

### **Fichier : background.js**

Maintient la liste des outils par onglet et route les messages.

JavaScript

const portalContexts \= new Map();

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) \=\> {  
  // A. Réception d'un nouvel outil  
  if (message.type \=== 'NEW\_TOOL\_AVAILABLE' && sender.tab) {  
    const tabId \= sender.tab.id;  
    const currentTools \= portalContexts.get(tabId) || \[\];  
      
    if (\!currentTools.find(t \=\> t.name \=== message.tool.name)) {  
      currentTools.push(message.tool);  
      portalContexts.set(tabId, currentTools);  
    }

    chrome.action.setBadgeText({ tabId, text: "AI" });  
    chrome.runtime.sendMessage({ type: 'CONTEXT\_UPDATED', tabId, tools: currentTools }).catch(() \=\> {});  
  }

  // B. Demande d'exécution venant du Side Panel  
  if (message.type \=== 'EXECUTE\_TOOL\_REQUEST') {  
    chrome.tabs.sendMessage(message.tabId, {  
      type: 'EXECUTE\_ON\_PAGE',  
      toolName: message.toolName,  
      args: message.args,  
      callId: message.callId  
    }, sendResponse);  
    return true;  
  }  
});

// Nettoyage mémoire  
chrome.tabs.onRemoved.addListener((tabId) \=\> portalContexts.delete(tabId));

## ---

**5\. Interface Chat et IA (Side Panel)**

### **Fichier : sidepanel.js (Extraits clés)**

Gère l'intégration du SDK @google/genai et la boucle de Function Calling.

JavaScript

import { GoogleGenAI } from "@google/genai";

let genaiClient \= null;  
let chatSession \= null;  
let currentPortalTools \= \[\];

// Écoute des mises à jour d'outils  
chrome.runtime.onMessage.addListener((message) \=\> {  
  if (message.type \=== 'CONTEXT\_UPDATED') {  
    currentPortalTools \= message.tools;  
    document.getElementById('send-btn').disabled \= false;  
  }  
});

// Rapatriement de la clé API  
async function getApiKey() {  
  return new Promise(resolve \=\> chrome.storage.local.get(\['GEMINI\_API\_KEY'\], res \=\> resolve(res.GEMINI\_API\_KEY)));  
}

// Fonction d'exécution vers le portail  
async function executeToolOnPortal(toolName, args) {  
  return new Promise((resolve, reject) \=\> {  
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) \=\> {  
      if (\!tabs\[0\]) return reject("Aucun onglet actif.");  
      chrome.runtime.sendMessage({  
        type: 'EXECUTE\_TOOL\_REQUEST',  
        tabId: tabs\[0\].id,  
        toolName, args, callId: crypto.randomUUID()  
      }, response \=\> {  
        response?.status \=== 'success' ? resolve(response.result) : reject("Erreur portail");  
      });  
    });  
  });  
}

// Boucle principale de Chat  
async function handleUserMessage(userText) {  
  if (\!genaiClient) {  
    const apiKey \= await getApiKey();  
    genaiClient \= new GoogleGenAI({ apiKey });  
  }

  const formattedTools \= \[{  
    functionDeclarations: currentPortalTools.map(t \=\> ({  
      name: t.name, description: t.description, parameters: t.inputSchema  
    }))  
  }\];

  if (\!chatSession) {  
    const model \= genaiClient.models.get("gemini-3-flash-preview");  
    chatSession \= model.startChat({ tools: formattedTools });  
  } else {  
    chatSession.tools \= formattedTools;  
  }

  let response \= await chatSession.sendMessage(userText);

  // Traitement des requêtes d'outils (Function Calling)  
  while (response.functionCalls?.length \> 0) {  
    const call \= response.functionCalls\[0\];  
    let portalResult;  
    try {  
      portalResult \= await executeToolOnPortal(call.name, call.args);  
    } catch (e) {  
      portalResult \= { error: e.toString() };  
    }

    // Renvoi du résultat à l'IA  
    response \= await chatSession.sendMessage(\[{  
      functionResponse: { name: call.name, response: portalResult }  
    }\]);  
  }

  // Affichage de la réponse finale  
  if (response.text) console.log("Réponse AI :", response.text);  
}

## ---

**6\. Implémentation côté Angular (Le Portail)**

C'est ici que l'application cliente écoute les demandes de l'extension et exécute son code métier.

### **Fichier : web-mcp.service.ts**

TypeScript

import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })  
export class WebMcpService {  
  // Stockage local des fonctions exécutables  
  private toolExecutors \= new Map\<string, (args: any) \=\> Promise\<any\>\>();

  constructor() {  
    this.listenToExtensionRequests();  
  }

  // 1\. Déclaration de l'outil  
  registerTool(config: any) {  
    // On sauvegarde la logique d'exécution  
    this.toolExecutors.set(config.name, config.execute);

    // On déclare au navigateur (intercepté par l'extension)  
    if (window.navigator && (window.navigator as any).modelContext) {  
      (window.navigator as any).modelContext.registerTool({  
        name: config.name,  
        description: config.description,  
        inputSchema: config.inputSchema  
      });  
    }  
  }

  // 2\. Écoute des requêtes d'exécution  
  private listenToExtensionRequests() {  
    window.addEventListener('EXECUTE\_MCP\_FROM\_EXT', async (event: any) \=\> {  
      const { callId, toolName, args } \= event.detail;  
      const executeFn \= this.toolExecutors.get(toolName);

      if (executeFn) {  
        try {  
          // Exécution de la logique métier Angular  
          const result \= await executeFn(args);  
            
          // Renvoi du résultat vers l'extension  
          window.dispatchEvent(new CustomEvent('MCP\_EXECUTION\_RESULT', {  
            detail: { callId, result }  
          }));  
        } catch (error) {  
          window.dispatchEvent(new CustomEvent('MCP\_EXECUTION\_RESULT', {  
            detail: { callId, result: { error: "Erreur d'exécution dans Angular" } }  
          }));  
        }  
      }  
    });  
  }  
}

\*\*\*

C'est une architecture extrêmement solide et élégante : votre application Angular reste agnostique (elle ne sait même pas qu'une extension fait le pont), et le jour où l'intégration native de Google se déploie en France, vous n'aurez absolument rien à modifier dans votre code source \!

\*\*Voulez-vous que je vous aide à structurer le premier composant Angular de test (par exemple, un faux service utilisateur) pour valider ce flux de bout en bout ?\*\*  
