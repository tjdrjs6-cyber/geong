const BATTLE_STAGE_REWARDS: [number, number][] = [[1,0],[1,0],[2,0],[2,0],[3,0],[3,1],[4,1],[4,1],[5,1],[5,1],[6,2],[6,2],[7,2],[7,2],[8,2],[8,3],[9,3],[9,3],[10,3],[10,3],[11,4],[11,4],[12,4],[12,4],[13,4],[13,5],[14,5],[14,5],[15,5],[15,5],[16,6],[16,6],[17,6],[17,6],[18,6],[18,7],[19,7],[19,7],[20,7],[20,7]];
const stageRewards = (stage: number): [number, number] => BATTLE_STAGE_REWARDS[stage - 1] ?? [31 + Math.max(0,stage - 40), 7];
const WEAPON_ACCESSORIES = [
  {id:'chiikawa_keyring',name:'치이카와 키링',image:'/assets/accessories/chiikawa_keyring.png?v=040'},
  {id:'hachiware_keyring',name:'하치와레 키링',image:'/assets/accessories/hachiware_keyring.png?v=040'},
  {id:'usagi_keyring',name:'우사기 키링',image:'/assets/accessories/usagi_keyring.png?v=040'},
  {id:'momonga_keyring',name:'모몽가 키링',image:'/assets/accessories/momonga_keyring.png?v=040'},
  {id:'kurimanju_keyring',name:'쿠리만쥬 키링',image:'/assets/accessories/kurimanju_keyring.png?v=040'},
  {id:'shisa_keyring',name:'시사 키링',image:'/assets/accessories/shisa_keyring.png?v=040'},
  {id:'kani_keyring',name:'카니 키링',image:'/assets/accessories/kani_keyring.png?v=040'},
  {id:'rakko_keyring',name:'랏코 키링',image:'/assets/accessories/rakko_keyring.png?v=040'},
 ] as const
const ALCHEMY_GRADES=[{id:'normal',name:'노말',power:1,color:'#aaa'},{id:'rare',name:'레어',power:3,cost:3,fragments:30,color:'#4ba7ff'},{id:'epic',name:'에픽',power:5,cost:3,fragments:50,color:'#ff5050'},{id:'unique',name:'유니크',power:10,cost:3,fragments:150,color:'#ad59ff'},{id:'legendary',name:'레전더리',power:20,cost:3,fragments:300,color:'#ffd337'},{id:'transcendent',name:'초월',power:30,cost:3,fragments:500,color:'#ff8500'}] as const
const accessoryInfo=(id:string|null)=>WEAPON_ACCESSORIES.find(item=>item.id===id)
// Enhancement aura tiers are visual-only and never affect weapon stats.
function equippedAccessoryPower(equipped: string | null | undefined, grade: string | null | undefined): number {
  return equipped ? (ALCHEMY_GRADES.find(g => g.id === (grade || 'normal'))?.power ?? 0) : 0
}
function weaponAuraClass(level: number): string {
  return level >= 25 ? 'aura-25' : level >= 23 ? 'aura-23' : level >= 20 ? 'aura-20' : level >= 17 ? 'aura-17' : level >= 15 ? 'aura-15' : level >= 13 ? 'aura-13' : level >= 10 ? 'aura-10' : ''
}
import type { Mailbox, SuggestBox } from '../game/remoteStore'
import type { Audio } from '../engine/audio'
import { BATTLE_TICK_MS, ENEMY_HP, battlePower, CHARACTERS, DAILY_GIFT, NEW_ENTRY_BONUS, RARE_NEW_BONUS, PULL_OPTIONS, characterById, fullName, type Character, pullCost, STARTING_COINS, ROULETTE_PRIZES, type CharacterId, type PullCount, type PullResult } from '../game/collection'
import { CHARACTER_IMAGE_URLS } from '../game/characterImageUrls'
import { ERROR_TEXT, NICKNAME_RULE, RemoteGachaStore, WEED_MAX, RequestError, type PublicUser, type ExpeditionState, type RpsState, type ProfilePrivacy, MAIL_MAX_CHARS, MAIL_DAILY_COINS, CHAR_SELL_PRICES, DECO_SELL_PRICE, SUGGEST_MAX_CHARS, SUGGEST_REPLY_MAX_CHARS, MAILBOX_MAX } from '../game/remoteStore'
import { weedFieldMarkup } from './weedField'
import { battleFieldMarkup } from './battleField'
import { HouseView, houseLotMarkup, houseVisitMarkup } from './houseView'
import { DECOS, DECO_IMAGE_URLS, DECO_NEW_BONUS, DECO_PROBABILITY, DECO_PULL_OPTIONS, decoById, decoPullCost, type DecoId, type DecoPullCount, type DecoPullResult } from '../game/decos'
import { machineMarkup } from './toonMachine'

const MACHINE_SPIN_SECONDS = 1.6
/** Grades: 일반 · 레어(인어의섬) · 에픽(세이렌·시마지로·아노코·데카츠요) · 유니크(카레·풍뎅이). */
const tierTag = (character: Character): string => character.tier === 'transcendent' ? '★ 초월' : character.tier === 'legendary' ? '★ 레전더리' : character.tier === 'super' ? '★ 유니크' : character.tier === 'rare' ? '★ 에픽' : character.tier === 'mermaid' ? '레어' : '노멀'
const bonusTag = (character: Character): string => `${character.weedBonus ? `제초속도 +${character.weedBonus}%<br>` : ''}전투력 ${character.power}`

type Screen = 'boot' | 'auth' | 'nickname' | 'title' | 'catalog' | 'collection' | 'decos' | 'result' | 'users' | 'roulette' | 'weed' | 'battle' | 'house' | 'mail' | 'storage' | 'suggest' | 'featured' | 'claw' | 'announcements' | 'global-chat' | 'expedition' | 'rps' | 'shop' | 'forge'
/** One capsule shown in the 뿅 reveal and the result list (character or deco). */
type RevealItem = { image: string; name: string; variant?: string; rare: boolean; grade?: string; tag: string; chance: number; color: string; accent: string; sub: string }
type Actions = { retry(): void }

function mailTime(at: number): string {
  const diff = Date.now() - at
  if (diff < 60000) return '방금'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`
  return new Date(at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

export class GachaUi {
  screen: Screen = 'boot'
  private readonly root = document.getElementById('ui')!
  private battleAnimationKey = ''
  private toastTimer = 0
  private wheelSpinning = false
  private wheelTurn = 0
  private results: RevealItem[] = []
  private resultKind: 'char' | 'deco' = 'char'
  private house!: HouseView
  private houseBadgeBusy = false
  private userTab: 'char' | 'deco' | 'accessory' | 'house' = 'char'
  private mailTab: 'in' | 'sent' = 'in'
  private wildWeedHold = 0
  private wildWeedCountdown = 0
  private wildWeedTargetId = 0
  private wildWeedBusy = false
  private wildWeedLastSlot = -1
  private shopTab: 'buy' | 'sell' = 'buy'
  private storageTab: 'char' | 'deco' | 'accessory' | 'inventory' = 'char'
  private shopSellTab: 'char' | 'deco' | 'inventory' = 'char'
  private noticeTimer = 0
  private chatTimer = 0
  private chatBadgeTimer = 0
  private chatNextAt = 0
  private revealing = false
  private revealSequence = 0
  private busy = false
  private authMode: 'login' | 'register' = 'login'
  private weedTimer = 0
  private lastEnemyHp = -1
  private battleSyncing = false
  private clawX = 88
  private clawY = 15
  private clawHoldTimer: number | undefined
  private clawHoldDelay: number | undefined
  private clawIgnoreClick = false
  private clawToys: { id: string; name: string; x: number; y: number }[] = []
  private clawToysOwner = ''
  private clawTargetId: string | null = null
  private clawBusy = false
  private lotteryState: {remaining:number[];total:number;price:number;resetNoticeId?:number;winners?:{nickname:string;grade:string}[]}|null=null
  private lotteryResults: {grade:string;id:string|null;accessoryId?:string|null;accessoryGrade?:string|null;duplicate:boolean;bonus?:number}[]=[]
  private lotteryRevealed=0
  private lotteryTimer=0
  private lotteryBusy=false
  private lotteryPointerStart=0
  private lotteryRefreshing=0
  private rpsState: RpsState | null = null
  private rpsTimer = 0
  private rpsResolving = false
  private expedition: ExpeditionState | null = null
  private expeditionPrefetch: Promise<ExpeditionState> | null = null
  private expeditionServer = 1
  private expeditionPendingDamage = new Map<number, number>()
  private expeditionImpactTimer = 0
  private expeditionImpactServer = 0
  private expeditionPreviousHp = new Map<number, number>()
  private expeditionPreviousStage = new Map<number, number>()
  private expeditionTransitionTimer: ReturnType<typeof setTimeout> | undefined
  private expeditionTimer = 0
  private expeditionLoading = false
  private expeditionBadgeCheckedAt = 0
  private expeditionBadgeDay = ''
  private users: PublicUser[] = []
  private userSortMode: 'name' | 'level' = 'name'
  private privacy: ProfilePrivacy = { char: true, deco: true, house: true }
  private diamondNextAt: number | null = null
  private diamondServerOffset = 0
  private diamondRechargeError = false
  private diamondRefreshBusy = false
  private diamondLastRefresh = 0

  constructor(private readonly store: RemoteGachaStore, private readonly audio: Audio, private readonly actions: Actions) {
    this.root.innerHTML = this.template()
    // The draw dialog must be a sibling of the lobby, not a child of its bottom toolbar.
    const drawDialog=this.root.querySelector<HTMLElement>('.pull-popup')
    if(drawDialog) this.root.append(drawDialog)
    this.root.addEventListener('click', event => { void this.onClick(event) })
    this.root.addEventListener('pointerdown', event => {
      const target=(event.target as HTMLElement).closest<HTMLElement>('.wild-weed-pick')
      if(!target || this.wildWeedBusy)return
      event.preventDefault()
      target.classList.add('is-holding')
      this.wildWeedTargetId=Number(target.dataset.weedId)
      window.clearTimeout(this.wildWeedHold)
      const duration=target.dataset.weedType==='golden'?2520:1680
      const started=performance.now()
      const label=target.querySelector<HTMLElement>('.wild-weed-hold-text')
      if(label)label.textContent=`남은 시간 ${(duration/1000).toFixed(1)}초`
      const update=()=>{if(!target.classList.contains('is-holding'))return;const remain=Math.max(0,(duration-(performance.now()-started))/1000);if(label)label.textContent=`남은 시간 ${remain.toFixed(1)}초`;this.wildWeedCountdown=window.setTimeout(update,50)}
      window.clearTimeout(this.wildWeedCountdown);update()
      this.wildWeedHold=window.setTimeout(()=>{window.clearTimeout(this.wildWeedCountdown);target.classList.remove('is-holding');void this.pickWildWeed(Number(target.dataset.weedId))},duration)
    })
    const cancelWeedHold=()=>{window.clearTimeout(this.wildWeedCountdown);window.clearTimeout(this.wildWeedHold);this.root.querySelectorAll('.wild-weed-pick').forEach(el=>el.classList.remove('is-holding'))}
    window.addEventListener('pointerup',cancelWeedHold)
    window.addEventListener('pointercancel',cancelWeedHold)
    window.addEventListener('blur',cancelWeedHold)
    // Press-and-hold arrows continuously move the claw; release stops immediately.
    this.root.addEventListener('pointerdown', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.claw-arrows button[data-action]')
      if (!button || this.clawBusy) return
      event.preventDefault()
      this.clawIgnoreClick = true
      this.moveClaw(button.dataset.action ?? '')
      this.stopClawHold()
      this.clawHoldDelay = window.setTimeout(() => {
        this.clawHoldTimer = window.setInterval(() => this.moveClaw(button.dataset.action ?? ''), 38)
      }, 170)
    })
    window.addEventListener('pointerup', () => this.stopClawHold())
    window.addEventListener('pointercancel', () => this.stopClawHold())
    window.addEventListener('blur', () => this.stopClawHold())
    window.setInterval(() => { void this.tickSettle(); if (this.screen === 'title') { void this.refreshExpeditionBadge(true); if (Math.floor(this.store.serverNow()/3600000) > this.wildWeedLastSlot) void this.loadWildWeed() } void this.refreshRpsBadge() }, 60_000)
    this.root.querySelector<HTMLFormElement>('.auth-form')?.addEventListener('submit', event => { event.preventDefault(); void this.submitAuth() })
    this.root.querySelector<HTMLFormElement>('.nickname-form')?.addEventListener('submit', event => { event.preventDefault(); void this.submitNickname() })
    this.house = new HouseView(this.root.querySelector<HTMLElement>('.house-screen')!, this.store, { toast: text => this.toast(text), error: error => this.handleError(error), wallet: () => this.renderWallet(), coinAvailable: available => this.setHouseCoinDot(available) })
    this.renderWallet()
    window.setInterval(() => this.tickDiamondRecharge(), 1000)
    void this.refreshDiamondRecharge()
    this.renderCollection()
    void this.refreshExpeditionBadge(true)
    void this.refreshRpsBadge()
    void this.refreshHouseCoinBadge()
    window.setInterval(() => { if (this.screen === 'title') void this.refreshHouseCoinBadge(); void this.refreshAchievementReadyBadge() }, 30_000)
    this.chatBadgeTimer = window.setInterval(() => { if (this.screen === 'title') void this.refreshGlobalChatDot(); void this.refreshExpeditionBadge() }, 12000)
    // Keep the 2D stage (floor + name tag) clear of the bottom controls, whatever their height.
    const fitStage = (): void => {
      const screen = this.root.querySelector<HTMLElement>('[data-screen="title"]')
      const actions = this.root.querySelector<HTMLElement>('.gacha-actions')
      if (!screen || !actions) return
      const gap = screen.getBoundingClientRect().bottom - actions.getBoundingClientRect().top
      if (gap > 0) screen.style.setProperty('--actions-h', `${Math.round(gap + 10)}px`)
    }
    const actionsEl = this.root.querySelector<HTMLElement>('.gacha-actions')
    if (actionsEl && 'ResizeObserver' in window) new ResizeObserver(fitStage).observe(actionsEl)
    window.addEventListener('resize', fitStage)
    requestAnimationFrame(fitStage)
  }

  show(screen: Screen): void {
    // Prizes are granted atomically on purchase; leaving only dismisses the reveal animation.
    if (this.screen === 'rps' && screen !== 'rps' && this.lotteryResults.length) this.skipLottery()
    this.screen = screen
    if (screen !== 'lobby') { const popup=this.root.querySelector<HTMLElement>('.pull-popup'); if(popup)popup.hidden=true }
    if (screen !== 'users') {
      const usersCard = this.root.querySelector<HTMLElement>('.gacha-modal[data-screen="users"] .users-card')
      usersCard?.classList.remove('privacy-mode')
      usersCard?.querySelector<HTMLButtonElement>(':scope > button.modal-primary[data-action="close"]')?.removeAttribute('hidden')
    }
    if (screen === 'result') this.revealing = false
    this.root.querySelectorAll<HTMLElement>('[data-screen]').forEach(node => {
      const active = node.dataset.screen === screen
      node.classList.toggle('is-active', active)
      node.setAttribute('aria-hidden', String(!active))
    })
    this.root.dataset.activeScreen = screen
    window.clearInterval(this.expeditionTimer)
    if (screen === 'expedition') {this.expeditionPendingDamage.clear();void this.loadExpedition();this.expeditionTimer=window.setInterval(()=>void this.loadExpedition(),3000)} else {window.clearInterval(this.expeditionImpactTimer);this.expeditionImpactTimer=0}
    window.clearInterval(this.rpsTimer)
    window.clearInterval(this.lotteryTimer)
    if(screen==='rps'){void this.openLottery();window.clearInterval(this.lotteryRefreshing);this.lotteryRefreshing=window.setInterval(()=>{if(this.screen==='rps'&&!this.lotteryResults.length)void this.refreshLotteryLive()},5000)}else{window.clearInterval(this.lotteryRefreshing)}
    if (screen === 'collection') this.renderCollection()
    if (screen === 'decos') this.renderDecoCollection()
    if (screen === 'claw') { this.restoreClawToys(); this.resetClawToExit(); this.renderClaw() }
    if (screen === 'forge') {void this.openForge()}
    if (screen === 'mail') void this.loadMail()
    if (screen === 'announcements') void this.loadAnnouncements()
    window.clearInterval(this.chatTimer)
    if (screen === 'global-chat') { void this.loadGlobalChat(); this.chatTimer = window.setInterval(() => void this.loadGlobalChat(true), 4000) }
    if (screen === 'storage') {this.renderStorage();void this.loadWildWeed()}
    if (screen === 'suggest') void this.loadSuggest()
    if (screen === 'featured') this.renderFeaturedPicker()
    if (screen === 'house') this.house.open()
    if (screen === 'title' && this.store.user) window.setTimeout(() => this.showUpdateNoticeOnce(), 120)
    if (screen === 'title') { this.prefetchQuickPanels(); void this.loadWildWeed(); requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); this.renderWallet(); this.renderCollection(); this.renderHero(); this.refreshMailBadge(); void this.refreshAnnouncementDot(); void this.refreshGlobalChatDot(); void this.refreshExpeditionBadge(true); void this.refreshRpsBadge(); void this.refreshHouseCoinBadge(); void this.refreshAchievementReadyBadge() }
    window.clearInterval(this.weedTimer)
    if (screen === 'weed') { this.renderWeed(); void this.loadWildWeed(); this.weedTimer = window.setInterval(() => {this.renderWeedStatus();if(this.store.wildWeed && Math.floor(this.store.serverNow()/3600000)>this.wildWeedLastSlot)void this.loadWildWeed()}, 1000) }

    if (screen === 'battle') { void this.refreshAchievementCombatLabels(); this.lastEnemyHp = -1; this.renderBattle(); this.weedTimer = window.setInterval(() => this.renderBattleStatus(), 100) }
    if (screen === 'nickname') window.setTimeout(() => this.root.querySelector<HTMLInputElement>('#nickname-input')?.focus(), 50)
    if (screen === 'auth') window.setTimeout(() => this.root.querySelector<HTMLInputElement>('#auth-username')?.focus(), 50)
  }

  setBootProgress(progress: number): void {
    const bar = this.root.querySelector<HTMLElement>('.boot-fill')
    const bounded = Math.max(0.05, Math.min(1, progress))
    if (bar) bar.style.transform = `scaleX(${bounded})`
    this.root.querySelector('.boot-track')?.setAttribute('aria-valuenow', String(Math.round(bounded * 100)))
  }

  private openAttendancePopup(): void {
    document.getElementById('attendance-popup')?.remove()
    const now = new Date()
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(now)
    const dayOfWeek = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[weekday]
    const monday = new Date(`${today}T12:00:00Z`)
    monday.setUTCDate(monday.getUTCDate() - dayOfWeek + 1)
    const week = monday.toISOString().slice(0, 10)
    const count = this.store.data.attendanceWeek === week ? (this.store.data.attendanceCount ?? 0) : 0
    const claimed = this.store.data.lastDaily === today
    const next = Math.min(7, count + 1)
    const popup = document.createElement('dialog')
    popup.id = 'attendance-popup'
    popup.setAttribute('aria-label', '출석체크 보상')
    popup.innerHTML = `<div class="attendance-popup-inner"><button type="button" class="attendance-close" aria-label="닫기">×</button><h2><img class="attendance-kani-title" src="/assets/attendance_kani.png" alt="카니"/> 출석 체크</h2><p>매주 월요일 초기화 · 누적 출석 ${count}일</p><div class="attendance-reward-grid">${Array.from({length:7},(_,i)=>`<div class="attendance-reward ${i<count?'received':''} ${i+1===next&&!claimed?'upcoming':''}"><small>${i+1}일차</small><span>${i<5?'<img class="attendance-coin-image" src="/assets/coin.png" alt="코인"/>':'🎁'}</span><b>${i<5?`${(i+1)*10}코인`:'랜덤박스 1개'}</b>${i<count?'<em>수령 완료</em>':''}</div>`).join('')}</div><button type="button" class="attendance-claim" ${claimed?'disabled':''}>${claimed?'오늘 출석 완료':'출석 보상 받기'}</button></div>`
    document.body.appendChild(popup)
    popup.querySelector('.attendance-close')?.addEventListener('click', () => popup.close())
    popup.addEventListener('click', event => { if (event.target === popup) popup.close() })
    popup.addEventListener('close', () => popup.remove())
    popup.querySelector('.attendance-claim')?.addEventListener('click', async () => {
      if (this.busy) return
      this.busy = true
      try {
        const reward = await this.store.claimDaily()
        if (reward.claimed) {
          this.audio.play('pickup')
          popup.close()
          this.toast(reward.boxes ? '출석 완료! 랜덤박스 1개를 받았어요.' : `출석 완료! ${reward.coins}코인을 받았어요.`)
        } else { popup.close(); this.toast('오늘은 이미 출석했어요.') }
      } catch (error) { this.handleError(error) } finally { this.busy = false; this.renderWallet() }
    })
    popup.showModal()
  }

  private template(): string {
    return `
      <section class="gacha-boot is-active" data-screen="boot" aria-live="polite">
        <div class="boot-capsule"><img src="/assets/chars/chiikawa_tab_icon.png" alt="치이카와 얼굴" width="58" height="58" /></div>
        <h1>겅이마켓</h1>
        <div class="boot-track" role="progressbar" aria-label="게임 불러오는 중" aria-valuemin="0" aria-valuemax="100" aria-valuenow="5"><i class="boot-fill"></i></div>
        <p aria-live="polite">게임에 들어가고 있어요</p>
        <button class="boot-retry is-hidden" data-action="retry">다시 불러오기</button>
      </section>
      <section class="gacha-modal auth-modal" data-screen="auth" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div class="modal-card auth-card">
          <div class="modal-kicker">WELCOME TO</div><h2 id="auth-title">겅이마켓</h2>
          <p class="auth-sub">아이디로 로그인하면 코인과 도감이 계정에 저장돼요.</p>
          <div class="auth-tabs" role="tablist">
            <button type="button" class="auth-tab is-active" data-action="auth-login" role="tab" aria-selected="true">로그인</button>
            <button type="button" class="auth-tab" data-action="auth-register" role="tab" aria-selected="false">회원가입</button>
          </div>
          <form class="auth-form" novalidate>
            <label for="auth-username">아이디</label>
            <input id="auth-username" name="username" autocomplete="username" maxlength="20" placeholder="3~20자 한글·영문·숫자·_" required />
            <label for="auth-password">비밀번호</label>
            <input id="auth-password" name="password" type="password" autocomplete="current-password" maxlength="72" placeholder="6자 이상" required />
            <div class="auth-confirm-wrap is-hidden"><label for="auth-confirm">비밀번호 확인</label>
            <input id="auth-confirm" name="confirm" type="password" autocomplete="new-password" maxlength="72" placeholder="비밀번호를 한 번 더" />
            <label for="auth-nickname">닉네임</label>
            <input id="auth-nickname" name="nickname" autocomplete="nickname" maxlength="6" placeholder="2~6글자 · 다른 유저에게 보여요" /></div>
            <p class="auth-error" role="alert"></p>
            <button type="submit" class="modal-primary auth-submit">로그인</button>
          </form>
          <p class="auth-note">비밀번호는 암호화되어 저장되며, 비밀번호 찾기 기능은 없으니 꼭 기억해 주세요.</p>
        </div>
      </section>
      <section class="gacha-modal auth-modal" data-screen="nickname" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="nickname-title">
        <div class="modal-card auth-card">
          <div class="modal-kicker">NICKNAME</div><h2 id="nickname-title">닉네임을 정해 주세요</h2>
          <p class="auth-sub">다른 유저 목록과 도감에 보이는 이름이에요. 2~6글자로 정할 수 있어요.</p>
          <form class="nickname-form" novalidate>
            <label for="nickname-input">닉네임</label>
            <input id="nickname-input" name="nickname" maxlength="6" placeholder="2~6글자 한글·영문·숫자" required />
            <p class="auth-error nickname-error" role="alert"></p>
            <button type="submit" class="modal-primary nickname-submit">이 닉네임으로 시작하기</button>
          </form>
        </div>
      </section>
      <section class="weed-screen" data-screen="weed" aria-hidden="true" aria-labelledby="weed-title">
        <header class="weed-header">
          <button class="weed-back" data-action="close">← 가챠로</button>
          <b id="weed-title">제초장</b>
          <div class="wallet weed-wallet" aria-label="보유 코인"><img class="coin-icon" src="/assets/coin.png" alt="코인"/><strong class="wallet-value">${STARTING_COINS}</strong><span>코인</span><small class="wallet-rate" title="제초장 자동 수입 (하우스 코인 제외)"></small></div>
        </header>
        <div class="weed-field">${weedFieldMarkup()}<div class="wild-weed-spawns"></div></div>
        <div class="weed-panel">
          <div class="field-info-sticky">
          <p class="weed-status"></p>
          <div class="weed-earn weed-earn-auto"><span><b class="weed-next">--:--</b><small>다음 정각 지급까지</small></span><span><b class="weed-rate">0.00</b><small>제초 코인/시간 · 자동 지급</small></span></div>
          <p class="weed-rule">친구를 최대 3명까지 보낼 수 있어요. 제초장 전체 기본 시간당 2코인, 제초 보너스에 따라 지급 코인이 증가해요. 매시각 정각에 자동 지급되며 풍뎅이를 배치하면 최종 코인 2배! 제초 중인 친구를 다시 누르면 쉬게 해요.</p>
          </div>
          <div class="weed-beetle-slot" hidden></div>
          <div class="weed-picker" role="list" aria-label="제초할 친구 고르기"></div>
        </div>
        <div class="toast weed-toast" aria-live="polite"></div>
      </section>
      <section class="weed-screen battle-screen" data-screen="battle" aria-hidden="true" aria-labelledby="battle-title">
        <header class="weed-header">
          <button class="weed-back" data-action="close">← 뒤로가기</button>
          <b id="battle-title" class="battle-visually-hidden">토벌장</b>
          <div class="battle-stage-rewards" aria-live="polite"><div class="battle-reward-caption">1-1 클리어 보상</div><div class="battle-reward-combined"><span class="battle-reward-piece"><img class="battle-reward-icon" src="/assets/coin.png" alt=""/><b class="battle-stage-coins">1</b><small>코인</small></span><span class="battle-reward-piece"><img class="battle-reward-icon" src="/assets/enhancement_fragment.png" alt=""/><b class="battle-stage-fragments">0</b><small>강화파편</small></span></div></div>
          <div class="battle-stage-center"><div class="battle-stage-heading" aria-live="polite">1-1 STAGE</div><div class="battle-stage-actions"><button type="button" class="battle-retry-challenge" data-action="battle-retry-challenge" hidden>다음 스테이지 도전하기</button><button type="button" class="battle-boss-challenge" data-action="battle-boss-challenge" hidden>⚔ 보스 도전하기</button></div></div>
        </header>
        <div class="battle-field">${battleFieldMarkup()}<div class="battle-stage-transition" aria-live="polite" aria-hidden="true"><div class="battle-stage-transition-card"><span class="battle-transition-title">STAGE CLEAR!</span><strong class="battle-stage-next">1-2 STAGE</strong></div></div></div>
        <div class="weed-panel battle-panel">
          <div class="field-info-sticky">
          <p class="battle-reward-hint">남은 시간 <strong class="battle-time-remaining">30:00</strong></p>
          <p class="battle-status"></p><p class="achievement-combat-bonus">컬렉션 영구 전투력 확인 중...</p>
          <button type="button" class="battle-test-time5" data-action="battle-test-time5" hidden>남은 시간 5초</button><button type="button" class="battle-test-clear" data-action="battle-test-clear" hidden>단계 클리어 → 다음 단계</button><button type="button" class="battle-test-hp500" data-action="battle-test-hp500" hidden>몬스터 HP 500</button><button type="button" class="battle-test-reset" data-action="battle-test-reset" hidden>단계 초기화 (1-1)</button>
                    </div>
          <div class="weed-picker battle-picker" role="list" aria-label="토벌할 친구 고르기"></div>
        </div>
        <div class="battle-reward-popup" role="status" aria-live="polite" aria-atomic="true" hidden></div>
        <div class="toast battle-toast" aria-live="polite"></div>
      </section>
      <section class="weed-screen house-screen" data-screen="house" aria-hidden="true" aria-labelledby="house-title">
        <header class="weed-header">
          <button class="weed-back" data-action="close">← 가챠로</button>
          <b id="house-title">하우스</b>
          <div class="wallet weed-wallet" aria-label="보유 코인"><img class="coin-icon" src="/assets/coin.png" alt="코인"/><strong class="wallet-value">${STARTING_COINS}</strong><span>코인</span><small class="wallet-rate" title="제초장 자동 수입 (하우스 코인 제외)"></small></div>
        </header>
        <div class="house-scroll-viewport" aria-label="세로형 하우스 꾸미기 영역"><div class="house-lot">${houseLotMarkup()}<div class="house-items"></div><p class="house-empty">텅 빈 공터예요. 아래에서 데코를 꺼내 꾸며 보세요!</p></div></div>
        <div class="house-tools" hidden><b class="house-tools-name"></b><button data-action="house-flip">↔ 뒤집기</button><button data-action="house-smaller">－ 작게</button><button data-action="house-bigger">＋ 크게</button><button data-action="house-remove">넣기</button><button data-action="house-done">완료</button></div>
        <div class="weed-panel house-panel">
          <div class="field-info-sticky">
          <div class="house-panel-head"><div class="auth-tabs house-tabs" role="tablist"><button type="button" class="auth-tab is-active" data-action="house-tab" data-tab="floor" role="tab" aria-selected="true">🪑 데코(바닥)</button><button type="button" class="auth-tab" data-action="house-tab" data-tab="wall" role="tab" aria-selected="false">🖼 데코(벽)</button><button type="button" class="auth-tab" data-action="house-tab" data-tab="friend" role="tab" aria-selected="false">🐾 캐릭터</button></div><span class="house-meta"><b class="house-count">0 / 20</b> · <span class="house-save">자동 저장</span></span></div>
          <p class="weed-rule">데코를 눌러 공터에 꺼내고, 끌어서 옮겨요. 놓인 데코를 누르면 뒤집기·크기·넣기를 할 수 있어요.</p>
                    </div>
          <div class="house-inventory" role="list" aria-label="꺼낼 데코"></div>
        </div>
        <div class="toast house-toast" aria-live="polite"></div>
      </section>
      <section class="weed-screen expedition-screen" data-screen="expedition" aria-hidden="true">
        <header class="weed-header"><button class="weed-back" data-action="close">← 가챠로</button><b><img class="expedition-heading-weapon" src="/assets/decos/d01.png" alt=""/> 원정대</b><small>매일 오전 9시 갱신</small></header>
        <div class="expedition-server-tabs"><button data-action="exp-server" data-id="1">1서버</button><button data-action="exp-server" data-id="2">2서버</button><button data-action="exp-server" data-id="3">3서버</button></div>
        <div class="expedition-cave"><div class="expedition-hp-label">보스 체력 <b class="exp-hp">4,000,000</b> / 4,000,000</div><div class="expedition-hp-track"><div class="expedition-hp-fill"></div><span class="expedition-hp-percent">100%</span></div><div class="expedition-stage-label">1단계</div><div class="expedition-stage-transition" aria-hidden="true"><strong>STAGE CLEAR!</strong><span class="expedition-stage-next">다음 단계</span></div><div class="expedition-party"></div><img class="expedition-boss" src="/expedition_boss.png" alt="원정대 보스" /></div>
        <div class="expedition-details"><div class="expedition-test-tools" hidden><button data-action="exp-test-hp">보스 HP 100</button><button data-action="exp-test-respawn">보스 재생성</button></div><p class="expedition-status">원정대 정보를 불러오는 중…</p><p class="achievement-combat-bonus">컬렉션 영구 전투력 확인 중...</p><p class="expedition-equipment-bonus">장비 전투력 적용 중: 확인 중...</p><div class="expedition-members"></div><div class="expedition-picker"></div><p class="expedition-help">서버당 10명 · 1인 1서버 · 같은 서버에서 캐릭터 변경 가능 · 1단계 150코인·강화파편 15개 / 2단계 300코인·강화파편 20개 / 3단계 500코인·강화파편 30개 · 매일 오전 9시 새 보스</p></div>
        <div class="toast expedition-toast" aria-live="polite"></div>
      </section>
      <section class="shop-screen" data-screen="shop" aria-hidden="true" aria-label="장터">
        <header class="shop-header"><button type="button" data-action="close">← 가챠로</button><strong><img class="shop-header-face" src="/shop_armor_face.png" alt="갑옷씨 얼굴"/> 장터</strong><span aria-hidden="true"></span></header>
        <div class="shop-scene"><img class="shop-armor-clerk" src="/shop_armor_clerk.png" alt="상점에 앉아 있는 갑옷씨" draggable="false"/><div class="shop-panel"><div class="shop-tabs"><button type="button" data-action="shop-tab" data-tab="buy">구매</button><button type="button" data-action="shop-tab" data-tab="sell">판매</button></div><div class="shop-sell-categories" hidden><button type="button" data-action="shop-sell-category" data-tab="char" class="is-active">캐릭터</button><button type="button" data-action="shop-sell-category" data-tab="deco">데코</button><button type="button" data-action="shop-sell-category" data-tab="inventory">기타</button></div><div class="shop-bulk-fixed" hidden></div><div class="shop-items"></div></div></div><div class="shop-dialog" hidden role="dialog" aria-modal="true" aria-labelledby="shop-dialog-message"><div class="shop-dialog-card"><p id="shop-dialog-message"></p><div class="shop-dialog-actions"><button type="button" data-action="shop-dialog-cancel">취소</button><button type="button" data-action="shop-dialog-confirm">확인</button></div></div></div>
      </section>
      <section class="rps-screen lottery-screen" data-screen="rps" aria-hidden="true">
        <header class="rps-header"><button class="rps-back" data-action="close">← 로비로</button><b>겅이복권</b><button data-action="lottery-skip" class="lottery-skip" hidden>SKIP »</button></header>
        <div class="rps-scene lottery-scene">
          <div class="lottery-heading"><h2><img class="lottery-title-icon" src="/assets/lottery_ticket_custom.png" alt=""/> 겅이복권</h2><p class="lottery-status">남은 복권 확인 중...</p><div class="lottery-balance"><img src="/assets/coin.png" alt="코인"/> 보유 코인 <strong class="lottery-balance-value">0</strong></div></div>
          <div class="lottery-prizes"></div><button class="lottery-reset" data-action="lottery-reset" hidden>↻ 겅이복권 초기화 (운영자 전용)</button>
          <div class="lottery-ticket" hidden><div class="lottery-ticket-under"></div><div class="lottery-ticket-cover"><div class="lottery-ticket-top"></div><div class="lottery-ticket-peel"><span>점선 안쪽을 오른쪽으로 뜯어주세요 →</span></div></div></div>
          <div class="lottery-winners" aria-live="polite"></div>
          <div class="lottery-results"></div>
          <div class="lottery-purchase"><div class="lottery-count-display">구매 수량 <input class="lottery-count" type="number" min="1" max="100" value="1" readonly tabindex="-1" aria-label="선택된 구매 수량"/></div><button data-action="lottery-all">여러장 구매</button><p class="lottery-price" style="font-size:1.2rem;line-height:1.5">가격 100코인</p><button data-action="lottery-buy">복권 구매 · 뜯기</button></div>
        </div>
      </section>
      <main class="gacha-screen" data-screen="title" aria-hidden="true">
        <header class="gacha-header">
          <div class="brand"><span class="brand-icon"><img src="/assets/chars/hachiware_face.png" alt="하치와레 얼굴" /></span><div><b>겅이마켓</b><small>오늘의 작은 행운을 뽑아봐요</small></div></div>
          <div class="header-right"><div class="account-chip"><span class="account-name"></span><button class="logout-button" data-action="logout">로그아웃</button></div><div class="wallet" aria-label="보유 코인"><img class="coin-icon" src="/assets/coin.png" alt="코인"/><strong class="wallet-value">${STARTING_COINS}</strong><span>코인</span><small class="wallet-rate" title="제초장 자동 수입 (하우스 코인 제외)"></small></div><div class="diamond-wallet" aria-label="보유 다이아"><span class="diamond-wallet-line"><img class="diamond-icon" src="/assets/diamond.png" alt="다이아"/><strong class="diamond-value">0</strong><span class="diamond-capacity">/20</span></span><small class="diamond-recharge-countdown">충전 확인 중</small></div></div>
        </header>
        <div class="top-rewards" aria-label="오늘의 보상"><button class="reward-chip roulette-chip" data-action="roulette"><span><b>룰렛</b><small class="roulette-copy">12시간마다 1회</small></span></button><button class="reward-chip rps-lobby-tab" data-action="rps"><span><b>겅이복권</b></span></button></div>
        <button class="profile-chip" data-action="featured" aria-label="내 프로필 열기"><span class="profile-avatar"><img alt="" /></span><span class="profile-text"><b class="profile-name">내 프로필</b><small>대표 · 우편함</small></span><i class="mail-badge" hidden>0</i></button>
        <div class="expedition-entry"><img class="expedition-banner-image" src="/expedition_banner.jpg" alt="원정대 그림"/><button type="button" class="expedition-entry-label" data-action="expedition"><img class="expedition-weapon" src="/assets/decos/d01.png" alt=""/>원정대<i class="expedition-entry-dot" hidden aria-label="오늘 원정대 미배치"></i></button></div>
        <nav class="gacha-nav" aria-label="이동"><button class="nav-button nav-announcements" data-action="announcements"><span class="chiikawa-tab-icon"><img src="/assets/chars/chiikawa_tab_icon.png" alt="" /></span>공지사항<i class="announcement-dot" hidden></i></button><button class="nav-button nav-global-chat" data-action="global-chat"><span class="chiikawa-tab-icon"><img src="/assets/chars/chiikawa_tab_icon.png" alt="" /></span>전체채팅<i class="global-chat-dot" hidden></i></button><button class="nav-button nav-users" data-action="users"><span class="chiikawa-tab-icon"><img src="/assets/chars/chiikawa_tab_icon.png" alt="" /></span>유저 목록</button><div class="activity-menu"><button type="button" class="nav-button nav-activity" data-action="activity-toggle" aria-expanded="false"><span class="chiikawa-tab-icon"><img src="/assets/chars/hachiware_face.png" alt="" /></span>활동<i class="geongi-keyring-dot" hidden></i><i class="wild-weed-alert-dot" hidden></i><img class="menu-toggle-arrow" src="/menu_triangle.png" alt="" aria-hidden="true" /></button><div class="activity-options" hidden><button type="button" class="nav-button" data-action="weed"><span class="chiikawa-tab-icon"><img src="/assets/chars/chiikawa_tab_icon.png" alt="" /></span>제초장<i class="wild-weed-alert-dot" hidden></i></button><button type="button" class="nav-button" data-action="battle"><span class="chiikawa-tab-icon"><img src="/assets/chars/hachiware_face.png" alt="" /></span>토벌장</button><button type="button" class="nav-button" data-action="claw"><span class="chiikawa-tab-icon"><img src="/assets/chars/chiikawa_face_claw.png" alt="" /></span>키링뽑기<i class="geongi-keyring-dot" hidden></i></button></div></div><div class="myroom-menu"><button type="button" class="nav-button nav-myroom" data-action="myroom-toggle" aria-expanded="false"><span class="chiikawa-tab-icon"><img src="/assets/chars/chiikawa_tab_icon.png" alt="" /></span>마이룸<i class="geongi-equipment-dot" hidden></i><img class="menu-toggle-arrow" src="/menu_triangle.png" alt="" aria-hidden="true" /></button><div class="myroom-options" hidden><button type="button" class="nav-button" data-action="equipment"><span class="chiikawa-tab-icon"><img src="/assets/forge/rakko_face.png" alt="" /></span>장비<i class="geongi-equipment-dot" hidden></i></button><button type="button" class="nav-button" data-action="storage"><span class="chiikawa-tab-icon"><img src="/assets/chars/hachiware_face.png" alt="" /></span>인벤토리</button><button type="button" class="nav-button" data-action="house"><span class="chiikawa-tab-icon"><img src="/assets/chars/chiikawa_tab_icon.png" alt="" /></span>하우스</button></div></div><div class="market-menu"><button type="button" class="nav-button nav-market" data-action="market-toggle" aria-expanded="false"><i class="pepero-sale-dot" hidden></i><span class="chiikawa-tab-icon"><img src="/shop_armor_face.png" alt="갑옷씨" /></span>상점<img class="menu-toggle-arrow" src="/menu_triangle.png" alt="" aria-hidden="true" /></button><div class="market-options" hidden><button type="button" class="nav-button" data-action="forge"><span class="chiikawa-tab-icon"><img src="/assets/forge/rakko_face.png" alt="" /></span>대장간</button><button type="button" class="nav-button" data-action="shop"><i class="pepero-sale-dot" hidden></i><span class="chiikawa-tab-icon"><img src="/shop_armor_face.png" alt="" /></span>장터</button><button type="button" class="nav-button" data-action="alchemy"><span class="chiikawa-tab-icon"><img src="/assets/accessories/chiikawa_keyring_face.png" alt="" /></span>연금술</button></div></div></nav>
        <section class="toon-stage" aria-label="가챠 무대">
          <div class="toon-machine">${machineMarkup()}</div>
          <i class="toon-floor"></i>
          <div class="toon-hero"><img class="toon-hero-img" alt="" /></div>
          <span class="toon-hero-name"></span>
          <i class="toon-capsule"></i>
        </section>
        <aside class="collection-peek"><button type="button" class="reward-chip catalog-lobby-tab" data-action="catalog"><span><b>도감</b></span></button><button type="button" class="reward-chip achievement-lobby-tab" data-action="achievements"><span><b>업적</b></span></button><button class="reward-chip daily-button" data-action="daily"><span><b>출석 체크</b><small class="daily-copy">출석 보상</small></span></button></aside>
        <footer class="gacha-actions">
          <div class="pull-mode" role="tablist" aria-label="뽑기 종류"><button type="button" class="pull-mode-button is-active" data-action="mode" data-mode="char" role="tab" aria-selected="true"><img class="chiikawa-pull-icon" src="/assets/chars/chiikawa_tab_icon.png" alt="" /> 캐릭터 뽑기<i class="free-pull-dot" hidden></i></button><button type="button" class="pull-mode-button" data-action="mode" data-mode="deco" role="tab" aria-selected="false"><img class="chiikawa-pull-icon" src="/assets/chars/chiikawa_tab_icon.png" alt="" /> 데코 뽑기</button></div><div class="pull-popup" hidden><button type="button" class="pull-popup-close" data-action="close-pull-popup" aria-label="닫기">×</button><div class="pull-showcase" aria-label="뽑기 미리보기"><div class="pull-showcase-char"><div class="pull-event-copy"><span class="pull-event-kicker">GEONGI MARKET · CHARACTER PICK UP</span><h2>세이렌(카레) 등장!</h2><div class="pull-event-info"><b>초월 · 세이렌(카레)</b><span>획득 확률 0.01%</span></div></div><img class="pull-event-hero-image" src="/assets/gacha/siren_curry_event.png" alt="세이렌(카레) 이벤트 일러스트" /></div><div class="pull-showcase-deco" hidden><div class="pull-event-copy"><span class="pull-event-kicker">GEONGI MARKET · DECO PICK UP</span><h2>데코 뽑기 등장!</h2><div class="pull-event-info"><b>데코 · 꾸미기 아이템</b><span>확률 보기에서 획득 확률 확인</span></div></div><img class="pull-deco-event-image" src="/assets/gacha/deco_event.png" alt="데코 뽑기 일러스트" /></div>
          <div class="pull-popup-balance" style="display:flex;align-items:center;justify-content:center;gap:6px;margin:8px auto 10px;padding:7px 14px;width:max-content;max-width:85%;border-radius:999px;background:#fff7e7;border:1px solid #e8c99c;color:#65482f;font-weight:800;box-sizing:border-box"><img src="/assets/coin.png" alt="" style="width:20px;height:20px;object-fit:contain"/>보유 코인 <strong class="wallet-value">${STARTING_COINS}</strong></div><div class="pull-action-row">${DECO_PULL_OPTIONS.filter(option=>option.count===1||option.count===10).map(option => `<button class="pull-button deco-pull pull-${option.count}" data-action="deco-pull" data-count="${option.count}"><span><b>${option.count === 1 ? '데코 1회' : `데코 10+1회`}</b><small>${option.cost} 코인${option.count === 10 ? ' · 총 11회' : ''}</small></span></button>`).join('')}
          ${PULL_OPTIONS.filter(option=>option.count===1||option.count===10).map(option => `<button class="pull-button pull-${option.count}" data-action="pull" data-count="${option.count}"><span><b>${option.count === 1 ? '1회 뽑기' : `10+1회 뽑기`}</b><small>${option.cost} 코인${option.count === 10 ? ' · 총 11회' : ''}</small></span></button>`).join('')}
          <button type="button" class="pull-button free-daily-pull" data-action="free-daily-pull" data-count="10"><span><b>무료 10회</b><small>하루 한 번</small></span></button>
          </div><button type="button" class="pull-rates-toggle" data-action="pull-rates-toggle">확률 보기</button>
          </div>
        </div></footer>
        <div class="free-note" hidden>캐릭터 뽑기 하루 10회 무료 · 남은 무료 뽑기 <b class="free-pull-remaining">10</b>회</div>
        <div class="free-note">이 게임의 모든 뽑기는 게임 속 무료 코인으로 즐길 수 있어요.</div>
        <div class="toast" aria-live="polite"></div>
      </main>
      <div class="insufficient-overlay" hidden role="alertdialog" aria-modal="true" aria-labelledby="insufficient-title" aria-describedby="insufficient-message">
        <div class="insufficient-card">
          <img class="insufficient-icon" src="/assets/coin.png" alt=""/>
          <h2 id="insufficient-title">코인이 부족해요!</h2>
          <p id="insufficient-message"></p>
          <button type="button" data-action="insufficient-close" class="insufficient-close">확인</button>
        </div>
      </div>
      <section class="gacha-modal" data-screen="catalog" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="catalog-title">
        <div class="modal-card catalog-choice-card">
          <button class="modal-close" data-action="close" aria-label="닫기">×</button>
          <div class="modal-kicker">MY COLLECTION</div><h2 id="catalog-title">도감</h2>
          <p class="collection-summary">확인할 도감을 선택해 주세요.</p>
          <div class="catalog-choice-list">
            <button type="button" class="catalog-choice-button" data-action="collection"><img src="/assets/chars/chiikawa_tab_icon.png" alt=""/><span><b>캐릭터 도감</b><small><span class="collection-count">0 / ${CHARACTERS.length}</span> 수집</small></span><span aria-hidden="true">›</span></button>
            <button type="button" class="catalog-choice-button" data-action="decos"><img src="/assets/chars/hachiware_face.png" alt=""/><span><b>데코 도감</b><small><span class="deco-count">0 / ${DECOS.length}</span> 수집</small></span><span aria-hidden="true">›</span></button>
            <button type="button" class="catalog-choice-button" data-action="accessory-catalog"><img src="/assets/accessories/chiikawa_keyring.png?v=039" alt=""/><span><b>무기 액세서리 도감</b><small><span class="accessory-count">0 / 48</span> 수집</small></span><span aria-hidden="true">›</span></button>
          </div>
        </div>
      </section>
      <section class="gacha-modal" data-screen="collection" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="collection-title">
        <div class="modal-card collection-card">
          <button class="modal-close" data-action="close" aria-label="닫기">×</button>
          <div class="collection-info-sticky"><div class="modal-kicker">YOUR LITTLE FRIENDS</div><h2 id="collection-title">캐릭터 도감</h2>
          <p class="collection-summary">총 ${CHARACTERS.length}종의 친구</p></div>
          <div class="collection-grid"></div>
          <button class="modal-primary" data-action="catalog-back">← 뒤로가기</button>
        </div>
      </section>
      <section class="gacha-modal" data-screen="roulette" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="roulette-title">
        <div class="modal-card roulette-card">
          <button class="modal-close" data-action="close" aria-label="닫기">×</button>
          <div class="modal-kicker">DAILY ROULETTE</div><h2 id="roulette-title">오늘의 룰렛</h2>
          <p class="collection-summary">한국 시간 오전·오후 각 1회, 하루 최대 2회 돌릴 수 있어요.</p>
          <div class="roulette-wrap"><i class="roulette-pointer" aria-hidden="true"></i>${rouletteWheel()}</div>
          <ul class="roulette-odds">${ROULETTE_PRIZES.map(p => `<li><b>${p.coins}코인</b><span>${p.percent}%</span></li>`).join('')}</ul>
          <button class="modal-primary roulette-spin" data-action="roulette-spin">룰렛 돌리기</button><div class="roulette-pop-reward" role="status" aria-live="polite" hidden></div>
        </div>
      </section>
      <section class="gacha-modal" data-screen="decos" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="decos-title">
        <div class="modal-card collection-card">
          <button class="modal-close" data-action="close" aria-label="닫기">×</button>
          <div class="collection-info-sticky"><div class="modal-kicker">HOUSE DECO</div><h2 id="decos-title">데코 도감</h2>
          <p class="collection-summary">데코 ${DECOS.length}종</p></div>
          <div class="collection-grid deco-grid"></div>
          <div class="duplicate-note">새 데코 등록 +${DECO_NEW_BONUS}코인 · 중복 데코는 하우스에 하나 더 놓을 수 있어요</div>
          <button class="modal-primary" data-action="catalog-back">← 뒤로가기</button>
        </div>
      </section>
      <section class="gacha-modal" data-screen="announcements" aria-hidden="true" role="dialog" aria-modal="true">
        <div class="modal-card collection-card users-card">
          <button class="modal-close" data-action="close" aria-label="닫기">×</button>
          <div class="modal-kicker">GEONGI MARKET NEWS</div><h2>📢 공지사항</h2>
          <p class="collection-summary">최신 공지 10개 · 새로운 공지는 빨간 점으로 알려드려요.</p>
          <div class="announcements-body"></div>
        </div>
      </section>
      <section class="gacha-modal" data-screen="global-chat" aria-hidden="true" role="dialog" aria-modal="true">
        <div class="modal-card collection-card users-card global-chat-card">
          <button class="modal-close" data-action="close" aria-label="닫기">×</button>
          <div class="modal-kicker">GEONGI MARKET CHAT</div><h2>💬 전체채팅</h2>
          <p class="collection-summary">모든 유저와 대화해요 · 최대 30자 · 10초에 1회</p>
          <div class="global-chat-messages" role="log" aria-live="polite"></div>
          <div class="global-chat-compose"><input class="global-chat-input" maxlength="50" placeholder="메시지 입력 (최대 50자)" aria-label="전체채팅 메시지" /><button class="modal-primary" data-action="global-chat-send">전송</button></div>
          <p class="global-chat-hint" aria-live="polite"></p>
        </div>
      </section>
      <section class="gacha-modal" data-screen="users" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="users-title">
        <div class="modal-card collection-card users-card">
          <button class="modal-close" data-action="close" aria-label="닫기">×</button>
          <div class="modal-kicker">FRIENDS OF 겅이마켓</div><h2 id="users-title">유저 목록</h2>
          <div class="users-body"></div>
          <button class="modal-primary" data-action="close">가챠로 돌아가기</button>
        </div>
      </section>
      <section class="gacha-modal" data-screen="mail" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="mail-title">
        <div class="modal-card collection-card mail-card">
          <button class="modal-close" data-action="close" aria-label="닫기">×</button>
          <div class="modal-kicker">MAILBOX</div><h2 id="mail-title">우편함</h2>
          <div class="auth-tabs user-tabs mail-tabs" role="tablist"><button class="auth-tab is-active" data-action="mail-tab" data-tab="in" role="tab">📥 받은 편지함 <i class="mail-tab-count">0</i></button><button class="auth-tab" data-action="mail-tab" data-tab="sent" role="tab">📤 보낸 편지함 <i class="mail-tab-count">0</i></button></div>
          <p class="collection-summary mail-summary">유저 목록에서 유저를 골라 편지와 코인을 보낼 수 있어요.</p>
          <div class="mail-list" role="list"></div>
          <div class="mail-actions"><button class="modal-primary mail-claim-all" data-action="mail-claim-all">코인 모두 받기</button><button class="modal-secondary" data-action="users">✉ 편지 쓰러 가기</button></div>
        </div>
      </section>
      <section class="gacha-modal claw-screen" data-screen="claw" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="claw-title">
        <div class="modal-card claw-card">
          <div class="toast claw-toast" aria-live="assertive"></div>
          <button class="modal-close" data-action="close" aria-label="닫기">×</button>
          <h2 id="claw-title"><img class="claw-title-usagi" src="/assets/chars/chiikawa_face_claw.png" alt="치이카와" /> 키링뽑기</h2>
          <p class="claw-desc"><img class="diamond-icon" src="/assets/diamond.png" alt="다이아"/> 1회 1다이아 · 성공하면 무기 액세서리 랜덤 1개가 지급!</p>
          <div class="claw-balance" aria-label="보유 다이아"><span class="claw-balance-title">보유 다이아</span><span class="claw-balance-count"><img class="diamond-icon" src="/assets/diamond.png" alt="다이아"/><span class="claw-balance-times">×</span><strong class="diamond-value">0</strong><span class="claw-balance-unit">개</span></span></div><p class="claw-balance-help">집게를 인형 위로 이동해 잡아보세요!</p>
          <button class="claw-refresh" data-action="claw-refresh">🔄 인형 위치 새로고침 · <img class="diamond-icon" src="/assets/diamond.png" alt="다이아"/> 2개</button>
          <div class="claw-machine" aria-label="집게를 이동하고 뽑기 버튼을 누르세요">
            <div class="claw-arm"><img class="claw-graphic" src="/assets/claw/claw_open.png" alt="" /></div>
            <div class="claw-toys"></div><img class="claw-missed-sticker" src="/assets/claw/claw_missed.png" alt="놓쳤다!" aria-hidden="true" /><div class="claw-chute" aria-label="출구"></div><div class="claw-prize"></div>
          </div>
          <div class="claw-controls"><div class="claw-arrows"><button data-action="claw-up" aria-label="위">▲</button><div><button data-action="claw-left" aria-label="왼쪽">◀</button><button data-action="claw-down" aria-label="아래">▼</button><button data-action="claw-right" aria-label="오른쪽">▶</button></div></div><button class="claw-play" data-action="claw-play"><img class="claw-play-face" src="/assets/chars/chiikawa_face_claw.png" alt="" /><span class="claw-play-label">뽑기!</span><small><img class="diamond-icon" src="/assets/diamond.png" alt="다이아"/> 1개</small></button></div>
          <p class="claw-message" aria-live="polite">집게를 움직인 후 뽑기 버튼을 눌러주세요.</p>
        </div>
      </section>
      <section class="gacha-modal forge-screen" data-screen="forge" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="forge-title">
        <div class="modal-card forge-card">
          <button class="modal-close" data-action="close" aria-label="닫기">×</button>
          <h2 id="forge-title">🔨 대장간</h2>
          <div class="forge-body"><p>대장간을 불러오는 중...</p></div>
        </div>
      </section>
      <section class="gacha-modal" data-screen="storage" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="storage-title">
        <div class="modal-card collection-card storage-card">
          <button class="modal-close" data-action="close" aria-label="닫기">×</button>
          <div class="modal-kicker">STORAGE</div><h2 id="storage-title">인벤토리</h2><div class="storage-diamonds" aria-label="인벤토리 강화파편"><img class="diamond-icon" src="/assets/enhancement_fragment.png" alt="강화파편"/> 강화파편 <strong class="fragment-value">0</strong>개</div>
          <div class="auth-tabs user-tabs" role="tablist"><button class="auth-tab is-active" data-action="storage-tab" data-tab="char" role="tab"><img class="storage-tab-face" src="/assets/chars/chiikawa_face_claw.png" alt=""/> 캐릭터</button><button class="auth-tab" data-action="storage-tab" data-tab="deco" role="tab"><img class="storage-tab-face" src="/assets/chars/hachiware_face.png" alt=""/> 데코</button><button class="auth-tab" data-action="storage-tab" data-tab="accessory" role="tab"><img class="storage-tab-face" src="/assets/accessories/shisa_keyring.png" alt=""/> 무기 액세서리</button><button class="auth-tab" data-action="storage-tab" data-tab="inventory" role="tab"><img class="storage-tab-face" src="/assets/chars/usagi_face_claw.png" alt=""/> 기타</button></div>
          <p class="collection-summary storage-summary"></p>
          <div class="storage-grid" role="list"></div>
        </div>
      </section>
      <section class="gacha-modal" data-screen="suggest" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="suggest-title">
        <div class="modal-card collection-card suggest-card">
          <button class="modal-close" data-action="close" aria-label="닫기">×</button>
          <div class="modal-kicker">SUGGESTION BOX</div><h2 id="suggest-title">건의함</h2>
          <p class="collection-summary">모두가 볼 수 있는 건의함이에요. 답변과 삭제는 운영자 겅이만 할 수 있어요.</p>
          <form class="suggest-form" novalidate>
            <div class="suggest-row"><input class="suggest-input" maxlength="${SUGGEST_MAX_CHARS}" placeholder="건의할 내용을 ${SUGGEST_MAX_CHARS}자 이내로 적어 주세요" autocomplete="off" aria-label="건의 내용" /><button type="submit" class="modal-primary suggest-send">올리기</button></div>
            <small class="suggest-counter">0 / ${SUGGEST_MAX_CHARS}</small>
          </form>
          <div class="suggest-list" role="list"></div>
        </div>
      </section>
      <section class="gacha-modal" data-screen="featured" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="featured-title">
        <div class="modal-card collection-card profile-modal-card">
          <button class="modal-close" data-action="close" aria-label="닫기">×</button>
          <div class="modal-kicker">MY PROFILE</div><h2 id="featured-title">내 프로필</h2>
          <div class="profile-card"><span class="profile-big"><img alt="" /></span><b class="profile-big-name"></b><small class="profile-stats"></small></div>
          <div class="profile-actions"><button class="modal-primary profile-mail" data-action="mail">📮 우편함 <i class="mail-badge" hidden>0</i></button><button class="modal-secondary" data-action="users">✉ 우편 보내기</button><button class="modal-secondary admin-broadcast-entry" data-action="admin-broadcast" hidden>📢 전체 편지·코인 발송</button><button class="modal-secondary" data-action="suggest">💌 건의함</button><button class="modal-secondary" data-action="privacy">🔒 공개 설정</button></div>
          <h3 class="profile-sub">대표 사진 바꾸기</h3>
          <p class="collection-summary">내가 뽑은 친구 중에서 골라요. 대표 사진은 가챠 무대와 유저 목록에 보여요.</p>
          <div class="collection-grid featured-grid" role="list"></div>
          <div class="profile-bottom"><button class="modal-secondary profile-logout" data-action="logout">로그아웃</button><button class="modal-primary" data-action="close">가챠로 돌아가기</button></div>
        </div>
      </section>
      <div class="pop-reveal" aria-live="assertive" aria-hidden="true"></div>
      <section class="gacha-modal" data-screen="result" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="result-title">
        <div class="modal-card result-card">
          <div class="result-sparkle">✦</div><div class="modal-kicker">CAPSULE OPEN!</div>
          <h2 id="result-title">새로운 만남이에요</h2><p class="result-subtitle">도감에 친구를 등록했어요.</p>
          <div class="result-list"></div>
          <button class="modal-primary result-collection" data-action="result-collection">도감에서 확인하기</button>
          <button class="modal-secondary" data-action="close">계속 뽑기</button>
        </div>
      </section>`
  }

  private closeMyroomMenu(): void {
    const menu = this.root.querySelector<HTMLElement>('.myroom-options')
    if (menu) menu.hidden = true
    this.root.querySelector<HTMLButtonElement>('.nav-myroom')?.setAttribute('aria-expanded','false')
  }

  private showAlchemy():void {
    const dialog=document.createElement('dialog');dialog.className='myroom-equipment-dialog alchemy-dialog'
    let selected=WEAPON_ACCESSORIES[0].id
    const render=()=>{
      const counts=this.store.accessory.counts||{}
      const item=accessoryInfo(selected) || WEAPON_ACCESSORIES[0]
      const normal=counts[selected]||0
      const fragments=this.store.data.fragments||0
      const owned=this.store.accessory.grades?.[selected]||{}
      const inventoryGrades=ALCHEMY_GRADES.map(g=>({grade:g,count:g.id==='normal'?normal:(owned[g.id]||0)}))
      dialog.innerHTML=`<div class="myroom-equipment-panel alchemy-panel"><button type="button" class="myroom-equipment-close">×</button><h2>연금술</h2><p class="alchemy-description">같은 캐릭터의 이전 등급 키링 3개로 합성 · 성공률 100%</p><div class="alchemy-picker">${WEAPON_ACCESSORIES.map(x=>`<button type="button" class="alchemy-pick ${x.id===selected?'selected':''}" data-pick="${x.id}" aria-label="${x.name}" aria-pressed="${x.id===selected}"><img src="${x.image}" alt=""/><span>${x.name.replace(' 키링','')}</span></button>`).join('')}</div><div class="alchemy-owned-title">보유 키링 · ${item.name.replace(' 키링','')}</div><div class="alchemy-owned-grades">${inventoryGrades.map(({grade,count})=>`<div class="alchemy-owned-grade" style="--alchemy-accent:${grade.color}"><span>${grade.name}</span><strong>${count.toLocaleString()}개</strong></div>`).join('')}</div><div class="alchemy-fragments"><img src="/assets/enhancement_fragment.png" alt=""/><span>보유 강화파편</span><strong>${fragments.toLocaleString()}개</strong></div><div class="alchemy-recipes">${ALCHEMY_GRADES.slice(1).map((g,gi)=>{const previous=ALCHEMY_GRADES[gi];const available=previous.id==='normal'?normal:(owned[previous.id]||0);const shortage=available<g.cost||fragments<g.fragments;return `<button type="button" class="alchemy-recipe ${shortage?'is-shortage':'is-ready'}" data-id="${selected}" data-grade="${g.id}" ${shortage?'disabled':''}><b style="color:${g.color}">${g.name}</b><small>${previous.name} ${g.cost}개 · 파편 ${g.fragments}개</small><strong>${shortage?'재료 부족':`합성 · 전투력 +${g.power}`}</strong></button>`}).join('')}</div><button type="button" class="myroom-equipment-done">닫기</button></div>`
      dialog.querySelector('.myroom-equipment-close')?.addEventListener('click',()=>dialog.close())
      dialog.querySelector('.myroom-equipment-done')?.addEventListener('click',()=>dialog.close())
      dialog.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach(btn=>btn.addEventListener('click',()=>{selected=btn.dataset.pick!;render()}))
      dialog.querySelectorAll<HTMLButtonElement>('.alchemy-recipe').forEach(btn=>btn.addEventListener('click',async()=>{
        if(btn.disabled)return
        const chosenCharm=accessoryInfo(btn.dataset.id!)!
        const chosenGrade=ALCHEMY_GRADES.find(g=>g.id===btn.dataset.grade)!
        const confirmed=await new Promise<boolean>(resolve=>{
          const confirmDialog=document.createElement('dialog')
          confirmDialog.className='myroom-equipment-dialog alchemy-confirm-dialog'
          confirmDialog.innerHTML=`<div class="myroom-equipment-panel alchemy-confirm-panel"><h2>연금술 합성 확인</h2><img class="alchemy-confirm-image" src="${chosenCharm.image}" alt="${chosenCharm.name}"/><p><strong>${chosenGrade.name} ${chosenCharm.name}</strong>을 합성하시겠습니까?</p><div class="alchemy-confirm-actions"><button type="button" class="modal-secondary" data-confirm="no">취소</button><button type="button" class="modal-primary" data-confirm="yes">합성하기</button></div></div>`
          let decided=false
          const finish=(value:boolean)=>{if(decided)return;decided=true;confirmDialog.close();resolve(value)}
          confirmDialog.querySelector('[data-confirm="no"]')?.addEventListener('click',()=>finish(false))
          confirmDialog.querySelector('[data-confirm="yes"]')?.addEventListener('click',()=>finish(true))
          confirmDialog.addEventListener('cancel',e=>{e.preventDefault();finish(false)})
          confirmDialog.addEventListener('close',()=>{confirmDialog.remove();if(!decided){decided=true;resolve(false)}},{once:true})
          document.body.appendChild(confirmDialog);confirmDialog.showModal()
        })
        if(!confirmed)return
        btn.disabled=true
        try{
          await this.store.synthesizeAccessory(btn.dataset.id!,btn.dataset.grade!)
          const charm=accessoryInfo(btn.dataset.id!)!
          const grade=ALCHEMY_GRADES.find(g=>g.id===btn.dataset.grade)!
          dialog.innerHTML=`<div class="myroom-equipment-panel alchemy-result"><h2 class="alchemy-result-status" aria-live="polite">합성 중...</h2><div class="alchemy-stage"><div class="alchemy-animation"><img src="${charm.image}" alt="왼쪽 키링"/><img src="${charm.image}" alt="오른쪽 키링"/><span class="alchemy-impact"></span></div><div class="alchemy-reveal"><img class="alchemy-result-image" style="--alchemy-grade-glow:${grade.color}" src="${charm.image}" alt="합성된 키링"/><h3>${grade.name} ${charm.name}</h3><p>전투력 +${grade.power}</p></div></div><button type="button" class="myroom-equipment-done">확인</button></div>`
          const resultStatus=dialog.querySelector<HTMLElement>('.alchemy-result-status')
          window.setTimeout(()=>{if(resultStatus?.isConnected)resultStatus.textContent='합성 성공!'},2250)
          dialog.querySelector('.myroom-equipment-done')?.addEventListener('click',render)
          this.renderWallet()
        }catch(e){this.handleError(e);render()}
      }))
    }
    document.body.appendChild(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});render();dialog.showModal()
  }

  private showAccessoryCatalog(): void {
    const counts=this.store.accessory.counts||{}
    const cards=WEAPON_ACCESSORIES.flatMap(item=>ALCHEMY_GRADES.map(g=>{const count=g.id==='normal'?(counts[item.id]||0):(this.store.accessory.grades?.[item.id]?.[g.id]||0);const has=count>0 || (this.store.accessory.discovered||[]).includes(`${item.id}:${g.id}`);return `<article class="friend-card accessory-card ${has?'is-owned':'is-locked'}" style="--friend:#fbe3ea;--accent:${g.color}"><div class="friend-avatar">${has?`<img style="filter:drop-shadow(0 0 8px ${g.color})" src="${item.image}" alt="${item.name}"/>`:'<span class="friend-unknown">?</span>'}</div><div class="friend-chance">${g.name}</div><b>${has?item.name:'???'}</b><small>전투력 +${g.power}</small><span class="friend-lock">${has?(count>0?`${count}개 보유`:'수집 완료'):'미획득'}</span></article>`})).join('')
    const dialog=document.createElement('dialog')
    dialog.className='myroom-equipment-dialog accessory-catalog-dialog'
    dialog.innerHTML=`<div class="myroom-equipment-panel"><button class="myroom-equipment-close" type="button">×</button><h2>무기 액세서리 도감</h2><p class="collection-summary">${WEAPON_ACCESSORIES.reduce((n,item)=>n+ALCHEMY_GRADES.filter(g=>((this.store.accessory.discovered||[]).includes(`${item.id}:${g.id}`)||(g.id==='normal'?(counts[item.id]||0):(this.store.accessory.grades?.[item.id]?.[g.id]||0))>0)).length,0)} / 48 수집</p><div class="accessory-scroll collection-grid accessory-card-grid">${cards}</div><button class="myroom-equipment-done">← 뒤로가기</button></div>`
    document.body.appendChild(dialog)
    dialog.querySelector('.myroom-equipment-close')?.addEventListener('click',()=>dialog.close())
    dialog.querySelector('.myroom-equipment-done')?.addEventListener('click',()=>dialog.close())
    dialog.addEventListener('close',()=>dialog.remove(),{once:true})
    dialog.showModal()
  }

  private async showEquipmentStatus(): Promise<void> {
    try { await this.store.loadForge() } catch (error) { this.handleError(error); return }
    const forge = this.store.forge
    const names: Record<string,string> = {pink:'치이카와 토벌봉',blue:'하치와레 토벌봉',yellow:'우사기 토벌봉'}
    const dialog = document.createElement('dialog')
    dialog.className = 'myroom-equipment-dialog'
    dialog.setAttribute('aria-label','내 장비 상태')
    const equipped=accessoryInfo(this.store.accessory.equipped)
    const counts=this.store.accessory.counts||{}
    const accessories=WEAPON_ACCESSORIES.flatMap(item=>ALCHEMY_GRADES.map(g=>{const count=g.id==='normal'?(counts[item.id]||0):(this.store.accessory.grades?.[item.id]?.[g.id]||0);const has=count>0;const selected=this.store.accessory.equipped===item.id&&(this.store.accessory.equippedGrade||'normal')===g.id;return `<article class="friend-card accessory-card ${has?'is-owned':'is-locked'} ${selected?'is-equipped':''}" style="--friend:#fbe3ea;--accent:${g.color}"><div class="friend-avatar">${has?`<img src="${item.image}" style="filter:drop-shadow(0 0 8px ${g.color})" alt="${item.name}"/>`:'<span class="friend-unknown">?</span>'}</div><div class="friend-chance">${g.name}</div><b>${has?item.name:'???'}</b><small>전투력 +${g.power} · ${count}개</small><button type="button" class="accessory-equip-button" data-accessory="${item.id}" data-grade="${g.id}" ${!forge||!has?'disabled':''}>${selected?'장착 해제':has?'장착하기':'미획득'}</button></article>`})).join('')
    dialog.innerHTML = `<div class="myroom-equipment-panel"><button type="button" class="myroom-equipment-close" aria-label="닫기">×</button><h2><img src="/assets/forge/rakko_face.png" alt="" /> 내 장비</h2>${forge ? `<div class="forge-current"><span class="forge-aura accessory-weapon ${weaponAuraClass(forge.level)}"><img src="/assets/forge/${forge.weapon}.png" alt="장착 무기" />${equipped?`<img class="weapon-keyring" style="--keyring-glow:${ALCHEMY_GRADES.find(g=>g.id===(this.store.accessory.equippedGrade||'normal'))?.color||'#aaa'};filter:drop-shadow(0 0 8px ${ALCHEMY_GRADES.find(g=>g.id===(this.store.accessory.equippedGrade||'normal'))?.color||'#aaa'})" src="${equipped.image}" alt="장착된 ${equipped.name}"/>`:``}</span><div><b>${names[forge.weapon] ?? '내 무기'}</b><strong>+${forge.level}강 / 최대 +25강</strong><span class="forge-power-breakdown">영구 전투력 보너스<br>무기 전투력 +${Math.max(0,forge.bonus-equippedAccessoryPower(this.store.accessory.equipped,this.store.accessory.equippedGrade))}<br>액세서리 전투력 +${equippedAccessoryPower(this.store.accessory.equipped,this.store.accessory.equippedGrade)}<br>총 전투력 +${forge.bonus}</span></div></div><p class="myroom-equipment-note">강화는 상점 → 대장간에서 할 수 있어요.</p>` : '<p class="myroom-equipment-note">아직 선택한 무기가 없어요.<br>상점 → 대장간에서 무기를 선택할 수 있어요.</p>'}<div class="accessory-equip-section"><b>무기 액세서리</b><div class="accessory-scroll collection-grid accessory-card-grid">${accessories}</div></div><button type="button" class="myroom-equipment-done">확인</button></div>`
    document.body.appendChild(dialog)
    dialog.querySelectorAll<HTMLButtonElement>('.accessory-equip-button').forEach(button=>button.addEventListener('click',async()=>{
      const id=button.dataset.accessory||null
      try {
        if(button.disabled)return
        dialog.querySelectorAll<HTMLButtonElement>('.accessory-equip-button').forEach(b=>b.disabled=true)
        await this.store.equipAccessory(this.store.accessory.equipped===id&&(this.store.accessory.equippedGrade||'normal')===(button.dataset.grade||'normal')?null:id,button.dataset.grade||'normal')
        const current=this.store.accessory.equipped
        dialog.querySelectorAll<HTMLButtonElement>('.accessory-equip-button').forEach(b=>{
          const owned=b.dataset.grade==='normal'?((this.store.accessory.counts||{})[b.dataset.accessory||'']||0):(this.store.accessory.grades?.[b.dataset.accessory||'']?.[b.dataset.grade||'']||0)
          b.disabled=!this.store.forge||owned<1
          b.textContent=owned<1?'미획득':current===b.dataset.accessory&&(this.store.accessory.equippedGrade||'normal')===(b.dataset.grade||'normal')?'장착 해제':'장착하기'
          b.closest('.accessory-card')?.classList.toggle('is-equipped',current===b.dataset.accessory&&(this.store.accessory.equippedGrade||'normal')===(b.dataset.grade||'normal'))
        })
        const currentCharm=accessoryInfo(current)
        const weaponSlot=dialog.querySelector<HTMLElement>('.forge-current .accessory-weapon')
        if(weaponSlot){weaponSlot.querySelector('.weapon-keyring')?.remove();if(currentCharm){const img=document.createElement('img');img.className='weapon-keyring';img.style.setProperty('--keyring-glow',ALCHEMY_GRADES.find(g=>g.id===(this.store.accessory.equippedGrade||'normal'))?.color||'#aaa');img.style.setProperty('filter',`drop-shadow(0 0 8px ${ALCHEMY_GRADES.find(g=>g.id===(this.store.accessory.equippedGrade||'normal'))?.color||'#aaa'})`,'important');img.src=currentCharm.image;img.alt=`장착된 ${currentCharm.name}`;weaponSlot.appendChild(img)}}
        const powerLabel=dialog.querySelector<HTMLElement>('.forge-current div span')
        if(powerLabel&&this.store.forge)powerLabel.innerHTML=`영구 전투력 보너스<br>무기 전투력 +${Math.max(0,this.store.forge.bonus-equippedAccessoryPower(this.store.accessory.equipped,this.store.accessory.equippedGrade))}<br>액세서리 전투력 +${equippedAccessoryPower(this.store.accessory.equipped,this.store.accessory.equippedGrade)}<br>총 전투력 +${this.store.forge.bonus}`
        this.renderWallet();this.renderHero()
      }
      catch(error){this.handleError(error)}
    }))
    dialog.querySelector('.myroom-equipment-close')?.addEventListener('click',()=>dialog.close())
    dialog.querySelector('.myroom-equipment-done')?.addEventListener('click',()=>dialog.close())
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()})
    dialog.addEventListener('close',()=>dialog.remove(),{once:true})
    dialog.showModal()
  }

  private async openForge(): Promise<void> {
    try {await this.store.loadForge();if(this.screen==='forge')this.renderForge()}
    catch(e){this.handleError(e)}
  }
  private renderForge(): void {
    const body=this.root.querySelector<HTMLElement>('.forge-body')
    if(!body)return
    const forge=this.store.forge
    const names={pink:'치이카와 토벌봉',blue:'하치와레 토벌봉',yellow:'우사기 토벌봉'}
    if(!forge){
      body.innerHTML=`<p class="forge-warning">무기는 계정당 하나만 선택할 수 있으며, 선택 후 영구적으로 변경할 수 없어요!</p><div class="forge-weapons">${(['pink','blue','yellow'] as const).map(key=>`<button data-action="forge-select" data-weapon="${key}"><img src="/assets/forge/${key}.png" alt="${names[key]}"><b>${names[key]}</b><small>선택하기</small></button>`).join('')}</div>`
      return
    }
    const level=forge.level
    const chance=[100,95,90,85,80,75,70,65,60,55,50,45,40,35,30,25,20,15,10,5,4,3,2,1,1][level]
    const forgeCosts=level<20?{coins:(level+1)*5,fragments:level+1}:{coins:[150,200,300,400,500][level-20],fragments:[25,30,40,50,60][level-20]}
    const guaranteed=this.store.user?.username==='test'||this.store.user?.username==='tjdrjs885'
    body.innerHTML=`<div class="forge-current"><span class="forge-aura accessory-weapon ${weaponAuraClass(level)}"><img src="/assets/forge/${forge.weapon}.png" alt="${names[forge.weapon]}">${accessoryInfo(this.store.accessory.equipped)?`<img class="weapon-keyring" style="--keyring-glow:${ALCHEMY_GRADES.find(g=>g.id===(this.store.accessory.equippedGrade||'normal'))?.color||'#aaa'};filter:drop-shadow(0 0 8px ${ALCHEMY_GRADES.find(g=>g.id===(this.store.accessory.equippedGrade||'normal'))?.color||'#aaa'})" src="${accessoryInfo(this.store.accessory.equipped)!.image}" alt="장착된 키링"/>`:``}</span><div><b>${names[forge.weapon]}</b><strong>+${level}강 / 최대 +25강</strong><span class="forge-power-breakdown">영구 전투력 보너스<br>무기 전투력 +${Math.max(0,forge.bonus-equippedAccessoryPower(this.store.accessory.equipped,this.store.accessory.equippedGrade))}<br>액세서리 전투력 +${equippedAccessoryPower(this.store.accessory.equipped,this.store.accessory.equippedGrade)}<br>총 전투력 +${forge.bonus}</span></div></div>${level>=25?'<p class="forge-max">✨ 최고 강화 단계에 도달했어요!</p>':`<div class="forge-cost"><p>다음 강화 성공 확률 <b>${Number(guaranteed?100:chance).toFixed(2)}%</b></p><p><span class="forge-required-label">필요:</span> <img class="forge-resource-icon" src="/assets/enhancement_fragment.png" alt="강화파편"/> <b>${forgeCosts.fragments}개</b> + <img class="forge-resource-icon" src="/assets/coin.png" alt="코인"/> <b>${forgeCosts.coins}개</b></p><p>보유: <img class="forge-resource-icon" src="/assets/enhancement_fragment.png" alt="강화파편"/> ${this.isForgeOperator?'∞':(this.store.data.fragments??0).toLocaleString()+'개'} · <img class="forge-resource-icon" src="/assets/coin.png" alt="코인"/> ${this.isForgeOperator?'∞':this.store.data.gems.toLocaleString()+'개'}</p></div><button class="forge-upgrade" data-action="forge-upgrade"><img src="/assets/forge/button.png" alt="강화하기"/></button><p class="forge-note">실패해도 단계는 내려가지 않지만 재료와 코인은 소모돼요.</p>`}`
  }

  private playForgeSound(kind: 'working' | 'success' | 'failure'): void {
    try {
      const sound = new Audio(`/assets/forge/sound_${kind}.wav`)
      sound.volume = kind === 'working' ? 0.42 : 0.55
      void sound.play().catch(() => {})
    } catch { /* Audio may be unavailable or blocked by browser settings. */ }
  }

  private async playForgeUpgradeAnimation(success: boolean): Promise<void> {
    const body = this.root.querySelector<HTMLElement>('.forge-body')
    if (!body) return
    const overlay = document.createElement('div')
    overlay.className = 'forge-animation-overlay'
    overlay.setAttribute('aria-live', 'polite')
    overlay.innerHTML = `<img class="forge-animation-hammer" src="/assets/forge/upgrade_hammer.png" alt="무기를 두드리는 중"/><span class="forge-animation-caption">강화 중...</span>`
    body.appendChild(overlay)
    this.playForgeSound('working')
    try {
      await new Promise<void>(resolve => window.setTimeout(resolve, 1050))
      if (this.screen !== 'forge') return
      this.playForgeSound(success ? 'success' : 'failure')
      overlay.classList.add('forge-animation-result')
      overlay.innerHTML = `<img src="/assets/forge/upgrade_${success ? 'success' : 'failure'}.png" alt="${success ? '강화 성공' : '강화 실패'}"/><span class="forge-animation-caption">${success ? '강화 성공!' : '강화 실패!'}</span>`
      await new Promise<void>(resolve => window.setTimeout(resolve, 1150))
    } finally { overlay.remove() }
  }

  private peperoSaleActive(): boolean {
    return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()) <= '2026-11-18'
  }
  private refreshPeperoDots(): void {
    const show=this.peperoSaleActive() && !this.store.data.owned.includes('pepero_chiikawa')
    this.root.querySelectorAll<HTMLElement>('.pepero-sale-dot').forEach(dot=>{dot.hidden=!show})
  }
  private renderShop(): void {
    const screen = this.root.querySelector<HTMLElement>('.shop-screen')
    if (!screen) return
    screen.querySelectorAll<HTMLButtonElement>('.shop-tabs button').forEach(b => b.classList.toggle('is-active', b.dataset.tab === this.shopTab))
    const categories = screen.querySelector<HTMLElement>('.shop-sell-categories')
    if (categories) {
      categories.hidden = this.shopTab !== 'sell'
      categories.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.classList.toggle('is-active', b.dataset.tab === this.shopSellTab))
    }
    const items = screen.querySelector<HTMLElement>('.shop-items')
    const bulkFixed = screen.querySelector<HTMLElement>('.shop-bulk-fixed')
    if (!items) return
    if (bulkFixed) { bulkFixed.hidden = true; bulkFixed.innerHTML = '' }
    const balance = `<div class="shop-balance"><img class="shop-coin-icon" src="/assets/coin.png" alt=""/> 보유 코인 ${Number(this.store.data.gems ?? 0).toLocaleString('ko-KR')}</div>`
    if (this.shopTab !== 'sell') {
      const owned=this.store.data.owned.includes('pepero_chiikawa')
      const active=this.peperoSaleActive()
      items.innerHTML=balance+`<div class="pepero-market-card"><img src="/assets/chars/pepero_chiikawa.png" alt="치이카와 빼빼로"/><div><strong>치이카와(빼빼로) <em>한정판</em></strong><small>노말 · 전투력 2 · 제초속도 증가 없음</small><small>2026년 11월 18일까지 판매 · 계정당 1회</small><button type="button" data-action="buy-pepero" ${owned||!active?'disabled':''}>${owned?'구매 완료':active?'1코인 구매':'판매 종료'}</button></div></div>`
      return
    }
    if (this.shopSellTab === 'inventory') {
      const weeds = ([['normal', this.store.wildWeed?.count ?? 0, '잡초', 5, '/field_wild_weed.png'], ['golden', this.store.wildWeed?.goldenCount ?? 0, '황금잡초', 50, '/field_golden_weed.png']] as const)
      items.innerHTML = balance + (weeds.filter(x => x[1] > 0).map(([type,count,name,price,img]) => `<div class="shop-product"><img src="${img}" alt="${name}"/><div><strong>${name} ${count}개</strong><small>개당 ${price}코인</small></div><button data-action="wild-weed-sell" data-weed-type="${type}">판매</button></div>`).join('') || '<div class="shop-empty-note">판매할 기타 아이템이 없어요.</div>')
      return
    }
    const bulk = this.getBulkSellItems(this.shopSellTab === 'char' ? 'char' : 'deco')
    const bulkCount = bulk.reduce((sum, item) => sum + item.count, 0)
    const bulkCoins = bulk.reduce((sum, item) => sum + item.count * item.price, 0)
    const bulkButton = `<button class="shop-bulk-sell" data-action="storage-bulk-sell" data-kind="${this.shopSellTab === 'char' ? 'char' : 'deco'}" ${bulkCount ? '' : 'disabled'}>중복 일괄 판매 · ${bulkCount}개 (+${bulkCoins}코인)</button>`
    if (bulkFixed) { bulkFixed.innerHTML = bulkButton; bulkFixed.hidden = false }
    const sellButtons = (kind: 'char' | 'deco', id: string, count: number, price: number) => count > 0
      ? `<div class="storage-sell"><button class="storage-sell-btn" data-action="sell" data-kind="${kind}" data-id="${id}" data-count="1">1개 판매 +${price}</button>${count > 1 ? `<button class="storage-sell-btn is-all" data-action="sell" data-kind="${kind}" data-id="${id}" data-count="${count}">중복 모두 판매 +${count * price}</button>` : ''}</div>`
      : '<small class="storage-keep">판매 가능한 중복 없음</small>'
    if (this.shopSellTab === 'char') {
      const owned = CHARACTERS.filter(c => this.store.data.owned.includes(c.id))
      items.innerHTML = balance + '<div class="shop-sell-grid">' + (owned.map(c => {
        const count = this.store.dupes[c.id] ?? 0
        const price = CHAR_SELL_PRICES[c.tier === 'mermaid' ? 'rare' : c.tier === 'rare' ? 'epic' : c.tier === 'super' || c.tier === 'legendary' ? 'unique' : 'normal']
        return `<article class="storage-item"><span class="storage-pic"><img src="${CHARACTER_IMAGE_URLS[c.id]}" alt="" loading="eager"/></span><b>${escapeHtml(fullName(c))}</b><small>보유 ${count + 1}개 · 판매 가능 ${count}개</small>${sellButtons('char', c.id, count, price)}</article>`
      }).join('') || '<div class="shop-empty-note">보유한 캐릭터가 없어요.</div>') + '</div>'
    } else {
      const placed: Record<string, number> = {}
      for (const piece of this.store.house.pieces) placed[piece.id] = (placed[piece.id] ?? 0) + 1
      const owned = DECOS.filter(d => (this.store.decos[d.id] ?? 0) > 0)
      items.innerHTML = balance + '<div class="shop-sell-grid">' + (owned.map(d => {
        const have = this.store.decos[d.id] ?? 0
        const count = Math.max(0, have - Math.max(1, placed[d.id] ?? 0))
        return `<article class="storage-item"><span class="storage-pic is-deco"><img src="${DECO_IMAGE_URLS[d.id]}" alt="" loading="eager"/></span><b>${escapeHtml(d.name)}</b><small>보유 ${have}개 · 판매 가능 ${count}개</small>${sellButtons('deco', d.id, count, DECO_SELL_PRICE)}</article>`
      }).join('') || '<div class="shop-empty-note">보유한 데코가 없어요.</div>') + '</div>'
    }
  }

  private shopPendingQuantity = 0
  private shopPendingSell: {type: 'normal' | 'golden'; count: number} | null = null

  private showShopDialog(message: string, quantity = 0): void {
    const dialog = this.root.querySelector<HTMLElement>('.shop-dialog')
    if (!dialog) return
    this.shopPendingQuantity = quantity
    const label = dialog.querySelector<HTMLElement>('#shop-dialog-message')
    if (label) label.textContent = message
    const cancel = dialog.querySelector<HTMLButtonElement>('[data-action="shop-dialog-cancel"]')
    if (cancel) cancel.hidden = quantity === 0 && !this.shopPendingSell
    const confirm = dialog.querySelector<HTMLButtonElement>('[data-action="shop-dialog-confirm"]')
    if (confirm) confirm.textContent = this.shopPendingSell ? '판매' : quantity ? '구매' : '확인'
    dialog.hidden = false
  }

  private hideShopDialog(): void {
    const dialog = this.root.querySelector<HTMLElement>('.shop-dialog')
    if (dialog) dialog.hidden = true
    this.shopPendingQuantity = 0
    this.shopPendingSell = null
  }


  private achievementPrefetch: Promise<NonNullable<typeof this.achievementSnapshot>> | null = null
  private fetchAchievementsOnce(): Promise<NonNullable<typeof this.achievementSnapshot>> {
    if (this.achievementSnapshot) return Promise.resolve(this.achievementSnapshot)
    if (!this.achievementPrefetch) {
      this.achievementPrefetch = fetch('/api/achievements', {credentials:'include',cache:'no-store'})
        .then(async response => {if(!response.ok)throw Error('업적 정보를 불러오지 못했어요.');return await response.json() as NonNullable<typeof this.achievementSnapshot>})
        .then(data => {this.achievementSnapshot=data;return data})
        .finally(() => {this.achievementPrefetch=null})
    }
    return this.achievementPrefetch
  }
  private prefetchQuickPanels():void {
    if(!this.store.user)return
    // Share a single in-flight achievements request with the badge and modal.
    void this.fetchAchievementsOnce().catch(()=>{})
    // Prefetch expedition once; entry still fetches live data before applying actions.
    if(!this.expedition && !this.expeditionPrefetch) {
      this.expeditionPrefetch=this.store.expedition().finally(()=>{this.expeditionPrefetch=null})
      void this.expeditionPrefetch.then(data=>{if(!this.expedition)this.expedition=data}).catch(()=>{})
    }
  }

  private async refreshAchievementReadyBadge():Promise<void> {
    const button=this.root.querySelector<HTMLElement>('.achievement-lobby-tab')
    if(!button || !this.store.user)return
    try {
      const data=await this.fetchAchievementsOnce()
      const ready=Boolean(data.items?.some(item=>!item.claimed && item.ids.every(id=>item.owned.includes(id))))
      button.classList.toggle('has-claimable-achievement',ready)
      button.setAttribute('aria-label',ready?'업적 - 수령 가능한 보상 있음':'업적')
    }catch{/* Keep last known state during network interruptions. */}
  }

  private achievementSnapshot: {items:{id:string;tier:string;name:string;ids:string[];owned:string[];coins:number;power:number;claimed:boolean}[];power:number}|null = null
  private collectionCombatPower = 0

  private async refreshAchievementCombatLabels():Promise<void> {
    try {
      const res=await fetch('/api/achievements',{credentials:'include',cache:'no-store'})
      if(!res.ok)return
      const data=await res.json() as {power:number}
      const power=Math.max(0,Number(data.power)||0)
      this.collectionCombatPower=power
      this.store.collectionCombatPower=power
      if(this.screen==='battle')this.renderBattleStatus()
      this.root.querySelectorAll<HTMLElement>('.achievement-combat-bonus').forEach(el=>{
        el.textContent=`컬렉션 영구 전투력 +${power} 적용 중`
      })
    }catch{/* Offline: preserve the last displayed value. */}
  }

  private async openAchievements(tab:'collection'|'title'='collection'):Promise<void> {
    let overlay=document.querySelector<HTMLElement>('#achievement-v23-overlay')
    if(!overlay){overlay=document.createElement('div');overlay.id='achievement-v23-overlay';document.body.append(overlay)}
    overlay.hidden=false
    const close=()=>{if(overlay)overlay.hidden=true}
    overlay.innerHTML='<div class="achievement-v23-panel"><button class="achievement-v23-close" aria-label="닫기">×</button><h2>업적</h2></div>'
    overlay.querySelector<HTMLButtonElement>('.achievement-v23-close')!.onclick=close
    const panel=overlay.querySelector<HTMLElement>('.achievement-v23-panel')!
    const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))
    const showTitle=()=>{panel.innerHTML='<button class="achievement-v23-close" aria-label="닫기">×</button><h2>업적</h2><div class="achievement-v23-tabs"><button data-tab="collection">컬렉션</button><button class="active" data-tab="title">칭호</button></div><p class="achievement-v23-empty">칭호는 아직 미구현 상태입니다.</p>';panel.querySelector<HTMLButtonElement>('.achievement-v23-close')!.onclick=close;panel.querySelector<HTMLButtonElement>('[data-tab="collection"]')!.onclick=()=>void this.openAchievements('collection')}
    if(tab==='title'){showTitle();return}
    try {
      const data=await this.fetchAchievementsOnce()
      panel.innerHTML='<button class="achievement-v23-close" aria-label="닫기">×</button><h2>업적</h2><div class="achievement-v23-tabs"><button class="active" data-tab="collection">컬렉션</button><button data-tab="title">칭호</button></div><p class="achievement-v23-summary">수령한 영구 전투력 +'+data.power+' · 토벌장 / 원정대 적용</p><div class="achievement-v23-items">'+data.items.map(item=>{const ready=item.ids.every(id=>item.owned.includes(id));return '<article class="achievement-v23-item achievement-tier-'+esc(item.tier)+'"><div><small>'+esc(item.tier)+'</small><b>'+esc(item.name)+'</b><span>'+item.owned.length+' / '+item.ids.length+' 수집</span></div><p>'+item.ids.map(id=>'<span class="achievement-v24-face '+(item.owned.includes(id)?'has':'')+'">'+(item.owned.includes(id)?'<img loading="eager" src="'+esc(CHARACTER_IMAGE_URLS[id]||'/assets/chars/chiikawa_tab_icon.png')+'" alt=""/><small>'+esc(CHARACTERS.find(c=>c.id===id)?.name||id)+(CHARACTERS.find(c=>c.id===id)?.variant?'('+esc(CHARACTERS.find(c=>c.id===id)!.variant)+')':'')+'</small>':'<strong class="achievement-v25-unknown">?</strong><small>미획득</small>')+'</span>').join('')+'</p><div class="achievement-v23-reward">보상: '+item.coins+'코인'+(item.power?' · 영구 전투력 +'+item.power:'')+'</div><button data-claim="'+item.id+'" '+(!ready||item.claimed?'disabled':'')+'>'+(item.claimed?'수령 완료':ready?'보상 수령':'미완료')+'</button></article>'}).join('')+'</div>'
      panel.querySelector<HTMLButtonElement>('.achievement-v23-close')!.onclick=close
      panel.querySelector<HTMLButtonElement>('[data-tab="title"]')!.onclick=showTitle
      panel.querySelectorAll<HTMLButtonElement>('[data-claim]').forEach(btn=>btn.onclick=async()=>{btn.disabled=true;try{const response=await fetch('/api/achievements/claim',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:btn.dataset.claim})});if(!response.ok)throw Error('보상을 수령하지 못했어요.');const reward=await response.json() as {coins:number;power:number};await this.store.restore();this.achievementSnapshot=null;await this.refreshAchievementCombatLabels();await this.openAchievements('collection');void this.refreshAchievementReadyBadge();this.showAchievementReward(reward.coins,reward.power)}catch(error){btn.disabled=false;this.toast(error instanceof Error?error.message:'오류가 발생했어요')}})
    }catch(error){panel.innerHTML='<button class="achievement-v23-close">×</button><p>업적 정보를 불러오지 못했습니다.</p>';panel.querySelector<HTMLButtonElement>('.achievement-v23-close')!.onclick=close}
  }

  private showAchievementReward(coins:number,power:number):void {
    document.getElementById('achievement-reward-popup')?.remove()
    const overlay=document.createElement('div')
    overlay.id='achievement-reward-popup'
    overlay.innerHTML=`<div class="achievement-reward-dialog" role="dialog" aria-modal="true" aria-label="컬렉션 보상"><h2>컬렉션 보상 획득!</h2><p>코인 <b>${Math.max(0,Number(coins)||0)}개</b> 획득!</p>${power>0?`<p>영구 전투력 <b>+${Math.max(0,Number(power)||0)}</b> 획득!</p>`:''}<button type="button">닫기</button></div>`
    overlay.querySelector('button')?.addEventListener('click',()=>overlay.remove())
    document.body.append(overlay)
  }

  private async onClick(event: MouseEvent): Promise<void> {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')
    const action = button?.dataset.action
    if (!action) return
    this.audio.unlock()
    this.audio.play('ui')
    if (action === 'myroom-toggle') {
      const menu = this.root.querySelector<HTMLElement>('.myroom-options')
      const toggle = this.root.querySelector<HTMLButtonElement>('.nav-myroom')
      if (menu && toggle) { menu.hidden = !menu.hidden; toggle.setAttribute('aria-expanded', String(!menu.hidden)) }
      for (const [selector, trigger] of [['.activity-options','.nav-activity'],['.market-options','.nav-market']] as const) {
        const other = this.root.querySelector<HTMLElement>(selector)
        if (other) other.hidden = true
        this.root.querySelector<HTMLButtonElement>(trigger)?.setAttribute('aria-expanded','false')
      }
      return
    }
    if (['equipment','storage','house'].includes(action)) {
      const menu = this.root.querySelector<HTMLElement>('.myroom-options')
      if (menu) menu.hidden = true
      this.root.querySelector<HTMLButtonElement>('.nav-myroom')?.setAttribute('aria-expanded','false')
    }
    if (action === 'equipment') { await this.showEquipmentStatus(); return }
    if (action === 'market-toggle') {
      this.closeMyroomMenu()
      const menu = this.root.querySelector<HTMLElement>('.market-options')
      const toggle = this.root.querySelector<HTMLButtonElement>('.nav-market')
      if (menu && toggle) { menu.hidden = !menu.hidden; toggle.setAttribute('aria-expanded', String(!menu.hidden)) }
      const otherMenu = this.root.querySelector<HTMLElement>(action === 'market-toggle' ? '.activity-options' : '.market-options')
      const otherToggle = this.root.querySelector<HTMLButtonElement>(action === 'market-toggle' ? '.nav-activity' : '.nav-market')
      if (otherMenu) otherMenu.hidden = true
      otherToggle?.setAttribute('aria-expanded', 'false')
      return
    }
    if (['forge','shop'].includes(action)) {
      const menu = this.root.querySelector<HTMLElement>('.market-options')
      const toggle = this.root.querySelector<HTMLButtonElement>('.nav-market')
      if (menu) menu.hidden = true
      toggle?.setAttribute('aria-expanded','false')
    }
    if (action === 'activity-toggle') {
      this.closeMyroomMenu()
      const menu = this.root.querySelector<HTMLElement>('.activity-options')
      const toggle = this.root.querySelector<HTMLButtonElement>('.nav-activity')
      if (menu && toggle) { menu.hidden = !menu.hidden; toggle.setAttribute('aria-expanded', String(!menu.hidden)) }
      const otherMenu = this.root.querySelector<HTMLElement>(action === 'market-toggle' ? '.activity-options' : '.market-options')
      const otherToggle = this.root.querySelector<HTMLButtonElement>(action === 'market-toggle' ? '.nav-activity' : '.nav-market')
      if (otherMenu) otherMenu.hidden = true
      otherToggle?.setAttribute('aria-expanded', 'false')
      return
    }
    if (['weed','battle','claw'].includes(action)) {
      const menu = this.root.querySelector<HTMLElement>('.activity-options')
      const toggle = this.root.querySelector<HTMLButtonElement>('.nav-activity')
      if (menu) menu.hidden = true
      toggle?.setAttribute('aria-expanded','false')
    }
    if (action === 'insufficient-close') { this.closeInsufficient(); return }
    if (action === 'rps') {this.show('rps');return}
    if (action === 'lottery-reset') {await this.resetLottery();return}
    if (action === 'lottery-all') {await this.chooseLotteryCount();return}
    if (action === 'lottery-buy') {await this.buyLottery();return}
    if (action === 'lottery-skip') {this.skipLottery();return}
    if (action === 'buy-pepero') {
      if(this.busy || !this.peperoSaleActive() || this.store.data.owned.includes('pepero_chiikawa'))return
      this.busy=true
      try {await this.store.buyPeperoChiikawa();this.renderShop();this.renderWallet();this.renderCollection();this.refreshPeperoDots();this.showShopDialog('구매완료!')}
      catch(e){this.handleError(e)}finally{this.busy=false}
      return
    }
    if (action === 'shop') {this.shopTab='buy';this.hideShopDialog();this.show('shop');void this.loadWildWeed();this.renderShop();return}
    if (action === 'shop-tab' && button?.dataset.tab) { this.shopTab = button.dataset.tab === 'buy' ? 'buy' : 'sell'; this.hideShopDialog(); this.renderShop(); return }
    if (action === 'shop-sell-category' && button?.dataset.tab) { const list = this.root.querySelector<HTMLElement>('.shop-screen .shop-items'); if (list) list.scrollTop = 0; this.shopSellTab = button.dataset.tab === 'deco' ? 'deco' : button.dataset.tab === 'inventory' ? 'inventory' : 'char'; this.renderShop(); return }
    
    if (action === 'wild-weed-sell') {
      const type=button?.dataset.weedType==='golden'?'golden':'normal'
      const count=type==='golden'?(this.store.wildWeed?.goldenCount??0):(this.store.wildWeed?.count??0)
      if(!count || this.busy)return
      this.shopPendingSell = {type,count}
      this.showShopDialog('판매하시겠습니까?')
      return
    }
    if (action === 'shop-dialog-cancel') { this.hideShopDialog(); return }
    if (action === 'shop-dialog-confirm') {
      const quantity = this.shopPendingQuantity
      const pendingSell = this.shopPendingSell
      this.hideShopDialog()
      if (pendingSell) {
        if (this.busy) return
        this.busy = true
        try {
          await this.store.sellWildWeed(pendingSell.count, pendingSell.type)
          this.renderShop()
          this.renderWallet()
          this.showShopDialog('판매완료!')
        } catch(e) { this.handleError(e) } finally { this.busy = false }
        return
      }
      return
    }
    if (action === 'rps-start') {await this.rpsAction('start');return}
    if (action === 'rps-next') {await this.rpsAction('next');return}
    if (action === 'rps-claim') {await this.rpsAction('claim');return}
    if (action === 'rps-move' && button?.dataset.move) {await this.rpsAction('choose',button.dataset.move);return}
    if (action === 'alchemy') {this.showAlchemy();return}
    if (action === 'forge') {this.show('forge');return}
    if (action === 'forge-select' && button?.dataset.weapon) {
      if(this.busy || this.store.forge)return
      const weapon=button.dataset.weapon as 'pink'|'blue'|'yellow'
      if(!await this.confirmForgeWeapon())return
      this.busy=true
      try {await this.store.selectForge(weapon);this.toast('무기를 영구적으로 선택했어요!');this.renderForge()}
      catch(e){this.handleError(e)}finally{this.busy=false}
      return
    }
    if (action === 'forge-upgrade') {
      if(this.busy)return
      const currentLevel=this.store.forge?.level
      if(currentLevel===undefined)return
      if(currentLevel<25 && (!this.isForgeOperator && ((this.store.data.fragments??0)<(currentLevel<20?currentLevel+1:[25,30,40,50,60][currentLevel-20]) || this.store.data.gems<(currentLevel<20?(currentLevel+1)*5:[150,200,300,400,500][currentLevel-20])))){this.showForgeInsufficient();return}
      this.busy=true
      try {
        const success = await this.store.upgradeForge()
        // 서버가 확정한 최신 강화 단계와 재화를 애니메이션 전에 즉시 반영합니다.
        // The upgrade has already been committed on the server. A UI refresh error
        // must never be mistaken for a failed network request.
        try { this.renderForge() } catch (renderError) { console.error('Forge render failed after upgrade', renderError) }
        try { this.renderWallet() } catch (renderError) { console.error('Wallet render failed after upgrade', renderError) }
        if (this.screen === 'battle') {
          try { this.renderBattleStatus() } catch (renderError) { console.error('Battle render failed after upgrade', renderError) }
        }
        if (this.screen === 'forge') await this.playForgeUpgradeAnimation(success)
        // 애니메이션 중 화면을 이동했더라도 재화 표시는 최신 상태로 유지합니다.
        this.renderWallet()
        this.toast(success ? '✨ 강화 성공! 전투력이 올랐어요!' : '강화 실패! 강화 단계는 유지돼요.')
      } catch(e) {
        if(e instanceof RequestError && ['forge_no_fragments','not_enough_coins'].includes(e.code)) this.showForgeInsufficient()
        else if (e instanceof RequestError && e.code === 'network') {
          // Do not retry the non-idempotent upgrade. Check authoritative server state.
          try {
            await this.store.restore()
            this.renderForge()
            this.renderWallet()
            this.toast('강화 결과 확인이 지연됐어요. 서버에 저장된 강화 단계와 재화를 다시 불러왔어요. 확인 후 강화해 주세요.')
          } catch {
            this.toast('강화 결과를 확인할 수 없어요. 새로고침 후 강화 단계와 재화를 확인해 주세요. 연속으로 누르지 마세요.')
          }
        } else this.handleError(e)
      } finally { this.busy=false }
      return
    }
    if (action === 'claw') { this.show('claw'); return }
    if (action?.startsWith('claw-')) {
      if (action in { 'claw-up': 1, 'claw-down': 1, 'claw-left': 1, 'claw-right': 1 } && this.clawIgnoreClick) { this.clawIgnoreClick = false; return }
      await this.handleClaw(action); return
    }
    if (action === 'accessory-catalog') { this.showAccessoryCatalog(); return }
    if (action === 'catalog-back') { this.show('catalog'); return }
    if (action === 'catalog') { const c=this.root.querySelector<HTMLElement>('.accessory-count');if(c)c.textContent=`${WEAPON_ACCESSORIES.reduce((n,item)=>n+ALCHEMY_GRADES.filter(g=>((this.store.accessory.discovered||[]).includes(`${item.id}:${g.id}`)||(g.id==='normal'?(this.store.accessory.counts?.[item.id]||0):(this.store.accessory.grades?.[item.id]?.[g.id]||0))>0)).length,0)} / 48`;this.show('catalog'); return }
    if (action === 'collection') { this.show('collection'); return }
    if (action === 'decos') { this.show('decos'); return }
    if (action === 'house') { this.show('house'); return }
    if (action === 'expedition') {this.expeditionServer=1;this.expedition=null;this.expeditionPreviousHp.clear();this.expeditionPendingDamage.clear();this.show('expedition');return}
    if (action === 'exp-test-hp' || action === 'exp-test-respawn') {
      if(this.store.user?.username?.toLowerCase()!=='test')return
      try {
        await this.store.expeditionTestControl(this.expeditionServer,action==='exp-test-hp'?'hp100':'respawn')
        this.expeditionPreviousHp.delete(this.expeditionServer)
        this.expeditionPendingDamage.delete(this.expeditionServer)
        await this.loadExpedition()
        this.toast(action==='exp-test-hp'?'보스 HP를 100으로 변경했습니다.':'현재 단계 보스를 재생성했습니다.')
      }catch(e){this.handleError(e)}
      return
    }
    if (action === 'exp-server') {this.expeditionServer=Number(button.dataset.id)||1;this.expeditionImpactServer=this.expeditionServer;if(this.expedition)this.renderExpedition();return}
    if (action === 'exp-join' && button.dataset.id) {try{await this.store.joinExpedition(this.expeditionServer,button.dataset.id as CharacterId);this.toast('원정대 캐릭터 배치를 저장했어요!');await this.loadExpedition();this.setExpeditionBadge(false)}catch(e){this.handleError(e)}return}
    if (action === 'mode') { this.setPullMode(button.dataset.mode === 'deco' ? 'deco' : 'char'); const popup=this.root.querySelector<HTMLElement>('.pull-popup'); if(popup){popup.hidden=false;popup.setAttribute('role','dialog');popup.setAttribute('aria-modal','true')} return }
    if (action === 'pull-rates-toggle') { this.openPullRatesDialog(); return }
    if (action === 'close-pull-rates') { document.querySelector<HTMLElement>('.pull-rates-dialog')?.remove(); return }
    if (action === 'confirm-pull-yes') { this.acceptPullConfirmation(); return }
    if (action === 'confirm-pull-no') { const dialog=this.root.querySelector<HTMLElement>('.pull-confirm-overlay'); if(dialog)dialog.hidden=true; return }
    if (action === 'close-pull-popup') { const popup=this.root.querySelector<HTMLElement>('.pull-popup'); if(popup)popup.hidden=true; return }
    if (action.startsWith('house-') && this.house.handle(action, button)) return
    if (action === 'user-tab' && button.dataset.nickname) { this.userTab = button.dataset.tab === 'deco' ? 'deco' : button.dataset.tab === 'house' ? 'house' : button.dataset.tab === 'accessory' ? 'accessory' : 'char'; this.renderUserDetail(button.dataset.nickname); return }
    if (action === 'weed') { this.show('weed'); return }
    if (action === 'battle') { this.show('battle'); void this.syncBattle(); return }
    if (action === 'announcements') { this.show('announcements'); return }
    if (action === 'global-chat') { this.show('global-chat'); return }
    if (action === 'global-chat-send') { await this.sendGlobalChat(); return }
    if (action === 'announcement-edit' && button.dataset.id) { await this.editAnnouncement(Number(button.dataset.id)); return }
    if (action === 'announcement-send') { await this.sendAnnouncement(); return }
    if (action === 'privacy') { await this.openPrivacy(); return }
    if (action === 'privacy-save') { await this.savePrivacy(); return }
    if (action === 'user-sort') { const mode = button.dataset.sort; if (mode === 'name' || mode === 'level') { this.userSortMode = mode; this.renderUsers() } return }
    if (action === 'achievements') { await this.openAchievements(); return }
    if (action === 'users') { const card = this.root.querySelector<HTMLElement>('.gacha-modal[data-screen="users"] .users-card'); card?.classList.remove('privacy-mode'); card?.querySelector<HTMLButtonElement>(':scope > button.modal-primary[data-action="close"]')?.removeAttribute('hidden'); this.show('users'); void this.loadUsers(); return }
    if (action === 'mail') { this.show('mail'); return }
    if (action === 'admin-broadcast') { this.show('users'); this.renderBroadcast(); return }
    if (action === 'admin-broadcast-send') { await this.sendBroadcast(); return }
    if (action === 'storage') { this.show('storage'); return }
    if (action === 'suggest') { this.show('suggest'); return }
    if (action === 'featured') { this.show('featured'); return }
    if (action === 'featured-pick' && button.dataset.id) { await this.chooseFeatured(button.dataset.id as CharacterId); return }
    if (action === 'mail-claim-all') { await this.claimMail(); return }
    if (action === 'mail-tab' && button.dataset.tab) { this.mailTab = button.dataset.tab === 'sent' ? 'sent' : 'in'; if (this.lastBox) this.renderMail(this.lastBox); return }
    if (action === 'mail-delete' && button.dataset.id) { await this.deleteMail(Number(button.dataset.id), button.dataset.box === 'sent' ? 'sent' : 'in'); return }
    if (action === 'storage-tab' && button.dataset.tab) { this.storageTab = button.dataset.tab === 'inventory' ? 'inventory' : button.dataset.tab === 'deco' ? 'deco' : button.dataset.tab === 'accessory' ? 'accessory' : 'char'; this.renderStorage(); return }
    if (action === 'storage-bulk-sell') { await this.sellBulk(button); return }
    if (action === 'sell' && button.dataset.id && button.dataset.kind) { await this.sell(button.dataset.kind === 'deco' ? 'deco' : 'char', button.dataset.id, Number(button.dataset.count) || 1, button); return }
    if (action === 'suggest-reply' && button.dataset.id) { await this.replySuggestion(Number(button.dataset.id)); return }
    if (action === 'suggest-delete' && button.dataset.id) { await this.deleteSuggestion(Number(button.dataset.id)); return }
    if (action === 'mail-claim' && button.dataset.id) { await this.claimMail(Number(button.dataset.id)); return }
    if (action === 'mail-compose' && button.dataset.nickname) { await this.renderCompose(button.dataset.nickname); return }
    if (action === 'mail-send' && button.dataset.nickname) { await this.sendMail(button.dataset.nickname); return }
    if (action === 'user-list') { this.renderUsers(); return }
    if (action === 'user-view' && button.dataset.nickname) { this.userTab = 'char'; this.renderUserDetail(button.dataset.nickname); return }
    if (action === 'close') { const reopen=this.screen==='result'; const kind=this.resultKind; this.show('title'); if(reopen){this.setPullMode(kind==='deco'?'deco':'char');const popup=this.root.querySelector<HTMLElement>('.pull-popup');if(popup)popup.hidden=false} return }
    if (action === 'result-collection') { this.show(this.resultKind === 'deco' ? 'decos' : 'collection'); return }
    if (action === 'retry') { this.actions.retry(); return }
    if (action === 'auth-login' || action === 'auth-register') { this.setAuthMode(action === 'auth-login' ? 'login' : 'register'); return }
    if (action === 'logout') {
      this.clawToys = []; this.clawToysOwner = ''
      try { await this.store.logout() } catch { /* The session is cleared locally either way. */ }
      this.setAuthMode('login')
      this.show('auth')
      return
    }
    if (this.busy) return
    if (action === 'roulette') { this.show('roulette'); this.renderWallet(); return }
    if (action === 'roulette-spin') { await this.spinRoulette(); return }
    if (action === 'daily') {
      this.openAttendancePopup()
      return
    }
    if (action === 'free-daily-pull' && !this.pullConfirmed) { if(this.freePullRemaining()===0){this.toast('오늘의 무료 10회 뽑기를 이미 사용했어요.');return} this.askPullConfirmation('free',10); return }
    if (action === 'free-daily-pull') { this.pullConfirmed=false; const button10=this.root.querySelector<HTMLButtonElement>('.pull-button[data-action="pull"][data-count="10"]'); if(!button10)return; this.pullConfirmed=true; button10.dataset.forceFree='true'; button10.click(); delete button10.dataset.forceFree; this.pullConfirmed=false; return }
    if (action === 'pull' && !this.pullConfirmed) { this.askPullConfirmation('char',Number(button.dataset.count)); return }
    if (action === 'pull') { this.pullConfirmed=false;
      const count = Number(button.dataset.count) as PullCount
      if (!PULL_OPTIONS.some(option => option.count === count)) return
      const free = button.dataset.forceFree === 'true'
      const cost = free ? 0 : pullCost(count)
      if (!this.isAdmin && this.store.data.gems < cost) { this.showInsufficient(cost); return }
      this.busy = true
      this.revealing = true
      this.renderWallet()
      let result: PullResult[]
      try { result = await this.store.pull(count, free) } catch (error) {
        this.revealing = false
        this.handleError(error)
        this.renderWallet()
        return
      } finally { this.busy = false }
      this.audio.play('pickup')
      this.results = result.map(item => this.characterReveal(item))
      this.resultKind = 'char'
      this.revealing = true
      const duration = this.spinMachine(characterById(result[result.length - 1].id).accent)
      const sequence = ++this.revealSequence
      this.renderWallet()
      this.renderFreePullStatus()
      this.renderResults()
      window.setTimeout(() => { void this.playPops(this.results, sequence) }, 180)
      return
    }
    if (action === 'deco-pull' && !this.pullConfirmed) { this.askPullConfirmation('deco',Number(button.dataset.count)); return }
    if (action === 'deco-pull') { this.pullConfirmed=false;
      const count = Number(button.dataset.count) as DecoPullCount
      if (!DECO_PULL_OPTIONS.some(option => option.count === count)) return
      if (!this.isAdmin && this.store.data.gems < decoPullCost(count)) { this.showInsufficient(decoPullCost(count)); return }
      this.busy = true
      this.revealing = true
      this.renderWallet()
      let result: DecoPullResult[]
      try { result = await this.store.pullDecos(count) } catch (error) {
        this.revealing = false
        this.handleError(error)
        this.renderWallet()
        return
      } finally { this.busy = false }
      this.audio.play('pickup')
      this.results = result.map(item => this.decoReveal(item))
      this.resultKind = 'deco'
      const duration = this.spinMachine('#f2b6c6')
      const sequence = ++this.revealSequence
      this.renderWallet()
      this.renderResults()
      window.setTimeout(() => { void this.playPops(this.results, sequence) }, 180)
      return
    }
    if (action === 'weed-pick' && button.dataset.id) {
      const id = button.dataset.id as CharacterId
      const name = fullName(characterById(id))
      const leaving = this.store.isWeeding(id)
      if (!leaving && (this.store.battle?.id === id || this.store.battle?.secondId === id || this.store.battle?.thirdId === id)) { this.toast(ERROR_TEXT.busy_battle); return }
      if (!leaving && (this.store.weed?.members.length ?? 0) >= WEED_MAX) { this.toast(ERROR_TEXT.weed_full); return }
      this.busy = true
      try {
        if (leaving) {
          const earned = await this.store.stopWeeding(id)
          this.toast(earned > 0 ? `${earned}코인을 받고 ${withJosa(name, '이', '가')} 제초를 쉬어요.` : `${withJosa(name, '이', '가')} 제초를 쉬어요.`)
        } else {
          const earned = await this.store.startWeeding(id)
          this.toast(earned > 0 ? `${earned}코인을 받고 ${withJosa(name, '이', '가')} 제초를 시작했어요!` : `${withJosa(name, '이', '가')} 제초를 시작했어요! (${this.store.weed?.members.length ?? 1}/${WEED_MAX})`)
        }
      } catch (error) { this.handleError(error) } finally { this.busy = false }
      this.renderWeed()
      this.renderWallet()
      return
    }
    if (action === 'battle-retry-challenge') {
      if (this.busy || !this.store.battle) return
      this.busy=true
      try { await this.store.retryBattleStage(); this.lastEnemyHp=-1; this.renderBattleStatus() }
      catch(error){this.handleError(error)} finally{this.busy=false}
      return
    }
    if (action === 'battle-boss-challenge' || action === 'battle-test-time5') {
      if (this.busy || !this.store.battle) return
      this.busy = true
      try {
        if (action === 'battle-boss-challenge') await this.store.challengeBattleBoss()
        else {
          if (this.store.user?.username?.toLowerCase() !== 'test') return
          await this.store.testBattleTime5()
        }
        this.lastEnemyHp = -1
        this.renderBattleStatus()
      } catch (error) { this.handleError(error) }
      finally { this.busy = false }
      return
    }
    if (action === 'battle-test-hp500') {
      if (this.busy || this.store.user?.username?.toLowerCase() !== 'test') return
      this.busy = true
      try { await this.store.testBattleHp500(); this.lastEnemyHp = -1; this.toast('현재 단계 몬스터 HP가 500이 되었습니다.') }
      catch (error) { this.handleError(error) }
      finally { this.busy = false }
      this.renderBattleStatus()
      return
    }
    if (action === 'battle-test-reset') {
      if (this.busy || this.store.user?.username?.toLowerCase() !== 'test') return
      this.busy = true
      try {
        await this.store.testResetBattle()
        this.lastEnemyHp = -1
        this.toast('1-1 단계부터 다시 시작합니다.')
      } catch (error) { this.handleError(error) } finally { this.busy = false }
      this.renderBattle()
      this.renderWallet()
      return
    }
    if (action === 'battle-test-clear') {
      if (this.busy || this.store.user?.username?.toLowerCase() !== 'test') return
      this.busy = true
      try {
        await this.store.testClearBattle()
        this.lastEnemyHp = -1
        this.toast('테스트 단계 클리어! 다음 단계로 이동했어요.')
      } catch (error) { this.handleError(error) } finally { this.busy = false }
      this.renderBattle()
      this.renderWallet()
      return
    }
    if (action === 'battle-pick' && button.dataset.id) {
      const id = button.dataset.id as CharacterId
      if (this.weedBusy(id)) { this.toast(ERROR_TEXT.busy_weed); return }
      this.busy = true
      try {
        const wasDeployed = this.store.battle?.id === id || this.store.battle?.secondId === id || this.store.battle?.thirdId === id
        const members = [this.store.battle?.id,this.store.battle?.secondId,this.store.battle?.thirdId].filter(Boolean)
        if (wasDeployed && members.length === 1) {
          if (!await this.confirmBattleUndeploy()) return
        }
        const earned = await this.store.startBattle(id)
        const name = fullName(characterById(id))
        if (wasDeployed) {
          this.toast(earned > 0 ? `${withJosa(name, '이', '가')} 토벌에서 돌아왔어요! · 처치 보상 강화파편 +${earned}개` : `${withJosa(name, '이', '가')} 토벌에서 돌아왔어요!`)
        } else {
          this.toast(earned > 0 ? `몬스터 ${earned}마리 처치 보상 강화파편 ${earned}개! ${withJosa(name, '이', '가')} 토벌에 나섰어요!` : `${withJosa(name, '이', '가')} 토벌에 나섰어요! (전투력 ${battlePower(id)})`)
        }
      } catch (error) { this.handleError(error) } finally { this.busy = false }
      this.lastEnemyHp = -1
      this.renderBattle()
      this.renderWallet()
      return
    }
    if (action === 'weed-beetle') {
      const on = !this.store.weed?.beetle
      this.busy = true
      try {
        const earned = await this.store.setBeetle(on)
        const paid = earned > 0 ? `${earned}코인을 받고 ` : ''
        this.toast(on ? `${paid}풍뎅이가 제초장에 왔어요! 이제 제초 코인이 2배로 모여요.` : `${paid}풍뎅이가 돌아왔어요.`)
      } catch (error) { this.handleError(error) } finally { this.busy = false }
      this.renderWeed()
      this.renderWallet()
      return
    }
    if (action === 'weed-claim') {
      this.busy = true
      try {
        const earned = await this.store.claimWeeding()
        if (earned > 0) { this.audio.play('pickup'); this.toast(`제초 보상 ${earned}코인을 받았어요!`) } else this.toast('아직 모인 코인이 없어요. 조금만 기다려 주세요.')
      } catch (error) { this.handleError(error) } finally { this.busy = false }
      this.renderWeedStatus()
      this.renderWallet()
      return
    }
    if (action === 'choose' && button?.dataset.id) {
      const id = button.dataset.id as CharacterId
      if (!this.store.data.owned.includes(id) || id === this.heroId()) return
      await this.chooseFeatured(id)
    }
  }

  /** Featured friend on the 2D stage: the chosen one, else the first collected, else 치이카와. */
  private renderHero(): void {
    const owned = this.store.data.owned
    const id = this.heroId()
    this.renderProfile()
    const character = characterById(id)
    const image = this.root.querySelector<HTMLImageElement>('.toon-hero-img')
    if (image && image.dataset.id !== id) { image.src = CHARACTER_IMAGE_URLS[id]; image.alt = fullName(character); image.dataset.id = id }
    const label = this.root.querySelector<HTMLElement>('.toon-hero-name')
    if (label) label.textContent = owned.length ? fullName(character) : '첫 친구를 뽑아 보세요!'
    this.root.querySelector('.toon-stage')?.classList.toggle('is-empty', owned.length === 0)
  }

  /** Cartoon machine: shake, turn the handle and drop a capsule; returns the animation length in seconds. */
  private spinMachine(capsuleColor: string): number {
    const stage = this.root.querySelector<HTMLElement>('.toon-stage')
    const capsule = this.root.querySelector<HTMLElement>('.toon-capsule')
    if (capsule) capsule.style.setProperty('--cap', capsuleColor)
    if (!stage) return 0
    stage.classList.remove('is-spinning')
    void stage.offsetWidth
    stage.classList.add('is-spinning')
    window.setTimeout(() => stage.classList.remove('is-spinning'), MACHINE_SPIN_SECONDS * 1000 + 400)
    return MACHINE_SPIN_SECONDS
  }

  /** Operator accounts have unlimited coins (the server never charges them). */
  private get isAdmin(): boolean { return Boolean(this.store.user?.admin) }
  private get isForgeOperator(): boolean { return this.store.user?.username === 'tjdrjs885' }

  private get clawStorageKey(): string { return `geongi-claw-v1-${this.store.user?.username ?? 'guest'}` }

  private restoreClawToys(): void {
    // Always compare the logged-in account: an in-memory arrangement must not leak across accounts.
    const key = this.clawStorageKey
    if (this.clawToysOwner === key && this.clawToys.length) return
    this.clawToysOwner = key
    this.clawToys = []
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) {
        const saved: unknown = JSON.parse(raw)
        if (Array.isArray(saved) && saved.length === 5 && saved.every((t: any) =>
          ['chiikawa_1','chiikawa_2','chiikawa_3','chiikawa_4','chiikawa_5'].includes(t?.id) &&
          typeof t.x === 'number' && Number.isFinite(t.x) && t.x >= 0 && t.x <= 100 &&
          typeof t.y === 'number' && Number.isFinite(t.y) && t.y >= 0 && t.y <= 100)) {
          this.clawToys = saved as typeof this.clawToys
          // Keep previously saved plushes off the machine's bottom decorative bezel.
          let corrected = false
          for (const toy of this.clawToys) {
            const safeY = Math.max(18, Math.min(69, toy.y))
            if (toy.y !== safeY) { toy.y = safeY; corrected = true }
          }
          if (corrected) this.saveClawToys()
          return
        }
      }
    } catch { /* storage unavailable: keep the in-memory arrangement */ }
    this.randomizeClawToy()
  }

  private saveClawToys(): void {
    try { window.localStorage.setItem(this.clawStorageKey, JSON.stringify(this.clawToys)) } catch { /* private browsing */ }
  }

  private randomizeClawToy(id?: string): void {
    const types = [
      { id: 'chiikawa_1', name: '치이카와' },
      { id: 'chiikawa_2', name: '치이카와' },
      { id: 'chiikawa_3', name: '치이카와' },
      { id: 'chiikawa_4', name: '치이카와' },
      { id: 'chiikawa_5', name: '치이카와' },
    ]
    if (!this.clawToys.length) this.clawToys = types.map(type => ({ ...type, x: 0, y: 0 }))
    for (const toy of this.clawToys) {
      if (id && toy.id !== id) continue
      let x = 18, y = 28
      for (let attempt = 0; attempt < 80; attempt++) {
        x = 16 + Math.random() * 68
        y = 22 + Math.random() * 46
        // Never spawn inside or immediately beside the upper-right prize chute.
        if (x > 64 && y < 42) continue
        if (this.clawToys.every(other => other === toy || other.id === id || Math.hypot(other.x - x, other.y - y) >= 21)) break
      }
      toy.x = x; toy.y = y
    }
    this.saveClawToys()
  }

  private clawTouchesToy(): boolean {
    this.clawTargetId = null
    const arm = this.root.querySelector<HTMLElement>('.claw-arm')
    if (!arm) return false
    const a = arm.getBoundingClientRect()
    // Require the plush's CENTER to sit between the claw jaws.
    // A grazing contact with the outer tips no longer counts as a pickup.
    const gripX = a.left + a.width * .50
    const gripY = a.top + a.height * .80
    let nearest = Infinity
    this.root.querySelectorAll<HTMLElement>('.claw-single-toy').forEach(toy => {
      const b = toy.getBoundingClientRect()
      const centerX = b.left + b.width / 2
      const centerY = b.top + b.height / 2
      const dx = Math.abs(centerX - gripX)
      const dy = Math.abs(centerY - gripY)
      const xTolerance = Math.min(a.width * .16, b.width * .32)
      const yTolerance = Math.min(a.height * .14, b.height * .36)
      const distance = Math.hypot(dx / xTolerance, dy / yTolerance)
      if (dx <= xTolerance && dy <= yTolerance && distance < nearest) {
        nearest = distance
        this.clawTargetId = toy.dataset.toyId ?? null
      }
    })
    return this.clawTargetId !== null
  }

  private setClawClosed(closed: boolean): void {
    const graphic = this.root.querySelector<HTMLImageElement>('.claw-graphic')
    if (graphic) graphic.src = closed ? '/assets/claw/claw_closed.png' : '/assets/claw/claw_open.png'
  }

  private respawnClawToy(): void {
    const id = this.clawTargetId
    if (!id) return
    this.randomizeClawToy(id)
    const data = this.clawToys.find(toy => toy.id === id)
    const toy = this.root.querySelector<HTMLElement>(`.claw-single-toy[data-toy-id="${id}"]`)
    if (!toy || !data) { this.renderClaw(); return }
    toy.classList.remove('is-lifted', 'is-dropped')
    toy.style.transition = 'none'
    toy.style.left = `${data.x}%`
    toy.style.top = `${data.y}%`
    void toy.offsetWidth
    toy.style.removeProperty('transition')
    const arm = this.root.querySelector<HTMLElement>('.claw-arm')
    if (arm) { arm.classList.remove('is-dropping'); arm.style.removeProperty('transition') }
    // Do not move the arm here: successful deliveries already finish at the chute.
    // Moving to stale this.clawX/Y caused a phantom empty-claw grab after reward.
  }

  private renderClaw(): void {
    this.renderWallet()
    if (!this.clawToys.length) this.randomizeClawToy()
    const toys = this.root.querySelector<HTMLElement>('.claw-toys')
    if (toys) toys.innerHTML = this.clawToys.map(toy =>
      `<img class="claw-single-toy" data-toy-id="${toy.id}" src="/assets/chars/chiikawa_face_claw.png" alt="${toy.name} 얼굴 인형" style="left:${toy.x}%;top:${toy.y}%"/>`
    ).join('')
    const prizeEl = this.root.querySelector<HTMLElement>('.claw-prize')
    if (prizeEl) { prizeEl.innerHTML = ''; prizeEl.classList.remove('is-delivered') }
    const msg = this.root.querySelector<HTMLElement>('.claw-message')
if (msg) msg.textContent = '집게를 원하는 인형 위치로 움직여 뽑아보세요. 모든 키링에 같은 확률과 보상이 적용돼요.'
    this.updateClawPosition()
  }

  private updateClawPosition(): void {
    const arm = this.root.querySelector<HTMLElement>('.claw-arm')
    if (arm) { arm.style.left = `${this.clawX}%`; arm.style.top = `${this.clawY}%` }
  }

  private stopClawHold(): void {
    window.clearTimeout(this.clawHoldDelay)
    window.clearInterval(this.clawHoldTimer)
    this.clawHoldDelay = undefined
    this.clawHoldTimer = undefined
  }

  private resetClawToExit(): void {
    const machine = this.root.querySelector<HTMLElement>('.claw-machine')
    const chute = this.root.querySelector<HTMLElement>('.claw-chute')
    if (machine && chute) {
      const m = machine.getBoundingClientRect()
      const c = chute.getBoundingClientRect()
      if (m.width > 0 && m.height > 0) {
        this.clawX = Math.max(10, Math.min(90, (c.left + c.width / 2 - m.left) / m.width * 100))
        this.clawY = Math.max(3, Math.min(90, (c.top + c.height / 2 - m.top) / m.height * 100 - 12))
        return
      }
    }
    this.clawX = 88
    this.clawY = 3
  }

  private moveClaw(action: string): void {
    if (this.clawBusy) return
    const directions: Record<string, [number, number]> = { 'claw-up':[0,-2.8], 'claw-down':[0,2.8], 'claw-left':[-2.8,0], 'claw-right':[2.8,0] }
    const move = directions[action]
    if (!move) return
    this.clawTargetId = null // A previous successful grab must not remain selected while moving.
    this.clawX = Math.max(10, Math.min(90, this.clawX + move[0]))
    this.clawY = Math.max(10, Math.min(90, this.clawY + move[1]))
    this.updateClawPosition()
  }

  private async handleClaw(action: string): Promise<void> {
    if (this.clawBusy) return
    if (['claw-up', 'claw-down', 'claw-left', 'claw-right'].includes(action)) { this.moveClaw(action); return }
    if (action === 'claw-refresh') {
      this.clawBusy = true
      const refresh = this.root.querySelector<HTMLButtonElement>('.claw-refresh')
      if(refresh)refresh.disabled=true
      try {
        await this.store.refreshClaw()
        this.randomizeClawToy()
        this.resetClawToExit()
        this.renderClaw()
        this.renderWallet()
        this.toast('다이아 2개를 사용해 인형 위치를 새로 배치했어요!')
        const clawMessage = this.root.querySelector<HTMLElement>('.claw-message')
        if (clawMessage) clawMessage.textContent = '다이아 2개를 사용해 인형 위치를 새로 배치했어요!'
      } catch(error) { this.handleError(error) }
      finally {this.clawBusy=false;if(refresh)refresh.disabled=false}
      return
    }
    if (action !== 'claw-play') return
    this.stopClawHold()
    this.clawBusy = true
    const btn = this.root.querySelector<HTMLButtonElement>('.claw-play')
    const arm = this.root.querySelector<HTMLElement>('.claw-arm')
    const prizeEl = this.root.querySelector<HTMLElement>('.claw-prize')
    const msg = this.root.querySelector<HTMLElement>('.claw-message')
    if (btn) btn.disabled = true
    if (prizeEl) { prizeEl.innerHTML = ''; prizeEl.classList.remove('is-delivered') }
    this.root.querySelectorAll<HTMLElement>('.claw-single-toy').forEach(node => node.classList.remove('is-lifted', 'is-dropped'))
    let wonToy = false
    try {
      const aligned = this.clawTouchesToy()
      const toy = this.clawTargetId ? this.root.querySelector<HTMLElement>(`.claw-single-toy[data-toy-id="${this.clawTargetId}"]`) : null
      const originalToy = this.clawToys.find(item => item.id === this.clawTargetId)
      const result = await this.store.playClaw(aligned, originalToy?.x ?? 50, originalToy?.y ?? 50)
      this.renderWallet()
      if (msg) msg.textContent = aligned ? '집게가 인형을 잡고 들어 올립니다…' : '집게가 허공을 잡았어요! 인형에 닿도록 이동해주세요.'
      arm?.classList.add('is-dropping')
      await new Promise(resolve => window.setTimeout(resolve, 320))
      this.setClawClosed(true)
      await new Promise(resolve => window.setTimeout(resolve, 380))
      arm?.classList.remove('is-dropping')
      // Position the plush at the claw tips BEFORE showing its picked-up state.
      // This prevents the old position briefly flashing in the upper-left.
      if (aligned && toy && arm) {
        const machine = this.root.querySelector<HTMLElement>('.claw-machine')
        const clawBox = arm.getBoundingClientRect()
        const machineBox = machine?.getBoundingClientRect()
        const offsetY = machineBox && machineBox.height > 0 ? clawBox.height * .29 / machineBox.height * 100 : 7
        toy.style.transition = 'none'
        toy.style.left = `${this.clawX}%`
        toy.style.top = `${this.clawY + offsetY}%`
        void toy.offsetWidth
        toy.classList.add('is-lifted')
      }
      await new Promise(resolve => window.setTimeout(resolve, aligned ? 350 : 250))
      if (aligned && toy) {
        // Keep the plush attached to the claw during the entire trip to the exit.
        // Derive the exit center from the actual rendered chute, including mobile layouts.
        const machine = this.root.querySelector<HTMLElement>('.claw-machine')
        const chute = this.root.querySelector<HTMLElement>('.claw-chute')
        let exitX = 88
        let exitY = 3
        if (machine && chute) {
          const m = machine.getBoundingClientRect()
          const c = chute.getBoundingClientRect()
          if (m.width > 0 && m.height > 0) {
            exitX = Math.max(0, Math.min(100, (c.left + c.width / 2 - m.left) / m.width * 100))
            exitY = Math.max(3, Math.min(100, (c.top + c.height / 2 - m.top) / m.height * 100 - 12))
          }
        }
        if (msg) msg.textContent = '인형을 집었어요! 출구까지 잘 버틸까요?'
        const steps = Math.max(1, result.segments)
        // Both the claw and plush are positioned by their centers in machine coordinates.
        // Snap the picked-up plush to the center of the claw before transport.
        const startX = this.clawX
        const startY = this.clawY
        toy.style.transition = 'none'
        // The toy hangs at the gripping tips, below the claw's center.
        const clawBox = arm?.getBoundingClientRect()
        const machineBox = machine?.getBoundingClientRect()
        const gripOffsetY = clawBox && machineBox && machineBox.height > 0
          ? clawBox.height * .29 / machineBox.height * 100 : 7
        toy.style.left = `${startX}%`
        toy.style.top = `${startY + gripOffsetY}%`
        void toy.offsetWidth
        const endStep = result.won ? steps : Math.max(1, result.dropAt)
        for (let step = 1; step <= endStep; step++) {
          // A failed lift stops before the exact chute center. Successful lifts
          // always travel to the chute center, regardless of the starting point.
          const fraction = result.won ? step / steps : Math.min(.86, step / steps)
          const px = startX + (exitX - startX) * fraction
          const py = startY + (exitY - startY) * fraction
          if (arm) { arm.style.transition = 'left .28s linear, top .28s linear'; arm.style.left = `${px}%`; arm.style.top = `${py}%` }
          toy.style.transition = 'left .28s linear, top .28s linear'
          toy.style.left = `${px}%`; toy.style.top = `${py + gripOffsetY}%`
          await new Promise(resolve => window.setTimeout(resolve, 310))
        }
        if (!result.won) {
          if (msg) msg.textContent = '이동 중 인형이 떨어졌어요!'
          // Stop movement and place the toy immediately, without a shrinking/fading
          // drop animation that leaves a visible trail on the machine background.
          toy.style.transition = 'none'
          toy.classList.remove('is-lifted', 'is-dropped')
          // A failed grab stays where it fell, including after leaving or reloading.
          const landedFraction = Math.min(.86, endStep / steps)
          // Land just BELOW the exact release point, with small independent
          // variations on each attempt. Never force misses to the chute's left.
          const releaseX = startX + (exitX - startX) * landedFraction
          const releaseY = startY + (exitY - startY) * landedFraction + gripOffsetY
          const jitterX = (Math.random() - .5) * 6
          const jitterY = 4 + Math.random() * 4
          let landedX = Math.max(10, Math.min(90, releaseX + jitterX))
          let landedY = Math.max(18, Math.min(69, releaseY + jitterY))
          // Keep the whole plush outside the prize chute (including a safety
          // margin), choosing the nearest valid side based on drop location.
          if (machine && chute) {
            const mb = machine.getBoundingClientRect()
            const cb = chute.getBoundingClientRect()
            const toyBox = toy.getBoundingClientRect()
            const halfW = toyBox.width / 2 + 9
            const halfH = toyBox.height / 2 + 9
            const minX = (cb.left - halfW - mb.left) / mb.width * 100
            const maxX = (cb.right + halfW - mb.left) / mb.width * 100
            const minY = (cb.top - halfH - mb.top) / mb.height * 100
            const maxY = (cb.bottom + halfH - mb.top) / mb.height * 100
            if (landedX > minX && landedX < maxX && landedY > minY && landedY < maxY) {
              // Prefer dropping below the chute, where the toy actually falls.
              // If there is insufficient space, choose the closest other side.
              const candidates = [
                {x:landedX,y:maxY + 1},
                {x:minX - 1,y:landedY},
                {x:maxX + 1,y:landedY},
                {x:landedX,y:minY - 1},
              ].filter(pt => pt.x >= 10 && pt.x <= 90 && pt.y >= 18 && pt.y <= 69)
              const target = candidates.sort((a,b) =>
                Math.hypot(a.x-landedX,a.y-landedY) - Math.hypot(b.x-landedX,b.y-landedY))[0]
              if(target){landedX=target.x;landedY=target.y}
            }
          }
          if (originalToy) {
            originalToy.x = Math.max(10, Math.min(90, landedX))
            originalToy.y = landedY
            this.saveClawToys()
          }
          toy.classList.remove('is-lifted', 'is-dropped')
          toy.style.transition = 'none'
          toy.style.left = `${landedX}%`
          toy.style.top = `${landedY}%`
          void toy.offsetWidth
          // Briefly show the supplied sticker between the release claw and fallen doll.
          const sticker = this.root.querySelector<HTMLElement>('.claw-missed-sticker')
          if (sticker) {
            const midX = Math.max(10, Math.min(90, (releaseX + landedX) / 2))
            const midY = Math.max(10, Math.min(90, (releaseY + landedY) / 2))
            sticker.style.left = `${midX}%`
            sticker.style.top = `${midY}%`
            sticker.classList.remove('is-visible')
            void sticker.offsetWidth
            sticker.classList.add('is-visible')
            window.setTimeout(() => sticker.classList.remove('is-visible'), 850)
          }
          // Do not restore the old transition: it can animate from the dropped
          // coordinates to the saved position and leave a ghost/trail.
        }
      }
      if (result.won && result.prize) {
        wonToy = true
        // The claw itself is precisely centered on the chute before releasing.
        // Only release the doll once both claw and doll have reached the exit.
        toy?.classList.add('is-dropped')
        // Open once as the prize drops. Do not animate the claw a second time
        // after the reward appears.
        this.setClawClosed(false)
        await new Promise(resolve => window.setTimeout(resolve, 520))
        const item=accessoryInfo(result.prize)!
        const earnedText = `${item.name} 획득! 무기 액세서리 도감에 등록됐어요!`
        if(prizeEl){prizeEl.innerHTML=`<img src="${item.image}" alt="${item.name}"/>`;prizeEl.classList.remove('is-delivered');void prizeEl.offsetWidth;prizeEl.classList.add('is-delivered')}
        if(msg)msg.textContent=earnedText
        this.toast(earnedText)
        const popup=document.createElement('dialog')
        popup.className='myroom-equipment-dialog'
        popup.innerHTML=`<div class="myroom-equipment-panel accessory-win-panel"><h2>무기 액세서리 획득!</h2><div class="accessory-item"><img src="${item.image}" alt="${item.name}"/><div><b>${item.name}</b><small>노말 등급</small><strong>장착 시 전투력 +1</strong></div></div><button class="myroom-equipment-done">확인</button></div>`
        document.body.appendChild(popup)
        popup.querySelector('button')?.addEventListener('click',()=>popup.close())
        popup.addEventListener('close',()=>popup.remove(),{once:true})
        popup.showModal()
        window.setTimeout(() => {
          if (prizeEl) { prizeEl.innerHTML = ''; prizeEl.classList.remove('is-delivered') }
          if (msg && msg.textContent === earnedText) msg.textContent = '집게를 인형 위치로 움직여 뽑아보세요.'
        }, 2300)
      } else {
        if (msg && !aligned) msg.textContent = '허공이라 인형을 잡지 못했어요!'
      }
    } catch (error) { this.handleError(error) }
    finally {
      // Even after a missed grab or an early drop, the empty claw must return
      // to the exit before the player can move it again. The fallen toy stays put.
      if (wonToy) this.respawnClawToy()
      const clawArm = this.root.querySelector<HTMLElement>('.claw-arm')
      // Let the claw linger briefly at the exact missed-drop location.
      if (!wonToy && clawArm) await new Promise(resolve => window.setTimeout(resolve, 230))
      this.resetClawToExit()
      if (clawArm) {
        if (wonToy) {
          // Successful pickup is already at the chute; never replay an empty
          // return/grab animation after the prize has been awarded.
          clawArm.style.transition = 'none'
          this.updateClawPosition()
          void clawArm.offsetWidth
          clawArm.style.removeProperty('transition')
        } else {
          clawArm.style.transition = 'left .45s ease-in-out, top .45s ease-in-out'
          this.updateClawPosition()
          await new Promise(resolve => window.setTimeout(resolve, 470))
          clawArm.style.removeProperty('transition')
        }
      }
      if (!wonToy) this.setClawClosed(false)
      this.clawTargetId = null
      this.clawBusy=false
      if(btn) btn.disabled=false
    }
  }

  private setHouseCoinDot(available: boolean): void {
    const dot = this.root.querySelector<HTMLElement>('.house-coin-dot')
    if (dot) dot.hidden = !available
  }

  private async refreshHouseCoinBadge(): Promise<void> {
    this.setHouseCoinDot(false)
  }

  private async refreshLotteryLive():Promise<void>{
    try{const state=await this.store.lottery();if(this.screen==='rps'&&!this.lotteryResults.length){this.lotteryState=state;this.renderLottery()}}catch{}
  }
  private async openLottery():Promise<void>{
    try{this.lotteryState=await this.store.lottery();this.lotteryResults=[];this.lotteryRevealed=0;this.root.querySelector('.lottery-screen')?.classList.remove('lottery-playing');this.renderLottery();void this.showLotteryResetNotice()}
    catch{const el=this.root.querySelector<HTMLElement>('.lottery-status');if(el)el.textContent='복권 정보를 불러오지 못했습니다.'}
  }
  private updateLotteryPrice():void{
    const count=Number(this.root.querySelector<HTMLInputElement>('.lottery-count')?.value||1)
    const price=this.root.querySelector<HTMLElement>('.lottery-price')
    if(price)price.textContent=`가격 ${(Math.max(0,count)*100).toLocaleString('ko-KR')}코인`
  }
  private lotteryAccessoryName(accessoryId:string):string{
    const names:Record<string,string>={chiikawa:'치이카와',hachiware:'하치와레',usagi:'우사기',momonga:'모몽가',kurimanju:'쿠리만쥬',shisa:'시사',kani:'카니',rakko:'랏코'}
    const key=accessoryId.replace(/_keyring$/,'')
    return `레어 ${names[key]??key} 키링`
  }
  private renderLottery():void{
    const state=this.lotteryState;if(!state)return
    const status=this.root.querySelector<HTMLElement>('.lottery-status')
    if(status)status.textContent=`전체 100장 · 남은 복권 ${state.total}장`
    const balance=this.root.querySelector<HTMLElement>('.lottery-balance-value');if(balance)balance.textContent=this.store.data.gems.toLocaleString('ko-KR')
    const reset=this.root.querySelector<HTMLButtonElement>('[data-action="lottery-reset"]');if(reset)reset.hidden=!['test','tjdrjs885'].includes(this.store.user?.username?.toLowerCase()||'')
    const prizes=this.root.querySelector<HTMLElement>('.lottery-prizes')
    const ids=['halloween_chiikawa','halloween_hachiware','halloween_usagi'] as const
    const accessoryIds=['chiikawa','hachiware','usagi','momonga','kurimanju','shisa','kani','rakko']
    if(prizes)prizes.innerHTML=state.remaining.map((n,i)=>`<div class="lottery-prize${n===0?' lottery-sold-out':''}"><b>${'ABCDEFGHIJKL'[i]}상</b>${i<3?`<img src="${CHARACTER_IMAGE_URLS[ids[i] as keyof typeof CHARACTER_IMAGE_URLS]}" alt=""/><span>${['치이카와(할로윈)','하치와레(할로윈)','우사기(할로윈)'][i]}</span>`:i<11?`<img src="/assets/accessories/${accessoryIds[i-3]}_keyring.png" alt=""/><span>${accessoryIds[i-3]==='chiikawa'?'치이카와':({hachiware:'하치와레',usagi:'우사기',momonga:'모몽가',kurimanju:'쿠리만쥬',shisa:'시사',kani:'카니',rakko:'랏코'} as Record<string,string>)[accessoryIds[i-3]]} 레어 키링</span>`:'<span>꽝</span>'}<small>${n}장 · ${state.total?(n/state.total*100).toFixed(2):'0.00'}%</small>${n===0?'<img class="lottery-sold-stamp" src="/assets/lottery_sold_out.png" alt="품절"/>':''}</div>`).join('')
    const winners=this.root.querySelector<HTMLElement>('.lottery-winners');if(winners){winners.replaceChildren();const label=document.createElement('strong');label.textContent='최근 당첨';winners.append(label);if(state.winners?.length){for(const w of state.winners){const item=document.createElement('span');item.className='lottery-winner-item';item.textContent=`${w.nickname} · ${w.grade}상`;winners.append(item)}}else{const empty=document.createElement('span');empty.textContent='아직 당첨자가 없습니다.';winners.append(empty)}}
    const input=this.root.querySelector<HTMLInputElement>('.lottery-count');if(input){input.max=String(state.total);input.disabled=state.total===0;if(Number(input.value)>state.total)input.value=String(Math.max(1,state.total))}
    const buy=this.root.querySelector<HTMLButtonElement>('[data-action="lottery-buy"]');if(buy)buy.disabled=state.total===0||this.lotteryBusy
    this.updateLotteryPrice()
  }
  private async showLotteryResetNotice():Promise<void>{
    const id=this.lotteryState?.resetNoticeId
    if(!id || document.getElementById('lottery-reset-notice'))return
    const dialog=document.createElement('dialog');dialog.id='lottery-reset-notice';dialog.className='lottery-alert'
    const panel=document.createElement('div');panel.className='lottery-alert-inner'
    const title=document.createElement('h3');title.textContent='겅이복권 안내'
    const body=document.createElement('p');body.textContent='상위상이 전부 품절되어 겅이복권이 초기화되었습니다.'
    const close=document.createElement('button');close.textContent='닫기';close.addEventListener('click',()=>dialog.close())
    panel.append(title,body,close);dialog.append(panel);document.body.append(dialog)
    dialog.addEventListener('close',()=>{
      dialog.remove()
      // Prevent the same notice reopening while the server acknowledgement is in flight.
      if(this.lotteryState?.resetNoticeId===id)this.lotteryState.resetNoticeId=undefined
      void this.store.lotteryResetSeen(id).catch(()=>{})
    },{once:true})
    dialog.showModal()
  }
  private lotteryTopPopup(message:string):void{
    document.getElementById('lottery-alert')?.remove()
    const dialog=document.createElement('dialog');dialog.id='lottery-alert';dialog.className='lottery-alert'
    const panel=document.createElement('div');panel.className='lottery-alert-inner'
    const title=document.createElement('h3');title.textContent='겅이복권'
    const body=document.createElement('p');body.textContent=message
    const button=document.createElement('button');button.textContent='확인';button.addEventListener('click',()=>dialog.close())
    panel.append(title,body,button);dialog.append(panel);document.body.append(dialog)
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal()
  }
  private lotteryConfirm(message:string):Promise<boolean>{
    return new Promise(resolve=>{
      document.getElementById('lottery-confirm')?.remove()
      const dialog=document.createElement('dialog');dialog.id='lottery-confirm';dialog.className='lottery-alert'
      const panel=document.createElement('div');panel.className='lottery-alert-inner'
      const title=document.createElement('h3');title.textContent='겅이복권 구매 확인'
      const body=document.createElement('p');body.textContent=message;body.style.whiteSpace='pre-line'
      const actions=document.createElement('div');actions.className='lottery-confirm-actions'
      const cancel=document.createElement('button');cancel.textContent='취소'
      const ok=document.createElement('button');ok.textContent='구매하기'
      cancel.addEventListener('click',()=>dialog.close('cancel'))
      ok.addEventListener('click',()=>dialog.close('ok'))
      actions.append(cancel,ok);panel.append(title,body,actions);dialog.append(panel);document.body.append(dialog)
      dialog.addEventListener('close',()=>{const accepted=dialog.returnValue==='ok';dialog.remove();resolve(accepted)},{once:true})
      dialog.showModal()
    })
  }
  private chooseLotteryCount():Promise<void>{
    return new Promise(resolve=>{
      const remaining=this.lotteryState?.total||0
      if(!remaining){this.lotteryTopPopup('남은 복권이 없습니다.');resolve();return}
      document.getElementById('lottery-count-dialog')?.remove()
      const dialog=document.createElement('dialog');dialog.id='lottery-count-dialog';dialog.className='lottery-alert'
      const panel=document.createElement('div');panel.className='lottery-alert-inner'
      const title=document.createElement('h3');title.textContent='여러장 구매'
      const hint=document.createElement('p');hint.textContent=`1장부터 남은 ${remaining}장까지 선택할 수 있습니다.`
      const field=document.createElement('input');field.type='number';field.min='1';field.max=String(remaining);field.step='1';field.value=String(Math.min(remaining,Math.max(1,Number(this.root.querySelector<HTMLInputElement>('.lottery-count')?.value||1))))
      field.className='lottery-multi-count'
      const actions=document.createElement('div');actions.className='lottery-confirm-actions'
      const cancel=document.createElement('button');cancel.textContent='취소';cancel.onclick=()=>dialog.close('cancel')
      const ok=document.createElement('button');ok.textContent='수량 적용';ok.onclick=()=>{
        const count=Number(field.value)
        if(!Number.isInteger(count)||count<1||count>remaining){field.setCustomValidity(`1~${remaining}장을 입력해주세요.`);field.reportValidity();return}
        const target=this.root.querySelector<HTMLInputElement>('.lottery-count');if(target)target.value=String(count)
        this.updateLotteryPrice();dialog.close('ok')
      }
      field.oninput=()=>field.setCustomValidity('')
      actions.append(cancel,ok);panel.append(title,hint,field,actions);dialog.append(panel);document.body.append(dialog)
      dialog.addEventListener('close',()=>{dialog.remove();resolve()},{once:true});dialog.showModal()
    })
  }
  private async resetLottery():Promise<void>{
    if(!['test','tjdrjs885'].includes(this.store.user?.username?.toLowerCase()||''))return
    if(!window.confirm('공용 복권 100장과 당첨자 기록을 초기화할까요? 모든 유저에게 적용됩니다.'))return
    try{
      const state=await this.store.lotteryReset()
      this.lotteryState=state;this.lotteryResults=[];this.lotteryRevealed=0
      this.root.querySelector<HTMLElement>('.lottery-ticket')?.setAttribute('hidden','')
      this.root.querySelector<HTMLElement>('[data-action="lottery-skip"]')?.setAttribute('hidden','')
      const results=this.root.querySelector<HTMLElement>('.lottery-results');if(results)results.innerHTML=''
      this.renderLottery();this.lotteryTopPopup('공용 겅이복권 100장이 초기화되었습니다.')
    }catch(e){this.handleError(e)}
  }
  private async buyLottery():Promise<void>{
    if(this.lotteryBusy||!this.lotteryState||this.lotteryResults.length)return
    const count=Number(this.root.querySelector<HTMLInputElement>('.lottery-count')?.value||0)
    if(!Number.isInteger(count)||count<1||count>this.lotteryState.total){this.toast('구매 수량을 확인해주세요.');return}
    const confirmed=await this.lotteryConfirm(`구매 수량: ${count.toLocaleString('ko-KR')}장\n총 금액: ${(count*100).toLocaleString('ko-KR')}코인\n\n구매하시겠습니까?`)
    if(!confirmed||this.lotteryBusy||this.lotteryResults.length)return
    this.lotteryBusy=true
    try{
      const result=await this.store.lotteryBuy(count)
      this.lotteryState=result;this.lotteryResults=result.results;this.lotteryRevealed=0
      this.renderWallet();this.renderLottery()
      this.root.querySelector('.lottery-screen')?.classList.add('lottery-playing')
      this.root.querySelector<HTMLElement>('.lottery-ticket')?.removeAttribute('hidden')
      this.root.querySelector<HTMLElement>('[data-action="lottery-skip"]')?.removeAttribute('hidden')
      const list=this.root.querySelector<HTMLElement>('.lottery-results');if(list)list.innerHTML=''
      this.showLotteryTicket()
    }catch(e){if(e instanceof RequestError&&e.code==='not_enough_coins')this.lotteryTopPopup('코인이 부족합니다. 복권 1장당 100코인이 필요합니다.');else this.handleError(e)}
    finally{this.lotteryBusy=false;this.renderLottery()}
  }
  private showLotteryTicket():void{
    const ticket=this.root.querySelector<HTMLElement>('.lottery-ticket')
    const cover=this.root.querySelector<HTMLElement>('.lottery-ticket-cover')
    const under=this.root.querySelector<HTMLElement>('.lottery-ticket-under')
    if(!ticket||!cover||!under)return
    if(this.lotteryRevealed>=this.lotteryResults.length){this.skipLottery();return}
    const r=this.lotteryResults[this.lotteryRevealed]
    const idx='ABCDEFGHIJKL'.indexOf(r.grade)
    under.replaceChildren()
    // Hide the prize layer until the user actually finishes tearing.
    under.style.visibility='hidden'
    const title=document.createElement('strong');title.textContent=`${r.grade}상 당첨!`
    under.append(title)
    if(r.id||r.accessoryId){const img=document.createElement('img');img.src=r.accessoryId?`/assets/accessories/${r.accessoryId}.png`:CHARACTER_IMAGE_URLS[r.id as keyof typeof CHARACTER_IMAGE_URLS];img.alt='당첨 상품';under.append(img)}
    const desc=document.createElement('span');desc.textContent=r.accessoryId?`레어 ${({chiikawa_keyring:'치이카와',hachiware_keyring:'하치와레',usagi_keyring:'우사기',momonga_keyring:'모몽가',kurimanju_keyring:'쿠리만쥬',shisa_keyring:'시사',kani_keyring:'카니',rakko_keyring:'랏코'} as Record<string,string>)[r.accessoryId]} 키링`:r.id?fullName(characterById(r.id as CharacterId)):'꽝! 다음 기회에';under.append(desc)
    const topReset=cover.querySelector<HTMLElement>('.lottery-ticket-top');if(topReset){topReset.style.opacity='1';topReset.style.transition='none'}
    const peelReset=cover.querySelector<HTMLElement>('.lottery-ticket-peel');if(peelReset){peelReset.style.transform='translateX(0)';peelReset.style.transition='none'}
    const peel=cover.querySelector<HTMLElement>('.lottery-ticket-peel')!
    peel.onpointerdown=(event:PointerEvent)=>{this.lotteryPointerStart=event.clientX;peel.setPointerCapture(event.pointerId)}
    peel.onpointerup=(event:PointerEvent)=>{if(event.clientX-this.lotteryPointerStart>=65)this.revealLottery();else{peel.style.transition='transform .2s';peel.style.transform='translateX(0)'}}
    peel.onpointermove=(event:PointerEvent)=>{if(peel.hasPointerCapture(event.pointerId)){const dx=Math.max(0,event.clientX-this.lotteryPointerStart);peel.style.transform=`translateX(${Math.min(dx,240)}px)`}}
  }
  private revealLottery():void{
    if(this.lotteryRevealed>=this.lotteryResults.length)return
    const r=this.lotteryResults[this.lotteryRevealed]
    // Keep the upper artwork stationary while the perforated lower piece slides away.
    const peel=this.root.querySelector<HTMLElement>('.lottery-ticket-peel')
    const prizeLayer=this.root.querySelector<HTMLElement>('.lottery-ticket-under')
    if(prizeLayer)prizeLayer.style.visibility='visible'
    if(peel){peel.style.transition='transform .38s ease';peel.style.transform='translateX(115%)';peel.onpointerdown=null;peel.onpointerup=null;peel.onpointermove=null}
    this.lotteryRevealed++
    this.renderLotteryResults()
    window.clearTimeout(this.lotteryTimer)
    this.lotteryTimer=window.setTimeout(()=>{
      if(r.id||r.accessoryId)this.showLotteryWinPopup(r,()=>this.showLotteryTicket())
      else this.showLotteryTicket()
    },460)
  }
  private showLotteryWinPopup(r:{grade:string;id:string|null;accessoryId?:string|null;duplicate:boolean;bonus?:number},next:()=>void):void{
    if(!r.id&&!r.accessoryId){next();return}
    document.getElementById('lottery-win-dialog')?.remove()
    const dialog=document.createElement('dialog');dialog.id='lottery-win-dialog';dialog.className='lottery-win-dialog'
    const card=document.createElement('div');card.className='lottery-win-card'
    const heading=document.createElement('h2');heading.textContent=`🎉 ${r.grade}상 당첨!`
    const img=document.createElement('img');img.src=r.accessoryId?`/assets/accessories/${r.accessoryId}.png`:CHARACTER_IMAGE_URLS[r.id as keyof typeof CHARACTER_IMAGE_URLS];img.alt='당첨 상품'
    const name=document.createElement('strong');name.textContent=r.accessoryId?`레어 ${({'chiikawa_keyring':'치이카와','hachiware_keyring':'하치와레','usagi_keyring':'우사기','momonga_keyring':'모몽가','kurimanju_keyring':'쿠리만쥬','shisa_keyring':'시사','kani_keyring':'카니','rakko_keyring':'랏코'} as Record<string,string>)[r.accessoryId]} 키링`:fullName(characterById(r.id as CharacterId))
    const message=document.createElement('p');message.textContent=r.accessoryId?'레어 무기 액세서리 1개 획득!':r.duplicate?'중복 캐릭터! 보관함에 추가되었어요.':`새 친구 도감 등록! +${r.bonus??0}코인 획득!`
    const button=document.createElement('button');button.textContent='다음 복권 확인';button.onclick=()=>dialog.close()
    card.append(heading,img,name,message,button);dialog.append(card);document.body.append(dialog)
    dialog.addEventListener('close',()=>{dialog.remove();next()},{once:true})
    dialog.showModal()
  }
  private showLotterySummary(results:typeof this.lotteryResults):void{
    if(!results.length)return
    document.getElementById('lottery-summary-dialog')?.remove()
    const dialog=document.createElement('dialog')
    dialog.id='lottery-summary-dialog';dialog.className='lottery-win-dialog'
    const card=document.createElement('div');card.className='lottery-win-card'
    const heading=document.createElement('h2');const ticketIcon=document.createElement('img');ticketIcon.className='lottery-title-icon';ticketIcon.src='/assets/lottery_ticket_custom.png';ticketIcon.alt='';heading.append(ticketIcon,document.createTextNode(' 겅이복권 뽑기 결과'))
    const description=document.createElement('p');description.textContent=`총 ${results.length}장 · 당첨 ${results.filter(r=>r.id||r.accessoryId).length}장 · 꽝 ${results.filter(r=>!r.id&&!r.accessoryId).length}장`
    const list=document.createElement('div');list.style.cssText='max-height:min(45vh,340px);overflow-y:auto;width:100%;display:grid;gap:8px;text-align:left'
    results.forEach((r,i)=>{
      const line=document.createElement('div');line.style.cssText='display:flex;align-items:center;gap:10px;padding:8px;background:#fff5e8;border-radius:10px;color:#352b29'
      if(r.id||r.accessoryId){const img=document.createElement('img');img.src=r.accessoryId?`/assets/accessories/${r.accessoryId}.png`:CHARACTER_IMAGE_URLS[r.id as keyof typeof CHARACTER_IMAGE_URLS];img.alt='당첨 상품';img.style.cssText='width:42px;height:42px;object-fit:contain;flex-shrink:0';line.append(img)}
      const label=document.createElement('span');label.textContent=`${i+1}번째 · ${r.grade}상 · ${r.accessoryId?this.lotteryAccessoryName(r.accessoryId):r.id?fullName(characterById(r.id as CharacterId)):'꽝'}${r.duplicate?' (중복)':''}`;line.append(label);list.append(line)
    })
    const close=document.createElement('button');close.textContent='확인';close.onclick=()=>dialog.close()
    card.append(heading,description,list,close);dialog.append(card);document.body.append(dialog)
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal()
  }
  private skipLottery():void{
    const completedResults=[...this.lotteryResults]
    window.clearTimeout(this.lotteryTimer);document.getElementById('lottery-win-dialog')?.remove();this.lotteryRevealed=this.lotteryResults.length
    this.renderLotteryResults()
    this.root.querySelector<HTMLElement>('.lottery-ticket')?.setAttribute('hidden','')
    this.root.querySelector<HTMLElement>('[data-action="lottery-skip"]')?.setAttribute('hidden','')
    this.renderCollection()
    this.lotteryResults=[]
    this.root.querySelector('.lottery-screen')?.classList.remove('lottery-playing')
    void this.refreshLotteryLive()
    this.showLotterySummary(completedResults)
  }
  private renderLotteryResults():void{
    const el=this.root.querySelector<HTMLElement>('.lottery-results');if(!el)return
    el.innerHTML=this.lotteryResults.slice(0,this.lotteryRevealed).map((r,i)=>`<div class="lottery-result"><span>${i+1}번째</span><b>${r.grade}상</b><span>${r.accessoryId?this.lotteryAccessoryName(r.accessoryId):r.id?fullName(characterById(r.id as CharacterId)):'꽝'}${r.duplicate?' (중복)':''}</span></div>`).reverse().join('')
    el.scrollTop=0
  }
  private async refreshRpsBadge():Promise<void>{
    const status=this.root.querySelector<HTMLElement>('.rps-lobby-status')
    if(status)status.textContent=''
  }
  private async openRps():Promise<void> {
    try {const state=await this.store.rps();if(this.screen!=='rps')return;this.rpsState=state;this.renderRps()}
    catch(e){
      this.handleError(e)
      const message=this.root.querySelector<HTMLElement>('.rps-message')
      if(message)message.textContent=`서버 응답 오류 (${e instanceof Error?e.message:'알 수 없는 오류'}). 다시 시도하거나 로비로 돌아가 주세요.`
      const start=this.root.querySelector<HTMLButtonElement>('[data-action="rps-start"]')
      if(start){start.disabled=false;start.hidden=true}
    }
  }
  private async rpsAction(action:'start'|'next'|'claim'|'choose',move=''):Promise<void> {
    if(this.rpsResolving)return
    this.rpsResolving=true
    const startButton=this.root.querySelector<HTMLButtonElement>('[data-action="rps-start"]')
    if(startButton&&action==='start'){startButton.disabled=true;startButton.textContent='연결 중…'}
    try {
      const state=action==='start'?await this.store.rpsStart():
        action==='next'?await this.store.rpsNext():
        action==='claim'?await this.store.rpsClaim():await this.store.rpsChoose(move)
      this.rpsState=state
      this.renderRps()
      if(action==='claim'){await this.store.restore();this.renderWallet();void this.refreshRpsBadge()}
    }catch(e){
      this.handleError(e)
      const message=this.root.querySelector<HTMLElement>('.rps-message')
      if(message)message.textContent=`도전을 시작하지 못했어요 (${e instanceof Error?e.message:'연결 오류'}). 잠시 후 다시 시도해 주세요.`
      // Preserve the actionable error; do not hide it with an immediate re-render.
    }
    finally {this.rpsResolving=false;if(startButton){startButton.disabled=false;startButton.textContent='도전 시작!'}}
  }
  private async tickRps():Promise<void> {
    if(this.screen!=='rps'||!this.rpsState)return
    const state=this.rpsState
    const countdown=this.root.querySelector<HTMLElement>('.rps-countdown')
    if(state.used && ['lost','claimed'].includes(state.phase) && !state.admin && state.nextAt) {
      const left=Math.max(0,state.nextAt-Date.now())
      const h=Math.floor(left/3600000),m=Math.floor(left%3600000/60000),sec=Math.floor(left%60000/1000)
      if(countdown)countdown.textContent=this.rpsWaitText(state.nextAt)
      if(left===0&&!this.rpsResolving){this.rpsResolving=true;try{await this.openRps()}finally{this.rpsResolving=false}}
      return
    }
    if(['choosing','waiting'].includes(state.phase)) {
      const remain=Math.max(0,state.deadline-Date.now())
      if(countdown)countdown.textContent=`${Math.ceil(remain/1000)}초`
      if(remain===0&&!this.rpsResolving){
        this.rpsResolving=true
        try{this.rpsState=await this.store.rpsResolve();if(this.rpsState.phase==='claimed'){await this.store.restore();this.renderWallet()}this.renderRps()}
        catch(e){this.handleError(e)}
        finally{this.rpsResolving=false}
      }
    }
  }
  private rpsWaitText(nextAt:number):string {
    const left=Math.max(0,nextAt-Date.now())
    const h=Math.floor(left/3600000),m=Math.floor(left%3600000/60000),sec=Math.floor(left%60000/1000)
    return `다음 도전까지 ${h}시간 ${m}분 ${sec}초 남았어요`
  }
  private renderRps():void {
    const state=this.rpsState
    if(!state)return
    const screen=this.root.querySelector<HTMLElement>('.rps-screen')
    if(!screen)return
    const label=screen.querySelector<HTMLElement>('.rps-stage-label')
    const msg=screen.querySelector<HTMLElement>('.rps-message')
    const countdown=screen.querySelector<HTMLElement>('.rps-countdown')
    const start=screen.querySelector<HTMLButtonElement>('[data-action="rps-start"]')
    const claim=screen.querySelector<HTMLButtonElement>('[data-action="rps-claim"]')
    const next=screen.querySelector<HTMLButtonElement>('[data-action="rps-next"]')
    const moves=screen.querySelectorAll<HTMLButtonElement>('[data-action="rps-move"]')
    const rewards=[10,20,50,100,200]
    if(label)label.innerHTML=`${state.stage||1}단계 · <img class="rps-coin" src="/assets/coin.png" alt="코인"/> <b class="rps-coin-count">×${rewards[(state.stage||1)-1]}</b>`
    screen.classList.remove('rps-loading')
    const resting=state.used && ['lost','claimed'].includes(state.phase) && !state.admin
    screen.classList.toggle('rps-resting',resting)
    if(start)start.hidden=!(state.phase==='none' || (state.admin && ['lost','claimed'].includes(state.phase)))
    if(claim)claim.hidden=state.phase!=='won'||state.stage>=5
    if(next)next.hidden=!['won','draw'].includes(state.phase)||state.stage>=5&&state.phase==='won'
    if(next)next.textContent=state.phase==='draw'?'무승부! 다시 하기':`다음 단계 도전! (승리 시 ×${rewards[Math.min(state.stage,4)]})`
    moves.forEach(b=>{b.disabled=state.phase!=='choosing';b.classList.toggle('is-selected',state.choice===b.dataset.move)})
    const opponentBox=screen.querySelector<HTMLElement>('.rps-opponent-choice')
    const opponentImage=opponentBox?.querySelector<HTMLImageElement>('img')
    const opponentText=opponentBox?.querySelector<HTMLElement>('strong')
    const moveNames:Record<string,string>={rock:'바위',scissors:'가위',paper:'보'}
    const showOpponent=['won','lost','draw','claimed'].includes(state.phase)&&Boolean(state.opponent)
    if(opponentBox)opponentBox.hidden=!showOpponent
    if(showOpponent&&opponentImage){opponentImage.src=`/rps_${state.opponent}.png`;opponentImage.alt=`모몽가가 낸 ${moveNames[state.opponent]}`}
    if(showOpponent&&opponentText)opponentText.textContent=moveNames[state.opponent]||''
    if(countdown)countdown.textContent=state.nextAt&&state.used&&!state.admin&&!['choosing','waiting'].includes(state.phase)?this.rpsWaitText(state.nextAt):''
    const names:Record<string,string>={rock:'바위',scissors:'가위',paper:'보'}
    if(msg)msg.textContent=state.phase==='choosing'?(state.choice?'선택을 바꿀 수 있어요! 5초가 끝나면 확정돼요.':'5초 안에 가위·바위·보를 골라주세요!'):
      state.phase==='waiting'?'선택 완료! 모몽가의 선택을 기다려요…':
      state.phase==='draw'?`둘 다 ${names[state.opponent]||''}! 비겼어요. 다시 도전!`:
      state.phase==='won'?`모몽가는 ${names[state.opponent]||''}! 이겼어요! ${state.stage===5?'200코인을 받아주세요!':'그만할까요, 계속할까요?'}`:
      state.phase==='lost'?(state.used&&!state.admin?`다음 가위바위보까지 기다려 주세요!\n${this.rpsWaitText(state.nextAt)}\n\n${state.choice?`모몽가는 ${names[state.opponent]||''}! 모몽가가 이겼습니다.`:'아무것도 내지 않아서 졌어요!'}\n보상은 모두 사라졌어요.`:state.choice?`모몽가는 ${names[state.opponent]||''}! 모몽가가 이겼습니다.\n보상은 모두 사라졌어요.`:'아무것도 내지 않아서 졌어요!\n보상은 모두 사라졌어요.'):
      state.phase==='claimed'?`보상 ${state.coins||rewards[(state.stage||1)-1]}코인을 받았어요!${state.admin?' 다시 도전할 수 있어요!':''}`:
      state.used?'이번 가위바위보는 끝났어요. 다음 도전 시간이 될 때까지 기다려 주세요!':'모몽가와 가위바위보를 시작해요!'
    if(state.phase==='won'&&state.stage===5&&claim){claim.hidden=false;claim.textContent='200코인 받기'}
    else if(claim)claim.textContent='코인 받고 그만하기'
    if(this.screen==='title')void this.refreshRpsBadge()
  }

  private async refreshDiamondRecharge(): Promise<void> {
    if (!this.store.user || this.diamondRefreshBusy) return
    this.diamondRefreshBusy = true
    try {
      const state = await this.store.diamondRecharge()
      this.diamondNextAt = state.nextAt
      this.diamondServerOffset = state.now - Date.now()
      this.diamondRechargeError = false
      this.diamondLastRefresh = Date.now()
      this.store.data.diamonds = state.diamonds
      this.renderWallet()
    } catch { this.diamondRechargeError = true; this.diamondLastRefresh = Date.now() }
    finally { this.diamondRefreshBusy = false }
  }

  private tickDiamondRecharge(): void {
    const amount = this.store.data.diamonds ?? 0
    const label = this.root.querySelector<HTMLElement>('.diamond-recharge-countdown')
    if (!label) return
    if (!this.store.user) { label.textContent = '로그인 후 충전'; return }
    if (amount >= 20 || this.isAdmin) { label.textContent = '최대 보유'; return }
    if (this.diamondNextAt === null) {
      label.textContent = this.diamondRechargeError ? '충전 확인 실패' : '충전 확인 중'
    } else {
      const remaining = Math.max(0, Math.ceil((this.diamondNextAt - (Date.now() + this.diamondServerOffset)) / 1000))
      const minutes = Math.floor(remaining / 60)
      const seconds = remaining % 60
      label.textContent = `충전까지 ${minutes}:${String(seconds).padStart(2, '0')}`
    }
    if ((this.diamondNextAt !== null && Date.now() + this.diamondServerOffset >= this.diamondNextAt) || Date.now() - this.diamondLastRefresh > 60000) {
      void this.refreshDiamondRecharge()
    }
  }

  private refreshEquipmentAndKeyringDots(): void {
    const canPull = !!this.store.user && Number(this.store.data.diamonds ?? 0) >= 20
    const hasAccessory = Object.values(this.store.accessory.counts || {}).some(count => Number(count) > 0) || Object.values(this.store.accessory.grades || {}).some(grades => Object.values(grades || {}).some(count => Number(count) > 0))
    const needsAccessory = !!this.store.user && hasAccessory && !this.store.accessory.equipped
    this.root.querySelectorAll<HTMLElement>('.geongi-keyring-dot').forEach(dot => { dot.hidden = !canPull })
    this.root.querySelectorAll<HTMLElement>('.geongi-equipment-dot').forEach(dot => { dot.hidden = !needsAccessory })
  }

  private renderWallet(): void {
    this.refreshPeperoDots()
    this.refreshEquipmentAndKeyringDots()
    this.root.querySelectorAll<HTMLElement>('.wallet-value').forEach(balance => { balance.textContent = this.isAdmin ? '∞' : this.store.data.gems.toLocaleString('ko-KR') })
    this.root.querySelectorAll<HTMLElement>('.fragment-value').forEach(el => { el.textContent = (this.isAdmin ? '∞' : (this.store.data.fragments ?? 0).toLocaleString('ko-KR')) })
    this.root.querySelectorAll<HTMLElement>('.diamond-value').forEach(balance => { balance.textContent = (this.isAdmin ? '∞' : (this.store.data.diamonds ?? 0).toLocaleString('ko-KR')) })
    this.tickDiamondRecharge()
    this.renderFreePullStatus()
    const rate = `+${this.store.hourlyRate().toFixed(2)} 코인/시간`
    this.root.querySelectorAll<HTMLElement>('.wallet-rate').forEach(node => { node.textContent = rate })
    const count = this.store.data.owned.length
    const collectionCount = this.root.querySelector<HTMLElement>('.collection-count')
    if (collectionCount) collectionCount.textContent = `${count} / ${CHARACTERS.length}`
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const alreadyClaimed = this.store.data.lastDaily === today
    const currentWeek = (() => {
      const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(new Date())
      const day = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[weekday]
      const monday = new Date(`${today}T12:00:00Z`)
      monday.setUTCDate(monday.getUTCDate() - day + 1)
      return monday.toISOString().slice(0, 10)
    })()
    const attendanceCount = this.store.data.attendanceWeek === currentWeek ? (this.store.data.attendanceCount ?? 0) : 0
    const nextDay = Math.min(7, attendanceCount + (alreadyClaimed ? 0 : 1))
    const attendanceReward = nextDay >= 6 ? '랜덤박스 1개' : `${nextDay * 10} 코인`
    const name = this.root.querySelector<HTMLElement>('.account-name')
    if (name) name.textContent = this.store.user ? `${this.isAdmin ? '👑 운영자 · ' : ''}${this.store.user.nickname ?? this.store.user.username} 님` : ''
    const daily = this.root.querySelector<HTMLButtonElement>('[data-action="daily"]')
    if (daily) {
      daily.disabled = false
      daily.classList.toggle('is-used', alreadyClaimed)
      const dailyLabel = daily.querySelector<HTMLElement>('b')
      if (dailyLabel) dailyLabel.textContent = alreadyClaimed ? '출석 완료 ✓' : '출석 체크'
      const copy = daily.querySelector<HTMLElement>('.daily-copy')
      if (copy) copy.textContent = alreadyClaimed ? '수령 완료 · 내일 다시' : `${attendanceReward} 받기`
    }
    const rouletteSlot = `${today}${Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23' }).format(new Date())) < 12 ? 'A' : 'B'}`
    const spun = this.store.data.lastRoulette === rouletteSlot
    const rouletteCopy = this.root.querySelector<HTMLElement>('.roulette-copy')
    if (rouletteCopy) rouletteCopy.textContent = spun ? '다음 12시간 구간에 다시!' : '하루 2회 · 12시간 간격'
    const rouletteChip = this.root.querySelector<HTMLButtonElement>('.roulette-chip')
    if (rouletteChip) {
      rouletteChip.classList.toggle('is-used', spun)
      rouletteChip.disabled = spun
      const rouletteLabel = rouletteChip.querySelector<HTMLElement>('b')
      if (rouletteLabel) rouletteLabel.textContent = spun ? '룰렛 완료 ✓' : '룰렛'
    }
    const spinButton = this.root.querySelector<HTMLButtonElement>('.roulette-spin')
    if (spinButton && !this.wheelSpinning) { spinButton.disabled = spun; spinButton.textContent = spun ? '다음 시간대에 다시 돌려주세요' : '룰렛 돌리기' }
    this.root.querySelectorAll<HTMLButtonElement>('[data-action="pull"]').forEach(pullButton => {
      pullButton.disabled = this.revealing || (!this.isAdmin && this.store.data.gems < (pullCost(Number(pullButton.dataset.count) as PullCount)))
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-action="deco-pull"]').forEach(pullButton => {
      pullButton.disabled = this.revealing || (!this.isAdmin && this.store.data.gems < decoPullCost(Number(pullButton.dataset.count) as DecoPullCount))
    })
    const decoCount = this.root.querySelector<HTMLElement>('.deco-count')
    if (decoCount) decoCount.textContent = `${Object.keys(this.store.decos).length} / ${DECOS.length}`
  }

  private renderCollection(): void {
    const grid = this.root.querySelector<HTMLElement>('.collection-grid')
    if (grid) grid.innerHTML = this.collectionCards(this.store.data.owned, true)
  }

  /** Collection cards; uncollected friends stay gray with a question mark. */
  private collectionCards(owned: readonly CharacterId[], interactive: boolean): string {
    return [...CHARACTERS].sort((a,b) => ({normal:0,mermaid:1,rare:2,super:3,legendary:4,transcendent:5}[a.tier] - {normal:0,mermaid:1,rare:2,super:3,legendary:4,transcendent:5}[b.tier])).map(character => {
      const has = owned.includes(character.id)
      const isFeatured = has && character.id === this.heroId()
      const isHalloweenLimited = String(character.id).startsWith('halloween_')
      const isPeperoLimited = character.id === 'pepero_chiikawa'
      const footer = has && interactive
        ? isFeatured ? `<button class="friend-select is-selected" disabled aria-disabled="true">✓ 대표 설정됨</button>` : `<button class="friend-select" data-action="choose" data-id="${character.id}">대표로 세우기</button>`
        : `<span class="friend-lock">${has ? '도감 등록' : '미발견'}</span>`
      return `<article class="friend-card ${has ? 'is-owned' : 'is-locked'}${character.tier === 'rare' || character.tier === 'super' || character.tier === 'legendary' ? ' is-rare' : ''}${character.tier === 'super' ? ' is-super' : ''}${character.tier === 'legendary' ? ' is-legendary' : ''}${character.tier === 'mermaid' ? ' is-mermaid' : ''} tier-${character.tier === 'mermaid' ? 'rare' : character.tier === 'rare' ? 'epic' : character.tier === 'super' ? 'unique' : character.tier}" style="--friend:${character.color};--accent:${character.accent}">
        <div class="friend-avatar">${has ? `<img src="${CHARACTER_IMAGE_URLS[character.id]}" alt="${fullName(character)}" loading="eager" />` : '<span class="friend-unknown" aria-label="아직 모르는 친구">?</span>'}</div>
        <div class="friend-chance">${tierTag(character)}</div>${isHalloweenLimited || isPeperoLimited ? '<div class="halloween-limited-label">한정판</div>' : ''}
        <b>${has ? character.name : '???'}</b><div class="friend-variant-slot">${character.variant ? `<em class="friend-variant">${character.variant}</em>` : ''}</div><div class="friend-bonus-slot">${bonusTag(character) ? `<em class="friend-bonus">${bonusTag(character)}</em>` : ''}</div>
        <small>${has ? '도감에 등록됐어요' : '아직 만나지 못했어요'}</small>
        ${footer}
      </article>`
    }).join('')
  }

  private pullConfirmed=false
  private acceptPullConfirmation():void {
    const dialog=this.root.querySelector<HTMLElement>('.pull-confirm-overlay')
    if(!dialog || dialog.hidden || this.busy)return
    const kind=dialog.dataset.kind
    const count=Number(dialog.dataset.count)
    dialog.hidden=true
    const target=this.root.querySelector<HTMLButtonElement>(kind==='free'?'.free-daily-pull':`.pull-button[data-action="${kind==='deco'?'deco-pull':'pull'}"][data-count="${count}"]`)
    if(target){this.pullConfirmed=true;target.click();this.pullConfirmed=false}
  }
  private askPullConfirmation(kind:'char'|'deco'|'free', count:number):void {
    if(![1,10].includes(count))return
    if(kind==='free' && this.freePullRemaining()!==10){this.toast('오늘의 무료 뽑기는 이미 사용했어요.');return}
    const free=kind==='free' && this.freePullRemaining()===10
    const cost=free?0:kind==='deco'?decoPullCost(count as DecoPullCount):pullCost(count as PullCount)
    if(!this.isAdmin && this.store.data.gems<cost){this.showInsufficient(cost);return}
    let dialog=this.root.querySelector<HTMLElement>('.pull-confirm-overlay')
    if(!dialog){
      dialog=document.createElement('div');dialog.className='pull-confirm-overlay'
      dialog.innerHTML='<div class="pull-confirm-card" role="alertdialog" aria-modal="true"><h3>뽑기를 하시겠습니까?</h3><p class="pull-confirm-detail"></p><div class="pull-confirm-buttons"><button type="button" data-action="confirm-pull-no">취소</button><button type="button" data-action="confirm-pull-yes">뽑기</button></div></div>'
      this.root.append(dialog)
      // Handle the confirmation locally so a covered/disabled lobby cannot swallow clicks.
      dialog.querySelector<HTMLButtonElement>('[data-action="confirm-pull-yes"]')?.addEventListener('click',event=>{event.stopPropagation();this.acceptPullConfirmation()})
      dialog.querySelector<HTMLButtonElement>('[data-action="confirm-pull-no"]')?.addEventListener('click',event=>{event.stopPropagation();if(dialog)dialog.hidden=true})
    }
    dialog.dataset.kind=kind;dialog.dataset.count=String(count)
    const detail=dialog.querySelector<HTMLElement>('.pull-confirm-detail')
    if(detail)detail.textContent=`${kind==='deco'?'데코':'캐릭터'} ${free?'무료 10회':count===10?'10+1회 (총 11회)':`${count}회`} · ${free?'무료':cost.toLocaleString('ko-KR')+'코인'}`
    dialog.hidden=false
  }
  private openPullRatesDialog():void {
    document.querySelector('.pull-rates-dialog')?.remove()
    const deco=this.root.querySelector('.pull-popup')?.classList.contains('is-deco')??false
    const dialog=document.createElement('div')
    dialog.className='pull-rates-dialog'
    const tierOrder=['transcendent','legendary','super','rare','mermaid','normal'] as const
    const tierNames:Record<string,string>={transcendent:'초월',legendary:'레전더리',super:'유니크',rare:'에픽',mermaid:'레어',normal:'노멀'}
    const gradeSummary=deco?'':`<div class="pull-rates-summary"><strong>전체 등급 뽑기 확률</strong><div class="pull-rates-grade-grid">${tierOrder.map(tier=>{const chance=CHARACTERS.filter(c=>c.tier===tier&&c.probability>0).reduce((sum,c)=>sum+c.probability,0);return `<span class="pull-grade-total pull-grade-${tier}"><b>${tierNames[tier]}</b> ${chance.toFixed(2)}%</span>`}).join('')}</div></div>`
    dialog.innerHTML=`<div class="pull-rates-card" role="dialog" aria-modal="true" aria-label="뽑기 확률"><header><strong>${deco?'데코':'캐릭터'} 뽑기 확률</strong><button type="button" data-action="close-pull-rates" aria-label="확률창 닫기">×</button></header><div class="pull-rates-list">${deco?DECOS.map(d=>`<div class="pull-rate-row"><img src="${DECO_IMAGE_URLS[d.id]}" alt="" loading="lazy"/><span>${d.name}</span><b>${DECO_PROBABILITY.toFixed(4)}%</b></div>`).join(''):CHARACTERS.filter(c=>c.probability>0).sort((a,b)=>{const rank:Record<string,number>={transcendent:6,legendary:5,super:4,rare:3,mermaid:2,normal:1};return (rank[b.tier]||0)-(rank[a.tier]||0)||b.probability-a.probability}).map(c=>`<div class="pull-rate-row pull-rate-${c.tier}"><img src="${CHARACTER_IMAGE_URLS[c.id]}" alt="" loading="eager" style="display:block!important;visibility:visible!important;opacity:1!important;width:52px!important;height:52px!important;object-fit:contain!important;flex:0 0 52px!important" onerror="this.src='/assets/chars/chiikawa_tab_icon.png'"/><span>${fullName(c)}<small>${tierTag(c)}</small></span><b>${c.probability.toFixed(2)}%</b></div>`).join('')}</div>${gradeSummary}<footer><button type="button" data-action="close-pull-rates">닫기</button></footer></div>`
    document.body.append(dialog)
    dialog.querySelectorAll<HTMLButtonElement>('[data-action="close-pull-rates"]').forEach(btn=>btn.addEventListener('click',event=>{event.stopPropagation();dialog.remove()}))
    dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.remove()});dialog.querySelector<HTMLElement>('.pull-rates-list')?.addEventListener('touchmove',event=>event.stopPropagation(),{passive:true})
  }
  private renderPullRates(_mode:'char'|'deco'):void {
    document.querySelector('.pull-rates-dialog')?.remove()
  }
  private freePullRemaining(): number {
    const day = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
    return this.store.data.freePullDay===day && (this.store.data.freePullUsed||0)>0 ? 0 : 10
  }
  private renderFreePullStatus(): void {
    const available=this.freePullRemaining()===10
    const badge=this.root.querySelector<HTMLElement>('.free-pull-dot')
    if(badge){badge.hidden=!available;badge.style.display=available?'':'none'}
    const note=this.root.querySelector<HTMLElement>('.free-note:has(.free-pull-remaining)')
    if(note)note.hidden=true
    this.root.querySelectorAll<HTMLButtonElement>('.pull-button[data-action="pull"]').forEach(button=>{
      const count=Number(button.dataset.count) as PullCount
      const small=button.querySelector('small')
      if(small)small.textContent=`${pullCost(count).toLocaleString('ko-KR')} 코인`
      button.classList.remove('is-free-pull')
    })
    const freeButton=this.root.querySelector<HTMLButtonElement>('.free-daily-pull')
    if(freeButton){freeButton.disabled=!available;freeButton.classList.toggle('is-used',!available);const small=freeButton.querySelector('small');if(small)small.textContent=available?'오늘 1회 이용 가능':'오늘 사용 완료'}
  }
  private setPullMode(mode: 'char' | 'deco'): void {
    this.root.querySelector('.gacha-actions')?.classList.toggle('is-deco', mode === 'deco')
    this.root.querySelector('.pull-popup')?.classList.toggle('is-deco', mode === 'deco')
    this.root.querySelectorAll<HTMLElement>('.pull-action-row .deco-pull').forEach(el => { el.style.display = mode === 'deco' ? '' : 'none' })
    this.root.querySelectorAll<HTMLElement>('.pull-action-row .pull-button:not(.deco-pull)').forEach(el => { el.style.display = mode === 'char' ? '' : 'none' })
    const charPanel=this.root.querySelector<HTMLElement>('.pull-showcase-char')
    const decoPanel=this.root.querySelector<HTMLElement>('.pull-showcase-deco')
    if(charPanel)charPanel.hidden=mode==='deco'
    if(decoPanel)decoPanel.hidden=mode==='char'
    this.renderFreePullStatus()
    this.renderPullRates(mode)
    this.root.querySelectorAll<HTMLButtonElement>('.pull-mode-button').forEach(tab => {
      const active = tab.dataset.mode === mode
      tab.classList.toggle('is-active', active)
      tab.setAttribute('aria-selected', String(active))
    })
  }

  private renderDecoCollection(): void {
    const grid = this.root.querySelector<HTMLElement>('.deco-grid')
    if (grid) grid.innerHTML = this.decoCards(this.store.decos)
  }

  /** Deco collection cards; undiscovered decos stay gray with a question mark. */
  private decoCards(counts: Partial<Record<DecoId, number>>, showCount = true): string {
    return DECOS.map(deco => {
      const count = counts[deco.id] ?? 0
      const has = count > 0
      return `<article class="friend-card deco-card ${has ? 'is-owned' : 'is-locked'}" style="--friend:#fbe3ea;--accent:#e99aae">
        <div class="friend-avatar">${has ? `<img src="${DECO_IMAGE_URLS[deco.id]}" alt="${deco.name}" loading="eager" />` : '<span class="friend-unknown" aria-label="아직 모르는 데코">?</span>'}</div>
        <div class="friend-chance">데코</div>
        <b>${has ? deco.name : '???'}</b>
        <small>${has ? (showCount ? `${count}개 보유` : '도감 등록') : '아직 만나지 못했어요'}</small>
        <span class="friend-lock">${has ? '도감 등록' : '미발견'}</span>
      </article>`
    }).join('')
  }

  private characterReveal(result: PullResult): RevealItem {
    const character = characterById(result.id)
    return { image: CHARACTER_IMAGE_URLS[character.id], name: character.name, variant: character.variant, rare: character.tier === 'rare' || character.tier === 'super' || character.tier === 'legendary', grade: tierTag(character), chance: character.probability, color: character.color, accent: character.accent,
      tag: result.duplicate ? '또 만났어요!' : `새 친구 등록 · +${result.bonus} 코인`, sub: result.duplicate ? '중복 · 이미 도감에 있어요' : `새 친구 · 도감 등록 +${result.bonus} 코인` }
  }

  private decoReveal(result: DecoPullResult): RevealItem {
    const deco = decoById(result.id)
    return { image: DECO_IMAGE_URLS[deco.id], name: deco.name, rare: false, chance: DECO_PROBABILITY, color: '#fbe3ea', accent: '#e99aae',
      tag: result.duplicate ? '하나 더 생겼어요!' : `새 데코 등록 · +${result.bonus} 코인`, sub: result.duplicate ? '중복 · 하우스에 하나 더 놓을 수 있어요' : `새 데코 · 도감 등록 +${result.bonus} 코인` }
  }

  private async loadUsers(): Promise<void> {
    const body = this.root.querySelector<HTMLElement>('.users-body')
    if (body) body.innerHTML = '<p class="users-empty">유저 목록을 불러오는 중이에요…</p>'
    try { this.users = await this.store.users() } catch (error) { this.handleError(error); if (body) body.innerHTML = '<p class="users-empty">목록을 불러오지 못했어요.</p>'; return }
    this.renderUsers()
  }

  private async openPrivacy(): Promise<void> {
    try { this.privacy = await this.store.profilePrivacy() } catch (error) { this.handleError(error); return }
    this.show('users')
    const usersCard = this.root.querySelector<HTMLElement>('.users-card')
    usersCard?.classList.add('privacy-mode')
    // Privacy has its own Save/Cancel actions: remove the unrelated footer action.
    usersCard?.querySelector<HTMLButtonElement>(':scope > button.modal-primary[data-action="close"]')?.setAttribute('hidden', '')
    const body = this.root.querySelector<HTMLElement>('.users-body')
    if (!body) return
    body.innerHTML = `<div class="user-detail-head"><button class="soft-button" data-action="featured">← 내 프로필</button><b>🔒 내 정보 공개 설정</b></div>
      <p class="collection-summary">항목별로 다른 유저에게 보여줄지 설정하세요. 비공개 정보는 서버에서도 차단됩니다.</p>
      <div class="privacy-settings">
      <label><input type="checkbox" data-privacy="char" ${this.privacy.char ? 'checked' : ''}/> 보유 캐릭터 공개</label>
      <label><input type="checkbox" data-privacy="deco" ${this.privacy.deco ? 'checked' : ''}/> 보유 데코 공개</label>
      <label><input type="checkbox" data-privacy="accessory" ${this.privacy.accessory ? 'checked' : ''}/> 보유 무기 액세서리 공개</label>
      <label><input type="checkbox" data-privacy="house" ${this.privacy.house ? 'checked' : ''}/> 마이홈 공개</label></div>
      <div class="privacy-save-actions"><button class="modal-primary" data-action="privacy-save">설정 저장</button><button class="modal-secondary" data-action="featured">취소하고 내 프로필로</button></div>`
  }

  private async savePrivacy(): Promise<void> {
    const privacy = Object.fromEntries(['char','deco','accessory','house'].map(k => [k, Boolean(this.root.querySelector<HTMLInputElement>(`[data-privacy="${k}"]`)?.checked)])) as ProfilePrivacy
    try { this.privacy = await this.store.setProfilePrivacy(privacy); this.root.querySelector('.users-card')?.classList.remove('privacy-mode'); this.show('featured'); this.toast('공개 설정을 저장했어요.') }
    catch (error) { this.handleError(error) }
  }

  private renderUsers(): void {
    const body = this.root.querySelector<HTMLElement>('.users-body')
    if (!body) return
    if (!this.users.length) { body.innerHTML = '<p class="users-empty">아직 닉네임을 정한 유저가 없어요.</p>'; return }
    const sortedUsers = [...this.users].sort((a, b) => this.userSortMode === 'level'
      ? ((b.weaponLevel ?? 0) - (a.weaponLevel ?? 0)) || a.nickname.localeCompare(b.nickname, 'ko')
      : a.nickname.localeCompare(b.nickname, 'ko'))
    body.innerHTML = `<div class="users-sort-tabs" role="group" aria-label="유저 정렬 방식"><button type="button" class="users-sort-tab${this.userSortMode === 'name' ? ' is-active' : ''}" data-action="user-sort" data-sort="name" aria-pressed="${this.userSortMode === 'name'}">이름</button><button type="button" class="users-sort-tab${this.userSortMode === 'level' ? ' is-active' : ''}" data-action="user-sort" data-sort="level" aria-pressed="${this.userSortMode === 'level'}">강화레벨</button></div>
      <p class="collection-summary">가입한 유저 ${this.users.length}명 · 닉네임을 누르면 그 유저의 도감을 볼 수 있어요.</p>
      <div class="users-list" role="list">${sortedUsers.map(user => {
        const percent = (user.privacy?.char ?? true) || user.me ? Math.round(user.owned.length / CHARACTERS.length * 100) : 0
        return `<button class="user-row${user.me ? ' is-me' : ''}" role="listitem" data-action="user-view" data-nickname="${escapeHtml(user.nickname)}">
          <span class="user-avatar">${(user.featured ?? user.owned[0]) ? `<img src="${CHARACTER_IMAGE_URLS[(user.featured ?? user.owned[0])!]}" alt="" />` : '?'}</span>
          <span class="user-main"><span class="user-name-line"><b>${escapeHtml(user.nickname)}${user.me ? ' <em>나</em>' : ''}</b>${user.weapon && ['pink','blue','yellow'].includes(user.weapon) ? `<span class="user-weapon-badge"><span class="forge-aura accessory-weapon ${weaponAuraClass(user.weaponLevel??0)}"><img src="/assets/forge/badge_${user.weapon}.png" alt="강화 무기"/></span><b>+${user.weaponLevel??0}</b></span>` : ''}</span><i class="user-bar"><i style="width:${percent}%"></i></i></span>
          <span class="user-count">${(user.privacy?.char ?? true) || user.me ? `${user.owned.length} / ${CHARACTERS.length}` : '🔒 비공개'}<small>${(user.privacy?.deco ?? true) || user.me ? `데코 ${user.decos?.length ?? 0} / ${DECOS.length}` : '데코 🔒 비공개'}</small></span>
        </button>`
      }).join('')}</div>`
  }

  private renderUserDetail(nickname: string): void {
    const body = this.root.querySelector<HTMLElement>('.users-body')
    const user = this.users.find(item => item.nickname === nickname)
    if (!body || !user) return
    const nick = escapeHtml(user.nickname)
    const avatarId = user.featured ?? user.owned[0]
    const avatar = avatarId && CHARACTER_IMAGE_URLS[avatarId] ? `<img class="user-detail-avatar" src="${CHARACTER_IMAGE_URLS[avatarId]}" alt="대표 프로필 사진" />` : `<span class="user-detail-avatar user-avatar-empty">?</span>`
    const decoCounts = Object.fromEntries((user.decos ?? []).map(id => [id, 1])) as Partial<Record<DecoId, number>>
    const tab = this.userTab
    const deco = tab === 'deco'
    const accessory = tab === 'accessory'
    const title = tab === 'house' ? '하우스' : accessory ? '무기 액세서리 도감' : deco ? '데코 도감' : '캐릭터 도감'
    const isPrivate = !user.me && !(user.privacy?.[tab] ?? true)
    const accessories = user.me ? { counts: this.store.accessory.counts || {}, grades: this.store.accessory.grades || {} } : user.accessories
    const ownedAccessoryCount = WEAPON_ACCESSORIES.reduce((total,item)=>total+ALCHEMY_GRADES.filter(grade=>((grade.id==='normal'?accessories?.counts?.[item.id]:accessories?.grades?.[item.id]?.[grade.id])||0)>0).length,0)
    const count = isPrivate ? '🔒 비공개' : tab === 'house' ? '' : accessory ? `${ownedAccessoryCount} / 48` : deco ? `${user.decos?.length ?? 0} / ${DECOS.length}` : `${user.owned.length} / ${CHARACTERS.length}`
    const tabButton = (id: string, label: string) => `<button type="button" class="auth-tab${tab === id ? ' is-active' : ''}" data-action="user-tab" data-tab="${id}" data-nickname="${nick}" role="tab" aria-selected="${tab === id}">${label}</button>`
    // Match the personal accessory encyclopedia's card markup and image sizing.
    const accessoryCards = WEAPON_ACCESSORIES.flatMap(item=>ALCHEMY_GRADES.map(grade=>{
      const quantity=grade.id==='normal'?(accessories?.counts?.[item.id]||0):(accessories?.grades?.[item.id]?.[grade.id]||0)
      const has=quantity>0
      return `<article class="friend-card accessory-card ${has?'is-owned':'is-locked'}" style="--friend:#fbe3ea;--accent:${grade.color}"><div class="friend-avatar">${has?`<img src="${item.image}" alt="${item.name}" style="filter:drop-shadow(0 0 8px ${grade.color})"/>`:'<span class="friend-unknown">?</span>'}</div><div class="friend-chance">${grade.name}</div><b>${has?item.name:'???'}</b><small>전투력 +${grade.power}</small><span class="friend-lock">${has?`${quantity.toLocaleString()}개 보유`:'미획득'}</span></article>`
    })).join('')
    body.innerHTML = `<div class="user-detail-head"><button class="soft-button" data-action="user-list">← 유저 목록</button>${avatar}<b>${nick} 님의 ${title}</b><span>${count}</span></div>
      ${user.me ? '' : `<button class="modal-primary mail-compose-button" data-action="mail-compose" data-nickname="${nick}">✉ ${nick} 님에게 편지 보내기</button>`}
      <div class="auth-tabs user-tabs user-tabs-3 user-profile-tabs" role="tablist">${tabButton('char', '캐릭터 도감')}${tabButton('deco', '데코 도감')}${tabButton('accessory', '무기 액세서리 도감')}${tabButton('house', '하우스')}</div>
      ${isPrivate ? '<p class="users-empty privacy-hidden-notice">🔒 이 정보는 비공개로 설정되어 있어요.<br>프로필 사진과 닉네임은 계속 볼 수 있어요.</p>' : tab === 'house' ? '<div class="user-house"><p class="user-house-loading">하우스를 불러오는 중…</p></div>' : `<div class="collection-grid user-grid ${accessory?'accessory-card-grid profile-accessory-grid':''}">${accessory?accessoryCards:deco?this.decoCards(decoCounts, false):this.collectionCards(user.owned, false)}</div>`}`
    if (tab === 'house' && !isPrivate) void this.loadUserHouse(user.nickname)
  }
  private async loadUserHouse(nickname: string): Promise<void> {
    let layout
    try { layout = await this.store.userHouse(nickname) } catch (error) { this.handleError(error); return }
    const box = this.root.querySelector<HTMLElement>('.users-body .user-house')
    if (!box || this.userTab !== 'house') return
    box.innerHTML = `${houseVisitMarkup(layout)}<p class="user-house-note">데코 ${layout.pieces.length}개 · 친구 ${layout.friends.length}명 · 구경만 할 수 있어요</p>`
  }
  private async chooseFeatured(id: CharacterId): Promise<void> {
    if (id === this.heroId()) return
    try { await this.store.setFeatured(id) } catch (error) { this.handleError(error); return }
    this.renderHero()
    this.renderProfile()
    this.renderFeaturedPicker()
    this.renderCollection()
    if (this.screen !== 'featured') this.show('title')
    this.toast(`${withJosa(fullName(characterById(id)), '을', '를')} 대표 친구로 세웠어요!`)
  }

  private renderFeaturedPicker(): void {
    this.renderProfile()
    const grid = this.root.querySelector<HTMLElement>('.featured-grid')
    if (!grid) return
    const current = this.heroId()
    if (!this.store.data.owned.length) { grid.innerHTML = '<p class="users-empty">아직 뽑은 친구가 없어요. 가챠에서 친구를 먼저 뽑아 주세요!</p>'; return }
    grid.innerHTML = CHARACTERS.filter(character => this.store.data.owned.includes(character.id)).sort((a, b) => {
      const rank = { legendary: 0, super: 1, rare: 2, mermaid: 3, normal: 4 }
      return rank[a.tier] - rank[b.tier] || a.name.localeCompare(b.name, 'ko') || (a.variant ?? '').localeCompare(b.variant ?? '', 'ko')
    }).map(character => `<button class="featured-pick${current === character.id ? ' is-active' : ''}" role="listitem" data-action="featured-pick" data-id="${character.id}" aria-pressed="${current === character.id}" ${current === character.id ? 'disabled aria-disabled="true"' : ''}>
        <img src="${CHARACTER_IMAGE_URLS[character.id]}" alt="" /><b>${character.name}</b>${character.variant ? `<em>${character.variant}</em>` : ''}${current === character.id ? '<small class="featured-selected-label">✓ 선택됨</small>' : ''}</button>`).join('')
  }

  /** The account's representative friend: the saved choice if still owned, else the first collected, else 치이카와. */
  private heroId(): CharacterId {
    const owned = this.store.data.owned
    const id = this.store.featured
    return id && owned.includes(id) ? id : owned[0] ?? 'chiikawa'
  }
  private async refreshGlobalChatDot(): Promise<void> {
    if (!this.store.user || this.screen !== 'title') return
    try {
      const data = await this.store.globalChat()
      const dot = this.root.querySelector<HTMLElement>('.global-chat-dot')
      if (dot) dot.hidden = !data.unread
    } catch { /* Retry during next refresh */ }
  }

  private async loadGlobalChat(silent = false): Promise<void> {
    if (this.screen !== 'global-chat') return
    const body = this.root.querySelector<HTMLElement>('.global-chat-messages')
    if (!body) return
    try {
      const data = await this.store.globalChat()
      if (this.screen !== 'global-chat') return
      this.chatNextAt = data.nextAt
      if (data.unread) {
        await this.store.globalChatSeen()
        const dot = this.root.querySelector<HTMLElement>('.global-chat-dot')
        if (dot) dot.hidden = true
      }
      const wasBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 65
      const oldLast = body.dataset.last || ''
      const newLast = String(data.items.at(-1)?.id || '')
      if (!silent || oldLast !== newLast) {
        body.innerHTML = data.items.length ? data.items.map(item => `<div class="global-chat-message"><span class="global-chat-name">${escapeHtml(item.nickname)}</span><span class="global-chat-text">${escapeHtml(item.message)}</span><small>${new Date(item.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</small></div>`).join('') : '<p class="users-empty">첫 번째 메시지를 남겨보세요!</p>'
        body.dataset.last = newLast
        if (!silent || wasBottom) body.scrollTop = body.scrollHeight
      }
      const hint = this.root.querySelector<HTMLElement>('.global-chat-hint')
      if (hint) hint.textContent = Date.now() < this.chatNextAt ? `다음 전송까지 ${Math.ceil((this.chatNextAt - Date.now()) / 1000)}초` : '메시지를 보낼 수 있어요.'
    } catch (error) { if (!silent) this.handleError(error) }
  }

  private async sendGlobalChat(): Promise<void> {
    const input = this.root.querySelector<HTMLInputElement>('.global-chat-input')
    const message = input?.value.trim() || ''
    if (!message || [...message].length > 50) { this.toast('메시지는 1~50자로 입력해 주세요.'); return }
    if (Date.now() < this.chatNextAt) { this.toast('10초마다 한 번씩 보낼 수 있어요.'); return }
    const button = this.root.querySelector<HTMLButtonElement>('[data-action="global-chat-send"]')
    if (button) button.disabled = true
    try {
      const result = await this.store.sendGlobalChat(message)
      this.chatNextAt = result.nextAt
      if (input) input.value = ''
      await this.loadGlobalChat()
    } catch (error) { this.handleError(error); await this.loadGlobalChat(true) }
    finally { if (button) button.disabled = false }
  }

  private async refreshAnnouncementDot(): Promise<void> {
    if (!this.store.user) return
    try {
      const box = await this.store.announcements()
      const dot = this.root.querySelector<HTMLElement>('.announcement-dot')
      if (dot) dot.hidden = !box.unread
    } catch { /* Retry on next title visit */ }
  }

  private async loadAnnouncements(): Promise<void> {
    const body = this.root.querySelector<HTMLElement>('.announcements-body')
    if (!body) return
    body.innerHTML = '<p class="users-empty">공지를 불러오는 중이에요…</p>'
    try {
      const data = await this.store.announcements()
      const admin = Boolean(this.store.user?.admin && this.store.user?.username === 'tjdrjs885')
      body.innerHTML = `${admin ? `<div class="announcement-compose"><textarea class="announcement-input" maxlength="100" rows="3" placeholder="모든 유저에게 보낼 공지 (100자 이내)"></textarea><button class="modal-primary" data-action="announcement-send">📢 전체 공지 등록</button></div>` : ''}
        <div class="announcement-list">${data.items.length ? data.items.map(item => `<article class="announcement-item"><small>${new Date(item.at).toLocaleString('ko-KR')}</small><p>${escapeHtml(item.message)}</p>${admin ? `<button class="modal-secondary" data-action="announcement-edit" data-id="${item.id}">✏️ 수정</button>` : ''}</article>`).join('') : '<p class="users-empty">아직 공지사항이 없어요.</p>'}</div>`
      await this.store.announcementsSeen()
      const dot = this.root.querySelector<HTMLElement>('.announcement-dot')
      if (dot) dot.hidden = true
    } catch (error) { this.handleError(error); body.innerHTML = '<p class="users-empty">공지를 불러오지 못했어요.</p>' }
  }

  private async editAnnouncement(id: number): Promise<void> {
    if (!this.store.user?.admin || this.store.user.username !== 'tjdrjs885') return
    const data = await this.store.announcements()
    const old = data.items.find(item => item.id === id)
    if (!old) { this.toast('공지를 찾을 수 없어요.'); return }
    const message = window.prompt('수정할 공지 내용 (최대 100자)', old.message)?.trim()
    if (message == null) return
    if (!message || [...message].length > 100) { this.toast('공지는 1~100자로 작성해 주세요.'); return }
    try { await this.store.editAnnouncement(id, message); this.toast('공지사항을 수정했어요.'); await this.loadAnnouncements() }
    catch (error) { this.handleError(error) }
  }

  private async sendAnnouncement(): Promise<void> {
    if (!this.store.user?.admin || this.store.user.username !== 'tjdrjs885') return
    const input = this.root.querySelector<HTMLTextAreaElement>('.announcement-input')
    const message = input?.value.trim() || ''
    if (!message || [...message].length > 100) { this.toast('공지는 1~100자로 작성해 주세요.'); return }
    if (!window.confirm('모든 유저에게 새 공지를 게시할까요?')) return
    try { await this.store.postAnnouncement(message); this.toast('전체 공지가 등록되었습니다.'); await this.loadAnnouncements() }
    catch (error) { this.handleError(error) }
  }

  private async loadExpedition():Promise<void> {
    if(this.expeditionLoading || this.screen!=='expedition')return
    this.expeditionLoading=true
    if(this.expedition) this.renderExpedition()
    try {const firstLoad=this.expedition===null;this.expedition=await (this.expeditionPrefetch || this.store.expedition());if(firstLoad){this.expeditionServer=this.expedition.mine?.serverId??1;this.startExpeditionImpactClock()}this.setExpeditionBadge(!this.expedition.mine);this.expeditionBadgeCheckedAt=Date.now();this.expeditionBadgeDay=this.expedition.day;this.renderExpedition();void this.refreshAchievementCombatLabels()} catch(e){const el=this.root.querySelector<HTMLElement>('.expedition-status');if(el)el.textContent='원정대 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';this.handleError(e)} finally{this.expeditionLoading=false}
  }
  private startExpeditionImpactClock():void {
    window.clearInterval(this.expeditionImpactTimer)
    this.expeditionImpactServer=this.expeditionServer
    // Fighters launch at 0s; projectile reaches the boss at 1s of each 3s cycle.
    const contact=()=>{
      if(this.screen!=='expedition')return
      const room=this.expedition?.servers.find(r=>r.id===this.expeditionServer)
      const damage=this.expeditionPendingDamage.get(this.expeditionServer)??0
      if(!room || !room.members.length || damage<=0)return
      this.expeditionPendingDamage.delete(this.expeditionServer)
      const cave=this.root.querySelector<HTMLElement>('.expedition-cave')
      const boss=this.root.querySelector<HTMLElement>('.expedition-boss')
      if(cave){
        const popup=document.createElement('span')
        popup.className='expedition-damage-number'
        popup.textContent=`-${damage.toLocaleString('ko-KR')}`
        cave.appendChild(popup)
        window.setTimeout(()=>popup.remove(),1150)
      }
      if(boss && room.hp>0){
        boss.classList.remove('expedition-impact')
        void boss.offsetWidth
        boss.classList.add('expedition-impact')
        window.setTimeout(()=>boss.classList.remove('expedition-impact'),650)
      }
    }
    window.setTimeout(()=>{
      if(this.screen!=='expedition')return
      contact()
      this.expeditionImpactTimer=window.setInterval(contact,3000)
    },1000)
  }

  private renderExpedition():void {
    const state=this.expedition
    if(!state)return
    const room=state.servers.find(r=>r.id===this.expeditionServer)!
    this.root.querySelectorAll<HTMLButtonElement>('.expedition-server-tabs button').forEach(b=>b.classList.toggle('selected',Number(b.dataset.id)===room.id))
    const priorStage=this.expeditionPreviousStage.get(room.id)
    const nextStage=room.stage||1
    this.expeditionPreviousStage.set(room.id,nextStage)
    if(priorStage!==undefined && nextStage>priorStage){
      const overlay=this.root.querySelector<HTMLElement>('.expedition-stage-transition')
      const next=this.root.querySelector<HTMLElement>('.expedition-stage-next')
      if(next)next.textContent=`${nextStage}단계 보스 등장`
      if(overlay){
        if(this.expeditionTransitionTimer)clearTimeout(this.expeditionTransitionTimer)
        overlay.classList.add('is-visible')
        overlay.setAttribute('aria-hidden','false')
        this.expeditionTransitionTimer=setTimeout(()=>{overlay.classList.remove('is-visible');overlay.setAttribute('aria-hidden','true')},1700)
      }
      this.expeditionPendingDamage.delete(room.id)
      this.expeditionPreviousHp.delete(room.id)
    }
    const hp=Math.max(0,room.hp)
    const maxHp=room.maxHp||4000000
    const stageLabel=this.root.querySelector<HTMLElement>('.expedition-stage-label')
    if(stageLabel)stageLabel.textContent=`${room.stage||1}단계`
    const hpLabel=this.root.querySelector<HTMLElement>('.expedition-hp-label')
    if(hpLabel)hpLabel.innerHTML=`보스 체력 <b class="exp-hp">${hp.toLocaleString('ko-KR')}</b> / ${maxHp.toLocaleString('ko-KR')}`
    const testTools=this.root.querySelector<HTMLElement>('.expedition-test-tools')
    if(testTools)testTools.hidden=this.store.user?.username?.toLowerCase()!=='test'
    // Show only damage actually confirmed by the server, not a guessed per-hit value.
    const oldHp=this.expeditionPreviousHp.get(room.id)
    this.expeditionPreviousHp.set(room.id,hp)
    if(oldHp!==undefined && hp<oldHp && room.members.length>0){
      // Queue server-confirmed HP loss until the next projectile contact.
      this.expeditionPendingDamage.set(room.id,(this.expeditionPendingDamage.get(room.id)??0)+(oldHp-hp))
    }
    const label=this.root.querySelector<HTMLElement>('.exp-hp');if(label)label.textContent=hp.toLocaleString('ko-KR')
    const fill=this.root.querySelector<HTMLElement>('.expedition-hp-fill');if(fill)fill.style.width=`${hp/maxHp*100}%`
    const percent=this.root.querySelector<HTMLElement>('.expedition-hp-percent');if(percent)percent.textContent=`${(hp/maxHp*100).toFixed(2)}%`
    const boss=this.root.querySelector<HTMLElement>('.expedition-boss');if(boss){boss.classList.toggle('defeated',hp===0);boss.classList.toggle('under-attack',hp>0 && room.members.length>0)}
    const status=this.root.querySelector<HTMLElement>('.expedition-status')
    if(status)status.textContent=hp===0?'':`서버 ${room.id} · ${room.members.length}/10명 · ${state.mine?`오늘 ${state.mine.serverId}서버에 배치 완료`:'캐릭터를 직접 배치해 주세요'}`


    const weaponPower=(level:number|null|undefined)=>level==null?0:level<=14?level+1:level===19?40:level===20?50:level>=21?Math.min(100,50+(level-20)*10):20+(level-15)*5
    const rankedMembers=[...room.members].sort((a,b)=>(b.power??(battlePower(b.characterId)+weaponPower(b.weaponLevel)))-(a.power??(battlePower(a.characterId)+weaponPower(a.weaponLevel))) )
    const members=this.root.querySelector<HTMLElement>('.expedition-members')
    if(members){const html=(hp===0?[]:rankedMembers).map(m=>`<span>${m.me?'⭐ ':''}${m.name.replace(/[&<>"']/g,'')} · ${fullName(characterById(m.characterId))} · 전투력 ${(m.power??(battlePower(m.characterId)+weaponPower(m.weaponLevel)))}</span>`).join('');if(members.innerHTML!==html)members.innerHTML=html}
    const party=this.root.querySelector<HTMLElement>('.expedition-party')
    if(party){const html=(hp===0?[]:rankedMembers).map((m,i)=>`<div class="expedition-combatant" style="--n:${i};--shot-x:${(2.5-(i%5))*72}px;--shot-y:${i<5?-110:-175}px"><span class="expedition-name">${m.me?'⭐ ':''}${m.name.replace(/[&<>"']/g,'')}</span><img class="expedition-fighter" style="${this.deploymentTransform(m.characterId)}" src="${CHARACTER_IMAGE_URLS[m.characterId]}" alt="" /><span class="expedition-projectile"></span></div>`).join('');if(party.innerHTML!==html)party.innerHTML=html}
    // Position the first shots only after the expedition panel is laid out.
    // The original immediate measurement could read zero/stale coordinates on entry.
    if(party && boss && hp>0){
      const activeServer=room.id
      window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{
        if(this.screen!=='expedition' || this.expeditionServer!==activeServer || !party.isConnected || !boss.isConnected)return
        const target=boss.getBoundingClientRect()
        if(target.width<=0 || target.height<=0)return
        const cx=target.left+target.width/2
        const cy=target.top+target.height/2
        party.querySelectorAll<HTMLElement>('.expedition-projectile').forEach(shot=>{
          const fighter=shot.closest<HTMLElement>('.expedition-combatant')
          if(!fighter)return
          const base=fighter.getBoundingClientRect()
          if(base.width<=0 || base.height<=0)return
          const startX=base.left+base.width/2
          const startY=base.bottom-32-4.5
          shot.style.setProperty('--shot-x',`${Math.round(cx-startX)}px`)
          shot.style.setProperty('--shot-y',`${Math.round(cy-startY)}px`)
          shot.classList.add('shot-ready')
        })
      }))
    }
    const equipmentLabel=this.root.querySelector<HTMLElement>('.expedition-equipment-bonus')
    if(equipmentLabel)equipmentLabel.textContent=`장비 전투력 +${Math.max(0,Number(this.store.forge?.bonus)||0)} 적용 중`
    const picker=this.root.querySelector<HTMLElement>('.expedition-picker')
    if(picker){const html=hp===0?'':state.mine && state.mine.serverId!==room.id?'다른 서버에 배치되어 있어요. 같은 날 서버 이동은 불가능해요.':room.members.length>=10 && !state.mine?'이 서버는 인원이 가득 찼어요.':`<b>${state.mine?"배치 캐릭터 변경":"원정대에 보낼 캐릭터 선택"}</b><div class="expedition-choices">${[...this.store.data.owned].sort((a,b)=>battlePower(b)-battlePower(a)).map(id=>`<button data-action="exp-join" data-id="${id}" aria-pressed="${state.mine?.serverId===room.id && state.mine.characterId===id}" style="${state.mine?.serverId===room.id && state.mine.characterId===id?'border:2px solid #6ba883;background:#ecf9ee;box-shadow:0 0 0 2px #d2ecd8 inset;':''}"><img src="${CHARACTER_IMAGE_URLS[id]}" alt=""/><span>${fullName(characterById(id))}<small>전투력 ${battlePower(id)}</small>${state.mine?.serverId===room.id && state.mine.characterId===id?'<small style="color:#2c8653;font-weight:800">✓ 배치 중</small>':''}</span></button>`).join('')}</div>`
      // 3초마다 HP를 갱신하더라도 캐릭터 선택 목록 DOM은 유지해 스크롤이 튀지 않게 합니다.
      if(picker.innerHTML!==html){
        const choices=picker.querySelector<HTMLElement>('.expedition-choices')
        const previousScroll=choices?.scrollTop ?? 0
        picker.innerHTML=html
        const updated=picker.querySelector<HTMLElement>('.expedition-choices')
        if(updated)updated.scrollTop=previousScroll
      }
    }
    this.renderWallet()
  }

  private renderProfile(): void {
    const id = this.heroId()
    const has = this.store.data.owned.length > 0
    const nick = this.store.user?.nickname || this.store.user?.username || '나'
    this.root.querySelectorAll<HTMLImageElement>('.profile-avatar img, .profile-big img').forEach(img => {
      if (img.dataset.id !== id) { img.src = CHARACTER_IMAGE_URLS[id]; img.dataset.id = id }
      img.classList.toggle('is-placeholder', !has)
    })
    const name = this.root.querySelector<HTMLElement>('.profile-name'); if (name) name.textContent = nick
    this.root.querySelectorAll<HTMLButtonElement>('.admin-broadcast-entry').forEach(el => { el.hidden = !this.isAdmin })
    const sub = this.root.querySelector<HTMLElement>('.profile-text small'); if (sub) sub.textContent = this.store.user?.admin ? '운영자 · 우편함' : '대표 · 우편함'
    const bigName = this.root.querySelector<HTMLElement>('.profile-big-name'); if (bigName) bigName.textContent = `${nick}${has ? ` · 대표 ${fullName(characterById(id))}` : ''}`
    const stats = this.root.querySelector<HTMLElement>('.profile-stats')
    if (stats) stats.textContent = `캐릭터 도감 ${this.store.data.owned.length} / ${CHARACTERS.length} · 데코 도감 ${Object.keys(this.store.decos).length} / ${DECOS.length}`
  }
  private mailCheckedAt = 0
  private setExpeditionBadge(show: boolean): void {
    const badge = this.root.querySelector<HTMLElement>('.expedition-entry-dot')
    if (badge) badge.hidden = !show
  }
  private async refreshExpeditionBadge(force = false): Promise<void> {
    if (!this.store.user) { this.setExpeditionBadge(false); return }
    if (!force && Date.now() - this.expeditionBadgeCheckedAt < 20000) return
    this.expeditionBadgeCheckedAt = Date.now()
    try {
      const state = await this.store.expeditionBadge()
      if (!this.store.user) return
      this.expeditionBadgeDay = state.day
      this.setExpeditionBadge(!state.deployed)
    } catch { /* Keep the last badge state on a temporary network failure. */ }
  }
  private refreshMailBadge(force = false): void {
    this.renderMailBadge()
    if (!this.store.user || (!force && Date.now() - this.mailCheckedAt < 20000)) return
    this.mailCheckedAt = Date.now()
    this.store.mailbox().then(() => this.renderMailBadge()).catch(() => { /* Badge refresh is best-effort. */ })
  }
  private renderMailBadge(): void {
    this.root.querySelectorAll<HTMLElement>('.mail-badge').forEach(badge => {
      badge.hidden = this.store.mailUnread <= 0
      badge.textContent = this.store.mailUnread > 9 ? '9+' : String(this.store.mailUnread)
    })
  }

  private lastBox: Mailbox | null = null
  private async loadMail(): Promise<void> {
    const list = this.root.querySelector<HTMLElement>('.mail-list')
    if (list) list.innerHTML = '<p class="users-empty">우편함을 여는 중이에요…</p>'
    try {
      const box = await this.store.mailbox()
      this.renderMail(box)
      if (box.unread) { await this.store.markMailSeen(); this.renderMailBadge() }
    } catch (error) { this.handleError(error); if (list) list.innerHTML = '<p class="users-empty">우편함을 열지 못했어요.</p>' }
  }
  private renderMail(box: Mailbox): void {
    this.lastBox = box
    const max = box.max || MAILBOX_MAX
    const inbox = this.mailTab === 'in'
    this.root.querySelectorAll<HTMLButtonElement>('[data-action="mail-tab"]').forEach(tab => {
      const on = tab.dataset.tab === this.mailTab
      tab.classList.toggle('is-active', on)
      tab.setAttribute('aria-selected', String(on))
      const count = tab.querySelector('.mail-tab-count')
      if (count) count.textContent = `${tab.dataset.tab === 'sent' ? box.sent.length : box.mail.length}/${max}`
    })
    const list = this.root.querySelector<HTMLElement>('.mail-list')
    const summary = this.root.querySelector<HTMLElement>('.mail-summary')
    if (summary) summary.textContent = `편지함마다 최대 ${max}개까지 보관되고, 넘치면 가장 오래된 우편부터 지워져요. 오늘 보낸 코인 ${this.store.user?.admin ? '무제한' : `${box.sentToday} / ${box.dailyLimit}`}`
    const waiting = box.mail.filter(item => (item.coins > 0 || item.diamonds > 0 || item.fragments > 0) && !item.claimed).length
    const all = this.root.querySelector<HTMLButtonElement>('.mail-claim-all')
    if (all) { all.hidden = !inbox; all.disabled = waiting === 0; all.textContent = waiting ? `첨부 보상 모두 받기 (${waiting}건)` : '받을 보상이 없어요' }
    if (!list) return
    const del = (id: number, which: 'in' | 'sent') => `<button class="mail-delete" data-action="mail-delete" data-box="${which}" data-id="${id}" aria-label="우편 삭제">🗑 삭제</button>`
    if (inbox) {
      list.innerHTML = box.mail.length ? box.mail.map(item => `<article class="mail-item${item.seen ? '' : ' is-new'}" role="listitem">
        <div class="mail-head"><b>${escapeHtml(item.from)}</b><small>${mailTime(item.at)}</small>${item.seen ? '' : '<em>NEW</em>'}${del(item.id, 'in')}</div>
        ${item.message ? `<p class="mail-text">${escapeHtml(item.message)}</p>` : ''}
        ${(item.coins > 0 || item.diamonds > 0 || item.fragments > 0) ? (item.claimed ? `<span class="mail-coins is-claimed">✿ 코인 ${item.coins} · 다이아 ${item.diamonds} · 강화파편 ${item.fragments} 받음</span>` : `<button class="mail-coins" data-action="mail-claim" data-id="${item.id}">🎁 코인 ${item.coins} · 다이아 ${item.diamonds} · 강화파편 ${item.fragments} 받기</button>`) : ''}
      </article>`).join('') : '<p class="users-empty">아직 받은 편지가 없어요.</p>'
    } else {
      list.innerHTML = box.sent.length ? box.sent.map(item => `<article class="mail-item is-sent" role="listitem">
        <div class="mail-head"><b>To. ${escapeHtml(item.to)}</b><small>${mailTime(item.at)}</small><em class="mail-read">${item.seen ? '읽음' : '안 읽음'}</em>${del(item.id, 'sent')}</div>
        ${item.message ? `<p class="mail-text">${escapeHtml(item.message)}</p>` : ''}
        ${item.coins > 0 ? `<span class="mail-coins is-claimed">✿ 코인 ${item.coins} · 다이아 ${item.diamonds} · 강화파편 ${item.fragments} 보냄${item.claimed ? ' · 받음' : ''}</span>` : ''}
      </article>`).join('') : '<p class="users-empty">아직 보낸 편지가 없어요.</p>'
    }
  }
  private async claimMail(id?: number): Promise<void> {
    try {
      const { claimed, box } = await this.store.claimMail(id)
      this.renderMail(box)
      this.renderWallet()
      this.renderMailBadge()
      if (claimed) { this.audio.play('win'); this.toast(`우편함에서 ${claimed}코인을 받았어요!`) }
    } catch (error) { this.handleError(error) }
  }
  private async deleteMail(id: number, which: 'in' | 'sent'): Promise<void> {
    try {
      const { claimed, box } = await this.store.deleteMail(id, which)
      this.renderMail(box)
      this.renderWallet()
      this.renderMailBadge()
      this.toast(claimed ? `우편을 지우면서 남은 ${claimed}코인을 받았어요.` : '우편을 지웠어요.')
    } catch (error) { this.handleError(error) }
  }
  /** Big, clear confirmation shown after a letter is sent. */
  private notice(title: string, detail: string): void {
    this.root.querySelector('.send-notice')?.remove()
    const el = document.createElement('div')
    el.className = 'send-notice'
    el.setAttribute('role', 'status')
    el.innerHTML = `<span class="send-notice-icon">📮</span><b>${escapeHtml(title)}</b><small>${escapeHtml(detail)}</small>`
    this.root.appendChild(el)
    window.clearTimeout(this.noticeTimer)
    this.noticeTimer = window.setTimeout(() => el.remove(), 2600)
  }

  private renderStorage(): void {
    this.root.querySelectorAll<HTMLElement>('.fragment-value').forEach(el => { el.textContent = (this.isAdmin ? '∞' : (this.store.data.fragments ?? 0).toLocaleString('ko-KR')) })
    this.root.querySelectorAll<HTMLElement>('.diamond-value').forEach(el => { el.textContent = (this.isAdmin ? '∞' : (this.store.data.diamonds ?? 0).toLocaleString('ko-KR')) })
    const grid = this.root.querySelector<HTMLElement>('.storage-grid')
    const summary = this.root.querySelector<HTMLElement>('.storage-summary')
    this.root.querySelectorAll<HTMLButtonElement>('[data-action="storage-tab"]').forEach(tab => {
      const on = tab.dataset.tab === this.storageTab
      tab.classList.toggle('is-active', on)
      tab.setAttribute('aria-selected', String(on))
    })
    if (!grid) return
    const bulkButton = this.root.querySelector<HTMLButtonElement>('.storage-bulk-sell')
    const bulkItems = this.storageTab === 'inventory' || this.storageTab === 'accessory' ? [] : this.getBulkSellItems()
    if (bulkButton) {
      const count = bulkItems.reduce((sum, item) => sum + item.count, 0)
      const coins = bulkItems.reduce((sum, item) => sum + item.count * item.price, 0)
      bulkButton.hidden = true
      bulkButton.disabled = count === 0
      bulkButton.textContent = count ? `중복 일괄 판매 · ${count.toLocaleString('ko-KR')}개 (+${coins.toLocaleString('ko-KR')}코인)` : '중복 일괄 판매 · 판매할 중복 없음'
    }
    const sellButtons = (kind: 'char' | 'deco', id: string, extra: number, price: number) => extra > 0
      ? `<div class="storage-sell"><button class="storage-sell-btn" data-action="sell" data-kind="${kind}" data-id="${id}" data-count="1">1개 팔기 +${price}</button>${extra > 1 ? `<button class="storage-sell-btn is-all" data-action="sell" data-kind="${kind}" data-id="${id}" data-count="${extra}">모두 팔기 +${extra * price}</button>` : ''}</div>`
      : '<small class="storage-keep">중복 없음</small>'
    if (this.storageTab === 'inventory') {
      if (summary) summary.textContent = '보유한 기타 아이템입니다. 판매는 장터에서 이용해 주세요.'
      grid.innerHTML = ([['잡초',this.store.wildWeed?.count??0,5,'/field_wild_weed.png'],['황금잡초',this.store.wildWeed?.goldenCount??0,50,'/field_golden_weed.png']] as const).filter(x=>x[1]>0).map(([name,count,price,img])=>`<article class="storage-item"><img src="${img}" alt="${name}" style="width:60px;height:60px;object-fit:contain"/><b>${name}</b><small>보유 ${count}개 · 개당 ${price}코인</small></article>`).join('') || '<div class="inventory-empty"><strong>아직 보관된 아이템이 없어요.</strong><small>새로운 아이템이 추가되면 이곳에서 확인할 수 있어요!</small></div>'
    } else if (this.storageTab === 'accessory') {
      const counts = this.store.accessory.counts || {}
      const cards = WEAPON_ACCESSORIES.flatMap(item => ALCHEMY_GRADES.map(grade => {
        const count = grade.id === 'normal' ? (counts[item.id] || 0) : (this.store.accessory.grades?.[item.id]?.[grade.id] || 0)
        if (count <= 0) return ''
        const equipped = this.store.accessory.equipped === item.id && (this.store.accessory.equippedGrade || 'normal') === grade.id
        return `<article class="storage-item accessory-storage-item" role="listitem"><span class="storage-pic is-accessory"><img src="${item.image}" alt="${item.name}" loading="eager" style="filter:drop-shadow(0 0 7px ${grade.color})"/></span><b>${item.name}</b><small style="color:${grade.color}">${grade.name} · 전투력 +${grade.power}</small><small class="storage-count">보유 ${count.toLocaleString('ko-KR')}개${equipped ? ' · 장착 중' : ''}</small></article>`
      })).filter(Boolean)
      if (summary) summary.textContent = `보유 무기 액세서리 ${cards.length} / 48종 · 장착은 마이룸 → 장비에서 할 수 있어요.`
      grid.innerHTML = cards.join('') || '<p class="users-empty">아직 획득한 무기 액세서리가 없어요.</p>'
    } else if (this.storageTab === 'char') {
      const owned = CHARACTERS.filter(c => this.store.data.owned.includes(c.id))
      const extras = owned.reduce((sum, c) => sum + (this.store.dupes[c.id] ?? 0), 0)
      if (summary) summary.textContent = `보유 캐릭터 ${owned.length}종 · 중복 ${extras}개 · 판매는 장터에서 이용해 주세요.`
      grid.innerHTML = owned.length ? owned.map(c => {
        const extra = this.store.dupes[c.id] ?? 0
        return `<article class="storage-item" role="listitem"><span class="storage-pic"><img src="${CHARACTER_IMAGE_URLS[c.id]}" alt="" loading="eager" /></span><b>${escapeHtml(fullName(c))}</b><small class="storage-count">보유 ${1 + extra}개${extra ? ` · 중복 ${extra}` : ''}</small></article>`
      }).join('') : '<p class="users-empty">아직 뽑은 캐릭터가 없어요.</p>'
    } else {
      const placed: Record<string, number> = {}
      for (const piece of this.store.house.pieces) placed[piece.id] = (placed[piece.id] ?? 0) + 1
      const owned = DECOS.filter(d => (this.store.decos[d.id] ?? 0) > 0)
      const extras = owned.reduce((sum, d) => sum + Math.max(0, (this.store.decos[d.id] ?? 0) - Math.max(1, placed[d.id] ?? 0)), 0)
      if (summary) summary.textContent = `보유 데코 ${owned.length}종 · 중복 ${extras}개 · 판매는 장터에서 이용해 주세요.`
      grid.innerHTML = owned.length ? owned.map(d => {
        const have = this.store.decos[d.id] ?? 0
        const onHouse = placed[d.id] ?? 0
        const extra = Math.max(0, have - Math.max(1, onHouse))
        return `<article class="storage-item" role="listitem"><span class="storage-pic is-deco"><img src="${DECO_IMAGE_URLS[d.id]}" alt="" loading="eager" /></span><b>${escapeHtml(d.name)}</b><small class="storage-count">보유 ${have}개${onHouse ? ` · 하우스 ${onHouse}` : ''}</small></article>`
      }).join('') : '<p class="users-empty">아직 뽑은 데코가 없어요.</p>'
    }
  }
  private getBulkSellItems(category: 'char' | 'deco' = this.storageTab === 'char' ? 'char' : 'deco'): { kind: 'char' | 'deco'; id: string; count: number; price: number }[] {
    if (category === 'char') return CHARACTERS.filter(c => this.store.data.owned.includes(c.id)).map(c => ({
      kind: 'char' as const, id: c.id, count: Math.max(0, this.store.dupes[c.id] ?? 0),
      price: CHAR_SELL_PRICES[c.tier === 'mermaid' ? 'rare' : c.tier === 'rare' ? 'epic' : c.tier === 'super' || c.tier === 'legendary' ? 'unique' : 'normal']
    })).filter(item => item.count > 0)
    const placed: Record<string, number> = {}
    for (const piece of this.store.house.pieces) placed[piece.id] = (placed[piece.id] ?? 0) + 1
    return DECOS.map(d => ({ kind: 'deco' as const, id: d.id,
      count: Math.max(0, (this.store.decos[d.id] ?? 0) - Math.max(1, placed[d.id] ?? 0)), price: DECO_SELL_PRICE
    })).filter(item => item.count > 0)
  }

  private confirmForgeWeapon(): Promise<boolean> {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog')
      dialog.className = 'storage-confirm-dialog'
      dialog.setAttribute('aria-label', '무기 선택 확인')
      dialog.innerHTML = `<div class="storage-confirm-content"><div class="storage-confirm-heading">대장간 · 무기 선택</div><p>이 무기를 선택할까요?</p><p class="forge-confirm-warning">한 번 선택하면 무기를 영구적으로 변경할 수 없어요!</p><div class="storage-confirm-actions"><button type="button" data-choice="cancel">취소</button><button type="button" data-choice="ok">선택하기</button></div></div>`
      document.body.appendChild(dialog)
      let settled = false
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        dialog.close()
        dialog.remove()
        resolve(ok)
      }
      dialog.addEventListener('click', event => {
        const choice = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-choice]')?.dataset.choice
        if (choice) finish(choice === 'ok')
        else if (event.target === dialog) finish(false)
      })
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false) })
      dialog.showModal()
    })
  }

  private confirmBulkSell(label: string, count: number, expected: number): Promise<boolean> {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog')
      dialog.className = 'storage-confirm-dialog'
      dialog.setAttribute('aria-label', '중복 일괄 판매 확인')
      dialog.innerHTML = `<div class="storage-confirm-content"><div class="storage-confirm-heading">중복 일괄 판매</div><p>${label} 중복 ${count.toLocaleString('ko-KR')}개를 ${expected.toLocaleString('ko-KR')}코인에 판매할까요?</p><div class="storage-confirm-actions"><button type="button" data-choice="cancel">취소</button><button type="button" data-choice="ok">판매하기</button></div></div>`
      document.body.appendChild(dialog)
      let settled = false
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        dialog.close()
        dialog.remove()
        resolve(ok)
      }
      dialog.addEventListener('click', event => {
        const choice = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-choice]')?.dataset.choice
        if (choice) finish(choice === 'ok')
        else if (event.target === dialog) finish(false)
      })
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false) })
      dialog.showModal()
    })
  }

  private async sellBulk(button: HTMLButtonElement): Promise<void> {
    // Bind each bulk-sale action to its rendered category, not another tab's state.
    const category = button.dataset.kind
    if (this.shopTab !== 'sell' || (category !== 'char' && category !== 'deco') || this.shopSellTab !== category || button.disabled) {
      this.toast('판매 종류를 다시 선택해 주세요.')
      return
    }
    button.disabled = true
    const items = this.getBulkSellItems(category).filter(item => item.kind === category)
    if (!items.length) { button.disabled = false; this.toast('판매할 중복 아이템이 없어요.'); return }
    const count = items.reduce((sum, item) => sum + item.count, 0)
    const expected = items.reduce((sum, item) => sum + item.count * item.price, 0)
    const label = category === 'char' ? '캐릭터' : '데코'
    if (!await this.confirmBulkSell(label, count, expected)) { button.disabled = false; return }
    // Refuse to sell if the user switched categories while the confirmation was open.
    if (this.shopSellTab !== category || this.shopTab !== 'sell') { button.disabled = false; return }
    let sold = 0
    let earned = 0
    try {
      for (const item of items) {
        earned += await this.store.sell(item.kind, item.id, item.count)
        sold += item.count
      }
      this.audio.play('win')
      this.toast(`${label} 중복 ${sold}개 판매 완료! +${earned.toLocaleString('ko-KR')}코인`)
    } catch (error) {
      this.handleError(error)
      if (sold) this.toast(`${sold}개 판매 후 중단됐어요. 남은 중복은 다시 판매할 수 있어요.`)
    } finally {
      this.renderWallet()
      this.renderStorage()
      this.renderShop()
    }
  }

  private async sell(kind: 'char' | 'deco', id: string, count: number, button: HTMLButtonElement): Promise<void> {
    button.disabled = true
    try {
      const coins = await this.store.sell(kind, id, count)
      this.renderWallet()
      this.renderStorage()
      this.renderShop()
      this.audio.play('win')
      const name = kind === 'char' ? fullName(characterById(id as CharacterId)) : decoById(id as DecoId).name
      this.toast(`${name} 중복 ${count}개를 팔아 ${coins}코인을 받았어요!`)
    } catch (error) { this.handleError(error); button.disabled = false }
  }

  private async loadSuggest(): Promise<void> {
    const list = this.root.querySelector<HTMLElement>('.suggest-list')
    if (list) list.innerHTML = '<p class="users-empty">건의함을 여는 중이에요…</p>'
    const form = this.root.querySelector<HTMLFormElement>('.suggest-form')
    if (form && !form.dataset.bound) {
      form.dataset.bound = '1'
      const input = form.querySelector<HTMLInputElement>('.suggest-input')!
      const counter = form.querySelector<HTMLElement>('.suggest-counter')!
      input.addEventListener('input', () => {
        const chars = [...input.value]
        if (chars.length > SUGGEST_MAX_CHARS) input.value = chars.slice(0, SUGGEST_MAX_CHARS).join('')
        counter.textContent = `${[...input.value].length} / ${SUGGEST_MAX_CHARS}`
      })
      form.addEventListener('submit', event => { event.preventDefault(); void this.postSuggestion() })
    }
    try { this.renderSuggest(await this.store.suggestions()) } catch (error) { this.handleError(error); if (list) list.innerHTML = '<p class="users-empty">건의함을 열지 못했어요.</p>' }
  }
  private renderSuggest(box: SuggestBox): void {
    const list = this.root.querySelector<HTMLElement>('.suggest-list')
    if (!list) return
    list.innerHTML = box.items.length ? box.items.map(item => `<article class="suggest-item${item.mine ? ' is-mine' : ''}" role="listitem">
        <div class="mail-head"><b>${escapeHtml(item.from)}${item.mine ? ' <i class="suggest-me">나</i>' : ''}</b><small>${mailTime(item.at)}</small>${box.admin ? `<button class="mail-delete" data-action="suggest-delete" data-id="${item.id}">🗑 삭제</button>` : ''}</div>
        <p class="mail-text">${escapeHtml(item.message)}</p>
        ${item.reply ? `<div class="suggest-reply"><b>💬 운영자 겅이 답변</b><p>${escapeHtml(item.reply)}</p></div>` : ''}
        ${box.admin ? `<div class="suggest-admin"><input class="suggest-reply-input" data-id="${item.id}" maxlength="${SUGGEST_REPLY_MAX_CHARS}" placeholder="답변 (${SUGGEST_REPLY_MAX_CHARS}자 이내)" value="${escapeHtml(item.reply ?? '')}" aria-label="답변 쓰기" /><button class="soft-button" data-action="suggest-reply" data-id="${item.id}">${item.reply ? '답변 고치기' : '답변하기'}</button></div>` : ''}
      </article>`).join('') : '<p class="users-empty">아직 건의가 없어요. 첫 건의를 남겨 보세요!</p>'
  }
  private async postSuggestion(): Promise<void> {
    const input = this.root.querySelector<HTMLInputElement>('.suggest-input')
    const button = this.root.querySelector<HTMLButtonElement>('.suggest-send')
    const message = input?.value.trim() ?? ''
    if (!message) { this.toast('건의 내용을 적어 주세요.'); return }
    if (button) button.disabled = true
    try {
      this.renderSuggest(await this.store.suggest(message))
      if (input) { input.value = ''; input.dispatchEvent(new Event('input')) }
      this.toast('건의를 올렸어요! 모두가 볼 수 있어요.')
    } catch (error) { this.handleError(error) } finally { if (button) button.disabled = false }
  }
  private async replySuggestion(id: number): Promise<void> {
    const input = this.root.querySelector<HTMLInputElement>(`.suggest-reply-input[data-id="${id}"]`)
    try { this.renderSuggest(await this.store.replySuggestion(id, input?.value ?? '')); this.toast('답변을 달았어요.') } catch (error) { this.handleError(error) }
  }
  private async deleteSuggestion(id: number): Promise<void> {
    if (!window.confirm('이 건의를 삭제할까요?')) return
    try { this.renderSuggest(await this.store.deleteSuggestion(id)); this.toast('건의를 삭제했어요.') } catch (error) { this.handleError(error) }
  }

  private renderBroadcast(): void {
    if (!this.isAdmin || this.store.user?.username !== 'tjdrjs885') return
    const body = this.root.querySelector<HTMLElement>('.users-body')
    if (!body) return
    body.innerHTML = `<div class="user-detail-head"><button class="soft-button" data-action="users">← 유저 목록</button><b>📢 전체 우편 발송</b><span></span></div>
      <div class="mail-form admin-broadcast-form">
        <p>가입한 일반 유저 모두에게 같은 편지와 코인, 다이아, 강화파편을 보냅니다. 수량은 유저 1명당 지급량입니다.</p>
        <label for="broadcast-message">편지 내용 (필수 · 최대 200자)</label>
        <textarea id="broadcast-message" class="mail-text-input" maxlength="200" rows="4" placeholder="전체 유저에게 보낼 내용을 적어 주세요"></textarea>
        <label for="broadcast-coins">유저 1명당 지급할 코인 (0~1,000,000)</label>
        <input id="broadcast-coins" class="mail-coin-input" type="number" min="0" max="1000000" step="1" value="0" />
        <label for="broadcast-diamonds">유저 1명당 지급할 다이아 (0~1,000,000)</label>
        <input id="broadcast-diamonds" class="mail-coin-input" type="number" min="0" max="1000000" step="1" value="0" />
        <label for="broadcast-fragments">유저 1명당 지급할 강화파편 (0~1,000,000)</label>
        <input id="broadcast-fragments" class="mail-coin-input" type="number" min="0" max="1000000" step="1" value="0" />
        <button class="modal-primary" data-action="admin-broadcast-send">📨 전체 유저에게 보내기</button>
      </div>`
  }

  private async sendBroadcast(): Promise<void> {
    if (!this.isAdmin || this.store.user?.username !== 'tjdrjs885') return
    const body = this.root.querySelector<HTMLElement>('.users-body')
    const message = body?.querySelector<HTMLTextAreaElement>('#broadcast-message')?.value.trim() ?? ''
    const coins = Number(body?.querySelector<HTMLInputElement>('#broadcast-coins')?.value)
    const diamonds = Number(body?.querySelector<HTMLInputElement>('#broadcast-diamonds')?.value)
    const fragments = Number(body?.querySelector<HTMLInputElement>('#broadcast-fragments')?.value)
    if (![diamonds, fragments].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000)) { this.toast('다이아와 강화파편 수량을 확인해 주세요.'); return }
    if (!message || message.length > 200 || !Number.isSafeInteger(coins) || coins < 0 || coins > 1000000) {
      this.toast('편지 내용과 코인 수량을 확인해 주세요.'); return
    }
    if (!window.confirm(`전체 일반 유저에게 편지와 1인당 코인 ${coins.toLocaleString()}개, 다이아 ${diamonds.toLocaleString()}개, 강화파편 ${fragments.toLocaleString()}개를 보내시겠어요? 발송은 취소할 수 없습니다.`)) return
    const button = body?.querySelector<HTMLButtonElement>('[data-action="admin-broadcast-send"]')
    if (button) button.disabled = true
    try {
      const result = await this.store.broadcastMail(message, coins, diamonds, fragments)
      this.notice('전체 우편 발송 완료', `${result.count}명에게 편지와 1인당 코인 ${coins.toLocaleString()}개, 다이아 ${diamonds.toLocaleString()}개, 강화파편 ${fragments.toLocaleString()}개를 보냈어요.`)
      this.audio.play('win')
      this.show('featured')
    } catch (error) { this.handleError(error); if (button) button.disabled = false }
  }

  private async renderCompose(nickname: string): Promise<void> {
    const body = this.root.querySelector<HTMLElement>('.users-body')
    if (!body) return
    let sent = 0
    try { sent = (await this.store.mailbox()).sentToday } catch (error) { this.handleError(error); return }
    const nick = escapeHtml(nickname)
    const admin = Boolean(this.store.user?.admin)
    const left = Math.max(0, MAIL_DAILY_COINS - sent)
    const max = admin ? 2147483647 : Math.min(left, this.store.data.gems)
    body.innerHTML = `<div class="user-detail-head"><button class="soft-button" data-action="user-view" data-nickname="${nick}">← ${nick} 님 도감</button><b>✉ ${nick} 님에게 편지</b><span></span></div>
      <form class="mail-form" novalidate>
        <label for="mail-text">편지 내용 <small class="mail-counter">0 / ${MAIL_MAX_CHARS}</small></label>
        <input id="mail-text" class="mail-text-input" maxlength="${MAIL_MAX_CHARS}" placeholder="${MAIL_MAX_CHARS}자 이내로 적어 주세요" autocomplete="off" />
        <label for="mail-coins">함께 보낼 코인 <small>${admin ? '운영자 코인 무제한' : '내 코인에서 빠져요'}</small></label>
        <div class="mail-coin-row"><input id="mail-coins" class="mail-coin-input" type="number" inputmode="numeric" min="0" max="${max}" step="1" value="0" />${[10, 50].map(n => `<button type="button" class="soft-button mail-quick" data-add="${n}">+${n}</button>`).join('')}</div>
        <p class="mail-limit">${admin ? '오늘 보낼 수 있는 코인 무제한' : `오늘 더 보낼 수 있는 코인 <b>${left}</b> / ${MAIL_DAILY_COINS} · 보유 ${this.store.data.gems}코인`}</p>
        <button type="button" class="modal-primary" data-action="mail-send" data-nickname="${nick}">보내기</button>
      </form>`
    const text = body.querySelector<HTMLInputElement>('.mail-text-input')
    const counter = body.querySelector<HTMLElement>('.mail-counter')
    const coins = body.querySelector<HTMLInputElement>('.mail-coin-input')
    text?.addEventListener('input', () => {
      const chars = [...text.value]
      if (chars.length > MAIL_MAX_CHARS) text.value = chars.slice(0, MAIL_MAX_CHARS).join('')
      if (counter) counter.textContent = `${[...text.value].length} / ${MAIL_MAX_CHARS}`
    })
    body.querySelectorAll<HTMLButtonElement>('.mail-quick').forEach(quick => quick.addEventListener('click', () => {
      if (!coins) return
      coins.value = String(Math.min(max, (Number(coins.value) || 0) + Number(quick.dataset.add)))
    }))
    body.querySelector('.mail-form')?.addEventListener('submit', event => { event.preventDefault(); void this.sendMail(nickname) })
    text?.focus()
  }
  private async sendMail(nickname: string): Promise<void> {
    const body = this.root.querySelector<HTMLElement>('.users-body')
    const message = body?.querySelector<HTMLInputElement>('.mail-text-input')?.value.trim() ?? ''
    const coins = Number(body?.querySelector<HTMLInputElement>('.mail-coin-input')?.value || 0)
    if (!message && !coins) { this.toast('편지 내용이나 보낼 코인을 적어 주세요.'); return }
    if (!Number.isInteger(coins) || coins < 0) { this.toast('보낼 코인은 0 이상의 정수로 적어 주세요.'); return }
    const button = body?.querySelector<HTMLButtonElement>('[data-action="mail-send"]')
    if (button) button.disabled = true
    try {
      const box = await this.store.sendMail(nickname, message, coins)
      this.lastBox = box
      this.renderWallet()
      this.notice('우편을 보냈어요!', coins ? `${nickname} 님에게 편지와 ${coins}코인을 보냈어요. 보낸 편지함에서 확인할 수 있어요.` : `${nickname} 님에게 편지를 보냈어요. 보낸 편지함에서 확인할 수 있어요.`)
      this.audio.play('win')
      this.renderUserDetail(nickname)
    } catch (error) { this.handleError(error); if (button) button.disabled = false }
  }

  private async loadWildWeed(): Promise<void> {
    try {await this.store.loadWildWeed();this.wildWeedLastSlot=Math.floor(this.store.serverNow()/3600000);this.renderWildWeed();this.updateWildWeedDots();if(this.screen==='storage')this.renderStorage();if(this.screen==='shop')this.renderShop()}
    catch(e){this.handleError(e)}
  }
  private updateWildWeedDots(): void {
    const visible = this.store.wildWeed?.visible === true
    this.root.querySelectorAll<HTMLElement>('.wild-weed-alert-dot').forEach(dot => { dot.hidden = !visible })
  }
  private renderWildWeed(): void {
    const field=this.root.querySelector<HTMLElement>('.wild-weed-spawns')
    if(!field)return
    const weeds=this.store.wildWeed?.weeds??[]
    field.innerHTML=weeds.map(weed=>`<button type="button" class="wild-weed-pick${weed.type==='golden'?' is-golden':''}" data-weed-id="${weed.id}" data-weed-type="${weed.type}" aria-label="잡초 길게 누르기" style="left:${weed.x}%;top:${weed.y}%"><img src="${weed.type==='golden'?'/field_golden_weed.png':'/field_wild_weed.png'}" alt="잡초"/><span class="wild-weed-hold-text">남은 시간 1.7초</span></button>`).join('')
  }
  private async pickWildWeed(id:number): Promise<void> {
    if(this.wildWeedBusy||!this.store.wildWeed?.weeds.some(w=>w.id===id))return
    this.wildWeedBusy=true
    try {await this.store.pickWildWeed(id);this.renderWildWeed();this.updateWildWeedDots();this.toast('잡초 채집 완료! 인벤토리에 추가했어요!')}
    catch(e){this.handleError(e);void this.loadWildWeed()}
    finally{this.wildWeedBusy=false}
  }
  private renderWeed(): void {
    const picker = this.root.querySelector<HTMLElement>('.weed-picker')
    const owned = CHARACTERS.filter(character => this.store.data.owned.includes(character.id)).sort((a, b) => battlePower(b.id) - battlePower(a.id)).sort((a, b) => battlePower(b.id) - battlePower(a.id)).sort((a, b) => b.weedBonus - a.weedBonus)
    if (picker) {
      picker.innerHTML = owned.length
        ? owned.map(character => `<button class="weed-pick${this.store.isWeeding(character.id) ? ' is-active' : ''}${(this.store.battle?.id === character.id || this.store.battle?.secondId === character.id || this.store.battle?.thirdId === character.id) ? ' is-busy' : ''}" role="listitem" data-action="weed-pick" data-id="${character.id}" aria-pressed="${this.store.isWeeding(character.id)}">
            <img src="${CHARACTER_IMAGE_URLS[character.id]}" alt="" /><span>${character.name}</span>${character.variant ? `<em>${character.variant}</em>` : ''}${`<em class="is-bonus weed-speed-label">제초속도 +${character.weedBonus}%</em>`}${(this.store.battle?.id === character.id || this.store.battle?.secondId === character.id || this.store.battle?.thirdId === character.id) ? '<em class="is-busy-tag">토벌 중</em>' : ''}${character.id === 'beetle' && this.store.weed?.beetle ? '<em class="is-bonus">도우미</em>' : ''}</button>`).join('')
        : '<p class="users-empty">아직 뽑은 친구가 없어요. 가챠에서 친구를 먼저 뽑아 주세요!</p>'
    }
    const members = this.store.weed?.members ?? []
    const field = this.root.querySelector<HTMLElement>('.weed-field')
    if (field) field.dataset.count = String(members.length)
    this.root.querySelectorAll<HTMLElement>('.weed-walker').forEach(walker => {
      const member = members[Number(walker.dataset.slot)]
      const character = member ? characterById(member.id) : undefined
      walker.classList.toggle('is-idle', !character)
      const friend = walker.querySelector<HTMLElement>('.weed-friend')
      if (!friend) return
      friend.classList.toggle('is-empty', !character)
      friend.innerHTML = character ? `<img src="${CHARACTER_IMAGE_URLS[character.id]}" alt="제초 중인 ${fullName(character)}" />` : ''
    })
    this.renderBeetle()
    this.renderWildWeed()
    this.renderWeedStatus()
  }

  private deploymentTransform(id: string): string {
    const size = id === 'anoko' ? 1.5 : id === 'shimajiro' ? 1.15 : 1
    return `transform:translateY(${id === 'anoko' ? '14px' : '0'}) scale(${this.battleFlipCharacter(id) ? -size : size},${size})!important;transform-origin:center bottom;`
  }

  private battleFlipCharacter(id:string):boolean { return ['m_shisa','m_rakko','shimajiro','staff_chiikawa','staff_hachiware'].includes(id) }

  private renderBattle(): void {
    const picker = this.root.querySelector<HTMLElement>('.battle-picker')
    const owned = CHARACTERS.filter(character => this.store.data.owned.includes(character.id))
    if (picker) {
      picker.innerHTML = owned.length
        ? owned.map(character => `<button class="weed-pick${(this.store.battle?.id === character.id || this.store.battle?.secondId === character.id || this.store.battle?.thirdId === character.id) ? ' is-active' : ''}${this.weedBusy(character.id) ? ' is-busy' : ''}" role="listitem" data-action="battle-pick" data-id="${character.id}" aria-pressed="${this.store.battle?.id === character.id || this.store.battle?.secondId === character.id || this.store.battle?.thirdId === character.id}">
            <img src="${CHARACTER_IMAGE_URLS[character.id]}" alt="" /><span class="battle-pick-name">${character.name}${character.variant ? ` (${character.variant})` : ''}</span><em class="is-power">전투력 ${battlePower(character.id)}</em>${this.weedBusy(character.id) ? '<em class="is-busy-tag">제초 중</em>' : ''}</button>`).join('')
        : '<p class="weed-empty">가챠에서 친구를 뽑으면 토벌을 보낼 수 있어요.</p>'
    }
    const fighter = this.store.battle?.id ? characterById(this.store.battle.id) : undefined
    const second = this.store.battle?.secondId ? characterById(this.store.battle.secondId) : undefined
    const third = this.store.battle?.thirdId ? characterById(this.store.battle.thirdId) : undefined
    const thirdUnit = this.root.querySelector<HTMLElement>('.bf-friend-third')
    if (thirdUnit) {
      thirdUnit.classList.toggle('is-empty', !third)
      const body = thirdUnit.querySelector<HTMLElement>('.bf-friend-body')
      if (body) body.innerHTML = third ? `<img class="${this.battleFlipCharacter(third.id)?'battle-facing-flipped':''}" style="${this.deploymentTransform(third.id)}" src="${CHARACTER_IMAGE_URLS[third.id]}" alt="토벌 중인 ${fullName(third)}" />` : ''
    }
    const secondUnit = this.root.querySelector<HTMLElement>('.bf-friend-second')
    if (secondUnit) {
      secondUnit.classList.toggle('is-empty', !second)
      const body = secondUnit.querySelector<HTMLElement>('.bf-friend-body')
      if (body) body.innerHTML = second ? `<img class="${this.battleFlipCharacter(second.id)?'battle-facing-flipped':''}" style="${this.deploymentTransform(second.id)}" src="${CHARACTER_IMAGE_URLS[second.id]}" alt="토벌 중인 ${fullName(second)}" />` : '' 
    }
    const unit = this.root.querySelector<HTMLElement>('.bf-friend:not(.bf-friend-second):not(.bf-friend-third)')
    if (unit) {
      unit.classList.toggle('is-empty', !fighter)
      const body = unit.querySelector<HTMLElement>('.bf-friend-body')
      if (body) body.innerHTML = fighter ? `<img class="${this.battleFlipCharacter(fighter.id)?'battle-facing-flipped':''}" style="${this.deploymentTransform(fighter.id)}" src="${CHARACTER_IMAGE_URLS[fighter.id]}" alt="토벌 중인 ${fullName(fighter)}" />` : '' 
    }
    const battleField = this.root.querySelector<HTMLElement>('.battle-field')
    if (battleField) {
      battleField.querySelector('.battle-weapon-strike')?.remove()
      // Weapon power remains included in server and UI damage calculations.
    }
    this.root.querySelector('.battle-field')?.classList.toggle('is-fighting', Boolean(fighter) && !this.battleStageChanging)
    this.battleAnimationKey = ''
    this.renderBattleStatus()
  }

  /** Settles defeated monsters on the server (diamonds are credited to inventory). */
  private async syncBattle(): Promise<void> {
    if (!this.store.battle || this.battleSyncing) return
    this.battleSyncing = true
    try {
      const result = await this.store.claimBattle()
      if (result.cleared.length) {
        this.audio.play('pickup')
        if (this.screen === 'battle') this.showBattleClearRewards(result.cleared)
      }
      if(result.failedStage && this.screen==='battle')this.showBattleFailure(result.failedStage)
    } catch { /* Retried on the next tick. */ } finally { this.battleSyncing = false }
    this.renderWallet()
    if (this.screen === 'battle') this.renderBattleStatus()
  }

  private battleRewardPopupTimer: ReturnType<typeof setTimeout> | undefined
  private battleStageChanging = false
  private lastDisplayedBattleStage = 0
  private battleStageTransitionTimer: ReturnType<typeof setTimeout> | undefined
  private showBattleStageTransition(stage: number): void {
    if (this.lastDisplayedBattleStage === 0) { this.lastDisplayedBattleStage = stage; return }
    if (stage === this.lastDisplayedBattleStage) return
    const previous = this.lastDisplayedBattleStage
    this.lastDisplayedBattleStage = stage
    // Stage reductions can result from a previously failed challenge, a manual reset,
    // or stale client prediction. Only the server's failedStage event may show failure.
    if (stage < previous) { this.battleStageChanging = false; return }
    const layer = this.root.querySelector<HTMLElement>('.battle-stage-transition')
    const next = this.root.querySelector<HTMLElement>('.battle-stage-next')
    if (!layer || !next) return
    next.textContent = `${Math.floor((stage - 1) / 10) + 1}-${((stage - 1) % 10) + 1} STAGE`
    if (this.battleStageTransitionTimer) clearTimeout(this.battleStageTransitionTimer)
    this.battleStageChanging = true
    this.root.querySelector('.bf-enemy')?.classList.add('is-stage-changing')
    this.root.querySelector('.battle-field')?.classList.add('is-stage-changing')
    const title=this.root.querySelector<HTMLElement>('.battle-transition-title')
    if(title)title.textContent='STAGE CLEAR!'
    layer.classList.remove('is-visible')
    layer.classList.add('is-visible')
    layer.setAttribute('aria-hidden', 'false')
    this.battleStageTransitionTimer = setTimeout(() => {
      layer.classList.remove('is-visible')
      layer.setAttribute('aria-hidden', 'true')
      this.battleStageChanging = false
      this.root.querySelector('.bf-enemy')?.classList.remove('is-stage-changing')
      this.root.querySelector('.battle-field')?.classList.remove('is-stage-changing')
    }, 2000)
  }

  private showBattleFailure(stage:number):void {
    const layer=this.root.querySelector<HTMLElement>('.battle-stage-transition')
    const title=this.root.querySelector<HTMLElement>('.battle-transition-title')
    const next=this.root.querySelector<HTMLElement>('.battle-stage-next')
    if(!layer||!title||!next)return
    if(this.battleStageTransitionTimer)clearTimeout(this.battleStageTransitionTimer)
    title.textContent='STAGE FAILED!'
    next.textContent=`${Math.floor((stage-1)/10)+1}-${(stage-1)%10+1} 스테이지 도전 실패!`
    this.battleStageChanging=true
    layer.classList.add('is-visible');layer.setAttribute('aria-hidden','false')
    this.root.querySelector('.battle-field')?.classList.add('is-stage-changing')
    this.battleStageTransitionTimer=setTimeout(()=>{
      layer.classList.remove('is-visible');layer.setAttribute('aria-hidden','true')
      this.battleStageChanging=false
      this.root.querySelector('.battle-field')?.classList.remove('is-stage-changing')
    },2000)
  }
  private showBattleClearRewards(items:{stage:number;coins:number;fragments:number}[]):void {
    if(!items.length)return
    const item=items[items.length-1]
    const label=`${Math.floor((item.stage-1)/10)+1}-${(item.stage-1)%10+1}`
    const popup=this.root.querySelector<HTMLElement>('.battle-reward-popup')
    if(!popup)return
    popup.innerHTML=`<div class="battle-reward-popup-title">${label} 스테이지 클리어!</div><div class="battle-reward-popup-items"><span><img src="/assets/coin.png" alt=""/> ${item.coins}코인 획득</span><span><img src="/assets/enhancement_fragment.png" alt=""/> 강화파편 ${item.fragments}개 획득</span></div>`
    popup.hidden=false
    popup.classList.remove('is-visible')
    // Restart the visible reward animation without reflow-heavy measurements.
    requestAnimationFrame(()=>popup.classList.add('is-visible'))
    if(this.battleRewardPopupTimer)clearTimeout(this.battleRewardPopupTimer)
    this.battleRewardPopupTimer=setTimeout(()=>{popup.classList.remove('is-visible');popup.hidden=true},3000)
  }
  private confirmBattleUndeploy(): Promise<boolean> {
    return new Promise(resolve => {
      document.getElementById('battle-undeploy-dialog')?.remove()
      const dialog = document.createElement('dialog')
      dialog.id = 'battle-undeploy-dialog'
      dialog.setAttribute('aria-labelledby', 'battle-undeploy-title')
      dialog.setAttribute('aria-describedby', 'battle-undeploy-description')
      dialog.style.cssText = 'border:0;border-radius:22px;padding:0;background:transparent;max-width:min(340px,calc(100vw - 32px));width:100%;box-shadow:0 12px 35px #392a2a66;'
      dialog.innerHTML = `<div style="background:#fff9eb;border:3px solid #a77851;border-radius:22px;padding:24px 20px;text-align:center;color:#674630;font-family:inherit">
        <div style="font-size:28px;margin-bottom:7px" aria-hidden="true">⚠️</div>
        <h3 id="battle-undeploy-title" style="font-size:19px;font-weight:900;margin:0 0 12px">배치 해제 확인</h3>
        <p id="battle-undeploy-description" style="font-size:15px;line-height:1.6;margin:0 0 20px">도전중인 스테이지가 초기화됩니다.</p>
        <div style="display:flex;gap:10px;justify-content:center">
          <button type="button" data-choice="cancel" style="flex:1;border:2px solid #d6b99d;background:#fff;color:#76553c;border-radius:13px;padding:11px 8px;font-weight:800;font-size:15px;cursor:pointer">취소</button>
          <button type="button" data-choice="confirm" style="flex:1;border:2px solid #a77851;background:#ffe3a6;color:#664124;border-radius:13px;padding:11px 8px;font-weight:900;font-size:15px;cursor:pointer">확인</button>
        </div>
      </div>`
      document.body.appendChild(dialog)
      let settled = false
      const finish = (accepted:boolean) => {
        if (settled) return
        settled = true
        dialog.close()
        dialog.remove()
        resolve(accepted)
      }
      dialog.querySelector<HTMLButtonElement>('[data-choice="cancel"]')?.addEventListener('click', () => finish(false))
      dialog.querySelector<HTMLButtonElement>('[data-choice="confirm"]')?.addEventListener('click', () => finish(true))
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false) })
      dialog.addEventListener('click', event => { if (event.target === dialog) finish(false) })
      dialog.showModal()
      dialog.style.setProperty('z-index','99999')
    })
  }

  private renderBattleStatus(): void {
    const fighter = this.store.battle?.id ? characterById(this.store.battle.id) : undefined
    const view = this.store.battleView()
    if (view.kills > 0 || view.remaining <= 0) void this.syncBattle()
    const stageLabel = `${Math.floor((view.stage - 1) / 10) + 1}-${((view.stage - 1) % 10) + 1}`
    const stageHeading = this.root.querySelector<HTMLElement>('.battle-stage-heading')
    if (stageHeading) stageHeading.textContent = `${stageLabel} STAGE`
    const rewardCaption = this.root.querySelector<HTMLElement>('.battle-stage-rewards .battle-reward-caption')
    if (rewardCaption) rewardCaption.textContent = `${stageLabel} 클리어 보상`
    const coins = this.root.querySelector<HTMLElement>('.battle-stage-coins')
    if (coins) coins.textContent = String(stageRewards(view.stage)[0])
    const fragments = this.root.querySelector<HTMLElement>('.battle-stage-fragments')
    if (fragments) fragments.textContent = String(stageRewards(view.stage)[1])
    const remaining = Math.max(0, Math.ceil(view.remaining / 1000))
    const timeLabel = this.root.querySelector<HTMLElement>('.battle-time-remaining')
    if (timeLabel) timeLabel.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`
    if (this.screen === 'battle' && !this.battleSyncing) this.showBattleStageTransition(view.stage)
    const enemyUnit = this.root.querySelector<HTMLElement>('.bf-enemy')
    if (enemyUnit) {
      const isBoss = view.stage % 10 === 0
      enemyUnit.classList.toggle('is-stage-boss', isBoss)
      enemyUnit.classList.toggle('is-stage-changing', this.battleStageChanging || view.hp <= 0 || view.kills > 0)
    }
    const status = this.root.querySelector<HTMLElement>('.battle-status')
    if (status) {
      if (fighter) {
        const characterPower = battlePower(this.store.battle!.id) + (this.store.battle?.secondId ? battlePower(this.store.battle.secondId) : 0) + (this.store.battle?.thirdId ? battlePower(this.store.battle.thirdId) : 0)
        const weaponPower = this.store.forge?.bonus ?? 0
        const collectionPower = this.collectionCombatPower
        status.innerHTML = `<span class="battle-status-row"><span>토벌 중 ${this.store.battle?.thirdId ? '3/3명' : this.store.battle?.secondId ? '2/3명' : '1/3명'}</span><span>전투력 <b>${characterPower}</b></span><span>장비 공격력 <b>${weaponPower}</b></span><span>컬렉션 <b>+${collectionPower}</b></span><span class="battle-total-power">총전투력 <b>${characterPower + weaponPower + collectionPower}</b></span></span><small class="battle-status-help">캐릭터를 눌러 교체/해제</small>`
      } else {
        status.textContent = '아래에서 토벌할 친구를 최대 3명 골라 주세요.'
      }
    }
    const retry=this.root.querySelector<HTMLButtonElement>('.battle-retry-challenge')
    const challenge = this.root.querySelector<HTMLButtonElement>('.battle-boss-challenge')
    // Boss challenge has priority when a failed boss sends the player back to stage 9.
    const bossAvailable = Boolean(fighter && view.stage % 10 === 9 && this.store.battle?.bossReady)
    if (challenge) challenge.hidden = !bossAvailable
    if (retry) retry.hidden = bossAvailable || !fighter || this.store.battle?.retryStage !== view.stage + 1
    const time5 = this.root.querySelector<HTMLButtonElement>('.battle-test-time5')
    if (time5) time5.hidden = this.store.user?.username?.toLowerCase() !== 'test' || !fighter
    const testClear = this.root.querySelector<HTMLButtonElement>('.battle-test-clear')
    if (testClear) testClear.hidden = this.store.user?.username?.toLowerCase() !== 'test' || !this.store.battle
    const testHp500 = this.root.querySelector<HTMLButtonElement>('.battle-test-hp500')
    if (testHp500) testHp500.hidden = this.store.user?.username?.toLowerCase() !== 'test' || !this.store.battle
    const testReset = this.root.querySelector<HTMLButtonElement>('.battle-test-reset')
    if (testReset) testReset.hidden = this.store.user?.username?.toLowerCase() !== 'test' || !this.store.battle
    const enemyHp = this.root.querySelector<HTMLElement>('.bf-enemy-hp')
    if (enemyHp) enemyHp.textContent = `${view.hp.toLocaleString()} / ${view.maxHp.toLocaleString()} · ${(view.hp / view.maxHp * 100).toFixed(1)}%`
    const fill = this.root.querySelector<HTMLElement>('.bf-enemy-fill')
    if (fill) fill.style.transform = `scaleX(${view.hp / view.maxHp})`
    // Match the weapon and character attack cycles to the same 3-second server tick.
    const field = this.root.querySelector<HTMLElement>('.battle-field')
    // Set animation phase once per battle assignment, not on every 100ms UI refresh.
    // Updating animation-delay continuously restarts CSS animations on some browsers.
    const animationKey = this.store.battle ? `${this.store.battle.since}:${this.store.battle.id}:${this.store.battle.secondId ?? ''}` : ''
    if (field && animationKey !== this.battleAnimationKey) {
      this.battleAnimationKey = animationKey
      field.style.setProperty('--battle-cycle-offset', `${-(BATTLE_TICK_MS - view.nextIn) / 1000}s`)
    }
    // A real attack landed since the last frame: show the damage number and a hit shake.
    if (fighter && !this.battleStageChanging && view.kills === 0 && this.lastEnemyHp >= 0 && view.hp < this.lastEnemyHp) {
      const hit = this.root.querySelector<HTMLElement>('.bf-hit')
      const enemy = this.root.querySelector<HTMLElement>('.bf-enemy')
      if (hit) { hit.textContent = `-${view.power}`; hit.classList.remove('is-showing'); void hit.offsetWidth; hit.classList.add('is-showing') }
      if (enemy) { enemy.classList.remove('is-hit'); void enemy.offsetWidth; enemy.classList.add('is-hit') }
      field?.classList.remove('battle-impact'); void field?.offsetWidth; field?.classList.add('battle-impact')
    }
    this.lastEnemyHp = view.hp
  }

  /** A friend is busy in the weeding field if it weeds or is the placed 풍뎅이 helper. */
  private weedBusy(id: CharacterId): boolean {
    return this.store.isWeeding(id) || (id === 'beetle' && Boolean(this.store.weed?.beetle))
  }
  /** 풍뎅이 unique effect: extra helper slot in the weeding field, coins ×2 while placed. */
  private renderBeetle(): void {
    const slot = this.root.querySelector<HTMLElement>('.weed-beetle-slot')
    const helper = this.root.querySelector<HTMLElement>('.weed-beetle-helper')
    const owned = this.store.data.owned.includes('beetle')
    const placed = Boolean(this.store.weed?.beetle)
    if (helper) { helper.hidden = !placed; helper.innerHTML = placed ? `<img src="${CHARACTER_IMAGE_URLS.beetle}" alt="제초를 돕는 풍뎅이" /><b>코인 ×2</b>` : '' }
    if (!slot) return
    slot.hidden = !owned
    if (!owned) { slot.innerHTML = ''; return }
    const weederIsBeetle = this.store.isWeeding('beetle')
    const inBattle = this.store.battle?.id === 'beetle'
    const note = placed ? '배치 중 · 제초 코인이 2배로 모여요' : weederIsBeetle ? '풍뎅이가 직접 제초 중이에요. 풍뎅이를 쉬게 하면 도우미로 배치할 수 있어요' : inBattle ? '풍뎅이가 토벌 중이라 배치할 수 없어요' : !this.store.weed ? '제초할 친구를 먼저 고르면 배치할 수 있어요' : '배치하면 제초 코인을 2배로 받아요'
    const disabled = !placed && (weederIsBeetle || inBattle || !this.store.weed)
    slot.innerHTML = `<img src="${CHARACTER_IMAGE_URLS.beetle}" alt="" /><span class="weed-beetle-text"><b>풍뎅이 도우미</b><small>${note}</small></span><button type="button" class="weed-beetle-button${placed ? ' is-on' : ''}" data-action="weed-beetle"${disabled ? ' disabled' : ''}>${placed ? '돌아오기' : '배치하기'}</button>`
    slot.classList.toggle('is-on', placed)
  }
  private renderWeedStatus(): void {
    const members = (this.store.weed?.members ?? []).map(m => characterById(m.id))
    const weeding = members[0]
    const status = this.root.querySelector<HTMLElement>('.weed-status')
    if (status) status.textContent = members.length
      ? `${members.length === 1 ? withJosa(members[0].name, '이', '가') : `${members.map(c => c.name).join('·')} ${members.length}명이`} 제초 중 (${members.length}/${WEED_MAX}) · 총 제초 보너스 +${members.reduce((sum, c) => sum + c.weedBonus, 0)}%${this.store.weed?.beetle ? ' · 코인 2배' : ''}`
      : (this.store.data.owned.length ? `아래에서 제초할 친구를 골라 주세요. (최대 ${WEED_MAX}명)` : '친구를 뽑으면 제초를 맡길 수 있어요.')
    const rateNode = this.root.querySelector<HTMLElement>('.weed-rate')
    if (rateNode) rateNode.textContent = this.store.weedHourlyRate().toFixed(2)
    // Coins are credited automatically; settle right away once one is ready while watching.
    if (this.store.pendingWeedCoins() > 0 && !this.settling) { this.settling = true; void this.tickSettle().finally(() => { this.settling = false }) }
    const next = this.root.querySelector<HTMLElement>('.weed-next')
    if (next) {
      const seconds = Math.ceil(this.store.nextWeedCoinIn() / 1000)
      next.textContent = weeding ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : '--:--'
    }
  }

  private showUpdateNoticeOnce(): void {
    const username = this.store.user?.username
    if (!username || this.screen !== 'title') return
    const key = `geongi-update-20261110-${username.toLowerCase()}`
    try { if (window.localStorage.getItem(key) === 'seen') return } catch { /* private mode */ }
    if (this.root.querySelector('.update-notice-overlay')) return
    const overlay = document.createElement('div')
    overlay.className = 'update-notice-overlay'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', '업데이트 안내')
    overlay.innerHTML = `<div class="update-notice-panel"><div class="update-notice-scroll">
      <h2>업데이트 안내</h2><p class="update-notice-date">2026년 11월 10일 업데이트 내역</p>
      <h3>1. 신규 캐릭터 추가</h3><ul><li>치이카와(파자마)</li><li>하치와레(파자마)</li><li>우사기(파자마)</li><li>치이카와(토벌봉)</li><li>하치와레(토벌봉)</li><li>우사기(토벌봉)</li><li>모몽가(천사)</li><li>모몽가(악마)</li></ul>
      <h3>2. 하우스·데코 개편</h3><ul><li>하우스 데코 배치 시스템을 전면 개편했습니다.</li><li>하우스에 배치한 캐릭터들이 자동으로 움직입니다.</li><li>기존 데코를 전부 삭제하고 신규 데코 31종을 추가했습니다.</li><li>추가 데코는 추후 업데이트 예정입니다.</li></ul>
      <h3>3. 데코 삭제 보상</h3><p>기존 데코 삭제 보상으로 모든 유저에게 300코인을 지급합니다.</p>
      <h3>4. 기타 안내사항</h3><p>이번 업데이트에서는 신규 콘텐츠와 시스템이 다수 추가되어 일부 버그 및 UI 오류가 발생할 수 있습니다.</p><p>게임 이용 중 오류나 개선이 필요한 사항을 발견하시면 제보 부탁드립니다.</p>
      <button type="button" class="update-notice-close">닫기</button>
    </div></div>`
    overlay.querySelector<HTMLButtonElement>('.update-notice-close')?.addEventListener('click', () => {
      try { window.localStorage.setItem(key, 'seen') } catch { /* private mode */ }
      overlay.remove()
    })
    this.root.appendChild(overlay)
  }

  private async submitNickname(): Promise<void> {
    if (this.busy) return
    const nickname = this.root.querySelector<HTMLInputElement>('#nickname-input')?.value.trim() ?? ''
    const error = this.root.querySelector<HTMLElement>('.nickname-error')
    if (!NICKNAME_RULE.test(nickname)) { if (error) error.textContent = ERROR_TEXT.invalid_nickname; return }
    this.busy = true
    try {
      await this.store.setNickname(nickname)
      this.show('title')
      this.toast(`반가워요, ${nickname} 님!`)
    } catch (caught) {
      const code = caught instanceof RequestError ? caught.code : 'network'
      if (code === 'login_required') this.handleError(caught)
      else if (error) error.textContent = ERROR_TEXT[code] ?? ERROR_TEXT.network
    } finally { this.busy = false }
  }

  private renderResults(): void {
    const list = this.root.querySelector<HTMLElement>('.result-list')
    if (!list) return
    const subtitle = this.root.querySelector<HTMLElement>('.result-subtitle')
    const deco = this.resultKind === 'deco'
    if (subtitle) subtitle.textContent = this.results.length > 1 ? `${this.results.length}개 캡슐에서 나온 ${deco ? '데코' : '친구'}들` : deco ? '캡슐에서 나온 데코예요.' : '캡슐에서 만난 친구예요.'
    const title = this.root.querySelector<HTMLElement>('#result-title')
    if (title) title.textContent = deco ? '데코가 나왔어요' : '새로운 만남이에요'
    const toCollection = this.root.querySelector<HTMLElement>('.result-collection')
    if (toCollection) toCollection.textContent = deco ? '데코 도감에서 확인하기' : '도감에서 확인하기'
    list.innerHTML = this.results.map((item, index) => {
      const grade = deco ? 'deco' : (item.grade ?? '노멀').replace(/^★\s*/, '').trim()
      const tier = grade === '레전더리' ? 'legendary' : grade === '유니크' ? 'unique' : grade === '에픽' ? 'epic' : grade === '레어' ? 'rare' : grade === '노멀' ? 'normal' : 'deco'
      return `<div class="result-friend result-tier-${tier}" style="--friend:${item.color};--accent:${item.accent};--i:${index}">
        <span class="result-avatar"><img src="${item.image}" alt="${item.name}" /></span>
        <span><b>${item.variant ? `${item.name}(${item.variant})` : item.name}</b><small>${item.sub}</small></span>
        <span class="result-chance">${Number(item.chance).toFixed(2)}%</span>
      </div>`
    }).join('')
    this.renderCollection()
  }

  private setAuthMode(mode: 'login' | 'register'): void {
    this.authMode = mode
    this.root.querySelectorAll<HTMLButtonElement>('.auth-tab').forEach(tab => {
      const active = tab.dataset.action === `auth-${mode}`
      tab.classList.toggle('is-active', active)
      tab.setAttribute('aria-selected', String(active))
    })
    this.root.querySelector('.auth-confirm-wrap')?.classList.toggle('is-hidden', mode === 'login')
    const submit = this.root.querySelector<HTMLButtonElement>('.auth-submit')
    if (submit) submit.textContent = mode === 'login' ? '로그인' : '가입하고 시작하기'
    this.root.querySelector<HTMLInputElement>('#auth-password')?.setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password')
    this.setAuthError('')
  }

  private setAuthError(text: string): void {
    const node = this.root.querySelector<HTMLElement>('.auth-error')
    if (node) node.textContent = text
  }

  private async submitAuth(): Promise<void> {
    if (this.busy) return
    const username = this.root.querySelector<HTMLInputElement>('#auth-username')?.value.trim() ?? ''
    const password = this.root.querySelector<HTMLInputElement>('#auth-password')?.value ?? ''
    const confirm = this.root.querySelector<HTMLInputElement>('#auth-confirm')?.value ?? ''
    const nickname = this.root.querySelector<HTMLInputElement>('#auth-nickname')?.value.trim() ?? ''
    if (!/^[A-Za-z0-9_가-힣]{3,20}$/.test(username)) { this.setAuthError(ERROR_TEXT.invalid_username); return }
    if (password.length < 6 || password.length > 72) { this.setAuthError(ERROR_TEXT.invalid_password); return }
    if (this.authMode === 'register' && password !== confirm) { this.setAuthError('비밀번호 확인이 일치하지 않아요.'); return }
    if (this.authMode === 'register' && !NICKNAME_RULE.test(nickname)) { this.setAuthError(ERROR_TEXT.invalid_nickname); return }
    const submit = this.root.querySelector<HTMLButtonElement>('.auth-submit')
    this.busy = true
    if (submit) submit.disabled = true
    this.setAuthError('')
    try {
      if (this.authMode === 'register') await this.store.register(username, password, nickname)
      else await this.store.login(username, password)
      this.root.querySelector<HTMLFormElement>('.auth-form')?.reset()
      const shown = this.store.user?.nickname ?? username
      this.show(this.store.user?.nickname ? 'title' : 'nickname')
      void this.tickSettle()
      this.toast(this.authMode === 'register' ? `환영해요, ${shown} 님! ${STARTING_COINS}코인을 드렸어요.` : `${shown} 님, 다시 오신 걸 환영해요!`)
    } catch (error) {
      this.setAuthError(ERROR_TEXT[error instanceof RequestError ? error.code : 'network'] ?? ERROR_TEXT.network)
    } finally {
      this.busy = false
      if (submit) submit.disabled = false
    }
  }

  /** Weeding/battle coins land in the wallet automatically, without opening those screens. */
  private settling = false
  private async tickSettle(): Promise<void> {
    if (!this.store.user || this.busy || document.hidden) return
    try {
      const earned = await this.store.autoSettle()
      this.renderWallet()
      if (this.screen === 'weed') this.renderWeed()
      if (this.screen === 'battle') this.renderBattle()
      if (earned > 0) this.toast(`🌿 제초장에서 ${earned}코인이 자동으로 들어왔어요!`)
    } catch { /* next tick retries */ }
  }
  private handleError(error: unknown): void {
    const code = error instanceof RequestError ? error.code : 'network'
    if (code === 'not_enough_coins' && this.screen === 'title') this.showInsufficient()
    else this.toast(ERROR_TEXT[code] ?? ERROR_TEXT.network)
    if (code === 'login_required') { this.store.user = null; this.setAuthMode('login'); this.show('auth') }
  }

  /** Pops every pulled friend one at a time; tapping the pop skips to the next one. */
  private async playPops(results: RevealItem[], sequence: number): Promise<void> {
    const node = this.root.querySelector<HTMLElement>('.pop-reveal')
    const hold = results.length === 1 ? 1000 : 500
    for (let index = 0; index < results.length; index += 1) {
      if (sequence !== this.revealSequence) return
      this.popReveal(results[index], index, results.length)
      await new Promise<void>(resolve => {
        const timer = window.setTimeout(done, hold)
        function done(): void { window.clearTimeout(timer); node?.removeEventListener('pointerdown', done); resolve() }
        node?.addEventListener('pointerdown', done, { once: true })
      })
    }
    if (sequence !== this.revealSequence) return
    this.hidePop()
    this.show('result')
    this.renderWallet()
  }

  private popReveal(item: RevealItem, index: number, total: number): void {
    const node = this.root.querySelector<HTMLElement>('.pop-reveal')
    if (!node) return
    const grade = item.grade ? item.grade.replace(/^★\s*/, '') : (item.sub.includes('데코') ? '데코' : '노멀')
    const tier = grade === '레전더리' ? 'legendary' : grade === '유니크' ? 'unique' : grade === '에픽' ? 'epic' : grade === '레어' ? 'rare' : 'normal'
    const counter = total > 1 ? `<small class="pop-count">${index + 1} / ${total}</small>` : ''
    const hint = total > 1 ? '<small class="pop-more">화면을 누르면 다음으로 넘어가요</small>' : ''
    node.innerHTML = `<div class="pop-card tier-${tier}${item.rare ? ' is-rare' : ''}" style="--friend:${item.color};--accent:${item.accent}">
        <span class="pop-grade">${grade}</span>
        <span class="pop-burst">${item.rare ? `${item.grade ?? '★'} 뿅!` : '뿅!'}</span>
        ${counter}
        <span class="pop-photo"><img src="${item.image}" alt="${item.name}" /></span>
        <b class="pop-name">${item.name}</b>${item.variant ? `<small class="pop-variant">${item.variant}</small>` : ''}
        <span class="pop-tag">${item.tag}</span>
        ${hint}
      </div>`
    node.classList.remove('is-visible')
    void node.offsetWidth
    node.classList.add('is-visible')
    node.setAttribute('aria-hidden', 'false')
    this.audio.play('pickup')
  }

  private hidePop(): void {
    const node = this.root.querySelector<HTMLElement>('.pop-reveal')
    node?.classList.remove('is-visible')
    node?.setAttribute('aria-hidden', 'true')
  }

  private async spinRoulette(): Promise<void> {
    if (this.wheelSpinning) return
    const wheel = this.root.querySelector<SVGGElement>('.roulette-wheel')
    const button = this.root.querySelector<HTMLButtonElement>('.roulette-spin')
    const rewardMessage = this.root.querySelector<HTMLElement>('.roulette-pop-reward')
    if (rewardMessage) { rewardMessage.hidden = true; rewardMessage.textContent = '' }
    this.wheelSpinning = true
    if (button) { button.disabled = true; button.textContent = '빙글빙글…' }
    try {
      const result = await this.store.spinRoulette()
      if (!result) { this.toast('이번 시간대 룰렛은 이미 돌렸어요.'); return }
      const [start, end] = ROULETTE_SLICES[result.index]
      const landing = start + (end - start) * (0.2 + Math.random() * 0.6)
      const current = ((this.wheelTurn % 360) + 360) % 360
      this.wheelTurn += 360 * 5 + ((360 - landing - current) % 360 + 360) % 360
      if (wheel) wheel.style.transform = `rotate(${this.wheelTurn}deg)`
      this.audio.play('ui')
      await new Promise(resolve => window.setTimeout(resolve, 4200))
      this.audio.play('pickup')
      
      if (rewardMessage) {
        rewardMessage.textContent = `🎉 ${result.prize}코인 획득!!`
        rewardMessage.hidden = false
        rewardMessage.classList.remove('pop-in')
        void rewardMessage.offsetWidth
        rewardMessage.classList.add('pop-in')
        window.setTimeout(() => { rewardMessage.hidden = true; rewardMessage.classList.remove('pop-in') }, 2300)
      }
      this.root.querySelector('.roulette-wrap')?.classList.add('is-win')
      window.setTimeout(() => this.root.querySelector('.roulette-wrap')?.classList.remove('is-win'), 1600)
    } catch (error) { this.handleError(error) } finally {
      this.wheelSpinning = false
      this.renderWallet()
    }
  }

  private showForgeInsufficient(): void {
    const overlay=this.root.querySelector<HTMLElement>('.insufficient-overlay')
    const title=this.root.querySelector<HTMLElement>('#insufficient-title')
    const message=this.root.querySelector<HTMLElement>('#insufficient-message')
    const icon=this.root.querySelector<HTMLImageElement>('.insufficient-icon')
    if(!overlay||!title||!message)return
    title.textContent='재화가 부족합니다'
    const level=this.store.forge?.level??0
    message.textContent=`강화에는 강화파편 ${level<20?level+1:[25,30,40,50,60][level-20]}개와 코인 ${level<20?(level+1)*5:[150,200,300,400,500][level-20]}개가 필요합니다. 현재 강화파편 ${this.isForgeOperator?'무제한':(this.store.data.fragments??0).toLocaleString()+'개'}, 코인 ${this.store.data.gems.toLocaleString()}개를 보유 중입니다.`
    if(icon)icon.src='/assets/enhancement_fragment.png'
    overlay.hidden=false
    this.root.querySelector<HTMLButtonElement>('.insufficient-close')?.focus()
  }

  private showInsufficient(cost?: number): void {
    const overlay = this.root.querySelector<HTMLElement>('.insufficient-overlay')
    const message = this.root.querySelector<HTMLElement>('#insufficient-message')
    if (!overlay || !message) return
    const have = this.store.data.gems
    const title=this.root.querySelector<HTMLElement>('#insufficient-title')
    if(title)title.textContent='코인이 부족해요!'
    const icon=this.root.querySelector<HTMLImageElement>('.insufficient-icon')
    if(icon)icon.src='/assets/coin.png'
    message.textContent = cost === undefined
      ? `현재 ${have.toLocaleString('ko-KR')}코인을 보유 중이에요. 제초장이나 출석 체크에서 코인을 모아보세요!`
      : `뽑기에 ${cost.toLocaleString('ko-KR')}코인이 필요하지만 현재 ${have.toLocaleString('ko-KR')}코인이 있어요. 제초장이나 출석 체크에서 코인을 모아보세요!`
    overlay.hidden = false
    this.root.querySelector<HTMLButtonElement>('.insufficient-close')?.focus()
  }

  private closeInsufficient(): void {
    const overlay = this.root.querySelector<HTMLElement>('.insufficient-overlay')
    if (overlay) overlay.hidden = true
  }

  private toast(text: string): void {
    const node = this.root.querySelector<HTMLElement>(this.screen === 'weed' ? '.weed-toast' : this.screen === 'battle' ? '.battle-toast' : this.screen === 'house' ? '.house-toast' : this.screen === 'claw' ? '.claw-toast' : '.gacha-screen .toast')
    if (!node) return
    node.textContent = text
    node.classList.add('is-visible')
    window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => node.classList.remove('is-visible'), 2400)
  }

  showLoadError(): void {
    const label = this.root.querySelector<HTMLElement>('.gacha-boot p')
    const retry = this.root.querySelector<HTMLButtonElement>('.boot-retry')
    if (label) label.textContent = '게임을 불러오지 못했어요. 다시 시도해 주세요.'
    retry?.classList.remove('is-hidden')
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

/** Picks the Korean particle by whether the last syllable has a final consonant (받침). */
function withJosa(word: string, withFinal: string, withoutFinal: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0
  return word + (hasFinal ? withFinal : withoutFinal)
}

/** Slice angles (degrees, clockwise from the top) sized by each prize's real probability. */
const ROULETTE_SLICES: Array<[number, number]> = (() => {
  let at = 0
  return ROULETTE_PRIZES.map(prize => { const start = at; at += prize.percent * 3.6; return [start, at] as [number, number] })
})()
const ROULETTE_COLORS = ['#ffe3ea', '#dff1ff', '#fff3c4', '#e3f6dc', '#f1e2ff']

function rouletteWheel(): string {
  const r = 100
  const point = (deg: number, radius: number): string => {
    const rad = (deg - 90) * Math.PI / 180
    return `${(Math.cos(rad) * radius).toFixed(2)} ${(Math.sin(rad) * radius).toFixed(2)}`
  }
  const slices = ROULETTE_SLICES.map(([start, end], i) => {
    const large = end - start > 180 ? 1 : 0
    const mid = (start + end) / 2
    const small = end - start < 30
    const [lx, ly] = point(mid, small ? 80 : 64).split(' ')
    return `<path d="M0 0 L${point(start, r)} A${r} ${r} 0 ${large} 1 ${point(end, r)} Z" fill="${ROULETTE_COLORS[i]}" stroke="#3a2e2f" stroke-width="2.5"/>`
      + `<text x="${lx}" y="${ly}" transform="rotate(${mid.toFixed(1)} ${lx} ${ly})" text-anchor="middle" dominant-baseline="middle" font-size="${small ? 11 : 17}" font-weight="800" fill="#3a2e2f">${ROULETTE_PRIZES[i].coins}</text>`
  }).join('')
  return `<svg class="roulette-svg" viewBox="-108 -108 216 216" role="img" aria-label="코인 룰렛"><g class="roulette-wheel">${slices}<circle r="${r}" fill="none" stroke="#3a2e2f" stroke-width="4"/></g><circle r="16" fill="#fff" stroke="#3a2e2f" stroke-width="3"/><text y="1" text-anchor="middle" dominant-baseline="middle" font-size="13">✿</text></svg>`
}
