# 大纲工作流试运行 · NewWorld（周衍 · 四帝国大陆）

> 用于 Dify 画布 **运行 → 从 Markdown 导入**，或按章节复制到 START 各输入框。  
> 对应客户端：`buildOutlineGenerationPayload` 单章模式 `ch-001` 首次开卷。  
> 工作流：`Novel Outline Generation v1`

---

## ⚠ Dify START 变量清单（共 15 项 · 全部「文本 String」）

若运行面板里**看不到** `generation_mode` / `next_chapter_id` 等，说明画布 **START 节点未添加**，请在 Dify → 开始 → 添加输入字段：

| # | 变量名 | 必填 | 默认值（单章测试） | 你截图里 |
|---|--------|------|-------------------|----------|
| 1 | `project_id` | ✓ | 见下方 | 可能在上方未截到 |
| 2 | `knowledge_snapshot` | ✓ | 见下方 JSON | 可能在上方未截到 |
| 3 | `plot_memory` | | 空 JSON | ✓ 有 |
| 4 | `outline_brief` | | 设定锚点 | ✓ 有 |
| 5 | `target_volumes` | ✓ | `1` | ✓ 有 |
| 6 | `target_chapters` | ✓ | **`1`**（单章！勿填 3） | ⚠ 你填了 `3` |
| 7 | `genre` | | `史诗（架空）` | ✓ 有 |
| 8 | `tone` | | `史诗` | ✓ 有 |
| 9 | **`volume_id`** | ✓ | `vol-01` | **❌ 缺** |
| 10 | **`next_chapter_id`** | ✓ | `ch-001` | **❌ 缺** |
| 11 | **`generation_mode`** | ✓ | `single_chapter` | **❌ 缺** |
| 12 | **`existing_volume_outline`** | ✓ | 见下方 | **❌ 缺** |
| 13 | `max_retry` | ✓ | `3` | ✓ 有（勿留空） |
| 14 | `retry_count` | | `0` | ✓ 有 |
| 15 | `retry_issues_formatted` | | 空 | ✓ 有 |

**缺 4 项的后果**：O1 User 的 Jinja `{% if generation_mode == 'single_chapter' %}` 不生效 → 按全书模式写多章 → 用「主角/王城」代称 → O2 熔断。

添加后，O1 / O2 的 User Prompt 须绑定上表全部变量（见文末附录 C）。

---

| 检查项 | 期望 |
|--------|------|
| END `status` | `success` |
| END `outline_json` | 仅 **1 卷 1 章**，id = `ch-001` |
| beats 每条 | **字面含「周衍」** + **至少 1 个登记地名**（霜叶城/银枝都/圣凯尔/艾瑟赫拉）+ **至少 1 个四国名** |
| beats | 禁止「主角」「王城」「边关」等代称；禁止自造「多兰王国」等国名 |
| 力量体系 | 纯史诗无魔法，禁止异常物品/觉醒/法术 |

---

## project_id

```text
550e8400-e29b-41d4-a716-446655440099
```

## knowledge_snapshot

```json
{
  "world": {
    "title": "NewWorld",
    "rules": "四帝国割据的架空大陆史诗；国家间以条约、联姻与边境战争维系秩序；禁止超自然力量介入历史进程。",
    "era": "架空",
    "genre": "史诗",
    "scene": "大陆",
    "scenePlace": "霜叶城",
    "mapScale": "continent",
    "climate": "temperate_broad",
    "techLevel": "冷兵器",
    "atmosphere": "史诗",
    "magicConstraint": "纯史诗（无魔法）",
    "conflictFocus": "国家战争",
    "narrativeStyle": "史诗群像",
    "socialStructure": "封建帝国",
    "politicalTone": "权谋",
    "warfareStyle": "方阵与骑战",
    "economicBase": "农业与贸易",
    "pacing": "稳健推进",
    "proseRegister": "庄重",
    "contentTaboos": "禁修真、禁魔教、禁穿越",
    "settingConstraints": "【硬性设定 · 选项生成 · 不得违背】\n1. 时代：架空；题材：史诗；叙事：史诗群像；节奏：稳健推进；文风：庄重。\n2. 地图尺度：大陆级（2048×1024）；场景类型：大陆；主舞台：霜叶城。\n3. 社会：封建帝国；政治：权谋；战争：方阵与骑战；经济：农业与贸易。\n4. 气候：温带广布；科技：冷兵器；冲突主轴：国家战争；氛围：史诗。\n5. 力量体系：纯史诗（无魔法）。架空历史/史诗大陆；可引用神话传说但不得成真，无系统性超自然。\n6. 允许：冷兵器战争、帝国割据、权谋、民俗祭祀（仅文化层面）、史诗修辞。\n7. 严禁：修仙、魔教、灵力、丹道、宗门秘法、法宝、妖兽、渡劫、内功、真气、法术、符咒、阵法、诅咒、附魔、亡灵、召唤、任何可验证的超自然现象：发光灵石、狐狸化身、神灵降世、浮空岛、空间裂缝、能量觉醒、星盘、古神意识、复活、预言必中、系统面板、穿越、重生。\n8. 创作禁忌（额外硬约束）：禁修真、禁魔教、禁穿越\n9. beats/summary 须使用 knowledge 已登记的国家/势力/人物/地点全名；禁止 silent retcon；禁止替换主角；禁止自造与 knowledge 冲突的具名重要实体。\n10. plot_memory 与 existing_volume_outline 冲突时，以 existing_volume_outline 为准；新章须因果承接最后一章 beats。\n11. 禁止把史诗大陆/历史题材写成现代都市玄幻；禁止与力量体系矛盾的任何超自然/修仙/魔教情节。"
  },
  "nations": [
    {
      "id": "nation-001",
      "name": "瓦尔迪斯密林同盟",
      "government": "森林议会",
      "culture": "游猎与密林守盟",
      "description": "大陆西北密林诸部组成的同盟"
    },
    {
      "id": "nation-002",
      "name": "埃林铎圣约国",
      "government": "教权与贵族共治",
      "culture": "圣约律法",
      "description": "中央高原上的圣约王国"
    },
    {
      "id": "nation-003",
      "name": "科拉斯联合城邦",
      "government": "城邦联盟",
      "culture": "商业与航海",
      "description": "东南沿海城邦联合体"
    },
    {
      "id": "nation-004",
      "name": "米尔汗城邦联盟",
      "government": "城邦议会",
      "culture": "贸易与雇佣兵",
      "description": "西南贸易通道上的城邦联盟"
    }
  ],
  "locations": [
    {
      "id": "loc-001",
      "name": "霜叶城",
      "type": "city",
      "x": 42,
      "y": 38,
      "terrain": "plain",
      "climate": "temperate",
      "description": "埃林铎边境重镇，主角出发地",
      "nationId": "nation-002"
    },
    {
      "id": "loc-002",
      "name": "银枝都",
      "type": "capital",
      "x": 48,
      "y": 45,
      "terrain": "plain",
      "climate": "temperate",
      "description": "埃林铎圣约国都城",
      "nationId": "nation-002"
    },
    {
      "id": "loc-003",
      "name": "圣凯尔",
      "type": "city",
      "x": 55,
      "y": 52,
      "terrain": "hill",
      "climate": "temperate",
      "description": "圣约国东部要塞城市",
      "nationId": "nation-002"
    },
    {
      "id": "loc-004",
      "name": "艾瑟赫拉",
      "type": "city",
      "x": 36,
      "y": 28,
      "terrain": "forest",
      "climate": "temperate",
      "description": "密林同盟边境贸易站",
      "nationId": "nation-001"
    }
  ],
  "regions": [],
  "characters": [
    {
      "id": "char-001",
      "name": "周衍",
      "role": "主角",
      "traits": ["冷静", "敏锐"],
      "personality": "边关出身的青年剑士",
      "notes": "第一卷 POV"
    }
  ],
  "factions": [],
  "items": [],
  "mapMeta": {
    "name": "NewWorld",
    "seed": 42,
    "renderWidth": 2048,
    "renderHeight": 1024
  }
}
```

## plot_memory

```json
{
  "version": 1,
  "globalSummary": "",
  "chapterSummaries": [],
  "foreshadowing": []
}
```

## outline_brief

```text
【设定锚点 · 硬性 · O1/O2 必须遵守】
【硬性设定 · 选项生成 · 不得违背】
1. 时代：架空；题材：史诗；叙事：史诗群像；节奏：稳健推进；文风：庄重。
2. 地图尺度：大陆级（2048×1024）；场景类型：大陆；主舞台：霜叶城。
3. 社会：封建帝国；政治：权谋；战争：方阵与骑战；经济：农业与贸易。
4. 气候：温带广布；科技：冷兵器；冲突主轴：国家战争；氛围：史诗。
5. 力量体系：纯史诗（无魔法）。架空历史/史诗大陆；可引用神话传说但不得成真，无系统性超自然。
6. 允许：冷兵器战争、帝国割据、权谋、民俗祭祀（仅文化层面）、史诗修辞。
7. 严禁：修仙、魔教、灵力、丹道、宗门秘法、法宝、妖兽、渡劫、内功、真气、法术、符咒、阵法、诅咒、附魔、亡灵、召唤、任何可验证的超自然现象：发光灵石、狐狸化身、神灵降世、浮空岛、空间裂缝、能量觉醒、星盘、古神意识、复活、预言必中、系统面板、穿越、重生。
8. 创作禁忌（额外硬约束）：禁修真、禁魔教、禁穿越
9. beats/summary 须使用 knowledge 已登记的国家/势力/人物/地点全名；禁止 silent retcon；禁止替换主角；禁止自造与 knowledge 冲突的具名重要实体。
10. plot_memory 与 existing_volume_outline 冲突时，以 existing_volume_outline 为准；新章须因果承接最后一章 beats。
11. 禁止把史诗大陆/历史题材写成现代都市玄幻；禁止与力量体系矛盾的任何超自然/修仙/魔教情节。
- 时代 架空 · 题材 史诗 · 场景 大陆（霜叶城）
- 地图尺度 大陆级 · 气候 温带广布 · 科技 冷兵器
- 力量体系：纯史诗（无魔法）。严禁：修仙、魔教、灵力、丹道、宗门秘法、法宝、妖兽、渡劫、内功、真气、法术、符咒、阵法、诅咒、附魔、亡灵、召唤、任何可验证的超自然现象：发光灵石、狐狸化身、神灵降世、浮空岛、空间裂缝、能量觉醒、星盘、古神意识、复活、预言必中、系统面板、穿越、重生。
- 创作禁忌：禁修真、禁魔教、禁穿越
- 作者补充设定：四帝国割据的架空大陆史诗；国家间以条约、联姻与边境战争维系秩序；禁止超自然力量介入历史进程。

【实体白名单 · beats 须使用以下已登记名称，禁止自造替代】
- 主角（必须出现姓名）：周衍
- 国家：瓦尔迪斯密林同盟、埃林铎圣约国、科拉斯联合城邦、米尔汗城邦联盟
- 地点/都城（至少出现 1 个）：霜叶城、银枝都、圣凯尔、艾瑟赫拉
- 人物：周衍
- 综合白名单：瓦尔迪斯密林同盟、埃林铎圣约国、科拉斯联合城邦、米尔汗城邦联盟、霜叶城、银枝都、圣凯尔、艾瑟赫拉、周衍

【执行纪律】
- 禁止修仙/魔教/灵力/丹道/宗门秘法/法术/穿越/系统（除非力量体系明确允许）
- 禁止替换主角、禁止 silent retcon
- plot_memory 与 existing_volume_outline 冲突时，以 existing_volume_outline 为准
- 新章须因果承接 existing_volume_outline 最后一章 beats，不得吃书
```

## target_volumes

```text
1
```

## target_chapters

```text
1
```

## genre

```text
史诗（架空）
```

## tone

```text
史诗
```

## volume_id

```text
vol-01
```

## next_chapter_id

```text
ch-001
```

## generation_mode

```text
single_chapter
```

## existing_volume_outline

```json
{"id":"vol-01","title":"第一卷","chapters":[]}
```

## max_retry

```text
3
```

## retry_count

```text
0
```

## retry_issues_formatted

```text

```

---

## 附录 A · 单行 JSON（部分 Dify 版本仅支持单行）

**knowledge_snapshot（压缩一行）：**

```text
{"world":{"title":"NewWorld","rules":"四帝国割据的架空大陆史诗；国家间以条约、联姻与边境战争维系秩序；禁止超自然力量介入历史进程。","era":"架空","genre":"史诗","scene":"大陆","scenePlace":"霜叶城","mapScale":"continent","climate":"temperate_broad","techLevel":"冷兵器","atmosphere":"史诗","magicConstraint":"纯史诗（无魔法）","conflictFocus":"国家战争","narrativeStyle":"史诗群像","socialStructure":"封建帝国","politicalTone":"权谋","warfareStyle":"方阵与骑战","economicBase":"农业与贸易","pacing":"稳健推进","proseRegister":"庄重","contentTaboos":"禁修真、禁魔教、禁穿越","settingConstraints":"【硬性设定 · 选项生成 · 不得违背】\n1. 时代：架空；题材：史诗；叙事：史诗群像；节奏：稳健推进；文风：庄重。\n2. 地图尺度：大陆级（2048×1024）；场景类型：大陆；主舞台：霜叶城。\n3. 社会：封建帝国；政治：权谋；战争：方阵与骑战；经济：农业与贸易。\n4. 气候：温带广布；科技：冷兵器；冲突主轴：国家战争；氛围：史诗。\n5. 力量体系：纯史诗（无魔法）。架空历史/史诗大陆；可引用神话传说但不得成真，无系统性超自然。\n6. 允许：冷兵器战争、帝国割据、权谋、民俗祭祀（仅文化层面）、史诗修辞。\n7. 严禁：修仙、魔教、灵力、丹道、宗门秘法、法宝、妖兽、渡劫、内功、真气、法术、符咒、阵法、诅咒、附魔、亡灵、召唤、任何可验证的超自然现象：发光灵石、狐狸化身、神灵降世、浮空岛、空间裂缝、能量觉醒、星盘、古神意识、复活、预言必中、系统面板、穿越、重生。\n8. 创作禁忌（额外硬约束）：禁修真、禁魔教、禁穿越\n9. beats/summary 须使用 knowledge 已登记的国家/势力/人物/地点全名；禁止 silent retcon；禁止替换主角；禁止自造与 knowledge 冲突的具名重要实体。\n10. plot_memory 与 existing_volume_outline 冲突时，以 existing_volume_outline 为准；新章须因果承接最后一章 beats。\n11. 禁止把史诗大陆/历史题材写成现代都市玄幻；禁止与力量体系矛盾的任何超自然/修仙/魔教情节。"},"nations":[{"id":"nation-001","name":"瓦尔迪斯密林同盟","government":"森林议会","culture":"游猎与密林守盟","description":"大陆西北密林诸部组成的同盟"},{"id":"nation-002","name":"埃林铎圣约国","government":"教权与贵族共治","culture":"圣约律法","description":"中央高原上的圣约王国"},{"id":"nation-003","name":"科拉斯联合城邦","government":"城邦联盟","culture":"商业与航海","description":"东南沿海城邦联合体"},{"id":"nation-004","name":"米尔汗城邦联盟","government":"城邦议会","culture":"贸易与雇佣兵","description":"西南贸易通道上的城邦联盟"}],"locations":[{"id":"loc-001","name":"霜叶城","type":"city","x":42,"y":38,"terrain":"plain","climate":"temperate","description":"埃林铎边境重镇，主角出发地","nationId":"nation-002"},{"id":"loc-002","name":"银枝都","type":"capital","x":48,"y":45,"terrain":"plain","climate":"temperate","description":"埃林铎圣约国都城","nationId":"nation-002"},{"id":"loc-003","name":"圣凯尔","type":"city","x":55,"y":52,"terrain":"hill","climate":"temperate","description":"圣约国东部要塞城市","nationId":"nation-002"},{"id":"loc-004","name":"艾瑟赫拉","type":"city","x":36,"y":28,"terrain":"forest","climate":"temperate","description":"密林同盟边境贸易站","nationId":"nation-001"}],"regions":[],"characters":[{"id":"char-001","name":"周衍","role":"主角","traits":["冷静","敏锐"],"personality":"边关出身的青年剑士","notes":"第一卷 POV"}],"factions":[],"items":[],"mapMeta":{"name":"NewWorld","seed":42,"renderWidth":2048,"renderHeight":1024}}
```

**plot_memory（压缩一行）：**

```text
{"version":1,"globalSummary":"","chapterSummaries":[],"foreshadowing":[]}
```

**existing_volume_outline（压缩一行）：**

```text
{"id":"vol-01","title":"第一卷","chapters":[]}
```

---

## 附录 B · 重试路径测试（模拟客户端熔断后第二轮）

首次 run 若 O2 驳回，用 END 输出更新 START 后再运行：

| 变量 | 值 |
|------|-----|
| retry_count | `1` |
| retry_issues_formatted | 见下方 |

示例 `retry_issues_formatted`（来自你项目实际熔断）：

```text
- [hard] ch-001: 主角姓名应为 knowledge 已登记的「周衍」，但全部 beats 使用「主角」代称，违反实体白名单一致性要求
- [hard] ch-001: beats 未出现任何已登记地点名（如霜叶城、银枝都、圣凯尔、艾瑟赫拉），仅使用泛化场景描述
- [hard] ch-001: 空泛 beats 占比超过 30%，不满足可执行大纲要求
- [warn] ch-001: 第 1 条 beat 提及「发现异常物品」，与纯史诗无魔法设定存在引入超自然元素的风险
```

其余字段与上文 **首次试运行** 相同。

**期望第二轮 O1**：每条 beat 含「周衍」+「霜叶城」或「银枝都」+「埃林铎圣约国」等四国之一；仅 1 章；无「主角」「王城」代称。

---

## 附录 C · O1 / O2 User 必绑变量清单

**O1 User（Jinja 开）**

`retry_issues_formatted`, `knowledge_snapshot`, `plot_memory`, `outline_brief`, `target_volumes`, `target_chapters`, `genre`, `tone`, **`generation_mode`**, **`volume_id`**, **`next_chapter_id`**, **`existing_volume_outline`**

**O2 User（Jinja 开）**

`outline_json`, `knowledge_snapshot`, `plot_memory`, `target_chapters`, `target_volumes`, **`generation_mode`**, **`volume_id`**, **`next_chapter_id`**, **`existing_volume_outline`**

---

## 附录 D · 合格 beats 参考（O1 应对齐此粒度）

```json
{
  "outline_summary": "周衍在霜叶城接到埃林铎圣约国边关急报，决定赴银枝都陈情，途中于圣凯尔外廓识破粮价异动。",
  "outline": {
    "volumes": [
      {
        "id": "vol-01",
        "title": "第一卷",
        "chapters": [
          {
            "id": "ch-001",
            "title": "霜叶城急报",
            "status": "draft",
            "beats": [
              { "order": 1, "text": "周衍于霜叶城城门巡防时，接获埃林铎圣约国边关急报，称瓦尔迪斯密林同盟边境有异动。" },
              { "order": 2, "text": "周衍在霜叶城驿馆核对急报印信，发现科拉斯联合城邦商路亦受影响，决意当日离城。" },
              { "order": 3, "text": "周衍出霜叶城北上，于通往银枝都的驿道遇见米尔汗城邦联盟商队，交换边境风声。" },
              { "order": 4, "text": "周衍夜宿圣凯尔外廓客栈，听闻圣约国东部要塞增兵，章末决定次日入圣凯尔求见守将。" }
            ]
          }
        ]
      }
    ]
  }
}
```
