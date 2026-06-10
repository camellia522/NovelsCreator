# 世界观地图生成 — 客户端技术说明

> **地图来源**：本地 [Mindwerks WorldEngine](./WORLDENGINE.md)（默认）  
> **社会层（可选）**：Dify `novel-world-society-v1` → [w2-society/README.md](./w2-society/README.md)  
> 入口：`工具 → 世界观生成器`（`/workspace/world-generator`）

---

## 1. 五步向导

| 步骤 | 功能 | 主要 API / 模块 |
|------|------|-----------------|
| 0 基础设定 | 世界名、时代、氛围 | `WorldGenConfig` |
| 1 地图参数 | 尺度、气候、板块数、种子 | `world:generateNative` |
| 2 地图编辑 | 六边形涂领土、发展度 | `WorldMapEditor` + `world-hex-grid` |
| 3 世界观生成 | 国家文案 + 城市 | 本地 + 可选 `world:generateSociety` |
| 4 预览与确认 | 平面/球面预览、写入项目 | `knowledge.store` |

---

## 2. 架构（地图）

```
WorldGeneratorView.vue
        │
        ▼
world-generator.ts          generateWorld()
        │
        ├─► world:generateNative  → WorldEngine PNG + terrainCells
        │
        └─►（仅无 Electron API 时）generateWorldProcedural()
        │
        ▼
WorldMapEditor / WorldMapFlat / WorldMapCanvas
        │
        ▼
knowledge.store             map.json / map.png / locations.json
```

---

## 3. IPC

| Channel | 说明 |
|---------|------|
| `world:checkEngine` | 检测 `scripts/.conda-env` 与 worldengine |
| `world:generateNative` | 调 Python，返回 `mapFilePath` + payload |
| `world:readMapFile` | 本地 PNG → Data URL（预览用） |
| `world:generateSociety` | 可选 Dify 社会层（**不生成地图**） |

注册：`electron/main/ipc/world-gen.ipc.ts`

> **已废弃**：`world:generate`（Dify 地图工作流 `novel-world-generate-v1`）— 文档与客户端默认路径均已移除。

---

## 4. 调用示例

```typescript
import { generateWorld } from '@/utils/world-generator'

const result = await generateWorld({
  worldName: '艾瑟里昂',
  era: '架空',
  atmosphere: ['史诗'],
  scale: 'continent',
  climate: 'mixed',
  cityCount: 10,
  includeLandmarks: true,
  seed: 42,
  numPlates: 10
})
// result.mapImageFilePath / preview 经 readMapFile 加载
// result.source 来自 WorldEngine 适配器
```

社会层（步骤 3）：

```typescript
await window.novelsCreator.world.generateSociety({
  config,
  map: preview.map,
  nations: preview.nations,
  territoryBriefJson: buildTerritoryBriefJson(map, nations, config)
})
```

---

## 5. 数据结构

### 5.1 WorldMapDocument

- `terrainCells`：WorldEngine 下采样栅格（逻辑 0–100）
- `hexGrid`：全图六边形编辑格（`layoutVersion` 变更时重建）
- `nations`：地图编辑 / 世界观生成后写入
- `generatorEngine`：如 `worldengine`
- `hasRasterImage` + `renderWidth` / `renderHeight`：贴图尺寸

类型定义：`src/types/project.ts`

### 5.2 坐标约定

| 空间 | 约定 |
|------|------|
| 百分坐标 | `x,y ∈ [0,100]` — locations、hex 格心 |
| 纬度 | `y=0` 北极，`y=100` 南极 |
| 球面 | `WorldMapCanvas`（Three.js）贴 satellite PNG |

### 5.3 六边形领土

- 布局：`world-hex-grid.ts`（odd-r 铺满 0–100%）
- 涂抹：`MapEditorSidebar` 画笔 / 填充
- 社会层：`world-territory-society.ts` 按 `nationId` 统计并选址

---

## 6. 持久化

`knowledge.applyGeneratedWorld()` 写入：

| 文件 | 内容 |
|------|------|
| `knowledge/world.json` | 世界名、规则、seed |
| `knowledge/map.json` | WorldMapDocument |
| `knowledge/map.png` | WorldEngine satellite 图 |
| `knowledge/locations.json` | 聚落列表 |

---

## 7. 配置要求

1. **WorldEngine**：见 [WORLDENGINE.md](./WORLDENGINE.md)  
2. **Dify（可选）**：仅「世界观生成」步需要 API Key → 应用 **`novel-world-society-v1`**  
3. **Electron**：地图生成与社会层 IPC 需在桌面应用中运行  

---

## 8. 常见问题

### Q：地图生成失败 / 找不到 Python

检查 `scripts/.conda-env` 与 `world:checkEngine` 返回值；路径含空格时以 Electron 服务内解析为准。

### Q：预览空白

须等 `readMapFile` 返回 Data URL；勿在贴图未加载时跳到预览。

### Q：未配置 Dify 仍能否完成向导？

可以。社会层使用 `generateLocalSociety()`；仅国家/城市文案不走大模型。

### Q：旧版 Dify 地图文档在哪？

已删除。见 [README.md § 已移除的文档](./README.md#已移除的文档)。

---

## 9. 文件索引

```
docs/world/WORLDENGINE.md
docs/world/world-map-generation.md          ← 本文档
docs/world/w2-society/                      ← Dify 社会层
scripts/worldengine_generate.py
src/utils/world-generator.ts
src/utils/world-engine-native-adapter.ts
src/utils/world-territory-society.ts
src/views/WorldGeneratorView.vue
src/components/world/WorldMapEditor.vue
```
