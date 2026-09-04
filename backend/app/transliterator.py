"""Uzbek Latin <-> Cyrillic Transliteration Engine.

Implements official Uzbek phonology rules, digraph precedence, apostrophe
normalization, case-preservation, and contextual 'E'/'Э' rules.
"""

import re
from typing import Literal

# Comprehensive apostrophe variants matching official standards and common OCR/keyboard symbols
# \u2018: ‘ (left single quote)
# \u2019: ’ (right single quote)
# \u201A: ‚ (single low-9 quote)
# \u201B: ‛ (single high-reversed-9 quote)
# \u02BB: ʻ (modifier letter turned comma - official Uzbek Latin okina)
# \u02BC: ʼ (modifier letter apostrophe)
# \u02BD: ʽ (modifier letter reversed comma)
# \u0060: ` (grave accent)
# \u00B4: ´ (acute accent)
# \u02B9: ʹ (modifier letter prime)
# \u02BA: ʺ (modifier letter double prime)
# \u2032: ′ (prime)
# \u2033: ″ (double prime)
APOSTROPHE_VARIANTS = re.compile(
    r"[\u2018\u2019\u201A\u201B\u02BB\u02BC\u02BD\u0060\u00B4\u02B9\u02BA\u2032\u2033]"
)

# Vowels in Latin and Cyrillic (for contextual 'E'/'Э' rules)
LATIN_VOWELS = set("AEIOUaeiou")
CYRILLIC_VOWELS = set("АЕЁИОУЭЮЯЎаеёиоуэюяў")

# Punctuation/delimiters that delineate word boundaries
WORD_BOUNDARY_CHARS = set(" \t\n\r\f\v.,!?:;()[]{}<>/\\\"'«»—–-_#@$%^&*+=~`|")


def normalize_apostrophes(text: str) -> str:
    """Normalizes all apostrophe variants to standard typewriter apostrophe ' (U+0027)."""
    return APOSTROPHE_VARIANTS.sub("'", text)


def is_uppercase_context(text: str, index: int) -> bool:
    """Determines if a letter at `index` is in an ALL_CAPS context (e.g. SHAHAR vs Shahar)."""
    # Check next char
    if index + 1 < len(text) and text[index + 1].isupper():
        return True
    # Check previous char
    if index - 1 >= 0 and text[index - 1].isupper():
        return True
    return False


def latin_to_cyrillic(text: str) -> str:
    """Converts Uzbek text from Latin to Cyrillic script.

    Adheres to:
    - Apostrophe normalization.
    - Compound sound protection: s'h -> сҳ (not ш).
    - Digraph precedence: yo', yu', sh, ch, yo, yu, ya, ye, o', g'.
    - Initial/post-vocalic 'e' -> 'э'; post-consonantal 'e' -> 'е'.
    - Complete Uzbek alphabet mapping.
    - Trailing/stray apostrophe -> 'ъ'.
    """
    if not text:
        return ""

    text = normalize_apostrophes(text)
    length = len(text)
    result = []
    i = 0

    while i < length:
        ch = text[i]
        next_ch = text[i + 1] if i + 1 < length else ""
        next_next_ch = text[i + 2] if i + 2 < length else ""

        # 1. Non-digraph compound: s'h / S'h / S'H / s'H -> сҳ / Сҳ / СҲ / сҲ
        if ch in ("s", "S") and next_ch == "'" and next_next_ch in ("h", "H"):
            if ch == "S" and next_next_ch == "H":
                result.append("СҲ")
            elif ch == "S":
                result.append("Сҳ")
            elif next_next_ch == "H":
                result.append("сҲ")
            else:
                result.append("сҳ")
            i += 3
            continue

        # 2. Triple letter digraph with apostrophe: yo' / Yo' / YO' -> йў / Йў / ЙЎ
        # In Uzbek: "yo'l" -> "йўл", NOT "ёъл"
        if ch in ("y", "Y") and next_ch in ("o", "O") and next_next_ch == "'":
            if ch == "Y" and next_ch == "O":
                result.append("ЙЎ")
            elif ch == "Y":
                result.append("Йў")
            elif next_ch == "O":
                result.append("йЎ")
            else:
                result.append("йў")
            i += 3
            continue

        # 3. Digraphs with apostrophes: O' / o', G' / g'
        if next_ch == "'":
            if ch == "O":
                result.append("Ў")
                i += 2
                continue
            elif ch == "o":
                result.append("ў")
                i += 2
                continue
            elif ch == "G":
                result.append("Ғ")
                i += 2
                continue
            elif ch == "g":
                result.append("ғ")
                i += 2
                continue

        # 4. Standard Two-letter Digraphs: Sh, Ch, Yo, Yu, Ya, Ye
        pair = ch + next_ch
        pair_lower = pair.lower()

        if pair_lower in ("sh", "ch", "yo", "yu", "ya", "ye"):
            is_all_caps = ch.isupper() and next_ch.isupper()
            is_title = ch.isupper() and not next_ch.isupper()

            digraph_map = {
                "sh": ("Ш" if is_all_caps else ("Ш" if is_title else "ш")),
                "ch": ("Ч" if is_all_caps else ("Ч" if is_title else "ч")),
                "yo": ("Ё" if is_all_caps else ("Ё" if is_title else "ё")),
                "yu": ("Ю" if is_all_caps else ("Ю" if is_title else "ю")),
                "ya": ("Я" if is_all_caps else ("Я" if is_title else "я")),
                "ye": ("Е" if is_all_caps else ("Е" if is_title else "е")),
            }
            result.append(digraph_map[pair_lower])
            i += 2
            continue

        # 5. Loanword Digraph: ts / Ts / TS -> ц / Ц
        # Matches word-start (tsirk -> цирк) or loanword suffixes (konstitutsiya -> конституция, litsey -> лицей)
        # Prevents breaking conditional verbs ending in -tsa (ketsa -> кетса, aytsa -> айтса)
        if ch in ("t", "T") and next_ch in ("s", "S"):
            prev_ch = text[i - 1] if i > 0 else ""
            is_word_start = i == 0 or prev_ch in WORD_BOUNDARY_CHARS
            is_followed_by_vowel = next_next_ch.lower() in ("i", "e", "o", "u", "y")

            if is_word_start or is_followed_by_vowel:
                is_all_caps = ch.isupper() and next_ch.isupper()
                is_title = ch.isupper() and not next_ch.isupper()
                result.append("Ц" if (is_all_caps or is_title) else "ц")
                i += 2
                continue

        # 5. Contextual 'E' / 'e' rule
        if ch in ("E", "e"):
            prev_ch = text[i - 1] if i > 0 else ""
            is_at_start = i == 0 or prev_ch in WORD_BOUNDARY_CHARS
            is_after_vowel = prev_ch in LATIN_VOWELS or prev_ch in CYRILLIC_VOWELS

            if is_at_start or is_after_vowel:
                result.append("Э" if ch == "E" else "э")
            else:
                result.append("Е" if ch == "E" else "е")
            i += 1
            continue

        # 6. Single letters
        single_map = {
            "A": "А", "a": "а",
            "B": "Б", "b": "б",
            "D": "Д", "d": "д",
            "F": "Ф", "f": "ф",
            "G": "Г", "g": "г",
            "H": "Ҳ", "h": "ҳ",
            "I": "И", "i": "и",
            "J": "Ж", "j": "ж",
            "K": "К", "k": "к",
            "L": "Л", "l": "л",
            "M": "М", "m": "м",
            "N": "Н", "n": "н",
            "O": "О", "o": "о",
            "P": "П", "p": "п",
            "Q": "Қ", "q": "қ",
            "R": "Р", "r": "р",
            "S": "С", "s": "с",
            "T": "Т", "t": "т",
            "U": "У", "u": "у",
            "V": "В", "v": "в",
            "X": "Х", "x": "х",
            "Y": "Й", "y": "й",
            "Z": "З", "z": "з",
            # Additional loan letters
            "C": "С", "c": "с",
            "W": "В", "w": "в",
            "'": "ъ",
        }

        if ch in single_map:
            result.append(single_map[ch])
        else:
            result.append(ch)
        i += 1

    return "".join(result)


def cyrillic_to_latin(text: str) -> str:
    """Converts Uzbek text from Cyrillic to Latin script.

    Adheres to:
    - Contextual 'Е'/'е': word-start or after vowel -> 'Ye'/'ye'; after consonant -> 'E'/'e'.
    - 'Э'/'э' -> 'E'/'e'.
    - Digraph case preservation (e.g. ШАҲАР -> SHAHAR, Шаҳар -> Shahar).
    - Compound protection: сҳ -> s'h (to distinguish from sh -> ш).
    - 'Ц'/'ц' -> 'Ts'/'ts'.
    - Tutuq belgisi 'ъ' -> typewriter apostrophe '.
    - Soft sign 'ь' -> omitted in modern Uzbek orthography.
    - Full 29-letter alphabet mapping + loan letters.
    """
    if not text:
        return ""

    length = len(text)
    result = []
    i = 0

    while i < length:
        ch = text[i]
        next_ch = text[i + 1] if i + 1 < length else ""

        # 1. Non-digraph compound: сҳ / Сҳ / СҲ / сҲ -> s'h / S'h / S'H / s'H
        if ch in ("с", "С") and next_ch in ("ҳ", "Ҳ"):
            if ch == "С" and next_ch == "Ҳ":
                result.append("S'H")
            elif ch == "С":
                result.append("S'h")
            elif next_ch == "Ҳ":
                result.append("s'H")
            else:
                result.append("s'h")
            i += 2
            continue

        # 2. Contextual 'Е' / 'е'
        if ch in ("Е", "е"):
            prev_ch = text[i - 1] if i > 0 else ""
            is_at_start = i == 0 or prev_ch in WORD_BOUNDARY_CHARS
            is_after_vowel = prev_ch in CYRILLIC_VOWELS or prev_ch in LATIN_VOWELS

            if is_at_start or is_after_vowel:
                if ch == "Е":
                    result.append("YE" if is_uppercase_context(text, i) else "Ye")
                else:
                    result.append("ye")
            else:
                result.append("E" if ch == "Е" else "e")
            i += 1
            continue

        # 3. 'Э' / 'э'
        if ch == "Э":
            result.append("E")
            i += 1
            continue
        elif ch == "э":
            result.append("e")
            i += 1
            continue

        # 4. Multi-letter representations: Ш, Ч, Ё, Ю, Я, Ц, Ў, Ғ, Щ
        upper_ctx = is_uppercase_context(text, i)

        cyr_multi_map = {
            "Ш": "SH" if upper_ctx else "Sh",
            "ш": "sh",
            "Ч": "CH" if upper_ctx else "Ch",
            "ч": "ch",
            "Ё": "YO" if upper_ctx else "Yo",
            "ё": "yo",
            "Ю": "YU" if upper_ctx else "Yu",
            "ю": "yu",
            "Я": "YA" if upper_ctx else "Ya",
            "я": "ya",
            "Ц": "TS" if upper_ctx else "Ts",
            "ц": "ts",
            "Ў": "O'",
            "ў": "o'",
            "Ғ": "G'",
            "ғ": "g'",
            "Щ": "SHCH" if upper_ctx else "Shch",
            "щ": "shch",
            "Ъ": "'",
            "ъ": "'",
            "Ь": "",
            "ь": "",
        }

        if ch in cyr_multi_map:
            result.append(cyr_multi_map[ch])
            i += 1
            continue

        # 5. Single Cyrillic letters (note: explicitly Cyrillic characters here)
        single_cyr_map = {
            "А": "A", "а": "a",
            "Б": "B", "б": "b",
            "В": "V", "в": "v",
            "Г": "G", "г": "g",
            "Д": "D", "д": "d",
            "Ж": "J", "ж": "j",
            "З": "Z", "з": "z",
            "И": "I", "и": "i",
            "Й": "Y", "й": "y",
            "К": "K", "к": "k",
            "Қ": "Q", "қ": "q",
            "Л": "L", "л": "l",
            "М": "M", "м": "m",
            "Н": "N", "н": "n",
            "О": "O", "о": "o",
            "П": "P", "п": "p",
            "Р": "R", "р": "r",
            "С": "S", "с": "s",
            "Т": "T", "т": "t",
            "У": "U", "у": "u",
            "Ф": "F", "ф": "f",
            "Х": "X", "х": "x",
            "Ҳ": "H", "ҳ": "h",
            "Ы": "I", "ы": "i",
        }

        if ch in single_cyr_map:
            result.append(single_cyr_map[ch])
        else:
            result.append(ch)
        i += 1

    return "".join(result)


def transliterate(text: str, direction: Literal["latin-to-cyrillic", "cyrillic-to-latin"] = "latin-to-cyrillic") -> str:
    """Translates text in the specified direction."""
    if direction == "latin-to-cyrillic":
        return latin_to_cyrillic(text)
    elif direction == "cyrillic-to-latin":
        return cyrillic_to_latin(text)
    else:
        raise ValueError(f"Unknown transliteration direction: {direction}")
