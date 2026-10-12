(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  const STORAGE_KEY = 'mobile-vr-camera-settings';

  const DEFAULTS = {
    distortion: true, // Cardboard-style barrel distortion to counter the lenses
    divider: true,    // thin line between the two eyes
    zoom: 1,          // digital zoom on the camera feed
    spacing: 0,       // shifts each eye's lens center inward (+) or outward (-)
    strength: 1,      // multiplier for the distortion coefficients
  };

  // Lens coefficients similar to the original Google Cardboard viewer
  const K1 = 0.22;
  const K2 = 0.24;

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return { ...DEFAULTS, ...(saved || {}) };
    } catch (e) {
      return { ...DEFAULTS };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      // Storage unavailable (private mode etc.) — settings just won't persist
    }
  }

  let settings = loadSettings();

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  const $ = (id) => document.getElementById(id);

  const canvas = $('vr-canvas');
  const video = $('camera');
  const divider = $('divider');
  const startScreen = $('start-screen');
  const startBtn = $('start-btn');
  const errorEl = $('error');
  const rotateHint = $('rotate-hint');
  const settingsPanel = $('settings');

  const inputs = {
    distortion: $('opt-distortion'),
    divider: $('opt-divider'),
    zoom: $('opt-zoom'),
    spacing: $('opt-spacing'),
    strength: $('opt-strength'),
  };

  const outputs = {
    zoom: $('out-zoom'),
    spacing: $('out-spacing'),
    strength: $('out-strength'),
  };

  // ---------------------------------------------------------------------------
  // WebGL renderer
  // ---------------------------------------------------------------------------

  const VERTEX_SHADER = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  // Renders one eye. vUv is 0..1 across that eye's half of the screen.
  const FRAGMENT_SHADER = `
    precision mediump float;
    varying vec2 vUv;

    uniform sampler2D uTex;
    uniform vec2 uLensCenter;   // lens center within the eye viewport (0..1)
    uniform float uEyeAspect;   // eye viewport width / height
    uniform vec2 uCoverScale;   // crops the video to "cover" the eye viewport
    uniform float uZoom;
    uniform float uK1;
    uniform float uK2;

    void main() {
      // Position relative to the lens center, in units of viewport height
      vec2 p = (vUv - uLensCenter) * vec2(uEyeAspect, 1.0);

      // Barrel distortion (cancels the pincushion effect of the viewer lenses)
      float r2 = dot(p, p);
      p *= 1.0 + uK1 * r2 + uK2 * r2 * r2;

      // Back to 0..1 with the image centered on the lens
      vec2 q = p / vec2(uEyeAspect, 1.0);
      vec2 uv = 0.5 + q * uCoverScale / uZoom;

      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      // Soft vignette towards the edge of the lens
      float vignette = 1.0 - smoothstep(0.9, 1.3, length(q * 2.0));

      gl_FragColor = vec4(texture2D(uTex, uv).rgb * vignette, 1.0);
    }
  `;

  let gl = null;
  let program = null;
  let texture = null;
  let uniforms = {};

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  function initGL() {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false })
      || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL is not supported on this device.');

    program = gl.createProgram();
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    gl.useProgram(program);

    // Full-screen quad
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Camera texture (non power-of-two: clamp + linear, no mipmaps)
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    for (const name of ['uTex', 'uLensCenter', 'uEyeAspect', 'uCoverScale', 'uZoom', 'uK1', 'uK2']) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    gl.uniform1i(uniforms.uTex, 0);
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(canvas.clientWidth * dpr);
    const height = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function drawFrame() {
    resizeCanvas();

    const w = canvas.width;
    const h = canvas.height;
    const eyeW = Math.floor(w / 2);

    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (video.readyState < video.HAVE_CURRENT_DATA || !video.videoWidth) return;

    // Upload the latest camera frame once, then draw it for both eyes
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);

    const eyeAspect = eyeW / h;
    const videoAspect = video.videoWidth / video.videoHeight;
    // Crop the video so it fills ("covers") each eye without stretching
    const cover = videoAspect > eyeAspect
      ? [eyeAspect / videoAspect, 1]
      : [1, videoAspect / eyeAspect];

    const strength = settings.distortion ? settings.strength : 0;

    gl.uniform1f(uniforms.uEyeAspect, eyeAspect);
    gl.uniform2f(uniforms.uCoverScale, cover[0], cover[1]);
    gl.uniform1f(uniforms.uZoom, settings.zoom);
    gl.uniform1f(uniforms.uK1, K1 * strength);
    gl.uniform1f(uniforms.uK2, K2 * strength);

    // Left eye
    gl.viewport(0, 0, eyeW, h);
    gl.uniform2f(uniforms.uLensCenter, 0.5 + settings.spacing, 0.5);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Right eye
    gl.viewport(w - eyeW, 0, eyeW, h);
    gl.uniform2f(uniforms.uLensCenter, 0.5 - settings.spacing, 0.5);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  let rafId = null;

  function renderLoop() {
    drawFrame();
    rafId = requestAnimationFrame(renderLoop);
  }

  // ---------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------

  let stream = null;

  async function openRearCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera access is not available. Open this page over HTTPS in a modern mobile browser.');
    }

    const size = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    try {
      // Insist on the rear ("environment") camera first...
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { exact: 'environment' }, ...size },
      });
    } catch (e) {
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw e;
      // ...then fall back to any camera (e.g. desktop browsers for testing)
      return navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment', ...size },
      });
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video.srcObject = null;
  }

  // ---------------------------------------------------------------------------
  // Fullscreen, orientation and wake lock
  // ---------------------------------------------------------------------------

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  async function enterFullscreen() {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) {
      // Not supported (e.g. iPhone Safari) — the app still works without it
    }
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch (e) {
      // Orientation lock is only allowed in fullscreen on some browsers
    }
  }

  async function exitFullscreen() {
    try {
      if (document.exitFullscreen && document.fullscreenElement) await document.exitFullscreen();
      else if (document.webkitExitFullscreen && document.webkitFullscreenElement) document.webkitExitFullscreen();
    } catch (e) {
      // ignore
    }
  }

  let wakeLock = null;

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) {
      // Not supported or denied — the screen may dim during use
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release();
      wakeLock = null;
    }
  }

  // ---------------------------------------------------------------------------
  // App lifecycle
  // ---------------------------------------------------------------------------

  let running = false;

  async function start() {
    errorEl.hidden = true;
    startBtn.disabled = true;

    // Fullscreen must be requested directly from the tap
    enterFullscreen();

    try {
      if (!gl) initGL();
      stream = await openRearCamera();
      video.srcObject = stream;
      await video.play();
    } catch (e) {
      stopCamera();
      exitFullscreen();
      startBtn.disabled = false;
      errorEl.textContent = describeError(e);
      errorEl.hidden = false;
      return;
    }

    running = true;
    document.body.classList.add('running');
    startScreen.hidden = true;
    startBtn.disabled = false;
    updateRotateHint();
    requestWakeLock();
    showControls();

    if (rafId === null) renderLoop();
  }

  function stop() {
    running = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    stopCamera();
    releaseWakeLock();
    exitFullscreen();
    settingsPanel.hidden = true;
    document.body.classList.remove('running', 'show-controls');
    rotateHint.hidden = true;
    startScreen.hidden = false;
  }

  function describeError(e) {
    switch (e && e.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'Camera permission was denied. Allow camera access in your browser settings and try again.';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'No suitable camera was found on this device.';
      case 'NotReadableError':
        return 'The camera is in use by another app. Close it and try again.';
      default:
        return (e && e.message) || 'Something went wrong starting the camera.';
    }
  }

  function updateRotateHint() {
    rotateHint.hidden = !running || window.innerWidth >= window.innerHeight;
  }

  // ---------------------------------------------------------------------------
  // Controls overlay
  // ---------------------------------------------------------------------------

  let hideTimer = null;

  function showControls() {
    document.body.classList.add('show-controls');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (settingsPanel.hidden) document.body.classList.remove('show-controls');
    }, 3000);
  }

  function toggleControls() {
    if (document.body.classList.contains('show-controls') && settingsPanel.hidden) {
      clearTimeout(hideTimer);
      document.body.classList.remove('show-controls');
    } else {
      showControls();
    }
  }

  function syncSettingsUI() {
    inputs.distortion.checked = settings.distortion;
    inputs.divider.checked = settings.divider;
    inputs.zoom.value = settings.zoom;
    inputs.spacing.value = settings.spacing;
    inputs.strength.value = settings.strength;
    inputs.strength.disabled = !settings.distortion;

    outputs.zoom.textContent = `${Number(settings.zoom).toFixed(2)}×`;
    outputs.spacing.textContent = `${settings.spacing > 0 ? '+' : ''}${Math.round(settings.spacing * 200)}%`;
    outputs.strength.textContent = `${Math.round(settings.strength * 100)}%`;

    divider.classList.toggle('visible', settings.divider);
  }

  function bindSettings() {
    inputs.distortion.addEventListener('change', () => {
      settings.distortion = inputs.distortion.checked;
      syncSettingsUI();
      saveSettings();
    });
    inputs.divider.addEventListener('change', () => {
      settings.divider = inputs.divider.checked;
      syncSettingsUI();
      saveSettings();
    });
    for (const key of ['zoom', 'spacing', 'strength']) {
      inputs[key].addEventListener('input', () => {
        settings[key] = parseFloat(inputs[key].value);
        syncSettingsUI();
        saveSettings();
      });
    }

    $('reset-btn').addEventListener('click', () => {
      settings = { ...DEFAULTS };
      syncSettingsUI();
      saveSettings();
    });
    $('close-settings-btn').addEventListener('click', () => {
      settingsPanel.hidden = true;
      showControls();
    });
    $('settings-btn').addEventListener('click', () => {
      settingsPanel.hidden = !settingsPanel.hidden;
      showControls();
    });
    $('fullscreen-btn').addEventListener('click', () => {
      if (isFullscreen()) exitFullscreen();
      else enterFullscreen();
      showControls();
    });
    $('exit-btn').addEventListener('click', stop);
  }

  // ---------------------------------------------------------------------------
  // Wire up
  // ---------------------------------------------------------------------------

  startBtn.addEventListener('click', start);
  canvas.addEventListener('click', () => {
    if (!running) return;
    if (!settingsPanel.hidden) {
      settingsPanel.hidden = true;
    }
    toggleControls();
  });

  window.addEventListener('resize', updateRotateHint);
  window.addEventListener('orientationchange', updateRotateHint);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && running) requestWakeLock();
  });

  bindSettings();
  syncSettingsUI();
})();
