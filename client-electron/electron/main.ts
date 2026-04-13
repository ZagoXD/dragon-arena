import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { autoUpdater, ProgressInfo, UpdateInfo } from 'electron-updater'
import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import ptBR from '../src/i18n/locales/pt-BR/common.json'
import en from '../src/i18n/locales/en/common.json'
import es from '../src/i18n/locales/es/common.json'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let helperWin: BrowserWindow | null = null
let updaterConfigured = false

type AppUpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'not-available'

interface AppUpdateState {
  status: AppUpdateStatus
  currentVersion: string
  availableVersion?: string
  progressPercent?: number
  transferredBytes?: number
  totalBytes?: number
  message?: string
  error?: string
}

interface UpdateHelperState {
  phase: 'launching' | 'waiting-for-exit' | 'installing' | 'restarted'
  watchPid: number
  language: AppLanguage
  createdAt: number
  relaunchedAt?: number
  relaunchedPid?: number
}

const UPDATE_FEED_URL = 'https://pub-3a366535329647d1858b31551de3f193.r2.dev/updates/stable'
const UPDATE_HELPER_FLAG = '--update-helper'
const UPDATE_HELPER_PREVIEW_FLAG = '--update-helper-preview'
const UPDATE_HELPER_STATE_FILE = path.join(os.tmpdir(), 'dragon-arena-update-helper-state.json')
const UPDATE_HELPER_LOG_FILE = path.join(os.tmpdir(), 'dragon-arena-update-helper.log')
const APP_UPDATE_TRANSLATIONS = {
  'pt-BR': ptBR,
  en,
  es,
} as const

type AppLanguage = keyof typeof APP_UPDATE_TRANSLATIONS

let currentAppUpdateState: AppUpdateState = {
  status: app.isPackaged ? 'idle' : 'disabled',
  currentVersion: app.getVersion(),
}

const BASE_WINDOW_WIDTH = 1600
const BASE_WINDOW_HEIGHT = 900
const MIN_WINDOW_WIDTH = 1280
const MIN_WINDOW_HEIGHT = 720
const SNAP_TO_TOP_THRESHOLD = 4

type DisplayMode = 'windowed' | 'borderless' | 'fullscreen'

interface ShellSettings {
  displayMode: DisplayMode
  resolution: {
    width: number
    height: number
  }
}

let currentShellSettings: ShellSettings = {
  displayMode: 'borderless',
  resolution: {
    width: BASE_WINDOW_WIDTH,
    height: BASE_WINDOW_HEIGHT,
  },
}

function broadcastAppUpdateState() {
  win?.webContents.send('app-update-status', currentAppUpdateState)
}

function appendUpdaterLog(message: string) {
  try {
    const line = `[${new Date().toISOString()}] ${message}${os.EOL}`
    fs.appendFileSync(UPDATE_HELPER_LOG_FILE, line, 'utf8')
  } catch {
    // Never block runtime on logging failures.
  }
}

function writeUpdateHelperState(state: UpdateHelperState) {
  try {
    fs.writeFileSync(UPDATE_HELPER_STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
    appendUpdaterLog(`helper-state-write phase=${state.phase} watchPid=${state.watchPid} language=${state.language}`)
  } catch (error) {
    appendUpdaterLog(`helper-state-write-failed ${(error as Error).message}`)
  }
}

function readUpdateHelperState() {
  try {
    if (!fs.existsSync(UPDATE_HELPER_STATE_FILE)) {
      return null
    }

    return JSON.parse(fs.readFileSync(UPDATE_HELPER_STATE_FILE, 'utf8')) as UpdateHelperState
  } catch (error) {
    appendUpdaterLog(`helper-state-read-failed ${(error as Error).message}`)
    return null
  }
}

function clearUpdateHelperState() {
  try {
    if (fs.existsSync(UPDATE_HELPER_STATE_FILE)) {
      fs.unlinkSync(UPDATE_HELPER_STATE_FILE)
      appendUpdaterLog('helper-state-cleared')
    }
  } catch (error) {
    appendUpdaterLog(`helper-state-clear-failed ${(error as Error).message}`)
  }
}

function setAppUpdateState(nextState: AppUpdateState) {
  currentAppUpdateState = nextState
  broadcastAppUpdateState()
}

function configureAutoUpdater() {
  if (updaterConfigured) {
    return
  }

  updaterConfigured = true

  if (!app.isPackaged) {
    setAppUpdateState({
      status: 'disabled',
      currentVersion: app.getVersion(),
    })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: UPDATE_FEED_URL,
  })

  autoUpdater.on('checking-for-update', () => {
    appendUpdaterLog('auto-updater checking-for-update')
    setAppUpdateState({
      status: 'checking',
      currentVersion: app.getVersion(),
    })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    appendUpdaterLog(`auto-updater update-available version=${info.version}`)
    setAppUpdateState({
      status: 'available',
      currentVersion: app.getVersion(),
      availableVersion: info.version,
      progressPercent: 0,
    })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    appendUpdaterLog(`auto-updater download-progress percent=${progress.percent.toFixed(2)}`)
    setAppUpdateState({
      status: 'downloading',
      currentVersion: app.getVersion(),
      availableVersion: currentAppUpdateState.availableVersion,
      progressPercent: progress.percent,
      transferredBytes: progress.transferred,
      totalBytes: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    appendUpdaterLog(`auto-updater update-downloaded version=${info.version}`)
    setAppUpdateState({
      status: 'downloaded',
      currentVersion: app.getVersion(),
      availableVersion: info.version,
      progressPercent: 100,
    })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    appendUpdaterLog(`auto-updater update-not-available version=${info.version}`)
    setAppUpdateState({
      status: 'not-available',
      currentVersion: app.getVersion(),
      availableVersion: info.version,
    })
  })

  autoUpdater.on('error', (error: Error) => {
    appendUpdaterLog(`auto-updater error=${error.message}`)
    setAppUpdateState({
      status: 'error',
      currentVersion: app.getVersion(),
      availableVersion: currentAppUpdateState.availableVersion,
      progressPercent: currentAppUpdateState.progressPercent,
      transferredBytes: currentAppUpdateState.transferredBytes,
      totalBytes: currentAppUpdateState.totalBytes,
      error: error.message,
    })
  })
}

function getHelperCopy(language: AppLanguage) {
  const translation = APP_UPDATE_TRANSLATIONS[language] ?? APP_UPDATE_TRANSLATIONS['pt-BR']
  return translation.appUpdate?.helper ?? {
    windowTitle: 'Dragon Arena Updater',
    title: 'Installing update...',
    description: 'Dragon Arena will reopen automatically when the installation is complete.',
    preparing: 'Preparing silent installation...',
    applying: 'Applying the new version files...',
  }
}

function processExists(pid: number) {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false
  }

  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function countSiblingProcesses(imageName: string, ownPid: number) {
  return new Promise<number>((resolve) => {
    execFile(
      'tasklist.exe',
      ['/FI', `IMAGENAME eq ${imageName}`, '/FO', 'CSV', '/NH'],
      { windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve(0)
          return
        }

        const lines = stdout
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('INFO:'))

        let count = 0
        for (const line of lines) {
          const columns = line
            .split('","')
            .map((column, index, array) => {
              if (index === 0) {
                return column.replace(/^"/, '')
              }
              if (index === array.length - 1) {
                return column.replace(/"$/, '')
              }
              return column
            })

          const pid = Number(columns[1])
          if (Number.isFinite(pid) && pid !== ownPid) {
            count += 1
          }
        }

        resolve(count)
      }
    )
  })
}

function buildHelperHtml(copy: ReturnType<typeof getHelperCopy>) {
  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(copy.windowTitle)}</title>
      <style>
        html, body {
          margin: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background:
            radial-gradient(circle at top, rgba(255, 166, 84, 0.10), transparent 30%),
            linear-gradient(180deg, #05060b 0%, #090b14 100%);
          color: #f4ead3;
          font-family: "Segoe UI", sans-serif;
        }
        .shell {
          position: relative;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          padding: 28px;
          border: 1px solid rgba(255, 214, 154, 0.12);
          background: linear-gradient(180deg, rgba(14, 16, 28, 0.98) 0%, rgba(8, 10, 18, 0.98) 100%);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03);
        }
        .shell::before {
          content: "";
          position: absolute;
          inset: 0;
          border-top: 6px solid rgba(255, 122, 43, 0.95);
          pointer-events: none;
        }
        .eyebrow {
          color: rgba(255, 211, 144, 0.76);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.24em;
          text-transform: uppercase;
        }
        .title {
          margin-top: 18px;
          font-size: 30px;
          font-weight: 900;
          color: #fff0ce;
        }
        .description {
          margin-top: 14px;
          font-size: 15px;
          line-height: 1.6;
          color: rgba(244, 234, 211, 0.84);
        }
        .progress {
          margin-top: 28px;
          height: 12px;
          border-radius: 999px;
          background: rgba(255,255,255,0.08);
          overflow: hidden;
          position: relative;
        }
        .progress::after {
          content: "";
          position: absolute;
          inset: 0;
          width: 42%;
          border-radius: 999px;
          background: linear-gradient(90deg, #ffb347 0%, #ff7a32 100%);
          box-shadow: 0 0 12px rgba(255, 165, 80, 0.45);
          animation: sweep 1.1s ease-in-out infinite;
        }
        .status {
          margin-top: 14px;
          font-size: 13px;
          color: rgba(210, 215, 224, 0.86);
        }
        @keyframes sweep {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
      </style>
    </head>
    <body>
      <div class="shell">
        <div class="eyebrow">Dragon Arena Updater</div>
        <div class="title">${escapeHtml(copy.title)}</div>
        <div class="description">${escapeHtml(copy.description)}</div>
        <div class="progress"></div>
        <div class="status" id="status">${escapeHtml(copy.preparing)}</div>
      </div>
    </body>
  </html>`
}

async function updateHelperStatus(text: string) {
  if (!helperWin || helperWin.isDestroyed()) {
    return
  }

  const safeText = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  await helperWin.webContents.executeJavaScript(`
    const status = document.getElementById('status');
    if (status) status.textContent = '${safeText}';
  `).catch(() => {})
}

function createUpdateHelperWindow(language: AppLanguage, watchPid: number, options?: { preview?: boolean }) {
  const copy = getHelperCopy(language)
  const preview = options?.preview ?? false
  appendUpdaterLog(`helper-window-create preview=${preview} watchPid=${watchPid} pid=${process.pid}`)

  helperWin = new BrowserWindow({
    width: 540,
    height: 250,
    center: true,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: copy.windowTitle,
    backgroundColor: '#090b14',
    icon: path.join(process.env.VITE_PUBLIC, 'dragon_ico.png'),
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  helperWin.setMenu(null)
  helperWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildHelperHtml(copy))}`)
  helperWin.once('ready-to-show', () => {
    helperWin?.show()
  })

  if (preview) {
    void updateHelperStatus(copy.preparing)
    const applyTimeout = setTimeout(() => {
      void updateHelperStatus(copy.applying)
    }, 1800)
    const closeTimeout = setTimeout(() => {
      helperWin?.close()
    }, 6500)

    helperWin.on('closed', () => {
      appendUpdaterLog('helper-window-closed preview=true')
      clearTimeout(applyTimeout)
      clearTimeout(closeTimeout)
      helperWin = null
    })
    return
  }

  let sawOriginalExit = false
  const imageName = path.basename(process.execPath)
  const interval = setInterval(async () => {
    const elapsedSeconds = process.uptime()
    if (elapsedSeconds > 420) {
      appendUpdaterLog('helper-window-timeout elapsed>420s')
      clearInterval(interval)
      helperWin?.close()
      return
    }

    if (!sawOriginalExit) {
      if (!processExists(watchPid)) {
        sawOriginalExit = true
        appendUpdaterLog(`helper-detected-original-exit watchPid=${watchPid}`)
        const helperState = readUpdateHelperState()
        if (helperState) {
          writeUpdateHelperState({
            ...helperState,
            phase: 'installing',
          })
        }
        await updateHelperStatus(copy.applying)
      }
      return
    }

    const helperState = readUpdateHelperState()
    if (helperState?.phase === 'restarted') {
      appendUpdaterLog(`helper-detected-restarted pid=${helperState.relaunchedPid ?? 0}`)
      clearInterval(interval)
      helperWin?.close()
      return
    }

    const siblingCount = await countSiblingProcesses(imageName, process.pid)
    if (siblingCount > 0) {
      appendUpdaterLog(`helper-detected-sibling-processes count=${siblingCount}`)
      clearInterval(interval)
      helperWin?.close()
    }
  }, 900)

  helperWin.on('closed', () => {
    appendUpdaterLog(`helper-window-closed preview=${preview}`)
    clearInterval(interval)
    helperWin = null
    app.quit()
  })
}

function launchInstallHelperWindow(language: AppLanguage) {
  if (process.platform !== 'win32' || !app.isPackaged) {
    appendUpdaterLog(`helper-launch-skipped platform=${process.platform} packaged=${app.isPackaged}`)
    return
  }

  writeUpdateHelperState({
    phase: 'waiting-for-exit',
    watchPid: process.pid,
    language,
    createdAt: Date.now(),
  })
  appendUpdaterLog(`helper-launch-request execPath="${process.execPath}" watchPid=${process.pid} language=${language}`)

  const helperProcess = spawn(
    process.execPath,
    [
      UPDATE_HELPER_FLAG,
      `--watch-pid=${process.pid}`,
      `--lang=${language}`,
    ],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }
  )

  helperProcess.on('error', (error) => {
    appendUpdaterLog(`helper-launch-error ${error.message}`)
  })

  appendUpdaterLog(`helper-launch-spawned pid=${helperProcess.pid ?? 0}`)
  helperProcess.unref()
}

async function checkForAppUpdates() {
  if (!app.isPackaged) {
    appendUpdaterLog('auto-updater-check skipped (not packaged)')
    return
  }

  try {
    appendUpdaterLog('auto-updater-check start')
    await autoUpdater.checkForUpdates()
  } catch (error) {
    appendUpdaterLog(`auto-updater-check failed ${(error as Error).message}`)
    setAppUpdateState({
      status: 'error',
      currentVersion: app.getVersion(),
      error: error instanceof Error ? error.message : 'Unknown update check error.',
    })
  }
}

function centerWindowOnDisplay(target: BrowserWindow) {
  const display = screen.getDisplayMatching(target.getBounds())
  const { x, y, width, height } = display.workArea
  const currentBounds = target.getBounds()
  const nextWidth = Math.min(currentBounds.width, width)
  const nextHeight = Math.min(currentBounds.height, height)
  const centeredX = x + Math.round((width - nextWidth) / 2)
  const centeredY = y + Math.round((height - nextHeight) / 2)

  target.setBounds({
    x: centeredX,
    y: centeredY,
    width: nextWidth,
    height: nextHeight,
  })
}

function applyShellSettings(target: BrowserWindow, settings: ShellSettings) {
  currentShellSettings = settings
  const display = screen.getDisplayMatching(target.getBounds())
  const { x, y, width, height } = display.workArea
  const { x: fullX, y: fullY, width: fullWidth, height: fullHeight } = display.bounds
  const applyWindowedBounds = () => {
    const nextWidth = Math.min(settings.resolution.width, width)
    const nextHeight = Math.min(settings.resolution.height, height)
    const centeredX = x + Math.round((width - nextWidth) / 2)
    const centeredY = y + Math.round((height - nextHeight) / 2)

    target.setBounds({
      x: centeredX,
      y: centeredY,
      width: nextWidth,
      height: nextHeight,
    })
  }

  if (settings.displayMode === 'fullscreen') {
    target.setKiosk(false)
    target.setAlwaysOnTop(false)
    target.setFullScreen(false)
    target.setFullScreenable(true)
    target.setBounds({ x: fullX, y: fullY, width: fullWidth, height: fullHeight })
    target.setAlwaysOnTop(true, 'screen-saver')
    target.setKiosk(true)
    target.setFullScreen(true)
    return
  }

  if (target.isKiosk()) {
    target.setKiosk(false)
  }

  target.setAlwaysOnTop(false)

  if (target.isFullScreen()) {
    target.once('leave-full-screen', () => {
      if (settings.displayMode === 'borderless') {
        target.setBounds({ x, y, width, height })
      } else {
        applyWindowedBounds()
      }
    })
    target.setFullScreen(false)
    return
  }

  if (settings.displayMode === 'borderless') {
    target.setKiosk(false)
    target.setBounds({ x, y, width, height })
    return
  }

  target.setKiosk(false)
  applyWindowedBounds()
}

function registerWindowGuards(target: BrowserWindow) {
  target.webContents.setZoomFactor(1)
  target.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {
    // Ignore unsupported zoom-limit failures in older Electron builds.
  })

  target.webContents.on('before-input-event', (event, input) => {
    const isZoomShortcut
      = (input.control || input.meta)
        && ['+', '=', '-', '_', '0'].includes(input.key)
    const isReloadShortcut
      = input.key === 'F5'
        || ((input.control || input.meta) && input.key.toLowerCase() === 'r')

    if (isZoomShortcut || isReloadShortcut) {
      event.preventDefault()
    }
  })

  target.webContents.on('context-menu', (event) => {
    event.preventDefault()
  })

  target.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  let snappingToTop = false
  let lastWindowY = target.getBounds().y
  target.on('move', () => {
    if (snappingToTop) {
      lastWindowY = target.getBounds().y
      return
    }

    const bounds = target.getBounds()
    const display = screen.getDisplayMatching(bounds)
    const topEdge = display.workArea.y
    const wasAwayFromTop = lastWindowY > topEdge + SNAP_TO_TOP_THRESHOLD
    const isTouchingTop = bounds.y <= topEdge + SNAP_TO_TOP_THRESHOLD
    lastWindowY = bounds.y

    if (currentShellSettings.displayMode !== 'windowed') {
      return
    }

    if (!wasAwayFromTop || !isTouchingTop) {
      return
    }

    snappingToTop = true
    try {
      centerWindowOnDisplay(target)
    } finally {
      setTimeout(() => {
        snappingToTop = false
      }, 120)
    }
  })
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { x, y, width, height } = primaryDisplay.workArea

  win = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    icon: path.join(process.env.VITE_PUBLIC, 'dragon_ico.png'),
    frame: false,
    show: false,
    resizable: false,
    maximizable: false,
    fullscreenable: true,
    backgroundColor: '#04050a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      backgroundThrottling: false,
    },
  })

  win.setMenu(null)
  registerWindowGuards(win)

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
    broadcastAppUpdateState()
  })

  win.once('ready-to-show', () => {
    win?.setBounds({ x, y, width, height })
    win?.show()
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function parseHelperArgs() {
  const watchPidArg = process.argv.find(arg => arg.startsWith('--watch-pid='))
  const langArg = process.argv.find(arg => arg.startsWith('--lang='))
  const watchPid = watchPidArg ? Number(watchPidArg.split('=')[1]) : 0
  const language = (langArg ? langArg.split('=')[1] : 'pt-BR') as AppLanguage

  return {
    watchPid,
    language: language in APP_UPDATE_TRANSLATIONS ? language : 'pt-BR',
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  if (process.argv.includes(UPDATE_HELPER_FLAG)) {
    const helperArgs = parseHelperArgs()
    appendUpdaterLog(`helper-process-start watchPid=${helperArgs.watchPid} language=${helperArgs.language}`)
    createUpdateHelperWindow(helperArgs.language, helperArgs.watchPid)
    return
  }

  if (process.argv.includes(UPDATE_HELPER_PREVIEW_FLAG)) {
    const helperArgs = parseHelperArgs()
    appendUpdaterLog(`helper-preview-start language=${helperArgs.language}`)
    createUpdateHelperWindow(helperArgs.language, process.pid, { preview: true })
    return
  }

  const helperState = readUpdateHelperState()
  if (helperState) {
    appendUpdaterLog(`main-start-detected-helper-state phase=${helperState.phase}`)
    writeUpdateHelperState({
      ...helperState,
      phase: 'restarted',
      relaunchedAt: Date.now(),
      relaunchedPid: process.pid,
    })
    setTimeout(() => {
      clearUpdateHelperState()
    }, 12000)
  }

  createWindow()
  configureAutoUpdater()
  void checkForAppUpdates()
})

// Window manipulation handlers
ipcMain.on('window-minimize', () => win?.minimize())
ipcMain.on('window-close', () => win?.close())
ipcMain.handle('window-get-shell-settings', () => currentShellSettings)
ipcMain.handle('window-apply-shell-settings', (_event, settings: ShellSettings) => {
  if (!win) {
    return currentShellSettings
  }

  applyShellSettings(win, settings)
  return currentShellSettings
})
ipcMain.handle('app-quit', () => {
  app.quit()
})
ipcMain.handle('app-update-get-state', () => currentAppUpdateState)
ipcMain.handle('app-update-check', async () => {
  await checkForAppUpdates()
  return currentAppUpdateState
})
ipcMain.handle('app-update-install', (_event, language?: AppLanguage) => {
  if (currentAppUpdateState.status === 'downloaded') {
    const resolvedLanguage = language && language in APP_UPDATE_TRANSLATIONS ? language : 'pt-BR'
    appendUpdaterLog(`ipc-install-update received status=${currentAppUpdateState.status} language=${resolvedLanguage}`)
    launchInstallHelperWindow(resolvedLanguage)
    autoUpdater.quitAndInstall(true, true)
  }
})
ipcMain.handle('app-update-preview-helper', (_event, language?: AppLanguage) => {
  const resolvedLanguage = language && language in APP_UPDATE_TRANSLATIONS ? language : 'pt-BR'
  appendUpdaterLog(`ipc-preview-helper language=${resolvedLanguage}`)

  if (helperWin && !helperWin.isDestroyed()) {
    helperWin.focus()
    return
  }

  createUpdateHelperWindow(resolvedLanguage, process.pid, { preview: true })
})
