---
description: 使用 code-simplifier 优化代码
model: claude-opus-4-6
---

# Code Simplifier - 代码优化工具

使用 code-simplifier agent 来简化和优化代码，提升代码质量和可维护性。

## 你的任务

1. **理解优化范围**
   - 如果用户指定了文件或目录，使用该范围
   - 如果用户没有指定，优化最近修改的代码
   - 询问用户确认优化范围

2. **调用 code-simplifier agent**
   使用 Task tool，参数如下：
   - `subagent_type`: "code-simplifier:code-simplifier"
   - `description`: "优化代码"（3-5个字的简短描述）
   - `prompt`: 详细的优化需求，包括：
     - 目标文件或目录
     - 优化要求（简化逻辑、去重、提高可读性等）
     - 遵循项目规范（如 CLAUDE.md）
     - 保持功能不变

3. **展示优化结果**
   - 总结 code-simplifier 的分析和修改
   - 列出主要优化点
   - 如果需要用户确认，等待批准

## 优化重点

- ✅ 简化复杂逻辑，提高可读性
- ✅ 去除重复代码
- ✅ 保持所有功能不变
- ✅ 遵循项目代码规范
- ✅ 确保类型安全

## 示例用法

```bash
# 优化特定文件
/simplify src/views/project-info/index.vue

# 优化整个模块
/simplify src/views/project-info/

# 优化最近修改的代码
/simplify
```

## 注意事项

- 超过 3 个文件的优化会自动分批处理
- 优化前会先展示分析结果供用户确认
- 保证不改变业务逻辑，只优化代码结构
