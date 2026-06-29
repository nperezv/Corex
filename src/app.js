
// ── State ──────────────────────────────────────────────────────────────────
let state = {
  view: 'inbox', // 'inbox' | 'awx' | 'jira' | 'settings'
  config: { jira: {}, awx: {}, smtp: {}, automationProfiles: {} },
  automationProfileEditorSelectedId: null,
  ticketLinkProfileDraft: '',
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
  awxRunningJobTicketKey: null,

  jiraKeyInput: '',
  jiraIssue: null,
  jiraLoading: false,
  jiraError: null,

  inboxIssues: [],
  inboxLoading: false,
  inboxError: null,
  inboxExpandedKey: null, // ticket whose link panel is open
  ticketLinks: {}, // { 'ITSD-1234': { templateId, templateName, linkedAt } }

  hwMetrics: null,
  hwLoading: false,
  hwError: null,
  hwPollHandle: null,
  hwHistory: [], // [{ t: timestamp, cpuUser, cpuSystem, memUsed, memTotal }]
  hwHistoryMaxPoints: 1200,
  hwTimeWindow: '60s', // '60s' | '5m' | '1h'

  favoriteTemplates: [], // [templateId, ...]
  templateUsage: {}, // { templateId: count }
  awxSortFavoritesFirst: false,

  awxLaunchWizard: null, // null when no launch wizard is active
  awxLaunchLoading: false,

  awxDetailTemplate: null,
  awxDetailReturnView: 'awx', // view to return to with "← Back" ('awx' or 'inbox')
  awxJobHistory: [],
  awxJobHistoryLoading: false,
  awxJobHistoryError: null,
  awxJobHistoryPage: 1,
  awxJobHistoryHasNext: false,

  awxRecentJobs: [],
  awxRecentJobsLoading: false,
  awxRecentJobsError: null,

  jiraDetailIssue: null,
  jiraDetailReturnView: 'inbox',
  jiraCommentDraft: '',
  jiraCommentSending: false,
  jiraAttachSending: false,
  jiraTransitions: [],
  jiraTransitionsLoading: false,
  jiraTransitionSending: false,
  jiraDetailExpandedFields: {},

  vaultUnlocked: false,
  vaultExists: false,
  vaultUnlockInput: '',
  vaultUnlockConfirm: '', // only used the first time to confirm the new Master Password
  vaultUnlockError: null,
  vaultUnlocking: false,

  // CorexTerm (view: 'corexterm')
  ctSessions: [],
  ctOpenTerminalIds: [], // [terminalId, ...] in open order
  ctActiveTerminalId: null, // currently visible open terminal
  ctTerminalInstances: {}, // { terminalId: { term, fitAddon, connected, kind, label } } — in-memory only, not serializable
  ctShowSessionForm: false,
  ctEditingSessionId: null,
  ctSessionForm: null, // active form object (see newSessionForm())

  ctSftpOpenFor: null, // terminalId of the tab with the SFTP panel open
  ctSftpPath: '.',
  ctSftpEntries: [],
  ctSftpLoading: false,
  ctSftpError: null,
  ctEditorFile: null, // { remotePath, content, dirty }
  ctEditorSaving: false,

  ctSplitMode: 'single',
  ctSplitSlots: [null, null, null, null],

  ctCollapsedFolders: {},

  ctBroadcastMode: false,

  ctRecordingMacro: false,
  ctMacroBuffer: '', // keys accumulated during the current recording
  ctMacros: [], // [{ id, name, keys }] — persisted in the vault
  ctShowMacroPanel: false,

  // VS Corex (view: 'vscorex')
  vsMonacoLoaded: false,
  vsWorkspaceKind: null, // 'local' | 'remote' | null when no workspace is open
  vsWorkspaceRoot: null, // local path, or remotePath when kind is 'remote'
  vsWorkspaceSessionId: null, // CorexTerm sessionId when the workspace is remote
  vsExplorerTree: {}, // { path: { entries, expanded } } — lazy tree expanded on demand
  vsOpenFiles: [], // [{ id, path, name, kind: 'local'|'remote', sessionId, content, dirty, model }]
  vsActiveFileId: null,
  vsGitAvailable: null, // null = not checked yet, true/false after checking
  vsGitStatus: null,
  vsGitPanelOpen: false,
  vsGitCommitMessage: '',
  vsGitDiffFile: null, // path of the file whose diff is shown
  vsGitDiffContent: '',
};

const T = {
  xs: '10px',   // metadatos, timestamps
  sm: '11px',   // labels, botones secundarios
  base: '13px', // cuerpo de texto, default
  md: '15px',   // section subtitles
  lg: '20px',   // view titles (H1)
  xl: '24px',   // full-page screens (vault gate)
};

const S = {
  1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 8: '32px',
};

const R = {
  sm: '3px',     // inputs, buttons, cards — default radius
  pill: '999px', // status/priority badges only
};

const C = {
  surface0: '#0a0b0d', // app background
  surface1: '#0d0e10', // cards
  surface2: '#14161a', // hover / elevated
  border: '#22252a',   // single border color
  textPrimary: '#dfe3e7',
  textSecondary: '#5e6670', // single secondary gray
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

  nav.appendChild(mk('div', {
    html: logoSvg,
    style: {
      position: 'absolute', width: '320px', height: '194px', color: '#ffffff', opacity: '0.07',
      bottom: '-36px', left: '-56px', pointerEvents: 'none', zIndex: '0',
    },
  }));

  const content = mk('div', { style: { position: 'relative', zIndex: '1', display: 'flex', flexDirection: 'column', height: '100%' } });

  const brandLogoSvg = '<svg viewBox="0 0 15559.15 9394.27" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:48px;height:29px;display:block;margin:0 auto 10px;">' +
    '<polygon fill="currentColor" points="4445.48,7673.09 2222.74,4535.94 -0,7673.09" />' +
    '<polygon fill="currentColor" points="11113.67,1398.78 13336.4,4535.93 15559.15,1398.78" />' +
    '<polygon fill="currentColor" points="9039.43,9394.27 2383.41,0 7115.63,0 13771.67,9394.27" />' +
    '</svg>';

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
          renderApp(); // this decides whether hardware polling should run or stop
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

  if (!state.vaultUnlocked) {
    app.innerHTML = '';
    app.appendChild(renderVaultGate());
    return;
  }

  if (state.view === 'inbox') {
    if (!state.hwPollHandle) startHwPolling();
  } else {
    stopHwPolling();
  }

  const prevMain = document.getElementById('corex-main-scroll');
  const sameView = prevMain && prevMain.dataset.view === state.view;
  const prevScrollTop = sameView ? prevMain.scrollTop : 0;

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


async function checkVaultGate() {
  const res = await window.corexAPI.vaultExists();
  state.vaultExists = res.exists;
  renderApp();
}

async function submitVaultUnlock() {
  const pw = state.vaultUnlockInput;
  if (!pw.trim()) return;

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

  await checkVaultGate();
}

init();


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


const OTHER_PROMPT_FLAGS = [
  'ask_variables_on_launch', 'ask_limit_on_launch', 'ask_tags_on_launch', 'ask_skip_tags_on_launch',
  'ask_job_type_on_launch', 'ask_verbosity_on_launch', 'ask_inventory_on_launch', 'ask_credential_on_launch',
  'ask_execution_environment_on_launch', 'ask_scm_branch_on_launch', 'ask_forks_on_launch',
  'ask_diff_mode_on_launch', 'ask_labels_on_launch', 'ask_job_slice_count_on_launch', 'ask_timeout_on_launch',
];

function templateHasOtherPrompts(tpl) {
  return OTHER_PROMPT_FLAGS.some((flag) => tpl[flag]);
}

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
        wizard.steps = wizard.steps.filter((s) => s !== 'survey');
      }
    }));
  }

  await Promise.all(loaders);
  state.awxLaunchLoading = false;

  if (wizard.steps.length === 0) {
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
  return true;
}

function wizardSurveyBlockingQuestion(wizard) {
  if (!wizard.surveySpec) return null;
  return (wizard.surveySpec.spec || []).find((q) => q.required && !String(wizard.surveyAnswers[q.variable] || '').trim()) || null;
}

function renderAwxLaunchWizard() {
  const wizard = state.awxLaunchWizard;
  const tpl = wizard.template;
  const step = wizard.steps[wizard.currentStepIndex];
  const wrap = mk('div', {});

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

  if (step === 'instance_groups') {
    wrap.appendChild(renderInstanceGroupsStep(wizard));
  } else if (step === 'other_prompts') {
    wrap.appendChild(renderOtherPromptsStep(wizard));
  } else if (step === 'survey') {
    wrap.appendChild(renderSurveyStep(wizard));
  } else if (step === 'preview') {
    wrap.appendChild(renderPreviewStep(wizard));
  }

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
      const ta = mk('textarea', {
        style: {
          width: '100%', minHeight: '110px', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px',
          padding: '8px 10px', color: '#dfe3e7', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical',
        },
        placeholder: q.default || '',
        'data-focus-key': `survey-${q.variable}`,
        oninput: (e) => { wizard.surveyAnswers[q.variable] = e.target.value; },
      });
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
    (wizard.surveySpec.spec || []).forEach((q) => {
      if (q.type === 'textarea' && typeof extraVars[q.variable] === 'string') {
        extraVars[q.variable] = extraVars[q.variable].replace(/\r\n/g, '\n');
      }
    });
  }
  if (state.awxExtraVarsTicket.trim()) {
    extraVars.ticket = state.awxExtraVarsTicket.trim();
  }

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

// Hook: when an AWX job finishes, sync its result back to the linked Jira ticket.
async function onAwxJobFinished(job) {
  const ok = job.status === 'successful';
  toast(
    ok ? t('awx_job_finished_ok', { id: job.id }) : t('awx_job_finished_status', { id: job.id, status: job.status }),
    ok ? 'ok' : 'err'
  );

  const key = state.awxRunningJobTicketKey || (state.awxExtraVarsTicket && state.awxExtraVarsTicket.trim());
  if (!key || !state.config.jira || !state.config.jira.url) return;

  const issueRes = await window.corexAPI.jiraGetIssue(key);
  const issue = issueRes.ok ? issueRes.issue : null;
  const parentKey = issue && issue.fields && issue.fields.parent && issue.fields.parent.key;
  const profile = getAutomationProfile(job, issue, key);
  const ctx = buildAutomationContext(job, issue, key);

  const summary = buildAwxCompletionComment(job, ok, profile, ctx);
  const commentRes = await window.corexAPI.jiraAddComment(key, summary);
  if (!commentRes.ok) toast(`Jira auto-comment failed: ${commentRes.error}`, 'err');

  if (profile.attachStdout !== false && state.awxStdout) {
    const base64 = btoa(unescape(encodeURIComponent(state.awxStdout)));
    const attachRes = await window.corexAPI.jiraAddAttachment(key, `awx-job-${job.id}-stdout.txt`, base64, 'text/plain');
    if (!attachRes.ok) toast(`Jira auto-attach failed: ${attachRes.error}`, 'err');
  }

  if (!ok) return;

  const childDone = await transitionJiraByCandidates(key, asCandidateList(profile.childSuccessTransitions, ['Done', 'Completed', 'Complete']));
  if (!childDone.ok) toast(`Jira sub-task transition skipped: ${childDone.error}`, 'err');

  if (parentKey && profile.parent && profile.parent.enabled !== false) {
    const parentComment = renderAutomationTemplate(profile.parent.comment || 'AWX job #{{job.id}} completed for {{ticketKey}}.', ctx);
    const parentCommentRes = await window.corexAPI.jiraAddComment(parentKey, parentComment);
    if (!parentCommentRes.ok) toast(`Jira parent comment failed: ${parentCommentRes.error}`, 'err');

    const parentReview = await transitionParentToBuildPeerReview(parentKey, profile.parent);
    if (!parentReview.ok) toast(`Jira parent transition skipped: ${parentReview.error}`, 'err');
  }
}

function buildAwxCompletionComment(job, ok, profile, ctx) {
  const configured = ok ? profile.successComment : profile.failureComment;
  if (configured) return renderAutomationTemplate(configured, ctx);

  return [
    `COREX/AWX job #${job.id} finished with status: ${job.status}`,
    job.name ? `Template/job: ${job.name}` : null,
    job.started ? `Started: ${new Date(job.started).toLocaleString()}` : null,
    job.finished ? `Finished: ${new Date(job.finished).toLocaleString()}` : null,
    '',
    'Stdout was attached automatically when available.',
  ].filter((line) => line !== null).join('\n');
}

function getAutomationProfile(job, issue, key) {
  const link = state.ticketLinks[key] || {};
  const profiles = state.config.automationProfiles || {};
  const templateId = String(link.templateId || job.unified_job_template || job.job_template || '');
  const templateName = String(link.templateName || job.name || job.job_template_name || '').toLowerCase();
  const directProfileId = link.automationProfileId || link.profileId || '';
  const profile = (directProfileId && profiles[directProfileId])
    || profiles[templateId]
    || Object.values(profiles).find((p) => {
      if (!p) return false;
      const ids = Array.isArray(p.templateIds) ? p.templateIds.map(String) : [];
      const names = Array.isArray(p.templateNameIncludes) ? p.templateNameIncludes : (p.templateNameIncludes ? [p.templateNameIncludes] : []);
      return ids.includes(templateId) || names.some((name) => templateName.includes(String(name).toLowerCase()));
    });
  return {
    attachStdout: true,
    childSuccessTransitions: ['Done', 'Completed', 'Complete'],
    parent: { enabled: false },
    ...(profile || {}),
  };
}

function buildAutomationContext(job, issue, key) {
  const link = state.ticketLinks[key] || {};
  return {
    issue,
    job,
    link,
    ticketKey: key,
    parentKey: issue && issue.fields && issue.fields.parent && issue.fields.parent.key,
    stdout: state.awxStdout || '',
    templateName: link.templateName || job.name || job.job_template_name || '',
  };
}

function getPath(obj, path) {
  return String(path).split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
}

function renderAutomationTemplate(template, ctx) {
  return String(template || '').replace(/{{\s*([\w.]+)\s*}}/g, (m, path) => {
    const value = getPath(ctx, path);
    return value == null ? '' : String(value);
  });
}

function asCandidateList(value, fallback) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((x) => x.trim()).filter(Boolean);
  return fallback;
}

async function transitionJiraByCandidates(key, candidates) {
  let lastError = null;
  for (const candidate of candidates) {
    const res = await window.corexAPI.jiraTransitionIssue(key, null, candidate);
    if (res.ok) return { ok: true, transition: candidate };
    lastError = res.error;
  }
  return { ok: false, error: lastError || `No matching transition found: ${candidates.join(', ')}` };
}

async function transitionParentToBuildPeerReview(parentKey, parentProfile) {
  // Some Jira workflows do not expose the target review transition until the
  // parent leaves a waiting state, so we try the target, unblock it, then retry.
  const direct = await transitionJiraByCandidates(parentKey, asCandidateList(parentProfile && parentProfile.transitions, ['Build Peer Review', 'To Build Peer Review']));
  if (direct.ok) return direct;

  const unblocked = await transitionJiraByCandidates(parentKey, asCandidateList(parentProfile && parentProfile.fallbackTransitions, ['In Progress', 'Start Progress']));
  if (!unblocked.ok) return { ok: false, error: `${direct.error}; fallback failed: ${unblocked.error}` };

  return transitionJiraByCandidates(parentKey, asCandidateList(parentProfile && parentProfile.retryTransitions, ['Build Peer Review', 'To Build Peer Review']));
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
      const linkedProfile = link.automationProfileId && state.config.automationProfiles && state.config.automationProfiles[link.automationProfileId];
      actionCol.appendChild(mk('div', { style: { textAlign: 'right' } }, [
        mk('div', {
          style: { fontSize: '11px', color: '#6ad17e', fontWeight: '600', marginBottom: '6px', cursor: 'pointer' },
          onclick: () => launchLinkedJob(key),
        }, [`→ ${link.templateName}`]),
        linkedProfile ? mk('div', { style: { fontSize: '10.5px', color: '#5e6670', marginBottom: '6px' } }, [`Automation: ${linkedProfile.name || link.automationProfileId}`]) : null,
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

      const profileOptions = profileEntries();
      if (profileOptions.length) {
        const select = mk('select', {
          style: {
            width: '100%', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px',
            padding: '8px 10px', color: '#dfe3e7', fontSize: '12.5px', marginBottom: '8px',
          },
          value: state.ticketLinkProfileDraft || '',
          onchange: (e) => { state.ticketLinkProfileDraft = e.target.value; },
        });
        select.appendChild(mk('option', { value: '' }, ['Use automatic/default automation']));
        profileOptions.forEach(([id, profile]) => select.appendChild(mk('option', { value: id }, [profile.name || id])));
        select.value = state.ticketLinkProfileDraft || '';
        linkPanel.appendChild(select);
      }

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
            onclick: () => linkTicketToTemplate(key, tpl, state.ticketLinkProfileDraft),
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


function settingsTextarea(label, value, onInput, opts) {
  opts = opts || {};
  const col = mk('div', { style: { marginBottom: '14px' } });
  col.appendChild(mk('label', { style: { fontSize: '11px', color: '#5e6670', display: 'block', marginBottom: '4px' } }, [label]));
  const ta = mk('textarea', {
    style: {
      width: '100%', minHeight: opts.minHeight || '170px', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px',
      padding: '9px 12px', color: '#dfe3e7', fontSize: '12px', fontFamily: 'monospace', resize: 'vertical',
    },
    placeholder: opts.placeholder || '',
    oninput: (e) => onInput(e.target.value),
  });
  ta.value = value || '';
  col.appendChild(ta);
  return col;
}

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
  if (state.automationProfilesJson != null) {
    try { state.config.automationProfiles = JSON.parse(state.automationProfilesJson || '{}'); }
    catch (e) { toast(`Invalid automation profiles JSON: ${e.message}`, 'err'); return; }
  }
  await window.corexAPI.setConfig(state.config);
  toast(t('settings_saved_toast'), 'ok');
  // Refresh dependent views
  state.awxTemplates = [];
}

function profileEntries() {
  return Object.entries(state.config.automationProfiles || {}).filter(([id, profile]) => id && profile);
}

function ensureProfileEditorSelection() {
  const entries = profileEntries();
  if (!state.automationProfileEditorSelectedId && entries.length) state.automationProfileEditorSelectedId = entries[0][0];
  if (state.automationProfileEditorSelectedId && !state.config.automationProfiles[state.automationProfileEditorSelectedId]) {
    state.automationProfileEditorSelectedId = entries.length ? entries[0][0] : null;
  }
}

function makeProfileId(name) {
  const base = String(name || 'automation-template').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'automation-template';
  let id = base;
  let i = 2;
  state.config.automationProfiles = state.config.automationProfiles || {};
  while (state.config.automationProfiles[id]) id = `${base}-${i++}`;
  return id;
}

function createAutomationProfile() {
  state.config.automationProfiles = state.config.automationProfiles || {};
  const id = makeProfileId('New automation template');
  state.config.automationProfiles[id] = {
    name: 'New automation template',
    templateIds: [],
    templateNameIncludes: [],
    attachStdout: true,
    successComment: 'Automation finished successfully for {{ticketKey}} via AWX job #{{job.id}}.',
    failureComment: 'AWX job #{{job.id}} failed for {{ticketKey}}.',
    childSuccessTransitions: ['Done', 'Completed', 'Complete'],
    childFailureTransitions: [],
    parent: { enabled: false, comment: '', transitions: [], fallbackTransitions: [], retryTransitions: [] },
  };
  state.automationProfileEditorSelectedId = id;
  renderApp();
}

function deleteAutomationProfile(id) {
  if (!id || !state.config.automationProfiles[id]) return;
  delete state.config.automationProfiles[id];
  state.automationProfileEditorSelectedId = null;
  ensureProfileEditorSelection();
  renderApp();
}

function csvToList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function listToCsv(value) {
  return Array.isArray(value) ? value.join(', ') : (value || '');
}

function profileField(label, value, onInput, opts) {
  return settingsField(label, value, onInput, opts);
}

function profileTextarea(label, value, onInput, opts) {
  return settingsTextarea(label, value, onInput, opts);
}

function renderProfileAwxTemplatePicker(profile) {
  const box = mk('div', { style: { marginBottom: '14px' } });
  box.appendChild(mk('label', { style: { fontSize: '11px', color: '#5e6670', display: 'block', marginBottom: '6px' } }, ['AWX jobs linked to this automation template']));
  const selected = (profile.templateIds || []).map(String);
  const templates = (state.awxTemplates || []).slice(0, 80);
  if (!templates.length) {
    box.appendChild(mk('button', {
      style: { background: '#14161a', color: '#dfe3e7', border: '1px solid #22252a', borderRadius: '3px', padding: '8px 12px', cursor: 'pointer', fontSize: '12px' },
      onclick: async () => { await loadAwxTemplates(); renderApp(); },
    }, ['Load AWX jobs']));
  } else {
    const grid = mk('div', { style: { maxHeight: '170px', overflow: 'auto', border: '1px solid #22252a', borderRadius: '3px', padding: '8px', background: '#0a0b0d' } });
    templates.forEach((tpl) => {
      const id = String(tpl.id);
      const row = mk('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', color: '#dfe3e7', fontSize: '12px', cursor: 'pointer' } });
      const cb = mk('input', {
        type: 'checkbox',
        onchange: (e) => {
          const ids = new Set((profile.templateIds || []).map(String));
          if (e.target.checked) ids.add(id); else ids.delete(id);
          profile.templateIds = Array.from(ids).map((x) => Number.isNaN(Number(x)) ? x : Number(x));
          renderApp();
        },
      });
      cb.checked = selected.includes(id);
      row.appendChild(cb);
      row.appendChild(mk('span', {}, [`#${tpl.id} ${tpl.name || 'Unnamed job'}`]));
      grid.appendChild(row);
    });
    box.appendChild(grid);
  }
  box.appendChild(mk('p', { style: { fontSize: '11px', color: '#5e6670', margin: '6px 0 0' } }, ['You can also select a template when linking a Jira ticket to an AWX job.']));
  return box;
}

function renderAutomationProfilesSection() {
  ensureProfileEditorSelection();
  const profiles = state.config.automationProfiles || {};
  const entries = profileEntries();
  const selectedId = state.automationProfileEditorSelectedId;
  const selected = selectedId ? profiles[selectedId] : null;
  const children = [
    mk('p', { style: { fontSize: '11px', color: '#5e6670', lineHeight: '1.5', marginTop: '-4px' } }, [
      'Create reusable automation templates with fields instead of JSON. Link them to AWX jobs here, or choose one while linking a Jira ticket to a job.',
    ]),
    mk('button', {
      style: { background: '#dfe3e7', color: '#0a0b0d', border: 'none', borderRadius: '3px', padding: '9px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', marginBottom: '14px' },
      onclick: createAutomationProfile,
    }, ['+ New automation template']),
  ];

  if (!entries.length) {
    children.push(mk('div', { style: { border: '1px dashed #22252a', borderRadius: '4px', padding: '16px', color: '#5e6670', fontSize: '12px', lineHeight: '1.5' } }, [
      'No automation templates yet. Create one to define comments, child-ticket transitions, parent-ticket actions and stdout attachment rules.',
    ]));
    return settingsSection('AWX → Jira automation templates', children);
  }

  const selector = mk('select', {
    style: { width: '100%', background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', padding: '9px 12px', color: '#dfe3e7', fontSize: '13px', marginBottom: '14px' },
    onchange: (e) => { state.automationProfileEditorSelectedId = e.target.value; renderApp(); },
  });
  entries.forEach(([id, profile]) => selector.appendChild(mk('option', { value: id }, [profile.name || id])));
  selector.value = selectedId || '';
  children.push(selector);

  if (selected) {
    selected.parent = selected.parent || { enabled: false };
    children.push(profileField('Template name', selected.name || selectedId, (v) => { selected.name = v; }));
    children.push(renderProfileAwxTemplatePicker(selected));
    children.push(profileField('Also match AWX job names containing', listToCsv(selected.templateNameIncludes), (v) => { selected.templateNameIncludes = csvToList(v); }, { placeholder: 'build, patch, restart' }));
    children.push(settingsToggleGroup('Attach AWX stdout to the Jira ticket', selected.attachStdout === false ? 'no' : 'yes', [
      { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
    ], (v) => { selected.attachStdout = v === 'yes'; }));
    children.push(profileTextarea('Success comment for the linked ticket', selected.successComment || '', (v) => { selected.successComment = v; }, { minHeight: '95px', placeholder: 'Build completed successfully for {{ticketKey}}. AWX job #{{job.id}}.' }));
    children.push(profileTextarea('Failure comment for the linked ticket', selected.failureComment || '', (v) => { selected.failureComment = v; }, { minHeight: '80px', placeholder: 'AWX job #{{job.id}} failed for {{ticketKey}}.' }));
    children.push(profileField('Child success transitions', listToCsv(selected.childSuccessTransitions), (v) => { selected.childSuccessTransitions = csvToList(v); }, { placeholder: 'Done, Completed, Complete' }));

    children.push(settingsToggleGroup('Update parent ticket', selected.parent.enabled === false ? 'no' : 'yes', [
      { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
    ], (v) => { selected.parent.enabled = v === 'yes'; }));
    if (selected.parent.enabled !== false) {
      children.push(profileTextarea('Parent comment', selected.parent.comment || '', (v) => { selected.parent.comment = v; }, { minHeight: '70px', placeholder: 'To Build Peer Review' }));
      children.push(profileField('Parent target transitions', listToCsv(selected.parent.transitions), (v) => { selected.parent.transitions = csvToList(v); }, { placeholder: 'Build Peer Review, To Build Peer Review' }));
      children.push(profileField('Parent fallback transitions', listToCsv(selected.parent.fallbackTransitions), (v) => { selected.parent.fallbackTransitions = csvToList(v); }, { placeholder: 'In Progress, Start Progress' }));
      children.push(profileField('Parent retry transitions', listToCsv(selected.parent.retryTransitions), (v) => { selected.parent.retryTransitions = csvToList(v); }, { placeholder: 'Build Peer Review' }));
    }
    children.push(mk('p', { style: { fontSize: '11px', color: '#5e6670', lineHeight: '1.5' } }, ['Placeholders: {{ticketKey}}, {{parentKey}}, {{job.id}}, {{job.name}}, {{job.status}}, {{templateName}}.']));
    children.push(mk('button', {
      style: { background: '#2a1111', color: '#ffb4b4', border: '1px solid #5b2424', borderRadius: '3px', padding: '8px 12px', cursor: 'pointer', fontSize: '12px' },
      onclick: () => deleteAutomationProfile(selectedId),
    }, ['Delete this automation template']));
  }

  return settingsSection('AWX → Jira automation templates', children);
}

function renderSettingsView() {
  const wrap = mk('div', {});
  wrap.appendChild(mk('h1', { style: { fontSize: '22px', fontWeight: '700', marginBottom: '4px', color: '#dfe3e7' } }, [t('settings_title')]));
  wrap.appendChild(mk('p', { style: { fontSize: '13px', color: '#5e6670', marginBottom: '24px' } }, [t('settings_subtitle')]));

  state.config.awx = state.config.awx || {};
  state.config.jira = state.config.jira || {};
  state.config.smtp = state.config.smtp || {};
  state.config.automationProfiles = state.config.automationProfiles || {};
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


  wrap.appendChild(renderAutomationProfilesSection());

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



async function loadHwMetrics() {
  const res = await window.corexAPI.dashboardGetMetrics();
  if (!res.ok) {
    state.hwError = res.error;
  } else {
    state.hwError = null;
    state.hwMetrics = res;

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

function renderHwGauge(label, pct, sublabel) {
  const safePct = Math.max(0, Math.min(100, pct || 0));
  const color = hwBarColor(safePct);
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;

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

function renderStackedAreaChart(series, colors, ymax, widthPx, heightPx) {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${widthPx} ${heightPx}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', heightPx);
  svg.style.display = 'block';

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

  // ── Disks / Network / Top processes, two columns ──
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

async function linkTicketToTemplate(key, tpl, automationProfileId) {
  state.ticketLinks = await window.corexAPI.ticketLinksSet(key, tpl.id, tpl.name, automationProfileId || '');
  state.inboxExpandedKey = null;
  state.ticketLinkProfileDraft = '';
  const profile = automationProfileId && state.config.automationProfiles && state.config.automationProfiles[automationProfileId];
  const suffix = profile ? ` with automation "${profile.name || automationProfileId}"` : '';
  toast(`${key} ${t('inbox_linked_toast')} "${tpl.name}"${suffix}`, 'ok');
  renderApp();
}

async function unlinkTicket(key) {
  state.ticketLinks = await window.corexAPI.ticketLinksRemove(key);
  toast(`${key} ${t('inbox_unlinked_toast')}`, 'ok');
  renderApp();
}

async function launchLinkedJob(key) {
  const link = state.ticketLinks[key];
  if (!link) return;

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

function priorityRank(priority) {
  const name = (priority && priority.name || '').toLowerCase();
  if (!name || name.includes('not prioritized') || name.includes('sin prioridad')) return null;
  if (name.includes('highest') || name.includes('critical') || name.startsWith('p1')) return 4;
  if (name.includes('high') || name.startsWith('p2')) return 3;
  if (name.includes('medium') || name.startsWith('p3') || name.startsWith('p4')) return 2;
  return 1; // cualquier otra prioridad nombrada (low, p5...) sigue contando como "tiene prioridad"
}

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

  wrap.appendChild(renderHardwareSection());

  wrap.appendChild(renderHwChartsSection());

  if (state.config.jira && state.config.jira.url) {
    const topSection = renderTopTicketsSection();
    if (topSection) wrap.appendChild(topSection);
  }

  return wrap;
}


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
    loadJiraTransitions(key);
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
    const issueRes = await window.corexAPI.jiraGetIssue(state.jiraDetailIssue.key);
    if (issueRes.ok) state.jiraDetailIssue = issueRes.issue;
  }
  renderApp();
}


async function loadJiraTransitions(key) {
  state.jiraTransitionsLoading = true;
  const res = await window.corexAPI.jiraListTransitions(key);
  state.jiraTransitionsLoading = false;
  state.jiraTransitions = res.ok ? res.transitions : [];
  renderApp();
}

async function transitionJiraIssue(transitionId) {
  if (!state.jiraDetailIssue || !transitionId) return;
  state.jiraTransitionSending = true;
  renderApp();
  const res = await window.corexAPI.jiraTransitionIssue(state.jiraDetailIssue.key, transitionId, null);
  state.jiraTransitionSending = false;
  if (!res.ok) toast(`Transition failed: ${res.error}`, 'err');
  else {
    toast('Ticket status updated', 'ok');
    const issueRes = await window.corexAPI.jiraGetIssue(state.jiraDetailIssue.key);
    if (issueRes.ok) state.jiraDetailIssue = issueRes.issue;
    loadJiraTransitions(state.jiraDetailIssue.key);
  }
  renderApp();
}

async function pickAndAttachJiraFile() {
  if (!state.jiraDetailIssue) return;
  state.jiraAttachSending = true;
  renderApp();
  const res = await window.corexAPI.jiraPickAndAttachFile(state.jiraDetailIssue.key);
  state.jiraAttachSending = false;
  if (res.canceled) { renderApp(); return; }
  if (!res.ok) toast(`${t('jira_detail_attach_failed')} ${res.error}`, 'err');
  else {
    toast(t('jira_detail_attach_sent'), 'ok');
    const issueRes = await window.corexAPI.jiraGetIssue(state.jiraDetailIssue.key);
    if (issueRes.ok) state.jiraDetailIssue = issueRes.issue;
  }
  renderApp();
}

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
  const res = await window.corexAPI.jiraAddAttachment(state.jiraDetailIssue.key, filename, base64, 'text/plain');
  state.jiraAttachSending = false;
  if (!res.ok) {
    toast(`${t('jira_detail_attach_failed')} ${res.error}`, 'err');
  } else {
    toast(t('jira_detail_attach_sent'), 'ok');
  }
  renderApp();
}

const JIRA_CUSTOM_FIELDS = {
  slaTimeToResolution: 'customfield_15324',
  slaTimeToFirstResponse: 'customfield_15325',
  assignmentGroup: 'customfield_15391',
  businessJustification: 'customfield_15098',
};

function jiraWikiToHtml(raw) {
  if (!raw) return '';

  const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const htmlParts = [];
  let listStack = []; // [{tag, depth}] — stack of open list levels

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
        htmlParts.push(`<${tag} style="margin:2px 0 2px 18px;padding:0;"><li style="margin-bottom:2px;">`);
        listStack.push({ tag, depth });
      } else {
        if (listStack[listStack.length - 1].depth > depth) closeListsTo(depth);
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

  if (link) {
    const linkedProfile = link.automationProfileId && state.config.automationProfiles && state.config.automationProfiles[link.automationProfileId];
    const linkBox = mk('div', { style: { background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '14px 16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } });
    linkBox.appendChild(mk('div', {
      style: { cursor: 'pointer' },
      onclick: () => {
        const tpl = state.awxTemplates.find((tplItem) => tplItem.id === link.templateId) || { id: link.templateId, name: link.templateName };
        openAwxDetail(tpl, 'jira-detail');
      },
    }, [
      mk('div', { style: { fontSize: '12.5px', color: '#6ad17e', fontWeight: '600' } }, [`→ ${link.templateName}`]),
      linkedProfile ? mk('div', { style: { fontSize: '10.5px', color: '#5e6670', marginTop: '4px' } }, [`Automation: ${linkedProfile.name || link.automationProfileId}`]) : null,
    ]));
    linkBox.appendChild(mk('button', {
      style: { background: '#dfe3e7', color: '#0a0b0d', border: 'none', borderRadius: '3px', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
      onclick: () => launchLinkedJob(issue.key),
    }, ['▶ ' + t('inbox_execute')]));
    wrap.appendChild(linkBox);
  }

  const transitionBox = mk('div', { style: { background: '#0d0e10', border: '1px solid #22252a', borderRadius: '4px', padding: '14px 16px', marginBottom: '16px' } });
  transitionBox.appendChild(mk('div', { style: { fontSize: '11px', color: '#5e6670', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' } }, ['Update Jira status']));
  const transitionRow = mk('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } });
  transitionRow.appendChild(mk('span', { style: { fontSize: '12px', color: '#dfe3e7' } }, [`Current: ${(f.status && f.status.name) || '—'}`]));
  if (state.jiraTransitionsLoading) {
    transitionRow.appendChild(mk('span', { style: { fontSize: '12px', color: '#5e6670' } }, ['Loading transitions…']));
  } else if (state.jiraTransitions.length === 0) {
    transitionRow.appendChild(mk('span', { style: { fontSize: '12px', color: '#5e6670' } }, ['No available transitions for your Jira permissions/workflow.']));
  } else {
    const select = mk('select', {
      style: { background: '#0a0b0d', border: '1px solid #22252a', borderRadius: '3px', padding: '7px 10px', color: '#dfe3e7', fontSize: '12px' },
      onchange: (e) => { if (e.target.value) transitionJiraIssue(e.target.value); },
    }, [mk('option', { value: '' }, [state.jiraTransitionSending ? 'Updating…' : 'Choose transition…'])]);
    state.jiraTransitions.forEach((tr) => select.appendChild(mk('option', { value: tr.id }, [tr.name])));
    transitionRow.appendChild(select);
  }
  transitionBox.appendChild(transitionRow);
  wrap.appendChild(transitionBox);

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
  attachBox.appendChild(mk('button', {
    style: {
      marginLeft: '8px', background: 'transparent', color: state.jiraAttachSending ? '#5e6670' : '#dfe3e7',
      border: `1px solid ${state.jiraAttachSending ? '#22252a' : '#5e6670'}`, borderRadius: '3px', padding: '8px 20px',
      fontSize: '13px', fontWeight: '600', cursor: state.jiraAttachSending ? 'not-allowed' : 'pointer',
    },
    onclick: () => { if (!state.jiraAttachSending) pickAndAttachJiraFile(); },
  }, [state.jiraAttachSending ? t('jira_detail_attach_sending') : '⊕ Attach local file']));
  if (!state.awxStdout) {
    attachBox.appendChild(mk('p', { style: { fontSize: '11px', color: '#5e6670', marginTop: '8px' } }, [t('jira_detail_no_job_yet')]));
  }
  wrap.appendChild(attachBox);

  return wrap;
}


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
    secret: '', // never filled back in — leaving it empty preserves the existing encrypted value
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

function buildXtermInstance(container) {
  const term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    lineHeight: 1.3,
    scrollback: 5000,
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

function isTerminalVisible(terminalId) {
  if (state.ctSplitMode === 'single') return state.ctActiveTerminalId === terminalId;
  return state.ctSplitSlots.includes(terminalId);
}

function writeToTerminal(sourceTerminalId, data) {
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

    window.corexAPI.corextermSftpConnect(session.id).then((res) => {
      if (state.ctTerminalInstances[terminalId]) {
        state.ctTerminalInstances[terminalId].sftpReady = !!res.ok;
      }
    });
  });
}

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
  requestAnimationFrame(() => {
    const inst = state.ctTerminalInstances[terminalId];
    if (inst && inst.fitAddon) {
      inst.fitAddon.fit();
      if (inst.term) window.corexAPI.corextermResize(terminalId, inst.term.cols, inst.term.rows);
    }
  });
}

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
  state.ctSplitSlots = state.ctSplitSlots.map((id) => (id === terminalId ? null : id));
  delete state.ctTerminalInstances[terminalId];
  state.ctOpenTerminalIds = state.ctOpenTerminalIds.filter((id) => id !== terminalId);

  if (state.ctActiveTerminalId === terminalId) {
    state.ctActiveTerminalId = state.ctOpenTerminalIds.length > 0
      ? state.ctOpenTerminalIds[state.ctOpenTerminalIds.length - 1]
      : null;
  }

  const remainingSsh = state.ctOpenTerminalIds.filter((id) => {
    const i = state.ctTerminalInstances[id];
    return i && i.kind === 'ssh';
  }).length;
  if (remainingSsh < 2) state.ctBroadcastMode = false;

  renderApp();
}


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

function playMacro(macro) {
  if (!state.ctActiveTerminalId) {
    toast('Open a terminal first', 'err');
    return;
  }
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

  if (!state.vaultUnlocked) {
    wrap.appendChild(mk('div', { style: { fontSize: '13px', color: '#c98a3a' } }, ['Vault is locked. Please restart COREX.']));
    return wrap;
  }

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

  bar.appendChild(mk('div', {
    style: { display: 'flex', alignItems: 'center', padding: '7px 12px', cursor: 'pointer', color: '#5e6670', fontSize: '14px' },
    onclick: () => { state.ctActiveTerminalId = null; renderApp(); },
  }, ['+']));

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


let monacoInitPromise = null;

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

  body.appendChild(renderVsEditorArea());

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


let monacoEditorInstance = null;

function renderVsEditorArea() {
  const wrap = mk('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', minWidth: '0' } });

  if (state.vsOpenFiles.length === 0) {
    wrap.appendChild(mk('div', { style: { flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5e6670', fontSize: '12.5px' } }, [
      'Select a file from the explorer to start editing.',
    ]));
    return wrap;
  }

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

  const activeFile = state.vsOpenFiles.find((f) => f.id === state.vsActiveFileId);
  const actionBar = mk('div', { style: { display: 'flex', justifyContent: 'flex-end', padding: '6px 10px', borderBottom: '1px solid #22252a' } });
  actionBar.appendChild(mk('button', {
    style: { background: '#dfe3e7', color: '#0a0b0d', border: 'none', borderRadius: '3px', padding: '5px 14px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
    onclick: () => saveActiveFile(),
  }, ['Save']));
  wrap.appendChild(actionBar);

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


function renderVsGitPanel() {
  const panel = mk('div', { style: { width: '300px', flexShrink: '0', borderLeft: '1px solid #22252a', overflowY: 'auto', padding: '12px' } });
  const s = state.vsGitStatus;

  if (!s) {
    panel.appendChild(mk('div', { style: { fontSize: '12px', color: '#5e6670' } }, ['This folder is not a Git repository.']));
    return panel;
  }

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
