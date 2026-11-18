import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as esbuild from 'esbuild';
import {
  createHud,
  CAMERA_OPTIONS,
  VARIANT_OPTIONS,
  getPhaseLabel,
  getVariantLabel,
} from '../src/ui/hud.js';
import { initWhaleScene } from '../src/main.js';

function kebabToCamel(str) {
  return str.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

function camelToKebab(str) {
  return str.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
}

function createMiniElement(tagName, ownerDocument = null) {
  const listeners = new Map();
  const attributes = new Map();
  const classSet = new Set();
  const children = [];
  let textVal = '';

  const dataset = new Proxy(
    {},
    {
      get(_, prop) {
        if (typeof prop !== 'string') return undefined;
        return attributes.get(`data-${camelToKebab(prop)}`);
      },
      set(_, prop, value) {
        if (typeof prop === 'string') {
          attributes.set(`data-${camelToKebab(prop)}`, String(value));
        }
        return true;
      },
      has(_, prop) {
        if (typeof prop !== 'string') return false;
        return attributes.has(`data-${camelToKebab(prop)}`);
      },
    },
  );

  const el = {
    tagName: tagName.toUpperCase(),
    parentElement: null,
    children,
    style: {},
    dataset,
    isContentEditable: false,
    classList: {
      add(...tokens) {
        for (const t of tokens) if (t) classSet.add(t);
      },
      remove(...tokens) {
        for (const t of tokens) classSet.delete(t);
      },
      toggle(token, force) {
        const shouldHave =
          force === undefined ? !classSet.has(token) : Boolean(force);
        if (shouldHave) classSet.add(token);
        else classSet.delete(token);
        return shouldHave;
      },
      contains(token) {
        return classSet.has(token);
      },
    },
    setAttribute(name, value) {
      const str = String(value);
      attributes.set(name, str);
      if (name === 'class') {
        classSet.clear();
        for (const cls of str.split(/\s+/)) {
          if (cls) classSet.add(cls);
        }
      }
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
    appendChild(child) {
      child.parentElement = el;
      children.push(child);
      return child;
    },
    get textContent() {
      if (children.length === 0) return textVal;
      return textVal + children.map((c) => c.textContent).join('');
    },
    set textContent(val) {
      children.length = 0;
      textVal = String(val ?? '');
    },
    get innerHTML() {
      return el._rawHtml ?? '';
    },
    set innerHTML(html) {
      children.length = 0;
      textVal = '';
      el._rawHtml = String(html ?? '');
      parseHtmlFragmentInto(el, el._rawHtml, ownerDocument);
    },
    matches(selector) {
      return matchesSelector(el, selector);
    },
    closest(selector) {
      let cur = el;
      while (cur) {
        if (matchesSelector(cur, selector)) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    contains(target) {
      let cur = target;
      while (cur) {
        if (cur === el) return true;
        cur = cur.parentElement;
      }
      return false;
    },
    querySelector(selector) {
      const found = [];
      collectMatching(el, selector, found, true);
      return found[0] ?? null;
    },
    querySelectorAll(selector) {
      const found = [];
      collectMatching(el, selector, found, false);
      return found;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent(event) {
      const evt = {
        target: el,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...event,
      };
      let cur = el;
      while (cur) {
        const set = cur._listeners?.get(evt.type);
        if (set) {
          for (const fn of [...set]) {
            fn(evt);
          }
        }
        cur = cur.parentElement;
      }
      return !evt.defaultPrevented;
    },
    click() {
      el.dispatchEvent({ type: 'click', target: el });
    },
    getRootNode() {
      return ownerDocument ?? el;
    },
    _listeners: listeners,
    _attributes: attributes,
  };

  return el;
}

function matchesSelector(el, selector) {
  const trimmed = selector.trim();
  const attrExact = trimmed.match(/^\[([a-zA-Z0-9_-]+)=["']?([^"'\]]+)["']?\]$/);
  if (attrExact) {
    return el.getAttribute(attrExact[1]) === attrExact[2];
  }
  const attrExists = trimmed.match(/^\[([a-zA-Z0-9_-]+)\]$/);
  if (attrExists) {
    return el.hasAttribute(attrExists[1]);
  }
  if (trimmed.startsWith('.')) {
    return el.classList.contains(trimmed.slice(1));
  }
  if (trimmed.startsWith('#')) {
    return el.getAttribute('id') === trimmed.slice(1);
  }
  return el.tagName === trimmed.toUpperCase();
}

function collectMatching(root, selector, out, stopOnFirst) {
  for (const child of root.children) {
    if (matchesSelector(child, selector)) {
      out.push(child);
      if (stopOnFirst) return true;
    }
    if (collectMatching(child, selector, out, stopOnFirst) && stopOnFirst) {
      return true;
    }
  }
  return false;
}

function parseHtmlFragmentInto(root, html, ownerDocument) {
  const tokenRegex = /<\/?([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
  const stack = [root];
  const voidTags = new Set(['BR', 'HR', 'IMG', 'INPUT', 'META', 'LINK']);
  let match;

  while ((match = tokenRegex.exec(html)) !== null) {
    const [full, tag, attrText, rawText] = match;
    if (rawText !== undefined) {
      const cleaned = rawText.replace(/\s+/g, ' ').trim();
      if (cleaned && stack[stack.length - 1].children.length === 0) {
        stack[stack.length - 1].textContent = cleaned;
      }
      continue;
    }
    if (full.startsWith('</')) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const el = createMiniElement(tag, ownerDocument);
    const attrRegex = /([a-zA-Z0-9_:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let aMatch;
    while ((aMatch = attrRegex.exec(attrText)) !== null) {
      const name = aMatch[1];
      if (name === '/') continue;
      const val = aMatch[2] ?? aMatch[3] ?? aMatch[4] ?? '';
      el.setAttribute(name, val);
      if (name.startsWith('data-')) {
        el.dataset[kebabToCamel(name.slice(5))] = val;
      }
    }
    stack[stack.length - 1].appendChild(el);
    const selfClosing = attrText.trim().endsWith('/') || voidTags.has(el.tagName);
    if (!selfClosing) {
      stack.push(el);
    }
  }
}

function setupMockBrowserDom() {
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;

  const winListeners = new Map();
  const docListeners = new Map();
  let nextRaf = 1;
  const rafCallbacks = new Map();

  const mockDocument = {
    elementsById: new Map(),
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      docListeners.get(type)?.delete(fn);
    },
    getElementById(id) {
      return this.elementsById.get(id) ?? null;
    },
  };

  const canvas = createMiniElement('canvas', mockDocument);
  canvas.setAttribute('id', 'scene-canvas');
  const hudRoot = createMiniElement('div', mockDocument);
  hudRoot.setAttribute('id', 'hud-root');

  mockDocument.elementsById.set('scene-canvas', canvas);
  mockDocument.elementsById.set('hud-root', hudRoot);

  const mockWindow = {
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 2,
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      winListeners.get(type)?.delete(fn);
    },
    dispatchKeyDown(code, extra = {}) {
      const evt = {
        type: 'keydown',
        code,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        target: hudRoot,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...extra,
      };
      const set = winListeners.get('keydown');
      if (set) {
        for (const fn of [...set]) fn(evt);
      }
      return evt;
    },
    dispatchResize(width, height) {
      this.innerWidth = width;
      this.innerHeight = height;
      const set = winListeners.get('resize');
      if (set) {
        for (const fn of [...set]) fn({ type: 'resize' });
      }
    },
    requestAnimationFrame(cb) {
      const id = nextRaf++;
      rafCallbacks.set(id, cb);
      return id;
    },
    cancelAnimationFrame(id) {
      rafCallbacks.delete(id);
    },
  };

  globalThis.window = mockWindow;
  globalThis.document = mockDocument;

  return {
    window: mockWindow,
    document: mockDocument,
    canvas,
    hudRoot,
    rafCallbacks,
    winListeners,
    restore() {
      if (prevWindow === undefined) delete globalThis.window;
      else globalThis.window = prevWindow;
      if (prevDocument === undefined) delete globalThis.document;
      else globalThis.document = prevDocument;
    },
  };
}

function createMockAudioParam(initial = 0) {
  return {
    value: initial,
    defaultValue: initial,
    setValueAtTime(v) {
      this.value = v;
      return this;
    },
    linearRampToValueAtTime(v) {
      this.value = v;
      return this;
    },
    exponentialRampToValueAtTime(v) {
      this.value = v;
      return this;
    },
    setTargetAtTime(v) {
      this.value = v;
      return this;
    },
    cancelScheduledValues() {
      return this;
    },
  };
}

function createMockAudioContext() {
  let now = 0;
  const makeNode = (extra = {}) => ({
    connect(dest) {
      return dest;
    },
    disconnect() {},
    ...extra,
  });

  return {
    sampleRate: 48000,
    state: 'suspended',
    destination: makeNode(),
    closeCalls: 0,
    get currentTime() {
      return now;
    },
    advance(dt) {
      now += dt;
    },
    resume() {
      this.state = 'running';
      return Promise.resolve();
    },
    close() {
      this.closeCalls += 1;
      this.state = 'closed';
      return Promise.resolve();
    },
    createGain() {
      return makeNode({ gain: createMockAudioParam(1) });
    },
    createBiquadFilter() {
      return makeNode({
        type: 'lowpass',
        frequency: createMockAudioParam(350),
        Q: createMockAudioParam(1),
        gain: createMockAudioParam(0),
        detune: createMockAudioParam(0),
      });
    },
    createOscillator() {
      return makeNode({
        type: 'sine',
        frequency: createMockAudioParam(440),
        detune: createMockAudioParam(0),
        onended: null,
        start() {},
        stop() {},
      });
    },
    createBuffer(channels, length, rate = 48000) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        duration: length / rate,
        getChannelData: (ch) => data[ch],
      };
    },
    createBufferSource() {
      return makeNode({
        buffer: null,
        loop: false,
        playbackRate: createMockAudioParam(1),
        detune: createMockAudioParam(0),
        onended: null,
        start() {},
        stop() {},
      });
    },
    createStereoPanner() {
      return makeNode({ pan: createMockAudioParam(0) });
    },
    createDynamicsCompressor() {
      return makeNode({
        threshold: createMockAudioParam(-12),
        knee: createMockAudioParam(18),
        ratio: createMockAudioParam(4),
        attack: createMockAudioParam(0.005),
        release: createMockAudioParam(0.18),
      });
    },
  };
}

let activeDomCleanup = null;

afterEach(() => {
  if (activeDomCleanup) {
    activeDomCleanup();
    activeDomCleanup = null;
  }
});

describe('HUD controls, shortcuts & telemetry (src/ui/hud.js)', () => {
  it('renders all 6 camera presets, 5 breach style options, sound toggle, and dispatches clicks + keyboard shortcuts (1-6, V, M, Space, P)', () => {
    const dom = setupMockBrowserDom();
    activeDomCleanup = dom.restore;

    const onTriggerBreach = vi.fn();
    const onTogglePause = vi.fn();
    const onSelectSpeed = vi.fn();
    const onSelectCamera = vi.fn();
    const onSelectMood = vi.fn();
    const onSelectVariant = vi.fn();
    const onToggleSound = vi.fn();

    const hud = createHud({
      container: dom.hudRoot,
      initialState: {
        paused: false,
        speed: 1,
        camera: 'low-angle',
        mood: 'golden',
        variant: 'auto',
        activeVariant: 'classic',
        soundEnabled: false,
        phaseName: 'ascent',
        progress: 0,
        elevation: -12.4,
      },
      onTriggerBreach,
      onTogglePause,
      onSelectSpeed,
      onSelectCamera,
      onSelectMood,
      onSelectVariant,
      onToggleSound,
    });

    expect(CAMERA_OPTIONS.map((c) => c.value)).toEqual([
      'low-angle',
      'close-breach',
      'underwater',
      'orbit',
      'split',
      'aerial',
    ]);
    expect(VARIANT_OPTIONS.map((v) => v.value)).toEqual([
      'auto',
      'classic',
      'chin-slam',
      'barrel-port',
      'tail-lob',
    ]);
    expect(getPhaseLabel('apex')).toBe('Airborne Apex');
    expect(getVariantLabel('auto', 'barrel-port')).toBe('Auto · Barrel Spin');
    expect(getVariantLabel('chin-slam')).toBe('Chin Slam');

    const camButtons = dom.hudRoot.querySelectorAll('[data-camera]');
    expect(camButtons).toHaveLength(6);
    expect(camButtons[4].dataset.camera).toBe('split');
    expect(camButtons[5].dataset.camera).toBe('aerial');

    const variantButtons = dom.hudRoot.querySelectorAll('[data-variant]');
    expect(variantButtons).toHaveLength(5);

    const soundBtn = dom.hudRoot.querySelector('[data-action="toggle-sound"]');
    expect(soundBtn.getAttribute('aria-pressed')).toBe('false');
    expect(dom.hudRoot.querySelector('[data-role="sound-label"]').textContent).toBe(
      'Sound Off',
    );
    expect(dom.hudRoot.querySelector('[data-role="variant-readout"]').textContent).toBe(
      'Auto · Classic',
    );

    // Keyboard shortcuts: Space, P, M, 1..6
    expect(dom.window.dispatchKeyDown('Space').defaultPrevented).toBe(true);
    expect(onTriggerBreach).toHaveBeenCalledTimes(1);

    expect(dom.window.dispatchKeyDown('KeyP').defaultPrevented).toBe(true);
    expect(onTogglePause).toHaveBeenCalledTimes(1);

    expect(dom.window.dispatchKeyDown('KeyM').defaultPrevented).toBe(true);
    expect(onToggleSound).toHaveBeenCalledTimes(1);

    const expectedKeyMap = [
      ['Digit1', 'low-angle'],
      ['Digit2', 'close-breach'],
      ['Digit3', 'underwater'],
      ['Digit4', 'orbit'],
      ['Digit5', 'split'],
      ['Digit6', 'aerial'],
    ];
    for (const [code, preset] of expectedKeyMap) {
      dom.window.dispatchKeyDown(code);
      expect(onSelectCamera).toHaveBeenLastCalledWith(preset);
    }

    // KeyV cycles through all 5 breach style options cleanly and wraps back to 'auto'
    const expectedVariants = [
      'classic',
      'chin-slam',
      'barrel-port',
      'tail-lob',
      'auto',
    ];
    for (const expected of expectedVariants) {
      const ev = dom.window.dispatchKeyDown('KeyV');
      expect(ev.defaultPrevented).toBe(true);
      expect(onSelectVariant).toHaveBeenLastCalledWith(expected);
    }

    // Typing inside an INPUT element must be ignored
    const fakeInput = { tagName: 'INPUT' };
    dom.window.dispatchKeyDown('Space', { target: fakeInput });
    expect(onTriggerBreach).toHaveBeenCalledTimes(1);

    // Clicking dock buttons directly
    dom.hudRoot.querySelector('[data-speed="0.25"]').click();
    expect(onSelectSpeed).toHaveBeenCalledWith(0.25);

    dom.hudRoot.querySelector('[data-mood="twilight"]').click();
    expect(onSelectMood).toHaveBeenCalledWith('twilight');

    dom.hudRoot.querySelector('[data-variant="tail-lob"]').click();
    expect(onSelectVariant).toHaveBeenLastCalledWith('tail-lob');

    soundBtn.click();
    expect(onToggleSound).toHaveBeenCalledTimes(2);

    // hud.update syncs aria-pressed, Sound On label, orbit hint, altitude, and variant badge
    hud.update({
      phaseName: 'apex',
      progress: 0.52,
      elevation: 8.94,
      paused: true,
      speed: 0.25,
      camera: 'orbit',
      mood: 'twilight',
      variant: 'barrel-port',
      activeVariant: 'barrel-port',
      soundEnabled: true,
    });

    expect(soundBtn.getAttribute('aria-pressed')).toBe('true');
    expect(dom.hudRoot.querySelector('[data-role="sound-label"]').textContent).toBe(
      'Sound On',
    );
    expect(dom.hudRoot.querySelector('[data-role="pause-label"]').textContent).toBe(
      'Play',
    );
    expect(dom.hudRoot.querySelector('[data-role="phase-label"]').textContent).toBe(
      'Airborne Apex',
    );
    expect(dom.hudRoot.querySelector('[data-role="altitude-readout"]').textContent).toBe(
      '+8.9 m',
    );
    expect(dom.hudRoot.querySelector('[data-role="variant-readout"]').textContent).toBe(
      'Barrel Spin',
    );
    expect(
      dom.hudRoot
        .querySelector('[data-role="orbit-hint"]')
        .classList.contains('is-visible'),
    ).toBe(true);

    hud.dispose();
    dom.window.dispatchKeyDown('Space');
    expect(onTriggerBreach).toHaveBeenCalledTimes(1);
  });
});

describe('Full end-to-end scene integration (src/main.js)', () => {
  it('wires whale caustics, subsurface ocean optics, 15m spine trench, blowhole spout, 6 cameras, lens droplets, variants, and Web Audio soundscape', () => {
    const dom = setupMockBrowserDom();
    activeDomCleanup = dom.restore;

    const mockAudio = createMockAudioContext();
    const mockRenderer = {
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      dispose: vi.fn(),
    };

    const app = initWhaleScene({
      createRenderer: () => mockRenderer,
      createAudioContext: () => mockAudio,
    });

    expect(dom.window.__WHALE_SCENE__).toBe(app);
    expect(app.soundscape.isEnabled()).toBe(false);

    // Enable sound via 'M' shortcut and verify HUD + telemetry reflect Sound On
    dom.window.dispatchKeyDown('KeyM');
    expect(app.soundscape.isEnabled()).toBe(true);
    expect(app.getStatus().soundEnabled).toBe(true);
    expect(
      dom.hudRoot.querySelector('[data-role="sound-label"]').textContent,
    ).toBe('Sound On');

    // Verify underwater whale skin caustics & ocean subsurface whale uniforms are populated
    expect(app.oceanSurface.mesh.material.uniforms.uWhalePresent.value).toBe(1);
    expect(
      Number.isFinite(app.whaleRig.shaderUniforms.uWaterLevel.value),
    ).toBe(true);
    expect(
      app.whaleRig.shaderUniforms.uSunDirection.value.length(),
    ).toBeCloseTo(1, 4);

    // Switch to 'close-breach' ('2') so breakthrough & splashdown splash water droplets onto the lens
    dom.window.dispatchKeyDown('Digit2');
    expect(app.getStatus().cameraPreset).toBe('close-breach');

    // Step across a full 9.5s cycle and verify breakthrough, blowhole spout, and 15m splashdown trench
    let peakLensWetness = 0;
    let maxActiveFoamPatches = 0;
    const foamGroup = app.splashSystem.group.children.find((c) =>
      Array.isArray(c.children) && c.children.length >= 6,
    );

    for (let i = 0; i < 190; i += 1) {
      mockAudio.advance(0.05);
      app.stepFrame(0.05);
      const st = app.getStatus();
      peakLensWetness = Math.max(peakLensWetness, st.lensWetness);
      if (foamGroup) {
        const activeCount = foamGroup.children.filter(
          (m) => m.userData?.active,
        ).length;
        maxActiveFoamPatches = Math.max(maxActiveFoamPatches, activeCount);
      }
      expect(Number.isFinite(st.whalePosition.y)).toBe(true);
      expect(Number.isFinite(st.fov)).toBe(true);
    }

    // Breakthrough + 15m 3-station splashdown trench must have spawned >= 3 simultaneous foam patches and lens droplets
    expect(peakLensWetness).toBeGreaterThan(0.25);
    expect(maxActiveFoamPatches).toBeGreaterThanOrEqual(3);

    const audioStateAfterCycle = app.soundscape.getState();
    expect(audioStateAfterCycle.triggerCounts.breakthrough).toBeGreaterThanOrEqual(1);
    expect(audioStateAfterCycle.triggerCounts.splashdown).toBeGreaterThanOrEqual(1);
    expect(audioStateAfterCycle.triggerCounts.blow).toBeGreaterThanOrEqual(1);

    // Auto mode should have advanced from 'classic' (cycle 0) to 'chin-slam' (cycle 1)
    expect(app.getStatus().variant).toBe('auto');
    expect(app.getStatus().activeVariant).toBe('chin-slam');

    // Exercise all 6 camera presets (including 'split' and 'aerial') + resize
    app.setCameraPreset('split', { immediate: true });
    for (let i = 0; i < 20; i += 1) app.stepFrame(1 / 60);
    const splitStatus = app.getStatus();
    expect(splitStatus.cameraPreset).toBe('split');
    expect(splitStatus.waterlineFraction).toBeGreaterThan(0.35);
    expect(splitStatus.waterlineFraction).toBeLessThan(0.65);
    expect(splitStatus.fov).toBeCloseTo(60, 0);

    app.setCameraPreset('underwater', { immediate: true });
    for (let i = 0; i < 20; i += 1) app.stepFrame(1 / 60);
    const uwStatus = app.getStatus();
    expect(uwStatus.isCameraSubmerged).toBe(true);
    expect(app.soundscape.getState().surfaceCutoffHz).toBeLessThan(2500);

    app.setCameraPreset('aerial', { immediate: true });
    for (let i = 0; i < 20; i += 1) app.stepFrame(1 / 60);
    const aerialStatus = app.getStatus();
    expect(aerialStatus.cameraPreset).toBe('aerial');
    expect(aerialStatus.cameraPosition.y).toBeGreaterThan(28);
    expect(aerialStatus.isCameraSubmerged).toBe(false);

    // Exercise explicit breach variants ('chin-slam', 'barrel-port', 'tail-lob', 'classic')
    for (const variant of ['chin-slam', 'barrel-port', 'tail-lob', 'classic']) {
      app.setVariant(variant);
      app.triggerBreach();
      app.stepFrame(0.05);
      const st = app.getStatus();
      expect(st.variant).toBe(variant);
      expect(st.activeVariant).toBe(variant);
    }

    // Explicit blow helper + resize + clean dispose
    expect(app.triggerBlow(0.9)).toBe(true);
    dom.window.dispatchResize(390, 844);
    expect(app.cameraRig.camera.aspect).toBeCloseTo(390 / 844, 4);

    app.dispose();
    expect(mockAudio.closeCalls).toBe(1);
    expect(mockRenderer.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('Standalone bundle integrity (google-sites-embed.html)', () => {
  it('contains valid self-contained ESM JS, minified CSS, CDN importmap, and all upgraded camera/variant/audio/shader features', async () => {
    const embedPath = path.resolve(process.cwd(), 'google-sites-embed.html');
    const html = fs.readFileSync(embedPath, 'utf8');

    expect(html).toContain('id="scene-canvas"');
    expect(html).toContain('id="hud-root"');
    expect(html).toContain('https://cdn.jsdelivr.net/npm/three@0.174.0/build/three.module.js');

    // Must not depend on any local external stylesheet or module script URL
    expect(html).not.toMatch(/href=["']\/?src\//);
    expect(html).not.toMatch(/src=["']\/?src\//);

    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    expect(styleMatch).not.toBeNull();
    expect(styleMatch[1]).toContain('.hud-variant-badge');
    expect(styleMatch[1]).toContain('.hud-btn-sound');

    const moduleMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
    expect(moduleMatch).not.toBeNull();
    const moduleCode = moduleMatch[1];

    // Parse & validate full ES module syntax with esbuild
    const parsed = await esbuild.transform(moduleCode, {
      loader: 'js',
      format: 'esm',
      target: 'esnext',
    });
    expect(parsed.code.length).toBeGreaterThan(50000);

    // Verify all major feature tokens are bundled into the standalone file
    for (const token of [
      'Split Waterline',
      'Aerial Drone',
      'Chin Slam',
      'Barrel Spin',
      'Tail Lob',
      'Sound Off',
      'Sound On',
      'Digit5',
      'Digit6',
      'KeyV',
      'KeyM',
      'uWhaleSpine',
      'uWhaleFlippers',
      'blowholeSpout',
      'uWaterlineFraction',
      'createBiquadFilter',
      '__WHALE_SCENE__',
    ]) {
      expect(moduleCode).toContain(token);
    }
  });
});
