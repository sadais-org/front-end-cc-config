---
name: curl
description: 通用网页爬取工具。自动检测目标页面是否为 SPA（React/Vue/Angular 等动态渲染），普通页面走 curl 流程，SPA 页面走 puppeteer 无头浏览器流程（自动使用系统中已安装的 Edge/Chrome）。支持 API 拦截、关联页面爬取和结构化 JSON 输出。当用户需要爬取、抓取、采集网页内容，或将网页数据整理成文档时，应使用此 skill。
---

# Web Scraper — 通用网页爬取

## 核心脚本

`scripts/scrape.mjs` 是本 skill 的主脚本，Node.js 运行，无需提前安装依赖（puppeteer-core 按需自动安装到 `/tmp/web-scraper-deps`）。

```bash
node <skill_dir>/scripts/scrape.mjs <url> [选项]
```

## 工作流程

### 第一步：自动检测页面类型

脚本默认先用 curl 拉取 HTML，通过以下规则判断是否为 SPA：

| 判断依据 | 说明 |
|---------|------|
| body 纯文字 < 300 字符 | 内容极少，典型 SPA 空壳 |
| 存在空 `<div id="root/app">` | React/Vue 挂载点 |
| script 标签 > 10 个且文字 < 1000 字符 | 重度 JS 渲染页面 |

- **非 SPA** → 直接从 curl 结果提取文字（快速）
- **SPA** → 启动 puppeteer 无头浏览器渲染后提取

### 第二步：执行爬取

**curl 流程**（普通页面）：
- 清理 `<script>` / `<style>` / HTML 标签
- 提取纯文本、页面标题、链接列表

**puppeteer 流程**（SPA 页面）：
1. 查找系统浏览器（顺序：Edge → Chrome → Chromium）
2. headless 模式加载页面，等待 `networkidle2`
3. 可选：等待指定 CSS 选择器出现（`--selector`）
4. 等待额外渲染时间（默认 8s，可用 `--wait` 调整）
5. 提取 `document.body.innerText`、链接列表
6. 可选：拦截并输出所有 JSON API 响应（`--intercept`）

### 第三步：处理输出结果

脚本输出 JSON 到 stdout 或文件（`--output`），结构如下：

```json
{
  "mode": "curl | puppeteer",
  "url": "实际访问的 URL",
  "title": "页面标题",
  "text": "页面纯文本内容",
  "links": [{ "href": "...", "text": "链接文字" }],
  "intercepted": [{ "url": "API地址", "data": { } }]
}
```

## 命令参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--wait <ms>` | SPA 模式额外等待时间 | 8000 |
| `--intercept` | 拦截并记录 JSON API 请求 | false |
| `--output <file>` | 保存结果到文件 | stdout |
| `--force-spa` | 强制走 puppeteer 流程 | false |
| `--force-curl` | 强制走 curl 流程 | false |
| `--selector <css>` | 等待该 CSS 选择器出现后提取 | — |
| `--user-agent <ua>` | 自定义 User-Agent | Chrome UA |

## 常用命令示例

```bash
SKILL=<skill_dir>/scripts/scrape.mjs

# 自动检测（最常用）
node $SKILL https://example.com

# 保存到文件
node $SKILL https://example.com --output /tmp/result.json

# SPA 页面 + 拦截 API（发现真实数据端点）
node $SKILL https://app.example.com --intercept --output /tmp/result.json

# 强制 SPA 模式 + 延长等待
node $SKILL https://app.example.com --force-spa --wait 12000

# 等待内容加载完毕再提取
node $SKILL https://app.example.com --selector ".main-content"

# 强制 curl（快速静态页）
node $SKILL https://blog.example.com --force-curl
```

## 关联页面爬取策略

关联页面爬取分三步决策，**不要默认爬取所有链接**，应根据用户问题按需爬取。

### 第一步：判断是否需要关联页面

先分析用户的问题意图，再决定是否需要爬取额外页面：

**不需要关联页面（只爬主页即可）：**
- 问题只涉及当前页面本身（"这个页面说了什么"、"页面标题是什么"）
- 问题是关于某个具体内容块，主页已包含完整信息
- 用户明确说"只看这个页面"

**需要爬取关联页面：**
- 问题涉及多个子页面的汇总（"所有文档"、"全部产品列表"、"每个章节的内容"）
- 主页内容明显是导航/目录页，真实内容在子页面中
- 用户问题中包含"所有"、"全部"、"每个"、"列出所有"等汇总性词语
- 主页 `text` 字段信息不足以回答问题，但 `links` 中有明显相关链接

### 第二步：过滤相关链接

不要盲目爬取 `links` 中的所有链接，按以下规则筛选：

**保留的链接（同时满足）：**
- 链接文字或 URL 路径与用户问题**关键词语义相关**
- 与主页同域（避免跳出到外部站点）
- 排除锚点链接、登录/注销、隐私政策、社交媒体等无关链接

**过滤示例：**
```
用户问题："查看所有 API 接口文档"
主页 links：
  ✅ /docs/api/users     链接文字："用户接口"
  ✅ /docs/api/orders    链接文字："订单接口"
  ❌ /about              链接文字："关于我们"
  ❌ https://twitter.com 链接文字："Twitter"
  ❌ /login              链接文字："登录"
```

**过滤代码（直接在 bash 中处理）：**
```bash
# 从主页结果中提取与关键词相关的链接
python3 -c "
import json, sys
keyword = '关键词'   # 替换为从用户问题提取的关键词
base_domain = 'example.com'  # 替换为主页域名
d = json.load(open('/tmp/main.json'))
filtered = [
    l for l in d['links']
    if keyword in l['text'].lower() or keyword in l['href'].lower()
    if base_domain in l['href']
]
for l in filtered[:10]:  # 最多取 10 个
    print(l['href'])
"
```

### 第三步：控制爬取上限

爬取子页面时必须设置上限，防止失控：

| 场景 | 建议上限 |
|------|---------|
| 文档/教程类 | 最多 20 页 |
| 产品/列表类 | 最多 10 页 |
| 新闻/博客类 | 最多 5 页 |
| 不确定时 | 默认 5 页，不足再追加 |

完整示例流程：

```bash
SKILL=<skill_dir>/scripts/scrape.mjs

# 1. 爬取主页
node $SKILL https://example.com --output /tmp/main.json

# 2. 根据用户问题过滤链接（此处以"api"为关键词为例）
python3 -c "
import json
d = json.load(open('/tmp/main.json'))
filtered = [l for l in d['links'] if 'api' in l['text'].lower() or 'api' in l['href'].lower()]
for l in filtered[:10]:
    print(l['href'])
" > /tmp/links.txt

# 3. 逐个爬取（最多 5 个）
head -5 /tmp/links.txt | while read url; do
  slug=$(echo "$url" | sed 's|[^a-zA-Z0-9]|_|g')
  node $SKILL "$url" --output "/tmp/page_${slug}.json"
done
```

**SPA 内部路由**（无传统 `<a>` 链接）：优先使用 `--intercept` 发现 API 端点，再直接用 curl 调用 API 获取结构化数据，效率远高于逐页渲染。

## 依赖说明

| 依赖 | 安装方式 | 说明 |
|------|---------|------|
| Node.js | 通常已安装 | 必需 |
| puppeteer-core | 自动安装到 `/tmp/web-scraper-deps` | SPA 模式需要 |
| 浏览器（Edge/Chrome） | 系统已安装即可 | SPA 模式需要 |
| curl | 系统自带 | 必需 |

## 故障排查

| 问题 | 解决方案 |
|------|---------|
| `puppeteer-core 未安装` | 脚本会自动安装，或手动：`cd /tmp && npm install puppeteer-core` |
| `未找到可用浏览器` | 安装 Edge 或 Chrome，或在脚本 `findBrowser()` 添加路径 |
| SPA 内容仍为空 | 增加等待时间 `--wait 15000`，或指定 `--selector` |
| 需要登录才能访问 | 先用 `browser-use` skill 登录后导出 cookies |
| 被限速/封禁 | 增加 `--wait` 延时，或更换 User-Agent |
