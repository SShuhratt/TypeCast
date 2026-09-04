"""Unit tests for the Uzbek Transliteration Engine."""

import unittest
from backend.app.transliterator import (
    latin_to_cyrillic,
    cyrillic_to_latin,
    normalize_apostrophes,
    transliterate,
)


class TestTransliterator(unittest.TestCase):

    def test_apostrophe_normalization(self):
        self.assertEqual(normalize_apostrophes("O‘zbekiston"), "O'zbekiston")
        self.assertEqual(normalize_apostrophes("G’alaba"), "G'alaba")
        self.assertEqual(normalize_apostrophes("Oʻzbek"), "O'zbek")
        self.assertEqual(normalize_apostrophes("Gʼani"), "G'ani")
        self.assertEqual(normalize_apostrophes("san`at"), "san'at")

    def test_digraphs_latin_to_cyrillic(self):
        self.assertEqual(latin_to_cyrillic("Shahar"), "Шаҳар")
        self.assertEqual(latin_to_cyrillic("shahar"), "шаҳар")
        self.assertEqual(latin_to_cyrillic("SHAHAR"), "ШАҲАР")
        self.assertEqual(latin_to_cyrillic("Choyxona"), "Чойхона")
        self.assertEqual(latin_to_cyrillic("choyxona"), "чойхона")
        self.assertEqual(latin_to_cyrillic("CHOYXONA"), "ЧОЙХОНА")
        self.assertEqual(latin_to_cyrillic("Yo'l"), "Йўл")
        self.assertEqual(latin_to_cyrillic("Yulduz"), "Юлдуз")
        self.assertEqual(latin_to_cyrillic("Yangi"), "Янги")
        self.assertEqual(latin_to_cyrillic("Yer"), "Ер")
        self.assertEqual(latin_to_cyrillic("O'zbekiston"), "Ўзбекистон")
        self.assertEqual(latin_to_cyrillic("G'ildirak"), "Ғилдирак")

    def test_initial_and_internal_e_latin_to_cyrillic(self):
        # Initial E/e -> Э/э
        self.assertEqual(latin_to_cyrillic("Eshik"), "Эшик")
        self.assertEqual(latin_to_cyrillic("eshik"), "эшик")
        self.assertEqual(latin_to_cyrillic("Ertaga"), "Эртага")
        # Post-vocalic e -> э
        self.assertEqual(latin_to_cyrillic("poetika"), "поэтика")
        self.assertEqual(latin_to_cyrillic("aeroport"), "аэропорт")
        # Post-consonantal e -> е
        self.assertEqual(latin_to_cyrillic("Besh"), "Беш")
        self.assertEqual(latin_to_cyrillic("men"), "мен")
        self.assertEqual(latin_to_cyrillic("keldim"), "келдим")

    def test_compound_sound_protection_latin_to_cyrillic(self):
        # s'h should become сҳ, not ш
        self.assertEqual(latin_to_cyrillic("Is'hoq"), "Исҳоқ")
        self.assertEqual(latin_to_cyrillic("is'hoq"), "исҳоқ")
        self.assertEqual(latin_to_cyrillic("mus'haf"), "мусҳаф")

    def test_tutuq_belgisi_latin_to_cyrillic(self):
        self.assertEqual(latin_to_cyrillic("a'lo"), "аъло")
        self.assertEqual(latin_to_cyrillic("san'at"), "санъат")
        self.assertEqual(latin_to_cyrillic("sur'at"), "суръат")
        self.assertEqual(latin_to_cyrillic("e'lon"), "эълон")

    def test_cyrillic_to_latin_digraphs(self):
        self.assertEqual(cyrillic_to_latin("Шаҳар"), "Shahar")
        self.assertEqual(cyrillic_to_latin("шаҳар"), "shahar")
        self.assertEqual(cyrillic_to_latin("ШАҲАР"), "SHAHAR")
        self.assertEqual(cyrillic_to_latin("Чойхона"), "Choyxona")
        self.assertEqual(cyrillic_to_latin("ЧОЙХОНА"), "CHOYXONA")
        self.assertEqual(cyrillic_to_latin("Ўзбекистон"), "O'zbekiston")
        self.assertEqual(cyrillic_to_latin("ўзбекистон"), "o'zbekiston")
        self.assertEqual(cyrillic_to_latin("Ғилдирак"), "G'ildirak")
        self.assertEqual(cyrillic_to_latin("Цирк"), "Tsirk")
        self.assertEqual(cyrillic_to_latin("ЦИРК"), "TSIRK")

    def test_cyrillic_to_latin_e_rules(self):
        # Initial or post-vocalic Е/е -> Ye/ye
        self.assertEqual(cyrillic_to_latin("Ер"), "Yer")
        self.assertEqual(cyrillic_to_latin("ер"), "yer")
        self.assertEqual(cyrillic_to_latin("Киев"), "Kiyev")
        # Post-consonantal Е/е -> E/e
        self.assertEqual(cyrillic_to_latin("Бер"), "Ber")
        self.assertEqual(cyrillic_to_latin("бер"), "ber")
        self.assertEqual(cyrillic_to_latin("Мен"), "Men")
        # Э/э -> E/e
        self.assertEqual(cyrillic_to_latin("Эшик"), "Eshik")
        self.assertEqual(cyrillic_to_latin("эшик"), "eshik")
        self.assertEqual(cyrillic_to_latin("Эълон"), "E'lon")

    def test_cyrillic_to_latin_compound_protection(self):
        # сҳ -> s'h
        self.assertEqual(cyrillic_to_latin("Исҳоқ"), "Is'hoq")
        self.assertEqual(cyrillic_to_latin("исҳоқ"), "is'hoq")

    def test_bidirectional_roundtrip_common_words(self):
        words = [
            ("O'zbekiston", "Ўзбекистон"),
            ("Toshkent", "Тошкент"),
            ("Samarqand", "Самарқанд"),
            ("Buxoro", "Бухоро"),
            ("Chilonzor", "Чилонзор"),
            ("Qashqadaryo", "Қашқадарё"),
            ("Surxondaryo", "Сурхондарё"),
            ("Farg'ona", "Фарғона"),
        ]
        for lat, cyr in words:
            self.assertEqual(latin_to_cyrillic(lat), cyr, f"Failed lat->cyr for {lat}")
            self.assertEqual(cyrillic_to_latin(cyr), lat, f"Failed cyr->lat for {cyr}")


if __name__ == "__main__":
    unittest.main()
