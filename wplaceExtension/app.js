import {
  TILE_SIZE,
  buildTransformedSnapshot,
  clonePaintDocument,
  mergePaintDocuments,
  movePaintDocument,
  normalizePaintDocument,
  paintPixel,
  parsePaintJson,
  serializePaintDocument,
} from './paint-json-core.js';
import { PALETTE, PALETTE_BY_ID, SENTINEL_ID, TRANSPARENT_ID, colorCssById } from './palette.js';

const STORAGE_KEY = 'wplace.pixel-editor.library.v2';
const EDITOR_MARGIN = 32;
const EDITOR_PADDING = 4;
const PREVIEW_MARGIN = 16;
const PREVIEW_PADDING = 4;
const THUMB_MARGIN = 8;
const THUMB_PADDING = 2;

const SPECIAL_COLORS = [
  { id: TRANSPARENT_ID, name: 'Transparent', kind: 'transparent' },
  { id: SENTINEL_ID, name: 'Sentinel', kind: 'sentinel' },
];

const PALETTE_ITEMS = [...SPECIAL_COLORS, ...PALETTE];
const PALETTE_NAME_BY_ID = new Map(PALETTE_ITEMS.map((item) => [item.id, item.name]));

const $ = (id) => document.getElementById(id);
const createId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const state = {
  library: [],
  currentTemplateId: null,
  currentTemplateName: '',
  currentDocument: null,
  currentSnapshot: null,
  brushColorId: PALETTE[0]?.id ?? 1,
  tool: 'brush',
  editorZoom: 4,
  editorViewport: null,
  mergeDocument: null,
  mergeSnapshot: null,
  mergeViewport: null,
  activeStroke: null,
  persistTimer: null,
};

const elements = {
  fillSampleBtn: $('fillSampleBtn'),
  copyCurrentBtn: $('copyCurrentBtn'),
  templateNameInput: $('templateNameInput'),
  importJsonInput: $('importJsonInput'),
  importBtn: $('importBtn'),
  clearImportBtn: $('clearImportBtn'),
  importStatus: $('importStatus'),
  libraryList: $('libraryList'),
  currentTemplateInfo: $('currentTemplateInfo'),
  saveCurrentBtn: $('saveCurrentBtn'),
  brushModeBtn: $('brushModeBtn'),
  eraseModeBtn: $('eraseModeBtn'),
  pickModeBtn: $('pickModeBtn'),
  editorTileCount: $('editorTileCount'),
  editorPixelCount: $('editorPixelCount'),
  editorBounds: $('editorBounds'),
  moveXInput: $('moveXInput'),
  moveYInput: $('moveYInput'),
  moveBtn: $('moveBtn'),
  resetMoveBtn: $('resetMoveBtn'),
  paletteGrid: $('paletteGrid'),
  selectedColorLabel: $('selectedColorLabel'),
  colorMeta: $('colorMeta'),
  editorCanvas: $('editorCanvas'),
  editorStatus: $('editorStatus'),
  loadCurrentIntoMergeA: $('loadCurrentIntoMergeA'),
  loadCurrentIntoMergeB: $('loadCurrentIntoMergeB'),
  mergeNameInput: $('mergeNameInput'),
  mergeInputA: $('mergeInputA'),
  mergeInputB: $('mergeInputB'),
  mergeBtn: $('mergeBtn'),
  copyMergeBtn: $('copyMergeBtn'),
  saveMergeBtn: $('saveMergeBtn'),
  mergeStatus: $('mergeStatus'),
  mergeTileCount: $('mergeTileCount'),
  mergePixelCount: $('mergePixelCount'),
  mergeBounds: $('mergeBounds'),
  mergeOutput: $('mergeOutput'),
  mergeCanvas: $('mergeCanvas'),
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const signed = (value) => (value >= 0 ? `+${value}` : `${value}`);

const tileKey = (x, y) => `${x}:${y}`;

const setMessage = (element, message, kind = '') => {
  element.textContent = message;
  element.classList.remove('status-success', 'status-error');
  if (kind === 'success') element.classList.add('status-success');
  if (kind === 'error') element.classList.add('status-error');
};

const createEmptySnapshot = () => ({
  season: 0,
  topLevelExtras: {},
  tiles: [],
  shiftX: 0,
  shiftY: 0,
  pointCount: 0,
  visiblePointCount: 0,
  colorUsage: new Map(),
  bounds: null,
});

const getSnapshot = (document) => (document ? buildTransformedSnapshot(document, 0, 0) : createEmptySnapshot());

const summarizeTiles = (snapshot, limit = 4) => {
  const coords = snapshot.tiles.map((tile) => `(${tile.x}, ${tile.y})`);
  if (coords.length === 0) return 'No tiles';
  if (coords.length <= limit) return coords.join(' · ');
  return `${coords.slice(0, limit).join(' · ')} · +${coords.length - limit} more`;
};

const formatBounds = (bounds) => {
  if (!bounds) return '-';
  return `x ${bounds.minX}..${bounds.maxX} | y ${bounds.minY}..${bounds.maxY}`;
};

const describeSnapshot = (snapshot) => `Tiles: ${summarizeTiles(snapshot)} | Pixels: ${snapshot.visiblePointCount}`;

const colorName = (id) => PALETTE_NAME_BY_ID.get(id) || `Color ${id}`;

const colorStyle = (id) => {
  if (id === TRANSPARENT_ID) return 'repeating-linear-gradient(45deg, #404040 0 6px, #2d2d2d 6px 12px)';
  if (id === SENTINEL_ID) return 'rgb(158, 189, 255)';
  return colorCssById(id) || '#666';
};

const copyText = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.append(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  if (!ok) throw new Error('Copy failed.');
};

const readLibrary = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.templates) ? parsed.templates : [];
    return items.flatMap((item) => {
      try {
        const document = normalizePaintDocument(item.document || item);
        return [
          {
            id: String(item.id || createId()),
            name: String(item.name || 'Untitled template'),
            document,
            createdAt: Number(item.createdAt) || Date.now(),
            updatedAt: Number(item.updatedAt) || Number(item.createdAt) || Date.now(),
          },
        ];
      } catch (error) {
        console.warn('[library] skipping invalid entry:', error.message);
        return [];
      }
    });
  } catch (error) {
    console.warn('[library] failed to load:', error.message);
    return [];
  }
};

const saveLibrary = () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      {
        version: 2,
        templates: state.library.map((template) => ({
          id: template.id,
          name: template.name,
          document: template.document,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        })),
      },
      null,
      2,
    ),
  );
};

const sortLibrary = () => state.library.sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));

const getLibraryEntry = (id) => state.library.find((entry) => entry.id === id);

const upsertLibraryEntry = ({ id, name, document }) => {
  const normalized = normalizePaintDocument(document);
  const now = Date.now();
  const finalName = name?.trim() || 'Untitled template';

  let entry = null;
  if (id) entry = getLibraryEntry(id);

  if (!entry && finalName) {
    entry = state.library.find((item) => item.name === finalName);
  }

  if (entry) {
    entry.name = finalName;
    entry.document = clonePaintDocument(normalized);
    entry.updatedAt = now;
    if (!entry.createdAt) entry.createdAt = now;
  } else {
    entry = {
      id: id || createId(),
      name: finalName,
      document: clonePaintDocument(normalized),
      createdAt: now,
      updatedAt: now,
    };
    state.library.push(entry);
  }

  sortLibrary();
  saveLibrary();
  renderLibrary();
  return entry;
};

const deleteLibraryEntry = (id) => {
  const next = state.library.findIndex((entry) => entry.id === id);
  if (next === -1) return;

  state.library.splice(next, 1);
  if (state.currentTemplateId === id) {
    state.currentTemplateId = null;
    state.currentTemplateName = '';
    state.currentDocument = null;
    state.currentSnapshot = null;
  }

  saveLibrary();
  renderLibrary();
  renderEditor();
};

const setTemplateName = (name) => {
  state.currentTemplateName = name;
  elements.templateNameInput.value = name;
};

const setCurrentDocument = ({ id = null, name = '', document = null }) => {
  state.currentTemplateId = id;
  state.currentTemplateName = name || 'Untitled template';
  state.currentDocument = document ? clonePaintDocument(document) : null;
  setTemplateName(state.currentTemplateName);
  renderEditor();
  updateToolUi();
};

const loadTemplateIntoEditor = (id) => {
  const entry = getLibraryEntry(id);
  if (!entry) {
    setMessage(elements.editorStatus, 'Template not found.', 'error');
    return;
  }

  setCurrentDocument({ id: entry.id, name: entry.name, document: entry.document });
  setMessage(elements.editorStatus, `Loaded "${entry.name}".`, 'success');
};

const schedulePersistCurrentTemplate = () => {
  if (!state.currentTemplateId) return;
  clearTimeout(state.persistTimer);
  state.persistTimer = setTimeout(() => {
    persistCurrentTemplate({ notify: false });
  }, 150);
};

const persistCurrentTemplate = ({ notify = true } = {}) => {
  if (!state.currentDocument) return null;

  const name = elements.templateNameInput.value.trim() || state.currentTemplateName || 'Untitled template';
  const entry = upsertLibraryEntry({
    id: state.currentTemplateId,
    name,
    document: state.currentDocument,
  });

  state.currentTemplateId = entry.id;
  state.currentTemplateName = entry.name;
  state.currentDocument = clonePaintDocument(entry.document);
  state.currentSnapshot = getSnapshot(state.currentDocument);

  if (notify) setMessage(elements.editorStatus, `Saved "${entry.name}".`, 'success');
  renderEditor();
  return entry;
};

const renderSnapshotOnCanvas = (canvas, snapshot, options = {}) => {
  const {
    margin = 0,
    padding = 4,
    zoom = 1,
    fitTo = null,
    background = '#111318',
    drawGrid = true,
    gridColor = 'rgba(255,255,255,0.08)',
  } = options;

  const hasContent = !!snapshot.bounds && snapshot.pointCount > 0;
  const renderMinX = hasContent ? snapshot.bounds.minX - margin : -margin;
  const renderMinY = hasContent ? snapshot.bounds.minY - margin : -margin;
  const contentWidth = hasContent ? snapshot.bounds.width + margin * 2 : 64;
  const contentHeight = hasContent ? snapshot.bounds.height + margin * 2 : 64;
  const width = Math.max(1, Math.ceil(contentWidth + padding * 2));
  const height = Math.max(1, Math.ceil(contentHeight + padding * 2));
  const ctx = canvas.getContext('2d');

  canvas.width = width;
  canvas.height = height;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const originX = padding - renderMinX;
  const originY = padding - renderMinY;

  for (const tile of snapshot.tiles) {
    const baseX = tile.x * TILE_SIZE + originX;
    const baseY = tile.y * TILE_SIZE + originY;

    for (const point of tile.points) {
      const css = colorStyle(point.color);
      if (!css) continue;
      ctx.fillStyle = css;
      ctx.fillRect(baseX + point.x, baseY + point.y, 1, 1);
    }
  }

  if (drawGrid && hasContent) {
    const startTileX = Math.floor(renderMinX / TILE_SIZE);
    const endTileX = Math.floor((renderMinX + contentWidth) / TILE_SIZE);
    const startTileY = Math.floor(renderMinY / TILE_SIZE);
    const endTileY = Math.floor((renderMinY + contentHeight) / TILE_SIZE);

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let tileX = startTileX; tileX <= endTileX + 1; tileX += 1) {
      const x = tileX * TILE_SIZE + originX;
      ctx.moveTo(x + 0.5, padding);
      ctx.lineTo(x + 0.5, height - padding);
    }

    for (let tileY = startTileY; tileY <= endTileY + 1; tileY += 1) {
      const y = tileY * TILE_SIZE + originY;
      ctx.moveTo(padding, y + 0.5);
      ctx.lineTo(width - padding, y + 0.5);
    }

    ctx.stroke();
  }

  let scale = zoom;
  if (fitTo) {
    scale = Math.min(fitTo.width / width, fitTo.height / height);
  }
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;

  canvas.style.width = `${Math.max(1, Math.round(width * scale))}px`;
  canvas.style.height = `${Math.max(1, Math.round(height * scale))}px`;

  return {
    renderMinX,
    renderMinY,
    padding,
    width,
    height,
    scale,
    hasContent,
  };
};

const worldFromPointer = (canvas, viewport, event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = Math.floor((event.clientX - rect.left) * scaleX);
  const canvasY = Math.floor((event.clientY - rect.top) * scaleY);

  return {
    absX: viewport.renderMinX + (canvasX - viewport.padding),
    absY: viewport.renderMinY + (canvasY - viewport.padding),
    canvasX,
    canvasY,
  };
};

const getColorAt = (document, absX, absY) => {
  if (!document) return 0;
  const tileX = Math.floor(absX / TILE_SIZE);
  const tileY = Math.floor(absY / TILE_SIZE);
  const localX = ((absX % TILE_SIZE) + TILE_SIZE) % TILE_SIZE;
  const localY = ((absY % TILE_SIZE) + TILE_SIZE) % TILE_SIZE;
  const tile = document.tiles.find((entry) => entry.x === tileX && entry.y === tileY);
  if (!tile) return 0;
  const point = tile.points.find((entry) => entry.x === localX && entry.y === localY);
  return point ? point.color : 0;
};

const bresenham = (x0, y0, x1, y1, visit) => {
  let cx = x0;
  let cy = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  while (true) {
    visit(cx, cy);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }
};

const updateColorMeta = () => {
  const tool = state.tool;
  const brushName = colorName(state.brushColorId);
  if (tool === 'brush') {
    elements.selectedColorLabel.textContent = `Brush: ${brushName}`;
    elements.colorMeta.textContent = `Paint color ID ${state.brushColorId}.`;
  } else if (tool === 'erase') {
    elements.selectedColorLabel.textContent = 'Erase';
    elements.colorMeta.textContent = 'Erase pixels to transparency.';
  } else {
    elements.selectedColorLabel.textContent = 'Pick';
    elements.colorMeta.textContent = 'Click a pixel to sample its color.';
  }
};

const updateToolUi = () => {
  [elements.brushModeBtn, elements.eraseModeBtn, elements.pickModeBtn].forEach((button) => {
    button.classList.toggle('active', button.dataset.tool === state.tool);
  });

  document.querySelectorAll('.palette-item').forEach((button) => {
    button.classList.toggle('selected', Number(button.dataset.colorId) === state.brushColorId);
  });

  updateColorMeta();
};

const renderEditor = () => {
  const snapshot = getSnapshot(state.currentDocument);
  state.currentSnapshot = snapshot;

  elements.saveCurrentBtn.disabled = !state.currentDocument;
  elements.copyCurrentBtn.disabled = !state.currentDocument;

  if (!state.currentDocument) {
    elements.currentTemplateInfo.textContent = 'No template loaded.';
    elements.editorTileCount.textContent = '0';
    elements.editorPixelCount.textContent = '0';
    elements.editorBounds.textContent = '-';
    state.editorViewport = renderSnapshotOnCanvas(elements.editorCanvas, createEmptySnapshot(), {
      margin: EDITOR_MARGIN,
      padding: EDITOR_PADDING,
      zoom: state.editorZoom,
      drawGrid: false,
      background: '#101216',
    });
    updateToolUi();
    return;
  }

  elements.currentTemplateInfo.innerHTML = `${escapeHtml(state.currentTemplateName)}<br>${escapeHtml(describeSnapshot(snapshot))}`;
  elements.editorTileCount.textContent = String(snapshot.tiles.length);
  elements.editorPixelCount.textContent = String(snapshot.visiblePointCount);
  elements.editorBounds.textContent = formatBounds(snapshot.bounds);

  state.editorViewport = renderSnapshotOnCanvas(elements.editorCanvas, snapshot, {
    margin: EDITOR_MARGIN,
    padding: EDITOR_PADDING,
    zoom: state.editorZoom,
    drawGrid: true,
    background: '#101216',
  });
  updateToolUi();
};

const renderLibrary = () => {
  elements.libraryList.replaceChildren();

  if (!state.library.length) {
    elements.libraryList.classList.add('empty');
    elements.libraryList.textContent = 'No templates stored yet.';
    return;
  }

  elements.libraryList.classList.remove('empty');

  for (const template of state.library) {
    const snapshot = getSnapshot(template.document);
    const card = document.createElement('article');
    card.className = 'template-card';

    const header = document.createElement('div');
    header.className = 'template-card-header';

    const titleBlock = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'template-card-name';
    title.textContent = template.name;
    const meta = document.createElement('div');
    meta.className = 'template-card-meta';
    meta.innerHTML = [
      `${escapeHtml(describeSnapshot(snapshot))}`,
      `Saved <code>${new Date(template.updatedAt).toLocaleString()}</code>`,
    ].join('<br>');
    titleBlock.append(title, meta);

    const badge = document.createElement('div');
    badge.className = 'template-card-meta';
    badge.textContent = `Season ${snapshot.season}`;

    header.append(titleBlock, badge);
    card.append(header);

    const thumb = document.createElement('canvas');
    thumb.className = 'thumbnail';
    renderSnapshotOnCanvas(thumb, snapshot, {
      margin: THUMB_MARGIN,
      padding: THUMB_PADDING,
      fitTo: { width: 240, height: 130 },
      drawGrid: true,
      background: '#101216',
      gridColor: 'rgba(255,255,255,0.06)',
    });
    card.append(thumb);

    const actions = document.createElement('div');
    actions.className = 'template-card-actions';

    const openBtn = document.createElement('button');
    openBtn.className = 'secondary-button';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', () => loadTemplateIntoEditor(template.id));

    const copyBtn = document.createElement('button');
    copyBtn.className = 'secondary-button';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', async () => {
      try {
        await copyText(serializePaintDocument(template.document));
        setMessage(elements.importStatus, `Copied "${template.name}".`, 'success');
      } catch (error) {
        setMessage(elements.importStatus, error.message, 'error');
      }
    });

    const mergeABtn = document.createElement('button');
    mergeABtn.className = 'secondary-button';
    mergeABtn.textContent = 'A';
    mergeABtn.addEventListener('click', () => {
      elements.mergeInputA.value = serializePaintDocument(template.document);
      setMessage(elements.mergeStatus, `Loaded "${template.name}" into JSON A.`, 'success');
    });

    const mergeBBtn = document.createElement('button');
    mergeBBtn.className = 'secondary-button';
    mergeBBtn.textContent = 'B';
    mergeBBtn.addEventListener('click', () => {
      elements.mergeInputB.value = serializePaintDocument(template.document);
      setMessage(elements.mergeStatus, `Loaded "${template.name}" into JSON B.`, 'success');
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'secondary-button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      if (!confirm(`Delete "${template.name}"?`)) return;
      deleteLibraryEntry(template.id);
      setMessage(elements.importStatus, `Deleted "${template.name}".`, 'success');
    });

    actions.append(openBtn, copyBtn, mergeABtn, mergeBBtn, deleteBtn);
    card.append(actions);
    elements.libraryList.append(card);
  }
};

const renderMerge = () => {
  if (!state.mergeDocument) {
    elements.mergeOutput.value = '';
    elements.mergeTileCount.textContent = '0';
    elements.mergePixelCount.textContent = '0';
    elements.mergeBounds.textContent = '-';
    state.mergeViewport = renderSnapshotOnCanvas(elements.mergeCanvas, createEmptySnapshot(), {
      margin: PREVIEW_MARGIN,
      padding: PREVIEW_PADDING,
      zoom: 1,
      drawGrid: false,
      background: '#101216',
    });
    elements.copyMergeBtn.disabled = true;
    elements.saveMergeBtn.disabled = true;
    return;
  }

  const snapshot = getSnapshot(state.mergeDocument);
  state.mergeSnapshot = snapshot;
  elements.mergeOutput.value = serializePaintDocument(state.mergeDocument);
  elements.mergeTileCount.textContent = String(snapshot.tiles.length);
  elements.mergePixelCount.textContent = String(snapshot.visiblePointCount);
  elements.mergeBounds.textContent = formatBounds(snapshot.bounds);
  state.mergeViewport = renderSnapshotOnCanvas(elements.mergeCanvas, snapshot, {
    margin: PREVIEW_MARGIN,
    padding: PREVIEW_PADDING,
    fitTo: { width: Math.max(220, elements.mergeCanvas.parentElement.clientWidth - 4), height: 360 },
    drawGrid: true,
    background: '#101216',
  });
  elements.copyMergeBtn.disabled = false;
  elements.saveMergeBtn.disabled = false;
};

const importTemplateFromText = async (text, nameHint = '') => {
  const document = normalizePaintDocument(parsePaintJson(text));
  const name = nameHint.trim() || 'Imported template';
  const entry = upsertLibraryEntry({ name, document });
  setCurrentDocument({ id: entry.id, name: entry.name, document: entry.document });
  setMessage(elements.importStatus, `Imported "${entry.name}".`, 'success');
};

const loadSampleIntoImportBox = async () => {
  const response = await fetch('./example_paint.json');
  if (!response.ok) throw new Error(`Failed to load sample: ${response.status}`);
  elements.importJsonInput.value = await response.text();
  if (!elements.templateNameInput.value.trim()) elements.templateNameInput.value = 'example_paint';
  setMessage(elements.importStatus, 'Sample JSON loaded into the paste box.', 'success');
};

const saveCurrentTemplate = () => {
  if (!state.currentDocument) {
    setMessage(elements.editorStatus, 'Load or import a template first.', 'error');
    return;
  }

  const entry = upsertLibraryEntry({
    id: state.currentTemplateId,
    name: elements.templateNameInput.value.trim() || state.currentTemplateName || 'Untitled template',
    document: state.currentDocument,
  });

  setCurrentDocument({ id: entry.id, name: entry.name, document: entry.document });
  setMessage(elements.editorStatus, `Saved "${entry.name}".`, 'success');
};

const applyMove = (dx, dy) => {
  if (!state.currentDocument) {
    setMessage(elements.editorStatus, 'Load or import a template first.', 'error');
    return;
  }

  state.currentDocument = movePaintDocument(state.currentDocument, dx, dy);
  persistCurrentTemplate({ notify: false });
  setMessage(elements.editorStatus, `Moved art by ${signed(dx)}, ${signed(dy)} pixels.`, 'success');
};

const applyBrushStroke = (absX, absY, color) => {
  if (!state.currentDocument) return;
  state.currentDocument = paintPixel(state.currentDocument, absX, absY, color);
  schedulePersistCurrentTemplate();
  renderEditor();
};

const paintWorldLine = (from, to, color) => {
  bresenham(from.absX, from.absY, to.absX, to.absY, (x, y) => {
    paintPixel(state.currentDocument, x, y, color);
  });
};

const handleEditorPointerDown = (event) => {
  if (!state.currentDocument || !state.editorViewport) return;
  if (event.button !== 0) return;

  const { absX, absY } = worldFromPointer(elements.editorCanvas, state.editorViewport, event);
  if (state.tool === 'pick') {
    const picked = getColorAt(state.currentDocument, absX, absY);
    state.brushColorId = picked;
    state.tool = 'brush';
    updateToolUi();
    setMessage(
      elements.editorStatus,
      picked === 0
        ? `Picked transparent at ${absX}, ${absY}.`
        : `Picked ${colorName(picked)} (ID ${picked}) at ${absX}, ${absY}.`,
      'success',
    );
    renderEditor();
    return;
  }

  state.activeStroke = {
    last: { absX, absY },
    color: state.tool === 'erase' ? 0 : state.brushColorId,
  };
  elements.editorCanvas.setPointerCapture(event.pointerId);
  applyBrushStroke(absX, absY, state.activeStroke.color);
  setMessage(elements.editorStatus, `Painting ${colorName(state.activeStroke.color)} at ${absX}, ${absY}.`, 'success');
};

const handleEditorPointerMove = (event) => {
  if (!state.currentDocument || !state.editorViewport) return;
  if (!state.activeStroke) return;
  const { absX, absY } = worldFromPointer(elements.editorCanvas, state.editorViewport, event);
  const last = state.activeStroke.last;
  paintWorldLine(last, { absX, absY }, state.activeStroke.color);
  state.activeStroke.last = { absX, absY };
  renderEditor();
};

const endEditorStroke = () => {
  if (!state.activeStroke) return;
  state.activeStroke = null;
  persistCurrentTemplate({ notify: false });
};

const makePaletteButton = (item) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `palette-item${item.kind ? ` ${item.kind}` : ''}`;
  button.dataset.colorId = String(item.id);

  const swatch = document.createElement('div');
  swatch.className = 'palette-swatch';
  swatch.style.background = colorStyle(item.id);

  const label = document.createElement('div');
  label.className = 'palette-name';
  label.textContent = `${item.name}${PALETTE_BY_ID.get(item.id) ? ` · ${item.id}` : ''}`;

  button.append(swatch, label);
  button.addEventListener('click', () => {
    state.brushColorId = item.id;
    state.tool = 'brush';
    updateToolUi();
  });

  return button;
};

const renderPalette = () => {
  elements.paletteGrid.replaceChildren(...PALETTE_ITEMS.map(makePaletteButton));
  updateToolUi();
};

const setTool = (tool) => {
  state.tool = tool;
  updateToolUi();
};

const mergeDocumentsFromText = () => {
  const left = elements.mergeInputA.value.trim();
  const right = elements.mergeInputB.value.trim();
  if (!left || !right) {
    setMessage(elements.mergeStatus, 'Paste two JSON strings before merging.', 'error');
    return;
  }

  const docA = normalizePaintDocument(parsePaintJson(left));
  const docB = normalizePaintDocument(parsePaintJson(right));
  state.mergeDocument = mergePaintDocuments(docA, docB);
  const snapshot = getSnapshot(state.mergeDocument);
  setMessage(
    elements.mergeStatus,
    `Merged ${snapshot.tiles.length} tile(s) and ${snapshot.visiblePointCount} painted pixel(s). Right-hand pixels win on overlap.`,
    'success',
  );
  renderMerge();
};

const saveMergedTemplate = () => {
  if (!state.mergeDocument) {
    setMessage(elements.mergeStatus, 'Merge something first.', 'error');
    return;
  }

  const entry = upsertLibraryEntry({
    name: elements.mergeNameInput.value.trim() || 'Merged template',
    document: state.mergeDocument,
  });

  setCurrentDocument({ id: entry.id, name: entry.name, document: entry.document });
  setMessage(elements.mergeStatus, `Saved merged template as "${entry.name}".`, 'success');
};

const loadCurrentIntoMerge = (target) => {
  if (!state.currentDocument) {
    setMessage(elements.mergeStatus, 'Load a template first.', 'error');
    return;
  }

  const text = serializePaintDocument(state.currentDocument);
  if (target === 'A') elements.mergeInputA.value = text;
  else elements.mergeInputB.value = text;
  setMessage(elements.mergeStatus, `Loaded current template into JSON ${target}.`, 'success');
};

const renderAll = () => {
  renderPalette();
  renderLibrary();
  renderEditor();
  renderMerge();
};

const init = () => {
  state.library = readLibrary();
  sortLibrary();
  elements.editorCanvas.addEventListener('pointerdown', handleEditorPointerDown);
  elements.editorCanvas.addEventListener('pointermove', handleEditorPointerMove);
  elements.editorCanvas.addEventListener('pointerup', endEditorStroke);
  elements.editorCanvas.addEventListener('pointercancel', endEditorStroke);
  elements.editorCanvas.addEventListener('lostpointercapture', endEditorStroke);

  elements.fillSampleBtn.addEventListener('click', async () => {
    try {
      await loadSampleIntoImportBox();
    } catch (error) {
      setMessage(elements.importStatus, error.message, 'error');
    }
  });

  elements.copyCurrentBtn.addEventListener('click', async () => {
    if (!state.currentDocument) return;
    try {
      await copyText(serializePaintDocument(state.currentDocument));
      setMessage(elements.editorStatus, 'Copied current JSON.', 'success');
    } catch (error) {
      setMessage(elements.editorStatus, error.message, 'error');
    }
  });

  elements.importBtn.addEventListener('click', async () => {
    const text = elements.importJsonInput.value.trim();
    if (!text) {
      setMessage(elements.importStatus, 'Paste a JSON string first.', 'error');
      return;
    }

    try {
      await importTemplateFromText(text, elements.templateNameInput.value);
    } catch (error) {
      setMessage(elements.importStatus, error.message, 'error');
    }
  });

  elements.clearImportBtn.addEventListener('click', () => {
    elements.importJsonInput.value = '';
    setMessage(elements.importStatus, 'Paste a JSON string and save it to your library.');
  });

  elements.saveCurrentBtn.addEventListener('click', () => {
    saveCurrentTemplate();
  });

  elements.brushModeBtn.addEventListener('click', () => setTool('brush'));
  elements.eraseModeBtn.addEventListener('click', () => setTool('erase'));
  elements.pickModeBtn.addEventListener('click', () => setTool('pick'));

  elements.moveBtn.addEventListener('click', () => {
    const dx = Number.parseInt(elements.moveXInput.value, 10) || 0;
    const dy = Number.parseInt(elements.moveYInput.value, 10) || 0;
    applyMove(dx, dy);
  });

  elements.resetMoveBtn.addEventListener('click', () => {
    elements.moveXInput.value = '0';
    elements.moveYInput.value = '0';
    setMessage(elements.editorStatus, 'Move inputs reset.', 'success');
  });

  document.querySelectorAll('[data-nudge]').forEach((button) => {
    button.addEventListener('click', () => {
      const [dx, dy] = button.dataset.nudge.split(',').map((value) => Number.parseInt(value, 10));
      applyMove(dx || 0, dy || 0);
    });
  });

  elements.loadCurrentIntoMergeA.addEventListener('click', () => loadCurrentIntoMerge('A'));
  elements.loadCurrentIntoMergeB.addEventListener('click', () => loadCurrentIntoMerge('B'));
  elements.mergeBtn.addEventListener('click', mergeDocumentsFromText);

  elements.copyMergeBtn.addEventListener('click', async () => {
    if (!state.mergeDocument) return;
    try {
      await copyText(elements.mergeOutput.value);
      setMessage(elements.mergeStatus, 'Copied merged JSON.', 'success');
    } catch (error) {
      setMessage(elements.mergeStatus, error.message, 'error');
    }
  });

  elements.saveMergeBtn.addEventListener('click', () => saveMergedTemplate());

  elements.templateNameInput.addEventListener('input', () => {
    state.currentTemplateName = elements.templateNameInput.value.trim();
  });

  window.addEventListener('pointerup', endEditorStroke);
  window.addEventListener('pointercancel', endEditorStroke);
  window.addEventListener('resize', () => {
    renderEditor();
    renderMerge();
    renderLibrary();
  });

  renderAll();
  setMessage(elements.importStatus, 'Paste a JSON string and save it as a named template.');
  if (!elements.templateNameInput.value.trim()) elements.templateNameInput.value = 'Untitled template';
};

init();
