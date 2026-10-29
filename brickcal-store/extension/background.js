importScripts("holiday.js");

function loadPayload() {
  if (loadPayload.cached) {
    return Promise.resolve(loadPayload.cached);
  }
  return fetch(chrome.runtime.getURL("data/holidays.json")).then(function (resp) {
    if (!resp.ok) {
      throw new Error("HTTP " + resp.status);
    }
    return resp.json();
  }).then(function (payload) {
    loadPayload.cached = payload;
    return payload;
  });
}

function settings() {
  return chrome.storage.sync
    .get({ homeCountry: "CN", workStart: "09:00", workEnd: "18:00" })
    .catch(function () {
      return chrome.storage.local.get({
        homeCountry: "CN",
        workStart: "09:00",
        workEnd: "18:00",
      });
    });
}

function refreshBadge() {
  return Promise.all([loadPayload(), settings()])
    .then(function (pair) {
      const payload = pair[0];
      const home = pair[1].homeCountry || "CN";
      const text = badgeText(payload, home, new Date());
      const color = text === "休" ? "#2f6f5e" : "#c45c26";
      chrome.action.setBadgeBackgroundColor({ color: color });
      chrome.action.setBadgeText({ text: text });
    })
    .catch(function () {
      chrome.action.setBadgeText({ text: "" });
    });
}

chrome.runtime.onInstalled.addListener(function () {
  chrome.alarms.create("badge", { periodInMinutes: 60 });
  refreshBadge();
});
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === "badge") {
    refreshBadge();
  }
});
chrome.storage.onChanged.addListener(function () {
  refreshBadge();
});

function createSettingsWindow() {
  return chrome.windows
    .create({
      url: chrome.runtime.getURL("options.html"),
      type: "popup",
      width: 460,
      height: 800,
      focused: true,
    })
    .then(function (win) {
      if (chrome.storage.session) {
        return chrome.storage.session.set({ settingsWindowId: win.id });
      }
    });
}

function openSettingsWindow() {
  const session = chrome.storage.session;
  if (!session) {
    return createSettingsWindow();
  }
  return session.get({ settingsWindowId: 0 }).then(function (saved) {
    const id = saved.settingsWindowId;
    if (!id) {
      return createSettingsWindow();
    }
    return chrome.windows.update(id, { focused: true }).catch(function () {
      return createSettingsWindow();
    });
  });
}

chrome.runtime.onMessage.addListener(function (msg) {
  if (msg && msg.type === "open-settings") {
    openSettingsWindow();
  }
});

if (chrome.windows && chrome.windows.onRemoved) {
  chrome.windows.onRemoved.addListener(function (id) {
    if (!chrome.storage.session) {
      return;
    }
    chrome.storage.session.get({ settingsWindowId: 0 }).then(function (saved) {
      if (saved.settingsWindowId === id) {
        chrome.storage.session.set({ settingsWindowId: 0 });
      }
    });
  });
}
