# GKD 本地规则

## 应用信息

| 项 | 值 |
|---|---|
| 应用名 | 小白智慧打印 |
| 包名 | `com.gfd.ecprint` |
| 版本 | `4.7.0` |

## 已分析快照

| 快照 | 场景 | 目标节点 |
|---|---|---|
| `https://i.gkd.li/i/27823579` | 优惠券弹窗 | `com.gfd.ecprint:id/base_cp_dlg_close` |
| `https://i.gkd.li/i/27824625` | 广告弹窗 | `com.gfd.ecprint:id/dg_dialog_frag_ads_popup_x` |

## App 规则片段

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

## 完整本地订阅示例

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

## 说明

| 规则 | 说明 |
|---|---|
| `关闭优惠券弹窗` | 点击优惠券弹窗下方圆形关闭按钮 |
| `关闭广告弹窗` | 点击广告弹窗底部圆形 `X` 关闭按钮 |

两个快照的 `activityId` 都是 `null`，所以规则未添加 `activityIds` 限制。
