const PHASE_LABELS = {
  ascent: 'Deep Ascent',
  breakthrough: 'Breaking Water Face',
  apex: 'Airborne Apex',
  splashdown: 'Splashdown',
  recovery: 'Subsurface Glide',
};

const SPEED_OPTIONS = [
  { value: 0.25, label: '0.25× Slow-Mo' },
  { value: 0.5, label: '0.5×' },
  { value: 1, label: '1×' },
];

const CAMERA_OPTIONS = [
  { value: 'low-angle', label: 'Low-Angle', keyHint: '1' },
  { value: 'close-breach', label: 'Close Breach', keyHint: '2' },
  { value: 'underwater', label: 'Underwater', keyHint: '3' },
  { value: 'orbit', label: 'Free Orbit', keyHint: '4' },
];

const MOOD_OPTIONS = [
  { value: 'golden', label: 'Golden Hour' },
  { value: 'noon', label: 'High Noon' },
  { value: 'twilight', label: 'Twilight' },
];

export function getPhaseLabel(phaseName) {
  return PHASE_LABELS[phaseName] ?? 'Deep Ascent';
}

export function createHud({
  container,
  initialState = {},
  onTriggerBreach = () => {},
  onTogglePause = () => {},
  onSelectSpeed = () => {},
  onSelectCamera = () => {},
  onSelectMood = () => {},
}) {
  const uiState = {
    paused: Boolean(initialState.paused ?? false),
    speed: Number(initialState.speed ?? 1),
    camera: initialState.camera ?? 'low-angle',
    mood: initialState.mood ?? 'golden',
    phaseName: initialState.phaseName ?? 'ascent',
    progress: Number(initialState.progress ?? 0),
    elevation: Number(initialState.elevation ?? 0),
  };

  container.innerHTML = `
    <header class="hud-masthead">
      <p class="hud-eyebrow">Megaptera novaeangliae · Ocean Surface Study</p>
      <h1 class="hud-title">Humpback Whale Breach</h1>
      <div class="hud-telemetry-card" role="status" aria-live="polite">
        <div class="hud-phase-row">
          <span class="hud-phase-pill">
            <span class="hud-phase-dot" data-role="phase-dot" data-phase="ascent"></span>
            <span data-role="phase-label">Deep Ascent</span>
          </span>
          <span class="hud-altitude" data-role="altitude-readout">0.0 m</span>
        </div>
        <div class="hud-progress-track" aria-hidden="true">
          <div class="hud-progress-fill" data-role="progress-fill"></div>
        </div>
      </div>
    </header>

    <div class="hud-orbit-hint" data-role="orbit-hint">
      Drag to orbit · Scroll to zoom · Right-drag to pan
    </div>

    <div class="hud-dock-wrap">
      <nav class="hud-dock" aria-label="Breach Scene Controls">
        <div class="hud-group">
          <button type="button" class="hud-btn hud-btn-primary" data-action="breach">
            <span>Breach Now</span>
            <kbd class="hud-kbd">Space</kbd>
          </button>
          <button type="button" class="hud-btn hud-btn-transport" data-action="toggle-pause" aria-pressed="false">
            <span data-role="pause-label">Pause</span>
            <kbd class="hud-kbd">P</kbd>
          </button>
        </div>

        <span class="hud-divider" aria-hidden="true"></span>

        <div class="hud-group" role="group" aria-label="Playback Speed">
          <span class="hud-group-label">Speed</span>
          <div class="hud-segmented">
            ${SPEED_OPTIONS.map(
              (opt) => `
                <button
                  type="button"
                  class="hud-btn"
                  data-speed="${opt.value}"
                  aria-pressed="${opt.value === uiState.speed}"
                >${opt.label}</button>
              `,
            ).join('')}
          </div>
        </div>

        <span class="hud-divider" aria-hidden="true"></span>

        <div class="hud-group" role="group" aria-label="Camera Preset">
          <span class="hud-group-label">Camera</span>
          <div class="hud-segmented">
            ${CAMERA_OPTIONS.map(
              (opt) => `
                <button
                  type="button"
                  class="hud-btn"
                  data-camera="${opt.value}"
                  aria-pressed="${opt.value === uiState.camera}"
                >
                  <span>${opt.label}</span>
                  <kbd class="hud-kbd">${opt.keyHint}</kbd>
                </button>
              `,
            ).join('')}
          </div>
        </div>

        <span class="hud-divider" aria-hidden="true"></span>

        <div class="hud-group" role="group" aria-label="Atmosphere Lighting">
          <span class="hud-group-label">Light</span>
          <div class="hud-segmented">
            ${MOOD_OPTIONS.map(
              (opt) => `
                <button
                  type="button"
                  class="hud-btn"
                  data-mood="${opt.value}"
                  aria-pressed="${opt.value === uiState.mood}"
                >${opt.label}</button>
              `,
            ).join('')}
          </div>
        </div>
      </nav>
    </div>
  `;

  const phaseDotEl = container.querySelector('[data-role="phase-dot"]');
  const phaseLabelEl = container.querySelector('[data-role="phase-label"]');
  const altitudeEl = container.querySelector('[data-role="altitude-readout"]');
  const progressFillEl = container.querySelector('[data-role="progress-fill"]');
  const orbitHintEl = container.querySelector('[data-role="orbit-hint"]');
  const breachBtn = container.querySelector('[data-action="breach"]');
  const pauseBtn = container.querySelector('[data-action="toggle-pause"]');
  const pauseLabelEl = container.querySelector('[data-role="pause-label"]');
  const speedButtons = Array.from(container.querySelectorAll('[data-speed]'));
  const cameraButtons = Array.from(container.querySelectorAll('[data-camera]'));
  const moodButtons = Array.from(container.querySelectorAll('[data-mood]'));

  function syncControls() {
    pauseBtn.setAttribute('aria-pressed', String(uiState.paused));
    pauseBtn.classList.toggle('is-active', uiState.paused);
    pauseLabelEl.textContent = uiState.paused ? 'Play' : 'Pause';

    for (const btn of speedButtons) {
      const active = Math.abs(Number(btn.dataset.speed) - uiState.speed) < 1e-4;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }

    for (const btn of cameraButtons) {
      const active = btn.dataset.camera === uiState.camera;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }

    for (const btn of moodButtons) {
      const active = btn.dataset.mood === uiState.mood;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }

    orbitHintEl.classList.toggle('is-visible', uiState.camera === 'orbit');
  }

  function handleClick(event) {
    const btn = event.target.closest('button');
    if (!btn || !container.contains(btn)) return;

    if (btn === breachBtn) {
      onTriggerBreach();
      return;
    }

    if (btn === pauseBtn) {
      onTogglePause();
      return;
    }

    if (btn.dataset.speed) {
      const nextSpeed = Number(btn.dataset.speed);
      onSelectSpeed(nextSpeed);
      return;
    }

    if (btn.dataset.camera) {
      onSelectCamera(btn.dataset.camera);
      return;
    }

    if (btn.dataset.mood) {
      onSelectMood(btn.dataset.mood);
    }
  }

  function handleKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (event.code === 'Space') {
      event.preventDefault();
      onTriggerBreach();
    } else if (event.code === 'KeyP') {
      event.preventDefault();
      onTogglePause();
    } else if (event.code === 'Digit1') {
      onSelectCamera('low-angle');
    } else if (event.code === 'Digit2') {
      onSelectCamera('close-breach');
    } else if (event.code === 'Digit3') {
      onSelectCamera('underwater');
    } else if (event.code === 'Digit4') {
      onSelectCamera('orbit');
    }
  }

  container.addEventListener('click', handleClick);
  window.addEventListener('keydown', handleKeyDown);

  function update({
    phaseName = uiState.phaseName,
    progress = uiState.progress,
    elevation = uiState.elevation,
    paused = uiState.paused,
    speed = uiState.speed,
    camera = uiState.camera,
    mood = uiState.mood,
  } = {}) {
    const controlsChanged =
      paused !== uiState.paused ||
      speed !== uiState.speed ||
      camera !== uiState.camera ||
      mood !== uiState.mood;

    uiState.paused = paused;
    uiState.speed = speed;
    uiState.camera = camera;
    uiState.mood = mood;

    if (controlsChanged) {
      syncControls();
    }

    if (phaseName !== uiState.phaseName) {
      uiState.phaseName = phaseName;
      phaseDotEl.dataset.phase = phaseName;
      phaseLabelEl.textContent = getPhaseLabel(phaseName);
    }

    uiState.progress = Math.max(0, Math.min(1, progress));
    progressFillEl.style.transform = `scaleX(${uiState.progress.toFixed(4)})`;

    uiState.elevation = elevation;
    const sign = elevation >= 0 ? '+' : '';
    altitudeEl.textContent = `${sign}${elevation.toFixed(1)} m`;
  }

  function dispose() {
    container.removeEventListener('click', handleClick);
    window.removeEventListener('keydown', handleKeyDown);
  }

  syncControls();
  phaseLabelEl.textContent = getPhaseLabel(uiState.phaseName);
  phaseDotEl.dataset.phase = uiState.phaseName;

  return {
    update,
    getPhaseLabel,
    dispose,
  };
}
