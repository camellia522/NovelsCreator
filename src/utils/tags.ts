/** 标签输入：界面用逗号分隔，落盘仍为 string[] */

export function tagsToString(tags: string[] | undefined): string {
  return (tags ?? []).join('，')
}

export function stringToTags(raw: string): string[] {
  return raw
    .split(/[,，、;；\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}
