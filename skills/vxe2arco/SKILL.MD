---
name: vxe2arco
description: 将 Vue 单文件组件中的 vxe-table 迁移为 Arco Design 的 a-table。引导用户指定目标文件，输出分析报告，确认后自动完成迁移并验证。使用方式：/vxe2arco <文件路径>
---

# vxe-table → a-table 迁移助手

## 概览

按照严格的五阶段流程将 vxe-table 迁移为 Arco Design 的 a-table，每个关键阶段均需用户确认，确保迁移准确、不遗漏。

## 触发条件

- 用户使用 `/vxe2arco` 命令，后接目标文件路径
- 用户描述需要迁移 vxe-table 的文件

---

## 工作流

### 阶段 1：获取目标文件

如果用户在命令后附带了文件路径，直接进入阶段 2。
否则，询问用户："请提供需要迁移的 Vue 文件路径。"

---

### 阶段 2：分析文件，输出迁移清单

使用 Read 工具通读目标文件，**禁止猜测**，基于实际代码分析以下内容：

**Template 层扫描：**
- `<vxe-toolbar>` 及其 `#buttons` 插槽内容（按钮、导入导出等）
- `<vxe-table>` 所有 Props 和指令
- `<vxe-column>` 列表（checkbox 列、普通列、固定列、`#header` 自定义表头）
- `<batch-data-type>` 组件位置（在 checkbox 列的 `#header` 插槽内？）
- 各列插槽：`#default="{ row }"`

**Script 层扫描：**
- `ref` 中的 vxe 类型（`xTable`、`xToolbar`、`VxeTableInstance` 等）
- `useBatchOperation` 的传参，及其解构内容（是否包含 `xTable`、`batchType`、`handleToggleAllCheckbox`、`handleConnectTableAndToolbar`、`handleClearAll` 等）
- `checkboxConfig` computed 及其 `checkMethod`/`visibleMethod` 逻辑
- 手写的 `selectedRecords` computed（通过 `xTable.value.getCheckboxRecords()` 获取）
- `checkboxVisible` 函数逻辑（后续迁移为 `disabled` 字段）

**输出格式：**

```
## 迁移分析报告

### Template 层改动（共 N 处）

| # | 位置 | 原写法 | 改动说明 |
|---|------|--------|----------|
| 1 | 第 61 行 | `<vxe-toolbar>` 及 `#buttons` 内容 | 删除 toolbar，按钮整体移入 query-condition 的 #btns slot |
| 2 | 第 115 行 | `<vxe-table :checkbox-config="..." :row-config="...">` | 替换为 a-table，调整 Props |
| 3 | 第 124 行 | `<vxe-column type="checkbox">` 含 batch-data-type | 删除该列，batch-data-type 改用 teleport 方案 |
| 4 | 第 141 行 | `<vxe-column field="X" title="Y">` | 替换为 a-table-column，field → data-index，所有列放入 #columns |
| 5 | 第 xxx 行 | `#default="{ row }"` | 改为 `#cell="{ record }"` 或 `#cell="{ record: row }"` |
| 6 | 第 xxx 行 | `#header`（自定义表头） | 改为 `#title` |

### Script 层改动（共 M 处）

| # | 原写法 | 改动说明 |
|---|--------|----------|
| 1 | `xTable` / `xToolbar` ref 及其类型 | 删除 |
| 2 | `useBatchOperation({ businessType })` | 增加 `isArcoTable: true`，新增解构 `selectedRowKeys / selectedRecords / rowSelection / teleportTarget / handleUpdateSelectedRows` |
| 3 | `checkboxConfig` computed | 删除 |
| 4 | 手写 `selectedRecords` computed（通过 xTable API） | 删除，使用 hook 导出的 `selectedRecords` |
| 5 | `handleToggleAllCheckbox` | 删除（hook 内部处理） |
| 6 | `checkboxVisible(row)` 返回结果 | 在 handleQuery 数据赋值的 map 中写入 `disabled: !checkboxVisible(item)`，不新增额外变量 |
| 7 | `handleConnectTableAndToolbar` | 保留，onMounted 中继续调用 |
| 8 | `handleSelectionChange` | 新增，调用 `handleUpdateSelectedRows(rowKeys, searchResult.result)` |

### 需人工确认事项

- [ ] `vxe-toolbar` 中的按钮是否全部移入 `query-condition #btns`？（是否已有 #btns slot）

以上分析是否正确？确认后将执行迁移。
```

等待用户明确确认后，进入阶段 3。

---

### 阶段 3：执行迁移

> 修改超过 3 个文件时，停下来拆分任务，逐文件推进。
> 修改任何文件前，必须先 Read 通读该文件。

#### 3.1 Template 迁移

**① 删除 vxe-toolbar，按钮移入 query-condition #btns**

原 `<vxe-toolbar>` 的 `#buttons` 内容（查询/重置/批量按钮等）移到 `query-condition` 的 `#btns` slot：

```html
<!-- Before：table-body 的 #header slot 内有 vxe-toolbar -->
<table-body>
  <template #header>
    <vxe-toolbar ref="xToolbar" custom>
      <template #buttons>
        <a-space>
          <a-button @click="handleToQuery">查询</a-button>
          ...
        </a-space>
        <file-import-export ... />
      </template>
    </vxe-toolbar>
  </template>
  ...
</table-body>

<!-- After：按钮放入 query-condition 的 #btns slot，table-body 的 #header slot 整体删除 -->
<query-condition ...>
  ...
  <template #btns>
    <div class="w-full flex justify-between">
      <div>
        <a-space>
          <a-button @click="handleToQuery">查询</a-button>
          ...
        </a-space>
        <file-import-export ... />
      </div>
    </div>
  </template>
</query-condition>
```

**② 替换 vxe-table**

```html
<!-- Before -->
<vxe-table
  ref="xTable"
  v-horizontal-scroll
  id="xxxTable"
  :loading="loading"
  :data="searchResult.result"
  :row-config="{ keyField: 'id' }"
  :checkbox-config="checkboxConfig"
>

<!-- After -->
<a-table
  ref="arcoTableRef"
  row-key="id"
  v-horizontal-scroll
  :loading="loading"
  :bordered="{ headerCell: true, wrapper: false, bodyCell: false, cell: false }"
  :pagination="false"
  :data="searchResult.result"
  column-resizable
  :scroll="{ x: '100%' }"
  :sticky-header="60"
  :row-selection="rowSelection"
  v-model:selectedKeys="selectedRowKeys"
  @selection-change="handleSelectionChange"
>
```

> **注意**：`v-horizontal-scroll` 指令**保留**，不要删除。

**③ 删除 vxe-column type="checkbox"**

将整个 `<vxe-column type="checkbox">` 及其 `#header` 插槽（含 `<batch-data-type>`）全部删除。
`<batch-data-type>` 改用 `<teleport>` 方案（见下方 ⑥）。

**④ 替换普通列，包裹在 `<template #columns>` 内**

所有列必须放在 `<template #columns>` 内：

```html
<!-- Before（直接放在 vxe-table 内） -->
<vxe-column title="合同名称" field="name" min-width="150" fixed="left">
  <template #default="{ row }">
    {{ row.name }}
  </template>
</vxe-column>
<vxe-column title="备注" field="remark" min-width="180" />

<!-- After（放在 a-table 的 #columns 内） -->
<template #columns>
  <a-table-column title="合同名称" data-index="name" :width="150" :min-width="150" fixed="left">
    <template #cell="{ record }">
      {{ record.name }}
    </template>
  </a-table-column>
  <a-table-column title="备注" data-index="remark" :width="180" :min-width="180" />
</template>
```

Props 转换规则：
- `field="x"` → `data-index="x"`
- `min-width="150"` / `width="150"` → `:width="150" :min-width="150"`（两者同时写，值相同）
- `:show-overflow="false"` → 删除
- `:visible="false"` → 删除该 prop，迁移后默认显示（a-table 无此控制，列始终渲染）
- `fixed="left"` / `fixed="right"` → 保持不变

**⑤ 更新插槽名**

```html
<!-- Before -->
<template #default="{ row }">...</template>
<template #header>...</template>

<!-- After -->
<template #cell="{ record }">...</template>      <!-- 或 #cell="{ record: row }" 保持内部变量名不变 -->
<template #title>...</template>
```

**⑥ batch-data-type 改用 teleport 方案**

```html
<!-- After：在页面底部（template 末尾，关闭 main-container 前）添加 -->
<teleport v-if="teleportTarget" :to="teleportTarget">
  <div class="arco-table-checkbox-filter">
    <batch-data-type
      ref="batchDataTypeRef"
      v-model:batch-type="batchType"
      :options="batchTypeOptions"
      :checkbox-config="{
        hide: true,
      }"
      :disabled="!searchResult.result?.length"
      @type-change="handleToQuery"
    />
  </div>
</teleport>
```

> 注意：原来在 `<vxe-column type="checkbox">` 的 `#header` 内，`batch-data-type` 可能有 `:checkbox-config="{ checked, indeterminate }"` 和 `@change="handleToggleAllCheckbox"`，迁移后这两个 prop/event 都需删除，改为 `:checkbox-config="{ hide: true }"` 且不绑定 `@change`。

---

#### 3.2 Script 迁移

**① 更新 useBatchOperation**

```ts
// Before
const {
  xTable,
  batchType,
  batchTypeOptions,
  BATCH_OPERATION_TYPE_ENUM,
  showBatchGuide,
  handleClearAll,
  handleToggleAllCheckbox,
  handleConnectTableAndToolbar,
} = useBatchOperation({
  businessType: consts.BATCH_OPERATION_TYPE.XXX,
  refName: 'batchDataTypeXxxRef',
})

// After（增加 isArcoTable: true，新增解构项，删除 xTable / handleToggleAllCheckbox / refName）
const {
  selectedRowKeys,
  selectedRecords,
  rowSelection,
  teleportTarget,
  batchType,
  batchTypeOptions,
  BATCH_OPERATION_TYPE_ENUM,
  showBatchGuide,
  showClearAllButton,
  handleClearAll,
  handleConnectTableAndToolbar,
  handleUpdateSelectedRows,
} = useBatchOperation({
  businessType: consts.BATCH_OPERATION_TYPE.XXX,
  isArcoTable: true,
})
```

**② 删除以下内容**

- `xTable` / `xToolbar` 的 `ref` 声明及类型导入（`VxeTableInstance`、`VxeToolbarInstance`）
- `checkboxConfig` computed（整个删除）
- 手写的 `selectedRecords` computed（通过 `xTable.value.getCheckboxRecords()` 等实现的那个）
- `showClearAllButton` computed（如果原来是手写的，现在直接从 hook 解构）
- `handleToggleAllCheckbox` 函数（如果原来是手写的）

**③ 在 handleQuery 数据返回结构中添加 disabled 字段**

不需要额外新增 tableData 变量，直接在原有的 handleQuery（或 handleSearch）函数内，找到给 `searchResult.result` 赋值的 map 处理处，补写 `disabled` 字段：

```ts
// Before：checkboxConfig 通过 checkMethod/visibleMethod 控制行的可选状态
const checkboxConfig = computed(() => ({
  checkMethod: ({ row }) => checkboxVisible(row),
  visibleMethod: ({ row }) => checkboxVisible(row),
}))

async function handleQuery(resetCondition = false, resetPagination = false) {
  wrapHandleQuery(resetCondition, resetPagination, async () => {
    const { data, head: { ret = consts.RET_CODE.FAIL, msg = '获取列表失败' } = {} } = await apiQueryList(
      apiCondition.value
    )
    if (ret !== consts.RET_CODE.SUCCESS) {
      notify.error(msg)
      return
    }
    return data
  })
}

// After：删除 checkboxConfig，在 handleQuery 的数据赋值处直接 map 写入 disabled
// 无论原来是否有 map，统一改为：
async function handleQuery(resetCondition = false, resetPagination = false) {
    wrapHandleQuery(resetCondition, resetPagination, async () => {
      const { data, head: { ret = consts.RET_CODE.FAIL, msg = '获取列表失败' } = {} } = await apiQueryList(
        apiCondition.value
      )
      if (ret !== consts.RET_CODE.SUCCESS) {
        notify.error(msg)
        return
      }
      return {
        ...data,
        result: data.result.map(task => {
          return {
            ...task,
            disabled: !checkboxVisible(task),
          }
        }),
      }
    })
  }
```

> 注意：若原代码已有 `.map()` 处理（例如格式化字段），直接在其中追加 `disabled: !checkboxVisible(item)` 即可，不要嵌套两层 map。

**④ 新增 handleSelectionChange 函数**

```ts
/**
 * 行选择回调（支持跨页选择）
 */
function handleSelectionChange(rowKeys: string[]) {
  handleUpdateSelectedRows(rowKeys, searchResult.result)
}
```

**⑤ handleConnectTableAndToolbar 保留**

```ts
// 保持不变
onMounted(() => {
  handleConnectTableAndToolbar()
})
```

**⑥ 更新引用 selectedRecords 的地方**

原先调用 `selectedRecords.value.map(item => item.id)` 等，继续使用即可，hook 导出的 `selectedRecords` 接口相同。

---

### 阶段 4：Lint 验证与收尾

1. 运行 `pnpm lint:eslint` 进行代码检查
2. 若 lint 报错，自动修复后再次运行直至通过
3. 若涉及核心模块（store / router / api），额外运行 `pnpm build` 验证构建

**输出迁移摘要：**

```
## 迁移完成

- 改动文件：`src/views/xxx/index.vue`
- Template 改动：N 处（vxe-toolbar 删除/按钮移位、a-table 替换、列迁移、插槽更名、teleport 方案）
- Script 改动：M 处（isArcoTable: true、disabled 字段、handleSelectionChange、删除 vxe API）
- 验证：lint ✅ | 构建 ✅（如有）
```

---

## 核心原则

- **每阶段必须用户确认**：分析报告需用户明确确认后方可执行，不跳过
- **先读后写**：修改任何文件前，必须先用 Read 工具通读全文
- **超 3 文件则拆分**：若需同时改动超过 3 个文件，停下来拆分成子任务逐一推进
- **基于事实，禁止猜测**：所有映射必须来自工具读取的实际代码
- **保持业务逻辑不变**：迁移目标仅替换 UI 组件层，不改变业务逻辑

---

## 速查：关键 API 对照

### 组件对照

| vxe | a-table（Arco） |
|-----|-----------------|
| `<vxe-table>` | `<a-table>` |
| `<vxe-column>` | `<a-table-column>`（放在 `<template #columns>` 内） |
| `<vxe-toolbar>` | 删除，按钮移入 `query-condition #btns` |
| `<vxe-column type="checkbox">` | 删除，由 `row-selection` + `teleport` 方案替代 |

### a-table 标准 Props

```html
<a-table
  ref="arcoTableRef"
  row-key="id"
  v-horizontal-scroll
  :loading="loading"
  :bordered="{ headerCell: true, wrapper: false, bodyCell: false, cell: false }"
  :pagination="false"
  :data="searchResult.result"
  column-resizable
  :scroll="{ x: '100%' }"
  :sticky-header="60"
  :row-selection="rowSelection"
  v-model:selectedKeys="selectedRowKeys"
  @selection-change="handleSelectionChange"
>
```

### Column Props 对照

| vxe-column Props | a-table-column Props |
|------------------|----------------------|
| `field="xxx"` | `data-index="xxx"` |
| `title="xxx"` | `title="xxx"` |
| `min-width="150"` / `width="150"` | `:width="150" :min-width="150"`（两者同时写，值相同） |
| `fixed="left/right"` | `fixed="left/right"` |
| `:show-overflow="false"` | 删除 |
| `:visible="false"` | 删除（迁移后默认显示） |
| `type="checkbox"` | 删除（整列删除） |

### 插槽对照

| vxe 插槽 | a-table 插槽 |
|----------|--------------|
| `#default="{ row }"` | `#cell="{ record }"` 或 `#cell="{ record: row }"` |
| `#header` | `#title` |

### useBatchOperation 变化

| 项目 | vxe 写法 | arco 写法 |
|------|----------|-----------|
| 配置项 | `{ businessType, refName }` | `{ businessType, isArcoTable: true }` |
| 选中 keys | 手写 computed（通过 xTable API） | hook 导出 `selectedRowKeys` |
| 选中 rows | 手写 computed（通过 xTable API） | hook 导出 `selectedRecords` |
| 选择配置 | `checkboxConfig` computed | hook 导出 `rowSelection` |
| 全选事件 | `handleToggleAllCheckbox` | 删除（hook 内部处理） |
| teleport 目标 | 不存在 | hook 导出 `teleportTarget` |
| 行选择更新 | 不存在 | hook 导出 `handleUpdateSelectedRows` |
| 显示清除按钮 | 手写 computed | hook 导出 `showClearAllButton` |
