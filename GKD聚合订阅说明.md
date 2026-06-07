# GKD 聚合订阅说明

这个仓库现在是一个聚合订阅生成器。`scripts/build-gkd.js` 会把多个上游订阅合并成最终的 `gkd.json5` 和 `gkd.version.json5`。

## 当前上游

| 名称 | 地址 |
|---|---|
| `id667` | `https://gkd-subscription-667.pages.dev/gkd.json5` |
| `ganlinte` | `https://registry.npmmirror.com/@ganlinte/gkd-subscription/latest/files` |
| `aisouler` | `https://registry.npmmirror.com/@aisouler/gkd_subscription/latest/files/dist/AIsouler_gkd.json5` |
| `dream-xiaoyao` | `https://registry.npmmirror.com/gkd-subscription/latest/files` |

## 合并顺序

1. 先拉取全部上游订阅。
2. 再合并本地 `local-rules.json`。
3. 同名应用、同类规则按去重逻辑合并。
4. 本地规则优先级高于上游，最终输出写入 `gkd.json5`。

## 你关心的两个源

你刚才说的这两个地址，已经都属于聚合订阅源：

- `https://registry.npmmirror.com/@ganlinte/gkd-subscription/latest/files`
- `https://registry.npmmirror.com/gkd-subscription/latest/files`

它们都会一起参与生成最终订阅，不需要二选一。

## 输出文件

| 文件 | 用途 |
|---|---|
| `gkd.json5` | 最终订阅 |
| `gkd.version.json5` | 版本检查文件 |

## 本地修改原则

- 新规则优先写到 `local-rules.json`。
- 需要长期保留的规则，再进入聚合生成流程。
- 如果上游已经有同类规则，先检查是否能复用，再决定是否新增。
