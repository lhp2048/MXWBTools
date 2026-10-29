function $(id) {
  return document.getElementById(id);
}

function setLog(lines) {
  const log = $("log");
  if (!log) {
    return;
  }
  log.textContent = (lines || []).join("\n") || "等待操作…";
}

function syncDockSpace() {
  const dock = $("statusDock");
  if (!dock) {
    return;
  }
  const gap = 24;
  const height = dock.getBoundingClientRect().height + gap + 16;
  document.documentElement.style.setProperty("--dock-space", height + "px");
}

function showTab(name) {
  const tabName = name === "update" ? "update" : "overview";
  document.querySelectorAll(".tab").forEach(function (btn) {
    const on = btn.getAttribute("data-tab") === tabName;
    btn.className = on ? "tab active" : "tab";
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll(".panel").forEach(function (panel) {
    const on = panel.id === "panel-" + tabName;
    panel.className = on ? "panel active" : "panel";
  });
  syncDockSpace();
}

function tileColor(code) {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 33 + code.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const sat = 38 + (hash % 18);
  const light = 26 + (Math.floor(hash / 360) % 10);
  return "hsl(" + hue + " " + sat + "% " + light + "%)";
}

function statusIcon(status) {
  if (status === "resting") {
    return "☀";
  }
  if (status === "ok") {
    return "✓";
  }
  if (status === "failed") {
    return "!";
  }
  return "○";
}

function tooltipText(row) {
  const lines = [
    row.zhName + "（" + row.code + "）",
    "英文名：" + (row.name || "-"),
    "时区：" + (row.tz || "-"),
    "公共假条数：" + row.holidayCount,
    "状态：" + statusLabel(row.status),
  ];
  if (row.spanStart) {
    lines.push(
      "休假：" +
        row.spanStart +
        " ~ " +
        row.spanEnd +
        "，共 " +
        row.spanDays +
        " 天"
    );
    if (row.holidayName) {
      lines.push("当前：" + row.holidayName);
    }
  }
  return lines.join("\n");
}

function statusLabel(status) {
  if (status === "resting") {
    return "正在休假";
  }
  if (status === "ok") {
    return "已有假期数据";
  }
  if (status === "failed") {
    return "拉取失败";
  }
  return "无假期条目";
}

function filterCountries(rows, selected) {
  const enabled = {};
  (selected || []).forEach(function (status) {
    enabled[status] = true;
  });
  return (rows || []).filter(function (row) {
    return !!enabled[row.status];
  });
}

function selectedStatuses() {
  return ["resting", "ok", "empty", "failed"].filter(function (status) {
    const box = document.getElementById("filter-" + status);
    return !box || box.checked;
  });
}

function renderCountries(rows) {
  const grid = $("countriesGrid");
  if (!rows || !rows.length) {
    grid.className = "empty-grid";
    grid.textContent = "还没有国家数据。点「手动获取一次」拉取。";
    return;
  }
  const visible = filterCountries(rows, selectedStatuses());
  if (!visible.length) {
    grid.className = "empty-grid";
    grid.textContent = "没有符合筛选的国家。";
    return;
  }
  grid.className = "grid";
  grid.innerHTML = "";
  visible.forEach(function (row) {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.style.background = tileColor(row.code);
    const tip = document.createElement("div");
    tip.className = "tip";
    tip.textContent = tooltipText(row);
    tile.innerHTML =
      '<span class="icon">' +
      statusIcon(row.status) +
      '</span><span class="zh">' +
      escapeHtml(row.zhName) +
      '</span><span class="code">' +
      escapeHtml(row.code) +
      "</span>";
    tile.appendChild(tip);
    grid.appendChild(tile);
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fillSourceSelects(sources) {
  document.querySelectorAll(".js-sup-source").forEach(function (select) {
    if (select.options.length) {
      return;
    }
    (sources || []).forEach(function (item) {
      const opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.label;
      select.appendChild(opt);
    });
  });
}

function fillSupplementTable(tbody, rows, overlays) {
  tbody.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("tr");
    empty.innerHTML = '<td colspan="4" class="muted">还没有补充国家。可先加入 CN。</td>';
    tbody.appendChild(empty);
    return;
  }
  rows.forEach(function (item) {
    const overlay = overlays[item.code] || {};
    const applied = overlay.applied || {};
    const status = overlay.fetchedAt
      ? "已拉取 " +
        overlay.fetchedAt +
        " · 补放假 +" +
        (applied.extraRestDays || overlay.restDays || 0) +
        " · 补班 " +
        (overlay.workdays || 0)
      : "尚未拉取";
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" +
      escapeHtml(item.code) +
      "</td><td>" +
      escapeHtml(item.source) +
      "</td><td>" +
      escapeHtml(status) +
      '</td><td><button class="secondary" type="button" data-remove="' +
      escapeHtml(item.code) +
      '">移除</button></td>';
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("[data-remove]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      post("/admin/api/supplements/remove", { code: btn.getAttribute("data-remove") })
        .then(refresh)
        .catch(function (err) {
          const box = $("packResult");
          if (box) {
            box.textContent = err.message;
          }
        });
    });
  });
}

function renderSupplements(data) {
  const info = (data && data.supplements) || {};
  fillSourceSelects(info.sources || []);
  const overlays = info.overlays || {};
  const rows = (info.registry && info.registry.countries) || [];
  document.querySelectorAll(".js-sup-rows").forEach(function (tbody) {
    fillSupplementTable(tbody, rows, overlays);
  });
}

var lastCountries = [];

function renderStatus(data) {
  const cache = data.cache;
  if (!cache) {
    $("updatedAt").textContent = "尚未拉取";
  } else {
    $("updatedAt").textContent = cache.updatedAt || "未知";
  }
  const ingest = data.ingest || {};
  const job = ingest.job ? ingest.job + " " : "";
  $("jobStatus").textContent = "任务：" + job + (ingest.status || "idle");
  $("jobStatus").className = ingest.status === "ok" ? "ok" : "muted";
  setLog(ingest.log);
  const busy = ingest.status === "running";
  $("ingestBtn").disabled = busy;
  if ($("supplementBtn")) {
    $("supplementBtn").disabled = busy;
  }
  lastCountries = data.countries || [];
  renderCountries(lastCountries);
  renderSupplements(data);
  syncDockSpace();
}

function refresh() {
  return fetch("/admin/api/status")
    .then(function (resp) {
      return resp.json();
    })
    .then(renderStatus)
    .catch(function () {
      $("updatedAt").textContent = "无法读取本机服务";
    });
}

function post(path, body) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  }).then(function (resp) {
    return resp.json().then(function (data) {
      if (!resp.ok) {
        throw new Error(data.error || "HTTP " + resp.status);
      }
      return data;
    });
  });
}

function bindAdminUi() {
  $("ingestBtn").addEventListener("click", function () {
    const delayMs = Number($("delayMs").value || 400);
    const limitValue = $("limit").value;
    const body = { delayMs: delayMs };
    if (limitValue) {
      body.limit = Number(limitValue);
    }
    post("/admin/api/ingest", body)
      .then(refresh)
      .catch(function (err) {
        $("packResult").textContent = err.message;
      });
  });

  if ($("supplementBtn")) {
    $("supplementBtn").addEventListener("click", function () {
      post("/admin/api/supplements/update", {})
        .then(refresh)
        .catch(function (err) {
          $("packResult").textContent = err.message;
        });
    });
  }

  document.querySelectorAll(".js-sup-add").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const form = btn.closest(".sup-form") || document;
      const codeInput = form.querySelector(".js-sup-code");
      const sourceSelect = form.querySelector(".js-sup-source");
      post("/admin/api/supplements/entry", {
        code: ((codeInput && codeInput.value) || "").trim(),
        source: sourceSelect ? sourceSelect.value : "",
        enabled: true,
      })
        .then(function () {
          document.querySelectorAll(".js-sup-code").forEach(function (input) {
            input.value = "";
          });
          return refresh();
        })
        .catch(function (err) {
          const box = $("packResult");
          if (box) {
            box.textContent = err.message;
          }
        });
    });
  });

  $("packBtn").addEventListener("click", function () {
    $("packResult").textContent = "打包中…";
    post("/admin/api/pack", {})
      .then(function (data) {
        $("packResult").textContent = "已打包：" + data.path;
      })
      .catch(function (err) {
        $("packResult").textContent = err.message;
      });
  });

  ["resting", "ok", "empty", "failed"].forEach(function (status) {
    const box = document.getElementById("filter-" + status);
    if (!box) {
      return;
    }
    box.addEventListener("change", function () {
      renderCountries(lastCountries);
    });
  });

  document.querySelectorAll(".tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      showTab(btn.getAttribute("data-tab"));
    });
  });
  showTab("overview");
  syncDockSpace();
  if (window.ResizeObserver && $("statusDock")) {
    new ResizeObserver(syncDockSpace).observe($("statusDock"));
  }
  window.addEventListener("resize", syncDockSpace);

  refresh();
  setInterval(refresh, 1000);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { filterCountries: filterCountries, showTab: showTab };
}

if (typeof document !== "undefined") {
  bindAdminUi();
}
