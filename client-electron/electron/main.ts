import { app, BrowserWindow, ipcMain, screen } from 'electron'
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

const BASE_WINDOW_WIDTH = 1600
const BASE_WINDOW_HEIGHT = 900
const SNAP_TO_TOP_THRESHOLD = 4

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
    minWidth: BASE_WINDOW_WIDTH,
    minHeight: BASE_WINDOW_HEIGHT,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    frame: false,
    show: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
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

// Window manipulation handlers
ipcMain.on('window-minimize', () => win?.minimize())
ipcMain.on('window-close', () => win?.close())
