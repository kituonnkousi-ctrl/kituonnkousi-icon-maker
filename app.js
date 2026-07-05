const defaults = {
  text: "志",
  canvasWidth: 1920,
  canvasHeight: 1080,
  fontFamily: '"HG正楷書体-PRO", "HG正楷書体-PRO M", serif',
  fontSize: 800,
  minFontSize: 80,
  perCharacterGradient: true,
  outlineWidth: 40,
  outlineBlur: 10,
  outlineCoreBoost: 6,
  gradientStart: "#00f7ff",
  gradientEnd: "#00a8ff",
  gradientAngle: 90,
  gradientSize: 500,
  textSideMargin: 64,
};

const form = document.getElementById("controls");
const canvas = document.getElementById("iconCanvas");
const ctx = canvas.getContext("2d");

const inputMap = {
  text: document.getElementById("textInput"),
  perCharacterGradient: document.getElementById("gradientModeInput"),
};

const backgroundImage = new Image();
let backgroundReady = false;
let renderQueued = false;

backgroundImage.addEventListener("load", () => {
  backgroundReady = true;
  queueRender();
});

backgroundImage.addEventListener("error", () => {
  backgroundReady = false;
  queueRender();
});

backgroundImage.src = "backimage.jpg";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyTextStyle(targetCtx, fontSize) {
  targetCtx.font = `${fontSize}px ${defaults.fontFamily}`;
  targetCtx.textAlign = "center";
  targetCtx.textBaseline = "alphabetic";
  targetCtx.lineJoin = "round";
  targetCtx.lineCap = "round";
  targetCtx.imageSmoothingEnabled = true;
  targetCtx.imageSmoothingQuality = "high";
}

function getOutlineStrokeWidth() {
  return defaults.outlineWidth * 2 + defaults.outlineCoreBoost;
}

function getOutlinePadding() {
  return getOutlineStrokeWidth() / 2 + defaults.outlineBlur * 2;
}

function readSettings() {
  const rawText = inputMap.text.value;

  return {
    text: rawText.length > 0 ? rawText : defaults.text,
    canvasWidth: defaults.canvasWidth,
    canvasHeight: defaults.canvasHeight,
    fontSize: defaults.fontSize,
    perCharacterGradient: inputMap.perCharacterGradient.checked,
  };
}

function measureLineMetrics(text, fontSize) {
  applyTextStyle(ctx, fontSize);
  const safeText = text || " ";
  const metrics = ctx.measureText(safeText);

  return {
    width: text ? metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight : 0,
    ascent: Math.max(metrics.actualBoundingBoxAscent, fontSize * 0.72),
    descent: Math.max(metrics.actualBoundingBoxDescent, fontSize * 0.18),
  };
}

function getMaxTextWidth(settings) {
  return Math.max(
    1,
    settings.canvasWidth - getOutlinePadding() * 2 - defaults.textSideMargin * 2,
  );
}

function getLines(text) {
  return text.split(/\r?\n/);
}

function createTextLayout(settings, fontSize) {
  const padding = getOutlinePadding();
  const maxTextWidth = getMaxTextWidth(settings);
  const lines = getLines(settings.text);
  const lineMetrics = lines.map((line) => measureLineMetrics(line, fontSize));
  const maxLineWidth = Math.max(...lineMetrics.map((metrics) => metrics.width), 0);
  const maxAscent = Math.max(...lineMetrics.map((metrics) => metrics.ascent), fontSize * 0.72);
  const maxDescent = Math.max(...lineMetrics.map((metrics) => metrics.descent), fontSize * 0.18);
  const lineHeight = maxAscent + maxDescent;
  const contentHeight = lineHeight * lines.length;
  const topY = (settings.canvasHeight - (contentHeight + padding * 2)) / 2;

  return {
    fits:
      maxLineWidth + padding * 2 <= settings.canvasWidth &&
      contentHeight + padding * 2 <= settings.canvasHeight,
    lines,
    lineHeight,
    centerX: settings.canvasWidth / 2,
    firstBaselineY: topY + padding + maxAscent,
    gradientCenterY: topY + padding + contentHeight / 2,
  };
}

function resolveFontSize(settings) {
  if (createTextLayout(settings, settings.fontSize).fits) {
    return settings.fontSize;
  }

  let low = defaults.minFontSize;
  let high = settings.fontSize;
  let best = defaults.minFontSize;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const layout = createTextLayout(settings, mid);

    if (layout.fits) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function drawBackground(settings) {
  if (!backgroundReady) {
    ctx.fillStyle = "#0b35b5";
    ctx.fillRect(0, 0, settings.canvasWidth, settings.canvasHeight);
    return;
  }

  const scale = Math.max(
    settings.canvasWidth / backgroundImage.naturalWidth,
    settings.canvasHeight / backgroundImage.naturalHeight,
  );
  const drawWidth = backgroundImage.naturalWidth * scale;
  const drawHeight = backgroundImage.naturalHeight * scale;
  const drawX = (settings.canvasWidth - drawWidth) / 2;
  const drawY = (settings.canvasHeight - drawHeight) / 2;

  ctx.drawImage(backgroundImage, drawX, drawY, drawWidth, drawHeight);
}

function createTextGradient(targetCtx, centerX, centerY) {
  const angle = ((defaults.gradientAngle - 90) * Math.PI) / 180;
  const deltaX = Math.cos(angle) * (defaults.gradientSize / 2);
  const deltaY = Math.sin(angle) * (defaults.gradientSize / 2);
  const gradient = targetCtx.createLinearGradient(
    centerX - deltaX,
    centerY - deltaY,
    centerX + deltaX,
    centerY + deltaY,
  );

  gradient.addColorStop(0, defaults.gradientEnd);
  gradient.addColorStop(1, defaults.gradientStart);
  return gradient;
}

function drawGradientTextLine(
  targetCtx,
  line,
  centerX,
  baselineY,
  gradientCenterY,
  perCharacterGradient,
) {
  if (!perCharacterGradient) {
    targetCtx.fillStyle = createTextGradient(targetCtx, centerX, gradientCenterY);
    targetCtx.fillText(line, centerX, baselineY);
    return;
  }

  const lineAdvanceWidth = targetCtx.measureText(line).width;
  let characterX = centerX - lineAdvanceWidth / 2;

  targetCtx.save();
  targetCtx.textAlign = "left";

  for (const character of Array.from(line)) {
    const metrics = targetCtx.measureText(character);
    const characterCenterX =
      characterX + (metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft) / 2;
    const characterCenterY =
      baselineY + (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2;

    targetCtx.fillStyle = createTextGradient(targetCtx, characterCenterX, characterCenterY);
    targetCtx.fillText(character, characterX, baselineY);
    characterX += metrics.width;
  }

  targetCtx.restore();
}

function createOutlineLayer(width, height, lines, fontSize, centerX, firstBaselineY, lineHeight) {
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;

  const layerCtx = layer.getContext("2d");
  applyTextStyle(layerCtx, fontSize);
  layerCtx.strokeStyle = "#ffffff";
  layerCtx.lineWidth = getOutlineStrokeWidth();

  for (const [index, line] of lines.entries()) {
    layerCtx.strokeText(line, centerX, firstBaselineY + index * lineHeight);
  }

  return layer;
}

function drawSoftOutline(targetCtx, layer) {
  const passes = [
    { blur: 4.2, alpha: 1 },
    { blur: defaults.outlineBlur * 1.1, alpha: 0.86 },
    { blur: defaults.outlineBlur * 2.4, alpha: 0.34 },
    { blur: defaults.outlineBlur * 3.4, alpha: 0.12 },
  ];

  targetCtx.save();
  for (const pass of passes) {
    targetCtx.globalAlpha = pass.alpha;
    targetCtx.filter = `blur(${pass.blur}px)`;
    targetCtx.drawImage(layer, 0, 0);
  }
  targetCtx.restore();
}

function createLayer(width, height) {
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  return layer;
}

function renderTextLayer(settings, layout, fontSize, offsetX = 0, offsetY = 0) {
  const layer = createLayer(settings.canvasWidth, settings.canvasHeight);
  const layerCtx = layer.getContext("2d");
  const centerX = layout.centerX + offsetX;
  const firstBaselineY = layout.firstBaselineY + offsetY;
  const gradientCenterY = layout.gradientCenterY + offsetY;

  applyTextStyle(layerCtx, fontSize);
  const outlineLayer = createOutlineLayer(
    settings.canvasWidth,
    settings.canvasHeight,
    layout.lines,
    fontSize,
    centerX,
    firstBaselineY,
    layout.lineHeight,
  );

  drawSoftOutline(layerCtx, outlineLayer);

  layerCtx.save();
  for (const [index, line] of layout.lines.entries()) {
    drawGradientTextLine(
      layerCtx,
      line,
      centerX,
      firstBaselineY + index * layout.lineHeight,
      gradientCenterY,
      settings.perCharacterGradient,
    );
  }
  layerCtx.restore();

  return layer;
}

function getLayerBounds(layer) {
  const layerCtx = layer.getContext("2d");
  const { data, width, height } = layerCtx.getImageData(0, 0, layer.width, layer.height);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];

      if (alpha === 0) {
        continue;
      }

      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    return null;
  }

  return { left, top, right, bottom };
}

function drawText(settings, fontSize) {
  const layout = createTextLayout(settings, fontSize);
  const baseLayer = renderTextLayer(settings, layout, fontSize);
  const bounds = getLayerBounds(baseLayer);

  if (!bounds) {
    ctx.drawImage(baseLayer, 0, 0);
    return;
  }

  const currentCenterX = (bounds.left + bounds.right + 1) / 2;
  const currentCenterY = (bounds.top + bounds.bottom + 1) / 2;
  const offsetX = Math.round(settings.canvasWidth / 2 - currentCenterX);
  const offsetY = Math.round(settings.canvasHeight / 2 - currentCenterY);

  if (offsetX === 0 && offsetY === 0) {
    ctx.drawImage(baseLayer, 0, 0);
    return;
  }

  const centeredLayer = renderTextLayer(settings, layout, fontSize, offsetX, offsetY);
  ctx.drawImage(centeredLayer, 0, 0);
}

function render() {
  renderQueued = false;
  const settings = readSettings();
  const resolvedFontSize = resolveFontSize(settings);
  canvas.width = settings.canvasWidth;
  canvas.height = settings.canvasHeight;

  ctx.clearRect(0, 0, settings.canvasWidth, settings.canvasHeight);
  drawBackground(settings);
  drawText(settings, resolvedFontSize);
}

function queueRender() {
  if (renderQueued) {
    return;
  }

  renderQueued = true;
  window.requestAnimationFrame(render);
}

form.addEventListener("input", queueRender);

window.addEventListener("load", async () => {
  if (document.fonts) {
    try {
      await document.fonts.load(`32px ${defaults.fontFamily}`);
      await document.fonts.ready;
    } catch (error) {
      console.error(error);
    }
  }

  render();
});
