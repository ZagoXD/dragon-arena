import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { autoUpdater, ProgressInfo, UpdateInfo } from 'electron-updater'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
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

const UPDATE_FEED_URL = 'https://pub-3a366535329647d1858b31551de3f193.r2.dev/updates/stable'

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
    setAppUpdateState({
      status: 'checking',
      currentVersion: app.getVersion(),
    })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    setAppUpdateState({
      status: 'available',
      currentVersion: app.getVersion(),
      availableVersion: info.version,
      progressPercent: 0,
    })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
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
    setAppUpdateState({
      status: 'downloaded',
      currentVersion: app.getVersion(),
      availableVersion: info.version,
      progressPercent: 100,
    })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    setAppUpdateState({
      status: 'not-available',
      currentVersion: app.getVersion(),
      availableVersion: info.version,
    })
  })

  autoUpdater.on('error', (error: Error) => {
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

async function checkForAppUpdates() {
  if (!app.isPackaged) {
    return
  }

  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
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

app.whenReady().then(createWindow)
app.whenReady().then(() => {
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
ipcMain.handle('app-update-install', () => {
  if (currentAppUpdateState.status === 'downloaded') {
    autoUpdater.quitAndInstall(true, true)
  }
})
