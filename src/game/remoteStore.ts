import { BATTLE_TICK_MS, ENEMY_HP, WEED_HOUR_MS, battlePower, weedIntervalMs } from './collection'
import type { CharacterId, GachaSave, PullCount, PullResult } from './collection'
import { STARTING_COINS } from './collection'
import type { DecoCounts, DecoPullCount, DecoPullResult, HouseLayout } from './decos'

export type AuthUser = { username: string; nickname: string | null; admin?: boolean }
export type WeedMember = { id: CharacterId; since: number }
/** Up to 3 weeding friends (each on its own timer) plus the 풍뎅이 helper flag. */
export type WeedState = { members: WeedMember[]; beetle?: boolean }
export const WEED_MAX = 3
export type BattleState = { id: CharacterId; secondId?: CharacterId | null; since: number; damage: number }
export type PublicUser = { nickname: string; owned: CharacterId[]; decos: string[]; featured: CharacterId | null; me: boolean }
export type MailItem = { id: number; from: string; message: string; coins: number; at: number; seen: boolean; claimed: boolean }
export type SentItem = { id: number; to: string; message: string; coins: number; at: number; seen: boolean; claimed: boolean }
export type Mailbox = { mail: MailItem[]; sent: SentItem[]; max: number; unread: number; sentToday: number; dailyLimit: number }
export type Suggestion = { id: number; from: string; message: string; at: number; reply: string | null; replyAt: number | null; mine: boolean }
export type SuggestBox = { items: Suggestion[]; admin: boolean; todayCount: number; dailyMax: number }
export type CharDupes = Partial<Record<CharacterId, number>>
export const CHAR_SELL_PRICES = { normal: 3, rare: 5, epic: 10, unique: 30 } as const
export const DECO_SELL_PRICE = 5
export const SUGGEST_MAX_CHARS = 50
export const SUGGEST_REPLY_MAX_CHARS = 100
export const MAILBOX_MAX = 10
export const MAIL_MAX_CHARS = 30
export const MAIL_DAILY_COINS = 100
export type HouseCoin = { slot: number; coins: number; x: number; y: number }
export type HouseCoinState = { coin: HouseCoin | null; nextAt: number; now: number }
type AccountPayload = { user: AuthUser | null; dupes?: CharDupes; save?: GachaSave; weed?: WeedState | null; battle?: BattleState | null; decos?: DecoCounts; house?: HouseLayout; now?: number; featured?: CharacterId | null; mailUnread?: number }
export const NICKNAME_RULE = /^[가-힣A-Za-z0-9]{2,6}$/
type ApiError = { error?: string }

export const ERROR_TEXT: Record<string, string> = {
  invalid_username: '아이디는 3~20자의 한글, 영문, 숫자, 밑줄(_)만 쓸 수 있어요.',
  invalid_password: '비밀번호는 6~72자로 입력해 주세요.',
  username_taken: '이미 사용 중인 아이디예요.',
  invalid_credentials: '아이디 또는 비밀번호가 맞지 않아요.',
  too_many_attempts: '로그인 시도가 너무 많아요. 10분 뒤에 다시 시도해 주세요.',
  invalid_nickname: '닉네임은 2~6글자의 한글, 영문, 숫자로 정해 주세요.',
  nickname_taken: '이미 누가 쓰고 있는 닉네임이에요.',
  not_owned: '도감에 등록한 친구만 제초를 보낼 수 있어요.',
  not_weeding: '먼저 제초할 친구를 골라 주세요.',
  not_fighting: '먼저 토벌할 친구를 골라 주세요.',
  busy_battle: '토벌장에 있는 친구는 제초장에 보낼 수 없어요.',
  busy_weed: '제초장에 있는 친구는 토벌장에 보낼 수 없어요.',
  deco_not_owned: '가지고 있는 데코만 배치할 수 있어요.',
  house_full: '데코는 최대 10개까지 놓을 수 있어요.',
  house_friends_full: '친구는 최대 3명까지 데려올 수 있어요.',
  invalid_house: '배치를 저장하지 못했어요. 다시 시도해 주세요.',
  not_enough_coins: '코인이 부족해요. 출석 체크로 코인을 받아보세요!',
  not_enough_diamonds: '다이아 코인이 부족해요. 토벌장에서 모아보세요!',
  mail_too_long: '편지는 30자까지 쓸 수 있어요.',
  mail_bad_coins: '보낼 코인은 0 이상의 정수로 적어 주세요.',
  mail_empty: '편지 내용이나 보낼 코인을 적어 주세요.',
  mail_daily_limit: '코인은 하루에 최대 100코인까지만 보낼 수 있어요.',
  mail_no_user: '받는 사람을 찾을 수 없어요.',
  mail_self: '나에게는 편지를 보낼 수 없어요.',
  weed_full: '제초장에는 최대 3명까지 배치할 수 있어요. 다른 친구를 먼저 쉬게 해 주세요.',
  already_weeding: '이미 제초 중인 친구예요.',
  beetle_is_weeder: '풍뎅이가 이미 제초 중이에요. 다른 친구에게 제초를 맡기고 풍뎅이를 도우미로 배치해 주세요.',
  house_coin_gone: '앗, 코인이 사라졌어요. 새 코인이 떴는지 확인해 보세요!',
  house_coin_taken: '이번 시간 코인은 이미 받았어요.',
  mail_not_found: '이미 지워진 우편이에요.',
  sell_invalid: '팔 수 없는 아이템이에요.',
  sell_not_enough: '팔 수 있는 중복 아이템이 부족해요.',
  sell_placed: '하우스에 놓인 데코는 팔 수 없어요. 먼저 하우스에서 넣어 주세요.',
  suggest_empty: '건의 내용을 적어 주세요.',
  suggest_too_long: '건의는 50자까지 쓸 수 있어요.',
  reply_too_long: '답변은 100자까지 쓸 수 있어요.',
  suggest_daily_limit: '건의는 하루에 5개까지 쓸 수 있어요.',
  suggest_not_found: '이미 지워진 건의예요.',
  admin_only: '운영자만 할 수 있어요.',
  login_required: '다시 로그인해 주세요.',
  starting: '서버를 준비하고 있어요. 잠시 후 다시 시도해 주세요.',
  network: '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
}

export class RequestError extends Error {
  constructor(readonly code: string) { super(code) }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/${path}`, body === undefined
      ? { credentials: 'include', cache: 'no-store' }
      : { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new RequestError('network')
  }
  const data = await response.json().catch(() => ({})) as T & ApiError
  if (!response.ok) throw new RequestError(data.error || 'network')
  return data
}

/** Server-backed coins and collection for the signed-in account. */
export class RemoteGachaStore {
  data: GachaSave = { version: 1, gems: STARTING_COINS, owned: [], lastDaily: '' }
  user: AuthUser | null = null
  weed: WeedState | null = null
  battle: BattleState | null = null
  decos: DecoCounts = {}
  house: HouseLayout = { pieces: [], friends: [] }
  featured: CharacterId | null = null
  mailUnread = 0
  dupes: CharDupes = {}
  /** Server clock minus local clock, so countdowns match the server's payout. */
  private clockOffset = 0

  serverNow(): number { return Date.now() + this.clockOffset }

  /** Coins ready to collect from weeding right now. */
  pendingWeedCoins(): number {
    if (!this.weed) return 0
    const now = this.serverNow()
    return this.weed.members.reduce((sum, m) => sum + Math.max(0, Math.floor((now - m.since) / weedIntervalMs(m.id))), 0) * (this.weed.beetle ? 2 : 1)
  }

  /** Milliseconds until the next weeding coin. */
  nextWeedCoinIn(): number {
    if (!this.weed) return WEED_HOUR_MS
    const now = this.serverNow()
    return Math.min(...this.weed.members.map(m => { const interval = weedIntervalMs(m.id); return interval - (Math.max(0, now - m.since) % interval) }), WEED_HOUR_MS)
  }

  /** Live hunting view: enemies defeated since the last settle, enemy HP left and time to the next attack. */
  battleView(): { kills: number; hp: number; nextIn: number; power: number } {
    if (!this.battle) return { kills: 0, hp: ENEMY_HP, nextIn: BATTLE_TICK_MS, power: 0 }
    const power = battlePower(this.battle.id) + (this.battle.secondId ? battlePower(this.battle.secondId) : 0)
    const elapsed = Math.max(0, this.serverNow() - this.battle.since)
    const total = this.battle.damage + Math.floor(elapsed / BATTLE_TICK_MS) * power
    return { kills: Math.floor(total / ENEMY_HP), hp: ENEMY_HP - (total % ENEMY_HP), nextIn: BATTLE_TICK_MS - (elapsed % BATTLE_TICK_MS), power }
  }

  /** Passive coins per hour from weeding (with speed bonuses and the 풍뎅이 x2) plus battle kills. House coins excluded. */
  weedHourlyRate(): number {
    return (this.weed?.members ?? []).reduce((sum, m) => sum + 3_600_000 / weedIntervalMs(m.id), 0) * (this.weed?.beetle ? 2 : 1)
  }
  hourlyRate(): number {
    const hour = 3_600_000
    const weed = (this.weed?.members ?? []).reduce((sum, m) => sum + hour / weedIntervalMs(m.id), 0) * (this.weed?.beetle ? 2 : 1)
    return weed
  }
  /** Server credits weeding + battle coins without opening those screens. */
  async autoSettle(): Promise<number> {
    const result = await request<{ earned: number; save: GachaSave; weed: WeedState | null; battle: BattleState | null; now: number }>('settle', {})
    this.data = result.save
    this.weed = result.weed
    this.battle = result.battle
    this.clockOffset = result.now - Date.now()
    return result.earned
  }
  lastAutoEarned = 0
  async startBattle(id: CharacterId): Promise<number> {
    return this.applyBattle(await request<BattleResult>('battle/start', { id }))
  }

  async claimBattle(): Promise<number> {
    return this.applyBattle(await request<BattleResult>('battle/claim', {}))
  }

  private applyBattle(result: BattleResult): number {
    this.data = result.save
    this.battle = result.battle
    this.clockOffset = result.now - Date.now()
    return result.earned
  }

  async restore(): Promise<AuthUser | null> {
    const payload = await request<AccountPayload & { autoEarned?: number }>('me')
    this.lastAutoEarned = payload.autoEarned ?? 0
    this.apply(payload)
    return this.user
  }

  async register(username: string, password: string, nickname: string): Promise<void> {
    this.apply(await request<AccountPayload>('auth/register', { username, password, nickname }))
  }

  async setNickname(nickname: string): Promise<void> {
    const result = await request<{ user: AuthUser }>('nickname', { nickname })
    this.user = result.user
  }

  async setFeatured(id: CharacterId): Promise<void> {
    this.featured = (await request<{ featured: CharacterId }>('featured', { id })).featured
  }
  async mailbox(): Promise<Mailbox> {
    const box = await request<Mailbox>('mail')
    this.mailUnread = box.unread
    return box
  }
  async markMailSeen(): Promise<void> {
    await request('mail/seen', {})
    this.mailUnread = 0
  }
  async sendMail(to: string, message: string, coins: number): Promise<Mailbox> {
    const result = await request<Mailbox & { save: GachaSave }>('mail/send', { to, message, coins })
    this.data = result.save
    return result
  }
  async broadcastMail(message: string, coins: number): Promise<{ count: number; coins: number }> {
    return request<{ count: number; coins: number }>('admin/mail/broadcast', { message, coins })
  }
  async deleteMail(id: number, box: 'in' | 'sent'): Promise<{ claimed: number; box: Mailbox }> {
    const result = await request<Mailbox & { claimed: number; save: GachaSave }>('mail/delete', { id, box })
    this.data = result.save
    this.mailUnread = result.unread
    return { claimed: result.claimed, box: result }
  }
  async sell(kind: 'char' | 'deco', id: string, count: number): Promise<number> {
    const result = await request<{ coins: number; save: GachaSave; dupes: CharDupes; decos: DecoCounts }>('sell', { kind, id, count })
    this.data = result.save
    this.dupes = result.dupes
    this.decos = result.decos
    return result.coins
  }
  async suggestions(): Promise<SuggestBox> { return request<SuggestBox>('suggest') }
  async suggest(message: string): Promise<SuggestBox> { return request<SuggestBox>('suggest', { message }) }
  async replySuggestion(id: number, reply: string): Promise<SuggestBox> { return request<SuggestBox>('suggest/reply', { id, reply }) }
  async deleteSuggestion(id: number): Promise<SuggestBox> { return request<SuggestBox>('suggest/delete', { id }) }
  async claimMail(id?: number): Promise<{ claimed: number; box: Mailbox }> {
    const result = await request<Mailbox & { claimed: number; save: GachaSave }>('mail/claim', id == null ? {} : { id })
    this.data = result.save
    this.mailUnread = result.unread
    return { claimed: result.claimed, box: result }
  }
  /** This hour's house coin (null once taken); it disappears when the next one appears at nextAt. */
  async houseCoin(): Promise<HouseCoinState> {
    return request<HouseCoinState>('house/coin')
  }
  async claimHouseCoin(slot: number): Promise<{ coins: number; nextAt: number; now: number }> {
    const result = await request<{ coins: number; save: GachaSave; nextAt: number; now: number }>('house/coin', { slot })
    this.data = result.save
    return result
  }
  /** Read-only look at another user's house. */
  async userHouse(nickname: string): Promise<HouseLayout> {
    return (await request<{ house: HouseLayout }>('users/house', { nickname })).house
  }
  async users(): Promise<PublicUser[]> {
    return (await request<{ users: PublicUser[] }>('users')).users
  }

  async startWeeding(id: CharacterId): Promise<number> {
    return this.applyWeed(await request<WeedResult>('weed/start', { id }))
  }

  isWeeding(id: CharacterId): boolean {
    return Boolean(this.weed?.members.some(m => m.id === id))
  }
  async stopWeeding(id: CharacterId): Promise<number> {
    return this.applyWeed(await request<WeedResult>('weed/stop', { id }))
  }
  /** 풍뎅이 helper in the weeding field (doubles weeding coins while placed). */
  async setBeetle(on: boolean): Promise<number> {
    return this.applyWeed(await request<WeedResult>('weed/beetle', { on }))
  }
  async claimWeeding(): Promise<number> {
    return this.applyWeed(await request<WeedResult>('weed/claim', {}))
  }

  private applyWeed(result: WeedResult): number {
    this.data = result.save
    this.weed = result.weed
    this.clockOffset = result.now - Date.now()
    return result.earned
  }

  async login(username: string, password: string): Promise<void> {
    this.apply(await request<AccountPayload>('auth/login', { username, password }))
  }

  async logout(): Promise<void> {
    await request('auth/logout', {})
    this.apply({ user: null })
  }

  async pull(count: PullCount): Promise<PullResult[]> {
    const result = await request<{ save: GachaSave; dupes?: CharDupes; results: { id: CharacterId; duplicate: boolean; bonus: number }[] }>('pull', { count })
    this.data = result.save
    if (result.dupes) this.dupes = result.dupes
    return result.results
  }

  async playClaw(aligned: boolean): Promise<{ won: boolean; chance: number; prize: string | null }> {
    const result = await request<{ won: boolean; chance: number; prize: string | null; save: GachaSave; decos: DecoCounts }>('claw/play', { aligned })
    this.data = result.save
    this.decos = result.decos
    return { won: result.won, chance: result.chance, prize: result.prize }
  }

  async pullDecos(count: DecoPullCount): Promise<DecoPullResult[]> {
    const result = await request<{ save: GachaSave; decos: DecoCounts; results: DecoPullResult[] }>('deco/pull', { count })
    this.data = result.save
    this.decos = result.decos
    return result.results
  }

  async saveHouse(layout: HouseLayout): Promise<void> {
    this.house = (await request<{ house: HouseLayout }>('house/save', { layout })).house
  }

  /** One spin per 12-hour Korea time window. Returns the winning slot, or null when today's spin was already used. */
  async spinRoulette(): Promise<{ index: number; prize: number } | null> {
    try {
      const result = await request<{ index: number; prize: number; save: GachaSave }>('roulette', {})
      this.data = result.save
      return { index: result.index, prize: result.prize }
    } catch (error) {
      if (error instanceof RequestError && error.message === 'already_spun') {
        this.data = { ...this.data, lastRoulette: `${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}${Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23' }).format(new Date())) < 12 ? 'A' : 'B'}` }
        return null
      }
      throw error
    }
  }
  async claimDaily(): Promise<boolean> {
    const result = await request<{ claimed: boolean; save: GachaSave }>('daily', {})
    this.data = result.save
    return result.claimed
  }

  private apply(payload: AccountPayload): void {
    this.user = payload.user
    this.weed = payload.weed ?? null
    this.battle = payload.battle ?? null
    this.decos = payload.decos ?? {}
    this.house = payload.house ?? { pieces: [], friends: [] }
    this.featured = payload.featured ?? null
    this.mailUnread = payload.mailUnread ?? 0
    this.dupes = payload.dupes ?? {}
    if (typeof payload.now === 'number') this.clockOffset = payload.now - Date.now()
    this.data = payload.save ?? { version: 1, gems: STARTING_COINS, owned: [], lastDaily: '' }
  }
}

type WeedResult = { save: GachaSave; weed: WeedState | null; earned: number; now: number }
type BattleResult = { save: GachaSave; battle: BattleState; earned: number; now: number }
