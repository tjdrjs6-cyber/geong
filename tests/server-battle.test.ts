import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM server module without type declarations
import * as server from '../server/game.mjs'
import { BATTLE_TICK_MS, ENEMY_HP, battlePower } from '../src/game/collection'

describe('hunting ground', () => {
  it('matches the client rules: 100 HP, one attack every 5 minutes', () => {
    expect(server.ENEMY_HP).toBe(ENEMY_HP)
    expect(server.BATTLE_TICK_MS).toBe(BATTLE_TICK_MS)
    expect(ENEMY_HP).toBe(100)
    expect(BATTLE_TICK_MS).toBe(5 * 60_000)
    for (const id of server.CHARACTER_IDS) expect(server.POWER[id]).toBe(battlePower(id))
    const table: Record<string, [number, number]> = {"chiikawa": [0, 4], "hachiware": [0, 6], "usagi": [0, 7], "momonga": [0, 3], "kurimanju": [0, 2], "shisa": [0, 2], "kani": [0, 2], "rakko": [0, 10], "m_chiikawa": [5, 6], "m_hachiware": [5, 8], "m_usagi": [5, 9], "m_momonga": [5, 5], "m_kurimanju": [5, 3], "m_shisa": [5, 3], "m_kani": [5, 3], "m_rakko": [5, 15], "hanip": [10, 2], "duip": [10, 2], "siren": [40, 20], "shimajiro": [10, 30], "anoko": [30, 25], "c_curry": [50, 5], "goblin": [0, 1], "dekatsuyo": [25, 28], "h_curry": [50, 5], "u_curry": [50, 5]}
    for (const [id, [weed, power]] of Object.entries(table)) { expect(server.WEED_BONUS[id]).toBe(weed); expect(server.POWER[id]).toBe(power) }
  })
  it('deals power damage per 5 minutes and pays one coin per defeated enemy', () => {
    const t0 = 1_000_000
    expect(server.settleBattle(t0, 0, t0 + BATTLE_TICK_MS - 1, 10)).toEqual({ kills: 0, damage: 0, since: t0 })
    expect(server.settleBattle(t0, 0, t0 + 3 * BATTLE_TICK_MS + 5, 10)).toEqual({ kills: 0, damage: 30, since: t0 + 3 * BATTLE_TICK_MS })
    expect(server.settleBattle(t0, 0, t0 + 10 * BATTLE_TICK_MS, 10)).toEqual({ kills: 1, damage: 0, since: t0 + 10 * BATTLE_TICK_MS })
    expect(server.settleBattle(t0, 10, t0 + 11 * BATTLE_TICK_MS, 20)).toEqual({ kills: 2, damage: 30, since: t0 + 11 * BATTLE_TICK_MS })
  })
})
