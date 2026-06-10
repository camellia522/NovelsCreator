# 社会层工作流试运行 · 单批 8 城

> 用于 Dify「从 Markdown 导入」或按章节复制到各输入框。  
> 对应 JSON：`society-run-batch8.sample.json`  
> 通过标准：END 的 `locations_jsonString` 解析后 **8 条**，且 id 为 loc-001 … loc-008。

**若 W2S 仍输出 `nations:[] locations:[]`**：说明 `territory_json` 等未进模型（开始节点空或未绑定到 W2S）。请用文末 **附录单行** 手动填入，并看 `dify/world/DIFY-W2S-EMPTY-INPUTS.md`。

---

## project_id

```text
demo-project
```

## generation_mode

```text
territory_society
```

## world_name

```text
测试世界
```

## era

```text
架空
```

## atmosphere

```text
史诗
```

## scale

```text
continent
```

## climate

```text
mixed
```

## city_count

```text
8
```

## include_landmarks

```text
true
```

## seed

```text
42
```

## geological_years_ma

```text
80
```

## cells_per_province_target

```text
30
```

## local_location_count

```text
8
```

## nations_outline_json

```json
[{"id":"nation-001","name":"青王国"},{"id":"nation-002","name":"北境公国"}]
```

## creative_brief

```text
【任务】仅润色文案。本批共 8 座城，输出 locations 必须恰好 8 条。须保留 localDraftLocations 全部 id/x/y/type/terrain/nationId，禁止增删城市或改坐标。
```

## territory_json

```json
{
  "schemaVersion": 3,
  "projectConfig": {
    "worldName": "测试世界",
    "era": "架空",
    "atmosphere": ["史诗"],
    "scale": "continent",
    "climate": "mixed",
    "cityCount": 8,
    "includeLandmarks": true,
    "seed": 42,
    "cellsPerProvinceTarget": 30,
    "adminDivisionMode": "province_prefecture_county",
    "localLocationCount": 8,
    "societyBatch": { "batchIndex": 0, "batchCount": 1, "totalCount": 8 }
  },
  "nations": [
    {
      "nationId": "nation-001",
      "name": "青王国",
      "landHexCount": 70,
      "developmentTier": "成长",
      "latBand": "北半球温带",
      "spatial": {
        "localDraftLocations": [
          { "id": "loc-001", "type": "capital", "x": 45, "y": 38, "terrain": "plain", "name": "青京", "adminRole": "都城", "nationId": "nation-001" },
          { "id": "loc-002", "type": "city", "x": 42, "y": 40, "terrain": "plain", "name": "东城", "adminRole": "省会", "nationId": "nation-001" },
          { "id": "loc-003", "type": "city", "x": 44, "y": 42, "terrain": "hill", "name": "南关", "adminRole": "府治", "nationId": "nation-001" },
          { "id": "loc-004", "type": "town", "x": 40, "y": 41, "terrain": "plain", "name": "石桥镇", "adminRole": "县治", "nationId": "nation-001" }
        ],
        "adminProvinces": []
      }
    },
    {
      "nationId": "nation-002",
      "name": "北境公国",
      "landHexCount": 55,
      "developmentTier": "成长",
      "latBand": "北半球亚寒带",
      "spatial": {
        "localDraftLocations": [
          { "id": "loc-005", "type": "capital", "x": 62, "y": 28, "terrain": "plain", "name": "雪堡", "adminRole": "都城", "nationId": "nation-002" },
          { "id": "loc-006", "type": "city", "x": 58, "y": 30, "terrain": "hill", "name": "铁炉城", "adminRole": "府治", "nationId": "nation-002" },
          { "id": "loc-007", "type": "town", "x": 60, "y": 32, "terrain": "forest", "name": "松岭镇", "adminRole": "县治", "nationId": "nation-002" },
          { "id": "loc-008", "type": "landmark", "x": 65, "y": 26, "terrain": "mountain", "name": "观星峰", "adminRole": "地标", "nationId": "nation-002" }
        ],
        "adminProvinces": []
      }
    }
  ]
}
```

---

## 附录：单行 JSON（若 Markdown 导入后变量框需一行）

复制下面整行到 `nations_outline_json` / `territory_json` 输入框（勿换行）：

### nations_outline_json（单行）

```text
[{"id":"nation-001","name":"青王国"},{"id":"nation-002","name":"北境公国"}]
```

### territory_json（单行）

```text
{"schemaVersion":3,"projectConfig":{"worldName":"测试世界","era":"架空","atmosphere":["史诗"],"scale":"continent","climate":"mixed","cityCount":8,"includeLandmarks":true,"seed":42,"cellsPerProvinceTarget":30,"adminDivisionMode":"province_prefecture_county","localLocationCount":8,"societyBatch":{"batchIndex":0,"batchCount":1,"totalCount":8}},"nations":[{"nationId":"nation-001","name":"青王国","landHexCount":70,"developmentTier":"成长","latBand":"北半球温带","spatial":{"localDraftLocations":[{"id":"loc-001","type":"capital","x":45,"y":38,"terrain":"plain","name":"青京","adminRole":"都城","nationId":"nation-001"},{"id":"loc-002","type":"city","x":42,"y":40,"terrain":"plain","name":"东城","adminRole":"省会","nationId":"nation-001"},{"id":"loc-003","type":"city","x":44,"y":42,"terrain":"hill","name":"南关","adminRole":"府治","nationId":"nation-001"},{"id":"loc-004","type":"town","x":40,"y":41,"terrain":"plain","name":"石桥镇","adminRole":"县治","nationId":"nation-001"}],"adminProvinces":[]}},{"nationId":"nation-002","name":"北境公国","landHexCount":55,"developmentTier":"成长","latBand":"北半球亚寒带","spatial":{"localDraftLocations":[{"id":"loc-005","type":"capital","x":62,"y":28,"terrain":"plain","name":"雪堡","adminRole":"都城","nationId":"nation-002"},{"id":"loc-006","type":"city","x":58,"y":30,"terrain":"hill","name":"铁炉城","adminRole":"府治","nationId":"nation-002"},{"id":"loc-007","type":"town","x":60,"y":32,"terrain":"forest","name":"松岭镇","adminRole":"县治","nationId":"nation-002"},{"id":"loc-008","type":"landmark","x":65,"y":26,"terrain":"mountain","name":"观星峰","adminRole":"地标","nationId":"nation-002"}],"adminProvinces":[]}}]}
```
