export const STARTING_COINS = 100
/** 21 friends: 8 regular (8%), 10 인어의섬 (3%), 3 rare (2%), each with its own weeding bonus and battle power. */
export const CHARACTERS = [
  { id: 'chiikawa', name: '치이카와', variant: '', probability: 4.7, tier: 'normal', weedBonus: 0, power: 4, color: '#fff4f6', accent: '#f3a3b8' },
  { id: 'hachiware', name: '하치와레', variant: '', probability: 4.7, tier: 'normal', weedBonus: 0, power: 6, color: '#e6f3ff', accent: '#6ea5d8' },
  { id: 'usagi', name: '우사기', variant: '', probability: 4.7, tier: 'normal', weedBonus: 0, power: 7, color: '#fff6d8', accent: '#e8c35a' },
  { id: 'momonga', name: '모몽가', variant: '', probability: 4.7, tier: 'normal', weedBonus: 0, power: 3, color: '#f1efff', accent: '#a99ae1' },
  { id: 'kurimanju', name: '쿠리만쥬', variant: '', probability: 4.7, tier: 'normal', weedBonus: 0, power: 2, color: '#f8e9d4', accent: '#b08a62' },
  { id: 'shisa', name: '시사', variant: '', probability: 4.7, tier: 'normal', weedBonus: 0, power: 2, color: '#fff0dc', accent: '#eba65a' },
  { id: 'kani', name: '카니', variant: '', probability: 4.7, tier: 'normal', weedBonus: 0, power: 2, color: '#ffeef2', accent: '#ec8fa8' },
  { id: 'goblin', name: '고블린', variant: '', probability: 4.7, tier: 'normal', weedBonus: 0, power: 1, color: '#eef6e2', accent: '#8cb86a' },
  { id: 'rakko', name: '랏코', variant: '', probability: 4.7, tier: 'normal', weedBonus: 0, power: 10, color: '#f1f1ef', accent: '#a8b0b5' },
  { id: 'armor1', name: '갑옷씨1', variant: '', probability: 4.7, tier: 'normal', weedBonus: 0, power: 15, color: '#f0f0f3', accent: '#9a98a3' },
  { id: 'armor2', name: '갑옷씨2', variant: '', probability: 4.7, tier: 'normal', weedBonus: 0, power: 15, color: '#f3ece6', accent: '#a8948a' },
  { id: 'armor3', name: '갑옷씨3', variant: '', probability: 4.7, tier: 'normal', weedBonus: 0, power: 15, color: '#fbf6d8', accent: '#c9b24a' },
  { id: 'm_chiikawa', name: '치이카와', variant: '인어의섬', probability: 1.94, tier: 'mermaid', weedBonus: 5, power: 6, color: '#fff4f6', accent: '#8ccf6a' },
  { id: 'm_hachiware', name: '하치와레', variant: '인어의섬', probability: 1.94, tier: 'mermaid', weedBonus: 5, power: 8, color: '#e6f3ff', accent: '#8ccf6a' },
  { id: 'm_usagi', name: '우사기', variant: '인어의섬', probability: 1.94, tier: 'mermaid', weedBonus: 5, power: 9, color: '#fff6d8', accent: '#8ccf6a' },
  { id: 'm_momonga', name: '모몽가', variant: '인어의섬', probability: 1.94, tier: 'mermaid', weedBonus: 5, power: 5, color: '#f1efff', accent: '#8ccf6a' },
  { id: 'm_kurimanju', name: '쿠리만쥬', variant: '인어의섬', probability: 1.94, tier: 'mermaid', weedBonus: 5, power: 3, color: '#f8e9d4', accent: '#8ccf6a' },
  { id: 'm_shisa', name: '시사', variant: '인어의섬', probability: 1.94, tier: 'mermaid', weedBonus: 5, power: 3, color: '#fff0dc', accent: '#8ccf6a' },
  { id: 'm_kani', name: '카니', variant: '인어의섬', probability: 1.94, tier: 'mermaid', weedBonus: 5, power: 3, color: '#ffeef2', accent: '#8ccf6a' },
  { id: 'm_rakko', name: '랏코', variant: '인어의섬', probability: 1.94, tier: 'mermaid', weedBonus: 5, power: 15, color: '#f1f1ef', accent: '#8ccf6a' },
  { id: 'hanip', name: '한잎이', variant: '인어의섬', probability: 1.94, tier: 'mermaid', weedBonus: 10, power: 2, color: '#eeecf3', accent: '#8f88a3' },
  { id: 'duip', name: '두잎이', variant: '인어의섬', probability: 1.94, tier: 'mermaid', weedBonus: 10, power: 2, color: '#eeecf3', accent: '#8f88a3' },
  { id: 'siren', name: '세이렌', variant: '', probability: 0.75, tier: 'rare', weedBonus: 40, power: 20, color: '#ffe9e9', accent: '#d9434f' },
  { id: 'shimajiro', name: '시마지로', variant: '', probability: 0.75, tier: 'rare', weedBonus: 10, power: 30, color: '#f7efe2', accent: '#7a5a46' },
  { id: 'anoko', name: '아노코', variant: '', probability: 0.75, tier: 'rare', weedBonus: 30, power: 25, color: '#fff3e2', accent: '#f0a040' },
  { id: 'dekatsuyo', name: '데카츠요', variant: '', probability: 0.75, tier: 'rare', weedBonus: 25, power: 28, color: '#fff8d6', accent: '#d9b838' },
  { id: 'c_curry', name: '치이카와', variant: '카레', probability: 0.2, tier: 'super', weedBonus: 50, power: 5, color: '#ffe3ea', accent: '#e9799a' },
  { id: 'h_curry', name: '하치와레', variant: '카레', probability: 0.2, tier: 'super', weedBonus: 50, power: 5, color: '#ffe3ea', accent: '#7fa6cc' },
  { id: 'u_curry', name: '우사기', variant: '카레', probability: 0.2, tier: 'super', weedBonus: 50, power: 5, color: '#ffe3ea', accent: '#e9799a' },
  { id: 'ginger_chiikawa', name: '치이카와', variant: '진저맨', probability: 0.2, tier: 'super', weedBonus: 50, power: 10, color: '#ffe5ca', accent: '#c78c55' },
  { id: 'ginger_hachiware', name: '하치와레', variant: '진저맨', probability: 0.2, tier: 'super', weedBonus: 50, power: 10, color: '#ffe5ca', accent: '#c78c55' },
  { id: 'ginger_usagi', name: '우사기', variant: '진저맨', probability: 0.2, tier: 'super', weedBonus: 50, power: 10, color: '#ffe5ca', accent: '#c78c55' },
  { id: 'beetle', name: '풍뎅이', variant: '', probability: 0.2, tier: 'super', weedBonus: 0, power: 1, color: '#f6e6dc', accent: '#a8705a' },
  { id: 'kurimanju_bean', name: '쿠리만쥬', variant: '콩', probability: 0.04, tier: 'legendary', weedBonus: 60, power: 10, color: '#d8f49b', accent: '#84a930' },
  { id: 'rakko_limited', name: '랏코', variant: '한정선', probability: 0.04, tier: 'legendary', weedBonus: 0, power: 50, color: '#fff0ed', accent: '#e84c49' },
  { id: 'beetle_berserk', name: '풍뎅이', variant: '광폭', probability: 0.04, tier: 'legendary', weedBonus: 0, power: 50, color: '#c9a494', accent: '#75452e' },
  { id: 'honey', name: '꿀맛맨', variant: '', probability: 1.94, tier: 'mermaid', weedBonus: 10, power: 13, color: '#e8faff', accent: '#87cde3' },
  { id: 'ode', name: '오데', variant: '', probability: 0.75, tier: 'rare', weedBonus: 25, power: 25, color: '#fff6b2', accent: '#e2bb53' },
  { id: 'ode_prison', name: '오데', variant: '죄수복', probability: 0.2, tier: 'super', weedBonus: 30, power: 40, color: '#fff6b2', accent: '#5e4033' },
  { id: 'usagi_orange', name: '우사기', variant: '귤', probability: 0.04, tier: 'legendary', weedBonus: 60, power: 15, color: '#fff6d8', accent: '#ff963e' },
  { id: 'pajama_chiikawa', name: '치이카와', variant: '파자마', probability: 4.69, tier: 'normal', weedBonus: 0, power: 4, color: '#fff4ed', accent: '#e9a68c' },
  { id: 'pajama_hachiware', name: '하치와레', variant: '파자마', probability: 4.7, tier: 'normal', weedBonus: 0, power: 6, color: '#fff4ed', accent: '#e9a68c' },
  { id: 'pajama_usagi', name: '우사기', variant: '파자마', probability: 4.7, tier: 'normal', weedBonus: 0, power: 7, color: '#fff4ed', accent: '#e9a68c' },
  { id: 'staff_chiikawa', name: '치이카와', variant: '토벌봉', probability: 0.75, tier: 'rare', weedBonus: 0, power: 27, color: '#fff4ed', accent: '#e9a68c' },
  { id: 'staff_hachiware', name: '하치와레', variant: '토벌봉', probability: 0.75, tier: 'rare', weedBonus: 0, power: 27, color: '#fff4ed', accent: '#e9a68c' },
  { id: 'staff_usagi', name: '우사기', variant: '토벌봉', probability: 0.75, tier: 'rare', weedBonus: 0, power: 27, color: '#fff4ed', accent: '#e9a68c' },
  { id: 'angel_momonga', name: '모몽가', variant: '천사', probability: 0.2, tier: 'super', weedBonus: 0, power: 20, color: '#fff4ed', accent: '#e9a68c' },
  { id: 'devil_momonga', name: '모몽가', variant: '악마', probability: 0.2, tier: 'super', weedBonus: 0, power: 20, color: '#fff4ed', accent: '#e9a68c' },
  { id: 'halloween_chiikawa', name: '치이카와', variant: '할로윈', probability: 0, tier: 'legendary', weedBonus: 0, power: 50, color: '#fff0ed', accent: '#d44a4a' },
  { id: 'halloween_hachiware', name: '하치와레', variant: '할로윈', probability: 0, tier: 'legendary', weedBonus: 0, power: 50, color: '#fff0ed', accent: '#d44a4a' },
  { id: 'siren_curry', name: '세이렌', variant: '카레', probability: 0.01, tier: 'transcendent', weedBonus: 70, power: 70, color: '#fff0d8', accent: '#ff8500' },
  { id: 'halloween_usagi', name: '우사기', variant: '할로윈', probability: 0, tier: 'legendary', weedBonus: 0, power: 50, color: '#fff0ed', accent: '#d44a4a' },
] as const

export type CharacterId = (typeof CHARACTERS)[number]['id']
export type GachaSave = { version: 1; gems: number; diamonds?: number; fragments?: number; owned: CharacterId[]; lastDaily: string; lastRoulette?: string; pendingRandomBoxes?: number; attendanceWeek?: string; attendanceCount?: number; freePullDay?: string; freePullUsed?: number }
export type PullResult = { id: CharacterId; duplicate: boolean; bonus: number }
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export const GACHA_SAVE_KEY = 'chiikawa-gacha.save.v1'
export const PULL_COST = 10
export const TEN_PULL_COST = 90
/** Pull sizes and prices: 1회 10, 3회 30, 5회 50, 10회 90 (10회 discount). */
export const PULL_OPTIONS = [
  { count: 1, cost: PULL_COST },
  { count: 3, cost: 30 },
  { count: 5, cost: 50 },
  { count: 10, cost: TEN_PULL_COST },
] as const
export type PullCount = (typeof PULL_OPTIONS)[number]['count']
export const pullCost = (count: PullCount): number => PULL_OPTIONS.find(option => option.count === count)!.cost
export const DAILY_GIFT = 10
export const NEW_ENTRY_BONUS = 10
/** Duplicates no longer give coins. */
export const DUPLICATE_BONUS = 0
/** First-collection reward for the rare friends (세이렌, 시마지로, 아노코, 데카츠요, 카레 3종). */
export const RARE_NEW_BONUS = 50
export const SIREN_NEW_BONUS = RARE_NEW_BONUS
export type Character = (typeof CHARACTERS)[number]
export const characterById = (id: CharacterId): Character => CHARACTERS.find(character => character.id === id)!
/** Name with the 인어의섬 variant, e.g. "치이카와 (인어의섬)". */
export const fullName = (character: Character): string => character.variant ? `${character.name} (${character.variant})` : character.name
/** First-collection reward for one character; rare friends give more. */
export function newEntryBonus(id: CharacterId): number {
  const tier = characterById(id).tier
  return tier === 'rare' || tier === 'super' || tier === 'legendary' || tier === 'transcendent' ? RARE_NEW_BONUS : NEW_ENTRY_BONUS
}
/** Weeding: 1 coin per hour, sped up by the friend's weeding bonus (+10% or +20%). */
export const WEED_HOUR_MS = 60 * 60 * 1000
export function weedIntervalMs(_id: CharacterId): number { return WEED_HOUR_MS }
export function weedCoinsPerHour(id: CharacterId): number {
  return 2 * (1 + characterById(id).weedBonus / 100)
}

export function weedEarnedBetweenSlots(id: CharacterId, fromSlot: number, toSlot: number): number {
  const units = 200 + 2 * characterById(id).weedBonus
  return Math.max(0, Math.floor(toSlot * units / 100 + 1e-7) - Math.floor(fromSlot * units / 100 + 1e-7))
}
const VALID_IDS = new Set<string>(CHARACTERS.map(character => character.id))

export function initialSave(): GachaSave {
  return { version: 1, gems: STARTING_COINS, owned: [], lastDaily: '' }
}

export function parseGachaSave(raw: string | null): GachaSave {
  const base = initialSave()
  if (!raw) return base
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return base
    const data = value as Record<string, unknown>
    if (data.version !== 1) return base
    const owned = Array.isArray(data.owned) ? [...new Set(data.owned.filter((id): id is CharacterId => typeof id === 'string' && VALID_IDS.has(id)))] : []
    const lastDaily = typeof data.lastDaily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.lastDaily) ? data.lastDaily : ''
    const validGems = typeof data.gems === 'number' && Number.isFinite(data.gems) ? Math.max(0, Math.floor(data.gems)) : base.gems
    return {
      version: 1,
      gems: validGems,
      owned,
      lastDaily,
      attendanceWeek: typeof data.attendanceWeek === 'string' ? data.attendanceWeek : '',
      attendanceCount: typeof data.attendanceCount === 'number' ? data.attendanceCount : 0,
    }
  } catch {
    return base
  }
}

export function drawCharacter(random: () => number = Math.random): CharacterId {
  const sample = random()
  const normalized = Number.isFinite(sample) ? Math.max(0, Math.min(sample, 1 - Number.EPSILON)) : 0
  const total = CHARACTERS.reduce((sum, character) => sum + character.probability, 0)
  let threshold = normalized * total
  for (const character of CHARACTERS) {
    threshold -= character.probability
    if (threshold < 0) return character.id
  }
  return [...CHARACTERS].reverse().find(character => character.probability > 0)!.id
}

export function localDay(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function safeLocalStorage(): StorageLike | undefined {
  try { return globalThis.localStorage } catch { return undefined }
}

export class GachaStore {
  data: GachaSave

  constructor(private readonly storage: StorageLike | undefined = safeLocalStorage()) {
    let raw: string | null = null
    try { raw = this.storage?.getItem(GACHA_SAVE_KEY) ?? null } catch { raw = null }
    this.data = parseGachaSave(raw)
  }

  claimDaily(now = new Date()): boolean {
    const today = localDay(now)
    if (this.data.lastDaily === today) return false
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(now)
    const weekDay = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[weekday]
    const monday = new Date(`${today}T12:00:00Z`)
    monday.setUTCDate(monday.getUTCDate() - weekDay + 1)
    const week = monday.toISOString().slice(0, 10)
    const count = this.data.attendanceWeek === week ? (this.data.attendanceCount ?? 0) : 0
    const day = Math.min(7, count + 1)
    this.update({ gems: this.data.gems + (day <= 5 ? day * 10 : 0), lastDaily: today, attendanceWeek: week, attendanceCount: day, pendingRandomBoxes: (this.data.pendingRandomBoxes ?? 0) + (day >= 6 ? 1 : 0) })
    return true
  }

  pull(count: PullCount, random: () => number = Math.random): PullResult[] | null {
    const cost = pullCost(count)
    if (this.data.gems < cost) return null
    let gems = this.data.gems - cost
    const owned = new Set(this.data.owned)
    const results: PullResult[] = []
    for (let i = 0; i < count; i += 1) {
      const id = drawCharacter(random)
      const duplicate = owned.has(id)
      const bonus = duplicate ? DUPLICATE_BONUS : newEntryBonus(id)
      gems += bonus
      owned.add(id)
      results.push({ id, duplicate, bonus })
    }
    this.update({ gems, owned: [...owned] })
    return results
  }

  private update(patch: Partial<GachaSave>): void {
    this.data = { ...this.data, ...patch }
    try { this.storage?.setItem(GACHA_SAVE_KEY, JSON.stringify(this.data)) } catch { /* In-memory play remains available. */ }
  }
}

/** Hunting ground: the enemy has 100 HP and takes the friend's battle power as damage every 5 minutes. */
export const ENEMY_HP = 30_000
export const BATTLE_TICK_MS = 3_000
/** Battle power per friend (mirrors server/game.mjs POWER). */
export const battlePower = (id: CharacterId): number => CHARACTERS.find(item => item.id === id)?.power ?? 0

/** Daily roulette prizes (one spin per day, server decides). Percent values for display. */
export const ROULETTE_PRIZES = [
  { coins: 10, percent: 40 },
  { coins: 20, percent: 25 },
  { coins: 30, percent: 17.5 },
  { coins: 50, percent: 12.5 },
  { coins: 100, percent: 5 },
] as const
