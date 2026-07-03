// Smoke test del renderer sin Electron: carga i18n.js + app.js dentro de
// jsdom con un window.corexAPI de mentira, desbloquea el "vault" y fuerza
// renderApp() en cada vista para cazar excepciones de runtime que el
// node --check (solo sintaxis) no ve.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const path0 = require('path');
const SRC = path0.join(__dirname, '..', 'src');

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const { window } = dom;

// Globals que app.js espera
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// xterm stub — el real vive en vendor/ y no hace falta para el smoke test
window.Terminal = function Terminal() {
  this.open = () => {};
  this.write = () => {};
  this.onData = () => {};
  this.onResize = () => {};
  this.loadAddon = () => {};
  this.dispose = () => {};
  this.focus = () => {};
};
window.FitAddon = { FitAddon: function FitAddon() { this.fit = () => {}; } };
global.Terminal = window.Terminal;
global.FitAddon = window.FitAddon;

// Monaco loader stub
window.require = undefined;

// corexAPI stub — devuelve formas mínimas compatibles con cada handler
const ok = (extra) => Promise.resolve(Object.assign({ ok: true }, extra));
window.corexAPI = {
  vaultIsUnlocked: () => Promise.resolve({ unlocked: true }),
  vaultExists: () => Promise.resolve({ exists: true }),
  vaultUnlock: () => ok({ firstTime: false }),
  getConfig: () => Promise.resolve({ jira: { url: 'https://jira.example.com', email: 'nelson@example.com' }, awx: { url: 'https://awx.example.com' }, smtp: {}, lang: 'en' }),
  ticketLinksGet: () => Promise.resolve({ 'ITSD-1': { templateId: 5, templateName: 'restart-service-linux', linkedAt: Date.now() } }),
  favoritesGet: () => Promise.resolve([]),
  templateUsageGet: () => Promise.resolve({}),
  ctSessionsGet: () => ok({ sessions: [] }),
  ctMacrosGet: () => ok({ macros: [] }),
  automationTemplatesGet: () => ok({ templates: [] }),
  pendingAttachmentsGet: () => ok({ pending: [] }),
  jiraSearchMyIssues: () => ok({ slaAvailable: true,
    issues: [
      { key: 'ITSD-1', _sla: { ongoing: { name: 'Time to resolution', remainingMillis: 12*60000, breached: false, goalMillis: 4*3600000 }, anyBreached: false }, fields: { summary: 'Payments API failing on prod', priority: { name: 'Highest' }, status: { name: 'Waiting for ops' } } },
      { key: 'ITSD-2', fields: { summary: 'Auth intermittent errors', priority: { name: 'High' }, status: { name: 'In Progress' } } },
      { key: 'ITSD-3', fields: { summary: 'Slow DB queries', priority: { name: 'Medium' }, status: { name: 'Open' } } },
      { key: 'ITSD-4', fields: { summary: 'No priority ticket', status: { name: 'Open' } } },
    ],
  }),
  dashboardGetMetrics: () => ok({
    cpu: { load: 34, user: 20, system: 8 },
    mem: { used: 8e9, total: 16e9 },
    temp: { main: 52 },
    battery: { hasBattery: false },
    disks: [{ mount: '/', use: 42, used: 4e10, size: 1e11 }],
    net: { rx_sec: 1024, tx_sec: 2048 },
    topProcesses: [{ name: 'node', cpu: 3.2 }],
  }),
  awxListTemplates: () => ok({ templates: [] }),
  awxRecentJobs: () => ok({ jobs: [
    { id: 9281, name: 'restart-service-linux', status: 'successful' },
    { id: 9279, name: 'patch-linux', status: 'failed' },
  ] }),
  setConfig: async function(partial) { const cfg = await this.getConfig(); return Object.assign({}, cfg, partial); },
  getLogDir: () => Promise.resolve('/tmp/corex-logs'),
  vaultLock: () => Promise.resolve({ ok: true }),
  vaultChangePassword: (c, n) => Promise.resolve(c === 'oldpw' ? { ok: true } : { ok: false, error: 'Current master password is incorrect' }),
  vaultStats: () => Promise.resolve({ ok: true, stats: {
    crypto: { cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA256 (200,000 iterations)' },
    file: { path: '/home/user/.corex/vault.json', sizeBytes: 4096, modifiedAt: new Date().toISOString() },
    contents: { jiraConfigured: true, awxConfigured: true, smtpConfigured: false, sshSessions: 3, sshSessionsMissingSecret: 1, macros: 2, automationTemplates: 4, ticketLinks: 6, pendingAttachments: 0, favoriteTemplates: 5 },
  } }),
  jiraMyself: () => Promise.resolve({ ok: true, me: { displayName: 'Nelson Perez', emailAddress: 'nelson@example.com', accountId: 'abc', avatarDataUrl: 'data:image/png;base64,iVBORw0KGgo=' } }),
  logInfo: () => {},
  logError: () => {},
};

// Cualquier otro método que app.js invoque y no esté arriba: stub genérico
// que devuelve ok:true — así el smoke test no muere por un handler menor.
window.corexAPI = new Proxy(window.corexAPI, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return () => Promise.resolve({ ok: true, exists: false, sessions: [], macros: [], templates: [], pending: [], issues: [], jobs: [] });
  },
});

// Cargar i18n + app
const i18nSrc = fs.readFileSync(path.join(SRC, 'i18n.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');

// Ejecutamos en el contexto global de node (con window/document ya puestos)
try {
  eval(i18nSrc + '\n' + appSrc + `
    ;(async () => {
      try {
        // Forzar unlock + carga como hace init()
        state.vaultUnlocked = true;
        state.config = await window.corexAPI.getConfig();
        state.inboxIssues = (await window.corexAPI.jiraSearchMyIssues()).issues;
        state.ticketLinks = await window.corexAPI.ticketLinksGet();
        state.awxRecentJobs = (await window.corexAPI.awxRecentJobs()).jobs || [];
        state.hwMetrics = (await window.corexAPI.dashboardGetMetrics());
        state.hwHistory = Array.from({length: 30}, (_, i) => ({ t: Date.now()-i*1000, cpuUser: 20+i%10, cpuSystem: 5, memUsed: 8e9, memTotal: 16e9 })).reverse();
        state.jiraMyself = (await window.corexAPI.jiraMyself()).me;
        state.slaAvailable = true;
        state.vaultStats = (await window.corexAPI.vaultStats()).stats;

        const views = ['inbox', 'jira', 'awx', 'templates', 'settings', 'corexterm', 'vscorex', 'vault'];
        for (const v of views) {
          state.view = v;
          renderApp();
          const html = document.getElementById('app').innerHTML;
          if (!html || html.length < 500) throw new Error('render vacío en vista ' + v);
          console.log('render OK:', v, '(' + html.length + ' chars)');
        }

        // Comprobaciones específicas del rediseño
        state.view = 'inbox';
        renderApp();
        const bodyHtml = document.getElementById('app').innerHTML;
        const checks = [
          ['sidebar Operate', bodyHtml.includes('Operate')],
          ['sidebar Vault item (real, sin Soon)', bodyHtml.includes('Vault') && !bodyHtml.includes('>Soon<')],
          ['topbar pills Jira Healthy', bodyHtml.includes('Healthy')],
          ['topbar Vault Unlocked', bodyHtml.includes('Unlocked')],
          ['KPI My Focus', bodyHtml.includes('My Focus')],
          ['KPI Automations 50%', bodyHtml.includes('50%')],
          ['KPI SLA At Risk', bodyHtml.includes('SLA At Risk')],
          ['SLA 12m en tabla', bodyHtml.includes('12m')],
          ['workspace bar', bodyHtml.includes('Workspace:')],
          ['add widget', bodyHtml.includes('+ Add Widget')],
          ['status bar global', bodyHtml.includes('SSH Session')],
          ['My Work table', bodyHtml.includes('My Work')],
          ['ticket ITSD-1 visible', bodyHtml.includes('ITSD-1')],
          ['linked automation pill', bodyHtml.includes('restart-service-linux')],
          ['user card real displayName', bodyHtml.includes('Nelson Perez')],
          ['avatar real image', bodyHtml.includes('data:image/png;base64')],
        ];
        state.view = 'vault';
        renderApp();
        const vaultHtml = document.getElementById('app').innerHTML;
        checks.push(['vault view: lock button', vaultHtml.includes('Lock vault now')]);
        checks.push(['vault view: inventory sessions', vaultHtml.includes('SSH sessions')]);
        checks.push(['vault view: missing secret warning', vaultHtml.includes('missing secret')]);
        checks.push(['vault view: cipher shown', vaultHtml.includes('AES-256-GCM')]);
        checks.push(['vault view: change password form', vaultHtml.includes('Change master password')]);
        checks.push(['vault sidebar item active (no Soon tag)', !vaultHtml.includes('>Soon<')]);

        // changeVaultPassword: validaciones y camino feliz
        state.vaultPwCurrent = 'oldpw'; state.vaultPwNew = 'short'; state.vaultPwConfirm = 'short';
        await changeVaultPassword();
        checks.push(['pw change rejects short password', state.vaultPwNew === 'short']); // no se limpió => rechazado
        state.vaultPwNew = 'newpassword1'; state.vaultPwConfirm = 'different1';
        await changeVaultPassword();
        checks.push(['pw change rejects mismatch', state.vaultPwNew === 'newpassword1']);
        state.vaultPwConfirm = 'newpassword1';
        await changeVaultPassword();
        checks.push(['pw change happy path clears fields', state.vaultPwNew === '' && state.vaultPwCurrent === '']);

        // lockVaultNow: confirm aceptado
        window.confirm = () => true;
        await lockVaultNow();
        checks.push(['lock: vaultUnlocked=false', state.vaultUnlocked === false]);
        checks.push(['lock: config limpiada', !state.config.jira.url]);
        checks.push(['lock: identidad limpiada', state.jiraMyself === null]);
        const gateHtml = document.getElementById('app').innerHTML;
        checks.push(['lock: vuelve al gate', gateHtml.toLowerCase().includes('master password') || gateHtml.includes('vault')]);

        let failed = 0;
        for (const [name, pass] of checks) {
          console.log((pass ? '  ✓ ' : '  ✗ ') + name);
          if (!pass) failed++;
        }
        if (failed) { console.error('FAILED checks:', failed); process.exit(1); }
        console.log('SMOKE TEST PASSED');
        process.exit(0);
      } catch (e) {
        console.error('SMOKE FAIL:', e && e.stack || e);
        process.exit(1);
      }
    })();
  `);
} catch (e) {
  console.error('EVAL FAIL:', e && e.stack || e);
  process.exit(1);
}
