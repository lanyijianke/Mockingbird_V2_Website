#!/usr/bin/env python3
"""publish_wechat.py — 将翻译好的文章推送到微信公众号草稿。

完整流程：
  1. 获取 access_token（2小时有效，同任务内复用）
  2. 下载文章中所有图片到本地临时目录
  3. 逐张上传正文图片到微信（uploadimg），替换 HTML 中的 src
  4. 上传封面图为永久素材（add_material），获取 thumb_media_id
  5. 创建草稿（draft/add）

用法:
    from scripts.publish_wechat import WeChatPublisher

    pub = WeChatPublisher()  # 自动读取 WECHAT_MP_APP_ID / WECHAT_MP_APP_SECRET
    result = pub.publish(
        title="文章标题",
        # author 默认为"蓝衣剑客"（发布者身份），通常不需要传
        body_html="<p>正文...</p><img src='https://...' />",
        cover_url="https://pbs.twimg.com/media/xxx.jpg",  # 封面图 URL，可选（默认取第一张图）
        source_url="https://x.com/user/status/123",       # 原文链接，可选
    )

依赖:
    Python 3.8+，无第三方依赖（只用 urllib + json）
"""

import json
import os
import re
import tempfile
import urllib.request
import urllib.parse
import urllib.error
import ssl

# ── 自动加载环境变量（如果未设置）──────────────────────────────────────
# execute_code 沙箱不继承主终端环境变量，从 ~/.hermes/wechat_env.sh 读取
if not os.environ.get('WECHAT_MP_APP_ID') or not os.environ.get('WECHAT_MP_APP_SECRET'):
    env_file = os.path.expanduser('~/.hermes/wechat_env.sh')
    if os.path.exists(env_file):
        with open(env_file, 'r') as f:
            for line in f:
                if line.startswith('WECHAT_MP_'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value

# SVG 转 PNG 支持
try:
    import cairosvg
    HAS_CAIROSVG = True
except ImportError:
    HAS_CAIROSVG = False


# ── 微信 API 常量 ──────────────────────────────────────────────
API_BASE = "https://api.weixin.qq.com"
TOKEN_URL = f"{API_BASE}/cgi-bin/token"
UPLOADIMG_URL = f"{API_BASE}/cgi-bin/media/uploadimg"
ADD_MATERIAL_URL = f"{API_BASE}/cgi-bin/material/add_material"
DRAFT_ADD_URL = f"{API_BASE}/cgi-bin/draft/add"

# 图片限制（来自微信官方文档）
MAX_IMAGE_SIZE = 1 * 1024 * 1024  # 1MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


class WeChatError(Exception):
    """微信 API 调用失败。"""

    def __init__(self, errcode: int, errmsg: str, api: str = ""):
        self.errcode = errcode
        self.errmsg = errmsg
        self.api = api
        super().__init__(f"WeChat API [{api}] error {errcode}: {errmsg}")


class WeChatPublisher:
    """微信公众号草稿发布器。"""

    def __init__(self, app_id: str = None, app_secret: str = None):
        self.app_id = app_id or os.environ.get("WECHAT_MP_APP_ID")
        self.app_secret = app_secret or os.environ.get("WECHAT_MP_APP_SECRET")
        if not self.app_id or not self.app_secret:
            raise ValueError(
                "需要微信 AppID 和 AppSecret。"
                "\n设置环境变量 WECHAT_MP_APP_ID / WECHAT_MP_APP_SECRET，"
                "\n或传入参数 WeChatPublisher(app_id='...', app_secret='...')"
            )
        self._access_token: str | None = None
        self._ssl_ctx = ssl.create_default_context()
        self._ssl_ctx.check_hostname = False
        self._ssl_ctx.verify_mode = ssl.CERT_NONE

    # ── 1. Access Token ──────────────────────────────────────────

    def _get_access_token(self) -> str:
        """获取 access_token，有缓存。"""
        if self._access_token:
            return self._access_token

        url = (
            f"{TOKEN_URL}?grant_type=client_credential"
            f"&appid={self.app_id}&secret={self.app_secret}"
        )
        data = self._api_get(url)
        if "access_token" not in data:
            raise WeChatError(
                data.get("errcode", -1),
                data.get("errmsg", "unknown"),
                "token",
            )
        self._access_token = data["access_token"]
        expires_in = data.get("expires_in", 7200)
        print(f"[wechat] access_token 获取成功，有效期 {expires_in}s")
        return self._access_token

    # ── 2. 下载图片 ──────────────────────────────────────────────

    @staticmethod
    def _convert_svg_to_png(svg_path: str, png_path: str, width: int = 400, height: int = 200) -> bool:
        """将 SVG 转换为 PNG。返回是否成功。"""
        if not HAS_CAIROSVG:
            return False
        try:
            cairosvg.svg2png(url=svg_path, write_to=png_path, output_width=width, output_height=height)
            return True
        except Exception as e:
            print(f"[wechat] SVG 转 PNG 失败: {e}")
            return False

    @staticmethod
    def _convert_to_png(src_path: str, png_path: str) -> bool:
        """将任意图片格式转换为 PNG（使用 PIL）。返回是否成功。"""
        try:
            from PIL import Image
            img = Image.open(src_path)
            if img.mode in ('RGBA', 'LA', 'P'):
                img = img.convert('RGBA')
            else:
                img = img.convert('RGB')
            img.save(png_path, 'PNG')
            return True
        except Exception as e:
            print(f"[wechat] 图片转 PNG 失败: {e}")
            return False

    @staticmethod
    def _convert_gif_to_jpg(gif_path: str, jpg_path: str) -> bool:
        """将 GIF（含 animated GIF）提取第一帧保存为 JPG。返回是否成功。

        优先使用 PIL（pillow），失败则退化为 ffmpeg。微信不支持 GIF 动图，
        只接受 JPG/PNG，所以必须转为静态图。
        """
        # 方法一：PIL
        try:
            from PIL import Image
            img = Image.open(gif_path)
            # 只取第一帧
            img.seek(0)
            if img.mode in ('RGBA', 'LA', 'P'):
                img = img.convert('RGB')
            img.save(jpg_path, 'JPEG', quality=85)
            print(f"[wechat] GIF → JPG (PIL): {gif_path} -> {jpg_path}")
            return True
        except Exception as e:
            print(f"[wechat] PIL 转 GIF 失败: {e}，尝试 ffmpeg")

        # 方法二：ffmpeg
        try:
            import subprocess
            ret = subprocess.run(
                ["ffmpeg", "-y", "-i", gif_path, "-frames:v", "1",
                 "-q:v", "2", jpg_path],
                capture_output=True, timeout=15
            )
            if ret.returncode == 0 and os.path.exists(jpg_path):
                print(f"[wechat] GIF → JPG (ffmpeg): {gif_path} -> {jpg_path}")
                return True
            else:
                print(f"[wechat] ffmpeg 失败: {ret.stderr.decode()[:200]}")
        except Exception as e:
            print(f"[wechat] ffmpeg 不可用: {e}")

        return False

    @staticmethod
    def _download_image(url: str, dest_path: str) -> str:
        """下载图片到本地。返回实际文件路径。如果是 SVG/WebP 会自动转为 PNG。"""
        # 处理 pbs.twimg.com 的高清参数
        url = re.sub(r"name=(?:small|medium|large)", "name=large", url)

        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            },
        )
        try:
            _ctx = ssl.create_default_context()
            _ctx.check_hostname = False
            _ctx.verify_mode = ssl.CERT_NONE
            with urllib.request.urlopen(req, context=_ctx, timeout=30) as resp:
                content_type = resp.headers.get("Content-Type", "")
                is_svg = "svg" in content_type or url.endswith(".svg")
                is_webp = "webp" in content_type
                is_gif = "gif" in content_type or url.endswith(".gif")
                # Twitter 的 tweet_video/ URL 是 MP4 视频（非 tweet_video_thumb）
                is_twitter_video = "tweet_video/" in url and "tweet_video_thumb/" not in url

                if content_type and content_type not in ALLOWED_IMAGE_TYPES and not any(
                    t in content_type for t in ["image/", "octet-stream", "svg", "webp"]
                ):
                    print(f"[wechat] 警告: {url} Content-Type={content_type}")

                data = resp.read()

                # 如果是 SVG，转换为 PNG
                if is_svg:
                    svg_path = dest_path.rsplit(".", 1)[0] + ".svg"
                    png_path = dest_path.rsplit(".", 1)[0] + ".png"
                    with open(svg_path, "wb") as f:
                        f.write(data)
                    if WeChatPublisher._convert_svg_to_png(svg_path, png_path):
                        print(f"[wechat] SVG 转 PNG: {url} -> {png_path}")
                        dest_path = png_path
                    else:
                        # 转换失败，保存为 PNG 尝试（可能失败）
                        with open(png_path, "wb") as f:
                            f.write(data)
                        dest_path = png_path
                elif is_webp:
                    # WebP 转 PNG
                    webp_path = dest_path.rsplit(".", 1)[0] + ".webp"
                    png_path = dest_path.rsplit(".", 1)[0] + ".png"
                    with open(webp_path, "wb") as f:
                        f.write(data)
                    if WeChatPublisher._convert_to_png(webp_path, png_path):
                        print(f"[wechat] WebP 转 PNG: {url} -> {png_path}")
                        dest_path = png_path
                    else:
                        # 转换失败，直接保存
                        with open(dest_path, "wb") as f:
                            f.write(data)
                elif is_gif or is_twitter_video:
                    # GIF 动图或 Twitter 视频 → 提取首帧为 JPG
                    raw_ext = ".gif" if is_gif else ".mp4"
                    raw_path = dest_path.rsplit(".", 1)[0] + raw_ext
                    jpg_path = dest_path.rsplit(".", 1)[0] + ".jpg"
                    with open(raw_path, "wb") as f:
                        f.write(data)
                    if WeChatPublisher._convert_gif_to_jpg(raw_path, jpg_path):
                        dest_path = jpg_path
                    else:
                        # 转换失败，删除原始文件，跳过此图片
                        print(f"[wechat] 警告: GIF/视频转 JPG 失败，跳过此图片: {url}")
                        try:
                            os.unlink(raw_path)
                        except OSError:
                            pass
                        raise RuntimeError(f"GIF/视频转 JPG 失败: {url}")
                else:
                    if len(data) > MAX_IMAGE_SIZE:
                        print(
                            f"[wechat] 警告: {url} 大小 {len(data)} bytes 超过 1MB，"
                            f"可能上传失败"
                        )

                    with open(dest_path, "wb") as f:
                        f.write(data)

                    ext = os.path.splitext(dest_path)[1].lower()
                    if ext not in IMAGE_EXTENSIONS:
                        # 根据 Content-Type 推断扩展名
                        if "png" in content_type:
                            new_path = dest_path.rsplit(".", 1)[0] + ".png"
                            os.rename(dest_path, new_path)
                            dest_path = new_path
                        else:
                            new_path = dest_path.rsplit(".", 1)[0] + ".jpg"
                            os.rename(dest_path, new_path)
                            dest_path = new_path

                print(f"[wechat] 下载图片: {url} -> {dest_path} ({len(data)} bytes)")
                return dest_path

        except urllib.error.HTTPError as e:
            raise RuntimeError(f"下载图片失败: {url} -> HTTP {e.code} {e.reason}")
        except Exception as e:
            raise RuntimeError(f"下载图片失败: {url} -> {e}")

    # ── 3. 上传正文图片 ──────────────────────────────────────────

    def _upload_image(self, file_path: str) -> str:
        """上传图片到微信（uploadimg），返回微信 URL。"""
        token = self._get_access_token()
        url = f"{UPLOADIMG_URL}?access_token={token}"

        with open(file_path, "rb") as f:
            filename = os.path.basename(file_path)
            mime_type = "image/png" if filename.endswith(".png") else "image/jpeg"
            body, boundary = _build_multipart(
                {"media": (filename, f.read(), mime_type)}
            )

        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        data = self._api_request(req, "uploadimg")
        if "url" not in data:
            raise WeChatError(data.get("errcode", -1), data.get("errmsg", "unknown"), "uploadimg")
        print(f"[wechat] 上传正文图片: {filename} -> {data['url']}")
        return data["url"]

    # ── 4. 上传永久素材（封面）───────────────────────────────────

    def _upload_permanent_image(self, file_path: str) -> str:
        """上传永久图片素材（add_material），返回 media_id。"""
        token = self._get_access_token()
        url = f"{ADD_MATERIAL_URL}?access_token={token}&type=image"

        with open(file_path, "rb") as f:
            filename = os.path.basename(file_path)
            mime_type = "image/png" if filename.endswith(".png") else "image/jpeg"
            body, boundary = _build_multipart(
                {"media": (filename, f.read(), mime_type)}
            )

        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        data = self._api_request(req, "add_material")
        if "media_id" not in data:
            raise WeChatError(data.get("errcode", -1), data.get("errmsg", "unknown"), "add_material")
        print(f"[wechat] 上传封面素材: {filename} -> media_id={data['media_id']}")
        return data["media_id"]

    # ── 4.1 上传永久视频素材（公开方法）───────────────────────────────

    def upload_videos(self, video_paths: list, video_titles: list = None) -> list:
        """批量上传视频到微信素材库，返回上传结果列表。

        与 publish() 完全独立，可单独调用。视频上传后需微信审核，
        审核通过后在素材库中可见，编辑草稿时手动插入。

        Args:
            video_paths: 本地视频文件路径列表（MP4 格式，≤20MB）。
            video_titles: 视频标题列表（与 video_paths 一一对应）。
                          为空时取文件名。

        Returns:
            [{"path": "...", "title": "...", "media_id": "...", "success": True}, ...]

        视频限制：MP4 格式，≤20MB，建议时长 ≤10 分钟。
        """
        video_titles = video_titles or []
        results = []

        for i, video_path in enumerate(video_paths):
            if not os.path.exists(video_path):
                results.append({"path": video_path, "title": "", "media_id": "", "success": False, "error": "文件不存在"})
                print(f"[wechat] 警告: 视频文件不存在: {video_path}")
                continue

            title = video_titles[i] if i < len(video_titles) else os.path.splitext(os.path.basename(video_path))[0]

            # 检查文件大小
            size = os.path.getsize(video_path)
            if size > 20 * 1024 * 1024:
                results.append({"path": video_path, "title": title, "media_id": "", "success": False, "error": f"文件过大 ({size // 1048576}MB > 20MB)"})
                print(f"[wechat] 警告: {video_path} 大小 {size // 1048576}MB 超过 20MB 限制")
                continue

            try:
                media_id = self._upload_single_video(video_path, title)
                results.append({"path": video_path, "title": title, "media_id": media_id, "success": True})
            except WeChatError as e:
                results.append({"path": video_path, "title": title, "media_id": "", "success": False, "error": str(e)})
                print(f"[wechat] 警告: 视频上传失败: {e}")

        success_count = sum(1 for r in results if r["success"])
        print(f"[wechat] 视频上传: {success_count}/{len(video_paths)} 个成功")
        return results

    def _upload_single_video(self, file_path: str, title: str, introduction: str = "") -> str:
        """上传单个视频到微信素材库，返回 media_id。内部方法。"""
        token = self._get_access_token()
        url = f"{ADD_MATERIAL_URL}?access_token={token}&type=video"

        if not title:
            title = os.path.splitext(os.path.basename(file_path))[0]

        description = json.dumps({
            "title": title[:30],
            "introduction": introduction[:300] if introduction else title[:100]
        }, ensure_ascii=False)

        with open(file_path, "rb") as f:
            filename = os.path.basename(file_path)
            body, boundary = _build_multipart_video(
                {"media": (filename, f.read(), "video/mp4")},
                description
            )

        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        data = self._api_request(req, "add_material_video")
        if "media_id" not in data:
            raise WeChatError(data.get("errcode", -1), data.get("errmsg", "unknown"), "add_material_video")
        print(f"[wechat] 上传视频素材: {filename} -> media_id={data['media_id']}")
        return data["media_id"]

    # ── 5. 创建草稿 ──────────────────────────────────────────────

    def _create_draft(
        self,
        title: str,
        author: str,
        content: str,
        thumb_media_id: str,
        content_source_url: str = "",
        digest: str = "",
    ) -> str:
        """创建草稿，返回 media_id。"""
        token = self._get_access_token()
        url = f"{DRAFT_ADD_URL}?access_token={token}"

        payload = {
            "articles": [
                {
                    "title": title[:32],
                    "author": author[:16] if author else "",
                    "content": content,
                    "content_source_url": content_source_url,
                    "thumb_media_id": thumb_media_id,
                    "digest": digest[:128] if digest else "",
                    "need_open_comment": 0,
                    "only_fans_can_comment": 0,
                }
            ]
        }

        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json; charset=utf-8",
            },
        )
        data = self._api_request(req, "draft/add")
        if "media_id" not in data:
            raise WeChatError(data.get("errcode", -1), data.get("errmsg", "unknown"), "draft/add")
        print(f"[wechat] 草稿创建成功: media_id={data['media_id']}")
        return data["media_id"]

    # ── 主流程 ──────────────────────────────────────────────────

    def publish(
        self,
        title: str,
        body_html: str,
        author: str = "蓝衣剑客",
        cover_url: str = "",
        source_url: str = "",
        digest: str = "",
    ) -> dict:
        """完整发布流程：下载图片 → 上传 → 替换 → 创建草稿。

        注意：视频上传与 publish() 完全独立，请使用 upload_videos() 方法单独上传。

        Args:
            title: 文章标题（最多 32 字符）。
            author: 发布者名（最多 16 字符），默认固定为"蓝衣剑客"。
            body_html: 正文 HTML（内联样式，外链图片会被替换）。
            cover_url: 封面图 URL。为空则取正文第一张图。
            source_url: 原文链接（放在 content_source_url）。
            digest: 摘要（最多 128 字符，为空取正文前 54 字符）。

        Returns:
            {
                "media_id": "草稿 media_id",
                "draft_url": "https://mp.weixin.qq.com/",
                "images_uploaded": 3,
                "cover_uploaded": true,
            }
        """
        with tempfile.TemporaryDirectory(prefix="wechat_publish_") as tmpdir:
            # ── 提取所有图片 URL ──
            img_pattern = re.compile(r'<img\s+[^>]*src=["\']([^"\']+)["\']', re.IGNORECASE)
            img_urls = list(dict.fromkeys(img_pattern.findall(body_html)))  # 去重保序
            print(f"[wechat] 正文中共 {len(img_urls)} 张图片")

            if not img_urls and not cover_url:
                raise ValueError("正文中没有图片且未提供封面图，无法创建草稿（微信要求至少有封面图）")

            # ── 下载所有图片 ──
            url_to_local = {}
            for i, img_url in enumerate(img_urls):
                ext = ".jpg"
                if "format=png" in img_url or img_url.endswith(".png"):
                    ext = ".png"
                local_path = os.path.join(tmpdir, f"img_{i:03d}{ext}")
                try:
                    url_to_local[img_url] = self._download_image(img_url, local_path)
                except Exception as e:
                    print(f"[wechat] 警告: 下载失败，跳过: {e}")

            # ── 上传正文图片并替换 URL ──
            # 先过滤空列表项（避免微信显示空圆点）
            body_html = re.sub(r'<li>\s*</li>', '', body_html)
            body_html = re.sub(r'<li></li>', '', body_html)
            print("[wechat] 过滤空列表项完成")

            updated_html = body_html
            uploaded_count = 0
            for orig_url, local_path in url_to_local.items():
                try:
                    wx_url = self._upload_image(local_path)
                    updated_html = updated_html.replace(orig_url, wx_url)
                    uploaded_count += 1
                except WeChatError as e:
                    print(f"[wechat] 警告: 上传失败，跳过: {e}")

            print(f"[wechat] 正文图片: {uploaded_count}/{len(url_to_local)} 张上传成功")

            # ── 上传封面图 ──
            cover_local = None
            # 确定封面：优先用指定 cover_url，否则用正文第一张图
            if cover_url and cover_url in url_to_local:
                cover_local = url_to_local[cover_url]
            elif cover_url:
                # cover_url 不在正文图片中，单独下载
                cover_ext = ".jpg"
                if "format=png" in cover_url or cover_url.endswith(".png"):
                    cover_ext = ".png"
                cover_local_path = os.path.join(tmpdir, f"cover{cover_ext}")
                try:
                    cover_local = self._download_image(cover_url, cover_local_path)
                    print(f"[wechat] 封面图下载成功: {cover_url}")
                except Exception as e:
                    print(f"[wechat] 警告: 封面图下载失败: {e}")
            elif url_to_local:
                # 取第一张成功下载的
                cover_local = next(iter(url_to_local.values()))

            if not cover_local:
                raise ValueError("没有可用的封面图")

            thumb_media_id = self._upload_permanent_image(cover_local)
            print(f"[wechat] 封面图上传成功: {thumb_media_id}")

            # ── 创建草稿 ──
            draft_media_id = self._create_draft(
                title=title,
                author=author,
                content=updated_html,
                thumb_media_id=thumb_media_id,
                content_source_url=source_url,
                digest=digest,
            )

            return {
                "media_id": draft_media_id,
                "draft_url": "https://mp.weixin.qq.com/",
                "images_uploaded": uploaded_count,
                "cover_uploaded": True,
                "title": title,
            }

    # ── 底层 API 请求 ──────────────────────────────────────────

    def _api_get(self, url: str) -> dict:
        """GET 请求并解析 JSON。"""
        req = urllib.request.Request(url)
        return self._api_request(req, url)

    def _api_request(self, req: urllib.request.Request, api_name: str = "") -> dict:
        """发送请求并解析 JSON 响应。"""
        try:
            with urllib.request.urlopen(req, context=self._ssl_ctx, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                raise WeChatError(e.code, body, api_name)
            raise WeChatError(data.get("errcode", e.code), data.get("errmsg", body), api_name)
        except Exception as e:
            raise WeChatError(-1, str(e), api_name)

        # 微信 API 错误
        if "errcode" in data and data["errcode"] != 0:
            raise WeChatError(data["errcode"], data["errmsg"], api_name)

        return data


# ── multipart 工具函数 ──────────────────────────────────────────

def _build_multipart(fields: dict) -> tuple[bytes, str]:
    """构建 multipart/form-data 请求体。

    Args:
        fields: {field_name: (filename, file_bytes, mime_type)}

    Returns:
        (body_bytes, boundary_string)
    """
    boundary = f"----WeChatBoundary{os.urandom(8).hex()}"
    lines = []

    for field_name, (filename, file_data, mime_type) in fields.items():
        lines.append(f"--{boundary}".encode("utf-8"))
        lines.append(
            f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"'.encode("utf-8")
        )
        lines.append(f"Content-Type: {mime_type}".encode("utf-8"))
        lines.append(b"")
        lines.append(file_data)

    lines.append(f"--{boundary}--".encode("utf-8"))
    lines.append(b"")

    return b"\r\n".join(lines), boundary


def _build_multipart_video(fields: dict, description: str) -> tuple[bytes, str]:
    """构建上传视频的 multipart/form-data 请求体（包含 description 字段）。

    Args:
        fields: {field_name: (filename, file_bytes, mime_type)}
        description: 视频描述 JSON（包含 title 和 introduction）

    Returns:
        (body_bytes, boundary_string)
    """
    boundary = f"----WeChatBoundary{os.urandom(8).hex()}"
    lines = []

    # 添加 media 字段
    for field_name, (filename, file_data, mime_type) in fields.items():
        lines.append(f"--{boundary}".encode("utf-8"))
        lines.append(
            f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"'.encode("utf-8")
        )
        lines.append(f"Content-Type: {mime_type}".encode("utf-8"))
        lines.append(b"")
        lines.append(file_data)

    # 添加 description 字段
    lines.append(f"--{boundary}".encode("utf-8"))
    lines.append(b'Content-Disposition: form-data; name="description"')
    lines.append(b"")
    lines.append(description.encode("utf-8"))

    lines.append(f"--{boundary}--".encode("utf-8"))
    lines.append(b"")

    return b"\r\n".join(lines), boundary


# ── CLI 入口 ──────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    print("=" * 50)
    print("WeChat Publisher — 微信公众号草稿发布")
    print("=" * 50)

    # 检查环境变量
    app_id = os.environ.get("WECHAT_MP_APP_ID", "")
    app_secret = os.environ.get("WECHAT_MP_APP_SECRET", "")
    if not app_id or not app_secret:
        print("错误: 请设置环境变量")
        print("  export WECHAT_MP_APP_ID='你的AppID'")
        print("  export WECHAT_MP_APP_SECRET='你的AppSecret'")
        sys.exit(1)

    print(f"AppID: {app_id[:6]}...{app_id[-4:]}")

    # 测试 token
    try:
        pub = WeChatPublisher()
        token = pub._get_access_token()
        print(f"Token 测试成功: {token[:10]}...")
    except WeChatError as e:
        print(f"Token 获取失败: {e}")
        print("请检查 AppID 和 AppSecret 是否正确")
        sys.exit(1)

    print("\n环境配置正确，可以发布草稿。")
    print("使用方法: from scripts.publish_wechat import WeChatPublisher")
