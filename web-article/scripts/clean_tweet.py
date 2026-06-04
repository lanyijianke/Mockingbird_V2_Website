#!/usr/bin/env python3
"""clean_tweet.py — 清洗从 X/Twitter 抓取的原始推文文本。

用法:
    from scripts.clean_tweet import clean_text, validate_cleaned_text
    cleaned = clean_text(raw_text)
    report = validate_cleaned_text(cleaned)
"""

import re
import html as html_lib
from dataclasses import dataclass


@dataclass
class CleanReport:
    """清洗结果报告。"""
    original_len: int
    cleaned_len: int
    removed_tco_links: int
    removed_html_entities: int
    removed_thread_markers: int
    removed_image_placeholders: int
    collapsed_blank_lines: int


def _remove_tco_links(text: str) -> tuple[str, int]:
    """移除 t.co 短链接。返回 (处理后的文本, 移除数量)。"""
    pattern = r'https?://t\.co/[A-Za-z0-9]+'
    matches = re.findall(pattern, text)
    cleaned = re.sub(pattern, '', text)
    return cleaned, len(matches)


def _decode_html_entities(text: str) -> tuple[str, int]:
    """还原 HTML 实体（&amp; → & 等）。"""
    cleaned = html_lib.unescape(text)
    count = sum(1 for a, b in zip(text, cleaned) if a != b)
    return cleaned, count


def _remove_thread_markers(text: str) -> tuple[str, int]:
    """移除 Thread 标记，如 1/ 🧵、2/ 等。"""
    pattern = r'^\d+\s*/\s*.*$'
    matches = re.findall(pattern, text, re.MULTILINE)
    cleaned = re.sub(pattern, '', text, flags=re.MULTILINE)
    return cleaned, len(matches)


def _remove_image_placeholders(text: str) -> tuple[str, int]:
    """移除推文中的图片占位符，如 [Image]、pic.twitter.com 链接。"""
    patterns = [
        r'\[Image\]',
        r'\[图片\]',
        r'pic\.twitter\.com/[A-Za-z0-9]+',
    ]
    count = 0
    for pattern in patterns:
        matches = re.findall(pattern, text)
        count += len(matches)
        text = re.sub(pattern, '', text)
    return text, count


def _collapse_blank_lines(text: str) -> tuple[str, int]:
    """将连续空行折叠为最多两个换行。"""
    original = text
    text = re.sub(r'\n{3,}', '\n\n', text)
    removed = original.count('\n') - text.count('\n')
    return text.strip(), max(0, removed // 3)


def clean_text(raw_text: str) -> tuple[str, CleanReport]:
    """清洗原始推文文本。

    处理顺序：
    1. 解码 HTML 实体
    2. 移除 t.co 短链接
    3. 移除 Thread 标记
    4. 移除图片占位符
    5. 折叠多余空行

    Args:
        raw_text: 从浏览器抓取的原始推文文本。

    Returns:
        (cleaned_text, report) 元组。
    """
    original_len = len(raw_text)

    text, removed_entities = _decode_html_entities(raw_text)
    text, removed_tco = _remove_tco_links(text)
    text, removed_threads = _remove_thread_markers(text)
    text, removed_images = _remove_image_placeholders(text)
    text, collapsed = _collapse_blank_lines(text)

    report = CleanReport(
        original_len=original_len,
        cleaned_len=len(text),
        removed_tco_links=removed_tco,
        removed_html_entities=removed_entities,
        removed_thread_markers=removed_threads,
        removed_image_placeholders=removed_images,
        collapsed_blank_lines=collapsed,
    )

    return text, report


def validate_cleaned_text(text: str) -> dict:
    """对清洗后的文本做基础校验。

    Returns:
        dict with 'ok', 'issues', 'stats'。
    """
    issues = []

    if len(text) < 10:
        issues.append("文本太短，可能抓取失败")
    if 't.co/' in text:
        issues.append("仍含有 t.co 短链接")
    if re.search(r'&[a-z]+;', text):
        issues.append("可能含有未解码的 HTML 实体")

    # 检测未包裹代码块的内联命令行模式
    lines_with_commands = 0
    for line in text.split('\n'):
        stripped = line.strip()
        # 以常见命令前缀开头但不在代码块中
        if re.match(r'^(ls|cd|cat|grep|git|pip|npm|curl|python|node)\s', stripped):
            if not stripped.startswith('```'):
                lines_with_commands += 1
    if lines_with_commands > 0:
        issues.append(f"检测到 {lines_with_commands} 行疑似未包裹代码块的命令行内容，建议检查")

    return {
        'ok': len(issues) == 0,
        'issues': issues,
        'stats': {
            'char_count': len(text),
            'line_count': text.count('\n') + 1,
            'word_count': len(text.split()),
        },
    }


if __name__ == '__main__':
    import sys

    if len(sys.argv) > 1:
        raw = open(sys.argv[1], 'r', encoding='utf-8').read()
    else:
        raw = sys.stdin.read()

    cleaned, report = clean_text(raw)
    validation = validate_cleaned_text(cleaned)

    print("=== 清洗报告 ===")
    print(f"原始长度: {report.original_len} 字符")
    print(f"清洗后:   {report.cleaned_len} 字符")
    print(f"移除 t.co 链接: {report.removed_tco_links}")
    print(f"还原 HTML 实体: {report.removed_html_entities}")
    print(f"移除 Thread 标记: {report.removed_thread_markers}")
    print(f"移除图片占位符: {report.removed_image_placeholders}")
    print(f"折叠空行: {report.collapsed_blank_lines}")

    print("\n=== 校验 ===")
    if validation['ok']:
        print("通过")
    else:
        for issue in validation['issues']:
            print(f"⚠️  {issue}")

    print("\n=== 清洗结果 ===")
    print(cleaned)
