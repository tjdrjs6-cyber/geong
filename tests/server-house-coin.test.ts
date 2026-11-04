import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM server module
import { HOUSE_COIN_MS, houseCoinFor, houseCoinSlot } from '../server/game.mjs'

describe('hourly house coin', () => {
  it('uses clock-hour slots', () => {
    expect(houseCoinSlot(HOUSE_COIN_MS * 5 + 10)).toBe(5)
    expect(houseCoinSlot(HOUSE_COIN_MS * 6 - 1)).toBe(5)
    expect(houseCoinSlot(HOUSE_COIN_MS * 6)).toBe(6)
  })
  it('pays 1–10 coins at a spot inside the house, fixed per account and hour', () => {
    const seen = new Set<number>()
    for (let slot = 0; slot < 400; slot++) {
      const coin = houseCoinFor('salt-a', slot)
      expect(coin.coins).toBeGreaterThanOrEqual(1)
      expect(coin.coins).toBeLessThanOrEqual(10)
      expect(coin.x).toBeGreaterThanOrEqual(12)
      expect(coin.x).toBeLessThanOrEqual(89)
      expect(coin.y).toBeGreaterThanOrEqual(40)
      expect(coin.y).toBeLessThanOrEqual(85)
      seen.add(coin.coins)
    }
    expect(seen.size).toBe(10)
    expect(houseCoinFor('salt-a', 42)).toEqual(houseCoinFor('salt-a', 42))
    expect(houseCoinFor('salt-a', 42)).not.toEqual(houseCoinFor('salt-b', 42))
  })
})
