<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WorldLocation, WorldMapDocument } from '@/types/project'
import WorldMapCanvas from '@/components/world/WorldMapCanvas.vue'
import NcIconButton from '@/components/icons/NcIconButton.vue'

const props = defineProps<{
  open: boolean
  map: WorldMapDocument | null
  locations: WorldLocation[]
  selectedId?: string | null
  imageUrl?: string | null
}>()

const emit = defineEmits<{ close: []; select: [locationId: string] }>()

const draftId = ref<string | null>(null)

watch(
  () => props.open,
  (v) => {
    if (v) draftId.value = props.selectedId ?? null
  }
)

const selected = computed(() => props.locations.find((l) => l.id === draftId.value))

function confirm(): void {
  if (draftId.value) {
    emit('select', draftId.value)
  }
  emit('close')
}
</script>

<template>
  <div v-if="open" class="overlay" @click.self="emit('close')">
    <div class="modal nc-card">
      <header class="head">
        <h3>从地图选择地点</h3>
        <NcIconButton name="close" :size="18" label="关闭" @click="emit('close')" />
      </header>

      <div v-if="!map || !locations.length" class="empty">
        <p>当前项目尚无地图与地点。</p>
        <p>请先在菜单「工具 → 世界观生成器」中生成世界地图。</p>
      </div>

      <template v-else>
        <div class="body">
          <WorldMapCanvas
            :map="map"
            :locations="locations"
            :selected-location-id="draftId"
            :image-url="imageUrl"
            @select="draftId = $event"
          />
          <aside class="list">
            <button
              v-for="loc in locations"
              :key="loc.id"
              type="button"
              class="loc-item"
              :class="{ active: loc.id === draftId }"
              @click="draftId = loc.id"
            >
              <strong>{{ loc.name }}</strong>
              <span>{{ loc.type }} · {{ loc.climate }}</span>
            </button>
          </aside>
        </div>

        <footer v-if="selected" class="detail">
          <p>{{ selected.description }}</p>
        </footer>

        <footer class="foot">
          <button type="button" class="nc-btn" @click="emit('close')">取消</button>
          <div class="spacer" />
          <button type="button" class="nc-btn primary" :disabled="!draftId" @click="confirm">确定</button>
        </footer>
      </template>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.modal {
  width: min(920px, 96vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--nc-border);
}
.head h3 {
  margin: 0;
  font-size: 15px;
}
.body {
  display: grid;
  grid-template-columns: 1fr 220px;
  gap: 12px;
  padding: 12px 16px;
  min-height: 360px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: auto;
  max-height: 360px;
}
.loc-item {
  text-align: left;
  padding: 8px 10px;
  border: 1px solid var(--nc-border);
  border-radius: 6px;
  background: var(--nc-bg-base);
  color: inherit;
  cursor: pointer;
}
.loc-item.active {
  border-color: var(--nc-accent);
  background: var(--nc-bg-elevated);
}
.loc-item strong {
  display: block;
  font-size: 13px;
}
.loc-item span {
  font-size: 11px;
  color: var(--nc-text-muted);
}
.detail {
  padding: 0 16px 8px;
  font-size: 12px;
  color: var(--nc-text-muted);
  line-height: 1.5;
}
.detail p {
  margin: 0;
}
.foot {
  display: flex;
  gap: 8px;
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
.empty {
  padding: 24px 16px;
  font-size: 13px;
  color: var(--nc-text-muted);
  line-height: 1.6;
}
</style>
