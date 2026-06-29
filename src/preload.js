const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('corexAPI', {
  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (partial) => ipcRenderer.invoke('config:set', partial),

  // AWX
  awxListJobTemplates: () => ipcRenderer.invoke('awx:listJobTemplates'),
  awxGetSurveySpec: (templateId) => ipcRenderer.invoke('awx:getSurveySpec', { templateId }),
  awxListInstanceGroups: () => ipcRenderer.invoke('awx:listInstanceGroups'),
  awxListInventories: () => ipcRenderer.invoke('awx:listInventories'),
  awxListCredentials: () => ipcRenderer.invoke('awx:listCredentials'),
  awxListExecutionEnvironments: () => ipcRenderer.invoke('awx:listExecutionEnvironments'),
  awxLaunchJob: (templateId, extraVars, launchOptions) => ipcRenderer.invoke('awx:launchJob', { templateId, extraVars, launchOptions }),
  awxGetJob: (jobId) => ipcRenderer.invoke('awx:getJob', { jobId }),
  awxGetJobStdout: (jobId) => ipcRenderer.invoke('awx:getJobStdout', { jobId }),
  awxGetTemplateJobHistory: (templateId, page) => ipcRenderer.invoke('awx:getTemplateJobHistory', { templateId, page }),
  awxGetRecentJobs: (limit) => ipcRenderer.invoke('awx:getRecentJobs', { limit }),

  // Favoritos y uso de templates
  favoritesGet: () => ipcRenderer.invoke('favorites:get'),
  favoritesToggle: (templateId) => ipcRenderer.invoke('favorites:toggle', { templateId }),
  templateUsageGet: () => ipcRenderer.invoke('templateUsage:get'),

  // Jira
  jiraGetIssue: (key) => ipcRenderer.invoke('jira:getIssue', { key }),
  jiraSearchMyIssues: () => ipcRenderer.invoke('jira:searchMyIssues'),
  jiraAddComment: (key, body) => ipcRenderer.invoke('jira:addComment', { key, body }),
  jiraAddAttachment: (key, filename, contentBase64) =>
    ipcRenderer.invoke('jira:addAttachment', { key, filename, contentBase64 }),
  jiraDownloadAttachment: (url, suggestedName) =>
    ipcRenderer.invoke('jira:downloadAttachment', { url, suggestedName }),

  // Vínculos ticket ↔ template
  ticketLinksGet: () => ipcRenderer.invoke('ticketLinks:get'),
  ticketLinksSet: (key, templateId, templateName) => ipcRenderer.invoke('ticketLinks:set', { key, templateId, templateName }),
  ticketLinksRemove: (key) => ipcRenderer.invoke('ticketLinks:remove', { key }),

  // Mail
  sendMail: (to, subject, html, attachFilename) =>
    ipcRenderer.invoke('mail:send', { to, subject, html, attachFilename }),

  // Dashboard
  dashboardGetMetrics: () => ipcRenderer.invoke('dashboard:getMetrics'),

  // Files
  saveMarkdown: (content, defaultName) => ipcRenderer.invoke('save-markdown', { content, defaultName }),
  saveHtml: (content, defaultName) => ipcRenderer.invoke('save-html', { content, defaultName }),
  copyClipboard: (content) => ipcRenderer.invoke('copy-clipboard', { content }),

  // CorexTerm — master password / sesiones
  vaultExists: () => ipcRenderer.invoke('vault:exists'),
  vaultUnlock: (masterPassword) => ipcRenderer.invoke('vault:unlock', { masterPassword }),
  vaultIsUnlocked: () => ipcRenderer.invoke('vault:isUnlocked'),
  corextermListSessions: () => ipcRenderer.invoke('corexterm:listSessions'),
  corextermSaveSession: (session) => ipcRenderer.invoke('corexterm:saveSession', { session }),
  corextermDeleteSession: (id) => ipcRenderer.invoke('corexterm:deleteSession', { id }),
  corextermListMacros: () => ipcRenderer.invoke('corexterm:listMacros'),
  corextermSaveMacro: (macro) => ipcRenderer.invoke('corexterm:saveMacro', { macro }),
  corextermDeleteMacro: (id) => ipcRenderer.invoke('corexterm:deleteMacro', { id }),
  corextermPickKeyFile: () => ipcRenderer.invoke('corexterm:pickKeyFile'),

  // CorexTerm — terminal SSH interactivo
  corextermConnect: (sessionId, terminalId, cols, rows) =>
    ipcRenderer.invoke('corexterm:connect', { sessionId, terminalId, cols, rows }),
  corextermConnectLocal: (terminalId, cols, rows) =>
    ipcRenderer.invoke('corexterm:connectLocal', { terminalId, cols, rows }),
  corextermWrite: (terminalId, data) => ipcRenderer.invoke('corexterm:write', { terminalId, data }),
  corextermResize: (terminalId, cols, rows) => ipcRenderer.invoke('corexterm:resize', { terminalId, cols, rows }),
  corextermDisconnect: (terminalId) => ipcRenderer.invoke('corexterm:disconnect', { terminalId }),
  onCorextermData: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('corexterm:data', listener);
    return () => ipcRenderer.removeListener('corexterm:data', listener);
  },
  onCorextermClosed: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('corexterm:closed', listener);
    return () => ipcRenderer.removeListener('corexterm:closed', listener);
  },
  onCorextermError: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('corexterm:error', listener);
    return () => ipcRenderer.removeListener('corexterm:error', listener);
  },

  // CorexTerm — SFTP
  corextermSftpConnect: (sessionId) => ipcRenderer.invoke('corexterm:sftpConnect', { sessionId }),
  corextermSftpList: (sessionId, remotePath) => ipcRenderer.invoke('corexterm:sftpList', { sessionId, remotePath }),
  corextermSftpDownload: (sessionId, remotePath) => ipcRenderer.invoke('corexterm:sftpDownload', { sessionId, remotePath }),
  corextermSftpUpload: (sessionId, remoteDir) => ipcRenderer.invoke('corexterm:sftpUpload', { sessionId, remoteDir }),
  corextermSftpReadFile: (sessionId, remotePath) => ipcRenderer.invoke('corexterm:sftpReadFile', { sessionId, remotePath }),
  corextermSftpWriteFile: (sessionId, remotePath, content) => ipcRenderer.invoke('corexterm:sftpWriteFile', { sessionId, remotePath, content }),
  corextermSftpMkdir: (sessionId, remotePath) => ipcRenderer.invoke('corexterm:sftpMkdir', { sessionId, remotePath }),
  corextermSftpDelete: (sessionId, remotePath, isDirectory) => ipcRenderer.invoke('corexterm:sftpDelete', { sessionId, remotePath, isDirectory }),
  corextermSftpDisconnect: (sessionId) => ipcRenderer.invoke('corexterm:sftpDisconnect', { sessionId }),

  // VS Corex — explorador de archivos local
  vscorexPickFolder: () => ipcRenderer.invoke('vscorex:pickFolder'),
  vscorexListLocalDir: (dirPath) => ipcRenderer.invoke('vscorex:listLocalDir', { dirPath }),
  vscorexReadLocalFile: (filePath) => ipcRenderer.invoke('vscorex:readLocalFile', { filePath }),
  vscorexWriteLocalFile: (filePath, content) => ipcRenderer.invoke('vscorex:writeLocalFile', { filePath, content }),
  vscorexCreateLocalFile: (dirPath, name) => ipcRenderer.invoke('vscorex:createLocalFile', { dirPath, name }),
  vscorexCreateLocalFolder: (dirPath, name) => ipcRenderer.invoke('vscorex:createLocalFolder', { dirPath, name }),
  vscorexDeleteLocalEntry: (entryPath, isDirectory) => ipcRenderer.invoke('vscorex:deleteLocalEntry', { entryPath, isDirectory }),

  // VS Corex — Git
  vscorexCheckGitAvailable: () => ipcRenderer.invoke('vscorex:checkGitAvailable'),
  vscorexGitStatus: (dirPath) => ipcRenderer.invoke('vscorex:gitStatus', { dirPath }),
  vscorexGitDiff: (dirPath, filePath, staged) => ipcRenderer.invoke('vscorex:gitDiff', { dirPath, filePath, staged }),
  vscorexGitLog: (dirPath, maxCount) => ipcRenderer.invoke('vscorex:gitLog', { dirPath, maxCount }),
  vscorexGitStage: (dirPath, filePaths) => ipcRenderer.invoke('vscorex:gitStage', { dirPath, filePaths }),
  vscorexGitUnstage: (dirPath, filePaths) => ipcRenderer.invoke('vscorex:gitUnstage', { dirPath, filePaths }),
  vscorexGitCommit: (dirPath, message) => ipcRenderer.invoke('vscorex:gitCommit', { dirPath, message }),
  vscorexGitPush: (dirPath) => ipcRenderer.invoke('vscorex:gitPush', { dirPath }),
  vscorexGitPull: (dirPath) => ipcRenderer.invoke('vscorex:gitPull', { dirPath }),
});
