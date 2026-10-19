const inputMinutes = document.getElementById('input-minutes');
const inputTask = document.getElementById('input-task');
const timerDisplay = document.getElementById('timer-display');
const btnPrimary = document.getElementById('btn-primary');
const btnReset = document.getElementById('btn-reset');
const btnClose = document.getElementById('btn-close');
const btnMinimize = document.getElementById('btn-minimize');

let currentStatus = 'idle'; // 'idle' | 'running' | 'paused'

function formatDisplay(minutes) {
  const m = Math.max(1, parseInt(minutes, 10) || 25);
  return `${String(m).padStart(2, '0')}:00`;
}

function updateControlsForStatus(status) {
  currentStatus = status;

  if (status === 'running') {
    btnPrimary.textContent = 'Pause';
    btnPrimary.style.background = '#eab308'; // Amber for pause
    btnPrimary.style.color = '#000000';
    inputMinutes.disabled = true;
    inputTask.disabled = true;
  } else if (status === 'paused') {
    btnPrimary.textContent = 'Resume';
    btnPrimary.style.background = '#0284c7'; // Blue for resume
    btnPrimary.style.color = '#ffffff';
    inputMinutes.disabled = true;
    inputTask.disabled = true;
  } else {
    // idle
    btnPrimary.textContent = 'Start';
    btnPrimary.style.background = '#0284c7';
    btnPrimary.style.color = '#ffffff';
    inputMinutes.disabled = false;
    inputTask.disabled = false;
  }
}

// Window control traffic lights
btnClose.addEventListener('click', () => {
  window.electronAPI.closeWindow();
});

btnMinimize.addEventListener('click', () => {
  window.electronAPI.minimizeWindow();
});

// Update display when duration input changes while idle
inputMinutes.addEventListener('input', () => {
  if (currentStatus === 'idle') {
    timerDisplay.textContent = formatDisplay(inputMinutes.value);
  }
});

// Primary Button (Start / Pause / Resume)
btnPrimary.addEventListener('click', () => {
  if (currentStatus === 'idle') {
    const minutes = Math.max(1, parseInt(inputMinutes.value, 10) || 25);
    const task = inputTask.value.trim();
    window.electronAPI.startTimer(minutes, task);
    updateControlsForStatus('running');
  } else if (currentStatus === 'running') {
    window.electronAPI.pauseTimer();
    updateControlsForStatus('paused');
  } else if (currentStatus === 'paused') {
    window.electronAPI.resumeTimer();
    updateControlsForStatus('running');
  }
});

// Reset Button
btnReset.addEventListener('click', () => {
  window.electronAPI.resetTimer();
  updateControlsForStatus('idle');
  timerDisplay.textContent = formatDisplay(inputMinutes.value);
});

// Listen for main process tick events
window.electronAPI.onTick((data) => {
  timerDisplay.textContent = data.formattedTime;
  if (data.status && data.status !== currentStatus) {
    updateControlsForStatus(data.status);
  }
});

// Listen for completion (PRD §4.1: carry over typed duration and task, manual trigger only)
window.electronAPI.onCompleted((data) => {
  updateControlsForStatus('idle');
  inputMinutes.value = data.durationMinutes;
  inputTask.value = data.taskLabel || '';
  timerDisplay.textContent = formatDisplay(data.durationMinutes);
});

// Initial state sync
window.electronAPI.getState().then((state) => {
  if (state) {
    if (state.durationMinutes) inputMinutes.value = state.durationMinutes;
    if (state.taskLabel) inputTask.value = state.taskLabel;
    if (state.formattedTime) timerDisplay.textContent = state.formattedTime;
    updateControlsForStatus(state.status || 'idle');
  }
});
