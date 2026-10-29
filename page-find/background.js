'use strict';

var BADGE_COLOR = '#0F62FE';

function setupBadge() {
  chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  if (chrome.action.setBadgeTextColor) {
    chrome.action.setBadgeTextColor({ color: '#FFFFFF' }).catch(function () {});
  }
}

setupBadge();
chrome.runtime.onInstalled.addListener(setupBadge);
chrome.runtime.onStartup.addListener(setupBadge);

function canScript(url) {
  return /^https?:/i.test(url || '') || /^file:/i.test(url || '');
}

async function shortcutText() {
  try {
    var all = await chrome.commands.getAll();
    var hit = all.find(function (item) { return item.name === 'toggle-panel'; });
    return hit && hit.shortcut ? hit.shortcut : '';
  } catch (e) {
    return '';
  }
}

async function resolveTab(tab) {
  if (tab && tab.id != null) return tab;
  var tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}

async function dispatch(tab, type) {
  tab = await resolveTab(tab);
  if (!tab || tab.id == null) return;
  if (tab.url && !canScript(tab.url)) return;
  var shortcut = await shortcutText();
  var message = { type: type, shortcut: shortcut };
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['search.js', 'content.js']
      });
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (err) {}
  }
}

chrome.action.onClicked.addListener(function (tab) {
  dispatch(tab, 'TOGGLE');
});

chrome.commands.onCommand.addListener(function (command, tab) {
  if (command === 'toggle-panel') dispatch(tab, 'TOGGLE');
  else if (command === 'next-match') dispatch(tab, 'NEXT');
  else if (command === 'prev-match') dispatch(tab, 'PREV');
});

chrome.runtime.onMessage.addListener(function (msg, sender) {
  if (!msg || msg.type !== 'BADGE' || !sender.tab) return;
  var count = Number(msg.count) || 0;
  var text = '';
  if (count > 999) text = '999+';
  else if (count > 0) text = String(count);
  chrome.action.setBadgeText({ tabId: sender.tab.id, text: text });
  chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: BADGE_COLOR });
});
