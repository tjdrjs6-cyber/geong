import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM server module without type declarations
import { WEED_HOUR_MS, settleWeed, validateNickname } from '../server/game.mjs'

describe('weeding payout', () => {
  it('pays one coin per full hour and carries the partial hour', () => {
    const start = 1_000_000
    expect(settleWeed(start, start + WEED_HOUR_MS - 1)).toEqual({ coins: 0, since: start })
    expect(settleWeed(start, start + WEED_HOUR_MS)).toEqual({ coins: 1, since: start + WEED_HOUR_MS })
    const later = settleWeed(start, start + 3.5 * WEED_HOUR_MS)
    expect(later).toEqual({ coins: 3, since: start + 3 * WEED_HOUR_MS })
  })
  it('never pays for clocks that go backwards', () => {
    expect(settleWeed(5000, 1000).coins).toBe(0)
  })
})

describe('nickname rule', () => {
  it('accepts 2 to 6 Hangul, letters or digits', () => {
    for (const ok of ['겅이', '치이카와친구', 'ab', 'Abc123']) expect(validateNickname(ok)).toBeNull()
  })
  it('rejects too short, too long and symbols', () => {
    for (const bad of ['가', '일곱글자닉네임', 'a b', '<b>', '', 7]) expect(validateNickname(bad)).toBe('invalid_nickname')
  })
})
