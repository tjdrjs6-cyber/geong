import './houseRedesign.css'
import { CHARACTERS, characterById, fullName, type CharacterId } from '../game/collection'
import { CHARACTER_IMAGE_URLS } from '../game/characterImageUrls'
import { DECOS, DECO_IMAGE_URLS, HOUSE_MAX_FRIENDS, HOUSE_MAX_PIECES, decoById, type DecoId, type HouseLayout } from '../game/decos'
import type { HouseCoin, RemoteGachaStore } from '../game/remoteStore'

type Selection = { kind: 'piece' | 'friend'; index: number } | null
/** Characters always render above every deco, whatever their position. */
const FRIEND_LAYER = 5000
type Hooks = { toast(text: string): void; error(error: unknown): void; wallet(): void; coinAvailable(available: boolean): void }

const HOUSE_BG_URL = '/assets/bg/house_room_test06.webp'
const WALL_DECO_IDS = new Set<DecoId>(['d21','d29','d31','d32','d33','d34','d39','d40','d44','d46','d48'])
const isWallDeco = (id: DecoId): boolean => WALL_DECO_IDS.has(id)
const withinWall = (x: number,y: number): boolean => y >= 24 && y <= 51 && (x < 48 ? y >= 53 - 0.48 * x : y >= 53 - 0.48 * (100 - x))
const floorY = (x: number): number => 53 + 0.42 * Math.abs(x-50)


/** House background: the user's hand-drawn stone room with a window to the forest. */
export function houseLotMarkup(): string {
  return `<img class="house-bg" src="${HOUSE_BG_URL}" alt="" aria-hidden="true" draggable="false" />`
}

/** House editor: drag pieces around the lot, tap to select, then flip / resize / put away. Saves automatically. */
/** Read-only house picture (used to visit another user's house). */
export function houseVisitMarkup(layout: HouseLayout): string {
  const items = layout.pieces.map(piece => `<div class="house-piece${piece.f ? ' is-flipped' : ''}" style="left:${piece.x}%;top:${piece.y}%;--s:${piece.s};z-index:${Math.round(piece.y * 10)}"><img src="${DECO_IMAGE_URLS[piece.id]}" alt="${decoById(piece.id).name}" draggable="false" /></div>`)
  layout.friends.forEach(friend => {
    const character = characterById(friend.id as CharacterId)
    items.push(`<div class="house-piece house-friend${friend.f ? ' is-flipped' : ''}" style="left:${friend.x}%;top:${friend.y}%;--s:${friend.s ?? 1};z-index:${FRIEND_LAYER + Math.round(friend.y * 10)}"><img src="${CHARACTER_IMAGE_URLS[character.id]}" alt="${fullName(character)}" draggable="false" /></div>`)
  })
  return `<div class="house-lot house-visit">${houseLotMarkup()}<div class="house-items">${items.join('')}</div>${items.length ? '' : '<p class="house-visit-empty">아직 꾸민 데코가 없어요</p>'}</div>`
}

export class HouseView {
  private layout: HouseLayout = { pieces: [], friends: [] }
  private selected: Selection = null
  private tab: 'floor' | 'wall' | 'friend' = 'floor'
  private saveTimer = 0
  private coin: HouseCoin | null = null
  private coinNextAt = 0
  private coinClockSkew = 0
  private coinTimer = 0
  private coinBusy = false
  private wanderTimer = 0
  private drag: { pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null = null

  constructor(private readonly root: HTMLElement, private readonly store: RemoteGachaStore, private readonly hooks: Hooks) {
    const lot = this.lot
    lot.addEventListener('pointerdown', event => this.onPointerDown(event))
    lot.addEventListener('pointermove', event => this.onPointerMove(event))
    lot.addEventListener('pointerup', event => this.onPointerUp(event))
    lot.addEventListener('pointercancel', event => this.onPointerUp(event))
  }

  private get lot(): HTMLElement { return this.root.querySelector<HTMLElement>('.house-lot')! }

  /** Called whenever the house screen opens. */
  open(): void {
    const saved = structuredClone(this.store.house) as HouseLayout & { friend?: HouseLayout['friends'][number] | null }
    this.layout = { pieces: (saved.pieces ?? []).slice(0, HOUSE_MAX_PIECES), friends: (saved.friends ?? (saved.friend ? [saved.friend] : [])).slice(0, HOUSE_MAX_FRIENDS) }
    // Drop anything the player no longer owns (keeps the saved layout valid).
    const used: Partial<Record<DecoId, number>> = {}
    this.layout.pieces = this.layout.pieces.filter(piece => {
      used[piece.id] = (used[piece.id] ?? 0) + 1
      return used[piece.id]! <= (this.store.decos[piece.id] ?? 0)
    })
    this.layout.friends = this.layout.friends.filter(friend => this.store.data.owned.includes(friend.id as CharacterId))
    this.selected = null
    this.render()
    window.clearInterval(this.wanderTimer)
    this.wanderTimer = window.setInterval(() => this.wanderFriends(), 3400)
    this.hooks.coinAvailable(false)
    this.coin = null
    this.renderCoin()
  }

  /** Handles house-specific button actions; returns true when the action was consumed. */
  handle(action: string, button: HTMLElement): boolean {
    if (action === 'house-coin') return true
    if (action === 'house-tab') { this.tab = button.dataset.tab === 'friend' ? 'friend' : button.dataset.tab === 'wall' ? 'wall' : 'floor'; this.renderPanel(); return true }
    if (action === 'house-add' && button.dataset.id) { this.addPiece(button.dataset.id as DecoId); return true }
    if (action === 'house-friend' && button.dataset.id) { this.placeFriend(button.dataset.id as CharacterId); return true }
    if (action === 'house-flip') { this.mutateSelected(item => { item.f = !item.f }); return true }
    if (action === 'house-bigger' || action === 'house-smaller') {
      const step = action === 'house-bigger' ? 0.15 : -0.15
      const selected = this.selected?.kind === 'piece' ? this.layout.pieces[this.selected.index] : this.selected?.kind === 'friend' ? this.layout.friends[this.selected.index] : null
      if (selected) {
        selected.s = Math.round(Math.min(1.6, Math.max(0.6, (selected.s ?? 1) + step)) * 100) / 100
        this.changed()
      }
      return true
    }
    if (action === 'house-remove') {
      if (this.selected?.kind === 'piece') this.layout.pieces.splice(this.selected.index, 1)
      else if (this.selected?.kind === 'friend') this.layout.friends.splice(this.selected.index, 1)
      this.selected = null
      this.changed()
      return true
    }
    if (action === 'house-done') { this.selected = null; this.renderLot(); return true }
    return false
  }

  private get isOpen(): boolean { return this.root.classList.contains('is-active') }
  /** Fetch this hour's coin; re-check when the next one is due (an untaken coin vanishes then). */
  private async loadCoin(): Promise<void> {
    try {
      const state = await this.store.houseCoin()
      this.coin = state.coin
      this.coinNextAt = state.nextAt
      this.coinClockSkew = state.now - Date.now()
      this.hooks.coinAvailable(Boolean(state.coin))
    } catch { this.coin = null }
    this.renderCoin()
    window.clearInterval(this.coinTimer)
    this.coinTimer = window.setInterval(() => {
      if (!this.isOpen) { window.clearInterval(this.coinTimer); return }
      if (Date.now() + this.coinClockSkew >= this.coinNextAt) { void this.loadCoin(); return }
      this.renderCoin()
    }, 15000)
  }
  private renderCoin(): void {
    const button = this.lot.querySelector<HTMLButtonElement>('.house-coin')
    const timer = this.lot.querySelector<HTMLElement>('.house-coin-timer')
    if (!button || !timer) return
    const left = Math.max(0, this.coinNextAt - (Date.now() + this.coinClockSkew))
    const minutes = Math.max(1, Math.ceil(left / 60000))
    if (this.coin) {
      button.hidden = false
      button.style.left = `${this.coin.x}%`
      button.style.top = `${this.coin.y}%`
      button.querySelector<HTMLElement>('.house-coin-amount')!.textContent = `+${this.coin.coins}`
      timer.textContent = `✿ 코인이 떴어요! ${minutes}분 뒤 사라져요`
    } else {
      button.hidden = true
      timer.textContent = this.coinNextAt ? `✿ 다음 코인까지 ${minutes}분` : ''
    }
  }
  private async takeCoin(): Promise<void> {
    if (!this.coin || this.coinBusy) return
    this.coinBusy = true
    const coin = this.coin
    const button = this.lot.querySelector<HTMLElement>('.house-coin')
    button?.classList.add('is-taking')
    try {
      const result = await this.store.claimHouseCoin(coin.slot)
      this.coin = null
      this.hooks.coinAvailable(false)
      this.coinNextAt = result.nextAt
      this.hooks.wallet()
      this.hooks.toast(`✿ 코인 ${result.coins}개를 주웠어요!`)
    } catch (error) {
      this.hooks.error(error)
      await this.loadCoin()
    } finally {
      this.coinBusy = false
      button?.classList.remove('is-taking')
      this.renderCoin()
    }
  }
  /** Deco positions are stored on a simple 10-column floor grid. */
  private snap(value: number, low: number, high: number): number {
    return Math.min(high, Math.max(low, Math.round(value / 8) * 8))
  }

  /** Visual-only wandering; does not overwrite the player's saved positions. */
  private wanderFriends(): void {
    if (!this.isOpen || this.drag || this.selected?.kind === 'friend') return
    this.lot.querySelectorAll<HTMLElement>('.house-friend').forEach((node, index) => {
      const friend = this.layout.friends[index]
      if (!friend) return
      const dx = (Math.random() - 0.5) * 17
      const dy = (Math.random() - 0.5) * 9
      node.style.left = `${Math.max(25, Math.min(77, friend.x + dx))}%`
      node.style.top = `${Math.max(58, Math.min(79, friend.y + dy))}%`
      node.classList.toggle('is-walking-left', dx < 0)
    })
  }

  private remaining(id: DecoId): number {
    return (this.store.decos[id] ?? 0) - this.layout.pieces.filter(piece => piece.id === id).length
  }

  private addPiece(id: DecoId): void {
    if (this.remaining(id) <= 0) { this.hooks.toast('이 데코는 모두 꺼내 놓았어요.'); return }
    if (this.layout.pieces.length >= HOUSE_MAX_PIECES) { this.hooks.toast(`데코는 최대 ${HOUSE_MAX_PIECES}개까지 놓을 수 있어요.`); return }
    const jitter = (this.layout.pieces.length % 5) * 4 - 8
    this.layout.pieces.push({ id, x: this.snap(50 + jitter, 12, 88), y: isWallDeco(id) ? 43 : 70, s: 1, f: false })
    this.selected = { kind: 'piece', index: this.layout.pieces.length - 1 }
    this.hooks.toast(`${decoById(id).name} 설치 완료! 칸을 따라 끌어서 배치하세요.`)
    this.changed()
  }

  private placeFriend(id: CharacterId): void {
    const existing = this.layout.friends.findIndex(friend => friend.id === id)
    if (existing >= 0) {
      // Tapping a friend who is already here sends them home.
      this.layout.friends.splice(existing, 1)
      this.selected = null
      this.hooks.toast(`${fullName(characterById(id))}이(가) 집으로 돌아갔어요.`)
      this.changed()
      return
    }
    if (this.layout.friends.length >= HOUSE_MAX_FRIENDS) { this.hooks.toast(`친구는 최대 ${HOUSE_MAX_FRIENDS}명까지 데려올 수 있어요.`); return }
    const slot = [55, 38, 70][this.layout.friends.length] ?? 50
    this.layout.friends.push({ id, x: slot, y: 72, s: 1, f: false })
    this.selected = { kind: 'friend', index: this.layout.friends.length - 1 }
    this.hooks.toast(`${fullName(characterById(id))}이(가) 하우스에 놀러 왔어요!`)
    this.changed()
  }

  private mutateSelected(change: (item: { f: boolean }) => void): void {
    if (this.selected?.kind === 'piece') change(this.layout.pieces[this.selected.index])
    else if (this.selected?.kind === 'friend' && this.layout.friends[this.selected.index]) change(this.layout.friends[this.selected.index])
    else return
    this.changed()
  }

  private changed(): void {
    this.render()
    this.setSaveState('저장 중…')
    window.clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(() => { void this.save() }, 700)
  }

  private async save(): Promise<void> {
    try {
      await this.store.saveHouse(this.layout)
      this.setSaveState('저장됨 ✓')
    } catch (error) {
      this.setSaveState('저장 실패')
      this.hooks.error(error)
    }
  }

  private setSaveState(text: string): void {
    const node = this.root.querySelector<HTMLElement>('.house-save')
    if (node) node.textContent = text
  }

  private render(): void { this.renderLot(); this.renderPanel() }

  private renderLot(): void {
    const layer = this.lot.querySelector<HTMLElement>('.house-items')
    if (!layer) return
    const pieces = this.layout.pieces.map((piece, index) => {
      const selected = this.selected?.kind === 'piece' && this.selected.index === index
      return `<div class="house-piece${selected ? ' is-selected' : ''}${piece.f ? ' is-flipped' : ''}" data-kind="piece" data-index="${index}" style="left:${piece.x}%;top:${piece.y}%;--s:${piece.s};z-index:${Math.round(piece.y * 10)}"><img src="${DECO_IMAGE_URLS[piece.id]}" alt="${decoById(piece.id).name}" draggable="false" /></div>`
    })
    this.layout.friends.forEach((friend, index) => {
      const character = characterById(friend.id as CharacterId)
      const selected = this.selected?.kind === 'friend' && this.selected.index === index
      pieces.push(`<div class="house-piece house-friend${selected ? ' is-selected' : ''}${friend.f ? ' is-flipped' : ''}" data-kind="friend" data-index="${index}" style="left:${friend.x}%;top:${friend.y}%;--s:${friend.s ?? 1};z-index:${FRIEND_LAYER + Math.round(friend.y * 10)}"><img src="${CHARACTER_IMAGE_URLS[character.id]}" alt="${fullName(character)}" draggable="false" /></div>`)
    })
    layer.innerHTML = pieces.join('')
    this.lot.classList.toggle('house-grid-visible', this.selected?.kind === 'piece')
    const empty = this.lot.querySelector<HTMLElement>('.house-empty')
    if (empty) empty.hidden = pieces.length > 0
    const tools = this.root.querySelector<HTMLElement>('.house-tools')
    if (tools) {
      tools.hidden = !this.selected
      const label = tools.querySelector<HTMLElement>('.house-tools-name')
      if (label) label.textContent = this.selected?.kind === 'piece' ? decoById(this.layout.pieces[this.selected.index].id).name : this.selected?.kind === 'friend' && this.layout.friends[this.selected.index] ? characterById(this.layout.friends[this.selected.index].id as CharacterId).name : ''
      tools.querySelectorAll<HTMLButtonElement>('[data-action="house-bigger"],[data-action="house-smaller"]').forEach(button => { button.hidden = !this.selected })
    }
  }

  private renderPanel(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-action="house-tab"]').forEach(button => {
      const active = button.dataset.tab === this.tab
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-selected', String(active))
    })
    const list = this.root.querySelector<HTMLElement>('.house-inventory')
    if (!list) return
    if (this.tab !== 'friend') {
      const owned = DECOS.filter(deco => (this.store.decos[deco.id] ?? 0) > 0 && isWallDeco(deco.id) === (this.tab === 'wall'))
      list.innerHTML = owned.length
        ? owned.map(deco => {
          const left = this.remaining(deco.id)
          return `<button class="house-slot${left <= 0 ? ' is-used' : ''}" data-action="house-add" data-id="${deco.id}" role="listitem"><img src="${DECO_IMAGE_URLS[deco.id]}" alt="" /><span>${deco.name}</span><em>${left} / ${this.store.decos[deco.id]}</em></button>`
        }).join('')
        : '<p class="weed-empty">아직 데코가 없어요. 가챠 화면에서 "데코 뽑기"로 데코를 모아 보세요!</p>'
    } else {
      const owned = CHARACTERS.filter(character => this.store.data.owned.includes(character.id))
      list.innerHTML = owned.length
        ? owned.map(character => {
          const here = this.layout.friends.some(friend => friend.id === character.id)
          const label = here ? '배치 중 · 탭하면 돌려보내기' : character.variant ? character.variant : '데려오기'
          return `<button class="house-slot${here ? ' is-active' : ''}" data-action="house-friend" data-id="${character.id}" role="listitem"><img src="${CHARACTER_IMAGE_URLS[character.id]}" alt="" /><span>${character.name}</span><em>${label}</em></button>`
        }).join('')
        : `<p class="weed-empty">가챠에서 친구를 뽑으면 하우스에 최대 ${HOUSE_MAX_FRIENDS}명까지 데려올 수 있어요.</p>`
    }
    const count = this.root.querySelector<HTMLElement>('.house-count')
    if (count) count.textContent = this.tab !== 'friend' ? `데코 ${this.layout.pieces.length} / ${HOUSE_MAX_PIECES}` : `친구 ${this.layout.friends.length} / ${HOUSE_MAX_FRIENDS}`
    const friendTab = this.root.querySelector<HTMLElement>('[data-action="house-tab"][data-tab="friend"]')
    if (friendTab) friendTab.textContent = `🐾 친구 ${this.layout.friends.length} / ${HOUSE_MAX_FRIENDS}`
    const floorTab = this.root.querySelector<HTMLElement>('[data-action="house-tab"][data-tab="floor"]')
    if (floorTab) floorTab.textContent = `🪑 데코(바닥)`
    const wallTab = this.root.querySelector<HTMLElement>('[data-action="house-tab"][data-tab="wall"]')
    if (wallTab) wallTab.textContent = `🖼 데코(벽)`
  }

  private onPointerDown(event: PointerEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('.house-piece')
    if (!target) {
      if (this.selected) { this.selected = null; this.renderLot() }
      return
    }
    event.preventDefault()
    const kind = target.dataset.kind
    this.selected = { kind: kind === 'friend' ? 'friend' : 'piece', index: Number(target.dataset.index) }
    const item = this.selectedItem()
    if (!item) return
    this.drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: item.x, originY: item.y, moved: false }
    this.lot.setPointerCapture(event.pointerId)
    this.renderLot()
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return
    const item = this.selectedItem()
    if (!item) return
    const rect = this.lot.getBoundingClientRect()
    const dx = (event.clientX - this.drag.startX) / rect.width * 100
    const dy = (event.clientY - this.drag.startY) / rect.height * 100
    if (Math.abs(dx) + Math.abs(dy) > 0.6) this.drag.moved = true
    item.x = this.selected?.kind === 'piece' ? this.snap(this.drag.originX + dx, 18, 82) : Math.round(Math.min(82, Math.max(18, this.drag.originX + dx)) * 10) / 10
    if (this.selected?.kind === 'piece') {
      const piece = this.layout.pieces[this.selected.index]
      const wall = isWallDeco(piece.id)
      const candidate = this.snap(this.drag.originY + dy, wall ? 27 : 54, wall ? 51 : 83)
      item.y = wall ? Math.max(27, Math.min(51, Math.max(53 - 0.48 * Math.min(item.x,100-item.x), candidate))) : Math.max(floorY(item.x), candidate)
    } else item.y = Math.round(Math.min(80, Math.max(54, this.drag.originY + dy)) * 10) / 10
    const isFriend = this.selected?.kind === 'friend'
    const node = this.lot.querySelector<HTMLElement>(`.house-piece[data-kind="${isFriend ? 'friend' : 'piece'}"][data-index="${this.selected!.index}"]`)
    if (node) { node.style.left = `${item.x}%`; node.style.top = `${item.y}%`; node.style.zIndex = String((isFriend ? FRIEND_LAYER : 0) + Math.round(item.y * 10)) }
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return
    const moved = this.drag.moved
    this.drag = null
    if (this.lot.hasPointerCapture(event.pointerId)) this.lot.releasePointerCapture(event.pointerId)
    if (moved) this.changed()
  }

  private selectedItem(): { x: number; y: number } | null {
    if (this.selected?.kind === 'piece') return this.layout.pieces[this.selected.index] ?? null
    if (this.selected?.kind === 'friend') return this.layout.friends[this.selected.index] ?? null
    return null
  }
}
