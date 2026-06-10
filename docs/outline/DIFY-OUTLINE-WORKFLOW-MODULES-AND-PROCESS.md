# Dify 大纲生成工作流 — 模块与流程

---

## 1. 模块（8 模块）

```
M0 接入      START inputs
M1 上下文    P0 合并 knowledge + brief
M2 创作      O1 生成 OutlineDocument
M3 质控      O2 结构校验
M4 路由      AGG + IF → continue/retry/circuit_break
M5 重试      RE → 客户端再 POST（方案 B）
M6 出口      END_OK / CB → PARSE → END
M7 客户端    outline.store → outline/outline.json
```

---

## 2. M2 — O1 创作层

**输入**：knowledge_snapshot, plot_memory, target_chapters, outline_brief, retry_issues_formatted

**输出**：

```json
{
  "outline_summary": "...",
  "outline": { "volumes": [...] }
}
```

**质量门槛**：每章 beats 3–8；id 规范；与 world.rules 一致

---

## 3. M3 — O2 质控层

审读维度：

- 结构：卷章平衡、节奏
- 节拍：是否可执行
- 设定：与 knowledge 一致性

---

## 4. M4/M5 — 重试（方案 B）

同章节工作流：

1. AGG 输出 `route=retry`
2. RE → END，`status=retry`
3. 客户端 `retry_count++`，带上 `retry_issues_formatted`
4. 再次 POST，O1 读取驳回意见重写

---

## 5. M7 — 客户端落盘

**目标文件**：`outline/outline.json`

**合并策略（建议）**：

| 模式 | 行为 |
|------|------|
| replace | 全新替换 volumes |
| merge | 保留已有章 status=generated，仅更新 draft 章 |

**下游**：章节生成读取 `outline_beats`：

```typescript
// project.service.ts buildGenerationPayload
outline_beats = JSON.stringify(chapter.beats)
```

---

## 6. 端到端流程

```
1. 用户完成世界观（可选）
2. 大纲面板 → 填写 brief / 章数
3. POST outline 工作流
4. success → 写入 outline.json
5. 用户编辑 beats（可选）
6. 章节工作流消费 beats 生成正文
```

---

## 7. 搭建顺序

1. START（11 变量）
2. O1 + O2 LLM
3. AGG + IF + RE/CB
4. END_OK + PARSE + END
5. 发布 API Key

---

## 8. 验收

- [ ] outline.json 可被 OutlineTreePanel 加载
- [ ] 章节生成能读到 beats
- [ ] 重试环可用
