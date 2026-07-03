# COREX — Operations Cockpit

Dashboard de operaciones (Electron) que integra **AWX** (Ansible), **Jira Service Management**, **terminal SSH multi-sesión con SFTP** y **editor de código**, con almacenamiento de credenciales cifrado.

---

## Arranque

```bash
npm install
npm start        # arranca Electron
npm test         # smoke test del renderer (requiere: npm i -D jsdom)
```

Primera ejecución: se pide crear una **Master Password** que cifra el vault. Después, configura Jira/AWX en *Settings*.

## Arquitectura

```
main.js            Proceso principal Electron: IPC handlers (81+), vault,
                   HTTP a Jira/AWX (con retry/timeout/isAuthError), SSH/PTY,
                   SFTP, logs rotados, powerMonitor.
src/preload.js     Puente contextBridge: window.corexAPI.*
src/app.js         Renderer completo: estado global `state`, ~renderX() por
                   vista, helper mk() para DOM con estilos inline.
src/i18n.js        Diccionario en/es (t('clave')).
src/vendor/        xterm.js + Monaco (locales, sin CDN).
tests/             smoke.js (jsdom) + harness.html (QA visual en navegador).
```

**Patrón de render**: `renderApp()` re-renderiza toda la UI desde `state`. La preservación de foco (`data-focus-key`), de scroll (`corex-main-scroll`) y del terminal (ver invariantes) existen para compensar ese modelo.

**Tokens de diseño**: paleta "Cockpit" en el objeto `CX` (app.js). Tipografía dual: sans de sistema para UI, IBM Plex Mono para código/terminal/valores.

## ⚠️ Invariantes críticos — leer antes de tocar CorexTerm

1. **NUNCA llamar a `renderApp()` desde callbacks de conexión SSH** (connect, sftp-ready, data). Destruiría el DOM de xterm en pleno montaje (bug histórico del "prompt vacío", v67). Para actualizar UI desde esos callbacks: manipulación quirúrgica vía data-attributes (`[data-terminal-dot]`, `[data-terminal-bodyrow]`) — ver `autoOpenSftpOnConnect()` como ejemplo canónico.
2. **El nodo del terminal se REUTILIZA, no se recrea**: `inst.xtermContainer` guarda la referencia; los renders lo mueven con `appendChild()`.
3. **Reintentos HTTP solo en lecturas idempotentes**, jamás en escrituras.
4. Todo handler que hable HTTP con Jira/AWX debe devolver `isAuthError: true` en 401/403 (`authErrorResponse()`), para que el polling distinga credencial caducada de red caída.

## Modelo de seguridad del vault

- **Cifrado**: AES-256-GCM, clave derivada con PBKDF2-SHA256 (200k iteraciones), salt aleatorio por contraseña.
- **Escritura atómica**: temp + rename — un crash a mitad de escritura nunca corrompe el vault anterior.
- **Secretos nunca en list**: `creds:list` devuelve solo metadata; el secreto sale únicamente con `creds:reveal` bajo demanda.
- **Auto-lock**: por inactividad (configurable en la vista Vault, default 15 min) y SIEMPRE al suspender el equipo o bloquear pantalla (powerMonitor purga las claves en main y avisa al renderer).
- **Portapapeles**: al copiar un secreto, se auto-limpia a los 30 s si aún lo contiene.
- **Cambio de Master Password**: verifica la actual con `timingSafeEqual`, re-cifra con salt nuevo, y hace rollback en memoria si el disco falla.

## Sello CorexTerm

Todas las sesiones SSH reciben al conectar el prompt distintivo (`corexPromptCommand()` en app.js):

```
╭─corex─(user@host)─[~/ruta]
╰─$
```

Detecta bash/zsh en el remoto, glifos como bytes UTF-8 (a prueba de locale C/POSIX — verificado contra bash 5 y zsh 5.9), no persiste nada en el servidor (dura la sesión de shell).

## Tests

- `npm test` — smoke del renderer en jsdom: renderiza las ~10 vistas con API simulada y valida ~30 aserciones (dashboard, SLA, workspaces, vault, lock...).
- `tests/harness.html` — QA visual/funcional: ábrelo con Playwright/Chromium (o a mano en un navegador) para probar la app real con fixtures sin Electron. El historial de este proyecto lo usa con `page.evaluate()` para tests de interacción (filtros, workspaces, credenciales).
- Test manual pendiente **siempre** tras tocar CorexTerm: conectar SSH real → verificar prompt visible + teclado + SFTP auto → cambiar a split/grid → verificar que el terminal sobrevive.

## Roadmap (orden recomendado)

1. **Modularizar `src/app.js`** (~8k líneas): partir por dominio (`cockpit/`, `jira/`, `awx/`, `corexterm/`, `vault/`, `ui/tokens`) con esbuild (sin framework: el patrón mk()/render se conserva). Hacerlo ANTES de ninguna feature grande más.
2. **Command palette ⌘K**: buscador global de tickets/templates/sesiones/acciones. El input del topbar ya está dibujado (deshabilitado).
3. **Import de sesiones** desde PuTTY / mRemoteNG / ~/.ssh/config.
4. **Notificaciones nativas**: SLA por vencer, job AWX fallido (la campana del topbar es el placeholder).
5. **Release**: electron-builder + firma + auto-update (electron-updater) + GitHub Actions corriendo `npm test`.
6. **Guardarraíl de producción**: banda roja en terminales de sesiones en carpeta "Production".
7. **Audit log local** de acciones (jobs lanzados, transiciones de tickets).
8. Unificar idioma de la UI vía i18n.js (hoy mezcla en/es) y reemplazar `window.prompt/confirm` por modales propios.

## Convenciones

- Ids de vista en `state.view`: `inbox` (Cockpit), `jira` (My Work), `jira-detail`, `awx`, `awx-jobs`, `awx-detail`, `templates`, `corexterm`, `ct-sessions`, `vscorex`, `workspaces`, `settings`, `vault`.
- Config persistida en el vault vía `config:set` (merge por clave de nivel superior; devuelve la config completa).
- Los comentarios del código explican el *porqué* (decisiones, bugs históricos), no el *qué*.
