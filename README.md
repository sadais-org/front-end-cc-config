# front-end-cc-config

Sadais 前端团队 [Claude Code](https://claude.ai/claude-code) 统一配置，一条命令完成初始化。

## 快速安装

**macOS / Linux / Windows Git Bash**

```bash
curl -fsSL https://raw.githubusercontent.com/sadais-org/front-end-cc-config/main/install.sh | bash
```

**Windows PowerShell**

```powershell
irm https://raw.githubusercontent.com/sadais-org/front-end-cc-config/main/install.ps1 | iex
```

> 需要提前安装 [Git](https://git-scm.com)

---

## 安装内容

| 文件 | 目标位置 | 处理方式 |
|------|---------|---------|
| `CLAUDE.md` | `~/.claude/CLAUDE.md` | 备份旧文件后替换 |
| `settings.json` | `~/.claude/settings.json` | 深度合并，团队配置优先 |
| `ccline/` | `~/.claude/ccline/` | 复制二进制 + 配置文件 |
| `skills/` | `~/.claude/skills/` | 覆盖同名技能 |

**备份机制**：已有文件自动备份为 `*.bak.{YYYYMMDD_HHMMSS}`，不会丢失本地数据。

**settings.json 合并规则**：以用户现有配置为基础，团队 key 在冲突时覆盖，其余 key 保留。合并工具优先级：`python3` → `python` → `node` → 直接覆盖（兜底）。

---

## 目录结构

```
front-end-cc-config/
├── CLAUDE.md              # 团队 AI 指令规范
├── settings.json          # Claude Code 全局配置（API、权限、插件等）
├── install.sh             # 安装脚本（Mac / Linux / Git Bash）
├── install.ps1            # 安装脚本（Windows PowerShell）
├── ccline/                # 状态栏工具
│   ├── ccline             # 可执行文件（macOS / Linux）
│   ├── config.toml        # ccline 主配置
│   ├── models.toml        # 模型定义
│   └── themes/            # 状态栏主题
├── skills/                # 团队自定义技能包
│   ├── brainstorming/
│   ├── browser-use/
│   ├── code-review-excellence/
│   ├── context7/
│   ├── executing-plans/
│   ├── find-skills/
│   ├── theme-factory/
│   ├── using-git-worktrees/
│   └── writing-plans/
└── plugins/               # 插件清单（cache 已 gitignore）
    ├── blocklist.json
    └── installed_plugins.json
```

---

## 更新配置

重新运行安装命令即可拉取最新配置，旧文件会自动备份。

## Windows 说明

- **ccline**：当前仅提供 macOS/Linux 二进制。Windows 用户若需状态栏，请在 Git Bash / WSL 下运行，或联系管理员提供 `ccline.exe`。
- **路径**：`settings.json` 中的 `~` 在 Claude Code Windows 版下会自动解析为 `%USERPROFILE%`。

---

## 维护

配置变更后，直接 push 到 `main` 分支，团队成员重新执行安装命令即可同步。

```bash
# 更新后通知团队执行
curl -fsSL https://raw.githubusercontent.com/sadais-org/front-end-cc-config/main/install.sh | bash
```
