var SETTINGS_DEFAULTS = {
  homeCountry: "CN",
  workStart: "09:00",
  workEnd: "18:00",
  lunchStart: "12:00",
  lunchMinutes: 90,
  workColor: "#ff8a2b",
  weekStart: "sun",
  monthSwitch: "dblclick",
  brickLabel: "砖",
  brickClearDay: "",
  brickClearCount: 0,
  brickClearAt: 0,
  brickManualDay: "",
  brickManualCount: 0,
  brickPileDay: "",
  brickPile: [],
};

var optionsState = {
  payload: null,
  homeCountry: "CN",
  workStart: "09:00",
  workEnd: "18:00",
  lunchStart: "12:00",
  lunchMinutes: 90,
  workColor: "#ff8a2b",
  weekStart: "sun",
  monthSwitch: "dblclick",
  brickLabel: "砖",
};

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadSettings() {
  return chrome.storage.sync.get(SETTINGS_DEFAULTS).catch(function () {
    return chrome.storage.local.get(SETTINGS_DEFAULTS);
  });
}

function saveSettings(data) {
  return chrome.storage.sync.set(data).catch(function () {
    return chrome.storage.local.set(data);
  });
}

function showSaved() {
  const msg = document.getElementById("saveMsg");
  msg.hidden = false;
  clearTimeout(showSaved.timer);
  showSaved.timer = setTimeout(function () {
    msg.hidden = true;
  }, 1200);
}

function persist() {
  const start = parseClock(document.getElementById("workStart").value, SETTINGS_DEFAULTS.workStart);
  const end = parseClock(document.getElementById("workEnd").value, SETTINGS_DEFAULTS.workEnd);
  if (start.text === end.text) {
    document.getElementById("saveMsg").hidden = false;
    document.getElementById("saveMsg").textContent = "上班和下班不能是同一时刻";
    document.getElementById("saveMsg").style.color = "#c45c26";
    return;
  }
  document.getElementById("saveMsg").style.color = "";
  document.getElementById("saveMsg").textContent = "已保存";
  optionsState.workStart = start.text;
  optionsState.workEnd = end.text;
  optionsState.lunchStart = parseClock(document.getElementById("lunchStart").value, SETTINGS_DEFAULTS.lunchStart).text;
  optionsState.lunchMinutes = normalizeLunchMinutes(document.getElementById("lunchMinutes").value);
  optionsState.homeCountry = document.getElementById("homeSelect").value || "CN";
  optionsState.workColor = normalizeHex(document.getElementById("workColor").value);
  optionsState.weekStart = normalizeWeekStart(document.getElementById("weekStart").value) === 1 ? "mon" : "sun";
  optionsState.monthSwitch = normalizeMonthSwitch(document.getElementById("monthSwitch").value);
  optionsState.brickLabel = normalizeBrickLabel(document.getElementById("brickLabel").value);
  document.getElementById("workStart").value = start.text;
  document.getElementById("workEnd").value = end.text;
  document.getElementById("lunchStart").value = optionsState.lunchStart;
  document.getElementById("lunchMinutes").value = String(optionsState.lunchMinutes);
  document.getElementById("workColor").value = optionsState.workColor;
  document.getElementById("weekStart").value = optionsState.weekStart;
  document.getElementById("monthSwitch").value = optionsState.monthSwitch;
  document.getElementById("brickLabel").value = optionsState.brickLabel;
  updateColorPreview();
  return saveSettings({
    homeCountry: optionsState.homeCountry,
    workStart: optionsState.workStart,
    workEnd: optionsState.workEnd,
    lunchStart: optionsState.lunchStart,
    lunchMinutes: optionsState.lunchMinutes,
    workColor: optionsState.workColor,
    weekStart: optionsState.weekStart,
    monthSwitch: optionsState.monthSwitch,
    brickLabel: optionsState.brickLabel,
  }).then(function () {
    showSaved();
  });
}

function renderClearStat(saved) {
  const stats = brickClearStats(saved);
  document.getElementById("clearStat").textContent = "今天已清 " + stats.count + " 次";
}

function clearBricksNow() {
  if (clearBricksNow.busy) {
    return;
  }
  clearBricksNow.busy = true;
  loadSettings()
    .then(function (saved) {
      const payload = brickClearPayload(saved);
      return saveSettings(payload).then(function () {
        return chrome.storage.local.set({
          brickPileDay: payload.brickPileDay,
          brickPile: [],
        });
      }).then(function () {
        renderClearStat(payload);
      });
    })
    .then(function () {
      clearBricksNow.busy = false;
    }, function () {
      clearBricksNow.busy = false;
    });
}

function renderHome() {
  const select = document.getElementById("homeSelect");
  const countries = (optionsState.payload && optionsState.payload.countries) || {};
  const codes = Object.keys(countries).sort();
  select.innerHTML = codes
    .map(function (code) {
      const sel = code === optionsState.homeCountry ? " selected" : "";
      return (
        "<option value=\"" +
        code +
        "\"" +
        sel +
        ">" +
        escapeHtml(zhCountryName(code, countries[code].name || code)) +
        " " +
        code +
        "</option>"
      );
    })
    .join("");
}

function updateColorPreview() {
  const hex = normalizeHex(document.getElementById("workColor").value);
  const start = workPanelTone(0, hex).mid;
  const end = workPanelTone(1, hex).mid;
  const preview = document.getElementById("colorPreview");
  preview.style.background = "linear-gradient(90deg, " + start + " 0%, " + end + " 100%)";
  document.getElementById("workColorText").textContent = hex;
}

function bind() {
  document.getElementById("workStart").addEventListener("change", persist);
  document.getElementById("workEnd").addEventListener("change", persist);
  document.getElementById("lunchStart").addEventListener("change", persist);
  document.getElementById("lunchMinutes").addEventListener("change", persist);
  document.getElementById("homeSelect").addEventListener("change", persist);
  document.getElementById("weekStart").addEventListener("change", persist);
  document.getElementById("monthSwitch").addEventListener("change", persist);
  document.getElementById("brickLabel").addEventListener("change", persist);
  document.getElementById("workColor").addEventListener("input", function () {
    updateColorPreview();
  });
  document.getElementById("workColor").addEventListener("change", persist);
  document.getElementById("clearBricks").addEventListener("click", clearBricksNow);
}

Promise.all([fetch("./data/holidays.json").then(function (r) { return r.json(); }), loadSettings()])
  .then(function (pair) {
    optionsState.payload = pair[0];
    optionsState.homeCountry = pair[1].homeCountry || "CN";
    if (!optionsState.payload.countries[optionsState.homeCountry]) {
      optionsState.homeCountry = "CN";
    }
    optionsState.workStart = parseClock(pair[1].workStart, SETTINGS_DEFAULTS.workStart).text;
    optionsState.workEnd = parseClock(pair[1].workEnd, SETTINGS_DEFAULTS.workEnd).text;
    optionsState.lunchStart = parseClock(pair[1].lunchStart, SETTINGS_DEFAULTS.lunchStart).text;
    optionsState.lunchMinutes = normalizeLunchMinutes(pair[1].lunchMinutes);
    optionsState.workColor = normalizeHex(pair[1].workColor || SETTINGS_DEFAULTS.workColor);
    optionsState.weekStart = normalizeWeekStart(pair[1].weekStart) === 1 ? "mon" : "sun";
    optionsState.monthSwitch = normalizeMonthSwitch(pair[1].monthSwitch);
    optionsState.brickLabel = normalizeBrickLabel(pair[1].brickLabel);
    document.getElementById("workStart").value = optionsState.workStart;
    document.getElementById("workEnd").value = optionsState.workEnd;
    document.getElementById("lunchStart").value = optionsState.lunchStart;
    document.getElementById("lunchMinutes").value = String(optionsState.lunchMinutes);
    document.getElementById("workColor").value = optionsState.workColor;
    document.getElementById("weekStart").value = optionsState.weekStart;
    document.getElementById("monthSwitch").value = optionsState.monthSwitch;
    document.getElementById("brickLabel").value = optionsState.brickLabel;
    updateColorPreview();
    renderHome();
    renderClearStat(pair[1]);
    bind();
  })
  .catch(function () {
    document.body.textContent = "还没有假期数据";
  });
