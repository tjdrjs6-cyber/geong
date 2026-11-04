import { describe, expect, it } from 'vitest'
// @ts-expect-error untyped server module
import * as server from '../server/game.mjs'

describe('storage box selling', () => {
  it('records only duplicate character copies', () => {
    const dupes = server.addDupes({}, [{ id: 'chiikawa', duplicate: false }, { id: 'chiikawa', duplicate: true }, { id: 'usagi', duplicate: true }, { id: 'usagi', duplicate: true }])
    expect(dupes).toEqual({ chiikawa: 1, usagi: 2 })
  })
  it('sells duplicate characters for 3 coins each and never the original', () => {
    expect(server.CHAR_SELL_PRICE).toBe(3)
    expect(server.sellCharacter({ usagi: 2 }, 'usagi', 2)).toEqual({ dupes: {}, coins: 6 })
    expect(server.sellCharacter({ usagi: 2 }, 'usagi', 1)).toEqual({ dupes: { usagi: 1 }, coins: 3 })
    expect(server.sellCharacter({ usagi: 2 }, 'usagi', 3).error).toBe('sell_not_enough')
    expect(server.sellCharacter({}, 'chiikawa', 1).error).toBe('sell_not_enough')
    expect(server.sellCharacter({ usagi: 2 }, 'usagi', 0).error).toBe('sell_invalid')
    expect(server.sellCharacter({ usagi: 2 }, 'nope', 1).error).toBe('sell_invalid')
  })
  it('sells duplicate decos for 5 coins each, keeping one copy and every placed copy', () => {
    expect(server.DECO_SELL_PRICE).toBe(5)
    const id = server.DECO_IDS[0]
    expect(server.sellDeco({ [id]: 1 }, id, 1, 0).error).toBe('sell_not_enough')
    expect(server.sellDeco({ [id]: 3 }, id, 2, 0)).toEqual({ decos: { [id]: 1 }, coins: 10 })
    expect(server.sellDeco({ [id]: 3 }, id, 3, 0).error).toBe('sell_not_enough')
    expect(server.sellDeco({ [id]: 3 }, id, 1, 2)).toEqual({ decos: { [id]: 2 }, coins: 5 })
    expect(server.sellDeco({ [id]: 3 }, id, 2, 2).error).toBe('sell_placed')
  })
})

describe('suggestion box and mailbox limits', () => {
  it('accepts suggestions up to 50 characters and replies up to 100', () => {
    expect(server.SUGGEST_MAX_CHARS).toBe(50)
    expect(server.validateSuggestion('  더 많은   데코 ')).toEqual({ text: '더 많은 데코' })
    expect(server.validateSuggestion('가'.repeat(50)).text).toHaveLength(50)
    expect(server.validateSuggestion('가'.repeat(51)).error).toBe('suggest_too_long')
    expect(server.validateSuggestion('   ').error).toBe('suggest_empty')
    expect(server.validateSuggestion('가'.repeat(100), server.SUGGEST_REPLY_MAX_CHARS).text).toHaveLength(100)
    expect(server.validateSuggestion('가'.repeat(101), server.SUGGEST_REPLY_MAX_CHARS).error).toBe('reply_too_long')
  })
  it('keeps at most 10 letters per mailbox', () => {
    expect(server.MAILBOX_MAX).toBe(10)
  })
})
