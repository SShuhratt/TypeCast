/**
 * Uzbek Latin <-> Cyrillic Transliteration Engine (JavaScript / Browser & Node.js).
 *
 * Implements official Uzbek phonology rules, digraph precedence, apostrophe
 * normalization, case-preservation, and contextual 'E'/'Э' rules.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.UzbekTransliterator = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Unicode apostrophe variants normalized to standard typewriter apostrophe ' (U+0027)
  var APOSTROPHE_VARIANTS = /[\u2018\u2019\u201A\u201B\u02BB\u02BC\u02BD\u0060\u00B4\u02B9\u02BA\u2032\u2033]/g;

  var LATIN_VOWELS = new Set(['A', 'E', 'I', 'O', 'U', 'a', 'e', 'i', 'o', 'u']);
  var CYRILLIC_VOWELS = new Set(['А', 'Е', 'Ё', 'И', 'О', 'У', 'Э', 'Ю', 'Я', 'Ў', 'а', 'е', 'ё', 'и', 'о', 'у', 'э', 'ю', 'я', 'ў']);
  var WORD_BOUNDARY_CHARS = new Set(" \t\n\r\f\v.,!?:;()[]{}<>/\\\"'«»—–-_#@$%^&*+=~`|".split(''));

  function normalizeApostrophes(text) {
    if (!text) return '';
    return text.replace(APOSTROPHE_VARIANTS, "'");
  }

  function isUpper(char) {
    return char >= 'A' && char <= 'Z' || char >= 'А' && char <= 'Я' || char === 'Ў' || char === 'Ғ' || char === 'Ё';
  }

  function isUpperCaseContext(text, index) {
    if (index + 1 < text.length && isUpper(text[index + 1])) return true;
    if (index - 1 >= 0 && isUpper(text[index - 1])) return true;
    return false;
  }

  function latinToCyrillic(text) {
    if (!text) return '';
    text = normalizeApostrophes(text);
    var len = text.length;
    var result = [];
    var i = 0;

    while (i < len) {
      var ch = text[i];
      var next_ch = i + 1 < len ? text[i + 1] : '';
      var next_next_ch = i + 2 < len ? text[i + 2] : '';

      // 1. Non-digraph compound: s'h -> сҳ
      if ((ch === 's' || ch === 'S') && next_ch === "'" && (next_next_ch === 'h' || next_next_ch === 'H')) {
        if (ch === 'S' && next_next_ch === 'H') result.push('СҲ');
        else if (ch === 'S') result.push('Сҳ');
        else if (next_next_ch === 'H') result.push('сҲ');
        else result.push('сҳ');
        i += 3;
        continue;
      }

      // 2. Triple letter digraph: yo' -> йў
      if ((ch === 'y' || ch === 'Y') && (next_ch === 'o' || next_ch === 'O') && next_next_ch === "'") {
        if (ch === 'Y' && next_ch === 'O') result.push('ЙЎ');
        else if (ch === 'Y') result.push('Йў');
        else if (next_ch === 'O') result.push('йЎ');
        else result.push('йў');
        i += 3;
        continue;
      }

      // 3. Digraphs with apostrophes: O' / o', G' / g'
      if (next_ch === "'") {
        if (ch === 'O') { result.push('Ў'); i += 2; continue; }
        if (ch === 'o') { result.push('ў'); i += 2; continue; }
        if (ch === 'G') { result.push('Ғ'); i += 2; continue; }
        if (ch === 'g') { result.push('ғ'); i += 2; continue; }
      }

      // 4. Standard Two-letter Digraphs: Sh, Ch, Yo, Yu, Ya, Ye
      var pair = ch + next_ch;
      var pair_lower = pair.toLowerCase();

      if (pair_lower === 'sh' || pair_lower === 'ch' || pair_lower === 'yo' ||
          pair_lower === 'yu' || pair_lower === 'ya' || pair_lower === 'ye') {
        var is_all_caps = (ch >= 'A' && ch <= 'Z') && (next_ch >= 'A' && next_ch <= 'Z');
        var is_title = (ch >= 'A' && ch <= 'Z') && !(next_ch >= 'A' && next_ch <= 'Z');

        var digraph_map = {
          'sh': is_all_caps ? 'Ш' : (is_title ? 'Ш' : 'ш'),
          'ch': is_all_caps ? 'Ч' : (is_title ? 'Ч' : 'ч'),
          'yo': is_all_caps ? 'Ё' : (is_title ? 'Ё' : 'ё'),
          'yu': is_all_caps ? 'Ю' : (is_title ? 'Ю' : 'ю'),
          'ya': is_all_caps ? 'Я' : (is_title ? 'Я' : 'я'),
          'ye': is_all_caps ? 'Е' : (is_title ? 'Е' : 'е'),
        };
        result.push(digraph_map[pair_lower]);
        i += 2;
        continue;
      }

      // 5. Loanword Digraph: ts / Ts / TS -> ц / Ц
      // Matches word-start (tsirk -> цирк) or loanword suffixes (konstitutsiya -> конституция, litsey -> лицей)
      // Prevents breaking conditional verbs ending in -tsa (ketsa -> кетса, aytsa -> айтса)
      if ((ch === 't' || ch === 'T') && (next_ch === 's' || next_ch === 'S')) {
        var prev_ch_ts = i > 0 ? text[i - 1] : '';
        var is_word_start_ts = i === 0 || WORD_BOUNDARY_CHARS.has(prev_ch_ts);
        var next_vowel = next_next_ch.toLowerCase();
        var is_followed_by_vowel_ts = next_vowel === 'i' || next_vowel === 'e' || next_vowel === 'o' || next_vowel === 'u' || next_vowel === 'y';

        if (is_word_start_ts || is_followed_by_vowel_ts) {
          var is_all_caps_ts = (ch >= 'A' && ch <= 'Z') && (next_ch >= 'A' && next_ch <= 'Z');
          var is_title_ts = (ch >= 'A' && ch <= 'Z') && !(next_ch >= 'A' && next_ch <= 'Z');
          result.push((is_all_caps_ts || is_title_ts) ? 'Ц' : 'ц');
          i += 2;
          continue;
        }
      }

      // 5. Contextual 'E' / 'e'
      if (ch === 'E' || ch === 'e') {
        var prev_ch = i > 0 ? text[i - 1] : '';
        var is_at_start = i === 0 || WORD_BOUNDARY_CHARS.has(prev_ch);
        var is_after_vowel = LATIN_VOWELS.has(prev_ch) || CYRILLIC_VOWELS.has(prev_ch);

        if (is_at_start || is_after_vowel) {
          result.push(ch === 'E' ? 'Э' : 'э');
        } else {
          result.push(ch === 'E' ? 'Е' : 'е');
        }
        i += 1;
        continue;
      }

      // 6. Single letters
      var single_map = {
        'A': 'А', 'a': 'а',
        'B': 'Б', 'b': 'б',
        'D': 'Д', 'd': 'д',
        'F': 'Ф', 'f': 'ф',
        'G': 'Г', 'g': 'г',
        'H': 'Ҳ', 'h': 'ҳ',
        'I': 'И', 'i': 'и',
        'J': 'Ж', 'j': 'ж',
        'K': 'К', 'k': 'к',
        'L': 'Л', 'l': 'л',
        'M': 'М', 'm': 'м',
        'N': 'Н', 'n': 'н',
        'O': 'О', 'o': 'о',
        'P': 'П', 'p': 'п',
        'Q': 'Қ', 'q': 'қ',
        'R': 'Р', 'r': 'р',
        'S': 'С', 's': 'с',
        'T': 'Т', 't': 'т',
        'U': 'У', 'u': 'у',
        'V': 'В', 'v': 'в',
        'X': 'Х', 'x': 'х',
        'Y': 'Й', 'y': 'й',
        'Z': 'З', 'z': 'з',
        'C': 'С', 'c': 'с',
        'W': 'В', 'w': 'в',
        "'": 'ъ',
      };

      if (single_map.hasOwnProperty(ch)) {
        result.push(single_map[ch]);
      } else {
        result.push(ch);
      }
      i += 1;
    }

    return result.join('');
  }

  function cyrillicToLatin(text) {
    if (!text) return '';
    var len = text.length;
    var result = [];
    var i = 0;

    while (i < len) {
      var ch = text[i];
      var next_ch = i + 1 < len ? text[i + 1] : '';

      // 1. Non-digraph compound: сҳ -> s'h
      if ((ch === 'с' || ch === 'С') && (next_ch === 'ҳ' || next_ch === 'Ҳ')) {
        if (ch === 'С' && next_ch === 'Ҳ') result.push("S'H");
        else if (ch === 'С') result.push("S'h");
        else if (next_ch === 'Ҳ') result.push("s'H");
        else result.push("s'h");
        i += 2;
        continue;
      }

      // 2. Contextual 'Е' / 'е'
      if (ch === 'Е' || ch === 'е') {
        var prev_ch = i > 0 ? text[i - 1] : '';
        var is_at_start = i === 0 || WORD_BOUNDARY_CHARS.has(prev_ch);
        var is_after_vowel = CYRILLIC_VOWELS.has(prev_ch) || LATIN_VOWELS.has(prev_ch);

        if (is_at_start || is_after_vowel) {
          if (ch === 'Е') {
            result.push(isUpperCaseContext(text, i) ? 'YE' : 'Ye');
          } else {
            result.push('ye');
          }
        } else {
          result.push(ch === 'Е' ? 'E' : 'e');
        }
        i += 1;
        continue;
      }

      // 3. 'Э' / 'э'
      if (ch === 'Э') { result.push('E'); i += 1; continue; }
      if (ch === 'э') { result.push('e'); i += 1; continue; }

      // 4. Multi-letter representations: Ш, Ч, Ё, Ю, Я, Ц, Ў, Ғ, Щ
      var upper_ctx = isUpperCaseContext(text, i);

      var cyr_multi_map = {
        'Ш': upper_ctx ? 'SH' : 'Sh',
        'ш': 'sh',
        'Ч': upper_ctx ? 'CH' : 'Ch',
        'ч': 'ch',
        'Ё': upper_ctx ? 'YO' : 'Yo',
        'ё': 'yo',
        'Ю': upper_ctx ? 'YU' : 'Yu',
        'ю': 'yu',
        'Я': upper_ctx ? 'YA' : 'Ya',
        'я': 'ya',
        'Ц': upper_ctx ? 'TS' : 'Ts',
        'ц': 'ts',
        'Ў': "O'",
        'ў': "o'",
        'Ғ': "G'",
        'ғ': "g'",
        'Щ': upper_ctx ? 'SHCH' : 'Shch',
        'щ': 'shch',
        'Ъ': "'",
        'ъ': "'",
        'Ь': '',
        'ь': '',
      };

      if (cyr_multi_map.hasOwnProperty(ch)) {
        result.push(cyr_multi_map[ch]);
        i += 1;
        continue;
      }

      // 5. Single Cyrillic letters
      var single_cyr_map = {
        'А': 'A', '\u0430': 'a',
        'Б': 'B', 'б': 'b',
        'В': 'V', 'в': 'v',
        'Г': 'G', 'г': 'g',
        'Д': 'D', 'д': 'd',
        'Ж': 'J', 'ж': 'j',
        'З': 'Z', '\u0437': 'z',
        'И': 'I', 'и': 'i',
        'Й': 'Y', 'й': 'y',
        'К': 'K', '\u043A': 'k',
        'Қ': 'Q', '\u049B': 'q',
        'Л': 'L', 'л': 'l',
        'М': 'M', 'м': 'm',
        'Н': 'N', '\u043D': 'n',
        'О': 'O', '\u043E': 'o',
        'П': 'P', 'п': 'p',
        'Р': 'R', '\u0440': 'r',
        'С': 'S', '\u0441': 's',
        'Т': 'T', '\u0442': 't',
        'У': 'U', '\u0443': 'u',
        'Ф': 'F', 'ф': 'f',
        'Х': 'X', '\u0445': 'x',
        'Ҳ': 'H', '\u04B3': 'h',
        'Ы': 'I', 'ы': 'i',
      };

      if (single_cyr_map.hasOwnProperty(ch)) {
        result.push(single_cyr_map[ch]);
      } else {
        result.push(ch);
      }
      i += 1;
    }

    return result.join('');
  }

  function transliterate(text, direction) {
    direction = direction || 'latin-to-cyrillic';
    if (direction === 'latin-to-cyrillic') {
      return latinToCyrillic(text);
    } else if (direction === 'cyrillic-to-latin') {
      return cyrillicToLatin(text);
    } else {
      throw new Error('Unknown transliteration direction: ' + direction);
    }
  }

  return {
    normalizeApostrophes: normalizeApostrophes,
    latinToCyrillic: latinToCyrillic,
    cyrillicToLatin: cyrillicToLatin,
    transliterate: transliterate
  };
}));
