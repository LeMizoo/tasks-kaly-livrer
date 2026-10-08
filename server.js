const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');

const ALLOWED_USERS = ["Eric", "Miora", "Tovo", "Nancy", "Safidy", "Lioka"];

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TASKS_FILE)) fs.writeFileSync(TASKS_FILE, JSON.stringify({}));
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}));
if (!fs.existsSync(AUDIT_FILE)) fs.writeFileSync(AUDIT_FILE, JSON.stringify([]));

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

app.get('/api/audit', (req, res) => {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    try {
        const entries = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8') || '[]');
        if (!Array.isArray(entries)) throw new Error('Invalid audit data');
        const recentAccess = entries.find(entry => entry && entry.taskId === 'ACCESS') || null;
        const now = Date.now();
        const recentLogins24h = entries.filter(entry => {
            if (!entry || entry.action !== 'connexion') return false;
            const timestamp = new Date(entry.date).getTime();
            return Number.isFinite(timestamp) && now - timestamp >= 0 && now - timestamp <= 24 * 60 * 60 * 1000;
        }).length;
        res.json({
            entries: entries.slice(0, limit),
            summary: { recentAccess, recentLogins24h }
        });
    } catch (err) {
        console.error('Erreur de lecture de l’historique:', err);
        res.status(500).json({ error: "Erreur de lecture de l'historique" });
    }
});

app.post('/api/audit', (req, res) => {
    const { user, action, taskId, detail } = req.body || {};
    if (
        typeof user !== 'string' || !user.trim() || user.length > 50 ||
        (!ALLOWED_USERS.includes(user.trim()) && user.trim() !== 'Anonyme') ||
        typeof action !== 'string' || !action.trim() || action.length > 100 ||
        typeof taskId !== 'string' || !taskId.trim() || taskId.length > 50 ||
        (detail !== undefined && typeof detail !== 'string')
    ) {
        return res.status(400).json({ error: "Données d'historique invalides" });
    }

    try {
        const entries = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8') || '[]');
        if (!Array.isArray(entries)) throw new Error('Invalid audit data');
        entries.unshift({
            user: user.trim(),
            action: action.trim(),
            taskId: taskId.trim(),
            detail: typeof detail === 'string' ? detail.slice(0, 500) : '',
            date: new Date().toISOString()
        });
        fs.writeFileSync(AUDIT_FILE, JSON.stringify(entries.slice(0, 500), null, 2));
        res.json({ status: "ok" });
    } catch (err) {
        console.error("Erreur d'écriture de l'historique:", err);
        res.status(500).json({ error: "Erreur d'écriture de l'historique" });
    }
});

app.get('/api/users', (req, res) => {
    fs.readFile(USERS_FILE, 'utf8', (err, data) => {
        res.json(err ? {} : JSON.parse(data || '{}'));
    });
});

app.post('/api/auth/setup', (req, res) => {
    const { user, pin } = req.body;
    if (ALLOWED_USERS.includes(user) && pin && pin.length === 4 && /^\d+$/.test(pin)) {
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
