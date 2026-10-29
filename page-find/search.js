(function (root) {
  'use strict';

  var KEYWORD_LIMIT = 20;
  var KEYWORD_LENGTH = 300;
  var MATCH_LIMIT = 5000;

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function parseKeywords(raw, options) {
    var splitSpace = !!(options && options.splitSpace);
    var caseSensitive = !!(options && options.caseSensitive);
    var pattern = splitSpace ? /[|｜,，、;；\n\r\t ]+/ : /[|｜,，、;；\n\r]+/;
    var seen = new Set();
    var keywords = [];
    var truncated = false;
    if (!raw) return { keywords: keywords, truncated: false };
    var parts = String(raw).split(pattern);
    for (var i = 0; i < parts.length; i++) {
      var keyword = parts[i].trim();
      if (!keyword) continue;
      if (keyword.length > KEYWORD_LENGTH) {
        keyword = keyword.slice(0, KEYWORD_LENGTH);
        truncated = true;
      }
      var dedupKey = caseSensitive ? keyword : keyword.toLowerCase();
      if (seen.has(dedupKey)) continue;
      if (keywords.length >= KEYWORD_LIMIT) {
        truncated = true;
        break;
      }
      seen.add(dedupKey);
      keywords.push(keyword);
    }
    return { keywords: keywords, truncated: truncated };
  }

  function isAsciiWordChar(ch) {
    return !!ch && /[A-Za-z0-9_]/.test(ch);
  }

  function hasAsciiBoundary(text, start, end) {
    var before = start > 0 ? text.charAt(start - 1) : '';
    var after = end < text.length ? text.charAt(end) : '';
    if (isAsciiWordChar(before) || isAsciiWordChar(after)) return false;
    return true;
  }

  function findInText(text, regs, keywords, options) {
    var found = [];
    for (var keywordIndex = 0; keywordIndex < regs.length; keywordIndex++) {
      var re = regs[keywordIndex];
      re.lastIndex = 0;
      var match;
      while ((match = re.exec(text)) !== null) {
        var start = match.index;
        var end = start + match[0].length;
        if (end === start) {
          re.lastIndex += 1;
          continue;
        }
        if (options.wholeWord && !hasAsciiBoundary(text, start, end)) continue;
        found.push({
          keywordIndex: keywordIndex,
          start: start,
          end: end,
          keyword: keywords[keywordIndex]
        });
      }
    }
    if (options.mode === 'all' && keywords.length > 1) {
      var hit = new Set();
      for (var i = 0; i < found.length; i++) hit.add(found[i].keywordIndex);
      if (hit.size < keywords.length) return [];
    }
    found.sort(function (a, b) {
      return a.start - b.start || a.keywordIndex - b.keywordIndex;
    });
    return found;
  }

  function searchBlocks(blockTexts, rawQuery, options) {
    var opts = options || {};
    var parsed = parseKeywords(rawQuery, opts);
    var keywords = parsed.keywords;
    var limit = opts.limit > 0 ? opts.limit : MATCH_LIMIT;
    var counts = [];
    for (var c = 0; c < keywords.length; c++) counts.push(0);
    if (!keywords.length) {
      return {
        keywords: keywords,
        matches: [],
        counts: counts,
        truncated: false,
        keywordTruncated: parsed.truncated
      };
    }
    var flags = opts.caseSensitive ? 'gu' : 'giu';
    var regs = keywords.map(function (keyword) {
      return new RegExp(escapeRegExp(keyword), flags);
    });
    var matches = [];
    var truncated = false;
    var texts = blockTexts || [];
    for (var blockIndex = 0; blockIndex < texts.length; blockIndex++) {
      var text = texts[blockIndex];
      if (!text) continue;
      var found = findInText(text, regs, keywords, opts);
      for (var i = 0; i < found.length; i++) {
        if (matches.length >= limit) {
          truncated = true;
          break;
        }
        counts[found[i].keywordIndex] += 1;
        matches.push({
          blockIndex: blockIndex,
          keywordIndex: found[i].keywordIndex,
          start: found[i].start,
          end: found[i].end,
          keyword: found[i].keyword
        });
      }
      if (truncated) break;
    }
    return {
      keywords: keywords,
      matches: matches,
      counts: counts,
      truncated: truncated,
      keywordTruncated: parsed.truncated
    };
  }

  var api = {
    KEYWORD_LIMIT: KEYWORD_LIMIT,
    MATCH_LIMIT: MATCH_LIMIT,
    escapeRegExp: escapeRegExp,
    parseKeywords: parseKeywords,
    searchBlocks: searchBlocks
  };

  root.MFSearch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
