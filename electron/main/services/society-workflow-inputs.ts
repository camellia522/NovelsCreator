import type { WorldGenConfig } from '../../src/types/world-gen'
import type { WorldNation } from '../../src/types/project'
import { namingStyleBriefLine, normalizePlaceNamingStyle } from '../utils/world-naming-brief'
import type { TerritorySocietyRequest } from './world-society.service'

export function parseTerritoryBriefMeta(territoryBriefJson: string): {
  cellsPerProvinceTarget?: number
  localLocationCount?: number
  schemaVersion?: number
  societyBatch?: { batchIndex: number; batchCount: number; totalCount: number }
} {
  try {
    const obj = JSON.parse(territoryBriefJson) as {
      schemaVersion?: number
      projectConfig?: {
        cellsPerProvinceTarget?: number
        localLocationCount?: number
        societyBatch?: { batchIndex: number; batchCount: number; totalCount: number }
      }
    }
    return {
      schemaVersion: obj.schemaVersion,
      cellsPerProvinceTarget: obj.projectConfig?.cellsPerProvinceTarget,
      localLocationCount: obj.projectConfig?.localLocationCount,
      societyBatch: obj.projectConfig?.societyBatch
    }
  } catch {
    return {}
  }
}

export function buildLlmBrief(config: WorldGenConfig, territoryBriefJson: string): string {
  const meta = parseTerritoryBriefMeta(territoryBriefJson)
  const localCount = meta.localLocationCount ?? 0
  const cpp = meta.cellsPerProvinceTarget ?? 30

  return [
    '【任务】作者已在六边形地图上涂抹各国领土；客户端已完成**行省→府州→县**区划与**本地选址**。',
    '你只润色文案（国名/政体/文化/城市名/描述/世界规则），**不得改地图、不得改坐标、不得增删国家或城市**。',
    '【world_rules — 世界背景润色（必做，首批）】',
    '- 阅读 territory_json.authorCreativeBrief（作者所选时代/氛围/尺度/气候/命名风格）与 nations[].environmentalProfile、placementSummary（选址事实，勿照抄）。',
    '- 将上述词条与领土概况**改写为 300–600 字中文架空世界背景**：地理气质、历史感、各国关系与叙事基调须体现 atmosphere/era/climate/scale。',
    '- **禁止**输出分辨率、板块数、海平面、schemaVersion、生成器流程、行省算法等工程/统计原文；placementSummary 仅作参考，不得整段复制。',
    '- 分批时：**第 1 批**必须输出完整 world_rules；后续批次 world_rules 留空字符串 ""，勿重复。',
    '【输出】仅一个 JSON 对象：world_rules（300–600字中文）、nations（数组）、locations（数组）。',
    `【territory_json schemaVersion=${meta.schemaVersion ?? 3}】`,
    '- projectConfig：含 era/atmosphere/scale/climate/placeNamingStyle/namingStyleHint/cityCount/cellsPerProvinceTarget/adminDivisionMode',
    '- nations[]：环境统计 + traits + spatial（bounds/adminProvinces/localDraftLocations/settlementCandidates 等）',
    `【行省区划】目标约 ${cpp} 格/省；各国 spatial.adminProvinces[] 列出省名、省域格数、治所 seats。`,
    `【本地选址】共 ${localCount} 处；spatial.localDraftLocations 与 adminProvinces[].seats 为**最终坐标与层级**，你必须：`,
    '  1. **逐条保留** localDraftLocations 的 id、x、y、type、terrain、nationId、regionId、adminRole 语义',
    '  2. 润色 nations[].name（国名）与 locations[].name/description；以及 nations 的 government/culture/description/authorSettings',
    '  3. 首都 adminRole=首都；省会/城市/县市 名称须与辖区 terrain、latBand、developmentTier 一致；每省仅一个省会，其余同级为城市；**多数城名不必含东/西/南/北**；若名称含方位字，必须与 compassHint、x/y 一致（西境不得用「东」）',
    '  4. **禁止**新增 locations、删除 locations、把 capital 改成 city、或把城市移到雪带/海上',
    '  5. population/development 可与 localDraft 接近；勿与寒带/荒漠设定矛盾',
    `- **城市总数 = ${localCount}**（由行省→府州→县算法自动计算，非手填；输出 locations 必须恰好 ${localCount} 条）`,
    meta.societyBatch
      ? `- **分批润色（关键）**：全图共 ${meta.societyBatch.totalCount} 座，本批为第 ${meta.societyBatch.batchIndex + 1}/${meta.societyBatch.batchCount} 批；本批须输出 **恰好 ${localCount} 条** locations（禁止只写 6 条示例就结束；禁止省略号）；仅润色本批 localDraftLocations，id/x/y/type/terrain/nationId 不得改`
      : '',
    localCount > 0
      ? `- 若 locations 条数 < ${localCount}，视为未完成；客户端会重试未命中批次`
      : '',
    config.includeLandmarks ? '- 可保留 type=landmark 条目并润色名/描述' : '',
    `【命名风格】遵循 projectConfig.placeNamingStyle 与 namingStyleHint；各国 nationNamingStyle 一致；polishNationName=true 的国名必须润色为符合风格的专名（勿保留「国家1」或机械占位）`,
    '【nations】id 必须与 nations_outline_json 一致；必须输出 nations[].name；依据 environmentalProfile/traits 差异化政体与文化',
    '【差异化】禁止千篇一律；边关/河流/海岸须在 description 中有所体现',
    '【输入 JSON 如下】',
    territoryBriefJson
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildSocietyWorkflowInputs(
  req: TerritorySocietyRequest,
  projectId: string
): Record<string, string> {
  const meta = parseTerritoryBriefMeta(req.territoryBriefJson)
  const brief = buildLlmBrief(req.config, req.territoryBriefJson)
  return {
    project_id: projectId,
    world_name: req.config.worldName,
    era: req.config.era,
    atmosphere: req.config.atmosphere.join('、'),
    scale: req.config.scale,
    climate: req.config.climate,
    city_count: String(
      meta.localLocationCount && meta.localLocationCount > 0
        ? meta.localLocationCount
        : req.config.cityCount
    ),
    include_landmarks: req.config.includeLandmarks ? 'true' : 'false',
    seed: String(req.config.seed ?? Date.now()),
    geological_years_ma: String(req.config.geologicalYearsMa ?? 80),
    generation_mode: 'territory_society',
    place_naming_style: normalizePlaceNamingStyle(req.config.placeNamingStyle),
    naming_style_hint: namingStyleBriefLine(req.config),
    cells_per_province_target: String(meta.cellsPerProvinceTarget ?? 30),
    local_location_count: String(meta.localLocationCount ?? 0),
    territory_json: req.territoryBriefJson,
    nations_outline_json: JSON.stringify(
      req.nations.map((n) => ({ id: n.id, name: n.name })),
      null,
      0
    ),
    creative_brief: brief
  }
}
