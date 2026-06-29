// ═══════════════════════════════════════════════════════════════════════════
//  COREX — renderer (vanilla JS, sin bundler)
// ═══════════════════════════════════════════════════════════════════════════

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  view: 'inbox', // 'inbox' | 'awx' | 'jira' | 'settings'
  config: { jira: {}, awx: {}, smtp: {} },
  toast: null,

  // AWX runtime state
  awxTemplates: [],
  awxFilter: '',
  awxLoading: false,
  awxError: null,
  awxSelectedTemplate: null,
  awxExtraVarsTicket: '',
  awxRunningJob: null, // { id, status, ... }
  awxStdout: '',
  awxPollHandle: null,
  // Cuando se lanza un job desde el Inbox (vinculado a un ticket), guardamos
  // la clave para poder comentar/adjuntar automáticamente al terminar.
  awxRunningJobTicketKey: null,

  // Jira runtime state (vista de búsqueda por clave)
  jiraKeyInput: '',
  jiraIssue: null,
  jiraLoading: false,
  jiraError: null,

  // Inbox / Dashboard (tickets asignados)
  inboxIssues: [],
  inboxLoading: false,
  inboxError: null,
  inboxExpandedKey: null, // qué ticket tiene el panel de vínculo abierto
  ticketLinks: {}, // { 'ITSD-1234': { templateId, templateName, linkedAt } }

  // Dashboard — métricas de hardware local
  hwMetrics: null,
  hwLoading: false,
  hwError: null,
  hwPollHandle: null,
  // Historial para las gráficas en tiempo real — buffer de hasta 1h a una
  // muestra cada 3s (1200 puntos). La ventana visible (60s/5m/1h) solo
  // recorta una porción de este mismo buffer, no cambia el intervalo de
  // polling — más simple y barato que tener varios buffers o reconfigurar
  // el muestreo según lo que el usuario elija ver.
  hwHistory: [], // [{ t: timestamp, cpuUser, cpuSystem, memUsed, memTotal }]
  hwHistoryMaxPoints: 1200,
  hwTimeWindow: '60s', // '60s' | '5m' | '1h'

  // Favoritos y uso de templates AWX
  favoriteTemplates: [], // [templateId, ...]
  templateUsage: {}, // { templateId: count }
  awxSortFavoritesFirst: false,

  // Wizard de lanzamiento genérico: los pasos se derivan de los flags
  // ask_*_on_launch del template, igual que hace el wizard nativo de AWX
  // (Instance Groups → Other Prompts → Survey → Preview, cualquiera puede faltar).
  awxLaunchWizard: null, // null = sin wizard activo (lanzamiento directo o sin pasos)
  awxLaunchLoading: false,

  // Vista de detalle de Template (view: 'awx-detail')
  awxDetailTemplate: null,
  awxDetailReturnView: 'awx', // a qué vista volver con "← Back" ('awx' o 'inbox')
  awxJobHistory: [],
  awxJobHistoryLoading: false,
  awxJobHistoryError: null,
  awxJobHistoryPage: 1,
  awxJobHistoryHasNext: false,

  // Jobs recientes de todos los templates, para la vista principal de AWX
  // (estilo "Recent job runs" con chips de estado + blast radius)
  awxRecentJobs: [],
  awxRecentJobsLoading: false,
  awxRecentJobsError: null,

  // Vista de detalle de Ticket (view: 'jira-detail')
  jiraDetailIssue: null,
  jiraDetailReturnView: 'inbox',
  jiraCommentDraft: '',
  jiraCommentSending: false,
  jiraAttachSending: false,
  // Secciones colapsables de campos extra (p.ej. Business Justification) —
  // colapsadas por defecto porque suelen traer texto largo (listas de
  // servidores, justificaciones extensas) que no debería invadir la
  // pantalla de entrada al detalle.
  jiraDetailExpandedFields: {},

  // Vault global — pantalla de bienvenida bloqueante antes de toda la app
  vaultUnlocked: false,
  vaultExists: false,
  vaultUnlockInput: '',
  vaultUnlockConfirm: '', // solo se usa la primera vez, para confirmar la nueva Master Password
  vaultUnlockError: null,
  vaultUnlocking: false,

  // CorexTerm (view: 'corexterm')
  ctSessions: [],
  // Pestañas abiertas, como en un navegador: varios terminales pueden estar
  // conectados a la vez, solo uno se muestra en cada momento.
  ctOpenTerminalIds: [], // [terminalId, ...] en orden de apertura
  ctActiveTerminalId: null, // cuál de las abiertas se muestra ahora mismo
  ctTerminalInstances: {}, // { terminalId: { term, fitAddon, connected, kind, label } } — solo en memoria, no serializable
  ctShowSessionForm: false,
  ctEditingSessionId: null,
  ctSessionForm: null, // objeto del formulario en curso (ver newSessionForm())

  // SFTP — panel lateral dentro de una pestaña SSH (no separado, como en MobaXterm)
  ctSftpOpenFor: null, // terminalId de la pestaña que tiene el panel SFTP abierto
  ctSftpPath: '.',
  ctSftpEntries: [],
  ctSftpLoading: false,
  ctSftpError: null,
  // Editor inline al hacer doble-click en un archivo remoto
  ctEditorFile: null, // { remotePath, content, dirty }
  ctEditorSaving: false,

  // Split screen: 'single' (solo la pestaña activa) | 'h2' (2 horizontal) |
  // 'v2' (2 vertical) | 'grid4' (4 en cuadrícula) — igual que el botón
  // "Split" de MobaXterm. ctSplitSlots asigna qué terminalId va en cada
  // celda; null = celda vacía (se puede asignar luego).
  ctSplitMode: 'single',
  ctSplitSlots: [null, null, null, null],

  // Carpetas colapsadas en la lista de sesiones (por nombre de carpeta)
  ctCollapsedFolders: {},

  // MultiExec / Broadcast — igual que en MobaXterm: lo que se escribe en el
  // terminal activo se replica a todas las pestañas SSH abiertas (no al
  // terminal local, no tiene sentido enviarle comandos de un host remoto).
  ctBroadcastMode: false,

  // Macros — grabar una secuencia de teclas en un terminal y repetirla
  // después, en el mismo terminal o en otro distinto (igual que MobaXterm:
  // "everything you type will be recorded in order to replay it later on
  // other servers").
  ctRecordingMacro: false,
  ctMacroBuffer: '', // teclas acumuladas durante la grabación en curso
  ctMacros: [], // [{ id, name, keys }] — persistidas en el vault
  ctShowMacroPanel: false,

  // VS Corex (view: 'vscorex')
  vsMonacoLoaded: false,
  vsWorkspaceKind: null, // 'local' | 'remote' | null (sin workspace abierto)
  vsWorkspaceRoot: null, // ruta local, o remotePath si es 'remote'
  vsWorkspaceSessionId: null, // sessionId de CorexTerm si el workspace es remoto
  vsExplorerTree: {}, // { path: { entries, expanded } } — árbol perezoso, se expande bajo demanda
  vsOpenFiles: [], // [{ id, path, name, kind: 'local'|'remote', sessionId, content, dirty, model }]
  vsActiveFileId: null,
  vsGitAvailable: null, // null = sin comprobar todavía, true/false tras comprobar
  vsGitStatus: null,
  vsGitPanelOpen: false,
  vsGitCommitMessage: '',
  vsGitDiffFile: null, // path del archivo cuyo diff se está mostrando
  vsGitDiffContent: '',
};

// ═══════════════════════════════════════════════════════════════════════════
//  Sistema de diseño — tokens centralizados
// ═══════════════════════════════════════════════════════════════════════════
// Antes de esto, cada una de las ~38 funciones de render definía sus propios
// valores de fuente/espaciado/color sueltos, lo que con el tiempo derivó en
// 17 tamaños de fuente y 30 colores hex distintos para conceptos que en
// realidad eran los mismos 6-8. T (type), S (space) y C (color) son los
// tokens únicos; todo el código nuevo debe usarlos en vez de strings sueltas.
const T = {
  xs: '10px',   // metadatos, timestamps
  sm: '11px',   // labels, botones secundarios
  base: '13px', // cuerpo de texto, default
  md: '15px',   // subtítulos de sección
  lg: '20px',   // títulos de vista (H1)
  xl: '24px',   // pantallas a página completa (vault gate)
};

const S = {
  1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 8: '32px',
};

const R = {
  sm: '3px',     // inputs, botones, tarjetas — el radio por defecto, casi siempre este
  pill: '999px', // badges de estado/prioridad únicamente
};

const C = {
  surface0: '#0a0b0d', // fondo de app
  surface1: '#0d0e10', // tarjetas
  surface2: '#14161a', // hover / elevado
  border: '#22252a',   // único borde, siempre
  textPrimary: '#dfe3e7',
  textSecondary: '#5e6670', // único gris secundario
  success: '#6ad17e',
  warning: '#c98a3a',
  danger: '#c94f4f',
  info: '#5b9bd5',
};

// ── DOM helpers ─────────────────────────────────────────────────────────────
function mk(tag, styleOrAttrs, children, attrs) {
  const el = document.createElement(tag);
  if (styleOrAttrs) {
    if (styleOrAttrs.style) {
      Object.assign(el.style, styleOrAttrs.style);
      const rest = { ...styleOrAttrs };
      delete rest.style;
      Object.entries(rest).forEach(([k, v]) => {
        if (k === 'onclick') el.addEventListener('click', v);
        else if (k === 'onchange') el.addEventListener('change', v);
        else if (k === 'oninput') el.addEventListener('input', v);
        else if (k === 'onkeydown') el.addEventListener('keydown', v);
        else if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else el.setAttribute(k, v);
      });
    } else {
      Object.assign(el.style, styleOrAttrs);
    }
  }
  (children || []).forEach((c) => {
    if (c == null) return;
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  });
  return el;
}

// Checkbox con apariencia propia — los <input type="checkbox"> nativos sin
// estilo se ven como un rectángulo blanco vacío sobre fondo oscuro (sin
// tema), sin marca visible ni siquiera al estar marcados. Este helper
// dibuja un cuadrado propio (vacío / relleno verde con check) y mantiene
// el input real técnicamente presente pero visualmente oculto, para que
// el comportamiento de clic/teclado siga siendo el nativo del navegador.
function renderCheckbox(checked, onChange, labelText) {
  const box = mk('span', {
    style: {
      width: '15px', height: '15px', borderRadius: '3px', flexShrink: '0',
      border: `1px solid ${checked ? C.success : C.border}`,
      background: checked ? C.success : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
  }, [
    checked ? mk('span', {
      style: { color: '#0a0b0d', fontSize: '10px', fontWeight: '700', lineHeight: '1' },
    }, ['✓']) : null,
  ].filter(Boolean));

  // No usamos <label> envolviendo el <input> a propósito: un <label> que
  // envuelve un checkbox reenvía el clic automáticamente al input además
  // del clic directo, disparando onchange DOS VECES por cada clic real.
  // Como nuestro onChange llama a renderApp() (que reconstruye el DOM),
  // el doble disparo hacía que el checkbox pareciera "no marcarse nunca"
  // — toggleaba a true y luego inmediatamente otra vez a false. En vez de
  // eso, manejamos el clic manualmente sobre un <div>, una sola vez.
  const wrap = mk('div', {
    style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' },
    onclick: () => onChange({ target: { checked: !checked } }),
  }, [
    box,
    labelText != null ? mk('span', {}, [labelText]) : null,
  ].filter(Boolean));

  return wrap;
}

function toast(msg, kind = 'ok') {
  state.toast = { msg, kind };
  renderApp();
  setTimeout(() => {
    state.toast = null;
    renderApp();
  }, 3200);
}

// ── Layout ───────────────────────────────────────────────────────────────
function renderSidebar() {
  // Iconos propios (trazo, no relleno) para AWX/Jira/CorexTerm/VS Corex —
  // inspirados en el concepto de cada herramienta o derivados del propio
  // logo de COREX, sin reproducir marcas registradas de terceros (el logo
  // real de Ansible y de Jira tienen uso de marca restringido).
  const iconAwx = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6"/>' +
    '<circle cx="12" cy="7" r="1.2" fill="currentColor"/>' +
    '<circle cx="8" cy="15" r="1.2" fill="currentColor"/>' +
    '<circle cx="16" cy="15" r="1.2" fill="currentColor"/>' +
    '<path d="M12 7 L8 15 M12 7 L16 15 M8 15 L16 15" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
  const iconJira = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 6 H16 L20 10 V18 H4 Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="16.5" cy="9.5" r="0.9" fill="currentColor"/>' +
    '</svg>';
  const iconCorexterm = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M5 8 L11 12 L5 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M13 17h6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
    '</svg>';
  const iconVsCorex = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M9 7 L4 12 L9 17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M15 7 L20 12 L15 17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

  const sections = [
    {
      label: 'Operations',
      items: [
        { id: 'inbox', label: t('nav_inbox'), icon: '◧' },
        { id: 'awx', label: t('nav_awx'), iconSvg: iconAwx },
        { id: 'jira', label: t('nav_jira'), iconSvg: iconJira, badge: state.inboxIssues.length || null },
      ],
    },
    {
      label: 'Workspace',
      items: [
        { id: 'corexterm', label: 'CorexTerm', iconSvg: iconCorexterm },
        { id: 'vscorex', label: 'VS Corex', iconSvg: iconVsCorex },
      ],
    },
    {
      label: 'System',
      items: [
        { id: 'settings', label: t('nav_settings'), icon: '⚒' },
      ],
    },
  ];

  const logoSvg = '<svg viewBox="0 0 15559.15 9394.27" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:18px;height:11px;display:block;">' +
    '<polygon fill="currentColor" points="4445.48,7673.09 2222.74,4535.94 -0,7673.09" />' +
    '<polygon fill="currentColor" points="11113.67,1398.78 13336.4,4535.93 15559.15,1398.78" />' +
    '<polygon fill="currentColor" points="9039.43,9394.27 2383.41,0 7115.63,0 13771.67,9394.27" />' +
    '</svg>';

  const nav = mk('div', {
    style: {
      width: '200px',
      height: '100%',
      background: C.surface0,
      borderRight: `1px solid ${C.border}`,
      display: 'flex',
      flexDirection: 'column',
      padding: `${S[5]} 0`,
      flexShrink: '0',
      position: 'relative',
      overflow: 'hidden',
    },
  });

  // Marca de agua del logo — mismo SVG que el del header, solo más grande y
  // muy tenue. Vive en una capa propia (z-index 0) para no interferir con
  // el contenido real de la navegación, que va en su propia capa encima.
  nav.appendChild(mk('div', {
    html: logoSvg,
    style: {
      position: 'absolute', width: '320px', height: '194px', color: '#ffffff', opacity: '0.07',
      bottom: '-36px', left: '-56px', pointerEvents: 'none', zIndex: '0',
    },
  }));

  const content = mk('div', { style: { position: 'relative', zIndex: '1', display: 'flex', flexDirection: 'column', height: '100%' } });

  // Logo a tamaño grande para el lockup vertical de marca (arriba del
  // wordmark) — distinto del logoSvg de 18px que se sigue usando en otros
  // contextos si hiciera falta más adelante.
  const brandLogoSvg = '<svg viewBox="0 0 15559.15 9394.27" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:48px;height:29px;display:block;margin:0 auto 10px;">' +
    '<polygon fill="currentColor" points="4445.48,7673.09 2222.74,4535.94 -0,7673.09" />' +
    '<polygon fill="currentColor" points="11113.67,1398.78 13336.4,4535.93 15559.15,1398.78" />' +
    '<polygon fill="currentColor" points="9039.43,9394.27 2383.41,0 7115.63,0 13771.67,9394.27" />' +
    '</svg>';

  // Lockup vertical: logo grande arriba, wordmark "COREX" debajo en peso
  // thin (100) + scaleY(0.70) para el efecto comprimido/achatado — el logo
  // se agrandó para darle espacio real al texto en vez de forzarlo a un
  // ancho que lo volvía ilegible (probado y descartado: comprimir el texto
  // al ancho de un logo de 18px rompía la legibilidad).
  const brand = mk('div', {
    style: { padding: `${S[5]} ${S[5]} ${S[6]}`, textAlign: 'center', color: C.textPrimary },
  }, [
    mk('div', { style: {}, html: brandLogoSvg }),
    mk('span', {
      style: {
        fontSize: '13px', fontWeight: '100', color: C.textPrimary, letterSpacing: '1.5px',
        display: 'inline-block', transform: 'scaleY(0.70)',
      },
    }, ['COREX']),
  ]);
  content.appendChild(brand);

  sections.forEach((section) => {
    content.appendChild(mk('div', {
      style: {
        fontSize: '9px', color: '#4b5158', textTransform: 'uppercase', letterSpacing: '0.8px',
        fontWeight: '700', padding: `0 ${S[5]}`, marginBottom: S[1], marginTop: S[4],
      },
    }, [section.label]));

    section.items.forEach((it) => {
      const active = state.view === it.id;
      const row = mk('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: S[2],
          padding: `${S[2]} ${S[5]}`,
          cursor: 'pointer',
          color: active ? C.textPrimary : '#8b9197',
          background: active ? C.surface2 : 'transparent',
          borderLeft: active ? `2px solid ${C.success}` : '2px solid transparent',
          fontSize: T.base,
          fontWeight: active ? '600' : '500',
          position: 'relative',
        },
        onclick: () => {
          state.view = it.id;
          renderApp(); // ya decide aquí mismo si el polling de hardware debe correr o pararse
          if (it.id === 'awx' && state.awxTemplates.length === 0) loadAwxTemplates();
          if (it.id === 'awx') loadAwxRecentJobs();
          if (it.id === 'inbox') loadInbox();
          if (it.id === 'jira' && state.inboxIssues.length === 0) loadInbox();
          if (it.id === 'corexterm' && state.ctSessions.length === 0) loadCtSessions();
          if (it.id === 'vscorex') initVsCorex();
        },
      }, [
        it.iconSvg
          ? mk('span', { html: it.iconSvg, style: { width: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0', color: active ? C.success : C.textSecondary } })
          : mk('span', { style: { fontSize: T.sm, width: '16px', textAlign: 'center', flexShrink: '0', color: active ? C.success : C.textSecondary } }, [it.icon]),
        mk('span', {}, [it.label]),
      ]);
      if (it.badge) {
        row.appendChild(mk('span', {
          style: {
            marginLeft: 'auto', fontSize: T.xs, background: '#1c2a1f', color: C.success,
            padding: '1px 6px', borderRadius: R.pill, fontWeight: '700',
          },
        }, [String(it.badge)]));
      }
      content.appendChild(row);
    });
  });

  // Footer de estado — confirma que el vault sigue desbloqueado, visible
  // siempre sin tener que ir a Settings a comprobarlo.
  content.appendChild(mk('div', {
    style: {
      marginTop: 'auto', padding: `${S[3]} ${S[5]}`, borderTop: `1px solid ${C.surface2}`,
      display: 'flex', alignItems: 'center', gap: S[2],
    },
  }, [
    mk('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: C.success, flexShrink: '0', display: 'inline-block' } }),
    mk('span', { style: { fontSize: '10.5px', color: C.textSecondary } }, ['Vault unlocked']),
  ]));

  nav.appendChild(content);
  return nav;
}

function renderToast() {
  if (!state.toast) return null;
  const colors = {
    ok: { bg: '#0f1f14', border: '#2a6b3d', text: '#6ad17e' },
    err: { bg: '#1a0f0f', border: '#5c2b2b', text: '#c94f4f' },
  };
  const c = colors[state.toast.kind] || colors.ok;
  return mk('div', {
    style: {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      background: c.bg,
      border: `1px solid ${c.border}`,
      color: c.text,
      padding: '12px 18px',
      borderRadius: '4px',
      fontSize: '13px',
      fontWeight: '500',
      zIndex: '999',
      maxWidth: '420px',
    },
  }, [state.toast.msg]);
}

function renderApp() {
  const app = document.getElementById('app');

  // Gate global: hasta que el vault esté desbloqueado, no se muestra nada
  // más de la app — ni Dashboard, ni AWX, ni Jira. Esto es justo lo que pedía
  // el cambio: la Master Password se pide al arrancar COREX, no al entrar a
  // CorexTerm, porque ahora protege TODAS las credenciales (AWX/Jira/SMTP
  // también), no solo las sesiones SSH.
  if (!state.vaultUnlocked) {
    app.innerHTML = '';
    app.appendChild(renderVaultGate());
    return;
  }

  // El polling de hardware solo debe correr mientras estamos en el Dashboard.
  // Lo decidimos aquí, en el único punto de render, en vez de en cada sitio
  // que cambia de vista — así no hay forma de "olvidar" pararlo al navegar
  // a un detalle (jira-detail, awx-detail...) desde dentro del Dashboard.
  if (state.view === 'inbox') {
    if (!state.hwPollHandle) startHwPolling();
  } else {
    stopHwPolling();
  }

  // Reconstruimos todo el DOM en cada render (no hay virtual DOM), así que sin
  // esto el navegador pierde la posición de scroll cada vez que el polling
  // (hardware, jobs en vivo...) dispara un renderApp() de fondo. Solo
  // preservamos el scroll si la vista no cambió — si el usuario navegó a otra
  // sección, sí queremos arrancar arriba, como es normal.
  const prevMain = document.getElementById('corex-main-scroll');
  const sameView = prevMain && prevMain.dataset.view === state.view;
  const prevScrollTop = sameView ? prevMain.scrollTop : 0;

  // Mismo problema, pero con el foco: algunos inputs (como el filtro de AWX)
  // necesitan renderApp() en cada tecla para refrescar resultados en vivo,
  // y al reconstruir todo el DOM, el navegador pierde el foco del input —
  // por eso antes solo se podía escribir una letra a la vez. Capturamos
  // aquí qué input tenía el foco (vía su atributo data-focus-key) y la
  // posición del cursor, para restaurarlos tras reconstruir.
  const activeEl = document.activeElement;
  const focusKey = activeEl && activeEl.dataset ? activeEl.dataset.focusKey : null;
  const focusSelectionStart = activeEl && 'selectionStart' in activeEl ? activeEl.selectionStart : null;
  const focusSelectionEnd = activeEl && 'selectionEnd' in activeEl ? activeEl.selectionEnd : null;

  app.innerHTML = '';

  const layout = mk('div', { style: { display: 'flex', height: '100%' } });
  layout.appendChild(renderSidebar());

  const main = mk('div', {
    id: 'corex-main-scroll',
    'data-view': state.view,
    style: { flex: '1', overflowY: 'auto', padding: '32px 40px' },
  });

  if (state.view === 'inbox') main.appendChild(renderInboxView());
  else if (state.view === 'awx') main.appendChild(renderAwxView());
  else if (state.view === 'awx-detail') main.appendChild(renderAwxDetailView());
  else if (state.view === 'jira') main.appendChild(renderJiraView());
  else if (state.view === 'jira-detail') main.appendChild(renderJiraDetailView());
  else if (state.view === 'corexterm') main.appendChild(renderCorexTermView());
  else if (state.view === 'vscorex') main.appendChild(renderVsCorexView());
  else if (state.view === 'settings') main.appendChild(renderSettingsView());

  layout.appendChild(main);
  app.appendChild(layout);
  main.scrollTop = prevScrollTop;

  // Restaurar el foco capturado antes de destruir el DOM — buscamos el
  // input nuevo con el mismo data-focus-key y le devolvemos el foco y la
  // posición exacta del cursor, para que escribir se sienta continuo en
  // vez de perder el foco en cada tecla.
  if (focusKey) {
    const newFocusEl = main.querySelector(`[data-focus-key="${focusKey}"]`);
    if (newFocusEl) {
      newFocusEl.focus();
      if (focusSelectionStart != null && 'setSelectionRange' in newFocusEl) {
        try { newFocusEl.setSelectionRange(focusSelectionStart, focusSelectionEnd); } catch (e) { /* algunos tipos de input no soportan selectionRange */ }
      }
    }
  }

  const t = renderToast();
  if (t) app.appendChild(t);
}

// ── Init ───────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
//  Vault — gate global de Master Password (bloquea toda la app hasta unlock)
// ═══════════════════════════════════════════════════════════════════════════

async function checkVaultGate() {
  const res = await window.corexAPI.vaultExists();
  state.vaultExists = res.exists;
  renderApp();
}

async function submitVaultUnlock() {
  const pw = state.vaultUnlockInput;
  if (!pw.trim()) return;

  // Primera vez (creando la Master Password): exigimos confirmación para
  // evitar que un typo te deje fuera de tus propios datos sin darte cuenta.
  if (!state.vaultExists && pw !== state.vaultUnlockConfirm) {
    state.vaultUnlockError = 'Passwords do not match';
    renderApp();
    return;
  }

  state.vaultUnlocking = true;
  state.vaultUnlockError = null;
  renderApp();

  const res = await window.corexAPI.vaultUnlock(pw);
  state.vaultUnlocking = false;
  state.vaultUnlockInput = '';
  state.vaultUnlockConfirm = '';

  if (!res.ok) {
    state.vaultUnlockError = res.error;
    renderApp();
    return;
  }

  state.vaultUnlocked = true;
  if (res.firstTime) {
    toast(res.migratedLegacy ? 'Master password set — your existing settings were migrated' : 'Master password set', 'ok');
  }

  // Ahora que el vault está desbloqueado, cargamos todo lo que antes se
  // cargaba directamente en init() — config, tickets, favoritos, sesiones...
  await loadAllAfterUnlock();
  renderApp();
}

async function loadAllAfterUnlock() {
  state.config = await window.corexAPI.getConfig();
  setLang(state.config.lang || 'en');
  state.ticketLinks = await window.corexAPI.ticketLinksGet();
  state.favoriteTemplates = await window.corexAPI.favoritesGet();
  state.templateUsage = await window.corexAPI.templateUsageGet();
  await loadCtSessions();
  await loadCtMacros();

  if (state.view === 'inbox' && state.config.jira && state.config.jira.url) {
    loadInbox();
  }
  if (state.config.awx && state.config.awx.url) {
    loadAwxTemplates();
  }
}

function renderVaultGate() {
  const wrap = mk('div', { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0b0d' } });

  const logoSvg = '<svg viewBox="0 0 15559.15 9394.27" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:48px;height:29px;display:block;margin:0 auto 18px;">' +
    '<polygon fill="currentColor" points="4445.48,7673.09 2222.74,4535.94 -0,7673.09" />' +
    '<polygon fill="currentColor" points="11113.67,1398.78 13336.4,4535.93 15559.15,1398.78" />' +
    '<polygon fill="currentColor" points="9039.43,9394.27 2383.41,0 7115.63,0 13771.67,9394.27" />' +
    '</svg>';

  const box = mk('div', { style: { background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '32px', width: '360px', color: '#dfe3e7' } });
  box.appendChild(mk('div', { html: logoSvg, style: { color: '#dfe3e7' } }));
  box.appendChild(mk('div', { style: { fontSize: '14px', fontWeight: '700', textAlign: 'center', marginBottom: '6px' } }, [
    state.vaultExists ? 'Unlock COREX' : 'Set your master password',
  ]));
  box.appendChild(mk('p', { style: { fontSize: '11.5px', color: '#5e6670', textAlign: 'center', marginBottom: '18px', lineHeight: '1.5' } }, [
    state.vaultExists
      ? 'This decrypts your AWX, Jira, SMTP and CorexTerm credentials for this session.'
      : 'This will encrypt every credential you save in COREX — AWX, Jira, SMTP, and CorexTerm sessions. It is never stored anywhere; if you forget it, there is no recovery.',
  ]));

  box.appendChild(mk('input', {
    style: { width: '100%', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', padding: '9px 10px', color: '#dfe3e7', fontSize: '13px', marginBottom: '10px' },
    type: 'password',
    placeholder: 'Master password',
    value: state.vaultUnlockInput,
    oninput: (e) => { state.vaultUnlockInput = e.target.value; },
    onkeydown: (e) => { if (e.key === 'Enter' && state.vaultExists) submitVaultUnlock(); },
  }));

  if (!state.vaultExists) {
    box.appendChild(mk('input', {
      style: { width: '100%', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', padding: '9px 10px', color: '#dfe3e7', fontSize: '13px', marginBottom: '10px' },
      type: 'password',
      placeholder: 'Confirm master password',
      value: state.vaultUnlockConfirm,
      oninput: (e) => { state.vaultUnlockConfirm = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter') submitVaultUnlock(); },
    }));
  }

  if (state.vaultUnlockError) {
    box.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#c94f4f', marginBottom: '10px' } }, [state.vaultUnlockError]));
  }

  box.appendChild(mk('button', {
    style: {
      background: state.vaultUnlocking ? '#22252a' : '#dfe3e7', color: state.vaultUnlocking ? '#5e6670' : '#0a0b0d',
      border: 'none', borderRadius: '3px', padding: '10px 0', width: '100%', fontSize: '13px', fontWeight: '700',
      cursor: state.vaultUnlocking ? 'not-allowed' : 'pointer',
    },
    onclick: () => { if (!state.vaultUnlocking) submitVaultUnlock(); },
  }, [state.vaultUnlocking ? 'Unlocking...' : (state.vaultExists ? 'Unlock' : 'Set password and continue')]));

  wrap.appendChild(box);
  return wrap;
}

async function init() {
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes corex-spin { to { transform: rotate(360deg); } }
    .corex-spinner { animation: corex-spin 0.8s linear infinite; }
    input[type=text]::placeholder, textarea::placeholder { color: #5e6670; }
  `;
  document.head.appendChild(styleEl);

  setupCorextermListeners();

  // Arrancamos siempre por el gate del vault — nada de AWX/Jira/config se
  // carga hasta que el usuario introduce la Master Password correcta.
  await checkVaultGate();
}

init();

// ═══════════════════════════════════════════════════════════════════════════
//  AWX — listar templates, lanzar jobs, ver estado/log en vivo
// ═══════════════════════════════════════════════════════════════════════════

async function loadAwxTemplates() {
  state.awxLoading = true;
  state.awxError = null;
  renderApp();

  const res = await window.corexAPI.awxListJobTemplates();
  state.awxLoading = false;
  if (!res.ok) {
    state.awxError = res.error;
  } else {
    state.awxTemplates = res.results;
  }
  renderApp();
}

function stopAwxPolling() {
  if (state.awxPollHandle) {
    clearInterval(state.awxPollHandle);
    state.awxPollHandle = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Wizard de lanzamiento genérico — replica el wizard nativo de AWX:
//  Instance Groups → Other Prompts → Survey → Preview, cada paso aparece solo
//  si el template lo requiere (vía sus flags ask_*_on_launch / survey_enabled).
//  Ningún paso está hardcodeado a un template concreto.
// ═══════════════════════════════════════════════════════════════════════════

const OTHER_PROMPT_FLAGS = [
  'ask_variables_on_launch', 'ask_limit_on_launch', 'ask_tags_on_launch', 'ask_skip_tags_on_launch',
  'ask_job_type_on_launch', 'ask_verbosity_on_launch', 'ask_inventory_on_launch', 'ask_credential_on_launch',
  'ask_execution_environment_on_launch', 'ask_scm_branch_on_launch', 'ask_forks_on_launch',
  'ask_diff_mode_on_launch', 'ask_labels_on_launch', 'ask_job_slice_count_on_launch', 'ask_timeout_on_launch',
];

function templateHasOtherPrompts(tpl) {
  return OTHER_PROMPT_FLAGS.some((flag) => tpl[flag]);
}

// Paso 1 al pulsar "Run": construimos el wizard mirando qué pasos aplican a
// este template concreto. Si no aplica ninguno, lanzamos directo.
async function prepareAwxLaunch(tpl) {
  state.awxSelectedTemplate = tpl;
  state.awxLaunchLoading = true;
  renderApp();

  const needsInstanceGroups = !!tpl.ask_instance_groups_on_launch;
  const needsOtherPrompts = templateHasOtherPrompts(tpl);
  const needsSurvey = !!tpl.survey_enabled;

  const wizard = {
    template: tpl,
    steps: [],
    currentStepIndex: 0,
    instanceGroups: { available: [], selected: [] },
    otherPrompts: { limit: '', job_tags: '', skip_tags: '', scm_branch: '', inventory: null, credentials: [], execution_environment: null },
    inventories: [],
    credentialsList: [],
    executionEnvironments: [],
    surveySpec: null,
    surveyAnswers: {},
  };

  if (needsInstanceGroups) wizard.steps.push('instance_groups');
  if (needsOtherPrompts) wizard.steps.push('other_prompts');
  if (needsSurvey) wizard.steps.push('survey');

  // Cargamos los datos de cada paso que aplique, en paralelo.
  const loaders = [];
  if (needsInstanceGroups) loaders.push(window.corexAPI.awxListInstanceGroups().then((r) => { if (r.ok) wizard.instanceGroups.available = r.results; }));
  if (needsOtherPrompts && tpl.ask_inventory_on_launch) loaders.push(window.corexAPI.awxListInventories().then((r) => { if (r.ok) wizard.inventories = r.results; }));
  if (needsOtherPrompts && tpl.ask_credential_on_launch) loaders.push(window.corexAPI.awxListCredentials().then((r) => { if (r.ok) wizard.credentialsList = r.results; }));
  if (needsOtherPrompts && tpl.ask_execution_environment_on_launch) loaders.push(window.corexAPI.awxListExecutionEnvironments().then((r) => { if (r.ok) wizard.executionEnvironments = r.results; }));
  if (needsSurvey) {
    loaders.push(window.corexAPI.awxGetSurveySpec(tpl.id).then((r) => {
      if (r.ok && r.spec && r.spec.spec && r.spec.spec.length > 0) {
        wizard.surveySpec = r.spec;
        r.spec.spec.forEach((q) => { wizard.surveyAnswers[q.variable] = q.default != null ? q.default : ''; });
      } else {
        // El flag decía que había survey pero vino vacío: quitamos el paso para no bloquear.
        wizard.steps = wizard.steps.filter((s) => s !== 'survey');
      }
    }));
  }

  await Promise.all(loaders);
  state.awxLaunchLoading = false;

  if (wizard.steps.length === 0) {
    // Sin pasos que requieran input: lanzamos directo, como antes.
    launchAwxJob();
    return;
  }

  wizard.steps.push('preview');
  state.awxLaunchWizard = wizard;
  renderApp();
}

function wizardStepValid(wizard) {
  const step = wizard.steps[wizard.currentStepIndex];
  if (step === 'survey' && wizard.surveySpec) {
    return !(wizard.surveySpec.spec || []).some((q) => q.required && !String(wizard.surveyAnswers[q.variable] || '').trim());
  }
  // instance_groups y other_prompts son siempre opcionales para avanzar
  // (igual que en AWX: puedes dejarlos vacíos y se usan los valores por defecto del template).
  return true;
}

// Como wizardStepValid() solo devuelve true/false, cuando el botón se queda
// gris sin razón aparente no hay forma de saber cuál de las N preguntas es
// la culpable sin abrir DevTools. Esta función identifica la pregunta
// concreta que está bloqueando el avance, para mostrarlo en la propia UI.
function wizardSurveyBlockingQuestion(wizard) {
  if (!wizard.surveySpec) return null;
  return (wizard.surveySpec.spec || []).find((q) => q.required && !String(wizard.surveyAnswers[q.variable] || '').trim()) || null;
}

function renderAwxLaunchWizard() {
  const wizard = state.awxLaunchWizard;
  const tpl = wizard.template;
  const step = wizard.steps[wizard.currentStepIndex];
  const wrap = mk('div', {});

  // ── Indicador de pasos ──
  const stepLabels = { instance_groups: 'Instance Groups', other_prompts: 'Other Prompts', survey: 'Survey', preview: 'Preview' };
  const stepsRow = mk('div', { style: { display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' } });
  wizard.steps.forEach((s, i) => {
    const active = i === wizard.currentStepIndex;
    const done = i < wizard.currentStepIndex;
    stepsRow.appendChild(mk('div', {
      style: {
        fontSize: '10.5px', padding: '4px 10px', borderRadius: '20px',
        background: active ? '#14161a' : 'transparent',
        border: `1px solid ${active ? '#dfe3e7' : done ? '#2a6b3d' : '#22252a'}`,
        color: active ? '#dfe3e7' : done ? '#6ad17e' : '#5e6670',
        fontWeight: active ? '700' : '500',
      },
    }, [`${i + 1}. ${stepLabels[s]}`]));
  });
  wrap.appendChild(stepsRow);

  wrap.appendChild(mk('div', { style: { fontSize: '13px', fontWeight: '700', color: '#dfe3e7', marginBottom: '14px' } }, [tpl.name]));

  // ── Contenido del paso actual ──
  if (step === 'instance_groups') {
    wrap.appendChild(renderInstanceGroupsStep(wizard));
  } else if (step === 'other_prompts') {
    wrap.appendChild(renderOtherPromptsStep(wizard));
  } else if (step === 'survey') {
    wrap.appendChild(renderSurveyStep(wizard));
  } else if (step === 'preview') {
    wrap.appendChild(renderPreviewStep(wizard));
  }

  // ── Navegación ──
  const valid = wizardStepValid(wizard);
  const navRow = mk('div', { style: { display: 'flex', gap: '8px', marginTop: '16px' } });
  if (wizard.currentStepIndex > 0) {
    navRow.appendChild(mk('button', {
      style: { background: 'transparent', border: '1px solid #22252a', color: '#5e6670', borderRadius: '3px', padding: '9px 18px', fontSize: '13px', cursor: 'pointer' },
      onclick: () => { wizard.currentStepIndex -= 1; renderApp(); },
    }, ['← Back']));
  }
  const isLast = step === 'preview';
  navRow.appendChild(mk('button', {
    style: {
      background: !valid ? '#22252a' : '#dfe3e7', color: !valid ? '#5e6670' : '#0a0b0d',
      border: 'none', borderRadius: '3px', padding: '9px 22px', fontSize: '13px', fontWeight: '700',
      cursor: !valid ? 'not-allowed' : 'pointer',
    },
    onclick: () => {
      if (!valid) return;
      if (isLast) launchAwxJob();
      else { wizard.currentStepIndex += 1; renderApp(); }
    },
  }, [isLast ? '▶ ' + t('awx_launch_button') : t('awx_continue_button') + ' →']));
  navRow.appendChild(mk('span', {
    style: { fontSize: '12px', color: '#5e6670', cursor: 'pointer', alignSelf: 'center', marginLeft: '4px' },
    onclick: () => { state.awxLaunchWizard = null; renderApp(); },
  }, ['Cancel']));
  wrap.appendChild(navRow);

  // Si el botón está bloqueado en el paso de survey, decimos exactamente
  // qué pregunta falta — sin esto, no hay forma de saberlo sin abrir
  // DevTools cuando hay varios campos y "algo" no cuenta como relleno.
  if (!valid && step === 'survey') {
    const blocking = wizardSurveyBlockingQuestion(wizard);
    if (blocking) {
      wrap.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#c98a3a', marginTop: '8px' } }, [
        `Missing required field: "${blocking.question_name}" (variable: ${blocking.variable}, type: ${blocking.type})`,
      ]));
    }
  }

  return wrap;
}

function renderInstanceGroupsStep(wizard) {
  const wrap = mk('div', {});
  wrap.appendChild(mk('p', { style: { fontSize: '12px', color: '#5e6670', marginBottom: '12px' } }, [
    'Select which instance group(s) should run this job. Leave empty to use the template default.',
  ]));
  if (wizard.instanceGroups.available.length === 0) {
    wrap.appendChild(mk('div', { style: { fontSize: '12px', color: '#5e6670' } }, ['Loading…']));
    return wrap;
  }
  wizard.instanceGroups.available.forEach((ig) => {
    const checked = wizard.instanceGroups.selected.includes(ig.id);
    wrap.appendChild(mk('div', { style: { padding: '7px 0', fontSize: '13px', color: '#dfe3e7' } }, [
      renderCheckbox(checked, (e) => {
        if (e.target.checked) wizard.instanceGroups.selected.push(ig.id);
        else wizard.instanceGroups.selected = wizard.instanceGroups.selected.filter((id) => id !== ig.id);
        renderApp();
      }, ig.name),
    ]));
  });
  return wrap;
}

function renderOtherPromptsStep(wizard) {
  const tpl = wizard.template;
  const wrap = mk('div', {});
  const op = wizard.otherPrompts;

  function textField(label, key, placeholder) {
    wrap.appendChild(mk('label', { style: { fontSize: '11px', color: '#5e6670', display: 'block', marginBottom: '4px', marginTop: '10px' } }, [label]));
    wrap.appendChild(mk('input', {
      style: { width: '100%', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', padding: '8px 10px', color: '#dfe3e7', fontSize: '13px' },
      type: 'text', placeholder: placeholder || '', value: op[key] || '',
      oninput: (e) => { op[key] = e.target.value; },
    }));
  }

  if (tpl.ask_limit_on_launch) textField('Limit', 'limit', 'e.g. hostname or group');
  if (tpl.ask_scm_branch_on_launch) textField('SCM Branch', 'scm_branch', tpl.scm_branch || 'default');
  if (tpl.ask_tags_on_launch) textField('Job Tags', 'job_tags');
  if (tpl.ask_skip_tags_on_launch) textField('Skip Tags', 'skip_tags');

  if (tpl.ask_inventory_on_launch) {
    wrap.appendChild(mk('label', { style: { fontSize: '11px', color: '#5e6670', display: 'block', marginBottom: '4px', marginTop: '10px' } }, ['Inventory']));
    const select = mk('select', {
      style: { width: '100%', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', padding: '8px 10px', color: '#dfe3e7', fontSize: '13px' },
      onchange: (e) => { op.inventory = Number(e.target.value) || null; },
    }, [mk('option', { value: '' }, ['(template default)'])]);
    wizard.inventories.forEach((inv) => {
      select.appendChild(mk('option', { value: String(inv.id), selected: op.inventory === inv.id }, [inv.name]));
    });
    wrap.appendChild(select);
  }

  if (tpl.ask_credential_on_launch) {
    wrap.appendChild(mk('label', { style: { fontSize: '11px', color: '#5e6670', display: 'block', marginBottom: '4px', marginTop: '10px' } }, ['Credentials']));
    wizard.credentialsList.slice(0, 12).forEach((cred) => {
      const checked = op.credentials.includes(cred.id);
      wrap.appendChild(mk('div', { style: { padding: '5px 0', fontSize: '12.5px', color: '#dfe3e7' } }, [
        renderCheckbox(checked, (e) => {
          if (e.target.checked) op.credentials.push(cred.id);
          else op.credentials = op.credentials.filter((id) => id !== cred.id);
          renderApp();
        }, `${cred.name} (${cred.kind})`),
      ]));
    });
  }

  if (tpl.ask_execution_environment_on_launch) {
    wrap.appendChild(mk('label', { style: { fontSize: '11px', color: '#5e6670', display: 'block', marginBottom: '4px', marginTop: '10px' } }, ['Execution Environment']));
    const select = mk('select', {
      style: { width: '100%', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', padding: '8px 10px', color: '#dfe3e7', fontSize: '13px' },
      onchange: (e) => { op.execution_environment = Number(e.target.value) || null; },
    }, [mk('option', { value: '' }, ['(template default)'])]);
    wizard.executionEnvironments.forEach((ee) => {
      select.appendChild(mk('option', { value: String(ee.id), selected: op.execution_environment === ee.id }, [ee.name]));
    });
    wrap.appendChild(select);
  }

  return wrap;
}

function renderSurveyStep(wizard) {
  const wrap = mk('div', {});
  if (!wizard.surveySpec) {
    wrap.appendChild(mk('div', { style: { fontSize: '12px', color: '#5e6670' } }, [t('awx_survey_loading')]));
    return wrap;
  }

  (wizard.surveySpec.spec || []).forEach((q) => {
    const col = mk('div', { style: { marginBottom: '12px' } });
    col.appendChild(mk('label', { style: { fontSize: '11px', color: '#5e6670', display: 'block', marginBottom: '4px' } }, [
      q.question_name + (q.required ? ` (${t('awx_survey_required')})` : ''),
    ]));

    if (q.type === 'multiplechoice' || q.type === 'multiselect') {
      const select = mk('select', {
        style: { width: '100%', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', padding: '8px 10px', color: '#dfe3e7', fontSize: '13px' },
        onchange: (e) => { wizard.surveyAnswers[q.variable] = e.target.value; },
      });
      (q.choices || []).forEach((choice) => {
        select.appendChild(mk('option', { value: choice, selected: wizard.surveyAnswers[q.variable] === choice }, [choice]));
      });
      col.appendChild(select);
    } else if (q.type === 'textarea') {
      // AWX define 'textarea' como tipo de pregunta aparte de 'text' —
      // multilínea de verdad, pensado justo para esto: pegar listas de
      // servidores, bloques de configuración, etc. sin que se aplasten
      // en una sola línea.
      const ta = mk('textarea', {
        style: {
          width: '100%', minHeight: '110px', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px',
          padding: '8px 10px', color: '#dfe3e7', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical',
        },
        placeholder: q.default || '',
        'data-focus-key': `survey-${q.variable}`,
        oninput: (e) => { wizard.surveyAnswers[q.variable] = e.target.value; },
      });
      // A diferencia de <input>, un <textarea> no tiene atributo "value" —
      // su contenido inicial hay que asignarlo a la propiedad .value del
      // elemento DOM directamente, o setAttribute('value', ...) no hace
      // nada y el campo siempre nace vacío visualmente en cada re-render,
      // aunque wizard.surveyAnswers ya tuviera el texto guardado.
      ta.value = wizard.surveyAnswers[q.variable] || '';
      col.appendChild(ta);
    } else {
      col.appendChild(mk('input', {
        style: { width: '100%', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', padding: '8px 10px', color: '#dfe3e7', fontSize: '13px' },
        type: q.type === 'password' ? 'password' : q.type === 'integer' || q.type === 'float' ? 'number' : 'text',
        placeholder: q.default || '',
        value: wizard.surveyAnswers[q.variable] || '',
        oninput: (e) => { wizard.surveyAnswers[q.variable] = e.target.value; },
      }));
    }
    wrap.appendChild(col);
  });

  return wrap;
}

function renderPreviewStep(wizard) {
  const wrap = mk('div', { style: { fontSize: '12.5px', color: '#dfe3e7', lineHeight: '1.8' } });
  if (wizard.steps.includes('instance_groups')) {
    const names = wizard.instanceGroups.available.filter((ig) => wizard.instanceGroups.selected.includes(ig.id)).map((ig) => ig.name);
    wrap.appendChild(mk('div', {}, [mk('span', { style: { color: '#5e6670' } }, ['Instance groups: ']), names.length ? names.join(', ') : '(template default)']));
  }
  if (wizard.steps.includes('other_prompts')) {
    const op = wizard.otherPrompts;
    if (wizard.template.ask_limit_on_launch) wrap.appendChild(mk('div', {}, [mk('span', { style: { color: '#5e6670' } }, ['Limit: ']), op.limit || '—']));
    if (wizard.template.ask_scm_branch_on_launch) wrap.appendChild(mk('div', {}, [mk('span', { style: { color: '#5e6670' } }, ['Branch: ']), op.scm_branch || wizard.template.scm_branch || 'default']));
    if (wizard.template.ask_tags_on_launch) wrap.appendChild(mk('div', {}, [mk('span', { style: { color: '#5e6670' } }, ['Tags: ']), op.job_tags || '—']));
  }
  if (wizard.steps.includes('survey') && wizard.surveySpec) {
    wrap.appendChild(mk('div', { style: { marginTop: '8px', fontSize: '10px', color: '#5e6670', letterSpacing: '0.5px', textTransform: 'uppercase' } }, ['Survey answers']));
    (wizard.surveySpec.spec || []).forEach((q) => {
      const answer = String(wizard.surveyAnswers[q.variable] || '');
      if (q.type === 'textarea' && answer.includes('\n')) {
        // Mostramos explícitamente cada línea por separado — un <div> normal
        // colapsa los \n visualmente aunque el dato en memoria sí los tenga,
        // lo que puede dar la falsa impresión de que se va a enviar todo
        // junto en una sola línea cuando en realidad está bien formado.
        const lines = answer.split('\n').filter((l) => l.trim());
        wrap.appendChild(mk('div', { style: { marginBottom: '2px' } }, [
          mk('span', { style: { color: '#5e6670' } }, [`${q.question_name} (${lines.length} lines): `]),
        ]));
        const linesBox = mk('div', { style: { background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', padding: '8px 10px', marginBottom: '8px', fontSize: '11.5px' } });
        lines.forEach((line) => linesBox.appendChild(mk('div', {}, [line])));
        wrap.appendChild(linesBox);
      } else {
        wrap.appendChild(mk('div', {}, [mk('span', { style: { color: '#5e6670' } }, [`${q.question_name}: `]), answer || '—']));
      }
    });
  }
  wrap.appendChild(mk('div', { style: { marginTop: '8px', fontSize: '10px', color: '#5e6670', letterSpacing: '0.5px', textTransform: 'uppercase' } }, ['Linked ticket']));
  wrap.appendChild(mk('div', {}, [state.awxExtraVarsTicket.trim() || '—']));
  return wrap;
}

async function toggleFavoriteTemplate(templateId) {
  state.favoriteTemplates = await window.corexAPI.favoritesToggle(templateId);
  renderApp();
}

async function launchAwxJob() {
  if (!state.awxSelectedTemplate) return;
  const wizard = state.awxLaunchWizard;

  const extraVars = wizard ? { ...wizard.surveyAnswers } : {};
  if (wizard && wizard.surveySpec) {
    // Normalizamos saltos de línea a \n puro en los campos textarea — en
    // Windows, un <textarea> puede devolver \r\n (CRLF). Si el playbook de
    // Ansible del otro lado hace un split('\n') simple, cada línea se queda
    // con un \r residual al final (p.ej. "host01.axadmin.net\r"), lo que
    // puede hacer que el host no se reconozca como válido y el job se
    // comporte como si solo hubiera recibido una entrada.
    (wizard.surveySpec.spec || []).forEach((q) => {
      if (q.type === 'textarea' && typeof extraVars[q.variable] === 'string') {
        extraVars[q.variable] = extraVars[q.variable].replace(/\r\n/g, '\n');
      }
    });
  }
  if (state.awxExtraVarsTicket.trim()) {
    extraVars.ticket = state.awxExtraVarsTicket.trim();
  }

  // Verificación visible de que los saltos de línea de campos multilínea
  // (textarea) llegan intactos hasta el momento de enviar — antes de que
  // pasen por IPC y por la llamada HTTP a AWX. Si aquí ya se ven aplastados
  // a una sola línea, el bug está en el formulario, no en el transporte.
  console.log('[COREX] extra_vars a enviar:', JSON.stringify(extraVars, null, 2));

  const launchOptions = {};
  if (wizard) {
    if (wizard.instanceGroups.selected.length > 0) launchOptions.instance_groups = wizard.instanceGroups.selected;
    const op = wizard.otherPrompts;
    if (op.limit) launchOptions.limit = op.limit;
    if (op.scm_branch) launchOptions.scm_branch = op.scm_branch;
    if (op.job_tags) launchOptions.job_tags = op.job_tags;
    if (op.skip_tags) launchOptions.skip_tags = op.skip_tags;
    if (op.inventory) launchOptions.inventory = op.inventory;
    if (op.credentials.length > 0) launchOptions.credentials = op.credentials;
    if (op.execution_environment) launchOptions.execution_environment = op.execution_environment;
  }

  state.awxRunningJob = { status: 'launching' };
  state.awxStdout = '';
  state.awxLaunchWizard = null;
  renderApp();

  const res = await window.corexAPI.awxLaunchJob(state.awxSelectedTemplate.id, extraVars, launchOptions);
  if (!res.ok) {
    state.awxRunningJob = null;
    toast(`${t('inbox_job_launch_failed')} ${res.error}`, 'err');
    renderApp();
    return;
  }

  state.templateUsage = await window.corexAPI.templateUsageGet();
  state.awxRunningJob = res.job;
  toast(`Job #${res.job.id}`, 'ok');
  renderApp();

  stopAwxPolling();
  state.awxPollHandle = setInterval(() => pollAwxJob(res.job.id), 2500);
  pollAwxJob(res.job.id);
}

async function pollAwxJob(jobId) {
  const [jobRes, stdoutRes] = await Promise.all([
    window.corexAPI.awxGetJob(jobId),
    window.corexAPI.awxGetJobStdout(jobId),
  ]);

  if (jobRes.ok) state.awxRunningJob = jobRes.job;
  if (stdoutRes.ok) state.awxStdout = stdoutRes.stdout;

  const finished = jobRes.ok && ['successful', 'failed', 'error', 'canceled'].includes(jobRes.job.status);
  if (finished) {
    stopAwxPolling();
    onAwxJobFinished(jobRes.job);
  }
  renderApp();
}

// Hook: cuando el job termina, aquí enganchamos comentario/adjunto/correo más adelante
function onAwxJobFinished(job) {
  const ok = job.status === 'successful';
  toast(
    ok ? t('awx_job_finished_ok', { id: job.id }) : t('awx_job_finished_status', { id: job.id, status: job.status }),
    ok ? 'ok' : 'err'
  );
}

function awxStatusColor(status) {
  const map = {
    successful: '#6ad17e',
    failed: '#c94f4f',
    error: '#c94f4f',
    canceled: '#c98a3a',
    running: '#5b9bd5',
    pending: '#c98a3a',
    waiting: '#c98a3a',
    launching: '#5b9bd5',
  };
  return map[status] || '#5e6670';
}

// Fondo tenue + texto de color para cada estado — más visible de un
// vistazo que solo un borde, igual que en dashboards de monitorización.
function awxStatusChipBg(status) {
  const map = {
    successful: '#102a18',
    failed: '#2a1414',
    error: '#2a1414',
    canceled: '#2a2008',
    running: '#15233a',
    pending: '#2a2008',
    waiting: '#2a2008',
    launching: '#15233a',
  };
  return map[status] || C.surface2;
}

function renderAwxStatusChip(status) {
  return mk('span', {
    style: {
      fontSize: T.xs, fontWeight: '700', color: awxStatusColor(status),
      background: awxStatusChipBg(status), borderRadius: R.sm, padding: '2px 8px',
    },
  }, [status || 'unknown']);
}

function renderRecentJobsSection() {
  const wrap = mk('div', { style: { marginBottom: S[6] } });
  wrap.appendChild(mk('div', {
    style: { fontSize: T.sm, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: S[3] },
  }, ['Recent job runs']));

  const card = mk('div', { style: { background: C.surface1, border: `1px solid ${C.border}`, borderRadius: R.sm, padding: S[3] } });

  if (state.awxRecentJobsError) {
    card.appendChild(mk('div', { style: { fontSize: T.sm, color: C.danger } }, [state.awxRecentJobsError]));
    wrap.appendChild(card);
    return wrap;
  }
  if (state.awxRecentJobsLoading && state.awxRecentJobs.length === 0) {
    card.appendChild(mk('div', { style: { fontSize: T.sm, color: C.textSecondary } }, ['Loading…']));
    wrap.appendChild(card);
    return wrap;
  }
  if (state.awxRecentJobs.length === 0) {
    card.appendChild(mk('div', { style: { fontSize: T.sm, color: C.textSecondary } }, ['No recent job runs.']));
    wrap.appendChild(card);
    return wrap;
  }

  state.awxRecentJobs.forEach((job, i) => {
    const row = mk('div', {
      style: {
        display: 'flex', flexDirection: 'column', gap: S[1], padding: `${S[2]} 0`,
        borderBottom: i < state.awxRecentJobs.length - 1 ? `1px solid ${C.surface2}` : 'none',
      },
    });
    const topRow = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } });
    topRow.appendChild(mk('span', {
      style: { fontSize: T.base, color: C.textPrimary, fontWeight: '500' },
    }, [job.name || job.job_template_name || `Job #${job.id}`]));
    topRow.appendChild(renderAwxStatusChip(job.status));
    row.appendChild(topRow);

    const metaParts = [];
    if (job.finished) metaParts.push(`finished ${formatRelativeTime(job.finished)}`);
    else if (job.started) metaParts.push(`running · started ${formatRelativeTime(job.started)}`);
    if (job.elapsed) metaParts.push(`${job.elapsed.toFixed(0)}s elapsed`);
    row.appendChild(mk('div', { style: { fontSize: T.xs, color: C.textSecondary } }, [metaParts.join(' · ')]));

    // Blast radius visual: solo lo mostramos si el job ha fallado o tiene
    // hosts inalcanzables — para un job exitoso no aporta nada verlo.
    // host_status_counts viene de la API de AWX con claves como ok/failed/
    // dark(unreachable)/changed/skipped — sumamos failed+dark como "hosts
    // con problema" para el blast radius, igual que hace la barra de
    // estado de hosts en la UI nativa de AWX.
    const hsc = job.host_status_counts || {};
    const failedCount = (hsc.failed || 0) + (hsc.dark || 0);
    const totalHosts = Object.values(hsc).reduce((a, b) => a + b, 0);
    if (totalHosts > 0 && failedCount > 0) {
      const pct = (failedCount / totalHosts) * 100;
      row.appendChild(mk('div', { style: { background: C.surface2, borderRadius: '2px', height: '4px', overflow: 'hidden', marginTop: '2px' } }, [
        mk('div', { style: { width: `${pct}%`, height: '100%', background: C.warning } }),
      ]));
      row.appendChild(mk('div', { style: { fontSize: T.xs, color: C.warning } }, [`${failedCount} of ${totalHosts} hosts failed`]));
    }

    card.appendChild(row);
  });

  wrap.appendChild(card);
  return wrap;
}

function formatRelativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function renderAwxView() {
  const wrap = mk('div', { style: { maxWidth: '900px' } });

  wrap.appendChild(mk('h1', {
    style: { fontSize: '22px', fontWeight: '700', marginBottom: '4px', color: '#dfe3e7' },
  }, [t('awx_title')]));
  wrap.appendChild(mk('p', {
    style: { fontSize: '13px', color: '#5e6670', marginBottom: '24px' },
  }, [t('awx_subtitle')]));

  if (!state.config.awx || !state.config.awx.url) {
    wrap.appendChild(mk('div', {
      style: {
        background: '#14161a', border: '1px solid #2a2d33', borderRadius: '4px',
        padding: '18px 20px', fontSize: '13px', color: '#dfe3e7',
      },
    }, [
      t('awx_not_configured') + ' ',
      mk('span', { style: { color: '#dfe3e7', cursor: 'pointer', fontWeight: '600' }, onclick: () => { state.view = 'settings'; renderApp(); } }, [t('nav_settings')]),
      ' ' + t('awx_not_configured_suffix'),
    ]));
    return wrap;
  }

  // Error banner
  if (state.awxError) {
    wrap.appendChild(mk('div', {
      style: {
        background: '#1a0f0f', border: '1px solid #5c2b2b', borderRadius: '4px',
        padding: '14px 18px', fontSize: '13px', color: '#c94f4f', marginBottom: '20px',
      },
    }, [`${t('awx_load_error')} ${state.awxError}`]));
  }

  // Jobs recientes de todos los templates, con chips de estado + blast
  // radius — panorama rápido antes de bajar a la lista completa.
  wrap.appendChild(renderRecentJobsSection());

  const headerRow = mk('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  }, [
    mk('span', { style: { fontSize: '12px', fontWeight: '700', color: '#5e6670', textTransform: 'uppercase', letterSpacing: '0.5px' } }, [t('awx_job_templates')]),
  ]);
  const headerActions = mk('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } });
  headerActions.appendChild(renderCheckbox(state.awxSortFavoritesFirst, (e) => {
    state.awxSortFavoritesFirst = e.target.checked;
    renderApp();
  }, mk('span', { style: { fontSize: '11px', color: '#5e6670' } }, [t('awx_sort_favorites')])));
  headerActions.appendChild(mk('button', {
    style: {
      background: 'transparent', border: '1px solid #22252a', color: '#5e6670',
      borderRadius: '3px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer',
    },
    onclick: () => loadAwxTemplates(),
  }, [state.awxLoading ? '...' : '↻ ' + t('awx_reload')]));
  headerRow.appendChild(headerActions);
  wrap.appendChild(headerRow);

  wrap.appendChild(mk('input', {
    style: {
      width: '100%', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px',
      padding: '9px 12px', color: '#dfe3e7', fontSize: '13px', marginBottom: '12px',
    },
    type: 'text',
    placeholder: t('awx_search_placeholder'),
    value: state.awxFilter,
    'data-focus-key': 'awx-filter-main',
    oninput: (e) => { state.awxFilter = e.target.value; renderApp(); },
  }));

  const filterText = state.awxFilter.trim().toLowerCase();
  let filteredTemplates = filterText
    ? state.awxTemplates.filter((tpl) =>
        (tpl.name || '').toLowerCase().includes(filterText) ||
        (tpl.description || '').toLowerCase().includes(filterText)
      )
    : state.awxTemplates.slice();

  if (state.awxSortFavoritesFirst) {
    filteredTemplates = filteredTemplates.slice().sort((a, b) => {
      const aFav = state.favoriteTemplates.includes(a.id) ? 1 : 0;
      const bFav = state.favoriteTemplates.includes(b.id) ? 1 : 0;
      return bFav - aFav;
    });
  }

  if (state.awxLoading) {
    wrap.appendChild(mk('div', { style: { color: '#5e6670', fontSize: '13px', padding: '20px 0' } }, [t('awx_loading')]));
  } else if (state.awxTemplates.length === 0 && !state.awxError) {
    wrap.appendChild(mk('div', { style: { color: '#5e6670', fontSize: '13px', padding: '20px 0' } }, [t('awx_empty')]));
  } else if (filteredTemplates.length === 0) {
    wrap.appendChild(mk('div', { style: { color: '#5e6670', fontSize: '13px', padding: '20px 0' } }, [`${t('awx_no_results_for')} "${state.awxFilter}".`]));
  } else {
    filteredTemplates.forEach((tpl) => {
      const isFav = state.favoriteTemplates.includes(tpl.id);
      const usageCount = state.templateUsage[tpl.id] || 0;
      const usageLabel = usageCount === 0 ? t('awx_never_run') : usageCount === 1 ? t('awx_used_once') : t('awx_used_times', { n: usageCount });

      const row = mk('div', {
        style: {
          padding: '12px 14px',
          borderRadius: '3px',
          marginBottom: '6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          background: '#0d0e10',
          border: '1px solid #22252a',
        },
        onclick: () => openAwxDetail(tpl, 'awx'),
      });

      const star = mk('span', {
        style: { fontSize: '15px', color: isFav ? '#c98a3a' : '#3a3f44', cursor: 'pointer', lineHeight: '1.4', flexShrink: '0' },
        onclick: (e) => { e.stopPropagation(); toggleFavoriteTemplate(tpl.id); },
        title: isFav ? t('awx_unfavorite') : t('awx_favorite'),
      }, [isFav ? '★' : '☆']);

      const body = mk('div', { style: { flex: '1', minWidth: '0' } }, [
        mk('div', { style: { fontSize: '13.5px', fontWeight: '600', color: '#dfe3e7', marginBottom: '2px' } }, [tpl.name]),
        mk('div', { style: { fontSize: '11.5px', color: '#5e6670' } }, [tpl.description || `ID ${tpl.id}`]),
        mk('div', { style: { fontSize: '10.5px', color: '#5e6670', marginTop: '3px' } }, [usageLabel]),
      ]);

      row.appendChild(star);
      row.appendChild(body);
      wrap.appendChild(row);
    });
  }

  return wrap;
}

// ── Vista de detalle de un Template: info completa + lanzar (con survey) + log vivo + historial ──
async function openAwxDetail(tpl, returnView) {
  state.awxSelectedTemplate = tpl;
  state.awxDetailTemplate = tpl;
  state.awxDetailReturnView = returnView || 'awx';
  state.awxLaunchWizard = null;
  state.awxJobHistory = [];
  state.awxJobHistoryPage = 1;
  state.awxJobHistoryError = null;
  state.view = 'awx-detail';
  renderApp();
  loadAwxJobHistory(tpl.id, 1);
}

async function loadAwxRecentJobs() {
  if (!state.config.awx || !state.config.awx.url) return;
  state.awxRecentJobsLoading = true;
  state.awxRecentJobsError = null;
  renderApp();

  const res = await window.corexAPI.awxGetRecentJobs(8);
  state.awxRecentJobsLoading = false;
  if (!res.ok) {
    state.awxRecentJobsError = res.error;
  } else {
    state.awxRecentJobs = res.jobs;
  }
  renderApp();
}

async function loadAwxJobHistory(templateId, page) {
  state.awxJobHistoryLoading = true;
  state.awxJobHistoryError = null;
  renderApp();

  const res = await window.corexAPI.awxGetTemplateJobHistory(templateId, page);
  state.awxJobHistoryLoading = false;
  if (!res.ok) {
    state.awxJobHistoryError = res.error;
  } else {
    state.awxJobHistory = page === 1 ? res.jobs : state.awxJobHistory.concat(res.jobs);
    state.awxJobHistoryPage = page;
    state.awxJobHistoryHasNext = res.hasNext;
  }
  renderApp();
}

function renderAwxDetailView() {
  const tpl = state.awxDetailTemplate;
  const wrap = mk('div', { style: { maxWidth: '760px' } });

  if (!tpl) {
    wrap.appendChild(mk('div', { style: { color: '#5e6670', fontSize: '13px' } }, ['—']));
    return wrap;
  }

  const isFav = state.favoriteTemplates.includes(tpl.id);
  const usageCount = state.templateUsage[tpl.id] || 0;
  const usageLabel = usageCount === 0 ? t('awx_never_run') : usageCount === 1 ? t('awx_used_once') : t('awx_used_times', { n: usageCount });

  // ── Header con volver + favorito ──
  const headerRow = mk('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' } });
  headerRow.appendChild(mk('span', {
    style: { fontSize: '12px', color: '#dfe3e7', cursor: 'pointer', fontWeight: '600' },
    onclick: () => { state.view = state.awxDetailReturnView; renderApp(); },
  }, ['← ' + t(state.awxDetailReturnView === 'inbox' ? 'nav_inbox' : 'nav_awx')]));
  wrap.appendChild(headerRow);

  const titleRow = mk('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', marginBottom: '4px' } });
  titleRow.appendChild(mk('h1', { style: { fontSize: '20px', fontWeight: '700', color: '#dfe3e7' } }, [tpl.name]));
  titleRow.appendChild(mk('span', {
    style: { fontSize: '18px', color: isFav ? '#c98a3a' : '#3a3f44', cursor: 'pointer' },
    onclick: () => toggleFavoriteTemplate(tpl.id),
    title: isFav ? t('awx_unfavorite') : t('awx_favorite'),
  }, [isFav ? '★' : '☆']));
  wrap.appendChild(titleRow);
  wrap.appendChild(mk('p', { style: { fontSize: '12.5px', color: '#5e6670', marginBottom: '20px' } }, [tpl.description || `ID ${tpl.id} · ${usageLabel}`]));

  // ── Info completa (lo que ya conocíamos del JSON real de AWX) ──
  const inv = tpl.summary_fields && tpl.summary_fields.inventory;
  const proj = tpl.summary_fields && tpl.summary_fields.project;
  const creds = (tpl.summary_fields && tpl.summary_fields.credentials) || [];
  const userCaps = tpl.summary_fields && tpl.summary_fields.user_capabilities;

  const infoGrid = mk('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px', background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '18px 20px' } });

  const executesCol = mk('div', {});
  executesCol.appendChild(mk('div', { style: { fontSize: '10px', color: '#5e6670', letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' } }, ['Executes']));
  executesCol.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#dfe3e7', lineHeight: '1.9' } }, [
    mk('div', {}, [mk('span', { style: { color: '#5e6670' } }, ['playbook ']), tpl.playbook || '—']),
    mk('div', {}, [mk('span', { style: { color: '#5e6670' } }, ['project ']), (proj && proj.name) || '—']),
    mk('div', {}, [mk('span', { style: { color: '#5e6670' } }, ['branch ']), tpl.scm_branch || 'default']),
  ]));

  const runsAsCol = mk('div', {});
  runsAsCol.appendChild(mk('div', { style: { fontSize: '10px', color: '#5e6670', letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' } }, ['Runs against']));
  const blastRisk = inv && inv.hosts_with_active_failures > 0;
  runsAsCol.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#dfe3e7', lineHeight: '1.9' } }, [
    mk('div', {}, [mk('span', { style: { color: '#5e6670' } }, ['inventory ']), (inv && inv.name) || '—']),
    mk('div', { style: { color: blastRisk ? '#c98a3a' : '#dfe3e7' } }, [
      mk('span', { style: { color: blastRisk ? '#c98a3a' : '#5e6670' } }, ['hosts ']),
      inv ? `${inv.total_hosts}${inv.hosts_with_active_failures ? ` (${inv.hosts_with_active_failures} failing now)` : ''}` : '—',
    ]),
    mk('div', {}, [mk('span', { style: { color: '#5e6670' } }, ['credential ']), creds.map((c) => c.name).join(', ') || '—']),
  ]));

  infoGrid.appendChild(executesCol);
  infoGrid.appendChild(runsAsCol);
  wrap.appendChild(infoGrid);

  if (userCaps && !userCaps.start) {
    wrap.appendChild(mk('div', {
      style: { background: '#1a0f0f', border: '1px solid #5c2b2b', borderRadius: '4px', padding: '12px 16px', fontSize: '12.5px', color: '#c94f4f', marginBottom: '20px' },
    }, ['Your account doesn\u2019t have permission to run this template.']));
  }

  // ── Lanzar (wizard genérico si hay pasos, formulario simple si no) ──
  const launchBox = mk('div', { style: { background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '20px', marginBottom: '24px' } });

  if (state.awxLaunchLoading) {
    launchBox.appendChild(mk('div', { style: { fontSize: '13px', color: '#5e6670' } }, [t('awx_survey_loading')]));
  } else if (state.awxLaunchWizard && state.awxLaunchWizard.template.id === tpl.id) {
    launchBox.appendChild(renderAwxLaunchWizard());
  } else {
    launchBox.appendChild(mk('label', { style: { fontSize: '11px', color: '#5e6670', display: 'block', marginBottom: '4px' } }, [t('awx_ticket_label')]));
    launchBox.appendChild(mk('input', {
      style: {
        width: '100%', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px',
        padding: '8px 10px', color: '#dfe3e7', fontSize: '13px', marginBottom: '6px',
      },
      type: 'text',
      placeholder: 'OPS-1234',
      value: state.awxExtraVarsTicket,
      oninput: (e) => { state.awxExtraVarsTicket = e.target.value; },
    }));
    if (state.awxExtraVarsTicket.trim() && state.ticketLinks[state.awxExtraVarsTicket.trim()]) {
      launchBox.appendChild(mk('div', {
        style: { fontSize: '11px', color: '#dfe3e7', cursor: 'pointer', marginBottom: '14px' },
        onclick: () => openJiraDetail(state.awxExtraVarsTicket.trim(), 'awx-detail'),
      }, [`→ ${t('jira_title')}: ${state.awxExtraVarsTicket.trim()}`]));
    } else {
      launchBox.appendChild(mk('div', { style: { marginBottom: '14px' } }));
    }

    const launching = state.awxRunningJob && ['launching', 'pending', 'waiting', 'running'].includes(state.awxRunningJob.status);
    launchBox.appendChild(mk('button', {
      style: {
        background: launching ? '#22252a' : '#dfe3e7', color: launching ? '#5e6670' : '#0a0b0d',
        border: 'none', borderRadius: '3px', padding: '10px 22px', fontSize: '13px', fontWeight: '700',
        cursor: launching ? 'not-allowed' : 'pointer',
      },
      onclick: () => { if (!launching) prepareAwxLaunch(tpl); },
    }, [launching ? t('awx_launching') : '▶ ' + t('awx_launch_button')]));
  }
  wrap.appendChild(launchBox);

  // ── Log en vivo del job actual ──
  if (state.awxRunningJob && state.awxSelectedTemplate && state.awxSelectedTemplate.id === tpl.id) {
    const job = state.awxRunningJob;
    const statusBox = mk('div', { style: { background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '20px', marginBottom: '24px' } });
    statusBox.appendChild(mk('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' } }, [
      mk('span', { style: { fontSize: '13px', fontWeight: '700', color: '#dfe3e7' } }, [job.id ? `Job #${job.id}` : t('awx_launching')]),
      job.status ? mk('span', {
        style: {
          fontSize: '11px', fontWeight: '700', color: awxStatusColor(job.status),
          background: '#0a0b0d', border: `1px solid ${awxStatusColor(job.status)}`,
          borderRadius: '20px', padding: '2px 10px', textTransform: 'uppercase',
        },
      }, [job.status]) : null,
    ]));
    if (state.awxStdout) {
      statusBox.appendChild(mk('div', { style: { fontSize: '10px', color: '#5e6670', letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' } }, [t('awx_live_output')]));
      statusBox.appendChild(mk('pre', {
        style: {
          background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px',
          padding: '14px', fontSize: '11.5px', lineHeight: '1.6', color: '#6ad17e',
          maxHeight: '320px', overflowY: 'auto', whiteSpace: 'pre-wrap',
        },
      }, [state.awxStdout]));
    }
    wrap.appendChild(statusBox);
  }

  // ── Historial completo de runs ──
  const historyBox = mk('div', {});
  historyBox.appendChild(mk('div', { style: { fontSize: '12px', fontWeight: '700', color: '#5e6670', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' } }, ['Run history']));

  if (state.awxJobHistoryError) {
    historyBox.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#c94f4f' } }, [`Error: ${state.awxJobHistoryError}`]));
  } else if (state.awxJobHistory.length === 0 && state.awxJobHistoryLoading) {
    historyBox.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#5e6670' } }, ['Loading…']));
  } else if (state.awxJobHistory.length === 0) {
    historyBox.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#5e6670' } }, [t('awx_never_run')]));
  } else {
    state.awxJobHistory.forEach((job) => {
      const row = mk('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #22252a', fontSize: '12px' },
      });
      row.appendChild(mk('span', { style: { color: '#dfe3e7' } }, [`#${job.id}`]));
      row.appendChild(mk('span', { style: { color: '#5e6670' } }, [job.finished ? new Date(job.finished).toLocaleString() : (job.started ? new Date(job.started).toLocaleString() : '—')]));
      row.appendChild(mk('span', {
        style: { color: awxStatusColor(job.status), fontWeight: '600', textTransform: 'uppercase', fontSize: '11px' },
      }, [job.status]));
      historyBox.appendChild(row);
    });

    if (state.awxJobHistoryHasNext) {
      historyBox.appendChild(mk('button', {
        style: { marginTop: '10px', background: 'transparent', border: '1px solid #22252a', color: '#5e6670', borderRadius: '3px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer' },
        onclick: () => loadAwxJobHistory(tpl.id, state.awxJobHistoryPage + 1),
      }, [state.awxJobHistoryLoading ? '...' : 'Load more']));
    }
  }
  wrap.appendChild(historyBox);

  return wrap;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Jira — vista de lectura de tickets (heredado de ReportGen)
// ═══════════════════════════════════════════════════════════════════════════

async function loadJiraIssue() {
  if (!state.jiraKeyInput.trim()) return;
  state.jiraLoading = true;
  state.jiraError = null;
  state.jiraIssue = null;
  renderApp();

  const res = await window.corexAPI.jiraGetIssue(state.jiraKeyInput.trim().toUpperCase());
  state.jiraLoading = false;
  if (!res.ok) {
    state.jiraError = res.error;
  } else {
    state.jiraIssue = res.issue;
  }
  renderApp();
}

function renderJiraView() {
  const wrap = mk('div', { style: { maxWidth: '760px' } });

  wrap.appendChild(mk('h1', { style: { fontSize: '22px', fontWeight: '700', marginBottom: '4px', color: '#dfe3e7' } }, [t('jira_title')]));
  wrap.appendChild(mk('p', { style: { fontSize: '13px', color: '#5e6670', marginBottom: '24px' } }, [t('jira_subtitle')]));

  if (!state.config.jira || !state.config.jira.url) {
    wrap.appendChild(mk('div', {
      style: { background: '#14161a', border: '1px solid #2a2d33', borderRadius: '4px', padding: '18px 20px', fontSize: '13px', color: '#dfe3e7' },
    }, [
      t('jira_not_configured') + ' ',
      mk('span', { style: { color: '#dfe3e7', cursor: 'pointer', fontWeight: '600' }, onclick: () => { state.view = 'settings'; renderApp(); } }, [t('nav_settings')]),
      ' ' + t('jira_not_configured_suffix'),
    ]));
    return wrap;
  }

  // ── Buscador: para encontrar cualquier ticket puntual, no solo los propios ──
  const searchRow = mk('div', { style: { display: 'flex', gap: '10px', marginBottom: '20px' } });
  searchRow.appendChild(mk('input', {
    style: {
      flex: '1', background: '#0d0e10', border: '1px solid #22252a', borderRadius: '3px',
      padding: '10px 14px', color: '#dfe3e7', fontSize: '13px',
    },
    type: 'text',
    placeholder: t('jira_search_placeholder'),
    value: state.jiraKeyInput,
    oninput: (e) => { state.jiraKeyInput = e.target.value; },
    onkeydown: (e) => { if (e.key === 'Enter') loadJiraIssue(); },
  }));
  searchRow.appendChild(mk('button', {
    style: { background: '#dfe3e7', color: '#0a0b0d', border: 'none', borderRadius: '3px', padding: '0 18px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
    onclick: () => loadJiraIssue(),
  }, [t('jira_search_button')]));
  wrap.appendChild(searchRow);

  if (state.jiraLoading) {
    wrap.appendChild(mk('div', { style: { color: '#5e6670', fontSize: '13px', marginBottom: '16px' } }, [t('jira_loading')]));
  }

  if (state.jiraError) {
    wrap.appendChild(mk('div', {
      style: { background: '#1a0f0f', border: '1px solid #5c2b2b', borderRadius: '4px', padding: '14px 18px', fontSize: '13px', color: '#c94f4f', marginBottom: '16px' },
    }, [`Error: ${state.jiraError}`]));
  }

  // Resultado de una búsqueda puntual por clave, si la hay.
  if (state.jiraIssue) {
    const f = state.jiraIssue.fields || {};
    const card = mk('div', {
      style: { background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '20px', cursor: 'pointer', marginBottom: '24px' },
      onclick: () => openJiraDetail(state.jiraIssue.key, 'jira'),
    });
    card.appendChild(mk('div', { style: { fontSize: '12px', color: '#dfe3e7', fontWeight: '700', marginBottom: '4px' } }, [state.jiraIssue.key]));
    card.appendChild(mk('div', { style: { fontSize: '15px', color: '#dfe3e7', fontWeight: '700', marginBottom: '10px' } }, [f.summary || '(untitled)']));
    card.appendChild(mk('div', { style: { fontSize: '12px', color: '#5e6670', marginBottom: '14px' } }, [
      `${t('jira_status_label')}: ${(f.status && f.status.name) || '—'}   ·   ${t('jira_assignee_label')}: ${(f.assignee && f.assignee.displayName) || t('jira_unassigned')}`,
    ]));
    if (f.description) {
      const descBox = mk('div', {
        style: { fontSize: '13px', color: '#dfe3e7', lineHeight: '1.6', borderTop: '1px solid #22252a', paddingTop: '14px' },
      });
      if (typeof f.description === 'string') descBox.innerHTML = jiraWikiToHtml(f.description);
      else descBox.textContent = t('jira_rich_description_fallback');
      card.appendChild(descBox);
    }
    wrap.appendChild(card);
  }

  // ── Lista completa de tickets asignados a mí, con vínculo y ejecución AWX ──
  wrap.appendChild(mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, [
    mk('span', { style: { fontSize: '12px', fontWeight: '700', color: '#5e6670', textTransform: 'uppercase', letterSpacing: '0.5px' } }, [
      `${t('tickets_section_title')} (${state.inboxIssues.length})`,
    ]),
    mk('button', {
      style: { background: 'transparent', border: '1px solid #22252a', color: '#5e6670', borderRadius: '3px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' },
      onclick: () => loadInbox(),
    }, [state.inboxLoading ? '...' : '↻ ' + t('inbox_reload')]),
  ]));

  if (state.inboxError) {
    wrap.appendChild(mk('div', {
      style: { background: '#1a0f0f', border: '1px solid #5c2b2b', borderRadius: '4px', padding: '14px 18px', fontSize: '13px', color: '#c94f4f', marginBottom: '16px' },
    }, [`Error: ${state.inboxError}`]));
  }

  if (state.inboxLoading && state.inboxIssues.length === 0) {
    wrap.appendChild(mk('div', { style: { color: '#5e6670', fontSize: '13px' } }, [t('inbox_loading')]));
    return wrap;
  }

  if (!state.inboxLoading && state.inboxIssues.length === 0 && !state.inboxError) {
    wrap.appendChild(mk('div', { style: { color: '#5e6670', fontSize: '13px' } }, [t('inbox_empty')]));
    return wrap;
  }

  state.inboxIssues.forEach((issue) => {
    const f = issue.fields || {};
    const key = issue.key;
    const link = state.ticketLinks[key];
    const expanded = state.inboxExpandedKey === key;
    const jobRunningHere = state.awxRunningJob && state.awxRunningJobTicketKey === key &&
      ['launching', 'pending', 'waiting', 'running'].includes(state.awxRunningJob.status);

    const card = mk('div', { style: { background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '14px 16px', marginBottom: '10px' } });

    const topRow = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } });
    const leftCol = mk('div', { style: { flex: '1', minWidth: '0', cursor: 'pointer' }, onclick: () => openJiraDetail(key, 'jira') });
    leftCol.appendChild(mk('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' } }, [
      mk('span', { style: { fontSize: '11px', color: '#dfe3e7', fontWeight: '700' } }, [key]),
      mk('span', { style: { fontSize: '10px', color: inboxPriorityColor(f.priority), border: `1px solid ${inboxPriorityColor(f.priority)}`, borderRadius: '20px', padding: '1px 8px' } }, [
        (f.priority && f.priority.name) || t('inbox_no_priority'),
      ]),
    ]));
    // Indicador de sub-tarea: si el ticket tiene padre, lo mostramos antes
    // del título — más visible que tener que abrir el detalle para saberlo.
    if (f.parent) {
      leftCol.appendChild(mk('div', { style: { fontSize: '10.5px', color: '#5b9bd5', marginBottom: '2px' } }, [
        `↳ sub-task of ${f.parent.key}`,
      ]));
    }
    leftCol.appendChild(mk('div', { style: { fontSize: '14px', color: '#dfe3e7', fontWeight: '600', marginBottom: '4px' } }, [f.summary || '(untitled)']));
    leftCol.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#5e6670' } }, [
      `${(f.status && f.status.name) || '—'}`,
    ]));
    topRow.appendChild(leftCol);

    const actionCol = mk('div', { style: { flexShrink: '0', marginLeft: '14px' } });
    if (link) {
      actionCol.appendChild(mk('div', { style: { textAlign: 'right' } }, [
        mk('div', {
          style: { fontSize: '11px', color: '#6ad17e', fontWeight: '600', marginBottom: '6px', cursor: 'pointer' },
          onclick: () => launchLinkedJob(key),
        }, [`→ ${link.templateName}`]),
        jobRunningHere
          ? mk('span', { style: { fontSize: '11px', color: '#dfe3e7' } }, [t('inbox_running')])
          : mk('button', {
              style: { background: '#dfe3e7', color: '#0a0b0d', border: 'none', borderRadius: '3px', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
              onclick: () => launchLinkedJob(key),
            }, ['▶ ' + t('inbox_execute')]),
        mk('div', {
          style: { fontSize: '10px', color: '#5e6670', cursor: 'pointer', marginTop: '6px' },
          onclick: () => unlinkTicket(key),
        }, [t('inbox_unlink')]),
      ]));
    } else {
      actionCol.appendChild(mk('button', {
        style: { background: 'transparent', border: '1px solid #22252a', color: '#5e6670', borderRadius: '3px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer' },
        onclick: () => toggleInboxLink(key),
      }, [expanded ? t('inbox_cancel') : t('inbox_link_button')]));
    }
    topRow.appendChild(actionCol);
    card.appendChild(topRow);

    // Panel de vínculo expandido: buscador inline de job templates AWX
    if (expanded && !link) {
      const linkPanel = mk('div', { style: { marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #22252a' } });
      linkPanel.appendChild(mk('input', {
        style: {
          width: '100%', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px',
          padding: '8px 10px', color: '#dfe3e7', fontSize: '12.5px', marginBottom: '8px',
        },
        type: 'text',
        placeholder: t('inbox_search_template'),
        value: state.awxFilter,
        'data-focus-key': 'awx-filter-ticket-link',
        oninput: (e) => { state.awxFilter = e.target.value; renderApp(); },
      }));

      const filterText = state.awxFilter.trim().toLowerCase();
      const matches = (filterText
        ? state.awxTemplates.filter((tplItem) => (tplItem.name || '').toLowerCase().includes(filterText) || (tplItem.description || '').toLowerCase().includes(filterText))
        : state.awxTemplates
      ).slice(0, 8);

      if (state.awxTemplates.length === 0) {
        linkPanel.appendChild(mk('div', { style: { fontSize: '12px', color: '#5e6670' } }, [t('inbox_loading_templates')]));
      } else if (matches.length === 0) {
        linkPanel.appendChild(mk('div', { style: { fontSize: '12px', color: '#5e6670' } }, [t('inbox_no_results')]));
      } else {
        matches.forEach((tpl) => {
          linkPanel.appendChild(mk('div', {
            style: {
              padding: '8px 10px', borderRadius: '3px', marginBottom: '4px', cursor: 'pointer',
              background: '#0a0b0d', border: '1px solid #22252a',
            },
            onclick: () => linkTicketToTemplate(key, tpl),
          }, [
            mk('div', { style: { fontSize: '12.5px', color: '#dfe3e7', fontWeight: '600' } }, [tpl.name]),
          ]));
        });
        if (state.awxTemplates.filter((tplItem) => !filterText || (tplItem.name || '').toLowerCase().includes(filterText)).length > 8) {
          linkPanel.appendChild(mk('div', { style: { fontSize: '11px', color: '#5e6670', marginTop: '4px' } }, [t('inbox_keep_typing')]));
        }
      }
      card.appendChild(linkPanel);
    }

    wrap.appendChild(card);
  });

  return wrap;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Settings — configuración de AWX, Jira y SMTP
// ═══════════════════════════════════════════════════════════════════════════

function settingsField(label, value, onInput, opts) {
  opts = opts || {};
  const col = mk('div', { style: { marginBottom: '14px' } });
  col.appendChild(mk('label', { style: { fontSize: '11px', color: '#5e6670', display: 'block', marginBottom: '4px' } }, [label]));
  col.appendChild(mk('input', {
    style: {
      width: '100%', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px',
      padding: '9px 12px', color: '#dfe3e7', fontSize: '13px',
    },
    type: opts.type || 'text',
    placeholder: opts.placeholder || '',
    value: value || '',
    oninput: (e) => onInput(e.target.value),
  }));
  return col;
}

// Selector de dos opciones (p.ej. Bearer token vs Basic Auth) que re-renderiza
// la vista entera al cambiar, para mostrar/ocultar los campos correspondientes.
function settingsToggleGroup(label, current, options, onChange) {
  const col = mk('div', { style: { marginBottom: '14px' } });
  col.appendChild(mk('label', { style: { fontSize: '11px', color: '#5e6670', display: 'block', marginBottom: '6px' } }, [label]));
  const row = mk('div', { style: { display: 'flex', gap: '8px' } });
  options.forEach((opt) => {
    const active = current === opt.value;
    row.appendChild(mk('div', {
      style: {
        padding: '7px 14px', borderRadius: '3px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
        background: active ? '#14161a' : '#0a0b0d',
        border: active ? '1px solid #dfe3e7' : '1px solid #22252a',
        color: active ? '#dfe3e7' : '#5e6670',
      },
      onclick: () => { onChange(opt.value); renderApp(); },
    }, [opt.label]));
  });
  col.appendChild(row);
  return col;
}

function settingsSection(title, children) {
  return mk('div', {
    style: { background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '22px', marginBottom: '20px', maxWidth: '480px' },
  }, [
    mk('div', { style: { fontSize: '13px', fontWeight: '700', color: '#dfe3e7', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' } }, [title]),
    ...children,
  ]);
}

async function saveSettings() {
  await window.corexAPI.setConfig(state.config);
  toast(t('settings_saved_toast'), 'ok');
  // Refresh dependent views
  state.awxTemplates = [];
}

function renderSettingsView() {
  const wrap = mk('div', {});
  wrap.appendChild(mk('h1', { style: { fontSize: '22px', fontWeight: '700', marginBottom: '4px', color: '#dfe3e7' } }, [t('settings_title')]));
  wrap.appendChild(mk('p', { style: { fontSize: '13px', color: '#5e6670', marginBottom: '24px' } }, [t('settings_subtitle')]));

  state.config.awx = state.config.awx || {};
  state.config.jira = state.config.jira || {};
  state.config.smtp = state.config.smtp || {};
  state.config.lang = state.config.lang || 'en';

  wrap.appendChild(settingsSection(t('settings_language'), [
    settingsToggleGroup(t('settings_language'), state.config.lang, [
      { value: 'en', label: t('settings_lang_en') },
      { value: 'es', label: t('settings_lang_es') },
    ], (v) => { state.config.lang = v; setLang(v); }),
  ]));

  state.config.awx.authType = state.config.awx.authType || 'bearer';

  const awxFields = [
    settingsField(t('settings_awx_url'), state.config.awx.url, (v) => (state.config.awx.url = v), { placeholder: 'https://awx.yourcompany.com' }),
    settingsToggleGroup(t('settings_awx_auth'), state.config.awx.authType, [
      { value: 'bearer', label: t('settings_awx_auth_bearer') },
      { value: 'basic', label: t('settings_awx_auth_basic') },
    ], (v) => { state.config.awx.authType = v; }),
  ];

  if (state.config.awx.authType === 'basic') {
    awxFields.push(settingsField(t('settings_awx_username'), state.config.awx.username, (v) => (state.config.awx.username = v), { placeholder: 'jane.doe' }));
    awxFields.push(settingsField(t('settings_awx_password'), state.config.awx.password, (v) => (state.config.awx.password = v), { type: 'password' }));
    awxFields.push(mk('p', { style: { fontSize: '11px', color: '#5e6670', marginTop: '-6px', marginBottom: '4px' } }, [t('settings_awx_basic_note')]));
  } else {
    awxFields.push(settingsField(t('settings_awx_token'), state.config.awx.token, (v) => (state.config.awx.token = v), { type: 'password', placeholder: t('settings_awx_token_placeholder') }));
  }

  wrap.appendChild(settingsSection(t('settings_awx_title'), awxFields));

  state.config.jira.authType = state.config.jira.authType || 'bearer';

  const jiraFields = [
    settingsField(t('settings_awx_url'), state.config.jira.url, (v) => (state.config.jira.url = v), {
      placeholder: t('settings_jira_url_placeholder'),
    }),
    mk('p', { style: { fontSize: '11px', color: '#5e6670', marginTop: '-6px', marginBottom: '10px' } }, [t('settings_jira_url_note')]),
    settingsToggleGroup(t('settings_jira_auth'), state.config.jira.authType, [
      { value: 'bearer', label: t('settings_jira_auth_bearer') },
      { value: 'basic', label: t('settings_jira_auth_basic') },
    ], (v) => { state.config.jira.authType = v; }),
  ];

  if (state.config.jira.authType === 'basic') {
    jiraFields.push(settingsField(t('settings_jira_email'), state.config.jira.email, (v) => (state.config.jira.email = v), { placeholder: 'you@company.com' }));
    jiraFields.push(settingsField(t('settings_jira_api_token'), state.config.jira.token, (v) => (state.config.jira.token = v), { type: 'password' }));
  } else {
    jiraFields.push(settingsField(t('settings_jira_pat'), state.config.jira.token, (v) => (state.config.jira.token = v), { type: 'password', placeholder: t('settings_jira_pat_placeholder') }));
    jiraFields.push(mk('p', { style: { fontSize: '11px', color: '#5e6670', marginTop: '-6px' } }, [t('settings_jira_pat_note')]));
  }

  wrap.appendChild(settingsSection(t('settings_jira_title'), jiraFields));

  wrap.appendChild(settingsSection(t('settings_smtp_title'), [
    settingsField(t('settings_smtp_host'), state.config.smtp.host, (v) => (state.config.smtp.host = v), { placeholder: 'smtp.yourcompany.com' }),
    settingsField(t('settings_smtp_port'), state.config.smtp.port, (v) => (state.config.smtp.port = Number(v) || v), { placeholder: '587' }),
    settingsField(t('settings_smtp_user'), state.config.smtp.user, (v) => (state.config.smtp.user = v)),
    settingsField(t('settings_smtp_pass'), state.config.smtp.pass, (v) => (state.config.smtp.pass = v), { type: 'password' }),
    settingsField(t('settings_smtp_from'), state.config.smtp.from, (v) => (state.config.smtp.from = v), { placeholder: 'automation@yourcompany.com' }),
  ]));

  wrap.appendChild(mk('button', {
    style: { background: '#dfe3e7', color: '#0a0b0d', border: 'none', borderRadius: '3px', padding: '10px 22px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
    onclick: () => saveSettings(),
  }, [t('settings_save')]));

  return wrap;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Inbox — tickets asignados, vinculación con AWX, lanzar y cerrar ciclo
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
//  Dashboard — métricas de hardware local
// ═══════════════════════════════════════════════════════════════════════════

async function loadHwMetrics() {
  const res = await window.corexAPI.dashboardGetMetrics();
  if (!res.ok) {
    state.hwError = res.error;
  } else {
    state.hwError = null;
    state.hwMetrics = res;

    // Acumular en el historial para las gráficas en tiempo real — buffer
    // circular: si ya llegamos al máximo de puntos, se descarta el más
    // antiguo en vez de crecer sin límite.
    state.hwHistory.push({
      t: Date.now(),
      cpuUser: res.cpu.user || 0,
      cpuSystem: res.cpu.system || 0,
      memUsed: res.mem.used,
      memTotal: res.mem.total,
    });
    if (state.hwHistory.length > state.hwHistoryMaxPoints) {
      state.hwHistory.shift();
    }
  }
  state.hwLoading = false;
  renderApp();
}

function startHwPolling() {
  stopHwPolling();
  state.hwLoading = true;
  loadHwMetrics();
  state.hwPollHandle = setInterval(loadHwMetrics, 3000);
}

function stopHwPolling() {
  if (state.hwPollHandle) {
    clearInterval(state.hwPollHandle);
    state.hwPollHandle = null;
  }
}

function formatBytes(n) {
  if (n == null) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
  if (n >= 1e6) return (n / 1e6).toFixed(0) + ' MB';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + ' KB';
  return n + ' B';
}

function hwBarColor(pct) {
  if (pct >= 85) return '#c94f4f';
  if (pct >= 60) return '#c98a3a';
  return '#6ad17e';
}

function renderHwBar(label, pct, sublabel) {
  const safePct = Math.max(0, Math.min(100, pct || 0));
  const color = hwBarColor(safePct);
  const row = mk('div', { style: { marginBottom: '12px' } });
  row.appendChild(mk('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#5e6670', marginBottom: '4px' } }, [
    mk('span', {}, [label]),
    mk('span', { style: { color: '#dfe3e7', fontWeight: '600' } }, [sublabel != null ? sublabel : `${safePct.toFixed(0)}%`]),
  ]));
  row.appendChild(mk('div', { style: { background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', height: '8px', overflow: 'hidden' } }, [
    mk('div', { style: { width: `${safePct}%`, height: '100%', background: color, transition: 'width 0.4s ease' } }),
  ]));
  return row;
}

// Gauge circular SVG (arco de 270°, como un velocímetro) con bandas de
// color FIJAS de fondo (verde/ámbar/rojo) — el progreso real se dibuja
// encima, pero las bandas ya comunican "dónde está la zona de riesgo"
// antes de leer el número, igual que en dashboards de monitorización
// reales (Netdata, Grafana). Reusado para CPU / Memoria / Temperatura /
// Batería / Disco en el Dashboard.
function renderHwGauge(label, pct, sublabel) {
  const safePct = Math.max(0, Math.min(100, pct || 0));
  const color = hwBarColor(safePct);
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Arco de 270°: empieza en 135° y recorre 270° en sentido horario.
  const startAngle = 135;
  const sweep = 270;
  const endAngle = startAngle + (sweep * safePct) / 100;

  function polarToXY(angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arcPath(fromPct, toPct) {
    const a1 = startAngle + (sweep * fromPct) / 100;
    const a2 = startAngle + (sweep * toPct) / 100;
    const p1 = polarToXY(a1);
    const p2 = polarToXY(a2);
    const large = (a2 - a1) > 180 ? 1 : 0;
    return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`;
  }

  const trackEnd = polarToXY(startAngle + sweep);
  const trackStart = polarToXY(startAngle);
  const valueEnd = polarToXY(endAngle);
  const largeArcValue = (sweep * safePct) / 100 > 180 ? 1 : 0;

  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

  // Bandas fijas de fondo: 0-60 verde, 60-85 ámbar, 85-100 rojo — siempre
  // en las mismas posiciones del arco, independientemente del valor actual.
  const bands = [
    { from: 0, to: 60, color: '#2a6b3d' },
    { from: 60, to: 85, color: '#9a6a2a' },
    { from: 85, to: 100, color: '#8a3535' },
  ];
  bands.forEach((b) => {
    const bandPath = document.createElementNS(svgNs, 'path');
    bandPath.setAttribute('d', arcPath(b.from, b.to));
    bandPath.setAttribute('stroke', b.color);
    bandPath.setAttribute('stroke-width', stroke);
    bandPath.setAttribute('fill', 'none');
    bandPath.setAttribute('opacity', '0.55');
    svg.appendChild(bandPath);
  });

  if (safePct > 0) {
    const valuePath = document.createElementNS(svgNs, 'path');
    valuePath.setAttribute('d', `M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 ${largeArcValue} 1 ${valueEnd.x} ${valueEnd.y}`);
    valuePath.setAttribute('stroke', color);
    valuePath.setAttribute('stroke-width', stroke);
    valuePath.setAttribute('fill', 'none');
    valuePath.setAttribute('stroke-linecap', 'round');
    valuePath.style.transition = 'all 0.4s ease';
    svg.appendChild(valuePath);
  }

  const wrap = mk('div', {
    style: {
      flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[2],
      padding: `${S[4]} ${S[3]}`, borderRight: `1px solid ${C.border}`,
    },
  });
  const gaugeBox = mk('div', { style: { position: 'relative', width: `${size}px`, height: `${size}px` } });
  gaugeBox.appendChild(svg);
  gaugeBox.appendChild(mk('div', {
    style: {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    },
  }, [
    mk('span', { style: { fontSize: T.sm, fontWeight: '700', color: C.textPrimary } }, [sublabel || `${safePct.toFixed(0)}%`]),
  ]));
  wrap.appendChild(gaugeBox);
  wrap.appendChild(mk('span', {
    style: { fontSize: T.xs, color: C.textSecondary, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: '600' },
  }, [label]));
  return wrap;
}

const HW_TIME_WINDOWS = {
  '60s': { ms: 60 * 1000, label: '60s' },
  '5m': { ms: 5 * 60 * 1000, label: '5m' },
  '1h': { ms: 60 * 60 * 1000, label: '1h' },
};

function getHwHistoryForWindow() {
  const windowMs = HW_TIME_WINDOWS[state.hwTimeWindow].ms;
  const cutoff = Date.now() - windowMs;
  return state.hwHistory.filter((p) => p.t >= cutoff);
}

function setHwTimeWindow(key) {
  state.hwTimeWindow = key;
  renderApp();
}

function renderHwTimeWindowPicker() {
  const wrap = mk('div', { style: { display: 'flex', gap: S[1] } });
  Object.keys(HW_TIME_WINDOWS).forEach((key) => {
    const active = state.hwTimeWindow === key;
    wrap.appendChild(mk('span', {
      style: {
        fontSize: T.xs, padding: '2px 8px', borderRadius: R.sm, cursor: 'pointer',
        color: active ? C.textPrimary : C.textSecondary,
        background: active ? C.surface2 : 'transparent',
      },
      onclick: () => setHwTimeWindow(key),
    }, [HW_TIME_WINDOWS[key].label]));
  });
  return wrap;
}

// Gráfica de área apilada en SVG — recibe varias series (arrays de
// {t, value}) y las dibuja como polígonos apilados con su color
// correspondiente. ymax fija la escala vertical (p.ej. 100 para %, o el
// total de memoria en bytes).
function renderStackedAreaChart(series, colors, ymax, widthPx, heightPx) {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${widthPx} ${heightPx}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', heightPx);
  svg.style.display = 'block';

  // Líneas de cuadrícula horizontal, sutiles — referencia visual sin ruido.
  for (let g = 1; g < 4; g++) {
    const y = (heightPx / 4) * g;
    const line = document.createElementNS(svgNs, 'line');
    line.setAttribute('x1', '0'); line.setAttribute('x2', String(widthPx));
    line.setAttribute('y1', String(y)); line.setAttribute('y2', String(y));
    line.setAttribute('stroke', C.border);
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
  }

  if (!series.length || !series[0].length) return svg;

  const n = series[0].length;
  const stepX = n > 1 ? widthPx / (n - 1) : widthPx;
  const cumulative = new Array(n).fill(0);

  series.forEach((s, idx) => {
    const points = [`0,${heightPx}`];
    for (let i = 0; i < n; i++) {
      cumulative[i] += s[i];
      const x = i * stepX;
      const y = heightPx - Math.min(1, cumulative[i] / ymax) * heightPx;
      points.push(`${x},${y}`);
    }
    points.push(`${widthPx},${heightPx}`);
    const poly = document.createElementNS(svgNs, 'polygon');
    poly.setAttribute('points', points.join(' '));
    poly.setAttribute('fill', colors[idx]);
    poly.setAttribute('opacity', '0.75');
    svg.appendChild(poly);
  });

  return svg;
}

function renderHwChartCard(title, series, colors, legend, ymax) {
  const card = mk('div', { style: { background: C.surface1, border: `1px solid ${C.border}`, borderRadius: R.sm, padding: S[3] } });
  const titleRow = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: S[2] } });
  titleRow.appendChild(mk('span', { style: { fontSize: T.base, fontWeight: '700', color: C.textPrimary } }, [title]));
  titleRow.appendChild(mk('span', { style: { fontSize: T.xs, color: C.success, fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' } }, [
    mk('span', { style: { width: '5px', height: '5px', borderRadius: '50%', background: C.success, display: 'inline-block' } }),
    'live',
  ]));
  card.appendChild(titleRow);

  const chartSvg = renderStackedAreaChart(series, colors, ymax, 400, 110);
  card.appendChild(chartSvg);

  const legendRow = mk('div', { style: { display: 'flex', gap: S[3], marginTop: S[2], flexWrap: 'wrap' } });
  legend.forEach((l, i) => {
    legendRow.appendChild(mk('span', { style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: T.xs, color: C.textSecondary } }, [
      mk('span', { style: { width: '7px', height: '3px', borderRadius: '1px', background: colors[i], display: 'inline-block' } }),
      l,
    ]));
  });
  card.appendChild(legendRow);

  return card;
}

function renderHwChartsSection() {
  const history = getHwHistoryForWindow();
  const wrap = mk('div', { style: { marginBottom: S[6] } });

  const headerRow = mk('div', { style: { display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[3] } });
  headerRow.appendChild(mk('span', { style: { fontSize: T.base, fontWeight: '700', color: C.textPrimary } }, ['CPU & Memory over time']));
  const spacer = mk('span', { style: { marginLeft: 'auto' } });
  headerRow.appendChild(spacer);
  headerRow.appendChild(renderHwTimeWindowPicker());
  wrap.appendChild(headerRow);

  if (history.length < 2) {
    wrap.appendChild(mk('div', {
      style: { fontSize: T.sm, color: C.textSecondary, padding: S[4], background: C.surface1, border: `1px solid ${C.border}`, borderRadius: R.sm },
    }, ['Collecting data… charts will appear after a few seconds.']));
    return wrap;
  }

  const cpuUser = history.map((p) => p.cpuUser);
  const cpuSystem = history.map((p) => p.cpuSystem);
  const memUsedPct = history.map((p) => (p.memUsed / p.memTotal) * 100);
  const memFreePct = history.map((p) => 100 - (p.memUsed / p.memTotal) * 100);

  const grid = mk('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[3] } });
  grid.appendChild(renderHwChartCard('CPU usage', [cpuSystem, cpuUser], [C.warning, C.info], ['System', 'User'], 100));
  grid.appendChild(renderHwChartCard('Memory usage', [memUsedPct, memFreePct], [C.info, C.success], ['Used', 'Free'], 100));
  wrap.appendChild(grid);

  return wrap;
}

function renderHardwareSection() {
  const wrap = mk('div', { style: { background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '20px', marginBottom: '24px' } });
  wrap.appendChild(mk('div', { style: { fontSize: '12px', fontWeight: '700', color: '#5e6670', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' } }, [t('hw_title')]));

  if (state.hwError) {
    wrap.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#c94f4f' } }, [`${t('hw_error')} ${state.hwError}`]));
    return wrap;
  }
  if (!state.hwMetrics) {
    wrap.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#5e6670' } }, [t('hw_loading')]));
    return wrap;
  }

  const m = state.hwMetrics;

  // ── Fila de gauges: CPU, Memoria, Temperatura, Batería ──
  const gaugeRow = mk('div', { style: { display: 'flex', gap: '28px', justifyContent: 'space-around', flexWrap: 'wrap', marginBottom: '20px' } });
  gaugeRow.appendChild(renderHwGauge(t('hw_cpu'), m.cpu.load));
  gaugeRow.appendChild(renderHwGauge(t('hw_memory'), (m.mem.used / m.mem.total) * 100, formatBytes(m.mem.used)));

  if (m.temp && m.temp.main != null) {
    const tempPct = Math.min(100, (m.temp.main / 90) * 100); // 90°C como referencia visual de "caliente"
    gaugeRow.appendChild(renderHwGauge(t('hw_temp'), tempPct, `${m.temp.main.toFixed(0)}°C`));
  }

  if (m.battery && m.battery.hasBattery) {
    gaugeRow.appendChild(renderHwGauge(
      t('hw_battery') + (m.battery.isCharging ? ` (${t('hw_charging')})` : ''),
      m.battery.percent,
    ));
  }
  wrap.appendChild(gaugeRow);
  if (!m.battery || !m.battery.hasBattery) {
    wrap.appendChild(mk('div', { style: { fontSize: '11px', color: '#5e6670', textAlign: 'center', marginTop: '-12px', marginBottom: '12px' } }, [t('hw_no_battery')]));
  }

  // ── Discos / Red / Top procesos, en 2 columnas ──
  const grid = mk('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', borderTop: '1px solid #22252a', paddingTop: '16px' } });

  const leftCol = mk('div', {});
  leftCol.appendChild(mk('div', { style: { fontSize: '10px', color: '#5e6670', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' } }, [t('hw_disks')]));
  (m.disks || []).slice(0, 4).forEach((d) => {
    leftCol.appendChild(renderHwBar(d.mount, d.use, `${formatBytes(d.used)} / ${formatBytes(d.size)}`));
  });
  leftCol.appendChild(mk('div', { style: { fontSize: '10px', color: '#5e6670', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px', marginTop: '4px' } }, [t('hw_network')]));
  leftCol.appendChild(mk('div', { style: { fontSize: '12px', color: '#dfe3e7' } }, [
    `↓ ${formatBytes(m.net.rx_sec)}/s   ↑ ${formatBytes(m.net.tx_sec)}/s`,
  ]));

  const rightCol = mk('div', {});
  rightCol.appendChild(mk('div', { style: { fontSize: '10px', color: '#5e6670', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' } }, [t('hw_top_processes')]));
  (m.topProcesses || []).slice(0, 6).forEach((p) => {
    rightCol.appendChild(mk('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#dfe3e7', padding: '3px 0' } }, [
      mk('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' } }, [p.name]),
      mk('span', { style: { color: '#5e6670' } }, [`${p.cpu.toFixed(1)}%`]),
    ]));
  });

  grid.appendChild(leftCol);
  grid.appendChild(rightCol);
  wrap.appendChild(grid);

  return wrap;
}

async function loadInbox() {
  if (!state.config.jira || !state.config.jira.url) return;
  state.inboxLoading = true;
  state.inboxError = null;
  renderApp();

  const res = await window.corexAPI.jiraSearchMyIssues();
  state.inboxLoading = false;
  if (!res.ok) {
    state.inboxError = res.error;
  } else {
    state.inboxIssues = res.issues;
  }
  renderApp();
}

function toggleInboxLink(key) {
  state.inboxExpandedKey = state.inboxExpandedKey === key ? null : key;
  state.awxFilter = '';
  renderApp();
}

async function linkTicketToTemplate(key, tpl) {
  state.ticketLinks = await window.corexAPI.ticketLinksSet(key, tpl.id, tpl.name);
  state.inboxExpandedKey = null;
  toast(`${key} ${t('inbox_linked_toast')} "${tpl.name}"`, 'ok');
  renderApp();
}

async function unlinkTicket(key) {
  state.ticketLinks = await window.corexAPI.ticketLinksRemove(key);
  toast(`${key} ${t('inbox_unlinked_toast')}`, 'ok');
  renderApp();
}

// Lanza el job ya vinculado a este ticket, desde el Inbox. Reutiliza la misma
// lógica de polling que la vista AWX, pero recuerda la clave del ticket para
// poder comentar/adjuntar automáticamente cuando el job termine.
async function launchLinkedJob(key) {
  const link = state.ticketLinks[key];
  if (!link) return;

  // Necesitamos el objeto template COMPLETO (con sus flags ask_*_on_launch)
  // para que el wizard detecte bien los pasos — el fallback reducido no los
  // tendría, así que si los templates no están cargados aún, los recargamos.
  if (state.awxTemplates.length === 0) {
    await loadAwxTemplates();
  }
  const tpl = state.awxTemplates.find((tplItem) => tplItem.id === link.templateId) || { id: link.templateId, name: link.templateName };

  state.awxRunningJobTicketKey = key;
  state.awxExtraVarsTicket = key;
  await openAwxDetail(tpl, 'inbox');
  await prepareAwxLaunch(tpl);
}

function inboxPriorityColor(priority) {
  const name = (priority && priority.name || '').toLowerCase();
  if (name.includes('highest') || name.includes('critical')) return '#c94f4f';
  if (name.includes('high')) return '#c98a3a';
  if (name.includes('medium')) return '#c98a3a';
  return '#5e6670';
}

// Rango numérico de severidad, mayor = más urgente. Devuelve null para
// "sin prioridad real" (Not Prioritized, vacío, etc.) — esos no entran
// en el top de tickets prioritarios del Dashboard.
function priorityRank(priority) {
  const name = (priority && priority.name || '').toLowerCase();
  if (!name || name.includes('not prioritized') || name.includes('sin prioridad')) return null;
  if (name.includes('highest') || name.includes('critical') || name.startsWith('p1')) return 4;
  if (name.includes('high') || name.startsWith('p2')) return 3;
  if (name.includes('medium') || name.startsWith('p3') || name.startsWith('p4')) return 2;
  return 1; // cualquier otra prioridad nombrada (low, p5...) sigue contando como "tiene prioridad"
}

// Top 3 tickets con prioridad real asignada, ordenados de más a menos urgente.
// Si solo hay 1 o 2 con prioridad real, se muestran solo esos — nunca se
// rellena con tickets sin prioridad solo para llegar a 3.
function topPriorityIssues(issues) {
  return issues
    .map((issue) => ({ issue, rank: priorityRank(issue.fields && issue.fields.priority) }))
    .filter((x) => x.rank !== null)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 3)
    .map((x) => x.issue);
}

function renderTopTicketsSection() {
  const top = topPriorityIssues(state.inboxIssues);
  if (top.length === 0) return null;

  const wrap = mk('div', { style: { marginBottom: '24px' } });
  wrap.appendChild(mk('div', { style: { fontSize: '12px', fontWeight: '700', color: '#5e6670', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' } }, [
    'Top priority',
  ]));
  const row = mk('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } });
  top.forEach((issue) => {
    const f = issue.fields || {};
    const color = inboxPriorityColor(f.priority);
    row.appendChild(mk('div', {
      style: {
        flex: '1', minWidth: '200px', background: '#0d0e10', border: `1px solid ${color}`, borderRadius: '4px',
        padding: '12px 14px', cursor: 'pointer',
      },
      onclick: () => openJiraDetail(issue.key, 'inbox'),
    }, [
      mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } }, [
        mk('span', { style: { fontSize: '11px', color: '#dfe3e7', fontWeight: '700' } }, [issue.key]),
        mk('span', { style: { fontSize: '9.5px', color, border: `1px solid ${color}`, borderRadius: '20px', padding: '1px 7px' } }, [
          (f.priority && f.priority.name) || '',
        ]),
      ]),
      mk('div', { style: { fontSize: '12.5px', color: '#dfe3e7', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [f.summary || '(untitled)']),
    ]));
  });
  wrap.appendChild(row);
  return wrap;
}

function renderInboxView() {
  const wrap = mk('div', { style: { maxWidth: '980px' } });

  wrap.appendChild(mk('h1', { style: { fontSize: '22px', fontWeight: '700', marginBottom: '4px', color: '#dfe3e7' } }, [t('inbox_title')]));
  wrap.appendChild(mk('p', { style: { fontSize: '13px', color: '#5e6670', marginBottom: '20px' } }, [t('inbox_subtitle')]));

  // Las métricas de hardware no dependen de Jira/AWX, así que se muestran siempre.
  wrap.appendChild(renderHardwareSection());

  // Gráficas en tiempo real de CPU/Memoria, con ventana de tiempo elegible
  // por el usuario (60s/5m/1h) — usan el mismo historial que se acumula
  // en cada tick del polling, no dependen de Jira/AWX tampoco.
  wrap.appendChild(renderHwChartsSection());

  // El Dashboard es solo panorama — sin botones de acción. La lista completa
  // de tickets, con vincular/ejecutar AWX, vive en la vista Jira.
  if (state.config.jira && state.config.jira.url) {
    const topSection = renderTopTicketsSection();
    if (topSection) wrap.appendChild(topSection);
  }

  return wrap;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Jira — vista de detalle de ticket: info completa + comentar + adjuntar
// ═══════════════════════════════════════════════════════════════════════════

async function openJiraDetail(key, returnView) {
  state.jiraDetailReturnView = returnView || 'inbox';
  state.jiraCommentDraft = '';
  state.view = 'jira-detail';
  state.jiraLoading = true;
  renderApp();

  const res = await window.corexAPI.jiraGetIssue(key);
  state.jiraLoading = false;
  if (res.ok) {
    state.jiraDetailIssue = res.issue;
  } else {
    toast(`Error: ${res.error}`, 'err');
    state.view = returnView || 'inbox';
  }
  renderApp();
}

async function sendJiraComment() {
  if (!state.jiraDetailIssue || !state.jiraCommentDraft.trim()) return;
  state.jiraCommentSending = true;
  renderApp();

  const res = await window.corexAPI.jiraAddComment(state.jiraDetailIssue.key, state.jiraCommentDraft.trim());
  state.jiraCommentSending = false;
  if (!res.ok) {
    toast(`${t('jira_detail_comment_failed')} ${res.error}`, 'err');
  } else {
    toast(t('jira_detail_comment_sent'), 'ok');
    state.jiraCommentDraft = '';
    // Recargamos el ticket para que el comentario nuevo aparezca en la lista sin recargar a mano.
    const issueRes = await window.corexAPI.jiraGetIssue(state.jiraDetailIssue.key);
    if (issueRes.ok) state.jiraDetailIssue = issueRes.issue;
  }
  renderApp();
}

// Adjunta el log/stdout del job más reciente vinculado a este ticket, como
// un archivo .txt simple. (Cuando tengamos un generador de reportes HTML,
// este es el punto donde se enchufa: mismo flujo, distinto contenido/filename.)
async function attachJobOutputToJira() {
  if (!state.jiraDetailIssue) return;
  if (!state.awxStdout) {
    toast(t('jira_detail_no_job_yet'), 'err');
    return;
  }
  state.jiraAttachSending = true;
  renderApp();

  const base64 = btoa(unescape(encodeURIComponent(state.awxStdout)));
  const filename = `job-output-${state.awxRunningJob ? state.awxRunningJob.id : 'latest'}.txt`;
  const res = await window.corexAPI.jiraAddAttachment(state.jiraDetailIssue.key, filename, base64);
  state.jiraAttachSending = false;
  if (!res.ok) {
    toast(`${t('jira_detail_attach_failed')} ${res.error}`, 'err');
  } else {
    toast(t('jira_detail_attach_sent'), 'ok');
  }
  renderApp();
}

// Campos custom específicos de esta instancia de Jira (Solera). Si en otra
// instancia no existen, simplemente no habrá datos y no se muestran — no rompe nada.
const JIRA_CUSTOM_FIELDS = {
  slaTimeToResolution: 'customfield_15324',
  slaTimeToFirstResponse: 'customfield_15325',
  assignmentGroup: 'customfield_15391',
  businessJustification: 'customfield_15098',
};

// ── Conversor de Jira wiki markup → HTML ────────────────────────────────────
// Jira Server/DC (no Cloud) guarda los comentarios en wiki markup, no en texto
// plano ni ADF. Cubre lo que aparece en comentarios reales: headers (h1.-h6.),
// listas con viñetas anidadas (*, **, ***) y numeradas (#, ##), negrita (*x*),
// cursiva (_x_), monoespaciado ({{x}}) y enlaces ([texto|url]).
function jiraWikiToHtml(raw) {
  if (!raw) return '';

  // Escapamos HTML antes de aplicar el markup, para que el texto del usuario
  // nunca se interprete como etiquetas reales.
  const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const htmlParts = [];
  let listStack = []; // [{tag, depth}] — pila de niveles de lista abiertos

  // Cierra niveles de lista hasta dejar solo los de profundidad <= depth.
  // Cada nivel cerrado cierra su <li> contenedor y su <ul>/<ol>.
  function closeListsTo(depth) {
    while (listStack.length > 0 && listStack[listStack.length - 1].depth > depth) {
      const top = listStack.pop();
      htmlParts.push(`</li></${top.tag}>`);
    }
  }

  function inlineFormat(text) {
    let out = escapeHtml(text);
    // Enlaces [texto|url] o [url]
    out = out.replace(/\[([^\|\]]+)\|([^\]]+)\]/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    out = out.replace(/\[(https?:\/\/[^\]]+)\]/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    // Monoespaciado {{texto}}
    out = out.replace(/\{\{([^}]+)\}\}/g, '<code>$1</code>');
    // Negrita *texto*
    out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<strong>$1</strong>');
    // Cursiva _texto_
    out = out.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>');
    return out;
  }

  lines.forEach((line) => {
    const headerMatch = line.match(/^h([1-6])\.\s*(.*)$/);
    const bulletMatch = line.match(/^(\*+)\s+(.*)$/);
    const numberMatch = line.match(/^(#+)\s+(.*)$/);

    if (headerMatch) {
      closeListsTo(0);
      const level = headerMatch[1];
      htmlParts.push(`<h${level} style="font-size:${15 - level}px;margin:10px 0 4px;color:#dfe3e7;">${inlineFormat(headerMatch[2])}</h${level}>`);
    } else if (bulletMatch || numberMatch) {
      const depth = (bulletMatch || numberMatch)[1].length;
      const tag = bulletMatch ? 'ul' : 'ol';
      const content = (bulletMatch || numberMatch)[2];

      if (listStack.length === 0 || listStack[listStack.length - 1].depth < depth) {
        // Nuevo nivel anidado: se abre dentro del <li> del nivel padre (si existe).
        htmlParts.push(`<${tag} style="margin:2px 0 2px 18px;padding:0;"><li style="margin-bottom:2px;">`);
        listStack.push({ tag, depth });
      } else {
        if (listStack[listStack.length - 1].depth > depth) closeListsTo(depth);
        // Mismo nivel: cerramos el <li> anterior y abrimos uno nuevo.
        htmlParts.push('</li><li style="margin-bottom:2px;">');
      }
      htmlParts.push(inlineFormat(content));
    } else if (line.trim() === '') {
      closeListsTo(0);
      htmlParts.push('<div style="height:6px;"></div>');
    } else {
      closeListsTo(0);
      htmlParts.push(`<div>${inlineFormat(line)}</div>`);
    }
  });
  closeListsTo(0);

  return htmlParts.join('');
}

// Jira da .friendly siempre en horas/minutos (p.ej. "154h"), incluso para SLAs
// de varios días — poco legible. Calculamos nosotros desde .millis y mostramos
// en días+horas cuando supera las 24h, en horas+minutos si no.
function formatDurationMillis(millis) {
  if (millis == null) return '—';
  const totalMinutes = Math.round(Math.abs(millis) / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

function formatJiraSla(slaField) {
  if (!slaField || !slaField.name) return null;
  const cycle = slaField.ongoingCycle || (slaField.completedCycles && slaField.completedCycles[slaField.completedCycles.length - 1]);
  if (!cycle) return null;
  return {
    name: slaField.name,
    remaining: cycle.remainingTime ? formatDurationMillis(cycle.remainingTime.millis) : null,
    goal: cycle.goalDuration ? formatDurationMillis(cycle.goalDuration.millis) : null,
    breached: !!cycle.breached,
    ongoing: !!slaField.ongoingCycle,
  };
}

async function downloadJiraAttachment(att) {
  const res = await window.corexAPI.jiraDownloadAttachment(att.content, att.filename);
  if (res.canceled) return;
  if (!res.ok) {
    toast(`Download failed: ${res.error}`, 'err');
    return;
  }
  toast(`Saved to ${res.filePath}`, 'ok');
}

function renderJiraDetailView() {
  const issue = state.jiraDetailIssue;
  const wrap = mk('div', { style: { maxWidth: '760px' } });

  wrap.appendChild(mk('div', {
    style: { fontSize: '12px', color: '#dfe3e7', cursor: 'pointer', fontWeight: '600', marginBottom: '10px' },
    onclick: () => { state.view = state.jiraDetailReturnView; renderApp(); },
  }, ['← ' + (state.jiraDetailReturnView === 'jira' ? t('nav_jira') : state.jiraDetailReturnView === 'awx-detail' ? t('nav_awx') : t('nav_inbox'))]));

  if (state.jiraLoading || !issue) {
    wrap.appendChild(mk('div', { style: { color: '#5e6670', fontSize: '13px' } }, [t('jira_loading')]));
    return wrap;
  }

  const f = issue.fields || {};
  const link = state.ticketLinks[issue.key];

  // ── Breadcrumb del ticket padre, si existe — destacado para que sea
  // imposible no notarlo, no un gris apagado que se confunde con metadata.
  if (f.parent) {
    wrap.appendChild(mk('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#5b9bd5',
        marginBottom: '10px', cursor: 'pointer', background: '#0d1620', border: '1px solid #1d3a5a',
        borderRadius: '4px', padding: '6px 10px', width: 'fit-content',
      },
      onclick: () => openJiraDetail(f.parent.key, state.jiraDetailReturnView),
    }, [
      '↳ Sub-task of ',
      mk('span', { style: { fontWeight: '700' } }, [f.parent.key]),
      (f.parent.fields && f.parent.fields.summary) ? ` — ${f.parent.fields.summary}` : '',
    ]));
  }

  wrap.appendChild(mk('div', { style: { fontSize: '12px', color: '#dfe3e7', fontWeight: '700', marginBottom: '4px' } }, [issue.key]));
  wrap.appendChild(mk('h1', { style: { fontSize: '19px', fontWeight: '700', color: '#dfe3e7', marginBottom: '10px' } }, [f.summary || '(untitled)']));

  // ── Metadatos: estado, assignee, reporter, assignment group ──
  const assignmentGroup = f[JIRA_CUSTOM_FIELDS.assignmentGroup];
  const metaParts = [
    `${t('jira_status_label')}: ${(f.status && f.status.name) || '—'}`,
    `${t('jira_assignee_label')}: ${(f.assignee && f.assignee.displayName) || t('jira_unassigned')}`,
    `Reporter: ${(f.reporter && f.reporter.displayName) || '—'}`,
  ];
  if (assignmentGroup) {
    metaParts.push(`Group: ${typeof assignmentGroup === 'string' ? assignmentGroup : assignmentGroup.name}`);
  }
  wrap.appendChild(mk('div', { style: { fontSize: '12px', color: '#5e6670', marginBottom: '14px', lineHeight: '1.6' } }, [metaParts.join('   ·   ')]));

  // ── SLA ──
  const slaResolution = formatJiraSla(f[JIRA_CUSTOM_FIELDS.slaTimeToResolution]);
  const slaFirstResponse = formatJiraSla(f[JIRA_CUSTOM_FIELDS.slaTimeToFirstResponse]);
  if (slaResolution || slaFirstResponse) {
    const slaRow = mk('div', { style: { display: 'flex', gap: '14px', marginBottom: '18px' } });
    [slaResolution, slaFirstResponse].forEach((sla) => {
      if (!sla) return;
      const color = sla.breached ? '#c94f4f' : sla.ongoing ? '#c98a3a' : '#6ad17e';
      slaRow.appendChild(mk('div', {
        style: { background: '#0d0e10', border: `1px solid ${color}`, borderRadius: '3px', padding: '8px 14px', fontSize: '11.5px' },
      }, [
        mk('div', { style: { color: '#5e6670', marginBottom: '2px' } }, [sla.name]),
        mk('div', { style: { color, fontWeight: '700' } }, [
          sla.ongoing ? `${sla.remaining} left` : sla.breached ? 'Breached' : 'Met',
          sla.goal ? ` (goal: ${sla.goal})` : '',
        ]),
      ]));
    });
    wrap.appendChild(slaRow);
  }

  if (f.description) {
    const descBox = mk('div', {
      style: { fontSize: '13px', color: '#dfe3e7', lineHeight: '1.6', background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '16px', marginBottom: '20px' },
    });
    if (typeof f.description === 'string') descBox.innerHTML = jiraWikiToHtml(f.description);
    else descBox.textContent = t('jira_rich_description_fallback');
    wrap.appendChild(descBox);
  }

  // ── Business Justification — colapsable, suele traer texto largo
  // (listas de servidores, contexto extenso) que no debería invadir la
  // pantalla de entrada al detalle.
  const businessJustification = f[JIRA_CUSTOM_FIELDS.businessJustification];
  if (businessJustification) {
    const expanded = !!state.jiraDetailExpandedFields.businessJustification;
    const section = mk('div', { style: { marginBottom: '20px' } });
    section.appendChild(mk('div', {
      style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700', color: '#dfe3e7', cursor: 'pointer', padding: '8px 0' },
      onclick: () => { state.jiraDetailExpandedFields.businessJustification = !expanded; renderApp(); },
    }, [
      mk('span', { style: { fontSize: '10px', color: '#5e6670' } }, [expanded ? '▾' : '▸']),
      'Business Justification',
    ]));
    if (expanded) {
      const bjBox = mk('div', {
        style: { fontSize: '13px', color: '#dfe3e7', lineHeight: '1.6', background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '16px' },
      });
      if (typeof businessJustification === 'string') bjBox.innerHTML = jiraWikiToHtml(businessJustification);
      else bjBox.textContent = String(businessJustification);
      section.appendChild(bjBox);
    }
    wrap.appendChild(section);
  }

  // ── Adjuntos existentes — imágenes y cualquier otro formato, con botón
  // de descarga propio (la API de Jira para adjuntos requiere las mismas
  // credenciales que el resto, así que no se puede abrir la URL directa
  // en el navegador sin pasar primero por nuestro propio backend).
  const attachments = f.attachment || [];
  if (attachments.length > 0) {
    wrap.appendChild(mk('div', { style: { fontSize: '11px', fontWeight: '700', color: '#5e6670', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' } }, [
      `Attachments (${attachments.length})`,
    ]));
    const attachGrid = mk('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' } });
    attachments.forEach((att) => {
      const isImage = (att.mimeType || '').startsWith('image/');
      const sizeKb = att.size ? `${(att.size / 1024).toFixed(0)} KB` : '';
      const row = mk('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '8px', background: '#0d0e10', border: '1px solid #22252a',
          borderRadius: '4px', padding: '8px 10px', cursor: 'pointer', maxWidth: '260px',
        },
        onclick: () => downloadJiraAttachment(att),
      }, [
        mk('span', { style: { fontSize: '14px', color: isImage ? '#5b9bd5' : '#5e6670', flexShrink: '0' } }, [isImage ? '▣' : '▤']),
        mk('div', { style: { minWidth: '0', flex: '1' } }, [
          mk('div', { style: { fontSize: '11.5px', color: '#dfe3e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [att.filename]),
          mk('div', { style: { fontSize: '10px', color: '#5e6670' } }, [sizeKb]),
        ]),
        mk('span', { style: { fontSize: '11px', color: '#5e6670', flexShrink: '0' } }, ['↓']),
      ]);
      attachGrid.appendChild(row);
    });
    wrap.appendChild(attachGrid);
  }

  // ── Vínculo con AWX, si existe ──
  if (link) {
    const linkBox = mk('div', { style: { background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '14px 16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } });
    linkBox.appendChild(mk('div', {
      style: { fontSize: '12.5px', color: '#6ad17e', fontWeight: '600', cursor: 'pointer' },
      onclick: () => {
        const tpl = state.awxTemplates.find((tplItem) => tplItem.id === link.templateId) || { id: link.templateId, name: link.templateName };
        openAwxDetail(tpl, 'jira-detail');
      },
    }, [`→ ${link.templateName}`]));
    linkBox.appendChild(mk('button', {
      style: { background: '#dfe3e7', color: '#0a0b0d', border: 'none', borderRadius: '3px', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
      onclick: () => launchLinkedJob(issue.key),
    }, ['▶ ' + t('inbox_execute')]));
    wrap.appendChild(linkBox);
  }

  // ── Comentarios existentes ──
  const existingComments = (f.comment && f.comment.comments) || [];
  if (existingComments.length > 0) {
    wrap.appendChild(mk('div', { style: { fontSize: '11px', color: '#5e6670', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' } }, [
      `Comments (${existingComments.length})`,
    ]));
    existingComments.forEach((c) => {
      const commentCard = mk('div', { style: { background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '12px 14px', marginBottom: '8px' } });
      commentCard.appendChild(mk('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '6px' } }, [
        mk('span', { style: { fontSize: '12px', color: '#dfe3e7', fontWeight: '600' } }, [(c.author && c.author.displayName) || '—']),
        mk('span', { style: { fontSize: '11px', color: '#5e6670' } }, [c.created ? new Date(c.created).toLocaleString() : '']),
      ]));
      const commentBody = mk('div', { style: { fontSize: '12.5px', color: '#dfe3e7', lineHeight: '1.6' } });
      commentBody.innerHTML = jiraWikiToHtml(c.body || '');
      commentCard.appendChild(commentBody);
      wrap.appendChild(commentCard);
    });
    wrap.appendChild(mk('div', { style: { marginBottom: '16px' } }));
  }

  // ── Comentar ──
  const commentBox = mk('div', { style: { background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '18px', marginBottom: '16px' } });
  commentBox.appendChild(mk('label', { style: { fontSize: '11px', color: '#5e6670', display: 'block', marginBottom: '6px' } }, [t('jira_detail_comment_label')]));
  const commentTextarea = mk('textarea', {
    style: {
      width: '100%', minHeight: '70px', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px',
      padding: '10px 12px', color: '#dfe3e7', fontSize: '13px', resize: 'vertical', marginBottom: '10px', fontFamily: 'inherit',
    },
    placeholder: t('jira_detail_comment_placeholder'),
    'data-focus-key': 'jira-comment-draft',
    oninput: (e) => { state.jiraCommentDraft = e.target.value; },
  });
  commentTextarea.value = state.jiraCommentDraft;
  commentBox.appendChild(commentTextarea);
  const commentDisabled = state.jiraCommentSending || !state.jiraCommentDraft.trim();
  commentBox.appendChild(mk('button', {
    style: {
      background: commentDisabled ? '#22252a' : '#dfe3e7', color: commentDisabled ? '#5e6670' : '#0a0b0d',
      border: 'none', borderRadius: '3px', padding: '8px 20px', fontSize: '13px', fontWeight: '700',
      cursor: commentDisabled ? 'not-allowed' : 'pointer',
    },
    onclick: () => { if (!commentDisabled) sendJiraComment(); },
  }, [state.jiraCommentSending ? t('jira_detail_comment_sending') : t('jira_detail_comment_send')]));
  wrap.appendChild(commentBox);

  // ── Adjuntar reporte ──
  const attachBox = mk('div', { style: { background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '18px' } });
  const attachDisabled = state.jiraAttachSending || !state.awxStdout;
  attachBox.appendChild(mk('button', {
    style: {
      background: 'transparent', color: attachDisabled ? '#5e6670' : '#dfe3e7',
      border: `1px solid ${attachDisabled ? '#22252a' : '#5e6670'}`, borderRadius: '3px', padding: '8px 20px',
      fontSize: '13px', fontWeight: '600', cursor: attachDisabled ? 'not-allowed' : 'pointer',
    },
    onclick: () => { if (!attachDisabled) attachJobOutputToJira(); },
  }, [state.jiraAttachSending ? t('jira_detail_attach_sending') : '⊕ ' + t('jira_detail_attach_button')]));
  if (!state.awxStdout) {
    attachBox.appendChild(mk('p', { style: { fontSize: '11px', color: '#5e6670', marginTop: '8px' } }, [t('jira_detail_no_job_yet')]));
  }
  wrap.appendChild(attachBox);

  return wrap;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CorexTerm — SSH/SFTP con sesiones cifradas, master password, xterm.js
// ═══════════════════════════════════════════════════════════════════════════

async function loadCtSessions() {
  const res = await window.corexAPI.corextermListSessions();
  if (res.ok) state.ctSessions = res.sessions;
}

function newSessionForm() {
  return {
    id: null,
    name: '',
    host: '',
    port: 22,
    username: '',
    authType: 'password', // 'password' | 'key'
    secret: '',
    keyPath: '',
    folder: '',
    useTunnel: false,
    tunnel: { host: '', port: 22, username: '', authType: 'password', secret: '', keyPath: '' },
  };
}

function openNewSessionForm() {
  state.ctShowSessionForm = true;
  state.ctEditingSessionId = null;
  state.ctSessionForm = newSessionForm();
  renderApp();
}

function closeSessionForm() {
  state.ctShowSessionForm = false;
  state.ctSessionForm = null;
  renderApp();
}

async function saveSession() {
  const form = state.ctSessionForm;
  if (!form.name.trim() || !form.host.trim() || !form.username.trim()) {
    toast('Name, host and username are required', 'err');
    return;
  }
  const payload = {
    id: form.id,
    name: form.name.trim(),
    host: form.host.trim(),
    port: Number(form.port) || 22,
    username: form.username.trim(),
    authType: form.authType,
    secret: form.secret || undefined,
    keyPath: form.authType === 'key' ? form.keyPath : undefined,
    folder: form.folder ? form.folder.trim() : null,
    tunnel: form.useTunnel ? {
      host: form.tunnel.host.trim(),
      port: Number(form.tunnel.port) || 22,
      username: form.tunnel.username.trim(),
      authType: form.tunnel.authType,
      secret: form.tunnel.secret || undefined,
      keyPath: form.tunnel.authType === 'key' ? form.tunnel.keyPath : undefined,
    } : undefined,
  };
  const res = await window.corexAPI.corextermSaveSession(payload);
  if (!res.ok) {
    toast(`Could not save session: ${res.error}`, 'err');
    return;
  }
  toast('Session saved', 'ok');
  await loadCtSessions();
  closeSessionForm();
}

async function deleteSession(id) {
  await window.corexAPI.corextermDeleteSession(id);
  await loadCtSessions();
  renderApp();
}

function editSession(session) {
  state.ctShowSessionForm = true;
  state.ctEditingSessionId = session.id;
  state.ctSessionForm = {
    id: session.id,
    name: session.name,
    host: session.host,
    port: session.port,
    username: session.username,
    authType: session.authType,
    secret: '', // nunca se rellena de vuelta — si se deja vacío, se conserva el cifrado existente
    keyPath: '',
    folder: session.folder || '',
    useTunnel: !!session.tunnel,
    tunnel: session.tunnel
      ? { host: session.tunnel.host, port: session.tunnel.port, username: session.tunnel.username, authType: session.tunnel.authType, secret: '', keyPath: '' }
      : { host: '', port: 22, username: '', authType: 'password', secret: '', keyPath: '' },
  };
  renderApp();
}

async function pickKeyFileFor(target) {
  const res = await window.corexAPI.corextermPickKeyFile();
  if (!res.ok) return;
  if (target === 'main') state.ctSessionForm.keyPath = res.path;
  else state.ctSessionForm.tunnel.keyPath = res.path;
  renderApp();
}

// ── Conexión y terminal interactivo ─────────────────────────────────────
// Crea una instancia de xterm.js con la configuración/paleta común a SSH y
// terminal local, la abre sobre el contenedor, y devuelve { term, fitAddon }.
// El llamador se encarga de conectar el lado de datos (SSH o PTY local).
function buildXtermInstance(container) {
  const term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    lineHeight: 1.3,
    scrollback: 5000,
    // Paleta ANSI completa, coherente con el resto de COREX: verde/ámbar/rojo
    // significan lo mismo aquí que en el resto de la app (éxito/aviso/error),
    // en vez de los colores "de juguete" por defecto de xterm.js.
    theme: {
      background: '#0a0b0d',
      foreground: '#dfe3e7',
      cursor: '#dfe3e7',
      cursorAccent: '#0a0b0d',
      selectionBackground: '#22252a99',
      black: '#0a0b0d',
      red: '#c94f4f',
      green: '#6ad17e',
      yellow: '#c98a3a',
      blue: '#5b9bd5',
      magenta: '#b07cc6',
      cyan: '#5bb5b0',
      white: '#dfe3e7',
      brightBlack: '#5e6670',
      brightRed: '#e36a6a',
      brightGreen: '#8be09c',
      brightYellow: '#dba458',
      brightBlue: '#7eb3e0',
      brightMagenta: '#c79bd6',
      brightCyan: '#7ecbc7',
      brightWhite: '#f2f4f6',
    },
  });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);
  fitAddon.fit();
  return { term, fitAddon };
}

function writeWelcomeBanner(term, subtitle) {
  // Reinterpreta el logo (franja diagonal + dos triángulos) con caracteres de
  // bloque, ya que xterm.js pinta texto con color ANSI, no SVG.
  term.write('\x1b[38;2;223;227;231m  ▟▛   ▜▙\x1b[0m\r\n');
  term.write('\x1b[38;2;223;227;231m ▟▛ ▟▛▜▙ ▜▙\x1b[0m  \x1b[38;2;94;102;112mCOREX · CorexTerm\x1b[0m\r\n');
  term.write(`\x1b[38;2;223;227;231m▟▛       ▜▙\x1b[0m  \x1b[38;2;94;102;112m${subtitle}\x1b[0m\r\n\r\n`);
}

function openTerminalTab(terminalId, instanceData) {
  state.ctOpenTerminalIds.push(terminalId);
  state.ctActiveTerminalId = terminalId;
  state.ctTerminalInstances[terminalId] = instanceData;
  renderApp();
}

// Un terminal está visible si es el activo en modo single, o si ocupa
// alguna celda del grid de split — el listener de resize y el fit solo
// deben actuar sobre terminales que de verdad se están pintando.
function isTerminalVisible(terminalId) {
  if (state.ctSplitMode === 'single') return state.ctActiveTerminalId === terminalId;
  return state.ctSplitSlots.includes(terminalId);
}

// Punto único de escritura de teclado hacia el backend. Si MultiExec/
// Broadcast está activo y el terminal de origen es SSH, replicamos la
// misma pulsación a TODAS las pestañas SSH abiertas (no a las locales —
// enviar comandos de un host remoto a tu propia máquina no tiene sentido,
// y sería fácil escribir algo destructivo sin darte cuenta).
function writeToTerminal(sourceTerminalId, data) {
  // Mientras se graba una macro, acumulamos lo que se teclea en el terminal
  // activo — no en los que reciben broadcast, solo en el de origen, porque
  // grabar es "lo que YO escribo", no lo que se replica a otros.
  if (state.ctRecordingMacro && sourceTerminalId === state.ctActiveTerminalId) {
    state.ctMacroBuffer += data;
  }

  const sourceInst = state.ctTerminalInstances[sourceTerminalId];
  if (state.ctBroadcastMode && sourceInst && sourceInst.kind === 'ssh') {
    state.ctOpenTerminalIds.forEach((id) => {
      const inst = state.ctTerminalInstances[id];
      if (inst && inst.kind === 'ssh') {
        window.corexAPI.corextermWrite(id, data);
      }
    });
  } else {
    window.corexAPI.corextermWrite(sourceTerminalId, data);
  }
}

async function connectSession(session) {
  const terminalId = `term-${session.id}-${Date.now()}`;
  openTerminalTab(terminalId, { kind: 'ssh', session, connected: false, term: null, fitAddon: null, label: session.name });

  // El elemento DOM del terminal ya existe tras el renderApp anterior;
  // inicializamos xterm.js sobre él.
  requestAnimationFrame(() => {
    const container = document.getElementById(`xterm-container-${terminalId}`);
    if (!container || typeof Terminal === 'undefined') {
      toast('Terminal engine (xterm.js) failed to load', 'err');
      return;
    }
    const { term, fitAddon } = buildXtermInstance(container);
    writeWelcomeBanner(term, `${session.username}@${session.host}:${session.port}`);

    state.ctTerminalInstances[terminalId].term = term;
    state.ctTerminalInstances[terminalId].fitAddon = fitAddon;

    term.onData((data) => {
      writeToTerminal(terminalId, data);
    });

    const resizeListener = () => {
      if (state.ctTerminalInstances[terminalId] && isTerminalVisible(terminalId)) {
        fitAddon.fit();
        window.corexAPI.corextermResize(terminalId, term.cols, term.rows);
      }
    };
    window.addEventListener('resize', resizeListener);
    state.ctTerminalInstances[terminalId].resizeListener = resizeListener;

    window.corexAPI.corextermConnect(session.id, terminalId, term.cols, term.rows).then((res) => {
      if (!res.ok) {
        term.write(`\r\n\x1b[31mConnection failed: ${res.error}\x1b[0m\r\n`);
        return;
      }
      state.ctTerminalInstances[terminalId].connected = true;
      renderApp();
    });

    // SFTP en paralelo, listo para cuando el usuario abra el panel — no se
    // muestra automáticamente, solo se conecta para que abrir el panel sea
    // instantáneo en vez de tener que esperar una nueva conexión.
    window.corexAPI.corextermSftpConnect(session.id).then((res) => {
      if (state.ctTerminalInstances[terminalId]) {
        state.ctTerminalInstances[terminalId].sftpReady = !!res.ok;
      }
    });
  });
}

// Terminal local: shell de la propia máquina del usuario (bash/zsh/PowerShell),
// sin pasar por SSH — lo que MobaXterm llama "Local terminal".
async function connectLocalTerminal() {
  const terminalId = `local-${Date.now()}`;
  openTerminalTab(terminalId, { kind: 'local', session: null, connected: false, term: null, fitAddon: null, label: 'Local' });

  requestAnimationFrame(() => {
    const container = document.getElementById(`xterm-container-${terminalId}`);
    if (!container || typeof Terminal === 'undefined') {
      toast('Terminal engine (xterm.js) failed to load', 'err');
      return;
    }
    const { term, fitAddon } = buildXtermInstance(container);
    writeWelcomeBanner(term, 'local shell');

    state.ctTerminalInstances[terminalId].term = term;
    state.ctTerminalInstances[terminalId].fitAddon = fitAddon;

    term.onData((data) => {
      window.corexAPI.corextermWrite(terminalId, data);
    });

    const resizeListener = () => {
      if (state.ctTerminalInstances[terminalId] && isTerminalVisible(terminalId)) {
        fitAddon.fit();
        window.corexAPI.corextermResize(terminalId, term.cols, term.rows);
      }
    };
    window.addEventListener('resize', resizeListener);
    state.ctTerminalInstances[terminalId].resizeListener = resizeListener;

    window.corexAPI.corextermConnectLocal(terminalId, term.cols, term.rows).then((res) => {
      if (!res.ok) {
        term.write(`\r\n\x1b[31mFailed to start local shell: ${res.error}\x1b[0m\r\n`);
        return;
      }
      state.ctTerminalInstances[terminalId].connected = true;
      renderApp();
    });
  });
}

function switchToTab(terminalId) {
  state.ctActiveTerminalId = terminalId;
  renderApp();
  // El fit hay que recalcularlo tras el cambio de pestaña, porque el
  // contenedor estuvo oculto/destruido y sus dimensiones pueden no coincidir.
  requestAnimationFrame(() => {
    const inst = state.ctTerminalInstances[terminalId];
    if (inst && inst.fitAddon) {
      inst.fitAddon.fit();
      if (inst.term) window.corexAPI.corextermResize(terminalId, inst.term.cols, inst.term.rows);
    }
  });
}

// ── Split screen — igual que el botón "Split" de MobaXterm ──────────────
const SPLIT_SLOT_COUNT = { single: 1, h2: 2, v2: 2, grid4: 4 };

function refitAllSplitSlots() {
  requestAnimationFrame(() => {
    state.ctSplitSlots.forEach((terminalId) => {
      if (!terminalId) return;
      const inst = state.ctTerminalInstances[terminalId];
      if (inst && inst.fitAddon) {
        inst.fitAddon.fit();
        if (inst.term) window.corexAPI.corextermResize(terminalId, inst.term.cols, inst.term.rows);
      }
    });
  });
}

function setSplitMode(mode) {
  state.ctSplitMode = mode;
  const slotCount = SPLIT_SLOT_COUNT[mode];
  // Al pasar a split, la primera celda hereda la pestaña activa actual, para
  // no perder de vista lo que estabas mirando.
  const slots = [null, null, null, null];
  if (mode !== 'single' && state.ctActiveTerminalId) {
    slots[0] = state.ctActiveTerminalId;
  }
  state.ctSplitSlots = slots;
  renderApp();
  refitAllSplitSlots();
}

function assignSlot(slotIndex, terminalId) {
  state.ctSplitSlots[slotIndex] = terminalId;
  renderApp();
  refitAllSplitSlots();
}

async function closeTab(terminalId) {
  await window.corexAPI.corextermDisconnect(terminalId);
  const inst = state.ctTerminalInstances[terminalId];
  if (inst) {
    if (inst.resizeListener) window.removeEventListener('resize', inst.resizeListener);
    if (inst.term) inst.term.dispose();
    if (inst.kind === 'ssh' && inst.session) window.corexAPI.corextermSftpDisconnect(inst.session.id);
  }
  if (state.ctSftpOpenFor === terminalId) state.ctSftpOpenFor = null;
  // Si este terminal estaba asignado a alguna celda de split, la vaciamos.
  state.ctSplitSlots = state.ctSplitSlots.map((id) => (id === terminalId ? null : id));
  delete state.ctTerminalInstances[terminalId];
  state.ctOpenTerminalIds = state.ctOpenTerminalIds.filter((id) => id !== terminalId);

  if (state.ctActiveTerminalId === terminalId) {
    // Al cerrar la pestaña activa, mostramos la anterior si existe, o
    // volvemos a la lista de sesiones si no quedan pestañas abiertas.
    state.ctActiveTerminalId = state.ctOpenTerminalIds.length > 0
      ? state.ctOpenTerminalIds[state.ctOpenTerminalIds.length - 1]
      : null;
  }

  // MultiExec deja de tener sentido (y de tener efecto) con menos de 2
  // pestañas SSH — lo desactivamos para que no quede "armado" en silencio.
  const remainingSsh = state.ctOpenTerminalIds.filter((id) => {
    const i = state.ctTerminalInstances[id];
    return i && i.kind === 'ssh';
  }).length;
  if (remainingSsh < 2) state.ctBroadcastMode = false;

  renderApp();
}

// ═══════════════════════════════════════════════════════════════════════════
//  SFTP — panel lateral dentro de una pestaña SSH, como en MobaXterm
// ═══════════════════════════════════════════════════════════════════════════

function toggleSftpPanel(terminalId) {
  const inst = state.ctTerminalInstances[terminalId];
  if (!inst || inst.kind !== 'ssh') return;
  if (state.ctSftpOpenFor === terminalId) {
    state.ctSftpOpenFor = null;
  } else {
    state.ctSftpOpenFor = terminalId;
    state.ctSftpPath = '.';
    loadSftpDir(inst.session.id, '.');
  }
  renderApp();
  // El terminal pierde ancho al abrirse el panel — hay que recalcular el fit.
  requestAnimationFrame(() => {
    if (inst.fitAddon) {
      inst.fitAddon.fit();
      if (inst.term) window.corexAPI.corextermResize(terminalId, inst.term.cols, inst.term.rows);
    }
  });
}

async function loadSftpDir(sessionId, remotePath) {
  state.ctSftpLoading = true;
  state.ctSftpError = null;
  renderApp();

  const res = await window.corexAPI.corextermSftpList(sessionId, remotePath);
  state.ctSftpLoading = false;
  if (!res.ok) {
    state.ctSftpError = res.error;
  } else {
    state.ctSftpPath = remotePath;
    // Carpetas primero, luego archivos, ambos alfabéticos — más fácil de
    // escanear visualmente que el orden crudo que devuelve el servidor.
    state.ctSftpEntries = res.entries
      .filter((e) => e.name !== '.')
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }
  renderApp();
}

function sftpJoin(base, name) {
  if (name === '..') {
    const parts = base.split('/').filter(Boolean);
    parts.pop();
    return parts.length ? parts.join('/') : '.';
  }
  return base === '.' ? name : `${base.replace(/\/$/, '')}/${name}`;
}

function navigateSftp(sessionId, entry) {
  if (entry.isDirectory) {
    loadSftpDir(sessionId, sftpJoin(state.ctSftpPath, entry.name));
  } else {
    openRemoteFileEditor(sessionId, sftpJoin(state.ctSftpPath, entry.name));
  }
}

async function downloadSftpEntry(sessionId, entry) {
  const remotePath = sftpJoin(state.ctSftpPath, entry.name);
  const res = await window.corexAPI.corextermSftpDownload(sessionId, remotePath);
  if (res.canceled) return;
  if (!res.ok) toast(`Download failed: ${res.error}`, 'err');
  else toast(`Saved to ${res.filePath}`, 'ok');
}

async function uploadToSftpDir(sessionId) {
  const res = await window.corexAPI.corextermSftpUpload(sessionId, state.ctSftpPath);
  if (res.canceled) return;
  if (!res.ok) toast(`Upload failed: ${res.error}`, 'err');
  else {
    toast('File uploaded', 'ok');
    loadSftpDir(sessionId, state.ctSftpPath);
  }
}

async function deleteSftpEntry(sessionId, entry) {
  const remotePath = sftpJoin(state.ctSftpPath, entry.name);
  const res = await window.corexAPI.corextermSftpDelete(sessionId, remotePath, entry.isDirectory);
  if (!res.ok) toast(`Delete failed: ${res.error}`, 'err');
  else {
    toast('Deleted', 'ok');
    loadSftpDir(sessionId, state.ctSftpPath);
  }
}

async function createSftpFolder(sessionId) {
  const name = window.prompt ? window.prompt('Folder name:') : null;
  if (!name) return;
  const res = await window.corexAPI.corextermSftpMkdir(sessionId, sftpJoin(state.ctSftpPath, name));
  if (!res.ok) toast(`Could not create folder: ${res.error}`, 'err');
  else loadSftpDir(sessionId, state.ctSftpPath);
}

// ── Editor remoto inline — doble-click en un archivo abre esto ──────────
async function openRemoteFileEditor(sessionId, remotePath) {
  const res = await window.corexAPI.corextermSftpReadFile(sessionId, remotePath);
  if (!res.ok) {
    toast(`Could not open file: ${res.error}`, 'err');
    return;
  }
  state.ctEditorFile = { sessionId, remotePath, content: res.content, dirty: false };
  renderApp();
}

async function saveRemoteFileEditor() {
  if (!state.ctEditorFile) return;
  state.ctEditorSaving = true;
  renderApp();
  const { sessionId, remotePath, content } = state.ctEditorFile;
  const res = await window.corexAPI.corextermSftpWriteFile(sessionId, remotePath, content);
  state.ctEditorSaving = false;
  if (!res.ok) {
    toast(`Save failed: ${res.error}`, 'err');
  } else {
    toast('Saved', 'ok');
    state.ctEditorFile.dirty = false;
  }
  renderApp();
}

function closeRemoteFileEditor() {
  if (state.ctEditorFile && state.ctEditorFile.dirty) {
    const confirmed = window.confirm ? window.confirm('Discard unsaved changes?') : true;
    if (!confirmed) return;
  }
  state.ctEditorFile = null;
  renderApp();
}

// ── Macros — grabar/reproducir secuencias de teclas ─────────────────────
async function loadCtMacros() {
  const res = await window.corexAPI.corextermListMacros();
  if (res.ok) state.ctMacros = res.macros;
}

function startRecordingMacro() {
  if (!state.ctActiveTerminalId) {
    toast('Open a terminal first', 'err');
    return;
  }
  state.ctRecordingMacro = true;
  state.ctMacroBuffer = '';
  toast('Recording macro… type your commands', 'ok');
  renderApp();
}

function stopRecordingMacro() {
  state.ctRecordingMacro = false;
  if (!state.ctMacroBuffer) {
    renderApp();
    return;
  }
  const name = window.prompt ? window.prompt('Macro name:') : null;
  if (!name) {
    state.ctMacroBuffer = '';
    renderApp();
    return;
  }
  window.corexAPI.corextermSaveMacro({ name, keys: state.ctMacroBuffer }).then(() => {
    toast(`Macro "${name}" saved`, 'ok');
    state.ctMacroBuffer = '';
    loadCtMacros().then(renderApp);
  });
}

// Reproduce la macro en el terminal activo — exactamente la idea de
// MobaXterm: grabas en un servidor, repites en otros, sin volver a teclear.
function playMacro(macro) {
  if (!state.ctActiveTerminalId) {
    toast('Open a terminal first', 'err');
    return;
  }
  // Pasa por writeToTerminal a propósito: si MultiExec está activo, la
  // macro se reproduce en todas las pestañas SSH abiertas, no solo en la
  // activa — es el caso de uso típico ("ejecuta esto en todos los servidores").
  writeToTerminal(state.ctActiveTerminalId, macro.keys);
}

async function deleteMacro(id) {
  await window.corexAPI.corextermDeleteMacro(id);
  await loadCtMacros();
  renderApp();
}

function toggleMacroPanel() {
  state.ctShowMacroPanel = !state.ctShowMacroPanel;
  if (state.ctShowMacroPanel && state.ctMacros.length === 0) loadCtMacros().then(renderApp);
  renderApp();
}

function setupCorextermListeners() {
  // Se registra una sola vez; despacha por terminalId a la instancia correcta.
  window.corexAPI.onCorextermData(({ terminalId, data }) => {
    const inst = state.ctTerminalInstances[terminalId];
    if (inst && inst.term) inst.term.write(data);
  });
  window.corexAPI.onCorextermClosed(({ terminalId }) => {
    const inst = state.ctTerminalInstances[terminalId];
    if (inst && inst.term) inst.term.write('\r\n\x1b[33m[connection closed]\x1b[0m\r\n');
  });
  window.corexAPI.onCorextermError(({ terminalId, error }) => {
    const inst = state.ctTerminalInstances[terminalId];
    if (inst && inst.term) inst.term.write(`\r\n\x1b[31m[error: ${error}]\x1b[0m\r\n`);
  });
}

// ── Render ───────────────────────────────────────────────────────────────
function renderCorexTermView() {
  const hasOpenTabs = state.ctOpenTerminalIds.length > 0;
  const inSplitView = hasOpenTabs && state.ctSplitMode !== 'single';
  const wrap = mk('div', { style: { maxWidth: inSplitView ? '100%' : '900px', height: '100%', display: 'flex', flexDirection: 'column' } });

  wrap.appendChild(mk('h1', { style: { fontSize: '22px', fontWeight: '700', marginBottom: '4px', color: '#dfe3e7' } }, ['CorexTerm']));
  wrap.appendChild(mk('p', { style: { fontSize: '13px', color: '#5e6670', marginBottom: '16px' } }, ['SSH / SFTP sessions, encrypted with your master password.']));

  // El vault global ya garantiza que llegamos aquí desbloqueados — no hay
  // gate propio de CorexTerm. Si por algún motivo se cerrara entre medias,
  // mostramos un aviso simple en vez de un formulario duplicado.
  if (!state.vaultUnlocked) {
    wrap.appendChild(mk('div', { style: { fontSize: '13px', color: '#c98a3a' } }, ['Vault is locked. Please restart COREX.']));
    return wrap;
  }

  // La barra de pestañas se muestra siempre que haya al menos una conexión
  // abierta, como en un navegador — persiste aunque navegues a la lista de
  // sesiones o al formulario, no solo mientras ves un terminal en concreto.
  if (hasOpenTabs) {
    wrap.appendChild(renderCtTabBar());
  }

  if (state.ctShowMacroPanel) {
    wrap.appendChild(renderMacroPanel());
  }

  if (hasOpenTabs) {
    wrap.appendChild(inSplitView ? renderCtSplitGrid() : renderCtActiveTerminal());
    return wrap;
  }

  if (state.ctShowSessionForm) {
    wrap.appendChild(renderCtSessionForm());
    return wrap;
  }

  wrap.appendChild(renderCtSessionList());
  return wrap;
}

// Barra de pestañas horizontal, estilo navegador: una por cada terminal
// abierto (SSH o local), con su estado de conexión y botón de cierre.
function renderCtTabBar() {
  const bar = mk('div', { style: { display: 'flex', gap: '2px', marginBottom: '0', borderBottom: '1px solid #22252a', overflowX: 'auto' } });

  state.ctOpenTerminalIds.forEach((id) => {
    const inst = state.ctTerminalInstances[id];
    if (!inst) return;
    const active = state.ctActiveTerminalId === id;
    const dotColor = inst.connected ? '#6ad17e' : '#c98a3a';

    const tab = mk('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 10px',
        background: active ? '#0d0e10' : 'transparent',
        border: `1px solid ${state.ctBroadcastMode && inst.kind === 'ssh' ? '#c98a3a' : (active ? '#22252a' : 'transparent')}`,
        borderBottom: active ? '1px solid #0d0e10' : '1px solid transparent',
        marginBottom: '-1px',
        borderRadius: '3px 3px 0 0',
        cursor: 'pointer',
        maxWidth: '180px',
      },
      onclick: () => switchToTab(id),
    });
    tab.appendChild(mk('span', {
      style: { display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: dotColor, flexShrink: '0' },
    }));
    tab.appendChild(mk('span', {
      style: { fontSize: '11.5px', color: active ? '#dfe3e7' : '#5e6670', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    }, [inst.label || (inst.session ? inst.session.name : 'Terminal')]));
    tab.appendChild(mk('span', {
      style: { fontSize: '13px', color: '#5e6670', cursor: 'pointer', flexShrink: '0', lineHeight: '1', padding: '0 2px' },
      onclick: (e) => { e.stopPropagation(); closeTab(id); },
    }, ['×']));
    bar.appendChild(tab);
  });

  // "+" para abrir una nueva pestaña — vuelve a la lista de sesiones sin
  // cerrar las pestañas ya abiertas, igual que un navegador.
  bar.appendChild(mk('div', {
    style: { display: 'flex', alignItems: 'center', padding: '7px 12px', cursor: 'pointer', color: '#5e6670', fontSize: '14px' },
    onclick: () => { state.ctActiveTerminalId = null; renderApp(); },
  }, ['+']));

  // Controles de split — igual que el botón "Split" de MobaXterm: alternar
  // entre vista única, 2 paneles (horizontal/vertical) o grid de 4.
  const splitGroup = mk('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto', paddingRight: '4px' } });
  const splitButtons = [
    { mode: 'single', label: '▭', title: 'Single' },
    { mode: 'h2', label: '▥', title: 'Split horizontal (2)' },
    { mode: 'v2', label: '▤', title: 'Split vertical (2)' },
    { mode: 'grid4', label: '▦', title: 'Grid (4)' },
  ];
  splitButtons.forEach((btn) => {
    const isActive = state.ctSplitMode === btn.mode;
    splitGroup.appendChild(mk('span', {
      style: {
        fontSize: '13px', padding: '4px 7px', cursor: 'pointer', borderRadius: '3px',
        color: isActive ? '#dfe3e7' : '#5e6670',
        background: isActive ? '#1a1d22' : 'transparent',
      },
      title: btn.title,
      onclick: () => setSplitMode(btn.mode),
    }, [btn.label]));
  });

  // MultiExec / Broadcast — toggle con color de aviso fuerte cuando está
  // activo, porque escribir a varias sesiones SSH a la vez por descuido es
  // exactamente el tipo de error que puede doler en producción.
  const sshTabCount = state.ctOpenTerminalIds.filter((id) => {
    const inst = state.ctTerminalInstances[id];
    return inst && inst.kind === 'ssh';
  }).length;
  splitGroup.appendChild(mk('span', {
    style: {
      fontSize: '11px', fontWeight: '700', padding: '4px 9px', cursor: sshTabCount > 1 ? 'pointer' : 'not-allowed',
      borderRadius: '3px', marginLeft: '6px',
      color: state.ctBroadcastMode ? '#0a0b0d' : (sshTabCount > 1 ? '#5e6670' : '#3a3f44'),
      background: state.ctBroadcastMode ? '#c98a3a' : 'transparent',
      border: `1px solid ${state.ctBroadcastMode ? '#c98a3a' : '#22252a'}`,
    },
    title: sshTabCount > 1 ? 'MultiExec: type once, send to all open SSH tabs' : 'Open 2+ SSH tabs to use MultiExec',
    onclick: () => { if (sshTabCount > 1) { state.ctBroadcastMode = !state.ctBroadcastMode; renderApp(); } },
  }, ['MultiExec']));

  // Macros — grabar/parar y abrir el panel de macros guardadas.
  splitGroup.appendChild(mk('span', {
    style: {
      fontSize: '11px', fontWeight: '700', padding: '4px 9px', cursor: 'pointer',
      borderRadius: '3px', marginLeft: '6px', display: 'flex', alignItems: 'center', gap: '5px',
      color: state.ctRecordingMacro ? '#0a0b0d' : '#5e6670',
      background: state.ctRecordingMacro ? '#c94f4f' : 'transparent',
      border: `1px solid ${state.ctRecordingMacro ? '#c94f4f' : '#22252a'}`,
    },
    title: state.ctRecordingMacro ? 'Stop recording and save macro' : 'Record a new macro',
    onclick: () => { state.ctRecordingMacro ? stopRecordingMacro() : startRecordingMacro(); },
  }, [
    mk('span', { style: { display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: state.ctRecordingMacro ? '#0a0b0d' : '#c94f4f' } }),
    state.ctRecordingMacro ? 'Stop' : 'Record',
  ]));
  splitGroup.appendChild(mk('span', {
    style: {
      fontSize: '13px', padding: '4px 7px', cursor: 'pointer', borderRadius: '3px',
      color: state.ctShowMacroPanel ? '#dfe3e7' : '#5e6670',
      background: state.ctShowMacroPanel ? '#1a1d22' : 'transparent',
    },
    title: 'Saved macros',
    onclick: () => toggleMacroPanel(),
  }, ['☰']));
  bar.appendChild(splitGroup);

  return bar;
}

function renderMacroPanel() {
  const panel = mk('div', { style: { background: '#0d0e10', border: '1px solid #22252a', borderTop: 'none', borderRadius: '0 0 3px 3px', padding: '10px 14px', marginBottom: '10px' } });
  panel.appendChild(mk('div', { style: { fontSize: '10.5px', fontWeight: '700', color: '#5e6670', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' } }, ['Saved macros']));

  if (state.ctMacros.length === 0) {
    panel.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#5e6670' } }, [
      'No macros yet. Hit "Record" in the tab bar, type a sequence, then "Stop" to save it.',
    ]));
    return panel;
  }

  state.ctMacros.forEach((macro) => {
    const row = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' } });
    row.appendChild(mk('span', { style: { fontSize: '12px', color: '#dfe3e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [macro.name]));
    const actions = mk('div', { style: { display: 'flex', gap: '10px', flexShrink: '0' } });
    actions.appendChild(mk('span', {
      style: { fontSize: '11px', color: '#6ad17e', cursor: 'pointer', fontWeight: '700' },
      onclick: () => playMacro(macro),
    }, ['▶ Play']));
    actions.appendChild(mk('span', {
      style: { fontSize: '11px', color: '#5e6670', cursor: 'pointer' },
      onclick: () => deleteMacro(macro.id),
    }, ['delete']));
    row.appendChild(actions);
    panel.appendChild(row);
  });

  return panel;
}

function renderSessionCard(s) {
  const card = mk('div', { style: { background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '12px 16px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } });
  const leftCol = mk('div', { style: { cursor: 'pointer' }, onclick: () => connectSession(s) }, [
    mk('div', { style: { fontSize: '13px', fontWeight: '700', color: '#dfe3e7' } }, [s.name]),
    mk('div', { style: { fontSize: '11px', color: '#5e6670' } }, [
      `${s.username}@${s.host}:${s.port}` + (s.hasTunnel ? `  via ${s.tunnel.username}@${s.tunnel.host}` : ''),
    ]),
  ]);
  const actionsCol = mk('div', { style: { display: 'flex', gap: '8px' } }, [
    mk('button', {
      style: { background: '#dfe3e7', color: '#0a0b0d', border: 'none', borderRadius: '3px', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
      onclick: () => connectSession(s),
    }, ['Connect']),
    mk('span', { style: { fontSize: '11px', color: '#5e6670', cursor: 'pointer', alignSelf: 'center' }, onclick: () => editSession(s) }, ['edit']),
    mk('span', { style: { fontSize: '11px', color: '#5e6670', cursor: 'pointer', alignSelf: 'center' }, onclick: () => deleteSession(s.id) }, ['delete']),
  ]);
  card.appendChild(leftCol);
  card.appendChild(actionsCol);
  return card;
}

function renderCtSessionList() {
  const wrap = mk('div', {});
  const headerRow = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' } });
  headerRow.appendChild(mk('span', { style: { fontSize: '11px', fontWeight: '700', color: '#5e6670', textTransform: 'uppercase', letterSpacing: '0.5px' } }, [`${state.ctSessions.length} saved session(s)`]));
  const headerActions = mk('div', { style: { display: 'flex', gap: '8px' } });
  headerActions.appendChild(mk('button', {
    style: { background: 'transparent', border: '1px solid #22252a', color: '#dfe3e7', borderRadius: '3px', padding: '7px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
    onclick: () => connectLocalTerminal(),
  }, ['▸_ Local terminal']));
  headerActions.appendChild(mk('button', {
    style: { background: '#dfe3e7', color: '#0a0b0d', border: 'none', borderRadius: '3px', padding: '7px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
    onclick: () => openNewSessionForm(),
  }, ['+ New session']));
  headerRow.appendChild(headerActions);
  wrap.appendChild(headerRow);

  if (state.ctSessions.length === 0) {
    const emptyLogoSvg = '<svg viewBox="0 0 15559.15 9394.27" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:64px;height:39px;display:block;margin:0 auto 14px;opacity:0.18;">' +
      '<polygon fill="currentColor" points="4445.48,7673.09 2222.74,4535.94 -0,7673.09" />' +
      '<polygon fill="currentColor" points="11113.67,1398.78 13336.4,4535.93 15559.15,1398.78" />' +
      '<polygon fill="currentColor" points="9039.43,9394.27 2383.41,0 7115.63,0 13771.67,9394.27" />' +
      '</svg>';
    const emptyState = mk('div', { style: { textAlign: 'center', padding: '60px 0', color: '#5e6670' } });
    emptyState.appendChild(mk('div', { html: emptyLogoSvg, style: { color: '#dfe3e7' } }));
    emptyState.appendChild(mk('div', { style: { fontSize: '13px' } }, ['No saved sessions yet.']));
    wrap.appendChild(emptyState);
    return wrap;
  }

  // Agrupamos por carpeta — las sesiones sin carpeta van sueltas, sin
  // sección, directamente en la lista (no tiene sentido un grupo "Ungrouped"
  // si la mayoría de tus sesiones no usan carpetas).
  const grouped = {};
  const ungrouped = [];
  state.ctSessions.forEach((s) => {
    if (s.folder) {
      if (!grouped[s.folder]) grouped[s.folder] = [];
      grouped[s.folder].push(s);
    } else {
      ungrouped.push(s);
    }
  });

  Object.keys(grouped).sort().forEach((folderName) => {
    const collapsed = !!state.ctCollapsedFolders[folderName];
    const folderHeader = mk('div', {
      style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 2px', cursor: 'pointer', marginTop: '4px' },
      onclick: () => { state.ctCollapsedFolders[folderName] = !collapsed; renderApp(); },
    });
    folderHeader.appendChild(mk('span', { style: { fontSize: '10px', color: '#5e6670' } }, [collapsed ? '▸' : '▾']));
    folderHeader.appendChild(mk('span', { style: { fontSize: '11px', fontWeight: '700', color: '#5e6670', textTransform: 'uppercase', letterSpacing: '0.5px' } }, [folderName]));
    folderHeader.appendChild(mk('span', { style: { fontSize: '10.5px', color: '#5e6670' } }, [`(${grouped[folderName].length})`]));
    wrap.appendChild(folderHeader);

    if (!collapsed) {
      grouped[folderName].forEach((s) => wrap.appendChild(renderSessionCard(s)));
    }
  });

  ungrouped.forEach((s) => wrap.appendChild(renderSessionCard(s)));

  return wrap;
}

function ctFormField(label, value, onInput, opts) {
  opts = opts || {};
  const col = mk('div', { style: { marginBottom: '10px' } });
  col.appendChild(mk('label', { style: { fontSize: '10.5px', color: '#5e6670', display: 'block', marginBottom: '4px' } }, [label]));
  col.appendChild(mk('input', {
    style: { width: '100%', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', padding: '7px 10px', color: '#dfe3e7', fontSize: '12.5px' },
    type: opts.type || 'text',
    placeholder: opts.placeholder || '',
    value: value || '',
    oninput: (e) => onInput(e.target.value),
  }));
  return col;
}

function renderCtAuthFields(target, authType, username, secret, keyPath, onUsername, onAuthType, onSecret, onKeyPath) {
  const wrap = mk('div', {});
  wrap.appendChild(ctFormField('Username', username, onUsername));
  wrap.appendChild(mk('div', { style: { display: 'flex', gap: '8px', marginBottom: '10px' } }, [
    mk('div', {
      style: { flex: '1', textAlign: 'center', padding: '6px 0', fontSize: '11px', fontWeight: '700', cursor: 'pointer', borderRadius: '3px', background: authType === 'password' ? '#1a1d22' : 'transparent', border: `1px solid ${authType === 'password' ? '#dfe3e7' : '#22252a'}`, color: authType === 'password' ? '#dfe3e7' : '#5e6670' },
      onclick: () => { onAuthType('password'); renderApp(); },
    }, ['Password']),
    mk('div', {
      style: { flex: '1', textAlign: 'center', padding: '6px 0', fontSize: '11px', fontWeight: '700', cursor: 'pointer', borderRadius: '3px', background: authType === 'key' ? '#1a1d22' : 'transparent', border: `1px solid ${authType === 'key' ? '#dfe3e7' : '#22252a'}`, color: authType === 'key' ? '#dfe3e7' : '#5e6670' },
      onclick: () => { onAuthType('key'); renderApp(); },
    }, ['SSH Key']),
  ]));
  if (authType === 'key') {
    wrap.appendChild(mk('div', { style: { display: 'flex', gap: '8px', marginBottom: '10px' } }, [
      mk('input', { style: { flex: '1', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', padding: '7px 10px', color: '#dfe3e7', fontSize: '12px' }, type: 'text', value: keyPath || '', placeholder: 'Path to private key', oninput: (e) => onKeyPath(e.target.value) }),
      mk('button', { style: { background: 'transparent', border: '1px solid #22252a', color: '#dfe3e7', borderRadius: '3px', padding: '0 12px', cursor: 'pointer', fontSize: '12px' }, onclick: () => pickKeyFileFor(target) }, ['Browse']),
    ]));
    wrap.appendChild(ctFormField('Key passphrase (if any)', secret, onSecret, { type: 'password' }));
  } else {
    wrap.appendChild(ctFormField('Password', secret, onSecret, { type: 'password', placeholder: state.ctEditingSessionId ? '(unchanged — leave blank to keep)' : '' }));
  }
  return wrap;
}

function renderCtSessionForm() {
  const form = state.ctSessionForm;
  const wrap = mk('div', { style: { maxWidth: '420px' } });
  wrap.appendChild(mk('div', { style: { fontSize: '13px', fontWeight: '700', color: '#dfe3e7', marginBottom: '14px' } }, [state.ctEditingSessionId ? 'Edit session' : 'New session']));

  wrap.appendChild(ctFormField('Session name', form.name, (v) => { form.name = v; }));
  wrap.appendChild(mk('div', { style: { display: 'flex', gap: '8px' } }, [
    mk('div', { style: { flex: '1' } }, [ctFormField('Host', form.host, (v) => { form.host = v; })]),
    mk('div', { style: { width: '90px' } }, [ctFormField('Port', form.port, (v) => { form.port = v; }, { type: 'number' })]),
  ]));
  wrap.appendChild(renderCtAuthFields(
    'main', form.authType, form.username, form.secret, form.keyPath,
    (v) => { form.username = v; }, (v) => { form.authType = v; }, (v) => { form.secret = v; }, (v) => { form.keyPath = v; }
  ));

  // Carpeta opcional, para agrupar sesiones en la lista (p.ej. "Production",
  // "Client X") — con autocompletado de las carpetas ya usadas.
  const existingFolders = Array.from(new Set(state.ctSessions.map((s) => s.folder).filter(Boolean)));
  const folderField = mk('div', { style: { marginBottom: '10px' } });
  folderField.appendChild(mk('label', { style: { fontSize: '10.5px', color: '#5e6670', display: 'block', marginBottom: '4px' } }, ['Folder (optional)']));
  const folderInput = mk('input', {
    style: { width: '100%', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', padding: '7px 10px', color: '#dfe3e7', fontSize: '12.5px' },
    type: 'text',
    placeholder: 'e.g. Production',
    value: form.folder || '',
    list: 'ct-folder-options',
    oninput: (e) => { form.folder = e.target.value; },
  });
  folderField.appendChild(folderInput);
  if (existingFolders.length > 0) {
    const datalist = mk('datalist', { id: 'ct-folder-options' });
    existingFolders.forEach((f) => datalist.appendChild(mk('option', { value: f })));
    folderField.appendChild(datalist);
  }
  wrap.appendChild(folderField);

  wrap.appendChild(mk('div', { style: { margin: '14px 0 10px' } }, [
    renderCheckbox(form.useTunnel, (e) => { form.useTunnel = e.target.checked; renderApp(); }, mk('span', { style: { fontSize: '12px', color: '#dfe3e7' } }, ['Connect via jump host / tunnel'])),
  ]));

  if (form.useTunnel) {
    wrap.appendChild(mk('div', { style: { borderTop: '1px solid #22252a', paddingTop: '10px', marginBottom: '10px' } }, [
      mk('div', { style: { fontSize: '11px', fontWeight: '700', color: '#5e6670', marginBottom: '8px' } }, ['JUMP HOST']),
    ]));
    wrap.appendChild(mk('div', { style: { display: 'flex', gap: '8px' } }, [
      mk('div', { style: { flex: '1' } }, [ctFormField('Host', form.tunnel.host, (v) => { form.tunnel.host = v; })]),
      mk('div', { style: { width: '90px' } }, [ctFormField('Port', form.tunnel.port, (v) => { form.tunnel.port = v; }, { type: 'number' })]),
    ]));
    wrap.appendChild(renderCtAuthFields(
      'tunnel', form.tunnel.authType, form.tunnel.username, form.tunnel.secret, form.tunnel.keyPath,
      (v) => { form.tunnel.username = v; }, (v) => { form.tunnel.authType = v; }, (v) => { form.tunnel.secret = v; }, (v) => { form.tunnel.keyPath = v; }
    ));
  }

  const btnRow = mk('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } });
  btnRow.appendChild(mk('button', { style: { background: '#dfe3e7', color: '#0a0b0d', border: 'none', borderRadius: '3px', padding: '9px 20px', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }, onclick: () => saveSession() }, ['Save']));
  btnRow.appendChild(mk('span', { style: { fontSize: '12px', color: '#5e6670', cursor: 'pointer', alignSelf: 'center' }, onclick: () => closeSessionForm() }, ['Cancel']));
  wrap.appendChild(btnRow);

  return wrap;
}

// Grid de split screen: 2 o 4 celdas, cada una puede mostrar cualquiera de
// las pestañas abiertas (o quedar vacía con un selector). A diferencia del
// modo single, aquí SÍ pueden estar reabiertos varios `term` a la vez, cada
// uno en su propio contenedor DOM — por eso el id de cada contenedor es por
// índice de celda, no por terminalId.
function renderCtSplitGrid() {
  const mode = state.ctSplitMode;
  const slotCount = SPLIT_SLOT_COUNT[mode];
  const isGrid4 = mode === 'grid4';
  const isVertical = mode === 'v2'; // 'v2' = paneles uno encima del otro

  const grid = mk('div', {
    style: {
      flex: '1', display: 'grid', gap: '6px', minHeight: '460px',
      gridTemplateColumns: isGrid4 ? '1fr 1fr' : isVertical ? '1fr' : `repeat(${slotCount}, 1fr)`,
      gridTemplateRows: isGrid4 ? '1fr 1fr' : isVertical ? `repeat(${slotCount}, 1fr)` : '1fr',
    },
  });

  for (let i = 0; i < slotCount; i++) {
    grid.appendChild(renderSplitCell(i));
  }
  return grid;
}

function renderSplitCell(slotIndex) {
  const terminalId = state.ctSplitSlots[slotIndex];
  const cellId = `split-cell-${slotIndex}`;
  const wrap = mk('div', { style: { display: 'flex', flexDirection: 'column', minHeight: '0', border: '1px solid #22252a', borderRadius: '3px', overflow: 'hidden' } });

  if (!terminalId) {
    // Celda vacía: selector para asignar cualquiera de las pestañas abiertas.
    const empty = mk('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0d0e10', gap: '8px' } });
    empty.appendChild(mk('div', { style: { fontSize: '11px', color: '#5e6670' } }, ['Choose a terminal']));
    state.ctOpenTerminalIds.forEach((id) => {
      const inst = state.ctTerminalInstances[id];
      if (!inst) return;
      empty.appendChild(mk('div', {
        style: { fontSize: '12px', color: '#dfe3e7', padding: '5px 14px', border: '1px solid #22252a', borderRadius: '3px', cursor: 'pointer' },
        onclick: () => assignSlot(slotIndex, id),
      }, [inst.label || 'Terminal']));
    });
    wrap.appendChild(empty);
    return wrap;
  }

  const inst = state.ctTerminalInstances[terminalId];
  const connected = inst && inst.connected;

  const headerRow = mk('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0d0e10', padding: '5px 10px', borderBottom: '1px solid #22252a' },
  });
  headerRow.appendChild(mk('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#dfe3e7', overflow: 'hidden' } }, [
    mk('span', { style: { display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: connected ? '#6ad17e' : '#c98a3a', flexShrink: '0' } }),
    mk('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [inst ? (inst.label || 'Terminal') : '']),
  ]));
  headerRow.appendChild(mk('span', {
    style: { fontSize: '11px', color: '#5e6670', cursor: 'pointer' },
    onclick: () => assignSlot(slotIndex, null),
  }, ['change']));
  wrap.appendChild(headerRow);

  const container = mk('div', {
    id: `xterm-container-${cellId}`,
    style: { flex: '1', background: '#0a0b0d', padding: '6px', minHeight: '0' },
  });
  wrap.appendChild(container);

  // Reabrimos el term existente sobre el contenedor de ESTA celda. Como cada
  // celda tiene su propio contenedor (por índice, no por terminalId), el
  // mismo terminal puede pasar de la vista single a una celda de split sin
  // perder su buffer ni su conexión — solo cambia dónde se pinta.
  if (inst && inst.term) {
    requestAnimationFrame(() => {
      const freshContainer = document.getElementById(`xterm-container-${cellId}`);
      if (freshContainer && !freshContainer.hasChildNodes()) {
        inst.term.open(freshContainer);
        if (inst.fitAddon) inst.fitAddon.fit();
      }
    });
  }

  return wrap;
}

function renderCtActiveTerminal() {
  const terminalId = state.ctActiveTerminalId;
  const inst = state.ctTerminalInstances[terminalId];
  const connected = inst && inst.connected;
  const isSsh = inst && inst.kind === 'ssh';
  const sftpOpen = state.ctSftpOpenFor === terminalId;
  const wrap = mk('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', minHeight: '460px' } });

  const headerRow = mk('div', {
    style: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      background: '#0d0e10', border: '1px solid #22252a', borderTop: 'none', borderBottom: 'none',
      padding: '8px 14px',
    },
  });
  const statusDot = mk('span', {
    style: {
      display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%',
      background: connected ? '#6ad17e' : '#c98a3a', marginRight: '8px',
      boxShadow: connected ? '0 0 4px #6ad17e' : '0 0 4px #c98a3a',
    },
  });
  const titleText = inst ? (inst.session ? `${inst.session.username}@${inst.session.host}` : 'Local shell') : '';
  headerRow.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#dfe3e7', fontWeight: '700', display: 'flex', alignItems: 'center' } }, [
    statusDot,
    titleText,
    !connected ? mk('span', { style: { fontSize: '11px', color: '#c98a3a', marginLeft: '10px', fontWeight: '500' } }, ['connecting...']) : null,
  ].filter(Boolean)));
  // SFTP solo tiene sentido para sesiones SSH, no para el shell local.
  if (isSsh) {
    headerRow.appendChild(mk('button', {
      style: {
        background: sftpOpen ? '#1a1d22' : 'transparent', border: `1px solid ${sftpOpen ? '#dfe3e7' : '#22252a'}`,
        color: '#dfe3e7', borderRadius: '3px', padding: '5px 12px', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
      },
      onclick: () => toggleSftpPanel(terminalId),
    }, [sftpOpen ? 'Hide SFTP' : 'SFTP browser']));
  }
  wrap.appendChild(headerRow);

  // Cuerpo: terminal a la izquierda, panel SFTP a la derecha si está abierto
  // — igual que el navegador SSH de MobaXterm al lado del terminal.
  const bodyRow = mk('div', { style: { flex: '1', display: 'flex', minHeight: '420px' } });

  const container = mk('div', {
    id: `xterm-container-${terminalId}`,
    style: {
      flex: '1', background: '#0a0b0d', border: '1px solid #22252a', borderTop: `1px solid ${connected ? '#1a3023' : '#22252a'}`,
      borderRadius: sftpOpen ? '0 0 0 3px' : '0 0 3px 3px', padding: '10px', minHeight: '420px',
    },
  });
  bodyRow.appendChild(container);

  if (sftpOpen && inst.session) {
    bodyRow.appendChild(renderSftpPanel(inst.session.id));
  }
  wrap.appendChild(bodyRow);

  // renderApp() reconstruye TODO el DOM en cada render, así que el contenedor
  // de arriba es siempre un nodo nuevo. Si ya existe una instancia de
  // Terminal para este terminalId (porque venimos de otra vista y volvemos),
  // la reabrimos sobre el contenedor nuevo en vez de perderla — xterm.js
  // soporta re-open() conservando el buffer y la conexión sigue viva en main.
  if (inst && inst.term) {
    requestAnimationFrame(() => {
      const freshContainer = document.getElementById(`xterm-container-${terminalId}`);
      if (freshContainer && !freshContainer.hasChildNodes()) {
        inst.term.open(freshContainer);
        if (inst.fitAddon) inst.fitAddon.fit();
      }
    });
  }

  return mk('div', {}, [wrap, state.ctEditorFile ? renderRemoteFileEditorModal() : null].filter(Boolean));
}

function renderSftpPanel(sessionId) {
  const panel = mk('div', {
    style: {
      width: '300px', flexShrink: '0', background: '#0d0e10', border: '1px solid #22252a', borderLeft: 'none',
      borderTop: `1px solid #22252a`, borderRadius: '0 0 3px 0', padding: '10px', display: 'flex', flexDirection: 'column',
    },
  });

  const pathRow = mk('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' } });
  pathRow.appendChild(mk('span', {
    style: { fontSize: '11px', color: '#dfe3e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1' },
  }, [state.ctSftpPath]));
  panel.appendChild(pathRow);

  const actionsRow = mk('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px' } });
  actionsRow.appendChild(mk('button', {
    style: { flex: '1', background: 'transparent', border: '1px solid #22252a', color: '#dfe3e7', borderRadius: '3px', padding: '4px 0', fontSize: '10.5px', cursor: 'pointer' },
    onclick: () => uploadToSftpDir(sessionId),
  }, ['↑ Upload']));
  actionsRow.appendChild(mk('button', {
    style: { flex: '1', background: 'transparent', border: '1px solid #22252a', color: '#dfe3e7', borderRadius: '3px', padding: '4px 0', fontSize: '10.5px', cursor: 'pointer' },
    onclick: () => createSftpFolder(sessionId),
  }, ['+ Folder']));
  panel.appendChild(actionsRow);

  if (state.ctSftpError) {
    panel.appendChild(mk('div', { style: { fontSize: '11px', color: '#c94f4f', marginBottom: '8px' } }, [state.ctSftpError]));
  }

  const listBox = mk('div', { style: { flex: '1', overflowY: 'auto' } });

  if (state.ctSftpPath !== '.' && state.ctSftpPath !== '') {
    listBox.appendChild(mk('div', {
      style: { fontSize: '11.5px', color: '#5e6670', padding: '4px 6px', cursor: 'pointer' },
      onclick: () => navigateSftp(sessionId, { name: '..', isDirectory: true }),
    }, ['.. (parent)']));
  }

  if (state.ctSftpLoading) {
    listBox.appendChild(mk('div', { style: { fontSize: '11px', color: '#5e6670', padding: '6px' } }, ['Loading…']));
  } else {
    state.ctSftpEntries.forEach((entry) => {
      const row = mk('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', borderRadius: '2px', cursor: 'pointer' },
      });
      row.appendChild(mk('span', {
        style: { fontSize: '11.5px', color: entry.isDirectory ? '#7eb3e0' : '#dfe3e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1', cursor: 'pointer' },
        onclick: () => navigateSftp(sessionId, entry),
      }, [(entry.isDirectory ? '▸ ' : '') + entry.name]));
      const rowActions = mk('div', { style: { display: 'flex', gap: '6px', flexShrink: '0' } });
      if (!entry.isDirectory) {
        rowActions.appendChild(mk('span', {
          style: { fontSize: '10px', color: '#5e6670', cursor: 'pointer' },
          onclick: (e) => { e.stopPropagation(); downloadSftpEntry(sessionId, entry); },
        }, ['↓']));
      }
      rowActions.appendChild(mk('span', {
        style: { fontSize: '10px', color: '#5e6670', cursor: 'pointer' },
        onclick: (e) => { e.stopPropagation(); deleteSftpEntry(sessionId, entry); },
      }, ['×']));
      row.appendChild(rowActions);
      listBox.appendChild(row);
    });
    if (state.ctSftpEntries.length === 0) {
      listBox.appendChild(mk('div', { style: { fontSize: '11px', color: '#5e6670', padding: '6px' } }, ['Empty directory.']));
    }
  }
  panel.appendChild(listBox);

  return panel;
}

function renderRemoteFileEditorModal() {
  const ef = state.ctEditorFile;
  const overlay = mk('div', {
    style: {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      background: '#000000aa', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '999',
    },
  });
  const box = mk('div', {
    style: { width: '70%', height: '70%', background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', display: 'flex', flexDirection: 'column', padding: '14px' },
  });

  const headerRow = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } });
  headerRow.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#dfe3e7', fontWeight: '700' } }, [
    ef.remotePath + (ef.dirty ? ' •' : ''),
  ]));
  const btnRow = mk('div', { style: { display: 'flex', gap: '8px' } });
  btnRow.appendChild(mk('button', {
    style: { background: '#dfe3e7', color: '#0a0b0d', border: 'none', borderRadius: '3px', padding: '6px 16px', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer' },
    onclick: () => saveRemoteFileEditor(),
  }, [state.ctEditorSaving ? 'Saving...' : 'Save']));
  btnRow.appendChild(mk('span', { style: { fontSize: '12px', color: '#5e6670', cursor: 'pointer', alignSelf: 'center' }, onclick: () => closeRemoteFileEditor() }, ['Close']));
  headerRow.appendChild(btnRow);
  box.appendChild(headerRow);

  const editorTextarea = mk('textarea', {
    style: {
      flex: '1', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', padding: '10px',
      color: '#dfe3e7', fontSize: '12.5px', fontFamily: "'IBM Plex Mono', monospace", resize: 'none',
    },
    'data-focus-key': 'remote-file-editor',
    oninput: (e) => { ef.content = e.target.value; ef.dirty = true; },
  });
  editorTextarea.value = ef.content;
  box.appendChild(editorTextarea);

  overlay.appendChild(box);
  return overlay;
}

// ═══════════════════════════════════════════════════════════════════════════
//  VS Corex — editor Monaco, explorador local/remoto, Git
// ═══════════════════════════════════════════════════════════════════════════

let monacoInitPromise = null;

// Carga Monaco vía su loader AMD, una sola vez por sesión de la app. Devuelve
// una promesa que resuelve cuando window.monaco está listo para usarse.
function ensureMonacoLoaded() {
  if (monacoInitPromise) return monacoInitPromise;
  monacoInitPromise = new Promise((resolve, reject) => {
    if (typeof require === 'undefined' || !require.config) {
      reject(new Error('Monaco loader (AMD require) not found'));
      return;
    }
    require.config({ paths: { vs: 'vendor/monaco/vs' } });
    require(['vs/editor/editor.main'], () => {
      state.vsMonacoLoaded = true;
      resolve();
    }, (err) => reject(err));
  });
  return monacoInitPromise;
}

async function initVsCorex() {
  await ensureMonacoLoaded();
  renderApp();
  if (state.vsGitAvailable === null) {
    const res = await window.corexAPI.vscorexCheckGitAvailable();
    state.vsGitAvailable = res.available;
    renderApp();
  }
}

// ── Abrir workspace ──────────────────────────────────────────────────────
async function openLocalWorkspace() {
  const res = await window.corexAPI.vscorexPickFolder();
  if (!res.ok) return;
  state.vsWorkspaceKind = 'local';
  state.vsWorkspaceRoot = res.path;
  state.vsWorkspaceSessionId = null;
  state.vsExplorerTree = {};
  await loadExplorerDir(res.path);
  await refreshGitStatus();
  renderApp();
}

// Abre como workspace la raíz SFTP de una sesión de CorexTerm ya guardada —
// reusa exactamente las mismas sesiones, no hace falta configurarlas dos veces.
async function openRemoteWorkspace(session) {
  state.vsWorkspaceKind = 'remote';
  state.vsWorkspaceRoot = '.';
  state.vsWorkspaceSessionId = session.id;
  state.vsExplorerTree = {};
  const connectRes = await window.corexAPI.corextermSftpConnect(session.id);
  if (!connectRes.ok) {
    toast(`Could not connect: ${connectRes.error}`, 'err');
    return;
  }
  await loadExplorerDir('.');
  renderApp();
}

function closeWorkspace() {
  state.vsWorkspaceKind = null;
  state.vsWorkspaceRoot = null;
  state.vsWorkspaceSessionId = null;
  state.vsExplorerTree = {};
  state.vsGitStatus = null;
  renderApp();
}

// ── Árbol de explorador (local o remoto, misma forma de datos) ──────────
async function loadExplorerDir(dirPath) {
  let res;
  if (state.vsWorkspaceKind === 'remote') {
    res = await window.corexAPI.corextermSftpList(state.vsWorkspaceSessionId, dirPath);
    if (res.ok) res.entries = res.entries.filter((e) => e.name !== '.' && e.name !== '..');
  } else {
    res = await window.corexAPI.vscorexListLocalDir(dirPath);
  }
  if (!res.ok) {
    toast(`Could not read folder: ${res.error}`, 'err');
    return;
  }
  state.vsExplorerTree[dirPath] = { entries: res.entries, expanded: true };
  renderApp();
}

function toggleExplorerDir(entryPath) {
  const node = state.vsExplorerTree[entryPath];
  if (node) {
    node.expanded = !node.expanded;
    renderApp();
  } else {
    loadExplorerDir(entryPath);
  }
}


// ── Pestañas de editor — abrir/cerrar/guardar archivos ──────────────────
function fileTabId(entryPath) {
  return `${state.vsWorkspaceKind}:${state.vsWorkspaceSessionId || ''}:${entryPath}`;
}

async function openFileInEditor(entry, parentPath) {
  if (entry.isDirectory) return;
  const fullPath = entry.path || sftpJoin(parentPath, entry.name);
  const id = fileTabId(fullPath);

  const existing = state.vsOpenFiles.find((f) => f.id === id);
  if (existing) {
    state.vsActiveFileId = id;
    renderApp();
    return;
  }

  let res;
  if (state.vsWorkspaceKind === 'remote') {
    res = await window.corexAPI.corextermSftpReadFile(state.vsWorkspaceSessionId, fullPath);
  } else {
    res = await window.corexAPI.vscorexReadLocalFile(fullPath);
  }
  if (!res.ok) {
    toast(`Could not open file: ${res.error}`, 'err');
    return;
  }

  state.vsOpenFiles.push({
    id, path: fullPath, name: entry.name, kind: state.vsWorkspaceKind,
    sessionId: state.vsWorkspaceSessionId, content: res.content, dirty: false, model: null,
  });
  state.vsActiveFileId = id;
  renderApp();
}

function switchToFileTab(id) {
  state.vsActiveFileId = id;
  renderApp();
}

function closeFileTab(id) {
  const file = state.vsOpenFiles.find((f) => f.id === id);
  if (file && file.dirty) {
    const confirmed = window.confirm ? window.confirm(`Discard unsaved changes to ${file.name}?`) : true;
    if (!confirmed) return;
  }
  if (file && file.model) file.model.dispose();
  state.vsOpenFiles = state.vsOpenFiles.filter((f) => f.id !== id);
  if (state.vsActiveFileId === id) {
    state.vsActiveFileId = state.vsOpenFiles.length > 0 ? state.vsOpenFiles[state.vsOpenFiles.length - 1].id : null;
  }
  renderApp();
}

async function saveActiveFile() {
  const file = state.vsOpenFiles.find((f) => f.id === state.vsActiveFileId);
  if (!file) return;
  const content = file.model ? file.model.getValue() : file.content;
  let res;
  if (file.kind === 'remote') {
    res = await window.corexAPI.corextermSftpWriteFile(file.sessionId, file.path, content);
  } else {
    res = await window.corexAPI.vscorexWriteLocalFile(file.path, content);
  }
  if (!res.ok) {
    toast(`Save failed: ${res.error}`, 'err');
    return;
  }
  file.content = content;
  file.dirty = false;
  toast('Saved', 'ok');
  if (file.kind === 'local') refreshGitStatus();
  renderApp();
}

// Detecta el lenguaje de Monaco a partir de la extensión — cobertura de los
// casos que de verdad usaríamos (Ansible/YAML, Python, JS, shell, etc.),
// no un mapeo exhaustivo de los 100+ lenguajes que soporta Monaco.
function languageForFile(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    yml: 'yaml', yaml: 'yaml', py: 'python', js: 'javascript', mjs: 'javascript',
    ts: 'typescript', json: 'json', sh: 'shell', bash: 'shell', md: 'markdown',
    html: 'html', css: 'css', sql: 'sql', xml: 'xml', ini: 'ini', toml: 'ini',
    j2: 'plaintext', cfg: 'ini', conf: 'plaintext', txt: 'plaintext', log: 'plaintext',
  };
  return map[ext] || 'plaintext';
}


// ── Git ──────────────────────────────────────────────────────────────────
async function refreshGitStatus() {
  if (state.vsWorkspaceKind !== 'local' || !state.vsWorkspaceRoot) {
    state.vsGitStatus = null;
    renderApp();
    return;
  }
  const res = await window.corexAPI.vscorexGitStatus(state.vsWorkspaceRoot);
  if (!res.ok) {
    if (res.error === 'git-not-found') state.vsGitAvailable = false;
    state.vsGitStatus = null;
    renderApp();
    return;
  }
  state.vsGitStatus = res.isRepo ? res : null;
  renderApp();
}

function toggleGitPanel() {
  state.vsGitPanelOpen = !state.vsGitPanelOpen;
  if (state.vsGitPanelOpen) refreshGitStatus();
  renderApp();
}

async function stageFile(filePath) {
  await window.corexAPI.vscorexGitStage(state.vsWorkspaceRoot, [filePath]);
  await refreshGitStatus();
}

async function unstageFile(filePath) {
  await window.corexAPI.vscorexGitUnstage(state.vsWorkspaceRoot, [filePath]);
  await refreshGitStatus();
}

async function stageAll() {
  const s = state.vsGitStatus;
  if (!s) return;
  const all = [...s.modified, ...s.not_added, ...s.deleted];
  if (all.length === 0) return;
  await window.corexAPI.vscorexGitStage(state.vsWorkspaceRoot, all);
  await refreshGitStatus();
}

async function viewFileDiff(filePath, staged) {
  const res = await window.corexAPI.vscorexGitDiff(state.vsWorkspaceRoot, filePath, staged);
  if (!res.ok) {
    toast(`Could not load diff: ${res.error}`, 'err');
    return;
  }
  state.vsGitDiffFile = filePath;
  state.vsGitDiffContent = res.diff || '(no changes)';
  renderApp();
}

async function commitChanges() {
  if (!state.vsGitCommitMessage.trim()) {
    toast('Write a commit message first', 'err');
    return;
  }
  const res = await window.corexAPI.vscorexGitCommit(state.vsWorkspaceRoot, state.vsGitCommitMessage.trim());
  if (!res.ok) {
    toast(`Commit failed: ${res.error}`, 'err');
    return;
  }
  toast('Committed', 'ok');
  state.vsGitCommitMessage = '';
  await refreshGitStatus();
}

async function pushChanges() {
  const res = await window.corexAPI.vscorexGitPush(state.vsWorkspaceRoot);
  if (!res.ok) toast(`Push failed: ${res.error}`, 'err');
  else { toast('Pushed', 'ok'); await refreshGitStatus(); }
}

async function pullChanges() {
  const res = await window.corexAPI.vscorexGitPull(state.vsWorkspaceRoot);
  if (!res.ok) toast(`Pull failed: ${res.error}`, 'err');
  else { toast('Pulled', 'ok'); await refreshGitStatus(); }
}


// ── Render ───────────────────────────────────────────────────────────────
function renderVsCorexView() {
  const wrap = mk('div', { style: { height: '100%', display: 'flex', flexDirection: 'column' } });

  if (!state.vsMonacoLoaded) {
    wrap.appendChild(mk('div', { style: { fontSize: '13px', color: '#5e6670', padding: '20px' } }, ['Loading editor…']));
    return wrap;
  }

  if (!state.vsWorkspaceKind) {
    wrap.appendChild(renderVsWelcome());
    return wrap;
  }

  wrap.appendChild(renderVsWorkbench());
  return wrap;
}

function renderVsWelcome() {
  const wrap = mk('div', { style: { maxWidth: '640px', padding: '20px 0' } });
  wrap.appendChild(mk('h1', { style: { fontSize: '22px', fontWeight: '700', marginBottom: '4px', color: '#dfe3e7' } }, ['VS Corex']));
  wrap.appendChild(mk('p', { style: { fontSize: '13px', color: '#5e6670', marginBottom: '24px' } }, ['Open a local folder or browse a remote server to start editing.']));

  const optionsRow = mk('div', { style: { display: 'flex', gap: '12px', marginBottom: '20px' } });
  optionsRow.appendChild(mk('button', {
    style: { flex: '1', background: '#dfe3e7', color: '#0a0b0d', border: 'none', borderRadius: '3px', padding: '14px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
    onclick: () => openLocalWorkspace(),
  }, ['▸ Open local folder']));
  wrap.appendChild(optionsRow);

  if (!state.vsGitAvailable) {
    wrap.appendChild(mk('div', {
      style: { background: '#1a1508', border: '1px solid #c98a3a', borderRadius: '3px', padding: '12px 14px', marginBottom: '20px', fontSize: '11.5px', color: '#dfe3e7' },
    }, [
      'Git was not found on this system. File editing still works, but version control features will stay disabled. ',
      mk('span', {
        style: { color: '#c98a3a', cursor: 'pointer', fontWeight: '700' },
        onclick: () => window.open ? window.open('https://git-scm.com/downloads') : null,
      }, ['Install Git →']),
    ]));
  }

  wrap.appendChild(mk('div', { style: { fontSize: '11px', fontWeight: '700', color: '#5e6670', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' } }, ['Or browse a remote session']));

  if (state.ctSessions.length === 0) {
    wrap.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#5e6670' } }, [
      'No CorexTerm sessions saved yet. Save one in CorexTerm first to browse it here.',
    ]));
  } else {
    state.ctSessions.forEach((s) => {
      wrap.appendChild(mk('div', {
        style: { background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '10px 14px', marginBottom: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
        onclick: () => openRemoteWorkspace(s),
      }, [
        mk('span', { style: { fontSize: '12.5px', color: '#dfe3e7', fontWeight: '600' } }, [s.name]),
        mk('span', { style: { fontSize: '11px', color: '#5e6670' } }, [`${s.username}@${s.host}`]),
      ]));
    });
  }

  return wrap;
}


function renderVsWorkbench() {
  const wrap = mk('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', minHeight: '0' } });

  // Barra superior: ruta del workspace + acciones globales
  const topBar = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid #22252a' } });
  topBar.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#5e6670', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [
    state.vsWorkspaceKind === 'remote' ? `Remote: ${state.vsWorkspaceRoot}` : state.vsWorkspaceRoot,
  ]));
  const topActions = mk('div', { style: { display: 'flex', gap: '8px', flexShrink: '0' } });
  if (state.vsWorkspaceKind === 'local' && state.vsGitAvailable) {
    topActions.appendChild(mk('span', {
      style: {
        fontSize: '11px', fontWeight: '700', padding: '4px 10px', cursor: 'pointer', borderRadius: '3px',
        color: state.vsGitPanelOpen ? '#dfe3e7' : '#5e6670',
        background: state.vsGitPanelOpen ? '#1a1d22' : 'transparent',
        border: `1px solid ${state.vsGitPanelOpen ? '#dfe3e7' : '#22252a'}`,
      },
      onclick: () => toggleGitPanel(),
    }, [state.vsGitStatus ? `Git (${state.vsGitStatus.current})` : 'Git']));
  }
  topActions.appendChild(mk('span', {
    style: { fontSize: '11px', color: '#5e6670', cursor: 'pointer', padding: '4px 10px' },
    onclick: () => closeWorkspace(),
  }, ['Close workspace']));
  topBar.appendChild(topActions);
  wrap.appendChild(topBar);

  const body = mk('div', { style: { flex: '1', display: 'flex', minHeight: '0' } });

  // Columna 1: explorador
  body.appendChild(renderVsExplorer());

  // Columna 2: pestañas + editor Monaco
  body.appendChild(renderVsEditorArea());

  // Columna 3: panel de Git (solo si está abierto)
  if (state.vsGitPanelOpen && state.vsWorkspaceKind === 'local') {
    body.appendChild(renderVsGitPanel());
  }

  wrap.appendChild(body);
  return wrap;
}

function renderVsExplorer() {
  const panel = mk('div', { style: { width: '220px', flexShrink: '0', borderRight: '1px solid #22252a', overflowY: 'auto', padding: '10px' } });
  const rootEntries = state.vsExplorerTree[state.vsWorkspaceRoot];
  if (!rootEntries) {
    panel.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#5e6670' } }, ['Loading…']));
    return panel;
  }
  renderExplorerEntries(panel, rootEntries.entries, state.vsWorkspaceRoot, 0);
  return panel;
}

function renderExplorerEntries(container, entries, parentPath, depth) {
  entries.forEach((entry) => {
    const entryPath = entry.path || sftpJoin(parentPath, entry.name);
    const row = mk('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 4px', paddingLeft: `${4 + depth * 14}px`,
        cursor: 'pointer', borderRadius: '2px', fontSize: '12px',
        color: entry.isDirectory ? '#7eb3e0' : (state.vsActiveFileId === fileTabId(entryPath) ? '#dfe3e7' : '#b8c0c8'),
        background: state.vsActiveFileId === fileTabId(entryPath) ? '#1a1d22' : 'transparent',
      },
      onclick: () => (entry.isDirectory ? toggleExplorerDir(entryPath) : openFileInEditor({ ...entry, path: entryPath }, parentPath)),
    });
    row.appendChild(mk('span', { style: { flexShrink: '0', fontSize: '10px', color: '#5e6670', width: '10px' } }, [
      entry.isDirectory ? (state.vsExplorerTree[entryPath] && state.vsExplorerTree[entryPath].expanded ? '▾' : '▸') : '',
    ]));
    row.appendChild(mk('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [entry.name]));
    container.appendChild(row);

    if (entry.isDirectory && state.vsExplorerTree[entryPath] && state.vsExplorerTree[entryPath].expanded) {
      renderExplorerEntries(container, state.vsExplorerTree[entryPath].entries, entryPath, depth + 1);
    }
  });
}


// ── Área de editor: pestañas + instancia única de Monaco ────────────────
// A diferencia de xterm.js (una instancia de Terminal por pestaña), aquí
// usamos UNA sola instancia de editor Monaco que reutilizamos para todas
// las pestañas, cambiándole el "model" (el documento) al cambiar de
// pestaña — es el patrón estándar de Monaco para editores con tabs, mucho
// más barato que crear un editor.create() por archivo abierto.
let monacoEditorInstance = null;

function renderVsEditorArea() {
  const wrap = mk('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', minWidth: '0' } });

  if (state.vsOpenFiles.length === 0) {
    wrap.appendChild(mk('div', { style: { flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5e6670', fontSize: '12.5px' } }, [
      'Select a file from the explorer to start editing.',
    ]));
    return wrap;
  }

  // Barra de pestañas de archivos abiertos
  const tabBar = mk('div', { style: { display: 'flex', borderBottom: '1px solid #22252a', overflowX: 'auto' } });
  state.vsOpenFiles.forEach((file) => {
    const active = state.vsActiveFileId === file.id;
    const tab = mk('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 12px', cursor: 'pointer', maxWidth: '180px',
        background: active ? '#0d0e10' : 'transparent',
        borderRight: '1px solid #22252a',
        color: active ? '#dfe3e7' : '#5e6670',
      },
      onclick: () => switchToFileTab(file.id),
    });
    tab.appendChild(mk('span', { style: { fontSize: '11.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [
      file.name + (file.dirty ? ' •' : ''),
    ]));
    tab.appendChild(mk('span', {
      style: { fontSize: '12px', cursor: 'pointer', flexShrink: '0' },
      onclick: (e) => { e.stopPropagation(); closeFileTab(file.id); },
    }, ['×']));
    tabBar.appendChild(tab);
  });
  wrap.appendChild(tabBar);

  // Barra de acción del archivo activo
  const activeFile = state.vsOpenFiles.find((f) => f.id === state.vsActiveFileId);
  const actionBar = mk('div', { style: { display: 'flex', justifyContent: 'flex-end', padding: '6px 10px', borderBottom: '1px solid #22252a' } });
  actionBar.appendChild(mk('button', {
    style: { background: '#dfe3e7', color: '#0a0b0d', border: 'none', borderRadius: '3px', padding: '5px 14px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
    onclick: () => saveActiveFile(),
  }, ['Save']));
  wrap.appendChild(actionBar);

  // Contenedor del editor Monaco — único, persistente entre renders.
  const editorContainer = mk('div', { id: 'monaco-container', style: { flex: '1', minHeight: '0' } });
  wrap.appendChild(editorContainer);

  requestAnimationFrame(() => mountMonacoForActiveFile());

  return wrap;
}

function mountMonacoForActiveFile() {
  const container = document.getElementById('monaco-container');
  if (!container || typeof monaco === 'undefined') return;
  const file = state.vsOpenFiles.find((f) => f.id === state.vsActiveFileId);
  if (!file) return;

  // Si el editor ya existe pero su nodo DOM fue destruido por un renderApp()
  // anterior (siempre pasa, reconstruimos todo el DOM en cada render), lo
  // recreamos sobre el contenedor nuevo — Monaco no tiene un "re-open()"
  // como xterm.js, así que en vez de mover el editor, lo recreamos y le
  // reasignamos el modelo del archivo activo, que sí persiste en memoria.
  if (!monacoEditorInstance || !document.body.contains(monacoEditorInstance.getDomNode())) {
    monacoEditorInstance = monaco.editor.create(container, {
      theme: 'vs-dark',
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 13,
      automaticLayout: true,
      minimap: { enabled: true },
    });
    monacoEditorInstance.onDidChangeModelContent(() => {
      const activeFile = state.vsOpenFiles.find((f) => f.id === state.vsActiveFileId);
      if (activeFile && !activeFile.dirty) {
        activeFile.dirty = true;
        renderApp();
      }
    });
  }

  if (!file.model) {
    file.model = monaco.editor.createModel(file.content, languageForFile(file.name));
  }
  if (monacoEditorInstance.getModel() !== file.model) {
    monacoEditorInstance.setModel(file.model);
  }
}


// ── Panel de Git ─────────────────────────────────────────────────────────
function renderVsGitPanel() {
  const panel = mk('div', { style: { width: '300px', flexShrink: '0', borderLeft: '1px solid #22252a', overflowY: 'auto', padding: '12px' } });
  const s = state.vsGitStatus;

  if (!s) {
    panel.appendChild(mk('div', { style: { fontSize: '12px', color: '#5e6670' } }, ['This folder is not a Git repository.']));
    return panel;
  }

  // Diff inline si hay uno seleccionado
  if (state.vsGitDiffFile) {
    panel.appendChild(mk('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' } }, [
      mk('span', { style: { fontSize: '11.5px', color: '#dfe3e7', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis' } }, [state.vsGitDiffFile]),
      mk('span', { style: { fontSize: '11px', color: '#5e6670', cursor: 'pointer' }, onclick: () => { state.vsGitDiffFile = null; renderApp(); } }, ['close']),
    ]));
    panel.appendChild(mk('pre', {
      style: { fontSize: '10.5px', lineHeight: '1.5', color: '#b8c0c8', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', padding: '10px', overflowX: 'auto', whiteSpace: 'pre-wrap' },
    }, [state.vsGitDiffContent]));
    return panel;
  }

  panel.appendChild(mk('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px' } }, [
    mk('button', { style: { flex: '1', background: 'transparent', border: '1px solid #22252a', color: '#dfe3e7', borderRadius: '3px', padding: '5px 0', fontSize: '11px', cursor: 'pointer' }, onclick: () => pullChanges() }, ['↓ Pull']),
    mk('button', { style: { flex: '1', background: 'transparent', border: '1px solid #22252a', color: '#dfe3e7', borderRadius: '3px', padding: '5px 0', fontSize: '11px', cursor: 'pointer' }, onclick: () => pushChanges() }, ['↑ Push']),
  ]));

  if (s.ahead || s.behind) {
    panel.appendChild(mk('div', { style: { fontSize: '10.5px', color: '#c98a3a', marginBottom: '10px' } }, [
      `${s.ahead ? `${s.ahead} ahead` : ''}${s.ahead && s.behind ? ', ' : ''}${s.behind ? `${s.behind} behind` : ''}`,
    ]));
  }

  // Staged
  if (s.staged && s.staged.length > 0) {
    panel.appendChild(mk('div', { style: { fontSize: '10px', fontWeight: '700', color: '#5e6670', textTransform: 'uppercase', marginBottom: '6px' } }, [`Staged (${s.staged.length})`]));
    s.staged.forEach((f) => {
      panel.appendChild(mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' } }, [
        mk('span', { style: { fontSize: '11px', color: '#6ad17e', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1' }, onclick: () => viewFileDiff(f, true) }, [f]),
        mk('span', { style: { fontSize: '10px', color: '#5e6670', cursor: 'pointer' }, onclick: () => unstageFile(f) }, ['unstage']),
      ]));
    });
  }

  // Unstaged (modificados, nuevos, borrados)
  const unstagedFiles = [
    ...(s.modified || []).map((f) => ({ f, tag: 'M' })),
    ...(s.not_added || []).map((f) => ({ f, tag: 'U' })),
    ...(s.deleted || []).map((f) => ({ f, tag: 'D' })),
  ];
  if (unstagedFiles.length > 0) {
    const headerRow = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', marginBottom: '6px' } });
    headerRow.appendChild(mk('span', { style: { fontSize: '10px', fontWeight: '700', color: '#5e6670', textTransform: 'uppercase' } }, [`Changes (${unstagedFiles.length})`]));
    headerRow.appendChild(mk('span', { style: { fontSize: '10.5px', color: '#5e6670', cursor: 'pointer' }, onclick: () => stageAll() }, ['stage all']));
    panel.appendChild(headerRow);
    unstagedFiles.forEach(({ f, tag }) => {
      panel.appendChild(mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' } }, [
        mk('span', { style: { fontSize: '11px', color: '#dfe3e7', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1' }, onclick: () => viewFileDiff(f, false) }, [`${tag}  ${f}`]),
        mk('span', { style: { fontSize: '10px', color: '#5e6670', cursor: 'pointer' }, onclick: () => stageFile(f) }, ['stage']),
      ]));
    });
  }

  if (unstagedFiles.length === 0 && (!s.staged || s.staged.length === 0)) {
    panel.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#5e6670', marginTop: '10px' } }, ['No changes.']));
  }

  // Commit
  const commitTextarea = mk('textarea', {
    style: { width: '100%', minHeight: '50px', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', padding: '8px', color: '#dfe3e7', fontSize: '11.5px', fontFamily: 'inherit', resize: 'vertical', marginTop: '12px' },
    placeholder: 'Commit message',
    'data-focus-key': 'vs-git-commit-message',
    oninput: (e) => { state.vsGitCommitMessage = e.target.value; },
  });
  commitTextarea.value = state.vsGitCommitMessage;
  panel.appendChild(commitTextarea);
  panel.appendChild(mk('button', {
    style: { width: '100%', background: '#dfe3e7', color: '#0a0b0d', border: 'none', borderRadius: '3px', padding: '8px 0', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer', marginTop: '8px' },
    onclick: () => commitChanges(),
  }, ['Commit']));

  return panel;
}
