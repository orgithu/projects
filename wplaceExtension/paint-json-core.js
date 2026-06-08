export const TILE_SIZE = 1000;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const toInteger = (value, label) => {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${label} must be an integer.`);
  }
  return n;
};

const toColor = (value, label) => toInteger(value, label);

const floorDiv = (value, divisor) => Math.floor(value / divisor);
const positiveMod = (value, divisor) => ((value % divisor) + divisor) % divisor;

const tileKey = (x, y) => `${x}:${y}`;
const compareTiles = (a, b) => a.y - b.y || a.x - b.x;
const comparePoints = (a, b) => a.y - b.y || a.x - b.x || a.color - b.color;

const cloneTile = (tile) => ({
  x: tile.x,
  y: tile.y,
  points: (tile.points || []).map((point) => ({
    x: point.x,
    y: point.y,
    color: point.color,
  })),
  tileExtras: { ...(tile.tileExtras || {}) },
  pixelExtras: { ...(tile.pixelExtras || {}) },
});

const normalizeDocumentInPlace = (document) => {
  document.tiles = (document.tiles || [])
    .map((tile) => ({
      ...tile,
      points: (tile.points || []).slice().sort(comparePoints),
      tileExtras: { ...(tile.tileExtras || {}) },
      pixelExtras: { ...(tile.pixelExtras || {}) },
    }))
    .filter((tile) => tile.points.length > 0)
    .sort(compareTiles);
  document.topLevelExtras = { ...(document.topLevelExtras || {}) };
  return document;
};

export const clonePaintDocument = (document) =>
  normalizeDocumentInPlace({
    season: document?.season ?? 0,
    topLevelExtras: { ...(document?.topLevelExtras || {}) },
    tiles: (document?.tiles || []).map(cloneTile),
  });

export const normalizePaintDocument = (document) => normalizeDocumentInPlace(clonePaintDocument(document));

export const snapshotToDocument = (snapshot) =>
  normalizePaintDocument({
    season: snapshot?.season ?? 0,
    topLevelExtras: { ...(snapshot?.topLevelExtras || {}) },
    tiles: (snapshot?.tiles || []).map(cloneTile),
  });

const cloneExtras = (source, skipKeys) => {
  const extras = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (skipKeys.includes(key)) continue;
    extras[key] = value;
  }
  return extras;
};

function parseTile(tile, index) {
  if (!isPlainObject(tile)) {
    throw new Error(`Tile ${index + 1} must be an object.`);
  }

  const { x, y, pixels, ...tileExtras } = tile;
  const pixelBox = isPlainObject(pixels) ? pixels : {};
  const pixelX = Array.isArray(pixelBox.x) ? pixelBox.x : [];
  const pixelY = Array.isArray(pixelBox.y) ? pixelBox.y : [];
  const colors = Array.isArray(pixelBox.colors) ? pixelBox.colors : [];

  if (pixelX.length !== pixelY.length || pixelX.length !== colors.length) {
    throw new Error(`Tile ${index + 1} has mismatched pixel arrays.`);
  }

  return {
    x: toInteger(x, `Tile ${index + 1} x`),
    y: toInteger(y, `Tile ${index + 1} y`),
    points: pixelX.map((value, pointIndex) => ({
      x: toInteger(value, `Tile ${index + 1} pixel ${pointIndex + 1} x`),
      y: toInteger(pixelY[pointIndex], `Tile ${index + 1} pixel ${pointIndex + 1} y`),
      color: toColor(colors[pointIndex], `Tile ${index + 1} pixel ${pointIndex + 1} color`),
    })),
    tileExtras,
    pixelExtras: cloneExtras(pixelBox, ['x', 'y', 'colors']),
  };
}

export function parsePaintJson(input) {
  const raw = typeof input === 'string' ? JSON.parse(input) : input;
  if (!isPlainObject(raw)) {
    throw new Error('The JSON root must be an object.');
  }

  const { season = 0, tiles, ...topLevelExtras } = raw;
  if (!Array.isArray(tiles)) {
    throw new Error('The JSON root must include a tiles array.');
  }

  return {
    season,
    topLevelExtras,
    tiles: tiles.map((tile, index) => parseTile(tile, index)),
  };
}

export function movePaintDocument(document, shiftX = 0, shiftY = 0) {
  return snapshotToDocument(buildTransformedSnapshot(document, shiftX, shiftY));
}

export function paintPixel(document, absX, absY, color) {
  const x = toInteger(absX, 'Pixel x');
  const y = toInteger(absY, 'Pixel y');
  const c = toColor(color, 'Color');

  const tx = floorDiv(x, TILE_SIZE);
  const ty = floorDiv(y, TILE_SIZE);
  const px = positiveMod(x, TILE_SIZE);
  const py = positiveMod(y, TILE_SIZE);
  const key = tileKey(tx, ty);

  let tile = document.tiles.find((entry) => entry.x === tx && entry.y === ty);

  if (c === 0) {
    if (!tile) return document;
    const idx = tile.points.findIndex((point) => point.x === px && point.y === py);
    if (idx === -1) return document;
    tile.points.splice(idx, 1);
    if (tile.points.length === 0) document.tiles = document.tiles.filter((entry) => entry !== tile);
    return normalizeDocumentInPlace(document);
  }

  if (!tile) {
    tile = { x: tx, y: ty, points: [], tileExtras: {}, pixelExtras: {} };
    document.tiles.push(tile);
  }

  const existing = tile.points.find((point) => point.x === px && point.y === py);
  if (existing) existing.color = c;
  else tile.points.push({ x: px, y: py, color: c });

  return normalizeDocumentInPlace(document);
}

export function mergePaintDocuments(baseDocument, overlayDocument) {
  const base = normalizePaintDocument(baseDocument);
  const overlay = normalizePaintDocument(overlayDocument);
  const pixels = new Map();
  const tileMeta = new Map();

  const addDocument = (document, priority) => {
    for (const tile of document.tiles) {
      tileMeta.set(tileKey(tile.x, tile.y), {
        priority,
        tileExtras: { ...(tile.tileExtras || {}) },
        pixelExtras: { ...(tile.pixelExtras || {}) },
      });

      const baseAbsX = tile.x * TILE_SIZE;
      const baseAbsY = tile.y * TILE_SIZE;
      for (const point of tile.points) {
        const absX = baseAbsX + point.x;
        const absY = baseAbsY + point.y;
        const pointKey = `${absX}:${absY}`;
        if (point.color === 0) pixels.delete(pointKey);
        else pixels.set(pointKey, { x: absX, y: absY, color: point.color });
      }
    }
  };

  addDocument(base, 0);
  addDocument(overlay, 1);

  const groups = new Map();
  for (const point of pixels.values()) {
    const tx = floorDiv(point.x, TILE_SIZE);
    const ty = floorDiv(point.y, TILE_SIZE);
    const key = tileKey(tx, ty);
    const localX = positiveMod(point.x, TILE_SIZE);
    const localY = positiveMod(point.y, TILE_SIZE);

    if (!groups.has(key)) {
      const meta = tileMeta.get(key) || { tileExtras: {}, pixelExtras: {} };
      groups.set(key, {
        x: tx,
        y: ty,
        points: [],
        tileExtras: { ...meta.tileExtras },
        pixelExtras: { ...meta.pixelExtras },
      });
    }

    groups.get(key).points.push({ x: localX, y: localY, color: point.color });
  }

  return normalizePaintDocument({
    season: overlay.season ?? base.season,
    topLevelExtras: { ...(base.topLevelExtras || {}), ...(overlay.topLevelExtras || {}) },
    tiles: Array.from(groups.values()),
  });
}

export function buildTransformedSnapshot(document, shiftX = 0, shiftY = 0) {
  const dx = toInteger(shiftX, 'Shift X');
  const dy = toInteger(shiftY, 'Shift Y');

  const groups = new Map();
  const colorUsage = new Map();
  let pointCount = 0;
  let visiblePointCount = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const sourceTile of document.tiles) {
    const baseAbsX = sourceTile.x * TILE_SIZE;
    const baseAbsY = sourceTile.y * TILE_SIZE;

    for (const point of sourceTile.points) {
      const absX = baseAbsX + point.x + dx;
      const absY = baseAbsY + point.y + dy;
      const tileX = floorDiv(absX, TILE_SIZE);
      const tileY = floorDiv(absY, TILE_SIZE);
      const localX = positiveMod(absX, TILE_SIZE);
      const localY = positiveMod(absY, TILE_SIZE);
      const key = `${tileX}:${tileY}`;

      if (!groups.has(key)) {
        groups.set(key, {
          x: tileX,
          y: tileY,
          points: [],
          tileExtras: { ...sourceTile.tileExtras },
          pixelExtras: { ...sourceTile.pixelExtras },
        });
      }

      const bucket = groups.get(key);
      bucket.points.push({ x: localX, y: localY, color: point.color });

      pointCount += 1;
      if (point.color !== 0) visiblePointCount += 1;
      colorUsage.set(point.color, (colorUsage.get(point.color) || 0) + 1);

      if (absX < minX) minX = absX;
      if (absY < minY) minY = absY;
      if (absX > maxX) maxX = absX;
      if (absY > maxY) maxY = absY;
    }
  }

  const tiles = Array.from(groups.values());
  const bounds = pointCount > 0
    ? {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      }
    : null;

  return {
    season: document.season,
    topLevelExtras: { ...document.topLevelExtras },
    tiles,
    shiftX: dx,
    shiftY: dy,
    pointCount,
    visiblePointCount,
    colorUsage,
    bounds,
  };
}

export function serializePaintSnapshot(snapshot) {
  const output = {
    season: snapshot.season,
    tiles: snapshot.tiles.map((tile) => {
      const pixels = {
        x: tile.points.map((point) => point.x),
        y: tile.points.map((point) => point.y),
        colors: tile.points.map((point) => point.color),
      };

      for (const [key, value] of Object.entries(tile.pixelExtras || {})) {
        if (key === 'x' || key === 'y' || key === 'colors') continue;
        pixels[key] = value;
      }

      const tileOut = {
        x: tile.x,
        y: tile.y,
        pixels,
      };

      for (const [key, value] of Object.entries(tile.tileExtras || {})) {
        tileOut[key] = value;
      }

      return tileOut;
    }),
  };

  for (const [key, value] of Object.entries(snapshot.topLevelExtras || {})) {
    if (key === 'season' || key === 'tiles') continue;
    output[key] = value;
  }

  return JSON.stringify(output, null, 2);
}

export function serializePaintDocument(document) {
  return serializePaintSnapshot(normalizePaintDocument(document));
}
