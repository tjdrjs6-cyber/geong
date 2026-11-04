import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM server module without types
import * as server from '../server/game.mjs'
import { DECOS, DECO_PULL_OPTIONS, DECO_NEW_BONUS } from '../src/game/decos'

describe('deco gacha', () => {
  it('has 50 decos shared by client and server with 20-coin pulls and a 180-coin 10-pull', () => {
    expect(DECOS.length).toBe(50)
    expect(server.DECO_IDS).toEqual(DECOS.map(deco => deco.id))
    expect(DECO_PULL_OPTIONS.map(option => [option.count, option.cost])).toEqual([[1, 20], [3, 60], [5, 100], [10, 180]])
    expect(server.DECO_PULL_COSTS).toEqual({ 1: 20, 3: 60, 5: 100, 10: 180 })
  })
  it('pays 10 coins for each newly registered deco and nothing for duplicates', () => {
    const first = server.pullDecos(180, {}, 10, () => 0)
    expect(first.ok).toBe(true)
    expect(first.gems).toBe(0 + DECO_NEW_BONUS)
    expect(first.decos).toEqual({ d01: 10 })
    const spread = server.pullDecos(60, {}, 3, (n: number) => (spread_i++ % n))
    expect(spread.gems).toBe(30)
  })
  it('refuses pulls without enough coins or with an invalid count', () => {
    expect(server.pullDecos(19, {}, 1, () => 0)).toEqual({ ok: false, error: 'not_enough_coins' })
    expect(server.pullDecos(999, {}, 2, () => 0)).toEqual({ ok: false, error: 'invalid_count' })
  })
  it('only lets owned decos (and one owned friend) be placed in the house', () => {
    const ok = server.validateHouse({ pieces: [{ id: 'd01', x: 10, y: 50 }, { id: 'd01', x: 20, y: 60, s: 9 }], friend: { id: 'chiikawa', x: 50, y: 80 } }, { d01: 2 }, ['chiikawa'])
    expect(ok.layout.pieces[1].s).toBe(1.6)
    expect(server.validateHouse({ pieces: [{ id: 'd01', x: 1, y: 1 }, { id: 'd01', x: 1, y: 1 }] }, { d01: 1 }, []).error).toBe('deco_not_owned')
    expect(server.validateHouse({ pieces: [], friend: { id: 'usagi', x: 1, y: 1 } }, {}, ['chiikawa']).error).toBe('not_owned')
  })
})
let spread_i = 0
