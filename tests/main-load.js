// Test de carga del proceso principal SIN Electron real: stubea el módulo
// 'electron' (y los nativos) y hace require() de main.js completo.
//
// Por qué existe: `node --check` solo valida SINTAXIS — un ReferenceError
// (llamar a una función no definida, como el setupPowerLock de v76) solo
// aparece al EJECUTAR. Este test caza exactamente esa clase de error sin
// necesidad de arrancar Electron. Corre como parte de `npm test`.
const path = require('path');
const Module = require('module');

const orig = Module._load;
Module._load = function (request, ...args) {
  if (request === 'electron') {
    return {
      app: {
        whenReady: () => ({ then: (cb) => { cb(); return { catch: () => {} }; } }),
        on: () => {},
        getPath: () => require('os').tmpdir(),
        setPath: () => {},
        quit: () => {},
      },
      BrowserWindow: class {
        constructor() { this.webContents = { send() {}, on() {} }; }
        loadFile() {} on() {} maximize() {}
      },
      ipcMain: { handle: () => {}, on: () => {} },
      dialog: { showOpenDialog: async () => ({}) },
      Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
      powerMonitor: { on: () => {} },
      shell: { openExternal: () => {} },
      clipboard: { writeText: () => {} },
    };
  }
  // Módulos nativos/pesados: proxy inerte — no se testea su lógica aquí,
  // solo que main.js referencia símbolos que existen.
  if (['node-pty', 'ssh2', 'systeminformation', 'simple-git', 'nodemailer'].includes(request)) {
    return new Proxy(function () {}, { get: () => () => ({}), apply: () => ({}) });
  }
  return orig.apply(this, [request, ...args]);
};

try {
  require(path.join(__dirname, '..', 'main.js'));
  console.log('main-load: OK — main.js carga sin ReferenceError');
  process.exit(0);
} catch (e) {
  console.error('main-load: FAIL —', e && e.stack || e);
  process.exit(1);
}
