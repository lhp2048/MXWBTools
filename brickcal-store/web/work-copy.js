var DEFAULT_WORK_START = "09:00";
var DEFAULT_WORK_END = "18:00";
var DEFAULT_LUNCH_START = "12:00";
var DEFAULT_LUNCH_MINUTES = 90;
var DEFAULT_WORK_DAY_MS = 9 * 3600 * 1000;

function parseClock(value, fallback) {
  const source = String(value == null || value === "" ? fallback || DEFAULT_WORK_START : value);
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(source);
  if (!m) {
    if (fallback && String(fallback) !== source) {
      return parseClock(fallback, DEFAULT_WORK_START);
    }
    return { hour: 9, minute: 0, text: DEFAULT_WORK_START };
  }
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  return {
    hour: hour,
    minute: minute,
    text: String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0"),
  };
}

function normalizeLunchMinutes(value, fallback) {
  if (value == null || value === "") {
    return fallback == null ? DEFAULT_LUNCH_MINUTES : fallback;
  }
  const n = parseInt(value, 10);
  if (isNaN(n)) {
    return fallback == null ? DEFAULT_LUNCH_MINUTES : fallback;
  }
  return Math.max(0, Math.min(240, n));
}

function clockDate(base, clock, addDays) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), clock.hour, clock.minute, 0, 0);
  if (addDays) {
    d.setDate(d.getDate() + addDays);
  }
  return d;
}

function overlapMs(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function workBounds(base, hours) {
  const start = parseClock(hours && hours.start, DEFAULT_WORK_START);
  const end = parseClock(hours && hours.end, DEFAULT_WORK_END);
  const begin = clockDate(base, start, 0);
  let finish = clockDate(base, end, 0);
  if (finish <= begin) {
    finish = clockDate(base, end, 1);
  }
  return { begin: begin, finish: finish };
}

function lunchBounds(base, hours, workBegin) {
  const mins = normalizeLunchMinutes(hours && hours.lunchMinutes, 0);
  if (mins <= 0) {
    return null;
  }
  const lunch = parseClock(hours && hours.lunchStart, DEFAULT_LUNCH_START);
  let begin = clockDate(base, lunch, 0);
  if (begin < workBegin) {
    begin = clockDate(base, lunch, 1);
  }
  return { begin: begin, end: new Date(begin.getTime() + mins * 60000) };
}

function lunchOverlapMs(startClock, endClock, lunchStart, lunchMinutes) {
  const mins = normalizeLunchMinutes(lunchMinutes, 0);
  if (!mins) {
    return 0;
  }
  const dummy = new Date(2026, 0, 15, 12, 0, 0, 0);
  const hours = {
    start: startClock,
    end: endClock,
    lunchStart: lunchStart || DEFAULT_LUNCH_START,
    lunchMinutes: mins,
  };
  const work = workBounds(dummy, hours);
  const lunch = lunchBounds(dummy, hours, work.begin);
  if (!lunch) {
    return 0;
  }
  return overlapMs(work.begin.getTime(), work.finish.getTime(), lunch.begin.getTime(), lunch.end.getTime());
}

function workDayLengthMs(startClock, endClock, lunchStart, lunchMinutes) {
  const start = parseClock(startClock, DEFAULT_WORK_START);
  const end = parseClock(endClock, DEFAULT_WORK_END);
  let span = (end.hour * 60 + end.minute - (start.hour * 60 + start.minute)) * 60000;
  if (span <= 0) {
    span += 24 * 3600 * 1000;
  }
  if (arguments.length >= 4) {
    span -= lunchOverlapMs(startClock, endClock, lunchStart, lunchMinutes);
  }
  return Math.max(60000, span);
}

function currentWorkHours() {
  if (typeof window !== "undefined" && window.__workHours) {
    return {
      start: parseClock(window.__workHours.start, DEFAULT_WORK_START).text,
      end: parseClock(window.__workHours.end, DEFAULT_WORK_END).text,
      lunchStart: parseClock(window.__workHours.lunchStart, DEFAULT_LUNCH_START).text,
      lunchMinutes: normalizeLunchMinutes(window.__workHours.lunchMinutes),
    };
  }
  return {
    start: DEFAULT_WORK_START,
    end: DEFAULT_WORK_END,
    lunchStart: DEFAULT_LUNCH_START,
    lunchMinutes: DEFAULT_LUNCH_MINUTES,
  };
}

function applyWorkHours(hours) {
  if (typeof window === "undefined") {
    return;
  }
  window.__workHours = {
    start: parseClock(hours && hours.start, DEFAULT_WORK_START).text,
    end: parseClock(hours && hours.end, DEFAULT_WORK_END).text,
    lunchStart: parseClock(hours && hours.lunchStart, DEFAULT_LUNCH_START).text,
    lunchMinutes: normalizeLunchMinutes(hours && hours.lunchMinutes),
  };
}

function workTimerDayKey(at) {
  const d = at instanceof Date ? at : new Date();
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

function applyWorkTimerReset(saved) {
  if (typeof window === "undefined") {
    return;
  }
  const prev = saved || {};
  const savedDay = String(prev.workTimerResetDay || "");
  const today = workTimerDayKey();
  if (savedDay && savedDay === today && prev.workTimerResetAt) {
    window.__workTimerReset = { day: savedDay, at: prev.workTimerResetAt };
  } else {
    window.__workTimerReset = { day: "", at: 0 };
  }
}

function workTimerResetMs(now) {
  if (typeof window === "undefined" || !window.__workTimerReset) {
    return 0;
  }
  const day = workTimerDayKey(now);
  if (window.__workTimerReset.day !== day) {
    return 0;
  }
  return window.__workTimerReset.at || 0;
}

function workTimerResetPayload(at) {
  const d = at instanceof Date ? at : new Date();
  return {
    workTimerResetDay: workTimerDayKey(d),
    workTimerResetAt: d.getTime(),
  };
}

function workElapsedMs(at, hours) {
  const now = at instanceof Date ? at : new Date();
  let cfg;
  if (typeof hours === "string") {
    cfg = {
      start: hours,
      end: DEFAULT_WORK_END,
      lunchStart: DEFAULT_LUNCH_START,
      lunchMinutes: 0,
    };
  } else {
    cfg = hours || currentWorkHours();
  }
  const work = workBounds(now, cfg);
  let startAt = work.begin.getTime();
  const resetAt = workTimerResetMs(now);
  if (resetAt > startAt) {
    startAt = resetAt;
  }
  if (now.getTime() < startAt) {
    return 0;
  }
  let elapsed = now.getTime() - startAt;
  const lunch = lunchBounds(now, cfg, work.begin);
  if (lunch) {
    elapsed -= overlapMs(startAt, now.getTime(), lunch.begin.getTime(), lunch.end.getTime());
  }
  return Math.max(0, elapsed);
}

function isLunchNow(at, hours) {
  const now = at instanceof Date ? at : new Date();
  const cfg = hours || currentWorkHours();
  const work = workBounds(now, cfg);
  const lunch = lunchBounds(now, cfg, work.begin);
  if (!lunch) {
    return false;
  }
  return now >= lunch.begin && now < lunch.end;
}

function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return h + ":" + m + ":" + s;
}

var WORK_QUOTES = [
  "老板说“格局打开”，意思是少要钱多干活。",
  "老板说“把事当自己的”，意思是加班别提钱。",
  "老板说“我们是一家人”，意思是福利按外包算。",
  "老板说“机会难得”，意思是这活没人愿意干。",
  "老板说“共克时艰”，意思是奖金先欠着。",
  "老板说“扁平化管理”，意思是锅从你这儿过。",
  "老板说“结果导向”，意思是过程你自己卷。",
  "老板说“今晚不忙”，意思是你别提前走。",
  "老板说“以公司为家”，意思是家你可以不回。",
  "老板说“你很有潜力”，意思是还能再压一档。",
  "老板说“这是锻炼机会”，意思是没人想接这摊。",
  "老板说“辛苦了”，意思是口头表扬，现金没有。",
  "老板说“年底一起看”，意思是年中先别问。",
  "老板说“股权激励”，意思是画饼技术过硬。",
  "老板说“不是加班是奋斗”，意思是工时别按劳动法算。",
  "老板说“年轻人要拼”，意思是周末也别歇。",
  "老板说“我们不提倡加班”，意思是不加班别想绩效。",
  "老板说“对事不对人”，意思是锅还是你的。",
  "老板说“闭环意识”，意思是从早跟到晚。",
  "老板说“主动承担”，意思是多干别涨薪。",
  "老板说“这个很简单”，意思是你今晚别睡了。",
  "老板说“先做再说”，意思是需求还没想清楚。",
  "老板说“给个方案”，意思是你先写三版我再看。",
  "老板说“你考虑一下”，意思是答案必须是愿意。",
  "老板说“这是信任你”，意思是背锅人选好了。",
  "老板说“站在更高角度看”，意思是别谈加班费。",
  "老板说“弹性工作”，意思是下班弹性，上班不准晚。",
  "老板说“团队作战”，意思是活你干，功他领。",
  "老板说“优化人力结构”，意思是人少了活还在。",
  "老板说“客户第一”，意思是你排第三。",
  "老板说“同步一下”，意思是会议可以再开一场。",
  "老板说“差不多就行”，上线后又说“怎么能这样”。",
  "上班是去搬砖，下班是去养伤。",
  "别人在度假，我们在迭代。",
  "日历上有假期，待办里没有。",
  "工位虽小，锅很大。",
  "需求有三版，截止就一个。",
  "请假需要审批，加班只需要一声“尽快”。",
  "周报写得越满，周末越空。",
  "努力的意义，是让老板的年终更体面。",
  "今天也要创造价值，尤其是给老板。",
  "咖啡续命，进度条续命，老板的承诺不续命。",
  "周末的意义，是把工作电脑带回家。",
  "调休是假的，消息提示是真的。",
  "不是不想躺平，是工资把你钉在工位上。",
];
var WORK_SLOGANS = [
  "努力奋斗，为公司创造价值",
  "今天搬砖，明天还搬",
  "拥抱变化，先拥抱加班",
  "以结果为导向，以加班为路径",
  "把青春献给需求文档",
  "个人成长服务年度KPI",
  "不为假期而来，只为工时而去",
  "奋斗不止，工位不冷",
  "你休息，竞对在迭代",
  "创造价值，从少请假开始",
  "梦想还是要有的，年终奖可以没有",
  "今天也要让老板省心",
  "效率拉满，加班拉满",
  "先完成，再完美，再通宵",
  "使命必达，消息必回",
  "工位即战场，周报即捷报",
  "把事做成，把人做旧",
  "不为自己，为股东负责",
  "保持饥饿，保持在线",
  "奋斗是福报，调休是传说",
  "创造价值，从九点开始",
  "认真工作，认真不回家",
  "今日事今日毕，今日需求明日加",
  "你不奋斗，老板怎么躺",
  "全力以赴，直到电池告急",
  "把不可能留给今晚",
  "成长在公司，休息在下辈子",
  "价值在报表里，人不在假期里",
  "加班创造可能，休息创造问题",
  "世界那么大，工位不能走",
  "把热爱留给需求，把周末留给线上",
  "你的潜力，公司很懂怎么用",
  "幸福是奋斗出来的，班是加出来的",
  "把青春耗在进度条上",
  "站着开会，跪着改需求",
  "先给公司一个未来",
];
var WORK_QUOTE_MS = 15000;
var WORK_SLOGAN_MS = 18000;
var workQuoteState = { text: "", nextAt: 0 };
var workSloganState = { text: "", nextAt: 0 };

function pickWorkQuote(quotes, last, randomFn) {
  const list = quotes || [];
  if (!list.length) {
    return "";
  }
  const rand = typeof randomFn === "function" ? randomFn : Math.random;
  const first = list[Math.floor(rand() * list.length) % list.length];
  if (list.length === 1 || first !== last) {
    return first;
  }
  const others = [];
  for (let i = 0; i < list.length; i++) {
    if (list[i] !== last) {
      others.push(list[i]);
    }
  }
  return others[Math.floor(rand() * others.length) % others.length];
}

function applyWorkCopy(el, state, pool, intervalMs, nowMs) {
  if (!el) {
    return;
  }
  if (!state.text || nowMs >= state.nextAt) {
    const text = pickWorkQuote(pool, state.text);
    state.text = text;
    state.nextAt = nowMs + intervalMs;
    if (el.textContent !== text) {
      el.textContent = text;
      el.classList.remove("swap");
      void el.offsetWidth;
      el.classList.add("swap");
    }
  }
}

function workDayProgress(ms, dayMs) {
  const den = dayMs > 0 ? dayMs : DEFAULT_WORK_DAY_MS;
  return Math.max(0, Math.min(1, (ms || 0) / den));
}

function workOvertimeProgress(ms, dayMs) {
  const den = dayMs > 0 ? dayMs : DEFAULT_WORK_DAY_MS;
  const extra = Math.max(0, (ms || 0) - den);
  return Math.max(0, Math.min(1, extra / den));
}

function mixChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function mixHex(fromHex, toHex, t) {
  const a = parseInt(fromHex.slice(1), 16);
  const b = parseInt(toHex.slice(1), 16);
  const r = mixChannel((a >> 16) & 255, (b >> 16) & 255, t);
  const g = mixChannel((a >> 8) & 255, (b >> 8) & 255, t);
  const bl = mixChannel(a & 255, b & 255, t);
  return (
    "#" +
    ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)
  );
}

var DEFAULT_WORK_COLOR = "#ff8a2b";

function normalizeHex(value) {
  const raw = String(value || "").trim();
  const m6 = /^#?([0-9a-fA-F]{6})$/.exec(raw);
  if (m6) {
    return "#" + m6[1].toLowerCase();
  }
  const m3 = /^#?([0-9a-fA-F]{3})$/.exec(raw);
  if (m3) {
    const s = m3[1];
    return ("#" + s[0] + s[0] + s[1] + s[1] + s[2] + s[2]).toLowerCase();
  }
  return DEFAULT_WORK_COLOR;
}

function hexToRgb(hex) {
  const h = normalizeHex(hex);
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function rgbToHex(r, g, b) {
  function ch(n) {
    const v = Math.max(0, Math.min(255, Math.round(n)));
    return (v + 256).toString(16).slice(1);
  }
  return "#" + ch(r) + ch(g) + ch(b);
}

function colorLuma(hex) {
  const c = hexToRgb(hex);
  return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
}

function shadeHex(hex, amount) {
  const c = hexToRgb(hex);
  const target = amount >= 0 ? { r: 255, g: 255, b: 255 } : { r: 20, g: 8, b: 4 };
  const t = Math.min(1, Math.abs(amount));
  return rgbToHex(
    c.r + (target.r - c.r) * t,
    c.g + (target.g - c.g) * t,
    c.b + (target.b - c.b) * t
  );
}

function applyWorkColor(hex) {
  if (typeof window === "undefined") {
    return;
  }
  window.__workColor = normalizeHex(hex);
}

function currentWorkColor() {
  if (typeof window !== "undefined" && window.__workColor) {
    return normalizeHex(window.__workColor);
  }
  return DEFAULT_WORK_COLOR;
}

function workPanelTone(progress, baseHex) {
  const t = Math.max(0, Math.min(1, progress || 0));
  const base = normalizeHex(baseHex || currentWorkColor());
  const lighten = colorLuma(base) < 0.5;
  const drift = lighten ? t * 0.4 : -t * 0.5;
  return {
    top: shadeHex(base, drift + (t === 0 ? 0 : 0.08)),
    mid: shadeHex(base, drift),
    bottom: shadeHex(base, drift - (t === 0 ? 0 : 0.1)),
    coreTop: shadeHex(base, drift + (t === 0 ? 0 : 0.04)),
    coreBottom: shadeHex(base, drift - (t === 0 ? 0 : 0.12)),
  };
}

function setArcProgress(el, pct) {
  if (!el) {
    return;
  }
  const r = parseFloat(el.getAttribute("r"));
  if (!r) {
    return;
  }
  const c = 2 * Math.PI * r;
  const t = Math.max(0, Math.min(1, pct || 0));
  el.setAttribute("stroke-dasharray", (t * c).toFixed(3) + " " + c.toFixed(3));
}

function applyWorkPanelTone(panel, ring, progress) {
  const tone = workPanelTone(progress);
  if (panel) {
    panel.style.setProperty("--work-top", tone.top);
    panel.style.setProperty("--work-mid", tone.mid);
    panel.style.setProperty("--work-bottom", tone.bottom);
  }
  if (ring) {
    ring.style.setProperty("--work-core-top", tone.coreTop);
    ring.style.setProperty("--work-core-bottom", tone.coreBottom);
  }
}

function tickWorkTimer(at) {
  const timer = document.getElementById("workTimer");
  const ring = document.getElementById("workRing");
  const overtime = document.getElementById("workOvertime");
  const quote = document.getElementById("workQuote");
  const slogan = document.getElementById("workSlogan");
  const panel = document.querySelector(".work-panel");
  const label = document.getElementById("workLabel") || (ring ? ring.querySelector("small") : null);
  if (!timer && !ring && !quote && !slogan && !panel) {
    return;
  }
  const now = at instanceof Date ? at : new Date();
  const hours = currentWorkHours();
  const dayMs = workDayLengthMs(hours.start, hours.end, hours.lunchStart, hours.lunchMinutes);
  const ms = workElapsedMs(now, hours);
  const progress = workDayProgress(ms, dayMs);
  const overtimePct = workOvertimeProgress(ms, dayMs);
  if (timer) {
    timer.textContent = formatDuration(ms);
  }
  if (ring) {
    ring.style.setProperty("--work-pct", progress * 100 + "%");
    setArcProgress(document.getElementById("workRingArc"), progress);
  }
  if (overtime) {
    overtime.style.setProperty("--over-pct", overtimePct * 100 + "%");
    overtime.classList.toggle("on", overtimePct > 0);
    setArcProgress(document.getElementById("workOverArc"), overtimePct);
  }
  if (label) {
    label.textContent = isLunchNow(now, hours) ? "午休中" : overtimePct > 0 ? "加班中" : "已搬砖时长";
  }
  applyWorkPanelTone(panel, ring, progress);
  const t = now.getTime();
  applyWorkCopy(quote, workQuoteState, WORK_QUOTES, WORK_QUOTE_MS, t);
  applyWorkCopy(slogan, workSloganState, WORK_SLOGANS, WORK_SLOGAN_MS, t);
  if (typeof tickBrickFall === "function") {
    tickBrickFall({
      progress: progress,
      overtime: overtimePct > 0,
      lunch: isLunchNow(now, hours),
      rest: !!(panel && panel.classList.contains("rest")),
    });
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    workElapsedMs: workElapsedMs,
    workTimerDayKey: workTimerDayKey,
    workTimerResetPayload: workTimerResetPayload,
    applyWorkTimerReset: applyWorkTimerReset,
    formatDuration: formatDuration,
    parseClock: parseClock,
    workDayLengthMs: workDayLengthMs,
    lunchOverlapMs: lunchOverlapMs,
    normalizeLunchMinutes: normalizeLunchMinutes,
    isLunchNow: isLunchNow,
    workDayProgress: workDayProgress,
    workOvertimeProgress: workOvertimeProgress,
    setArcProgress: setArcProgress,
    workPanelTone: workPanelTone,
    normalizeHex: normalizeHex,
    colorLuma: colorLuma,
    DEFAULT_WORK_COLOR: DEFAULT_WORK_COLOR,
    pickWorkQuote: pickWorkQuote,
    WORK_QUOTES: WORK_QUOTES,
    WORK_SLOGANS: WORK_SLOGANS,
  };
}
