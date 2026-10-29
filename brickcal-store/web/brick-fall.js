var BRICK_CAP_RATIO = 0.8;
var BRICK_FLOOR_PAD = 2;
var BRICK_SIDE_PAD = 8;
var BRICK_DROP_CD_MS = 3000;
var DEFAULT_BRICK_LABEL = "砖";

function normalizeBrickLabel(value) {
  const text = String(value == null ? "" : value).trim();
  if (!text) {
    return DEFAULT_BRICK_LABEL;
  }
  return Array.from(text).slice(0, 2).join("");
}

function brickEaseProgress(progress) {
  const p = Math.max(0, Math.min(1, progress || 0));
  return 1 - Math.pow(1 - p, 1.55);
}

function brickMaxCount(width, height, size) {
  const capH = Math.max(1, height * BRICK_CAP_RATIO);
  const cols = Math.max(3, Math.floor(width / (size * 1.08)));
  const rows = Math.max(2, Math.floor(capH / (size * 1.05)));
  return Math.min(72, cols * rows);
}

function brickTargetCount(progress, maxCount) {
  return Math.floor(brickEaseProgress(progress) * (maxCount || 0));
}

function brickSpawnDelayMs(progress, pileRatio) {
  const p = Math.max(0, Math.min(1, progress || 0));
  const pile = Math.max(0, Math.min(1, pileRatio || 0));
  const want = brickWantPileRatio(p);
  let slow = 380 + p * p * 4600;
  // 堆已超当前工时目标时不硬停，只大幅放慢，避免“半屏就不动了”
  if (pile > want + 0.01) {
    const room = Math.max(0.08, BRICK_CAP_RATIO - want);
    const ahead = Math.max(0, Math.min(1, (pile - want) / room));
    slow *= 5 + ahead * 14;
  }
  const pileSlow = pile > 0.5 ? 1 + (pile - 0.5) * 6 : 1;
  return slow * pileSlow;
}

var brickFall = {
  canvas: null,
  ctx: null,
  running: false,
  lastTs: 0,
  falling: [],
  settled: [],
  size: 26,
  nextSpawnAt: 0,
  progress: 0,
  rest: false,
  lunch: false,
  reduceMotion: false,
  dayKey: "",
  caughtUp: true,
  manualDropAt: 0,
  frozen: false,
  savedNorm: null,
  layoutW: 0,
  layoutH: 0,
  label: DEFAULT_BRICK_LABEL,
};

function brickNowDayKey(at) {
  const d = at instanceof Date ? at : new Date();
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

function brickClearStats(saved, at) {
  const day = brickNowDayKey(at);
  const prev = saved || {};
  const same = String(prev.brickClearDay || "") === day;
  const count = same ? parseInt(prev.brickClearCount, 10) || 0 : 0;
  return { day: day, count: Math.max(0, count) };
}

function brickClearPayload(saved, at) {
  const stats = brickClearStats(saved, at);
  const when = at instanceof Date ? at.getTime() : Date.now();
  return {
    brickClearDay: stats.day,
    brickClearCount: stats.count + 1,
    brickClearAt: when,
    brickManualDay: stats.day,
    brickManualCount: 0,
    brickPileDay: stats.day,
    brickPile: [],
  };
}

function brickManualStats(saved, at) {
  const day = brickNowDayKey(at);
  const prev = saved || {};
  const same = String(prev.brickManualDay || "") === day;
  const count = same ? parseInt(prev.brickManualCount, 10) || 0 : 0;
  return { day: day, count: Math.max(0, count) };
}

function brickManualDropPayload(saved, at) {
  const stats = brickManualStats(saved, at);
  return {
    brickManualDay: stats.day,
    brickManualCount: stats.count + 1,
  };
}

function brickAutoSpawnAllowed(state) {
  if (!state || state.rest || state.lunch) {
    return false;
  }
  return (state.progress || 0) > 0;
}

function brickRoundNorm(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function brickSerializePile(bricks, box) {
  if (!box || !box.w || !box.h) {
    return [];
  }
  return (bricks || []).map(function (b) {
    return {
      x: brickRoundNorm(b.x / box.w),
      yb: brickRoundNorm((box.h - b.y) / box.h),
      s: brickRoundNorm(b.s / box.w),
      rot: brickRoundNorm(b.rot || 0),
    };
  });
}

function brickDeserializePile(items, box) {
  if (!box || !box.w || !box.h) {
    return [];
  }
  return (items || []).map(function (it) {
    const s = Math.max(16, (Number(it.s) || 0.09) * box.w);
    const half = s * 0.5;
    const x = Math.max(BRICK_SIDE_PAD + half, Math.min(box.w - BRICK_SIDE_PAD - half, (Number(it.x) || 0) * box.w));
    const floor = box.h - BRICK_FLOOR_PAD - half;
    let y;
    if (it.yb != null && it.yb !== "") {
      y = box.h - (Number(it.yb) || 0) * box.h;
    } else {
      y = (Number(it.y) || 0) * box.h;
    }
    y = Math.max(half, Math.min(floor, y));
    return { x: x, y: y, s: s, rot: Number(it.rot) || 0 };
  });
}

function brickPileFromSaved(saved, at) {
  const day = brickNowDayKey(at);
  const prev = saved || {};
  if (String(prev.brickPileDay || "") !== day) {
    return [];
  }
  return Array.isArray(prev.brickPile) ? prev.brickPile : [];
}

function brickPanelBox() {
  const panel = document.getElementById("workPanel");
  if (!panel) {
    return { w: 0, h: 0 };
  }
  return { w: panel.clientWidth, h: panel.clientHeight };
}

function brickShiftForLayout(oldW, oldH, newW, newH) {
  const dw = newW - oldW;
  const dh = newH - oldH;
  if ((!dw && !dh) || !oldW || !oldH) {
    return;
  }
  const sx = newW / oldW;
  function shift(b) {
    if (dw) {
      b.x *= sx;
      b.s *= sx;
    }
    if (dh) {
      b.y += dh;
    }
  }
  for (let i = 0; i < brickFall.settled.length; i++) {
    shift(brickFall.settled[i]);
  }
  for (let i = 0; i < brickFall.falling.length; i++) {
    shift(brickFall.falling[i]);
  }
}

function brickResizeCanvas() {
  const canvas = brickFall.canvas;
  const panel = document.getElementById("workPanel");
  if (!canvas || !panel) {
    return;
  }
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = panel.clientWidth;
  const h = panel.clientHeight;
  const prevW = brickFall.layoutW || 0;
  const prevH = brickFall.layoutH || 0;
  if (prevW && prevH && (w !== prevW || h !== prevH)) {
    brickShiftForLayout(prevW, prevH, w, h);
  }
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
  }
  if (brickFall.ctx) {
    brickFall.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  brickFall.size = Math.max(22, Math.min(30, Math.round(w * 0.09)));
  brickFall.layoutW = w;
  brickFall.layoutH = h;
}

function brickPileRatio() {
  const box = brickPanelBox();
  if (!box.h || !brickFall.settled.length) {
    return 0;
  }
  let top = box.h;
  for (let i = 0; i < brickFall.settled.length; i++) {
    const b = brickFall.settled[i];
    top = Math.min(top, b.y - b.s * 0.5);
  }
  return Math.max(0, (box.h - top) / box.h);
}

function brickWantPileRatio(progress) {
  return brickEaseProgress(progress) * BRICK_CAP_RATIO;
}

function brickCanSpawn() {
  if (!brickAutoSpawnAllowed(brickFall)) {
    return false;
  }
  if ((brickFall.progress || 0) <= 0) {
    return false;
  }
  // 自动掉砖直到视觉封顶；是否“超前工时”只影响间隔，不再直接停掉
  return brickPileRatio() < BRICK_CAP_RATIO - 0.01;
}

function makeBrick(x, y, falling) {
  const s = brickFall.size * (0.92 + Math.random() * 0.16);
  return {
    x: x,
    y: y,
    s: s,
    vx: falling ? (Math.random() - 0.5) * 46 : 0,
    vy: falling ? 18 + Math.random() * 24 : 0,
    rot: falling ? (Math.random() - 0.5) * 0.6 : (Math.random() - 0.5) * 0.12,
    vr: falling ? (Math.random() - 0.5) * 3.2 : 0,
    live: !!falling,
  };
}

function packSettled(count) {
  const box = brickPanelBox();
  const s = brickFall.size;
  const pad = BRICK_SIDE_PAD;
  const gap = s * 1.06;
  const cols = Math.max(3, Math.floor((box.w - pad * 2) / gap));
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * gap + s * 0.5 + (Math.random() - 0.5) * 5;
    const y = box.h - BRICK_FLOOR_PAD - row * gap - s * 0.5;
    if ((box.h - (y - s * 0.5)) / box.h > BRICK_CAP_RATIO) {
      break;
    }
    brickFall.settled.push(makeBrick(x, y, false));
  }
}

function spawnFalling() {
  if (brickFall.falling.length >= 2) {
    return false;
  }
  const box = brickPanelBox();
  const x = box.w * 0.5 + (Math.random() - 0.5) * 18;
  brickFall.falling.push(makeBrick(x, -brickFall.size, true));
  return true;
}

function brickClampDropX(x, width, size) {
  const half = (size || 26) * 0.5;
  const w = width || 0;
  if (!w) {
    return 0;
  }
  return Math.max(BRICK_SIDE_PAD + half, Math.min(w - BRICK_SIDE_PAD - half, x));
}

function brickDropReady(now, lastAt) {
  const t = typeof now === "number" ? now : Date.now();
  return t - (lastAt || 0) >= BRICK_DROP_CD_MS;
}

function brickCanManualDrop(state, now, pileRatio) {
  if (!state || !state.running) {
    return false;
  }
  if (!brickDropReady(now, state.manualDropAt)) {
    return false;
  }
  if ((pileRatio || 0) >= BRICK_CAP_RATIO - 0.01) {
    return false;
  }
  return true;
}

function brickShouldClearOnTick(prevRest, nextRest, prevDay, nextDay) {
  if (!prevDay) {
    return false;
  }
  if (String(prevDay) !== String(nextDay || "")) {
    return true;
  }
  return !!nextRest && !prevRest;
}

function spawnFallingAt(x) {
  const box = brickPanelBox();
  if (!box.w) {
    return false;
  }
  const cx = brickClampDropX(x, box.w, brickFall.size);
  const b = makeBrick(cx, -brickFall.size, true);
  b.vx = (Math.random() - 0.5) * 12;
  brickFall.falling.push(b);
  return true;
}

function dropBrickAt(x, now) {
  const t = typeof now === "number" ? now : Date.now();
  if (!brickCanManualDrop(brickFall, t, brickPileRatio())) {
    return false;
  }
  if (!spawnFallingAt(x)) {
    return false;
  }
  brickFall.manualDropAt = t;
  persistManualBrick();
  return true;
}

function onBrickPanelDouble(e) {
  if (e.type === "click" && e.detail !== 2) {
    return;
  }
  e.preventDefault();
  const panel = document.getElementById("workPanel");
  if (!panel) {
    return;
  }
  const rect = panel.getBoundingClientRect();
  dropBrickAt(e.clientX - rect.left);
}

function bindBrickDrop() {
  const panel = document.getElementById("workPanel");
  if (!panel || panel.getAttribute("data-brick-drop") === "1") {
    return;
  }
  panel.setAttribute("data-brick-drop", "1");
  panel.addEventListener("click", onBrickPanelDouble, true);
  panel.addEventListener("dblclick", onBrickPanelDouble, true);
}

function settleBrick(b) {
  b.live = false;
  b.vx = 0;
  b.vy = 0;
  b.vr = 0;
  b.rot *= 0.35;
  brickFall.settled.push(b);
  schedulePersistBrickPile();
}

function collideStatic(b, other) {
  const dx = b.x - other.x;
  const dy = b.y - other.y;
  const min = (b.s + other.s) * 0.52;
  const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
  if (dist >= min) {
    return false;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = min - dist;
  b.x += nx * overlap;
  b.y += ny * overlap;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= vn * nx * 1.35;
    b.vy -= vn * ny * 1.35;
  }
  b.vx += nx * 18;
  b.vr += (nx > 0 ? 1 : -1) * 0.8;
  return true;
}

function stepFalling(dt) {
  const box = brickPanelBox();
  const g = 1680;
  const pad = BRICK_SIDE_PAD;
  const floor = box.h - BRICK_FLOOR_PAD;
  const left = pad;
  const right = box.w - pad;
  const keep = [];
  for (let i = 0; i < brickFall.falling.length; i++) {
    const b = brickFall.falling[i];
    b.vy += g * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.vr * dt;
    b.vx *= 0.995;
    b.vr *= 0.992;
    if (b.x - b.s * 0.5 < left) {
      b.x = left + b.s * 0.5;
      b.vx = Math.abs(b.vx) * 0.35;
    }
    if (b.x + b.s * 0.5 > right) {
      b.x = right - b.s * 0.5;
      b.vx = -Math.abs(b.vx) * 0.35;
    }
    let hit = false;
    for (let j = 0; j < brickFall.settled.length; j++) {
      if (collideStatic(b, brickFall.settled[j])) {
        hit = true;
      }
    }
    if (b.y + b.s * 0.5 >= floor) {
      b.y = floor - b.s * 0.5;
      hit = true;
      b.vy *= -0.18;
      b.vx *= 0.7;
    }
    const slow = Math.abs(b.vy) < 55 && Math.abs(b.vx) < 40;
    if (hit && slow && b.y > box.h * 0.12) {
      settleBrick(b);
    } else {
      keep.push(b);
    }
  }
  brickFall.falling = keep;
}

function setBrickLabel(value) {
  brickFall.label = normalizeBrickLabel(value);
  return brickFall.label;
}

function drawBrick(ctx, b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.rot);
  const s = b.s;
  const r = Math.max(3, s * 0.16);
  const label = brickFall.label || DEFAULT_BRICK_LABEL;
  const chars = Array.from(label).length;
  ctx.fillStyle = "rgba(255, 250, 241, 0.94)";
  ctx.strokeStyle = "rgba(90, 28, 8, 0.38)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(-s / 2, -s / 2, s, s, r);
  } else {
    ctx.rect(-s / 2, -s / 2, s, s);
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(196, 92, 38, 0.95)";
  ctx.font =
    "700 " +
    Math.round(s * (chars > 1 ? 0.4 : 0.56)) +
    "px 'Microsoft YaHei','PingFang SC',sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, 1);
  ctx.restore();
}

function drawAtmosphere(ctx, ts, w, h) {
  const t = ts * 0.00022;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const cx = w * (0.2 + 0.3 * i) + Math.sin(t + i) * 18;
    const cy = h * (0.18 + 0.22 * i) + Math.cos(t * 0.8 + i) * 22;
    const rad = w * (0.28 + i * 0.08);
    const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, rad);
    g.addColorStop(0, "rgba(255,255,255,0.16)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function brickResetDay() {
  brickFall.falling = [];
  brickFall.settled = [];
  brickFall.nextSpawnAt = 0;
  brickFall.caughtUp = false;
  brickFall.frozen = false;
}

function brickCatchUp() {
  if (brickFall.frozen) {
    brickFall.caughtUp = true;
    return;
  }
  if (brickFall.caughtUp) {
    return;
  }
  brickFall.caughtUp = true;
  const want = brickWantPileRatio(brickFall.progress);
  if (want <= 0.02 || brickPileRatio() >= want - 0.05) {
    return;
  }
  const box = brickPanelBox();
  const maxN = brickMaxCount(box.w, box.h, brickFall.size);
  let guard = 0;
  while (brickPileRatio() < want - 0.1 && brickFall.settled.length < maxN && guard < maxN) {
    packSettled(1);
    guard += 1;
  }
  brickFall.nextSpawnAt = 0;
  spawnFalling();
  schedulePersistBrickPile();
}

function brickLoop(ts) {
  if (!brickFall.running) {
    return;
  }
  brickResizeCanvas();
  const ctx = brickFall.ctx;
  const box = brickPanelBox();
  if (!ctx || !box.w) {
    requestAnimationFrame(brickLoop);
    return;
  }
  const dt = Math.min(0.033, brickFall.lastTs ? (ts - brickFall.lastTs) / 1000 : 0.016);
  brickFall.lastTs = ts;
  if (!brickFall.reduceMotion || brickFall.falling.length) {
    stepFalling(dt);
  }
  if (ts >= brickFall.nextSpawnAt && brickCanSpawn()) {
    if (spawnFalling()) {
      brickFall.nextSpawnAt = ts + brickSpawnDelayMs(brickFall.progress, brickPileRatio());
    }
  }
  ctx.clearRect(0, 0, box.w, box.h);
  drawAtmosphere(ctx, ts, box.w, box.h);
  for (let i = 0; i < brickFall.settled.length; i++) {
    drawBrick(ctx, brickFall.settled[i]);
  }
  for (let i = 0; i < brickFall.falling.length; i++) {
    drawBrick(ctx, brickFall.falling[i]);
  }
  requestAnimationFrame(brickLoop);
}

function persistBrickPileNow() {
  if (schedulePersistBrickPile.timer) {
    clearTimeout(schedulePersistBrickPile.timer);
    schedulePersistBrickPile.timer = 0;
  }
  const box = brickPanelBox();
  const items = brickSerializePile(brickFall.settled, box);
  brickFall.savedNorm = items;
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
    return;
  }
  // 砖堆坐标只存 local：sync 单条约 8KB，砖多时会写失败，看起来像“没保存”
  const data = {
    brickPileDay: brickNowDayKey(),
    brickPile: items,
  };
  try {
    chrome.storage.local.set(data);
  } catch (err) {}
  try {
    if (chrome.storage.sync && chrome.storage.sync.remove) {
      chrome.storage.sync.remove(["brickPile", "brickPileDay"]);
    }
  } catch (err2) {}
}

function schedulePersistBrickPile() {
  if (schedulePersistBrickPile.timer) {
    clearTimeout(schedulePersistBrickPile.timer);
  }
  schedulePersistBrickPile.timer = setTimeout(persistBrickPileNow, 200);
}

function applyNormPile(items) {
  const box = brickPanelBox();
  const poses = brickDeserializePile(items, box);
  if (!poses.length && !(items && items.length)) {
    brickFall.falling = [];
    brickFall.settled = [];
    return !!box.w;
  }
  if (!box.w) {
    return false;
  }
  brickFall.falling = [];
  brickFall.settled = poses.map(function (p) {
    const b = makeBrick(p.x, p.y, false);
    b.s = p.s;
    b.rot = p.rot;
    b.vx = 0;
    b.vy = 0;
    b.vr = 0;
    b.live = false;
    return b;
  });
  return true;
}

function queueRestorePile() {
  function tryApply() {
    if (!brickFall.savedNorm) {
      return;
    }
    brickResizeCanvas();
    if (!applyNormPile(brickFall.savedNorm)) {
      requestAnimationFrame(tryApply);
    }
  }
  requestAnimationFrame(tryApply);
}

function restoreBrickPile(saved) {
  const snapshot = brickPileFromSaved(saved);
  const cleared = brickClearStats(saved).count > 0;
  brickFall.frozen = cleared;
  if (snapshot.length) {
    brickFall.caughtUp = true;
    brickFall.savedNorm = snapshot;
    queueRestorePile();
    return;
  }
  brickFall.savedNorm = [];
  if (cleared) {
    clearBrickPile();
    brickFall.frozen = true;
    return;
  }
  brickFall.caughtUp = false;
}

function persistManualBrick() {
  if (typeof chrome === "undefined" || !chrome.storage) {
    return;
  }
  const defaults = { brickManualDay: "", brickManualCount: 0 };
  function write(saved) {
    const data = brickManualDropPayload(saved);
    const setter = chrome.storage.sync && chrome.storage.sync.set
      ? chrome.storage.sync.set(data)
      : null;
    if (setter && setter.catch) {
      setter.catch(function () {
        chrome.storage.local.set(data);
      });
      return;
    }
    try {
      chrome.storage.sync.set(data);
    } catch (err) {
      chrome.storage.local.set(data);
    }
  }
  try {
    chrome.storage.sync.get(defaults, function (items) {
      if (chrome.runtime.lastError) {
        chrome.storage.local.get(defaults, write);
        return;
      }
      write(items);
    });
  } catch (err) {
    try {
      chrome.storage.local.get(defaults, write);
    } catch (err2) {}
  }
}

function clearBrickPile() {
  brickFall.falling = [];
  brickFall.settled = [];
  brickFall.nextSpawnAt = 0;
  brickFall.caughtUp = true;
  brickFall.frozen = true;
  brickFall.savedNorm = [];
  persistBrickPileNow();
}

function bindBrickPersistFlush() {
  if (bindBrickPersistFlush.done) {
    return;
  }
  bindBrickPersistFlush.done = true;
  window.addEventListener("pagehide", persistBrickPileNow);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      persistBrickPileNow();
    }
  });
}

function startBrickFall() {
  const canvas = document.getElementById("brickCanvas");
  if (!canvas || brickFall.running) {
    return;
  }
  brickFall.canvas = canvas;
  brickFall.ctx = canvas.getContext("2d");
  brickFall.reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  brickFall.dayKey = brickNowDayKey();
  brickFall.running = true;
  brickResizeCanvas();
  bindBrickDrop();
  bindBrickPersistFlush();
  if (brickFall.savedNorm && brickFall.savedNorm.length) {
    queueRestorePile();
  }
  requestAnimationFrame(brickLoop);
}

function tickBrickFall(info) {
  info = info || {};
  const day = brickNowDayKey();
  const rest = !!info.rest;
  if (brickShouldClearOnTick(brickFall.rest, rest, brickFall.dayKey, day)) {
    brickFall.dayKey = day;
    brickResetDay();
  } else {
    brickFall.dayKey = day;
  }
  brickFall.progress = info.progress || 0;
  brickFall.rest = rest;
  const wasLunch = brickFall.lunch;
  brickFall.lunch = !!info.lunch;
  if (wasLunch && !brickFall.lunch) {
    brickFall.nextSpawnAt = 0;
  }
  if (brickFall.rest || brickFall.lunch || brickFall.progress <= 0) {
    return;
  }
  brickCatchUp();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    brickEaseProgress: brickEaseProgress,
    brickWantPileRatio: brickWantPileRatio,
    brickMaxCount: brickMaxCount,
    brickTargetCount: brickTargetCount,
    brickSpawnDelayMs: brickSpawnDelayMs,
    brickClearStats: brickClearStats,
    brickClearPayload: brickClearPayload,
    brickManualStats: brickManualStats,
    brickManualDropPayload: brickManualDropPayload,
    brickAutoSpawnAllowed: brickAutoSpawnAllowed,
    brickSerializePile: brickSerializePile,
    brickDeserializePile: brickDeserializePile,
    brickPileFromSaved: brickPileFromSaved,
    brickClampDropX: brickClampDropX,
    brickDropReady: brickDropReady,
    brickCanManualDrop: brickCanManualDrop,
    brickShouldClearOnTick: brickShouldClearOnTick,
    normalizeBrickLabel: normalizeBrickLabel,
    DEFAULT_BRICK_LABEL: DEFAULT_BRICK_LABEL,
    BRICK_CAP_RATIO: BRICK_CAP_RATIO,
    BRICK_DROP_CD_MS: BRICK_DROP_CD_MS,
  };
}
