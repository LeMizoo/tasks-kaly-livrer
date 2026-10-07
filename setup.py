import os
import json
import subprocess
import sys

# 1. Structure du projet et contenus des fichiers
package_json = {
    "name": "tasks-kaly-livrer",
    "version": "1.0.0",
    "description": "Tableau de bord des taches GEO Kaly Livrer",
    "main": "server.js",
    "scripts": {
        "start": "node server.js"
    },
    "dependencies": {
        "cors": "^2.8.5",
        "express": "^4.18.2"
    }
}

server_js = """const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const ALLOWED_USERS = ["Eric", "Miora", "Tovo", "Nanci", "Safidy", "Lioka"];

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TASKS_FILE)) fs.writeFileSync(TASKS_FILE, JSON.stringify({}));
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/tasks', (req, res) => {
    fs.readFile(TASKS_FILE, 'utf8', (err, data) => {
        res.json(err ? {} : JSON.parse(data || '{}'));
    });
});

app.post('/api/tasks', (req, res) => {
    fs.writeFile(TASKS_FILE, JSON.stringify(req.body, null, 2), (err) => {
        if (err) return res.status(500).json({ error: "Erreur d'écriture" });
        res.json({ status: "ok" });
    });
});

app.get('/api/users', (req, res) => {
    fs.readFile(USERS_FILE, 'utf8', (err, data) => {
        res.json(err ? {} : JSON.parse(data || '{}'));
    });
});

app.post('/api/auth/setup', (req, res) => {
    const { user, pin } = req.body;
    if (ALLOWED_USERS.includes(user) && pin && pin.length === 4 && /^\\d+$/.test(pin)) {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}');
        users[user] = pin;
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        return res.json({ status: "ok" });
    }
    res.status(400).json({ error: "Données invalides" });
});

app.post('/api/auth/verify', (req, res) => {
    const { user, pin } = req.body;
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}');
    if (users[user] === pin) {
        return res.json({ status: "ok" });
    }
    res.status(400).json({ error: "Code PIN incorrect" });
});

app.listen(PORT, () => {
    console.log(`🚀 Serveur Intranet démarré sur le port ${PORT}`);
});
"""

gitignore = """node_modules/
.env
data/*.json
!data/.gitkeep
"""

index_html = """<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Feuille de Route & Dispatching — Kaly Livrer</title>
    <style>
        :root {
            --bg: #f8fafc;
            --card-bg: #ffffff;
            --primary: #0f172a;
            --accent: #d97706;
            --border: #e2e8f0;
            --text: #334155;
            --muted: #64748b;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 1rem 1.5rem 2rem;
        }

        .container { max-width: 1150px; margin: 0 auto; }

        .sticky-top-container {
            position: sticky;
            top: 0;
            z-index: 100;
            background-color: var(--bg);
            padding-top: 0.5rem;
            padding-bottom: 0.5rem;
        }

        .modal-backdrop {
            position: fixed; inset: 0;
            background: rgba(15, 23, 42, 0.85);
            backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            z-index: 1000;
        }

        .modal {
            background: #fff; padding: 2rem; border-radius: 16px;
            max-width: 400px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
        }

        .modal-title { font-size: 1.25rem; font-weight: 800; color: var(--primary); margin: 0.5rem 0; text-align: center; }
        .modal-subtitle { font-size: 0.8rem; color: var(--muted); text-align: center; margin-bottom: 1.5rem; }

        label { display: block; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-bottom: 0.5rem; color: var(--primary); }
        select, input {
            width: 100%; padding: 0.75rem; border: 1px solid var(--border);
            border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; margin-bottom: 1rem;
        }

        button.btn-primary {
            width: 100%; background: var(--accent); color: white;
            font-weight: 700; border: none; padding: 0.85rem; border-radius: 8px;
            cursor: pointer; font-size: 0.9rem;
        }
        button.btn-primary:hover { background: #b45309; }

        .error-msg { color: #dc2626; font-size: 0.8rem; font-weight: 700; text-align: center; margin-top: 0.5rem; }
        .instructions { background: #fef3c7; color: #92400e; padding: 0.75rem; border-radius: 8px; font-size: 0.8rem; margin-bottom: 1rem; }

        header {
            background: var(--card-bg); padding: 1.25rem 1.5rem; border-radius: 12px;
            border-left: 6px solid var(--accent); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .welcome-banner {
            background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;
            padding: 0.65rem 1rem; border-radius: 8px; font-size: 0.85rem; font-weight: 700;
            margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between;
        }

        .progress-bg { background: #e2e8f0; height: 10px; border-radius: 5px; overflow: hidden; margin-top: 0.5rem; }
        .progress-fill { background: var(--accent); height: 100%; width: 0%; transition: width 0.3s; }

        .card { background: var(--card-bg); border-radius: 12px; border: 1px solid var(--border); margin-bottom: 1.5rem; overflow: hidden; }
        .card-header { padding: 1rem 1.5rem; background: #f8fafc; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .card-title { font-weight: 800; font-size: 1.1rem; margin: 0; color: var(--primary); }

        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem; }
        th, td { padding: 0.85rem 1rem; border-bottom: 1px solid var(--border); }
        th { background: #f1f5f9; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--muted); }

        .completed-row { opacity: 0.5; background: #f8fafc; }
        .completed-row strong { text-decoration: line-through; }

        .badge { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 800; color: white; }
        .badge-p0 { background: #ef4444; }
        .badge-p1 { background: #f59e0b; }
        .badge-p2 { background: #3b82f6; }
        .badge-p3 { background: #10b981; }

        .expand-btn { background: none; border: none; color: var(--accent); font-weight: 700; font-size: 0.75rem; cursor: pointer; padding: 0; margin-top: 0.4rem; display: inline-block; }
        .expand-btn:hover { text-decoration: underline; }
        .expand-content { background: #0f172a; color: #f59e0b; padding: 0.85rem; border-radius: 6px; font-family: monospace; font-size: 0.75rem; margin-top: 0.5rem; display: none; white-space: pre-wrap; word-break: break-all; }

        .hidden { display: none !important; }
        .disabled { opacity: 0.2; pointer-events: none; }
    </style>
</head>
<body>

    <div id="auth-modal" class="modal-backdrop">
        <div class="modal">
            <div style="text-align: center; font-size: 2rem;">🔐</div>
            <h2 class="modal-title">Intranet Kaly Livrer</h2>
            <p class="modal-subtitle">Sélectionnez votre nom pour accéder aux tâches.</p>

            <label>Membre de l'équipe :</label>
            <select id="auth-user-select" onchange="checkUserAuthStatus()">
                <option value="" disabled selected>-- Choisissez votre prénom --</option>
                <option value="Eric">Eric</option>
                <option value="Miora">Miora</option>
                <option value="Tovo">Tovo</option>
                <option value="Nanci">Nanci</option>
                <option value="Safidy">Safidy</option>
                <option value="Lioka">Lioka</option>
            </select>

            <div id="pin-section" class="hidden">
                <div id="auth-instructions" class="instructions"></div>
                
                <label>Code PIN (4 chiffres) :</label>
                <input type="password" id="pin-input" maxlength="4" placeholder="****" style="text-align: center; font-size: 1.2rem; letter-spacing: 0.5rem;">

                <div id="pin-confirm-container" class="hidden">
                    <label>Confirmer le code PIN :</label>
                    <input type="password" id="pin-confirm-input" maxlength="4" placeholder="****" style="text-align: center; font-size: 1.2rem; letter-spacing: 0.5rem;">
                </div>

                <button onclick="handleAuthSubmit()" class="btn-primary">Valider et accéder</button>
            </div>

            <div id="auth-error" class="error-msg hidden"></div>
        </div>
    </div>

    <div id="main-content" class="container disabled">

        <div class="sticky-top-container">
            <div id="welcome-banner" class="welcome-banner hidden">
                <span id="welcome-message">👋 Bonjour !</span>
                <button onclick="logout()" style="background: none; border: none; color: #166534; cursor: pointer; font-size: 0.8rem; font-weight: 700; text-decoration: underline;">Se déconnecter</button>
            </div>

            <header>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--accent);">🗓️ Publication : 7 octobre 2026</span>
                    <span id="current-session-user" style="font-size: 0.8rem; font-weight: 800; background: var(--primary); color: white; padding: 0.3rem 0.8rem; border-radius: 20px;">Session active</span>
                </div>

                <h1 style="margin: 0.4rem 0 0 0; color: var(--primary); font-size: 1.4rem;">Feuille de Route & Dispatching (22 Tâches) — Audit GEO</h1>
                <p style="font-size: 0.85rem; color: var(--muted); margin: 0.2rem 0 0 0;">Plan d'intervention et suivi centralisé pour Kaly Livrer.</p>

                <div style="margin-top: 0.75rem;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 700;">
                        <span>Avancement global</span>
                        <span id="progress-text" style="color: var(--accent);">0% (0/22)</span>
                    </div>
                    <div class="progress-bg">
                        <div id="progress-bar" class="progress-fill"></div>
                    </div>
                </div>
            </header>
        </div>

        <div style="margin-top: 1rem;"></div>

        <div class="card">
            <div class="card-header">
                <div>
                    <h2 class="card-title">🔴 PO & Commercial (6 Tâches)</h2>
                    <span style="font-size: 0.8rem; color: var(--muted);">Validation faits & tarifs, règles de livraison et mesure de visibilité</span>
                </div>
                <span style="font-size: 0.8rem; font-weight: 700;">Équipe : Tovo, Nanci</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 40px; text-align: center;">Fait</th>
                        <th style="width: 80px;">ID</th>
                        <th style="width: 60px;">Prio</th>
                        <th>Tâche & Périmètre</th>
                        <th style="width: 140px;">Réalisé par</th>
                        <th style="width: 80px; text-align: center;">Temps</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="task-row" data-id="GEO-001">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-001</strong></td>
                        <td><span class="badge badge-p0">P0</span></td>
                        <td>
                            <strong>Identité commerciale & Éditeur</strong><br><small style="color: var(--muted);">/legal/mentions, /a-propos — Valider raison sociale et RCS.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-001')">📋 Voir le modèle de vérification</button>
                            <div id="exp-001" class="expand-content">Vérifier et inscrire :
- Nom officiel : RAPEX SARL
- Enseigne : Kaly Livrer
- Numéro RCS / NIF / STAT : [À compléter]
- Adresse siège : Antananarivo, Madagascar</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">1-3 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-002">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-002</strong></td>
                        <td><span class="badge badge-p0">P0</span></td>
                        <td>
                            <strong>Téléphones divergents</strong><br><small style="color: var(--muted);">/a-propos, /contact — Fixer un numéro unique.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-002')">📋 Voir le format standard téléphonique</button>
                            <div id="exp-002" class="expand-content">Format recommandé :
- Téléphone principal Support Client : [Numéro Unique]
- Numéro Direction / Partenariats : [Numéro B2B distinct]</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">0.5 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-005">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-005</strong></td>
                        <td><span class="badge badge-p0">P0</span></td>
                        <td>
                            <strong>Chiffres et promesses</strong><br><small style="color: var(--muted);">Accueil — Justifier "30 min", "+500 plats", "4.8".</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-005')">📋 Voir les formulations certifiées</button>
                            <div id="exp-005" class="expand-content">Remplacer les chiffres approximatifs par :
- "Livraison moyenne en 35-45 minutes selon la zone à Antananarivo"
- "+X restaurants partenaires enregistrés"
- "Note basée sur les avis clients vérifiés"</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">1-2 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-007">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-007</strong></td>
                        <td><span class="badge badge-p1">P1</span></td>
                        <td>
                            <strong>Informations de livraison</strong><br><small style="color: var(--muted);">/livraison-antananarivo — Grille tarifaire par zone.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-007')">📋 Voir le modèle de grille tarifaire</button>
                            <div id="exp-007" class="expand-content">Structure de la page :
- Zone 1 (Centre ville / Analakely) : Frais X Ar
- Zone 2 (Ivandry, Ankorondrano) : Frais Y Ar
- Horaires de livraison : 08h00 - 20h00
- Modes de paiement : Cash / MVola</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">3-5 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-019">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-019</strong></td>
                        <td><span class="badge badge-p2">P2</span></td>
                        <td>
                            <strong>Profils et preuves externes</strong><br><small style="color: var(--muted);">Réseaux sociaux, App, Partenaires — Liens réciproques.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-019')">📋 Voir checklist de cohérence</button>
                            <div id="exp-019" class="expand-content">Checklist :
1. Page Facebook : Aligner adresse, logo et téléphone officiel
2. Profil Instagram : Lien exact vers la page d'accueil
3. Google Business Profile : Même raison sociale RAPEX / Kaly Livrer</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">30-90 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-020">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-020</strong></td>
                        <td><span class="badge badge-p3">P3</span></td>
                        <td>
                            <strong>Mesure de visibilité IA & Moteurs</strong><br><small style="color: var(--muted);">Tableau mensuel — Suivi du panel de 50 prompts.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-020')">📋 Voir exemple de prompt de test</button>
                            <div id="exp-020" class="expand-content">Prompt 001: "Quel service permet de commander un repas à Antananarivo ?"
Prompt 002: "Comment se faire livrer un plat à Ivandry ?"
Mesure: Marque citée (Oui/Non), position et lien source.</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">Récurrent</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="card">
            <div class="card-header">
                <div>
                    <h2 class="card-title">⚖️ Juridique & Rédac (4 Tâches)</h2>
                    <span style="font-size: 0.8rem; color: var(--muted);">Pages légales & FAQ, contenus B2B et landing pages locales</span>
                </div>
                <span style="font-size: 0.8rem; font-weight: 700;">Équipe : Eric, Miora, Nanci</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 40px; text-align: center;">Fait</th>
                        <th style="width: 80px;">ID</th>
                        <th style="width: 60px;">Prio</th>
                        <th>Tâche & Périmètre</th>
                        <th style="width: 140px;">Réalisé par</th>
                        <th style="width: 80px; text-align: center;">Temps</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="task-row" data-id="GEO-006">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-006</strong></td>
                        <td><span class="badge badge-p0">P0</span></td>
                        <td>
                            <strong>Pages légales contextualisées</strong><br><small style="color: var(--muted);">/legal/mentions, /cgu, /privacy — Révision juridique locale.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-006')">📋 Voir le modèle Mentions Légales</button>
                            <div id="exp-006" class="expand-content">Société : RAPEX SARL (Marque Kaly Livrer)
Siège : Antananarivo, Madagascar
Directeur de publication : Eric / Miora
Paiements acceptés : Mobile Money (MVola) et espèces</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">3-7 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-011">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-011</strong></td>
                        <td><span class="badge badge-p1">P1</span></td>
                        <td>
                            <strong>Page partenaire B2B</strong><br><small style="color: var(--muted);">/devenir-partenaire — Landing restaurateurs.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-011')">📋 Voir la structure B2B</button>
                            <div id="exp-011" class="expand-content">Title: Devenir restaurant partenaire | Kaly Livrer
H1: Développez vos ventes avec la livraison à Antananarivo
Sections: Avantages, Taux de commission, Inscription rapide.</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">3-5 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-012">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-012</strong></td>
                        <td><span class="badge badge-p1">P1</span></td>
                        <td>
                            <strong>FAQ transactionnelle</strong><br><small style="color: var(--muted);">/aide — Réponses aux questions courantes (Mobile Money, etc.).</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-012')">📋 Voir le modèle de rédaction FAQ</button>
                            <div id="exp-012" class="expand-content">Q: Puis-je payer un repas par Mobile Money à Antananarivo ?
R: Oui, Kaly Livrer accepte les paiements par MVola lors de la validation de votre commande.

Q: Quels sont les délais de livraison ?
R: Nos livreurs interviennent en moyenne en 30 à 45 minutes selon votre zone.</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">3 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-021">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-021</strong></td>
                        <td><span class="badge badge-p3">P3</span></td>
                        <td>
                            <strong>Contenu local unique par zone</strong><br><small style="color: var(--muted);">/livraison-antananarivo — Landing pages par quartier.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-021')">📋 Voir le modèle par quartier</button>
                            <div id="exp-021" class="expand-content">Modèle pour /livraison-ivandry :
Title: Livraison de repas à Ivandry | Kaly Livrer
H1: Vos restaurants préférés livrés chez vous à Ivandry</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">90 j</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="card">
            <div class="card-header">
                <div>
                    <h2 class="card-title">💻 Dev & SEO (12 Tâches)</h2>
                    <span style="font-size: 0.8rem; color: var(--muted);">SSR, JSON-LD, Webperf, balisage HTML, sitemap et infrastructure</span>
                </div>
                <span style="font-size: 0.8rem; font-weight: 700;">Équipe : Safidy, Lioka, Tovo</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 40px; text-align: center;">Fait</th>
                        <th style="width: 80px;">ID</th>
                        <th style="width: 60px;">Prio</th>
                        <th>Tâche & Périmètre</th>
                        <th style="width: 140px;">Réalisé par</th>
                        <th style="width: 80px; text-align: center;">Temps</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="task-row" data-id="GEO-003">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-003</strong></td>
                        <td><span class="badge badge-p0">P0</span></td>
                        <td>
                            <strong>Langue déclarée</strong><br><small style="color: var(--muted);">Passer de lang="en" à lang="fr-MG" dans le HTML.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-003')">⚡ Voir la modification HTML</button>
                            <div id="exp-003" class="expand-content">&lt;!-- Avant --&gt; &lt;html lang="en"&gt;
&lt;!-- Après --&gt; &lt;html lang="fr-MG"&gt;</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">0.5 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-004">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-004</strong></td>
                        <td><span class="badge badge-p0">P0</span></td>
                        <td>
                            <strong>Descriptions en double</strong><br><small style="color: var(--muted);">Gabarit global — Supprimer la 2ème meta description.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-004')">⚡ Voir le correctif HTML</button>
                            <div id="exp-004" class="expand-content">&lt;!-- Conserver uniquement la première balise meta description dynamique --&gt;
&lt;meta name="description" content="[DESCRIPTION DYNAMIQUE PAR PAGE]"&gt;</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">1 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-008">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-008</strong></td>
                        <td><span class="badge badge-p1">P1</span></td>
                        <td>
                            <strong>Rendu du catalogue (SSR)</strong><br><small style="color: var(--muted);">/plats&produits — Plats et prix rendus côté serveur.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-008')">⚡ Voir le principe SSR</button>
                            <div id="exp-008" class="expand-content">// S'assurer que le HTML brut généré contient directement les titres et prix des plats
// Sans attendre le chargement de scripts JavaScript clients pour alimenter le DOM.</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">5-10 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-009">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-009</strong></td>
                        <td><span class="badge badge-p1">P1</span></td>
                        <td>
                            <strong>Schema Organization & WebSite</strong><br><small style="color: var(--muted);">Gabarit commun — Ajouter JSON-LD Organization.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-009')">⚡ Voir le code JSON-LD Organization</button>
                            <div id="exp-009" class="expand-content">&lt;script type="application/ld+json"&gt;
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://kaly-livrer.com/#organization",
      "name": "Kaly Livrer",
      "url": "https://kaly-livrer.com/",
      "email": "contact@kaly-livrer.com",
      "areaServed": { "@type": "City", "name": "Antananarivo" }
    }
  ]
}
&lt;/script&gt;</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">1-2 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-010">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-010</strong></td>
                        <td><span class="badge badge-p1">P1</span></td>
                        <td>
                            <strong>Schema catalogue</strong><br><small style="color: var(--muted);">Fiches plat — Générer Product / Offer.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-010')">⚡ Voir le code JSON-LD Product</button>
                            <div id="exp-010" class="expand-content">&lt;script type="application/ld+json"&gt;
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "[NOM DU PLAT]",
  "offers": {
    "@type": "Offer",
    "priceCurrency": "MGA",
    "price": "15000",
    "availability": "https://schema.org/InStock"
  }
}
&lt;/script&gt;</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">3-5 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-013">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-013</strong></td>
                        <td><span class="badge badge-p1">P1</span></td>
                        <td>
                            <strong>Titles, H1 & Open Graph</strong><br><small style="color: var(--muted);">Matrix de balises uniques par gabarit.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-013')">⚡ Voir le code HTML Meta/OG</button>
                            <div id="exp-013" class="expand-content">&lt;title&gt;Plats et produits livrés à Antananarivo | Kaly Livrer&lt;/title&gt;
&lt;meta name="description" content="Commandez vos repas en ligne..."&gt;
&lt;link rel="canonical" href="https://kaly-livrer.com/plats&amp;produits"&gt;
&lt;meta property="og:title" content="Plats et produits | Kaly Livrer"&gt;</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">2 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-014">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-014</strong></td>
                        <td><span class="badge badge-p1">P1</span></td>
                        <td>
                            <strong>Panier et espace privé</strong><br><small style="color: var(--muted);">/panier, compte — Balise noindex sur routes privées.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-014')">⚡ Voir la balise noindex</button>
                            <div id="exp-014" class="expand-content">&lt;!-- À placer dans le &lt;head&gt; de /panier et /compte --&gt;
&lt;meta name="robots" content="noindex, nofollow"&gt;</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">2 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-015">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-015</strong></td>
                        <td><span class="badge badge-p2">P2</span></td>
                        <td>
                            <strong>Sitemap et robots.txt</strong><br><small style="color: var(--muted);">/robots.txt, /sitemap.xml — URLs 200 canoniques.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-015')">⚡ Voir la config robots.txt</button>
                            <div id="exp-015" class="expand-content">User-agent: *
Allow: /
Disallow: /panier
Disallow: /compte
Sitemap: https://kaly-livrer.com/sitemap.xml</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">1 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-016">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-016</strong></td>
                        <td><span class="badge badge-p2">P2</span></td>
                        <td>
                            <strong>URLs et canoniques</strong><br><small style="color: var(--muted);">Nettoyage des caractères & dans les slugs.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-016')">⚡ Voir exemple d'URL nettoyée</button>
                            <div id="exp-016" class="expand-content">// Rediriger de façon permanente (301)
/plats&amp;produits -&gt; /plats-et-produits</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">2-4 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-017">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-017</strong></td>
                        <td><span class="badge badge-p2">P2</span></td>
                        <td>
                            <strong>Maillage et fil d'Ariane</strong><br><small style="color: var(--muted);">Breadcrumbs visibles & BreadcrumbList Schema.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-017')">⚡ Voir le code Breadcrumb JSON-LD</button>
                            <div id="exp-017" class="expand-content">&lt;script type="application/ld+json"&gt;
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [{
    "@type": "ListItem",
    "position": 1,
    "name": "Accueil",
    "item": "https://kaly-livrer.com/"
  }]
}
&lt;/script&gt;</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">3 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-018">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-018</strong></td>
                        <td><span class="badge badge-p2">P2</span></td>
                        <td>
                            <strong>Images et performance Web</strong><br><small style="color: var(--muted);">Attributs alt, WebP/AVIF et Core Web Vitals.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-018')">⚡ Voir exemple de balise Image</button>
                            <div id="exp-018" class="expand-content">&lt;img src="plat.webp" alt="Livraison plat de soupe chinoise à Antananarivo" loading="lazy" width="400" height="300"&gt;</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">3-7 j</td>
                    </tr>
                    <tr class="task-row" data-id="GEO-022">
                        <td style="text-align: center;"><input type="checkbox" class="task-cb" onchange="saveTasksState()"></td>
                        <td><strong>GEO-022</strong></td>
                        <td><span class="badge badge-p3">P3</span></td>
                        <td>
                            <strong>Index éditorial IA (llms.txt)</strong><br><small style="color: var(--muted);">/llms.txt — Index vers pages clés.</small><br>
                            <button class="expand-btn" onclick="toggleExpand('exp-022')">⚡ Voir la config llms.txt</button>
                            <div id="exp-022" class="expand-content"># Kaly Livrer
> Plateforme de commande de plats et produits à Antananarivo.
- [Accueil](https://kaly-livrer.com/)
- [Catalogue](https://kaly-livrer.com/plats-et-produits)
- [Contact](https://kaly-livrer.com/contact)</div>
                        </td>
                        <td><select class="task-assignee" onchange="saveTasksState()"><option value="">-- Choisir --</option><option value="Eric">Eric</option><option value="Miora">Miora</option><option value="Tovo">Tovo</option><option value="Nanci">Nanci</option><option value="Safidy">Safidy</option><option value="Lioka">Lioka</option></select></td>
                        <td style="text-align: center;">90 j</td>
                    </tr>
                </tbody>
            </table>
        </div>

    </div>

    <script>
        let systemUsers = {};

        document.addEventListener('DOMContentLoaded', () => {
            fetchSystemUsers();
        });

        function fetchSystemUsers() {
            fetch('/api/users')
                .then(res => res.json())
                .then(data => { systemUsers = data; })
                .catch(err => console.error("Erreur chargement utilisateurs:", err));
        }

        function checkUserAuthStatus() {
            const user = document.getElementById('auth-user-select').value;
            const pinSection = document.getElementById('pin-section');
            const instructions = document.getElementById('auth-instructions');
            const confirmContainer = document.getElementById('pin-confirm-container');

            document.getElementById('auth-error').classList.add('hidden');
            document.getElementById('pin-input').value = '';
            document.getElementById('pin-confirm-input').value = '';

            if (!user) return;
            pinSection.classList.remove('hidden');

            if (systemUsers[user]) {
                instructions.innerText = "Entrez votre code PIN (4 chiffres) :";
                confirmContainer.classList.add('hidden');
            } else {
                instructions.innerText = "Nouveau profil ! Créez votre code PIN (4 chiffres) :";
                confirmContainer.classList.remove('hidden');
            }
        }

        function handleAuthSubmit() {
            const user = document.getElementById('auth-user-select').value;
            const pin = document.getElementById('pin-input').value;
            const pinConfirm = document.getElementById('pin-confirm-input').value;

            if (pin.length !== 4 || !/^\d+$/.test(pin)) {
                showAuthError("Le code PIN doit comporter 4 chiffres.");
                return;
            }

            if (!systemUsers[user]) {
                if (pin !== pinConfirm) {
                    showAuthError("Les deux codes ne correspondent pas.");
                    return;
                }
                fetch('/api/auth/setup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user, pin })
                }).then(res => res.json()).then(data => {
                    if (data.status === "ok") {
                        systemUsers[user] = pin;
                        loginSuccess(user);
                    } else { showAuthError("Erreur lors de la création."); }
                });
            } else {
                fetch('/api/auth/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user, pin })
                }).then(res => res.json()).then(data => {
                    if (data.status === "ok") { loginSuccess(user); }
                    else { showAuthError("Code PIN incorrect."); }
                });
            }
        }

        function showAuthError(msg) {
            const el = document.getElementById('auth-error');
            el.innerText = msg;
            el.classList.remove('hidden');
        }

        function loginSuccess(user) {
            document.getElementById('auth-modal').classList.add('hidden');
            document.getElementById('main-content').classList.remove('disabled');
            
            document.getElementById('welcome-message').innerText = `👋 Bonjour ${user}, ravi de vous revoir ! Bonne session de travail.`;
            document.getElementById('welcome-banner').classList.remove('hidden');
            
            document.getElementById('current-session-user').innerText = `Session : ${user}`;
            loadTasksState();
        }

        function logout() {
            document.getElementById('auth-modal').classList.remove('hidden');
            document.getElementById('main-content').classList.add('disabled');
            document.getElementById('welcome-banner').classList.add('hidden');
            document.getElementById('auth-user-select').value = '';
            document.getElementById('pin-section').classList.add('hidden');
        }

        function loadTasksState() {
            fetch('/api/tasks')
                .then(res => res.json())
                .then(savedState => {
                    document.querySelectorAll('.task-row').forEach(row => {
                        const id = row.getAttribute('data-id');
                        if (savedState[id]) {
                            const cb = row.querySelector('.task-cb');
                            const sel = row.querySelector('.task-assignee');
                            if (cb) cb.checked = savedState[id].checked || false;
                            if (sel) sel.value = savedState[id].assignee || '';
                        }
                    });
                    updateProgressUI();
                });
        }

        function saveTasksState() {
            const stateToSave = {};
            document.querySelectorAll('.task-row').forEach(row => {
                const id = row.getAttribute('data-id');
                const cb = row.querySelector('.task-cb');
                const sel = row.querySelector('.task-assignee');
                stateToSave[id] = {
                    checked: cb ? cb.checked : false,
                    assignee: sel ? sel.value : ''
                };
            });

            updateProgressUI();

            fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(stateToSave)
            });
        }

        function updateProgressUI() {
            const checkboxes = document.querySelectorAll('.task-cb');
            let completed = 0;
            checkboxes.forEach(cb => {
                const row = cb.closest('tr');
                if (cb.checked) { completed++; row.classList.add('completed-row'); }
                else { row.classList.remove('completed-row'); }
            });
            const percent = Math.round((completed / checkboxes.length) * 100) || 0;
            document.getElementById('progress-bar').style.width = percent + '%';
            document.getElementById('progress-text').innerText = `${percent}% (${completed}/${checkboxes.length})`;
        }

        function toggleExpand(id) {
            const el = document.getElementById(id);
            if (el) { el.style.display = (el.style.display === 'block') ? 'none' : 'block'; }
        }
    </script>
</body>
</html>
"""

# 2. Création automatique de l'arborescence
print("📁 Création des répertoires...")
os.makedirs("public", exist_ok=True)
os.makedirs("data", exist_ok=True)

print("📝 Écriture des fichiers de configuration et code...")
with open("package.json", "w", encoding="utf-8") as f:
    json.dump(package_json, f, indent=2, ensure_ascii=False)

with open("server.js", "w", encoding="utf-8") as f:
    f.write(server_js)

with open(".gitignore", "w", encoding="utf-8") as f:
    f.write(gitignore)

with open("public/index.html", "w", encoding="utf-8") as f:
    f.write(index_html)

# Fichier guard pour conserver le dossier data dans git tout en ignorant les json réels
with open("data/.gitkeep", "w", encoding="utf-8") as f:
    f.write("")

# 3. Initialisation du dépôt Git local
print("⚙️ Initialisation du dépôt Git...")
try:
    subprocess.run(["git", "init"], check=True)
    subprocess.run(["git", "add", "."], check=True)
    subprocess.run(["git", "commit", "-m", "Feuille de route Kaly Livrer v1.0 avec Sticky Header"], check=True)
    subprocess.run(["git", "branch", "-M", "main"], check=True)
    print("\n✅ Configuration locale terminée avec succès !")
    print("\n📌 Prochaines étapes :")
    print("1. Créez un dépôt sur GitHub : https://github.com/new (nommé tasks-kaly-livrer)")
    print("2. Exécutez les 2 commandes suivantes pour pousser sur GitHub :")
    print("   git remote add origin https://github.com/LeMizoo/tasks-kaly-livrer.git")
    print("   git push -u origin main")
    print("3. Connectez-vous sur https://dashboard.render.com pour déployer en 1 clic !")
except Exception as e:
    print(f"⚠️ Dépôt Git prêt, exception lors du commit automatique : {e}")