# ---------------------------------------------------------------------------
# Yayoi export helpers (copied from seisei_yayoi_import to avoid dependency)
# ---------------------------------------------------------------------------

_FULL_TO_HALF_KANA = {
    'ア': 'ｱ', 'イ': 'ｲ', 'ウ': 'ｳ', 'エ': 'ｴ', 'オ': 'ｵ',
    'カ': 'ｶ', 'キ': 'ｷ', 'ク': 'ｸ', 'ケ': 'ｹ', 'コ': 'ｺ',
    'サ': 'ｻ', 'シ': 'ｼ', 'ス': 'ｽ', 'セ': 'ｾ', 'ソ': 'ｿ',
    'タ': 'ﾀ', 'チ': 'ﾁ', 'ツ': 'ﾂ', 'テ': 'ﾃ', 'ト': 'ﾄ',
    'ナ': 'ﾅ', 'ニ': 'ﾆ', 'ヌ': 'ﾇ', 'ネ': 'ﾈ', 'ノ': 'ﾉ',
    'ハ': 'ﾊ', 'ヒ': 'ﾋ', 'フ': 'ﾌ', 'ヘ': 'ﾍ', 'ホ': 'ﾎ',
    'マ': 'ﾏ', 'ミ': 'ﾐ', 'ム': 'ﾑ', 'メ': 'ﾒ', 'モ': 'ﾓ',
    'ヤ': 'ﾔ', 'ユ': 'ﾕ', 'ヨ': 'ﾖ',
    'ラ': 'ﾗ', 'リ': 'ﾘ', 'ル': 'ﾙ', 'レ': 'ﾚ', 'ロ': 'ﾛ',
    'ワ': 'ﾜ', 'ヲ': 'ｦ', 'ン': 'ﾝ',
    'ァ': 'ｧ', 'ィ': 'ｨ', 'ゥ': 'ｩ', 'ェ': 'ｪ', 'ォ': 'ｫ',
    'ッ': 'ｯ', 'ャ': 'ｬ', 'ュ': 'ｭ', 'ョ': 'ｮ',
    'ー': 'ｰ', '゛': 'ﾞ', '゜': 'ﾟ',
    'ガ': 'ｶﾞ', 'ギ': 'ｷﾞ', 'グ': 'ｸﾞ', 'ゲ': 'ｹﾞ', 'ゴ': 'ｺﾞ',
    'ザ': 'ｻﾞ', 'ジ': 'ｼﾞ', 'ズ': 'ｽﾞ', 'ゼ': 'ｾﾞ', 'ゾ': 'ｿﾞ',
    'ダ': 'ﾀﾞ', 'ヂ': 'ﾁﾞ', 'ヅ': 'ﾂﾞ', 'デ': 'ﾃﾞ', 'ド': 'ﾄﾞ',
    'バ': 'ﾊﾞ', 'ビ': 'ﾋﾞ', 'ブ': 'ﾌﾞ', 'ベ': 'ﾍﾞ', 'ボ': 'ﾎﾞ',
    'パ': 'ﾊﾟ', 'ピ': 'ﾋﾟ', 'プ': 'ﾌﾟ', 'ペ': 'ﾍﾟ', 'ポ': 'ﾎﾟ',
    'ヴ': 'ｳﾞ',
}

# Selection key → Japanese account name mapping for Yayoi export
DEBIT_ACCOUNT_NAMES = {
    'shiire': '仕入高',
    'shoumouhin': '消耗品費',
    'jimu': '事務用品費',
    'kousai': '交際費',
    'kaigi': '会議費',
    'ryohi': '旅費交通費',
    'tsuushin': '通信費',
    'suido': '水道光熱費',
    'sozei': '租税公課',
    'zappi': '雑費',
}

CREDIT_ACCOUNT_NAMES = {
    'genkin': '現金',
    'yokin': '普通預金',
    'kaikake': '買掛金',
    'miharai': '未払金',
    'card': 'クレジットカード',
}


def to_halfwidth_kana(text):
    """Convert full-width katakana to half-width for Yayoi compatibility."""
    if not text:
        return ''
    return ''.join(_FULL_TO_HALF_KANA.get(ch, ch) for ch in text)


def truncate_yayoi(text, max_halfwidth):
    """Truncate text to fit within *max_halfwidth* half-width character count.

    CJK / full-width characters count as 2 half-width units.
    """
    if not text:
        return ''
    text = text.replace('\n', '').replace('\r', '').replace('\xa0', ' ')
    # Strip characters that cp932 cannot encode
    text = text.encode('cp932', errors='ignore').decode('cp932')
    width = 0
    result = []
    for ch in text:
        cp = ord(ch)
        cw = 2 if (
            (0x3000 <= cp <= 0x9FFF)
            or (0xF900 <= cp <= 0xFAFF)
            or (0xFF01 <= cp <= 0xFF60)
            or (0xFFE0 <= cp <= 0xFFE6)
            or (0x20000 <= cp <= 0x2FA1F)
        ) else 1
        if width + cw > max_halfwidth:
            break
        width += cw
        result.append(ch)
    return ''.join(result)
