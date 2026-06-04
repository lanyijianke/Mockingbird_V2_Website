# 微信公众号 API 参考

推送草稿到微信公众号所需的所有 API 调用。环境变量从 `~/.hermes/.env` 读取。

## 环境变量

| 变量 | 用途 |
|------|------|
| `WECHAT_MP_APP_ID` | 公众号 AppID |
| `WECHAT_MP_APP_SECRET` | 公众号 AppSecret |

检查变量是否存在，不存在则提示用户配置，并跳过第八步。

## 1. 获取 access_token

```bash
curl -s "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WECHAT_MP_APP_ID}&secret=${WECHAT_MP_APP_SECRET}"
```

返回 `{"access_token": "...", "expires_in": 7200}`。有效期 2 小时，同一次任务内复用，不要重复请求。

## 2. 上传正文图片（临时素材）

将文章中引用的图片逐张上传，替换 HTML 中的 `src` 路径：

```bash
curl -F media=@"image.jpg" "https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${ACCESS_TOKEN}"
```

返回 `{"url": "https://mmbiz.qpic.cn/..."}`。将 HTML 中对应的 `<img src="...">` 替换为这个 URL。

## 3. 上传封面图（永久素材）

取文章第一张图作为封面，上传为永久素材获取 `media_id`：

```bash
curl -F media=@"cover.jpg" "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${ACCESS_TOKEN}&type=image"
```

返回 `{"media_id": "...", "url": "..."}`。`media_id` 用于草稿的 `thumb_media_id` 字段。

注意：临时素材不能用于草稿封面，必须是永久素材。

## 4. 创建草稿

```bash
curl -X POST "https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "articles": [{
      "title": "文章标题",
      "author": "@author",
      "digest": "文章摘要（120字以内）",
      "content": "<p>HTML 正文...</p>",
      "content_source_url": "原文链接",
      "thumb_media_id": "封面图 media_id",
      "need_open_comment": 1,
      "only_fans_can_comment": 0
    }]
  }'
```

返回 `{"media_id": "..."}` 表示成功。

## 注意事项

- 所有样式必须内联，公众号不支持外链 CSS
- `content` 中的 HTML 图片必须使用微信 CDN 域名（通过第 2 步上传获取），外链图片不会显示
- `digest` 不填则自动截取正文前 54 字
- `content_source_url` 填原文 X 链接，公众号文末会显示"阅读原文"

## 双渲染模式与推荐语

`render_wxhtml.py` 支持两种渲染模式：

| 模式 | body_only 参数 | 用途 | CSS |
|------|--------------|------|-----|
| 模板模式 | False | 本地预览 | 外链 CSS（default.html） |
| API 模式 | True | 发布到公众号 | 内联样式 |

**推荐语（编者按）渲染**：
- v0.9.2+：`intro` 参数在两种模式下都会渲染到正文开头
- v0.9.2 之前：`intro` 只在模板模式下显示，API 模式下丢失

发布到公众号时必须使用 `body_only=True` 并传入 `intro` 参数，以确保推荐语正常显示。

## 常见问题

### 错误码 40164：IP 不在白名单

微信公众号 API 要求调用方 IP 在白名单中。解决方法：
1. 登录 mp.weixin.qq.com
2. 进入「开发 → 基本配置 → IP 白名单」
3. 添加当前机器的公网 IP

### 草稿中图片不显示

检查：
1. 图片是否通过 `uploadimg` 上传（第 2 步）
2. HTML 中的 `src` 是否是微信 CDN 域名（`mmbiz.qpic.cn`）
3. 图片大小是否超过 1MB
4. 图片格式是否为 JPG/PNG
