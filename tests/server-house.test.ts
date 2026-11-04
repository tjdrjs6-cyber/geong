import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM server module without type declarations
import * as server from '../server/game.mjs'

const decoId = server.DECO_IDS[0]
const piece = { id: decoId, x: 50, y: 70, s: 1, f: false }
describe('house limits (server rules)', () => {
  it('allows at most 10 decos', () => {
    const decos = { [decoId]: 20 }
    expect(server.validateHouse({ pieces: Array(10).fill(piece), friends: [] }, decos, []).layout.pieces).toHaveLength(10)
    expect(server.validateHouse({ pieces: Array(11).fill(piece), friends: [] }, decos, []).error).toBe('house_full')
  })
  it('allows up to 3 different owned friends', () => {
    const owned = ['chiikawa', 'hachiware', 'usagi', 'momonga']
    const f = (id: string) => ({ id, x: 50, y: 80, f: false })
    expect(server.validateHouse({ pieces: [], friends: owned.slice(0, 3).map(f) }, {}, owned).layout.friends).toHaveLength(3)
    expect(server.validateHouse({ pieces: [], friends: owned.map(f) }, {}, owned).error).toBe('house_friends_full')
    expect(server.validateHouse({ pieces: [], friends: [f('chiikawa'), f('chiikawa')] }, {}, owned).error).toBe('invalid_house')
    expect(server.validateHouse({ pieces: [], friends: [f('siren')] }, {}, owned).error).toBe('not_owned')
  })
  it('converts old single-friend layouts and trims to the limits', () => {
    const old = { pieces: Array(15).fill(piece), friend: { id: 'usagi', x: 1, y: 2, f: true } }
    const house = server.normalizeHouse(old)
    expect(house.pieces).toHaveLength(10)
    expect(house.friends).toEqual([{ id: 'usagi', x: 1, y: 2, f: true }])
    expect(server.normalizeHouse(null)).toEqual({ pieces: [], friends: [] })
  })
})
