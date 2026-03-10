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

爬取主页后，从 `links` 字段获取关联链接，循环爬取子页面：

```bash
SKILL=<skill_dir>/scripts/scrape.mjs

# 1. 爬取主页
node $SKILL https://example.com --output /tmp/main.json

# 2. 提取链接列表
python3 -c "
import json
d = json.load(open('/tmp/main.json'))
for l in d['links'][:10]:
    print(l['href'])
"

# 3. 逐个爬取子页面
# （根据输出的链接列表，循环调用上述命令）
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
