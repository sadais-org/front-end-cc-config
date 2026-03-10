---
name: update-config
description: 更新 Sadais 团队 Claude Code 配置。当用户想要更新、同步、拉取最新团队配置时触发。重新运行安装脚本，自动备份旧文件并覆盖安装最新的 CLAUDE.md、settings.json、skills、commands 等内容。使用方式：/update-config
---

# Update Config — 更新团队配置

## 触发条件

- 用户使用 `/update-config` 命令
- 用户说"更新配置"、"同步配置"、"拉取最新配置"、"更新 Claude Code 配置"等

## 说明

本 skill 通过重新运行安装脚本，从 GitHub 拉取最新的团队配置并安装到本机。

**安装内容：**

| 文件 | 目标位置 | 处理方式 |
|------|---------|---------|
| `CLAUDE.md` | `~/.claude/CLAUDE.md` | 备份旧文件后替换 |
| `settings.json` | `~/.claude/settings.json` | 深度合并，团队配置优先 |
| `ccline/` | `~/.claude/ccline/` | 复制配置文件 |
| `skills/` | `~/.claude/skills/` | 覆盖同名技能 |
| `output-styles/` | `~/.claude/output-styles/` | 覆盖同名输出样式 |
| `commands/` | `~/.claude/commands/` | 覆盖同名自定义命令 |

**备份机制**：已有文件自动备份为 `*.bak.{YYYYMMDD_HHMMSS}`，不会丢失本地数据。

## 工作流

### 第一步：检测操作系统

通过 Bash 工具检测当前系统：

```bash
uname -s
```

- `Darwin` → macOS
- `Linux` → Linux
- `MSYS*` / `MINGW*` / `CYGWIN*` → Windows Git Bash

### 第二步：执行安装命令

根据检测结果选择对应命令：

**macOS / Linux / Windows Git Bash：**

```bash
curl -fsSL https://raw.githubusercontent.com/sadais-org/front-end-cc-config/main/install.sh | bash
```

**Windows PowerShell（仅当用户明确指出在 PowerShell 环境中时使用）：**

```powershell
irm https://raw.githubusercontent.com/sadais-org/front-end-cc-config/main/install.ps1 | iex
```

### 第三步：输出更新摘要

安装完成后，展示结果摘要：

```
## 配置更新完成 ✓

- CLAUDE.md：已更新（旧文件备份为 CLAUDE.md.bak.YYYYMMDD_HHMMSS）
- settings.json：已合并（团队配置优先）
- skills：已安装 N 个技能
- commands：已安装 N 个命令
- output-styles：已安装 N 个样式

重启 Claude Code 以应用最新配置。
```

## 核心原则

- **执行前无需确认**：update-config 是幂等操作，旧文件会自动备份，可以安全重复执行
- **网络异常处理**：若 clone 失败，提示用户检查网络连接并再次尝试
- **不修改本地开发代码**：本 skill 仅操作 `~/.claude/` 目录下的配置文件，不影响项目代码
