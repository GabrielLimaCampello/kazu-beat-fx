'use strict';

const $ = (id) => document.getElementById(id);

const canvas = $('preview');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const video = $('videoEl');
const audio = $('audioEl');

const ui = {
  emptyState: $('emptyState'), meter: $('meter'), playBtn: $('playBtn'), stopBtn: $('stopBtn'),
  timeLabel: $('timeLabel'), seek: $('seek'), exportBtn: $('exportBtn'), exportStatus: $('exportStatus'),
  videoInput: $('videoInput'), audioInput: $('audioInput'), overlayInput: $('overlayInput'),
  reactiveEnabled: $('reactiveEnabled'), lowHz: $('lowHz'), highHz: $('highHz'), threshold: $('threshold'),
  sensitivity: $('sensitivity'), attack: $('attack'), release: $('release'), minOpacity: $('minOpacity'),
  maxOpacity: $('maxOpacity'), baseScale: $('baseScale'), scaleBoost: $('scaleBoost'), glow: $('glow'),
  rotation: $('rotation'), posX: $('posX'), posY: $('posY'), blendMode: $('blendMode'), videoFit: $('videoFit'),
  resolution: $('resolution'), savePresetBtn: $('savePresetBtn'), presetInput: $('presetInput'),
  installBtn: $('installBtn'), installDialog: $('installDialog'), closeInstallDialog: $('closeInstallDialog')
};

const outputs = {
  lowHz: ['lowHzOut', (v) => `${v} Hz`], highHz: ['highHzOut', (v) => `${v} Hz`],
  threshold: ['thresholdOut', (v) => `${v}%`], sensitivity: ['sensitivityOut', (v) => `${(v / 100).toFixed(1)}×`],
  attack: ['attackOut', (v) => `${v} ms`], release: ['releaseOut', (v) => `${v} ms`],
  minOpacity: ['minOpacityOut', (v) => `${v}%`], maxOpacity: ['maxOpacityOut', (v) => `${v}%`],
  baseScale: ['baseScaleOut', (v) => `${v}%`], scaleBoost: ['scaleBoostOut', (v) => `${v}%`],
  glow: ['glowOut', (v) => `${v} px`], rotation: ['rotationOut', (v) => `${v}°`],
  posX: ['posXOut', (v) => `${v}%`], posY: ['posYOut', (v) => `${v}%`]
};

let overlayImage = null;
let hasVideo = false;
let hasExternalAudio = false;
let playing = false;
let exporting = false;
let renderId = 0;
let lastFrameTime = performance.now();
let envelope = 0;
let rawEnergy = 0;
let audioContext = null;
let analyser = null;
let frequencyData = null;
let activeSource = null;
let recordDestination = null;
let mediaRecorder = null;
let recordedChunks = [];
let deferredInstallPrompt = null;
let objectUrls = [];

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const value = (el) => Number(el.value);

function setStatus(message, type = '') {
  ui.exportStatus.textContent = message;
  ui.exportStatus.className = `status${type ? ` ${type}` : ''}`;
}

function updateOutputs() {
  Object.entries(outputs).forEach(([key, [id, formatter]]) => {
    $(id).value = formatter(ui[key].value);
  });
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function projectDuration() {
  const vd = Number.isFinite(video.duration) ? video.duration : 0;
  const ad = hasExternalAudio && Number.isFinite(audio.duration) ? audio.duration : Infinity;
  return Math.max(0, Math.min(vd, ad));
}

function setCanvasResolution() {
  const target = ui.resolution.value === '1080' ? [1920, 1080] : [1280, 720];
  if (canvas.width !== target[0] || canvas.height !== target[1]) {
    canvas.width = target[0];
    canvas.height = target[1];
  }
}

function drawFittedVideo() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!hasVideo || video.readyState < 2) return;

  const sourceRatio = video.videoWidth / video.videoHeight;
  const targetRatio = canvas.width / canvas.height;
  let w, h;
  const contain = ui.videoFit.value === 'contain';
  const useWidth = contain ? sourceRatio > targetRatio : sourceRatio < targetRatio;
  if (useWidth) {
    w = canvas.width;
    h = w / sourceRatio;
  } else {
    h = canvas.height;
    w = h * sourceRatio;
  }
  ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
}

function computeKick(dt) {
  if (!analyser || !frequencyData || !playing) {
    rawEnergy = 0;
  } else {
    analyser.getByteFrequencyData(frequencyData);
    const sampleRate = audioContext.sampleRate;
    const binHz = sampleRate / analyser.fftSize;
    const low = Math.max(0, Math.floor(value(ui.lowHz) / binHz));
    const high = Math.min(frequencyData.length - 1, Math.ceil(value(ui.highHz) / binHz));
    let weighted = 0;
    let weights = 0;
    for (let i = low; i <= high; i += 1) {
      const normalized = (i - low) / Math.max(1, high - low);
      const weight = 1.35 - normalized * 0.55;
      weighted += (frequencyData[i] / 255) * weight;
      weights += weight;
    }
    rawEnergy = weights ? weighted / weights : 0;
  }

  const threshold = value(ui.threshold) / 100;
  const sensitivity = value(ui.sensitivity) / 100;
  const target = rawEnergy <= threshold ? 0 : clamp(((rawEnergy - threshold) / Math.max(0.001, 1 - threshold)) * sensitivity, 0, 1);
  const attack = Math.max(0.001, value(ui.attack) / 1000);
  const release = Math.max(0.001, value(ui.release) / 1000);
  const tau = target > envelope ? attack : release;
  const alpha = 1 - Math.exp(-dt / tau);
  envelope += (target - envelope) * alpha;
  envelope = clamp(envelope, 0, 1);
  if (!ui.reactiveEnabled.checked) envelope = 1;
}

function drawOverlay() {
  if (!overlayImage) return;
  const minOpacity = value(ui.minOpacity) / 100;
  const maxOpacity = value(ui.maxOpacity) / 100;
  const opacity = minOpacity + (maxOpacity - minOpacity) * envelope;
  if (opacity <= 0.001) return;

  const baseScale = value(ui.baseScale) / 100;
  const kickScale = value(ui.scaleBoost) / 100;
  const scale = baseScale * (1 + kickScale * envelope);
  const x = canvas.width * value(ui.posX) / 100;
  const y = canvas.height * value(ui.posY) / 100;
  const rotation = value(ui.rotation) * Math.PI / 180;
  const imageRatio = overlayImage.naturalWidth / overlayImage.naturalHeight;
  const canvasRatio = canvas.width / canvas.height;
  let w, h;
  if (imageRatio > canvasRatio) {
    w = canvas.width * scale;
    h = w / imageRatio;
  } else {
    h = canvas.height * scale;
    w = h * imageRatio;
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = ui.blendMode.value;
  const glow = value(ui.glow) * envelope * (canvas.width / 1280);
  ctx.shadowColor = 'rgba(177, 65, 255, 0.95)';
  ctx.shadowBlur = glow;
  ctx.drawImage(overlayImage, -w / 2, -h / 2, w, h);
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
}

function render(now = performance.now()) {
  const dt = clamp((now - lastFrameTime) / 1000, 0.001, 0.1);
  lastFrameTime = now;
  setCanvasResolution();
  computeKick(dt);
  drawFittedVideo();
  drawOverlay();
  ui.meter.style.width = `${Math.round(envelope * 100)}%`;

  const duration = projectDuration();
  ui.timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
  if (duration > 0 && !ui.seek.matches(':active')) {
    ui.seek.value = Math.round((video.currentTime / duration) * 1000);
  }

  if (playing && duration > 0 && video.currentTime >= duration - 0.03) {
    stopPlayback();
    if (exporting && mediaRecorder?.state === 'recording') mediaRecorder.stop();
  }

  if (playing && hasExternalAudio && Math.abs(audio.currentTime - video.currentTime) > 0.12) {
    audio.currentTime = video.currentTime;
  }

  renderId = requestAnimationFrame(render);
}

async function ensureAudioGraph() {
  if (audioContext) {
    if (audioContext.state === 'suspended') await audioContext.resume();
    return;
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('Web Audio não é suportado neste navegador.');
  audioContext = new AudioCtx();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.22;
  frequencyData = new Uint8Array(analyser.frequencyBinCount);
  recordDestination = audioContext.createMediaStreamDestination();
  await rebuildAudioSource();
}

async function rebuildAudioSource() {
  if (!audioContext) return;
  try { activeSource?.disconnect(); } catch (_) {}
  activeSource = null;

  const media = hasExternalAudio ? audio : video;
  if (!media.src) return;
  try {
    activeSource = audioContext.createMediaElementSource(media);
    activeSource.connect(analyser);
    analyser.connect(audioContext.destination);
    analyser.connect(recordDestination);
  } catch (error) {
    // A MediaElementSource can only be created once per element. Reuse the existing graph when possible.
    if (!activeSource) throw error;
  }
}

async function playProject() {
  if (!hasVideo) return;
  try {
    await ensureAudioGraph();
    if (audioContext.state === 'suspended') await audioContext.resume();
    const duration = projectDuration();
    if (duration > 0 && video.currentTime >= duration - 0.05) {
      video.currentTime = 0;
      if (hasExternalAudio) audio.currentTime = 0;
    }
    if (hasExternalAudio) {
      video.muted = true;
      audio.currentTime = video.currentTime;
      await Promise.all([video.play(), audio.play()]);
    } else {
      video.muted = false;
      await video.play();
    }
    playing = true;
    ui.playBtn.textContent = '❚❚ Pausar';
  } catch (error) {
    setStatus(`Não foi possível reproduzir: ${error.message}`, 'error');
  }
}

function pauseProject() {
  video.pause();
  audio.pause();
  playing = false;
  ui.playBtn.textContent = '▶ Reproduzir';
}

function stopPlayback() {
  pauseProject();
  video.currentTime = 0;
  if (hasExternalAudio) audio.currentTime = 0;
  envelope = 0;
}

function enableProjectControls() {
  ui.emptyState.classList.toggle('hidden', hasVideo);
  ui.playBtn.disabled = !hasVideo;
  ui.stopBtn.disabled = !hasVideo;
  ui.seek.disabled = !hasVideo;
  ui.exportBtn.disabled = !hasVideo;
  if (hasVideo) setStatus('Projeto pronto. Ajuste a reação e toque em reproduzir.', 'ok');
}

function rememberUrl(url) {
  objectUrls.push(url);
  return url;
}

async function loadVideo(file) {
  pauseProject();
  video.src = rememberUrl(URL.createObjectURL(file));
  video.load();
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error('Não foi possível abrir o vídeo.'));
  });
  hasVideo = true;
  video.currentTime = 0;
  enableProjectControls();
  if (audioContext && !hasExternalAudio) await rebuildAudioSource();
}

async function loadAudio(file) {
  pauseProject();
  audio.src = rememberUrl(URL.createObjectURL(file));
  audio.load();
  await new Promise((resolve, reject) => {
    audio.onloadedmetadata = resolve;
    audio.onerror = () => reject(new Error('Não foi possível abrir a música.'));
  });
  hasExternalAudio = true;
  video.muted = true;
  if (audioContext) await rebuildAudioSource();
  setStatus('Música separada carregada e sincronizada ao vídeo.', 'ok');
}

async function loadOverlay(file) {
  const img = new Image();
  img.decoding = 'async';
  img.src = rememberUrl(URL.createObjectURL(file));
  await img.decode();
  overlayImage = img;
  setStatus('Imagem carregada. O kick agora controla a opacidade.', 'ok');
}

function collectPreset() {
  const keys = [
    'reactiveEnabled','lowHz','highHz','threshold','sensitivity','attack','release','minOpacity','maxOpacity',
    'baseScale','scaleBoost','glow','rotation','posX','posY','blendMode','videoFit','resolution'
  ];
  const settings = {};
  keys.forEach((key) => {
    settings[key] = ui[key].type === 'checkbox' ? ui[key].checked : ui[key].value;
  });
  return {
    app: 'Kazu Beat FX', version: 1, createdAt: new Date().toISOString(), settings
  };
}

function applyPreset(data) {
  if (!data?.settings) throw new Error('Preset inválido.');
  Object.entries(data.settings).forEach(([key, val]) => {
    if (!ui[key]) return;
    if (ui[key].type === 'checkbox') ui[key].checked = Boolean(val);
    else ui[key].value = String(val);
  });
  updateOutputs();
  localStorage.setItem('kazuBeatFxSettings', JSON.stringify(collectPreset()));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function pickMimeType() {
  const types = [
    'video/mp4;codecs=h264,aac',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  return types.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
}

async function exportVideo() {
  if (!hasVideo || exporting) return;
  if (!canvas.captureStream || !window.MediaRecorder) {
    setStatus('Este navegador não oferece exportação por Canvas/MediaRecorder. Use a prévia ou abra em uma versão recente do Safari/Chrome.', 'error');
    return;
  }

  try {
    await ensureAudioGraph();
    stopPlayback();
    setCanvasResolution();
    const fps = 30;
    const canvasStream = canvas.captureStream(fps);
    const audioTracks = recordDestination.stream.getAudioTracks();
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
    const mimeType = pickMimeType();
    const options = mimeType ? { mimeType, videoBitsPerSecond: ui.resolution.value === '1080' ? 12_000_000 : 7_000_000 } : {};
    mediaRecorder = new MediaRecorder(combined, options);
    recordedChunks = [];
    mediaRecorder.ondataavailable = (event) => { if (event.data.size) recordedChunks.push(event.data); };
    mediaRecorder.onerror = (event) => setStatus(`Falha na exportação: ${event.error?.message || 'erro desconhecido'}`, 'error');
    mediaRecorder.onstop = () => {
      exporting = false;
      const type = mediaRecorder.mimeType || mimeType || 'video/webm';
      const extension = type.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(recordedChunks, { type });
      downloadBlob(blob, `Kazu-Beat-FX-${Date.now()}.${extension}`);
      setStatus(`Exportação concluída (${(blob.size / 1024 / 1024).toFixed(1)} MB).`, 'ok');
      ui.exportBtn.disabled = false;
      ui.exportBtn.textContent = 'Exportar vídeo';
    };

    exporting = true;
    ui.exportBtn.disabled = true;
    ui.exportBtn.textContent = 'Exportando…';
    setStatus('Exportando em tempo real. Não bloqueie a tela nem saia do app.');
    mediaRecorder.start(1000);
    await playProject();
  } catch (error) {
    exporting = false;
    ui.exportBtn.disabled = false;
    ui.exportBtn.textContent = 'Exportar vídeo';
    setStatus(`Não foi possível exportar: ${error.message}`, 'error');
  }
}

ui.videoInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  try { await loadVideo(file); } catch (error) { setStatus(error.message, 'error'); }
});
ui.audioInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  try { await loadAudio(file); } catch (error) { setStatus(error.message, 'error'); }
});
ui.overlayInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  try { await loadOverlay(file); } catch (error) { setStatus(`Não foi possível abrir a imagem: ${error.message}`, 'error'); }
});
ui.playBtn.addEventListener('click', () => playing ? pauseProject() : playProject());
ui.stopBtn.addEventListener('click', stopPlayback);
ui.seek.addEventListener('input', () => {
  const duration = projectDuration();
  const t = duration * value(ui.seek) / 1000;
  video.currentTime = t;
  if (hasExternalAudio) audio.currentTime = t;
});
ui.exportBtn.addEventListener('click', exportVideo);
ui.resolution.addEventListener('change', setCanvasResolution);

Object.entries(outputs).forEach(([key]) => ui[key].addEventListener('input', updateOutputs));
[
  'reactiveEnabled','lowHz','highHz','threshold','sensitivity','attack','release','minOpacity','maxOpacity',
  'baseScale','scaleBoost','glow','rotation','posX','posY','blendMode','videoFit','resolution'
].forEach((key) => {
  ui[key].addEventListener('change', () => localStorage.setItem('kazuBeatFxSettings', JSON.stringify(collectPreset())));
});

ui.savePresetBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(collectPreset(), null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'Kazu-Beat-FX-Preset.json');
});
ui.presetInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    applyPreset(JSON.parse(await file.text()));
    setStatus('Preset importado.', 'ok');
  } catch (error) { setStatus(error.message, 'error'); }
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  ui.installBtn.classList.remove('hidden');
});
ui.installBtn.addEventListener('click', async () => {
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    ui.installDialog.showModal();
  } else if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    ui.installBtn.classList.add('hidden');
  } else {
    ui.installDialog.showModal();
  }
});
ui.closeInstallDialog.addEventListener('click', () => ui.installDialog.close());

video.addEventListener('loadeddata', () => enableProjectControls());
video.addEventListener('ended', () => {
  if (exporting && mediaRecorder?.state === 'recording') mediaRecorder.stop();
  stopPlayback();
});

window.addEventListener('pagehide', () => {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
});

try {
  const saved = JSON.parse(localStorage.getItem('kazuBeatFxSettings'));
  if (saved) applyPreset(saved);
} catch (_) {}

updateOutputs();
setCanvasResolution();
render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches) {
  ui.installBtn.classList.remove('hidden');
}
