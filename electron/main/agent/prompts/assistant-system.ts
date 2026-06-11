import { getCurrentProject } from '../../services/project.service'

/** 与 assistant-system.md 同步 */
const BASE_PROMPT = `你是 NovelsCreator 小说助手，服务于长篇创作。

规则：
1. 仅基于工具返回的项目数据回答；无数据时说明「请先完善设定/大纲」。
2. 调用 generate_* 前，用一句话说明将要做什么；系统会要求用户确认。
3. 不编造已生成章节正文；不泄露 API Key。
4. 不要使用未提供的工具访问文件系统或网络。
5. 回答使用用户语言（默认中文），简洁、对创作有用。`

export async function loadAssistantSystemPrompt(projectId: string): Promise<string> {
  const project = getCurrentProject()
  const name = project?.id === projectId ? project.name : projectId
  return `${BASE_PROMPT.trim()}\n\n当前项目：${name}`
}
