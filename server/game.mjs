import { createHash } from 'node:crypto'
// Server-authoritative gacha rules. Keep these values in sync with src/game/collection.ts (tests verify).
export const CHARACTER_IDS = ['chiikawa', 'hachiware', 'usagi', 'momonga', 'kurimanju', 'shisa', 'kani', 'goblin', 'rakko', 'armor1', 'armor2', 'armor3', 'm_chiikawa', 'm_hachiware', 'm_usagi', 'm_momonga', 'm_kurimanju', 'm_shisa', 'm_kani', 'm_rakko', 'hanip', 'duip', 'siren', 'shimajiro', 'anoko', 'dekatsuyo', 'c_curry', 'h_curry', 'u_curry', 'ginger_chiikawa', 'ginger_hachiware', 'ginger_usagi', 'beetle_berserk', 'kurimanju_bean', 'rakko_limited', 'beetle', 'honey', 'ode', 'ode_prison', 'usagi_orange', 'halloween_chiikawa', 'halloween_hachiware', 'halloween_usagi', 'pajama_chiikawa', 'pajama_hachiware', 'pajama_usagi', 'staff_chiikawa', 'staff_hachiware', 'staff_usagi', 'devil_momonga', 'angel_momonga', 'siren_curry']
/** Draw weights out of 100000. Unlisted characters have zero draw weight. */
export const WEIGHTS = {chiikawa: 4700, hachiware: 4700, usagi: 4700, momonga: 4700, kurimanju: 4700, shisa: 4700, kani: 4700, goblin: 4700, rakko: 4700, armor1: 4700, armor2: 4700, armor3: 4700, pajama_chiikawa: 4690, pajama_hachiware: 4700, pajama_usagi: 4700, m_chiikawa: 1940, m_hachiware: 1940, m_usagi: 1940, m_momonga: 1940, m_kurimanju: 1940, m_shisa: 1940, m_kani: 1940, m_rakko: 1940, hanip: 1940, duip: 1940, honey: 1940, siren: 750, shimajiro: 750, anoko: 750, dekatsuyo: 750, ode: 750, staff_chiikawa: 750, staff_hachiware: 750, staff_usagi: 750, c_curry: 200, h_curry: 200, u_curry: 200, ginger_chiikawa: 200, ginger_hachiware: 200, ginger_usagi: 200, beetle: 200, ode_prison: 200, angel_momonga: 200, devil_momonga: 200, kurimanju_bean: 40, beetle_berserk: 40, rakko_limited: 40, usagi_orange: 40, siren_curry: 10}
/** Weeding speed bonus in percent. */
export const WEED_BONUS = {siren_curry: 70, chiikawa: 0, hachiware: 0, usagi: 0, momonga: 0, kurimanju: 0, shisa: 0, kani: 0, goblin: 0, rakko: 0, armor1: 0, armor2: 0, armor3: 0, m_chiikawa: 5, m_hachiware: 5, m_usagi: 5, m_momonga: 5, m_kurimanju: 5, m_shisa: 5, m_kani: 5, m_rakko: 5, hanip: 10, duip: 10, siren: 40, shimajiro: 10, anoko: 30, dekatsuyo: 25, c_curry: 50, h_curry: 50, u_curry: 50, ginger_chiikawa: 50, beetle: 0, ginger_hachiware: 50, ginger_usagi: 50, beetle_berserk: 0, kurimanju_bean: 60, rakko_limited: 0, honey: 10, ode: 25, ode_prison: 30, usagi_orange: 60, halloween_chiikawa: 0, halloween_hachiware: 0, halloween_usagi: 0, pajama_chiikawa: 0, pajama_hachiware: 0, pajama_usagi: 0, staff_chiikawa: 10, staff_hachiware: 10, staff_usagi: 10, devil_momonga: 35, angel_momonga: 52}
export const RARE_IDS = ['siren_curry', 'staff_chiikawa', 'staff_hachiware', 'staff_usagi', 'devil_momonga', 'angel_momonga', 'siren', 'shimajiro', 'anoko', 'dekatsuyo', 'c_curry', 'h_curry', 'u_curry', 'ginger_chiikawa', 'ginger_hachiware', 'ginger_usagi', 'beetle_berserk', 'kurimanju_bean', 'rakko_limited', 'beetle', 'ode', 'ode_prison']
export const TOTAL_WEIGHT = 100000
export const STARTING_COINS = 100
export const PULL_COST = 10
export const TEN_PULL_COST = 90
export const PULL_COSTS = { 1: PULL_COST, 3: 30, 5: 50, 10: TEN_PULL_COST }
export const DAILY_GIFT = 10
export const NEW_ENTRY_BONUS = 10
export const DUPLICATE_BONUS = 0
export const SIREN_NEW_BONUS = 50
export const newEntryBonus = id => (RARE_IDS.includes(id) ? SIREN_NEW_BONUS : NEW_ENTRY_BONUS)

/** Maps an integer roll in [0, TOTAL_WEIGHT) to a character id. */
export function characterForRoll(roll) {
  let threshold = roll
  for (const id of CHARACTER_IDS) {
    const weight = WEIGHTS[id] ?? 0
    if (!Number.isFinite(weight) || weight < 0) throw new Error(`Invalid gacha weight: ${id}`)
    threshold -= weight
    if (threshold < 0) return id
  }
  throw new Error(`Gacha roll out of range: ${roll}`)
}

const VALID = new Set(CHARACTER_IDS)

/** Calendar day used for the daily check-in, in Korea time so the reset happens at local midnight. */
export function checkInDay(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function normalizeOwned(value) {
  const list = Array.isArray(value) ? value : []
  return [...new Set(list.filter(id => typeof id === 'string' && VALID.has(id)))]
}

/** randomInt(n) must return an integer in [0, n); it is called with TOTAL_WEIGHT. */
export function pull(state, count, randomInt) {
  if (!Object.hasOwn(PULL_COSTS, count)) return { ok: false, error: 'invalid_count' }
  const cost = PULL_COSTS[count]
  if (state.gems < cost) return { ok: false, error: 'not_enough_coins' }
  let gems = state.gems - cost
  const owned = new Set(normalizeOwned(state.owned))
  const results = []
  for (let i = 0; i < count; i += 1) {
    const id = characterForRoll(randomInt(TOTAL_WEIGHT))
    const duplicate = owned.has(id)
    const bonus = duplicate ? DUPLICATE_BONUS : newEntryBonus(id)
    gems += bonus
    owned.add(id)
    results.push({ id, duplicate, bonus })
  }
  return { ok: true, state: { ...state, gems, owned: [...owned] }, results }
}

/** ISO week start (Monday) in Korea, and cumulative attendance within that week. */
export function attendanceWeek(now = new Date()) {
  const today = checkInDay(now)
  const weekday = attendanceDay(now)
  const monday = new Date(`${today}T12:00:00Z`)
  monday.setUTCDate(monday.getUTCDate() - weekday + 1)
  return monday.toISOString().slice(0, 10)
}
export function attendanceDay(now = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(now)
  return ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 })[weekday]
}
export function claimDaily(state, now = new Date()) {
  const today = checkInDay(now)
  if (state.lastDaily === today) return { ok: false, error: 'already_checked_in', state }
  const week = attendanceWeek(now)
  const count = state.attendanceWeek === week ? Math.min(7, Number(state.attendanceCount) || 0) : 0
  const day = count + 1
  const coins = day <= 5 ? day * 10 : 0
  const boxes = day >= 6 ? 1 : 0
  return { ok: true, coins, boxes, day, state: {
    ...state, gems: state.gems + coins, lastDaily: today,
    attendanceWeek: week, attendanceCount: day,
    pendingRandomBoxes: (state.pendingRandomBoxes || 0) + boxes,
  } }
}

export const USERNAME_RULE = /^[A-Za-z0-9_가-힣]{3,20}$/
export function validateCredentials(username, password) {
  if (typeof username !== 'string' || !USERNAME_RULE.test(username)) return 'invalid_username'
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) return 'invalid_password'
  return null
}

/** Nicknames: 2–6 characters of Hangul syllables, letters or digits. */
export const NICKNAME_RULE = /^[가-힣A-Za-z0-9]{2,6}$/
export function validateNickname(nickname) {
  if (typeof nickname !== 'string') return 'invalid_nickname'
  return NICKNAME_RULE.test(nickname.trim()) ? null : 'invalid_nickname'
}

/** Weeding pays 1 coin per interval (1 hour, shorter with a speed bonus); partial intervals carry over. */
export const WEED_HOUR_MS = 60 * 60 * 1000
export const WEED_COINS_PER_HOUR = 2
export const weedCoinsPerHour = id => WEED_COINS_PER_HOUR * (1 + (WEED_BONUS[id] ?? 0) / 100)
export const weedIntervalMs = id => WEED_HOUR_MS
/** One shared 2-coin base for the entire field; bonuses add together. */
export const weedFieldRate = ids => ids.length ? WEED_COINS_PER_HOUR * (1 + ids.reduce((sum, id) => sum + (WEED_BONUS[id] ?? 0), 0) / 100) : 0
export const weedFieldEarnedBetweenSlots = (ids, fromSlot, toSlot) => {
  if (!ids.length || toSlot <= fromSlot) return 0
  const units = 200 + 2 * ids.reduce((sum, id) => sum + (WEED_BONUS[id] ?? 0), 0)
  return Math.max(0, Math.floor(toSlot * units / 100 + 1e-7) - Math.floor(fromSlot * units / 100 + 1e-7))
}
export const weedEarnedBetweenSlots = (id, fromSlot, toSlot) => Math.max(0, Math.floor(toSlot * (200 + 2 * (WEED_BONUS[id] ?? 0)) / 100 + 1e-7) - Math.floor(fromSlot * (200 + 2 * (WEED_BONUS[id] ?? 0)) / 100 + 1e-7))
export function settleWeed(since, now, interval = WEED_HOUR_MS) {
  if (!Number.isFinite(since) || now <= since) return { coins: 0, since: Math.min(since, now) }
  const steps = Math.floor((now - since) / interval)
  return { coins: steps * WEED_COINS_PER_HOUR, since: since + steps * interval }
}

/** Hunting ground: the enemy has 100 HP and takes the friend's power as damage every 5 minutes. */
export const ENEMY_HP = 30_000
export const BATTLE_TICK_MS = 3_000
export const BATTLE_DIAMOND_CHANCE = 1
/** Battle power per friend. */
export const POWER = {chiikawa: 4, hachiware: 6, usagi: 7, momonga: 3, kurimanju: 2, shisa: 2, kani: 2, goblin: 1, rakko: 10, armor1: 15, armor2: 15, armor3: 15, m_chiikawa: 6, m_hachiware: 8, m_usagi: 9, m_momonga: 5, m_kurimanju: 3, m_shisa: 3, m_kani: 3, m_rakko: 15, hanip: 2, duip: 2, siren: 20, shimajiro: 30, anoko: 25, dekatsuyo: 28, c_curry: 5, h_curry: 5, u_curry: 5, ginger_chiikawa: 10, beetle: 1, ginger_hachiware: 10, ginger_usagi: 10, beetle_berserk: 50, kurimanju_bean: 10, rakko_limited: 50, honey: 13, ode: 25, ode_prison: 40, usagi_orange: 15, halloween_chiikawa: 50, halloween_hachiware: 50, halloween_usagi: 50, pajama_chiikawa: 4, pajama_hachiware: 6, pajama_usagi: 7, staff_chiikawa: 27, staff_hachiware: 27, staff_usagi: 27, devil_momonga: 42, angel_momonga: 20}
/** Settles elapsed attacks: returns defeated enemies (1 coin each), the leftover damage and the new tick anchor. */
export function settleBattle(since, damage, now, power) {
  const ticks = Math.max(0, Math.floor((now - since) / BATTLE_TICK_MS))
  const total = damage + ticks * power
  const defeated = Math.floor(total / ENEMY_HP)
  return { kills: defeated, damage: total % ENEMY_HP, since: since + ticks * BATTLE_TICK_MS }
}

/** 데코 뽑기: decorations with equal chance; 20 coins each, 10 pulls for 180. */
export const DECO_IDS = ["d001", "d002", "d003", "d004", "d005", "d006", "d007", "d008", "d009", "d010", "d011", "d012", "d013", "d014", "d015", "d016", "d017", "d018", "d019", "d020", "d021", "d022", "d023", "d024", "d025", "d026", "d027", "d028", "d029", "d030", "d031"]
export const DECO_PULL_COSTS = { 1: 20, 3: 60, 5: 100, 10: 200 }
export const DECO_NEW_BONUS = 10
const VALID_DECO = new Set(DECO_IDS)
export function normalizeDecos(value) {
  const out = {}
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [id, count] of Object.entries(value)) if (VALID_DECO.has(id) && Number.isInteger(count) && count > 0) out[id] = Math.min(count, 9999)
  }
  return out
}
/** randomInt(n) must return an integer in [0, n). */
export function pullDecos(gems, decos, count, randomInt) {
  if (!Object.hasOwn(DECO_PULL_COSTS, count)) return { ok: false, error: 'invalid_count' }
  const cost = DECO_PULL_COSTS[count]
  if (gems < cost) return { ok: false, error: 'not_enough_coins' }
  const next = { ...normalizeDecos(decos) }
  let balance = gems - cost
  const results = []
  for (let i = 0; i < count; i += 1) {
    const id = DECO_IDS[randomInt(DECO_IDS.length)]
    const duplicate = (next[id] ?? 0) > 0
    const bonus = duplicate ? 0 : DECO_NEW_BONUS
    balance += bonus
    next[id] = (next[id] ?? 0) + 1
    results.push({ id, duplicate, bonus })
  }
  return { ok: true, gems: balance, decos: next, results }
}

/** House lot layout: up to 10 owned decos (copies limited by count) and up to 3 different owned friends. */
export const HOUSE_MAX_PIECES = 20
export const HOUSE_MAX_FRIENDS = 3
/** Converts any saved layout (including the old single `friend` shape) to { pieces, friends }, trimmed to the limits. */
export function normalizeHouse(layout) {
  const pieces = Array.isArray(layout?.pieces) ? layout.pieces.slice(0, HOUSE_MAX_PIECES) : []
  const list = Array.isArray(layout?.friends) ? layout.friends : layout?.friend ? [layout.friend] : []
  const seen = new Set()
  const friends = list.filter(f => f && typeof f.id === 'string' && !seen.has(f.id) && seen.add(f.id)).slice(0, HOUSE_MAX_FRIENDS)
  return { pieces, friends }
}
const clampPct = value => Math.round(Math.min(100, Math.max(0, Number(value))) * 10) / 10
export function validateHouse(layout, decos, owned) {
  if (!layout || typeof layout !== 'object') return { error: 'invalid_house' }
  const pieces = Array.isArray(layout.pieces) ? layout.pieces : []
  if (pieces.length > HOUSE_MAX_PIECES) return { error: 'house_full' }
  const used = {}
  const clean = []
  for (const piece of pieces) {
    if (!piece || !VALID_DECO.has(piece.id) || !Number.isFinite(Number(piece.x)) || !Number.isFinite(Number(piece.y))) return { error: 'invalid_house' }
    used[piece.id] = (used[piece.id] ?? 0) + 1
    if (used[piece.id] > (decos[piece.id] ?? 0)) return { error: 'deco_not_owned' }
    const s = Number(piece.s)
    clean.push({ id: piece.id, x: clampPct(piece.x), y: clampPct(piece.y), s: Number.isFinite(s) ? Math.round(Math.min(1.6, Math.max(0.6, s)) * 100) / 100 : 1, f: Boolean(piece.f) })
  }
  const list = Array.isArray(layout.friends) ? layout.friends : layout.friend ? [layout.friend] : []
  if (list.length > HOUSE_MAX_FRIENDS) return { error: 'house_friends_full' }
  const friends = []
  for (const f of list) {
    if (!f || !owned.includes(f.id) || !Number.isFinite(Number(f.x)) || !Number.isFinite(Number(f.y))) return { error: 'not_owned' }
    if (friends.some(other => other.id === f.id)) return { error: 'invalid_house' }
    const s = Number(f.s ?? 1)
    friends.push({ id: f.id, x: clampPct(f.x), y: clampPct(f.y), s: Number.isFinite(s) ? Math.round(Math.min(1.6, Math.max(0.6, s)) * 100) / 100 : 1, f: Boolean(f.f) })
  }
  return { layout: { pieces: clean, friends } }
}

/** Roulette: one spin per Korea 12-hour window (00:00 / 12:00). Weights are per-mille (40% / 25% / 17.5% / 12.5% / 5%). */
export const ROULETTE = [
  { coins: 10, weight: 400 },
  { coins: 20, weight: 250 },
  { coins: 30, weight: 175 },
  { coins: 50, weight: 125 },
  { coins: 100, weight: 50 },
]
export function drawRoulette(random = Math.random) {
  let roll = Math.floor(random() * 1000)
  for (let i = 0; i < ROULETTE.length; i += 1) {
    if (roll < ROULETTE[i].weight) return i
    roll -= ROULETTE[i].weight
  }
  return ROULETTE.length - 1
}
export function rouletteSlot(now = new Date()) {
  const koreaHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23' }).format(now))
  return `${checkInDay(now)}${koreaHour < 12 ? 'A' : 'B'}`
}
export function spinRoulette(state, random = Math.random, now = new Date()) {
  const today = rouletteSlot(now)
  if (state.lastRoulette === today) return { ok: false, error: 'already_spun', state }
  const index = drawRoulette(random)
  const prize = ROULETTE[index].coins
  return { ok: true, index, prize, state: { ...state, gems: state.gems + prize, lastRoulette: today } }
}

/** Mailbox: up to 30 characters of text, optional coins from the sender's own balance, at most 100 coins sent per Korean day. */
export const MAIL_MAX_CHARS = 30
export const MAIL_DAILY_COINS = 100
export function validateMail({ message, coins }, { sentToday, balance, admin }) {
  const text = typeof message === 'string' ? message.trim() : ''
  const amount = Number(coins ?? 0)
  if ([...text].length > MAIL_MAX_CHARS) return { error: 'mail_too_long' }
  if (!Number.isInteger(amount) || amount < 0) return { error: 'mail_bad_coins' }
  if (!text && amount === 0) return { error: 'mail_empty' }
  if (!admin && sentToday + amount > MAIL_DAILY_COINS) return { error: 'mail_daily_limit' }
  if (!admin && amount > balance) return { error: 'not_enough_coins' }
  return { text, coins: amount }
}

/** Storage box: extra (duplicate) copies can be sold for coins. */
export const CHAR_SELL_PRICES = { normal: 3, rare: 5, epic: 10, unique: 30 }
export const characterSellPrice = id => id.startsWith('m_') || id === 'hanip' || id === 'duip' || id === 'honey'
  ? CHAR_SELL_PRICES.rare
  : ['siren', 'shimajiro', 'anoko', 'dekatsuyo', 'ode'].includes(id)
    ? CHAR_SELL_PRICES.epic
    : ['c_curry', 'h_curry', 'u_curry', 'ginger_chiikawa', 'ginger_hachiware', 'ginger_usagi', 'beetle_berserk', 'kurimanju_bean', 'rakko_limited', 'beetle', 'ode', 'ode_prison'].includes(id)
      ? CHAR_SELL_PRICES.unique
      : CHAR_SELL_PRICES.normal
export const DECO_SELL_PRICE = 5
/** Character duplicates: { [characterId]: extra copies beyond the first }. */
export function normalizeDupes(value) {
  const out = {}
  if (!value || typeof value !== 'object') return out
  for (const [id, count] of Object.entries(value)) {
    if (CHARACTER_IDS.includes(id) && Number.isInteger(count) && count > 0) out[id] = Math.min(count, 9999)
  }
  return out
}
export function addDupes(dupes, results) {
  const next = { ...normalizeDupes(dupes) }
  for (const result of results) if (result.duplicate) next[result.id] = Math.min((next[result.id] ?? 0) + 1, 9999)
  return next
}
const sellCount = count => (Number.isInteger(count) && count > 0 && count <= 9999 ? count : 0)
/** Sell `count` duplicate copies of a character. */
export function sellCharacter(dupes, id, count) {
  const n = sellCount(count)
  if (!n || !CHARACTER_IDS.includes(id)) return { error: 'sell_invalid' }
  const have = normalizeDupes(dupes)[id] ?? 0
  if (n > have) return { error: 'sell_not_enough' }
  const next = { ...normalizeDupes(dupes) }
  if (have - n > 0) next[id] = have - n; else delete next[id]
  return { dupes: next, coins: n * characterSellPrice(id) }
}
/** Sell `count` duplicate copies of a deco; always keeps one copy, and every copy placed in the house. */
export function sellDeco(decos, id, count, placed = 0) {
  const n = sellCount(count)
  if (!n || !DECO_IDS.includes(id)) return { error: 'sell_invalid' }
  const have = normalizeDecos(decos)[id] ?? 0
  const keep = Math.max(1, placed)
  if (n > have - keep) return { error: have > 1 && placed > 1 ? 'sell_placed' : 'sell_not_enough' }
  return { decos: { ...normalizeDecos(decos), [id]: have - n }, coins: n * DECO_SELL_PRICE }
}

/** Mailbox keeps at most this many letters (inbox and sent box each); the oldest drop off first. */
export const MAILBOX_MAX = 10

/** Suggestion box: public, up to 50 characters; only the operator replies or deletes. */
export const SUGGEST_MAX_CHARS = 50
export const SUGGEST_REPLY_MAX_CHARS = 100
export const SUGGEST_DAILY_MAX = 5
export function validateSuggestion(message, max = SUGGEST_MAX_CHARS) {
  const text = typeof message === 'string' ? message.replace(/\s+/g, ' ').trim() : ''
  if (!text) return { error: 'suggest_empty' }
  if ([...text].length > max) return { error: max === SUGGEST_MAX_CHARS ? 'suggest_too_long' : 'reply_too_long' }
  return { text }
}

/** House coin: one coin per clock hour (1–10 coins, random spot); it vanishes when the next one appears. */
export const HOUSE_COIN_MS = 60 * 60 * 1000
export const HOUSE_COIN_MIN = 1
export const HOUSE_COIN_MAX = 10
export function houseCoinSlot(now = Date.now()) { return Math.floor(now / HOUSE_COIN_MS) }
/** Deterministic per account+hour from a secret per-account salt, so the amount/spot can't be rerolled. */
export function houseCoinFor(salt, slot) {
  const h = createHash('sha256').update(`${salt}:${slot}`).digest()
  return {
    slot,
    coins: HOUSE_COIN_MIN + (h.readUInt32BE(0) % (HOUSE_COIN_MAX - HOUSE_COIN_MIN + 1)),
    x: 12 + (h.readUInt32BE(4) % 7700) / 100,
    y: 40 + (h.readUInt32BE(8) % 4500) / 100,
  }
}

/** 풍뎅이 unique effect: if owned, it can be placed in the weeding field as an extra helper; weeding coins are doubled while it is there. */
export const BEETLE_ID = 'beetle'
export const BEETLE_COIN_MULTIPLIER = 2
export const weedCoinMultiplier = beetleHelper => (beetleHelper ? BEETLE_COIN_MULTIPLIER : 1)

/** Up to 3 friends can weed at once; each earns on its own interval. */
export const WEED_MAX = 3
