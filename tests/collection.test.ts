import { describe, expect, it } from 'vitest'
import { CHARACTERS, GachaStore, STARTING_COINS, drawCharacter, fullName, newEntryBonus, weedIntervalMs, WEED_HOUR_MS, type StorageLike } from '../src/game/collection'

const memory = (): StorageLike => { const map = new Map<string, string>(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v) } } }

describe('30-friend roster', () => {
  it('has 30 friends whose odds add up to 100%', () => {
    expect(CHARACTERS).toHaveLength(30)
    expect(Math.round(CHARACTERS.reduce((sum, c) => sum + c.probability, 0) * 1000) / 1000).toBe(100)
  })
  it('uses the operator odds table with grades, weeding bonuses and battle power', () => {
    const row = (id: string) => { const c = CHARACTERS.find(x => x.id === id)!; return [c.probability, c.tier, c.weedBonus, c.power] }
    const table: Record<string, [number, string, number, number]> = {
      chiikawa: [6.07, 'normal', 0, 4], hachiware: [6.07, 'normal', 0, 6], usagi: [6.07, 'normal', 0, 7], momonga: [6.07, 'normal', 0, 3], kurimanju: [6.07, 'normal', 0, 2], shisa: [6.07, 'normal', 0, 2], kani: [6.07, 'normal', 0, 2], goblin: [6.07, 'normal', 0, 1],
      rakko: [6.06, 'normal', 0, 10], armor1: [6.06, 'normal', 0, 15], armor2: [6.06, 'normal', 0, 15], armor3: [6.06, 'normal', 0, 15],
      m_chiikawa: [2.2, 'mermaid', 5, 6], m_hachiware: [2.2, 'mermaid', 5, 8], m_usagi: [2.2, 'mermaid', 5, 9], m_momonga: [2.2, 'mermaid', 5, 5], m_kurimanju: [2.2, 'mermaid', 5, 3], m_shisa: [2.2, 'mermaid', 5, 3], m_kani: [2.2, 'mermaid', 5, 3], m_rakko: [2.2, 'mermaid', 5, 15], hanip: [2.2, 'mermaid', 10, 2], duip: [2.2, 'mermaid', 10, 2],
      siren: [1, 'rare', 40, 20], shimajiro: [1, 'rare', 10, 30], anoko: [1, 'rare', 30, 25], dekatsuyo: [1, 'rare', 25, 28],
      c_curry: [0.3, 'super', 50, 5], h_curry: [0.3, 'super', 50, 5], u_curry: [0.3, 'super', 50, 5], beetle: [0.3, 'super', 0, 1],
    }
    expect(CHARACTERS.map(c => c.id)).toEqual(Object.keys(table))
    for (const [id, expected] of Object.entries(table)) expect([id, ...row(id)]).toEqual([id, ...expected])
    expect(CHARACTERS.filter(c => c.id.startsWith('armor')).map(c => c.name)).toEqual(['갑옷씨1', '갑옷씨2', '갑옷씨3'])
    expect(['armor1', 'armor2', 'armor3'].map(id => newEntryBonus(id as 'armor1'))).toEqual([10, 10, 10])
    expect([CHARACTERS.find(c => c.id === 'beetle')!.name, newEntryBonus('beetle')]).toEqual(['풍뎅이', 50])
  })
  it('labels 인어의섬 friends and speeds up weeding', () => {
    expect(fullName(CHARACTERS.find(c => c.id === 'm_usagi')!)).toBe('우사기 (인어의섬)')
    expect(weedIntervalMs('chiikawa')).toBe(WEED_HOUR_MS)
    expect(weedIntervalMs('m_chiikawa')).toBe(Math.round(WEED_HOUR_MS / 1.05))
    expect(weedIntervalMs('siren')).toBe(Math.round(WEED_HOUR_MS / 1.4))
  })
  it('maps the random roll across the tiers in order', () => {
    expect(drawCharacter(() => 0)).toBe('chiikawa')
    expect(drawCharacter(() => 0.54619)).toBe('rakko')
    expect(drawCharacter(() => 0.72801)).toBe('m_chiikawa')
    expect(drawCharacter(() => 0.54621)).toBe('armor1')
    expect(drawCharacter(() => 0.9999)).toBe('beetle')
  })
  it('starts with 100 coins and gives 10 (rare 50) for a new friend, nothing for duplicates', () => {
    expect(STARTING_COINS).toBe(100)
    expect(newEntryBonus('kani')).toBe(10)
    expect(newEntryBonus('shimajiro')).toBe(50)
    const store = new GachaStore(memory())
    const first = store.pull(1, () => 0)!
    expect(first[0]).toEqual({ id: 'chiikawa', duplicate: false, bonus: 10 })
    expect(store.data.gems).toBe(100)
    expect(store.pull(1, () => 0)![0]).toEqual({ id: 'chiikawa', duplicate: true, bonus: 0 })
    expect(store.data.gems).toBe(90)
  })
})
