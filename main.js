const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const si = require('systeminformation');
const crypto = require('crypto');
const { Client: SSHClient } = require('ssh2');
const simpleGit = require('simple-git');
// Windows + OneDrive/corporate profiles can leave Electron's default GPU/cache
// directory unwritable, which shows as Chromium cache errors followed by a
// black window. Put Chromium session/cache data in an explicit local writable
// directory before Chromium starts, without touching COREX's encrypted vault.
function configureChromiumCachePaths() {
  const base = process.platform === 'win32'
    ? (process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'))
    : app.getPath('userData');
  const sessionDataPath = path.join(base, 'COREX', 'ElectronSession');
  const diskCachePath = path.join(sessionDataPath, 'Cache');

  try {
    fs.mkdirSync(diskCachePath, { recursive: true });
    app.setPath('sessionData', sessionDataPath);
    app.commandLine.appendSwitch('disk-cache-dir', diskCachePath);
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
  } catch (e) {
    const fallbackSession = path.join(os.tmpdir(), 'corex-electron-session');
    const fallbackCache = path.join(fallbackSession, 'Cache');
    try {
      fs.mkdirSync(fallbackCache, { recursive: true });
      app.setPath('sessionData', fallbackSession);
      app.commandLine.appendSwitch('disk-cache-dir', fallbackCache);
      app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
      console.warn('[COREX] Using temporary Electron cache directory:', fallbackSession, e.message);
    } catch (fallbackErr) {
      console.warn('[COREX] Could not configure Electron cache directory:', fallbackErr.message);
    }
  }
}
configureChromiumCachePaths();

let pty;
try {
  pty = require('node-pty');
} catch (e) {
  // node-pty es un módulo nativo; si no está compilado para esta plataforma,
  // CorexTerm degrada con un mensaje claro en vez de petar toda la app.
  pty = null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Vault — almacenamiento cifrado único para AWX/Jira/SMTP/CorexTerm
// ═══════════════════════════════════════════════════════════════════════════
// Todo COREX se guarda como un solo blob cifrado (AES-256-GCM, clave derivada
// con PBKDF2 de 200k iteraciones a partir de la Master Password). La Master
// Password se pide al arrancar la app — antes de mostrar nada — y nunca se
// guarda en disco, solo vive en memoria del proceso mientras la app está
// abierta. Si se olvida, no hay recuperación posible: es la garantía de que
// el cifrado es real y no una puerta trasera disfrazada.
const VAULT_PATH = path.join(app.getPath('userData'), 'corex-vault.json');
const LEGACY_CONFIG_PATH = path.join(app.getPath('userData'), 'corex-config.json'); // pre-vault, texto plano
const LEGACY_SESSIONS_PATH = path.join(app.getPath('userData'), 'corex-sessions.json'); // pre-vault, cifrado por sesión
const PBKDF2_ITERATIONS = 200000;

let vaultKeyCache = null; // Buffer de 32 bytes derivado de la Master Password, solo en memoria
let vaultDataCache = null; // contenido descifrado del vault, solo en memoria mientras está unlocked

function defaultVaultData() {
  return {
    jira: {}, awx: {}, smtp: {}, lang: 'en', ticketLinks: {}, favoriteTemplates: [], templateUsage: {},
    ctSessions: [], ctMacros: [], automationTemplates: [], pendingAttachments: [],
  };
}

function vaultExists() {
  return fs.existsSync(VAULT_PATH);
}

function hasLegacyPlainConfig() {
  return fs.existsSync(LEGACY_CONFIG_PATH);
}

function encryptBlob(plaintextObj, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(plaintextObj), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { iv: iv.toString('hex'), authTag: authTag.toString('hex'), data: encrypted.toString('hex') };
}

function decryptBlob(payload, key) {
  const iv = Buffer.from(payload.iv, 'hex');
  const authTag = Buffer.from(payload.authTag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(payload.data, 'hex')), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

function persistVault() {
  if (!vaultKeyCache || !vaultDataCache) return { ok: false, error: 'Vault is locked' };
  const encrypted = encryptBlob(vaultDataCache, vaultKeyCache);
  const payload = JSON.stringify({ salt: vaultSaltHex, ...encrypted }, null, 2);

  // Escritura atómica: si esto se interrumpiera a mitad (cierre de la app,
  // corte de luz, etc.) con un writeFileSync directo sobre VAULT_PATH, el
  // archivo final podría quedar truncado y CORROMPER TODO el vault — no
  // solo el cambio en curso, sino todas las credenciales y sesiones SSH ya
  // guardadas. En su lugar: escribimos a un archivo temporal en el MISMO
  // directorio (el rename solo es atómico dentro del mismo filesystem) y
  // solo al final hacemos el rename — esa operación sí es atómica a nivel
  // de sistema operativo, así que el archivo final nunca queda en un
  // estado intermedio corrupto, pase lo que pase durante la escritura.
  const tmpPath = `${VAULT_PATH}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, payload, 'utf-8');
    fs.renameSync(tmpPath, VAULT_PATH);
    return { ok: true };
  } catch (e) {
    // Si algo falló a mitad, intentamos limpiar el temporal para no dejar
    // basura — pero NUNCA tocamos VAULT_PATH directamente en el error,
    // así que el vault anterior (el último bueno) sigue intacto en disco.
    try { fs.unlinkSync(tmpPath); } catch (cleanupErr) { /* el temporal puede no haberse llegado a crear */ }
    // Devolvemos el fallo en vez de lanzar: saveConfig() la llaman 13
    // handlers que hoy no tienen try/catch propio — un throw aquí se
    // propagaría como excepción no capturada en vez de un error legible.
    return { ok: false, error: e.message };
  }
}

let vaultSaltHex = null;

// Primera vez: no existe vault. Esta contraseña se convierte en la Master
// Password definitiva. Si hay config/sesiones del esquema viejo (pre-vault),
// las migramos al vault cifrado en el mismo paso.
function createVault(masterPassword) {
  const salt = crypto.randomBytes(16);
  vaultSaltHex = salt.toString('hex');
  vaultKeyCache = crypto.pbkdf2Sync(masterPassword, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  vaultDataCache = defaultVaultData();

  // Migración desde el esquema viejo, si existe.
  if (hasLegacyPlainConfig()) {
    try {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_CONFIG_PATH, 'utf-8'));
      vaultDataCache.jira = legacy.jira || {};
      vaultDataCache.awx = legacy.awx || {};
      vaultDataCache.smtp = legacy.smtp || {};
      vaultDataCache.lang = legacy.lang || 'en';
      vaultDataCache.ticketLinks = legacy.ticketLinks || {};
      vaultDataCache.favoriteTemplates = legacy.favoriteTemplates || [];
      vaultDataCache.templateUsage = legacy.templateUsage || {};
    } catch (e) { /* legacy config corrupto: arrancamos en blanco, no es bloqueante */ }
  }
  if (fs.existsSync(LEGACY_SESSIONS_PATH)) {
    try {
      const legacySessions = JSON.parse(fs.readFileSync(LEGACY_SESSIONS_PATH, 'utf-8'));
      // Las sesiones viejas estaban cifradas con SU PROPIA master password
      // (la de CorexTerm), distinta de la nueva. No podemos migrar los
      // secretos automáticamente sin pedir esa contraseña vieja también, así
      // que migramos solo la metadata visible y dejamos el secreto vacío —
      // el usuario tendrá que reintroducir la contraseña/clave de cada sesión.
      vaultDataCache.ctSessions = (legacySessions.sessions || []).map((s) => ({ ...s, secret: null, tunnel: s.tunnel ? { ...s.tunnel, secret: null } : undefined }));
    } catch (e) { /* ignore */ }
  }

  persistVault();
  return { migratedLegacy: hasLegacyPlainConfig() };
}

// Vault ya existe: probamos a descifrarlo con la contraseña dada.
function unlockVault(masterPassword) {
  const raw = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf-8'));
  const salt = Buffer.from(raw.salt, 'hex');
  const key = crypto.pbkdf2Sync(masterPassword, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  try {
    const decrypted = decryptBlob(raw, key);
    vaultKeyCache = key;
    vaultSaltHex = raw.salt;
    vaultDataCache = decrypted;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Incorrect master password' };
  }
}

function isVaultUnlocked() {
  return vaultKeyCache != null && vaultDataCache != null;
}

// loadConfig/saveConfig ahora leen/escriben sobre el vault descifrado en
// memoria — todo el resto del código (AWX, Jira, SMTP, favoritos...) sigue
// funcionando igual, solo cambia de dónde sale el dato.
function loadConfig() {
  if (!isVaultUnlocked()) return defaultVaultData();
  return vaultDataCache;
}

function saveConfig(cfg) {
  if (!isVaultUnlocked()) return { ok: false, error: 'Vault is locked' };
  vaultDataCache = { ...vaultDataCache, ...cfg };
  return persistVault();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 680,
    title: 'COREX',
    backgroundColor: '#0a0b0d',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'src/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  // Si el renderer crashea (OOM, fallo de Chromium, etc.) sin esto la
  // ventana se queda en blanco para siempre, sin ningún indicio de qué
  // pasó — el usuario vería COREX "congelado" sin entender por qué.
  // 'crashed'/'renderer-process-crashed' están eliminados en Electron
  // reciente; 'render-process-gone' es el reemplazo oficial. Intentamos
  // una recarga automática (el vault tiene que volver a desbloquearse,
  // pero al menos la app vuelve a responder en vez de quedar muerta).
  win.webContents.on('render-process-gone', (event, details) => {
    console.error('[COREX] Renderer process gone:', details.reason, details);
    if (details.reason !== 'clean-exit') {
      win.webContents.reload();
    }
  });

  // Si el renderer falla durante el rediseño visual, una ventana negra sin
  // DevTools no dice nada. Reenviamos errores de consola al proceso main para
  // que npm start muestre la causa real junto a los logs de Electron.
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[COREX renderer] ${sourceId}:${line} ${message}`);
  });
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[COREX] Failed to load renderer:', errorCode, errorDescription, validatedURL);
  });

  win.loadFile(path.join(__dirname, 'src/index.html'));
}

// Red de seguridad para el proceso main: si algo lanza una excepción que
// nadie capturó (un bug real en cualquiera de los ~80 handlers de IPC), por
// defecto Node mataría el proceso entero sin avisar — toda la app se
// cerraría de golpe, sin guardar nada, sin ningún mensaje. En vez de eso,
// lo logueamos para poder diagnosticarlo después. No reintentamos nada
// automáticamente aquí porque no sabemos en qué estado quedó la operación
// que falló — mejor un log claro que un intento de "seguir como si nada"
// que podría enmascarar corrupción de datos.
process.on('uncaughtException', (err) => {
  console.error('[COREX] Uncaught exception in main process:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[COREX] Unhandled rejection in main process:', reason);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Sin esto, al cerrar COREX las conexiones SSH se cortaban de forma
// abrupta (el socket simplemente se destruye junto al proceso) en vez de
// con un cierre limpio del protocolo — algunos servidores tardan en
// liberar esas sesiones colgadas hasta que expiran por timeout del lado
// del servidor. Y los procesos node-pty de los terminales locales podían
// quedar huérfanos en el sistema operativo, sin que nada los matara.
// 'before-quit' se dispara ANTES de que el proceso empiece a terminar —
// el momento correcto para hacer limpieza con la garantía de que todo
// (incluyendo Node, las conexiones de red) sigue completamente vivo.
app.on('before-quit', () => {
  console.log(`[COREX] Closing ${activeTerminals.size} terminal(s) and ${activeSftp.size} SFTP connection(s) before quit`);
  activeTerminals.forEach((entry) => closeTerminalEntry(entry));
  activeTerminals.clear();
  activeSftp.forEach((entry) => closeSftpEntry(entry));
  activeSftp.clear();
});

// ── Generic HTTP request helper (no external deps, works for Jira + AWX) ───
function httpRequest({ url, method = 'GET', headers = {}, body = null, rejectUnauthorized = true, timeoutMs = 20000, _redirectCount = 0 }) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      reject(new Error('URL inválida: ' + url));
      return;
    }
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;

    const options = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + (u.search || ''),
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      rejectUnauthorized,
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);

    const req = lib.request(options, (res) => {
      // Algunos servidores Jira/AWX on-prem redirigen (p.ej. al contexto /jira)
      // con 301/302/307/308. Los seguimos automáticamente hasta 3 veces, manteniendo
      // siempre https aunque el Location apunte a http (algunos balanceadores
      // internos lo hacen por error, pero la conexión saliente real sigue siendo https).
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && _redirectCount < 3) {
        res.resume(); // descarta el cuerpo de la redirección
        let nextUrl;
        try {
          nextUrl = new URL(res.headers.location, url);
          if (nextUrl.protocol === 'http:' && u.protocol === 'https:') nextUrl.protocol = 'https:';
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: null });
          return;
        }
        httpRequest({ url: nextUrl.toString(), method, headers, body, rejectUnauthorized, timeoutMs, _redirectCount: _redirectCount + 1 })
          .then(resolve, reject);
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    // Sin esto, una conexión que se cuelga sin error explícito (VPN caída a
    // mitad, firewall que descarta paquetes en silencio, servidor saturado
    // que nunca responde) nunca terminaba — la promesa quedaba pendiente
    // para siempre. Con el polling de listas cada 15s ya activo, eso podía
    // acumular conexiones colgadas sin límite. setTimeout en el socket HTTP
    // dispara el evento 'timeout', desde el cual destruimos la request
    // manualmente (eso es lo que realmente hace que 'error' se dispare con
    // un mensaje claro, en vez de quedarse colgada).
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

// Envoltorio de httpRequest con reintentos automáticos — SOLO para
// operaciones de LECTURA idempotentes (listar, buscar, leer estado).
// Nunca para escrituras (lanzar un job, comentar, transicionar, subir un
// adjunto): si la respuesta de "lanzar job" se pierde por un timeout justo
// después de que el servidor ya lo procesó, reintentar a ciegas podría
// ejecutar el mismo job dos veces — y muchos templates de AWX hacen cosas
// como borrar snapshots o modificar VMs, donde duplicar la ejecución no es
// solo molesto, es potencialmente dañino. Por eso esto es una función
// APARTE que cada handler debe llamar a propósito, nunca el comportamiento
// por defecto de httpRequest.
//
// Solo reintenta ante: errores de red reales (timeout, conexión rechazada)
// o códigos 502/503/504 (problema transitorio del servidor). NUNCA ante
// 401/403/404/cualquier 4xx — esos no se arreglan reintentando, son
// errores del propio request, no del transporte.
async function httpRequestWithRetry(opts, maxRetries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await httpRequest(opts);
      if ([502, 503, 504].includes(res.status) && attempt < maxRetries) {
        await sleepWithJitter(attempt);
        continue;
      }
      return res;
    } catch (e) {
      lastError = e;
      if (isNetworkErrorException(e) && attempt < maxRetries) {
        await sleepWithJitter(attempt);
        continue;
      }
      throw e; // error no reintentable, o ya se acabaron los intentos
    }
  }
  throw lastError;
}

// Backoff exponencial con jitter: 500ms/1000ms/2000ms ± hasta 30% aleatorio
// — el jitter evita que, si varias peticiones fallan a la vez (por ejemplo
// las 3 del polling simultáneo), todas reintenten en el mismo instante
// exacto y vuelvan a golpear al servidor de golpe otra vez.
function sleepWithJitter(attempt) {
  const base = 500 * Math.pow(2, attempt);
  const jitter = base * 0.3 * Math.random();
  return new Promise((resolve) => setTimeout(resolve, base + jitter));
}

// Único punto que genera la respuesta de error para 401/403 — antes cada
// handler construía su propio string de error a mano, y el frontend no
// tenía forma fiable de distinguir "credenciales caducadas, hay que volver
// a Settings" de "fallo de red transitorio" sin parsear el texto del
// mensaje (frágil: si el texto cambia en un sitio y no en otro, se rompe
// la detección). isAuthError es un campo explícito que el frontend puede
// comprobar directamente, sin adivinar nada a partir de un string.
function authErrorResponse(status) {
  return { ok: false, error: `Authentication failed (HTTP ${status}) — check your credentials in Settings`, isAuthError: true };
}

// Mismo concepto que authErrorResponse, pero para fallos de CONEXIÓN real
// (timeout, DNS que no resuelve, conexión rechazada) — distinto de un error
// HTTP normal (el servidor sí respondió, solo que con un código de error).
// Sin esto, el frontend no podía distinguir "no hay red/VPN caída" de
// "Jira devolvió un 500" a partir del e.message crudo, que varía según el
// tipo exacto de fallo de Node (ECONNREFUSED, ETIMEDOUT, ENOTFOUND...).
const NETWORK_ERROR_CODES = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'];
function isNetworkErrorException(e) {
  if (e && NETWORK_ERROR_CODES.includes(e.code)) return true;
  if (e && typeof e.message === 'string' && e.message.includes('timed out')) return true; // nuestro propio mensaje de req.setTimeout
  return false;
}
function networkErrorResponse(e) {
  return { ok: false, error: e.message, isNetworkError: true };
}

// ── Config ───────────────────────────────────────────────────────────────
ipcMain.handle('config:get', async () => loadConfig());

ipcMain.handle('config:set', async (event, partial) => {
  const cfg = loadConfig();
  const merged = { ...cfg, ...partial };
  saveConfig(merged);
  return merged;
});

// ── Vínculos Ticket ↔ Job Template ──────────────────────────────────────
// El usuario decide a ojo qué tickets son "de AWX" (no hay regla automática
// fiable en Jira para esto). Una vez decide, lo recordamos: la próxima vez
// que abra ese ticket, COREX ya sabe qué template sugerirle.
ipcMain.handle('ticketLinks:get', async () => {
  const cfg = loadConfig();
  return cfg.ticketLinks || {};
});

ipcMain.handle('ticketLinks:set', async (event, { key, templateId, templateName }) => {
  const cfg = loadConfig();
  cfg.ticketLinks = cfg.ticketLinks || {};
  cfg.ticketLinks[key] = { templateId, templateName, linkedAt: new Date().toISOString() };
  saveConfig(cfg);
  return cfg.ticketLinks;
});

ipcMain.handle('ticketLinks:remove', async (event, { key }) => {
  const cfg = loadConfig();
  cfg.ticketLinks = cfg.ticketLinks || {};
  delete cfg.ticketLinks[key];
  saveConfig(cfg);
  return cfg.ticketLinks;
});

// ── Favoritos de Job Templates (marca manual, independiente del uso) ───────
ipcMain.handle('favorites:get', async () => {
  const cfg = loadConfig();
  return cfg.favoriteTemplates || [];
});

ipcMain.handle('favorites:toggle', async (event, { templateId }) => {
  const cfg = loadConfig();
  cfg.favoriteTemplates = cfg.favoriteTemplates || [];
  const idx = cfg.favoriteTemplates.indexOf(templateId);
  if (idx >= 0) cfg.favoriteTemplates.splice(idx, 1);
  else cfg.favoriteTemplates.push(templateId);
  saveConfig(cfg);
  return cfg.favoriteTemplates;
});

ipcMain.handle('templateUsage:get', async () => {
  const cfg = loadConfig();
  return cfg.templateUsage || {};
});

// ── AWX ──────────────────────────────────────────────────────────────────
function awxAuthHeader(awx) {
  // Algunos usuarios no pueden generar tokens (sin permiso en AWX), así que
  // soportamos también Basic Auth con usuario/contraseña como alternativa.
  if (awx.authType === 'basic') {
    const basic = Buffer.from(`${awx.username}:${awx.password}`).toString('base64');
    return { Authorization: `Basic ${basic}` };
  }
  return { Authorization: `Bearer ${awx.token}` };
}

function awxConfigured(awx) {
  if (!awx || !awx.url) return false;
  if (awx.authType === 'basic') return !!(awx.username && awx.password);
  return !!awx.token;
}

// List job templates the user can see
ipcMain.handle('awx:listJobTemplates', async () => {
  const { awx } = loadConfig();
  if (!awxConfigured(awx)) return { ok: false, error: 'AWX no configurado' };
  try {
    const res = await httpRequestWithRetry({
      url: `${awx.url.replace(/\/$/, '')}/api/v2/job_templates/?page_size=200`,
      headers: awxAuthHeader(awx),
      rejectUnauthorized: awx.verifySsl !== false,
    });
    if (res.status === 401 || res.status === 403) return authErrorResponse(res.status);
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, results: (res.body && res.body.results) || [] };
  } catch (e) {
    return isNetworkErrorException(e) ? networkErrorResponse(e) : { ok: false, error: e.message };
  }
});

// Surveys: muchos templates exigen responder preguntas antes de poder lanzarse.
// Sin esto, el launch falla en el momento de ejecutar en vez de antes.
ipcMain.handle('awx:getSurveySpec', async (event, { templateId }) => {
  const { awx } = loadConfig();
  if (!awxConfigured(awx)) return { ok: false, error: 'AWX no configurado' };
  try {
    const res = await httpRequest({
      url: `${awx.url.replace(/\/$/, '')}/api/v2/job_templates/${templateId}/survey_spec/`,
      headers: awxAuthHeader(awx),
      rejectUnauthorized: awx.verifySsl !== false,
    });
    if (res.status === 404) return { ok: true, spec: null }; // sin survey configurado
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, spec: res.body };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Instance groups disponibles para asignar al lanzar (paso "Instance Groups" del wizard).
// AWX permite elegir entre TODOS los instance groups de la organización, no solo los
// que el template ya tenga preasignados — por eso pedimos el listado global.
ipcMain.handle('awx:listInstanceGroups', async () => {
  const { awx } = loadConfig();
  if (!awxConfigured(awx)) return { ok: false, error: 'AWX no configurado' };
  try {
    const res = await httpRequest({
      url: `${awx.url.replace(/\/$/, '')}/api/v2/instance_groups/?page_size=200`,
      headers: awxAuthHeader(awx),
      rejectUnauthorized: awx.verifySsl !== false,
    });
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, results: (res.body && res.body.results) || [] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Inventories y credentials disponibles, para el paso "Other Prompts" cuando el
// template permite elegirlos en el momento de lanzar (ask_inventory_on_launch,
// ask_credential_on_launch).
ipcMain.handle('awx:listInventories', async () => {
  const { awx } = loadConfig();
  if (!awxConfigured(awx)) return { ok: false, error: 'AWX no configurado' };
  try {
    const res = await httpRequest({
      url: `${awx.url.replace(/\/$/, '')}/api/v2/inventories/?page_size=200`,
      headers: awxAuthHeader(awx),
      rejectUnauthorized: awx.verifySsl !== false,
    });
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, results: (res.body && res.body.results) || [] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('awx:listCredentials', async () => {
  const { awx } = loadConfig();
  if (!awxConfigured(awx)) return { ok: false, error: 'AWX no configurado' };
  try {
    const res = await httpRequest({
      url: `${awx.url.replace(/\/$/, '')}/api/v2/credentials/?page_size=200`,
      headers: awxAuthHeader(awx),
      rejectUnauthorized: awx.verifySsl !== false,
    });
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, results: (res.body && res.body.results) || [] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('awx:listExecutionEnvironments', async () => {
  const { awx } = loadConfig();
  if (!awxConfigured(awx)) return { ok: false, error: 'AWX no configurado' };
  try {
    const res = await httpRequest({
      url: `${awx.url.replace(/\/$/, '')}/api/v2/execution_environments/?page_size=200`,
      headers: awxAuthHeader(awx),
      rejectUnauthorized: awx.verifySsl !== false,
    });
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, results: (res.body && res.body.results) || [] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Launch a job template, optionally passing extra_vars (e.g. { ticket: "OPS-1234" })
ipcMain.handle('awx:launchJob', async (event, { templateId, extraVars, launchOptions }) => {
  const { awx } = loadConfig();
  if (!awxConfigured(awx)) return { ok: false, error: 'AWX no configurado' };
  try {
    const body = { ...(launchOptions || {}) };
    if (extraVars) body.extra_vars = extraVars;

    const res = await httpRequest({
      url: `${awx.url.replace(/\/$/, '')}/api/v2/job_templates/${templateId}/launch/`,
      method: 'POST',
      headers: awxAuthHeader(awx),
      body,
      rejectUnauthorized: awx.verifySsl !== false,
    });
    if (res.status === 401 || res.status === 403) return authErrorResponse(res.status);
    if (res.status >= 400) {
      return { ok: false, error: `HTTP ${res.status}: ${JSON.stringify(res.body)}` };
    }
    // Registrar uso para el contador "veces lanzado" (no afecta orden salvo que el usuario lo decida)
    const cfg = loadConfig();
    cfg.templateUsage = cfg.templateUsage || {};
    cfg.templateUsage[templateId] = (cfg.templateUsage[templateId] || 0) + 1;
    saveConfig(cfg);
    return { ok: true, job: res.body };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Poll a job's status
ipcMain.handle('awx:getJob', async (event, { jobId }) => {
  const { awx } = loadConfig();
  if (!awxConfigured(awx)) return { ok: false, error: 'AWX no configurado' };
  try {
    const res = await httpRequestWithRetry({
      url: `${awx.url.replace(/\/$/, '')}/api/v2/jobs/${jobId}/`,
      headers: awxAuthHeader(awx),
      rejectUnauthorized: awx.verifySsl !== false,
    });
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, job: res.body };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Fetch plaintext stdout of a finished/running job
ipcMain.handle('awx:getJobStdout', async (event, { jobId }) => {
  const { awx } = loadConfig();
  if (!awxConfigured(awx)) return { ok: false, error: 'AWX no configurado' };
  try {
    const res = await httpRequestWithRetry({
      url: `${awx.url.replace(/\/$/, '')}/api/v2/jobs/${jobId}/stdout/?format=txt`,
      headers: awxAuthHeader(awx),
      rejectUnauthorized: awx.verifySsl !== false,
    });
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, stdout: typeof res.body === 'string' ? res.body : JSON.stringify(res.body) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Historial completo de ejecuciones de un template (no solo los últimos 10 que
// ya vienen en recent_jobs). Paginado: la página 1 trae los más recientes primero.
ipcMain.handle('awx:getTemplateJobHistory', async (event, { templateId, page }) => {
  const { awx } = loadConfig();
  if (!awxConfigured(awx)) return { ok: false, error: 'AWX no configurado' };
  try {
    const pageNum = page || 1;
    const res = await httpRequest({
      url: `${awx.url.replace(/\/$/, '')}/api/v2/job_templates/${templateId}/jobs/?order_by=-created&page=${pageNum}&page_size=20`,
      headers: awxAuthHeader(awx),
      rejectUnauthorized: awx.verifySsl !== false,
    });
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}` };
    return {
      ok: true,
      jobs: (res.body && res.body.results) || [],
      count: (res.body && res.body.count) || 0,
      hasNext: !!(res.body && res.body.next),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Jobs recientes de TODOS los templates — para la vista principal de AWX,
// a diferencia de getTemplateJobHistory que es por un template concreto.
ipcMain.handle('awx:getRecentJobs', async (event, { limit }) => {
  const { awx } = loadConfig();
  if (!awxConfigured(awx)) return { ok: false, error: 'AWX no configurado' };
  try {
    const pageSize = limit || 8;
    const res = await httpRequestWithRetry({
      url: `${awx.url.replace(/\/$/, '')}/api/v2/jobs/?order_by=-created&page_size=${pageSize}`,
      headers: awxAuthHeader(awx),
      rejectUnauthorized: awx.verifySsl !== false,
    });
    if (res.status === 401 || res.status === 403) return authErrorResponse(res.status);
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, jobs: (res.body && res.body.results) || [] };
  } catch (e) {
    return isNetworkErrorException(e) ? networkErrorResponse(e) : { ok: false, error: e.message };
  }
});

// ── Jira ─────────────────────────────────────────────────────────────────
function jiraAuthHeader(jira) {
  // Supports either API token (Cloud: email+token) or PAT (Server/DC: bearer)
  if (jira.authType === 'bearer') {
    return { Authorization: `Bearer ${jira.token}` };
  }
  const basic = Buffer.from(`${jira.email}:${jira.token}`).toString('base64');
  return { Authorization: `Basic ${basic}` };
}

ipcMain.handle('jira:getIssue', async (event, { key }) => {
  const { jira } = loadConfig();
  if (!jira || !jira.url || !jira.token) return { ok: false, error: 'Jira no configurado' };
  try {
    const res = await httpRequest({
      url: `${jira.url.replace(/\/$/, '')}/rest/api/2/issue/${key}?expand=names&properties=*all`,
      headers: jiraAuthHeader(jira),
      rejectUnauthorized: jira.verifySsl !== false,
    });
    if (res.status === 401 || res.status === 403) return authErrorResponse(res.status);
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}` };

    // El campo comment.comments embebido en el issue NUNCA trae las
    // propiedades de cada comentario (confirmado con datos reales: 22
    // comentarios de un ticket real, ninguno con properties, incluso con
    // ?properties=*all activo) — properties=*all aplica a propiedades del
    // ISSUE, no se propaga a comentarios anidados. El parámetro correcto
    // para esto es expand=properties, pero solo existe en el endpoint
    // DEDICADO de comentarios (GET /issue/{key}/comment), no en el
    // embebido. Por eso hacemos una segunda llamada y fusionamos el
    // resultado — sin esto, nunca podríamos saber qué comentarios son
    // internos vs públicos.
    if (res.body && res.body.fields && res.body.fields.comment) {
      try {
        const commentsRes = await httpRequest({
          url: `${jira.url.replace(/\/$/, '')}/rest/api/2/issue/${key}/comment?expand=properties`,
          headers: jiraAuthHeader(jira),
          rejectUnauthorized: jira.verifySsl !== false,
        });
        if (commentsRes.status < 400 && commentsRes.body && commentsRes.body.comments) {
          res.body.fields.comment.comments = commentsRes.body.comments;
        }
      } catch (e) {
        // Si esta segunda llamada falla, seguimos con los comentarios sin
        // properties (el comportamiento de antes) en vez de tumbar toda
        // la carga del ticket por un fallo en un enriquecimiento opcional.
      }
    }

    return { ok: true, issue: res.body };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Lista los tickets asignados al usuario actual (sin resolver, los más recientes primero).
// Usamos JQL con currentUser() para no tener que saber/guardar tu username de Jira.
ipcMain.handle('jira:searchMyIssues', async () => {
  const { jira } = loadConfig();
  if (!jira || !jira.url || !jira.token) return { ok: false, error: 'Jira no configurado' };
  try {
    const jql = encodeURIComponent('assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC');
    const fields = encodeURIComponent('summary,status,priority,updated,issuetype,components,parent');
    const res = await httpRequestWithRetry({
      url: `${jira.url.replace(/\/$/, '')}/rest/api/2/search?jql=${jql}&fields=${fields}&maxResults=100`,
      headers: jiraAuthHeader(jira),
      rejectUnauthorized: jira.verifySsl !== false,
    });
    if (res.status === 401 || res.status === 403) return authErrorResponse(res.status);
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}: ${JSON.stringify(res.body)}` };
    return { ok: true, issues: (res.body && res.body.issues) || [] };
  } catch (e) {
    return isNetworkErrorException(e) ? networkErrorResponse(e) : { ok: false, error: e.message };
  }
});

ipcMain.handle('jira:addComment', async (event, { key, body, internal }) => {
  const { jira } = loadConfig();
  if (!jira || !jira.url || !jira.token) return { ok: false, error: 'Jira no configurado' };
  try {
    // En proyectos Jira Service Desk/Service Management, un comentario
    // "interno" (invisible para el solicitante en el portal) no usa el
    // mecanismo genérico de visibility por rol — eso solo restringe por
    // rol/grupo dentro de Jira, pero el cliente seguiría sin verlo de
    // todas formas porque los clientes de portal no tienen rol Jira. El
    // mecanismo correcto es la propiedad sd.public.comment con
    // internal:true, documentada para Service Desk Server/DC.
    const payload = { body };
    if (internal) {
      payload.properties = [{ key: 'sd.public.comment', value: { internal: true } }];
    }
    const res = await httpRequest({
      url: `${jira.url.replace(/\/$/, '')}/rest/api/2/issue/${key}/comment`,
      method: 'POST',
      headers: jiraAuthHeader(jira),
      body: payload,
      rejectUnauthorized: jira.verifySsl !== false,
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: `HTTP ${res.status}: sin permiso para comentar (ver rol Service Desk Agent)`, isAuthError: true };
    }
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}: ${JSON.stringify(res.body)}` };
    return { ok: true, comment: res.body };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Attach a file (e.g. HTML report) to a Jira issue. Jira requires multipart/form-data
// with the header X-Atlassian-Token: no-check, so we build the multipart body manually
// to avoid extra dependencies.
ipcMain.handle('jira:addAttachment', async (event, { key, filename, contentBase64 }) => {
  const { jira } = loadConfig();
  if (!jira || !jira.url || !jira.token) return { ok: false, error: 'Jira no configurado' };

  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(`${jira.url.replace(/\/$/, '')}/rest/api/2/issue/${key}/attachments`);
    } catch (e) {
      resolve({ ok: false, error: 'URL de Jira inválida' });
      return;
    }
    const boundary = '----CorexBoundary' + Date.now();
    const fileBuffer = Buffer.from(contentBase64, 'base64');

    const prePart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/html\r\n\r\n`
    );
    const postPart = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([prePart, fileBuffer, postPart]);

    const lib = u.protocol === 'https:' ? https : http;
    const authHeader = jiraAuthHeader(jira);

    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname,
        method: 'POST',
        headers: {
          ...authHeader,
          'X-Atlassian-Token': 'no-check',
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
        rejectUnauthorized: jira.verifySsl !== false,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed = null;
          try { parsed = data ? JSON.parse(data) : null; } catch (e) { parsed = data; }
          if (res.statusCode === 401 || res.statusCode === 403) {
            resolve({ ok: false, error: `HTTP ${res.statusCode}: sin permiso para adjuntar archivos` });
            return;
          }
          if (res.statusCode >= 400) {
            resolve({ ok: false, error: `HTTP ${res.statusCode}: ${JSON.stringify(parsed)}` });
            return;
          }
          resolve({ ok: true, attachment: parsed });
        });
      }
    );
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.write(body);
    req.end();
  });
});

// Descarga binaria — a diferencia de httpRequest (que acumula la respuesta
// como string y corrompe contenido no-UTF8), esta acumula Buffers reales,
// imprescindible para imágenes/PDFs/zips adjuntos a un ticket.
function httpDownloadBinary({ url, headers = {}, rejectUnauthorized = true, _redirectCount = 0 }) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      reject(new Error('URL inválida: ' + url));
      return;
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + (u.search || ''), method: 'GET', headers, rejectUnauthorized },
      (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && _redirectCount < 3) {
          res.resume();
          const nextUrl = new URL(res.headers.location, url);
          httpDownloadBinary({ url: nextUrl.toString(), headers, rejectUnauthorized, _redirectCount: _redirectCount + 1 }).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) }));
      }
    );
    req.on('error', (err) => reject(err));
    req.end();
  });
}

ipcMain.handle('jira:downloadAttachment', async (event, { url, suggestedName }) => {
  const { jira } = loadConfig();
  if (!jira || !jira.url || !jira.token) return { ok: false, error: 'Jira no configurado' };
  try {
    const { filePath, canceled } = await dialog.showSaveDialog({ defaultPath: suggestedName || 'attachment' });
    if (canceled || !filePath) return { ok: false, canceled: true };

    const res = await httpDownloadBinary({
      url,
      headers: jiraAuthHeader(jira),
      rejectUnauthorized: jira.verifySsl !== false,
    });
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}` };
    fs.writeFileSync(filePath, res.buffer);
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Descarga el thumbnail de un adjunto (URL propia que Jira ya expone aparte
// de la imagen completa) y lo devuelve como base64 — para pintarlo inline
// en el detalle del ticket, sin pasar por un diálogo de guardado como hace
// la descarga completa.
ipcMain.handle('jira:fetchThumbnail', async (event, { url, mimeType }) => {
  const { jira } = loadConfig();
  if (!jira || !jira.url || !jira.token) return { ok: false, error: 'Jira no configurado' };
  try {
    const res = await httpDownloadBinary({
      url,
      headers: jiraAuthHeader(jira),
      rejectUnauthorized: jira.verifySsl !== false,
    });
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, dataUrl: `data:${mimeType || 'image/png'};base64,${res.buffer.toString('base64')}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Email (SMTP ya configurado por el usuario) ──────────────────────────
ipcMain.handle('mail:send', async (event, { to, subject, html, attachFilename }) => {
  const { smtp } = loadConfig();
  if (!smtp || !smtp.host) return { ok: false, error: 'SMTP no configurado' };
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port || 587,
      secure: !!smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      tls: smtp.verifySsl === false ? { rejectUnauthorized: false } : undefined,
    });
    const info = await transporter.sendMail({
      from: smtp.from || smtp.user,
      to,
      subject,
      html,
      attachments: attachFilename
        ? [{ filename: attachFilename, content: html, contentType: 'text/html' }]
        : [],
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── File / clipboard helpers (heredados de ReportGen) ───────────────────
ipcMain.handle('save-markdown', async (event, { content, defaultName }) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Guardar reporte',
    defaultPath: defaultName || 'report.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (canceled || !filePath) return { success: false };
  fs.writeFileSync(filePath, content, 'utf-8');
  return { success: true, filePath };
});

ipcMain.handle('save-html', async (event, { content, defaultName }) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Guardar reporte HTML',
    defaultPath: defaultName || 'report.html',
    filters: [{ name: 'HTML', extensions: ['html'] }],
  });
  if (canceled || !filePath) return { success: false };
  fs.writeFileSync(filePath, content, 'utf-8');
  return { success: true, filePath };
});

ipcMain.handle('copy-clipboard', async (event, { content }) => {
  clipboard.writeText(content);
  return { success: true };
});

// ── Dashboard: métricas de hardware local ───────────────────────────────────
// Una sola llamada agregada (en vez de 6 IPC separadas) porque el renderer
// va a refrescar esto cada pocos segundos — más barato así.
ipcMain.handle('dashboard:getMetrics', async () => {
  try {
    const [cpuLoad, mem, cpuTemp, battery, fsSize, netStats, processes, cpuInfo] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.cpuTemperature(),
      si.battery(),
      si.fsSize(),
      si.networkStats(),
      si.processes(),
      si.cpu(),
    ]);

    const topProcesses = processes.list
      .slice()
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 8)
      .map((p) => ({ name: p.name, pid: p.pid, cpu: p.cpu, mem: p.mem }));

    // Filtramos sistemas de archivos virtuales/de red poco útiles para el usuario
    // (montajes de red, overlays, tmpfs...) — nos quedamos con discos físicos reales.
    const disks = fsSize
      .filter((d) => d.size > 0 && !/^(rclone|overlay|tmpfs|squashfs|proc|sysfs|devtmpfs)/i.test(d.type || d.fs || ''))
      .map((d) => ({ fs: d.fs, mount: d.mount, use: d.use, size: d.size, used: d.used }));

    const netTotal = netStats.reduce(
      (acc, n) => ({ rx_sec: acc.rx_sec + (n.rx_sec || 0), tx_sec: acc.tx_sec + (n.tx_sec || 0) }),
      { rx_sec: 0, tx_sec: 0 }
    );

    return {
      ok: true,
      cpu: {
        load: cpuLoad.currentLoad,
        user: cpuLoad.currentLoadUser,
        system: cpuLoad.currentLoadSystem,
        cores: cpuLoad.cpus ? cpuLoad.cpus.map((c) => c.load) : [],
        brand: cpuInfo.brand,
        speed: cpuInfo.speed,
      },
      mem: { total: mem.total, used: mem.active, free: mem.available },
      temp: { main: cpuTemp.main, cores: cpuTemp.cores || [] },
      battery: { hasBattery: battery.hasBattery, percent: battery.percent, isCharging: battery.isCharging },
      disks,
      net: netTotal,
      topProcesses,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  CorexTerm — IPC handlers: master password, sesiones, SSH, SFTP, terminal
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
//  Vault — IPC handlers de desbloqueo (pedido al arrancar la app entera)
// ═══════════════════════════════════════════════════════════════════════════

ipcMain.handle('vault:exists', async () => {
  return { exists: vaultExists() };
});

ipcMain.handle('vault:unlock', async (event, { masterPassword }) => {
  if (!vaultExists()) {
    const res = createVault(masterPassword);
    return { ok: true, firstTime: true, migratedLegacy: res.migratedLegacy };
  }
  const res = unlockVault(masterPassword);
  return { ...res, firstTime: false };
});

ipcMain.handle('vault:isUnlocked', async () => {
  return { unlocked: isVaultUnlocked() };
});

// ═══════════════════════════════════════════════════════════════════════════
//  CorexTerm — IPC handlers: sesiones, SSH, SFTP, terminal
// ═══════════════════════════════════════════════════════════════════════════
// Los secretos de las sesiones ya no se cifran individualmente — viven en
// texto plano DENTRO del vault, que en sí mismo está cifrado en disco como un
// solo blob. Es el mismo nivel de protección, con un solo punto de cifrado.

// ── Sesiones guardadas ───────────────────────────────────────────────────
// Listamos sin los secretos — la lista solo trae metadata (host, usuario,
// tipo de auth, tunnel) para pintar la UI. El secreto se usa solo al conectar.
ipcMain.handle('corexterm:listSessions', async () => {
  const cfg = loadConfig();
  const sessions = cfg.ctSessions || [];
  return {
    ok: true,
    sessions: sessions.map((s) => ({
      id: s.id,
      name: s.name,
      host: s.host,
      port: s.port,
      username: s.username,
      authType: s.authType, // 'password' | 'key'
      hasTunnel: !!s.tunnel,
      tunnel: s.tunnel ? { host: s.tunnel.host, port: s.tunnel.port, username: s.tunnel.username, authType: s.tunnel.authType } : null,
      color: s.color || null,
      folder: s.folder || null,
    })),
  };
});

ipcMain.handle('corexterm:saveSession', async (event, { session }) => {
  if (!isVaultUnlocked()) return { ok: false, error: 'Vault is locked' };
  const cfg = loadConfig();
  cfg.ctSessions = cfg.ctSessions || [];
  const id = session.id || crypto.randomUUID();
  const existing = cfg.ctSessions.find((s) => s.id === id);

  const stored = {
    id,
    name: session.name,
    host: session.host,
    port: session.port || 22,
    username: session.username,
    authType: session.authType, // 'password' | 'key'
    color: session.color || null,
    folder: session.folder || null,
    // Si no se proporciona un secreto nuevo (p.ej. al editar sin tocar la
    // contraseña), conservamos el que ya hubiera.
    secret: session.secret || (existing ? existing.secret : null),
  };
  if (session.authType === 'key') {
    stored.keyPath = session.keyPath || (existing ? existing.keyPath : '');
  }

  if (session.tunnel) {
    stored.tunnel = {
      host: session.tunnel.host,
      port: session.tunnel.port || 22,
      username: session.tunnel.username,
      authType: session.tunnel.authType,
      keyPath: session.tunnel.authType === 'key' ? (session.tunnel.keyPath || (existing && existing.tunnel ? existing.tunnel.keyPath : '')) : undefined,
      secret: session.tunnel.secret || (existing && existing.tunnel ? existing.tunnel.secret : null),
    };
  }

  const idx = cfg.ctSessions.findIndex((s) => s.id === id);
  if (idx >= 0) cfg.ctSessions[idx] = stored;
  else cfg.ctSessions.push(stored);
  const saveRes = saveConfig(cfg);
  if (!saveRes.ok) return { ok: false, error: `Could not save to disk: ${saveRes.error}` };
  return { ok: true, id };
});

ipcMain.handle('corexterm:deleteSession', async (event, { id }) => {
  const cfg = loadConfig();
  cfg.ctSessions = (cfg.ctSessions || []).filter((s) => s.id !== id);
  saveConfig(cfg);
  return { ok: true };
});

// ── Macros ───────────────────────────────────────────────────────────────
// Guardadas dentro del vault (no en texto plano) porque una macro grabada
// puede incluir cualquier cosa que se haya tecleado, incluida información
// sensible (rutas internas, nombres de usuario, fragmentos de comandos con
// secretos pegados por error, etc).
ipcMain.handle('corexterm:listMacros', async () => {
  const cfg = loadConfig();
  return { ok: true, macros: cfg.ctMacros || [] };
});

ipcMain.handle('corexterm:saveMacro', async (event, { macro }) => {
  if (!isVaultUnlocked()) return { ok: false, error: 'Vault is locked' };
  const cfg = loadConfig();
  cfg.ctMacros = cfg.ctMacros || [];
  const id = macro.id || crypto.randomUUID();
  const stored = { id, name: macro.name, keys: macro.keys };
  const idx = cfg.ctMacros.findIndex((m) => m.id === id);
  if (idx >= 0) cfg.ctMacros[idx] = stored;
  else cfg.ctMacros.push(stored);
  saveConfig(cfg);
  return { ok: true, id };
});

ipcMain.handle('corexterm:deleteMacro', async (event, { id }) => {
  const cfg = loadConfig();
  cfg.ctMacros = (cfg.ctMacros || []).filter((m) => m.id !== id);
  saveConfig(cfg);
  return { ok: true };
});

function getDecryptedSession(id) {
  const cfg = loadConfig();
  const session = (cfg.ctSessions || []).find((s) => s.id === id);
  return session || null;
}

// ── Conexión SSH + shell interactivo (vía node-pty si está disponible) ───
// Mapa de sesiones activas: sessionKey -> { sshClient, stream, ptyProcess }
const activeTerminals = new Map();

function buildSSHConnectConfig(sessionData) {
  const cfg = {
    host: sessionData.host,
    port: sessionData.port || 22,
    username: sessionData.username,
    readyTimeout: 15000,
  };
  if (sessionData.authType === 'key') {
    cfg.privateKey = fs.readFileSync(sessionData.keyPath);
    if (sessionData.secret) cfg.passphrase = sessionData.secret;
  } else {
    cfg.password = sessionData.secret;
  }
  return cfg;
}

ipcMain.handle('corexterm:connect', async (event, { sessionId, terminalId, cols, rows }) => {
  if (!isVaultUnlocked()) return { ok: false, error: 'Vault is locked' };
  if (!pty) return { ok: false, error: 'node-pty is not available on this platform/build. See setup instructions.' };

  try {
    const sessionData = getDecryptedSession(sessionId);
    if (!sessionData) return { ok: false, error: 'Session not found' };

    const conn = new SSHClient();
    const connectConfig = buildSSHConnectConfig(sessionData);

    // Soporte de proxy jump / túnel: si hay un host intermedio configurado,
    // primero conectamos a ese, y desde ahí abrimos un canal hacia el destino
    // real en vez de conectar directo.
    const finalConnect = (targetConfig, sock) => {
      return new Promise((resolve, reject) => {
        const targetConn = sock ? new SSHClient() : conn;
        const cfg = sock ? { ...targetConfig, sock } : targetConfig;
        targetConn.on('ready', () => resolve(targetConn));
        targetConn.on('error', (err) => reject(err));
        targetConn.connect(cfg);
      });
    };

    let sshConn;
    if (sessionData.tunnel) {
      const jumpConn = new SSHClient();
      const jumpConfig = {
        host: sessionData.tunnel.host,
        port: sessionData.tunnel.port || 22,
        username: sessionData.tunnel.username,
        readyTimeout: 15000,
      };
      if (sessionData.tunnel.authType === 'key') {
        jumpConfig.privateKey = fs.readFileSync(sessionData.tunnel.keyPath);
        if (sessionData.tunnel.secret) jumpConfig.passphrase = sessionData.tunnel.secret;
      } else {
        jumpConfig.password = sessionData.tunnel.secret;
      }

      await new Promise((resolve, reject) => {
        jumpConn.on('ready', resolve);
        jumpConn.on('error', reject);
        jumpConn.connect(jumpConfig);
      });

      const sock = await new Promise((resolve, reject) => {
        jumpConn.forwardOut('127.0.0.1', 0, sessionData.host, sessionData.port || 22, (err, stream) => {
          if (err) reject(err);
          else resolve(stream);
        });
      });

      sshConn = await finalConnect(connectConfig, sock);
      activeTerminals.set(terminalId, { jumpConn, sshConn });
    } else {
      sshConn = await finalConnect(connectConfig, null);
      activeTerminals.set(terminalId, { sshConn });
    }

    // Shell interactivo sobre el canal SSH — el PTY remoto lo gestiona el
    // propio servidor SSH (sshConn.shell() lo solicita), node-pty no
    // interviene aquí: solo hace falta para procesos LOCALES (ver
    // corexterm:connectLocal más abajo).
    sshConn.shell({ term: 'xterm-256color', cols: cols || 80, rows: rows || 24 }, (err, stream) => {
      if (err) {
        activeTerminals.delete(terminalId);
        event.sender.send('corexterm:error', { terminalId, error: err.message });
        return;
      }
      const entry = activeTerminals.get(terminalId);
      entry.stream = stream;
      entry.kind = 'ssh';

      stream.on('data', (data) => {
        event.sender.send('corexterm:data', { terminalId, data: data.toString('utf8') });
      });
      stream.on('close', () => {
        event.sender.send('corexterm:closed', { terminalId });
        activeTerminals.delete(terminalId);
      });
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Terminal local: shell real de la máquina del usuario (bash/zsh en
// Linux/Mac, PowerShell en Windows), sin pasar por SSH — esto es lo que
// MobaXterm llama "Local terminal". Aquí sí usamos node-pty de verdad.
ipcMain.handle('corexterm:connectLocal', async (event, { terminalId, cols, rows }) => {
  if (!pty) return { ok: false, error: 'node-pty is not available on this platform/build. See setup instructions.' };
  try {
    const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: process.env.HOME || process.env.USERPROFILE || process.cwd(),
      env: process.env,
    });

    activeTerminals.set(terminalId, { ptyProcess, kind: 'local' });

    ptyProcess.onData((data) => {
      event.sender.send('corexterm:data', { terminalId, data });
    });
    ptyProcess.onExit(() => {
      event.sender.send('corexterm:closed', { terminalId });
      activeTerminals.delete(terminalId);
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('corexterm:write', async (event, { terminalId, data }) => {
  const entry = activeTerminals.get(terminalId);
  if (!entry) return { ok: true };
  if (entry.kind === 'local' && entry.ptyProcess) entry.ptyProcess.write(data);
  else if (entry.stream) entry.stream.write(data);
  return { ok: true };
});

ipcMain.handle('corexterm:resize', async (event, { terminalId, cols, rows }) => {
  const entry = activeTerminals.get(terminalId);
  if (!entry) return { ok: true };
  if (entry.kind === 'local' && entry.ptyProcess) entry.ptyProcess.resize(cols, rows);
  else if (entry.stream) entry.stream.setWindow(rows, cols, 0, 0);
  return { ok: true };
});

// Cierre limpio de un terminal individual — extraído como función propia
// para poder reutilizarla tanto en la desconexión manual de una pestaña
// (el flujo de siempre) como en la limpieza global al cerrar toda la app.
function closeTerminalEntry(entry) {
  if (!entry) return;
  if (entry.kind === 'local' && entry.ptyProcess) entry.ptyProcess.kill();
  if (entry.stream) entry.stream.end();
  if (entry.sshConn) entry.sshConn.end();
  if (entry.jumpConn) entry.jumpConn.end();
}

ipcMain.handle('corexterm:disconnect', async (event, { terminalId }) => {
  const entry = activeTerminals.get(terminalId);
  if (entry) {
    closeTerminalEntry(entry);
    activeTerminals.delete(terminalId);
  }
  return { ok: true };
});

// ── SFTP ─────────────────────────────────────────────────────────────────
const activeSftp = new Map(); // sessionId -> { sshConn, sftp }

ipcMain.handle('corexterm:sftpConnect', async (event, { sessionId }) => {
  if (!isVaultUnlocked()) return { ok: false, error: 'Vault is locked' };
  try {
    const sessionData = getDecryptedSession(sessionId);
    if (!sessionData) return { ok: false, error: 'Session not found' };

    const conn = new SSHClient();
    const connectConfig = buildSSHConnectConfig(sessionData);

    await new Promise((resolve, reject) => {
      conn.on('ready', resolve);
      conn.on('error', reject);
      conn.connect(connectConfig);
    });

    const sftp = await new Promise((resolve, reject) => {
      conn.sftp((err, sftpClient) => (err ? reject(err) : resolve(sftpClient)));
    });

    activeSftp.set(sessionId, { sshConn: conn, sftp });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('corexterm:sftpList', async (event, { sessionId, remotePath }) => {
  const entry = activeSftp.get(sessionId);
  if (!entry) return { ok: false, error: 'Not connected' };
  return new Promise((resolve) => {
    entry.sftp.readdir(remotePath || '.', (err, list) => {
      if (err) return resolve({ ok: false, error: err.message });
      resolve({
        ok: true,
        entries: list.map((item) => ({
          name: item.filename,
          isDirectory: (item.attrs.mode & 0o170000) === 0o040000,
          size: item.attrs.size,
          modifyTime: item.attrs.mtime * 1000,
        })),
      });
    });
  });
});

ipcMain.handle('corexterm:sftpDownload', async (event, { sessionId, remotePath }) => {
  const entry = activeSftp.get(sessionId);
  if (!entry) return { ok: false, error: 'Not connected' };
  const { filePath, canceled } = await dialog.showSaveDialog({
    defaultPath: path.basename(remotePath),
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  return new Promise((resolve) => {
    entry.sftp.fastGet(remotePath, filePath, (err) => {
      if (err) return resolve({ ok: false, error: err.message });
      resolve({ ok: true, filePath });
    });
  });
});

ipcMain.handle('corexterm:sftpUpload', async (event, { sessionId, remoteDir }) => {
  const entry = activeSftp.get(sessionId);
  if (!entry) return { ok: false, error: 'Not connected' };
  const { filePaths, canceled } = await dialog.showOpenDialog({ properties: ['openFile'] });
  if (canceled || filePaths.length === 0) return { ok: false, canceled: true };
  const localPath = filePaths[0];
  const remotePath = remoteDir.replace(/\/$/, '') + '/' + path.basename(localPath);
  return new Promise((resolve) => {
    entry.sftp.fastPut(localPath, remotePath, (err) => {
      if (err) return resolve({ ok: false, error: err.message });
      resolve({ ok: true, remotePath });
    });
  });
});

ipcMain.handle('corexterm:sftpReadFile', async (event, { sessionId, remotePath }) => {
  const entry = activeSftp.get(sessionId);
  if (!entry) return { ok: false, error: 'Not connected' };
  return new Promise((resolve) => {
    entry.sftp.readFile(remotePath, 'utf8', (err, data) => {
      if (err) return resolve({ ok: false, error: err.message });
      resolve({ ok: true, content: data });
    });
  });
});

ipcMain.handle('corexterm:sftpWriteFile', async (event, { sessionId, remotePath, content }) => {
  const entry = activeSftp.get(sessionId);
  if (!entry) return { ok: false, error: 'Not connected' };
  return new Promise((resolve) => {
    entry.sftp.writeFile(remotePath, content, 'utf8', (err) => {
      if (err) return resolve({ ok: false, error: err.message });
      resolve({ ok: true });
    });
  });
});

ipcMain.handle('corexterm:sftpMkdir', async (event, { sessionId, remotePath }) => {
  const entry = activeSftp.get(sessionId);
  if (!entry) return { ok: false, error: 'Not connected' };
  return new Promise((resolve) => {
    entry.sftp.mkdir(remotePath, (err) => {
      if (err) return resolve({ ok: false, error: err.message });
      resolve({ ok: true });
    });
  });
});

ipcMain.handle('corexterm:sftpDelete', async (event, { sessionId, remotePath, isDirectory }) => {
  const entry = activeSftp.get(sessionId);
  if (!entry) return { ok: false, error: 'Not connected' };
  return new Promise((resolve) => {
    const method = isDirectory ? 'rmdir' : 'unlink';
    entry.sftp[method](remotePath, (err) => {
      if (err) return resolve({ ok: false, error: err.message });
      resolve({ ok: true });
    });
  });
});

function closeSftpEntry(entry) {
  if (!entry) return;
  if (entry.sshConn) entry.sshConn.end();
}

ipcMain.handle('corexterm:sftpDisconnect', async (event, { sessionId }) => {
  const entry = activeSftp.get(sessionId);
  if (entry) {
    closeSftpEntry(entry);
    activeSftp.delete(sessionId);
  }
  return { ok: true };
});

// Selector de archivo para elegir la clave privada SSH (.pem/.key) al
// configurar una sesión con autenticación por clave.
ipcMain.handle('corexterm:pickKeyFile', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({ properties: ['openFile'] });
  if (canceled || filePaths.length === 0) return { ok: false };
  return { ok: true, path: filePaths[0] };
});

// ═══════════════════════════════════════════════════════════════════════════
//  VS Corex — explorador de archivos local + Git
// ═══════════════════════════════════════════════════════════════════════════

// ── Explorador de archivos local ────────────────────────────────────────
ipcMain.handle('vscorex:pickFolder', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (canceled || filePaths.length === 0) return { ok: false };
  return { ok: true, path: filePaths[0] };
});

ipcMain.handle('vscorex:listLocalDir', async (event, { dirPath }) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return {
      ok: true,
      entries: entries
        .filter((e) => !e.name.startsWith('.') || e.name === '.git') // ocultamos dotfiles, salvo .git (lo necesitamos para detectar repos)
        .map((e) => ({
          name: e.name,
          isDirectory: e.isDirectory(),
          path: path.join(dirPath, e.name),
        }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        }),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vscorex:readLocalFile', async (event, { filePath }) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vscorex:writeLocalFile', async (event, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vscorex:createLocalFile', async (event, { dirPath, name }) => {
  try {
    const filePath = path.join(dirPath, name);
    if (fs.existsSync(filePath)) return { ok: false, error: 'A file with that name already exists' };
    fs.writeFileSync(filePath, '', 'utf-8');
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vscorex:createLocalFolder', async (event, { dirPath, name }) => {
  try {
    const folderPath = path.join(dirPath, name);
    fs.mkdirSync(folderPath, { recursive: false });
    return { ok: true, folderPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vscorex:deleteLocalEntry', async (event, { entryPath, isDirectory }) => {
  try {
    if (isDirectory) fs.rmSync(entryPath, { recursive: true, force: true });
    else fs.unlinkSync(entryPath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Git ──────────────────────────────────────────────────────────────────
// Git nunca es un requisito para que COREX arranque. Si el binario no está
// disponible, cada operación falla con un error claro y reconocible
// ('git-not-found') que el frontend usa para mostrar el aviso de instalación
// en vez de un error genérico.
function isGitNotFoundError(e) {
  return e && (e.code === 'ENOENT' || /not found|no se encontró|ENOENT/i.test(e.message || ''));
}

ipcMain.handle('vscorex:checkGitAvailable', async () => {
  try {
    const git = simpleGit();
    await git.raw(['--version']);
    return { ok: true, available: true };
  } catch (e) {
    return { ok: true, available: false };
  }
});

ipcMain.handle('vscorex:gitStatus', async (event, { dirPath }) => {
  try {
    const git = simpleGit(dirPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) return { ok: true, isRepo: false };
    const status = await git.status();
    return {
      ok: true,
      isRepo: true,
      current: status.current,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      modified: status.modified,
      not_added: status.not_added,
      deleted: status.deleted,
      created: status.created,
      staged: status.staged,
      conflicted: status.conflicted,
    };
  } catch (e) {
    if (isGitNotFoundError(e)) return { ok: false, error: 'git-not-found' };
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vscorex:gitDiff', async (event, { dirPath, filePath, staged }) => {
  try {
    const git = simpleGit(dirPath);
    const args = [];
    if (staged) args.push('--staged');
    if (filePath) args.push('--', filePath);
    const diff = await git.diff(args);
    return { ok: true, diff };
  } catch (e) {
    if (isGitNotFoundError(e)) return { ok: false, error: 'git-not-found' };
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vscorex:gitLog', async (event, { dirPath, maxCount }) => {
  try {
    const git = simpleGit(dirPath);
    const log = await git.log({ maxCount: maxCount || 30 });
    return {
      ok: true,
      commits: log.all.map((c) => ({ hash: c.hash, message: c.message, author: c.author_name, date: c.date })),
    };
  } catch (e) {
    if (isGitNotFoundError(e)) return { ok: false, error: 'git-not-found' };
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vscorex:gitStage', async (event, { dirPath, filePaths }) => {
  try {
    const git = simpleGit(dirPath);
    await git.add(filePaths);
    return { ok: true };
  } catch (e) {
    if (isGitNotFoundError(e)) return { ok: false, error: 'git-not-found' };
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vscorex:gitUnstage', async (event, { dirPath, filePaths }) => {
  try {
    const git = simpleGit(dirPath);
    await git.reset(['HEAD', '--', ...filePaths]);
    return { ok: true };
  } catch (e) {
    if (isGitNotFoundError(e)) return { ok: false, error: 'git-not-found' };
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vscorex:gitCommit', async (event, { dirPath, message }) => {
  try {
    const git = simpleGit(dirPath);
    const result = await git.commit(message);
    return { ok: true, result };
  } catch (e) {
    if (isGitNotFoundError(e)) return { ok: false, error: 'git-not-found' };
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vscorex:gitPush', async (event, { dirPath }) => {
  try {
    const git = simpleGit(dirPath);
    await git.push();
    return { ok: true };
  } catch (e) {
    if (isGitNotFoundError(e)) return { ok: false, error: 'git-not-found' };
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vscorex:gitPull', async (event, { dirPath }) => {
  try {
    const git = simpleGit(dirPath);
    await git.pull();
    return { ok: true };
  } catch (e) {
    if (isGitNotFoundError(e)) return { ok: false, error: 'git-not-found' };
    return { ok: false, error: e.message };
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  Ticket Automation Templates — transiciones de Jira, plantillas, cola de
//  adjuntos pendientes
// ═══════════════════════════════════════════════════════════════════════════

// Las transiciones de Jira no son "elige cualquier nombre de estado" — son
// pasos concretos del workflow del ticket, identificados por un ID propio,
// y solo las que de verdad están disponibles desde el estado actual. Por
// eso las consultamos en vivo en vez de dejar que el usuario escriba un
// nombre de estado a mano.
ipcMain.handle('jira:listTransitions', async (event, { key }) => {
  const { jira } = loadConfig();
  if (!jira || !jira.url || !jira.token) return { ok: false, error: 'Jira no configurado' };
  try {
    const res = await httpRequest({
      url: `${jira.url.replace(/\/$/, '')}/rest/api/2/issue/${key}/transitions`,
      headers: jiraAuthHeader(jira),
      rejectUnauthorized: jira.verifySsl !== false,
    });
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, transitions: (res.body && res.body.transitions) || [] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('jira:doTransition', async (event, { key, transitionId }) => {
  const { jira } = loadConfig();
  if (!jira || !jira.url || !jira.token) return { ok: false, error: 'Jira no configurado' };
  try {
    // Jira devuelve el id de cada transición disponible como STRING en el
    // JSON (p.ej. "731"), pero al ENVIAR la transición exige que sea un
    // entero JSON real, sin comillas — si se reenvía tal cual se recibió,
    // Jira responde 400 con "'transition' identifier must be an integer".
    const numericId = parseInt(transitionId, 10);
    if (Number.isNaN(numericId)) return { ok: false, error: `Invalid transition id: ${transitionId}` };
    const res = await httpRequest({
      url: `${jira.url.replace(/\/$/, '')}/rest/api/2/issue/${key}/transitions`,
      method: 'POST',
      headers: jiraAuthHeader(jira),
      body: { transition: { id: numericId } },
      rejectUnauthorized: jira.verifySsl !== false,
    });
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}: ${JSON.stringify(res.body)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Automation Templates: CRUD sobre el vault ───────────────────────────
ipcMain.handle('automation:list', async () => {
  const cfg = loadConfig();
  return { ok: true, templates: cfg.automationTemplates || [] };
});

ipcMain.handle('automation:save', async (event, { template }) => {
  if (!isVaultUnlocked()) return { ok: false, error: 'Vault is locked' };
  const cfg = loadConfig();
  cfg.automationTemplates = cfg.automationTemplates || [];
  const id = template.id || crypto.randomUUID();
  const stored = { ...template, id };
  const idx = cfg.automationTemplates.findIndex((t) => t.id === id);
  if (idx >= 0) cfg.automationTemplates[idx] = stored;
  else cfg.automationTemplates.push(stored);
  const saveRes = saveConfig(cfg);
  if (!saveRes.ok) return { ok: false, error: `Could not save to disk: ${saveRes.error}` };
  return { ok: true, id };
});

ipcMain.handle('automation:delete', async (event, { id }) => {
  const cfg = loadConfig();
  cfg.automationTemplates = (cfg.automationTemplates || []).filter((t) => t.id !== id);
  saveConfig(cfg);
  return { ok: true };
});

// ── Cola de adjuntos pendientes ──────────────────────────────────────────
// Cuando una rama (success/failure) requiere adjunto y el job termina sin
// que el usuario esté mirando esa pantalla, no interrumpimos con un modal
// — encolamos la pendiente aquí, y el frontend la muestra como badge/
// notificación hasta que el usuario decide atenderla.
ipcMain.handle('automation:listPendingAttachments', async () => {
  const cfg = loadConfig();
  return { ok: true, pending: cfg.pendingAttachments || [] };
});

ipcMain.handle('automation:addPendingAttachment', async (event, { pending }) => {
  const cfg = loadConfig();
  cfg.pendingAttachments = cfg.pendingAttachments || [];
  const stored = { ...pending, id: crypto.randomUUID(), createdAt: Date.now() };
  cfg.pendingAttachments.push(stored);
  saveConfig(cfg);
  return { ok: true, id: stored.id };
});

ipcMain.handle('automation:resolvePendingAttachment', async (event, { id }) => {
  const cfg = loadConfig();
  cfg.pendingAttachments = (cfg.pendingAttachments || []).filter((p) => p.id !== id);
  saveConfig(cfg);
  return { ok: true };
});

// Abre el selector nativo de archivo, lee el contenido del disco y lo sube
// directamente a Jira — usado por el modal de adjuntos pendientes, donde el
// usuario elige manualmente qué archivo de su PC adjuntar al ticket.
function guessMimeType(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const map = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    pdf: 'application/pdf', html: 'text/html', htm: 'text/html', txt: 'text/plain',
    json: 'application/json', zip: 'application/zip', csv: 'text/csv', log: 'text/plain',
  };
  return map[ext] || 'application/octet-stream';
}

ipcMain.handle('automation:pickAndUploadAttachment', async (event, { ticketKey }) => {
  const { jira } = loadConfig();
  if (!jira || !jira.url || !jira.token) return { ok: false, error: 'Jira no configurado' };
  const { filePaths, canceled } = await dialog.showOpenDialog({ properties: ['openFile'] });
  if (canceled || filePaths.length === 0) return { ok: false, canceled: true };

  const filePath = filePaths[0];
  const filename = path.basename(filePath);
  const mimeType = guessMimeType(filename);

  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(`${jira.url.replace(/\/$/, '')}/rest/api/2/issue/${ticketKey}/attachments`);
    } catch (e) {
      resolve({ ok: false, error: 'URL de Jira inválida' });
      return;
    }
    const boundary = '----CorexBoundary' + Date.now();
    const fileBuffer = fs.readFileSync(filePath);
    const prePart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const postPart = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([prePart, fileBuffer, postPart]);

    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname,
        method: 'POST',
        headers: {
          ...jiraAuthHeader(jira),
          'X-Atlassian-Token': 'no-check',
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
        rejectUnauthorized: jira.verifySsl !== false,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            resolve({ ok: false, error: `HTTP ${res.statusCode}: ${data}` });
            return;
          }
          resolve({ ok: true, filename });
        });
      }
    );
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.write(body);
    req.end();
  });
});
