const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CONFIG_FILE = path.resolve(process.env.APP_CONFIG_FILE || path.join(__dirname, 'config', 'app.json'));
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const META_FILE = path.join(DATA_DIR, 'meta.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const ADDED_TASKS_FILE = path.join(DATA_DIR, 'added-tasks.json');

function loadProjectConfig(filePath) {
    let config;
    try {
        config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        throw new Error(`Impossible de charger la configuration ${filePath}: ${err.message}`);
    }

    const fail = message => { throw new Error(`Configuration de projet invalide: ${message}`); };
    const isText = value => typeof value === 'string' && value.trim().length > 0;
    const isKey = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/.test(value);
    if (!config || typeof config !== 'object' || Array.isArray(config)) fail('un objet JSON est requis.');
    if (!config.app || !isText(config.app.name) || !isText(config.app.title) ||
        !isText(config.app.description) || !/^[a-z0-9][a-z0-9-]{1,49}$/.test(config.app.storageNamespace || '')) {
        fail('app doit fournir name, title, description et storageNamespace (minuscules, chiffres et tirets).');
    }
    if (config.app.locale !== undefined) {
        try {
            if (!isText(config.app.locale)) fail('app.locale doit être une locale prise en charge.');
            new Intl.DateTimeFormat(config.app.locale);
        } catch {
            fail('app.locale doit être une locale prise en charge.');
        }
    }
    if (config.app.publicationDate !== undefined &&
        (typeof config.app.publicationDate !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(config.app.publicationDate) ||
            Number.isNaN(Date.parse(config.app.publicationDate)))) {
        fail('app.publicationDate doit respecter le format AAAA-MM-JJ.');
    }
    if (config.app.theme && (
        typeof config.app.theme !== 'object' || Array.isArray(config.app.theme) ||
        ['accent', 'accentSecondary'].some(key =>
            config.app.theme[key] !== undefined && !/^#[0-9a-f]{6}$/i.test(config.app.theme[key]))
    )) {
        fail('app.theme accepte uniquement des couleurs hexadécimales #RRGGBB.');
    }
    if (!config.team || !isText(config.team.label) || !Array.isArray(config.team.members) ||
        !config.team.members.length || config.team.members.some(member => !isText(member)) ||
        new Set(config.team.members).size !== config.team.members.length) {
        fail('team doit fournir un libellé et des membres uniques.');
    }
    if (config.taskCreator !== undefined &&
        (typeof config.taskCreator !== 'string' || !config.team.members.includes(config.taskCreator))) {
        fail('taskCreator doit désigner un membre défini dans team.members.');
    }
    if (!Array.isArray(config.sections) || !config.sections.length) fail('au moins une section est requise.');
    const sectionIds = new Set();
    for (const section of config.sections) {
        if (!section || !isKey(section.id) || !isText(section.title) || !isText(section.description) ||
            typeof section.team !== 'string' || sectionIds.has(section.id)) {
            fail('chaque section doit avoir un id unique, un titre, une description et une équipe.');
        }
        sectionIds.add(section.id);
    }
    if (!Array.isArray(config.priorities) || !config.priorities.length) fail('au moins une priorité est requise.');
    const priorityIds = new Set();
    for (const priority of config.priorities) {
        if (!priority || !isKey(priority.id) || !isText(priority.label) || priorityIds.has(priority.id)) {
            fail('chaque priorité doit avoir un id et un libellé uniques.');
        }
        priorityIds.add(priority.id);
    }
    if (!Array.isArray(config.tasks) || !config.tasks.length || config.tasks.length > 1000) {
        fail('tasks doit contenir entre 1 et 1000 tâches.');
    }
    const taskIds = new Set();
    for (const task of config.tasks) {
        if (!task || !isKey(task.id) || taskIds.has(task.id) || !sectionIds.has(task.section) ||
            !priorityIds.has(task.priority) || !isText(task.title) || !isText(task.scope) ||
            !isText(task.time) || typeof task.detail !== 'string' ||
            (task.team !== undefined && typeof task.team !== 'string')) {
            fail('chaque tâche doit avoir un id unique, une section et priorité existantes, un titre, un périmètre, un temps et un détail.');
        }
        taskIds.add(task.id);
    }
    if ((config.criticalPriority !== undefined && !priorityIds.has(config.criticalPriority)) ||
        (config.criticalPriorityLabel !== undefined && !isText(config.criticalPriorityLabel))) {
        fail('criticalPriority doit référencer une priorité existante et criticalPriorityLabel doit être un libellé non vide.');
    }
    if (!config.templates || typeof config.templates !== 'object' || Array.isArray(config.templates) ||
        Object.entries(config.templates).some(([id, content]) => !taskIds.has(id) || typeof content !== 'string')) {
        fail('templates doit associer un modèle texte à une tâche existante.');
    }
    if (!config.templateExtensions || typeof config.templateExtensions !== 'object' ||
        Array.isArray(config.templateExtensions) ||
        Object.entries(config.templateExtensions).some(([id, ext]) =>
            !taskIds.has(id) || typeof ext !== 'string' || !/^[a-z0-9]{1,10}$/i.test(ext))) {
        fail('templateExtensions doit associer une extension valide à une tâche existante.');
    }
    return config;
}

const PROJECT_CONFIG = loadProjectConfig(CONFIG_FILE);
const ALLOWED_USERS = PROJECT_CONFIG.team.members;
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
if (!fs.existsSync(TEMPLATES_FILE)) fs.writeFileSync(TEMPLATES_FILE, JSON.stringify({}));
if (!fs.existsSync(ADDED_TASKS_FILE)) fs.writeFileSync(ADDED_TASKS_FILE, JSON.stringify([]));

const addedTasks = JSON.parse(fs.readFileSync(ADDED_TASKS_FILE, 'utf8') || '[]');
if (!Array.isArray(addedTasks) || addedTasks.some(task =>
    !task || typeof task.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/.test(task.id) ||
    typeof task.title !== 'string' || !task.title.trim() || typeof task.scope !== 'string' ||
    !task.scope.trim() || typeof task.time !== 'string' || !task.time.trim() ||
    typeof task.detail !== 'string' || !PROJECT_CONFIG.sections.some(section => section.id === task.section) ||
    !PROJECT_CONFIG.priorities.some(priority => priority.id === task.priority)
) || addedTasks.some(task => PROJECT_CONFIG.tasks.some(configured => configured.id === task.id)) ||
    new Set(addedTasks.map(task => task.id)).size !== addedTasks.length) {
    throw new Error(`Données de tâches ajoutées invalides dans ${ADDED_TASKS_FILE}`);
}
const ALLOWED_TASK_IDS = new Set(PROJECT_CONFIG.tasks.concat(addedTasks).map(task => task.id));
const isValidTaskId = taskId => typeof taskId === 'string' && ALLOWED_TASK_IDS.has(taskId);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/api/config', (req, res) => {
    res.json({ ...PROJECT_CONFIG, tasks: PROJECT_CONFIG.tasks.concat(addedTasks) });
});

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
            if (body.taskIds.length > 1000 || body.taskIds.some(taskId => !isValidTaskId(taskId))) {
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

app.post('/api/tasks/create', (req, res) => {
    const body = req.body || {};
    const { user, pin, title, section, priority, scope, time, detail, team } = body;
    if (!PROJECT_CONFIG.taskCreator || user !== PROJECT_CONFIG.taskCreator ||
        typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
        return res.status(403).json({ error: "Seul le responsable autorisé peut ajouter une tâche." });
    }

    try {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}');
        if (!users || users[user] !== pin) {
            return res.status(403).json({ error: "Code PIN incorrect." });
        }
        if (typeof title !== 'string' || !title.trim() || title.trim().length > 200 ||
            typeof section !== 'string' || !PROJECT_CONFIG.sections.some(item => item.id === section) ||
            typeof priority !== 'string' || !PROJECT_CONFIG.priorities.some(item => item.id === priority) ||
            typeof scope !== 'string' || !scope.trim() || scope.trim().length > 500 ||
            typeof time !== 'string' || !time.trim() || time.trim().length > 50 ||
            typeof detail !== 'string' || detail.length > 5000 ||
            (team !== undefined && (typeof team !== 'string' || team.length > 200))) {
            return res.status(400).json({ error: "Données de la tâche invalides." });
        }
        if (PROJECT_CONFIG.tasks.length + addedTasks.length >= 1000) {
            return res.status(409).json({ error: "La limite de 1000 tâches pour ce projet est atteinte." });
        }

        const task = {
            id: `TASK-${crypto.randomUUID()}`,
            section,
            priority,
            title: title.trim(),
            scope: scope.trim(),
            time: time.trim(),
            detail,
            team: typeof team === 'string' ? team.trim() : ''
        };
        const nextTasks = addedTasks.concat(task);
        fs.writeFileSync(ADDED_TASKS_FILE, JSON.stringify(nextTasks, null, 2));
        addedTasks.push(task);
        ALLOWED_TASK_IDS.add(task.id);
        res.status(201).json({ task });
    } catch (err) {
        console.error("Erreur d'ajout de tâche:", err);
        res.status(500).json({ error: "Impossible d'enregistrer la tâche." });
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

    if (taskIds.length > 1000 || taskIds.some(taskId => !isValidTaskId(taskId))) {
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
        !isValidTaskId(taskId) ||
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

app.get('/api/templates', (req, res) => {
    try {
        const templates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8') || '{}');
        if (!templates || Array.isArray(templates) || typeof templates !== 'object') {
            throw new Error('Invalid templates data');
        }
        res.json({ templates });
    } catch (err) {
        console.error('Erreur de lecture des modèles:', err);
        res.status(500).json({ error: "Erreur de lecture des modèles" });
    }
});

app.post('/api/templates', (req, res) => {
    const { taskId, content } = req.body || {};
    if (
        !isValidTaskId(taskId) ||
        typeof content !== 'string' || !content.trim() || content.length > 50000
    ) {
        return res.status(400).json({ error: "Données du modèle invalides" });
    }

    try {
        const templates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8') || '{}');
        if (!templates || Array.isArray(templates) || typeof templates !== 'object') {
            throw new Error('Invalid templates data');
        }
        templates[taskId] = content;
        fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
        res.json({ status: "ok", taskId, content });
    } catch (err) {
        console.error('Erreur d’écriture des modèles:', err);
        res.status(500).json({ error: "Erreur d'écriture des modèles" });
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
    try {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}');
        if (!users || typeof users !== 'object' || Array.isArray(users)) throw new Error('Invalid user data');
        res.json({ users: Object.fromEntries(ALLOWED_USERS.map(user => [user, Boolean(users[user])])) });
    } catch (err) {
        console.error('Erreur de lecture des profils utilisateur:', err);
        res.status(500).json({ error: "Erreur de lecture des profils utilisateur" });
    }
});

app.post('/api/auth/setup', (req, res) => {
    const { user, pin } = req.body || {};
    if (ALLOWED_USERS.includes(user) && typeof pin === 'string' && /^\d{4}$/.test(pin)) {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}');
        if (users[user]) {
            return res.status(409).json({ error: "Ce profil existe déjà. Connectez-vous avec votre code PIN." });
        }
        users[user] = pin;
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        return res.json({ status: "ok" });
    }
    res.status(400).json({ error: "Données invalides" });
});

app.post('/api/auth/verify', (req, res) => {
    const { user, pin } = req.body || {};
    if (!ALLOWED_USERS.includes(user) || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: "Données invalides" });
    }
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}');
    if (users[user] === pin) {
        return res.json({ status: "ok" });
    }
    res.status(400).json({ error: "Code PIN incorrect" });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Serveur Intranet démarré sur le port ${PORT}`);
    });
}

module.exports = app;
