const express = require('express');
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
