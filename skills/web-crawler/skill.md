---
name: web-crawler
description: 递归爬取指定 URL 及其关联页面（同域名/子域名），智能分析整理成结构化知识库。使用方式：/web-crawler <URL> [--depth N] [--output path]
---

# 网站爬取与内容整理助手

## 概览

从指定 URL 开始，递归爬取同域名或子域名下的所有可访问页面，提取关键内容并按主题分类整理成结构化的 Markdown 知识库。

## 触发条件

- 用户使用 `/web-crawler` 命令
- 必须提供起始 URL
- 可选参数：
  - `--depth N`：最大爬取深度（默认 10）
  - `--output path`：输出目录（默认 `./crawled-content`）
  - `--exclude pattern`：排除 URL 模式（如 `/admin/*`）

## 使用示例

```bash
/web-crawler https://example.com
/web-crawler https://docs.example.com --depth 5
/web-crawler https://blog.example.com --depth 3 --output ./blog-archive
/web-crawler https://example.com --exclude "/login,/admin"
```

---

## 工作流

### 阶段 1：参数解析与验证

1. 解析命令行参数
2. 验证 URL 格式（必须是完整的 http/https URL）
3. 提取域名信息，确定爬取范围
4. 设置默认参数

**输出格式：**

```
📋 爬取配置
- 起始 URL: https://example.com
- 域名范围: example.com (含子域名)
- 最大深度: 10
- 输出目录: ./crawled-content
- 排除模式: /login, /admin

确认开始爬取？
```

等待用户确认后进入阶段 2。

### 阶段 2：环境检查与连通性测试

1. **测试目标网站可达性**
   ```bash
   # 使用 WebFetch 测试连通性
   WebFetch(起始URL, "提取页面标题")
   ```
   - 如果失败，提示用户检查网络或企业安全策略
   - 成功则继续

2. **检查 robots.txt**
   ```bash
   curl -s "https://${domain}/robots.txt" | grep -E "Disallow.*/"
   ```
   - 如果检测到全站禁止（`Disallow: /`），警告用户并询问是否继续
   - 如果无 robots.txt 或允许爬取，继续

3. **创建输出目录**
   ```bash
   mkdir -p "$output_dir"
   ```

4. **初始化爬取状态文件**（用于断点续传）
   ```json
   {
     "config": {
       "start_url": "https://example.com",
       "max_depth": 10,
       "exclude_patterns": ["/login", "/admin"]
     },
     "visited": [],
     "queue": [{"url": "https://example.com", "depth": 0}],
     "failed": []
   }
   ```
   保存为 `${output_dir}/.crawl-state.json`

### 阶段 3：递归爬取

使用广度优先搜索（BFS）策略爬取页面：

**爬取逻辑：**

1. 从状态文件读取队列和已访问集合
2. 循环处理队列：
   - 取出 URL 和当前深度
   - 如果已访问或超过最大深度，跳过
   - 使用 **WebFetch** 一次性获取页面内容和链接
   - 过滤同域名/子域名链接
   - 将新链接加入队列（深度+1）
   - 标记当前 URL 为已访问
   - 每爬取 10 个页面保存一次状态文件

**爬取方法（单次请求）：**

```bash
# 使用 WebFetch 一次性提取内容和所有链接
WebFetch(url, "提取以下信息：
1. 页面标题
2. 页面主要内容（Markdown 格式）
3. 页面中所有超链接的完整 URL 列表（包括相对路径转绝对路径）
4. meta description（如果有）")
```

**进度显示：**

```
🕷️ 爬取进度
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
深度 1: ████████████████████ 15/15 页面
深度 2: ████████░░░░░░░░░░░░ 42/68 页面
深度 3: ░░░░░░░░░░░░░░░░░░░░ 0/120 页面

已爬取: 57 页面 | 队列中: 120 | 失败: 3
预计剩余时间: 约 2 分钟（每页 1 秒间隔）
```

**速率限制：**
- 每个请求间隔至少 1 秒
- 避免对目标网站造成压力

### 阶段 4：内容提取与存储

对每个爬取的页面提取关键信息并保存：

**提取字段：**
- `url`: 页面 URL
- `title`: 页面标题
- `description`: meta description
- `content`: 正文内容（Markdown 格式，由 WebFetch 提供）
- `links`: 出站链接列表
- `depth`: 爬取深度
- `timestamp`: 爬取时间

**存储格式：**
每个页面保存为独立的 Markdown 文件，文件名根据 URL 生成（去除特殊字符）。

### 阶段 5：智能分类与整理

根据 URL 路径自动分类：

**分类策略（基于 URL 路径）：**

```bash
# 根据 URL 路径判断分类
case "$url" in
  */docs/*|*/documentation/*)  category="docs" ;;
  */blog/*|*/posts/*)          category="blog" ;;
  */api/*|*/reference/*)       category="api" ;;
  */tutorial/*|*/guide/*)      category="tutorial" ;;
  *)                           category="misc" ;;
esac
```

**生成目录结构：**
```
crawled-content/
├── index.md              # 总览索引
├── docs/                 # 文档类
│   ├── getting-started.md
│   └── advanced.md
├── blog/                 # 博客类
│   ├── 2024-01-15-post1.md
│   └── 2024-02-20-post2.md
├── api/                  # API 类
│   ├── authentication.md
│   └── endpoints.md
├── tutorial/             # 教程类
│   └── quickstart.md
└── misc/                 # 其他
    └── about.md
```

### 阶段 6：生成结构化输出

**生成索引文件 `index.md`：**

```markdown
# 网站内容索引

> 爬取自: https://example.com
> 爬取时间: 2026-03-06 15:30:00
> 总页面数: 127
> 最大深度: 10

## 📚 内容分类

### 文档 (45 页面)
- [快速开始](docs/getting-started.md)
- [进阶指南](docs/advanced.md)
- ...

### 博客 (32 页面)
- [2024-01-15: 标题](blog/2024-01-15-post1.md)
- ...

### API 参考 (28 页面)
- [认证](api/authentication.md)
- ...

### 其他 (22 页面)
- ...

## 🔗 站点地图

```
example.com/
├── docs/
│   ├── getting-started
│   └── advanced
├── blog/
│   └── 2024/
└── api/
    └── v1/
```

## 📊 统计信息

- 总字数: 125,430
- 代码块数: 342
- 图片数: 89
- 外部链接: 156
```

**生成单个页面文件：**

```markdown
---
url: https://example.com/docs/getting-started
title: 快速开始
category: docs
depth: 2
crawled_at: 2026-03-06T15:30:00Z
---

# 快速开始

[页面正文内容...]

---

## 元信息

- 原始 URL: https://example.com/docs/getting-started
- 爬取深度: 2
- 出站链接: 12
- 相关页面:
  - [进阶指南](advanced.md)
  - [API 参考](../api/overview.md)
```

### 阶段 7：输出摘要

```
✅ 爬取完成

📊 统计信息
- 成功爬取: 127 页面
- 失败: 3 页面
- 总耗时: 2 分 34 秒
- 输出目录: ./crawled-content

📁 生成文件
- 索引文件: index.md
- 文档类: 45 个文件
- 博客类: 32 个文件
- API 类: 28 个文件
- 其他: 22 个文件

🔍 失败页面（可选重试）
- https://example.com/broken-link (404)
- https://example.com/timeout (超时)
- https://example.com/forbidden (403)

是否需要重试失败的页面？
```

---

## 核心原则

- **尊重 robots.txt**：在阶段 2 检查并遵守网站的爬虫规则
- **速率限制**：每个请求间隔至少 1 秒，避免对目标网站造成压力
- **域名限制**：严格限制在同域名或子域名范围内
- **深度控制**：严格遵守最大深度限制，避免无限爬取
- **错误处理**：优雅处理 404、超时等错误，不中断整体流程
- **增量更新**：如果输出目录已存在，询问是否覆盖或增量更新
- **用户确认**：开始爬取前必须获得用户确认
- **网络检查**：爬取前测试目标网站可达性，避免企业安全策略阻止

## 安全与限制

### 自动拒绝的场景

- 爬取需要登录的页面（除非用户提供认证信息）
- 爬取明确禁止爬虫的网站（robots.txt disallow）
- 爬取政府、金融等敏感网站
- 深度超过 20（即使用户指定）

### 警告场景

- 目标网站页面数超过 1000（询问是否继续）
- 预估爬取时间超过 10 分钟（询问是否继续）
- 检测到大量重复内容（建议调整参数）

---

## 高级功能（可选扩展）

### 内容去重

- 使用内容哈希检测重复页面
- 自动合并相似内容

### 智能摘要

- 使用 AI 为每个页面生成摘要
- 提取关键词和标签

### 全文搜索

- 生成搜索索引文件
- 支持关键词快速查找

### 导出格式

- Markdown（默认）
- JSON（结构化数据）
- HTML（静态网站）
- PDF（打印版本）

---

## 实现细节

### 依赖工具

- **WebFetch**：获取页面内容和链接（单次请求，自动转 Markdown）
- **Bash + curl**：检查 robots.txt
- **Read/Write/Edit**：文件操作
- **Grep**：URL 过滤和内容搜索

### 核心算法

**域名检查：**

```bash
# 检查 URL 是否属于同域名或子域名
is_same_domain() {
  local url="$1"
  local base_domain="$2"
  echo "$url" | grep -qE "https?://([^/]*\.)?${base_domain}"
}
```

**链接过滤：**

```bash
# 从 WebFetch 返回的链接列表中过滤同域名链接
filter_links() {
  local base_domain="$1"
  while read -r link; do
    if is_same_domain "$link" "$base_domain"; then
      echo "$link"
    fi
  done
}
```

### 数据结构

**爬取状态文件（.crawl-state.json）：**

```json
{
  "config": {
    "start_url": "https://example.com",
    "max_depth": 10,
    "output_dir": "./crawled-content",
    "exclude_patterns": ["/login", "/admin"]
  },
  "visited": [
    "https://example.com",
    "https://example.com/docs"
  ],
  "queue": [
    {"url": "https://example.com/blog", "depth": 1},
    {"url": "https://example.com/api", "depth": 2}
  ],
  "failed": [
    {"url": "https://example.com/broken", "error": "404", "timestamp": "2026-03-06T08:00:00Z"}
  ],
  "stats": {
    "total_crawled": 57,
    "total_failed": 3,
    "start_time": "2026-03-06T08:00:00Z"
  }
}
```

**页面数据结构：**

```typescript
interface PageData {
  url: string
  title: string
  content: string        // Markdown 格式
  description?: string   // meta description
  links: string[]        // 出站链接
  depth: number
  category: string       // docs/blog/api/tutorial/misc
  timestamp: string
}
```

### 性能优化

- **状态持久化**：每爬取 10 个页面保存一次状态文件
- **断点续传**：支持中断后从状态文件恢复
- **缓存已访问页面**：避免重复爬取
- **速率控制**：严格遵守 1 秒间隔

**注意**：不支持并发爬取，所有请求按顺序执行以确保稳定性和遵守速率限制。

---

## 故障排查

### 常见问题

1. **爬取速度慢**
   - 检查网络连接
   - 每个页面至少需要 1 秒（速率限制）
   - 深度 10 可能需要数分钟

2. **大量 403/429 错误**
   - 网站可能有反爬虫机制
   - 检查 robots.txt 是否允许
   - 考虑减少爬取深度

3. **WebFetch 连接失败**
   - 检查企业安全策略是否阻止
   - 尝试使用 VPN 或代理
   - 确认目标网站可访问

4. **内容提取不完整**
   - 目标网站可能使用 JavaScript 渲染
   - 考虑使用 browser-use skill 代替

5. **分类不准确**
   - 当前仅基于 URL 路径分类
   - 可手动调整分类规则（修改 case 语句）

---

## 使用建议

- **小规模测试**：先用 `--depth 2` 测试，确认效果后再增加深度
- **排除无关页面**：使用 `--exclude` 排除登录、搜索等页面
- **定期更新**：对于经常更新的网站，定期重新爬取
- **备份原始数据**：保留状态文件，便于断点续传

---

## 测试案例

### 案例 1：文档站点
```bash
/web-crawler https://docs.python.org/3/ --depth 3 --output ./python-docs
```
- 预期页面数：约 50-100 页
- 预计耗时：2-3 分钟
- 主要分类：docs

### 案例 2：个人博客
```bash
/web-crawler https://example-blog.com --depth 2 --exclude "/tag,/category"
```
- 预期页面数：约 20-30 页
- 预计耗时：1-2 分钟
- 主要分类：blog

### 案例 3：API 文档
```bash
/web-crawler https://api.example.com/docs --depth 4
```
- 预期页面数：约 30-50 页
- 预计耗时：1-2 分钟
- 主要分类：api
