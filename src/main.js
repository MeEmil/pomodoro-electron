const { app, BrowserWindow, Tray, Notification, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const DEFAULT_LOG_PATH = path.join(os.homedir(), 'Obsidian Vault', 'Pomodoro Log.md');

function expandHome(p) {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function loadLogPath() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (parsed && typeof parsed.obsidianLogPath === 'string' && parsed.obsidianLogPath.trim()) {
        return expandHome(parsed.obsidianLogPath.trim());
      }
    }
  } catch (err) {
    console.error('Failed to read config.json, using default log path:', err);
  }
  return DEFAULT_LOG_PATH;
}

const OBSIDIAN_LOG_PATH = loadLogPath();

let mainWindow = null;
let tray = null;
let timerInterval = null;

// Timer State
let timerState = {
  status: 'idle', // 'idle' | 'running' | 'paused'
  durationMinutes: 25,
  taskLabel: '',
  totalSeconds: 25 * 60,
  remainingSeconds: 25 * 60,
  startTime: null,
  endTime: null,
  expectedEndTimestamp: null
};

function formatMMSS(totalSec) {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatHHMM(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function ensureObsidianLogFile() {
  const header = '# Pomodoro Log\n\n| Date | Start Time | End Time | Duration | Task | Status |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n';
  try {
    const dir = path.dirname(OBSIDIAN_LOG_PATH);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    if (!fs.existsSync(OBSIDIAN_LOG_PATH)) {
      await fs.promises.writeFile(OBSIDIAN_LOG_PATH, header, 'utf8');
    }
  } catch (err) {
    console.error('Failed to initialize Obsidian log file:', err);
  }
}

async function logCompletedInterval(startDate, endDate, durationMinutes, taskLabel) {
  await ensureObsidianLogFile();
  const dateStr = formatDate(endDate);
  const startStr = formatHHMM(startDate);
  const endStr = formatHHMM(endDate);
  const safeTask = (taskLabel || 'Untitled Task').replace(/\|/g, '-').trim();
  const row = `| ${dateStr} | ${startStr} | ${endStr} | ${durationMinutes}m | ${safeTask} | Completed |\n`;

  try {
    await fs.promises.appendFile(OBSIDIAN_LOG_PATH, row, 'utf8');
  } catch (err) {
    console.error('Failed to append to Obsidian log file:', err);
  }
}

function updateTrayTitle(text) {
  if (tray) {
    tray.setTitle(text ? ` ${text}` : '');
  }
}

function stopTickInterval() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function handleTimerComplete() {
  stopTickInterval();
  const completedDuration = timerState.durationMinutes;
  const completedTask = timerState.taskLabel;
  const startDate = timerState.startTime || new Date(Date.now() - completedDuration * 60 * 1000);
  const endDate = new Date();

  timerState.status = 'idle';
  timerState.remainingSeconds = completedDuration * 60;
  timerState.totalSeconds = completedDuration * 60;
  timerState.startTime = null;
  timerState.endTime = null;
  timerState.expectedEndTimestamp = null;

  updateTrayTitle('');

  // 1. Silent native macOS notification
  const notification = new Notification({
    title: 'Pomodoro Complete',
    body: `Completed: ${completedTask || 'Focus Interval'} (${completedDuration} min)`,
    silent: true
  });

  notification.on('click', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  notification.show();

  // 2. Append to Obsidian table
  logCompletedInterval(startDate, endDate, completedDuration, completedTask);

  // 3. Notify renderer (carry-over values, do not auto-start)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('timer:completed', {
      durationMinutes: completedDuration,
      taskLabel: completedTask,
      formattedTime: formatMMSS(timerState.remainingSeconds)
    });
  }
}

function tick() {
  if (timerState.status !== 'running') return;

  const now = Date.now();
  const diffMs = timerState.expectedEndTimestamp - now;
  const remaining = Math.max(0, Math.ceil(diffMs / 1000));

  timerState.remainingSeconds = remaining;
  const formatted = formatMMSS(remaining);

  updateTrayTitle(formatted);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('timer:tick', {
      remainingSeconds: remaining,
      formattedTime: formatted,
      status: timerState.status
    });
  }

  if (remaining <= 0) {
    handleTimerComplete();
  }
}

function startTimer(minutes, task) {
  stopTickInterval();
  const duration = Math.max(1, parseInt(minutes, 10) || 25);
  timerState.status = 'running';
  timerState.durationMinutes = duration;
  timerState.taskLabel = (task || '').trim();
  timerState.totalSeconds = duration * 60;
  timerState.remainingSeconds = duration * 60;
  timerState.startTime = new Date();
  timerState.expectedEndTimestamp = Date.now() + duration * 60 * 1000;

  updateTrayTitle(formatMMSS(timerState.remainingSeconds));

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('timer:tick', {
      remainingSeconds: timerState.remainingSeconds,
      formattedTime: formatMMSS(timerState.remainingSeconds),
      status: timerState.status
    });
  }

  timerInterval = setInterval(tick, 1000);
}

function pauseTimer() {
  if (timerState.status !== 'running') return;
  stopTickInterval();
  const now = Date.now();
  timerState.remainingSeconds = Math.max(0, Math.ceil((timerState.expectedEndTimestamp - now) / 1000));
  timerState.status = 'paused';

  const formatted = formatMMSS(timerState.remainingSeconds);
  updateTrayTitle(`⏸ ${formatted}`);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('timer:tick', {
      remainingSeconds: timerState.remainingSeconds,
      formattedTime: formatted,
      status: timerState.status
    });
  }
}

function resumeTimer() {
  if (timerState.status !== 'paused') return;
  timerState.status = 'running';
  timerState.expectedEndTimestamp = Date.now() + timerState.remainingSeconds * 1000;

  updateTrayTitle(formatMMSS(timerState.remainingSeconds));

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('timer:tick', {
      remainingSeconds: timerState.remainingSeconds,
      formattedTime: formatMMSS(timerState.remainingSeconds),
      status: timerState.status
    });
  }

  timerInterval = setInterval(tick, 1000);
}

function resetTimer() {
  stopTickInterval();
  timerState.status = 'idle';
  timerState.remainingSeconds = timerState.durationMinutes * 60;
  timerState.totalSeconds = timerState.durationMinutes * 60;
  timerState.startTime = null;
  timerState.endTime = null;
  timerState.expectedEndTimestamp = null;

  updateTrayTitle('');

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('timer:tick', {
      remainingSeconds: timerState.remainingSeconds,
      formattedTime: formatMMSS(timerState.remainingSeconds),
      status: timerState.status
    });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 210,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#18181b',
    alwaysOnTop: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Keep on top of floating/full-screen apps and visible on all virtual spaces
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'trayTemplate.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    icon = nativeImage.createEmpty();
  } else {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);
  tray.setToolTip('Pomodoro Timer');

  tray.on('click', () => {
    if (!mainWindow) {
      createWindow();
      return;
    }
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// IPC Handlers
ipcMain.on('timer:start', (_event, { minutes, task }) => {
  startTimer(minutes, task);
});

ipcMain.on('timer:pause', () => {
  pauseTimer();
});

ipcMain.on('timer:resume', () => {
  resumeTimer();
});

ipcMain.on('timer:reset', () => {
  resetTimer();
});

ipcMain.on('window:minimize', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.on('window:close', () => {
  app.quit();
});

ipcMain.handle('timer:getState', () => {
  return {
    status: timerState.status,
    durationMinutes: timerState.durationMinutes,
    taskLabel: timerState.taskLabel,
    remainingSeconds: timerState.remainingSeconds,
    formattedTime: formatMMSS(timerState.remainingSeconds)
  };
});

app.whenReady().then(() => {
  if (process.argv.includes('--smoke-test')) {
    console.log('Smoke test: app ready, modules functional. Exiting.');
    app.quit();
    return;
  }
  createTray();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS keep app running in tray if timer is active, otherwise quit if desired
  // Here minimize hides window, close quits app
});
