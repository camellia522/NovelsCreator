import assert from 'node:assert/strict'
import type { MapHexCell } from '../src/types/project'
import {
  alignDirectionInPlaceName,
  compassLabelForPoint,
  nameHasLeadingDirection,
  nationGeoRefFromCells
} from '../src/utils/world-admin-divisions'

function cell(x: number, y: number): MapHexCell {
  return {
    id: `c-${x}-${y}`,
    q: 0,
    r: 0,
    x,
    y,
    terrain: 'plain',
    heat: 0.5,
    moisture: 0.5,
    development: 50
  }
}

const ref = nationGeoRefFromCells([cell(10, 40), cell(90, 60)])
assert.equal(compassLabelForPoint(20, 50, ref), '西')
assert.equal(compassLabelForPoint(80, 50, ref), '东')
assert.equal(compassLabelForPoint(50, 50, ref), '中')

assert.equal(nameHasLeadingDirection('东内府城'), true)
assert.equal(nameHasLeadingDirection('安内府城'), false)
assert.equal(alignDirectionInPlaceName('东内府城', 20, 50, ref), '西内府城')
assert.equal(alignDirectionInPlaceName('安内府城', 20, 50, ref), '安内府城')

console.log('test-compass-admin-names: ok')
