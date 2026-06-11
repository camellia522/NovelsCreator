# M07 章节内容管理

## 职责

章节小说正文、AI 视频脚本、meta 元数据；三要素生成向导；预览与编辑。

## 磁盘布局

```
chapters/vol-{NN}/ch-{NNN}/
  novel.txt           # 标准小说正文
  video-script.txt    # 视频脚本
  meta.json           # 字数、平台模板、生成时间等
```

## 流程：手动编辑保存

1. `editor.store` 打开标签 → `project:getChapterText`
2. Monaco 编辑 → `project:saveChapterText`
3. `project-files.service` 原子写 txt

## 流程：三要素向导

1. `GenerationWizardView` 选择卷/章/生成意图
2. 组装 `generation_prompt`（见 `docs/chapter/GENERATION-WIZARD.md`）
3. 跳转生成或打开 `GenerateChapterDialog`

## 关键文件

- `src/stores/chapter.store.ts`
- `src/stores/wizard.store.ts`
- `src/views/GenerationWizardView.vue`
- `src/components/editor/MonacoTextEditor.vue`
- `electron/main/services/project.service.ts`（`saveGeneratedChapter`）
