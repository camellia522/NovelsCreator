# M10 导出

## 职责

将章节或全书导出为 txt/md；可选导出到项目 `exports/` 或用户自选路径。

## 流程

```mermaid
flowchart LR
  A[ExportDialog] --> B[export:chapter / fullBook]
  B --> C[export.service]
  C --> D[读取 chapters + outline 标题]
  D --> E[合并文本 + 写文件]
  E --> F[系统保存对话框 / exports/]
```

## IPC

| 通道 | 说明 |
|------|------|
| `export:chapter` | 单章导出 |
| `export:fullBook` | 按卷章顺序合并全书 |
| `export:toProjectFolder` | 写入项目 `exports/` |

## 关键文件

- `electron/main/services/export.service.ts`
- `electron/main/ipc/export.ipc.ts`
- `src/components/export/ExportDialog.vue`
