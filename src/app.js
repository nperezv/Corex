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
  // Polling de listas en vivo — Jira/AWX, cada 15s mientras esa vista está
  // activa (mismo patrón que hwPollHandle: arranca al entrar, para al
  // salir, decisión centralizada en renderApp() para no poder "olvidar"
  // pararlo al navegar a un detalle).
  jiraListPollHandle: null,
  awxListPollHandle: null,
  // Detección de pérdida de conexión real — navigator.onLine solo confirma
  // "hay algún adaptador de red activo", no conectividad real con Jira/AWX
  // (una VPN caída con WiFi conectado sigue dando onLine:true). En vez de
  // eso, contamos fallos de red CONSECUTIVOS del polling que ya existe: un
  // timeout puntual es ruido normal, pero 3 seguidos del mismo canal sí es
  // señal real de que algo está caído. Por canal, no global, porque Jira y
  // AWX pueden estar en redes distintas y fallar de forma independiente.
  consecutiveNetworkFailures: { jira: 0, awx: 0 },
  connectionLostBanner: null, // null | 'jira' | 'awx' | 'both'
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
  jiraDetailReturnView: 'inbox', // a qué VISTA volver al salir del todo (jira/awx-detail/inbox)
  // Pila de tickets visitados dentro de la navegación detalle→detalle
  // (parent/sub-task/linked issue). Sin esto, "volver" solo recordaba la
  // vista de origen (Jira/AWX/Dashboard), así que saltar Padre→Hijo→Padre
  // perdía el rastro y "volver" siempre caía en la lista general en vez
  // del ticket anterior real.
  jiraDetailHistory: [],
  jiraCommentDraft: '',
  jiraCommentSending: false,
  // El composer arranca colapsado (una sola línea fina, "Click to add
  // comment") y solo se expande a textarea grande + botones de acción al
  // hacer clic — igual que la interfaz nativa de Jira, en vez de ocupar
  // espacio expandido permanentemente aunque no haya nada escrito.
  jiraCommentExpanded: false,
  jiraCommentAttachment: null,   // { name, base64, size } — adjunto pendiente en el composer
  // Secciones colapsables de campos extra (p.ej. Business Justification) —
  // colapsadas por defecto porque suelen traer texto largo (listas de
  // servidores, justificaciones extensas) que no debería invadir la
  // pantalla de entrada al detalle.
  jiraDetailExpandedFields: {},
  jiraDetailStatusMenuOpen: false,
  jiraDetailTransitions: [],
  jiraDetailTransitionsLoading: false,
  jiraDetailThumbnails: {}, // { attachmentId: dataUrl } — cache en memoria, se vuelve a pedir al reabrir el detalle

  // Vault global — pantalla de bienvenida bloqueante antes de toda la app
  vaultUnlocked: false,
  vaultExists: false,
  vaultUnlockInput: '',
  vaultUnlockConfirm: '', // solo se usa la primera vez, para confirmar la nueva Master Password
  // ¿La instancia de Jira tiene campos SLA (Service Management)? Lo dice el
  // backend tras el discovery — si es false, la tarjeta SLA lo explica en
  // vez de mostrar un cero engañoso.
  slaAvailable: false,
  // ── Workspaces del Cockpit ──
  // Un workspace es una plantilla con nombre de la configuración del
  // Dashboard: qué widgets están visibles y en qué orden. Se persisten en
  // el vault (config.dashWorkspaces / config.activeDashWorkspaceId) y se
  // conmutan desde el propio Dashboard o desde la status bar global
  // ("Workspace: operations", como en el mockup).
  dashWorkspaces: null,       // [{ id, name, widgets: [widgetId...] }] — null hasta cargar config
  activeDashWorkspaceId: null,
  dashAddWidgetOpen: false,   // dropdown del "+ Add Widget"
  dashWorkspaceMenuOpen: false, // dropdown del selector de workspace
  sidebarCollapsed: {},       // { 'Operate': true } — secciones plegadas del sidebar
  myWorkFilter: 'all',        // chip activo de la tabla My Work: all|atRisk|inProgress|waiting|resolved
  ctSessionSearch: '',        // filtro del sidebar de sesiones de CorexTerm
  // Icinga (fase 1: lectura)
  icingaSummary: null,
  icingaProblems: { hosts: [], services: [] },
  icingaError: null,
  icingaLoading: false,
  monitorTab: 'services',     // pestaña activa de la vista Monitor
  ctSidebarFolderCollapsed: {}, // carpetas plegadas en ese sidebar
  // Identidad real del usuario (GET /myself de Jira) — nombre + avatar.
  // null hasta que carga; la UI cae a iniciales derivadas del email mientras.
  jiraMyself: null,
  // Pantalla de gestión del Vault
  vaultStats: null,
  vaultStatsError: null,
  vaultPwCurrent: '',
  vaultPwNew: '',
  vaultPwConfirm: '',
  vaultPwBusy: false,
  // Gestor de credenciales del Vault
  vaultCreds: [],             // metadata (sin secretos) de creds:list
  vaultCredForm: null,        // { id?, name, username, url, secret, notes } — formulario abierto
  vaultCredRevealed: {},      // { credId: 'secreto' } — revelados en esta vista (se limpia al salir)
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
  ctNewTabMenuOpen: false,
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

  // Ticket Automation Templates (System → Templates)
  automationTemplates: [], // [{ id, name, awxTemplateId, onSuccess, onFailure }]
  pendingAttachments: [], // [{ id, ticketKey, jobId, jobName, status, isParent, createdAt }]
  automationEditingId: null, // null = lista, 'new' = creando, id = editando existente
  automationForm: null,
  automationAwxFilter: '', // texto del buscador de templates AWX dentro del editor
  automationVarPickerOpenFor: null, // qué textarea tiene el selector de variables abierto ('success'|'failure'|'parentSuccess'|'parentFailure')
  showPendingAttachmentsModal: false,
  // Banners persistentes — distintos del toast normal (que se autoborra):
  // se quedan fijos en pantalla hasta que el usuario los cierre o actúe,
  // uno por cada adjunto que pasó a la cola de pendientes. Array porque
  // pueden acumularse si terminan varios jobs antes de que el usuario
  // atienda el primero.
  persistentBanners: [], // [{ id, ticketKey, jobName }]
  resolvingPendingAttachmentId: null,

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
  surface0: '#0a0e15', // fondo de app
  surface1: '#0d141d', // tarjetas
  surface2: '#111a24', // hover / elevado
  border: '#1b2530',   // único borde, siempre
  textPrimary: '#eef2f5',
  textSecondary: '#8a96a3', // único gris secundario
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#38bdf8',
};

// ── Tokens v2 (rediseño "Cockpit") ──────────────────────────────────────────
// Paleta del mockup aprobado. Desde v70 TODA la app está migrada a esta
// paleta: los tokens legacy C (arriba) apuntan a los mismos valores para que
// el código que aún los referencia quede automáticamente alineado, y los hex
// literales de las vistas antiguas se sustituyeron en bloque por sus
// equivalentes CX (misma jerarquía de superficies, tinte azulado nuevo).
const CX = {
  bgApp: '#0a0e15',
  bgSidebar: '#0c131b',
  bgTopbar: '#0a0f17',
  bgPanel: '#0d141d',
  bgPanelAlt: '#111a24',
  bgInput: '#060b12',
  borderSubtle: '#1b2530',
  textPrimary: '#eef2f5',
  textSecondary: '#8a96a3',
  textMuted: '#5c6773',
  green: '#22c55e',
  greenDim: '#173a24',
  greenBg: '#10251a',
  red: '#ef4444',
  redDim: '#7f3839',
  amber: '#f59e0b',
  amberDim: '#5a3a0d',
  purple: '#a78bfa',
  purpleDim: '#2c2440',
  blue: '#38bdf8',
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
        else if (k === 'html') { if (v != null) el.innerHTML = v; }
        // ^ guard v != null: pasar html: undefined (p.ej. un item de nav
        //   sin iconSvg) pintaba literalmente el texto "undefined" en
        //   pantalla, porque innerHTML = undefined lo convierte a string.
        // selected/checked/disabled son atributos BOOLEANOS por presencia en
        // HTML: setAttribute('selected', 'false') sigue activando la
        // selección porque el navegador solo mira si el atributo existe, no
        // su texto. Esto causaba que SIEMPRE quedara seleccionada la última
        // <option> de una lista generada con .forEach(), sin importar cuál
        // elegía el usuario. Usar la propiedad del DOM (el.selected = v) es
        // lo correcto: true la activa, false la desactiva de verdad.
        else if (k === 'selected' || k === 'checked' || k === 'disabled') el[k] = !!v;
        else if (v != null) el.setAttribute(k, v);
        // ^ v != null: atributos con valor undefined (p.ej. title condicional
        //   `title: cond ? 'x' : undefined`) acababan como title="undefined"
        //   en el DOM — inofensivo a la vista pero basura en tooltips.
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
      width: '15px', height: '15px', borderRadius: '6px', flexShrink: '0',
      border: `1px solid ${checked ? C.success : C.border}`,
      background: checked ? C.success : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
  }, [
    checked ? mk('span', {
      style: { color: '#0a0e15', fontSize: '10px', fontWeight: '700', lineHeight: '1' },
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
// Identidad para pintar en sidebar/topbar: usa la identidad real de Jira
// (displayName + avatar) si ya cargó; mientras tanto (o si Jira no está
// configurado) cae a un nombre derivado del email y a iniciales. Nunca
// inventa un nombre que el usuario no haya configurado en ningún sitio.
function currentIdentity() {
  // Prioridad: perfil propio (config.profile, editable en la vista Profile)
  // → identidad de Jira → derivado del email. Así tu nombre y tu foto no
  // dependen necesariamente de lo que diga Jira.
  const prof = state.config.profile || {};
  const me = state.jiraMyself;
  const jiraEmail = (state.config.jira && state.config.jira.email) || '';
  const displayName = (prof.displayName && prof.displayName.trim())
    || (me && me.displayName)
    || (jiraEmail ? jiraEmail.split('@')[0] : 'Operator');
  const subtitle = (prof.role && prof.role.trim())
    || (me && me.emailAddress) || jiraEmail || 'Not configured';
  const initials = displayName.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'OP';
  const avatarDataUrl = prof.photoDataUrl || (me && me.avatarDataUrl) || null;
  return { displayName, subtitle, initials, avatarDataUrl };
}

// Avatar circular reutilizable — imagen real de Jira si existe, iniciales si no.
function renderAvatar(sizePx, onclick, title) {
  const id = currentIdentity();
  const base = {
    width: `${sizePx}px`, height: `${sizePx}px`, borderRadius: '50%', flexShrink: '0',
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    background: 'linear-gradient(135deg,#2a3b4d,#1a2530)', color: CX.textPrimary,
    fontSize: `${Math.max(10, Math.round(sizePx * 0.37))}px`, fontWeight: '600',
    fontFamily: "'IBM Plex Mono', monospace", cursor: onclick ? 'pointer' : 'default',
  };
  const props = { style: base };
  if (onclick) props.onclick = onclick;
  if (title) props.title = title;
  if (id.avatarDataUrl) {
    props.html = `<img src="${id.avatarDataUrl}" style="width:100%;height:100%;object-fit:cover;" alt="">`;
    return mk('div', props);
  }
  return mk('div', props, [id.initials]);
}

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
  const iconTemplates = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 5 H20 V19 H4 Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M4 9 H20 M9 9 V19" stroke="currentColor" stroke-width="1.5"/>' +
    '</svg>';
  const iconSettings = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" stroke="currentColor" stroke-width="1.4"/>' +
    '</svg>';
  const iconVault = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12 2 3 7v6c0 5 3.8 8.4 9 9 5.2-.6 9-4 9-9V7l-9-5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
    '</svg>';
  const iconOperate = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2 2 7l10 5 10-5-10-5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const iconAutomate = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const iconConnect = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="6" r="2.4" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="6" r="2.4" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="18" r="2.4" stroke="currentColor" stroke-width="1.5"/><path d="M8 7.4l3 8.6M16 7.4l-3 8.6" stroke="currentColor" stroke-width="1.4"/></svg>';
  const iconBuild = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const iconConfigure = iconBuild;

  // Agrupación visual calcada del mockup (Operate / Automate / Connect /
  // Build / Configure). A diferencia del mockup, cada item de acá apunta a
  // una vista real que YA existe en state.view — no inventamos rutas que no
  // funcionan. La única excepción marcada es "Vault" (ver más abajo).
  // Organización 1:1 con el mockup. Cada sección lleva un color de acento
  // propio (chip del icono de cabecera) y los ids apuntan a vistas reales:
  //  · Jobs        → vista nueva 'awx-jobs' (historial completo de jobs)
  //  · Sessions    → vista nueva 'ct-sessions' (gestor de sesiones guardadas)
  //  · Workspaces  → vista nueva 'workspaces' (plantillas del Cockpit)
  const sections = [
    {
      label: 'Operate', iconSvg: iconOperate, accent: CX.green,
      items: [
        { id: 'inbox', label: 'Cockpit', iconSvg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/></svg>' },
        { id: 'jira', label: 'My Work', iconSvg: iconJira, badge: state.inboxIssues.length || null },
        { id: 'monitor', label: 'Monitor', iconSvg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12h4l2-7 4 14 2-7h4"/></svg>' },
      ],
    },
    {
      label: 'Automate', iconSvg: iconAutomate, accent: CX.blue,
      items: [
        { id: 'awx', label: 'AWX Templates', iconSvg: iconAwx },
        { id: 'awx-jobs', label: 'Jobs', iconSvg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 10h8M8 14h5"/></svg>' },
        { id: 'templates', label: 'Ticket Automations', iconSvg: iconTemplates, badge: state.pendingAttachments.length || null },
      ],
    },
    {
      label: 'Connect', iconSvg: iconConnect, accent: CX.purple,
      items: [
        { id: 'corexterm', label: 'CorexTerm', iconSvg: iconCorexterm },
        { id: 'ct-sessions', label: 'Sessions', iconSvg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' },
      ],
    },
    {
      label: 'Build', iconSvg: iconBuild, accent: CX.amber,
      items: [
        { id: 'vscorex', label: 'VS Corex', iconSvg: iconVsCorex },
        { id: 'workspaces', label: 'Workspaces', iconSvg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="10" width="8" height="11" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/></svg>' },
      ],
    },
    {
      label: 'Configure', iconSvg: iconConfigure, accent: CX.purple,
      items: [
        { id: 'settings', label: t('nav_settings'), iconSvg: iconSettings },
        { id: 'vault', label: 'Vault', iconSvg: iconVault },
      ],
    },
  ];

  const brandLogoSvg = '<svg viewBox="0 0 15559.15 9394.27" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:12px;display:block;">' +
    '<polygon fill="currentColor" points="4445.48,7673.09 2222.74,4535.94 -0,7673.09" />' +
    '<polygon fill="currentColor" points="11113.67,1398.78 13336.4,4535.93 15559.15,1398.78" />' +
    '<polygon fill="currentColor" points="9039.43,9394.27 2383.41,0 7115.63,0 13771.67,9394.27" />' +
    '</svg>';

  const nav = mk('div', {
    style: {
      width: '220px', height: '100%', background: CX.bgSidebar,
      borderRight: `1px solid ${CX.borderSubtle}`, display: 'flex', flexDirection: 'column',
      padding: '20px 14px', flexShrink: '0', overflowY: 'auto',
    },
  });

  nav.appendChild(mk('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: '8px', padding: '0 6px 22px',
      fontFamily: "'IBM Plex Mono', monospace", fontWeight: '600', fontSize: '15px',
      letterSpacing: '0.5px', color: CX.textPrimary,
    },
    html: `<span style="color:${CX.green};display:flex;align-items:center;">${brandLogoSvg}</span>`,
  }, ['COREX']));

  if (!state.sidebarCollapsed) state.sidebarCollapsed = {};
  sections.forEach((section) => {
    const collapsed = !!state.sidebarCollapsed[section.label];
    const secWrap = mk('div', { style: { marginBottom: '16px' } });
    const hdr = mk('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '9px', padding: '6px',
        fontSize: '12px', fontWeight: '600', color: CX.textPrimary, cursor: 'pointer',
      },
      // Chip de color por sección, como los iconos de cabecera del mockup:
      // cuadradito redondeado con el acento de la sección de fondo tenue.
      html: `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:${section.accent}1f;color:${section.accent};flex-shrink:0;">${section.iconSvg}</span>`,
      onclick: () => { state.sidebarCollapsed[section.label] = !collapsed; renderApp(); },
      title: collapsed ? 'Expand' : 'Collapse',
    }, [section.label]);
    hdr.appendChild(mk('span', {
      style: { marginLeft: 'auto', fontSize: '8px', color: CX.textMuted, transform: collapsed ? 'rotate(180deg)' : 'none' },
    }, ['⌃']));
    secWrap.appendChild(hdr);

    const itemsWrap = mk('div', { style: { marginTop: '2px', display: collapsed ? 'none' : 'block' } });
    section.items.forEach((it) => {
      const active = state.view === it.id;
      const row = mk('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '9px',
          padding: '7px 10px 7px 26px', margin: '1px 0', borderRadius: '6px',
          color: active ? CX.textPrimary : CX.textSecondary,
          fontSize: '12.5px', cursor: 'pointer', position: 'relative',
          fontWeight: active ? '500' : '400',
          background: active ? 'linear-gradient(90deg, rgba(34,197,94,.16), rgba(34,197,94,.04))' : 'transparent',
        },
        onclick: () => {
          state.view = it.id;
          renderApp(); // ya decide aquí mismo si el polling de hardware debe correr o pararse
          if (it.id === 'awx' && state.awxTemplates.length === 0) loadAwxTemplates();
          if (it.id === 'awx') loadAwxRecentJobs();
          if (it.id === 'vault') { loadVaultStats(); loadVaultCreds(); }
          if (it.id === 'awx-jobs') loadAwxRecentJobs();
          if (it.id === 'ct-sessions' && state.ctSessions.length === 0) loadCtSessions();
          if (it.id === 'monitor') loadIcinga();
          if (it.id === 'inbox') {
            loadInbox();
            if (icingaConfigured() && !state.icingaSummary) loadIcinga();
            // La tarjeta "Automations" del Cockpit calcula su tasa de éxito
            // sobre awxRecentJobs — sin esta carga, mostraría "No recent
            // jobs" hasta que el usuario pasara por la vista AWX.
            if (state.config.awx && state.config.awx.url && state.awxRecentJobs.length === 0) loadAwxRecentJobs();
          }
          if (it.id === 'jira' && state.inboxIssues.length === 0) loadInbox();
          if (it.id === 'corexterm' && state.ctSessions.length === 0) loadCtSessions();
          if (it.id === 'vscorex') initVsCorex();
          if (it.id === 'templates') {
            loadAutomationTemplates();
            loadPendingAttachments();
            if (state.awxTemplates.length === 0) loadAwxTemplates();
          }
        },
      }, [
        mk('span', { html: it.iconSvg, style: { width: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0', color: active ? CX.green : 'inherit' } }),
        mk('span', {}, [it.label]),
      ]);
      if (active) {
        row.appendChild(mk('span', {
          style: { position: 'absolute', left: '0', top: '4px', bottom: '4px', width: '3px', background: CX.green, borderRadius: '2px' },
        }));
      }
      if (it.badge) {
        const badgeIsPendingAttachments = it.id === 'templates';
        const badgeProps = {
          style: {
            marginLeft: 'auto', fontSize: '10px', background: CX.greenDim, color: CX.green,
            padding: '1px 6px', borderRadius: '999px', fontWeight: '700',
            cursor: badgeIsPendingAttachments ? 'pointer' : 'default',
          },
        };
        if (badgeIsPendingAttachments) {
          badgeProps.title = 'Open pending attachments';
          badgeProps.onclick = (e) => { e.stopPropagation(); state.showPendingAttachmentsModal = true; renderApp(); };
        }
        row.appendChild(mk('span', badgeProps, [String(it.badge)]));
      }
      itemsWrap.appendChild(row);
    });
    secWrap.appendChild(itemsWrap);
    nav.appendChild(secWrap);
  });

  nav.appendChild(mk('div', { style: { flex: '1' } }));

  // Tarjeta de usuario — identidad real de Jira (displayName + avatar del
  // endpoint /myself) cuando ya cargó; iniciales del email mientras tanto.
  // Clic → Settings, donde se configura la credencial de la que sale todo.
  const id = currentIdentity();
  nav.appendChild(mk('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px',
      borderRadius: '10px', background: CX.bgPanelAlt, border: `1px solid ${CX.borderSubtle}`,
      marginTop: '12px', cursor: 'pointer',
    },
    onclick: () => { state.view = 'profile'; renderApp(); },
    title: 'Open your profile',
  }, [
    renderAvatar(30),
    mk('div', { style: { flex: '1', lineHeight: '1.3', minWidth: '0', overflow: 'hidden' } }, [
      mk('div', { style: { fontSize: '12.5px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, [id.displayName]),
      mk('div', { style: { fontSize: '11px', color: CX.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, [id.subtitle]),
    ]),
  ]));

  return nav;
}

// Status bar global (parte inferior del mockup): Workspace · Branch ·
// Remote · Vault · SSH. Cada segmento sale de estado real y es clicable
// hacia la vista correspondiente. Los segmentos sin dato se omiten en vez
// de mostrar placeholders.
function renderGlobalStatusBar() {
  const item = (label, color, onclick, title) => mk('span', {
    style: {
      display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px',
      color: color || CX.textSecondary, cursor: onclick ? 'pointer' : 'default', whiteSpace: 'nowrap',
    },
    onclick, title,
  }, [label]);

  const parts = [];

  // Workspace del Cockpit (plantilla de widgets activa)
  const ws = ensureDashWorkspaces();
  parts.push(item(`Workspace: ${ws.name}`, null, () => { state.view = 'inbox'; state.dashWorkspaceMenuOpen = true; renderApp(); }, 'Cockpit workspace — click to switch'));

  // Rama git del workspace de VS Corex, si hay repo abierto
  if (state.vsGitStatus && state.vsGitStatus.current) {
    parts.push(item(`⎇ ${state.vsGitStatus.current}`, null, () => { state.view = 'vscorex'; renderApp(); }, 'Git branch (VS Corex workspace)'));
  }

  // Remote: la sesión SSH activa (pestaña seleccionada de CorexTerm)
  const activeInst = state.ctActiveTerminalId && state.ctTerminalInstances[state.ctActiveTerminalId];
  if (activeInst && activeInst.kind === 'ssh' && activeInst.session && activeInst.connected) {
    parts.push(item(`Remote: ${activeInst.session.name}`, null, () => { state.view = 'corexterm'; renderApp(); }, 'Active SSH session'));
  }

  const bar = mk('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: '18px', padding: '6px 24px',
      borderTop: `1px solid ${CX.borderSubtle}`, background: CX.bgTopbar, flexShrink: '0',
    },
  });
  parts.forEach((p) => bar.appendChild(p));
  bar.appendChild(mk('span', { style: { flex: '1' } }));

  // Vault (siempre desbloqueado si esta barra es visible) + SSH count
  bar.appendChild(item('🔓 Vault: Unlocked', CX.green, () => { state.view = 'vault'; renderApp(); loadVaultStats(); }, 'Open Vault management'));
  const sshActive = Object.values(state.ctTerminalInstances || {}).filter((i) => i.connected).length;
  bar.appendChild(item(`▮ ${sshActive} SSH Session${sshActive === 1 ? '' : 's'}`, sshActive > 0 ? CX.green : null, () => { state.view = 'corexterm'; renderApp(); }, 'Open CorexTerm'));

  return bar;
}

function renderTopbar() {
  const titles = {
    inbox: ['Operations Cockpit', 'Your mission control for infrastructure operations'],
    jira: ['My Work', 'Tickets assigned to you'],
    'jira-detail': [t('nav_jira'), null],
    awx: [t('nav_awx'), 'Templates and automation jobs'],
    'awx-detail': [t('nav_awx'), null],
    corexterm: ['CorexTerm', 'SSH sessions and local terminal'],
    vscorex: ['VS Corex', 'Editor and file explorer'],
    templates: ['Templates', 'Ticket automation templates'],
    settings: [t('nav_settings'), 'Connections and preferences'],
    vault: ['Vault', 'Encrypted credential storage'],
    'awx-jobs': ['Jobs', 'AWX job run history'],
    'ct-sessions': ['Sessions', 'Saved SSH sessions'],
    workspaces: ['Workspaces', 'Cockpit layout templates'],
    profile: ['Profile', 'Your identity, team and preferences'],
    monitor: ['Monitor', 'Icinga — current problems'],
  };
  const [title, subtitle] = titles[state.view] || ['COREX', null];

  const pill = (label, ok, sub, iconSvg, onclick) => mk('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px',
      borderRadius: '6px', border: `1px solid ${CX.borderSubtle}`, background: CX.bgPanelAlt, fontSize: '11px',
      cursor: onclick ? 'pointer' : 'default',
    },
    onclick,
    title: onclick ? 'Open Vault management' : undefined,
  }, [
    mk('span', { html: iconSvg, style: { width: '14px', display: 'flex', color: ok ? CX.green : CX.amber } }),
    mk('span', {}, [
      mk('div', { style: { fontSize: '11.5px', fontWeight: '600', color: CX.textPrimary } }, [label]),
      mk('div', { style: { fontSize: '10px', marginTop: '1px', color: ok ? CX.green : CX.amber } }, [sub]),
    ]),
  ]);

  const iconJira = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z"/></svg>';
  const iconAwx = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 2 8l10 6 10-6-10-6ZM2 16l10 6 10-6"/></svg>';
  const iconVault = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const iconSsh = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3"/></svg>';

  const jiraConfigured = !!(state.config.jira && state.config.jira.url);
  const awxConfigured = !!(state.config.awx && state.config.awx.url);
  const jiraOk = jiraConfigured && state.connectionLostBanner !== 'jira' && state.connectionLostBanner !== 'both';
  const awxOk = awxConfigured && state.connectionLostBanner !== 'awx' && state.connectionLostBanner !== 'both';
  const sshActive = Object.values(state.ctTerminalInstances || {}).filter((i) => i.connected).length;

  const pills = mk('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
    pill('Jira', jiraOk, !jiraConfigured ? 'Not configured' : (jiraOk ? 'Healthy' : 'Connection lost'), iconJira),
    pill('AWX', awxOk, !awxConfigured ? 'Not configured' : (awxOk ? 'Healthy' : 'Connection lost'), iconAwx),
    // El vault es un gate global: si ves este topbar, está desbloqueado.
    // El pill es clicable y lleva a la pantalla de gestión, donde ahora sí
    // existe la acción real de re-bloquearlo (vault:lock).
    pill('Vault', true, 'Unlocked', iconVault, () => { state.view = 'vault'; renderApp(); loadVaultStats(); loadVaultCreds(); }),
    pill('SSH', true, `${sshActive} Active`, iconSsh),
  ]);

  const search = mk('div', {
    style: {
      flex: '1', maxWidth: '420px', minWidth: '180px', display: 'flex', alignItems: 'center', gap: '8px',
      background: CX.bgInput, border: `1px solid ${CX.borderSubtle}`, borderRadius: '999px',
      padding: '8px 14px', color: CX.textMuted, fontSize: '12px', cursor: 'not-allowed',
      whiteSpace: 'nowrap', overflow: 'hidden', height: '34px',
    },
    // TODO(global-search): puramente visual por ahora — no hay un índice
    // unificado de tickets/templates/hosts todavía para buscar en vivo.
    // Queda deshabilitado (cursor not-allowed) en vez de fingir que
    // funciona, para no generar una expectativa falsa al usuario.
    title: 'Búsqueda global — todavía no implementada',
    html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>',
  }, [
    mk('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', flex: '1' } }, ['Search tickets, templates, hosts…']),
    mk('span', { style: { background: '#141c26', border: `1px solid ${CX.borderSubtle}`, borderRadius: '4px', padding: '1px 6px', fontSize: '10px', flexShrink: '0' } }, ['⌘K']),
  ]);

  const bell = mk('div', {
    style: { position: 'relative', color: CX.textSecondary, cursor: 'not-allowed', display: 'flex' },
    title: 'Notifications — todavía no implementado',
    html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  });

  const avatar = renderAvatar(30, () => { state.view = 'profile'; renderApp(); }, 'Open your profile');

  const titleBlock = mk('div', {}, [
    mk('h1', { style: { fontSize: '18px', fontWeight: '700', color: CX.textPrimary, margin: '0' } }, [title]),
    subtitle ? mk('p', { style: { fontSize: '11px', color: CX.textMuted, margin: '2px 0 0' } }, [subtitle]) : null,
  ].filter(Boolean));

  return mk('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: '24px', padding: '14px 24px',
      background: CX.bgTopbar, borderBottom: `1px solid ${CX.borderSubtle}`, flexShrink: '0',
    },
  }, [titleBlock, search, pills, bell, avatar]);
}

function renderToast() {
  if (!state.toast) return null;
  const colors = {
    ok: { bg: '#10251a', border: '#15803d', text: '#22c55e' },
    err: { bg: '#1f1319', border: '#7f3839', text: '#ef4444' },
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
      borderRadius: '10px',
      fontSize: '13px',
      fontWeight: '500',
      zIndex: '999',
      maxWidth: '420px',
    },
  }, [state.toast.msg]);
}

// Banners persistentes — distintos del toast: NO se autoborran. Se apilan
// encima de donde aparecería el toast normal (que vive más abajo, en
// bottom:24px) para que no se solapen si ambos están visibles a la vez.
// Cada uno tiene su propio botón de acción (abre el modal directamente,
// ya filtrado a ese pendiente) y su propio cierre.
// Banner de "sin conexión" — arriba de la pantalla, no abajo junto a los
// banners de adjuntos pendientes: esto es más urgente (explica por qué
// nada se está actualizando) y debe verse de inmediato sin competir por
// espacio. No tiene botón de cerrar — desaparece solo en cuanto la
// conexión vuelve, porque ocultarlo manualmente mientras sigue caída
// dejaría al usuario sin saber por qué las listas no se mueven.
function renderConnectivityBanner() {
  if (!state.connectionLostBanner) return null;
  const labels = { jira: 'Jira', awx: 'AWX', both: 'Jira and AWX' };
  return mk('div', {
    style: {
      position: 'fixed', top: '0', left: '0', right: '0', zIndex: '1000',
      background: '#3a1e22', borderBottom: '1px solid #7f3839', color: '#e0a0a0',
      padding: '8px 16px', fontSize: '12.5px', textAlign: 'center', fontWeight: '600',
    },
  }, [
    `⚠ Connection lost to ${labels[state.connectionLostBanner]} — retrying automatically every 15s`,
  ]);
}

function renderPersistentBanners() {
  if (state.persistentBanners.length === 0) return null;
  const stack = mk('div', {
    style: {
      position: 'fixed', bottom: '76px', right: '24px', zIndex: '998',
      display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end',
    },
  });
  state.persistentBanners.forEach((banner) => {
    const card = mk('div', {
      style: {
        background: '#201607', border: '1px solid #5a3a0d', borderRadius: '10px',
        padding: '12px 14px', maxWidth: '340px', boxShadow: '0 8px 24px #00000066',
      },
    });
    const headerRow = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' } });
    headerRow.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#fbbf24', fontWeight: '700' } }, [
      `${banner.ticketKey} needs an attachment`,
    ]));
    headerRow.appendChild(mk('span', {
      style: { fontSize: '13px', color: '#8a703a', cursor: 'pointer', flexShrink: '0', lineHeight: '1' },
      onclick: () => dismissPersistentBanner(banner.id),
    }, ['×']));
    card.appendChild(headerRow);
    card.appendChild(mk('div', { style: { fontSize: '11px', color: '#aab6c3', marginBottom: '10px' } }, [banner.jobName]));
    card.appendChild(mk('button', {
      style: {
        background: '#fbbf24', color: '#0a0e15', border: 'none', borderRadius: '6px',
        padding: '6px 14px', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer',
      },
      onclick: () => {
        dismissPersistentBanner(banner.id);
        state.showPendingAttachmentsModal = true;
        renderApp();
      },
    }, ['Attach now →']));
    stack.appendChild(card);
  });
  return stack;
}

function dismissPersistentBanner(id) {
  state.persistentBanners = state.persistentBanners.filter((b) => b.id !== id);
  renderApp();
}

function renderApp() {
  const app = document.getElementById('app');

  // Gate global: hasta que el vault esté desbloqueado, no se muestra nada
  // más de la app — ni Dashboard, ni AWX, ni Jira. Esto es justo lo que pedía
  // el cambio: la Master Password se pide al arrancar COREX, no al entrar a
  // CorexTerm, porque ahora protege TODAS las credenciales (AWX/Jira/SMTP
  // también), no solo las sesiones SSH.
  if (!state.vaultUnlocked) {
    // El gate también necesita capturar/restaurar el foco: al fallar el
    // unlock se re-renderiza para mostrar el error, y sin esto el campo de
    // contraseña perdía el foco justo cuando quieres reintentar escribiendo.
    const gateActiveEl = document.activeElement;
    const gateFocusKey = gateActiveEl && gateActiveEl.dataset ? gateActiveEl.dataset.focusKey : null;
    app.innerHTML = '';
    app.appendChild(renderVaultGate());
    if (gateFocusKey) {
      const el = app.querySelector(`[data-focus-key="${gateFocusKey}"]`);
      if (el) el.focus();
    }
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

  // Mismo patrón para las listas de Jira y AWX — Inbox y Jira comparten el
  // mismo dato (state.inboxIssues), así que ambas vistas mantienen vivo el
  // polling de tickets. Sin esto, cerrar un ticket desde Jira directamente
  // (fuera de COREX) nunca se reflejaba hasta recargar la app entera.
  if (state.view === 'inbox' || state.view === 'jira') {
    if (!state.jiraListPollHandle) startJiraListPolling();
  } else {
    stopJiraListPolling();
  }

  if (state.view === 'awx') {
    if (!state.awxListPollHandle) startAwxListPolling();
  } else {
    stopAwxListPolling();
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

  // Layout Cockpit: sidebar a la izquierda + columna derecha (topbar fijo
  // arriba, contenido con scroll debajo). El id 'corex-main-scroll' y su
  // data-view NO cambian — la preservación de scroll y foco de más arriba
  // depende de ellos, igual que antes del rediseño.
  const layout = mk('div', { style: { display: 'flex', height: '100%', background: CX.bgApp } });
  layout.appendChild(renderSidebar());

  const rightCol = mk('div', {
    style: { flex: '1', display: 'flex', flexDirection: 'column', minWidth: '0', height: '100%' },
  });
  rightCol.appendChild(renderTopbar());

  const main = mk('div', {
    id: 'corex-main-scroll',
    'data-view': state.view,
    style: { flex: '1', overflowY: 'auto', padding: '24px', minHeight: '0' },
  });

  if (state.view === 'inbox') main.appendChild(renderInboxView());
  else if (state.view === 'awx') main.appendChild(renderAwxView());
  else if (state.view === 'awx-detail') main.appendChild(renderAwxDetailView());
  else if (state.view === 'jira') main.appendChild(renderJiraView());
  else if (state.view === 'jira-detail') main.appendChild(renderJiraDetailView());
  else if (state.view === 'corexterm') main.appendChild(renderCorexTermView());
  else if (state.view === 'vscorex') main.appendChild(renderVsCorexView());
  else if (state.view === 'templates') main.appendChild(renderTemplatesView());
  else if (state.view === 'settings') main.appendChild(renderSettingsView());
  else if (state.view === 'vault') main.appendChild(renderVaultView());
  else if (state.view === 'awx-jobs') main.appendChild(renderAwxJobsView());
  else if (state.view === 'ct-sessions') main.appendChild(renderCtSessionsManagerView());
  else if (state.view === 'workspaces') main.appendChild(renderWorkspacesView());
  else if (state.view === 'profile') main.appendChild(renderProfileView());
  else if (state.view === 'monitor') main.appendChild(renderMonitorView());

  rightCol.appendChild(main);
  rightCol.appendChild(renderGlobalStatusBar());
  layout.appendChild(rightCol);
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

  const connectivityBanner = renderConnectivityBanner();
  if (connectivityBanner) app.appendChild(connectivityBanner);

  const banners = renderPersistentBanners();
  if (banners) app.appendChild(banners);

  if (state.showPendingAttachmentsModal) {
    app.appendChild(renderPendingAttachmentsModal());
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
//  Vault — gate global de Master Password (bloquea toda la app hasta unlock)
// ═══════════════════════════════════════════════════════════════════════════

async function checkVaultGate() {
  // Ctrl+R / F5 recarga solo el renderer (este frontend), no el proceso
  // main de Electron — así que si el vault ya estaba desbloqueado antes
  // del refresco, el backend (vaultDataCache) sigue teniéndolo en memoria
  // aunque este frontend haya perdido su propio state.vaultUnlocked. Sin
  // esta consulta, cada Ctrl+R pedía la master password de nuevo de forma
  // innecesaria, aunque el vault nunca llegó a re-bloquearse de verdad.
  const unlockedRes = await window.corexAPI.vaultIsUnlocked();
  if (unlockedRes.unlocked) {
    state.vaultExists = true;
    state.vaultUnlocked = true;
    await loadAllAfterUnlock();
    renderApp();
    return;
  }

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
  await loadAutomationTemplates();
  await loadPendingAttachments();

  if (state.view === 'inbox' && state.config.jira && state.config.jira.url) {
    loadInbox();
  }
  if (state.config.awx && state.config.awx.url) {
    loadAwxTemplates();
    // El Dashboard (vista inicial) muestra la tasa de éxito de los últimos
    // jobs en su tarjeta "Automations" — cargarla ya en el arranque evita
    // que la tarjeta quede en "No recent jobs" hasta visitar la vista AWX.
    loadAwxRecentJobs();
  }

  // Identidad real (nombre + avatar de Jira) para sidebar y topbar.
  // No bloquea el arranque: si falla, la UI sigue con iniciales del email.
  if (state.config.jira && state.config.jira.url) {
    window.corexAPI.jiraMyself().then((res) => {
      if (res.ok && res.me) {
        state.jiraMyself = res.me;
        renderApp();
      }
    });
  }
}

function renderVaultGate() {
  const wrap = mk('div', { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0e15' } });

  const logoSvg = '<svg viewBox="0 0 15559.15 9394.27" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:48px;height:29px;display:block;margin:0 auto 18px;">' +
    '<polygon fill="currentColor" points="4445.48,7673.09 2222.74,4535.94 -0,7673.09" />' +
    '<polygon fill="currentColor" points="11113.67,1398.78 13336.4,4535.93 15559.15,1398.78" />' +
    '<polygon fill="currentColor" points="9039.43,9394.27 2383.41,0 7115.63,0 13771.67,9394.27" />' +
    '</svg>';

  const box = mk('div', { style: { background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', padding: '32px', width: '360px', color: '#eef2f5' } });
  box.appendChild(mk('div', { html: logoSvg, style: { color: '#eef2f5' } }));
  box.appendChild(mk('div', { style: { fontSize: '14px', fontWeight: '700', textAlign: 'center', marginBottom: '6px' } }, [
    state.vaultExists ? 'Unlock COREX' : 'Set your master password',
  ]));
  box.appendChild(mk('p', { style: { fontSize: '11.5px', color: '#8a96a3', textAlign: 'center', marginBottom: '18px', lineHeight: '1.5' } }, [
    state.vaultExists
      ? 'This decrypts your AWX, Jira, SMTP and CorexTerm credentials for this session.'
      : 'This will encrypt every credential you save in COREX — AWX, Jira, SMTP, and CorexTerm sessions. It is never stored anywhere; if you forget it, there is no recovery.',
  ]));

  box.appendChild(mk('input', {
    style: { width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '9px 10px', color: '#eef2f5', fontSize: '13px', marginBottom: '10px' },
    type: 'password',
    placeholder: 'Master password',
    value: state.vaultUnlockInput,
    'data-focus-key': 'vault-unlock-pw',
    oninput: (e) => { state.vaultUnlockInput = e.target.value; },
    onkeydown: (e) => { if (e.key === 'Enter' && state.vaultExists) submitVaultUnlock(); },
  }));

  if (!state.vaultExists) {
    box.appendChild(mk('input', {
      style: { width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '9px 10px', color: '#eef2f5', fontSize: '13px', marginBottom: '10px' },
      type: 'password',
      placeholder: 'Confirm master password',
      value: state.vaultUnlockConfirm,
      'data-focus-key': 'vault-unlock-confirm',
      oninput: (e) => { state.vaultUnlockConfirm = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter') submitVaultUnlock(); },
    }));
  }

  if (state.vaultUnlockError) {
    box.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#ef4444', marginBottom: '10px' } }, [state.vaultUnlockError]));
  }

  box.appendChild(mk('button', {
    style: {
      background: state.vaultUnlocking ? '#1b2530' : '#eef2f5', color: state.vaultUnlocking ? '#8a96a3' : '#0a0e15',
      border: 'none', borderRadius: '6px', padding: '10px 0', width: '100%', fontSize: '13px', fontWeight: '700',
      cursor: state.vaultUnlocking ? 'not-allowed' : 'pointer',
    },
    onclick: () => { if (!state.vaultUnlocking) submitVaultUnlock(); },
  }, [state.vaultUnlocking ? 'Unlocking...' : (state.vaultExists ? 'Unlock' : 'Set password and continue')]));

  wrap.appendChild(box);
  return wrap;
}

async function init() {
  setupAutoLock();
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes corex-spin { to { transform: rotate(360deg); } }
    .corex-spinner { animation: corex-spin 0.8s linear infinite; }
    input[type=text]::placeholder, textarea::placeholder { color: #8a96a3; }
  `;
  document.head.appendChild(styleEl);

  setupCorextermListeners();

  // Arrancamos siempre por el gate del vault — nada de AWX/Jira/config se
  // carga hasta que el usuario introduce la Master Password correcta.
  await checkVaultGate();
}

// Red de seguridad del frontend: sin esto, cualquier promesa rechazada sin
// .catch() o cualquier excepción de JS que se escape de los try/catch ya
// existentes desaparece en silencio — la app puede quedar en un estado a
// medio actualizar (un botón que no responde, un modal que no cierra) sin
// ningún indicio de qué pasó. Mostramos un toast de error genérico (no
// queremos asumir qué se rompió) y lo logueamos a consola para diagnóstico.
//
// El guard handlingGlobalError es importante: si el error que se capturó
// aquí ocurrió DENTRO de renderApp() (un bug real al construir alguna
// vista), entonces toast() —que también llama a renderApp()— dispararía
// el mismo fallo otra vez, re-entrando en este mismo handler sin parar.
// Sin el guard sería un bucle infinito real, no solo teórico.
let handlingGlobalError = false;
function reportGlobalError(source, detail) {
  console.error(`[COREX] ${source}:`, detail);
  if (handlingGlobalError) return; // ya estamos en medio de reportar uno, no reentrar
  handlingGlobalError = true;
  try {
    toast('Something went wrong — check the console for details', 'err');
  } catch (e) {
    console.error('[COREX] Failed to show error toast (renderApp itself may be broken):', e);
  } finally {
    handlingGlobalError = false;
  }
}
window.addEventListener('unhandledrejection', (event) => {
  reportGlobalError('Unhandled promise rejection', event.reason);
});
window.addEventListener('error', (event) => {
  reportGlobalError('Uncaught error', event.error || event.message);
});

init();

// ═══════════════════════════════════════════════════════════════════════════
//  AWX — listar templates, lanzar jobs, ver estado/log en vivo
// ═══════════════════════════════════════════════════════════════════════════

async function loadAwxTemplates() {
  state.awxLoading = true;
  state.awxError = null;
  renderApp();
  await refreshAwxTemplatesSilently();
  state.awxLoading = false;
  renderApp();
}

// Refresco silencioso para el polling de 15s — sin tocar awxLoading, mismo
// motivo que refreshInboxSilently: evitar el parpadeo de "Loading..." en
// cada ciclo cuando la lista ya está visible.
async function refreshAwxTemplatesSilently() {
  const res = await window.corexAPI.awxListJobTemplates();
  trackConnectivity('awx', res);
  if (!res.ok) {
    state.awxError = res.error;
    if (res.isAuthError) {
      // Credenciales caducadas: reintentar cada 15s no arregla nada, solo
      // genera ruido. Paramos el polling — el usuario tiene que ir a
      // Settings; al volver a esta vista, el polling arranca de cero.
      stopAwxListPolling();
      toast('AWX authentication failed — check your credentials in Settings', 'err');
    }
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
        background: active ? '#111a24' : 'transparent',
        border: `1px solid ${active ? '#eef2f5' : done ? '#15803d' : '#1b2530'}`,
        color: active ? '#eef2f5' : done ? '#22c55e' : '#8a96a3',
        fontWeight: active ? '700' : '500',
      },
    }, [`${i + 1}. ${stepLabels[s]}`]));
  });
  wrap.appendChild(stepsRow);

  wrap.appendChild(mk('div', { style: { fontSize: '13px', fontWeight: '700', color: '#eef2f5', marginBottom: '14px' } }, [tpl.name]));

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
      style: { background: 'transparent', border: '1px solid #1b2530', color: '#8a96a3', borderRadius: '6px', padding: '9px 18px', fontSize: '13px', cursor: 'pointer' },
      onclick: () => { wizard.currentStepIndex -= 1; renderApp(); },
    }, ['← Back']));
  }
  const isLast = step === 'preview';
  navRow.appendChild(mk('button', {
    style: {
      background: !valid ? '#1b2530' : '#eef2f5', color: !valid ? '#8a96a3' : '#0a0e15',
      border: 'none', borderRadius: '6px', padding: '9px 22px', fontSize: '13px', fontWeight: '700',
      cursor: !valid ? 'not-allowed' : 'pointer',
    },
    onclick: () => {
      if (!valid) return;
      if (isLast) launchAwxJob();
      else { wizard.currentStepIndex += 1; renderApp(); }
    },
  }, [isLast ? '▶ ' + t('awx_launch_button') : t('awx_continue_button') + ' →']));
  navRow.appendChild(mk('span', {
    style: { fontSize: '12px', color: '#8a96a3', cursor: 'pointer', alignSelf: 'center', marginLeft: '4px' },
    onclick: () => { state.awxLaunchWizard = null; renderApp(); },
  }, ['Cancel']));
  wrap.appendChild(navRow);

  // Si el botón está bloqueado en el paso de survey, decimos exactamente
  // qué pregunta falta — sin esto, no hay forma de saberlo sin abrir
  // DevTools cuando hay varios campos y "algo" no cuenta como relleno.
  if (!valid && step === 'survey') {
    const blocking = wizardSurveyBlockingQuestion(wizard);
    if (blocking) {
      wrap.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#f59e0b', marginTop: '8px' } }, [
        `Missing required field: "${blocking.question_name}" (variable: ${blocking.variable}, type: ${blocking.type})`,
      ]));
    }
  }

  return wrap;
}

function renderInstanceGroupsStep(wizard) {
  const wrap = mk('div', {});
  wrap.appendChild(mk('p', { style: { fontSize: '12px', color: '#8a96a3', marginBottom: '12px' } }, [
    'Select which instance group(s) should run this job. Leave empty to use the template default.',
  ]));
  if (wizard.instanceGroups.available.length === 0) {
    wrap.appendChild(mk('div', { style: { fontSize: '12px', color: '#8a96a3' } }, ['Loading…']));
    return wrap;
  }
  wizard.instanceGroups.available.forEach((ig) => {
    const checked = wizard.instanceGroups.selected.includes(ig.id);
    wrap.appendChild(mk('div', { style: { padding: '7px 0', fontSize: '13px', color: '#eef2f5' } }, [
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
    wrap.appendChild(mk('label', { style: { fontSize: '11px', color: '#8a96a3', display: 'block', marginBottom: '4px', marginTop: '10px' } }, [label]));
    wrap.appendChild(mk('input', {
      style: { width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '8px 10px', color: '#eef2f5', fontSize: '13px' },
      type: 'text', placeholder: placeholder || '', value: op[key] || '',
      'data-focus-key': `wizard-op-${key}`,
      oninput: (e) => { op[key] = e.target.value; },
    }));
  }

  if (tpl.ask_limit_on_launch) textField('Limit', 'limit', 'e.g. hostname or group');
  if (tpl.ask_scm_branch_on_launch) textField('SCM Branch', 'scm_branch', tpl.scm_branch || 'default');
  if (tpl.ask_tags_on_launch) textField('Job Tags', 'job_tags');
  if (tpl.ask_skip_tags_on_launch) textField('Skip Tags', 'skip_tags');

  if (tpl.ask_inventory_on_launch) {
    wrap.appendChild(mk('label', { style: { fontSize: '11px', color: '#8a96a3', display: 'block', marginBottom: '4px', marginTop: '10px' } }, ['Inventory']));
    const select = mk('select', {
      style: { width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '8px 10px', color: '#eef2f5', fontSize: '13px' },
      onchange: (e) => { op.inventory = Number(e.target.value) || null; renderApp(); },
    }, [mk('option', { value: '' }, ['(template default)'])]);
    wizard.inventories.forEach((inv) => {
      select.appendChild(mk('option', { value: String(inv.id), selected: op.inventory === inv.id }, [inv.name]));
    });
    wrap.appendChild(select);
  }

  if (tpl.ask_credential_on_launch) {
    wrap.appendChild(mk('label', { style: { fontSize: '11px', color: '#8a96a3', display: 'block', marginBottom: '4px', marginTop: '10px' } }, ['Credentials']));
    wizard.credentialsList.slice(0, 12).forEach((cred) => {
      const checked = op.credentials.includes(cred.id);
      wrap.appendChild(mk('div', { style: { padding: '5px 0', fontSize: '12.5px', color: '#eef2f5' } }, [
        renderCheckbox(checked, (e) => {
          if (e.target.checked) op.credentials.push(cred.id);
          else op.credentials = op.credentials.filter((id) => id !== cred.id);
          renderApp();
        }, `${cred.name} (${cred.kind})`),
      ]));
    });
  }

  if (tpl.ask_execution_environment_on_launch) {
    wrap.appendChild(mk('label', { style: { fontSize: '11px', color: '#8a96a3', display: 'block', marginBottom: '4px', marginTop: '10px' } }, ['Execution Environment']));
    const select = mk('select', {
      style: { width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '8px 10px', color: '#eef2f5', fontSize: '13px' },
      onchange: (e) => { op.execution_environment = Number(e.target.value) || null; renderApp(); },
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
    wrap.appendChild(mk('div', { style: { fontSize: '12px', color: '#8a96a3' } }, [t('awx_survey_loading')]));
    return wrap;
  }

  (wizard.surveySpec.spec || []).forEach((q) => {
    const col = mk('div', { style: { marginBottom: '12px' } });
    col.appendChild(mk('label', { style: { fontSize: '11px', color: '#8a96a3', display: 'block', marginBottom: '4px' } }, [
      q.question_name + (q.required ? ` (${t('awx_survey_required')})` : ''),
    ]));

    if (q.type === 'multiplechoice' || q.type === 'multiselect') {
      const select = mk('select', {
        style: { width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '8px 10px', color: '#eef2f5', fontSize: '13px' },
        onchange: (e) => { wizard.surveyAnswers[q.variable] = e.target.value; renderApp(); },
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
          width: '100%', minHeight: '110px', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px',
          padding: '8px 10px', color: '#eef2f5', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical',
        },
        placeholder: q.default || '',
        'data-focus-key': `survey-${q.variable}`,
        oninput: (e) => { wizard.surveyAnswers[q.variable] = e.target.value; renderApp(); },
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
        style: { width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '8px 10px', color: '#eef2f5', fontSize: '13px' },
        type: q.type === 'password' ? 'password' : q.type === 'integer' || q.type === 'float' ? 'number' : 'text',
        placeholder: q.default || '',
        value: wizard.surveyAnswers[q.variable] || '',
        'data-focus-key': `survey-${q.variable}`,
        oninput: (e) => { wizard.surveyAnswers[q.variable] = e.target.value; renderApp(); },
      }));
    }
    wrap.appendChild(col);
  });

  return wrap;
}

function renderPreviewStep(wizard) {
  const wrap = mk('div', { style: { fontSize: '12.5px', color: '#eef2f5', lineHeight: '1.8' } });
  if (wizard.steps.includes('instance_groups')) {
    const names = wizard.instanceGroups.available.filter((ig) => wizard.instanceGroups.selected.includes(ig.id)).map((ig) => ig.name);
    wrap.appendChild(mk('div', {}, [mk('span', { style: { color: '#8a96a3' } }, ['Instance groups: ']), names.length ? names.join(', ') : '(template default)']));
  }
  if (wizard.steps.includes('other_prompts')) {
    const op = wizard.otherPrompts;
    if (wizard.template.ask_limit_on_launch) wrap.appendChild(mk('div', {}, [mk('span', { style: { color: '#8a96a3' } }, ['Limit: ']), op.limit || '—']));
    if (wizard.template.ask_scm_branch_on_launch) wrap.appendChild(mk('div', {}, [mk('span', { style: { color: '#8a96a3' } }, ['Branch: ']), op.scm_branch || wizard.template.scm_branch || 'default']));
    if (wizard.template.ask_tags_on_launch) wrap.appendChild(mk('div', {}, [mk('span', { style: { color: '#8a96a3' } }, ['Tags: ']), op.job_tags || '—']));
  }
  if (wizard.steps.includes('survey') && wizard.surveySpec) {
    wrap.appendChild(mk('div', { style: { marginTop: '8px', fontSize: '10px', color: '#8a96a3', letterSpacing: '0.5px', textTransform: 'uppercase' } }, ['Survey answers']));
    (wizard.surveySpec.spec || []).forEach((q) => {
      const answer = String(wizard.surveyAnswers[q.variable] || '');
      if (q.type === 'textarea' && answer.includes('\n')) {
        // Mostramos explícitamente cada línea por separado — un <div> normal
        // colapsa los \n visualmente aunque el dato en memoria sí los tenga,
        // lo que puede dar la falsa impresión de que se va a enviar todo
        // junto en una sola línea cuando en realidad está bien formado.
        const lines = answer.split('\n').filter((l) => l.trim());
        wrap.appendChild(mk('div', { style: { marginBottom: '2px' } }, [
          mk('span', { style: { color: '#8a96a3' } }, [`${q.question_name} (${lines.length} lines): `]),
        ]));
        const linesBox = mk('div', { style: { background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '8px 10px', marginBottom: '8px', fontSize: '11.5px' } });
        lines.forEach((line) => linesBox.appendChild(mk('div', {}, [line])));
        wrap.appendChild(linesBox);
      } else {
        wrap.appendChild(mk('div', {}, [mk('span', { style: { color: '#8a96a3' } }, [`${q.question_name}: `]), answer || '—']));
      }
    });
  }
  wrap.appendChild(mk('div', { style: { marginTop: '8px', fontSize: '10px', color: '#8a96a3', letterSpacing: '0.5px', textTransform: 'uppercase' } }, ['Linked ticket']));
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
    await onAwxJobFinished(jobRes.job);
  }
  renderApp();
}

// Cuando un job vinculado a un ticket termina, buscamos si existe una
// Automation Template asociada a ESE TEMPLATE DE AWX (no al ticket — así
// cualquier ticket que dispare ese mismo template hereda la automatización
// sin tener que configurarla ticket por ticket) y ejecutamos la rama
// success/failure correspondiente: comentario (interno si es fallo, público
// si es éxito), transición de estado, y encolado de adjunto pendiente si la
// plantilla lo requiere. Todo esto se replica opcionalmente en el ticket
// padre, según lo que la plantilla defina.
async function onAwxJobFinished(job) {
  const ok = job.status === 'successful';
  toast(
    ok ? t('awx_job_finished_ok', { id: job.id }) : t('awx_job_finished_status', { id: job.id, status: job.status }),
    ok ? 'ok' : 'err'
  );

  const ticketKey = state.awxRunningJobTicketKey;
  if (!ticketKey) return; // job lanzado sin ticket vinculado, nada que automatizar

  const link = state.ticketLinks[ticketKey];
  if (!link) return;

  if (state.automationTemplates.length === 0) {
    await loadAutomationTemplates();
  }
  const auto = state.automationTemplates.find((a) => a.awxTemplateId === link.templateId);
  if (!auto) return; // este template no tiene automatización configurada, comportamiento manual de siempre

  const branch = ok ? auto.onSuccess : auto.onFailure;
  if (!branch || !branch.enabled) return;

  await runAutomationBranch(ticketKey, branch, job, { isParent: false });

  if (branch.parentBehavior && branch.parentBehavior !== 'none') {
    const issueRes = await window.corexAPI.jiraGetIssue(ticketKey);
    const parentKey = issueRes.ok && issueRes.issue.fields && issueRes.issue.fields.parent && issueRes.issue.fields.parent.key;
    if (parentKey) {
      await runAutomationBranch(parentKey, branch, job, { isParent: true });
    }
  }
}

// Ejecuta una rama (success u failure) de la automatización sobre un ticket
// concreto (hijo o padre): comenta, transiciona, y encola adjunto si aplica.
async function runAutomationBranch(ticketKey, branch, job, { isParent }) {
  const vars = buildAutomationVars(job);
  const commentTemplate = isParent ? (branch.parentCommentTemplate || branch.commentTemplate) : branch.commentTemplate;
  const isInternal = !job || job.status !== 'successful'; // fallo = interno, éxito = público, según se confirmó

  if (commentTemplate) {
    const body = renderAutomationTemplate(commentTemplate, vars);
    const res = await window.corexAPI.jiraAddComment(ticketKey, body, isInternal);
    if (!res.ok) toast(`Automation: comment failed on ${ticketKey}: ${res.error}`, 'err');
  }

  const transitionStatusName = isParent ? branch.parentTransitionStatusName : branch.transitionStatusName;
  if (transitionStatusName && transitionStatusName.trim()) {
    await resolveAndDoTransition(ticketKey, transitionStatusName.trim());
  }

  const needsAttachment = isParent ? branch.parentRequireAttachment : branch.requireAttachment;
  if (needsAttachment) {
    const pendingRes = await window.corexAPI.automationAddPendingAttachment({
      ticketKey,
      jobId: job.id,
      jobName: job.name || job.job_template_name || `Job #${job.id}`,
      status: job.status,
      isParent,
    });
    await loadPendingAttachments();
    toast(`Attachment needed for ${ticketKey} — see pending attachments`, 'ok');
    // Banner persistente — el toast de arriba se autoborra a los pocos
    // segundos y es fácil perdérselo; esto se queda fijo en pantalla hasta
    // que el usuario lo cierre o pulse para abrir el modal directamente.
    state.persistentBanners.push({
      id: (pendingRes && pendingRes.id) || `${ticketKey}-${Date.now()}`,
      ticketKey,
      jobName: job.name || job.job_template_name || `Job #${job.id}`,
    });
    renderApp();
  }
}

// Variables disponibles en las plantillas de mensaje — mismo concepto que
// las variables de un survey, insertables con un clic en el constructor.
// Busca, entre las transiciones REALES disponibles ahora mismo para este
// ticket concreto, cuál lleva a un estado con el nombre indicado en la
// plantilla — y la ejecuta. Si el ticket ya no puede llegar a ese estado
// desde donde está (por ejemplo, si alguien ya lo movió a mano), avisa con
// un error claro en vez de fallar en silencio o reventar.
async function resolveAndDoTransition(ticketKey, targetStatusName) {
  const transitionsRes = await window.corexAPI.jiraListTransitions(ticketKey);
  if (!transitionsRes.ok) {
    toast(`Automation: could not read transitions for ${ticketKey}: ${transitionsRes.error}`, 'err');
    return;
  }
  const match = (transitionsRes.transitions || []).find((tr) => {
    // El nombre de la transición y el nombre del estado destino no siempre
    // coinciden (p.ej. transición "Resolve Issue" → estado "Done"), así que
    // comparamos contra ambos para ser más permisivos.
    const transitionName = (tr.name || '').toLowerCase();
    const toStatusName = (tr.to && tr.to.name || '').toLowerCase();
    const target = targetStatusName.toLowerCase();
    return transitionName === target || toStatusName === target;
  });
  if (!match) {
    const available = (transitionsRes.transitions || []).map((tr) => (tr.to && tr.to.name) || tr.name).join(', ');
    toast(`Automation: ${ticketKey} has no transition to "${targetStatusName}" right now (available: ${available || 'none'})`, 'err');
    return;
  }
  const res = await window.corexAPI.jiraDoTransition(ticketKey, match.id);
  if (!res.ok) toast(`Automation: transition failed on ${ticketKey}: ${res.error}`, 'err');
}

function buildAutomationVars(job) {
  return {
    job_name: job.name || job.job_template_name || `Job #${job.id}`,
    job_id: String(job.id),
    status: job.status,
    finished_at: job.finished ? new Date(job.finished).toLocaleString() : '',
    duration: job.elapsed ? `${Math.round(job.elapsed)}s` : '',
    requested_by: (job.summary_fields && job.summary_fields.created_by && job.summary_fields.created_by.username) || '',
  };
}

function renderAutomationTemplate(template, vars) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (key in vars ? vars[key] : match));
}

function awxStatusColor(status) {
  const map = {
    successful: '#22c55e',
    failed: '#ef4444',
    error: '#ef4444',
    canceled: '#f59e0b',
    running: '#38bdf8',
    pending: '#f59e0b',
    waiting: '#f59e0b',
    launching: '#38bdf8',
  };
  return map[status] || '#8a96a3';
}

// Fondo tenue + texto de color para cada estado — más visible de un
// vistazo que solo un borde, igual que en dashboards de monitorización.
function awxStatusChipBg(status) {
  const map = {
    successful: '#10251a',
    failed: '#1f1319',
    error: '#1f1319',
    canceled: '#201607',
    running: '#0f1e28',
    pending: '#201607',
    waiting: '#201607',
    launching: '#0f1e28',
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


  if (!state.config.awx || !state.config.awx.url) {
    wrap.appendChild(mk('div', {
      style: {
        background: '#111a24', border: '1px solid #26313d', borderRadius: '10px',
        padding: '18px 20px', fontSize: '13px', color: '#eef2f5',
      },
    }, [
      t('awx_not_configured') + ' ',
      mk('span', { style: { color: '#eef2f5', cursor: 'pointer', fontWeight: '600' }, onclick: () => { state.view = 'settings'; renderApp(); } }, [t('nav_settings')]),
      ' ' + t('awx_not_configured_suffix'),
    ]));
    return wrap;
  }

  // Error banner
  if (state.awxError) {
    wrap.appendChild(mk('div', {
      style: {
        background: '#1f1319', border: '1px solid #7f3839', borderRadius: '10px',
        padding: '14px 18px', fontSize: '13px', color: '#ef4444', marginBottom: '20px',
      },
    }, [`${t('awx_load_error')} ${state.awxError}`]));
  }

  // Jobs recientes de todos los templates, con chips de estado + blast
  // radius — panorama rápido antes de bajar a la lista completa.
  wrap.appendChild(renderRecentJobsSection());

  const headerRow = mk('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  }, [
    mk('span', { style: { fontSize: '12px', fontWeight: '700', color: '#8a96a3', textTransform: 'uppercase', letterSpacing: '0.5px' } }, [t('awx_job_templates')]),
  ]);
  const headerActions = mk('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } });
  headerActions.appendChild(renderCheckbox(state.awxSortFavoritesFirst, (e) => {
    state.awxSortFavoritesFirst = e.target.checked;
    renderApp();
  }, mk('span', { style: { fontSize: '11px', color: '#8a96a3' } }, [t('awx_sort_favorites')])));
  headerActions.appendChild(mk('button', {
    style: {
      background: 'transparent', border: '1px solid #1b2530', color: '#8a96a3',
      borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer',
    },
    onclick: () => loadAwxTemplates(),
  }, [state.awxLoading ? '...' : '↻ ' + t('awx_reload')]));
  headerRow.appendChild(headerActions);
  wrap.appendChild(headerRow);

  wrap.appendChild(mk('input', {
    style: {
      width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px',
      padding: '9px 12px', color: '#eef2f5', fontSize: '13px', marginBottom: '12px',
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
    wrap.appendChild(mk('div', { style: { color: '#8a96a3', fontSize: '13px', padding: '20px 0' } }, [t('awx_loading')]));
  } else if (state.awxTemplates.length === 0 && !state.awxError) {
    wrap.appendChild(mk('div', { style: { color: '#8a96a3', fontSize: '13px', padding: '20px 0' } }, [t('awx_empty')]));
  } else if (filteredTemplates.length === 0) {
    wrap.appendChild(mk('div', { style: { color: '#8a96a3', fontSize: '13px', padding: '20px 0' } }, [`${t('awx_no_results_for')} "${state.awxFilter}".`]));
  } else {
    filteredTemplates.forEach((tpl) => {
      const isFav = state.favoriteTemplates.includes(tpl.id);
      const usageCount = state.templateUsage[tpl.id] || 0;
      const usageLabel = usageCount === 0 ? t('awx_never_run') : usageCount === 1 ? t('awx_used_once') : t('awx_used_times', { n: usageCount });

      const row = mk('div', {
        style: {
          padding: '12px 14px',
          borderRadius: '6px',
          marginBottom: '6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          background: '#0d141d',
          border: '1px solid #1b2530',
        },
        onclick: () => openAwxDetail(tpl, 'awx'),
      });

      const star = mk('span', {
        style: { fontSize: '15px', color: isFav ? '#f59e0b' : '#3a4650', cursor: 'pointer', lineHeight: '1.4', flexShrink: '0' },
        onclick: (e) => { e.stopPropagation(); toggleFavoriteTemplate(tpl.id); },
        title: isFav ? t('awx_unfavorite') : t('awx_favorite'),
      }, [isFav ? '★' : '☆']);

      const body = mk('div', { style: { flex: '1', minWidth: '0' } }, [
        mk('div', { style: { fontSize: '13.5px', fontWeight: '600', color: '#eef2f5', marginBottom: '2px' } }, [tpl.name]),
        mk('div', { style: { fontSize: '11.5px', color: '#8a96a3' } }, [tpl.description || `ID ${tpl.id}`]),
        mk('div', { style: { fontSize: '10.5px', color: '#8a96a3', marginTop: '3px' } }, [usageLabel]),
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
  await refreshAwxRecentJobsSilently();
  state.awxRecentJobsLoading = false;
  renderApp();
}

async function refreshAwxRecentJobsSilently() {
  if (!state.config.awx || !state.config.awx.url) return;
  const res = await window.corexAPI.awxGetRecentJobs(8);
  trackConnectivity('awx', res);
  if (!res.ok) {
    state.awxRecentJobsError = res.error;
    if (res.isAuthError) {
      stopAwxListPolling();
      toast('AWX authentication failed — check your credentials in Settings', 'err');
    }
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
    wrap.appendChild(mk('div', { style: { color: '#8a96a3', fontSize: '13px' } }, ['—']));
    return wrap;
  }

  const isFav = state.favoriteTemplates.includes(tpl.id);
  const usageCount = state.templateUsage[tpl.id] || 0;
  const usageLabel = usageCount === 0 ? t('awx_never_run') : usageCount === 1 ? t('awx_used_once') : t('awx_used_times', { n: usageCount });

  // ── Header con volver + favorito ──
  const headerRow = mk('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' } });
  headerRow.appendChild(mk('span', {
    style: { fontSize: '12px', color: '#eef2f5', cursor: 'pointer', fontWeight: '600' },
    onclick: () => { state.view = state.awxDetailReturnView; renderApp(); },
  }, ['← ' + t(state.awxDetailReturnView === 'inbox' ? 'nav_inbox' : 'nav_awx')]));
  wrap.appendChild(headerRow);

  const titleRow = mk('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', marginBottom: '4px' } });
  titleRow.appendChild(mk('h1', { style: { fontSize: '20px', fontWeight: '700', color: '#eef2f5' } }, [tpl.name]));
  titleRow.appendChild(mk('span', {
    style: { fontSize: '18px', color: isFav ? '#f59e0b' : '#3a4650', cursor: 'pointer' },
    onclick: () => toggleFavoriteTemplate(tpl.id),
    title: isFav ? t('awx_unfavorite') : t('awx_favorite'),
  }, [isFav ? '★' : '☆']));
  wrap.appendChild(titleRow);
  wrap.appendChild(mk('p', { style: { fontSize: '12.5px', color: '#8a96a3', marginBottom: '20px' } }, [tpl.description || `ID ${tpl.id} · ${usageLabel}`]));

  // ── Info completa (lo que ya conocíamos del JSON real de AWX) ──
  const inv = tpl.summary_fields && tpl.summary_fields.inventory;
  const proj = tpl.summary_fields && tpl.summary_fields.project;
  const creds = (tpl.summary_fields && tpl.summary_fields.credentials) || [];
  const userCaps = tpl.summary_fields && tpl.summary_fields.user_capabilities;

  const infoGrid = mk('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px', background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', padding: '18px 20px' } });

  const executesCol = mk('div', {});
  executesCol.appendChild(mk('div', { style: { fontSize: '10px', color: '#8a96a3', letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' } }, ['Executes']));
  executesCol.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#eef2f5', lineHeight: '1.9' } }, [
    mk('div', {}, [mk('span', { style: { color: '#8a96a3' } }, ['playbook ']), tpl.playbook || '—']),
    mk('div', {}, [mk('span', { style: { color: '#8a96a3' } }, ['project ']), (proj && proj.name) || '—']),
    mk('div', {}, [mk('span', { style: { color: '#8a96a3' } }, ['branch ']), tpl.scm_branch || 'default']),
  ]));

  const runsAsCol = mk('div', {});
  runsAsCol.appendChild(mk('div', { style: { fontSize: '10px', color: '#8a96a3', letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' } }, ['Runs against']));
  const blastRisk = inv && inv.hosts_with_active_failures > 0;
  runsAsCol.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#eef2f5', lineHeight: '1.9' } }, [
    mk('div', {}, [mk('span', { style: { color: '#8a96a3' } }, ['inventory ']), (inv && inv.name) || '—']),
    mk('div', { style: { color: blastRisk ? '#f59e0b' : '#eef2f5' } }, [
      mk('span', { style: { color: blastRisk ? '#f59e0b' : '#8a96a3' } }, ['hosts ']),
      inv ? `${inv.total_hosts}${inv.hosts_with_active_failures ? ` (${inv.hosts_with_active_failures} failing now)` : ''}` : '—',
    ]),
    mk('div', {}, [mk('span', { style: { color: '#8a96a3' } }, ['credential ']), creds.map((c) => c.name).join(', ') || '—']),
  ]));

  infoGrid.appendChild(executesCol);
  infoGrid.appendChild(runsAsCol);
  wrap.appendChild(infoGrid);

  if (userCaps && !userCaps.start) {
    wrap.appendChild(mk('div', {
      style: { background: '#1f1319', border: '1px solid #7f3839', borderRadius: '10px', padding: '12px 16px', fontSize: '12.5px', color: '#ef4444', marginBottom: '20px' },
    }, ['Your account doesn\u2019t have permission to run this template.']));
  }

  // ── Lanzar (wizard genérico si hay pasos, formulario simple si no) ──
  const launchBox = mk('div', { style: { background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', padding: '20px', marginBottom: '24px' } });

  if (state.awxLaunchLoading) {
    launchBox.appendChild(mk('div', { style: { fontSize: '13px', color: '#8a96a3' } }, [t('awx_survey_loading')]));
  } else if (state.awxLaunchWizard && state.awxLaunchWizard.template.id === tpl.id) {
    launchBox.appendChild(renderAwxLaunchWizard());
  } else {
    launchBox.appendChild(mk('label', { style: { fontSize: '11px', color: '#8a96a3', display: 'block', marginBottom: '4px' } }, [t('awx_ticket_label')]));
    launchBox.appendChild(mk('input', {
      style: {
        width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px',
        padding: '8px 10px', color: '#eef2f5', fontSize: '13px', marginBottom: '6px',
      },
      type: 'text',
      placeholder: 'OPS-1234',
      value: state.awxExtraVarsTicket,
      oninput: (e) => { state.awxExtraVarsTicket = e.target.value; renderApp(); },
    }));
    if (state.awxExtraVarsTicket.trim() && state.ticketLinks[state.awxExtraVarsTicket.trim()]) {
      launchBox.appendChild(mk('div', {
        style: { fontSize: '11px', color: '#eef2f5', cursor: 'pointer', marginBottom: '14px' },
        onclick: () => openJiraDetail(state.awxExtraVarsTicket.trim(), 'awx-detail'),
      }, [`→ ${t('jira_title')}: ${state.awxExtraVarsTicket.trim()}`]));
    } else {
      launchBox.appendChild(mk('div', { style: { marginBottom: '14px' } }));
    }

    const launching = state.awxRunningJob && ['launching', 'pending', 'waiting', 'running'].includes(state.awxRunningJob.status);
    launchBox.appendChild(mk('button', {
      style: {
        background: launching ? '#1b2530' : '#eef2f5', color: launching ? '#8a96a3' : '#0a0e15',
        border: 'none', borderRadius: '6px', padding: '10px 22px', fontSize: '13px', fontWeight: '700',
        cursor: launching ? 'not-allowed' : 'pointer',
      },
      onclick: () => { if (!launching) prepareAwxLaunch(tpl); },
    }, [launching ? t('awx_launching') : '▶ ' + t('awx_launch_button')]));
  }
  wrap.appendChild(launchBox);

  // ── Log en vivo del job actual ──
  if (state.awxRunningJob && state.awxSelectedTemplate && state.awxSelectedTemplate.id === tpl.id) {
    const job = state.awxRunningJob;
    const statusBox = mk('div', { style: { background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', padding: '20px', marginBottom: '24px' } });
    statusBox.appendChild(mk('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' } }, [
      mk('span', { style: { fontSize: '13px', fontWeight: '700', color: '#eef2f5' } }, [job.id ? `Job #${job.id}` : t('awx_launching')]),
      job.status ? mk('span', {
        style: {
          fontSize: '11px', fontWeight: '700', color: awxStatusColor(job.status),
          background: '#0a0e15', border: `1px solid ${awxStatusColor(job.status)}`,
          borderRadius: '20px', padding: '2px 10px', textTransform: 'uppercase',
        },
      }, [job.status]) : null,
    ]));
    if (state.awxStdout) {
      statusBox.appendChild(mk('div', { style: { fontSize: '10px', color: '#8a96a3', letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' } }, [t('awx_live_output')]));
      statusBox.appendChild(mk('pre', {
        style: {
          background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px',
          padding: '14px', fontSize: '11.5px', lineHeight: '1.6', color: '#22c55e',
          maxHeight: '320px', overflowY: 'auto', whiteSpace: 'pre-wrap',
        },
      }, [state.awxStdout]));
    }
    wrap.appendChild(statusBox);
  }

  // ── Historial completo de runs ──
  const historyBox = mk('div', {});
  historyBox.appendChild(mk('div', { style: { fontSize: '12px', fontWeight: '700', color: '#8a96a3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' } }, ['Run history']));

  if (state.awxJobHistoryError) {
    historyBox.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#ef4444' } }, [`Error: ${state.awxJobHistoryError}`]));
  } else if (state.awxJobHistory.length === 0 && state.awxJobHistoryLoading) {
    historyBox.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#8a96a3' } }, ['Loading…']));
  } else if (state.awxJobHistory.length === 0) {
    historyBox.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#8a96a3' } }, [t('awx_never_run')]));
  } else {
    state.awxJobHistory.forEach((job) => {
      const row = mk('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #1b2530', fontSize: '12px' },
      });
      row.appendChild(mk('span', { style: { color: '#eef2f5' } }, [`#${job.id}`]));
      row.appendChild(mk('span', { style: { color: '#8a96a3' } }, [job.finished ? new Date(job.finished).toLocaleString() : (job.started ? new Date(job.started).toLocaleString() : '—')]));
      row.appendChild(mk('span', {
        style: { color: awxStatusColor(job.status), fontWeight: '600', textTransform: 'uppercase', fontSize: '11px' },
      }, [job.status]));
      historyBox.appendChild(row);
    });

    if (state.awxJobHistoryHasNext) {
      historyBox.appendChild(mk('button', {
        style: { marginTop: '10px', background: 'transparent', border: '1px solid #1b2530', color: '#8a96a3', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer' },
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


  if (!state.config.jira || !state.config.jira.url) {
    wrap.appendChild(mk('div', {
      style: { background: '#111a24', border: '1px solid #26313d', borderRadius: '10px', padding: '18px 20px', fontSize: '13px', color: '#eef2f5' },
    }, [
      t('jira_not_configured') + ' ',
      mk('span', { style: { color: '#eef2f5', cursor: 'pointer', fontWeight: '600' }, onclick: () => { state.view = 'settings'; renderApp(); } }, [t('nav_settings')]),
      ' ' + t('jira_not_configured_suffix'),
    ]));
    return wrap;
  }

  // ── Buscador: para encontrar cualquier ticket puntual, no solo los propios ──
  const searchRow = mk('div', { style: { display: 'flex', gap: '10px', marginBottom: '20px' } });
  searchRow.appendChild(mk('input', {
    style: {
      flex: '1', background: '#0d141d', border: '1px solid #1b2530', borderRadius: '6px',
      padding: '10px 14px', color: '#eef2f5', fontSize: '13px',
    },
    type: 'text',
    placeholder: t('jira_search_placeholder'),
    value: state.jiraKeyInput,
    'data-focus-key': 'jira-key-input',
    oninput: (e) => { state.jiraKeyInput = e.target.value; },
    onkeydown: (e) => { if (e.key === 'Enter') loadJiraIssue(); },
  }));
  searchRow.appendChild(mk('button', {
    style: { background: '#eef2f5', color: '#0a0e15', border: 'none', borderRadius: '6px', padding: '0 18px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
    onclick: () => loadJiraIssue(),
  }, [t('jira_search_button')]));
  wrap.appendChild(searchRow);

  if (state.jiraLoading) {
    wrap.appendChild(mk('div', { style: { color: '#8a96a3', fontSize: '13px', marginBottom: '16px' } }, [t('jira_loading')]));
  }

  if (state.jiraError) {
    wrap.appendChild(mk('div', {
      style: { background: '#1f1319', border: '1px solid #7f3839', borderRadius: '10px', padding: '14px 18px', fontSize: '13px', color: '#ef4444', marginBottom: '16px' },
    }, [`Error: ${state.jiraError}`]));
  }

  // Resultado de una búsqueda puntual por clave, si la hay.
  if (state.jiraIssue) {
    const f = state.jiraIssue.fields || {};
    const card = mk('div', {
      style: { background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', padding: '20px', cursor: 'pointer', marginBottom: '24px' },
      onclick: () => openJiraDetail(state.jiraIssue.key, 'jira'),
    });
    card.appendChild(mk('div', { style: { fontSize: '12px', color: '#eef2f5', fontWeight: '700', marginBottom: '4px' } }, [state.jiraIssue.key]));
    card.appendChild(mk('div', { style: { fontSize: '15px', color: '#eef2f5', fontWeight: '700', marginBottom: '10px' } }, [f.summary || '(untitled)']));
    card.appendChild(mk('div', { style: { fontSize: '12px', color: '#8a96a3', marginBottom: '14px' } }, [
      `${t('jira_status_label')}: ${(f.status && f.status.name) || '—'}   ·   ${t('jira_assignee_label')}: ${(f.assignee && f.assignee.displayName) || t('jira_unassigned')}`,
    ]));
    if (f.description) {
      const descBox = mk('div', {
        style: { fontSize: '13px', color: '#eef2f5', lineHeight: '1.6', borderTop: '1px solid #1b2530', paddingTop: '14px' },
      });
      if (typeof f.description === 'string') descBox.innerHTML = jiraWikiToHtml(f.description);
      else descBox.textContent = t('jira_rich_description_fallback');
      card.appendChild(descBox);
    }
    wrap.appendChild(card);
  }

  // ── Lista completa de tickets asignados a mí, con vínculo y ejecución AWX ──
  wrap.appendChild(mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, [
    mk('span', { style: { fontSize: '12px', fontWeight: '700', color: '#8a96a3', textTransform: 'uppercase', letterSpacing: '0.5px' } }, [
      `${t('tickets_section_title')} (${state.inboxIssues.length})`,
    ]),
    mk('button', {
      style: { background: 'transparent', border: '1px solid #1b2530', color: '#8a96a3', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' },
      onclick: () => loadInbox(),
    }, [state.inboxLoading ? '...' : '↻ ' + t('inbox_reload')]),
  ]));

  if (state.inboxError) {
    wrap.appendChild(mk('div', {
      style: { background: '#1f1319', border: '1px solid #7f3839', borderRadius: '10px', padding: '14px 18px', fontSize: '13px', color: '#ef4444', marginBottom: '16px' },
    }, [`Error: ${state.inboxError}`]));
  }

  if (state.inboxLoading && state.inboxIssues.length === 0) {
    wrap.appendChild(mk('div', { style: { color: '#8a96a3', fontSize: '13px' } }, [t('inbox_loading')]));
    return wrap;
  }

  if (!state.inboxLoading && state.inboxIssues.length === 0 && !state.inboxError) {
    wrap.appendChild(mk('div', { style: { color: '#8a96a3', fontSize: '13px' } }, [t('inbox_empty')]));
    return wrap;
  }

  state.inboxIssues.forEach((issue) => {
    const f = issue.fields || {};
    const key = issue.key;
    const link = state.ticketLinks[key];
    const expanded = state.inboxExpandedKey === key;
    const jobRunningHere = state.awxRunningJob && state.awxRunningJobTicketKey === key &&
      ['launching', 'pending', 'waiting', 'running'].includes(state.awxRunningJob.status);

    const card = mk('div', { style: { background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', padding: '14px 16px', marginBottom: '10px' } });

    const topRow = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } });
    const leftCol = mk('div', { style: { flex: '1', minWidth: '0', cursor: 'pointer' }, onclick: () => openJiraDetail(key, 'jira') });
    leftCol.appendChild(mk('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' } }, [
      mk('span', { style: { fontSize: '11px', color: '#eef2f5', fontWeight: '700' } }, [key]),
      mk('span', { style: { fontSize: '10px', color: inboxPriorityColor(f.priority), border: `1px solid ${inboxPriorityColor(f.priority)}`, borderRadius: '20px', padding: '1px 8px' } }, [
        (f.priority && f.priority.name) || t('inbox_no_priority'),
      ]),
    ]));
    // Indicador de sub-tarea: si el ticket tiene padre, lo mostramos antes
    // del título — más visible que tener que abrir el detalle para saberlo.
    if (f.parent) {
      leftCol.appendChild(mk('div', { style: { fontSize: '10.5px', color: '#38bdf8', marginBottom: '2px' } }, [
        `↳ sub-task of ${f.parent.key}`,
      ]));
    }
    leftCol.appendChild(mk('div', { style: { fontSize: '14px', color: '#eef2f5', fontWeight: '600', marginBottom: '4px' } }, [f.summary || '(untitled)']));
    leftCol.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#8a96a3' } }, [
      `${(f.status && f.status.name) || '—'}`,
    ]));
    topRow.appendChild(leftCol);

    const actionCol = mk('div', { style: { flexShrink: '0', marginLeft: '14px' } });
    if (link) {
      actionCol.appendChild(mk('div', { style: { textAlign: 'right' } }, [
        mk('div', {
          style: { fontSize: '11px', color: '#22c55e', fontWeight: '600', marginBottom: '6px', cursor: 'pointer' },
          onclick: () => launchLinkedJob(key),
        }, [`→ ${link.templateName}`]),
        jobRunningHere
          ? mk('span', { style: { fontSize: '11px', color: '#eef2f5' } }, [t('inbox_running')])
          : mk('button', {
              style: { background: '#eef2f5', color: '#0a0e15', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
              onclick: () => launchLinkedJob(key),
            }, ['▶ ' + t('inbox_execute')]),
        mk('div', {
          style: { fontSize: '10px', color: '#8a96a3', cursor: 'pointer', marginTop: '6px' },
          onclick: () => unlinkTicket(key),
        }, [t('inbox_unlink')]),
      ]));
    } else {
      actionCol.appendChild(mk('button', {
        style: { background: 'transparent', border: '1px solid #1b2530', color: '#8a96a3', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer' },
        onclick: () => toggleInboxLink(key),
      }, [expanded ? t('inbox_cancel') : t('inbox_link_button')]));
    }
    topRow.appendChild(actionCol);
    card.appendChild(topRow);

    // Panel de vínculo expandido: buscador inline de job templates AWX
    if (expanded && !link) {
      const linkPanel = mk('div', { style: { marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #1b2530' } });
      linkPanel.appendChild(mk('input', {
        style: {
          width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px',
          padding: '8px 10px', color: '#eef2f5', fontSize: '12.5px', marginBottom: '8px',
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
        linkPanel.appendChild(mk('div', { style: { fontSize: '12px', color: '#8a96a3' } }, [t('inbox_loading_templates')]));
      } else if (matches.length === 0) {
        linkPanel.appendChild(mk('div', { style: { fontSize: '12px', color: '#8a96a3' } }, [t('inbox_no_results')]));
      } else {
        matches.forEach((tpl) => {
          linkPanel.appendChild(mk('div', {
            style: {
              padding: '8px 10px', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer',
              background: '#0a0e15', border: '1px solid #1b2530',
            },
            onclick: () => linkTicketToTemplate(key, tpl),
          }, [
            mk('div', { style: { fontSize: '12.5px', color: '#eef2f5', fontWeight: '600' } }, [tpl.name]),
          ]));
        });
        if (state.awxTemplates.filter((tplItem) => !filterText || (tplItem.name || '').toLowerCase().includes(filterText)).length > 8) {
          linkPanel.appendChild(mk('div', { style: { fontSize: '11px', color: '#8a96a3', marginTop: '4px' } }, [t('inbox_keep_typing')]));
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
  col.appendChild(mk('label', { style: { fontSize: '11px', color: '#8a96a3', display: 'block', marginBottom: '4px' } }, [label]));
  col.appendChild(mk('input', {
    style: {
      width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px',
      padding: '9px 12px', color: '#eef2f5', fontSize: '13px',
    },
    type: opts.type || 'text',
    placeholder: opts.placeholder || '',
    value: value || '',
    'data-focus-key': `settings-${label}`,
    oninput: (e) => onInput(e.target.value),
  }));
  return col;
}

// Selector de dos opciones (p.ej. Bearer token vs Basic Auth) que re-renderiza
// la vista entera al cambiar, para mostrar/ocultar los campos correspondientes.
function settingsToggleGroup(label, current, options, onChange) {
  const col = mk('div', { style: { marginBottom: '14px' } });
  col.appendChild(mk('label', { style: { fontSize: '11px', color: '#8a96a3', display: 'block', marginBottom: '6px' } }, [label]));
  const row = mk('div', { style: { display: 'flex', gap: '8px' } });
  options.forEach((opt) => {
    const active = current === opt.value;
    row.appendChild(mk('div', {
      style: {
        padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
        background: active ? '#111a24' : '#0a0e15',
        border: active ? '1px solid #eef2f5' : '1px solid #1b2530',
        color: active ? '#eef2f5' : '#8a96a3',
      },
      onclick: () => { onChange(opt.value); renderApp(); },
    }, [opt.label]));
  });
  col.appendChild(row);
  return col;
}

function settingsSection(title, children) {
  return mk('div', {
    style: { background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', padding: '22px', marginBottom: '20px', maxWidth: '480px' },
  }, [
    mk('div', { style: { fontSize: '13px', fontWeight: '700', color: '#eef2f5', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' } }, [title]),
    ...children,
  ]);
}

async function saveSettings() {
  await window.corexAPI.setConfig(state.config);
  toast(t('settings_saved_toast'), 'ok');
  // Refresh dependent views
  state.awxTemplates = [];
}

// ═══════════════════════════════════════════════════════════════════════════
//  Vault — pantalla de gestión (vista 'vault')
//  Inventario real del vault, bloquear ahora y cambiar Master Password.
// ═══════════════════════════════════════════════════════════════════════════

// ── Auto-lock del vault ──────────────────────────────────────────────────
// Dos vías: (1) inactividad — sin teclado/ratón durante N minutos (config
// autoLockMinutes, default 15, 0 = desactivado); (2) eventos de energía —
// main.js ya purga las claves al suspender/bloquear pantalla y nos avisa
// para hacer la limpieza visual completa. Un portátil desatendido no debe
// quedarse con el vault abierto.
const AUTO_LOCK_DEFAULT_MINUTES = 15;
let lastActivityAt = Date.now();

function autoLockMinutes() {
  const v = state.config && state.config.autoLockMinutes;
  return (v === 0 || v) ? Number(v) : AUTO_LOCK_DEFAULT_MINUTES;
}

function setupAutoLock() {
  ['keydown', 'mousedown', 'wheel', 'touchstart'].forEach((ev) => {
    window.addEventListener(ev, () => { lastActivityAt = Date.now(); }, { passive: true, capture: true });
  });
  setInterval(() => {
    const mins = autoLockMinutes();
    if (!mins || !state.vaultUnlocked) return;
    if (Date.now() - lastActivityAt >= mins * 60000) {
      doLockVault('idle');
    }
  }, 30000);
  if (window.corexAPI.onForceLock) {
    window.corexAPI.onForceLock((payload) => {
      if (state.vaultUnlocked) doLockVault((payload && payload.reason) || 'suspend');
    });
  }
}

async function loadVaultCreds() {
  const res = await window.corexAPI.credsList();
  if (res.ok) state.vaultCreds = res.credentials;
  renderApp();
}

async function saveVaultCred() {
  const f = state.vaultCredForm;
  if (!f) return;
  if (!f.name || !f.name.trim()) { toast('Name is required', 'err'); return; }
  if (!f.id && !f.secret) { toast('Secret is required', 'err'); return; }
  const res = await window.corexAPI.credsSave(f);
  if (!res.ok) { toast(res.error || 'Could not save credential', 'err'); return; }
  state.vaultCredForm = null;
  toast('Credential saved to encrypted vault', 'ok');
  await loadVaultCreds();
  loadVaultStats();
}

async function deleteVaultCred(id, name) {
  if (!window.confirm(`Delete credential "${name}" from the vault? This cannot be undone.`)) return;
  const res = await window.corexAPI.credsDelete(id);
  if (!res.ok) { toast(res.error || 'Could not delete', 'err'); return; }
  delete state.vaultCredRevealed[id];
  toast('Credential deleted', 'ok');
  await loadVaultCreds();
  loadVaultStats();
}

async function toggleRevealCred(id) {
  if (state.vaultCredRevealed[id] !== undefined) {
    delete state.vaultCredRevealed[id];
    renderApp();
    return;
  }
  const res = await window.corexAPI.credsReveal(id);
  if (!res.ok) { toast(res.error || 'Could not reveal', 'err'); return; }
  state.vaultCredRevealed[id] = res.secret;
  renderApp();
}

async function copyCredSecret(id) {
  const res = await window.corexAPI.credsReveal(id);
  if (!res.ok) { toast(res.error || 'Could not copy', 'err'); return; }
  try {
    await navigator.clipboard.writeText(res.secret);
    toast('Secret copied — clipboard will be cleared in 30s', 'ok');
    // Auto-limpieza: a los 30s, si el portapapeles AÚN contiene este
    // secreto (no lo has sobrescrito copiando otra cosa), se vacía. Si
    // readText falla (foco en otra app), limpiamos igualmente por si acaso:
    // borrar de más es inocuo, dejar un secreto pegable indefinidamente no.
    setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText().catch(() => null);
        if (current === null || current === res.secret) {
          await navigator.clipboard.writeText('');
        }
      } catch (e) { /* mejor esfuerzo */ }
    }, 30000);
  } catch (e) {
    toast('Clipboard unavailable', 'err');
  }
}

async function loadVaultStats() {
  const res = await window.corexAPI.vaultStats();
  if (res.ok) {
    state.vaultStats = res.stats;
    state.vaultStatsError = null;
  } else {
    state.vaultStats = null;
    state.vaultStatsError = res.error;
  }
  renderApp();
}

// Bloquear el vault a demanda. Orden importante: primero paramos todos los
// pollers (si siguieran vivos, dispararían llamadas que fallarían contra un
// vault bloqueado y ensuciarían la UI con errores), después limpiamos el
// estado sensible del renderer, y solo al final llamamos al backend y
// volvemos al gate.
async function lockVaultNow() {
  const sshActive = Object.values(state.ctTerminalInstances || {}).filter((i) => i.connected).length;
  const msg = sshActive > 0
    ? `Lock the vault now?\n\n${sshActive} SSH session(s) will be disconnected and all polling will stop. You will need the master password to use COREX again.`
    : 'Lock the vault now?\n\nAll polling will stop and you will need the master password to use COREX again.';
  if (!window.confirm(msg)) return;
  await doLockVault('manual');
}

// Núcleo del bloqueo, sin confirmación — lo comparten el botón manual (que
// sí confirma), el auto-lock por inactividad y el force-lock por suspensión
// del equipo. 'reason' solo cambia el mensaje del toast.
async function doLockVault(reason) {

  stopJiraListPolling();
  stopAwxListPolling();
  stopHwPolling();
  if (state.awxPollHandle) { clearInterval(state.awxPollHandle); state.awxPollHandle = null; }

  // Cerrar terminales SSH/locales limpiamente — el canal seguiría vivo tras
  // el lock (no relee el secreto), pero dejar shells abiertas con el vault
  // "bloqueado" transmite una seguridad que no sería real. closeTab también
  // desconecta el PTY/SSH en el backend y quita listeners de resize.
  for (const terminalId of Object.keys(state.ctTerminalInstances || {})) {
    try { await closeTab(terminalId); } catch (e) { /* mejor esfuerzo: no bloquea el lock */ }
  }

  await window.corexAPI.vaultLock();

  // Limpiar del renderer todo lo que salió del vault descifrado.
  state.vaultUnlocked = false;
  state.vaultUnlockInput = '';
  state.vaultUnlockConfirm = '';
  state.config = { jira: {}, awx: {}, smtp: {}, lang: state.config.lang || 'en' };
  state.inboxIssues = [];
  state.jiraIssue = null;
  state.awxTemplates = [];
  state.awxRecentJobs = [];
  state.ctSessions = [];
  state.ctMacros = [];
  state.ticketLinks = {};
  state.automationTemplates = [];
  state.pendingAttachments = [];
  state.jiraMyself = null;
  state.vaultStats = null;
  state.vaultCreds = [];
  state.vaultCredRevealed = {};
  state.vaultCredForm = null;
  state.view = 'inbox'; // al re-desbloquear, arrancar en el Dashboard como un inicio normal

  renderApp();
  const reasons = {
    manual: 'Vault locked',
    idle: 'Vault auto-locked after inactivity',
    suspend: 'Vault locked — system suspended',
    'lock-screen': 'Vault locked — screen locked',
  };
  toast(reasons[reason] || 'Vault locked', 'ok');
}

async function changeVaultPassword() {
  if (state.vaultPwBusy) return;
  const cur = state.vaultPwCurrent;
  const nw = state.vaultPwNew;
  const cf = state.vaultPwConfirm;
  if (!nw || nw.length < 8) { toast('New master password must be at least 8 characters', 'err'); return; }
  if (nw !== cf) { toast('New password and confirmation do not match', 'err'); return; }
  state.vaultPwBusy = true;
  renderApp();
  const res = await window.corexAPI.vaultChangePassword(cur, nw);
  state.vaultPwBusy = false;
  if (res.ok) {
    state.vaultPwCurrent = '';
    state.vaultPwNew = '';
    state.vaultPwConfirm = '';
    toast('Master password changed', 'ok');
  } else {
    toast(res.error || 'Could not change master password', 'err');
  }
  renderApp();
}

// ═══════════════════════════════════════════════════════════════════════════
//  Profile — identidad propia, equipo y preferencias (vista 'profile')
// ═══════════════════════════════════════════════════════════════════════════

async function saveProfile(patch) {
  state.config.profile = Object.assign({}, state.config.profile || {}, patch);
  const merged = await window.corexAPI.setConfig({ profile: state.config.profile });
  if (merged && merged.profile) state.config = merged;
  renderApp();
}

function renderProfileView() {
  const prof = state.config.profile || {};
  const wrap = mk('div', { style: { maxWidth: '760px' } });

  const panel = (title, children) => {
    const p = mk('div', { style: { background: CX.bgPanel, border: `1px solid ${CX.borderSubtle}`, borderRadius: '10px', padding: '18px 20px', marginBottom: '16px' } });
    p.appendChild(mk('div', { style: { fontSize: '13.5px', fontWeight: '700', color: CX.textPrimary, marginBottom: '12px' } }, [title]));
    children.forEach((c) => c && p.appendChild(c));
    return p;
  };

  // ── Identidad: foto + nombre + rol ──
  const id = currentIdentity();
  const photoRow = mk('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px' } });
  photoRow.appendChild(renderAvatar(56));
  const photoBtns = mk('div', { style: { display: 'flex', gap: '8px' } });
  // input file oculto: la foto se guarda como data URL en el vault cifrado,
  // redimensionada a 96px para no engordar el vault con fotos de 5MB.
  const fileInput = mk('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  fileInput.onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 96;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        // recorte cuadrado centrado
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        saveProfile({ photoDataUrl: canvas.toDataURL('image/jpeg', 0.85) });
        toast('Photo updated', 'ok');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  };
  photoBtns.appendChild(fileInput);
  photoBtns.appendChild(mk('button', {
    style: { background: 'transparent', border: `1px solid ${CX.borderSubtle}`, color: CX.textPrimary, borderRadius: '6px', padding: '7px 14px', fontSize: '11.5px', cursor: 'pointer' },
    onclick: () => fileInput.click(),
  }, ['Change photo…']));
  if (prof.photoDataUrl) {
    photoBtns.appendChild(mk('button', {
      style: { background: 'transparent', border: `1px solid ${CX.borderSubtle}`, color: CX.textSecondary, borderRadius: '6px', padding: '7px 14px', fontSize: '11.5px', cursor: 'pointer' },
      onclick: () => saveProfile({ photoDataUrl: null }),
    }, ['Remove (use Jira avatar)']));
  }
  photoRow.appendChild(photoBtns);

  const field = (label, key, placeholder) => {
    const col = mk('div', { style: { marginBottom: '12px' } });
    col.appendChild(mk('label', { style: { fontSize: '10.5px', color: CX.textMuted, display: 'block', marginBottom: '3px' } }, [label]));
    col.appendChild(mk('input', {
      style: { width: '100%', maxWidth: '380px', background: CX.bgInput, border: `1px solid ${CX.borderSubtle}`, borderRadius: '6px', padding: '8px 10px', color: CX.textPrimary, fontSize: '12.5px' },
      type: 'text', placeholder: placeholder || '', value: prof[key] || '',
      'data-focus-key': `profile-${key}`,
      oninput: (e) => { state.config.profile = Object.assign({}, state.config.profile || {}, { [key]: e.target.value }); },
      onblur: () => saveProfile({}),
    }));
    return col;
  };

  wrap.appendChild(panel('Identity', [
    photoRow,
    mk('div', { style: { fontSize: '11px', color: CX.textMuted, marginBottom: '12px' } }, [
      'Leave fields empty to fall back to your Jira identity. Everything here is stored in your encrypted vault.',
    ]),
    field('Display name', 'displayName', id.displayName),
    field('Role / title', 'role', 'e.g. Systems Engineer — GITO'),
  ]));

  // ── Equipo (alimenta el filtro de Icinga) ──
  const teamBtn = (value, label) => mk('button', {
    style: {
      background: (prof.team || 'both') === value ? CX.textPrimary : 'transparent',
      color: (prof.team || 'both') === value ? '#0a0e15' : CX.textSecondary,
      border: `1px solid ${CX.borderSubtle}`, borderRadius: '6px', padding: '8px 18px',
      fontSize: '12px', fontWeight: '600', cursor: 'pointer',
    },
    onclick: () => { saveProfile({ team: value }); loadIcinga(); },
  }, [label]);
  wrap.appendChild(panel('Team', [
    mk('div', { style: { fontSize: '11.5px', color: CX.textMuted, marginBottom: '10px', lineHeight: '1.5' } }, [
      'Filters the Monitor view and the Monitoring widget to your team\'s hosts. The actual Icinga filter expressions per team are defined in Settings → Icinga.',
    ]),
    mk('div', { style: { display: 'flex', gap: '8px' } }, [
      teamBtn('linux', 'Linux'), teamBtn('windows', 'Windows'), teamBtn('both', 'Both'),
    ]),
  ]));

  // ── Tema ──
  wrap.appendChild(panel('Theme', [
    mk('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
      mk('button', {
        style: { background: CX.textPrimary, color: '#0a0e15', border: 'none', borderRadius: '6px', padding: '8px 18px', fontSize: '12px', fontWeight: '600', cursor: 'default' },
      }, ['Dark']),
      mk('button', {
        style: { background: 'transparent', color: CX.textMuted, border: `1px dashed ${CX.borderSubtle}`, borderRadius: '6px', padding: '8px 18px', fontSize: '12px', cursor: 'not-allowed' },
        title: 'Light theme llegará cuando el resto de vistas migren sus colores fijos a tokens (paso 1 del roadmap: modularización) — prometer un tema claro a medias sería peor que no tenerlo.',
      }, ['Light (coming soon)']),
    ]),
  ]));

  return wrap;
}

function renderVaultCredForm() {
  const f = state.vaultCredForm;
  const field = (label, key, opts = {}) => {
    const col = mk('div', { style: { marginBottom: '10px' } });
    col.appendChild(mk('label', { style: { fontSize: '10.5px', color: CX.textMuted, display: 'block', marginBottom: '3px' } }, [label]));
    col.appendChild(mk('input', {
      style: {
        width: '100%', background: CX.bgInput, border: `1px solid ${CX.borderSubtle}`,
        borderRadius: '6px', padding: '8px 10px', color: CX.textPrimary, fontSize: '12px',
      },
      type: opts.type || 'text', placeholder: opts.placeholder || '', value: f[key] || '',
      'data-focus-key': `vault-cred-${key}`,
      oninput: (e) => { f[key] = e.target.value; },
    }));
    return col;
  };
  const box = mk('div', {
    style: { border: `1px solid ${CX.borderSubtle}`, borderRadius: '10px', padding: '14px', background: CX.bgPanelAlt },
  });
  box.appendChild(mk('div', { style: { fontSize: '12px', fontWeight: '700', color: CX.textPrimary, marginBottom: '10px' } }, [f.id ? `Edit: ${f.name}` : 'New credential']));
  box.appendChild(field('Name *', 'name', { placeholder: 'e.g. vCenter EU admin' }));
  box.appendChild(field('Username', 'username', { placeholder: 'optional' }));
  box.appendChild(field('URL / Host', 'url', { placeholder: 'optional' }));
  box.appendChild(field(f.id ? 'Secret (leave empty to keep current)' : 'Secret *', 'secret', { type: 'password' }));
  box.appendChild(field('Notes', 'notes', { placeholder: 'optional' }));
  box.appendChild(mk('div', { style: { display: 'flex', gap: '8px', marginTop: '4px' } }, [
    mk('button', {
      style: { background: CX.textPrimary, color: '#0a0e15', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
      onclick: saveVaultCred,
    }, ['Save encrypted']),
    mk('button', {
      style: { background: 'transparent', color: CX.textSecondary, border: `1px solid ${CX.borderSubtle}`, borderRadius: '6px', padding: '8px 16px', fontSize: '12px', cursor: 'pointer' },
      onclick: () => { state.vaultCredForm = null; renderApp(); },
    }, ['Cancel']),
  ]));
  return box;
}

function renderVaultView() {
  const wrap = mk('div', { style: { maxWidth: '860px' } });

  const panel = (title, children) => {
    const p = mk('div', {
      style: {
        background: CX.bgPanel, border: `1px solid ${CX.borderSubtle}`, borderRadius: '10px',
        padding: '18px 20px', marginBottom: '16px',
      },
    });
    p.appendChild(mk('div', { style: { fontSize: '13.5px', fontWeight: '700', color: CX.textPrimary, marginBottom: '12px' } }, [title]));
    children.forEach((c) => c && p.appendChild(c));
    return p;
  };

  const kv = (k, v, vColor) => mk('div', {
    style: { display: 'flex', justifyContent: 'space-between', gap: '20px', padding: '6px 0', borderBottom: '1px solid #121a22', fontSize: '12px' },
  }, [
    mk('span', { style: { color: CX.textMuted } }, [k]),
    mk('span', { style: { color: vColor || CX.textPrimary, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: '11.5px', wordBreak: 'break-all' } }, [String(v)]),
  ]);

  // ── Estado + acciones principales ──
  const sshActive = Object.values(state.ctTerminalInstances || {}).filter((i) => i.connected).length;
  wrap.appendChild(panel('Status', [
    mk('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' } }, [
      mk('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: CX.green, boxShadow: `0 0 6px ${CX.green}`, display: 'inline-block' } }),
      mk('span', { style: { fontSize: '13px', fontWeight: '600', color: CX.green } }, ['Unlocked']),
      mk('span', { style: { fontSize: '11px', color: CX.textMuted } }, ['— decrypted in memory only; the file on disk stays encrypted at all times']),
    ]),
    mk('button', {
      style: {
        background: 'transparent', border: `1px solid ${CX.amber}`, color: CX.amber,
        borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
      },
      onclick: lockVaultNow,
    }, ['🔒 Lock vault now' + (sshActive > 0 ? ` (disconnects ${sshActive} SSH)` : '')]),
  ]));

  // ── Inventario ──
  if (state.vaultStatsError) {
    wrap.appendChild(panel('Contents', [
      mk('div', { style: { fontSize: '12px', color: CX.red } }, [state.vaultStatsError]),
    ]));
  } else if (!state.vaultStats) {
    wrap.appendChild(panel('Contents', [
      mk('div', { style: { fontSize: '12px', color: CX.textMuted } }, ['Loading vault inventory…']),
    ]));
  } else {
    const s = state.vaultStats;
    const c = s.contents;
    const yesNo = (b) => (b ? 'Configured' : 'Not configured');
    const yesNoColor = (b) => (b ? CX.green : CX.textMuted);
    wrap.appendChild(panel('Contents', [
      kv('Jira credentials', yesNo(c.jiraConfigured), yesNoColor(c.jiraConfigured)),
      kv('AWX credentials', yesNo(c.awxConfigured), yesNoColor(c.awxConfigured)),
      kv('SMTP credentials', yesNo(c.smtpConfigured), yesNoColor(c.smtpConfigured)),
      kv('SSH sessions', c.sshSessions + (c.sshSessionsMissingSecret > 0 ? `  (${c.sshSessionsMissingSecret} missing secret)` : ''), c.sshSessionsMissingSecret > 0 ? CX.amber : undefined),
      kv('Terminal macros', c.macros),
      kv('Automation templates', c.automationTemplates),
      kv('Ticket ↔ template links', c.ticketLinks),
      kv('Pending attachments', c.pendingAttachments),
      kv('Favorite AWX templates', c.favoriteTemplates),
      kv('Custom credentials', c.customCredentials || 0),
    ]));

    wrap.appendChild(panel('Encryption', [
      kv('Cipher', s.crypto.cipher),
      kv('Key derivation', s.crypto.kdf),
      s.file ? kv('File', s.file.path) : null,
      s.file ? kv('Size on disk', `${(s.file.sizeBytes / 1024).toFixed(1)} KB`) : null,
      s.file ? kv('Last modified', new Date(s.file.modifiedAt).toLocaleString()) : null,
      mk('div', { style: { fontSize: '11px', color: CX.textMuted, marginTop: '10px', lineHeight: '1.5' } }, [
        'Writes are atomic (temp file + rename): a crash mid-write can never corrupt the previous vault.',
      ]),
    ].filter(Boolean)));
  }

  // ── Auto-lock ──
  wrap.appendChild(panel('Auto-lock', [
    mk('div', { style: { fontSize: '11.5px', color: CX.textMuted, marginBottom: '10px', lineHeight: '1.5' } }, [
      'The vault locks itself after this many minutes without keyboard/mouse activity, and always when the system suspends or the screen locks. Set 0 to disable idle lock (power events still lock).',
    ]),
    mk('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
      mk('input', {
        style: {
          width: '90px', background: CX.bgInput, border: `1px solid ${CX.borderSubtle}`,
          borderRadius: '6px', padding: '8px 10px', color: CX.textPrimary, fontSize: '13px',
          fontFamily: "'IBM Plex Mono', monospace",
        },
        type: 'number', min: '0', max: '480',
        value: String(autoLockMinutes()),
        'data-focus-key': 'vault-autolock-min',
        oninput: (e) => { state._autoLockDraft = e.target.value; },
      }),
      mk('span', { style: { fontSize: '12px', color: CX.textSecondary } }, ['minutes']),
      mk('button', {
        style: {
          background: 'transparent', border: `1px solid ${CX.borderSubtle}`, color: CX.textPrimary,
          borderRadius: '6px', padding: '7px 14px', fontSize: '11.5px', cursor: 'pointer',
        },
        onclick: async () => {
          const v = Math.max(0, Math.min(480, Number(state._autoLockDraft ?? autoLockMinutes()) || 0));
          const merged = await window.corexAPI.setConfig({ autoLockMinutes: v });
          if (merged && merged.autoLockMinutes !== undefined) state.config = merged;
          toast(v === 0 ? 'Idle auto-lock disabled' : `Auto-lock set to ${v} minutes`, 'ok');
          renderApp();
        },
      }, ['Save']),
    ]),
  ]));

  // ── Cambio de Master Password ──
  const pwField = (label, key, focusKey) => {
    const col = mk('div', { style: { marginBottom: '12px' } });
    col.appendChild(mk('label', { style: { fontSize: '11px', color: CX.textMuted, display: 'block', marginBottom: '4px' } }, [label]));
    col.appendChild(mk('input', {
      style: {
        width: '100%', maxWidth: '380px', background: CX.bgInput, border: `1px solid ${CX.borderSubtle}`,
        borderRadius: '6px', padding: '9px 12px', color: CX.textPrimary, fontSize: '13px',
      },
      type: 'password',
      value: state[key],
      'data-focus-key': focusKey,
      oninput: (e) => { state[key] = e.target.value; },
    }));
    return col;
  };

  // ── Gestor de credenciales cifradas ──
  wrap.appendChild(panel('Credentials', [
    mk('div', { style: { fontSize: '11.5px', color: CX.textMuted, marginBottom: '12px', lineHeight: '1.5' } }, [
      'Named secrets (device passwords, API tokens, keys…) stored inside the same AES-256-GCM encrypted vault. Secrets are never listed — only revealed or copied on demand.',
    ]),
    ...state.vaultCreds.map((c) => {
      const revealed = state.vaultCredRevealed[c.id];
      const row = mk('div', {
        style: {
          border: `1px solid ${CX.borderSubtle}`, borderRadius: '10px', padding: '10px 12px',
          marginBottom: '8px', background: CX.bgPanelAlt,
        },
      });
      row.appendChild(mk('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
        mk('span', { style: { fontSize: '12.5px', fontWeight: '700', color: CX.textPrimary } }, [c.name]),
        c.username ? mk('span', { style: { fontSize: '10.5px', color: CX.textMuted } }, [c.username]) : null,
        c.url ? mk('span', { style: { fontSize: '10.5px', color: CX.blue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' } }, [c.url]) : null,
        mk('span', { style: { flex: '1' } }),
        mk('span', {
          style: { fontSize: '10.5px', color: CX.textSecondary, cursor: 'pointer', padding: '2px 6px' },
          onclick: () => toggleRevealCred(c.id), title: revealed !== undefined ? 'Hide' : 'Reveal secret',
        }, [revealed !== undefined ? '🙈 Hide' : '👁 Reveal']),
        mk('span', {
          style: { fontSize: '10.5px', color: CX.textSecondary, cursor: 'pointer', padding: '2px 6px' },
          onclick: () => copyCredSecret(c.id), title: 'Copy secret to clipboard',
        }, ['⧉ Copy']),
        mk('span', {
          style: { fontSize: '10.5px', color: CX.textSecondary, cursor: 'pointer', padding: '2px 6px' },
          onclick: () => { state.vaultCredForm = { id: c.id, name: c.name, username: c.username, url: c.url, secret: '', notes: c.notes }; renderApp(); },
        }, ['✎ Edit']),
        mk('span', {
          style: { fontSize: '10.5px', color: CX.red, cursor: 'pointer', padding: '2px 6px' },
          onclick: () => deleteVaultCred(c.id, c.name),
        }, ['🗑']),
      ].filter(Boolean)));
      row.appendChild(mk('div', {
        style: {
          fontSize: '11.5px', fontFamily: "'IBM Plex Mono', monospace", marginTop: '6px',
          color: revealed !== undefined ? CX.amber : CX.textMuted, wordBreak: 'break-all',
          userSelect: revealed !== undefined ? 'text' : 'none',
        },
      }, [revealed !== undefined ? revealed : '•'.repeat(Math.min(24, Math.max(8, c.secretLength)))]));
      if (c.notes) row.appendChild(mk('div', { style: { fontSize: '10.5px', color: CX.textMuted, marginTop: '4px' } }, [c.notes]));
      return row;
    }),
    state.vaultCreds.length === 0 && !state.vaultCredForm
      ? mk('div', { style: { fontSize: '11.5px', color: CX.textMuted, marginBottom: '10px' } }, ['No credentials stored yet.'])
      : null,
    state.vaultCredForm ? renderVaultCredForm() : mk('button', {
      style: {
        background: 'transparent', border: `1px dashed ${CX.borderSubtle}`, color: CX.textMuted,
        borderRadius: '10px', padding: '9px', fontSize: '11.5px', cursor: 'pointer', width: '100%',
      },
      onclick: () => { state.vaultCredForm = { name: '', username: '', url: '', secret: '', notes: '' }; renderApp(); },
    }, ['+ Add credential']),
  ].filter(Boolean)));

  wrap.appendChild(panel('Change master password', [
    mk('div', { style: { fontSize: '11.5px', color: CX.textMuted, marginBottom: '14px', lineHeight: '1.5' } }, [
      'Re-encrypts the vault with a new key derived from the new password (fresh salt). The change is atomic: if anything fails, the previous vault stays intact.',
    ]),
    pwField('Current master password', 'vaultPwCurrent', 'vault-pw-current'),
    pwField('New master password (min. 8 characters)', 'vaultPwNew', 'vault-pw-new'),
    pwField('Confirm new master password', 'vaultPwConfirm', 'vault-pw-confirm-new'),
    mk('button', {
      style: {
        background: state.vaultPwBusy ? CX.bgPanelAlt : CX.textPrimary,
        color: state.vaultPwBusy ? CX.textMuted : '#0a0e15',
        border: 'none', borderRadius: '6px', padding: '9px 18px', fontSize: '12.5px',
        fontWeight: '700', cursor: state.vaultPwBusy ? 'default' : 'pointer', marginTop: '4px',
      },
      onclick: changeVaultPassword,
    }, [state.vaultPwBusy ? 'Re-encrypting…' : 'Change password']),
  ]));

  return wrap;
}

function renderSettingsView() {
  const wrap = mk('div', {});

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
    awxFields.push(mk('p', { style: { fontSize: '11px', color: '#8a96a3', marginTop: '-6px', marginBottom: '4px' } }, [t('settings_awx_basic_note')]));
  } else {
    awxFields.push(settingsField(t('settings_awx_token'), state.config.awx.token, (v) => (state.config.awx.token = v), { type: 'password', placeholder: t('settings_awx_token_placeholder') }));
  }

  wrap.appendChild(settingsSection(t('settings_awx_title'), awxFields));

  state.config.jira.authType = state.config.jira.authType || 'bearer';

  const jiraFields = [
    settingsField(t('settings_awx_url'), state.config.jira.url, (v) => (state.config.jira.url = v), {
      placeholder: t('settings_jira_url_placeholder'),
    }),
    mk('p', { style: { fontSize: '11px', color: '#8a96a3', marginTop: '-6px', marginBottom: '10px' } }, [t('settings_jira_url_note')]),
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
    jiraFields.push(mk('p', { style: { fontSize: '11px', color: '#8a96a3', marginTop: '-6px' } }, [t('settings_jira_pat_note')]));
  }

  wrap.appendChild(settingsSection(t('settings_jira_title'), jiraFields));

  wrap.appendChild(settingsSection(t('settings_smtp_title'), [
    settingsField(t('settings_smtp_host'), state.config.smtp.host, (v) => (state.config.smtp.host = v), { placeholder: 'smtp.yourcompany.com' }),
    settingsField(t('settings_smtp_port'), state.config.smtp.port, (v) => (state.config.smtp.port = Number(v) || v), { placeholder: '587' }),
    settingsField(t('settings_smtp_user'), state.config.smtp.user, (v) => (state.config.smtp.user = v)),
    settingsField(t('settings_smtp_pass'), state.config.smtp.pass, (v) => (state.config.smtp.pass = v), { type: 'password' }),
    settingsField(t('settings_smtp_from'), state.config.smtp.from, (v) => (state.config.smtp.from = v), { placeholder: 'automation@yourcompany.com' }),
  ]));

  // ── Icinga (monitorización) — fase 1: lectura ──
  state.config.icinga = state.config.icinga || {};
  const icg = state.config.icinga;
  wrap.appendChild(settingsSection('Icinga', [
    settingsField('API URL', icg.url || '', (v) => { icg.url = v; }, { placeholder: 'https://icinga.example.net:5665' }),
    settingsField('API user', icg.username || '', (v) => { icg.username = v; }),
    settingsField('API password', icg.password || '', (v) => { icg.password = v; }, { type: 'password' }),
    settingsField('Web URL (for "open in Icinga" links)', icg.webUrl || '', (v) => { icg.webUrl = v; }, { placeholder: 'https://icinga.example.net/icingaweb2' }),
    // Filtros por equipo (expresiones de filtro de la API de Icinga). El
    // equipo activo se elige en tu Perfil (Linux / Windows / Both) y COREX
    // aplica el filtro correspondiente a hosts y servicios. Vacío = sin filtro.
    settingsField('Linux team filter (Icinga filter expr.)', icg.linuxFilter || '', (v) => { icg.linuxFilter = v; }, { placeholder: '"linux-servers" in host.groups' }),
    settingsField('Windows team filter (Icinga filter expr.)', icg.windowsFilter || '', (v) => { icg.windowsFilter = v; }, { placeholder: '"windows-servers" in host.groups' }),
    renderCheckbox(icg.verifySsl !== false, (e) => { icg.verifySsl = e.target.checked; renderApp(); }, mk('span', { style: { fontSize: '12px', color: '#eef2f5' } }, ['Verify SSL certificate (disable for internal CAs)'])),
  ]));

  wrap.appendChild(mk('button', {
    style: { background: '#eef2f5', color: '#0a0e15', border: 'none', borderRadius: '6px', padding: '10px 22px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
    onclick: () => saveSettings(),
  }, [t('settings_save')]));

  // Sección de diagnóstico — muestra la ruta del directorio de logs para
  // que el usuario pueda encontrar los archivos cuando necesite depurar
  // algo que ocurrió mientras no estaba mirando la pantalla.
  const diagSection = mk('div', { style: { marginTop: '32px', paddingTop: '20px', borderTop: '1px solid #1b2530' } });
  diagSection.appendChild(mk('div', { style: { fontSize: '11px', fontWeight: '700', color: '#8a96a3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' } }, ['Diagnostics']));
  window.corexAPI.getLogDir().then((logPath) => {
    if (!logPath) return;
    const row = mk('div', { style: { fontSize: '12px', color: '#aab6c3' } }, [
      'Log files: ',
      mk('span', { style: { color: '#38bdf8', fontFamily: 'monospace', fontSize: '11.5px' } }, [logPath]),
    ]);
    diagSection.appendChild(row);
  });
  wrap.appendChild(diagSection);

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

// Polling de la lista de tickets de Jira (Inbox y vista Jira comparten los
// mismos datos: state.inboxIssues), cada 15s mientras esa vista esté activa.
function startJiraListPolling() {
  stopJiraListPolling();
  state.jiraListPollHandle = setInterval(refreshInboxSilently, 15000);
}

// Umbral de fallos de red consecutivos antes de considerar la conexión
// realmente perdida (no solo un timeout puntual, que es ruido normal).
const NETWORK_FAILURE_THRESHOLD = 3;

// Punto único que registra el resultado de cada ciclo de polling — éxito
// resetea el contador del canal a 0, fallo de red lo incrementa. Cuando un
// canal cruza el umbral, se refleja en connectionLostBanner; cuando vuelve
// a tener éxito, desaparece de ahí automáticamente.
function trackConnectivity(channel, res) {
  if (res.ok) {
    state.consecutiveNetworkFailures[channel] = 0;
  } else if (res.isNetworkError) {
    state.consecutiveNetworkFailures[channel]++;
  }
  // isAuthError no cuenta aquí — eso ya tiene su propio aviso (toast +
  // parar el polling) y no es "sin conexión", es "credenciales caducadas
  // con conexión perfectamente viva".

  const jiraDown = state.consecutiveNetworkFailures.jira >= NETWORK_FAILURE_THRESHOLD;
  const awxDown = state.consecutiveNetworkFailures.awx >= NETWORK_FAILURE_THRESHOLD;
  if (jiraDown && awxDown) state.connectionLostBanner = 'both';
  else if (jiraDown) state.connectionLostBanner = 'jira';
  else if (awxDown) state.connectionLostBanner = 'awx';
  else state.connectionLostBanner = null;
}

function stopJiraListPolling() {
  if (state.jiraListPollHandle) {
    clearInterval(state.jiraListPollHandle);
    state.jiraListPollHandle = null;
  }
}

// Polling de AWX (templates + jobs recientes), cada 15s mientras la vista
// AWX esté activa.
function startAwxListPolling() {
  stopAwxListPolling();
  state.awxListPollHandle = setInterval(() => {
    refreshAwxTemplatesSilently();
    refreshAwxRecentJobsSilently();
  }, 15000);
}

function stopAwxListPolling() {
  if (state.awxListPollHandle) {
    clearInterval(state.awxListPollHandle);
    state.awxListPollHandle = null;
  }
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
  if (pct >= 85) return '#ef4444';
  if (pct >= 60) return '#f59e0b';
  return '#22c55e';
}

function renderHwBar(label, pct, sublabel) {
  const safePct = Math.max(0, Math.min(100, pct || 0));
  const color = hwBarColor(safePct);
  const row = mk('div', { style: { marginBottom: '12px' } });
  row.appendChild(mk('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#8a96a3', marginBottom: '4px' } }, [
    mk('span', {}, [label]),
    mk('span', { style: { color: '#eef2f5', fontWeight: '600' } }, [sublabel != null ? sublabel : `${safePct.toFixed(0)}%`]),
  ]));
  row.appendChild(mk('div', { style: { background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', height: '8px', overflow: 'hidden' } }, [
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
    { from: 0, to: 60, color: '#15803d' },
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
  const wrap = mk('div', { style: { background: CX.bgPanel, border: `1px solid ${CX.borderSubtle}`, borderRadius: '10px', padding: '20px', marginBottom: '20px' } });
  wrap.appendChild(mk('div', { style: { fontSize: '13.5px', fontWeight: '700', color: CX.textPrimary, marginBottom: '14px' } }, [t('hw_title')]));

  if (state.hwError) {
    wrap.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#ef4444' } }, [`${t('hw_error')} ${state.hwError}`]));
    return wrap;
  }
  if (!state.hwMetrics) {
    wrap.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#8a96a3' } }, [t('hw_loading')]));
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
    wrap.appendChild(mk('div', { style: { fontSize: '11px', color: '#8a96a3', textAlign: 'center', marginTop: '-12px', marginBottom: '12px' } }, [t('hw_no_battery')]));
  }

  // ── Discos / Red / Top procesos, en 2 columnas ──
  const grid = mk('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', borderTop: '1px solid #1b2530', paddingTop: '16px' } });

  const leftCol = mk('div', {});
  leftCol.appendChild(mk('div', { style: { fontSize: '10px', color: '#8a96a3', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' } }, [t('hw_disks')]));
  (m.disks || []).slice(0, 4).forEach((d) => {
    leftCol.appendChild(renderHwBar(d.mount, d.use, `${formatBytes(d.used)} / ${formatBytes(d.size)}`));
  });
  leftCol.appendChild(mk('div', { style: { fontSize: '10px', color: '#8a96a3', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px', marginTop: '4px' } }, [t('hw_network')]));
  leftCol.appendChild(mk('div', { style: { fontSize: '12px', color: '#eef2f5' } }, [
    `↓ ${formatBytes(m.net.rx_sec)}/s   ↑ ${formatBytes(m.net.tx_sec)}/s`,
  ]));

  const rightCol = mk('div', {});
  rightCol.appendChild(mk('div', { style: { fontSize: '10px', color: '#8a96a3', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' } }, [t('hw_top_processes')]));
  (m.topProcesses || []).slice(0, 6).forEach((p) => {
    rightCol.appendChild(mk('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#eef2f5', padding: '3px 0' } }, [
      mk('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' } }, [p.name]),
      mk('span', { style: { color: '#8a96a3' } }, [`${p.cpu.toFixed(1)}%`]),
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
  await refreshInboxSilently();
  state.inboxLoading = false;
  renderApp();
}

// Igual que loadInbox pero sin tocar inboxLoading — usado por el polling de
// 15s para refrescar la lista en vivo sin que parpadee a "Loading..." cada
// vez, que sería molesto si la lista ya está visible y solo cambió algo
// (p.ej. un ticket que tú cerraste desde Jira directamente).
async function refreshInboxSilently() {
  if (!state.config.jira || !state.config.jira.url) return;
  const res = await window.corexAPI.jiraSearchMyIssues();
  trackConnectivity('jira', res);
  if (!res.ok) {
    state.inboxError = res.error;
    if (res.isAuthError) {
      stopJiraListPolling();
      toast('Jira authentication failed — check your credentials in Settings', 'err');
    }
  } else {
    state.inboxIssues = res.issues;
    state.slaAvailable = !!res.slaAvailable;
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
  if (name.includes('highest') || name.includes('critical')) return '#ef4444';
  if (name.includes('high')) return '#f59e0b';
  if (name.includes('medium')) return '#f59e0b';
  return '#8a96a3';
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

// renderTopTicketsSection (las 3 tarjetas "Top priority" del Dashboard
// antiguo) fue reemplazada por renderMyWorkSection — la tabla estilo
// Cockpit con prioridad, estado y automatización vinculada.

// ═══════════════════════════════════════════════════════════════════════════
//  Cockpit — sistema de widgets + workspaces
// ═══════════════════════════════════════════════════════════════════════════
// DASH_WIDGETS es el catálogo: cada widget declara cómo se llama, en qué
// zona vive ('kpi' = tarjeta de la fila superior, 'section' = panel ancho)
// y qué función lo renderiza. Añadir un widget nuevo al catálogo basta para
// que aparezca en el picker de "+ Add Widget" — no hay que tocar nada más.
const DASH_WIDGETS = {
  'kpi.myFocus':        { zone: 'kpi', label: 'My Focus',        render: () => renderKpiMyFocus() },
  'kpi.slaAtRisk':      { zone: 'kpi', label: 'SLA At Risk',     render: () => renderKpiSlaAtRisk() },
  'kpi.openTickets':    { zone: 'kpi', label: 'Open Tickets',    render: () => renderKpiOpenTickets() },
  'kpi.automations':    { zone: 'kpi', label: 'Automations',     render: () => renderKpiAutomations() },
  'kpi.systemHealth':   { zone: 'kpi', label: 'System Health',   render: () => renderKpiSystemHealth() },
  'kpi.activeSessions': { zone: 'kpi', label: 'Active Sessions', render: () => renderKpiActiveSessions() },
  'section.myWork':     { zone: 'section', label: 'My Work (tickets table)', render: () => renderMyWorkSection() },
  'section.recentJobs': { zone: 'section', label: 'Recent AWX Jobs', render: () => renderRecentJobsSection() },
  'section.hardware':   { zone: 'section', label: 'This machine (gauges)', render: () => renderHardwareSection() },
  'section.charts':     { zone: 'section', label: 'CPU & Memory over time', render: () => renderHwChartsSection() },
  'kpi.monitoring':     { zone: 'kpi', label: 'Monitoring (Icinga)', render: () => renderKpiMonitoring() },
  'section.icingaProblems': { zone: 'section', label: 'Monitoring — top problems (Icinga)', render: () => renderIcingaProblemsSection() },
};

// El workspace por defecto replica el cockpit del mockup.
function defaultDashWorkspaces() {
  return [{
    id: 'ws-operations',
    name: 'operations',
    widgets: ['kpi.myFocus', 'kpi.slaAtRisk', 'kpi.automations', 'kpi.systemHealth', 'kpi.activeSessions',
              'section.myWork', 'section.hardware', 'section.charts'],
  }];
}

function ensureDashWorkspaces() {
  if (!state.dashWorkspaces) {
    state.dashWorkspaces = (state.config.dashWorkspaces && state.config.dashWorkspaces.length)
      ? state.config.dashWorkspaces
      : defaultDashWorkspaces();
    state.activeDashWorkspaceId = state.config.activeDashWorkspaceId || state.dashWorkspaces[0].id;
  }
  // Si el activo apunta a un workspace borrado, caer al primero.
  if (!state.dashWorkspaces.find((w) => w.id === state.activeDashWorkspaceId)) {
    state.activeDashWorkspaceId = state.dashWorkspaces[0].id;
  }
  return state.dashWorkspaces.find((w) => w.id === state.activeDashWorkspaceId);
}

// Persistir en el vault. Silencioso: los cambios de layout no merecen toast.
// Defensivo: solo adoptamos la respuesta como nueva config si realmente
// parece la config fusionada (config:set devuelve el objeto completo) — si
// algo devolviera otra cosa, conservar el estado local vale más que
// machacar state.config entero.
async function persistDashWorkspaces() {
  const merged = await window.corexAPI.setConfig({
    dashWorkspaces: state.dashWorkspaces,
    activeDashWorkspaceId: state.activeDashWorkspaceId,
  });
  if (merged && Array.isArray(merged.dashWorkspaces)) state.config = merged;
}

function addWidgetToActive(widgetId) {
  const ws = ensureDashWorkspaces();
  if (!ws.widgets.includes(widgetId)) {
    ws.widgets.push(widgetId);
    persistDashWorkspaces();
  }
  state.dashAddWidgetOpen = false;
  renderApp();
}

function removeWidgetFromActive(widgetId) {
  const ws = ensureDashWorkspaces();
  ws.widgets = ws.widgets.filter((w) => w !== widgetId);
  persistDashWorkspaces();
  renderApp();
}

function switchDashWorkspace(id) {
  state.activeDashWorkspaceId = id;
  state.dashWorkspaceMenuOpen = false;
  persistDashWorkspaces();
  renderApp();
}

function createDashWorkspace() {
  const name = window.prompt('Name for the new workspace (it will start as a copy of the current one):');
  if (!name || !name.trim()) return;
  const ws = ensureDashWorkspaces();
  const nw = { id: `ws-${Date.now()}`, name: name.trim(), widgets: ws.widgets.slice() };
  state.dashWorkspaces.push(nw);
  state.activeDashWorkspaceId = nw.id;
  state.dashWorkspaceMenuOpen = false;
  persistDashWorkspaces();
  renderApp();
}

function renameDashWorkspace(id) {
  const ws = state.dashWorkspaces.find((w) => w.id === id);
  if (!ws) return;
  const name = window.prompt('New name for this workspace:', ws.name);
  if (!name || !name.trim()) return;
  ws.name = name.trim();
  persistDashWorkspaces();
  renderApp();
}

function deleteDashWorkspace(id) {
  if (state.dashWorkspaces.length <= 1) { toast('You need at least one workspace', 'err'); return; }
  const ws = state.dashWorkspaces.find((w) => w.id === id);
  if (!ws) return;
  if (!window.confirm(`Delete workspace "${ws.name}"?`)) return;
  state.dashWorkspaces = state.dashWorkspaces.filter((w) => w.id !== id);
  if (state.activeDashWorkspaceId === id) state.activeDashWorkspaceId = state.dashWorkspaces[0].id;
  persistDashWorkspaces();
  renderApp();
}

function renderInboxView() {
  const ws = ensureDashWorkspaces();
  const wrap = mk('div', { style: { maxWidth: '1400px' } });

  // ── Barra del workspace: selector + acciones ──
  wrap.appendChild(renderWorkspaceBar(ws));

  // ── Zona KPI: tarjetas del workspace activo + "+ Add Widget" ──
  wrap.appendChild(renderKpiZone(ws));

  // ── Zona de secciones: paneles anchos en el orden del workspace ──
  ws.widgets.filter((id) => DASH_WIDGETS[id] && DASH_WIDGETS[id].zone === 'section').forEach((id) => {
    const node = DASH_WIDGETS[id].render();
    if (node) wrap.appendChild(wrapRemovableSection(node, id));
  });

  return wrap;
}

// Barra superior del Dashboard: "Workspace: <nombre> ⌄" con menú para
// cambiar/crear/renombrar/borrar. Es la contraparte funcional del
// "Workspace: operations" de la status bar del mockup.
function renderWorkspaceBar(ws) {
  const bar = mk('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', position: 'relative' } });
  bar.appendChild(mk('span', { style: { fontSize: '11px', color: CX.textMuted } }, ['Workspace:']));
  bar.appendChild(mk('button', {
    style: {
      display: 'flex', alignItems: 'center', gap: '6px', background: CX.bgPanelAlt,
      border: `1px solid ${CX.borderSubtle}`, borderRadius: '6px', padding: '5px 12px',
      color: CX.textPrimary, fontSize: '12px', fontWeight: '600', cursor: 'pointer',
    },
    onclick: () => { state.dashWorkspaceMenuOpen = !state.dashWorkspaceMenuOpen; state.dashAddWidgetOpen = false; renderApp(); },
  }, [ws.name, mk('span', { style: { fontSize: '9px', color: CX.textMuted } }, ['▼'])]));

  if (state.dashWorkspaceMenuOpen) {
    const menu = mk('div', {
      style: {
        position: 'absolute', top: '34px', left: '70px', zIndex: '50', minWidth: '240px',
        background: CX.bgPanelAlt, border: `1px solid ${CX.borderSubtle}`, borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden',
      },
    });
    state.dashWorkspaces.forEach((w) => {
      const active = w.id === state.activeDashWorkspaceId;
      menu.appendChild(mk('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px',
          fontSize: '12px', cursor: 'pointer', color: active ? CX.green : CX.textPrimary,
          background: active ? 'rgba(34,197,94,.08)' : 'transparent',
        },
      }, [
        mk('span', { style: { flex: '1' }, onclick: () => switchDashWorkspace(w.id) }, [w.name]),
        mk('span', {
          style: { fontSize: '10px', color: CX.textMuted, cursor: 'pointer', padding: '2px 4px' },
          title: 'Rename', onclick: (e) => { e.stopPropagation(); renameDashWorkspace(w.id); },
        }, ['✎']),
        mk('span', {
          style: { fontSize: '10px', color: CX.textMuted, cursor: 'pointer', padding: '2px 4px' },
          title: 'Delete', onclick: (e) => { e.stopPropagation(); deleteDashWorkspace(w.id); },
        }, ['🗑']),
      ]));
    });
    menu.appendChild(mk('div', {
      style: {
        padding: '9px 12px', fontSize: '12px', color: CX.blue, cursor: 'pointer',
        borderTop: `1px solid ${CX.borderSubtle}`,
      },
      onclick: createDashWorkspace,
    }, ['+ New workspace (copies current layout)']));
    bar.appendChild(menu);
  }
  return bar;
}

// Envuelve un panel de sección con un ✕ discreto (aparece al pasar el
// ratón) para quitarlo del workspace sin menús intermedios.
function wrapRemovableSection(node, widgetId) {
  const holder = mk('div', { style: { position: 'relative' } });
  const x = mk('span', {
    style: {
      position: 'absolute', top: '10px', right: '12px', zIndex: '5', fontSize: '13px',
      color: CX.textMuted, cursor: 'pointer', opacity: '0', transition: 'opacity .15s',
      padding: '2px 6px',
    },
    title: 'Remove widget from this workspace',
    onclick: () => removeWidgetFromActive(widgetId),
  }, ['✕']);
  holder.onmouseenter = () => { x.style.opacity = '1'; };
  holder.onmouseleave = () => { x.style.opacity = '0'; };
  holder.appendChild(node);
  holder.appendChild(x);
  return holder;
}

function renderKpiZone(ws) {
  const kpiIds = ws.widgets.filter((id) => DASH_WIDGETS[id] && DASH_WIDGETS[id].zone === 'kpi');
  // minmax(170px) + tarjetas compactas: 5 KPIs + Add Widget caben en una
  // sola fila a 1400px de ancho útil, como en el mockup.
  const row = mk('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '20px', position: 'relative' },
  });
  kpiIds.forEach((id) => {
    const card = DASH_WIDGETS[id].render();
    if (!card) return;
    // ✕ para quitar la tarjeta, visible al hover — mismo patrón que secciones.
    const x = mk('span', {
      style: {
        position: 'absolute', top: '8px', right: '10px', fontSize: '12px', color: CX.textMuted,
        cursor: 'pointer', opacity: '0', transition: 'opacity .15s', zIndex: '3',
      },
      title: 'Remove widget from this workspace',
      onclick: (e) => { e.stopPropagation(); removeWidgetFromActive(id); },
    }, ['✕']);
    card.style.position = 'relative';
    card.onmouseenter = () => { x.style.opacity = '1'; };
    card.onmouseleave = () => { x.style.opacity = '0'; };
    card.appendChild(x);
    row.appendChild(card);
  });

  // "+ Add Widget" — siempre interactivo: el menú lista TODO el catálogo,
  // con ✓ para los que ya están (clic = quitar) y ＋ para los que faltan
  // (clic = añadir). Antes, con el workspace completo el botón quedaba
  // inerte y parecía roto — exactamente lo que reportó el usuario.
  const addCard = mk('div', {
    style: {
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
      border: `1px dashed ${CX.borderSubtle}`, borderRadius: '10px', color: CX.textMuted,
      cursor: 'pointer', fontSize: '12px', minHeight: '96px',
      background: 'transparent', position: 'relative',
    },
    title: 'Add or remove widgets on this workspace',
    onclick: () => {
      state.dashAddWidgetOpen = !state.dashAddWidgetOpen;
      state.dashWorkspaceMenuOpen = false;
      renderApp();
    },
  }, ['+ Add Widget']);
  if (state.dashAddWidgetOpen) {
    const menu = mk('div', {
      style: {
        position: 'absolute', top: '100%', right: '0', marginTop: '6px', zIndex: '50', minWidth: '280px',
        background: CX.bgPanelAlt, border: `1px solid ${CX.borderSubtle}`, borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden',
      },
    });
    Object.keys(DASH_WIDGETS).forEach((id) => {
      const onBoard = ws.widgets.includes(id);
      menu.appendChild(mk('div', {
        style: {
          padding: '9px 12px', fontSize: '12px', cursor: 'pointer',
          display: 'flex', gap: '8px', alignItems: 'center',
          color: onBoard ? CX.green : CX.textPrimary,
        },
        title: onBoard ? 'Click to remove from this workspace' : 'Click to add to this workspace',
        onclick: (e) => {
          e.stopPropagation();
          if (onBoard) { removeWidgetFromActive(id); state.dashAddWidgetOpen = true; renderApp(); }
          else { addWidgetToActive(id); state.dashAddWidgetOpen = true; renderApp(); }
        },
      }, [
        mk('span', { style: { width: '14px', textAlign: 'center', fontWeight: '700' } }, [onBoard ? '✓' : '＋']),
        mk('span', { style: { fontSize: '9px', color: CX.textMuted, border: `1px solid ${CX.borderSubtle}`, borderRadius: '4px', padding: '1px 5px', textTransform: 'uppercase' } }, [DASH_WIDGETS[id].zone]),
        DASH_WIDGETS[id].label,
      ]));
    });
    addCard.appendChild(menu);
    // Cerrar al hacer clic fuera — mismo patrón que el menú + de CorexTerm.
    setTimeout(() => {
      const closeMenu = (ev) => {
        if (addCard.contains(ev.target)) return;
        state.dashAddWidgetOpen = false;
        renderApp();
        document.removeEventListener('click', closeMenu);
      };
      document.addEventListener('click', closeMenu);
    }, 0);
  }
  row.appendChild(addCard);
  return row;
}

// ── Fábrica compartida de tarjetas KPI (paleta del mockup) ──
function cxKpiCard(variant, title, sub, value, tag, iconSvg, extra) {
  const palette = {
    red: { bg: `linear-gradient(160deg,#1f1319,${CX.bgPanel})`, border: '#3a1e22', iconBg: CX.redDim, iconColor: '#fca5a5', valueColor: CX.textPrimary, tagColor: CX.red },
    amber: { bg: `linear-gradient(160deg,#201607,${CX.bgPanel})`, border: '#3a2a10', iconBg: CX.amberDim, iconColor: '#fcd34d', valueColor: CX.amber, tagColor: CX.amber },
    green: { bg: `linear-gradient(160deg,${CX.greenBg},${CX.bgPanel})`, border: '#173321', iconBg: CX.greenDim, iconColor: CX.green, valueColor: CX.textPrimary, tagColor: CX.green },
    mint: { bg: `linear-gradient(160deg,#0e2419,${CX.bgPanel})`, border: '#173321', iconBg: 'transparent', iconColor: CX.green, valueColor: CX.green, tagColor: CX.green },
    purple: { bg: `linear-gradient(160deg,${CX.bgPanelAlt},${CX.bgPanel})`, border: CX.purpleDim, iconBg: CX.purpleDim, iconColor: CX.purple, valueColor: CX.textPrimary, tagColor: CX.purple },
    neutral: { bg: CX.bgPanel, border: CX.borderSubtle, iconBg: CX.bgPanelAlt, iconColor: CX.textSecondary, valueColor: CX.textPrimary, tagColor: CX.textMuted },
  }[variant];

  const c = mk('div', {
    style: {
      borderRadius: '10px', padding: '12px 14px', border: `1px solid ${palette.border}`,
      background: palette.bg, position: 'relative', overflow: 'hidden',
    },
  });
  c.appendChild(mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } }, [
    mk('div', {}, [
      mk('div', { style: { fontSize: '12.5px', fontWeight: '600', color: CX.textPrimary } }, [title]),
      mk('div', { style: { fontSize: '10.5px', color: CX.textMuted, marginTop: '2px' } }, [sub]),
    ]),
    mk('div', {
      style: {
        width: '26px', height: '26px', borderRadius: '50%', background: palette.iconBg,
        color: palette.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0',
      },
      html: iconSvg,
    }),
  ]));
  c.appendChild(mk('div', {
    style: { fontSize: variant === 'mint' ? '15px' : '24px', fontWeight: '700', marginTop: '8px', fontFamily: "'IBM Plex Mono', monospace", color: palette.valueColor },
  }, [value]));
  if (tag) c.appendChild(mk('div', { style: { fontSize: '10px', marginTop: '4px', color: palette.tagColor } }, [tag]));
  if (extra) c.appendChild(extra);
  return c;
}

const CX_SVG = {
  target: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>',
  ticket: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6 H16 L20 10 V18 H4 Z"/></svg>',
  refresh: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
  pulse: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h4l2-7 4 14 2-7h4"/></svg>',
  clock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
};

// ── Widgets KPI individuales ──

function renderKpiMyFocus() {
  const jiraConfigured = !!(state.config.jira && state.config.jira.url);
  const focusCount = jiraConfigured
    ? state.inboxIssues.filter((i) => (priorityRank(i.fields && i.fields.priority) || 0) >= 3).length
    : null;
  return cxKpiCard(
    focusCount > 0 ? 'red' : 'neutral',
    'My Focus', 'High priority work',
    jiraConfigured ? String(focusCount) : '—',
    jiraConfigured ? (focusCount > 0 ? 'Needs attention' : 'All clear') : 'Jira not configured',
    CX_SVG.target,
  );
}

// Formatea millis de SLA en el estilo del mockup ("12m", "2h", "1d").
function formatSlaRemaining(ms) {
  if (ms == null) return '—';
  const neg = ms < 0;
  const abs = Math.abs(ms);
  const m = Math.round(abs / 60000);
  let out;
  if (m < 60) out = `${m}m`;
  else if (m < 60 * 24) out = `${Math.round(m / 60)}h`;
  else out = `${Math.round(m / (60 * 24))}d`;
  return neg ? `-${out}` : out;
}

// SLA At Risk — la tarjeta del mockup, ahora con datos reales de Jira
// Service Management: cuenta tickets con un ciclo SLA en curso que vence en
// los próximos 60 minutos o que ya se incumplió. Si la instancia de Jira no
// tiene campos SLA (no es JSM), lo dice claramente en vez de mostrar un 0.
const SLA_AT_RISK_WINDOW_MS = 60 * 60 * 1000;
function slaAtRiskIssues() {
  return state.inboxIssues.filter((i) => {
    const s = i._sla;
    if (!s || !s.ongoing) return s && s.anyBreached;
    return s.ongoing.breached || s.ongoing.remainingMillis <= SLA_AT_RISK_WINDOW_MS;
  });
}

function renderKpiSlaAtRisk() {
  const jiraConfigured = !!(state.config.jira && state.config.jira.url);
  if (!jiraConfigured) {
    return cxKpiCard('neutral', 'SLA At Risk', 'Next 60 minutes', '—', 'Jira not configured', CX_SVG.clock);
  }
  if (!state.slaAvailable) {
    return cxKpiCard('neutral', 'SLA At Risk', 'Next 60 minutes', '—', 'No SLA fields in this Jira (JSM only)', CX_SVG.clock);
  }
  const atRisk = slaAtRiskIssues();
  const anyBreached = atRisk.some((i) => i._sla && ((i._sla.ongoing && i._sla.ongoing.breached) || i._sla.anyBreached));
  return cxKpiCard(
    anyBreached ? 'red' : (atRisk.length > 0 ? 'amber' : 'neutral'),
    'SLA At Risk', 'Next 60 minutes',
    String(atRisk.length),
    anyBreached ? 'SLA breached!' : (atRisk.length ? 'Act soon' : 'All on track'),
    CX_SVG.clock,
  );
}

function renderKpiOpenTickets() {
  const jiraConfigured = !!(state.config.jira && state.config.jira.url);
  return cxKpiCard(
    'amber', 'Open Tickets', 'Assigned to you',
    jiraConfigured ? String(state.inboxIssues.length) : '—',
    jiraConfigured ? null : 'Jira not configured',
    CX_SVG.ticket,
  );
}

function renderKpiAutomations() {
  const awxConfigured = !!(state.config.awx && state.config.awx.url);
  let autoValue = '—';
  let autoTag = awxConfigured ? 'No recent jobs' : 'AWX not configured';
  if (awxConfigured && state.awxRecentJobs.length > 0) {
    const finished = state.awxRecentJobs.filter((j) => ['successful', 'failed', 'error', 'canceled'].includes(j.status));
    if (finished.length > 0) {
      const okCount = finished.filter((j) => j.status === 'successful').length;
      autoValue = `${Math.round((okCount / finished.length) * 100)}%`;
      autoTag = `Last ${finished.length} jobs`;
    }
  }
  return cxKpiCard('green', 'Automations', 'Success rate', autoValue, autoTag, CX_SVG.refresh);
}

function renderKpiSystemHealth() {
  // Sparkline real desde hwHistory (CPU) — no datos decorativos.
  const sparkFromHwHistory = () => {
    const pts = state.hwHistory.slice(-40);
    if (pts.length < 2) return null;
    const maxLoad = 100;
    const coords = pts.map((p, i) => {
      const x = (i / (pts.length - 1)) * 100;
      const load = Math.min(maxLoad, (p.cpuUser + p.cpuSystem));
      const y = 24 - (load / maxLoad) * 22;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return mk('div', {
      style: { marginTop: '6px' },
      html: `<svg width="100%" height="26" viewBox="0 0 100 26" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="${CX.green}" stroke-width="2"/></svg>`,
    });
  };
  let healthValue = '…';
  let healthVariant = 'mint';
  if (state.hwMetrics) {
    const cpuLoad = state.hwMetrics.cpu.load || 0;
    const memPct = (state.hwMetrics.mem.used / state.hwMetrics.mem.total) * 100;
    healthValue = (cpuLoad > 85 || memPct > 92) ? 'Busy' : 'Healthy';
    if (healthValue === 'Busy') healthVariant = 'amber';
  }
  return cxKpiCard(
    healthVariant, 'System Health',
    state.hwMetrics ? `CPU ${Math.round(state.hwMetrics.cpu.load || 0)}% · RAM ${Math.round((state.hwMetrics.mem.used / state.hwMetrics.mem.total) * 100)}%` : 'Loading metrics…',
    healthValue, null, CX_SVG.pulse, sparkFromHwHistory(),
  );
}

function renderKpiActiveSessions() {
  const sshActive = Object.values(state.ctTerminalInstances || {}).filter((i) => i.connected).length;
  return cxKpiCard('purple', 'Active Sessions', 'SSH connections', String(sshActive), null, CX_SVG.clock);
}

// Clasifica un issue en las categorías de los chips del mockup, usando
// statusCategory de Jira (new/indeterminate/done) con fallback por nombre.
function myWorkCategory(issue) {
  const f = issue.fields || {};
  const cat = f.status && f.status.statusCategory && f.status.statusCategory.key; // 'new' | 'indeterminate' | 'done'
  const name = ((f.status && f.status.name) || '').toLowerCase();
  if (cat === 'done' || /resolved|closed|done/.test(name)) return 'resolved';
  if (/wait|pending|hold/.test(name)) return 'waiting';
  if (cat === 'indeterminate' || /progress/.test(name)) return 'inProgress';
  return 'open';
}

function myWorkIsAtRisk(issue) {
  const s = issue._sla;
  if (s && (s.anyBreached || (s.ongoing && (s.ongoing.breached || s.ongoing.remainingMillis <= SLA_AT_RISK_WINDOW_MS)))) return true;
  // Sin SLA (instancia no-JSM): la prioridad crítica cuenta como riesgo.
  return !state.slaAvailable && (priorityRank(issue.fields && issue.fields.priority) || 0) >= 4;
}

function renderMyWorkSection() {
  const panel = mk('div', {
    style: {
      background: CX.bgPanel, border: `1px solid ${CX.borderSubtle}`, borderRadius: '10px',
      overflow: 'hidden', marginBottom: '20px',
    },
  });

  panel.appendChild(mk('div', {
    style: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 16px', borderBottom: `1px solid ${CX.borderSubtle}`,
    },
  }, [
    mk('div', { style: { fontSize: '13.5px', fontWeight: '700', color: CX.textPrimary } }, ['My Work']),
    mk('div', {
      style: { fontSize: '11px', color: CX.blue, cursor: 'pointer' },
      onclick: () => { state.view = 'jira'; renderApp(); if (state.inboxIssues.length === 0) loadInbox(); },
    }, ['View all tickets →']),
  ]));

  if (state.inboxLoading && state.inboxIssues.length === 0) {
    panel.appendChild(mk('div', { style: { padding: '20px 16px', fontSize: '12px', color: CX.textMuted } }, [t('inbox_loading') || 'Loading…']));
    return panel;
  }
  if (state.inboxError) {
    panel.appendChild(mk('div', { style: { padding: '20px 16px', fontSize: '12px', color: CX.red } }, [state.inboxError]));
    return panel;
  }
  if (state.inboxIssues.length === 0) {
    panel.appendChild(mk('div', { style: { padding: '20px 16px', fontSize: '12px', color: CX.textMuted } }, ['No tickets assigned to you right now.']));
    return panel;
  }

  // ── Filter chips (mockup): All / At Risk / In Progress / Waiting / Resolved ──
  // Contadores reales sobre los issues cargados; el chip activo filtra la tabla.
  const counts = { atRisk: 0, inProgress: 0, waiting: 0, resolved: 0 };
  state.inboxIssues.forEach((i) => {
    if (myWorkIsAtRisk(i)) counts.atRisk += 1;
    const c = myWorkCategory(i);
    if (counts[c] !== undefined) counts[c] += 1;
  });
  const chips = [
    { id: 'all', label: 'All', count: null },
    { id: 'atRisk', label: 'At Risk', count: counts.atRisk, countColor: '#f87171' },
    { id: 'inProgress', label: 'In Progress', count: counts.inProgress },
    { id: 'waiting', label: 'Waiting', count: counts.waiting },
    { id: 'resolved', label: 'Resolved', count: counts.resolved },
  ];
  const chipRow = mk('div', {
    style: { display: 'flex', gap: '16px', padding: '10px 16px 0', borderBottom: `1px solid ${CX.borderSubtle}`, fontSize: '12px' },
  });
  chips.forEach((ch) => {
    const active = state.myWorkFilter === ch.id;
    chipRow.appendChild(mk('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '5px', paddingBottom: '8px', cursor: 'pointer',
        color: active ? CX.textPrimary : CX.textSecondary, fontWeight: active ? '600' : '400',
        borderBottom: active ? `2px solid ${CX.blue}` : '2px solid transparent', marginBottom: '-1px',
      },
      onclick: () => { state.myWorkFilter = ch.id; renderApp(); },
    }, [
      ch.label,
      ch.count ? mk('span', {
        style: { background: CX.bgPanelAlt, borderRadius: '999px', padding: '0 6px', fontSize: '10px', color: ch.countColor || CX.textSecondary },
      }, [String(ch.count)]) : null,
    ].filter(Boolean)));
  });
  panel.appendChild(chipRow);

  // ── Filtro aplicado ──
  let visible = state.inboxIssues;
  if (state.myWorkFilter === 'atRisk') visible = visible.filter(myWorkIsAtRisk);
  else if (state.myWorkFilter !== 'all') visible = visible.filter((i) => myWorkCategory(i) === state.myWorkFilter);

  if (visible.length === 0) {
    panel.appendChild(mk('div', { style: { padding: '20px 16px', fontSize: '12px', color: CX.textMuted } }, ['No tickets in this category.']));
    return panel;
  }

  // ── Cabecera ── (Service viene de components de Jira, como el mockup;
  // la columna SLA solo si la instancia tiene SLAs)
  const withSla = state.slaAvailable;
  const gridCols = withSla ? '110px 56px 1fr 64px 130px 170px' : '110px 56px 1fr 130px 170px';
  const headerCells = [
    mk('span', {}, ['Ticket']), mk('span', {}, ['Priority']), mk('span', {}, ['Summary']),
  ];
  if (withSla) headerCells.push(mk('span', {}, ['SLA']));
  headerCells.push(mk('span', {}, ['Service']), mk('span', {}, ['Linked automation']));
  panel.appendChild(mk('div', {
    style: {
      display: 'grid', gridTemplateColumns: gridCols, gap: '8px', padding: '8px 16px',
      fontSize: '10.5px', color: CX.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px',
      borderBottom: `1px solid ${CX.borderSubtle}`,
    },
  }, headerCells));

  const prioStyle = (priority) => {
    const rank = priorityRank(priority) || 0;
    if (rank >= 4) return { bar: CX.red, badgeBg: CX.redDim, badgeColor: '#fecaca' };
    if (rank === 3) return { bar: CX.amber, badgeBg: CX.amberDim, badgeColor: '#fde68a' };
    if (rank >= 1) return { bar: CX.purple, badgeBg: CX.purpleDim, badgeColor: '#ddd6fe' };
    return { bar: CX.borderSubtle, badgeBg: CX.bgPanelAlt, badgeColor: CX.textMuted };
  };
  // Badge compacto tipo mockup ("P3" y no "P3 - High"): primer token del
  // nombre si parece un código P#; si no, el nombre entero truncado.
  const prioShort = (priority) => {
    const name = (priority && priority.name) || '—';
    const first = name.split(/[\s-]+/)[0];
    return /^P\d+$/i.test(first) ? first.toUpperCase() : name;
  };

  const sorted = visible
    .slice()
    .sort((a, b) => (priorityRank(b.fields && b.fields.priority) || 0) - (priorityRank(a.fields && a.fields.priority) || 0))
    .slice(0, 8);

  sorted.forEach((issue) => {
    const f = issue.fields || {};
    const ps = prioStyle(f.priority);
    const link = state.ticketLinks[issue.key];
    const service = (Array.isArray(f.components) && f.components.length) ? f.components.map((c) => c.name).join(', ') : ((f.status && f.status.name) || '—');
    const cells = [
      mk('span', { style: { color: CX.blue, fontFamily: "'IBM Plex Mono', monospace", fontWeight: '600', fontSize: '11.5px' } }, [issue.key]),
      mk('span', {
        style: {
          fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '10px',
          background: ps.badgeBg, color: ps.badgeColor, justifySelf: 'start', whiteSpace: 'nowrap',
          maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
        },
        title: (f.priority && f.priority.name) || '',
      }, [prioShort(f.priority)]),
      mk('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [f.summary || '(untitled)']),
    ];
    if (withSla) {
      const s = issue._sla;
      if (!s || !s.ongoing) {
        cells.push(mk('span', { style: { fontSize: '10.5px', color: s && s.anyBreached ? CX.red : CX.textMuted, fontWeight: s && s.anyBreached ? '700' : '400' } }, [s && s.anyBreached ? 'Breached' : '—']));
      } else {
        const risky = s.ongoing.breached || s.ongoing.remainingMillis <= SLA_AT_RISK_WINDOW_MS;
        cells.push(mk('span', {
          style: { fontSize: '11px', fontWeight: '700', color: s.ongoing.breached || risky ? CX.red : CX.textSecondary, fontFamily: "'IBM Plex Mono', monospace" },
          title: `${s.ongoing.name}${s.ongoing.breached ? ' — BREACHED' : ''}`,
        }, [s.ongoing.breached ? 'Breached' : formatSlaRemaining(s.ongoing.remainingMillis)]));
      }
    }
    cells.push(mk('span', {
      style: { fontSize: '11px', color: CX.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      title: service,
    }, [service]));
    cells.push(link
      ? mk('span', {
          style: {
            fontSize: '10.5px', padding: '4px 10px', borderRadius: '999px', fontWeight: '600',
            background: '#124a2c', color: '#86efac', justifySelf: 'start', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
          },
          title: `AWX template: ${link.templateName}`,
        }, [link.templateName])
      : mk('span', { style: { fontSize: '10.5px', color: CX.textMuted } }, ['—']));

    const row = mk('div', {
      style: {
        display: 'grid', gridTemplateColumns: gridCols, gap: '8px', padding: '10px 16px',
        alignItems: 'center', fontSize: '12px', color: CX.textPrimary, cursor: 'pointer',
        borderBottom: `1px solid #121a22`, position: 'relative',
      },
      onclick: () => openJiraDetail(issue.key, 'inbox'),
    }, cells);
    row.appendChild(mk('span', {
      style: { position: 'absolute', left: '0', top: '0', bottom: '0', width: '3px', background: ps.bar },
    }));
    panel.appendChild(row);
  });

  return panel;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Jira — vista de detalle de ticket: info completa + comentar + adjuntar
// ═══════════════════════════════════════════════════════════════════════════

// Entrada al detalle DESDE FUERA (lista de Jira, AWX, Dashboard, etc.) —
// limpia la pila de navegación entre tickets, porque es un punto de
// entrada nuevo, no continuación de un recorrido padre/hijo/relacionado.
async function openJiraDetail(key, returnView) {
  state.jiraDetailReturnView = returnView || 'inbox';
  state.jiraDetailHistory = [];
  await loadJiraDetailIssue(key);
}

// Salto a un ticket RELACIONADO (parent, sub-task, issue link) desde dentro
// del propio detalle — apila el ticket actual antes de saltar, para que
// "← Back" pueda volver exactamente por donde vino, en vez de caer siempre
// en la lista general de Jira.
async function navigateToRelatedTicket(key) {
  if (state.jiraDetailIssue) {
    state.jiraDetailHistory.push(state.jiraDetailIssue.key);
  }
  await loadJiraDetailIssue(key);
}

// Botón "← Back": si hay tickets en la pila, vuelve al anterior; si no,
// vuelve a la vista de origen (Jira/AWX/Dashboard) como antes.
async function goBackFromJiraDetail() {
  if (state.jiraDetailHistory.length > 0) {
    const previousKey = state.jiraDetailHistory.pop();
    await loadJiraDetailIssue(previousKey);
  } else {
    state.view = state.jiraDetailReturnView;
    renderApp();
  }
}

async function loadJiraDetailIssue(key) {
  state.jiraCommentDraft = '';
  state.jiraCommentExpanded = false;
  state.jiraDetailExpandedFields = {};
  state.jiraDetailThumbnails = {};
  state.view = 'jira-detail';
  state.jiraLoading = true;
  renderApp();

  const res = await window.corexAPI.jiraGetIssue(key);
  state.jiraLoading = false;
  if (res.ok) {
    state.jiraDetailIssue = res.issue;
  } else {
    toast(`Error: ${res.error}`, 'err');
    state.view = state.jiraDetailReturnView || 'inbox';
  }
  renderApp();
}

async function sendJiraComment(internal) {
  const key = state.jiraDetailIssue && state.jiraDetailIssue.key;
  const hasText = state.jiraCommentDraft.trim().length > 0;
  const hasAttachment = !!state.jiraCommentAttachment;
  if (!key || (!hasText && !hasAttachment)) return;

  state.jiraCommentSending = true;
  renderApp();

  let attachmentRef = '';
  if (hasAttachment) {
    // Subir primero el adjunto — Jira requiere que exista antes de poder
    // referenciarlo en un comentario con la sintaxis [^nombre_archivo].
    const att = state.jiraCommentAttachment;
    const uploadRes = await window.corexAPI.jiraAddAttachment(key, att.name, att.base64);
    if (!uploadRes.ok) {
      toast(`Attachment failed: ${uploadRes.error}`, 'err');
      state.jiraCommentSending = false;
      renderApp();
      return;
    }
    // Sintaxis wiki de Jira para referenciar un adjunto dentro de un
    // comentario — confirmado contra datos reales del ticket ITSD-1317724:
    // los comentarios de Pabbu/Curtido usaban exactamente [^nombre.xlsx]
    // y la visibilidad interna/pública la hereda el comentario, no el adjunto.
    attachmentRef = `[^${att.name}]`;
  }

  // Cuerpo del comentario: texto del usuario (si hay) + referencia al
  // adjunto (si hay). Si no hay texto pero sí adjunto, el comentario es
  // solo la referencia — mínimo que Jira necesita para que el adjunto
  // aparezca en el hilo de comentarios con su visibilidad correcta.
  const body = [state.jiraCommentDraft.trim(), attachmentRef].filter(Boolean).join('\n\n');

  const res = await window.corexAPI.jiraAddComment(key, body, internal);
  state.jiraCommentSending = false;
  if (!res.ok) {
    toast(`${t('jira_detail_comment_failed')} ${res.error}`, 'err');
  } else {
    toast(t('jira_detail_comment_sent'), 'ok');
    state.jiraCommentDraft = '';
    state.jiraCommentAttachment = null;
    state.jiraCommentExpanded = false;
    const issueRes = await window.corexAPI.jiraGetIssue(state.jiraDetailIssue.key);
    if (issueRes.ok) state.jiraDetailIssue = issueRes.issue;
  }
  renderApp();
}

// Adjunta el log/stdout del job más reciente vinculado a este ticket, como
// un archivo .txt simple. (Cuando tengamos un generador de reportes HTML,
// este es el punto donde se enchufa: mismo flujo, distinto contenido/filename.)
// Adjunto manual: abre el selector nativo de archivo y sube directamente al
// ticket actual — independiente del flujo automatizado de "Attach report"
// (que solo adjunta el output de un job en ejecución). Reutiliza el mismo
// backend ya construido para la cola de adjuntos pendientes de Automation
// Templates, ya que ahí ya recibe cualquier ticketKey de forma genérica.
async function pickCommentAttachment() {
  // Abre un input[type=file] invisible para seleccionar el archivo —
  // en el contexto del renderer de Electron, el input nativo del navegador
  // funciona igual que en un navegador web, sin necesitar el dialog del
  // proceso main. Esto permite leer el contenido como base64 en el
  // frontend y guardarlo en state hasta que el usuario decida enviar,
  // en vez de subirlo inmediatamente sin saber aún si va como interno o público.
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        // FileReader devuelve data:mime/type;base64,XXXX — solo necesitamos
        // la parte después de la coma para jiraAddAttachment.
        const base64 = ev.target.result.split(',')[1];
        resolve({ name: file.name, base64, size: file.size });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
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
      htmlParts.push(`<h${level} style="font-size:${15 - level}px;margin:10px 0 4px;color:#eef2f5;">${inlineFormat(headerMatch[2])}</h${level}>`);
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

// ── Cambio de estado desde el detalle — mismo desplegable de transiciones
// reales que ya usa la automatización, pero aquí lo abre directamente el
// usuario al hacer clic en la píldora de estado.
async function toggleStatusMenu() {
  state.jiraDetailStatusMenuOpen = !state.jiraDetailStatusMenuOpen;
  if (state.jiraDetailStatusMenuOpen) {
    state.jiraDetailTransitionsLoading = true;
    renderApp();
    const res = await window.corexAPI.jiraListTransitions(state.jiraDetailIssue.key);
    state.jiraDetailTransitionsLoading = false;
    state.jiraDetailTransitions = res.ok ? res.transitions : [];
    if (!res.ok) toast(`Could not load transitions: ${res.error}`, 'err');
  }
  renderApp();
}

async function applyTransitionFromDetail(transition) {
  state.jiraDetailStatusMenuOpen = false;
  renderApp();
  const res = await window.corexAPI.jiraDoTransition(state.jiraDetailIssue.key, transition.id);
  if (!res.ok) {
    toast(`Transition failed: ${res.error}`, 'err');
    return;
  }
  toast(`Moved to ${(transition.to && transition.to.name) || transition.name}`, 'ok');
  // Recargar el ticket para reflejar el nuevo estado real — loadJiraDetailIssue,
  // no openJiraDetail, por el mismo motivo: esto es un refresco, no una
  // entrada nueva que deba limpiar la pila de navegación.
  await loadJiraDetailIssue(state.jiraDetailIssue.key);
}

// ── Thumbnails de adjuntos imagen — se piden bajo demanda y se cachean en
// memoria por id de adjunto, para no volver a descargarlas en cada render.
async function loadAttachmentThumbnail(att) {
  if (state.jiraDetailThumbnails[att.id]) return; // ya cacheada
  if (!att.thumbnail) return; // Jira no siempre expone thumbnail (adjuntos no-imagen)
  const res = await window.corexAPI.jiraFetchThumbnail(att.thumbnail, att.mimeType);
  if (res.ok) {
    state.jiraDetailThumbnails[att.id] = res.dataUrl;
    renderApp();
  }
}

// Color de la píldora de estado, basado en statusCategory (un campo
// ESTÁNDAR de Jira con valores fijos: new/indeterminate/done — no
// dependemos de adivinar nombres de estado específicos de cada workflow).
function jiraStatusPillColor(status) {
  const catKey = status && status.statusCategory && status.statusCategory.key;
  if (catKey === 'done') return '#22c55e';
  if (catKey === 'indeterminate') return '#38bdf8';
  return '#8a96a3'; // 'new' / sin categoría
}

function jiraPriorityPillColor(priority) {
  const name = ((priority && priority.name) || '').toLowerCase();
  if (name.includes('critical') || name.includes('highest') || name.includes('p1')) return '#ef4444';
  if (name.includes('high') || name.includes('p2')) return '#f59e0b';
  if (name.includes('medium') || name.includes('p3')) return '#c9b23a';
  return '#8a96a3';
}

// Detecta automáticamente qué custom fields del ticket son texto legible
// para una persona (texto corto/largo, número, fecha, selección simple
// {name:...}/{value:...}) y descarta los que son metadatos internos de
// workflow: JSON serializado dentro de un string (empieza por { o [),
// arrays, objetos con muchas keys (blobs de integración como devSummaryJson
// que vimos en tickets reales), o nombres de campo que delatan ruido
// técnico (Checklist, Approval Id, AccuWork..., Json, etc.).
const CUSTOM_FIELD_NOISE_NAME_PATTERN = /json|checklist|approval id|accuwork|devstatus|webhook|^sla|smart checklist/i;

function isJsonLikeString(str) {
  const trimmed = str.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function extractReadableCustomFields(fields, names) {
  const results = [];
  Object.keys(fields).forEach((key) => {
    if (!key.startsWith('customfield_')) return;
    const value = fields[key];
    if (value == null || value === '') return;

    const label = names[key] || key;
    if (CUSTOM_FIELD_NOISE_NAME_PATTERN.test(label)) return;

    let displayValue = null;

    if (typeof value === 'string') {
      if (isJsonLikeString(value)) return; // JSON serializado a mano dentro de un campo de texto
      displayValue = value;
    } else if (typeof value === 'number') {
      displayValue = String(value);
    } else if (Array.isArray(value)) {
      // Arrays simples de strings/números son legibles (p.ej. multi-select
      // de texto plano); arrays de objetos complejos (checklists con
      // linkedIssueKey/mandatory, etc.) se descartan.
      if (value.length === 0) return;
      if (value.every((v) => typeof v === 'string' || typeof v === 'number')) {
        displayValue = value.join(', ');
      } else {
        return;
      }
    } else if (typeof value === 'object') {
      // Forma típica de un campo select/radio de Jira: { name: "..." } o
      // { value: "..." }. Si el objeto tiene más estructura que eso, es
      // casi seguro un campo de relación compleja (usuario, grupo con self
      // URL, etc.) — los descartamos para no mostrar ruido tipo "[object]".
      if (value.name && typeof value.name === 'string') displayValue = value.name;
      else if (value.value && typeof value.value === 'string') displayValue = value.value;
      else return;
    } else {
      return;
    }

    if (!displayValue || !displayValue.trim()) return;
    results.push({ key, label, value: displayValue.trim() });
  });
  return results;
}

function renderJiraDetailView() {
  const issue = state.jiraDetailIssue;
  const wrap = mk('div', { style: { maxWidth: '760px' } });

  // Botón de volver — si venimos de saltar entre tickets relacionados
  // (parent/sub-task/linked issue), dice exactamente a qué ticket vuelve en
  // vez de un genérico "← Jira" que siempre caía en la lista general. Si la
  // pila tiene más de un salto, se muestra además el camino completo como
  // breadcrumb, para que sea evidente cómo se llegó hasta aquí.
  const hasHistory = state.jiraDetailHistory.length > 0;
  const originLabel = state.jiraDetailReturnView === 'jira' ? t('nav_jira')
    : state.jiraDetailReturnView === 'awx-detail' ? t('nav_awx')
    : t('nav_inbox');

  const backRow = mk('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' } });
  backRow.appendChild(mk('span', {
    style: { fontSize: '12px', color: '#eef2f5', cursor: 'pointer', fontWeight: '600' },
    onclick: () => goBackFromJiraDetail(),
  }, [hasHistory ? `← Back to ${state.jiraDetailHistory[state.jiraDetailHistory.length - 1]}` : `← ${originLabel}`]));

  if (hasHistory) {
    // Breadcrumb completo: Origen / Ticket1 / Ticket2 / ... — cada eslabón
    // navega directo a ese punto, recortando la pila hasta ahí.
    backRow.appendChild(mk('span', { style: { fontSize: '11px', color: '#3a4650' } }, ['·']));
    backRow.appendChild(mk('span', {
      style: { fontSize: '11px', color: '#8a96a3', cursor: 'pointer' },
      onclick: () => { state.jiraDetailHistory = []; state.view = state.jiraDetailReturnView; renderApp(); },
    }, [originLabel]));
    state.jiraDetailHistory.forEach((key, i) => {
      backRow.appendChild(mk('span', { style: { fontSize: '11px', color: '#3a4650' } }, ['/']));
      backRow.appendChild(mk('span', {
        style: { fontSize: '11px', color: '#8a96a3', cursor: 'pointer' },
        onclick: async () => {
          const targetKey = state.jiraDetailHistory[i];
          state.jiraDetailHistory = state.jiraDetailHistory.slice(0, i);
          await loadJiraDetailIssue(targetKey);
        },
      }, [key]));
    });
  }
  wrap.appendChild(backRow);

  if (state.jiraLoading || !issue) {
    wrap.appendChild(mk('div', { style: { color: '#8a96a3', fontSize: '13px' } }, [t('jira_loading')]));
    return wrap;
  }

  const f = issue.fields || {};
  const link = state.ticketLinks[issue.key];

  // ── Badge del ticket padre — información de jerarquía pura, no
  // navegación: el botón "← Back" de arriba ya cubre esa acción. Antes
  // ambos hacían lo mismo (ir al padre) y quedaban casi superpuestos en
  // pantalla, lo cual era redundante y confuso.
  if (f.parent) {
    wrap.appendChild(mk('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#38bdf8',
        marginBottom: '10px', background: '#0d1926', border: '1px solid #0e3450',
        borderRadius: '10px', padding: '6px 10px', width: 'fit-content', cursor: 'pointer',
      },
      onclick: () => navigateToRelatedTicket(f.parent.key),
    }, [
      '↳ Sub-task of ',
      mk('span', { style: { fontWeight: '700' } }, [f.parent.key]),
      (f.parent.fields && f.parent.fields.summary) ? ` — ${f.parent.fields.summary}` : '',
    ]));
  }

  wrap.appendChild(mk('div', { style: { fontSize: '12px', color: '#eef2f5', fontWeight: '700', marginBottom: '4px' } }, [issue.key]));
  wrap.appendChild(mk('h1', { style: { fontSize: '19px', fontWeight: '700', color: '#eef2f5', marginBottom: '12px' } }, [f.summary || '(untitled)']));

  // ── Píldoras: estado (clicable, abre transiciones reales) + prioridad ──
  const pillRow = mk('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', position: 'relative', flexWrap: 'wrap' } });
  const statusColor = jiraStatusPillColor(f.status);
  const statusPill = mk('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: '700',
      color: statusColor, background: `${statusColor}1a`, border: `1px solid ${statusColor}`,
      borderRadius: '20px', padding: '4px 12px', cursor: 'pointer',
    },
    onclick: () => toggleStatusMenu(),
  }, [
    (f.status && f.status.name) || '—',
    mk('span', { style: { fontSize: '9px' } }, ['▾']),
  ]);
  pillRow.appendChild(statusPill);

  if (f.priority) {
    const prColor = jiraPriorityPillColor(f.priority);
    pillRow.appendChild(mk('div', {
      style: {
        fontSize: '11.5px', fontWeight: '700', color: prColor, background: `${prColor}1a`,
        border: `1px solid ${prColor}`, borderRadius: '20px', padding: '4px 12px',
      },
    }, [f.priority.name]));
  }

  if (state.jiraDetailStatusMenuOpen) {
    const menu = mk('div', {
      style: {
        position: 'absolute', top: '32px', left: '0', zIndex: '50', minWidth: '240px',
        background: '#111a24', border: '1px solid #26313d', borderRadius: '10px', padding: '4px',
        boxShadow: '0 8px 24px #00000066',
      },
    });
    if (state.jiraDetailTransitionsLoading) {
      menu.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#8a96a3', padding: '8px 10px' } }, ['Loading…']));
    } else if (state.jiraDetailTransitions.length === 0) {
      menu.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#8a96a3', padding: '8px 10px' } }, ['No transitions available from this status.']));
    } else {
      state.jiraDetailTransitions.forEach((tr) => {
        menu.appendChild(mk('div', {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', fontSize: '12px', color: '#eef2f5', cursor: 'pointer', borderRadius: '6px' },
          onclick: () => applyTransitionFromDetail(tr),
        }, [
          tr.name,
          mk('span', { style: { fontSize: '10px', color: '#38bdf8', fontWeight: '700' } }, ['→ ' + ((tr.to && tr.to.name) || '')]),
        ]));
      });
    }
    pillRow.appendChild(menu);
  }
  wrap.appendChild(pillRow);

  // ── Fila de metadatos — solo los campos que de verdad tienen valor ──
  const metaRow = mk('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: '11.5px', color: '#8a96a3', marginBottom: '16px', lineHeight: '1.7' } });
  const addMeta = (label, value) => { if (value) metaRow.appendChild(mk('span', {}, [`${label}: `, mk('span', { style: { color: '#aab6c3' } }, [value])])); };
  addMeta('Assignee', (f.assignee && f.assignee.displayName) || t('jira_unassigned'));
  addMeta('Reporter', f.reporter && f.reporter.displayName);
  const assignmentGroup = f[JIRA_CUSTOM_FIELDS.assignmentGroup];
  addMeta('Group', assignmentGroup && (typeof assignmentGroup === 'string' ? assignmentGroup : assignmentGroup.name));
  addMeta('Component(s)', (f.components && f.components.length) ? f.components.map((c) => c.name).join(', ') : null);
  addMeta('Labels', (f.labels && f.labels.length) ? f.labels.join(', ') : null);
  addMeta('Created', f.created ? new Date(f.created).toLocaleDateString() : null);
  addMeta('Updated', f.updated ? new Date(f.updated).toLocaleDateString() : null);
  if (f.watches && f.watches.watchCount) addMeta('Watchers', String(f.watches.watchCount));
  wrap.appendChild(metaRow);

  // ── SLA ──
  const slaResolution = formatJiraSla(f[JIRA_CUSTOM_FIELDS.slaTimeToResolution]);
  const slaFirstResponse = formatJiraSla(f[JIRA_CUSTOM_FIELDS.slaTimeToFirstResponse]);
  if (slaResolution || slaFirstResponse) {
    const slaRow = mk('div', { style: { display: 'flex', gap: '14px', marginBottom: '18px' } });
    [slaResolution, slaFirstResponse].forEach((sla) => {
      if (!sla) return;
      const color = sla.breached ? '#ef4444' : sla.ongoing ? '#f59e0b' : '#22c55e';
      slaRow.appendChild(mk('div', {
        style: { background: '#0d141d', border: `1px solid ${color}`, borderRadius: '6px', padding: '8px 14px', fontSize: '11.5px' },
      }, [
        mk('div', { style: { color: '#8a96a3', marginBottom: '2px' } }, [sla.name]),
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
      style: { fontSize: '13px', color: '#eef2f5', lineHeight: '1.6', background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', padding: '16px', marginBottom: '20px' },
    });
    if (typeof f.description === 'string') descBox.innerHTML = jiraWikiToHtml(f.description);
    else descBox.textContent = t('jira_rich_description_fallback');
    wrap.appendChild(descBox);
  }

  // ── Campos personalizados — genérico, no hardcodeado. Tu Jira tiene
  // 800+ custom fields y cada tipo de ticket usa un subconjunto distinto;
  // en vez de mapearlos uno a uno a mano (como hacíamos antes solo con
  // Business Justification), se detectan automáticamente los que parecen
  // texto legible y se descartan los que parecen metadatos internos de
  // workflow (JSON serializado, checklists, blobs de integración).
  const customFields = extractReadableCustomFields(f, issue.names || {}).filter((cf) => cf.key !== JIRA_CUSTOM_FIELDS.assignmentGroup);
  if (customFields.length > 0) {
    customFields.forEach(({ key, label, value }) => {
      const expanded = !!state.jiraDetailExpandedFields[key];
      const isLong = value.length > 140 || value.includes('\n');
      const section = mk('div', { style: { marginBottom: isLong ? '6px' : '10px' } });
      if (isLong) {
        section.appendChild(mk('div', {
          style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700', color: '#eef2f5', cursor: 'pointer', padding: '8px 0' },
          onclick: () => { state.jiraDetailExpandedFields[key] = !expanded; renderApp(); },
        }, [
          mk('span', { style: { fontSize: '10px', color: '#8a96a3' } }, [expanded ? '▾' : '▸']),
          label,
        ]));
        if (expanded) {
          const box = mk('div', {
            style: { fontSize: '13px', color: '#eef2f5', lineHeight: '1.6', background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', padding: '16px', whiteSpace: 'pre-wrap' },
          }, [value]);
          section.appendChild(box);
        }
      } else {
        section.appendChild(mk('div', { style: { fontSize: '12px', color: '#8a96a3' } }, [
          label, ': ', mk('span', { style: { color: '#aab6c3' } }, [value]),
        ]));
      }
      wrap.appendChild(section);
    });
  }

  // ── Adjuntos existentes — miniatura real para imágenes (cargada bajo
  // demanda desde el endpoint de thumbnail propio de Jira), fila con icono
  // para cualquier otro formato.
  const attachments = f.attachment || [];
  if (attachments.length > 0) {
    wrap.appendChild(mk('div', { style: { fontSize: '11px', fontWeight: '700', color: '#8a96a3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' } }, [
      `Attachments (${attachments.length})`,
    ]));
    const attachGrid = mk('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' } });
    attachments.forEach((att) => {
      const isImage = (att.mimeType || '').startsWith('image/');
      const sizeKb = att.size ? `${(att.size / 1024).toFixed(0)} KB` : '';

      if (isImage) {
        const cachedThumb = state.jiraDetailThumbnails[att.id];
        if (!cachedThumb) loadAttachmentThumbnail(att); // dispara la carga; el render se repetirá cuando llegue
        const thumbBox = mk('div', {
          style: {
            width: '88px', height: '88px', borderRadius: '10px', border: '1px solid #1b2530', background: '#0d141d',
            cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
          },
          title: att.filename,
          onclick: () => downloadJiraAttachment(att),
        });
        if (cachedThumb) {
          const img = mk('img', { style: { width: '100%', height: '100%', objectFit: 'cover' } });
          img.src = cachedThumb;
          thumbBox.appendChild(img);
        } else {
          thumbBox.appendChild(mk('span', { style: { fontSize: '10px', color: '#8a96a3' } }, ['…']));
        }
        attachGrid.appendChild(thumbBox);
        return;
      }

      const row = mk('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '8px', background: '#0d141d', border: '1px solid #1b2530',
          borderRadius: '10px', padding: '8px 10px', cursor: 'pointer', maxWidth: '260px',
        },
        onclick: () => downloadJiraAttachment(att),
      }, [
        mk('span', { style: { fontSize: '14px', color: '#8a96a3', flexShrink: '0' } }, ['▤']),
        mk('div', { style: { minWidth: '0', flex: '1' } }, [
          mk('div', { style: { fontSize: '11.5px', color: '#eef2f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [att.filename]),
          mk('div', { style: { fontSize: '10px', color: '#8a96a3' } }, [sizeKb]),
        ]),
        mk('span', { style: { fontSize: '11px', color: '#8a96a3', flexShrink: '0' } }, ['↓']),
      ]);
      attachGrid.appendChild(row);
    });
    wrap.appendChild(attachGrid);
  }

  // ── Sub-Tasks — cada una con su propio estado, clicable para navegar ──
  const subtasks = f.subtasks || [];
  if (subtasks.length > 0) {
    wrap.appendChild(mk('div', { style: { fontSize: '11px', fontWeight: '700', color: '#8a96a3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' } }, [
      `Sub-Tasks (${subtasks.length})`,
    ]));
    subtasks.forEach((sub) => {
      const subFields = sub.fields || {};
      const subColor = jiraStatusPillColor(subFields.status);
      wrap.appendChild(mk('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', padding: '8px 12px', marginBottom: '6px', cursor: 'pointer' },
        onclick: () => navigateToRelatedTicket(sub.key),
      }, [
        mk('div', { style: { fontSize: '12px', color: '#eef2f5' } }, [
          mk('span', { style: { color: '#60a5fa', fontWeight: '700' } }, [sub.key]), '  ', subFields.summary || '',
        ]),
        mk('span', { style: { fontSize: '10.5px', fontWeight: '700', color: subColor, background: `${subColor}1a`, border: `1px solid ${subColor}`, borderRadius: '20px', padding: '2px 9px', flexShrink: '0' } }, [
          (subFields.status && subFields.status.name) || '—',
        ]),
      ]));
    });
    wrap.appendChild(mk('div', { style: { height: '8px' } }));
  }

  // ── Issue Links — "is related to X", etc. ──
  const issueLinks = f.issuelinks || [];
  if (issueLinks.length > 0) {
    wrap.appendChild(mk('div', { style: { fontSize: '11px', fontWeight: '700', color: '#8a96a3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' } }, [
      'Linked Issues',
    ]));
    issueLinks.forEach((il) => {
      const linkedIssue = il.outwardIssue || il.inwardIssue;
      if (!linkedIssue) return;
      const linkDesc = il.outwardIssue ? (il.type && il.type.outward) : (il.type && il.type.inward);
      const linkedFields = linkedIssue.fields || {};
      const linkColor = jiraStatusPillColor(linkedFields.status);
      wrap.appendChild(mk('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', padding: '8px 12px', marginBottom: '6px', cursor: 'pointer' },
        onclick: () => navigateToRelatedTicket(linkedIssue.key),
      }, [
        mk('div', { style: { fontSize: '12px', color: '#eef2f5' } }, [
          mk('span', { style: { color: '#8a96a3' } }, [(linkDesc || 'related to') + '  ']),
          mk('span', { style: { color: '#60a5fa', fontWeight: '700' } }, [linkedIssue.key]), '  ', linkedFields.summary || '',
        ]),
        linkedFields.status ? mk('span', { style: { fontSize: '10.5px', fontWeight: '700', color: linkColor, background: `${linkColor}1a`, border: `1px solid ${linkColor}`, borderRadius: '20px', padding: '2px 9px', flexShrink: '0' } }, [
          linkedFields.status.name,
        ]) : null,
      ].filter(Boolean)));
    });
    wrap.appendChild(mk('div', { style: { height: '8px' } }));
  }

  // ── Vínculo con AWX, si existe ──
  if (link) {
    const linkBox = mk('div', { style: { background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } });
    linkBox.appendChild(mk('div', {
      style: { fontSize: '12.5px', color: '#22c55e', fontWeight: '600', cursor: 'pointer' },
      onclick: () => {
        const tpl = state.awxTemplates.find((tplItem) => tplItem.id === link.templateId) || { id: link.templateId, name: link.templateName };
        openAwxDetail(tpl, 'jira-detail');
      },
    }, [`→ ${link.templateName}`]));
    linkBox.appendChild(mk('button', {
      style: { background: '#eef2f5', color: '#0a0e15', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
      onclick: () => launchLinkedJob(issue.key),
    }, ['▶ ' + t('inbox_execute')]));
    wrap.appendChild(linkBox);
  }

  // ── Comentarios existentes ──
  const existingComments = (f.comment && f.comment.comments) || [];
  if (existingComments.length > 0) {
    wrap.appendChild(mk('div', { style: { fontSize: '11px', color: '#8a96a3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' } }, [
      `Comments (${existingComments.length})`,
    ]));
    existingComments.forEach((c) => {
      // Jira usa DOS claves de propiedad distintas para esto (confirmado
      // contra datos reales de un ticket con 22 comentarios): la principal
      // es sd.public.comment con internal:true/false; la otra,
      // sd.allow.public.comment con allow:true/false, es un mecanismo
      // legacy que Atlassian mantiene por compatibilidad con plugins
      // antiguos y que en la práctica significa "público" cuando allow es
      // true. Si solo miráramos sd.public.comment, un comentario marcado
      // únicamente vía la propiedad legacy se trataría como público de
      // todas formas (es nuestro default), pero queremos que la detección
      // sea explícita y correcta, no correcta "por casualidad".
      const props = c.properties || [];
      const sdPublicComment = props.find((p) => p.key === 'sd.public.comment');
      const sdAllowPublicComment = props.find((p) => p.key === 'sd.allow.public.comment');
      const isInternal = sdPublicComment
        ? sdPublicComment.value && sdPublicComment.value.internal === true
        : sdAllowPublicComment
        ? sdAllowPublicComment.value && sdAllowPublicComment.value.allow === false
        : false;
      const commentCard = mk('div', {
        style: {
          background: isInternal ? '#201607' : '#0d141d',
          border: `1px solid ${isInternal ? '#5a3a0d' : '#1b2530'}`,
          borderRadius: '10px', padding: '12px 14px', marginBottom: '8px',
        },
      });
      const headerRow = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' } });
      const leftSide = mk('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
        mk('span', { style: { fontSize: '12px', color: '#eef2f5', fontWeight: '600' } }, [(c.author && c.author.displayName) || '—']),
      ]);
      if (isInternal) {
        leftSide.appendChild(mk('span', {
          style: {
            fontSize: '9.5px', fontWeight: '700', color: '#fbbf24', background: '#201607',
            border: '1px solid #5a3a0d', borderRadius: '6px', padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.3px',
          },
        }, ['🔒 Internal']));
      }
      headerRow.appendChild(leftSide);
      headerRow.appendChild(mk('span', { style: { fontSize: '11px', color: '#8a96a3' } }, [c.created ? new Date(c.created).toLocaleString() : '']));
      commentCard.appendChild(headerRow);
      const commentBody = mk('div', { style: { fontSize: '12.5px', color: '#eef2f5', lineHeight: '1.6' } });
      commentBody.innerHTML = jiraWikiToHtml(c.body || '');
      commentCard.appendChild(commentBody);
      wrap.appendChild(commentCard);
    });
    wrap.appendChild(mk('div', { style: { marginBottom: '16px' } }));
  }

  // ── Comentar — colapsado por defecto, se expande al hacer clic ──
  const commentBox = mk('div', { style: { marginBottom: '16px' } });

  if (!state.jiraCommentExpanded) {
    // Estado colapsado: una sola línea fina, sin barra de formato ni
    // botones — solo el placeholder invitando a escribir. Clic en
    // cualquier parte de la caja expande el composer completo.
    commentBox.appendChild(mk('div', {
      style: {
        background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '10px',
        padding: '9px 12px', fontSize: '13px', color: '#8a96a3', cursor: 'text',
      },
      onclick: () => { state.jiraCommentExpanded = true; renderApp(); },
    }, [t('jira_detail_comment_placeholder')]));
  } else {
    // Estado expandido: textarea + barra de acciones con clip integrado.
    const commentTextarea = mk('textarea', {
      style: {
        width: '100%', minHeight: '90px', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '4px 4px 0 0',
        borderBottom: 'none', padding: '12px', color: '#eef2f5', fontSize: '13px', resize: 'vertical', fontFamily: 'inherit',
      },
      placeholder: t('jira_detail_comment_placeholder'),
      'data-focus-key': 'jira-comment-draft',
      oninput: (e) => { state.jiraCommentDraft = e.target.value; renderApp(); },
    });
    commentTextarea.value = state.jiraCommentDraft;
    commentBox.appendChild(commentTextarea);

    // Los botones se desactivan solo si no hay NI texto NI adjunto
    // (antes solo miraban el texto, pero ahora solo el adjunto también
    // es suficiente para poder enviar).
    const commentDisabled = state.jiraCommentSending || (!state.jiraCommentDraft.trim() && !state.jiraCommentAttachment);
    const actionsRow = mk('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '14px', background: '#0d141d',
        border: '1px solid #1b2530', borderTop: 'none', borderRadius: '0 0 4px 4px', padding: '10px 12px',
        flexWrap: 'wrap',
      },
    });

    // Clip de adjunto — siempre visible, antes de los botones de envío
    const clipTitle = state.jiraCommentAttachment
      ? `${state.jiraCommentAttachment.name} (${(state.jiraCommentAttachment.size / 1024).toFixed(0)} KB) — click to change`
      : 'Attach a file';
    actionsRow.appendChild(mk('span', {
      style: { fontSize: '16px', cursor: 'pointer', color: state.jiraCommentAttachment ? '#38bdf8' : '#8a96a3', flexShrink: '0' },
      title: clipTitle,
      onclick: async () => {
        const att = await pickCommentAttachment();
        if (att) { state.jiraCommentAttachment = att; renderApp(); }
      },
    }, ['📎']));

    // Indicador del archivo seleccionado — aparece junto al clip si hay uno
    if (state.jiraCommentAttachment) {
      actionsRow.appendChild(mk('span', {
        style: { fontSize: '11.5px', color: '#38bdf8', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        title: state.jiraCommentAttachment.name,
      }, [state.jiraCommentAttachment.name]));
      actionsRow.appendChild(mk('span', {
        style: { fontSize: '11px', color: '#8a96a3', cursor: 'pointer', flexShrink: '0' },
        title: 'Remove attachment',
        onclick: () => { state.jiraCommentAttachment = null; renderApp(); },
      }, ['×']));
    }

    // Separador visual entre clip y botones de envío
    actionsRow.appendChild(mk('span', { style: { flex: '1' } }));

    actionsRow.appendChild(mk('button', {
      style: {
        background: commentDisabled ? '#1b2530' : '#2f7fbf', color: commentDisabled ? '#8a96a3' : '#ffffff',
        border: 'none', borderRadius: '6px', padding: '8px 18px', fontSize: '13px', fontWeight: '700',
        cursor: commentDisabled ? 'not-allowed' : 'pointer', flexShrink: '0',
      },
      onclick: () => { if (!commentDisabled) sendJiraComment(false); },
    }, [state.jiraCommentSending ? t('jira_detail_comment_sending') : 'Share with customer']));
    actionsRow.appendChild(mk('span', {
      style: { fontSize: '13px', color: commentDisabled ? '#8a96a3' : '#fbbf24', cursor: commentDisabled ? 'not-allowed' : 'pointer', fontWeight: '600', flexShrink: '0' },
      onclick: () => { if (!commentDisabled) sendJiraComment(true); },
    }, ['🔒 Comment internally']));
    actionsRow.appendChild(mk('span', {
      style: { fontSize: '12.5px', color: '#8a96a3', cursor: 'pointer', flexShrink: '0' },
      onclick: () => { state.jiraCommentDraft = ''; state.jiraCommentAttachment = null; state.jiraCommentExpanded = false; renderApp(); },
    }, ['Cancel']));
    commentBox.appendChild(actionsRow);
  }
  wrap.appendChild(commentBox);

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

// ── Prompt sello CorexTerm ──────────────────────────────────────────────
// Todas las sesiones SSH reciben al conectar el prompt distintivo de
// CorexTerm — inspirado en el dos-líneas de Kali pero con identidad propia:
// esquinas redondeadas (╭─ ╰─), tag "corex" y user@host en cyan:
//   ╭─corex─(user@host)─[~/ruta]
//   ╰─$
// Se inyecta como un one-liner al PTY (variable PS1/PROMPT de la shell
// remota): detecta bash vs zsh en el propio remoto, los glifos van como
// bytes UTF-8 literales (a prueba de locale C/POSIX — verificado contra
// bash 5 y zsh 5.9 reales), y NO persiste nada en el servidor: ni .bashrc
// ni .zshrc, dura esa sesión de shell. El espacio inicial lo mantiene
// fuera del history con el ignorespace por defecto.
function corexPromptCommand() {
  const bashPs1 = "PS1='\\[\\e[1;32m\\]╭─corex\\[\\e[0;32m\\]─(\\[\\e[1;36m\\]\\u@\\h\\[\\e[0;32m\\])─[\\[\\e[0m\\]\\w\\[\\e[0;32m\\]]\\n\\[\\e[0;32m\\]╰─\\[\\e[1;36m\\]\\$\\[\\e[0m\\] '";
  const zshPrompt = "PROMPT=$'%B%F{green}╭─corex%b%F{green}─(%B%F{cyan}%n@%m%b%F{green})─[%f%~%F{green}]\\n╰─%B%F{cyan}$%b%f '";
  return ` if [ -n "$ZSH_VERSION" ]; then ${zshPrompt}; else ${bashPs1}; fi\r`;
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
      background: '#0a0e15',
      foreground: '#eef2f5',
      cursor: '#eef2f5',
      cursorAccent: '#0a0e15',
      selectionBackground: '#1b253099',
      black: '#0a0e15',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#f59e0b',
      blue: '#38bdf8',
      magenta: '#c084fc',
      cyan: '#2dd4bf',
      white: '#eef2f5',
      brightBlack: '#8a96a3',
      brightRed: '#e36a6a',
      brightGreen: '#8be09c',
      brightYellow: '#fbbf24',
      brightBlue: '#7dd3fc',
      brightMagenta: '#c79bd6',
      brightCyan: '#5eead4',
      brightWhite: '#eef2f5',
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
  // openTerminalTab ya llamó a renderApp() — el contenedor xterm-container-${terminalId}
  // ya existe en el DOM en este punto. Usamos rAF para dejar que el browser
  // complete el layout y calcule las dimensiones reales del contenedor.
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
    state.ctTerminalInstances[terminalId].xtermContainer = container;
    state.ctTerminalInstances[terminalId].xtermOpened = true;

    term.onData((data) => { writeToTerminal(terminalId, data); });

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
      // NO llamamos a renderApp() aquí para no destruir el contenedor
      // donde xterm ya está montado. Solo actualizamos el punto verde.
      const dot = document.querySelector(`[data-terminal-dot="${terminalId}"]`);
      if (dot) {
        dot.style.background = '#22c55e';
        dot.style.boxShadow = '0 0 4px #22c55e';
      }
      const connectingLabel = document.querySelector(`[data-terminal-connecting="${terminalId}"]`);
      if (connectingLabel) connectingLabel.remove();
    });

    window.corexAPI.corextermSftpConnect(session.id).then((res) => {
      if (state.ctTerminalInstances[terminalId]) {
        state.ctTerminalInstances[terminalId].sftpReady = !!res.ok;
        // SFTP automático: en cuanto el canal SFTP está listo, abrimos el
        // navegador de archivos junto al terminal — sin renderApp() (ver
        // autoOpenSftpOnConnect para el porqué y el mecanismo).
        if (res.ok) autoOpenSftpOnConnect(terminalId);
        // Sello CorexTerm: TODAS las sesiones SSH reciben el prompt propio
        // al conectar — es marca de la casa, sin opción que configurar. El
        // delay da margen a que la shell pinte su primer prompt antes del
        // one-liner (solo corextermWrite — cero renderApp, invariante a
        // salvo). Si la pestaña se cerró entre medias, no se envía nada.
        setTimeout(() => {
          const still = state.ctTerminalInstances[terminalId];
          if (still && still.connected) window.corexAPI.corextermWrite(terminalId, corexPromptCommand());
        }, 900);
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
    state.ctTerminalInstances[terminalId].xtermContainer = container;
    state.ctTerminalInstances[terminalId].xtermOpened = true;

    term.onData((data) => { window.corexAPI.corextermWrite(terminalId, data); });

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
      const dot = document.querySelector(`[data-terminal-dot="${terminalId}"]`);
      if (dot) { dot.style.background = '#22c55e'; dot.style.boxShadow = '0 0 4px #22c55e'; }
      const lbl = document.querySelector(`[data-terminal-connecting="${terminalId}"]`);
      if (lbl) lbl.remove();
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
    state.ctSftpEntries = sortSftpEntries(res.entries);
  }
  renderApp();
}

// Carpetas primero, luego archivos, ambos alfabéticos — más fácil de
// escanear visualmente que el orden crudo que devuelve el servidor.
function sortSftpEntries(entries) {
  return entries
    .filter((e) => e.name !== '.')
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

// SFTP automático al conectar una sesión SSH — versión "quirúrgica".
// REGLA DE ORO de CorexTerm: nada que corra dentro de un callback de
// conexión puede llamar a renderApp() (destruiría/re-crearía nodos mientras
// xterm está montándose — el bug del prompt vacío de v67). Por eso este
// camino NO reutiliza loadSftpDir() (que sí re-renderiza, y es correcto que
// lo haga cuando lo dispara un clic del usuario): carga el listado, deja el
// estado consistente y luego inserta el panel directamente en el DOM vivo
// usando el hook [data-terminal-bodyrow], el mismo patrón que ya usa el
// punto verde de estado ([data-terminal-dot]).
async function autoOpenSftpOnConnect(terminalId) {
  const inst = state.ctTerminalInstances[terminalId];
  if (!inst || inst.kind !== 'ssh' || !inst.session) return;
  // Si el usuario ya tiene abierto el SFTP de OTRA pestaña, no se lo
  // pisamos — el auto-open es una comodidad, no una imposición.
  if (state.ctSftpOpenFor && state.ctSftpOpenFor !== terminalId) return;

  state.ctSftpOpenFor = terminalId;
  state.ctSftpPath = '.';
  state.ctSftpLoading = true;
  state.ctSftpError = null;

  const res = await window.corexAPI.corextermSftpList(inst.session.id, '.');
  state.ctSftpLoading = false;
  if (!res.ok) {
    state.ctSftpError = res.error;
  } else {
    state.ctSftpEntries = sortSftpEntries(res.entries);
  }

  // Si mientras cargaba el listado el usuario cerró el panel o abrió el de
  // otra pestaña, respetamos su decisión y no insertamos nada.
  if (state.ctSftpOpenFor !== terminalId) return;

  const bodyRow = document.querySelector(`[data-terminal-bodyrow="${terminalId}"]`);
  if (!bodyRow) {
    // La pestaña no está visible ahora mismo (el usuario navegó a otra
    // vista o a otra pestaña). No pasa nada: el estado ya quedó puesto, así
    // que el próximo renderApp() normal pintará el panel él solo.
    return;
  }
  if (bodyRow.querySelector(`[data-sftp-panel="${terminalId}"]`)) return; // ya está

  const panel = renderSftpPanel(inst.session.id);
  panel.setAttribute('data-sftp-panel', terminalId);
  bodyRow.appendChild(panel);

  // El terminal pierde ancho al aparecer el panel — recalcular el fit,
  // igual que hace toggleSftpPanel() en el camino manual.
  requestAnimationFrame(() => {
    if (inst.fitAddon) {
      inst.fitAddon.fit();
      if (inst.term) window.corexAPI.corextermResize(terminalId, inst.term.cols, inst.term.rows);
    }
  });
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
// ═══════════════════════════════════════════════════════════════════════════
//  Icinga — Monitor (vista 'monitor') + widgets del Cockpit. Fase 1: lectura.
// ═══════════════════════════════════════════════════════════════════════════

function icingaConfigured() {
  return !!(state.config.icinga && state.config.icinga.url && state.config.icinga.username);
}

function profileTeam() {
  return (state.config.profile && state.config.profile.team) || 'both';
}

async function loadIcinga() {
  if (!icingaConfigured()) return;
  state.icingaLoading = true;
  state.icingaError = null;
  renderApp();
  const team = profileTeam();
  const [sum, hosts, services] = await Promise.all([
    window.corexAPI.icingaSummary(),
    window.corexAPI.icingaProblems('hosts', team),
    window.corexAPI.icingaProblems('services', team),
  ]);
  state.icingaLoading = false;
  if (!sum.ok) { state.icingaError = sum.error; renderApp(); return; }
  state.icingaSummary = sum.summary;
  state.icingaProblems.hosts = hosts.ok ? hosts.problems : [];
  state.icingaProblems.services = services.ok ? services.problems : [];
  if (!hosts.ok || !services.ok) state.icingaError = (hosts.error || services.error);
  renderApp();
}

const ICINGA_SVC_STATE = { 1: { label: 'WARNING', color: '#f59e0b' }, 2: { label: 'CRITICAL', color: '#ef4444' }, 3: { label: 'UNKNOWN', color: '#a78bfa' } };
const ICINGA_HOST_STATE = { 1: { label: 'DOWN', color: '#ef4444' }, 2: { label: 'UNREACHABLE', color: '#a78bfa' } };

function renderMonitorView() {
  const wrap = mk('div', { style: { maxWidth: '1200px' } });
  if (!icingaConfigured()) {
    wrap.appendChild(mk('div', { style: { fontSize: '12.5px', color: CX.textMuted } }, [
      'Icinga is not configured yet — set the API URL and credentials in Settings → Icinga.',
    ]));
    return wrap;
  }

  // ── Cabecera: resumen tipo Icingaweb (contadores) + acciones ──
  const s = state.icingaSummary;
  const head = mk('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' } });
  const stat = (label, value, color) => mk('div', {
    style: { background: CX.bgPanel, border: `1px solid ${CX.borderSubtle}`, borderRadius: '10px', padding: '10px 16px', textAlign: 'center', minWidth: '110px' },
  }, [
    mk('div', { style: { fontSize: '10px', color: CX.textMuted, marginBottom: '4px' } }, [label]),
    mk('div', { style: { fontSize: '22px', fontWeight: '700', color, fontFamily: "'IBM Plex Mono', monospace" } }, [String(value)]),
  ]);
  if (s) {
    head.appendChild(stat('Hosts OK', s.hostsUp, CX.green));
    head.appendChild(stat('Hosts DOWN', s.hostsDown, s.hostsDown > 0 ? CX.red : CX.green));
    head.appendChild(stat('Services OK', s.servicesOk, CX.green));
    head.appendChild(stat('Critical', s.servicesCritical, s.servicesCritical > 0 ? CX.red : CX.green));
    head.appendChild(stat('Warning', s.servicesWarning, s.servicesWarning > 0 ? CX.amber : CX.green));
    head.appendChild(stat('Unknown', s.servicesUnknown, s.servicesUnknown > 0 ? CX.purple : CX.green));
  } else if (state.icingaLoading) {
    head.appendChild(mk('div', { style: { fontSize: '12px', color: CX.textMuted } }, ['Loading Icinga status…']));
  }
  head.appendChild(mk('span', { style: { flex: '1' } }));
  head.appendChild(mk('span', { style: { fontSize: '10.5px', color: CX.textMuted } }, [`Team: ${profileTeam()}`]));
  head.appendChild(mk('button', {
    style: { background: 'transparent', border: `1px solid ${CX.borderSubtle}`, color: CX.textPrimary, borderRadius: '6px', padding: '6px 14px', fontSize: '11.5px', cursor: 'pointer' },
    onclick: () => loadIcinga(),
  }, ['↻ Refresh']));
  if (state.config.icinga.webUrl) {
    head.appendChild(mk('button', {
      style: { background: 'transparent', border: `1px solid ${CX.borderSubtle}`, color: CX.blue, borderRadius: '6px', padding: '6px 14px', fontSize: '11.5px', cursor: 'pointer' },
      onclick: () => window.corexAPI.openExternal ? window.corexAPI.openExternal(state.config.icinga.webUrl) : window.open(state.config.icinga.webUrl),
    }, ['Open Icinga Web ↗']));
  }
  wrap.appendChild(head);

  if (state.icingaError) {
    wrap.appendChild(mk('div', { style: { fontSize: '12px', color: CX.red, marginBottom: '12px' } }, [state.icingaError]));
  }

  // ── Nota honesta sobre el alcance de fase 1 ──
  // Los contadores de arriba son GLOBALES (CIB de Icinga); las listas de
  // abajo sí respetan tu filtro de equipo. En fase 2 (acknowledge/downtime)
  // se puede añadir el desglose handled/unhandled por equipo con queries
  // dedicadas si hace falta.

  // ── Tabs hosts/servicios ──
  const tabs = mk('div', { style: { display: 'flex', gap: '16px', borderBottom: `1px solid ${CX.borderSubtle}`, marginBottom: '0', fontSize: '12px' } });
  [['services', `Service problems (${state.icingaProblems.services.length})`], ['hosts', `Host problems (${state.icingaProblems.hosts.length})`]].forEach(([id, label]) => {
    const active = state.monitorTab === id;
    tabs.appendChild(mk('div', {
      style: {
        paddingBottom: '8px', cursor: 'pointer', color: active ? CX.textPrimary : CX.textSecondary,
        fontWeight: active ? '600' : '400', borderBottom: active ? `2px solid ${CX.blue}` : '2px solid transparent', marginBottom: '-1px',
      },
      onclick: () => { state.monitorTab = id; renderApp(); },
    }, [label]));
  });
  wrap.appendChild(tabs);

  const isServices = state.monitorTab === 'services';
  const list = state.icingaProblems[state.monitorTab] || [];
  const panel = mk('div', { style: { background: CX.bgPanel, border: `1px solid ${CX.borderSubtle}`, borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' } });
  if (list.length === 0) {
    panel.appendChild(mk('div', { style: { padding: '18px 16px', fontSize: '12px', color: CX.textMuted } }, [
      state.icingaLoading ? 'Loading…' : 'No problems for your team filter. 🎉',
    ]));
  }
  list.slice(0, 100).forEach((p) => {
    const st = (isServices ? ICINGA_SVC_STATE : ICINGA_HOST_STATE)[p.state] || { label: `STATE ${p.state}`, color: CX.textMuted };
    const row = mk('div', {
      style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 14px', borderBottom: '1px solid #121a22', position: 'relative' },
    }, [
      mk('span', {
        style: { fontSize: '9.5px', fontWeight: '700', color: st.color, border: `1px solid ${st.color}55`, background: `${st.color}18`, borderRadius: '5px', padding: '2px 8px', flexShrink: '0', minWidth: '78px', textAlign: 'center' },
      }, [st.label]),
      mk('span', { style: { flex: '1', minWidth: '0' } }, [
        mk('div', { style: { fontSize: '12px', fontWeight: '600', color: CX.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [
          isServices ? `${p.name} on ${p.host}` : p.host,
        ]),
        mk('div', { style: { fontSize: '10.5px', color: CX.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: p.output }, [p.output || '—']),
      ]),
      p.handled ? mk('span', { style: { fontSize: '9.5px', color: CX.textMuted, border: `1px solid ${CX.borderSubtle}`, borderRadius: '5px', padding: '2px 7px', flexShrink: '0' }, title: 'Acknowledged or in downtime' }, ['handled']) : null,
      p.since ? mk('span', { style: { fontSize: '10px', color: CX.textMuted, flexShrink: '0' } }, [timeAgoShort(p.since * 1000)]) : null,
    ].filter(Boolean));
    row.appendChild(mk('span', { style: { position: 'absolute', left: '0', top: '0', bottom: '0', width: '3px', background: st.color } }));
    panel.appendChild(row);
  });
  if (list.length > 100) {
    panel.appendChild(mk('div', { style: { padding: '10px 14px', fontSize: '11px', color: CX.textMuted } }, [`… and ${list.length - 100} more — refine your team filter or open Icinga Web.`]));
  }
  wrap.appendChild(panel);
  return wrap;
}

function timeAgoShort(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / (60 * 24))}d`;
}

// ── Widgets Icinga del Cockpit ──
function renderKpiMonitoring() {
  if (!icingaConfigured()) {
    return cxKpiCard('neutral', 'Monitoring', 'Icinga', '—', 'Not configured — Settings → Icinga', CX_SVG.pulse);
  }
  const s = state.icingaSummary;
  if (!s) return cxKpiCard('neutral', 'Monitoring', 'Icinga', '…', 'Loading', CX_SVG.pulse);
  const bad = s.hostsDown + s.servicesCritical;
  const variant = s.hostsDown > 0 || s.servicesCritical > 0 ? 'red' : (s.servicesWarning > 0 ? 'amber' : 'mint');
  return cxKpiCard(
    variant, 'Monitoring', `${s.hostsDown} hosts down · ${s.servicesCritical} crit · ${s.servicesWarning} warn`,
    variant === 'mint' ? 'All OK' : String(bad),
    variant === 'mint' ? null : 'Open Monitor for details',
    CX_SVG.pulse,
  );
}

function renderIcingaProblemsSection() {
  if (!icingaConfigured()) return null;
  const panel = mk('div', {
    style: { background: CX.bgPanel, border: `1px solid ${CX.borderSubtle}`, borderRadius: '10px', overflow: 'hidden', marginBottom: '20px' },
  });
  panel.appendChild(mk('div', {
    style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${CX.borderSubtle}` },
  }, [
    mk('div', { style: { fontSize: '13.5px', fontWeight: '700', color: CX.textPrimary } }, ['Monitoring — top problems']),
    mk('div', {
      style: { fontSize: '11px', color: CX.blue, cursor: 'pointer' },
      onclick: () => { state.view = 'monitor'; renderApp(); loadIcinga(); },
    }, ['Open Monitor →']),
  ]));
  const all = [
    ...state.icingaProblems.services.filter((p) => !p.handled).map((p) => ({ ...p, kind: 'svc' })),
    ...state.icingaProblems.hosts.filter((p) => !p.handled).map((p) => ({ ...p, kind: 'host' })),
  ].slice(0, 6);
  if (all.length === 0) {
    panel.appendChild(mk('div', { style: { padding: '14px 16px', fontSize: '12px', color: CX.textMuted } }, [
      state.icingaSummary ? 'No unhandled problems for your team. 🎉' : 'Loading…',
    ]));
  }
  all.forEach((p) => {
    const st = (p.kind === 'svc' ? ICINGA_SVC_STATE : ICINGA_HOST_STATE)[p.state] || { label: '?', color: CX.textMuted };
    panel.appendChild(mk('div', {
      style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', borderBottom: '1px solid #121a22', fontSize: '11.5px' },
    }, [
      mk('span', { style: { fontSize: '9px', fontWeight: '700', color: st.color, minWidth: '64px' } }, [st.label]),
      mk('span', { style: { flex: '1', color: CX.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: p.output }, [
        p.kind === 'svc' ? `${p.name} on ${p.host}` : p.host,
      ]),
      p.since ? mk('span', { style: { fontSize: '10px', color: CX.textMuted } }, [timeAgoShort(p.since * 1000)]) : null,
    ].filter(Boolean)));
  });
  return panel;
}

// ═══ Vistas nuevas del sidebar (organización del mockup) ═══

// Jobs — historial de ejecuciones AWX a página completa. Reutiliza el
// renderRecentJobsSection existente (mismos datos de loadAwxRecentJobs).
function renderAwxJobsView() {
  const wrap = mk('div', { style: { maxWidth: '1000px' } });
  if (!(state.config.awx && state.config.awx.url)) {
    wrap.appendChild(mk('div', { style: { fontSize: '12.5px', color: CX.textMuted } }, ['AWX is not configured — set it up in Settings.']));
    return wrap;
  }
  const section = renderRecentJobsSection();
  if (section) wrap.appendChild(section);
  else wrap.appendChild(mk('div', { style: { fontSize: '12.5px', color: CX.textMuted } }, ['No recent jobs.']));
  return wrap;
}

// Sessions — gestor de sesiones guardadas a página completa (crear/editar/
// borrar), separado del workspace de terminales. Reutiliza la lista y el
// formulario existentes de CorexTerm.
function renderCtSessionsManagerView() {
  const wrap = mk('div', { style: { maxWidth: '900px' } });
  if (state.ctShowSessionForm) {
    wrap.appendChild(renderCtSessionForm());
    return wrap;
  }
  wrap.appendChild(renderCtSessionList());
  return wrap;
}

// Workspaces — gestor de plantillas del Cockpit: lista con widgets que
// contiene cada una, activar, renombrar, borrar y crear.
function renderWorkspacesView() {
  ensureDashWorkspaces();
  const wrap = mk('div', { style: { maxWidth: '860px' } });

  state.dashWorkspaces.forEach((w) => {
    const active = w.id === state.activeDashWorkspaceId;
    const card = mk('div', {
      style: {
        background: CX.bgPanel, border: `1px solid ${active ? '#173321' : CX.borderSubtle}`,
        borderRadius: '10px', padding: '16px 18px', marginBottom: '12px',
        boxShadow: active ? 'inset 3px 0 0 ' + CX.green : 'none',
      },
    });
    card.appendChild(mk('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } }, [
      mk('span', { style: { fontSize: '13.5px', fontWeight: '700', color: CX.textPrimary } }, [w.name]),
      active ? mk('span', { style: { fontSize: '10px', fontWeight: '700', color: CX.green, background: CX.greenDim, borderRadius: '999px', padding: '2px 8px' } }, ['ACTIVE']) : null,
      mk('span', { style: { flex: '1' } }),
      !active ? mk('button', {
        style: { background: 'transparent', border: `1px solid ${CX.borderSubtle}`, color: CX.textPrimary, borderRadius: '6px', padding: '4px 12px', fontSize: '11px', cursor: 'pointer' },
        onclick: () => switchDashWorkspace(w.id),
      }, ['Activate']) : null,
      mk('button', {
        style: { background: 'transparent', border: `1px solid ${CX.borderSubtle}`, color: CX.textSecondary, borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' },
        onclick: () => renameDashWorkspace(w.id),
      }, ['Rename']),
      mk('button', {
        style: { background: 'transparent', border: `1px solid ${CX.borderSubtle}`, color: CX.red, borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' },
        onclick: () => deleteDashWorkspace(w.id),
      }, ['Delete']),
    ].filter(Boolean)));
    // Widgets de la plantilla como chips
    const chipRow = mk('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } });
    w.widgets.forEach((id) => {
      const def = DASH_WIDGETS[id];
      if (!def) return;
      chipRow.appendChild(mk('span', {
        style: { fontSize: '10.5px', color: CX.textSecondary, background: CX.bgPanelAlt, border: `1px solid ${CX.borderSubtle}`, borderRadius: '999px', padding: '2px 9px' },
      }, [def.label]));
    });
    card.appendChild(chipRow);
    wrap.appendChild(card);
  });

  wrap.appendChild(mk('button', {
    style: {
      background: 'transparent', border: `1px dashed ${CX.borderSubtle}`, color: CX.textMuted,
      borderRadius: '10px', padding: '12px', fontSize: '12px', cursor: 'pointer', width: '100%',
    },
    onclick: createDashWorkspace,
  }, ['+ New workspace (copies current layout)']));

  return wrap;
}

// CorexTerm — layout del mockup: sidebar de sesiones SIEMPRE visible a la
// izquierda (árbol por carpetas, búsqueda, + New) y a la derecha la barra
// de pestañas SIEMPRE presente (aunque no haya terminales: queda el "+"
// para abrir local/SSH) sobre el área del terminal o un estado vacío.
// Los invariantes del terminal no cambian: renderCtActiveTerminal /
// renderCtSplitGrid siguen montando xterm igual que antes.
function renderCorexTermView() {
  const hasOpenTabs = state.ctOpenTerminalIds.length > 0;
  const wrap = mk('div', { style: { height: '100%', display: 'flex', gap: '0', minHeight: '0' } });

  if (!state.vaultUnlocked) {
    wrap.appendChild(mk('div', { style: { fontSize: '13px', color: '#f59e0b' } }, ['Vault is locked. Please restart COREX.']));
    return wrap;
  }

  // ── Sidebar de sesiones (mockup) ──
  wrap.appendChild(renderCtSessionsSidebar());

  // ── Columna principal ──
  const mainCol = mk('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', minWidth: '0', minHeight: '0' } });
  mainCol.appendChild(renderCtTabBar()); // siempre: el "+" vive aquí
  if (state.ctShowMacroPanel) mainCol.appendChild(renderMacroPanel());

  if (state.ctShowSessionForm) {
    // El formulario (nueva sesión / editar / quick SSH) se muestra en el
    // área principal, con el sidebar aún visible.
    const formScroll = mk('div', { style: { flex: '1', overflowY: 'auto', padding: '18px 24px', background: CX.bgPanel, border: `1px solid ${CX.borderSubtle}`, borderTop: 'none', borderRadius: '0 0 10px 10px' } });
    formScroll.appendChild(renderCtSessionForm());
    mainCol.appendChild(formScroll);
  } else if (hasOpenTabs) {
    mainCol.appendChild(state.ctSplitMode !== 'single' ? renderCtSplitGrid() : renderCtActiveTerminal());
  } else {
    // Estado vacío: sin terminales abiertos.
    mainCol.appendChild(mk('div', {
      style: {
        flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '10px', color: CX.textMuted, border: `1px solid ${CX.borderSubtle}`, borderTop: 'none',
        borderRadius: '0 0 10px 10px', background: '#080d13',
      },
    }, [
      mk('div', { style: { fontSize: '26px', opacity: '0.5' } }, ['❯_']),
      mk('div', { style: { fontSize: '12.5px' } }, ['No open terminals']),
      mk('div', { style: { fontSize: '11px' } }, ['Pick a session on the left, or press + for a local shell or a quick SSH connection.']),
    ]));
  }
  wrap.appendChild(mainCol);
  return wrap;
}

// Sidebar de sesiones estilo mockup: cabecera con "+ New", búsqueda y árbol
// por carpetas con dots de color. Conectar es un clic en la sesión.
function renderCtSessionsSidebar() {
  const side = mk('div', {
    style: {
      width: '190px', flexShrink: '0', background: CX.bgPanelAlt, border: `1px solid ${CX.borderSubtle}`,
      borderRadius: '10px 0 0 10px', borderRight: 'none', display: 'flex', flexDirection: 'column', minHeight: '0',
    },
  });
  side.appendChild(mk('div', {
    style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px' },
  }, [
    mk('span', { style: { fontSize: '11.5px', fontWeight: '700', color: CX.textPrimary } }, ['Sessions']),
    mk('span', {
      style: { fontSize: '10.5px', fontWeight: '700', color: CX.green, cursor: 'pointer' },
      onclick: () => openNewSessionForm(),
      title: 'New saved session',
    }, ['+ New']),
  ]));
  side.appendChild(mk('input', {
    style: {
      margin: '0 10px 8px', background: CX.bgInput, border: `1px solid ${CX.borderSubtle}`,
      borderRadius: '6px', padding: '5px 8px', fontSize: '11px', color: CX.textPrimary,
    },
    type: 'text', placeholder: 'Search sessions…', value: state.ctSessionSearch || '',
    'data-focus-key': 'ct-session-search',
    oninput: (e) => { state.ctSessionSearch = e.target.value; renderApp(); },
  }));

  const tree = mk('div', { style: { flex: '1', overflowY: 'auto', paddingBottom: '8px' } });
  const q = (state.ctSessionSearch || '').toLowerCase();
  const filtered = state.ctSessions.filter((s) => !q || s.name.toLowerCase().includes(q) || (s.host || '').toLowerCase().includes(q));

  // Agrupar por carpeta (las sin carpeta van a 'Other' al final)
  const groups = {};
  filtered.forEach((s) => {
    const g = (s.folder || '').trim() || 'Other';
    (groups[g] = groups[g] || []).push(s);
  });
  if (!state.ctSidebarFolderCollapsed) state.ctSidebarFolderCollapsed = {};
  Object.keys(groups).sort((a, b) => (a === 'Other') - (b === 'Other') || a.localeCompare(b)).forEach((g) => {
    const collapsed = !!state.ctSidebarFolderCollapsed[g];
    tree.appendChild(mk('div', {
      style: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontWeight: '700', color: CX.textMuted, padding: '6px 12px 2px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.4px' },
      onclick: () => { state.ctSidebarFolderCollapsed[g] = !collapsed; renderApp(); },
    }, [mk('span', { style: { fontSize: '8px' } }, [collapsed ? '▸' : '▾']), `${g} (${groups[g].length})`]));
    if (collapsed) return;
    groups[g].forEach((s) => {
      // ¿Ya hay un terminal abierto de esta sesión? → dot verde
      const isOpen = state.ctOpenTerminalIds.some((id) => {
        const inst = state.ctTerminalInstances[id];
        return inst && inst.session && inst.session.id === s.id && inst.connected;
      });
      tree.appendChild(mk('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 12px 5px 18px',
          fontSize: '11.5px', color: isOpen ? CX.textPrimary : CX.textSecondary, cursor: 'pointer',
          background: isOpen ? '#13291d' : 'transparent',
        },
        title: `${s.username}@${s.host}:${s.port} — click to open a terminal`,
        onclick: () => connectSession(s),
      }, [
        mk('span', { style: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: '0', background: isOpen ? CX.green : (s.color || CX.textMuted) } }),
        mk('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [s.name]),
      ]));
    });
  });
  if (filtered.length === 0) {
    tree.appendChild(mk('div', { style: { fontSize: '11px', color: CX.textMuted, padding: '10px 12px' } }, [
      state.ctSessions.length === 0 ? 'No saved sessions yet — use + New.' : 'No matches.',
    ]));
  }
  side.appendChild(tree);

  // Acceso al gestor completo (editar/borrar) — vista Sessions del sidebar.
  side.appendChild(mk('div', {
    style: { fontSize: '10.5px', color: CX.blue, padding: '8px 12px', borderTop: `1px solid ${CX.borderSubtle}`, cursor: 'pointer' },
    onclick: () => { state.view = 'ct-sessions'; renderApp(); },
  }, ['Manage sessions →']));

  return side;
}

// Barra de pestañas horizontal, estilo navegador: una por cada terminal
// abierto (SSH o local), con su estado de conexión y botón de cierre.
function renderCtTabBar() {
  const bar = mk('div', {
    style: {
      display: 'flex', gap: '2px', marginBottom: '0', borderBottom: '1px solid #1b2530',
      // overflow visible mientras el menú del + está abierto: overflowX:auto
      // RECORTA los hijos position:absolute (el dropdown se abría invisible
      // — el bug de "el + no hace nada" de v76). Con muchas pestañas y el
      // menú cerrado, vuelve el scroll horizontal normal.
      overflowX: state.ctNewTabMenuOpen ? 'visible' : 'auto',
      background: CX.bgPanel, border: `1px solid ${CX.borderSubtle}`,
      borderRadius: '0 10px 0 0', minHeight: '36px', alignItems: 'stretch', flexShrink: '0',
    },
  });

  state.ctOpenTerminalIds.forEach((id) => {
    const inst = state.ctTerminalInstances[id];
    if (!inst) return;
    const active = state.ctActiveTerminalId === id;
    const dotColor = inst.connected ? '#22c55e' : '#f59e0b';

    const tab = mk('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 10px',
        background: active ? '#0d141d' : 'transparent',
        border: `1px solid ${state.ctBroadcastMode && inst.kind === 'ssh' ? '#f59e0b' : (active ? '#1b2530' : 'transparent')}`,
        borderBottom: active ? '1px solid #0d141d' : '1px solid transparent',
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
      style: { fontSize: '11.5px', color: active ? '#eef2f5' : '#8a96a3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    }, [inst.label || (inst.session ? inst.session.name : 'Terminal')]));
    tab.appendChild(mk('span', {
      style: { fontSize: '13px', color: '#8a96a3', cursor: 'pointer', flexShrink: '0', lineHeight: '1', padding: '0 2px' },
      onclick: (e) => { e.stopPropagation(); closeTab(id); },
    }, ['×']));
    bar.appendChild(tab);
  });

  // "+" — despliega un menú con las sesiones guardadas y la opción de
  // terminal local, igual que MobaXterm: sin salir de la vista actual.
  const plusWrapper = mk('div', { style: { position: 'relative' } });
  plusWrapper.appendChild(mk('div', {
    style: { display: 'flex', alignItems: 'center', padding: '7px 12px', cursor: 'pointer', color: '#8a96a3', fontSize: '14px' },
    onclick: (e) => {
      e.stopPropagation();
      state.ctNewTabMenuOpen = !state.ctNewTabMenuOpen;
      renderApp();
    },
  }, ['+']));
  if (state.ctNewTabMenuOpen) {
    const menu = mk('div', {
      style: {
        position: 'absolute', top: '100%', left: '0', zIndex: '200', background: '#0d141d',
        border: '1px solid #1b2530', borderRadius: '10px', minWidth: '220px', boxShadow: '0 8px 24px #00000088',
        padding: '4px 0',
      },
    });
    // Terminal local primero
    menu.appendChild(mk('div', {
      style: { padding: '8px 14px', fontSize: '12.5px', color: '#eef2f5', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' },
      onmouseenter: (e) => { e.target.closest('div').style.background = '#16222e'; },
      onmouseleave: (e) => { e.target.closest('div').style.background = 'transparent'; },
      onclick: () => { state.ctNewTabMenuOpen = false; connectLocalTerminal(); },
    }, ['▸_', mk('span', {}, ['Local terminal'])]));
    // Quick SSH: conectar a un servidor NO guardado — abre el formulario de
    // sesión (con su Save & Connect); responde al caso "conectarme a otro
    // server sin tenerlo en la lista".
    menu.appendChild(mk('div', {
      style: { padding: '8px 14px', fontSize: '12.5px', color: '#eef2f5', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' },
      onmouseenter: (e) => { e.currentTarget.style.background = '#16222e'; },
      onmouseleave: (e) => { e.currentTarget.style.background = 'transparent'; },
      onclick: () => {
        state.ctNewTabMenuOpen = false;
        openNewSessionForm(); // inicializa el form en blanco Y renderiza
      },
    }, ['⇄', mk('span', {}, ['New SSH session…'])]));
    // Separador si hay sesiones
    if (state.ctSessions.length > 0) {
      menu.appendChild(mk('div', { style: { borderTop: '1px solid #1b2530', margin: '4px 0' } }));
      state.ctSessions.forEach((s) => {
        menu.appendChild(mk('div', {
          style: { padding: '7px 14px', fontSize: '12px', color: '#aab6c3', cursor: 'pointer' },
          onmouseenter: (e) => { e.currentTarget.style.background = '#16222e'; e.currentTarget.style.color = '#eef2f5'; },
          onmouseleave: (e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#aab6c3'; },
          onclick: () => { state.ctNewTabMenuOpen = false; connectSession(s); },
        }, [s.name]));
      });
    }
    plusWrapper.appendChild(menu);
    // Cerrar al hacer clic fuera
    setTimeout(() => {
      const closeMenu = () => { state.ctNewTabMenuOpen = false; renderApp(); document.removeEventListener('click', closeMenu); };
      document.addEventListener('click', closeMenu);
    }, 0);
  }
  bar.appendChild(plusWrapper);

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
        fontSize: '13px', padding: '4px 7px', cursor: 'pointer', borderRadius: '6px',
        color: isActive ? '#eef2f5' : '#8a96a3',
        background: isActive ? '#16222e' : 'transparent',
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
      borderRadius: '6px', marginLeft: '6px',
      color: state.ctBroadcastMode ? '#0a0e15' : (sshTabCount > 1 ? '#8a96a3' : '#3a4650'),
      background: state.ctBroadcastMode ? '#f59e0b' : 'transparent',
      border: `1px solid ${state.ctBroadcastMode ? '#f59e0b' : '#1b2530'}`,
    },
    title: sshTabCount > 1 ? 'MultiExec: type once, send to all open SSH tabs' : 'Open 2+ SSH tabs to use MultiExec',
    onclick: () => { if (sshTabCount > 1) { state.ctBroadcastMode = !state.ctBroadcastMode; renderApp(); } },
  }, ['MultiExec']));

  // Macros — grabar/parar y abrir el panel de macros guardadas.
  splitGroup.appendChild(mk('span', {
    style: {
      fontSize: '11px', fontWeight: '700', padding: '4px 9px', cursor: 'pointer',
      borderRadius: '6px', marginLeft: '6px', display: 'flex', alignItems: 'center', gap: '5px',
      color: state.ctRecordingMacro ? '#0a0e15' : '#8a96a3',
      background: state.ctRecordingMacro ? '#ef4444' : 'transparent',
      border: `1px solid ${state.ctRecordingMacro ? '#ef4444' : '#1b2530'}`,
    },
    title: state.ctRecordingMacro ? 'Stop recording and save macro' : 'Record a new macro',
    onclick: () => { state.ctRecordingMacro ? stopRecordingMacro() : startRecordingMacro(); },
  }, [
    mk('span', { style: { display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: state.ctRecordingMacro ? '#0a0e15' : '#ef4444' } }),
    state.ctRecordingMacro ? 'Stop' : 'Record',
  ]));
  splitGroup.appendChild(mk('span', {
    style: {
      fontSize: '13px', padding: '4px 7px', cursor: 'pointer', borderRadius: '6px',
      color: state.ctShowMacroPanel ? '#eef2f5' : '#8a96a3',
      background: state.ctShowMacroPanel ? '#16222e' : 'transparent',
    },
    title: 'Saved macros',
    onclick: () => toggleMacroPanel(),
  }, ['☰']));
  bar.appendChild(splitGroup);

  return bar;
}

function renderMacroPanel() {
  const panel = mk('div', { style: { background: '#0d141d', border: '1px solid #1b2530', borderTop: 'none', borderRadius: '0 0 3px 3px', padding: '10px 14px', marginBottom: '10px' } });
  panel.appendChild(mk('div', { style: { fontSize: '10.5px', fontWeight: '700', color: '#8a96a3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' } }, ['Saved macros']));

  if (state.ctMacros.length === 0) {
    panel.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#8a96a3' } }, [
      'No macros yet. Hit "Record" in the tab bar, type a sequence, then "Stop" to save it.',
    ]));
    return panel;
  }

  state.ctMacros.forEach((macro) => {
    const row = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' } });
    row.appendChild(mk('span', { style: { fontSize: '12px', color: '#eef2f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [macro.name]));
    const actions = mk('div', { style: { display: 'flex', gap: '10px', flexShrink: '0' } });
    actions.appendChild(mk('span', {
      style: { fontSize: '11px', color: '#22c55e', cursor: 'pointer', fontWeight: '700' },
      onclick: () => playMacro(macro),
    }, ['▶ Play']));
    actions.appendChild(mk('span', {
      style: { fontSize: '11px', color: '#8a96a3', cursor: 'pointer' },
      onclick: () => deleteMacro(macro.id),
    }, ['delete']));
    row.appendChild(actions);
    panel.appendChild(row);
  });

  return panel;
}

function renderSessionCard(s) {
  const card = mk('div', { style: { background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', padding: '12px 16px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } });
  const leftCol = mk('div', { style: { cursor: 'pointer' }, onclick: () => connectSession(s) }, [
    mk('div', { style: { fontSize: '13px', fontWeight: '700', color: '#eef2f5' } }, [s.name]),
    mk('div', { style: { fontSize: '11px', color: '#8a96a3' } }, [
      `${s.username}@${s.host}:${s.port}` + (s.hasTunnel ? `  via ${s.tunnel.username}@${s.tunnel.host}` : ''),
    ]),
  ]);
  const actionsCol = mk('div', { style: { display: 'flex', gap: '8px' } }, [
    mk('button', {
      style: { background: '#eef2f5', color: '#0a0e15', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
      onclick: () => connectSession(s),
    }, ['Connect']),
    mk('span', { style: { fontSize: '11px', color: '#8a96a3', cursor: 'pointer', alignSelf: 'center' }, onclick: () => editSession(s) }, ['edit']),
    mk('span', { style: { fontSize: '11px', color: '#8a96a3', cursor: 'pointer', alignSelf: 'center' }, onclick: () => deleteSession(s.id) }, ['delete']),
  ]);
  card.appendChild(leftCol);
  card.appendChild(actionsCol);
  return card;
}

function renderCtSessionList() {
  const wrap = mk('div', {});
  const headerRow = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' } });
  headerRow.appendChild(mk('span', { style: { fontSize: '11px', fontWeight: '700', color: '#8a96a3', textTransform: 'uppercase', letterSpacing: '0.5px' } }, [`${state.ctSessions.length} saved session(s)`]));
  const headerActions = mk('div', { style: { display: 'flex', gap: '8px' } });
  headerActions.appendChild(mk('button', {
    style: { background: 'transparent', border: '1px solid #1b2530', color: '#eef2f5', borderRadius: '6px', padding: '7px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
    onclick: () => connectLocalTerminal(),
  }, ['▸_ Local terminal']));
  headerActions.appendChild(mk('button', {
    style: { background: '#eef2f5', color: '#0a0e15', border: 'none', borderRadius: '6px', padding: '7px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
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
    const emptyState = mk('div', { style: { textAlign: 'center', padding: '60px 0', color: '#8a96a3' } });
    emptyState.appendChild(mk('div', { html: emptyLogoSvg, style: { color: '#eef2f5' } }));
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
    folderHeader.appendChild(mk('span', { style: { fontSize: '10px', color: '#8a96a3' } }, [collapsed ? '▸' : '▾']));
    folderHeader.appendChild(mk('span', { style: { fontSize: '11px', fontWeight: '700', color: '#8a96a3', textTransform: 'uppercase', letterSpacing: '0.5px' } }, [folderName]));
    folderHeader.appendChild(mk('span', { style: { fontSize: '10.5px', color: '#8a96a3' } }, [`(${grouped[folderName].length})`]));
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
  col.appendChild(mk('label', { style: { fontSize: '10.5px', color: '#8a96a3', display: 'block', marginBottom: '4px' } }, [label]));
  col.appendChild(mk('input', {
    style: { width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '7px 10px', color: '#eef2f5', fontSize: '12.5px' },
    type: opts.type || 'text',
    placeholder: opts.placeholder || '',
    value: value || '',
    'data-focus-key': `ct-form-${label}`,
    oninput: (e) => onInput(e.target.value),
  }));
  return col;
}

function renderCtAuthFields(target, authType, username, secret, keyPath, onUsername, onAuthType, onSecret, onKeyPath) {
  const wrap = mk('div', {});
  wrap.appendChild(ctFormField('Username', username, onUsername));
  wrap.appendChild(mk('div', { style: { display: 'flex', gap: '8px', marginBottom: '10px' } }, [
    mk('div', {
      style: { flex: '1', textAlign: 'center', padding: '6px 0', fontSize: '11px', fontWeight: '700', cursor: 'pointer', borderRadius: '6px', background: authType === 'password' ? '#16222e' : 'transparent', border: `1px solid ${authType === 'password' ? '#eef2f5' : '#1b2530'}`, color: authType === 'password' ? '#eef2f5' : '#8a96a3' },
      onclick: () => { onAuthType('password'); renderApp(); },
    }, ['Password']),
    mk('div', {
      style: { flex: '1', textAlign: 'center', padding: '6px 0', fontSize: '11px', fontWeight: '700', cursor: 'pointer', borderRadius: '6px', background: authType === 'key' ? '#16222e' : 'transparent', border: `1px solid ${authType === 'key' ? '#eef2f5' : '#1b2530'}`, color: authType === 'key' ? '#eef2f5' : '#8a96a3' },
      onclick: () => { onAuthType('key'); renderApp(); },
    }, ['SSH Key']),
  ]));
  if (authType === 'key') {
    wrap.appendChild(mk('div', { style: { display: 'flex', gap: '8px', marginBottom: '10px' } }, [
      mk('input', { style: { flex: '1', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '7px 10px', color: '#eef2f5', fontSize: '12px' }, type: 'text', value: keyPath || '', placeholder: 'Path to private key', 'data-focus-key': 'ct-key-path', oninput: (e) => onKeyPath(e.target.value) }),
      mk('button', { style: { background: 'transparent', border: '1px solid #1b2530', color: '#eef2f5', borderRadius: '6px', padding: '0 12px', cursor: 'pointer', fontSize: '12px' }, onclick: () => pickKeyFileFor(target) }, ['Browse']),
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
  wrap.appendChild(mk('div', { style: { fontSize: '13px', fontWeight: '700', color: '#eef2f5', marginBottom: '14px' } }, [state.ctEditingSessionId ? 'Edit session' : 'New session']));

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
  folderField.appendChild(mk('label', { style: { fontSize: '10.5px', color: '#8a96a3', display: 'block', marginBottom: '4px' } }, ['Folder (optional)']));
  const folderInput = mk('input', {
    style: { width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '7px 10px', color: '#eef2f5', fontSize: '12.5px' },
    type: 'text',
    placeholder: 'e.g. Production',
    value: form.folder || '',
    list: 'ct-folder-options',
    'data-focus-key': 'ct-session-folder',
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
    renderCheckbox(form.useTunnel, (e) => { form.useTunnel = e.target.checked; renderApp(); }, mk('span', { style: { fontSize: '12px', color: '#eef2f5' } }, ['Connect via jump host / tunnel'])),
  ]));

  if (form.useTunnel) {
    wrap.appendChild(mk('div', { style: { borderTop: '1px solid #1b2530', paddingTop: '10px', marginBottom: '10px' } }, [
      mk('div', { style: { fontSize: '11px', fontWeight: '700', color: '#8a96a3', marginBottom: '8px' } }, ['JUMP HOST']),
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
  btnRow.appendChild(mk('button', { style: { background: '#eef2f5', color: '#0a0e15', border: 'none', borderRadius: '6px', padding: '9px 20px', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }, onclick: () => saveSession() }, ['Save']));
  btnRow.appendChild(mk('span', { style: { fontSize: '12px', color: '#8a96a3', cursor: 'pointer', alignSelf: 'center' }, onclick: () => closeSessionForm() }, ['Cancel']));
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
  const wrap = mk('div', { style: { display: 'flex', flexDirection: 'column', minHeight: '0', border: '1px solid #1b2530', borderRadius: '6px', overflow: 'hidden' } });

  if (!terminalId) {
    // Celda vacía: selector para asignar cualquiera de las pestañas abiertas.
    const empty = mk('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0d141d', gap: '8px' } });
    empty.appendChild(mk('div', { style: { fontSize: '11px', color: '#8a96a3' } }, ['Choose a terminal']));
    state.ctOpenTerminalIds.forEach((id) => {
      const inst = state.ctTerminalInstances[id];
      if (!inst) return;
      empty.appendChild(mk('div', {
        style: { fontSize: '12px', color: '#eef2f5', padding: '5px 14px', border: '1px solid #1b2530', borderRadius: '6px', cursor: 'pointer' },
        onclick: () => assignSlot(slotIndex, id),
      }, [inst.label || 'Terminal']));
    });
    wrap.appendChild(empty);
    return wrap;
  }

  const inst = state.ctTerminalInstances[terminalId];
  const connected = inst && inst.connected;

  const headerRow = mk('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0d141d', padding: '5px 10px', borderBottom: '1px solid #1b2530' },
  });
  headerRow.appendChild(mk('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#eef2f5', overflow: 'hidden' } }, [
    mk('span', { style: { display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: connected ? '#22c55e' : '#f59e0b', flexShrink: '0' } }),
    mk('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [inst ? (inst.label || 'Terminal') : '']),
  ]));
  headerRow.appendChild(mk('span', {
    style: { fontSize: '11px', color: '#8a96a3', cursor: 'pointer' },
    onclick: () => assignSlot(slotIndex, null),
  }, ['change']));
  wrap.appendChild(headerRow);

  // En split, cada slot usa una clave distinta para el contenedor de xterm
  // (cellId = terminalId + slotIndex) para que el mismo terminal pueda estar
  // en distintos slots sin colisión de ids. Aplicamos el mismo patrón que en
  // single: guardamos el nodo en inst.xtermContainerSlot[cellId] y lo movemos
  // con appendChild en cada render en vez de recrearlo.
  if (!inst.xtermContainerSlot) inst.xtermContainerSlot = {};
  let container;
  if (inst.term && inst.xtermContainer) {
    // Reusar el mismo contenedor que el modo single — el terminal está ahí
    container = inst.xtermContainer;
    container.style.flex = '1';
    container.style.minHeight = '0';
    container.style.padding = '6px';
  } else {
    container = mk('div', {
      id: `xterm-container-${cellId}`,
      style: { flex: '1', background: '#0a0e15', padding: '6px', minHeight: '0' },
    });
  }
  wrap.appendChild(container);

  if (inst && inst.fitAddon) {
    requestAnimationFrame(() => { inst.fitAddon.fit(); });
  }

  return wrap;
}

function renderCtActiveTerminal() {
  const terminalId = state.ctActiveTerminalId;
  const inst = state.ctTerminalInstances[terminalId];
  const connected = inst && inst.connected;
  const isSsh = inst && inst.kind === 'ssh';
  const sftpOpen = state.ctSftpOpenFor === terminalId;
  const wrap = mk('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', minHeight: '460px', minWidth: '0', overflow: 'hidden' } });

  const headerRow = mk('div', {
    style: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      background: '#0d141d', border: '1px solid #1b2530', borderTop: 'none', borderBottom: 'none',
      padding: '8px 14px',
    },
  });
  const statusDot = mk('span', {
    style: {
      display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%',
      background: connected ? '#22c55e' : '#f59e0b', marginRight: '8px',
      boxShadow: connected ? '0 0 4px #22c55e' : '0 0 4px #f59e0b',
    },
    'data-terminal-dot': terminalId,
  });
  const titleText = inst ? (inst.session ? `${inst.session.username}@${inst.session.host}` : 'Local shell') : '';
  headerRow.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#eef2f5', fontWeight: '700', display: 'flex', alignItems: 'center' } }, [
    statusDot,
    titleText,
    !connected ? mk('span', { style: { fontSize: '11px', color: '#f59e0b', marginLeft: '10px', fontWeight: '500' }, 'data-terminal-connecting': terminalId }, ['connecting...']) : null,
  ].filter(Boolean)));
  // SFTP solo tiene sentido para sesiones SSH, no para el shell local.
  if (isSsh) {
    const btnGroup = mk('div', { style: { display: 'flex', gap: '6px' } });
    headerRow.appendChild(btnGroup);
    btnGroup.appendChild(mk('button', {
      style: {
        background: sftpOpen ? '#16222e' : 'transparent', border: `1px solid ${sftpOpen ? '#eef2f5' : '#1b2530'}`,
        color: '#eef2f5', borderRadius: '6px', padding: '5px 12px', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
      },
      onclick: () => toggleSftpPanel(terminalId),
    }, [sftpOpen ? 'Hide SFTP' : 'SFTP browser']));
  }
  wrap.appendChild(headerRow);

  // Cuerpo: terminal a la izquierda, panel SFTP a la derecha si está abierto
  // — igual que el navegador SSH de MobaXterm al lado del terminal.
  // El data-attribute permite al auto-open de SFTP (tras conectar) insertar
  // el panel quirúrgicamente sin renderApp(), igual que el patrón del dot.
  // maxHeight cadena flex: el bodyRow no puede superar el alto disponible
  // del view (wrap flex:1 minHeight:0) — es lo que acota también al SFTP.
  const bodyRow = mk('div', { style: { flex: '1', display: 'flex', minHeight: '420px', maxHeight: '100%' }, 'data-terminal-bodyrow': terminalId });

  // Guardamos el nodo DOM del contenedor en inst la primera vez que se crea
  // — así en renders posteriores lo recuperamos directamente de inst.container
  // en vez de buscarlo con getElementById (que devuelve null porque renderApp
  // ya eliminó el nodo del DOM antes de que esta función se ejecute).
  let container;
  if (inst && inst.term && inst.xtermContainer) {
    // Reusar el nodo existente — appendChild lo MUEVE sin destruirlo,
    // preservando xterm y todo su contenido.
    container = inst.xtermContainer;
    container.style.borderTop = `1px solid ${connected ? '#173a24' : '#1b2530'}`;
    container.style.borderRadius = sftpOpen ? '0 0 0 3px' : '0 0 3px 3px';
    container.style.flex = '1';
  } else {
    container = mk('div', {
      id: `xterm-container-${terminalId}`,
      style: {
        flex: '1', background: '#0a0e15', border: '1px solid #1b2530',
        borderTop: `1px solid ${connected ? '#173a24' : '#1b2530'}`,
        borderRadius: sftpOpen ? '0 0 0 3px' : '0 0 3px 3px', padding: '10px', minHeight: '420px',
      },
    });
    if (inst) inst.xtermContainer = container;
  }
  bodyRow.appendChild(container);

  if (sftpOpen && inst && inst.session) {
    const sftpPanel = renderSftpPanel(inst.session.id);
    sftpPanel.setAttribute('data-sftp-panel', terminalId);
    bodyRow.appendChild(sftpPanel);
  }
  wrap.appendChild(bodyRow);

  // Solo abrimos xterm la primera vez (cuando el contenedor es nuevo y term existe)
  if (inst && inst.term && !inst.xtermOpened) {
    requestAnimationFrame(() => {
      inst.term.open(container);
      if (inst.fitAddon) inst.fitAddon.fit();
      inst.xtermOpened = true;
    });
  } else if (inst && inst.fitAddon && inst.xtermOpened) {
    requestAnimationFrame(() => { inst.fitAddon.fit(); });
  }

  return mk('div', {}, [wrap, state.ctEditorFile ? renderRemoteFileEditorModal() : null].filter(Boolean));
}

function renderSftpPanel(sessionId) {
  const panel = mk('div', {
    style: {
      width: '300px', flexShrink: '0', background: '#0d141d', border: '1px solid #1b2530', borderLeft: 'none',
      borderTop: `1px solid #1b2530`, borderRadius: '0 0 3px 0', padding: '10px', display: 'flex', flexDirection: 'column',
      // minHeight 0 + maxHeight 100%: el panel queda acotado al alto del
      // bodyRow (el del terminal) y el listado interior (flex:1 + overflow
      // auto) scrollea. Sin esto, un directorio con muchos ficheros
      // estiraba el panel más allá de la ventana de la app.
      minHeight: '0', maxHeight: '100%', overflow: 'hidden',
    },
  });

  const pathRow = mk('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' } });
  pathRow.appendChild(mk('span', {
    style: { fontSize: '11px', color: '#eef2f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1' },
  }, [state.ctSftpPath]));
  panel.appendChild(pathRow);

  const actionsRow = mk('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px' } });
  actionsRow.appendChild(mk('button', {
    style: { flex: '1', background: 'transparent', border: '1px solid #1b2530', color: '#eef2f5', borderRadius: '6px', padding: '4px 0', fontSize: '10.5px', cursor: 'pointer' },
    onclick: () => uploadToSftpDir(sessionId),
  }, ['↑ Upload']));
  actionsRow.appendChild(mk('button', {
    style: { flex: '1', background: 'transparent', border: '1px solid #1b2530', color: '#eef2f5', borderRadius: '6px', padding: '4px 0', fontSize: '10.5px', cursor: 'pointer' },
    onclick: () => createSftpFolder(sessionId),
  }, ['+ Folder']));
  panel.appendChild(actionsRow);

  if (state.ctSftpError) {
    panel.appendChild(mk('div', { style: { fontSize: '11px', color: '#ef4444', marginBottom: '8px' } }, [state.ctSftpError]));
  }

  const listBox = mk('div', { style: { flex: '1', overflowY: 'auto' } });

  if (state.ctSftpPath !== '.' && state.ctSftpPath !== '') {
    listBox.appendChild(mk('div', {
      style: { fontSize: '11.5px', color: '#8a96a3', padding: '4px 6px', cursor: 'pointer' },
      onclick: () => navigateSftp(sessionId, { name: '..', isDirectory: true }),
    }, ['.. (parent)']));
  }

  if (state.ctSftpLoading) {
    listBox.appendChild(mk('div', { style: { fontSize: '11px', color: '#8a96a3', padding: '6px' } }, ['Loading…']));
  } else {
    state.ctSftpEntries.forEach((entry) => {
      const row = mk('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', borderRadius: '2px', cursor: 'pointer' },
      });
      row.appendChild(mk('span', {
        style: { fontSize: '11.5px', color: entry.isDirectory ? '#7dd3fc' : '#eef2f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1', cursor: 'pointer' },
        onclick: () => navigateSftp(sessionId, entry),
      }, [(entry.isDirectory ? '▸ ' : '') + entry.name]));
      const rowActions = mk('div', { style: { display: 'flex', gap: '6px', flexShrink: '0' } });
      if (!entry.isDirectory) {
        rowActions.appendChild(mk('span', {
          style: { fontSize: '10px', color: '#8a96a3', cursor: 'pointer' },
          onclick: (e) => { e.stopPropagation(); downloadSftpEntry(sessionId, entry); },
        }, ['↓']));
      }
      rowActions.appendChild(mk('span', {
        style: { fontSize: '10px', color: '#8a96a3', cursor: 'pointer' },
        onclick: (e) => { e.stopPropagation(); deleteSftpEntry(sessionId, entry); },
      }, ['×']));
      row.appendChild(rowActions);
      listBox.appendChild(row);
    });
    if (state.ctSftpEntries.length === 0) {
      listBox.appendChild(mk('div', { style: { fontSize: '11px', color: '#8a96a3', padding: '6px' } }, ['Empty directory.']));
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
    style: { width: '70%', height: '70%', background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', display: 'flex', flexDirection: 'column', padding: '14px' },
  });

  const headerRow = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } });
  headerRow.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#eef2f5', fontWeight: '700' } }, [
    ef.remotePath + (ef.dirty ? ' •' : ''),
  ]));
  const btnRow = mk('div', { style: { display: 'flex', gap: '8px' } });
  btnRow.appendChild(mk('button', {
    style: { background: '#eef2f5', color: '#0a0e15', border: 'none', borderRadius: '6px', padding: '6px 16px', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer' },
    onclick: () => saveRemoteFileEditor(),
  }, [state.ctEditorSaving ? 'Saving...' : 'Save']));
  btnRow.appendChild(mk('span', { style: { fontSize: '12px', color: '#8a96a3', cursor: 'pointer', alignSelf: 'center' }, onclick: () => closeRemoteFileEditor() }, ['Close']));
  headerRow.appendChild(btnRow);
  box.appendChild(headerRow);

  const editorTextarea = mk('textarea', {
    style: {
      flex: '1', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '10px',
      color: '#eef2f5', fontSize: '12.5px', fontFamily: "'IBM Plex Mono', monospace", resize: 'none',
    },
    'data-focus-key': 'remote-file-editor',
    oninput: (e) => { ef.content = e.target.value; ef.dirty = true; renderApp(); },
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
    wrap.appendChild(mk('div', { style: { fontSize: '13px', color: '#8a96a3', padding: '20px' } }, ['Loading editor…']));
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

  const optionsRow = mk('div', { style: { display: 'flex', gap: '12px', marginBottom: '20px' } });
  optionsRow.appendChild(mk('button', {
    style: { flex: '1', background: '#eef2f5', color: '#0a0e15', border: 'none', borderRadius: '6px', padding: '14px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
    onclick: () => openLocalWorkspace(),
  }, ['▸ Open local folder']));
  wrap.appendChild(optionsRow);

  if (!state.vsGitAvailable) {
    wrap.appendChild(mk('div', {
      style: { background: '#201607', border: '1px solid #f59e0b', borderRadius: '6px', padding: '12px 14px', marginBottom: '20px', fontSize: '11.5px', color: '#eef2f5' },
    }, [
      'Git was not found on this system. File editing still works, but version control features will stay disabled. ',
      mk('span', {
        style: { color: '#f59e0b', cursor: 'pointer', fontWeight: '700' },
        onclick: () => window.open ? window.open('https://git-scm.com/downloads') : null,
      }, ['Install Git →']),
    ]));
  }

  wrap.appendChild(mk('div', { style: { fontSize: '11px', fontWeight: '700', color: '#8a96a3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' } }, ['Or browse a remote session']));

  if (state.ctSessions.length === 0) {
    wrap.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#8a96a3' } }, [
      'No CorexTerm sessions saved yet. Save one in CorexTerm first to browse it here.',
    ]));
  } else {
    state.ctSessions.forEach((s) => {
      wrap.appendChild(mk('div', {
        style: { background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', padding: '10px 14px', marginBottom: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
        onclick: () => openRemoteWorkspace(s),
      }, [
        mk('span', { style: { fontSize: '12.5px', color: '#eef2f5', fontWeight: '600' } }, [s.name]),
        mk('span', { style: { fontSize: '11px', color: '#8a96a3' } }, [`${s.username}@${s.host}`]),
      ]));
    });
  }

  return wrap;
}


function renderVsWorkbench() {
  const wrap = mk('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', minHeight: '0' } });

  // Barra superior: ruta del workspace + acciones globales
  const topBar = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid #1b2530' } });
  topBar.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#8a96a3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [
    state.vsWorkspaceKind === 'remote' ? `Remote: ${state.vsWorkspaceRoot}` : state.vsWorkspaceRoot,
  ]));
  const topActions = mk('div', { style: { display: 'flex', gap: '8px', flexShrink: '0' } });
  if (state.vsWorkspaceKind === 'local' && state.vsGitAvailable) {
    topActions.appendChild(mk('span', {
      style: {
        fontSize: '11px', fontWeight: '700', padding: '4px 10px', cursor: 'pointer', borderRadius: '6px',
        color: state.vsGitPanelOpen ? '#eef2f5' : '#8a96a3',
        background: state.vsGitPanelOpen ? '#16222e' : 'transparent',
        border: `1px solid ${state.vsGitPanelOpen ? '#eef2f5' : '#1b2530'}`,
      },
      onclick: () => toggleGitPanel(),
    }, [state.vsGitStatus ? `Git (${state.vsGitStatus.current})` : 'Git']));
  }
  topActions.appendChild(mk('span', {
    style: { fontSize: '11px', color: '#8a96a3', cursor: 'pointer', padding: '4px 10px' },
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
  const panel = mk('div', { style: { width: '220px', flexShrink: '0', borderRight: '1px solid #1b2530', overflowY: 'auto', padding: '10px' } });
  const rootEntries = state.vsExplorerTree[state.vsWorkspaceRoot];
  if (!rootEntries) {
    panel.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#8a96a3' } }, ['Loading…']));
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
        color: entry.isDirectory ? '#7dd3fc' : (state.vsActiveFileId === fileTabId(entryPath) ? '#eef2f5' : '#c6d0d9'),
        background: state.vsActiveFileId === fileTabId(entryPath) ? '#16222e' : 'transparent',
      },
      onclick: () => (entry.isDirectory ? toggleExplorerDir(entryPath) : openFileInEditor({ ...entry, path: entryPath }, parentPath)),
    });
    row.appendChild(mk('span', { style: { flexShrink: '0', fontSize: '10px', color: '#8a96a3', width: '10px' } }, [
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
    wrap.appendChild(mk('div', { style: { flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a96a3', fontSize: '12.5px' } }, [
      'Select a file from the explorer to start editing.',
    ]));
    return wrap;
  }

  // Barra de pestañas de archivos abiertos
  const tabBar = mk('div', { style: { display: 'flex', borderBottom: '1px solid #1b2530', overflowX: 'auto' } });
  state.vsOpenFiles.forEach((file) => {
    const active = state.vsActiveFileId === file.id;
    const tab = mk('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 12px', cursor: 'pointer', maxWidth: '180px',
        background: active ? '#0d141d' : 'transparent',
        borderRight: '1px solid #1b2530',
        color: active ? '#eef2f5' : '#8a96a3',
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
  const actionBar = mk('div', { style: { display: 'flex', justifyContent: 'flex-end', padding: '6px 10px', borderBottom: '1px solid #1b2530' } });
  actionBar.appendChild(mk('button', {
    style: { background: '#eef2f5', color: '#0a0e15', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
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
  const panel = mk('div', { style: { width: '300px', flexShrink: '0', borderLeft: '1px solid #1b2530', overflowY: 'auto', padding: '12px' } });
  const s = state.vsGitStatus;

  if (!s) {
    panel.appendChild(mk('div', { style: { fontSize: '12px', color: '#8a96a3' } }, ['This folder is not a Git repository.']));
    return panel;
  }

  // Diff inline si hay uno seleccionado
  if (state.vsGitDiffFile) {
    panel.appendChild(mk('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' } }, [
      mk('span', { style: { fontSize: '11.5px', color: '#eef2f5', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis' } }, [state.vsGitDiffFile]),
      mk('span', { style: { fontSize: '11px', color: '#8a96a3', cursor: 'pointer' }, onclick: () => { state.vsGitDiffFile = null; renderApp(); } }, ['close']),
    ]));
    panel.appendChild(mk('pre', {
      style: { fontSize: '10.5px', lineHeight: '1.5', color: '#c6d0d9', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '10px', overflowX: 'auto', whiteSpace: 'pre-wrap' },
    }, [state.vsGitDiffContent]));
    return panel;
  }

  panel.appendChild(mk('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px' } }, [
    mk('button', { style: { flex: '1', background: 'transparent', border: '1px solid #1b2530', color: '#eef2f5', borderRadius: '6px', padding: '5px 0', fontSize: '11px', cursor: 'pointer' }, onclick: () => pullChanges() }, ['↓ Pull']),
    mk('button', { style: { flex: '1', background: 'transparent', border: '1px solid #1b2530', color: '#eef2f5', borderRadius: '6px', padding: '5px 0', fontSize: '11px', cursor: 'pointer' }, onclick: () => pushChanges() }, ['↑ Push']),
  ]));

  if (s.ahead || s.behind) {
    panel.appendChild(mk('div', { style: { fontSize: '10.5px', color: '#f59e0b', marginBottom: '10px' } }, [
      `${s.ahead ? `${s.ahead} ahead` : ''}${s.ahead && s.behind ? ', ' : ''}${s.behind ? `${s.behind} behind` : ''}`,
    ]));
  }

  // Staged
  if (s.staged && s.staged.length > 0) {
    panel.appendChild(mk('div', { style: { fontSize: '10px', fontWeight: '700', color: '#8a96a3', textTransform: 'uppercase', marginBottom: '6px' } }, [`Staged (${s.staged.length})`]));
    s.staged.forEach((f) => {
      panel.appendChild(mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' } }, [
        mk('span', { style: { fontSize: '11px', color: '#22c55e', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1' }, onclick: () => viewFileDiff(f, true) }, [f]),
        mk('span', { style: { fontSize: '10px', color: '#8a96a3', cursor: 'pointer' }, onclick: () => unstageFile(f) }, ['unstage']),
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
    headerRow.appendChild(mk('span', { style: { fontSize: '10px', fontWeight: '700', color: '#8a96a3', textTransform: 'uppercase' } }, [`Changes (${unstagedFiles.length})`]));
    headerRow.appendChild(mk('span', { style: { fontSize: '10.5px', color: '#8a96a3', cursor: 'pointer' }, onclick: () => stageAll() }, ['stage all']));
    panel.appendChild(headerRow);
    unstagedFiles.forEach(({ f, tag }) => {
      panel.appendChild(mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' } }, [
        mk('span', { style: { fontSize: '11px', color: '#eef2f5', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1' }, onclick: () => viewFileDiff(f, false) }, [`${tag}  ${f}`]),
        mk('span', { style: { fontSize: '10px', color: '#8a96a3', cursor: 'pointer' }, onclick: () => stageFile(f) }, ['stage']),
      ]));
    });
  }

  if (unstagedFiles.length === 0 && (!s.staged || s.staged.length === 0)) {
    panel.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#8a96a3', marginTop: '10px' } }, ['No changes.']));
  }

  // Commit
  const commitTextarea = mk('textarea', {
    style: { width: '100%', minHeight: '50px', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '8px', color: '#eef2f5', fontSize: '11.5px', fontFamily: 'inherit', resize: 'vertical', marginTop: '12px' },
    placeholder: 'Commit message',
    'data-focus-key': 'vs-git-commit-message',
    oninput: (e) => { state.vsGitCommitMessage = e.target.value; renderApp(); },
  });
  commitTextarea.value = state.vsGitCommitMessage;
  panel.appendChild(commitTextarea);
  panel.appendChild(mk('button', {
    style: { width: '100%', background: '#eef2f5', color: '#0a0e15', border: 'none', borderRadius: '6px', padding: '8px 0', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer', marginTop: '8px' },
    onclick: () => commitChanges(),
  }, ['Commit']));

  return panel;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Ticket Automation Templates — vincula un template de AWX a reglas de
//  comentario/transición/adjunto en Jira, separadas para éxito y fallo.
// ═══════════════════════════════════════════════════════════════════════════

const AUTOMATION_VARS = [
  { key: 'job_name', label: 'Job name', desc: 'Name of the AWX job template that ran', example: 'JBT_AWX_VM_SNAPSHOT_DELETION' },
  { key: 'job_id', label: 'Job ID', desc: 'AWX job run number', example: '4821' },
  { key: 'status', label: 'Status', desc: 'How the job finished', example: 'successful' },
  { key: 'finished_at', label: 'Finished at', desc: 'Date/time the job completed', example: '6/29/2026, 3:42:10 PM' },
  { key: 'duration', label: 'Duration', desc: 'How long the job took to run', example: '38s' },
  { key: 'requested_by', label: 'Requested by', desc: 'AWX user who launched the job', example: 'nelson.perez' },
];

async function loadAutomationTemplates() {
  const res = await window.corexAPI.automationList();
  if (res.ok) state.automationTemplates = res.templates;
}

async function loadPendingAttachments() {
  const res = await window.corexAPI.automationListPendingAttachments();
  if (res.ok) state.pendingAttachments = res.pending;
}

function emptyAutomationBranch() {
  return {
    enabled: false,
    commentTemplate: '',
    requireAttachment: false,
    // Nombre del estado destino (ej. "Done"), NO un ID de transición fijo —
    // las transiciones de Jira dependen del estado ACTUAL de cada ticket
    // concreto, así que no existe un ID válido "de antemano" para una
    // plantilla genérica. En el momento real de la automatización, COREX
    // consulta las transiciones disponibles de ESE ticket y busca cuál
    // lleva a un estado con este nombre.
    transitionStatusName: '',
    parentBehavior: 'none', // 'none' | 'comment_only' | 'comment_and_transition'
    parentCommentTemplate: '',
    parentRequireAttachment: false,
    parentTransitionStatusName: '',
  };
}

function newAutomationForm() {
  return {
    id: null,
    name: '',
    awxTemplateId: '',
    onSuccess: emptyAutomationBranch(),
    onFailure: emptyAutomationBranch(),
  };
}

function openNewAutomationForm() {
  state.automationEditingId = 'new';
  state.automationForm = newAutomationForm();
  renderApp();
}

function editAutomationTemplate(tpl) {
  state.automationEditingId = tpl.id;
  // Clonado profundo simple — evitamos mutar el objeto ya guardado mientras
  // se edita, por si el usuario cancela sin guardar.
  state.automationForm = JSON.parse(JSON.stringify(tpl));
  state.automationForm.onSuccess = { ...emptyAutomationBranch(), ...state.automationForm.onSuccess };
  state.automationForm.onFailure = { ...emptyAutomationBranch(), ...state.automationForm.onFailure };
  renderApp();
}

function closeAutomationForm() {
  state.automationEditingId = null;
  state.automationForm = null;
  state.automationVarPickerOpenFor = null;
  renderApp();
}

async function saveAutomationTemplate() {
  const form = state.automationForm;
  if (!form.name.trim() || !form.awxTemplateId) {
    toast('Name and AWX template are required', 'err');
    return;
  }
  const res = await window.corexAPI.automationSave(form);
  if (!res.ok) {
    toast(`Could not save: ${res.error}`, 'err');
    return;
  }
  toast('Automation template saved', 'ok');
  await loadAutomationTemplates();
  closeAutomationForm();
}

async function deleteAutomationTemplate(id) {
  await window.corexAPI.automationDelete(id);
  await loadAutomationTemplates();
  renderApp();
}

// Inserta una variable en la posición del cursor del textarea correspondiente
// — igual que un constructor de survey, no hace falta memorizar sintaxis.
function insertAutomationVar(branchKey, varKey) {
  const textareaId = `automation-textarea-${branchKey}`;
  const ta = document.getElementById(textareaId);
  const placeholder = `{{${varKey}}}`;
  let form = state.automationForm;
  const isParent = branchKey.startsWith('parent');
  const branch = branchKey === 'success' ? form.onSuccess
    : branchKey === 'failure' ? form.onFailure
    : branchKey === 'parentSuccess' ? form.onSuccess
    : form.onFailure;
  const field = isParent ? 'parentCommentTemplate' : 'commentTemplate';

  if (ta) {
    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd || 0;
    const current = branch[field] || '';
    branch[field] = current.slice(0, start) + placeholder + current.slice(end);
    renderApp();
    requestAnimationFrame(() => {
      const newTa = document.getElementById(textareaId);
      if (newTa) {
        const pos = start + placeholder.length;
        newTa.focus();
        newTa.setSelectionRange(pos, pos);
      }
    });
  } else {
    branch[field] = (branch[field] || '') + placeholder;
    renderApp();
  }
}

// ── Render: lista de Automation Templates ────────────────────────────────
function renderTemplatesView() {
  const wrap = mk('div', { style: { maxWidth: '760px' } });

  if (state.pendingAttachments.length > 0) {
    wrap.appendChild(mk('div', {
      style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#201607',
        border: '1px solid #5a3a0d', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', cursor: 'pointer',
      },
      onclick: () => { state.showPendingAttachmentsModal = true; renderApp(); },
    }, [
      mk('span', { style: { fontSize: '12.5px', color: '#fbbf24' } }, [`${state.pendingAttachments.length} attachment(s) waiting to be uploaded`]),
      mk('span', { style: { fontSize: '11.5px', color: '#fbbf24', fontWeight: '700' } }, ['Review →']),
    ]));
  }

  if (state.automationEditingId) {
    wrap.appendChild(renderAutomationEditor());
    return wrap;
  }

  const headerRow = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' } });
  headerRow.appendChild(mk('span', { style: { fontSize: '11px', fontWeight: '700', color: '#8a96a3', textTransform: 'uppercase', letterSpacing: '0.5px' } }, [
    `${state.automationTemplates.length} automation template(s)`,
  ]));
  headerRow.appendChild(mk('button', {
    style: { background: '#eef2f5', color: '#0a0e15', border: 'none', borderRadius: '6px', padding: '7px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
    onclick: () => openNewAutomationForm(),
  }, ['+ New template']));
  wrap.appendChild(headerRow);

  if (state.automationTemplates.length === 0) {
    wrap.appendChild(mk('div', { style: { fontSize: '13px', color: '#8a96a3' } }, ['No automation templates yet.']));
    return wrap;
  }

  state.automationTemplates.forEach((tpl) => {
    const awxTpl = state.awxTemplates.find((t) => t.id === tpl.awxTemplateId);
    const card = mk('div', {
      style: { background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', padding: '14px 16px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    });
    const leftCol = mk('div', { style: { cursor: 'pointer' }, onclick: () => editAutomationTemplate(tpl) }, [
      mk('div', { style: { fontSize: '13px', fontWeight: '700', color: '#eef2f5' } }, [tpl.name]),
      mk('div', { style: { fontSize: '11px', color: '#8a96a3' } }, [
        `AWX template: ${awxTpl ? awxTpl.name : tpl.awxTemplateId}`,
      ]),
      mk('div', { style: { fontSize: '10.5px', color: '#8a96a3', marginTop: '2px' } }, [
        `Success: ${tpl.onSuccess && tpl.onSuccess.enabled ? 'on' : 'off'} · Failure: ${tpl.onFailure && tpl.onFailure.enabled ? 'on' : 'off'}`,
      ]),
    ]);
    const actionsCol = mk('div', { style: { display: 'flex', gap: '8px' } }, [
      mk('span', { style: { fontSize: '11px', color: '#8a96a3', cursor: 'pointer' }, onclick: () => editAutomationTemplate(tpl) }, ['edit']),
      mk('span', { style: { fontSize: '11px', color: '#8a96a3', cursor: 'pointer' }, onclick: () => deleteAutomationTemplate(tpl.id) }, ['delete']),
    ]);
    card.appendChild(leftCol);
    card.appendChild(actionsCol);
    wrap.appendChild(card);
  });

  return wrap;
}

// ── Render: constructor de variables (estilo survey) ─────────────────────
function renderVarPicker(branchKey) {
  const wrap = mk('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', marginBottom: '6px' } });
  AUTOMATION_VARS.forEach((v) => {
    wrap.appendChild(mk('span', {
      style: { fontSize: '10.5px', color: '#38bdf8', border: '1px solid #0e3450', background: '#0d1926', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer' },
      title: `${v.desc} — e.g. "${v.example}"`,
      onclick: () => insertAutomationVar(branchKey, v.key),
    }, [`+ ${v.label}`]));
  });
  return wrap;
}

// Vista previa en vivo del mensaje ya resuelto, con datos de ejemplo — para
// que el usuario vea el resultado real sin tener que imaginar qué hace cada
// variable o memorizar la sintaxis {{...}}.
function renderTemplatePreview(template) {
  if (!template || !template.trim()) return null;
  const exampleVars = {};
  AUTOMATION_VARS.forEach((v) => { exampleVars[v.key] = v.example; });
  const rendered = renderAutomationTemplate(template, exampleVars);
  return mk('div', { style: { marginBottom: '10px' } }, [
    mk('div', { style: { fontSize: '9.5px', color: '#8a96a3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' } }, ['Preview with example data']),
    mk('div', { style: { fontSize: '12px', color: '#aab6c3', background: '#0a0e15', border: '1px dashed #1b2530', borderRadius: '6px', padding: '8px 10px', whiteSpace: 'pre-wrap' } }, [rendered]),
  ]);
}

function automationTextarea(branchKey, value, onInput) {
  const ta = mk('textarea', {
    id: `automation-textarea-${branchKey}`,
    style: {
      width: '100%', minHeight: '90px', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px',
      padding: '8px 10px', color: '#eef2f5', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical',
    },
    placeholder: 'e.g. Job {{job_name}} finished with status {{status}} at {{finished_at}}.',
    'data-focus-key': `automation-${branchKey}`,
    oninput: onInput,
  });
  ta.value = value || '';
  return ta;
}

// ── Render: una rama completa (success u failure), con su sub-sección de padre ──
function renderAutomationBranchEditor(branchLabel, branchKey, branch, accentColor) {
  const wrap = mk('div', { style: { background: '#0d141d', border: `1px solid ${accentColor}33`, borderRadius: '10px', padding: '16px', marginBottom: '16px' } });

  const headerRow = mk('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' } });
  headerRow.appendChild(renderCheckbox(branch.enabled, (e) => { branch.enabled = e.target.checked; renderApp(); }));
  headerRow.appendChild(mk('span', { style: { fontSize: '13px', fontWeight: '700', color: accentColor } }, [branchLabel]));
  wrap.appendChild(headerRow);

  if (!branch.enabled) return wrap;

  // Comentario, con selector de variables — comportamiento de visibilidad
  // (interno en fallo, público en éxito) se decide automáticamente al
  // disparar la automatización, no es algo que se configure aquí.
  wrap.appendChild(mk('label', { style: { fontSize: '10.5px', color: '#8a96a3', display: 'block', marginBottom: '4px' } }, [
    branchKey === 'failure' ? 'Comment (will be posted as INTERNAL — hidden from the requester)' : 'Comment (will be posted publicly)',
  ]));
  wrap.appendChild(automationTextarea(branchKey, branch.commentTemplate, (e) => { branch.commentTemplate = e.target.value; renderApp(); }));
  wrap.appendChild(renderVarPicker(branchKey));
  const previewMain = renderTemplatePreview(branch.commentTemplate);
  if (previewMain) wrap.appendChild(previewMain);

  // Transición — nombre de estado en texto simple, resuelto en tiempo real
  // contra las transiciones REALES del ticket cuando la automatización se
  // dispare (las transiciones dependen del estado actual de cada ticket
  // concreto, no existen "globalmente" para guardar un ID aquí).
  wrap.appendChild(mk('label', { style: { fontSize: '10.5px', color: '#8a96a3', display: 'block', marginBottom: '4px' } }, ['Transition ticket to status (leave empty to skip)']));
  wrap.appendChild(mk('input', {
    style: { width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '8px 10px', color: '#eef2f5', fontSize: '12.5px', marginBottom: '12px' },
    type: 'text',
    placeholder: branchKey === 'failure' ? 'e.g. Failed' : 'e.g. Done',
    value: branch.transitionStatusName || '',
    'data-focus-key': `automation-transition-${branchKey}`,
    oninput: (e) => { branch.transitionStatusName = e.target.value; },
  }));

  // Adjunto requerido — nunca interrumpe con un modal inmediato; encola una
  // pendiente que el usuario atiende cuando quiera, desde Templates.
  wrap.appendChild(mk('div', { style: { marginBottom: '14px' } }, [
    renderCheckbox(branch.requireAttachment, (e) => { branch.requireAttachment = e.target.checked; renderApp(); },
      mk('span', { style: { fontSize: '12px', color: '#eef2f5' } }, ['Require a file attachment (you will pick the file later, from the pending queue)'])),
  ]));

  // Comportamiento del ticket padre
  wrap.appendChild(mk('div', { style: { borderTop: '1px solid #1b2530', paddingTop: '12px', marginTop: '4px' } }, [
    mk('label', { style: { fontSize: '10.5px', color: '#8a96a3', display: 'block', marginBottom: '6px' } }, ['Parent ticket behavior']),
  ]));
  // Opciones propias en vez de <select> nativo: el menú desplegable de un
  // <select> se renderiza como overlay del sistema operativo, fuera del
  // DOM — si renderApp() reconstruye el <select> mientras ese menú está
  // abierto, el clic en una opción puede no llegar a ningún elemento real.
  // Mismo tipo de problema que ya resolvimos con los checkboxes nativos.
  const parentBehaviorWrap = mk('div', { style: { border: '1px solid #1b2530', borderRadius: '6px', marginBottom: '10px', overflow: 'hidden' } });
  [
    { value: 'none', label: "Don't touch the parent ticket" },
    { value: 'comment_only', label: 'Comment on the parent (no transition)' },
    { value: 'comment_and_transition', label: 'Comment and transition the parent' },
  ].forEach((opt, i, arr) => {
    const active = branch.parentBehavior === opt.value;
    parentBehaviorWrap.appendChild(mk('div', {
      style: {
        padding: '9px 12px', fontSize: '12.5px', cursor: 'pointer',
        color: active ? '#eef2f5' : '#aab6c3',
        background: active ? '#111a24' : 'transparent',
        borderBottom: i < arr.length - 1 ? '1px solid #1b2530' : 'none',
        borderLeft: active ? '2px solid #22c55e' : '2px solid transparent',
      },
      onclick: () => { branch.parentBehavior = opt.value; renderApp(); },
    }, [opt.label]));
  });
  wrap.appendChild(parentBehaviorWrap);

  if (branch.parentBehavior !== 'none') {
    const parentKey = `parent${branchKey === 'success' ? 'Success' : 'Failure'}`;
    wrap.appendChild(mk('label', { style: { fontSize: '10.5px', color: '#8a96a3', display: 'block', marginBottom: '4px' } }, [
      'Parent comment (leave empty to reuse the comment above)',
    ]));
    wrap.appendChild(automationTextarea(parentKey, branch.parentCommentTemplate, (e) => { branch.parentCommentTemplate = e.target.value; renderApp(); }));
    wrap.appendChild(renderVarPicker(parentKey));
    const previewParent = renderTemplatePreview(branch.parentCommentTemplate || branch.commentTemplate);
    if (previewParent) wrap.appendChild(previewParent);

    if (branch.parentBehavior === 'comment_and_transition') {
      wrap.appendChild(mk('label', { style: { fontSize: '10.5px', color: '#8a96a3', display: 'block', marginBottom: '4px', marginTop: '10px' } }, ['Transition parent ticket to status']));
      wrap.appendChild(mk('input', {
        style: { width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '8px 10px', color: '#eef2f5', fontSize: '12.5px' },
        type: 'text',
        placeholder: 'e.g. Done',
        value: branch.parentTransitionStatusName || '',
        'data-focus-key': `automation-parent-transition-${branchKey}`,
        oninput: (e) => { branch.parentTransitionStatusName = e.target.value; },
      }));
    }

    wrap.appendChild(mk('div', { style: { marginTop: '10px' } }, [
      renderCheckbox(branch.parentRequireAttachment, (e) => { branch.parentRequireAttachment = e.target.checked; renderApp(); },
        mk('span', { style: { fontSize: '12px', color: '#eef2f5' } }, ['Also require an attachment for the parent'])),
    ]));
  }

  return wrap;
}

// ── Render: editor completo de una Automation Template ───────────────────
function renderAutomationEditor() {
  const form = state.automationForm;
  const wrap = mk('div', {});

  wrap.appendChild(mk('div', { style: { fontSize: '14px', fontWeight: '700', color: '#eef2f5', marginBottom: '16px' } }, [
    state.automationEditingId === 'new' ? 'New automation template' : 'Edit automation template',
  ]));

  wrap.appendChild(mk('label', { style: { fontSize: '10.5px', color: '#8a96a3', display: 'block', marginBottom: '4px' } }, ['Template name']));
  wrap.appendChild(mk('input', {
    style: { width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '8px 10px', color: '#eef2f5', fontSize: '13px', marginBottom: '12px' },
    type: 'text',
    placeholder: 'e.g. VM Snapshot Deletion - standard',
    value: form.name,
    'data-focus-key': 'automation-name',
    oninput: (e) => { form.name = e.target.value; },
  }));

  wrap.appendChild(mk('label', { style: { fontSize: '10.5px', color: '#8a96a3', display: 'block', marginBottom: '4px' } }, [
    'AWX job template — any ticket that runs this AWX template inherits this automation',
  ]));

  const selectedTpl = state.awxTemplates.find((t) => String(t.id) === String(form.awxTemplateId));
  if (selectedTpl) {
    wrap.appendChild(mk('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0d1926', border: '1px solid #0e3450', borderRadius: '6px', padding: '8px 12px', marginBottom: '20px' },
    }, [
      mk('span', { style: { fontSize: '13px', color: '#eef2f5', fontWeight: '600' } }, [selectedTpl.name]),
      mk('span', {
        style: { fontSize: '11px', color: '#38bdf8', cursor: 'pointer' },
        onclick: () => { form.awxTemplateId = ''; state.automationAwxFilter = ''; renderApp(); },
      }, ['change']),
    ]));
  } else {
    wrap.appendChild(mk('input', {
      style: { width: '100%', background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '8px 10px', color: '#eef2f5', fontSize: '13px', marginBottom: '8px' },
      type: 'text',
      placeholder: 'Search AWX templates by name…',
      value: state.automationAwxFilter,
      'data-focus-key': 'automation-awx-search',
      oninput: (e) => { state.automationAwxFilter = e.target.value; renderApp(); },
    }));

    const filterText = state.automationAwxFilter.trim().toLowerCase();
    const matches = (filterText
      ? state.awxTemplates.filter((t) => (t.name || '').toLowerCase().includes(filterText))
      : state.awxTemplates
    ).slice(0, 8);

    const resultsBox = mk('div', { style: { border: matches.length ? '1px solid #1b2530' : 'none', borderRadius: '6px', marginBottom: '20px', maxHeight: '220px', overflowY: 'auto' } });
    matches.forEach((tpl) => {
      resultsBox.appendChild(mk('div', {
        style: { padding: '8px 12px', fontSize: '12.5px', color: '#eef2f5', cursor: 'pointer', borderBottom: '1px solid #111a24' },
        onclick: () => { form.awxTemplateId = String(tpl.id); state.automationAwxFilter = ''; renderApp(); },
      }, [tpl.name]));
    });
    wrap.appendChild(resultsBox);
    if (filterText && matches.length === 0) {
      wrap.appendChild(mk('div', { style: { fontSize: '11.5px', color: '#8a96a3', marginTop: '-14px', marginBottom: '20px' } }, ['No templates match.']));
    }
  }

  if (state.awxTemplates.length === 0) {
    wrap.appendChild(mk('div', { style: { fontSize: '11px', color: '#f59e0b', marginTop: '-14px', marginBottom: '16px' } }, [
      'No AWX templates loaded yet — visit the AWX view once so they load, then come back here.',
    ]));
  }

  wrap.appendChild(renderAutomationBranchEditor('On success', 'success', form.onSuccess, '#22c55e'));
  wrap.appendChild(renderAutomationBranchEditor('On failure', 'failure', form.onFailure, '#ef4444'));

  const btnRow = mk('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } });
  btnRow.appendChild(mk('button', {
    style: { background: '#eef2f5', color: '#0a0e15', border: 'none', borderRadius: '6px', padding: '9px 20px', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' },
    onclick: () => saveAutomationTemplate(),
  }, ['Save']));
  btnRow.appendChild(mk('span', { style: { fontSize: '12px', color: '#8a96a3', cursor: 'pointer', alignSelf: 'center' }, onclick: () => closeAutomationForm() }, ['Cancel']));
  wrap.appendChild(btnRow);

  return wrap;
}

// ── Render: modal de adjuntos pendientes ──────────────────────────────────
function renderPendingAttachmentsModal() {
  const overlay = mk('div', {
    style: {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      background: '#000000aa', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '999',
    },
    onclick: (e) => { if (e.target === e.currentTarget) { state.showPendingAttachmentsModal = false; renderApp(); } },
  });

  const box = mk('div', { style: { width: '480px', maxHeight: '70%', overflowY: 'auto', background: '#0d141d', border: '1px solid #1b2530', borderRadius: '10px', padding: '20px' } });
  const headerRow = mk('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' } });
  headerRow.appendChild(mk('div', { style: { fontSize: '13px', fontWeight: '700', color: '#eef2f5' } }, ['Pending attachments']));
  headerRow.appendChild(mk('span', { style: { fontSize: '12px', color: '#8a96a3', cursor: 'pointer' }, onclick: () => { state.showPendingAttachmentsModal = false; renderApp(); } }, ['Close']));
  box.appendChild(headerRow);

  if (state.pendingAttachments.length === 0) {
    box.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#8a96a3' } }, ['Nothing pending.']));
  } else {
    state.pendingAttachments.forEach((p) => {
      const row = mk('div', { style: { background: '#0a0e15', border: '1px solid #1b2530', borderRadius: '6px', padding: '12px', marginBottom: '8px' } });
      row.appendChild(mk('div', { style: { fontSize: '12.5px', color: '#eef2f5', fontWeight: '600' } }, [
        `${p.ticketKey}${p.isParent ? ' (parent)' : ''}`,
      ]));
      row.appendChild(mk('div', { style: { fontSize: '11px', color: '#8a96a3', marginBottom: '8px' } }, [
        `${p.jobName} · ${p.status}`,
      ]));
      const btnRow = mk('div', { style: { display: 'flex', gap: '8px' } });
      const isResolving = state.resolvingPendingAttachmentId === p.id;
      btnRow.appendChild(mk('button', {
        style: { background: '#eef2f5', color: '#0a0e15', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '11.5px', fontWeight: '700', cursor: isResolving ? 'not-allowed' : 'pointer' },
        onclick: () => { if (!isResolving) resolvePendingAttachment(p); },
      }, [isResolving ? 'Uploading…' : 'Choose file…']));
      btnRow.appendChild(mk('span', { style: { fontSize: '11px', color: '#8a96a3', cursor: 'pointer', alignSelf: 'center' }, onclick: () => dismissPendingAttachment(p.id) }, ['dismiss']));
      row.appendChild(btnRow);
      box.appendChild(row);
    });
  }

  overlay.appendChild(box);
  return overlay;
}

async function resolvePendingAttachment(pending) {
  state.resolvingPendingAttachmentId = pending.id;
  renderApp();
  const res = await window.corexAPI.automationPickAndUploadAttachment(pending.ticketKey);
  state.resolvingPendingAttachmentId = null;
  if (res.canceled) {
    renderApp();
    return;
  }
  if (!res.ok) {
    toast(`Upload failed: ${res.error}`, 'err');
    renderApp();
    return;
  }
  await window.corexAPI.automationResolvePendingAttachment(pending.id);
  await loadPendingAttachments();
  state.persistentBanners = state.persistentBanners.filter((b) => b.id !== pending.id);
  toast(`Attached ${res.filename} to ${pending.ticketKey}`, 'ok');
  renderApp();
}

async function dismissPendingAttachment(id) {
  await window.corexAPI.automationResolvePendingAttachment(id);
  await loadPendingAttachments();
  state.persistentBanners = state.persistentBanners.filter((b) => b.id !== id);
  renderApp();
}
