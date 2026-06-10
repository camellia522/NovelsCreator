<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import TagsInput from '@/components/forms/TagsInput.vue'
import PanelSaveBar from '@/components/forms/PanelSaveBar.vue'
import SettingTagGroup from '@/components/forms/SettingTagGroup.vue'
import LocationPickerModal from '@/components/world/LocationPickerModal.vue'
import AppearedCharactersPane from '@/components/knowledge/AppearedCharactersPane.vue'
import MonacoFieldEditor from '@/components/editor/MonacoFieldEditor.vue'
import NcIconButton from '@/components/icons/NcIconButton.vue'
import { useKnowledgeStore } from '@/stores/knowledge.store'
import { useMemoryStore } from '@/stores/memory.store'
import { useUiStore, type KnowledgeTabId } from '@/stores/ui.store'
import { useDifyStore } from '@/stores/dify.store'
import {
  readAtmosphereTagsFromWorld,
  readContentTaboosFromWorld,
  formatAtmosphereTags,
  formatContentTaboos,
  buildCompiledSettingConstraints,
  refreshWorldSettingConstraints,
  syncMapFromWorld,
  WIZARD_ATMOSPHERE_OPTIONS,
  WIZARD_CHARACTER_ROLE_OPTIONS,
  WIZARD_ERA_OPTIONS,
  WIZARD_SCENE_OPTIONS,
  WORLD_MAGIC_CONSTRAINT_OPTIONS,
  WORLD_SETTING_DEFAULTS,
  WORLD_GENRE_OPTIONS,
  WORLD_TECH_OPTIONS,
  WORLD_CONFLICT_OPTIONS,
  WORLD_NARRATIVE_STYLE_OPTIONS,
  WORLD_SOCIAL_STRUCTURE_OPTIONS,
  WORLD_POLITICAL_TONE_OPTIONS,
  WORLD_WARFARE_STYLE_OPTIONS,
  WORLD_ECONOMIC_BASE_OPTIONS,
  WORLD_PACING_OPTIONS,
  WORLD_PROSE_REGISTER_OPTIONS,
  WORLD_CONTENT_TABOO_OPTIONS,
  MAP_SCALE_UI_OPTIONS,
  WORLD_CLIMATE_UI_OPTIONS,
  pickMagicConstraint,
  mapScaleLabel
} from '@/utils/chapter-wizard-knowledge'
import { PLACE_NAMING_STYLE_OPTIONS } from '@/utils/world-place-naming'
import type { PlaceNamingStyle, WorldClimateMode, WorldScale } from '@/types/world-gen'

const router = useRouter()
const knowledge = useKnowledgeStore()
const memory = useMemoryStore()
const ui = useUiStore()
const dify = useDifyStore()
const { doc, selectedCharacterId, dirty, saving, loading, error, mapImageFilePath } =
  storeToRefs(knowledge)
const tab = ref<KnowledgeTabId>('world')

const pendingAppearedCount = computed(
  () => (memory.doc?.appearedCharacters ?? []).filter((e) => !e.promoted).length
)

onMounted(async () => {
  await memory.load()
  const req = ui.consumeKnowledgeTabRequest()
  if (req) tab.value = req
})

watch(
  () => ui.knowledgeTabRequest,
  () => {
    const req = ui.consumeKnowledgeTabRequest()
    if (req) tab.value = req
  }
)
const locationPickerOpen = ref(false)

function openWorldMapEdit(): void {
  void ui.openWorldMapEdit()
}

const selectedChar = computed(() =>
  selectedCharacterId.value ? knowledge.getCharacter(selectedCharacterId.value) : undefined
)

const charLocation = computed(() =>
  selectedChar.value?.locationId ? knowledge.getLocation(selectedChar.value.locationId) : undefined
)

const locationTypeLabel: Record<string, string> = {
  capital: '都城',
  city: '城市',
  town: '城镇',
  village: '村落',
  fortress: '要塞',
  landmark: '地标'
}

const charAtmosphere = computed({
  get: () => (doc.value ? readAtmosphereTagsFromWorld(doc.value.world) : []),
  set: (tags: string[]) => {
    if (!doc.value) return
    doc.value.world.atmosphere = formatAtmosphereTags(tags)
    onWorldSettingChange()
  }
})

const charMagicConstraint = computed<string>({
  get: () =>
    doc.value ? pickMagicConstraint(doc.value.world.magicConstraint) : WORLD_SETTING_DEFAULTS.magicConstraint,
  set: (v: string) => {
    if (!doc.value) return
    doc.value.world.magicConstraint = v
    onWorldSettingChange()
  }
})

const charContentTaboos = computed({
  get: () => (doc.value ? readContentTaboosFromWorld(doc.value.world) : []),
  set: (tags: string[]) => {
    if (!doc.value) return
    doc.value.world.contentTaboos = formatContentTaboos(tags)
    onWorldSettingChange()
  }
})

const compiledConstraints = computed(() =>
  doc.value ? buildCompiledSettingConstraints(doc.value.world, doc.value.map) : ''
)

const mapScaleValue = computed<WorldScale>({
  get: () =>
    (doc.value?.world.mapScale ?? doc.value?.world.worldScale ?? WORLD_SETTING_DEFAULTS.mapScale) as WorldScale,
  set: (v: WorldScale) => {
    if (!doc.value) return
    doc.value.world.mapScale = v
    doc.value.world.worldScale = v
    onWorldSettingChange()
  }
})

const worldClimate = computed<WorldClimateMode>({
  get: () => (doc.value?.world.climate as WorldClimateMode) || WORLD_SETTING_DEFAULTS.climate,
  set: (v: WorldClimateMode) => {
    if (!doc.value) return
    doc.value.world.climate = v
    onWorldSettingChange()
  }
})

const placeNamingStyle = computed<PlaceNamingStyle>({
  get: () =>
    (doc.value?.world.placeNamingStyle as PlaceNamingStyle) || WORLD_SETTING_DEFAULTS.placeNamingStyle,
  set: (v: PlaceNamingStyle) => {
    if (!doc.value) return
    doc.value.world.placeNamingStyle = v
    onWorldSettingChange()
  }
})

const namingStyleOptions = PLACE_NAMING_STYLE_OPTIONS.map((o) => ({
  value: o.id,
  label: o.label,
  desc: o.desc
}))

function onWorldSettingChange(): void {
  if (!doc.value) return
  refreshWorldSettingConstraints(doc.value.world, doc.value.map)
  if (doc.value.map) syncMapFromWorld(doc.value.world, doc.value.map)
  markDirty()
}

function markDirty(): void {
  knowledge.markDirty()
}

async function onAddCharacter(): Promise<void> {
  tab.value = 'characters'
  await knowledge.addCharacter()
}

function openWorldGenerator(): void {
  router.push({ name: 'world-generator' })
}

function openLocationPicker(): void {
  locationPickerOpen.value = true
}

function onLocationPicked(id: string): void {
  if (selectedChar.value) {
    selectedChar.value.locationId = id
    markDirty()
  }
}
</script>

<template>
  <div class="knowledge-panel">
    <header class="tabs">
      <button
        v-for="t in (['world', 'characters', 'appeared', 'factions', 'items'] as const)"
        :key="t"
        type="button"
        class="tab"
        :class="{ active: tab === t, highlight: t === 'appeared' && pendingAppearedCount > 0 }"
        @click="tab = t"
      >
        {{
          {
            world: '世界',
            characters: '人物',
            appeared: pendingAppearedCount ? `已出现(${pendingAppearedCount})` : '已出现',
            factions: '势力',
            items: '道具'
          }[t]
        }}
      </button>
    </header>

    <p class="tip">修改后请点击「保存设定」写入当前项目的 knowledge/ 目录；未保存的更改关闭项目后会丢失。</p>

    <div class="gen-row">
      <button
        type="button"
        class="nc-btn nc-btn-sm nc-btn-primary"
        :disabled="dify.knowledgeRunning"
        @click="ui.generateKnowledgeOpen = true"
      >
        {{ dify.knowledgeRunning ? '知识库生成中…' : 'AI 生成知识库' }}
      </button>
    </div>

    <p v-if="loading" class="hint">加载中…</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <template v-if="doc">
      <!-- 世界 -->
      <div v-if="tab === 'world'" class="pane">
        <div class="world-map-stack">
          <div class="world-actions">
            <button
              v-if="doc.map"
              type="button"
              class="nc-btn nc-btn-sm nc-btn-primary"
              @click="openWorldMapEdit"
            >
              编辑世界地图
            </button>
            <button type="button" class="nc-btn nc-btn-sm" @click="openWorldGenerator">
              {{ doc.map ? '重新生成地势…' : '打开世界观生成器' }}
            </button>
          </div>
          <p v-if="doc.map" class="hint map-hint">
            点击「编辑世界地图」在右侧打开平面编辑器；在此修改世界名称与规则，领土/行省/城市请在平面图中编辑并保存。
          </p>
          <p v-else class="hint">
            生成后获得基础地势与六边形编辑格；河流、国家领土、城市设定在平面地图编辑器中完成。
          </p>
        </div>

        <label class="field">
          <span>世界名称</span>
          <input v-model="doc.world.title" class="nc-input" @input="markDirty" />
        </label>

        <p class="section-title">基础分类</p>
        <SettingTagGroup
          label="时代"
          :options="WIZARD_ERA_OPTIONS"
          :model-value="doc.world.era || '架空'"
          @update:model-value="doc.world.era = $event as string; onWorldSettingChange()"
        />
        <SettingTagGroup
          label="题材"
          :options="WORLD_GENRE_OPTIONS"
          :model-value="doc.world.genre || '史诗'"
          @update:model-value="doc.world.genre = $event as string; onWorldSettingChange()"
        />
        <SettingTagGroup
          label="叙事风格"
          :options="WORLD_NARRATIVE_STYLE_OPTIONS"
          :model-value="doc.world.narrativeStyle || '史诗群像'"
          @update:model-value="doc.world.narrativeStyle = $event as string; onWorldSettingChange()"
        />
        <SettingTagGroup
          label="叙事节奏"
          :options="WORLD_PACING_OPTIONS"
          :model-value="doc.world.pacing || '稳健推进'"
          @update:model-value="doc.world.pacing = $event as string; onWorldSettingChange()"
        />
        <SettingTagGroup
          label="文风"
          :options="WORLD_PROSE_REGISTER_OPTIONS"
          :model-value="doc.world.proseRegister || '白话流畅'"
          @update:model-value="doc.world.proseRegister = $event as string; onWorldSettingChange()"
        />

        <p class="section-title">地图参数（与 map.json 同步）</p>
        <SettingTagGroup
          label="世界尺度（WorldEngine）"
          :option-items="MAP_SCALE_UI_OPTIONS"
          :model-value="mapScaleValue"
          @update:model-value="mapScaleValue = $event as WorldScale"
        />
        <SettingTagGroup
          label="气候分布"
          :option-items="WORLD_CLIMATE_UI_OPTIONS"
          :model-value="worldClimate"
          @update:model-value="worldClimate = $event as WorldClimateMode"
        />
        <SettingTagGroup
          label="地名与国名风格"
          :option-items="namingStyleOptions"
          :model-value="placeNamingStyle"
          @update:model-value="placeNamingStyle = $event as PlaceNamingStyle"
        />
        <p v-if="doc.map" class="hint map-sync-hint">
          已关联地图「{{ doc.map.name }}」· {{ mapScaleLabel(mapScaleValue) }}
          <template v-if="doc.map.renderWidth"> · {{ doc.map.renderWidth }}×{{ doc.map.renderHeight }}</template>
          · 修改尺度/气候后需<strong>重新生成地势</strong>才会改变贴图分辨率
        </p>
        <p v-else class="hint map-sync-hint">尚无地图；参数将在「世界观生成器」中作为默认值。</p>

        <p class="section-title">世界与场景</p>
        <SettingTagGroup
          label="主要场景类型"
          :options="WIZARD_SCENE_OPTIONS"
          :model-value="doc.world.scene || '大陆'"
          @update:model-value="doc.world.scene = $event as string; onWorldSettingChange()"
        />
        <label class="field">
          <span>场景名称（可选，如文京）</span>
          <input
            v-model="doc.world.scenePlace"
            class="nc-input"
            placeholder="具体城市或地点，非场景类型标签"
            @input="onWorldSettingChange()"
          />
        </label>
        <SettingTagGroup
          label="社会结构"
          :options="WORLD_SOCIAL_STRUCTURE_OPTIONS"
          :model-value="doc.world.socialStructure || '封建帝国'"
          @update:model-value="doc.world.socialStructure = $event as string; onWorldSettingChange()"
        />
        <SettingTagGroup
          label="政治基调"
          :options="WORLD_POLITICAL_TONE_OPTIONS"
          :model-value="doc.world.politicalTone || '中央集权'"
          @update:model-value="doc.world.politicalTone = $event as string; onWorldSettingChange()"
        />
        <SettingTagGroup
          label="战争形态"
          :options="WORLD_WARFARE_STYLE_OPTIONS"
          :model-value="doc.world.warfareStyle || '步骑会战'"
          @update:model-value="doc.world.warfareStyle = $event as string; onWorldSettingChange()"
        />
        <SettingTagGroup
          label="经济支柱"
          :options="WORLD_ECONOMIC_BASE_OPTIONS"
          :model-value="doc.world.economicBase || '混合经济'"
          @update:model-value="doc.world.economicBase = $event as string; onWorldSettingChange()"
        />
        <SettingTagGroup
          label="科技水平"
          :options="WORLD_TECH_OPTIONS"
          :model-value="doc.world.techLevel || '冷兵器'"
          @update:model-value="doc.world.techLevel = $event as string; onWorldSettingChange()"
        />

        <p class="section-title">冲突、氛围与力量</p>
        <SettingTagGroup
          label="冲突主轴"
          :options="WORLD_CONFLICT_OPTIONS"
          :model-value="doc.world.conflictFocus || '国家战争'"
          @update:model-value="doc.world.conflictFocus = $event as string; onWorldSettingChange()"
        />
        <SettingTagGroup
          label="氛围（最多 3 个）"
          :options="WIZARD_ATMOSPHERE_OPTIONS"
          :model-value="charAtmosphere"
          multiple
          :max="3"
          @update:model-value="charAtmosphere = $event as string[]; onWorldSettingChange()"
        />
        <SettingTagGroup
          label="创作禁忌（最多 4 个）"
          :options="WORLD_CONTENT_TABOO_OPTIONS"
          :model-value="charContentTaboos"
          multiple
          :max="4"
          @update:model-value="charContentTaboos = $event as string[]"
        />
        <SettingTagGroup
          label="力量体系（硬约束）"
          :options="WORLD_MAGIC_CONSTRAINT_OPTIONS"
          :model-value="charMagicConstraint"
          @update:model-value="charMagicConstraint = $event as string"
        />

        <label class="field constraints-preview">
          <span>硬性设定（由选项自动生成，注入 AI）</span>
          <pre class="compiled">{{ compiledConstraints }}</pre>
        </label>
        <label class="field">
          <span>补充设定（作者自由填写：帝国名、禁忌、人物关系…）</span>
          <MonacoFieldEditor
            v-model="doc.world.rules"
            :min-height="140"
            placeholder="四大帝国、边关烽烟、具体禁忌…"
            @update:model-value="markDirty"
          />
        </label>
      </div>

      <!-- 人物 -->
      <div v-show="tab === 'characters'" class="pane split">
        <div class="list-col">
          <button type="button" class="nc-btn nc-btn-sm" @click="onAddCharacter">+ 人物</button>
          <button
            v-for="c in doc.characters"
            :key="c.id"
            type="button"
            class="list-item"
            :class="{ active: c.id === selectedCharacterId }"
            @click="knowledge.selectCharacter(c.id)"
          >
            {{ c.name || c.id }}
          </button>
        </div>
        <div class="detail-col">
          <div v-if="selectedChar" class="form-col">
            <label class="field">
              <span>角色 ID</span>
              <input v-model="selectedChar.id" class="nc-input" readonly />
            </label>
            <label class="field">
              <span>姓名</span>
              <input v-model="selectedChar.name" class="nc-input" @input="markDirty" />
            </label>
            <label class="field">
              <span>所在地点</span>
              <div class="loc-picker">
                <input
                  :value="charLocation?.name ?? '未选择'"
                  class="nc-input"
                  readonly
                  placeholder="点击右侧从地图选择"
                />
                <button type="button" class="nc-btn nc-btn-sm" @click="openLocationPicker">地图选点</button>
                <button
                  v-if="selectedChar.locationId"
                  type="button"
                  class="nc-btn nc-btn-sm link-btn"
                  @click="
                    () => {
                      selectedChar!.locationId = undefined
                      markDirty()
                    }
                  "
                >
                  清除
                </button>
              </div>
              <p v-if="charLocation" class="hint loc-desc">{{ charLocation.description }}</p>
            </label>
            <SettingTagGroup
              label="身份 / 角色定位"
              :options="WIZARD_CHARACTER_ROLE_OPTIONS"
              :model-value="selectedChar.role || '配角'"
              @update:model-value="selectedChar.role = $event as string; markDirty()"
            />
            <label class="field">
              <span>性格标签</span>
              <TagsInput
                :model-value="selectedChar.traits ?? []"
                @update:model-value="
                  (v) => {
                    selectedChar!.traits = v
                    markDirty()
                  }
                "
              />
            </label>
            <label class="field">
              <span>外貌</span>
              <textarea v-model="selectedChar.appearance" class="nc-input area" rows="2" @input="markDirty" />
            </label>
            <label class="field">
              <span>性格简述</span>
              <input v-model="selectedChar.personality" class="nc-input" @input="markDirty" />
            </label>
            <label class="field">
              <span>备注</span>
              <textarea v-model="selectedChar.notes" class="nc-input area" rows="2" @input="markDirty" />
            </label>
            <button
              type="button"
              class="nc-btn nc-btn-sm danger-text"
              @click="knowledge.removeCharacter(selectedChar.id)"
            >
              删除此人物
            </button>
          </div>
          <p v-else class="hint">请添加或选择一个人物</p>
        </div>
      </div>

      <!-- 已出现角色（待加入设定） -->
      <div v-show="tab === 'appeared'" class="pane">
        <AppearedCharactersPane />
      </div>

      <!-- 势力 -->
      <div v-show="tab === 'factions'" class="pane">
        <button type="button" class="nc-btn nc-btn-sm" @click="knowledge.addFaction()">+ 势力</button>
        <div v-for="(f, i) in doc.factions" :key="f.id" class="card">
          <div class="card-head">
            <strong>{{ f.name || f.id }}</strong>
            <NcIconButton name="trash" :size="16" label="删除势力" danger @click="knowledge.removeFaction(i)" />
          </div>
          <label class="field">
            <span>名称</span>
            <input v-model="f.name" class="nc-input" @input="markDirty" />
          </label>
          <label class="field">
            <span>简介</span>
            <textarea v-model="f.description" class="nc-input area" rows="2" @input="markDirty" />
          </label>
          <label class="field">
            <span>目标 / 立场</span>
            <input v-model="f.goals" class="nc-input" @input="markDirty" />
          </label>
        </div>
      </div>

      <!-- 道具 -->
      <div v-show="tab === 'items'" class="pane">
        <button type="button" class="nc-btn nc-btn-sm" @click="knowledge.addItem()">+ 道具</button>
        <div v-for="(item, i) in doc.items" :key="item.id" class="card">
          <div class="card-head">
            <strong>{{ item.name || item.id }}</strong>
            <NcIconButton name="trash" :size="16" label="删除道具" danger @click="knowledge.removeItem(i)" />
          </div>
          <label class="field">
            <span>名称</span>
            <input v-model="item.name" class="nc-input" @input="markDirty" />
          </label>
          <label class="field">
            <span>说明</span>
            <textarea v-model="item.description" class="nc-input area" rows="2" @input="markDirty" />
          </label>
        </div>
      </div>

      <PanelSaveBar :dirty="dirty" :saving="saving" label="保存设定" @save="knowledge.save()" />
    </template>

    <LocationPickerModal
      :open="locationPickerOpen"
      :map="doc?.map ?? null"
      :locations="doc?.locations ?? []"
      :image-url="mapImageDataUrl"
      :image-file-path="mapImageFilePath"
      :selected-id="selectedChar?.locationId"
      @close="locationPickerOpen = false"
      @select="onLocationPicked"
    />
  </div>
</template>

<style scoped>
.knowledge-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  overflow: auto;
  font-size: 13px;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tab {
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid var(--nc-border);
  border-radius: 4px;
  background: var(--nc-bg-base);
  color: var(--nc-text-muted);
}
.tab.active {
  border-color: var(--nc-accent);
  color: var(--nc-text-primary);
}
.tab.highlight:not(.active) {
  color: #e8a045;
}
.tip {
  font-size: 11px;
  color: var(--nc-text-muted);
  margin: 0;
}
.gen-row {
  margin: 6px 0 8px;
}
.error {
  font-size: 12px;
  color: var(--nc-danger);
  margin: 0;
}
.pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.split {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 10px;
  align-items: start;
}
.list-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.detail-col {
  min-width: 0;
}
.form-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.field {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.area {
  resize: vertical;
  min-height: 48px;
}
.list-item {
  text-align: left;
  padding: 6px 8px;
  border: 1px solid var(--nc-border);
  border-radius: 4px;
  background: var(--nc-bg-base);
  color: inherit;
  cursor: pointer;
}
.list-item.active {
  border-color: var(--nc-accent);
  background: var(--nc-bg-elevated);
}
.card {
  padding: 10px;
  border: 1px solid var(--nc-border);
  border-radius: 8px;
  background: var(--nc-bg-base);
  display: grid;
  gap: 6px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.danger-text {
  color: var(--nc-danger);
  align-self: flex-start;
}
.hint {
  font-size: 12px;
  color: var(--nc-text-muted);
}
.section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--nc-accent);
  margin: 14px 0 6px;
  text-transform: none;
}
.constraints-preview .compiled {
  margin: 0;
  padding: 8px;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  font-family: var(--nc-font-editor);
  background: var(--nc-bg-base);
  border: 1px solid var(--nc-border);
  border-radius: 6px;
  max-height: 200px;
  overflow: auto;
  color: var(--nc-text-primary);
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 10px;
}
.tags .label {
  font-size: 12px;
  color: var(--nc-text-muted);
  margin-right: 4px;
}
.tag {
  padding: 4px 10px;
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
.world-map-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.globe-preview {
  max-height: 140px;
  border-radius: 8px;
  overflow: hidden;
}
.world-map-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 10px;
  align-items: start;
}
.flat-map {
  max-width: 100%;
}
.map-hint {
  margin: 0;
}
.world-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.subhead {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.loc-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.loc-card {
  padding: 8px 10px;
  border: 1px solid var(--nc-border);
  border-radius: 6px;
  background: var(--nc-bg-base);
  font-size: 12px;
}
.loc-card strong {
  display: block;
}
.loc-meta {
  font-size: 11px;
  color: var(--nc-text-muted);
}
.loc-card p {
  margin: 4px 0 0;
  line-height: 1.4;
}
.loc-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.loc-picker .nc-input {
  flex: 1;
  min-width: 100px;
}
.loc-desc {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.4;
}
.link-btn {
  background: none;
  border: 1px solid var(--nc-border);
  color: var(--nc-text-muted);
}
.nc-btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}
</style>
