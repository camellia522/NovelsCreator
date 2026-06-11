/** 极简 Jinja 子集，覆盖 outline prompts 用到的语法 */
export function renderOutlineTemplate(
  template: string,
  vars: Record<string, string | undefined>
): string {
  let out = template

  // {% if a == 'b' %} or {% if a == "b" %} ... {% else %} ... {% endif %}
  out = out.replace(
    /\{%\s*if\s+(\w+)\s*==\s*['"]([^'"]*)['"]\s*%\}([\s\S]*?)(?:\{%\s*else\s*%\}([\s\S]*?))?\{%\s*endif\s*%\}/g,
    (_, key, literal, ifBody, elseBody = '') => {
      return vars[key] === literal ? ifBody : elseBody
    }
  )

  // {% if retry_count | int > 0 %}
  out = out.replace(
    /\{%\s*if\s+(\w+)\s*\|\s*int\s*>\s*(\d+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
    (_, key, threshold, body) => {
      const n = Number.parseInt(String(vars[key] ?? '0'), 10) || 0
      return n > Number.parseInt(threshold, 10) ? body : ''
    }
  )

  // {% if var %}...{% endif %}
  out = out.replace(/\{%\s*if\s+not\s+(\w+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g, (_, key, body) => {
    const val = vars[key]
    const empty =
      !val ||
      !val.trim() ||
      val === '{}' ||
      val === '{"volumes":[]}' ||
      val === '{"volumes": []}'
    return empty ? body : ''
  })

  out = out.replace(/\{%\s*if\s+(\w+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g, (_, key, body) => {
    const val = vars[key]
    return val && val.trim() ? body : ''
  })

  // {{ key }} or {{ key | default("x", true) }}
  out = out.replace(
    /\{\{\s*(\w+)\s*(?:\|\s*default\("([^"]*)",\s*true\))?\s*\}\}/g,
    (_, key, def) => {
      const v = vars[key]
      if (v === undefined || v === null || v === '') return def ?? ''
      return v
    }
  )

  return out.replace(/\n{3,}/g, '\n\n').trim()
}

export function extractPromptBody(md: string, marker: string): string {
  const idx = md.indexOf(marker)
  if (idx < 0) return md.trim()
  return md.slice(idx + marker.length).trim()
}
