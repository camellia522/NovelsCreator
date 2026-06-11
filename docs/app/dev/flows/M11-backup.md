# M11 备份与恢复

## 职责

项目 ZIP 备份与恢复；生成成功后可触发自动备份。

## 流程：手动备份

1. `BackupManagerDialog` → `backup:run`
2. `backup.service` 用 `archiver` 打包项目根（排除 `backups/` 循环）
3. 输出 `backups/NovelsCreator-backup-{timestamp}.zip`

## 流程：恢复

1. `backup:pickAndRestore` 或列表选择 `backup:restore`
2. `extract-zip` 解压到临时目录 → 校验 → 覆盖/合并

## 自动备份触发点

- 章节 AI 生成成功后（`ai-generation.handlers` 内可选调用）

## 关键文件

- `electron/main/services/backup.service.ts`
- `electron/main/ipc/backup.ipc.ts`
- `src/components/backup/BackupManagerDialog.vue`
