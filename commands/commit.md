---
allowed-tools: Bash(git *), Bash(cd *)
description: 创建 git 提交（含代码质量检查，支持嵌套子模块）
model: claude-haiku-4-5-20251001
---

# Git Commit 命令（智能提交）

## 命令说明

这是一个增强版的 git commit 命令，在提交前可以：
1. ❓ **可选的代码质量检查**（code-simplifier，询问用户是否需要）
2. 🔄 **支持循环优化**（直到用户满意）
3. 📝 **生成规范的提交消息**（约定式提交 + emoji）
4. 🚀 **自动推送到远程**
5. 🔗 **完整的子模块支持**（递归检测、嵌套处理、独立推送）

---

## 工作流程总览

```
/commit
  ↓
【准备阶段】
  ├─ 1. 递归收集所有变更（主项目 + 所有子模块）
  ├─ 2. 构建提交依赖树（子模块 → 父模块）
  └─ 3. 询问：是否需要代码质量检查？
        ├─ 是 → 进入第一阶段
        └─ 否 → 直接跳到第二阶段
  ↓
【第一阶段：代码质量检查】（可选，可循环）
  ├─ 4. code-simplifier 分析代码
  ├─ 5. 有优化建议？
  │     ├─ 是 → 询问用户 → 处理 → 回到步骤 4
  │     └─ 否 → 进入第二阶段
  ↓
【第二阶段：Git 提交流程】
  ├─ 6. 按依赖顺序处理（从最深层子模块开始）
  ├─ 7. 每个模块：分析 → 拆分 → 生成消息 → 提交 → 推送
  └─ 8. 最后处理主项目
```

---

## 准备阶段

### 步骤 1：递归收集所有变更

#### 1.1 检测子模块结构

```bash
# 同步主项目远程更新
git fetch origin
local=$(git rev-parse @)
remote=$(git rev-parse @{u} 2>/dev/null)

if [ -n "$remote" ] && [ "$local" != "$remote" ]; then
  echo "⚠️ 主项目远程有新提交，正在同步..."
  git pull --rebase || {
    echo "❌ 自动同步失败，请手动处理冲突后重试"
    exit 1
  }
fi

# 获取所有子模块路径（包括嵌套）
git submodule status --recursive

# 检查主项目状态
git status

# 获取当前分支
git branch --show-current

# 查看提交历史（参考提交风格）
git log --oneline -10
```

#### 1.2 递归检查每个模块的状态

对每个检测到的子模块执行：

```bash
cd <submodule_path>

# 检查并同步远程更新
git fetch origin
local=$(git rev-parse @)
remote=$(git rev-parse @{u} 2>/dev/null)

if [ -n "$remote" ] && [ "$local" != "$remote" ]; then
  echo "⚠️ 检测到远程有新提交，正在同步..."
  git pull --rebase || {
    echo "❌ 自动同步失败，请手动处理冲突后重试"
    exit 1
  }
fi

# 检查状态
git status --porcelain
git diff HEAD --name-status
git branch --show-current
cd -
```

#### 1.3 构建变更摘要

输出格式：

```
📦 主项目 (/)
  - 修改: 3 个文件
  - 分支: main

📦 子模块 (path/to/submodule1)
  - 修改: 2 个文件
  - 分支: develop

📦 嵌套子模块 (path/to/submodule1/nested)
  - 修改: 1 个文件
  - 分支: feature/xxx
```

**特殊情况处理：**
- 如果所有模块都没有变更，提示用户并结束
- 如果只有主项目有变更，按单项目流程处理
- 如果只有子模块有变更，只处理子模块

---

### 步骤 2：构建提交依赖树

根据子模块嵌套关系，构建提交顺序：

```
提交顺序（从深到浅）：
1. path/to/submodule1/nested  (最深层)
2. path/to/submodule1         (中间层)
3. path/to/submodule2         (同级)
4. /                          (主项目，最后)
```

**规则：**
- 子模块必须在父模块之前提交
- 同级子模块可以并行处理（但实际按顺序执行）
- 主项目永远最后提交

---

### 步骤 3：询问是否需要代码质量检查

使用 AskUserQuestion 工具询问：

```
问题：是否需要在提交前进行代码质量检查？

选项：
1. 是，使用 code-simplifier 检查代码质量
2. 否，直接进入提交流程
```

**根据用户选择：**
- 选择 1 → 进入第一阶段（代码质量检查）
- 选择 2 → 跳过第一阶段，直接进入第二阶段

---

## 第一阶段：代码质量检查（可选）

### 步骤 4：执行 code-simplifier 分析

**重要：** 此阶段必须保护用户的修改内容，不能重置工作区。

使用 Bash tool 调用 code-simplifier：

```bash
# 分析所有修改的文件
code-simplifier analyze <file1> <file2> ...
```

**输出：**
- 代码质量问题列表
- 优化建议
- 潜在的 bug

---

### 步骤 5：处理优化建议

如果 code-simplifier 有优化建议：

#### 5.1 询问用户

使用 AskUserQuestion 工具：

```
问题：code-simplifier 发现了以下优化建议：

[列出所有建议]

你希望如何处理？

选项：
1. 应用所有优化建议
2. 选择性应用（逐个确认）
3. 跳过优化，直接提交
4. 查看详细分析报告
```

#### 5.2 根据用户选择执行

**选项 1：应用所有优化**
```bash
code-simplifier apply --all
```
然后回到步骤 4（重新分析）

**选项 2：选择性应用**
逐个询问用户是否应用每个建议，然后回到步骤 4

**选项 3：跳过优化**
直接进入第二阶段

**选项 4：查看详细报告**
```bash
code-simplifier report --detailed
```
然后重新询问（回到 5.1）

---

### 步骤 6：循环优化

重复步骤 4-5，直到：
- code-simplifier 没有更多建议
- 用户选择"跳过优化"

然后进入第二阶段。

---

## 第二阶段：Git 提交流程

### 步骤 7：按依赖顺序处理每个模块

对于依赖树中的每个模块（从深到浅）：

#### 7.1 切换到模块目录并同步远程

```bash
cd <module_path>

# 同步远程更新
git fetch origin
local=$(git rev-parse @)
remote=$(git rev-parse @{u} 2>/dev/null)

if [ -n "$remote" ] && [ "$local" != "$remote" ]; then
  echo "⚠️ 检测到远程有新提交，正在同步..."
  git pull --rebase || {
    echo "❌ 同步失败，请手动处理冲突后重试"
    cd -
    exit 1
  }
fi
```

#### 7.2 分析变更内容

```bash
# 查看详细变更
git diff HEAD

# 获取文件列表
git status --porcelain
```

#### 7.3 拆分提交（按类型）

根据约定式提交规范，将变更分类：

**提交类型优先级：**
1. `fix` - 修复 bug
2. `feat` - 新功能
3. `perf` - 性能优化
4. `refactor` - 重构
5. `style` - 代码格式
6. `docs` - 文档
7. `test` - 测试
8. `chore` - 构建/工具

**拆分规则：**
- 每个类型单独提交
- 同类型的多个文件可以合并提交
- 不同类型必须分开提交

**示例：**
```
变更文件：
- src/utils.js (重构)
- src/api.js (新功能)
- README.md (文档)

拆分为 3 个提交：
1. refactor: 重构 utils 模块
2. feat: 添加新的 API 接口
3. docs: 更新 README 文档
```

#### 7.4 生成提交消息

对每个提交，生成符合约定式提交的消息：

**格式：**
```
<emoji> <type>(<scope>): <subject>

<body>

<footer>
```

**Emoji 映射：**
- ✨ feat
- 🐛 fix
- ⚡️ perf
- ♻️ refactor
- 💄 style
- 📝 docs
- ✅ test
- 🔧 chore
- 🚀 deploy
- 🔒 security

**示例：**
```
✨ feat(api): 添加用户认证接口

- 实现 JWT token 生成
- 添加登录/登出端点
- 集成 bcrypt 密码加密

Closes #123
```

**生成规则：**
1. 分析代码变更，理解意图
2. 参考 git log 中的历史提交风格
3. 使用中文描述
4. 包含必要的上下文信息
5. 如果有关联的 issue，添加 footer

#### 7.5 执行提交

```bash
# 添加文件
git add <files_for_this_commit>

# 提交
git commit -m "<generated_message>"
```

**验证：**
- 确认提交成功
- 检查提交历史

#### 7.6 推送到远程

```bash
# 获取远程分支
remote_branch=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null)

if [ -n "$remote_branch" ]; then
  # 推送到跟踪的远程分支
  git push
else
  # 首次推送，设置上游分支
  current_branch=$(git branch --show-current)
  git push -u origin "$current_branch"
fi
```

**错误处理：**
- 如果推送失败（如需要 pull），询问用户如何处理
- 如果没有远程仓库，跳过推送步骤

#### 7.7 返回上级目录

```bash
cd -
```

---

### 步骤 8：处理主项目

在所有子模块处理完成后，处理主项目：

#### 8.0 同步主项目远程更新

```bash
# 同步远程更新
git fetch origin
local=$(git rev-parse @)
remote=$(git rev-parse @{u} 2>/dev/null)

if [ -n "$remote" ] && [ "$local" != "$remote" ]; then
  echo "⚠️ 主项目远程有新提交，正在同步..."
  git pull --rebase || {
    echo "❌ 同步失败，请手动处理冲突后重试"
    exit 1
  }
fi
```

#### 8.1 更新子模块引用

如果子模块有新提交，主项目会检测到子模块指针变更：

```bash
git status
# 输出示例：
# modified:   path/to/submodule (new commits)
```

#### 8.2 分析主项目变更

```bash
git diff HEAD
```

**变更类型：**
1. 仅子模块指针更新
2. 主项目代码变更
3. 两者都有

#### 8.3 拆分提交

**情况 1：仅子模块指针更新**
```bash
git add path/to/submodule1 path/to/submodule2
git commit -m "🔗 chore: 更新子模块引用"
```

**情况 2：主项目代码变更**
按照步骤 7.3-7.5 处理

**情况 3：两者都有**
先提交代码变更，再提交子模块更新

#### 8.4 推送主项目

```bash
git push
```

---

## 完成阶段

### 步骤 9：输出提交摘要

生成完整的提交报告：

```
✅ 提交完成！

📦 子模块 path/to/submodule1/nested
  ✨ feat: 添加新功能 (abc1234)
  🐛 fix: 修复 bug (def5678)

📦 子模块 path/to/submodule1
  ♻️ refactor: 重构代码 (ghi9012)

📦 主项目
  🔗 chore: 更新子模块引用 (jkl3456)
  📝 docs: 更新文档 (mno7890)

🚀 所有变更已推送到远程仓库
```

---

## 错误处理

### 1. 合并冲突

如果在推送时遇到冲突：

```bash
if git push 2>&1 | grep -q 'rejected'; then
  echo "⚠️ 推送被拒绝，远程分支有新提交"
  echo "建议操作："
  echo "1. git pull --rebase"
  echo "2. 解决冲突"
  echo "3. 重新运行 /commit"
  exit 1
fi
```

### 2. 未跟踪的文件

如果有未跟踪的文件：

```bash
untracked=$(git ls-files --others --exclude-standard)
if [ -n "$untracked" ]; then
  echo "⚠️ 检测到未跟踪的文件："
  echo "$untracked"
  ask_user_add_or_ignore
fi
```

### 3. 子模块状态异常

**未初始化的子模块：**
```bash
if git submodule status | grep -q '^-'; then
  echo "⚠️ 检测到未初始化的子模块"
  ask_user_init_submodules
fi
```

**子模块 detached HEAD：**
```bash
cd "$submodule"
if ! git symbolic-ref -q HEAD; then
  echo "⚠️ 子模块 $submodule 处于 detached HEAD 状态"
  echo "建议先切换到分支再提交"
  ask_user_continue_or_abort
fi
cd -
```

**推送冲突：**
```bash
if git push 2>&1 | grep -q 'rejected'; then
  echo "⚠️ 推送被拒绝，需要先 pull"
  ask_user_pull_and_retry
fi
```

### 4. 其他约束
- 不添加共同作者页脚
- 提交消息必须是中文
- 遵循约定式提交格式
- 保护用户修改内容（代码质量检查时不能重置用户的修改）

---

**命令结束**
