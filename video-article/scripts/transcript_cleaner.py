#!/usr/bin/env python3
"""
transcript_cleaner.py — 清洗字幕/逐字稿文本

功能：
1. 去除时间戳（多种格式）
2. 去除说话人标签（如 "Speaker 1:", ">>>" 等）
3. 去除语气词和填充词
4. 合并碎片句子
5. 修正自动字幕的断句错误
6. 去除多余空白
"""

import re
import json

# 语气词和填充词（中英文）
FILLER_WORDS_CN = [
    "嗯", "啊", "那个", "就是", "然后", "所以说", "其实吧", "怎么说呢",
    "对吧", "是吧", "对对对", "呃", "哦", "嘛", "哈", "哎", "这个",
    "你知道吧", "你懂吧", "就是说", "那什么", "这么", "那种",
    "有一点", "反正", "讲真", "就是说啊", "然后呢",
]

FILLER_WORDS_EN = [
    "um", "uh", "like", "you know", "I mean", "basically", "literally",
    "so yeah", "right", "exactly", "absolutely", "kind of", "sort of",
    "and so", "and then", "you see", "well", "okay so",
]

# 去除英文语气词时注意不要误删正常内容中的词
FILLER_PATTERN_EN = re.compile(
    r'\b(?:um+|uh+|er+)\b[,.]?\s*',
    re.IGNORECASE
)

# 时间戳模式
TIMESTAMP_PATTERNS = [
    r'\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d+)?',           # 01:23:45.678
    r'\[\d{1,2}:\d{2}(?::\d{2})?\]',                   # [01:23]
    r'\(\d{1,2}:\d{2}(?::\d{2})?\)',                   # (01:23)
    r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}',           # ISO 时间戳
    r'\d{1,2}:\d{2}(?::\d{2})?\s*[-–—>]\s*\d{1,2}:\d{2}(?::\d{2})?',  # 01:23 --> 02:34
]

# 说话人标签模式
SPEAKER_PATTERNS = [
    r'(?:Speaker\s*\d+\s*:)',              # Speaker 1:
    r'(?:说话人\s*\d+\s*[:：])',           # 说话人 1：
    r'(?:>>+\s*\w+\s*:)',                   # >>> John:
    r'(?:\[\w+\]\s*[:：])',                 # [John]:
    r'(?:\(\w+\)\s*[:：])',                 # (John):
    r'(?:(?:^|\n)\w[\w\s]*?(?:说|:|：)\s*)',  # 行首人名后跟冒号
]

# 合并碎片句子的规则：短句 + 省略号/逗号结尾
FRAGMENT_RE = re.compile(r'(.{1,20}[,…,、])\n(?!\n)')


def remove_timestamps(text: str) -> str:
    """去除各种格式的时间戳"""
    for pattern in TIMESTAMP_PATTERNS:
        text = re.sub(pattern, '', text)
    return text


def remove_speaker_labels(text: str) -> str:
    """去除说话人标签，保留说话内容"""
    # 保守匹配：只去除明显是说话人标签的部分
    for pattern in SPEAKER_PATTERNS[:-1]:  # 排除最后一个通用模式
        text = re.sub(pattern, '', text)
    # 最后一个模式：行首 2-10 字符的中文名 + 冒号
    text = re.sub(r'(?:^|\n)([\u4e00-\u9fff]{2,4})\s*[:：]', r'\n', text)
    return text


def remove_filler_words(text: str) -> str:
    """去除语气词和填充词"""
    # 英文语气词（精确匹配）
    text = FILLER_PATTERN_EN.sub('', text)

    # 中文语气词（句子开头的）
    for filler in FILLER_WORDS_CN:
        # 句首的语气词
        text = re.sub(r'(?:^|\n|[，。？！；])\s*' + re.escape(filler) + r'[，,]?\s*', 
                      lambda m: '' if m.start() == 0 or m.group()[0] in '，。？！；\n' else m.group(),
                      text)

    return text


def merge_fragments(text: str) -> str:
    """合并碎片句子"""
    text = FRAGMENT_RE.sub(r'\1', text)
    return text


def fix_line_breaks(text: str) -> str:
    """修正断句错误：单个句子被错误分成多行"""
    lines = text.split('\n')
    merged = []
    buffer = ''

    for line in lines:
        line = line.strip()
        if not line:
            if buffer:
                merged.append(buffer)
                buffer = ''
            merged.append('')
            continue

        # 如果当前行以小写字母开头（英文）或以标点连接（中文），合并到上一行
        if buffer and (line[0].islower() or line[0] in '，、和与但或而且'):
            buffer += line
        elif buffer and buffer[-1] in '，,、' and line[0].isupper():
            buffer += line
        else:
            if buffer:
                merged.append(buffer)
            buffer = line

    if buffer:
        merged.append(buffer)

    return '\n'.join(merged)


def clean_whitespace(text: str) -> str:
    """清理多余空白"""
    # 多个空行变一个
    text = re.sub(r'\n{3,}', '\n\n', text)
    # 行首行尾空白
    text = '\n'.join(line.strip() for line in text.split('\n'))
    # 多个空格变一个
    text = re.sub(r' {2,}', ' ', text)
    return text.strip()


def clean_transcript(raw_text: str) -> dict:
    """
    主清洗函数

    Args:
        raw_text: 原始字幕/逐字稿文本

    Returns:
        dict: {
            "cleaned_text": str,     # 清洗后的文本
            "stats": dict            # 清洗统计
        }
    """
    original_len = len(raw_text)

    text = raw_text
    text = remove_timestamps(text)
    text = remove_speaker_labels(text)
    text = remove_filler_words(text)
    text = merge_fragments(text)
    text = fix_line_breaks(text)
    text = clean_whitespace(text)

    return {
        "cleaned_text": text,
        "stats": {
            "original_chars": original_len,
            "cleaned_chars": len(text),
            "reduction_pct": round((1 - len(text) / original_len) * 100, 1) if original_len > 0 else 0,
        }
    }


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print("Usage: python transcript_cleaner.py <input_file> [output_file]")
        sys.exit(1)

    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        raw = f.read()

    result = clean_transcript(raw)
    print(f"清洗完成: {result['stats']['original_chars']} → {result['stats']['cleaned_chars']} 字符 (减少 {result['stats']['reduction_pct']}%)")

    out_path = sys.argv[2] if len(sys.argv) > 2 else sys.argv[1].replace('.txt', '.cleaned.txt')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(result['cleaned_text'])

    print(f"已保存到: {out_path}")
