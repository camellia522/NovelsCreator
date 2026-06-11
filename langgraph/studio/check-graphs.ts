/**
 * 校验四条 Studio 图可编译（无需 API Key）
 */
import { graph as outline } from './graphs/outline'
import { graph as knowledge } from './graphs/knowledge'
import { graph as chapter } from './graphs/chapter'
import { graph as society } from './graphs/society'

const graphs = [
  ['outline', outline],
  ['knowledge', knowledge],
  ['chapter', chapter],
  ['society', society]
] as const

for (const [name, g] of graphs) {
  if (!g || typeof g.invoke !== 'function') {
    throw new Error(`graph ${name} is not compiled`)
  }
  console.log(`OK studio graph: ${name}`)
}

console.log('studio:graphs-check all passed')
