# GKD 规则编写流程

这份文档记录一次从用户截图、快照链接到本地规则的完整处理流程，目标是让其他模型按同样方法分析 GKD 快照并写出可用规则。

## 1. 判断用户提供的材料

| 用户提供 | 是否足够写规则 | 处理方式 |
|---|---:|---|
| 普通截图 | 不足够 | 只能判断弹窗位置和大概按钮，不能直接写可靠 selector |
| `https://i.gkd.li/snapshot/...` | 不足够 | 这是本地临时快照页，外部通常无法访问 |
| `https://i.gkd.li/i/...` | 足够 | 可转换为快照 zip，读取 JSON 节点信息 |

普通截图只能辅助判断目标。真正写规则需要快照里的节点信息，包括包名、控件 id、文本、节点类型、坐标、可点击状态。

## 2. 正确快照格式

用户应提供这种链接：

```text
https://i.gkd.li/i/27823579
```

不要使用这种链接：

```text
https://i.gkd.li/snapshot/1778885167968
```

如果用户发的是 `/snapshot/` 链接，让用户在快照页面点分享，复制 `/i/` 链接。

## 3. 下载快照数据

`https://i.gkd.li/i/数字` 对应的 zip 文件通常是：

```text
https://github.com/user-attachments/files/数字/file.zip
```

例如：

```text
https://i.gkd.li/i/27823579
```

对应：

```text
https://github.com/user-attachments/files/27823579/file.zip
```

如果 GitHub 直连失败，可以走 GKD 代理。

**Linux / Mac：**

```bash
id=27838701
encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('https://github.com/user-attachments/files/${id}/file.zip', safe=''))")
curl -k -L "https://proxy.gkd.li/?proxyUrl=${encoded}" -o "/tmp/gkd-${id}.zip"
unzip -o "/tmp/gkd-${id}.zip" -d "/tmp/gkd-${id}"
```

**Windows PowerShell：**

```powershell
$id = '27838701'
$url = [uri]::EscapeDataString("https://github.com/user-attachments/files/$id/file.zip")
curl.exe -k -L "https://proxy.gkd.li/?proxyUrl=$url" -o "$env:TEMP\gkd-$id.zip"
Expand-Archive -LiteralPath "$env:TEMP\gkd-$id.zip" -DestinationPath "$env:TEMP\gkd-$id" -Force
```

zip 内通常包含：

```text
1778885167968.json
1778885167968.png
```

| 文件 | 用途 |
|---|---|
| `.json` | 规则分析的主要依据 |
| `.png` | 对照截图，确认按钮位置 |

## 4. 读取快照基本信息

优先读取这些字段：

| 字段 | 作用 |
|---|---|
| `appId` | GKD app 规则的 `id` |
| `appInfo.name` | 应用名 |
| `appInfo.versionName` | 应用版本，仅用于记录 |
| `activityId` | 如果存在，可写进 `activityIds` |
| `nodes` | 节点树，写 selector 的依据 |

示例命令（Linux / Mac / Windows 通用，需 Python 3）：

```bash
python3 -c "
import json
with open('/tmp/gkd-27838701/1778893119861.json') as f:
    j = json.load(f)
print(f'appId: {j.get(\"appId\")}')
print(f'appName: {(j.get(\"appInfo\") or {}).get(\"name\", \"N/A\")}')
print(f'activityId: {j.get(\"activityId\")}')
print(f'versionName: {(j.get(\"appInfo\") or {}).get(\"versionName\", \"N/A\")}')
"
```

本次结果：

| 项 | 值 |
|---|---|
| 应用名 | 小白智慧打印 |
| 包名 | `com.gfd.ecprint` |
| 版本 | `4.7.0` |
| activityId | `null` |

## 5. 查找目标节点

搜索目标节点需要分步进行，避免返回大量无关节点。

### 5.1 第一步：过滤隐藏节点

Android 会把所有可能的弹窗节点都挂在视图树里，但只有当前显示出来的节点才是分析对象。

判断节点**不可见**（忽略）：
- `width = 0` 或 `height = 0`
- `bottom = top`（高度为零）
- 坐标在屏幕外（如 `top = 2561`，屏幕高度为 2561）

实际案例：微信小程序快照 27838701 共 488 个节点，其中大量"我知道了""狠心取消""确认"等弹窗节点都存在但不可见，不排除会严重干扰分析。

Python 过滤命令：

```bash
python3 -c "
import json
with open('/tmp/gkd-27838701/1778893119861.json') as f:
    data = json.load(f)

visible = [n for n in data['nodes']
           if n['attr'].get('width', 0) > 0
           and n['attr'].get('height', 0) > 0
           and n['attr'].get('bottom') != n['attr'].get('top')]

print(f'总节点: {len(data[\"nodes\"])}, 可见节点: {len(visible)}')
"
```

### 5.2 第二步：按优先级搜索

| 优先级 | 策略 | 搜索方式 |
|---:|---|---|
| 1 | 明确的关闭按钮 id | id/vid 包含 `close`/`x`/`skip`/`ads`/`popup`/`cancel` 且 `clickable=true` |
| 2 | 关闭文本的可点击节点 | text/desc 包含 `关闭`/`跳过`/`×`/`知道了` 且 `clickable=true` |
| 3 | 弹窗文本 → 追溯父节点 | 搜索弹窗关键词文本，沿节点树向上找可点击父节点（见 5.3） |
| 4 | 弹窗容器附近小节点 | 找到弹窗 root 容器，在容器内找可点击小节点 |

Python 命令：

```bash
python3 -c "
import json
with open('/tmp/gkd-27838701/1778893119861.json') as f:
    data = json.load(f)

close_kw = ['close','x','skip','ads','popup','dialog','关闭','跳过','广告','取消','知道了','领取']
for n in data['nodes']:
    a = n['attr']
    if not (a.get('width',0)>0 and a.get('height',0)>0): continue
    if a.get('bottom') == a.get('top'): continue
    fields = f\"{a.get('id','')} {a.get('vid','')} {a.get('text','')} {a.get('desc','')}\"
    if a.get('clickable') and any(kw.lower() in fields.lower() for kw in close_kw):
        print(f\"nodeId={n['id']:4d} | type={n.get('name','')}\")
        print(f\"  id={a.get('id')} vid={a.get('vid')}\")
        print(f\"  text={repr(a.get('text'))} desc={repr(a.get('desc'))}\")
        print(f\"  clickable={a.get('clickable')} bounds=({a.get('left')},{a.get('top')})-({a.get('right')},{a.get('bottom')})\")
        print()
"
```

### 5.3 第三步：父节点追溯

当关闭按钮没有 id，且 text/desc="关闭" 的节点本身不可点击时，需要沿节点树向上找可点击的**父节点**。

典型场景：微信小程序弹窗。"关闭"是一个 TextView（clickable=false），它的父节点才是可点击的。

追溯方法：

1. 搜索 text/desc 包含"关闭"或弹窗关键词（如"优惠""广告""VIP"）的节点
2. 如果该节点 `clickable=false`，通过节点树层级关系向上查找父节点
3. 直到找到 `clickable=true` 的节点
4. 用父节点的 text/desc 信息写 selector（注意：**绝对不能**用微信框架 id，见第 6 节）

### 5.4 第四步：降级 selector 写法

| 条件 | selector 写法 | 稳定性 |
|---|---|---|
| 有关闭按钮 id（非微信框架） | `View[id="xxx"][clickable=true]` | 高 |
| 无 id 但有 text/desc | `TextView[text="关闭"][clickable=true]` | 中 |
| 无 id 无 text，有 vid | `View[vid="xxx"][clickable=true]` | 中 |
| 全都没有 | 告知用户：此弹窗无稳定 selector | — |

### 5.5 完整分析脚本

以下 Python 脚本整合了以上全部逻辑，可直接运行：

```python
import json, os, sys

def analyze_snapshot(json_path):
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"=== 基本信息 ===")
    print(f"appId: {data.get('appId')}")
    print(f"appName: {(data.get('appInfo') or {}).get('name', 'N/A')}")
    print(f"activityId: {data.get('activityId')}")

    nodes = data.get('nodes', [])
    close_kw = ['close','x','skip','ads','popup','dialog',
                '关闭','跳过','广告','取消','知道了','领取']

    # --- 过滤可见节点 ---
    visible = []
    for n in nodes:
        a = n.get('attr', {})
        if a.get('width', 0) > 0 and a.get('height', 0) > 0 \
           and a.get('bottom') != a.get('top'):
            visible.append((n, a))

    print(f"\n总节点: {len(nodes)}, 可见节点: {len(visible)}")

    # --- 搜索可点击且疑似关闭的节点 ---
    candidates = []
    for n, a in visible:
        fields = f"{a.get('id','')} {a.get('vid','')} {a.get('text','')} {a.get('desc','')}"
        if a.get('clickable') and any(kw.lower() in fields.lower() for kw in close_kw):
            candidates.append((n, a))

    print(f"\n=== 候选关闭节点: {len(candidates)} ===")
    for n, a in candidates:
        print(f"  nodeId={n['id']:4d} | {n.get('name','')}")
        print(f"    id={a.get('id')} vid={a.get('vid')} text={repr(a.get('text'))} desc={repr(a.get('desc'))}")
        print(f"    clickable={a.get('clickable')} bounds=({a.get('left')},{a.get('top')})-({a.get('right')},{a.get('bottom')})")
        print()

    if not candidates:
        print(">>> 结论：此快照无可见弹窗或广告相关可点击控件。")
        print(">>> 请提供弹窗出现时的快照，当前页面可能是正常内容页。")
        sys.exit(0)

    # --- 输出推荐 selector ---
    print("=== 推荐 selector ===")
    for n, a in candidates[:5]:
        id_ = a.get('id')
        text = a.get('text')
        desc = a.get('desc')
        name = n.get('name', '')
        ctrl_type = name.split('.')[-1] if name else 'View'

        if id_ and not id_.startswith('com.tencent.mm'):
            # 有非微信 id —— 最优先
            print(f"  {ctrl_type}[id=\"{id_}\"][clickable=true]")
        elif text and text.strip():
            print(f"  {ctrl_type}[text=\"{text}\"][clickable=true]")
        elif desc and desc.strip():
            print(f"  {ctrl_type}[desc=\"{desc}\"][clickable=true]")
        else:
            print(f"  {ctrl_type}[vid=\"{a.get('vid')}\"][clickable=true]")
```

使用方式：

```bash
python3 analyze_snapshot.py /tmp/gkd-27838701/1778893119861.json
```

## 6. 微信小程序 / WebView 场景

当 `appId` 为 `com.tencent.mm` 时，说明快照来自微信内的小程序或公众号页面。此外，其他 App 内嵌的 WebView 也可能出现类似情况。

### 6.1 判断原则

微信小程序快照的控件分为两层：

| 层级 | 来源 | 能否用于规则 |
|---|---|---|
| 微信框架层 | `com.tencent.mm:id/go`、`com.tencent.mm:id/gn`、`com.tencent.mm:id/a0b`、`com.tencent.mm:id/a0g` 等 | **绝对不能**。每个小程序都一样，用它写规则会误关其他小程序 |
| 小程序内容层 | 小程序自身渲染的控件 | 可以。但通常没有 Android 原生 id，需要用 text/desc 定位 |

### 6.2 要排除的微信框架控件

分析时必须跳过这些控件的 id：

| 框架 id | 说明 |
|---|---|
| `com.tencent.mm:id/go` | 右上角「...」更多菜单按钮 |
| `com.tencent.mm:id/gn` | 右上角「×」关闭小程序按钮 |
| `com.tencent.mm:id/a0b` | 底部导航栏 tab 容器 |
| `com.tencent.mm:id/a0g` | 底部导航栏 tab 文字 |

这些 id 属于微信 App 而非小程序，即使用户想关的是小程序内的弹窗，**也不能**用这些 id 写 selector——否则 GKD 会在所有小程序的同一位置误触。

### 6.3 小程序弹窗定位策略

小程序内弹窗的关闭控件通常没有固定 Android id，按以下方式定位：

1. **文本定位关闭按钮：** 搜索 text/desc = "关闭" 或 "×" 的可点击节点
2. **弹窗关键词定位：** 搜索 text 含"广告""优惠""VIP""活动""领取"的节点，向上追溯父节点找关闭按钮
3. **坐标辅助判断：** 小程序关闭按钮通常在弹窗右上角或底部居中

### 6.4 示例

假设微信小程序中出现弹窗，节点结构如下：

```
nodeId=98, text="限时优惠活动", clickable=false  ← 弹窗标题（不可点击）
  └─ nodeId=99, text="关闭", clickable=true   ← 关闭按钮（可点击）
```

正确的 selector：

```json5
matches: 'TextView[text="关闭"][clickable=true]'
```

**错误示例**（千万不要这样写）：

```json5
// 错误！这是微信框架的关闭按钮，不是弹窗的
matches: 'ImageButton[id="com.tencent.mm:id/gn"][clickable=true]'
```

### 6.5 实际案例：27838701

快照 `https://i.gkd.li/i/27838701` 的 appId 为 `com.tencent.mm`（微信），页面是"小白智慧打印"小程序主页。

分析时发现：
- `nodeId=14`：`id="com.tencent.mm:id/gn"`, `desc="关闭"` → **排除**，这是微信框架按钮
- 所有弹窗文本节点（"我知道了""确认""温馨提示"等）均不可见（bottom=top=2561）

结论：此快照无可见弹窗，无需写规则。

## 7. 本次两个快照的分析结果

| 快照 | 场景 | 关闭按钮节点 | 推荐 selector |
|---|---|---|---|
| `https://i.gkd.li/i/27823579` | 优惠券弹窗 | `com.gfd.ecprint:id/base_cp_dlg_close` | `View[id="com.gfd.ecprint:id/base_cp_dlg_close"][clickable=true]` |
| `https://i.gkd.li/i/27824625` | 广告弹窗 | `com.gfd.ecprint:id/dg_dialog_frag_ads_popup_x` | `ImageView[id="com.gfd.ecprint:id/dg_dialog_frag_ads_popup_x"][clickable=true]` |

## 8. 写规则

规则片段：

```json5
{
  id: 'com.gfd.ecprint',
  name: '小白智慧打印',
  groups: [
    {
      key: 1,
      name: '关闭优惠券弹窗',
      rules: [
        {
          matches: 'View[id="com.gfd.ecprint:id/base_cp_dlg_close"][clickable=true]',
          snapshotUrls: [
            'https://i.gkd.li/i/27823579',
          ],
        },
      ],
    },
    {
      key: 2,
      name: '关闭广告弹窗',
      rules: [
        {
          matches: 'ImageView[id="com.gfd.ecprint:id/dg_dialog_frag_ads_popup_x"][clickable=true]',
          snapshotUrls: [
            'https://i.gkd.li/i/27824625',
          ],
        },
      ],
    },
  ],
}
```

完整本地订阅：

```json5
{
  id: 1,
  name: '本地规则',
  version: 1,
  author: 'local',
  apps: [
    {
      id: 'com.gfd.ecprint',
      name: '小白智慧打印',
      groups: [
        {
          key: 1,
          name: '关闭优惠券弹窗',
          rules: [
            {
              matches: 'View[id="com.gfd.ecprint:id/base_cp_dlg_close"][clickable=true]',
              snapshotUrls: [
                'https://i.gkd.li/i/27823579',
              ],
            },
          ],
        },
        {
          key: 2,
          name: '关闭广告弹窗',
          rules: [
            {
              matches: 'ImageView[id="com.gfd.ecprint:id/dg_dialog_frag_ads_popup_x"][clickable=true]',
              snapshotUrls: [
                'https://i.gkd.li/i/27824625',
              ],
            },
          ],
        },
      ],
    },
  ],
}
```

## 9. Selector 语法参考

GKD 的 `matches` 支持类似 CSS 选择器的层级匹配语法。

### 9.1 控件属性匹配

| 属性 | 含义 | 示例 |
|---|---|---|
| `text` | 控件文本 | `[text="关闭"]` |
| `desc` | 控件描述（contentDescription） | `[desc="关闭"]` |
| `id` | 完整控件 id | `[id="com.xx:id/close"]` |
| `vid` | 短控件 id（id 最后一段） | `[vid="close"]` |
| `name` | 控件类型（含包名） | `[name$="Button"]` |
| `clickable` | 可点击 | `[clickable=true]` |
| `visibleToUser` | 用户可见 | `[visibleToUser=true]` |
| `childCount` | 子节点数量 | `[childCount=0]` |
| `index` | 兄弟节点中的序号 | `[index=1]` |
| `width` / `height` | 控件宽高 | `[width<500][height<300]` |

### 9.2 匹配运算符

| 运算符 | 含义 | 示例 |
|---|---|---|
| `=` | 精确匹配 | `[text="关闭"]` |
| `*` | 包含（contains） | `[text*="广告"]` |
| `^` | 开头匹配 | `[text^="即将"]` |
| `$` | 结尾匹配 | `[id$="close"]` |
| `~` | 正则匹配（Java 风格） | `[text~="(?is).*skip.*"]` |
| `!` | 取反/排除 | `[text!*="视频"]` |
| `>` / `<` | 数字大小比较 | `[width<200][height>50]` |

### 9.3 逻辑运算符

| 运算符 | 含义 | 示例 |
|---|---|---|
| `&&` | 与（属性之间隐式也是与） | `[text*="跳过"][clickable=true]` |
| `\|\|` | 或 | `[text="关闭" \|\| text="取消"]` |
| `( )` | 分组优先级 | `([text*="跳过"] \|\| [text*="跳過"])[clickable=true]` |

### 9.4 节点层级关系

| 符号 | 含义 | 方向 | 示例 |
|---|---|---|---|
| `A > B` | A 的直接子节点 B | 向下 | `FrameLayout > @Button` |
| `A < B` | A 是 B 的后代 | 向上 | `@View < FrameLayout` |
| `A + B` | A 的紧邻下一个兄弟 B | 同级 | `TextView + @Button` |
| `A - B` | A 的非紧邻兄弟 B | 同级 | `TextView - @Button` |
| `A +(n) B` | A 后面 n 层兄弟 B | 同级 | `View +(2) @TextView` |
| `A -(n) B` | A 前面 n 层兄弟 B | 同级 | `View -(2) @TextView` |
| `A <n B` | A 是任意层祖先 B 的后代 | 向上 | `@Button <n ListView` |

### 9.5 目标标记

**`@` 标记需要点击的目标节点。** 一个规则中必须有且仅有一个 `@` 标记。

示例：点击"关闭"旁边的 X 按钮
```
TextView[text="关闭"] + @ImageView[clickable=true]
```
解释：先找到 text="关闭" 的 TextView，然后点击它紧邻的下一个可点击 ImageView。

### 9.6 Action 类型

| action | 含义 | 默认？ |
|---|---|---|
| `clickCenter` | 点击目标中心 | 是（不写 action 即此行为） |
| `back` | 模拟返回键 | 否 |
| `longClick` | 长按目标 | 否 |
| `longClickCenter` | 长按目标中心 | 否 |
| `swipe` | 滑动（需配合 swipe 参数） | 否 |

### 9.7 常见写法模板

**有关闭按钮 id（最优先选择）：**
```
ImageView[id="com.xx:id/dialog_close"][clickable=true]
```

**用文本定位关闭按钮：**
```
@TextView[text="关闭"][clickable=true]
```

**用文本定位弹窗→找附近关闭按钮：**
```
[text*="限时优惠"] - @ImageView[clickable=true]
```

**排除误触（开头广告-全局规则）：**
```
[text*="跳过"][text.length<10][width<500][clickable=true]
```

**微信小程序弹窗（不能用框架 id）：**
```
@ImageView[visibleToUser=true] < FrameLayout - [text="广告"]
```

## 11. 写规则时的判断标准

| 情况 | 写法 |
|---|---|
| 有明确关闭按钮 id | 直接用 `id + clickable=true` |
| 有 activityId | 加 `activityIds` 限制 |
| activityId 为 `null` | 不写 `activityIds` |
| 关闭按钮是图片 | 用 `ImageView[id="..."][clickable=true]` |
| 关闭按钮是普通 View | 用 `View[id="..."][clickable=true]` |
| 只有文本没有关闭按钮 id | 用文本定位弹窗，再找邻近可点击节点（见 9.4 层级关系） |

## 12. 不建议的写法

| 不建议 | 原因 |
|---|---|
| 只凭截图写规则 | 没有节点 id 和层级，容易误点 |
| 点整个广告容器 | 可能进入广告页面 |
| 只用坐标 | 设备分辨率、布局变化后容易失效 |
| selector 只写 `[clickable=true]` | 范围太大，容易误触 |
| 没有 `snapshotUrls` | 后续难以追溯规则来源 |

## 13. 当快照中无弹窗时

并非每个快照都包含弹窗或广告。如果分析完可见节点后没有找到任何疑似关闭按钮：

1. **告知用户：** 此快照无明显弹窗或广告，可能是应用正常页面
2. **让用户重新提供：** 在有弹窗出现时重新截图并分享 `/i/` 快照链接
3. **明确终止：** 不要强行写规则，没有弹窗就无需规则

实际案例：27838701 是微信小程序"小白智慧打印"主页，488 个节点中所有弹窗文本都处于隐藏状态（bottom=top=2561），正确结论就是"无弹窗，无需写规则"。

## 14. 给其他模型的执行步骤

1. 判断用户给的是截图、`/snapshot/` 链接还是 `/i/` 链接。
2. 如果不是 `/i/` 链接，要求用户重新分享快照。
3. 用 `/i/数字` 转换出 zip 下载地址。
4. 下载并解压 zip。
5. 读取 JSON 的 `appId`、`appInfo.name`、`activityId`、`nodes`。
6. **如果 `appId` 是 `com.tencent.mm`，标记为"微信小程序场景"，后续排除微信框架 id。**
7. **过滤隐藏节点（width=0 或 height=0 或 bottom=top），只分析可见节点。**
8. 搜索可点击且疑似关闭按钮的节点（见第 5.2 节）。
9. **如果找不到关闭按钮，搜索弹窗文本节点，向上追溯可点击父节点（见第 5.3 节）。**
10. **如果仍然没找到，告知用户：此快照无可见弹窗，请提供弹窗出现时的快照。终止流程。**
11. 对照 PNG，确认目标节点位置确实是关闭按钮。
12. 写 `matches`：优先用控件类型 + text/desc + clickable=true；有关闭按钮 id 时用 id（**排除微信框架 id `com.tencent.mm:id/*`**）。
13. 如果 `activityId` 不为空且不是微信小程序，加入 `activityIds`。
14. 加上 `snapshotUrls`。
15. 输出 App 规则片段和完整本地订阅示例。

## 15. 本次结论

这次两个弹窗都有明确关闭按钮 id，所以规则比较稳定：

| 场景 | 稳定性 | 原因 |
|---|---|---|
| 优惠券弹窗 | 高 | 关闭按钮有固定 id：`base_cp_dlg_close` |
| 广告弹窗 | 高 | 关闭按钮有固定 id：`dg_dialog_frag_ads_popup_x` |

后续如果同一个 App 出现新弹窗，继续按同样流程提供新的 `https://i.gkd.li/i/...` 快照即可。
