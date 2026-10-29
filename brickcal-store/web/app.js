function localTime(at, tzName) {
  const date = at instanceof Date ? at : new Date(at);
  const options = {
    timeZone: tzName || "UTC",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  };
  try {
    return formatTimeParts(date, options);
  } catch (err) {
    options.timeZone = "UTC";
    return formatTimeParts(date, options);
  }
}

function formatTimeParts(date, options) {
  const parts = new Intl.DateTimeFormat("en-GB", options).formatToParts(date);
  const map = {};
  parts.forEach(function (part) {
    map[part.type] = part.value;
  });
  return (
    String(map.hour || "00").padStart(2, "0") +
    ":" +
    String(map.minute || "00").padStart(2, "0") +
    ":" +
    String(map.second || "00").padStart(2, "0")
  );
}

function tickLocalClocks(at) {
  const now = at instanceof Date ? at : new Date();
  const nodes = document.querySelectorAll("[data-local-clock]");
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].textContent = localTime(now, nodes[i].getAttribute("data-tz"));
  }
}

var calendarView = { year: 0, month: 0 };

function renderCalendar(payload, selectedIso) {
  const grid = document.getElementById("calGrid");
  const title = document.getElementById("calTitle");
  const foot = document.getElementById("calFoot");
  if (!grid) {
    return;
  }
  const selected = isIsoDate(selectedIso) ? selectedIso : todayIso();
  if (!calendarView.year) {
    const d = parseDay(selected);
    calendarView.year = d.getUTCFullYear();
    calendarView.month = d.getUTCMonth() + 1;
  }
  if (title) {
    title.textContent = calendarView.year + "年" + calendarView.month + "月";
  }
  const week = weekLabels(0);
  let html = "";
  week.forEach(function (label, index) {
    html +=
      '<div class="cal-dow' +
      (isWeekHeaderWeekend(index, 0) ? " wk" : "") +
      '">' +
      label +
      "</div>";
  });
  monthCells(calendarView.year, calendarView.month, 0).forEach(function (cell) {
    const mark = cnDayMark(payload, cell.iso, false);
    const cls = [
      "cal-cell",
      cell.inMonth ? "" : "out",
      cell.weekend ? "wk" : "",
      mark.kind === "fest" ? "fest" : "",
      mark.kind === "term" ? "term" : "",
      mark.kind === "lunar" ? "lunar" : "",
      cell.iso === selected ? "selected" : "",
    ]
      .filter(Boolean)
      .join(" ");
    html +=
      '<button class="' +
      cls +
      '" type="button" data-day="' +
      cell.iso +
      '"><span class="n">' +
      cell.day +
      '</span><span class="sub">' +
      escapeHtml(mark.text) +
      "</span></button>";
  });
  grid.innerHTML = html;
  if (foot) {
    foot.textContent = calendarFootText(payload, selected);
  }
}

function cssPx(name, fallback) {
  if (typeof getComputedStyle !== "function" || typeof document === "undefined") {
    return fallback;
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(raw);
  return isNaN(n) ? fallback : n;
}

function middleGridSize(available, cardW, gap, itemCount) {
  const w = Math.max(0, available);
  const unit = cardW + gap;
  let cols = Math.max(1, Math.floor((w + gap) / unit));
  if (typeof itemCount === "number" && itemCount > 0) {
    cols = Math.max(1, Math.min(cols, itemCount));
  }
  return {
    cols: cols,
    width: cols * cardW + (cols - 1) * gap,
  };
}

function middleAvailableWidth() {
  const col = document.querySelector(".col-list");
  return col ? col.clientWidth : 0;
}

function layoutMiddleArea(itemCount) {
  const col = document.querySelector(".col-list");
  const list = document.getElementById("list");
  if (!col) {
    return;
  }
  if (typeof itemCount === "number") {
    col.setAttribute("data-count", String(itemCount));
  }
  const count = parseInt(col.getAttribute("data-count") || "0", 10);
  const cardW = cssPx("--card-w", 300);
  const gap = cssPx("--card-gap", 12);
  const size = middleGridSize(middleAvailableWidth(), cardW, gap, count);
  col.style.setProperty("--list-w", size.width + "px");
  if (list) {
    list.style.gridTemplateColumns = "repeat(" + size.cols + ", " + cardW + "px)";
  }
}

function renderPage(payload, dateStr) {
  const status = document.getElementById("status");
  const list = document.getElementById("list");
  const meta = document.getElementById("meta");
  const clock = document.getElementById("clock");
  const queried = queryHolidayRows(payload, dateStr);
  const queryDate = queried.queryDate;
  const items = queried.items;
  const isToday = queried.useLocalToday;

  if (clock) {
    clock.textContent = isToday
      ? "查询今天 · 按日历日期"
      : "查询 " + formatZhDate(queryDate);
  }

  if (status) {
    status.textContent = items.length
      ? (isToday ? "今天" : formatZhDate(queryDate)) +
        " 有 " +
        items.length +
        " 个国家在休假"
      : (isToday ? "今天" : formatZhDate(queryDate)) + " 没有国家在休假";
  }

  if (list) {
    list.innerHTML = "";
    items.forEach(function (item) {
    const percent = Math.max(
      8,
      Math.min(100, Math.round((item.elapsedDays / item.spanDays) * 100))
    );
    const holidays = (item.holidaysInSpan || [])
      .map(function (h) {
        return (
          '<li><span class="chip-date">' +
          escapeHtml(formatZhDate(h.date)) +
          '</span><span class="chip-name">' +
          escapeHtml(h.name) +
          "</span>" +
          (h.kind === "adjusted" && h.reason
            ? '<span class="chip-reason">' + escapeHtml(h.reason) + "</span>"
            : "") +
          "</li>"
        );
      })
      .join("");
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML =
      '<header class="card-head">' +
      '<div class="flag">' +
      flagEmoji(item.code) +
      "</div>" +
      "<div>" +
      '<h2>' +
      escapeHtml(item.zhName) +
      "</h2>" +
      '<p class="en">' +
      escapeHtml(item.countryName) +
      " · " +
      escapeHtml(item.code) +
      "</p>" +
      "</div></header>" +
      '<dl class="facts">' +
      "<div><dt>查询日期</dt><dd>" +
      escapeHtml(item.localDateLabel) +
      "</dd></div>" +
      "<div><dt>当地时间</dt><dd class='local-clock' data-local-clock data-tz='" +
      escapeHtml(item.tz) +
      "'>" +
      escapeHtml(localTime(new Date(), item.tz)) +
      "</dd></div>" +
      "<div><dt>时区</dt><dd>" +
      escapeHtml(item.tz) +
      "</dd></div>" +
      "<div><dt>休假</dt><dd>" +
      escapeHtml(item.name) +
      "</dd></div>" +
      "</dl>" +
      '<div class="span-block">' +
      "<div class='span-title'>休假区间</div>" +
      "<div class='span-range'>" +
      escapeHtml(item.spanStartLabel) +
      " <span>→</span> " +
      escapeHtml(item.spanEndLabel) +
      "</div>" +
      "<div class='meter'><i style='width:" +
      percent +
      "%'></i></div>" +
      "<div class='span-meta'>共 <b>" +
      item.spanDays +
      "</b> 天 · 已过 <b>" +
      item.elapsedDays +
      "</b> 天 · 还剩 <b>" +
      item.remainingDays +
      "</b> 天</div>" +
      "</div>" +
      '<div class="span-title">这段里的假期</div>' +
      (holidays
        ? '<ul class="holiday-list">' + holidays + "</ul>"
        : '<p class="empty-holidays">这一天落在相邻周末，这段没有新的公共假名称。</p>');
    list.appendChild(card);
    });
  }
  tickLocalClocks();
  renderCalendar(payload, queryDate);
  tickWorkTimer();

  if (meta) {
    const stats = (payload && payload.stats) || {};
    meta.innerHTML =
    "数据年份 <b>" +
    (payload.year || "-") +
    "</b> · 覆盖 <b>" +
    (stats.countryCount || "-") +
    "</b> 个国家 · 公共假 <b>" +
    (stats.holidayCount || "-") +
    "</b> 条 · 更新于 " +
    escapeHtml(payload.updatedAt || "-") +
    "<br>" +
    escapeHtml(payload.attribution || "Holiday data: caldays.com");
  const supplements = (payload && payload.supplements) || {};
  const supplementCodes = Object.keys(supplements);
  if (supplementCodes.length) {
    meta.innerHTML +=
      "<br>调休补充 " +
      supplementCodes
        .map(function (code) {
          const item = supplements[code] || {};
          return (
            "<b>" +
            escapeHtml(code) +
            "</b> " +
            escapeHtml(item.source || "") +
            "（+" +
            (item.extraRestDays || 0) +
            " 天）"
          );
        })
        .join(" · ");
  }
  meta.innerHTML +=
    "<br>免责声明：假期与调休数据来自公开源，仅供浏览参考，实际放假安排以各国官方通知为准。";
  }
  layoutMiddleArea(items.length);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function boot() {
  const status = document.getElementById("status");
  const dateInput = document.getElementById("queryDate");
  const todayBtn = document.getElementById("todayBtn");
  fetch("./data/holidays.json")
    .then(function (resp) {
      if (!resp.ok) {
        throw new Error("HTTP " + resp.status);
      }
      return resp.json();
    })
    .then(function (payload) {
      window.__holidayPayload = payload;
      if (dateInput) {
        const year = String(payload.year || new Date().getFullYear());
        dateInput.min = year + "-01-01";
        dateInput.max = year + "-12-31";
        dateInput.value = clampDateToYear(dateInput.value, year);
        dateInput.addEventListener("change", function () {
          renderPage(payload, dateInput.value);
        });
      }
      if (todayBtn) {
        todayBtn.addEventListener("click", function () {
          const today = clampDateToYear(todayIso(), payload.year);
          const d = parseDay(today);
          calendarView.year = d.getUTCFullYear();
          calendarView.month = d.getUTCMonth() + 1;
          if (dateInput) {
            dateInput.value = today;
          }
          renderPage(payload, today);
        });
      }
      const calPrev = document.getElementById("calPrev");
      const calNext = document.getElementById("calNext");
      const calGrid = document.getElementById("calGrid");
      if (calPrev) {
        calPrev.addEventListener("click", function () {
          calendarView.month -= 1;
          if (calendarView.month < 1) {
            calendarView.month = 12;
            calendarView.year -= 1;
          }
          renderCalendar(payload, dateInput ? dateInput.value : todayIso());
        });
      }
      if (calNext) {
        calNext.addEventListener("click", function () {
          calendarView.month += 1;
          if (calendarView.month > 12) {
            calendarView.month = 1;
            calendarView.year += 1;
          }
          renderCalendar(payload, dateInput ? dateInput.value : todayIso());
        });
      }
      if (calGrid) {
        calGrid.addEventListener("click", function (event) {
          const btn = event.target.closest("[data-day]");
          if (!btn) {
            return;
          }
          const day = btn.getAttribute("data-day");
          const d = parseDay(day);
          calendarView.year = d.getUTCFullYear();
          calendarView.month = d.getUTCMonth() + 1;
          if (dateInput) {
            dateInput.value = day;
          }
          renderPage(payload, day);
        });
      }
      renderPage(payload, dateInput ? dateInput.value : todayIso());
      layoutMiddleArea();
      window.addEventListener("resize", layoutMiddleArea);
      if (!window.__localClockTimer) {
        window.__localClockTimer = setInterval(function () {
          tickLocalClocks();
          tickWorkTimer();
        }, 1000);
      }
    })
    .catch(function () {
      if (status) {
        status.textContent = "还没有数据。请先运行 scripts\\ingest.bat，再刷新本页。";
      }
    });
}

if (typeof module !== "undefined" && module.exports) {
  const holiday = require("./holiday.js");
  const workCopy = require("./work-copy.js");
  module.exports = Object.assign({}, holiday, workCopy, {
    localTime: localTime,
    middleGridSize: middleGridSize,
  });
} else if (typeof window !== "undefined") {
  window.AllWordHappy = { holidaysToday: holidaysToday, localDate: localDate };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
