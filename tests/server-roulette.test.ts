import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM server module without type declarations
import * as server from '../server/game.mjs'

describe('daily roulette (server rules)', () => {
  it('uses 40 / 25 / 17.5 / 12.5 / 5 percent for 10 / 20 / 30 / 50 / 100 coins', () => {
    expect(server.ROULETTE.map((s: { coins: number }) => s.coins)).toEqual([10, 20, 30, 50, 100])
    expect(server.ROULETTE.map((s: { weight: number }) => s.weight / 10)).toEqual([40, 25, 17.5, 12.5, 5])
    expect(server.drawRoulette(() => 0)).toBe(0)
    expect(server.drawRoulette(() => 0.399)).toBe(0)
    expect(server.drawRoulette(() => 0.4)).toBe(1)
    expect(server.drawRoulette(() => 0.65)).toBe(2)
    expect(server.drawRoulette(() => 0.825)).toBe(3)
    expect(server.drawRoulette(() => 0.95)).toBe(4)
    expect(server.drawRoulette(() => 0.9999)).toBe(4)
  })
  it('allows one spin per Korea 12-hour window and adds the prize', () => {
    const now = new Date('2026-11-03T03:00:00Z')
    const first = server.spinRoulette({ gems: 5, owned: [], lastDaily: '', lastRoulette: '' }, () => 0.96, now)
    expect(first.ok).toBe(true)
    expect(first.prize).toBe(100)
    expect(first.state.gems).toBe(105)
    const again = server.spinRoulette(first.state, () => 0, now)
    expect(again.ok).toBe(false)
    const nextDay = server.spinRoulette(first.state, () => 0, new Date('2026-11-03T15:30:00Z'))
    expect(nextDay.ok).toBe(true)
    expect(nextDay.state.gems).toBe(115)
    const morning = server.spinRoulette({ gems: 0, owned: [], lastDaily: '', lastRoulette: '' }, () => 0, new Date('2026-11-03T02:59:00Z'))
    const afternoon = server.spinRoulette(morning.state, () => 0, new Date('2026-11-03T03:00:00Z'))
    expect(afternoon.ok).toBe(true)
    expect(server.spinRoulette(afternoon.state, () => 0, new Date('2026-11-03T14:59:00Z')).ok).toBe(false)
  })
})
