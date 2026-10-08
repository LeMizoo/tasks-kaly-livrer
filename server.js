const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const META_FILE = path.join(DATA_DIR, 'meta.json');

const ALLOWED_USERS = ["Eric", "Miora", "Tovo", "Nancy", "Safidy", "Lioka"];
const PRESENCE_TIMEOUT_MS = 90 * 1000;
const BROADCAST_MESSAGE_TTL_MS = 10 * 60 * 1000;
const activeSessions = new Map();
const broadcastMessages = [];

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TASKS_FILE)) fs.writeFileSync(TASKS_FILE, JSON.stringify({}));
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}));
if (!fs.existsSync(AUDIT_FILE)) fs.writeFileSync(AUDIT_FILE, JSON.stringify([]));
if (!fs.existsSync(COMMENTS_FILE)) fs.writeFileSync(COMMENTS_FILE, JSON.stringify({}));
if (!fs.existsSync(META_FILE)) fs.writeFileSync(META_FILE, JSON.stringify({ subtasks: {}, deadlines: {} }));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getActiveUsers() {
    const cutoff = Date.now() - PRESENCE_TIMEOUT_MS;
    for (const [sessionId, session] of activeSessions) {
        if (session.lastSeen < cutoff) activeSessions.delete(sessionId);
    }
    return [...new Set([...activeSessions.values()].map(session => session.user))]
        .sort((a, b) => ALLOWED_USERS.indexOf(a) - ALLOWED_USERS.indexOf(b));
}

function appendAuditEntry(entry) {
    const entries = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8') || '[]');
    if (!Array.isArray(entries)) throw new Error('Invalid audit data');
    entries.unshift(entry);
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(entries.slice(0, 500), null, 2));
}

app.get('/api/presence', (req, res) => {
    res.json({ users: getActiveUsers() });
});

app.post('/api/presence', (req, res) => {
    const { user, sessionId } = req.body || {};
    if (
        typeof user !== 'string' || !ALLOWED_USERS.includes(user) ||
        typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(sessionId)
    ) {
        return res.status(400).json({ error: "Données de présence invalides" });
    }

    activeSessions.set(sessionId, { user, lastSeen: Date.now() });
    res.json({ users: getActiveUsers() });
});

app.delete('/api/presence', (req, res) => {
    const { sessionId } = req.body || {};
    if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(sessionId)) {
        return res.status(400).json({ error: "Identifiant de session invalide" });
    }

    activeSessions.delete(sessionId);
    res.json({ users: getActiveUsers() });
});

app.post('/api/messages', (req, res) => {
    const { user, sessionId, text } = req.body || {};
    if (
        typeof user !== 'string' || !ALLOWED_USERS.includes(user) ||
        typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(sessionId) ||
        typeof text !== 'string' || !text.trim() || text.trim().length > 500
    ) {
        return res.status(400).json({ error: "Données du message invalides" });
    }

    getActiveUsers();
    const sender = activeSessions.get(sessionId);
    if (!sender || sender.user !== user) {
        return res.status(403).json({ error: "Session utilisateur inactive" });
    }

    const recipients = [...activeSessions.keys()];
    if (recipients.length === 0) {
        return res.status(409).json({ error: "Aucun utilisateur connecté" });
    }

    const now = Date.now();
    const id = crypto.randomUUID();
    const date = new Date(now).toISOString();
    try {
        appendAuditEntry({
            id,
            user,
            action: "message diffusé",
            taskId: "MESSAGE",
            detail: text.trim(),
            date
        });
    } catch (err) {
        console.error("Erreur d'écriture de l'historique:", err);
        return res.status(500).json({ error: "Erreur d'écriture de l'historique" });
    }

    while (broadcastMessages.length && now - broadcastMessages[0].createdAt > BROADCAST_MESSAGE_TTL_MS) {
        broadcastMessages.shift();
    }
    broadcastMessages.push({
        id,
        user,
        text: text.trim(),
        date,
        createdAt: now,
        recipients
    });
    if (broadcastMessages.length > 500) broadcastMessages.shift();

    const recipientCount = new Set(recipients.map(id => activeSessions.get(id)?.user).filter(Boolean)).size;
    res.json({ status: "ok", recipientCount });
});

app.get('/api/messages', (req, res) => {
    const sessionId = req.query.sessionId;
    if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(sessionId)) {
        return res.status(400).json({ error: "Identifiant de session invalide" });
    }
    if (!activeSessions.has(sessionId)) {
        return res.status(403).json({ error: "Session utilisateur inactive" });
    }

    const now = Date.now();
    while (broadcastMessages.length && now - broadcastMessages[0].createdAt > BROADCAST_MESSAGE_TTL_MS) {
        broadcastMessages.shift();
    }
    const messages = broadcastMessages
        .filter(message => message.recipients.includes(sessionId))
        .map(({ id, user, text, date }) => ({ id, user, text, date }));
    res.json({ messages });
});

app.get('/api/tasks', (req, res) => {
    try {
        const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8') || '{}');
        if (!tasks || Array.isArray(tasks) || typeof tasks !== 'object') {
            throw new Error('Invalid task data');
        }
        res.json(tasks);
    } catch (err) {
        console.error('Erreur de lecture des tâches:', err);
        res.status(500).json({ error: "Erreur de lecture des tâches" });
    }
});

app.post('/api/tasks', (req, res) => {
    const body = req.body || {};
    try {
        let tasks = body;
        if (Array.isArray(body.taskIds) && body.tasks && typeof body.tasks === 'object' && !Array.isArray(body.tasks)) {
            if (body.taskIds.length > 100 || body.taskIds.some(taskId => typeof taskId !== 'string' || !/^GEO-\d{3}$/.test(taskId))) {
                return res.status(400).json({ error: "Identifiants de tâches invalides" });
            }
            tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8') || '{}');
            if (!tasks || Array.isArray(tasks) || typeof tasks !== 'object') throw new Error('Invalid task data');
            for (const taskId of body.taskIds) {
                const state = body.tasks[taskId];
                if (!state || typeof state !== 'object' || typeof state.checked !== 'boolean' ||
                    typeof state.assignee !== 'string' || (state.assignee !== '' && !ALLOWED_USERS.includes(state.assignee))) {
                    return res.status(400).json({ error: "État de tâche invalide" });
                }
                tasks[taskId] = state;
            }
        }
        if (!tasks || Array.isArray(tasks) || typeof tasks !== 'object') {
            return res.status(400).json({ error: "État des tâches invalide" });
        }
        fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
        res.json({ status: "ok" });
    } catch (err) {
        console.error("Erreur d'écriture des tâches:", err);
        res.status(500).json({ error: "Erreur d'écriture" });
    }
});

app.get('/api/meta', (req, res) => {
    try {
        const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8') || '{}');
        if (!meta || Array.isArray(meta) || typeof meta !== 'object' ||
            !meta.subtasks || Array.isArray(meta.subtasks) || typeof meta.subtasks !== 'object' ||
            !meta.deadlines || Array.isArray(meta.deadlines) || typeof meta.deadlines !== 'object') {
            throw new Error('Invalid task metadata');
        }
        res.json({ subtasks: meta.subtasks, deadlines: meta.deadlines });
    } catch (err) {
        console.error('Erreur de lecture des métadonnées des tâches:', err);
        res.status(500).json({ error: "Erreur de lecture des métadonnées des tâches" });
    }
});

app.post('/api/meta', (req, res) => {
    const { taskIds, subtasks, deadlines } = req.body || {};
    if (
        !Array.isArray(taskIds) || taskIds.length > 100 ||
        !subtasks || Array.isArray(subtasks) || typeof subtasks !== 'object' ||
        !deadlines || Array.isArray(deadlines) || typeof deadlines !== 'object'
    ) {
        return res.status(400).json({ error: "Métadonnées des tâches invalides" });
    }

    const validTaskId = taskId => typeof taskId === 'string' && /^GEO-\d{3}$/.test(taskId);
    if (taskIds.some(taskId => !validTaskId(taskId))) {
        return res.status(400).json({ error: "Identifiants de tâches invalides" });
    }
    for (const taskId of taskIds) {
        const items = subtasks[taskId];
        const date = deadlines[taskId];
        if (!Array.isArray(items) || items.some(item =>
            !item || typeof item !== 'object' ||
            typeof item.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id) ||
            typeof item.text !== 'string' || !item.text.trim() || item.text.trim().length > 5000 ||
            typeof item.done !== 'boolean'
        ) || (date !== '' && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)))) {
            return res.status(400).json({ error: "Sous-tâches invalides" });
        }
    }

    try {
        const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8') || '{"subtasks":{},"deadlines":{}}');
        if (!meta.subtasks || typeof meta.subtasks !== 'object' || Array.isArray(meta.subtasks)) meta.subtasks = {};
        if (!meta.deadlines || typeof meta.deadlines !== 'object' || Array.isArray(meta.deadlines)) meta.deadlines = {};
        taskIds.forEach(taskId => {
            meta.subtasks[taskId] = subtasks[taskId];
            meta.deadlines[taskId] = deadlines[taskId];
        });
        fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
        res.json({ status: "ok" });
    } catch (err) {
        console.error('Erreur d’écriture des métadonnées des tâches:', err);
        res.status(500).json({ error: "Erreur d'écriture des métadonnées des tâches" });
    }
});

app.get('/api/comments', (req, res) => {
    try {
        const comments = JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf8') || '{}');
        if (!comments || Array.isArray(comments) || typeof comments !== 'object') {
            throw new Error('Invalid comments data');
        }
        res.json({ comments });
    } catch (err) {
        console.error('Erreur de lecture des commentaires:', err);
        res.status(500).json({ error: "Erreur de lecture des commentaires" });
    }
});

app.post('/api/comments', (req, res) => {
    const { id, taskId, user, text, date } = req.body || {};
    if (
        typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
        typeof taskId !== 'string' || !/^GEO-\d{3}$/.test(taskId) ||
        typeof user !== 'string' || (!ALLOWED_USERS.includes(user) && user !== 'Anonyme') ||
        typeof text !== 'string' || !text.trim() || text.trim().length > 5000 ||
        typeof date !== 'string' || !Number.isFinite(Date.parse(date))
    ) {
        return res.status(400).json({ error: "Données du commentaire invalides" });
    }

    try {
        const comments = JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf8') || '{}');
        if (!comments || Array.isArray(comments) || typeof comments !== 'object') {
            throw new Error('Invalid comments data');
        }
        if (!Array.isArray(comments[taskId])) comments[taskId] = [];

        let comment = comments[taskId].find(entry => entry && entry.id === id);
        if (!comment) {
            comment = { id, user, text: text.trim(), date };
            comments[taskId].push(comment);
            fs.writeFileSync(COMMENTS_FILE, JSON.stringify(comments, null, 2));
        }
        res.json({ comment });
    } catch (err) {
        console.error('Erreur d’écriture des commentaires:', err);
        res.status(500).json({ error: "Erreur d'écriture des commentaires" });
    }
});

app.get('/api/audit', (req, res) => {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    try {
        const entries = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8') || '[]');
        if (!Array.isArray(entries)) throw new Error('Invalid audit data');
        let migrated = false;
        entries.forEach(entry => {
            if (entry && typeof entry === 'object' && !entry.id) {
                entry.id = crypto.randomUUID();
                migrated = true;
            }
        });
        if (migrated) fs.writeFileSync(AUDIT_FILE, JSON.stringify(entries.slice(0, 500), null, 2));
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
        appendAuditEntry({
            id: crypto.randomUUID(),
            user: user.trim(),
            action: action.trim(),
            taskId: taskId.trim(),
            detail: typeof detail === 'string' ? detail.slice(0, 500) : '',
            date: new Date().toISOString()
        });
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
