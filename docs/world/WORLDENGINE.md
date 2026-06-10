# WorldEngine 本地地图生成

> 官方项目：[Mindwerks/worldengine](https://github.com/Mindwerks/worldengine)  
> 客户端入口：`工具 → 世界观生成器` → **地图参数** → 生成地图

---

## 1. 管线概览

```
WorldGeneratorView（地图参数）
        │
        ▼
IPC world:generateNative
        │
        ▼
electron/main/services/worldengine-cli.service.ts
        │
        ▼
scripts/worldengine_generate.py  （Python 3.11 + worldengine 包）
        │
        ├── satellite.png   等距圆柱贴图（UI 底图 / 球面）
        ├── biome / elevation 等中间产物（缓存目录）
        └── stdout JSON → terrainCells 等
        │
        ▼
world-engine-native-adapter.ts → WorldGenResult
```

与旧方案的区别：**不再**经 Dify W1 生成 `map_json`，**不再**用通义万相/ComfyUI 出图。

---

## 2. 环境准备（Windows）

| 项 | 说明 |
|----|------|
| Python | 推荐 **3.11**，位于 `scripts/.conda-env`（Anaconda 创建） |
| 包 | `worldengine`（与官方 CLI 一致） |
| 脚本 | `scripts/worldengine_generate.py` |

**检查安装**（应用内）：世界观生成器会调用 `world:checkEngine`，或开发时：

```powershell
cd "d:\selfProgram files\projectCategory\NovelsCreator\scripts"
.\.conda-env\python.exe worldengine_generate.py --help
```

若未安装，按项目 `scripts/` 内 README 或团队 Conda 说明创建 `.conda-env` 并 `pip install worldengine`。

---

## 3. 参数（与官方 CLI 对齐）

定义见 [`shared/world-engine-official.ts`](../../shared/world-engine-official.ts)，UI 绑定 [`WorldGeneratorView.vue`](../../src/views/WorldGeneratorView.vue)。

| 参数 | 范围 / 说明 |
|------|-------------|
| `seed` | **0–65535**（`uint16`，与 `-s` 一致） |
| `numPlates` | **1–100**（`-q` 板块数） |
| `scale` | kingdom / archipelago / continent / world / planet → 决定输出宽高与默认板块数 |
| `climate` | UI 气候倾向（传入脚本时影响预设） |

**输出尺寸**（等距圆柱，scale 预设）：

| scale | 典型分辨率（宽×高） |
|-------|---------------------|
| kingdom | 512×256 |
| continent | 1024×512 |
| world | 2048×1024 |
| planet | 4096×2048 |

实际以 `equirectDimensionsForScale()` 为准。

---

## 4. 模拟步骤（官方等价）

WorldEngine **full** 流程概念顺序（与 GitHub 文档一致）：

1. 板块构造  
2. 温度 / 降水  
3. 侵蚀  
4. 水文  
5. Holdridge 生物群系  
6. 冰盖  
7. 渲染（含 **satellite** 卫星图）

客户端只消费 **satellite PNG** + 下采样 **terrainCells**（供六边形格属性采样）。

---

## 5. 开发调试

手动跑脚本（示例）：

```powershell
$py = "d:\selfProgram files\projectCategory\NovelsCreator\scripts\.conda-env\python.exe"
& $py "d:\selfProgram files\projectCategory\NovelsCreator\scripts\worldengine_generate.py" `
  --world-name "测试" --seed 42 --scale continent --num-plates 10 --out-dir "$env:TEMP\we-test"
```

Electron 会将 PNG 路径经 `world:readMapFile` 转为 Data URL，避免 IPC 传输超大 base64。

---

## 6. 失败与回退

| 场景 | 行为 |
|------|------|
| Electron 内 `generateNative` 失败 | 抛出错误，UI 显示 `genError` |
| 无 `window.novelsCreator.world`（纯浏览器） | `generateWorld()` 回退 **TS 程序化** `generateWorldProcedural()` |

生产桌面版应保证 WorldEngine 可用，而非依赖 Dify 地图流。

---

## 7. 发行版内置 Python（便携环境）

Release 安装包通过 `npm run build:python` 将 WorldEngine 依赖打入 `resources/python/`，经 electron-builder `extraResources` 随应用分发。用户 **无需** 安装 Python。

| 阶段 | 说明 |
|------|------|
| 构建 | `node scripts/build-python-bundle.cjs`（Windows 优先 conda-forge 预编译 `noise`） |
| 运行 | 打包后优先使用 `process.resourcesPath/python` 下的解释器 |
| 开发 | 仍可用 `scripts/setup-worldengine.ps1` 或 `scripts/.conda-env` |

维护者本地打包：

```powershell
# Windows：需 Miniconda/Miniforge 或在 PATH 中有 conda
npm run pack:win
```

强制重建 Python  bundle：`node scripts/build-python-bundle.cjs --force`

---

## 8. 相关文件

| 路径 | 职责 |
|------|------|
| `scripts/build-python-bundle.cjs` | 构建发行版便携 Python 环境 |
| `scripts/worldengine_generate.py` | 子进程入口 |
| `electron/main/services/worldengine-cli.service.ts` | 调 Python、读 PNG |
| `src/utils/world-engine-native-adapter.ts` | payload → `WorldGenResult` |
| `src/utils/world-generator.ts` | `generateWorld()` 入口 |
| `src/utils/world-hex-grid.ts` | 全图六边形网格 |

客户端总览：[world-map-generation.md](./world-map-generation.md)
