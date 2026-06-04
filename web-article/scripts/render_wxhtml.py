#!/usr/bin/env python3
"""render_wxhtml.py — 将 Markdown 翻译稿渲染为 HTML。

用法:
    from scripts.render_wxhtml import render
    html = render(
        title="文章标题",
        author="@author",
        date="2026-04-11",
        source_url="https://x.com/...",
        body_md=translated_markdown,
        body_only=False,
        template="default",  # 可选，对应 templates/default.html
    )

模式:
    body_only=False: 用模板组装完整 HTML（适合预览/本地查看）
    body_only=True:  仅返回正文 HTML 片段（适合公众号 API）
"""

import re
import os
from string import Template


# ── 路径 ──────────────────────────────────────────────
SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATES_DIR = os.path.join(SKILL_DIR, "templates")


# ── 颜色 & 样式常量 ──────────────────────────────────────
GOLD = "#c9a96e"
GOLD_LIGHT = "#e8d5b0"
DARK = "#1a1a2e"
TEXT_COLOR = "#333333"
MUTED = "#999999"
CODE_BG = "#1e1e2e"
CODE_FG = "#cdd6f4"
CODE_INLINE_BG = "#f0ede8"
BLOCKQUOTE_BG = "#faf8f5"
BLOCKQUOTE_BORDER = "#c9a96e"
FIGURE_SHADOW = "rgba(0,0,0,0.08)"

FONT = ("font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', "
        "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif")
MONO = ("font-family: 'JetBrains Mono', 'Fira Code', 'Menlo', 'Consolas', monospace")

CONTAINER = (
    f"max-width:680px; margin:0 auto; padding:24px 16px; "
    f"background:#ffffff; {FONT}; color:{TEXT_COLOR};"
)


# ── 内联 Markdown → HTML 转换 ─────────────────────────────

def _inline(text: str) -> str:
    """处理行内格式：code、bold、italic、links。"""
    # links
    text = re.sub(
        r'(https?://[^\s<>\)]+)',
        rf'<a href="\1" style="color:{GOLD}; word-break:break-all;">\1</a>',
        text,
    )
    # bold
    text = re.sub(
        r'\*\*(.+?)\*\*',
        rf'<strong style="color:{DARK};">\1</strong>',
        text,
    )
    # italic
    text = re.sub(
        r'\*(.+?)\*',
        r'<em>\1</em>',
        text,
    )
    # inline code
    text = re.sub(
        r'`([^`]+)`',
        rf'<code style="background:{CODE_INLINE_BG}; padding:2px 6px; '
        rf'border-radius:3px; {MONO}; font-size:90%; color:{GOLD};">\1</code>',
        text,
    )
    return text

def _inline_clean(text: str) -> str:
    """Process inline formats without inline styles (CSS-driven)."""
    # links
    text = re.sub(
        r'(https?://[^\s<>\)]+)',
        r'<a href="\1">\1</a>',
        text,
    )
    # bold
    text = re.sub(
        r'\*\*(.+?)\*\*',
        r'<strong>\1</strong>',
        text,
    )
    # italic
    text = re.sub(
        r'\*(.+?)\*',
        r'<em>\1</em>',
        text,
    )
    # inline code
    text = re.sub(
        r"`([^`]+)`",
        r'<code>\1</code>',
        text,
    )
    return text


def _render_markdown(md: str) -> str:
    """将 Markdown 正文渲染为 HTML 片段。"""
    lines = md.strip().split('\n')
    parts: list[str] = []
    in_code = False
    code_lines: list[str] = []
    in_ul = False

    def _close_ul():
        nonlocal in_ul
        if in_ul:
            parts.append('</ul>')
            in_ul = False

    # 跳过开头的标题行（h1/h2/h3），避免与公众号标题重复
    skip_first_title = True
    for i, line in enumerate(lines):
        stripped = line.strip()
        # 如果是第一行，且是标题，跳过
        if skip_first_title and (stripped.startswith('# ') or stripped.startswith('## ') or stripped.startswith('### ')):
            continue
        skip_first_title = False

        # ── 代码块 ──
        if line.strip().startswith('```'):
            if in_code:
                raw = '\n'.join(code_lines)
                escaped = (raw.replace('&', '&amp;')
                           .replace('<', '&lt;')
                           .replace('>', '&gt;'))
                parts.append(
                    f'<div style="background:{CODE_BG}; border-radius:8px; '
                    f'padding:16px; margin:16px 0; overflow-x:auto; '
                    f'{MONO}; font-size:13px; line-height:1.6; color:{CODE_FG};">'
                    f'<pre style="margin:0; white-space:pre-wrap;">{escaped}</pre>'
                    f'</div>'
                )
                code_lines = []
                in_code = False
            else:
                _close_ul()
                in_code = True
            continue

        if in_code:
            code_lines.append(line)
            continue

        # ── h2 ──
        if line.startswith('## '):
            _close_ul()
            title = _inline(line[3:].strip())
            parts.append(
                f'<h2 style="font-size:20px; font-weight:700; color:{DARK}; '
                f'margin:32px 0 16px; padding-bottom:10px; '
                f'border-bottom:2px solid transparent; position:relative;">'
                f'{title}'
                f'<span style="position:absolute; bottom:-2px; left:0; '
                f'width:60px; height:2px; '
                f'background:linear-gradient(to right,{GOLD},{GOLD_LIGHT});"></span>'
                f'</h2>'
            )
            continue

        # ── h3 ──
        if line.startswith('### '):
            _close_ul()
            title = _inline(line[4:].strip())
            parts.append(
                f'<h3 style="font-size:18px; font-weight:600; color:{DARK}; '
                f'margin:24px 0 12px;">{title}</h3>'
            )
            continue

        # ── blockquote ──
        if line.startswith('> '):
            _close_ul()
            bq = _inline(line[2:].strip())
            parts.append(
                f'<blockquote style="border-left:3px solid {BLOCKQUOTE_BORDER}; '
                f'margin:16px 0; padding:12px 20px; '
                f'background:{BLOCKQUOTE_BG}; color:#555; font-style:italic;">'
                f'{bq}</blockquote>'
            )
            continue

        # ── image ──
        img_match = re.match(r'!\[([^\]]*)\]\(([^)]+)\)', line.strip())
        if img_match:
            _close_ul()
            alt, src = img_match.group(1), img_match.group(2)
            if not src.startswith('http'):
                src = f'images/{os.path.basename(src)}'
            parts.append(
                f'<figure style="margin:24px 0; text-align:center;">'
                f'<img src="{src}" alt="{alt}" style="max-width:100%; '
                f'border-radius:8px; box-shadow:0 4px 20px {FIGURE_SHADOW};" />'
                f'</figure>'
            )
            continue

        # ── empty ──
        if line.strip() == '':
            _close_ul()
            continue

        # ── ul ──
        if re.match(r'^[-*] ', line):
            if not in_ul:
                parts.append(
                    f'<ul style="padding-left:24px; margin:8px 0;">'
                )
                in_ul = True
            li = _inline(re.sub(r'^[-*] ', '', line).strip())
            # 过滤空列表项（避免微信显示空圆点）
            if li:  # 只有非空内容才生成 <li>
                parts.append(
                    f'<li style="color:{TEXT_COLOR}; line-height:1.8; margin:4px 0;">'
                    f'{li}</li>'
                )
            continue

        # ── ol ──
        if re.match(r'^\d+\.\s', line):
            if not in_ul:
                parts.append(
                    f'<ol style="padding-left:24px; margin:8px 0;">'
                )
                in_ul = True
            li = _inline(re.sub(r'^\d+\.\s', '', line).strip())
            # 过滤空列表项（避免微信显示空圆点）
            if li:  # 只有非空内容才生成 <li>
                parts.append(
                    f'<li style="color:{TEXT_COLOR}; line-height:1.8; margin:4px 0;">'
                    f'{li}</li>'
                )
            continue

        # ── paragraph ──
        _close_ul()
        p = _inline(line.strip())
        if p:
            parts.append(
                f'<p style="font-size:16px; line-height:1.9; '
                f'color:{TEXT_COLOR}; margin:12px 0;">{p}</p>'
            )

    _close_ul()
    return '\n'.join(parts)


def _render_markdown_clean(md: str) -> str:
    """Render Markdown to clean HTML (no inline styles), for template CSS."""
    lines_md = md.strip().split("\n")
    parts = []
    in_code = False
    code_lines = []
    in_ul = False

    def _close_ul():
        nonlocal in_ul
        if in_ul:
            parts.append("</ul>")
            in_ul = False

    for line in lines_md:
        if line.strip().startswith("```"):
            if in_code:
                raw = "\n".join(code_lines)
                escaped = raw.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                parts.append(f"<pre><code>{escaped}</code></pre>")
                code_lines = []
                in_code = False
            else:
                _close_ul()
                in_code = True
            continue
        if in_code:
            code_lines.append(line)
            continue
        if line.startswith("## "):
            _close_ul()
            title = _inline_clean(line[3:].strip())
            parts.append(f"<h2>{title}</h2>")
            continue
        if line.startswith("### "):
            _close_ul()
            title = _inline_clean(line[4:].strip())
            parts.append(f"<h3>{title}</h3>")
            continue
        if line.startswith("> "):
            _close_ul()
            bq = _inline_clean(line[2:].strip())
            parts.append(f"<blockquote>{bq}</blockquote>")
            continue
        img_match = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", line.strip())
        if img_match:
            _close_ul()
            alt, src = img_match.group(1), img_match.group(2)
            if not src.startswith("http"):
                src = f"images/{os.path.basename(src)}"
            parts.append(f'<figure><img src="{src}" alt="{alt}" /></figure>')
            continue
        if line.strip() == "":
            _close_ul()
            continue
        if re.match(r"^[-*] ", line):
            if not in_ul:
                parts.append("<ul>")
                in_ul = True
            li = _inline_clean(re.sub(r"^[-*] ", "", line).strip())
            parts.append(f"<li>{li}</li>")
            continue
        if re.match(r"^\d+\.\s", line):
            if not in_ul:
                parts.append("<ol>")
                in_ul = True
            li = _inline_clean(re.sub(r"^\d+\.\s", "", line).strip())
            parts.append(f"<li>{li}</li>")
            continue
        _close_ul()
        p = _inline_clean(line.strip())
        if p:
            parts.append(f"<p>{p}</p>")
    _close_ul()
    return "\n".join(parts)



# ── 模板相关 ──────────────────────────────────────────────

def _build_intro(intro: str) -> str:
    """生成编者推荐语 intro（内联样式，用于 API 模式）。"""
    if not intro:
        return ""
    # 模仿模板的样式，但使用内联样式
    return (
        f'<div style="padding:24px 0 20px;">'
        f'<div style="display:inline-flex; align-items:center; gap:6px; '
        f'font-size:11px; color:{GOLD}; text-transform:uppercase; '
        f'letter-spacing:3px; font-weight:600; margin-bottom:14px;">'
        f'<span style="width:8px; height:2px; background:{GOLD};"></span>'
        f'编者按</div>'
        f'<div style="font-size:16px; line-height:1.95; color:#555; '
        f'border-left:3px solid {GOLD_LIGHT}; padding-left:20px;">'
        f'{intro}'
        f'<p style="margin:12px 0 0; font-size:12px; color:#999;">'
        f'原文版权归原作者所有，蓝衣剑客只保留翻译、编辑之所有权</p>'
        f'</div>'
        f'</div>'
        f'<div style="display:flex; align-items:center; justify-content:center; '
        f'padding:20px 0; gap:12px; margin-bottom:24px;">'
        f'<span style="flex:1; height:1px; '
        f'background:linear-gradient(90deg, transparent, {GOLD_LIGHT}, transparent);"></span>'
        f'<span style="width:6px; height:6px; border:1.5px solid {GOLD}; '
        f'transform:rotate(45deg);"></span>'
        f'<span style="flex:1; height:1px; '
        f'background:linear-gradient(90deg, transparent, {GOLD_LIGHT}, transparent);"></span>'
        f'</div>'
    )


def _build_footer(author: str, source_url: str) -> str:
    """生成文末 footer（原作者 + 翻译整理人 + 原文链接）。"""
    return (
        f'<div style="margin-top:40px; padding-top:24px; '
        f'border-top:1px solid #eee8dd; text-align:center;">'
        # 原作者和翻译整理人
        f'<div style="display:flex; justify-content:center; gap:40px; margin-bottom:20px;">'
        f'<div style="display:flex; flex-direction:column; align-items:center;">'
        f'<span style="font-size:12px; color:#bbb; text-transform:uppercase; '
        f'letter-spacing:1px; margin-bottom:4px;">原作者</span>'
        f'<span style="font-size:14px; color:#555; font-weight:500;">{author}</span>'
        f'</div>'
        f'<div style="display:flex; flex-direction:column; align-items:center;">'
        f'<span style="font-size:12px; color:#bbb; text-transform:uppercase; '
        f'letter-spacing:1px; margin-bottom:4px;">翻译整理</span>'
        f'<span style="font-size:14px; color:#555; font-weight:500;">蓝衣剑客</span>'
        f'</div>'
        f'</div>'
        # 原文链接
        f'<div style="display:inline-flex; align-items:center; gap:6px; '
        f'font-size:12px; color:#bbb; text-transform:uppercase; '
        f'letter-spacing:2px; margin-bottom:10px;">'
        f'<span style="width:24px; height:1px; background:#ddd;"></span>原文'
        f'<span style="width:24px; height:1px; background:#ddd;"></span>'
        f'</div>'
        f'<a href="{source_url}" style="color:{GOLD}; text-decoration:none; '
        f'font-size:13px; word-break:break-all;">{source_url}</a>'
        f'</div>'
    )


def list_templates() -> list[str]:
    """列出所有可用模板名。"""
    if not os.path.isdir(TEMPLATES_DIR):
        return []
    return [
        f.replace('.html', '')
        for f in sorted(os.listdir(TEMPLATES_DIR))
        if f.endswith('.html') and not f.startswith('.')
    ]


# ── 公开 API ──────────────────────────────────────────────

def render(
    title: str,
    author: str,
    date: str,
    source_url: str,
    body_md: str = "",
    body_only: bool = False,
    template: str = "default",
    intro: str = "",
    **kwargs,
) -> str:
    """渲染 HTML。

    Args:
        title: 文章标题（用于 <title> 和 GitHub 备份）。
        author: 作者（如 @nickbaumann_）。
        date: 发布日期（YYYY-MM-DD）。
        source_url: 原文链接。
        body_md: 翻译后的 Markdown 正文。
        body_only: True 时仅返回正文 HTML 片段（给公众号 API）。
        template: 模板名称，对应 templates/<name>.html。
        intro: 推荐语/编者按，说明文章价值（模板预览用）。
        **kwargs: 保留兼容（stats 等）。
        body_only: True 时仅返回正文 HTML 片段。
        template: 模板名称，对应 templates/<name>.html。

    Returns:
        HTML 字符串。
    """
    # body_only: inline styles for WeChat API
    # template: clean HTML for template CSS
    if body_only:
        # API 模式：需要把 intro 也渲染到正文开头，并且加上 footer
        body_only_html = _render_markdown(body_md)
        intro_html = _build_intro(intro)
        footer_html = _build_footer(author, source_url)
        return intro_html + body_only_html + footer_html

    body_html = _render_markdown_clean(body_md)

    # 读取模板
    template_path = os.path.join(TEMPLATES_DIR, f"{template}.html")
    if not os.path.exists(template_path):
        raise FileNotFoundError(
            f"Template not found: {template_path}\n"
            f"Available: {list_templates()}"
        )
    with open(template_path, 'r', encoding='utf-8') as f:
        tmpl = Template(f.read())

    footer = _build_footer(author, source_url)

    return tmpl.safe_substitute(
        title=title,
        author=author,
        date=date,
        source_url=source_url,
        intro=intro,
        body_html=body_html,
        footer=footer,
        container_style=CONTAINER,
        stats=kwargs.get("stats", ""),
    )


if __name__ == '__main__':
    import sys
    import json

    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r', encoding='utf-8') as f:
            data = json.load(f)
        result = render(**data)
        out = data.get('output', '/dev/stdout')
        with open(out, 'w', encoding='utf-8') as f:
            f.write(result)
        print(f"Written to {out}")
    else:
        print("Usage: python render_wxhtml.py <article.json>")
        print("JSON keys: title, author, date, source_url, stats, body_md, body_only, output, template")
        print(f"Available templates: {list_templates()}")
