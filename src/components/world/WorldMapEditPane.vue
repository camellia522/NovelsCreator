<script setup lang="ts">
import { storeToRefs } from 'pinia'
import WorldMapEditor from '@/components/world/WorldMapEditor.vue'
import { useKnowledgeStore } from '@/stores/knowledge.store'
import { useUiStore } from '@/stores/ui.store'

const knowledge = useKnowledgeStore()
const ui = useUiStore()
const { doc, mapImageDataUrl, mapImageFilePath, dirty, saving } = storeToRefs(knowledge)

async function saveMap(): Promise<void> {
  await knowledge.save()
}

function onLayerCache(cache: import('@/types/project').WorldMapLayerCacheDocument): void {
  knowledge.setMapLayerCache(cache)
}
</script>

<template>
  <div v-if="doc?.map" class="world-map-edit-pane">
    <header class="pane-head">
      <div>
        <h2>世界地图 · 编辑</h2>
        <p class="hint">
          已生成的地图可直接编辑领土、行省与城市；保存后写入项目文件夹
          <code>knowledge/map.json</code>、<code>knowledge/map.png</code>（与生成器中地图编辑的卫星底图相同）及图层缓存。
        </p>
      </div>
      <div class="actions">
        <button type="button" class="nc-btn" @click="ui.closeWorldMapEdit()">关闭</button>
        <button
          type="button"
          class="nc-btn nc-btn-primary"
          :disabled="saving || !dirty"
          @click="saveMap"
        >
          {{ saving ? '保存中…' : dirty ? '保存地图' : '已保存' }}
        </button>
      </div>
    </header>
    <WorldMapEditor
      class="map-editor-fill"
      :map="doc.map"
      :locations="doc.locations"
      :image-url="mapImageDataUrl"
      :image-file-path="mapImageFilePath"
      :layer-cache="doc.map.layerCache"
      @dirty="knowledge.markDirty()"
      @layer-cache="onLayerCache"
    />
  </div>
  <p v-else class="hint empty">暂无地图数据，请从设定侧栏打开世界观生成器。</p>
</template>

<style scoped>
.world-map-edit-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.pane-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--nc-border);
  background: var(--nc-bg-panel);
}
.pane-head h2 {
  margin: 0;
  font-size: 15px;
}
.hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.map-editor-fill {
  flex: 1;
  min-height: 0;
  border: none;
  border-radius: 0;
}
.empty {
  padding: 24px;
  text-align: center;
}
</style>
