import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM server module
import * as server from '../server/game.mjs'
import { CHARACTERS, weedIntervalMs } from '../src/game/collection'

const fresh = () => ({ gems: 50, owned: [], lastDaily: '' })

describe('server-authoritative gacha rules', () => {
  it('matches the client roster, weights and weeding bonuses', () => {
    expect(server.CHARACTER_IDS).toEqual(CHARACTERS.map(c => c.id))
    for (const c of CHARACTERS) {
      expect(server.WEIGHTS[c.id]).toBe(Math.round(c.probability * 1000))
      expect(server.WEED_BONUS[c.id]).toBe(c.weedBonus)
      expect(server.weedIntervalMs(c.id)).toBe(weedIntervalMs(c.id))
    }
    expect(server.TOTAL_WEIGHT).toBe(100000)
  })
  it('maps rolls to tiers', () => {
    expect(server.characterForRoll(0)).toBe('chiikawa')
    expect(server.characterForRoll(48559)).toBe('goblin')
    expect(server.characterForRoll(48560)).toBe('rakko')
    expect(server.characterForRoll(54620)).toBe('armor1')
    expect(server.characterForRoll(72799)).toBe('armor3')
    expect(server.characterForRoll(72800)).toBe('m_chiikawa')
    expect(server.characterForRoll(94799)).toBe('duip')
    expect(server.characterForRoll(94800)).toBe('siren')
    expect(server.characterForRoll(97800)).toBe('dekatsuyo')
    expect(server.characterForRoll(98800)).toBe('c_curry')
    expect(server.characterForRoll(99699)).toBe('u_curry')
    expect(server.characterForRoll(99700)).toBe('beetle')
    expect(server.characterForRoll(99999)).toBe('beetle')
  })
  it('gives 50 coins for a new rare friend, 10 for others and none for duplicates', () => {
    const rare = server.pull(fresh(), 1, () => 95805)
    expect(rare.results[0]).toEqual({ id: 'shimajiro', duplicate: false, bonus: 50 })
    expect(rare.state.gems).toBe(90)
    const again = server.pull(rare.state, 3, () => 95805)
    expect(again.results.map((r: { bonus: number }) => r.bonus)).toEqual([0, 0, 0])
    expect(again.state.gems).toBe(60)
    expect(server.pull({ ...fresh(), gems: 20 }, 3, () => 0).ok).toBe(false)
    expect(server.pull(fresh(), 2, () => 0).ok).toBe(false)
    const curry = server.pull(fresh(), 1, () => 98805)
    expect(curry.results[0]).toEqual({ id: 'c_curry', duplicate: false, bonus: 50 })
  })
  it('settles weeding faster for bonus friends', () => {
    const hour = server.WEED_HOUR_MS
    expect(server.settleWeed(0, hour * 3, server.weedIntervalMs('chiikawa')).coins).toBe(3)
    expect(server.settleWeed(0, hour * 3, server.weedIntervalMs('m_chiikawa')).coins).toBe(3)
    expect(server.settleWeed(0, hour * 5, server.weedIntervalMs('anoko')).coins).toBe(6)
  })
  it('풍뎅이 helper doubles weeding coins; armor friends give 10 coins and 15 power', () => {
    expect(server.weedCoinMultiplier(true)).toBe(2)
    expect(server.weedCoinMultiplier(false)).toBe(1)
    expect([server.POWER.beetle, server.WEED_BONUS.beetle, server.newEntryBonus('beetle')]).toEqual([1, 0, 50])
    expect([server.POWER.armor1, server.WEED_BONUS.armor2, server.newEntryBonus('armor3')]).toEqual([15, 0, 10])
    const total = Object.values(server.WEIGHTS as Record<string, number>).reduce((a, b) => a + b, 0)
    expect(total).toBe(100000)
  })
})
