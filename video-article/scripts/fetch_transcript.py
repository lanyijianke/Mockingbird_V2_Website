#!/usr/bin/env python3
"""
fetch_transcript.py — 从视频/播客平台提取字幕或转录文本

支持的平台：
1. YouTube — 通过 youtube-transcript-api 提取字幕
2. X/Twitter — 通过 yt-dlp 下载视频，需手动转录（无字幕 API）
3. 通用 — 下载音视频文件（yt-dlp），提示用户手动转录

输出格式：
- JSON（默认）：包含 metadata + transcript
- 纯文本（--text-only）：只有转录文本
- 带时间戳（--timestamps）：文本 + 时间戳
"""

import re
import sys
import json
import subprocess
import os
from urllib.parse import urlparse, parse_qs


def extract_video_id(url: str) -> str | None:
    """从 URL 提取 YouTube 视频 ID"""
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([a-zA-Z0-9_-]{11})',
        r'(?:youtube\.com/watch\?.*v=)([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def is_youtube_url(url: str) -> bool:
    """判断是否为 YouTube URL"""
    return 'youtube.com' in url or 'youtu.be' in url


def detect_platform(url: str) -> str:
    """检测 URL 平台"""
    url_lower = url.lower()
    if 'youtube.com' in url_lower or 'youtu.be' in url_lower:
        return 'youtube'
    elif 'bilibili.com' in url_lower or 'b23.tv' in url_lower:
        return 'bilibili'
    elif 'podcasts.apple.com' in url_lower:
        return 'apple_podcast'
    elif 'spotify.com' in url_lower and 'podcast' in url_lower:
        return 'spotify'
    elif 'xiaoyuzhoufm.com' in url_lower:
        return 'xiaoyuzhou'
    elif 'feishu.cn/minutes/' in url_lower:
        return 'feishu_minutes'
    elif 'x.com/' in url_lower or 'twitter.com/' in url_lower:
        return 'x_twitter'
    else:
        return 'unknown'


def fetch_youtube_transcript(url: str, language: str = 'en', timestamps: bool = False) -> dict:
    """获取 YouTube 字幕"""
    video_id = extract_video_id(url)
    if not video_id:
        return {"error": f"无法从 URL 提取 YouTube 视频 ID: {url}"}

    try:
        from youtube_transcript_api import YouTubeTranscriptApi

        ytt_api = YouTubeTranscriptApi()

        # 尝试获取指定语言的字幕
        try:
            transcripts = ytt_api.fetch(video_id, languages=[language])
        except Exception:
            # 尝试任何可用语言
            try:
                transcript_list = ytt_api.list(video_id)
                # 找手动字幕优先，自动生成次之
                manual = [t for t in transcript_list if not t.is_generated]
                auto = [t for t in transcript_list if t.is_generated]
                pick = manual[0] if manual else (auto[0] if auto else None)
                if pick:
                    transcripts = ytt_api.fetch(video_id, languages=[pick.language_code])
                else:
                    return {"error": "该视频没有可用字幕"}
            except Exception as e2:
                return {"error": f"获取字幕失败: {e2}"}

        # 获取视频标题
        try:
            from youtube_transcript_api.formatters import TextFormatter
        except ImportError:
            TextFormatter = None

        transcript_data = []
        for snippet in transcripts:
            transcript_data.append({
                "start": snippet.start,
                "duration": snippet.duration,
                "text": snippet.text,
            })

        # 构建文本
        if timestamps:
            text_lines = []
            for d in transcript_data:
                minutes = int(d['start']) // 60
                seconds = int(d['start']) % 60
                text_lines.append(f"[{minutes:02d}:{seconds:02d}] {d['text']}")
            full_text = '\n'.join(text_lines)
        else:
            full_text = ' '.join(d['text'] for d in transcript_data)
            # 清理多余空白
            full_text = re.sub(r'\s+', ' ', full_text).strip()

        # 获取视频元信息
        metadata = {"platform": "youtube", "video_id": video_id, "url": url}

        try:
            result = subprocess.run(
                ['yt-dlp', '--print', 'title', '--no-download', url],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                metadata['title'] = result.stdout.strip()
        except Exception:
            pass

        return {
            "metadata": metadata,
            "transcript": full_text,
            "transcript_data": transcript_data if timestamps else None,
            "language": language,
            "has_subtitles": True,
        }

    except Exception as e:
        return {"error": f"YouTube 字幕获取失败: {e}"}


def download_media(url: str, output_dir: str = '/tmp/video2article') -> dict:
    """下载音视频文件（用于无字幕的情况）"""
    os.makedirs(output_dir, exist_ok=True)

    try:
        # 先获取标题用于文件命名
        title_result = subprocess.run(
            ['yt-dlp', '--print', 'title', '--no-download', url],
            capture_output=True, text=True, timeout=30
        )
        title = title_result.stdout.strip() if title_result.returncode == 0 else 'video'

        # 清理文件名
        safe_title = re.sub(r'[^\w\s-]', '', title).strip()[:50]
        safe_title = re.sub(r'\s+', '_', safe_title)

        output_template = os.path.join(output_dir, f"{safe_title}.%(ext)s")

        # 下载音频优先（体积小，飞书妙记会自动处理）
        result = subprocess.run(
            ['yt-dlp', '-x', '--audio-format', 'mp3',
             '--audio-quality', '0',
             '-o', output_template,
             '--no-playlist',
             url],
            capture_output=True, text=True, timeout=600
        )

        if result.returncode != 0:
            return {"error": f"下载失败: {result.stderr}"}

        # 找到下载的文件
        downloaded_files = os.listdir(output_dir)
        latest_file = max(
            [f for f in downloaded_files if f.startswith(safe_title)],
            key=lambda f: os.path.getmtime(os.path.join(output_dir, f)),
            default=None
        )

        if not latest_file:
            return {"error": "下载完成但找不到文件"}

        file_path = os.path.join(output_dir, latest_file)
        file_size = os.path.getsize(file_path)

        return {
            "file_path": file_path,
            "file_name": latest_file,
            "file_size_mb": round(file_size / (1024 * 1024), 2),
            "title": title,
            "message": f"已下载到: {file_path} ({round(file_size / (1024 * 1024), 2)} MB)\n请手动上传到飞书妙记进行转录，完成后提供妙记链接或 minute_token。",
        }

    except subprocess.TimeoutExpired:
        return {"error": "下载超时（10分钟），文件可能过大"}
    except Exception as e:
        return {"error": f"下载失败: {e}"}


def main():
    import argparse
    parser = argparse.ArgumentParser(description='提取视频/播客字幕')
    parser.add_argument('url', help='视频/播客 URL')
    parser.add_argument('--language', default='en', help='首选字幕语言 (default: en)')
    parser.add_argument('--text-only', action='store_true', help='只输出纯文本')
    parser.add_argument('--timestamps', action='store_true', help='保留时间戳')
    parser.add_argument('--download', action='store_true', help='下载音视频文件（无字幕时使用）')
    parser.add_argument('--output', '-o', help='输出文件路径')
    parser.add_argument('--output-dir', default='/tmp/video2article', help='下载目录')
    args = parser.parse_args()

    platform = detect_platform(args.url)

    if args.download:
        result = download_media(args.url, args.output_dir)
        if args.output and 'file_path' in result:
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(0 if 'error' not in result else 1)

    if platform == 'youtube':
        result = fetch_youtube_transcript(args.url, args.language, args.timestamps)
    elif platform == 'feishu_minutes':
        # 飞书妙记需要通过 lark-cli 获取
        result = {"error": "飞书妙记请使用 lark-cli vc +notes --minute-tokens <token> 获取逐字稿"}
    elif platform == 'x_twitter':
        # X/Twitter 无字幕 API，只能下载后手动转录
        result = {"error": "X/Twitter 视频没有字幕 API，请使用 --download 下载后上传飞书妙记转录"}
    else:
        result = {"error": f"暂不支持平台: {platform}，请使用 --download 下载后手动转录"}

    if 'error' in result:
        print(json.dumps(result, ensure_ascii=False, indent=2), file=sys.stderr)
        sys.exit(1)

    if args.text_only:
        print(result['transcript'])
    else:
        output = {"metadata": result['metadata'], "transcript": result['transcript']}
        if result.get('transcript_data'):
            output['transcript_data'] = result['transcript_data']
        print(json.dumps(output, ensure_ascii=False, indent=2))

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(result['transcript'])
        print(f"\n已保存到: {args.output}", file=sys.stderr)


if __name__ == '__main__':
    main()
