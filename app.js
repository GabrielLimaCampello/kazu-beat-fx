'use strict';

const $ = (id) => document.getElementById(id);
const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
const numeric = (element) => Number(element.value);

const canvas = $('preview');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const video = $('videoEl');
const waveVideo = $('waveVideoEl');
const audio = $('audioEl');

const waveCanvas = document.createElement('canvas');
const waveCtx = waveCanvas.getContext('2d', { alpha: true, desynchronized: true });
const waveSourceCanvas = document.createElement('canvas');
const waveSourceCtx = waveSourceCanvas.getContext('2d', { alpha: false, desynchronized: true });
const waveCoreCanvas = document.createElement('canvas');
const waveCoreCtx = waveCoreCanvas.getContext('2d', { alpha: false, desynchronized: true });
const maskedWaveCanvas = document.createElement('canvas');
const maskedWaveCtx = maskedWaveCanvas.getContext('2d', { alpha: true, desynchronized: true });
const processedMaskCanvas = document.createElement('canvas');
const processedMaskCtx = processedMaskCanvas.getContext('2d', { alpha: true });
const sourceFrameCanvas = document.createElement('canvas');
const sourceFrameCtx = sourceFrameCanvas.getContext('2d', { alpha: false, desynchronized: true });
const protectedVideoCanvas = document.createElement('canvas');
const protectedVideoCtx = protectedVideoCanvas.getContext('2d', { alpha: true, desynchronized: true });

// The mask is deliberately smaller than the output to keep painting responsive on iPhone.
const maskCanvas = document.createElement('canvas');
maskCanvas.width = 640;
maskCanvas.height = 360;
const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

const maskOverlayCanvas = document.createElement('canvas');
maskOverlayCanvas.width = maskCanvas.width;
maskOverlayCanvas.height = maskCanvas.height;
const maskOverlayCtx = maskOverlayCanvas.getContext('2d');

const editorCanvas = $('maskEditorCanvas');
const editorCtx = editorCanvas.getContext('2d');

const ui = {
  emptyState: $('emptyState'), meter: $('meter'), lowMeter: $('lowMeter'), midMeter: $('midMeter'), highMeter: $('highMeter'), playBtn: $('playBtn'), stopBtn: $('stopBtn'),
  timeLabel: $('timeLabel'), seek: $('seek'), exportBtn: $('exportBtn'), exportStatus: $('exportStatus'),
  videoInput: $('videoInput'), audioInput: $('audioInput'), foregroundInput: $('foregroundInput'),
  videoFit: $('videoFit'), resolution: $('resolution'), previewQuality: $('previewQuality'),

  maskEnabled: $('maskEnabled'), openMaskEditorBtn: $('openMaskEditorBtn'), maskInput: $('maskInput'),
  exportMaskBtn: $('exportMaskBtn'), clearMaskBtn: $('clearMaskBtn'), maskFeather: $('maskFeather'),
  maskExpand: $('maskExpand'), maskStatus: $('maskStatus'),

  reactiveEnabled: $('reactiveEnabled'), detectorMode: $('detectorMode'), lowHz: $('lowHz'), highHz: $('highHz'),
  threshold: $('threshold'), sensitivity: $('sensitivity'), midSensitivity: $('midSensitivity'), highSensitivity: $('highSensitivity'), attack: $('attack'), release: $('release'),

  waveEnabled: $('waveEnabled'), waveStyle: $('waveStyle'), waveMinOpacity: $('waveMinOpacity'),
  waveMaxOpacity: $('waveMaxOpacity'), waveSpeed: $('waveSpeed'), waveCount: $('waveCount'),
  waveDeform: $('waveDeform'), wavePulse: $('wavePulse'), waveScale: $('waveScale'),
  waveThickness: $('waveThickness'), waveGlow: $('waveGlow'), wavePosX: $('wavePosX'),
  wavePosY: $('wavePosY'), waveColor: $('waveColor'), waveCoreColor: $('waveCoreColor'),
  waveThreshold: $('waveThreshold'), fkuPresetBtn: $('fkuPresetBtn'),

  presetSelect: $('presetSelect'), applyPresetBtn: $('applyPresetBtn'), masterIntensity: $('masterIntensity'),
  cameraEnabled: $('cameraEnabled'), cameraBreathing: $('cameraBreathing'), kickZoom: $('kickZoom'),
  cameraShake: $('cameraShake'), parallaxEnabled: $('parallaxEnabled'), parallaxAmount: $('parallaxAmount'),
  flashEnabled: $('flashEnabled'), flashAmount: $('flashAmount'), blurEnabled: $('blurEnabled'),
  blurAmount: $('blurAmount'), rgbEnabled: $('rgbEnabled'), rgbAmount: $('rgbAmount'),
  glintsEnabled: $('glintsEnabled'), glintsAmount: $('glintsAmount'), glintsSize: $('glintsSize'),
  trailsEnabled: $('trailsEnabled'), trailsAmount: $('trailsAmount'), trailsSpeed: $('trailsSpeed'),

  foregroundScale: $('foregroundScale'), foregroundPosX: $('foregroundPosX'), foregroundPosY: $('foregroundPosY'),
  foregroundRotation: $('foregroundRotation'), foregroundOpacity: $('foregroundOpacity'),
  foregroundKickZoom: $('foregroundKickZoom'),

  saveProjectBtn: $('saveProjectBtn'), projectInput: $('projectInput'),
  installBtn: $('installBtn'), installDialog: $('installDialog'), closeInstallDialog: $('closeInstallDialog'),

  maskDialog: $('maskDialog'), closeMaskEditorBtn: $('closeMaskEditorBtn'), applyMaskBtn: $('applyMaskBtn'),
  maskDrawBtn: $('maskDrawBtn'), maskEraseBtn: $('maskEraseBtn'), brushSize: $('brushSize'),
  showMaskOverlay: $('showMaskOverlay'), maskUndoBtn: $('maskUndoBtn'), maskRedoBtn: $('maskRedoBtn'),
  maskInvertBtn: $('maskInvertBtn'), maskClearEditorBtn: $('maskClearEditorBtn')
};

const outputs = {
  maskFeather: ['maskFeatherOut', (v) => `${v} px`],
  maskExpand: ['maskExpandOut', (v) => `${v} px`],
  lowHz: ['lowHzOut', (v) => `${v} Hz`],
  highHz: ['highHzOut', (v) => `${v} Hz`],
  threshold: ['thresholdOut', (v) => `${v}%`],
  sensitivity: ['sensitivityOut', (v) => `${(v / 100).toFixed(1)}×`],
  midSensitivity: ['midSensitivityOut', (v) => `${(v / 100).toFixed(1)}×`],
  highSensitivity: ['highSensitivityOut', (v) => `${(v / 100).toFixed(1)}×`],
  attack: ['attackOut', (v) => `${v} ms`],
  release: ['releaseOut', (v) => `${v} ms`],
  waveMinOpacity: ['waveMinOpacityOut', (v) => `${v}%`],
  waveMaxOpacity: ['waveMaxOpacityOut', (v) => `${v}%`],
  waveSpeed: ['waveSpeedOut', (v) => `${(v / 100).toFixed(1)}×`],
  waveCount: ['waveCountOut', (v) => `${v}`],
  waveDeform: ['waveDeformOut', (v) => `${v}%`],
  wavePulse: ['wavePulseOut', (v) => `${v}%`],
  waveScale: ['waveScaleOut', (v) => `${v}%`],
  waveThickness: ['waveThicknessOut', (v) => `${v} px`],
  waveGlow: ['waveGlowOut', (v) => `${v} px`],
  waveThreshold: ['waveThresholdOut', (v) => `${v}%`],
  wavePosX: ['wavePosXOut', (v) => `${v}%`],
  wavePosY: ['wavePosYOut', (v) => `${v}%`],
  foregroundScale: ['foregroundScaleOut', (v) => `${v}%`],
  foregroundPosX: ['foregroundPosXOut', (v) => `${v}%`],
  foregroundPosY: ['foregroundPosYOut', (v) => `${v}%`],
  foregroundRotation: ['foregroundRotationOut', (v) => `${v}°`],
  foregroundOpacity: ['foregroundOpacityOut', (v) => `${v}%`],
  foregroundKickZoom: ['foregroundKickZoomOut', (v) => `${v}%`],
  masterIntensity: ['masterIntensityOut', (v) => `${v}%`],
  cameraBreathing: ['cameraBreathingOut', (v) => `${(v / 10).toFixed(1)}%`],
  kickZoom: ['kickZoomOut', (v) => `${(v / 10).toFixed(1)}%`],
  cameraShake: ['cameraShakeOut', (v) => `${(v / 10).toFixed(1)}%`],
  parallaxAmount: ['parallaxAmountOut', (v) => `${(v / 10).toFixed(1)}%`],
  flashAmount: ['flashAmountOut', (v) => `${v}%`],
  blurAmount: ['blurAmountOut', (v) => `${(v / 10).toFixed(1)} px`],
  rgbAmount: ['rgbAmountOut', (v) => `${v} px`],
  glintsAmount: ['glintsAmountOut', (v) => `${v}`],
  glintsSize: ['glintsSizeOut', (v) => `${v} px`],
  trailsAmount: ['trailsAmountOut', (v) => `${v}%`],
  trailsSpeed: ['trailsSpeedOut', (v) => `${(v / 100).toFixed(1)}×`],
  brushSize: ['brushSizeOut', (v) => `${v} px`]
};

let hasVideo = false;
let hasExternalAudio = false;
let foregroundImage = null;
let playing = false;
let exporting = false;
let envelope = 0;
let midEnvelope = 0;
let highEnvelope = 0;
let rawEnergy = 0;
let midEnergy = 0;
let highEnergy = 0;
let energyBaseline = 0;
let midBaseline = 0;
let highBaseline = 0;
let frameCounter = 0;
let lastFrameTime = performance.now();
let audioContext = null;
let analyser = null;
let frequencyData = null;
let recordDestination = null;
let mediaRecorder = null;
let recordedChunks = [];
let videoSource = null;
let audioSource = null;
let videoGain = null;
let audioGain = null;
let masterGain = null;
let deferredInstallPrompt = null;
let maskHasContent = false;
let maskCacheDirty = true;
let renderRequested = true;
let animationFrameId = null;
let lastRenderedAt = 0;
let maskMode = 'draw';
let isPainting = false;
let previousMaskPoint = null;
let editorPointer = null;
let undoStack = [];
let redoStack = [];
const objectUrls = [];
const glintSeeds = Array.from({ length: 64 }, (_, index) => ({
  x: ((index * 37) % 97) / 97,
  y: ((index * 53 + 17) % 89) / 89,
  phase: (index * 1.618) % (Math.PI * 2),
  size: 0.55 + ((index * 19) % 11) / 10
}));

function setStatus(message, type = '') {
  ui.exportStatus.textContent = message;
  ui.exportStatus.className = `status${type ? ` ${type}` : ''}`;
}

function updateOutputs() {
  Object.entries(outputs).forEach(([key, [id, formatter]]) => {
    const output = $(id);
    if (output && ui[key]) output.value = formatter(numeric(ui[key]));
  });
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '00:00';
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

function rememberUrl(url) {
  objectUrls.push(url);
  return url;
}

function projectDuration() {
  const videoDuration = Number.isFinite(video.duration) ? video.duration : 0;
  const audioDuration = hasExternalAudio && Number.isFinite(audio.duration) ? audio.duration : Infinity;
  return Math.max(0, Math.min(videoDuration, audioDuration));
}

function previewDimensions() {
  if (exporting) return ui.resolution.value === '1080' ? [1920, 1080] : [1280, 720];
  const mode = ui.previewQuality?.value || 'auto';
  if (mode === 'economy') return [640, 360];
  if (mode === 'high') return [1280, 720];
  const lowPower = matchMedia('(max-width: 820px)').matches
    || (navigator.deviceMemory && navigator.deviceMemory <= 4)
    || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  return lowPower ? [640, 360] : [960, 540];
}

function setCanvasResolution() {
  const dimensions = previewDimensions();
  if (canvas.width === dimensions[0] && canvas.height === dimensions[1]) return;
  canvas.width = dimensions[0];
  canvas.height = dimensions[1];
  for (const offscreen of [waveCanvas, waveSourceCanvas, waveCoreCanvas, maskedWaveCanvas, processedMaskCanvas, sourceFrameCanvas, protectedVideoCanvas]) {
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
  }
  maskCacheDirty = true;
}

function fitRect(sourceWidth, sourceHeight, targetWidth, targetHeight, fit = 'cover') {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  const contain = fit === 'contain';
  const useWidth = contain ? sourceRatio > targetRatio : sourceRatio < targetRatio;
  let width;
  let height;
  if (useWidth) {
    width = targetWidth;
    height = width / sourceRatio;
  } else {
    height = targetHeight;
    width = height * sourceRatio;
  }
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
}

function drawVideoTo(targetCtx, targetCanvas) {
  targetCtx.save();
  targetCtx.filter = 'none';
  targetCtx.globalAlpha = 1;
  targetCtx.globalCompositeOperation = 'source-over';
  targetCtx.fillStyle = '#000';
  targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
  if (hasVideo && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
    const rect = fitRect(video.videoWidth, video.videoHeight, targetCanvas.width, targetCanvas.height, ui.videoFit.value);
    targetCtx.drawImage(video, rect.x, rect.y, rect.width, rect.height);
  }
  targetCtx.restore();
}

function masterFx() {
  return numeric(ui.masterIntensity) / 100;
}

function economyMode() {
  return !exporting && ui.previewQuality.value === 'economy';
}

function prepareSourceFrame() {
  drawVideoTo(sourceFrameCtx, sourceFrameCanvas);
}

function cameraTransform(foreground = false) {
  const enabled = ui.cameraEnabled.checked;
  const time = video.currentTime || 0;
  const master = masterFx();
  const breathing = enabled ? numeric(ui.cameraBreathing) / 1000 * master : 0;
  const kickZoom = enabled ? numeric(ui.kickZoom) / 1000 * envelope * master : 0;
  const breatheWave = 0.5 + 0.5 * Math.sin(time * 0.72 - 0.45);
  const scale = 1 + breathing * breatheWave + kickZoom;
  const shake = enabled ? numeric(ui.cameraShake) / 1000 * envelope * master : 0;
  const parallax = ui.parallaxEnabled.checked ? numeric(ui.parallaxAmount) / 1000 * master : 0;
  const direction = foreground ? -0.72 : 0.45;
  const driftX = canvas.width * parallax * direction * Math.sin(time * 0.47 + 0.8);
  const driftY = canvas.height * parallax * direction * Math.cos(time * 0.39 - 0.2);
  const shakeX = canvas.width * shake * Math.sin(time * 41.0 + midEnvelope * 7.0);
  const shakeY = canvas.height * shake * 0.58 * Math.cos(time * 47.0 + envelope * 5.0);
  return { scale: foreground ? 1 + breathing * breatheWave * 0.30 + kickZoom * 0.38 : scale, x: driftX + shakeX, y: driftY + shakeY };
}

function drawSourceTransformed(targetCtx, transform, offsetX = 0, offsetY = 0) {
  const width = sourceFrameCanvas.width * transform.scale;
  const height = sourceFrameCanvas.height * transform.scale;
  const x = (targetCtx.canvas.width - width) / 2 + transform.x + offsetX;
  const y = (targetCtx.canvas.height - height) / 2 + transform.y + offsetY;
  targetCtx.drawImage(sourceFrameCanvas, x, y, width, height);
}

function drawVideoWithEffects() {
  ctx.save();
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!hasVideo || video.readyState < 2) {
    ctx.restore();
    return;
  }

  const transform = cameraTransform(false);
  const master = masterFx();
  const rgbStrength = ui.rgbEnabled.checked ? numeric(ui.rgbAmount) * midEnvelope * master : 0;
  const skipHeavy = economyMode() && frameCounter % 2 === 1;

  if (rgbStrength > 0.25 && !skipHeavy) {
    const split = rgbStrength * canvas.width / 1280;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = clamp(0.04 + midEnvelope * 0.15 * master, 0, 0.28);
    ctx.filter = 'sepia(1) saturate(8) hue-rotate(305deg) contrast(145%)';
    drawSourceTransformed(ctx, transform, split, 0);
    ctx.filter = 'sepia(1) saturate(8) hue-rotate(125deg) contrast(145%)';
    drawSourceTransformed(ctx, transform, -split, 0);
  }

  const flash = ui.flashEnabled.checked ? numeric(ui.flashAmount) / 100 * envelope * master : 0;
  const blur = ui.blurEnabled.checked && !skipHeavy ? numeric(ui.blurAmount) / 10 * envelope * master : 0;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.filter = `${blur > 0.05 ? `blur(${Math.min(10, blur)}px) ` : ''}brightness(${100 + flash * 34}%) contrast(${100 + flash * 12}%) saturate(${100 + flash * 24}%)`;
  drawSourceTransformed(ctx, transform);
  ctx.restore();
}

function drawProtectedParallaxLayer() {
  if (!ui.parallaxEnabled.checked || !ui.maskEnabled.checked || !maskHasContent) return;
  if (maskCacheDirty) rebuildProcessedMask();
  protectedVideoCtx.clearRect(0, 0, protectedVideoCanvas.width, protectedVideoCanvas.height);
  protectedVideoCtx.save();
  protectedVideoCtx.globalCompositeOperation = 'source-over';
  protectedVideoCtx.filter = 'none';
  drawSourceTransformed(protectedVideoCtx, cameraTransform(true));
  protectedVideoCtx.globalCompositeOperation = 'destination-in';
  protectedVideoCtx.drawImage(processedMaskCanvas, 0, 0);
  protectedVideoCtx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(protectedVideoCanvas, 0, 0);
  ctx.restore();
}

async function ensureAudioGraph() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio não está disponível neste navegador.');
    audioContext = new AudioContextClass();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.25;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    recordDestination = audioContext.createMediaStreamDestination();

    videoSource = audioContext.createMediaElementSource(video);
    audioSource = audioContext.createMediaElementSource(audio);
    videoGain = audioContext.createGain();
    audioGain = audioContext.createGain();
    masterGain = audioContext.createGain();

    videoSource.connect(videoGain);
    audioSource.connect(audioGain);
    videoGain.connect(masterGain);
    audioGain.connect(masterGain);
    masterGain.connect(analyser);
    masterGain.connect(audioContext.destination);
    masterGain.connect(recordDestination);
  }

  videoGain.gain.value = hasExternalAudio ? 0 : 1;
  audioGain.gain.value = hasExternalAudio ? 1 : 0;
  if (audioContext.state === 'suspended') await audioContext.resume();
}

function averageBand(fromHz, toHz, tilt = 0) {
  if (!analyser || !frequencyData || !audioContext) return 0;
  const binHz = audioContext.sampleRate / analyser.fftSize;
  const lowBin = Math.max(0, Math.floor(fromHz / binHz));
  const highBin = Math.min(frequencyData.length - 1, Math.ceil(toHz / binHz));
  let energy = 0;
  let totalWeight = 0;
  for (let index = lowBin; index <= highBin; index += 1) {
    const normalized = (index - lowBin) / Math.max(1, highBin - lowBin);
    const weight = 1 + tilt * (0.5 - normalized);
    energy += (frequencyData[index] / 255) * weight;
    totalWeight += weight;
  }
  return totalWeight ? energy / totalWeight : 0;
}

function smoothEnvelope(current, target, deltaSeconds, attackSeconds, releaseSeconds) {
  const timeConstant = target > current ? attackSeconds : releaseSeconds;
  const alpha = 1 - Math.exp(-deltaSeconds / Math.max(0.001, timeConstant));
  return clamp(current + (target - current) * alpha, 0, 1);
}

function computeKick(deltaSeconds) {
  if (!analyser || !frequencyData || !playing) {
    rawEnergy = 0;
    midEnergy = 0;
    highEnergy = 0;
  } else {
    analyser.getByteFrequencyData(frequencyData);
    rawEnergy = averageBand(numeric(ui.lowHz), numeric(ui.highHz), 0.75);
    midEnergy = averageBand(150, 2600, 0.12);
    highEnergy = averageBand(4200, Math.min(14500, audioContext.sampleRate * 0.46), -0.08);
  }

  const lowBaselineAlpha = 1 - Math.exp(-deltaSeconds / 0.68);
  const midBaselineAlpha = 1 - Math.exp(-deltaSeconds / 0.90);
  const highBaselineAlpha = 1 - Math.exp(-deltaSeconds / 0.55);
  energyBaseline += (rawEnergy - energyBaseline) * lowBaselineAlpha;
  midBaseline += (midEnergy - midBaseline) * midBaselineAlpha;
  highBaseline += (highEnergy - highBaseline) * highBaselineAlpha;

  let lowDetector = rawEnergy;
  if (ui.detectorMode.value === 'transient') {
    const transient = Math.max(0, rawEnergy - energyBaseline * 0.90);
    lowDetector = clamp(transient * 5.6 + rawEnergy * 0.20, 0, 1);
  }

  const threshold = numeric(ui.threshold) / 100;
  const lowSensitivity = numeric(ui.sensitivity) / 100;
  const midSensitivity = numeric(ui.midSensitivity) / 100;
  const highSensitivity = numeric(ui.highSensitivity) / 100;
  const lowTarget = lowDetector <= threshold ? 0 : clamp(((lowDetector - threshold) / Math.max(0.001, 1 - threshold)) * lowSensitivity, 0, 1);
  const midTransient = Math.max(0, midEnergy - midBaseline * 0.86);
  const highTransient = Math.max(0, highEnergy - highBaseline * 0.82);
  const midTarget = clamp((midTransient * 3.2 + midEnergy * 0.36) * midSensitivity, 0, 1);
  const highTarget = clamp((highTransient * 3.8 + highEnergy * 0.22) * highSensitivity, 0, 1);

  envelope = smoothEnvelope(envelope, lowTarget, deltaSeconds, numeric(ui.attack) / 1000, numeric(ui.release) / 1000);
  midEnvelope = smoothEnvelope(midEnvelope, midTarget, deltaSeconds, 0.026, 0.20);
  highEnvelope = smoothEnvelope(highEnvelope, highTarget, deltaSeconds, 0.009, 0.105);

  if (!ui.reactiveEnabled.checked) {
    envelope = 1;
    midEnvelope = 1;
    highEnvelope = 1;
  }
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
  const parsed = Number.parseInt(clean, 16);
  return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 };
}

function contourPath(targetCtx, index, count, time, pulseScale) {
  const centerX = waveCanvas.width * numeric(ui.wavePosX) / 100;
  const centerY = waveCanvas.height * numeric(ui.wavePosY) / 100;
  const globalScale = numeric(ui.waveScale) / 100;
  const deform = numeric(ui.waveDeform) / 100;
  const lineOffset = index - (count - 1) / 2;
  const spacing = 1 + lineOffset * 0.105;
  const radiusX = waveCanvas.width * 0.34 * globalScale * pulseScale * spacing;
  const radiusY = waveCanvas.height * 0.27 * globalScale * pulseScale * spacing;
  const rotation = time * 0.060 + lineOffset * 0.012;
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);
  const points = waveCanvas.width >= 1800 ? 144 : 112;

  targetCtx.beginPath();
  for (let point = 0; point <= points; point += 1) {
    const theta = (point / points) * Math.PI * 2;
    const ripple = 1
      + deform * 0.088 * Math.sin(theta * 3 + time * 1.22 + index * 0.55)
      + deform * 0.054 * Math.sin(theta * 7 - time * 1.72 + index * 0.82)
      + deform * 0.028 * Math.sin(theta * 11 + time * 0.78 - index * 0.31);
    const driftX = waveCanvas.width * deform * 0.014 * Math.sin(theta * 2 + time * 1.02 + index * 0.27);
    const driftY = waveCanvas.height * deform * 0.020 * Math.sin(theta * 3 - time * 1.16 + index * 0.34);
    const localX = radiusX * ripple * Math.cos(theta) + driftX;
    const localY = radiusY * ripple * Math.sin(theta) + driftY;
    const x = centerX + localX * cosRotation - localY * sinRotation;
    const y = centerY + localX * sinRotation + localY * cosRotation;
    if (point === 0) targetCtx.moveTo(x, y);
    else targetCtx.lineTo(x, y);
  }
  targetCtx.closePath();
}

function horizontalPath(targetCtx, index, count, time, pulseScale) {
  const centerY = waveCanvas.height * numeric(ui.wavePosY) / 100;
  const deform = numeric(ui.waveDeform) / 100;
  const scale = numeric(ui.waveScale) / 100;
  const spacing = waveCanvas.height * 0.055 * scale;
  const lineOffset = index - (count - 1) / 2;
  const baseY = centerY + lineOffset * spacing;
  const amplitude = waveCanvas.height * (0.08 + deform * 0.10) * pulseScale;
  const points = waveCanvas.width >= 1800 ? 170 : 130;

  targetCtx.beginPath();
  for (let point = 0; point <= points; point += 1) {
    const normalized = point / points;
    const x = normalized * waveCanvas.width;
    const envelopeShape = Math.sin(normalized * Math.PI);
    const y = baseY
      + amplitude * envelopeShape * Math.sin(normalized * Math.PI * 3.1 + time * 1.8 + index * 0.47)
      + amplitude * deform * 0.38 * Math.sin(normalized * Math.PI * 7.4 - time * 1.13 + index * 0.81);
    if (point === 0) targetCtx.moveTo(x, y);
    else targetCtx.lineTo(x, y);
  }
}

function tintCanvas(sourceCtx, targetCtx, color) {
  targetCtx.save();
  targetCtx.globalCompositeOperation = 'multiply';
  targetCtx.fillStyle = color;
  targetCtx.fillRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
  targetCtx.restore();
}

function drawVideoWaveLayer(opacity, pulseScale) {
  if (waveVideo.readyState < 2 || !waveVideo.videoWidth) return false;

  const sourceWidth = waveSourceCanvas.width;
  const sourceHeight = waveSourceCanvas.height;
  const scale = numeric(ui.waveScale) / 100 * pulseScale;
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = sourceWidth * numeric(ui.wavePosX) / 100 - width / 2;
  const y = sourceHeight * numeric(ui.wavePosY) / 100 - height / 2;
  const threshold = numeric(ui.waveThreshold) / 100;
  const contrast = 100 + threshold * 410;
  const brightness = 100 + threshold * 80;

  waveSourceCtx.save();
  waveSourceCtx.fillStyle = '#000';
  waveSourceCtx.fillRect(0, 0, sourceWidth, sourceHeight);
  waveSourceCtx.filter = `contrast(${contrast}%) brightness(${brightness}%)`;
  waveSourceCtx.drawImage(waveVideo, x, y, width, height);
  waveSourceCtx.filter = 'none';
  tintCanvas(waveSourceCtx, waveSourceCtx, ui.waveColor.value);
  waveSourceCtx.restore();

  waveCoreCtx.save();
  waveCoreCtx.fillStyle = '#000';
  waveCoreCtx.fillRect(0, 0, sourceWidth, sourceHeight);
  waveCoreCtx.filter = `contrast(${Math.min(420, contrast + 105)}%) brightness(${Math.min(245, brightness + 45)}%)`;
  waveCoreCtx.drawImage(waveVideo, x, y, width, height);
  waveCoreCtx.filter = 'none';
  tintCanvas(waveCoreCtx, waveCoreCtx, ui.waveCoreColor.value);
  waveCoreCtx.restore();

  const glow = numeric(ui.waveGlow) * (waveCanvas.width / 1280) * (0.35 + envelope * 0.65);
  waveCtx.save();
  waveCtx.globalCompositeOperation = 'screen';
  waveCtx.globalAlpha = opacity * 0.86;
  if (glow > 0.5) {
    waveCtx.filter = `blur(${Math.min(42, glow)}px)`;
    waveCtx.drawImage(waveSourceCanvas, 0, 0);
  }
  waveCtx.filter = 'none';
  waveCtx.globalAlpha = opacity;
  waveCtx.drawImage(waveSourceCanvas, 0, 0);
  waveCtx.globalAlpha = opacity * 0.72;
  waveCtx.drawImage(waveCoreCanvas, 0, 0);
  waveCtx.restore();
  return true;
}

function drawGeneratedWaveLayer(opacity, pulseScale) {
  const speed = numeric(ui.waveSpeed) / 100;
  const time = video.currentTime * speed;
  const count = Math.round(numeric(ui.waveCount));
  const outputScale = waveCanvas.width / 1280;
  const thickness = numeric(ui.waveThickness) * outputScale;
  const glow = numeric(ui.waveGlow) * outputScale * (0.34 + envelope * 0.66);
  const color = hexToRgb(ui.waveColor.value);

  waveCtx.save();
  waveCtx.lineJoin = 'round';
  waveCtx.lineCap = 'round';
  waveCtx.globalCompositeOperation = 'source-over';

  for (let index = 0; index < count; index += 1) {
    const depth = count <= 1 ? 1 : index / (count - 1);
    const centrality = 1 - Math.abs(depth - 0.5) * 1.35;
    const lineOpacity = opacity * clamp(0.58 + centrality * 0.42, 0.35, 1);

    if (ui.waveStyle.value === 'horizontal') horizontalPath(waveCtx, index, count, time, pulseScale);
    else contourPath(waveCtx, index, count, time, pulseScale);

    waveCtx.globalAlpha = lineOpacity * 0.55;
    waveCtx.strokeStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
    waveCtx.lineWidth = thickness * 3.2;
    waveCtx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, 1)`;
    waveCtx.shadowBlur = glow;
    waveCtx.stroke();

    if (ui.waveStyle.value === 'horizontal') horizontalPath(waveCtx, index, count, time, pulseScale);
    else contourPath(waveCtx, index, count, time, pulseScale);

    waveCtx.globalAlpha = lineOpacity;
    waveCtx.strokeStyle = ui.waveCoreColor.value;
    waveCtx.lineWidth = Math.max(1, thickness * 0.78);
    waveCtx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, 1)`;
    waveCtx.shadowBlur = glow * 0.48;
    waveCtx.stroke();
  }
  waveCtx.restore();
}


function drawEnergyTrails() {
  if (!ui.trailsEnabled.checked) return;
  const master = masterFx();
  const strength = numeric(ui.trailsAmount) / 100 * midEnvelope * master;
  if (strength <= 0.015) return;
  const time = video.currentTime * numeric(ui.trailsSpeed) / 100;
  const color = hexToRgb(ui.waveColor.value);
  const lineCount = economyMode() ? 3 : 6;
  const w = waveCanvas.width;
  const h = waveCanvas.height;
  waveCtx.save();
  waveCtx.globalCompositeOperation = 'screen';
  waveCtx.lineCap = 'round';
  for (let index = 0; index < lineCount; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const phase = time * (0.72 + index * 0.045) + index * 1.37;
    const startX = side < 0 ? -w * 0.08 : w * 1.08;
    const endX = w * (0.36 + 0.30 * (0.5 + 0.5 * Math.sin(phase * 0.37 + index)));
    const y = h * (0.16 + ((index * 0.139 + 0.11) % 0.68));
    const bend = h * (0.05 + 0.10 * Math.sin(phase + index));
    waveCtx.beginPath();
    waveCtx.moveTo(startX, y + bend);
    waveCtx.bezierCurveTo(
      side < 0 ? w * 0.10 : w * 0.90,
      y - bend,
      side < 0 ? w * 0.28 : w * 0.72,
      y + bend * 0.7,
      endX,
      y - bend * 0.35
    );
    waveCtx.globalAlpha = strength * (0.20 + 0.12 * Math.sin(phase * 1.9 + index));
    waveCtx.strokeStyle = `rgb(${color.r},${color.g},${color.b})`;
    waveCtx.lineWidth = Math.max(1, waveCanvas.width / 1280 * (1.2 + index % 3));
    waveCtx.shadowColor = `rgb(${color.r},${color.g},${color.b})`;
    waveCtx.shadowBlur = waveCanvas.width / 1280 * (10 + 14 * strength);
    waveCtx.stroke();
  }
  waveCtx.restore();
}

function drawGlints() {
  if (!ui.glintsEnabled.checked) return;
  const master = masterFx();
  const intensity = highEnvelope * master;
  if (intensity <= 0.02) return;
  const amount = Math.min(glintSeeds.length, Math.round(numeric(ui.glintsAmount) * (economyMode() ? 0.55 : 1)));
  const baseSize = numeric(ui.glintsSize) * waveCanvas.width / 1280;
  const time = video.currentTime || 0;
  const color = hexToRgb(ui.waveCoreColor.value);
  waveCtx.save();
  waveCtx.globalCompositeOperation = 'screen';
  waveCtx.lineCap = 'round';
  for (let index = 0; index < amount; index += 1) {
    const seed = glintSeeds[index];
    const twinkle = Math.max(0, Math.sin(time * (4.2 + (index % 5) * 0.37) + seed.phase));
    const alpha = intensity * twinkle * (0.32 + 0.68 * highEnvelope);
    if (alpha < 0.06) continue;
    const x = seed.x * waveCanvas.width;
    const y = seed.y * waveCanvas.height;
    const size = baseSize * seed.size * (0.45 + alpha);
    waveCtx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${clamp(alpha,0,1)})`;
    waveCtx.shadowColor = ui.waveColor.value;
    waveCtx.shadowBlur = size * 0.85;
    waveCtx.lineWidth = Math.max(1, size * 0.11);
    waveCtx.beginPath();
    waveCtx.moveTo(x - size, y);
    waveCtx.lineTo(x + size, y);
    waveCtx.moveTo(x, y - size);
    waveCtx.lineTo(x, y + size);
    waveCtx.stroke();
  }
  waveCtx.restore();
}

function drawWaveLayer() {
  waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
  if (!ui.waveEnabled.checked) return;

  const minimumOpacity = numeric(ui.waveMinOpacity) / 100;
  const maximumOpacity = numeric(ui.waveMaxOpacity) / 100;
  const opacity = clamp((minimumOpacity + (maximumOpacity - minimumOpacity) * envelope) * masterFx(), 0, 1);
  const pulseScale = 1 + numeric(ui.wavePulse) / 100 * envelope * masterFx();
  if (opacity > 0.001) {
    const usedVideo = ui.waveStyle.value === 'video' && drawVideoWaveLayer(opacity, pulseScale);
    if (!usedVideo) drawGeneratedWaveLayer(opacity, pulseScale);
  }
  drawEnergyTrails();
  drawGlints();
}
function rebuildProcessedMask() {
  processedMaskCtx.clearRect(0, 0, processedMaskCanvas.width, processedMaskCanvas.height);
  if (!ui.maskEnabled.checked || !maskHasContent) {
    maskCacheDirty = false;
    return;
  }

  const scale = processedMaskCanvas.width / 1280;
  const feather = numeric(ui.maskFeather) * scale;
  const expand = numeric(ui.maskExpand) * scale;
  const offsets = expand > 0
    ? [[0, 0], [expand, 0], [-expand, 0], [0, expand], [0, -expand],
      [expand * 0.72, expand * 0.72], [-expand * 0.72, expand * 0.72],
      [expand * 0.72, -expand * 0.72], [-expand * 0.72, -expand * 0.72]]
    : [[0, 0]];

  processedMaskCtx.save();
  processedMaskCtx.filter = feather > 0 ? `blur(${Math.min(30, feather)}px)` : 'none';
  for (const [offsetX, offsetY] of offsets) {
    processedMaskCtx.drawImage(maskCanvas, offsetX, offsetY, processedMaskCanvas.width, processedMaskCanvas.height);
  }
  processedMaskCtx.restore();
  maskCacheDirty = false;
}

function applyMaskToWave() {
  maskedWaveCtx.clearRect(0, 0, maskedWaveCanvas.width, maskedWaveCanvas.height);
  maskedWaveCtx.globalCompositeOperation = 'source-over';
  maskedWaveCtx.filter = 'none';
  maskedWaveCtx.drawImage(waveCanvas, 0, 0);

  if (!ui.maskEnabled.checked || !maskHasContent) return;
  if (maskCacheDirty) rebuildProcessedMask();

  maskedWaveCtx.save();
  maskedWaveCtx.globalCompositeOperation = 'destination-out';
  maskedWaveCtx.drawImage(processedMaskCanvas, 0, 0);
  maskedWaveCtx.restore();
}
function drawForeground() {
  if (!foregroundImage) return;
  const baseScale = numeric(ui.foregroundScale) / 100;
  const kickZoom = numeric(ui.foregroundKickZoom) / 100;
  const scale = baseScale * (1 + kickZoom * envelope);
  const x = canvas.width * numeric(ui.foregroundPosX) / 100;
  const y = canvas.height * numeric(ui.foregroundPosY) / 100;
  const rotation = numeric(ui.foregroundRotation) * Math.PI / 180;
  const opacity = numeric(ui.foregroundOpacity) / 100;
  const imageRatio = foregroundImage.naturalWidth / foregroundImage.naturalHeight;
  const canvasRatio = canvas.width / canvas.height;
  let width;
  let height;

  if (imageRatio > canvasRatio) {
    width = canvas.width * scale;
    height = width / imageRatio;
  } else {
    height = canvas.height * scale;
    width = height * imageRatio;
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(foregroundImage, -width / 2, -height / 2, width, height);
  ctx.restore();
}

function syncWaveVideo() {
  if (ui.waveStyle.value !== 'video' || !Number.isFinite(waveVideo.duration) || waveVideo.duration <= 0) return;
  const speed = numeric(ui.waveSpeed) / 100;
  waveVideo.playbackRate = clamp(speed, 0.25, 2.5);
  const target = (video.currentTime * speed) % waveVideo.duration;
  const distance = Math.abs(waveVideo.currentTime - target);
  const wrappedDistance = Math.min(distance, waveVideo.duration - distance);
  if (!playing || wrappedDistance > 0.22) waveVideo.currentTime = target;
}


function drawImpactOverlay() {
  if (!ui.flashEnabled.checked) return;
  const master = masterFx();
  const amount = numeric(ui.flashAmount) / 100 * master;
  const flash = clamp(envelope * 0.72 + highEnvelope * 0.34, 0, 1) * amount;
  if (flash <= 0.006) return;
  const color = hexToRgb(ui.waveCoreColor.value);
  const gradient = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.48, 0, canvas.width * 0.5, canvas.height * 0.48, Math.max(canvas.width, canvas.height) * 0.72);
  gradient.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${flash * 0.24})`);
  gradient.addColorStop(0.52, `rgba(${color.r},${color.g},${color.b},${flash * 0.09})`);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function renderFrame(now = performance.now()) {
  const deltaSeconds = clamp((now - lastFrameTime) / 1000, 0.001, 0.12);
  lastFrameTime = now;
  frameCounter += 1;
  setCanvasResolution();
  computeKick(deltaSeconds);
  syncWaveVideo();

  prepareSourceFrame();
  drawVideoWithEffects();
  drawWaveLayer();
  applyMaskToWave();

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(maskedWaveCanvas, 0, 0);
  ctx.restore();
  drawProtectedParallaxLayer();
  drawForeground();
  drawImpactOverlay();

  ui.meter.style.width = `${Math.round(envelope * 100)}%`;
  if (ui.lowMeter) ui.lowMeter.style.width = `${Math.round(envelope * 100)}%`;
  if (ui.midMeter) ui.midMeter.style.width = `${Math.round(midEnvelope * 100)}%`;
  if (ui.highMeter) ui.highMeter.style.width = `${Math.round(highEnvelope * 100)}%`;
  const duration = projectDuration();
  ui.timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
  if (duration > 0 && !ui.seek.matches(':active')) {
    ui.seek.value = Math.round(video.currentTime / duration * 1000);
  }

  if (playing && duration > 0 && video.currentTime >= duration - 0.03) {
    if (exporting && mediaRecorder?.state === 'recording') mediaRecorder.stop();
    stopPlayback();
  }

  if (playing && hasExternalAudio && Math.abs(audio.currentTime - video.currentTime) > 0.12) {
    audio.currentTime = video.currentTime;
  }
}

function renderLoop(now) {
  animationFrameId = null;
  const continuous = playing || exporting;
  const minimumFrameTime = exporting ? 31 : 33;
  if (continuous && now - lastRenderedAt < minimumFrameTime) {
    animationFrameId = requestAnimationFrame(renderLoop);
    return;
  }
  if (!continuous && !renderRequested) return;
  renderRequested = false;
  lastRenderedAt = now;
  renderFrame(now);
  if (continuous || renderRequested) animationFrameId = requestAnimationFrame(renderLoop);
}

function requestRender() {
  renderRequested = true;
  if (!animationFrameId) animationFrameId = requestAnimationFrame(renderLoop);
}
function enableProjectControls() {
  ui.emptyState.classList.toggle('hidden', hasVideo);
  ui.playBtn.disabled = !hasVideo;
  ui.stopBtn.disabled = !hasVideo;
  ui.seek.disabled = !hasVideo;
  ui.exportBtn.disabled = !hasVideo;
  ui.openMaskEditorBtn.disabled = !hasVideo;
  setStatus(hasVideo ? 'Vídeo pronto. Crie a máscara para colocar a onda atrás dos elementos.' : 'Adicione o vídeo para começar.', hasVideo ? 'ok' : '');
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
  updateAudioGains();
  requestRender();
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
  updateAudioGains();
  setStatus('Música separada carregada e sincronizada.', 'ok');
  requestRender();
}

async function loadForeground(file) {
  const image = new Image();
  image.decoding = 'async';
  image.src = rememberUrl(URL.createObjectURL(file));
  await image.decode();
  foregroundImage = image;
  setStatus('PNG adicional carregado acima da onda.', 'ok');
  requestRender();
}

function updateAudioGains() {
  if (!videoGain || !audioGain) return;
  videoGain.gain.value = hasExternalAudio ? 0 : 1;
  audioGain.gain.value = hasExternalAudio ? 1 : 0;
}

async function playProject() {
  if (!hasVideo) return;
  await ensureAudioGraph();
  updateAudioGains();
  const duration = projectDuration();
  if (duration > 0 && video.currentTime >= duration - 0.05) {
    video.currentTime = 0;
    if (hasExternalAudio) audio.currentTime = 0;
  }
  syncWaveVideo();
  const wavePromise = ui.waveStyle.value === 'video' ? waveVideo.play().catch(() => undefined) : Promise.resolve();
  if (hasExternalAudio) {
    audio.currentTime = video.currentTime;
    await Promise.all([video.play(), audio.play(), wavePromise]);
  } else {
    await Promise.all([video.play(), wavePromise]);
  }
  playing = true;
  ui.playBtn.textContent = 'Ⅱ Pausar';
  requestRender();
}

function pauseProject() {
  video.pause();
  audio.pause();
  waveVideo.pause();
  playing = false;
  ui.playBtn.textContent = '▶ Reproduzir';
  requestRender();
}

function stopPlayback() {
  pauseProject();
  video.currentTime = 0;
  if (hasExternalAudio) audio.currentTime = 0;
  envelope = 0;
  midEnvelope = 0;
  highEnvelope = 0;
  if (Number.isFinite(waveVideo.duration)) waveVideo.currentTime = 0;
  requestRender();
}

// ---------- Mask editor ----------
function detectMaskContent() {
  const pixels = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 5) return true;
  }
  return false;
}

function updateMaskStatus() {
  maskHasContent = detectMaskContent();
  maskCacheDirty = true;
  ui.exportMaskBtn.disabled = !maskHasContent;
  ui.clearMaskBtn.disabled = !maskHasContent;
  if (maskHasContent) {
    ui.maskStatus.textContent = 'Máscara ativa: a onda será removida do personagem e do texto.';
    ui.maskStatus.className = 'status ok';
  } else {
    ui.maskStatus.textContent = 'Nenhuma máscara criada. A onda ficará na frente de tudo.';
    ui.maskStatus.className = 'status';
  }
  requestRender();
}

function currentMaskSnapshot() {
  return maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
}

function restoreMaskSnapshot(snapshot) {
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  maskCtx.putImageData(snapshot, 0, 0);
  updateMaskStatus();
  renderMaskEditor();
}

function saveMaskUndoPoint() {
  undoStack.push(currentMaskSnapshot());
  if (undoStack.length > 12) undoStack.shift();
  redoStack = [];
}

function undoMask() {
  if (!undoStack.length) return;
  redoStack.push(currentMaskSnapshot());
  restoreMaskSnapshot(undoStack.pop());
}

function redoMask() {
  if (!redoStack.length) return;
  undoStack.push(currentMaskSnapshot());
  restoreMaskSnapshot(redoStack.pop());
}

function refreshMaskOverlay() {
  maskOverlayCtx.clearRect(0, 0, maskOverlayCanvas.width, maskOverlayCanvas.height);
  maskOverlayCtx.fillStyle = '#ff235d';
  maskOverlayCtx.fillRect(0, 0, maskOverlayCanvas.width, maskOverlayCanvas.height);
  maskOverlayCtx.globalCompositeOperation = 'destination-in';
  maskOverlayCtx.drawImage(maskCanvas, 0, 0);
  maskOverlayCtx.globalCompositeOperation = 'source-over';
}

function renderMaskEditor() {
  drawVideoTo(editorCtx, editorCanvas);
  if (ui.showMaskOverlay.checked) {
    refreshMaskOverlay();
    editorCtx.save();
    editorCtx.globalAlpha = 0.52;
    editorCtx.drawImage(maskOverlayCanvas, 0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.restore();
  }
  if (editorPointer) {
    editorCtx.save();
    editorCtx.strokeStyle = maskMode === 'draw' ? '#ffffff' : '#ff5b86';
    editorCtx.lineWidth = 2;
    const radius = numeric(ui.brushSize) / 2;
    editorCtx.beginPath();
    editorCtx.arc(editorPointer.x, editorPointer.y, radius, 0, Math.PI * 2);
    editorCtx.stroke();
    editorCtx.restore();
  }
}

function editorPointFromEvent(event) {
  const rect = editorCanvas.getBoundingClientRect();
  const editorX = (event.clientX - rect.left) / rect.width * editorCanvas.width;
  const editorY = (event.clientY - rect.top) / rect.height * editorCanvas.height;
  return {
    editorX,
    editorY,
    maskX: editorX / editorCanvas.width * maskCanvas.width,
    maskY: editorY / editorCanvas.height * maskCanvas.height
  };
}

function paintMaskSegment(fromPoint, toPoint) {
  const scale = maskCanvas.width / editorCanvas.width;
  const lineWidth = numeric(ui.brushSize) * scale;
  maskCtx.save();
  maskCtx.globalCompositeOperation = maskMode === 'draw' ? 'source-over' : 'destination-out';
  maskCtx.strokeStyle = '#ffffff';
  maskCtx.fillStyle = '#ffffff';
  maskCtx.lineWidth = lineWidth;
  maskCtx.lineCap = 'round';
  maskCtx.lineJoin = 'round';
  maskCtx.beginPath();
  maskCtx.moveTo(fromPoint.maskX, fromPoint.maskY);
  maskCtx.lineTo(toPoint.maskX, toPoint.maskY);
  maskCtx.stroke();
  maskCtx.beginPath();
  maskCtx.arc(toPoint.maskX, toPoint.maskY, lineWidth / 2, 0, Math.PI * 2);
  maskCtx.fill();
  maskCtx.restore();
}

function setMaskMode(mode) {
  maskMode = mode;
  ui.maskDrawBtn.classList.toggle('active', mode === 'draw');
  ui.maskEraseBtn.classList.toggle('active', mode === 'erase');
}

function clearMask(saveUndo = true) {
  if (saveUndo) saveMaskUndoPoint();
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  updateMaskStatus();
  renderMaskEditor();
}

function invertMask() {
  saveMaskUndoPoint();
  const image = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  for (let index = 0; index < image.data.length; index += 4) {
    const alpha = 255 - image.data[index + 3];
    image.data[index] = 255;
    image.data[index + 1] = 255;
    image.data[index + 2] = 255;
    image.data[index + 3] = alpha;
  }
  maskCtx.putImageData(image, 0, 0);
  updateMaskStatus();
  renderMaskEditor();
}

async function loadMaskFile(file) {
  const image = new Image();
  image.decoding = 'async';
  const url = rememberUrl(URL.createObjectURL(file));
  image.src = url;
  await image.decode();
  saveMaskUndoPoint();
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  maskCtx.drawImage(image, 0, 0, maskCanvas.width, maskCanvas.height);
  updateMaskStatus();
  setStatus('Máscara PNG importada.', 'ok');
}

function exportMask() {
  maskCanvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, 'Kazu-Beat-FX-Mascara.png');
  }, 'image/png');
}

function openMaskEditor() {
  if (!hasVideo) return;
  pauseProject();
  undoStack = [];
  redoStack = [];
  editorPointer = null;
  renderMaskEditor();
  ui.maskDialog.showModal();
}

editorCanvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  editorCanvas.setPointerCapture(event.pointerId);
  saveMaskUndoPoint();
  isPainting = true;
  const point = editorPointFromEvent(event);
  previousMaskPoint = point;
  editorPointer = { x: point.editorX, y: point.editorY };
  paintMaskSegment(point, point);
  renderMaskEditor();
});

editorCanvas.addEventListener('pointermove', (event) => {
  const point = editorPointFromEvent(event);
  editorPointer = { x: point.editorX, y: point.editorY };
  if (isPainting && previousMaskPoint) {
    paintMaskSegment(previousMaskPoint, point);
    previousMaskPoint = point;
  }
  renderMaskEditor();
});

function endMaskStroke(event) {
  if (event?.pointerId !== undefined && editorCanvas.hasPointerCapture(event.pointerId)) {
    editorCanvas.releasePointerCapture(event.pointerId);
  }
  isPainting = false;
  previousMaskPoint = null;
  updateMaskStatus();
  renderMaskEditor();
}

editorCanvas.addEventListener('pointerup', endMaskStroke);
editorCanvas.addEventListener('pointercancel', endMaskStroke);
editorCanvas.addEventListener('pointerleave', () => {
  if (!isPainting) {
    editorPointer = null;
    renderMaskEditor();
  }
});

// ---------- Project JSON ----------
function settingKeys() {
  return [
    'videoFit', 'resolution', 'previewQuality', 'maskEnabled', 'maskFeather', 'maskExpand',
    'reactiveEnabled', 'detectorMode', 'lowHz', 'highHz', 'threshold', 'sensitivity', 'midSensitivity',
    'highSensitivity', 'attack', 'release', 'masterIntensity',
    'waveEnabled', 'waveStyle', 'waveMinOpacity', 'waveMaxOpacity', 'waveSpeed', 'waveCount',
    'waveDeform', 'wavePulse', 'waveScale', 'waveThickness', 'waveGlow', 'waveThreshold', 'wavePosX', 'wavePosY',
    'waveColor', 'waveCoreColor',
    'cameraEnabled', 'cameraBreathing', 'kickZoom', 'cameraShake', 'parallaxEnabled', 'parallaxAmount',
    'flashEnabled', 'flashAmount', 'blurEnabled', 'blurAmount', 'rgbEnabled', 'rgbAmount',
    'glintsEnabled', 'glintsAmount', 'glintsSize', 'trailsEnabled', 'trailsAmount', 'trailsSpeed',
    'foregroundScale', 'foregroundPosX', 'foregroundPosY', 'foregroundRotation', 'foregroundOpacity',
    'foregroundKickZoom'
  ];
}

function collectSettings() {
  const settings = {};
  settingKeys().forEach((key) => {
    settings[key] = ui[key].type === 'checkbox' ? ui[key].checked : ui[key].value;
  });
  return settings;
}

function collectProject() {
  return {
    app: 'Kazu Beat FX',
    version: '4.0',
    createdAt: new Date().toISOString(),
    note: 'Os arquivos de vídeo e áudio não ficam dentro do JSON; selecione-os novamente.',
    settings: collectSettings(),
    maskDataUrl: maskHasContent ? maskCanvas.toDataURL('image/png') : null
  };
}

function applySettings(settings) {
  if (!settings) throw new Error('Projeto sem configurações.');
  Object.entries(settings).forEach(([key, settingValue]) => {
    if (!ui[key]) return;
    if (ui[key].type === 'checkbox') ui[key].checked = Boolean(settingValue);
    else ui[key].value = String(settingValue);
  });
  updateOutputs();
  saveLocalSettings();
  maskCacheDirty = true;
  requestRender();
}

async function restoreMaskFromDataUrl(dataUrl) {
  if (!dataUrl) {
    clearMask(false);
    return;
  }
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  maskCtx.drawImage(image, 0, 0, maskCanvas.width, maskCanvas.height);
  updateMaskStatus();
}

const PRESETS = {
  favela: {
    videoFit: 'cover', maskEnabled: true, maskFeather: 8, maskExpand: 5,
    reactiveEnabled: true, detectorMode: 'transient', lowHz: 45, highHz: 105, threshold: 18,
    sensitivity: 320, midSensitivity: 150, highSensitivity: 190, attack: 12, release: 145,
    masterIntensity: 100, waveEnabled: true, waveStyle: 'video', waveMinOpacity: 0, waveMaxOpacity: 100,
    waveSpeed: 100, waveCount: 7, waveDeform: 46, wavePulse: 12, waveScale: 112,
    waveThickness: 4, waveGlow: 38, waveThreshold: 14, wavePosX: 50, wavePosY: 50,
    waveColor: '#12cfff', waveCoreColor: '#ffffff',
    cameraEnabled: true, cameraBreathing: 20, kickZoom: 50, cameraShake: 12,
    parallaxEnabled: true, parallaxAmount: 10,
    flashEnabled: true, flashAmount: 28, blurEnabled: true, blurAmount: 40,
    rgbEnabled: true, rgbAmount: 8, glintsEnabled: true, glintsAmount: 18, glintsSize: 18,
    trailsEnabled: true, trailsAmount: 65, trailsSpeed: 110
  },
  impact: {
    detectorMode: 'transient', lowHz: 38, highHz: 115, threshold: 16, sensitivity: 380,
    midSensitivity: 185, highSensitivity: 220, attack: 7, release: 115, masterIntensity: 120,
    waveStyle: 'video', waveMinOpacity: 0, waveMaxOpacity: 100, waveSpeed: 125, wavePulse: 18,
    waveScale: 116, waveGlow: 48, waveThreshold: 16, waveColor: '#a22cff', waveCoreColor: '#ffffff',
    cameraEnabled: true, cameraBreathing: 15, kickZoom: 82, cameraShake: 24,
    parallaxEnabled: true, parallaxAmount: 14, flashEnabled: true, flashAmount: 46,
    blurEnabled: true, blurAmount: 68, rgbEnabled: true, rgbAmount: 16,
    glintsEnabled: true, glintsAmount: 26, glintsSize: 22, trailsEnabled: true,
    trailsAmount: 88, trailsSpeed: 145
  },
  dream: {
    detectorMode: 'energy', lowHz: 35, highHz: 125, threshold: 12, sensitivity: 220,
    midSensitivity: 115, highSensitivity: 130, attack: 28, release: 280, masterIntensity: 90,
    waveStyle: 'video', waveMinOpacity: 4, waveMaxOpacity: 82, waveSpeed: 72, wavePulse: 8,
    waveScale: 120, waveGlow: 62, waveThreshold: 10, waveColor: '#7657ff', waveCoreColor: '#e9f4ff',
    cameraEnabled: true, cameraBreathing: 30, kickZoom: 28, cameraShake: 3,
    parallaxEnabled: true, parallaxAmount: 12, flashEnabled: true, flashAmount: 12,
    blurEnabled: true, blurAmount: 28, rgbEnabled: true, rgbAmount: 4,
    glintsEnabled: true, glintsAmount: 16, glintsSize: 20, trailsEnabled: true,
    trailsAmount: 46, trailsSpeed: 70
  },
  clean: {
    detectorMode: 'transient', lowHz: 45, highHz: 100, threshold: 20, sensitivity: 280,
    midSensitivity: 90, highSensitivity: 105, attack: 14, release: 160, masterIntensity: 78,
    waveStyle: 'video', waveMinOpacity: 0, waveMaxOpacity: 78, waveSpeed: 90, wavePulse: 8,
    waveScale: 108, waveGlow: 24, waveThreshold: 15, waveColor: '#9b35ff', waveCoreColor: '#ffffff',
    cameraEnabled: true, cameraBreathing: 12, kickZoom: 28, cameraShake: 3,
    parallaxEnabled: true, parallaxAmount: 6, flashEnabled: true, flashAmount: 10,
    blurEnabled: true, blurAmount: 12, rgbEnabled: true, rgbAmount: 3,
    glintsEnabled: true, glintsAmount: 8, glintsSize: 14, trailsEnabled: true,
    trailsAmount: 28, trailsSpeed: 90
  },
  dark: {
    detectorMode: 'transient', lowHz: 40, highHz: 110, threshold: 19, sensitivity: 350,
    midSensitivity: 165, highSensitivity: 135, attack: 10, release: 165, masterIntensity: 105,
    waveStyle: 'video', waveMinOpacity: 0, waveMaxOpacity: 92, waveSpeed: 92, wavePulse: 13,
    waveScale: 114, waveGlow: 46, waveThreshold: 18, waveColor: '#ff284f', waveCoreColor: '#fff0f3',
    cameraEnabled: true, cameraBreathing: 17, kickZoom: 54, cameraShake: 15,
    parallaxEnabled: true, parallaxAmount: 11, flashEnabled: true, flashAmount: 24,
    blurEnabled: true, blurAmount: 46, rgbEnabled: true, rgbAmount: 12,
    glintsEnabled: true, glintsAmount: 10, glintsSize: 17, trailsEnabled: true,
    trailsAmount: 74, trailsSpeed: 100
  }
};

function applyNamedPreset(name) {
  const preset = PRESETS[name] || PRESETS.favela;
  applySettings(preset);
  setStatus(`Preset ${name.toUpperCase()} aplicado. Ajuste as cores e a máscara para o seu vídeo.`, 'ok');
}

function applyFkuPreset() {
  applyNamedPreset('favela');
}

function saveLocalSettings() {
  try {
    localStorage.setItem('kazuBeatFxSettingsV40', JSON.stringify({ settings: collectSettings() }));
  } catch (_) {}
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ---------- Export ----------
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
    setStatus('Este Safari não oferece exportação por Canvas/MediaRecorder.', 'error');
    return;
  }

  try {
    await ensureAudioGraph();
    stopPlayback();
    exporting = true;
    setCanvasResolution();
    requestRender();
    renderFrame(performance.now());

    const canvasStream = canvas.captureStream(30);
    const audioTracks = recordDestination.stream.getAudioTracks();
    const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
    const mimeType = pickMimeType();
    const options = mimeType
      ? { mimeType, videoBitsPerSecond: ui.resolution.value === '1080' ? 12_000_000 : 7_000_000 }
      : {};

    mediaRecorder = new MediaRecorder(combinedStream, options);
    recordedChunks = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    };
    mediaRecorder.onerror = (event) => {
      setStatus(`Falha na exportação: ${event.error?.message || 'erro desconhecido'}`, 'error');
    };
    mediaRecorder.onstop = () => {
      exporting = false;
      const type = mediaRecorder.mimeType || mimeType || 'video/webm';
      const extension = type.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(recordedChunks, { type });
      downloadBlob(blob, `Kazu-Beat-FX-v4-${Date.now()}.${extension}`);
      setStatus(`Exportação concluída (${(blob.size / 1024 / 1024).toFixed(1)} MB).`, 'ok');
      ui.exportBtn.disabled = false;
      ui.exportBtn.textContent = 'Exportar vídeo';
      setCanvasResolution();
      requestRender();
    };


    ui.exportBtn.disabled = true;
    ui.exportBtn.textContent = 'Exportando…';
    setStatus('Exportando em tempo real. Não bloqueie a tela nem saia do app.');
    mediaRecorder.start(1000);
    await playProject();
  } catch (error) {
    exporting = false;
    setCanvasResolution();
    requestRender();
    ui.exportBtn.disabled = false;
    ui.exportBtn.textContent = 'Exportar vídeo';
    setStatus(`Não foi possível exportar: ${error.message}`, 'error');
  }
}

// ---------- Event listeners ----------
ui.videoInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try { await loadVideo(file); } catch (error) { setStatus(error.message, 'error'); }
});

ui.audioInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try { await loadAudio(file); } catch (error) { setStatus(error.message, 'error'); }
});

ui.foregroundInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try { await loadForeground(file); } catch (error) { setStatus(`Não foi possível abrir o PNG: ${error.message}`, 'error'); }
});

ui.maskInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try { await loadMaskFile(file); } catch (error) { setStatus(`Não foi possível abrir a máscara: ${error.message}`, 'error'); }
});

ui.playBtn.addEventListener('click', () => playing ? pauseProject() : playProject());
ui.stopBtn.addEventListener('click', stopPlayback);
ui.seek.addEventListener('input', () => {
  const duration = projectDuration();
  const nextTime = duration * numeric(ui.seek) / 1000;
  video.currentTime = nextTime;
  if (hasExternalAudio) audio.currentTime = nextTime;
  syncWaveVideo();
  requestRender();
});

ui.openMaskEditorBtn.addEventListener('click', openMaskEditor);
ui.closeMaskEditorBtn.addEventListener('click', () => ui.maskDialog.close());
ui.applyMaskBtn.addEventListener('click', () => {
  updateMaskStatus();
  ui.maskDialog.close();
  setStatus(maskHasContent ? 'Máscara aplicada. A onda agora fica atrás das áreas protegidas.' : 'Máscara vazia.', maskHasContent ? 'ok' : '');
});
ui.maskDrawBtn.addEventListener('click', () => setMaskMode('draw'));
ui.maskEraseBtn.addEventListener('click', () => setMaskMode('erase'));
ui.maskUndoBtn.addEventListener('click', undoMask);
ui.maskRedoBtn.addEventListener('click', redoMask);
ui.maskInvertBtn.addEventListener('click', invertMask);
ui.maskClearEditorBtn.addEventListener('click', () => clearMask(true));
ui.clearMaskBtn.addEventListener('click', () => clearMask(true));
ui.exportMaskBtn.addEventListener('click', exportMask);
ui.showMaskOverlay.addEventListener('change', renderMaskEditor);
ui.brushSize.addEventListener('input', () => { updateOutputs(); renderMaskEditor(); });

ui.exportBtn.addEventListener('click', exportVideo);
ui.resolution.addEventListener('change', () => { setCanvasResolution(); requestRender(); });
ui.previewQuality.addEventListener('change', () => { setCanvasResolution(); requestRender(); });
ui.fkuPresetBtn.addEventListener('click', applyFkuPreset);
ui.applyPresetBtn.addEventListener('click', () => applyNamedPreset(ui.presetSelect.value));

Object.entries(outputs).forEach(([key]) => {
  if (ui[key] && key !== 'brushSize') {
    ui[key].addEventListener('input', () => {
      updateOutputs();
      if (key === 'maskFeather' || key === 'maskExpand') maskCacheDirty = true;
      requestRender();
    });
  }
});
settingKeys().forEach((key) => ui[key].addEventListener('change', () => {
  saveLocalSettings();
  if (key === 'maskEnabled' || key === 'maskFeather' || key === 'maskExpand') maskCacheDirty = true;
  if (key === 'waveStyle' && playing) {
    if (ui.waveStyle.value === 'video') waveVideo.play().catch(() => undefined);
    else waveVideo.pause();
  }
  requestRender();
}));

document.querySelectorAll('.color-chip').forEach((button) => {
  button.addEventListener('click', () => {
    ui.waveColor.value = button.dataset.waveColor;
    ui.waveCoreColor.value = button.dataset.coreColor;
    saveLocalSettings();
    requestRender();
  });
});

ui.saveProjectBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(collectProject(), null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'Kazu-Beat-FX-v4-Projeto.json');
});

ui.projectInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const project = JSON.parse(await file.text());
    applySettings(project.settings);
    await restoreMaskFromDataUrl(project.maskDataUrl);
    setStatus('Projeto e máscara importados. Selecione novamente o vídeo e o áudio.', 'ok');
  } catch (error) {
    setStatus(`Projeto inválido: ${error.message}`, 'error');
  }
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
video.addEventListener('loadeddata', enableProjectControls);
video.addEventListener('seeked', () => {
  syncWaveVideo();
  if (ui.maskDialog.open) renderMaskEditor();
  requestRender();
});
waveVideo.addEventListener('loadeddata', requestRender);
video.addEventListener('ended', () => {
  if (exporting && mediaRecorder?.state === 'recording') mediaRecorder.stop();
  stopPlayback();
});

window.addEventListener('pagehide', () => {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
});

try {
  const saved = JSON.parse(localStorage.getItem('kazuBeatFxSettingsV40') || localStorage.getItem('kazuBeatFxSettingsV30'));
  if (saved?.settings) applySettings(saved.settings);
} catch (_) {}

updateOutputs();
updateMaskStatus();
setCanvasResolution();
enableProjectControls();
requestRender();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./service-worker.js?v=4.0.0').catch(() => {});
}

if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches) {
  ui.installBtn.classList.remove('hidden');
}
