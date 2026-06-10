/** 客户端设置与各 Dify 工作流 API Key 槽位一一对应 */
export type DifyWorkflowSlot = 'chapter' | 'outline' | 'society' | 'knowledge'

export interface DifyWorkflowDefinition {
  slot: DifyWorkflowSlot
  label: string
  workflowId: string
  description: string
}

export const DIFY_WORKFLOW_DEFINITIONS: readonly DifyWorkflowDefinition[] = [
  {
    slot: 'chapter',
    label: '章节生成',
    workflowId: 'novel-chapter-generation-v1.1',
    description: '三要素向导 / 章节正文生成'
  },
  {
    slot: 'outline',
    label: '大纲生成',
    workflowId: 'novel-outline-generation-v1',
    description: 'AI 生成卷章大纲'
  },
  {
    slot: 'society',
    label: '世界观社会层',
    workflowId: 'novel-world-society-v1',
    description: '领土已绘后的国家 / 城市文案'
  },
  {
    slot: 'knowledge',
    label: '知识库生成',
    workflowId: 'novel-knowledge-generation-v1',
    description: 'AI 生成世界设定 / 人物 / 势力 / 道具'
  }
] as const

export const DIFY_WORKFLOW_SLOTS = DIFY_WORKFLOW_DEFINITIONS.map((d) => d.slot)

export type DifyWorkflowKeys = Record<DifyWorkflowSlot, string>

export function emptyDifyWorkflowKeys(): DifyWorkflowKeys {
  return { chapter: '', outline: '', society: '', knowledge: '' }
}
