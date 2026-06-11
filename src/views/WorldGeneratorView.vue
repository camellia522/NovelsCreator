<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { WorldEngineCheckResponse } from '@/types/world-gen'
import { useRouter } from 'vue-router'
import MenuBar from '@/components/workspace/MenuBar.vue'
import NcIcon from '@/components/icons/NcIcon.vue'
import WorldMapCanvas from '@/components/world/WorldMapCanvas.vue'
import WorldMapEditor from '@/components/world/WorldMapEditor.vue'
import WorldMapFlat from '@/components/world/WorldMapFlat.vue'
import WorldLocationDetail from '@/components/world/WorldLocationDetail.vue'
import { useKnowledgeStore } from '@/stores/knowledge.store'
import { generateWorld, equirectDimensionsForScale, numPlatesForScale } from '@/utils/world-generator'
import { pinWorldGenMapRaster, resolveMapDataUrlForSave, useWorldMapPreviewImage } from '@/utils/world-map-display-url'
import type { SocietyGenerationResult } from '@/utils/world-territory-society'
import {
  applySocietyToPreview,
  countMergedSocietyDescriptions,
  fetchSocietyLlmPayloadBatched,
  hasPaintedTerritory,
  loadSocietyLlmBatchPrefs,
  mergeSocietyWithLlm,
  parseSocietyLlmPayload,
  saveSocietyLlmBatchPrefs,
  clampSocietyLlmBatchPrefs,
  SOCIETY_LLM_BATCH_SIZE_DEFAULT,
  SOCIETY_LLM_PARALLEL_DEFAULT,
  summarizeTerritories,
  type SocietyBatchDiagnostic,
  type SocietyLlmBatchPrefs
} from '@/utils/world-territory-society'
import { computeSocietyInWorker } from '@/utils/world-society-worker-client'
import { WORLDENGINE_OFFICIAL, WORLDENGINE_SCALE_PRESETS } from '@/utils/world-engine-official'
import { normalizeWorldSeed, randomWorldSeed } from '@/utils/world-seed'
import { cloneForIpc } from '@/utils/ipc-serialize'
import type { WorldLocation, WorldNation } from '@/types/project'
import type { WorldClimateMode, WorldGenConfig, WorldGenResult } from '@/types/world-gen'
import { PLACE_NAMING_STYLE_OPTIONS, placeNamingStyleLabel } from '@/utils/world-place-naming'
import { WIZARD_ATMOSPHERE_OPTIONS, WIZARD_ERA_OPTIONS, WIZARD_SCENE_OPTIONS, worldGenConfigFromKnowledge } from '@/utils/chapter-wizard-knowledge'

const router = useRouter()
const knowledge = useKnowledgeStore()

const step = ref(0)
const steps = ['基础设定', '地图参数', '地图编辑', '世界观生成', '预览与确认']

const eraOptions = [...WIZARD_ERA_OPTIONS]
const sceneOptions = [...WIZARD_SCENE_OPTIONS]
const atmosphereOptions = [...WIZARD_ATMOSPHERE_OPTIONS]
const scaleOptions = WORLDENGINE_SCALE_PRESETS.map((p) => ({
  id: p.id,
  label: p.label,
  desc: p.desc
}))
const climateOptions: { id: WorldClimateMode; label: string }[] = [
  { id: 'mixed', label: '混合气候带' },
  { id: 'temperate', label: '温带为主' },
  { id: 'cold', label: '寒带/北境' },
  { id: 'tropical', label: '热带/南方' }
]

const config = ref<WorldGenConfig>({
  worldName: '新世界',
  era: '架空',
  scene: '大陆',
  atmosphere: ['史诗'],
  scale: 'continent',
  climate: 'mixed',
  cityCount: 8,
  includeLandmarks: true,
  placeNamingStyle: 'chinese',
  numPlates: 10
})

const preview = ref<WorldGenResult | null>(null)
const applying = ref(false)
const generating = ref(false)
const genError = ref('')
const genStatus = ref('')
const societyDone = ref(false)
const societySource = ref('')
const societyError = ref('')
/** 仅本地选址阶段全屏遮罩；大模型等待时不挡操作 */
const societyOverlayBlocking = ref(false)
const previewSelectedLocationId = ref<string | null>(null)
const engineStatus = ref<WorldEngineCheckResponse | null>(null)
const societyLlmPrefs = ref<SocietyLlmBatchPrefs>(loadSocietyLlmBatchPrefs())
const hasSocietyLlmApi = computed(() => Boolean(window.novelsCreator?.world?.generateSociety))

watch(
  societyLlmPrefs,
  (prefs) => {
    saveSocietyLlmBatchPrefs(clampSocietyLlmBatchPrefs(prefs))
  },
  { deep: true }
)

const engineHint = computed(() => {
  if (!engineStatus.value) return '正在检测 WorldEngine…'
  if (engineStatus.value.installed) {
    return `官方 WorldEngine v${engineStatus.value.worldengineVersion ?? '?'}（${engineStatus.value.pythonPath}）`
  }
  return `未检测到官方包：${engineStatus.value.error ?? '请运行 scripts/setup-worldengine.ps1'}（将使用 TS 回退）`
})

const gridHint = computed(() => {
  const { width, height } = equirectDimensionsForScale(config.value.scale)
  const plates = config.value.numPlates ?? numPlatesForScale(config.value.scale)
  return `${width}×${height} · WorldEngine Step.full() · -q ${plates}（官方 seed 0–${WORLDENGINE_OFFICIAL.seedMax}）`
})

watch(
  () => config.value.scale,
  (scale) => {
    config.value.numPlates = numPlatesForScale(scale)
  }
)

onMounted(async () => {
  await knowledge.loadIfEmpty()
  if (window.novelsCreator?.world?.checkEngine) {
    engineStatus.value = await window.novelsCreator.world.checkEngine()
  }
  if (knowledge.doc) {
    const fromKnowledge = worldGenConfigFromKnowledge(knowledge.doc)
    if (fromKnowledge.worldName) config.value.worldName = fromKnowledge.worldName
    if (fromKnowledge.era) config.value.era = fromKnowledge.era
    if (fromKnowledge.scene) config.value.scene = fromKnowledge.scene
    if (fromKnowledge.scenePlace) config.value.scenePlace = fromKnowledge.scenePlace
    if (fromKnowledge.atmosphere?.length) config.value.atmosphere = [...fromKnowledge.atmosphere]
    if (fromKnowledge.scale) config.value.scale = fromKnowledge.scale
    if (fromKnowledge.climate) config.value.climate = fromKnowledge.climate
    if (fromKnowledge.placeNamingStyle) config.value.placeNamingStyle = fromKnowledge.placeNamingStyle
    if (fromKnowledge.seed != null) config.value.seed = normalizeWorldSeed(fromKnowledge.seed)
    config.value.numPlates = numPlatesForScale(config.value.scale)
  }
})

const previewRules = computed(() => preview.value?.worldRules ?? '')
const mapPreview = useWorldMapPreviewImage(preview)
const previewMapImageUrl = computed(() => mapPreview.displayUrl.value)
const mapLoadError = computed(() => mapPreview.loadError.value)
/** 向导内统一贴图：优先已固定的生成底图（与地图编辑卫星图同源） */
const wizardMapImageUrl = computed(
  () => preview.value?.mapImageDataUrl ?? previewMapImageUrl.value
)
const wizardMapImageReady = computed(
  () => Boolean(wizardMapImageUrl.value) && !mapLoadError.value
)

const territorySummaries = computed(() => {
  if (!preview.value?.map.nations?.length) return []
  return summarizeTerritories(preview.value.map, preview.value.map.nations, config.value)
})

const previewSelectedLocation = computed(
  () => preview.value?.locations.find((l) => l.id === previewSelectedLocationId.value) ?? null
)

function syncPreviewFromEditor(): void {
  if (!preview.value) return
  preview.value.nations = preview.value.map.nations ?? preview.value.nations
}

/**
 * 社会层大模型润色：首批单独（世界背景+国家），其余批并行请求 Dify。
 */
async function fetchSocietyLlmPayload(
  territoryBriefJson: string,
  nations: WorldNation[],
  localLocations: WorldLocation[],
  onProgress?: (msg: string) => void
): Promise<Partial<SocietyGenerationResult> | null> {
  const api = window.novelsCreator?.world?.generateSociety
  if (!api) return null

  return fetchSocietyLlmPayloadBatched(
    territoryBriefJson,
    localLocations,
    {
      async runBatch(brief: string) {
        const llmRes = await api(
          cloneForIpc({
            config: config.value,
            nations,
            territoryBriefJson: brief
          })
        )
        if (!llmRes.ok) {
          return { parsed: null, error: llmRes.error ?? '大模型调用失败' }
        }
        const parsed = parseSocietyLlmPayload(llmRes)
        if (!parsed?.locations?.length && !parsed?.nations?.length && !parsed?.worldRules?.trim()) {
          return { parsed: null, error: '本批未解析到 nations/locations/world_rules' }
        }
        return { parsed }
      }
    },
    societyLlmPrefs.value,
    onProgress
  )
}

function formatSocietyBatchDiagNote(diags: SocietyBatchDiagnostic[] | undefined): string {
  if (!diags?.length) return ''
  const failed = diags.filter((d) => d.error)
  const short = diags.filter((d) => !d.error && d.returned < d.expected)
  const parts: string[] = []
  if (failed.length) {
    parts.push(`失败 ${failed.length} 批（END/PARSE 无有效 JSON）`)
  }
  if (short.length) {
    parts.push(`缺条：${short.map((d) => `第${d.batchIndex + 1}批${d.returned}/${d.expected}`).join('、')}`)
  }
  if (!parts.length) return ''
  return `；${parts.join('；')}（见 dify/world/DIFY-END-NODE-CHECKLIST.md）`
}

async function runSocietyGeneration(): Promise<void> {
  if (!preview.value) return
  generating.value = true
  societyOverlayBlocking.value = true
  societyError.value = ''
  genStatus.value = '正在根据领土生成国家设定与城市…'
  await nextTick()
  try {
    if (!preview.value.map.nations) preview.value.map.nations = []
    const workerOut = await computeSocietyInWorker(preview.value, config.value)
    societyOverlayBlocking.value = false
    preview.value.map = workerOut.map
    preview.value.nations = workerOut.map.nations ?? preview.value.nations
    const local = workerOut.local
    config.value.cityCount = local.locations.length
    let merged = local
    let sourceLabel = '本地规则'

    if (window.novelsCreator?.world) {
      try {
        const parsed = await fetchSocietyLlmPayload(
          workerOut.territoryBriefJson,
          preview.value.map.nations ?? [],
          local.locations,
          (msg) => {
            genStatus.value = `${msg}（等待期间界面可继续操作）`
          }
        )
        if (parsed?.locations?.length || parsed?.nations?.length || parsed?.worldRules?.trim()) {
          merged = mergeSocietyWithLlm(local, parsed, preview.value.map)
          const { polished, total } = countMergedSocietyDescriptions(local.locations, merged.locations)
          const llmReturned = parsed.locations?.length ?? 0
          const diagNote = formatSocietyBatchDiagNote(parsed.batchDiagnostics)
          const prefs = societyLlmPrefs.value
          const batchNote =
            total > prefs.batchSize
              ? `，${Math.ceil(total / prefs.batchSize)} 批（每批≤${prefs.batchSize}，并行 ${prefs.parallelBatches}）`
              : ''
          sourceLabel =
            polished >= total
              ? `本地选址 + 大模型润色（${total} 座${batchNote}；坐标仍用本地）`
              : `本地选址 + 大模型润色（${polished}/${total} 座城有文案，对齐 ${llmReturned} 条${batchNote}${diagNote}；可点「重新生成」重试未命中批次）`
        } else {
          const failedBatches = parsed?.batchDiagnostics?.filter((d) => d.error).length ?? 0
          const firstErr = parsed?.batchDiagnostics?.find((d) => d.error)?.error
          const errHint = firstErr
            ? ` 首条：${firstErr.length > 160 ? `${firstErr.slice(0, 160)}…` : firstErr}`
            : ''
          sourceLabel =
            failedBatches > 0
              ? `本地选址 + 文案未润色（${failedBatches} 批 Dify 无有效 JSON；END 须接 PARSE 真实输出，勿用 [] 占位${errHint}）`
              : '本地选址（大模型 JSON 未含 nations/locations/world_rules，请检查 PARSE→END 与 W2S 结构化输出）'
        }
      } catch (llmErr) {
        const msg = llmErr instanceof Error ? llmErr.message : String(llmErr)
        sourceLabel = msg.includes('工作流未返回')
          ? `本地选址 + 文案未润色（${msg}）`
          : `本地规则（模型调用失败：${msg}）`
      }
    }

    applySocietyToPreview(preview.value, merged)
    societySource.value = sourceLabel
    societyDone.value = true
  } catch (e) {
    societyError.value = e instanceof Error ? e.message : String(e)
    societyDone.value = false
  } finally {
    generating.value = false
    societyOverlayBlocking.value = false
    genStatus.value = ''
  }
}

function toggleAtmosphere(tag: string): void {
  const i = config.value.atmosphere.indexOf(tag)
  if (i >= 0) {
    config.value.atmosphere.splice(i, 1)
  } else if (config.value.atmosphere.length < 3) {
    config.value.atmosphere.push(tag)
  }
}

async function buildPreview(): Promise<void> {
  generating.value = true
  genError.value = ''
  genStatus.value = engineStatus.value?.installed
    ? '正在调用官方 WorldEngine 生成地图（大陆级约 2–3 分钟）…'
    : '正在本地生成地图…'
  await nextTick()
  try {
    const generated = await generateWorld({ ...config.value })
    preview.value = generated ? await pinWorldGenMapRaster(generated) : null
  } catch (e) {
    preview.value = null
    genError.value = e instanceof Error ? e.message : String(e)
  } finally {
    generating.value = false
    genStatus.value = ''
  }
}

async function nextStep(): Promise<void> {
  if (step.value === 1) {
    await buildPreview()
    if (genError.value || !preview.value) return
    societyDone.value = false
    step.value = 2
    return
  }
  if (step.value === 2) {
    if (!preview.value || !hasPaintedTerritory(preview.value.map)) {
      genError.value = '请先在地图上为国家涂抹领土（画笔模式），并至少创建一个国家'
      return
    }
    if (!preview.value.map.nations?.length) {
      genError.value = '请侧栏添加至少一个国家'
      return
    }
    genError.value = ''
    step.value = 3
    return
  }
  if (step.value === 3) {
    if (!societyDone.value) {
      await runSocietyGeneration()
      if (societyError.value) return
    }
    step.value = 4
    return
  }
  if (step.value < steps.length - 1) step.value++
}

function prevStep(): void {
  if (step.value > 0) step.value--
}

async function regenerate(): Promise<void> {
  config.value.seed = randomWorldSeed()
  societyDone.value = false
  await buildPreview()
}

function inferScenePlaceFromLocations(locations: WorldLocation[]): string {
  const capital = locations.find((l) => l.type === 'capital')
  if (capital?.name) return capital.name
  const city = locations.find((l) => l.type === 'city')
  return city?.name ?? ''
}

async function applyToProject(): Promise<void> {
  if (!preview.value) await buildPreview()
  if (!preview.value) return
  applying.value = true
  try {
    const mapImageDataUrl =
      (preview.value.mapImageDataUrl?.startsWith('data:image/png;base64,')
        ? preview.value.mapImageDataUrl
        : null) ??
      (await resolveMapDataUrlForSave(
        preview.value.mapImageDataUrl,
        preview.value.mapImageFilePath
      )) ??
      (wizardMapImageUrl.value
        ? await resolveMapDataUrlForSave(wizardMapImageUrl.value, null)
        : null)
    if (preview.value.map.hasRasterImage && !mapImageDataUrl) {
      genError.value = '无法读取地图贴图，请重新生成后再应用到项目'
      return
    }
    const result: WorldGenResult = mapImageDataUrl
      ? { ...preview.value, mapImageDataUrl, mapImageFilePath: undefined }
      : preview.value
    knowledge.applyGeneratedWorld(result, {
      era: config.value.era,
      scene: config.value.scene,
      scenePlace: config.value.scenePlace?.trim() || inferScenePlaceFromLocations(result.locations),
      atmosphere: config.value.atmosphere,
      scale: config.value.scale,
      climate: config.value.climate,
      placeNamingStyle: config.value.placeNamingStyle,
      seed: config.value.seed
    })
    await knowledge.save()
    await router.push({ name: 'workspace' })
  } finally {
    applying.value = false
  }
}

function close(): void {
  router.push({ name: 'workspace' })
}
</script>

<template>
  <div class="wizard-page">
    <MenuBar @close-project="close" />

    <header class="wizard-head">
      <h1>世界观生成器</h1>
      <button type="button" class="nc-btn close-bar" @click="close">
        <NcIcon name="close" :size="16" />
        关闭
      </button>
    </header>

    <nav class="steps">
      <span
        v-for="(label, i) in steps"
        :key="label"
        class="step"
        :class="{ active: step === i, done: step > i }"
      >
        <NcIcon v-if="step > i" name="circle-dot" :size="10" class="step-mark done-mark" />
        <NcIcon v-else-if="step === i" name="circle-dot" :size="10" class="step-mark active-mark" />
        <NcIcon v-else name="circle" :size="10" class="step-mark" />
        {{ label }}
      </span>
    </nav>

    <main class="wizard-body nc-card">
      <div
        v-if="generating && societyOverlayBlocking"
        class="gen-overlay"
      >
        <div class="gen-spinner" aria-hidden="true" />
        <p class="gen-overlay-title">生成中…</p>
        <p class="gen-overlay-status">{{ genStatus || '正在生成地势贴图，请稍候…' }}</p>
      </div>

      <!-- Step 0 -->
      <div v-show="step === 0" class="step-pane">
        <h3>基础设定</h3>
        <label class="field">
          <span>世界名称</span>
          <input v-model="config.worldName" class="nc-input" />
        </label>
        <div class="tags">
          <span class="label">时代背景</span>
          <button
            v-for="o in eraOptions"
            :key="o"
            type="button"
            class="tag"
            :class="{ on: config.era === o }"
            @click="config.era = o"
          >
            {{ o }}
          </button>
        </div>
        <div class="tags">
          <span class="label">主要场景类型</span>
          <button
            v-for="o in sceneOptions"
            :key="o"
            type="button"
            class="tag"
            :class="{ on: config.scene === o }"
            @click="config.scene = o"
          >
            {{ o }}
          </button>
        </div>
        <label class="field">
          <span>场景名称（可选）</span>
          <input v-model="config.scenePlace" class="nc-input" placeholder="如平京、青云宗；章节向导将同步此字段" />
        </label>
        <div class="tags">
          <span class="label">氛围标签（最多 3 个）</span>
          <button
            v-for="o in atmosphereOptions"
            :key="o"
            type="button"
            class="tag"
            :class="{ on: config.atmosphere.includes(o) }"
            @click="toggleAtmosphere(o)"
          >
            {{ o }}
          </button>
        </div>
        <div class="tags naming-style-tags">
          <span class="label">地名与国名风格</span>
          <button
            v-for="o in PLACE_NAMING_STYLE_OPTIONS"
            :key="o.id"
            type="button"
            class="tag naming-style-tag"
            :class="{ on: config.placeNamingStyle === o.id }"
            :title="o.desc"
            @click="config.placeNamingStyle = o.id"
          >
            {{ o.label }}
            <span class="scale-desc">{{ o.desc }}</span>
          </button>
        </div>
        <p class="hint">
          本地生成占位区划名；若配置 Dify 社会层，将按所选风格润色<strong>国名</strong>与<strong>城市名</strong>（坐标不变）。混合模式按国家轮换中式/西式/日式/奇幻。
        </p>
        <p class="hint">生成结果将写入 knowledge/world.json、map.json、<strong>map.png（与「地图编辑」中卫星底图相同）</strong>、locations.json。地图地势可全程本地；社会层文案可选 Dify。</p>
      </div>

      <!-- Step 1 -->
      <div v-show="step === 1" class="step-pane">
        <h3>地图参数</h3>
        <div class="tags scale-tags">
          <span class="label">世界尺度</span>
          <button
            v-for="o in scaleOptions"
            :key="o.id"
            type="button"
            class="tag scale-tag"
            :class="{ on: config.scale === o.id }"
            @click="config.scale = o.id"
          >
            {{ o.label }}
            <span class="scale-desc">{{ o.desc }}</span>
          </button>
        </div>
        <p class="hint">{{ engineHint }}</p>
        <p class="hint">当前尺度：{{ gridHint }}。</p>
        <div class="tags">
          <span class="label">气候分布</span>
          <button
            v-for="o in climateOptions"
            :key="o.id"
            type="button"
            class="tag"
            :class="{ on: config.climate === o.id }"
            @click="config.climate = o.id"
          >
            {{ o.label }}
          </button>
        </div>
        <label class="field">
          <span>板块数量（WorldEngine -q，官方范围 1–100）</span>
          <input
            v-model.number="config.numPlates"
            class="nc-input"
            type="number"
            :min="WORLDENGINE_OFFICIAL.platesMin"
            :max="WORLDENGINE_OFFICIAL.platesMax"
            step="1"
          />
        </label>
        <p v-if="genError" class="hint error-hint">{{ genError }}</p>
        <p class="hint">
          算法与
          <a href="https://github.com/Mindwerks/worldengine" target="_blank" rel="noopener">Mindwerks/worldengine</a>
          一致：板块 → 温度/降水 → 侵蚀 → 水文 → Holdridge 生物群系 → 冰盖 → 卫星图 → 贴球。
        </p>
      </div>

      <!-- Step 2: 地图编辑 -->
      <div v-show="step === 2" class="step-pane edit-pane">
        <div class="preview-head">
          <h3>地图编辑</h3>
          <button type="button" class="nc-btn nc-btn-sm" :disabled="generating" @click="regenerate">
            {{ generating ? '生成中…' : '换一张地图' }}
          </button>
        </div>
        <p v-if="generating && societyOverlayBlocking" class="hint loading-hint">正在重新生成…</p>
        <p v-else-if="genError" class="hint error-hint">{{ genError }}</p>
        <p v-else-if="mapLoadError" class="hint error-hint">贴图加载失败：{{ mapLoadError }}</p>
        <p v-else-if="preview && !wizardMapImageReady" class="hint loading-hint">贴图加载中…</p>
        <p v-else-if="preview" class="hint">
          在卫星底图上框选六边形，标注国家领土、城市发展与地区设定；完成后进入「世界观生成」由系统/大模型生成国家文案与城市。保存到项目的 map.png 即此卫星底图。
        </p>
        <WorldMapEditor
          v-if="preview && wizardMapImageReady && !generating"
          class="wizard-map-editor"
          :map="preview.map"
          :locations="preview.locations"
          :image-url="wizardMapImageUrl"
          :image-file-path="preview.mapImageFilePath"
        />
        <div v-else-if="!preview && !generating" class="preview-empty">
          <p class="hint">请先在「地图参数」步骤生成地图。</p>
          <button type="button" class="nc-btn" @click="step = 1">返回地图参数</button>
        </div>
      </div>

      <!-- Step 3: 世界观生成 -->
      <div v-show="step === 3" class="step-pane society-pane">
        <div class="preview-head">
          <h3>世界观生成</h3>
          <button
            type="button"
            class="nc-btn nc-btn-sm"
            :disabled="generating || !preview"
            @click="runSocietyGeneration"
          >
            {{ generating ? '生成中…' : societyDone ? '重新生成' : '生成国家与城市' }}
          </button>
        </div>
        <p v-if="!preview" class="hint">请先在「地图参数」生成地图并完成「地图编辑」。</p>
        <template v-else>
          <p class="hint">
            将按你框选领土的<strong>温度、湿度、地形、发展度、季风</strong>与项目设定（时代「{{ config.era }}」、氛围
            {{ config.atmosphere.join('、') }}、气候 {{ config.climate }}）按领土与行省区划<strong>自动计算</strong>聚落数量
            <template v-if="societyDone && preview">（本次 {{ preview.locations.length }} 处）</template>
            ；地名与国名风格：<strong>{{ placeNamingStyleLabel(config.placeNamingStyle ?? 'chinese') }}</strong>；生成后<strong>均可手动修改</strong>。
          </p>
          <div v-if="hasSocietyLlmApi" class="llm-speed field-row">
            <label class="field inline">
              <span>大模型每批城市数</span>
              <select
                v-model.number="societyLlmPrefs.batchSize"
                class="nc-input nc-input-sm"
                :disabled="generating"
              >
                <option v-for="n in [6, 8, 10, 12, 16, 20, 24]" :key="n" :value="n">
                  {{ n }} 座/批
                </option>
              </select>
            </label>
            <label class="field inline">
              <span>并行批次数</span>
              <select
                v-model.number="societyLlmPrefs.parallelBatches"
                class="nc-input nc-input-sm"
                :disabled="generating"
              >
                <option v-for="n in [1, 2, 3, 4, 5]" :key="n" :value="n">
                  {{ n }} 路
                </option>
              </select>
            </label>
            <p class="hint speed-hint">
              默认每批 {{ SOCIETY_LLM_BATCH_SIZE_DEFAULT }} 座、并行 {{ SOCIETY_LLM_PARALLEL_DEFAULT }} 路（首批单独含世界背景，其余批同时请求）。
              城市多时可试 16–20 座/批 + 3–4 路并行；若 Dify 经常缺条，改回 8–12 座或并行 1 路。
            </p>
          </div>
          <p v-if="generating && genStatus && !societyOverlayBlocking" class="hint loading-hint">
            {{ genStatus }}
          </p>
          <p v-if="societyError" class="hint error-hint">{{ societyError }}</p>
          <p v-else-if="societyDone && societySource" class="hint loading-hint">{{ societySource }}</p>
          <ul v-if="territorySummaries.length && !societyDone" class="territory-stats">
            <li v-for="s in territorySummaries" :key="s.nationId">
              <strong>{{ s.name }}</strong> — {{ s.developmentTier }} · 发展均{{ s.avgDevelopment }} ·
              {{ s.environmentalProfile }}
            </li>
          </ul>
          <WorldMapEditor
            v-if="societyDone && wizardMapImageReady"
            class="wizard-map-editor society-edit-map"
            :map="preview.map"
            :locations="preview.locations"
            :image-url="wizardMapImageUrl"
            :image-file-path="preview.mapImageFilePath"
            nation-list-mode="edit"
            :place-naming-style="config.placeNamingStyle"
            @dirty="syncPreviewFromEditor"
          />
          <p v-else-if="!societyDone" class="hint">
            点击「生成国家与城市」或进入下一步自动生成。生成后在右侧<strong>点击国家</strong>即可在文本框修改国名、政体、文化；点击地图上的点或城市列表可改城市名。
          </p>
        </template>
      </div>

      <!-- Step 4: 预览与确认 -->
      <div v-show="step === 4" class="step-pane preview-pane">
        <div class="preview-head">
          <h3>预览</h3>
          <button type="button" class="nc-btn nc-btn-sm" :disabled="generating" @click="regenerate">
            {{ generating ? '生成中…' : '换一张地图' }}
          </button>
        </div>
        <p v-if="generating" class="hint loading-hint">正在生成地势贴图，请稍候…</p>
        <p v-else-if="genError" class="hint error-hint">{{ genError }}</p>
        <p v-else-if="mapLoadError" class="hint error-hint">贴图加载失败：{{ mapLoadError }}</p>
        <p v-else-if="preview && !wizardMapImageReady" class="hint loading-hint">贴图加载中…</p>
        <div v-else-if="!preview && !generating" class="preview-empty">
          <p class="hint">暂无地图预览。</p>
          <button type="button" class="nc-btn primary" @click="buildPreview">重新生成</button>
        </div>
        <div v-if="preview && !generating" class="preview-grid">
          <div class="map-col">
            <p class="map-step-label">① 平面世界地图（生成源）</p>
            <WorldMapFlat
              class="flat-primary"
              :map="preview.map"
              :locations="preview.locations"
              :image-url="wizardMapImageUrl"
              :interactive="true"
              :selected-location-id="previewSelectedLocationId"
              @select="previewSelectedLocationId = $event"
            />
            <p class="map-step-label">② 球面贴图预览（由上图卷曲）</p>
            <WorldMapCanvas
              :map="preview.map"
              :locations="preview.locations"
              :image-url="wizardMapImageUrl"
              :selected-location-id="previewSelectedLocationId"
              :interactive="true"
              :rotatable="true"
              @select="previewSelectedLocationId = $event"
            />
            <WorldLocationDetail
              :location="previewSelectedLocation"
              :nations="preview.nations"
            />
          </div>
          <div class="side-panel">
            <p class="hint">
              上图 = 「地图编辑」中的 WorldEngine 卫星生物群系底图（顶北底南），写入项目后即为 knowledge/map.png。下图 = 同一张图贴到球面。点击城市圆点可在下方查看简介与发展设定。
            </p>
            <ul class="map-stats">
              <li>分辨率 {{ preview.map.renderWidth }}×{{ preview.map.renderHeight }}</li>
              <li>国家 {{ preview.nations.length }} · 城市 {{ preview.locations.length }}</li>
              <li>六边形格 {{ preview.map.hexGrid?.cells.length ?? 0 }}</li>
            </ul>
          </div>
        </div>
        <pre v-if="previewRules" class="rules">{{ previewRules }}</pre>
      </div>
    </main>

    <footer class="wizard-foot">
      <button type="button" class="nc-btn" :disabled="step === 0" @click="prevStep">上一步</button>
      <div class="spacer" />
      <button
        v-if="step < steps.length - 1"
        type="button"
        class="nc-btn primary"
        :disabled="generating"
        @click="nextStep"
      >
        {{ generating ? '生成中…' : '下一步' }}
      </button>
      <button
        v-else
        type="button"
        class="nc-btn primary"
        :disabled="applying || generating || !preview"
        @click="applyToProject"
      >
        {{ applying ? '写入中…' : '应用到项目' }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.wizard-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--nc-bg-base);
}
.wizard-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--nc-border);
}
.wizard-head h1 {
  margin: 0;
  font-size: 16px;
}
.close-bar {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.steps {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  font-size: 13px;
  color: var(--nc-text-muted);
  border-bottom: 1px solid var(--nc-border);
}
.step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.step-mark {
  color: var(--nc-icon);
}
.active-mark {
  color: var(--nc-accent);
}
.done-mark {
  color: var(--nc-success);
}
.step.active {
  color: var(--nc-accent);
}
.step.done {
  color: var(--nc-text-primary);
}
.wizard-body {
  flex: 1;
  margin: 16px;
  padding: 16px;
  overflow: auto;
  position: relative;
}
.gen-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(10, 12, 18, 0.82);
  border-radius: inherit;
}
.gen-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(255, 255, 255, 0.15);
  border-top-color: var(--nc-accent);
  border-radius: 50%;
  animation: gen-spin 0.9s linear infinite;
}
.gen-overlay-title {
  margin: 0;
  font-size: 15px;
  color: var(--nc-text-primary);
}
.gen-overlay-status {
  margin: 0;
  max-width: 420px;
  text-align: center;
  font-size: 12px;
  color: var(--nc-text-muted);
  line-height: 1.5;
}
@keyframes gen-spin {
  to {
    transform: rotate(360deg);
  }
}
.step-pane h3 {
  margin: 0 0 12px;
  font-size: 14px;
}
.field {
  display: grid;
  gap: 4px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.tags {
  margin-bottom: 12px;
}
.label {
  font-size: 12px;
  color: var(--nc-text-muted);
  margin-right: 6px;
  display: inline-block;
  margin-bottom: 6px;
}
.tag {
  padding: 4px 10px;
  margin: 0 4px 4px 0;
  border-radius: 4px;
  border: 1px solid var(--nc-border);
  background: var(--nc-bg-base);
  color: var(--nc-text-muted);
  font-size: 12px;
  cursor: pointer;
}
.tag.on {
  border-color: var(--nc-accent);
  color: var(--nc-text-primary);
}
.scale-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.scale-tag {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 100px;
}
.scale-desc {
  font-size: 10px;
  color: var(--nc-text-muted);
  margin-top: 2px;
}
.tag.on .scale-desc {
  color: var(--nc-text-muted);
}
.check {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  margin-bottom: 8px;
}
.hint {
  font-size: 11px;
  color: var(--nc-text-muted);
  line-height: 1.5;
}
.society-pane {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.territory-stats {
  margin: 0;
  padding-left: 1.2em;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.llm-speed.field-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  align-items: flex-end;
  margin: 8px 0 4px;
}
.llm-speed .field.inline {
  margin: 0;
  min-width: 140px;
}
.llm-speed .field.inline span {
  display: block;
  font-size: 11px;
  color: var(--nc-text-muted);
  margin-bottom: 4px;
}
.llm-speed .speed-hint {
  flex: 1 1 100%;
  margin: 0;
  font-size: 11px;
}
.society-result {
  max-height: min(50vh, 420px);
  overflow: auto;
  padding: 10px;
  border: 1px solid var(--nc-border);
  border-radius: 8px;
  background: var(--nc-bg-base);
}
.society-result h4 {
  margin: 12px 0 6px;
  font-size: 13px;
}
.society-result h4:first-child {
  margin-top: 0;
}
.nation-blurbs {
  margin: 0;
  padding: 0;
  list-style: none;
}
.nation-blurbs li {
  margin-bottom: 10px;
  font-size: 12px;
}
.nation-blurbs p {
  margin: 4px 0 0;
  color: var(--nc-text-muted);
  line-height: 1.45;
}
.loc-list {
  margin: 0;
  padding-left: 1.2em;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.edit-pane {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wizard-map-editor {
  flex: 1;
  min-height: min(72vh, 520px);
}
.wizard-map-editor :deep(.map-editor) {
  min-height: min(72vh, 520px);
}
.wizard-map-editor :deep(.map-stage) {
  max-height: min(72vh, 480px);
}
.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.preview-grid {
  display: grid;
  grid-template-columns: minmax(280px, 420px) 1fr;
  gap: 16px;
  align-items: start;
}
.map-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.map-step-label {
  margin: 0;
  font-size: 11px;
  color: var(--nc-text-muted);
}
.flat-primary {
  border: 1px solid var(--nc-accent);
}
.side-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 480px;
  overflow: auto;
}
.nation-list h4,
.loc-list h4 {
  margin: 0 0 6px;
  font-size: 13px;
}
.nation-card {
  padding: 8px 10px;
  margin-bottom: 6px;
  border: 1px solid var(--nc-border);
  border-radius: 8px;
  background: var(--nc-bg-elevated);
  font-size: 12px;
}
.nation-card strong {
  display: block;
  font-size: 13px;
}
.loc-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 420px;
  overflow: auto;
}
.loc-card {
  padding: 10px;
  border: 1px solid var(--nc-border);
  border-radius: 8px;
  background: var(--nc-bg-base);
  font-size: 12px;
}
.loc-card strong {
  display: block;
  margin-bottom: 2px;
}
.meta {
  color: var(--nc-text-muted);
  font-size: 11px;
}
.loc-card p {
  margin: 6px 0 0;
  line-height: 1.45;
  color: var(--nc-text-primary);
}
.rules {
  margin-top: 12px;
  padding: 12px;
  background: var(--nc-bg-base);
  border-radius: 6px;
  font-size: 12px;
  white-space: pre-wrap;
  line-height: 1.5;
}
.loading-hint {
  color: var(--nc-accent);
}
.error-hint {
  color: #e07070;
}
.wizard-foot {
  display: flex;
  padding: 12px 16px;
  border-top: 1px solid var(--nc-border);
}
.spacer {
  flex: 1;
}
.primary {
  background: var(--nc-accent);
  color: #fff;
}
.nc-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 240px;
  border: 1px dashed var(--nc-border);
  border-radius: 8px;
}
.nc-btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}
.map-stats {
  margin: 0;
  padding-left: 1.2em;
  font-size: 12px;
  color: var(--nc-text-muted);
}
</style>
