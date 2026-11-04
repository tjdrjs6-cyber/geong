import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM server module
import * as server from '../server/game.mjs'

const ctx = (over = {}) => ({ sentToday: 0, balance: 500, admin: false, ...over })
describe('mailbox rules', () => {
  it('allows up to 30 characters and rejects 31', () => {
    expect(server.validateMail({ message: '가'.repeat(30), coins: 0 }, ctx())).toEqual({ text: '가'.repeat(30), coins: 0 })
    expect(server.validateMail({ message: '가'.repeat(31), coins: 0 }, ctx()).error).toBe('mail_too_long')
  })
  it('counts emoji as one character', () => {
    expect(server.validateMail({ message: '🐹'.repeat(30), coins: 0 }, ctx()).error).toBeUndefined()
  })
  it('caps coins at 100 per day', () => {
    expect(server.validateMail({ message: '', coins: 100 }, ctx()).coins).toBe(100)
    expect(server.validateMail({ message: '', coins: 101 }, ctx()).error).toBe('mail_daily_limit')
    expect(server.validateMail({ message: 'hi', coins: 31 }, ctx({ sentToday: 70 })).error).toBe('mail_daily_limit')
    expect(server.validateMail({ message: 'hi', coins: 30 }, ctx({ sentToday: 70 })).coins).toBe(30)
  })
  it('spends only the sender\'s own coins (operator excepted)', () => {
    expect(server.validateMail({ message: '', coins: 20 }, ctx({ balance: 19 })).error).toBe('not_enough_coins')
    expect(server.validateMail({ message: '', coins: 20 }, ctx({ balance: 0, admin: true })).coins).toBe(20)
    expect(server.validateMail({ message: '', coins: 101 }, ctx({ admin: true })).coins).toBe(101)
    expect(server.validateMail({ message: '', coins: 500000 }, ctx({ sentToday: 900000, admin: true })).coins).toBe(500000)
  })
  it('rejects empty mail and bad coin values', () => {
    expect(server.validateMail({ message: '  ', coins: 0 }, ctx()).error).toBe('mail_empty')
    expect(server.validateMail({ message: 'a', coins: -1 }, ctx()).error).toBe('mail_bad_coins')
    expect(server.validateMail({ message: 'a', coins: 1.5 }, ctx()).error).toBe('mail_bad_coins')
  })
})
