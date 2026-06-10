/** 清理 LLM 输出中的思考块，并从中提取章节摘要 */

const THINK_BLOCK_RE = /<(?:redacted_)?think>[\s\S]*?<\/(?:redacted_)?think>/gi

export function stripThinkBlocks(text: string): string {
  return text.replace(THINK_BLOCK_RE, '').trim()
}

export function extractSummaryFromNovel(novelBody: string, maxLen = 480): string {
  const clean = stripThinkBlocks(novelBody)
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!clean) return ''

  const paragraphs = clean
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 8)
  let body = paragraphs[0] ?? clean
  if (body.length < 48 && paragraphs[1]) {
    body = `${body}\n\n${paragraphs[1]}`
  }

  if (body.length <= maxLen) return body

  const slice = body.slice(0, maxLen)
  const lastPunct = Math.max(
    slice.lastIndexOf('。'),
    slice.lastIndexOf('！'),
    slice.lastIndexOf('？'),
    slice.lastIndexOf('.')
  )
  if (lastPunct > 80) return slice.slice(0, lastPunct + 1)
  return `${slice}…`
}

export function extractKeyEventsFromNovel(novelBody: string, max = 5): string[] {
  const clean = stripThinkBlocks(novelBody)
  const sentences = clean
    .split(/[。！？]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && s.length <= 40)
  return sentences.slice(0, max)
}
