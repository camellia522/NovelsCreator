<script setup lang="ts">
import { computed } from 'vue'
import type { TerrainType, WorldLocation, WorldMapDocument, WorldNation } from '@/types/project'
import { locationTierLabel, parseAdminRole } from '@/utils/world-location-marker'
import { resolveLocationDescription } from '@/utils/world-admin-divisions'

const TERRAIN_CN: Record<TerrainType, string> = {
  ocean: '海洋',
  coast: '海岸',
  plain: '平原',
  hill: '丘陵',
  mountain: '山地',
  forest: '森林',
  desert: '沙漠',
  wetland: '湿地'
}

const props = defineProps<{
  location: WorldLocation | null
  nations?: WorldNation[]
  map?: WorldMapDocument | null
}>()

const nationName = computed(() => {
  if (!props.location?.nationId || !props.nations?.length) return ''
  return props.nations.find((n) => n.id === props.location!.nationId)?.name ?? ''
})

const adminRole = computed(() => parseAdminRole(props.location?.authorSettings))

const bodyText = computed(() => {
  const loc = props.location
  if (!loc) return ''
  if (props.map) {
    return resolveLocationDescription(loc, props.map, nationName.value || undefined)
  }
  const a = loc.authorSettings?.trim()
  const d = loc.description?.trim()
  if (a && d && a !== d) return `${a}\n\n${d}`
  return a || d || '（暂无简介，可在侧栏编辑；完整润色请运行世界观社会层生成）'
})

const pillarText = computed(() => {
  const n = props.location?.suitability?.natural
  if (n?.length) return n.join('、')
  const t = props.location?.terrain
  if (t && t !== 'ocean') return `依托${TERRAIN_CN[t]}与区位发展`
  return ''
})

const socialText = computed(() => props.location?.suitability?.social?.join('、') ?? '')
</script>

<template>
  <section v-if="location" class="loc-detail">
    <header class="loc-head">
      <h4 class="loc-name">{{ location.name }}</h4>
      <span class="loc-tier">{{ locationTierLabel(location) }}</span>
      <span v-if="adminRole" class="loc-role">{{ adminRole }}</span>
      <span v-if="nationName" class="loc-nation">{{ nationName }}</span>
    </header>
    <dl class="loc-meta">
      <div v-if="location.development != null" class="row">
        <dt>发展程度</dt>
        <dd>{{ location.development }} / 100</dd>
      </div>
      <div v-if="location.population" class="row">
        <dt>人口规模</dt>
        <dd>{{ location.population }}</dd>
      </div>
      <div class="row">
        <dt>地形 · 气候</dt>
        <dd>{{ TERRAIN_CN[location.terrain] }} · {{ location.climate || '—' }}</dd>
      </div>
      <div v-if="pillarText" class="row">
        <dt>自然禀赋</dt>
        <dd>{{ pillarText }}</dd>
      </div>
      <div v-if="socialText" class="row">
        <dt>社会条件</dt>
        <dd>{{ socialText }}</dd>
      </div>
    </dl>
    <div class="loc-body">
      <p class="loc-body-label">城市简介与设定</p>
      <p class="loc-body-text">{{ bodyText }}</p>
    </div>
  </section>
  <p v-else class="loc-empty">点击地图上的城市圆点查看名称与简介</p>
</template>

<style scoped>
.loc-detail {
  padding: 10px 12px;
  border-top: 1px solid var(--nc-border);
  background: rgba(0, 0, 0, 0.25);
  font-size: 12px;
  line-height: 1.5;
}
.loc-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
  margin-bottom: 8px;
}
.loc-name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #e8c547;
}
.loc-tier,
.loc-role,
.loc-nation {
  font-size: 11px;
  color: var(--nc-text-muted);
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
}
.loc-meta {
  margin: 0 0 8px;
  display: grid;
  gap: 4px;
}
.row {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px;
}
.row dt {
  margin: 0;
  color: var(--nc-text-muted);
}
.row dd {
  margin: 0;
  color: var(--nc-text);
}
.loc-body-label {
  margin: 0 0 4px;
  font-size: 11px;
  color: var(--nc-text-muted);
}
.loc-body-text {
  margin: 0;
  white-space: pre-wrap;
  color: var(--nc-text);
  max-height: 120px;
  overflow-y: auto;
}
.loc-empty {
  margin: 0;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--nc-text-muted);
  border-top: 1px solid var(--nc-border);
  background: rgba(0, 0, 0, 0.2);
}
</style>
