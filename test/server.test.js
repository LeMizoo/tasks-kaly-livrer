const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-kaly-livrer-test-'));
process.env.DATA_DIR = dataDir;
const app = require('../server');
delete process.env.DATA_DIR;

let server;
let baseUrl;

before(async () => {
    server = app.listen(0);
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    fs.rmSync(dataDir, { recursive: true, force: true });
});

test('exposes project configuration to the interface', async () => {
    const response = await fetch(`${baseUrl}/api/config`);
    assert.equal(response.status, 200);
    const config = await response.json();
    assert.equal(config.app.storageNamespace, 'kaly-livrer');
    assert.equal(config.tasks.length, 22);
    assert.equal(config.team.members.includes('Tovo'), true);
});

test('persists task states for configured task and team IDs', async () => {
    const config = await (await fetch(`${baseUrl}/api/config`)).json();
    const taskId = config.tasks[0].id;
    const assignee = config.team.members[0];
    const save = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            taskIds: [taskId],
            tasks: { [taskId]: { checked: true, assignee } }
        })
    });
    assert.equal(save.status, 200);
    const tasks = await (await fetch(`${baseUrl}/api/tasks`)).json();
    assert.deepEqual(tasks[taskId], { checked: true, assignee });
});

test('only the configured task creator can add persistent tasks', async () => {
    const setup = await fetch(`${baseUrl}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: 'Tovo', pin: '1234' })
    });
    assert.equal(setup.status, 200);
    const profileStatus = await (await fetch(`${baseUrl}/api/users`)).json();
    assert.equal(profileStatus.users.Tovo, true);
    assert.equal(Object.hasOwn(profileStatus, 'Tovo'), false);

    const overwritePin = await fetch(`${baseUrl}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: 'Tovo', pin: '0000' })
    });
    assert.equal(overwritePin.status, 409);

    const task = {
        title: 'Tâche ajoutée par le responsable',
        section: 'po',
        priority: 'P1',
        scope: 'Validation de la nouvelle tâche.',
        time: '1 jour',
        detail: 'Description',
        team: 'Tovo'
    };
    const forbidden = await fetch(`${baseUrl}/api/tasks/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...task, user: 'Nancy', pin: '1234' })
    });
    assert.equal(forbidden.status, 403);

    const wrongPin = await fetch(`${baseUrl}/api/tasks/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...task, user: 'Tovo', pin: '0000' })
    });
    assert.equal(wrongPin.status, 403);

    const created = await fetch(`${baseUrl}/api/tasks/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...task, user: 'Tovo', pin: '1234' })
    });
    assert.equal(created.status, 201);
    const { task: savedTask } = await created.json();
    assert.match(savedTask.id, /^TASK-/);

    const config = await (await fetch(`${baseUrl}/api/config`)).json();
    assert.equal(config.tasks.length, 23);
    assert.equal(config.tasks.at(-1).id, savedTask.id);
});

test('rejects task IDs that are not present in the project configuration', async () => {
    const response = await fetch(`${baseUrl}/api/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: 'UNKNOWN-001', content: 'test' })
    });
    assert.equal(response.status, 400);
});

test('restricts presence to configured team members', async () => {
    const response = await fetch(`${baseUrl}/api/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: 'Unknown', sessionId: 'a'.repeat(20) })
    });
    assert.equal(response.status, 400);
});

test('rejects malformed project configuration at startup', () => {
    const { spawnSync } = require('node:child_process');
    const invalidConfig = path.join(dataDir, 'invalid-config.json');
    fs.writeFileSync(invalidConfig, JSON.stringify({ app: {}, team: {}, tasks: [] }));
    const result = spawnSync(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, APP_CONFIG_FILE: invalidConfig, DATA_DIR: path.join(dataDir, 'invalid-data') },
        encoding: 'utf8'
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Configuration de projet invalide/);
});

test('serves and validates IDs from a separate project configuration', async () => {
    const projectConfigPath = path.join(dataDir, 'example-project.json');
    const projectDataDir = path.join(dataDir, 'example-project-data');
    fs.copyFileSync(path.join(__dirname, '..', 'config', 'app.example.json'), projectConfigPath);

    const portProbe = net.createServer();
    await new Promise((resolve, reject) => {
        portProbe.once('error', reject);
        portProbe.listen(0, '127.0.0.1', resolve);
    });
    const port = portProbe.address().port;
    await new Promise((resolve, reject) => portProbe.close(error => error ? reject(error) : resolve()));

    const child = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'),
        env: {
            ...process.env,
            APP_CONFIG_FILE: projectConfigPath,
            DATA_DIR: projectDataDir,
            PORT: String(port)
        },
        stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });

    try {
        let health;
        let connectionError;
        for (let attempt = 0; attempt < 60; attempt++) {
            if (child.exitCode !== null) throw new Error(`Custom project server exited: ${stderr}`);
            try {
                health = await fetch(`http://127.0.0.1:${port}/api/health`);
                if (health.ok) break;
            } catch (error) {
                connectionError = error;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.equal(health && health.status, 200, `Custom project server did not start: ${stderr} ${connectionError || ''}`);

        const config = await (await fetch(`http://127.0.0.1:${port}/api/config`)).json();
        assert.equal(config.app.name, 'Mon projet');
        assert.equal(config.tasks[0].id, 'TASK-001');

        const save = await fetch(`http://127.0.0.1:${port}/api/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                taskIds: ['TASK-001'],
                tasks: { 'TASK-001': { checked: true, assignee: 'Alex' } }
            })
        });
        assert.equal(save.status, 200);

        const rejectKalyId = await fetch(`http://127.0.0.1:${port}/api/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: 'GEO-001', content: 'not in this project' })
        });
        assert.equal(rejectKalyId.status, 400);
    } finally {
        child.kill();
        if (child.exitCode === null && child.signalCode === null) {
            await new Promise(resolve => {
                const timeout = setTimeout(resolve, 2000);
                child.once('exit', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
        }
        if (child.exitCode === null && child.signalCode === null) {
            throw new Error('Custom project server did not stop after SIGTERM.');
        }
    }
});

test('creates a new publication after the deadline and resets only task progress', async () => {
    const projectConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'app.json'), 'utf8'));
    projectConfig.app.publicationDate = '2020-01-01';
    projectConfig.app.deadlineDate = '2020-01-02';
    const projectConfigPath = path.join(dataDir, 'expired-publication.json');
    const projectDataDir = path.join(dataDir, 'expired-publication-data');
    fs.mkdirSync(projectDataDir);
    fs.writeFileSync(projectConfigPath, JSON.stringify(projectConfig));

    const firstTaskId = projectConfig.tasks[0].id;
    const savedSubtask = [{ id: '123e4567-e89b-42d3-a456-426614174000', text: 'Conserver', done: true }];
    const savedComment = [{ id: 'comment-1', text: 'Conserver aussi' }];
    fs.writeFileSync(path.join(projectDataDir, 'tasks.json'), JSON.stringify({
        [firstTaskId]: { checked: true, assignee: 'Tovo' }
    }));
    fs.writeFileSync(path.join(projectDataDir, 'meta.json'), JSON.stringify({
        subtasks: { [firstTaskId]: savedSubtask },
        deadlines: { [firstTaskId]: '2026-10-20' }
    }));
    fs.writeFileSync(path.join(projectDataDir, 'comments.json'), JSON.stringify({
        [firstTaskId]: savedComment
    }));

    const portProbe = net.createServer();
    await new Promise((resolve, reject) => {
        portProbe.once('error', reject);
        portProbe.listen(0, '127.0.0.1', resolve);
    });
    const port = portProbe.address().port;
    await new Promise((resolve, reject) => portProbe.close(error => error ? reject(error) : resolve()));

    const child = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'),
        env: {
            ...process.env,
            APP_CONFIG_FILE: projectConfigPath,
            DATA_DIR: projectDataDir,
            PORT: String(port)
        },
        stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });

    try {
        let health;
        for (let attempt = 0; attempt < 60; attempt++) {
            if (child.exitCode !== null) throw new Error(`Publication server exited: ${stderr}`);
            try {
                health = await fetch(`http://127.0.0.1:${port}/api/health`);
                if (health.ok) break;
            } catch {}
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.equal(health && health.status, 200, `Publication server did not start: ${stderr}`);

        const setup = await fetch(`http://127.0.0.1:${port}/api/auth/setup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: 'Tovo', pin: '1234' })
        });
        assert.equal(setup.status, 200);

        const wrongPin = await fetch(`http://127.0.0.1:${port}/api/publication/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user: 'Tovo', pin: '0000', name: 'Nouveau projet', title: 'Nouvelle feuille',
                description: 'Nouvelle publication', publicationDate: '2026-10-17', deadlineDate: '2026-10-24'
            })
        });
        assert.equal(wrongPin.status, 403);

        const otherUser = await fetch(`http://127.0.0.1:${port}/api/publication/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user: 'Nancy', pin: '1234', name: 'Nouveau projet', title: 'Nouvelle feuille',
                description: 'Nouvelle publication', publicationDate: '2026-10-17', deadlineDate: '2026-10-24'
            })
        });
        assert.equal(otherUser.status, 403);

        const reset = await fetch(`http://127.0.0.1:${port}/api/publication/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user: 'Tovo', pin: '1234', name: 'Nouveau projet', title: 'Nouvelle feuille',
                description: 'Nouvelle publication', publicationDate: '2026-10-17', deadlineDate: '2026-10-24'
            })
        });
        assert.equal(reset.status, 200);

        const config = await (await fetch(`http://127.0.0.1:${port}/api/config`)).json();
        assert.equal(config.app.name, 'Nouveau projet');
        assert.equal(config.app.title, 'Nouvelle feuille');
        assert.equal(config.app.publicationDate, '2026-10-17');
        assert.equal(config.app.deadlineDate, '2026-10-24');

        const tasks = await (await fetch(`http://127.0.0.1:${port}/api/tasks`)).json();
        assert.deepEqual(tasks[firstTaskId], { checked: false, assignee: '' });
        const archives = JSON.parse(fs.readFileSync(path.join(projectDataDir, 'publication-archives.json'), 'utf8'));
        assert.equal(archives.length, 1);
        assert.deepEqual(archives[0].taskStates[firstTaskId], { checked: true, assignee: 'Tovo' });
        assert.deepEqual((await (await fetch(`http://127.0.0.1:${port}/api/meta`)).json()).subtasks[firstTaskId], savedSubtask);
        assert.deepEqual((await (await fetch(`http://127.0.0.1:${port}/api/comments`)).json()).comments[firstTaskId], savedComment);
    } finally {
        child.kill();
        if (child.exitCode === null && child.signalCode === null) {
            await new Promise(resolve => {
                const timeout = setTimeout(resolve, 2000);
                child.once('exit', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
        }
        if (child.exitCode === null && child.signalCode === null) {
            throw new Error('Publication server did not stop after SIGTERM.');
        }
    }
});
