import type { Mailbox, SuggestBox } from '../game/remoteStore'
import type { Audio } from '../engine/audio'
import { BATTLE_TICK_MS, ENEMY_HP, battlePower, CHARACTERS, DAILY_GIFT, NEW_ENTRY_BONUS, RARE_NEW_BONUS, PULL_OPTIONS, characterById, fullName, type Character, pullCost, STARTING_COINS, ROULETTE_PRIZES, type CharacterId, type PullCount, type PullResult } from '../game/collection'
import { CHARACTER_IMAGE_URLS } from '../game/characterImageUrls'
import { ERROR_TEXT, NICKNAME_RULE, RemoteGachaStore, WEED_MAX, RequestError, type PublicUser, type ExpeditionState, type ProfilePrivacy, MAIL_MAX_CHARS, MAIL_DAILY_COINS, CHAR_SELL_PRICES, DECO_SELL_PRICE, SUGGEST_MAX_CHARS, SUGGEST_REPLY_MAX_CHARS, MAILBOX_MAX } from '../game/remoteStore'
import { weedFieldMarkup } from './weedField'
import { battleFieldMarkup } from './battleField'
import { HouseView, houseLotMarkup, houseVisitMarkup } from './houseView'
import { DECOS, DECO_IMAGE_URLS, DECO_NEW_BONUS, DECO_PROBABILITY, DECO_PULL_OPTIONS, decoById, decoPullCost, type DecoId, type DecoPullCount, type DecoPullResult } from '../game/decos'
import { machineMarkup } from './toonMachine'

const MACHINE_SPIN_SECONDS = 1.35
/** Grades: 일반 · 레어(인어의섬) · 에픽(세이렌·시마지로·아노코·데카츠요) · 유니크(카레·풍뎅이). */
const tierTag = (character: Character): string => character.tier === 'legendary' ? '★ 레전더리' : character.tier === 'super' ? '★ 유니크' : character.tier === 'rare' ? '★ 에픽' : character.tier === 'mermaid' ? '레어' : '노멀'
const bonusTag = (character: Character): string => `${character.weedBonus ? `제초속도 +${character.weedBonus}%<br>` : ''}전투력 ${character.power}`

type Screen = 'boot' | 'auth' | 'nickname' | 'title' | 'collection' | 'decos' | 'result' | 'users' | 'roulette' | 'weed' | 'battle' | 'house' | 'mail' | 'storage' | 'suggest' | 'featured' | 'claw' | 'announcements' | 'global-chat' | 'expedition'
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
  private toastTimer = 0
  private wheelSpinning = false
  private wheelTurn = 0
  private results: RevealItem[] = []
  private resultKind: 'char' | 'deco' = 'char'
  private house!: HouseView
  private userTab: 'char' | 'deco' | 'house' = 'char'
  private mailTab: 'in' | 'sent' = 'in'
  private storageTab: 'char' | 'deco' = 'char'
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
  private clawX = 50
  private clawY = 50
  private clawToys: { id: string; name: string; x: number; y: number }[] = []
  private clawTargetId: string | null = null
  private clawBusy = false
  private expedition: ExpeditionState | null = null
  private expeditionServer = 1
  private expeditionTimer = 0
  private expeditionLoading = false
  private users: PublicUser[] = []
  private privacy: ProfilePrivacy = { char: true, deco: true, house: true }

  constructor(private readonly store: RemoteGachaStore, private readonly audio: Audio, private readonly actions: Actions) {
    this.root.innerHTML = this.template()
    this.root.addEventListener('click', event => { void this.onClick(event) })
    window.setInterval(() => { void this.tickSettle() }, 60_000)
    this.root.querySelector<HTMLFormElement>('.auth-form')?.addEventListener('submit', event => { event.preventDefault(); void this.submitAuth() })
    this.root.querySelector<HTMLFormElement>('.nickname-form')?.addEventListener('submit', event => { event.preventDefault(); void this.submitNickname() })
    this.house = new HouseView(this.root.querySelector<HTMLElement>('.house-screen')!, this.store, { toast: text => this.toast(text), error: error => this.handleError(error), wallet: () => this.renderWallet() })
    this.renderWallet()
    this.renderCollection()
    this.chatBadgeTimer = window.setInterval(() => { if (this.screen === 'title') void this.refreshGlobalChatDot() }, 12000)
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
    this.screen = screen
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
    if (screen === 'expedition') {void this.loadExpedition();this.expeditionTimer=window.setInterval(()=>void this.loadExpedition(),3000)}
    if (screen === 'collection') this.renderCollection()
    if (screen === 'decos') this.renderDecoCollection()
    if (screen === 'claw') { this.restoreClawToys(); this.clawX = 50; this.clawY = 50; this.renderClaw() }
    if (screen === 'mail') void this.loadMail()
    if (screen === 'announcements') void this.loadAnnouncements()
    window.clearInterval(this.chatTimer)
    if (screen === 'global-chat') { void this.loadGlobalChat(); this.chatTimer = window.setInterval(() => void this.loadGlobalChat(true), 4000) }
    if (screen === 'storage') this.renderStorage()
    if (screen === 'suggest') void this.loadSuggest()
    if (screen === 'featured') this.renderFeaturedPicker()
    if (screen === 'house') this.house.open()
    if (screen === 'title') { requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); this.renderWallet(); this.renderCollection(); this.renderHero(); this.refreshMailBadge(); void this.refreshAnnouncementDot(); void this.refreshGlobalChatDot() }
    window.clearInterval(this.weedTimer)
    if (screen === 'weed') { this.renderWeed(); this.weedTimer = window.setInterval(() => this.renderWeedStatus(), 1000) }
    if (screen === 'battle') { this.lastEnemyHp = -1; this.renderBattle(); this.weedTimer = window.setInterval(() => this.renderBattleStatus(), 1000) }
    if (screen === 'nickname') window.setTimeout(() => this.root.querySelector<HTMLInputElement>('#nickname-input')?.focus(), 50)
    if (screen === 'auth') window.setTimeout(() => this.root.querySelector<HTMLInputElement>('#auth-username')?.focus(), 50)
  }

  setBootProgress(progress: number): void {
    const bar = this.root.querySelector<HTMLElement>('.boot-fill')
    const bounded = Math.max(0.05, Math.min(1, progress))
    if (bar) bar.style.transform = `scaleX(${bounded})`
    this.root.querySelector('.boot-track')?.setAttribute('aria-valuenow', String(Math.round(bounded * 100)))
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
          <div class="wallet weed-wallet" aria-label="보유 코인"><span class="coin-icon">✿</span><strong class="wallet-value">${STARTING_COINS}</strong><span>코인</span><small class="wallet-rate" title="제초장 자동 수입 (하우스 코인 제외)"></small></div>
        </header>
        <div class="weed-field">${weedFieldMarkup()}</div>
        <div class="weed-panel">
          <div class="field-info-sticky">
          <p class="weed-status"></p>
          <div class="weed-earn weed-earn-auto"><span><b class="weed-next">--:--</b><small>다음 코인까지</small></span><span><b class="weed-rate">0.00</b><small>제초 코인/시간 · 자동 지급</small></span></div>
          <p class="weed-rule">친구를 최대 3명까지 보낼 수 있어요. 친구마다 1시간에 1코인씩(제초 속도 보너스 적용) 자동으로 지갑에 들어오고, 앱을 닫아도 계속 모여요. 제초 중인 친구를 다시 누르면 쉬게 해요.</p>
          </div>
          <div class="weed-beetle-slot" hidden></div>
          <div class="weed-picker" role="list" aria-label="제초할 친구 고르기"></div>
        </div>
        <div class="toast weed-toast" aria-live="polite"></div>
      </section>
      <section class="weed-screen battle-screen" data-screen="battle" aria-hidden="true" aria-labelledby="battle-title">
        <header class="weed-header">
          <button class="weed-back" data-action="close">← 가챠로</button>
          <b id="battle-title">토벌장</b>
          <div class="battle-wallet-stack"><div class="diamond-wallet battle-diamond-wallet" aria-label="보유 다이아"><span>💎</span><strong class="diamond-value">0</strong><span>다이아</span></div><small class="battle-hourly-rate" aria-live="polite">0.00개/시간</small></div>
        </header>
        <div class="battle-field">${battleFieldMarkup()}</div>
        <div class="weed-panel battle-panel">
          <div class="field-info-sticky">
          <p class="battle-reward-hint">💎 몬스터 1마리 처치 시 다이아 1개! 보관함에 자동 지급돼요.</p>
          <p class="battle-status"></p>
          
          <div class="weed-earn battle-earn"><span><b class="battle-hp">${ENEMY_HP}</b><small>몬스터 체력</small></span><span><b class="battle-next">--:--</b><small>다음 공격까지</small></span><span><b class="battle-kills">0</b><small>처치까지 공격</small></span></div>
          <p class="weed-rule">몬스터 체력은 ${ENEMY_HP}이에요. 5분마다 친구의 전투력만큼 공격하고, 몬스터를 물리치면 다이아 1개가 인벤토리에 자동 지급돼요. 앱을 닫아도 계속 싸워요.</p>
                    </div>
          <div class="weed-picker battle-picker" role="list" aria-label="토벌할 친구 고르기"></div>
        </div>
        <div class="toast battle-toast" aria-live="polite"></div>
      </section>
      <section class="weed-screen house-screen" data-screen="house" aria-hidden="true" aria-labelledby="house-title">
        <header class="weed-header">
          <button class="weed-back" data-action="close">← 가챠로</button>
          <b id="house-title">하우스</b>
          <div class="wallet weed-wallet" aria-label="보유 코인"><span class="coin-icon">✿</span><strong class="wallet-value">${STARTING_COINS}</strong><span>코인</span><small class="wallet-rate" title="제초장 자동 수입 (하우스 코인 제외)"></small></div>
        </header>
        <div class="house-scroll-viewport" aria-label="세로형 하우스 꾸미기 영역"><div class="house-lot">${houseLotMarkup()}<div class="house-items"></div><button type="button" class="house-coin" data-action="house-coin" hidden aria-label="코인 줍기"><span class="house-coin-face">✿</span><b class="house-coin-amount"></b></button><span class="house-coin-timer" aria-live="polite"></span><p class="house-empty">텅 빈 공터예요. 아래에서 데코를 꺼내 꾸며 보세요!</p></div></div>
        <div class="house-tools" hidden><b class="house-tools-name"></b><button data-action="house-flip">↔ 뒤집기</button><button data-action="house-smaller">－ 작게</button><button data-action="house-bigger">＋ 크게</button><button data-action="house-remove">넣기</button><button data-action="house-done">완료</button></div>
        <div class="weed-panel house-panel">
          <div class="field-info-sticky">
          <div class="house-panel-head"><div class="auth-tabs house-tabs" role="tablist"><button type="button" class="auth-tab is-active" data-action="house-tab" data-tab="deco" role="tab" aria-selected="true">🎀 데코</button><button type="button" class="auth-tab" data-action="house-tab" data-tab="friend" role="tab" aria-selected="false">🐾 친구 3명</button></div><span class="house-meta"><b class="house-count">0 / 20</b> · <span class="house-save">자동 저장</span></span></div>
          <p class="weed-rule">데코를 눌러 공터에 꺼내고, 끌어서 옮겨요. 놓인 데코를 누르면 뒤집기·크기·넣기를 할 수 있어요.</p>
                    </div>
          <div class="house-inventory" role="list" aria-label="꺼낼 데코"></div>
        </div>
        <div class="toast house-toast" aria-live="polite"></div>
      </section>
      <section class="weed-screen expedition-screen" data-screen="expedition" aria-hidden="true">
        <header class="weed-header"><button class="weed-back" data-action="close">← 가챠로</button><b><img class="expedition-heading-weapon" src="/assets/decos/d01.png" alt=""/> 원정대</b><small>매일 오전 9시 갱신</small></header>
        <div class="expedition-server-tabs"><button data-action="exp-server" data-id="1">1서버</button><button data-action="exp-server" data-id="2">2서버</button><button data-action="exp-server" data-id="3">3서버</button></div>
        <div class="expedition-cave"><div class="expedition-hp-label">보스 체력 <b class="exp-hp">10,000,000</b> / 10,000,000</div><div class="expedition-hp-track"><div class="expedition-hp-fill"></div><span class="expedition-hp-percent">100%</span></div><div class="expedition-party"></div><img class="expedition-boss" src="/expedition_boss.png" alt="원정대 보스" /></div>
        <div class="expedition-details"><p class="expedition-status">원정대 정보를 불러오는 중…</p><div class="expedition-members"></div><div class="expedition-picker"></div><p class="expedition-help">서버당 10명 · 1인 1서버 · 같은 서버에서 캐릭터 변경 가능 · 처치 시 참여자 우편함으로 500코인 보상 · 매일 오전 9시 새 보스</p></div>
        <div class="toast expedition-toast" aria-live="polite"></div>
      </section>
      <main class="gacha-screen" data-screen="title" aria-hidden="true">
        <header class="gacha-header">
          <div class="brand"><span class="brand-icon"><img src="/assets/chars/hachiware_face.png" alt="하치와레 얼굴" /></span><div><b>겅이마켓</b><small>오늘의 작은 행운을 뽑아봐요</small></div></div>
          <div class="header-right"><div class="account-chip"><span class="account-name"></span><button class="logout-button" data-action="logout">로그아웃</button></div><div class="wallet" aria-label="보유 코인"><span class="coin-icon">✿</span><strong class="wallet-value">${STARTING_COINS}</strong><span>코인</span><small class="wallet-rate" title="제초장 자동 수입 (하우스 코인 제외)"></small></div><div class="diamond-wallet" aria-label="보유 다이아"><span>💎</span><strong class="diamond-value">0</strong><span>다이아</span></div></div>
        </header>
        <div class="top-rewards" aria-label="오늘의 보상"><button class="reward-chip daily-button" data-action="daily"><span class="reward-icon">🎁</span><span><b>출석 체크</b><small class="daily-copy">+${DAILY_GIFT} 코인</small></span></button><button class="reward-chip roulette-chip" data-action="roulette"><span class="reward-icon">🎡</span><span><b>룰렛</b><small class="roulette-copy">12시간마다 1회</small></span></button></div>
        <button class="profile-chip" data-action="featured" aria-label="내 프로필 열기"><span class="profile-avatar"><img alt="" /></span><span class="profile-text"><b class="profile-name">내 프로필</b><small>대표 · 우편함</small></span><i class="mail-badge" hidden>0</i></button>
        <button class="expedition-entry" data-action="expedition"><img src="/expedition_banner.jpg" alt="원정대"/><span class="expedition-entry-label"><img class="expedition-weapon" src="/assets/decos/d01.png" alt=""/>원정대</span></button>
        <nav class="gacha-nav" aria-label="이동"><button class="nav-button nav-announcements" data-action="announcements"><span class="chiikawa-tab-icon"><img src="/assets/chars/chiikawa_tab_icon.png" alt="" /></span>공지사항<i class="announcement-dot" hidden></i></button><button class="nav-button nav-global-chat" data-action="global-chat"><span class="chiikawa-tab-icon"><img src="/assets/chars/chiikawa_tab_icon.png" alt="" /></span>전체채팅<i class="global-chat-dot" hidden></i></button><button class="nav-button nav-users" data-action="users"><span class="chiikawa-tab-icon"><img src="/assets/chars/chiikawa_tab_icon.png" alt="" /></span>유저 목록</button><button class="nav-button nav-weed" data-action="weed"><span class="chiikawa-tab-icon"><img src="/assets/chars/chiikawa_tab_icon.png" alt="" /></span>제초장</button><button class="nav-button nav-battle" data-action="battle"><span class="chiikawa-tab-icon"><img src="/assets/chars/chiikawa_tab_icon.png" alt="" /></span>토벌장</button><button class="nav-button nav-house" data-action="house"><span class="chiikawa-tab-icon"><img src="/assets/chars/chiikawa_tab_icon.png" alt="" /></span>하우스</button><button class="nav-button nav-claw" data-action="claw"><span class="chiikawa-tab-icon"><img src="/assets/chars/usagi_face_claw.png" alt="" /></span>데코&amp;무기 인형뽑기</button></nav>
        <section class="toon-stage" aria-label="가챠 무대">
          <div class="toon-machine">${machineMarkup()}</div>
          <i class="toon-floor"></i>
          <div class="toon-hero"><img class="toon-hero-img" alt="" /></div>
          <span class="toon-hero-name"></span>
          <i class="toon-capsule"></i>
        </section>
        <aside class="collection-peek"><span class="peek-flowers">✿　✿　✿</span><b class="collection-count">0 / ${CHARACTERS.length}</b><small>도감 수집</small><button class="soft-button" data-action="collection">캐릭터 도감</button><b class="deco-count">0 / ${DECOS.length}</b><button class="soft-button" data-action="decos">데코 도감</button></aside>
        <footer class="gacha-actions">
          <div class="pull-mode" role="tablist" aria-label="뽑기 종류"><button type="button" class="pull-mode-button is-active" data-action="mode" data-mode="char" role="tab" aria-selected="true"><img class="chiikawa-pull-icon" src="/assets/chars/chiikawa_tab_icon.png" alt="" /> 캐릭터 뽑기</button><button type="button" class="pull-mode-button" data-action="mode" data-mode="deco" role="tab" aria-selected="false"><img class="chiikawa-pull-icon" src="/assets/chars/chiikawa_tab_icon.png" alt="" /> 데코 뽑기</button></div>
          ${DECO_PULL_OPTIONS.map(option => `<button class="pull-button deco-pull pull-${option.count}" data-action="deco-pull" data-count="${option.count}"><span><b>${option.count === 1 ? '🎀 데코 1회' : `데코 ${option.count}회`}</b><small>${option.cost} 코인${option.count === 10 ? ' · 할인' : ''}</small></span></button>`).join('')}
          ${PULL_OPTIONS.map(option => `<button class="pull-button pull-${option.count}" data-action="pull" data-count="${option.count}"><span><b>${option.count === 1 ? '✦ 한 번 뽑기' : `${option.count}회 뽑기`}</b><small>${option.cost} 코인${option.count === 10 ? ' · 할인' : ''}</small></span></button>`).join('')}
        </footer>
        <div class="free-note">이 게임의 모든 뽑기는 게임 속 무료 코인으로 즐길 수 있어요.</div>
        <div class="toast" aria-live="polite"></div>
      </main>
      <div class="insufficient-overlay" hidden role="alertdialog" aria-modal="true" aria-labelledby="insufficient-title" aria-describedby="insufficient-message">
        <div class="insufficient-card">
          <span class="insufficient-icon" aria-hidden="true">🪙</span>
          <h2 id="insufficient-title">코인이 부족해요!</h2>
          <p id="insufficient-message"></p>
          <button type="button" data-action="insufficient-close" class="insufficient-close">확인</button>
        </div>
      </div>
      <section class="gacha-modal" data-screen="collection" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="collection-title">
        <div class="modal-card collection-card">
          <button class="modal-close" data-action="close" aria-label="닫기">×</button>
          <div class="collection-info-sticky"><div class="modal-kicker">YOUR LITTLE FRIENDS</div><h2 id="collection-title">캐릭터 도감</h2>
          <p class="collection-summary">총 37종 · 노멀 71.86% · 레어 22.00% · 에픽 4.25% · 유니크 1.84% · 레전더리 0.05%</p></div>
          <div class="collection-grid"></div>
          <div class="duplicate-note">새 친구 등록 +${NEW_ENTRY_BONUS}코인 · 에픽·유니크 친구 +${RARE_NEW_BONUS}코인 · 중복은 코인 없음</div>
          <button class="modal-primary" data-action="close">가챠로 돌아가기</button>
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
          <p class="collection-summary">데코 ${DECOS.length}종 · 모두 같은 확률(각 ${DECO_PROBABILITY}%)</p></div>
          <div class="collection-grid deco-grid"></div>
          <div class="duplicate-note">새 데코 등록 +${DECO_NEW_BONUS}코인 · 중복 데코는 하우스에 하나 더 놓을 수 있어요</div>
          <button class="modal-primary" data-action="house">🏠 하우스 꾸미러 가기</button>
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
          <div class="global-chat-compose"><input class="global-chat-input" maxlength="60" placeholder="메시지 입력 (최대 30자)" aria-label="전체채팅 메시지" /><button class="modal-primary" data-action="global-chat-send">전송</button></div>
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
          <h2 id="claw-title"><img class="claw-title-usagi" src="/assets/chars/usagi_face_claw.png" alt="우사기" /> 데코&amp;무기 인형뽑기</h2>
          <p class="claw-desc">💎 1회 1다이아 · 성공하면 데코 1개가 보관함에 자동 지급!</p>
          <p class="claw-balance">보유 💎 <strong class="diamond-value">0</strong>개 · 집게를 인형 위로 이동해 잡아보세요!</p>
          <button class="claw-refresh" data-action="claw-refresh">🔄 인형 위치 새로고침 · 💎 2개</button>
          <div class="claw-machine" aria-label="집게를 이동하고 뽑기 버튼을 누르세요">
            <div class="claw-arm"><div class="claw-wire"></div><div class="claw-head">✦</div></div>
            <div class="claw-toys"></div><div class="claw-chute">출구 ↓</div><div class="claw-prize"></div>
          </div>
          <div class="claw-controls"><div class="claw-arrows"><button data-action="claw-up" aria-label="위">▲</button><div><button data-action="claw-left" aria-label="왼쪽">◀</button><button data-action="claw-down" aria-label="아래">▼</button><button data-action="claw-right" aria-label="오른쪽">▶</button></div></div><button class="claw-play" data-action="claw-play">🕹️ 뽑기!<small>💎 1개</small></button></div>
          <p class="claw-message" aria-live="polite">집게를 움직인 후 뽑기 버튼을 눌러주세요.</p>
        </div>
      </section>
      <section class="gacha-modal" data-screen="storage" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="storage-title">
        <div class="modal-card collection-card storage-card">
          <button class="modal-close" data-action="close" aria-label="닫기">×</button>
          <div class="modal-kicker">STORAGE</div><h2 id="storage-title">보관함</h2><div class="storage-diamonds" aria-label="인벤토리 다이아">💎 다이아 <strong class="diamond-value">0</strong>개</div>
          <div class="auth-tabs user-tabs" role="tablist"><button class="auth-tab is-active" data-action="storage-tab" data-tab="char" role="tab">🧸 캐릭터</button><button class="auth-tab" data-action="storage-tab" data-tab="deco" role="tab">🌸 데코</button></div>
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
          <div class="profile-actions"><button class="modal-primary profile-mail" data-action="mail">📮 우편함 <i class="mail-badge" hidden>0</i></button><button class="modal-secondary" data-action="users">✉ 우편 보내기</button><button class="modal-secondary admin-broadcast-entry" data-action="admin-broadcast" hidden>📢 전체 편지·코인 발송</button><button class="modal-secondary" data-action="storage">🎒 보관함</button><button class="modal-secondary" data-action="suggest">💌 건의함</button><button class="modal-secondary" data-action="privacy">🔒 공개 설정</button></div>
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

  private async onClick(event: MouseEvent): Promise<void> {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')
    const action = button?.dataset.action
    if (!action) return
    this.audio.unlock()
    this.audio.play('ui')
    if (action === 'insufficient-close') { this.closeInsufficient(); return }
    if (action === 'claw') { this.show('claw'); return }
    if (action?.startsWith('claw-')) { await this.handleClaw(action); return }
    if (action === 'collection') { this.show('collection'); return }
    if (action === 'decos') { this.show('decos'); return }
    if (action === 'house') { this.show('house'); return }
    if (action === 'expedition') {this.expeditionServer=1;this.expedition=null;this.show('expedition');return}
    if (action === 'exp-server') {this.expeditionServer=Number(button.dataset.id)||1;if(this.expedition)this.renderExpedition();return}
    if (action === 'exp-join' && button.dataset.id) {try{await this.store.joinExpedition(this.expeditionServer,button.dataset.id as CharacterId);this.toast('원정대 캐릭터 배치를 저장했어요!');await this.loadExpedition()}catch(e){this.handleError(e)}return}
    if (action === 'mode') { this.setPullMode(button.dataset.mode === 'deco' ? 'deco' : 'char'); return }
    if (action.startsWith('house-') && this.house.handle(action, button)) return
    if (action === 'user-tab' && button.dataset.nickname) { this.userTab = button.dataset.tab === 'deco' ? 'deco' : button.dataset.tab === 'house' ? 'house' : 'char'; this.renderUserDetail(button.dataset.nickname); return }
    if (action === 'weed') { this.show('weed'); return }
    if (action === 'battle') { this.show('battle'); void this.syncBattle(); return }
    if (action === 'announcements') { this.show('announcements'); return }
    if (action === 'global-chat') { this.show('global-chat'); return }
    if (action === 'global-chat-send') { await this.sendGlobalChat(); return }
    if (action === 'announcement-send') { await this.sendAnnouncement(); return }
    if (action === 'privacy') { await this.openPrivacy(); return }
    if (action === 'privacy-save') { await this.savePrivacy(); return }
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
    if (action === 'storage-tab' && button.dataset.tab) { this.storageTab = button.dataset.tab === 'deco' ? 'deco' : 'char'; this.renderStorage(); return }
    if (action === 'sell' && button.dataset.id && button.dataset.kind) { await this.sell(button.dataset.kind === 'deco' ? 'deco' : 'char', button.dataset.id, Number(button.dataset.count) || 1, button); return }
    if (action === 'suggest-reply' && button.dataset.id) { await this.replySuggestion(Number(button.dataset.id)); return }
    if (action === 'suggest-delete' && button.dataset.id) { await this.deleteSuggestion(Number(button.dataset.id)); return }
    if (action === 'mail-claim' && button.dataset.id) { await this.claimMail(Number(button.dataset.id)); return }
    if (action === 'mail-compose' && button.dataset.nickname) { await this.renderCompose(button.dataset.nickname); return }
    if (action === 'mail-send' && button.dataset.nickname) { await this.sendMail(button.dataset.nickname); return }
    if (action === 'user-list') { this.renderUsers(); return }
    if (action === 'user-view' && button.dataset.nickname) { this.userTab = 'char'; this.renderUserDetail(button.dataset.nickname); return }
    if (action === 'close') { this.show('title'); return }
    if (action === 'result-collection') { this.show(this.resultKind === 'deco' ? 'decos' : 'collection'); return }
    if (action === 'retry') { this.actions.retry(); return }
    if (action === 'auth-login' || action === 'auth-register') { this.setAuthMode(action === 'auth-login' ? 'login' : 'register'); return }
    if (action === 'logout') {
      try { await this.store.logout() } catch { /* The session is cleared locally either way. */ }
      this.setAuthMode('login')
      this.show('auth')
      return
    }
    if (this.busy) return
    if (action === 'roulette') { this.show('roulette'); this.renderWallet(); return }
    if (action === 'roulette-spin') { await this.spinRoulette(); return }
    if (action === 'daily') {
      this.busy = true
      try {
        if (await this.store.claimDaily()) {
          this.audio.play('pickup')
          this.toast(`출석 완료! ${DAILY_GIFT}코인을 받았어요.`)
        } else this.toast('오늘은 이미 출석했어요.')
      } catch (error) { this.handleError(error) } finally { this.busy = false }
      this.renderWallet()
      return
    }
    if (action === 'pull') {
      const count = Number(button.dataset.count) as PullCount
      if (!PULL_OPTIONS.some(option => option.count === count)) return
      const cost = pullCost(count)
      if (!this.isAdmin && this.store.data.gems < cost) { this.showInsufficient(cost); return }
      this.busy = true
      this.revealing = true
      this.renderWallet()
      let result: PullResult[]
      try { result = await this.store.pull(count) } catch (error) {
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
      this.renderResults()
      window.setTimeout(() => { void this.playPops(this.results, sequence) }, Math.max(0.5, duration) * 1000 + 160)
      return
    }
    if (action === 'deco-pull') {
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
      window.setTimeout(() => { void this.playPops(this.results, sequence) }, Math.max(0.5, duration) * 1000 + 160)
      return
    }
    if (action === 'weed-pick' && button.dataset.id) {
      const id = button.dataset.id as CharacterId
      const name = fullName(characterById(id))
      const leaving = this.store.isWeeding(id)
      if (!leaving && (this.store.battle?.id === id || this.store.battle?.secondId === id)) { this.toast(ERROR_TEXT.busy_battle); return }
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
    if (action === 'battle-pick' && button.dataset.id) {
      const id = button.dataset.id as CharacterId
      if (this.weedBusy(id)) { this.toast(ERROR_TEXT.busy_weed); return }
      this.busy = true
      try {
        const wasDeployed = this.store.battle?.id === id || this.store.battle?.secondId === id
        const earned = await this.store.startBattle(id)
        const name = fullName(characterById(id))
        if (wasDeployed) {
          this.toast(earned > 0 ? `${withJosa(name, '이', '가')} 토벌에서 돌아왔어요! · 처치 보상 다이아 +${earned}개` : `${withJosa(name, '이', '가')} 토벌에서 돌아왔어요!`)
        } else {
          this.toast(earned > 0 ? `몬스터 ${earned}마리 처치 보상 다이아 ${earned}개! ${withJosa(name, '이', '가')} 토벌에 나섰어요!` : `${withJosa(name, '이', '가')} 토벌에 나섰어요! (전투력 ${battlePower(id)})`)
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

  private get clawStorageKey(): string { return `geongi-claw-v1-${this.store.user?.username ?? 'guest'}` }

  private restoreClawToys(): void {
    if (this.clawToys.length) return
    try {
      const raw = window.localStorage.getItem(this.clawStorageKey)
      if (raw) {
        const saved: unknown = JSON.parse(raw)
        if (Array.isArray(saved) && saved.length === 3 && saved.every((t: any) =>
          ['chiikawa','hachiware','usagi'].includes(t?.id) &&
          typeof t.x === 'number' && Number.isFinite(t.x) && t.x >= 0 && t.x <= 100 &&
          typeof t.y === 'number' && Number.isFinite(t.y) && t.y >= 0 && t.y <= 100)) {
          this.clawToys = saved as typeof this.clawToys
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
      { id: 'chiikawa', name: '치이카와' },
      { id: 'hachiware', name: '하치와레' },
      { id: 'usagi', name: '우사기' },
    ]
    if (!this.clawToys.length) this.clawToys = types.map(type => ({ ...type, x: 0, y: 0 }))
    for (const toy of this.clawToys) {
      if (id && toy.id !== id) continue
      let x = 18, y = 28
      for (let attempt = 0; attempt < 80; attempt++) {
        x = 16 + Math.random() * 68
        y = 24 + Math.random() * 57
        if (this.clawToys.every(other => other === toy || other.id === id || Math.hypot(other.x - x, other.y - y) >= 21)) break
      }
      toy.x = x; toy.y = y
    }
    this.saveClawToys()
  }

  private clawTouchesToy(): boolean {
    this.clawTargetId = null
    const head = this.root.querySelector<HTMLElement>('.claw-head')
    if (!head) return false
    const a = head.getBoundingClientRect()
    let nearest = Infinity
    this.root.querySelectorAll<HTMLElement>('.claw-single-toy').forEach(toy => {
      const b = toy.getBoundingClientRect()
      if (a.left >= b.right || a.right <= b.left || a.top >= b.bottom || a.bottom <= b.top) return
      const dist = Math.hypot((a.left+a.right-b.left-b.right)/2,(a.top+a.bottom-b.top-b.bottom)/2)
      if (dist < nearest) { nearest = dist; this.clawTargetId = toy.dataset.toyId ?? null }
    })
    return this.clawTargetId !== null
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
    this.updateClawPosition()
  }

  private renderClaw(): void {
    this.renderWallet()
    if (!this.clawToys.length) this.randomizeClawToy()
    const toys = this.root.querySelector<HTMLElement>('.claw-toys')
    if (toys) toys.innerHTML = this.clawToys.map(toy =>
      `<img class="claw-single-toy" data-toy-id="${toy.id}" src="/assets/chars/${toy.id}_face_claw.png" alt="${toy.name} 얼굴 인형" style="left:${toy.x}%;top:${toy.y}%"/>`
    ).join('')
    const prizeEl = this.root.querySelector<HTMLElement>('.claw-prize')
    if (prizeEl) { prizeEl.innerHTML = ''; prizeEl.classList.remove('is-delivered') }
    const msg = this.root.querySelector<HTMLElement>('.claw-message')
    if (msg) msg.textContent = '집게를 원하는 인형 위치로 움직여 뽑아보세요. 세 인형 모두 같은 확률과 보상이 적용돼요.'
    this.updateClawPosition()
  }

  private updateClawPosition(): void {
    const arm = this.root.querySelector<HTMLElement>('.claw-arm')
    if (arm) { arm.style.left = `${this.clawX}%`; arm.style.top = `${this.clawY}%` }
  }

  private async handleClaw(action: string): Promise<void> {
    if (this.clawBusy) return
    const directions: Record<string, [number, number]> = { 'claw-up':[0,-7], 'claw-down':[0,7], 'claw-left':[-7,0], 'claw-right':[7,0] }
    if (directions[action]) {
      const [dx,dy] = directions[action]
      this.clawX = Math.max(10,Math.min(90,this.clawX+dx))
      this.clawY = Math.max(10,Math.min(90,this.clawY+dy))
      this.updateClawPosition()
      return
    }
    if (action === 'claw-refresh') {
      this.clawBusy = true
      const refresh = this.root.querySelector<HTMLButtonElement>('.claw-refresh')
      if(refresh)refresh.disabled=true
      try {
        await this.store.refreshClaw()
        this.randomizeClawToy()
        this.clawX=50; this.clawY=50
        this.renderClaw()
        this.renderWallet()
        this.toast('💎 1개를 사용해 인형 위치를 새로 배치했어요!')
      } catch(error) { this.handleError(error) }
      finally {this.clawBusy=false;if(refresh)refresh.disabled=false}
      return
    }
    if (action !== 'claw-play') return
    this.clawBusy = true
    const btn = this.root.querySelector<HTMLButtonElement>('.claw-play')
    const arm = this.root.querySelector<HTMLElement>('.claw-arm')
    const prizeEl = this.root.querySelector<HTMLElement>('.claw-prize')
    const msg = this.root.querySelector<HTMLElement>('.claw-message')
    if (btn) btn.disabled = true
    let wonToy = false
    try {
      const aligned = this.clawTouchesToy()
      const toy = this.clawTargetId ? this.root.querySelector<HTMLElement>(`.claw-single-toy[data-toy-id="${this.clawTargetId}"]`) : null
      const originalToy = this.clawToys.find(item => item.id === this.clawTargetId)
      const previousDecos = { ...this.store.decos }
      const result = await this.store.playClaw(aligned, originalToy?.x ?? 50, originalToy?.y ?? 50)
      this.renderWallet()
      if (msg) msg.textContent = aligned ? '집게가 인형을 잡고 들어 올립니다…' : '집게가 허공을 잡았어요! 인형에 닿도록 이동해주세요.'
      arm?.classList.add('is-dropping')
      await new Promise(resolve => window.setTimeout(resolve, 700))
      arm?.classList.remove('is-dropping')
      if (aligned) toy?.classList.add('is-lifted')
      await new Promise(resolve => window.setTimeout(resolve, aligned ? 650 : 250))
      if (aligned && toy) {
        // Keep the plush attached to the claw during the entire trip to the exit.
        // Derive the exit center from the actual rendered chute, including mobile layouts.
        const machine = this.root.querySelector<HTMLElement>('.claw-machine')
        const chute = this.root.querySelector<HTMLElement>('.claw-chute')
        let exitX = 88
        let exitY = 15
        if (machine && chute) {
          const m = machine.getBoundingClientRect()
          const c = chute.getBoundingClientRect()
          if (m.width > 0 && m.height > 0) {
            exitX = Math.max(0, Math.min(100, (c.left + c.width / 2 - m.left) / m.width * 100))
            exitY = Math.max(0, Math.min(100, (c.top + c.height / 2 - m.top) / m.height * 100))
          }
        }
        if (msg) msg.textContent = '인형을 집었어요! 출구까지 잘 버틸까요?'
        const steps = Math.max(1, result.segments)
        const startX = originalToy?.x ?? this.clawX
        const startY = originalToy?.y ?? this.clawY
        const endStep = result.won ? steps : Math.max(1, result.dropAt)
        for (let step = 1; step <= endStep; step++) {
          const fraction = step / steps
          const px = startX + (exitX - startX) * fraction
          const py = startY + (exitY - startY) * fraction
          if (arm) { arm.style.transition = 'left .28s linear, top .28s linear'; arm.style.left = `${px}%`; arm.style.top = `${py}%` }
          toy.style.transition = 'left .28s linear, top .28s linear, transform .3s, opacity .3s'
          toy.style.left = `${px}%`; toy.style.top = `${py}%`
          await new Promise(resolve => window.setTimeout(resolve, 310))
        }
        if (!result.won) {
          if (msg) msg.textContent = '이동 중 인형이 떨어졌어요! 출구 가까이 있는 인형이 더 유리해요.'
          toy.classList.add('is-dropped')
          await new Promise(resolve => window.setTimeout(resolve, 450))
          toy.classList.remove('is-lifted', 'is-dropped')
          toy.style.transition = 'none'
          toy.style.left = `${originalToy?.x ?? 50}%`
          toy.style.top = `${originalToy?.y ?? 50}%`
          void toy.offsetWidth
          toy.style.removeProperty('transition')
        }
      }
      if (result.won && result.prize) {
        wonToy = true
        // Only release the doll once both claw and doll have reached the exit.
        toy?.classList.add('is-dropped')
        await new Promise(resolve => window.setTimeout(resolve, 520))
        const deco = DECOS.find(item => item.id === result.prize)
        if (deco && prizeEl) {
          prizeEl.innerHTML = `<img src="${DECO_IMAGE_URLS[deco.id]}" alt="${deco.name}"/>`
          prizeEl.classList.remove('is-delivered'); void prizeEl.offsetWidth
          prizeEl.classList.add('is-delivered')
        }
        const earnedText = `🎉 ${deco?.name ?? '데코 아이템'} 획득! 보관함에 저장됐어요!`
        if (msg) msg.textContent = earnedText
        this.toast(earnedText)
        // Show the same capsule-style reveal as normal deco pulls, without
        // switching screens or leaving a permanent result panel behind.
        if (deco) {
          const duplicate = (previousDecos[deco.id] ?? 0) > 0
          const reveal = this.decoReveal({ id: deco.id, duplicate, bonus: 0 })
          reveal.tag = duplicate ? '중복 획득! · 보관함에 1개 추가' : '새로운 데코 발견! · 보관함에 저장'
          this.popReveal(reveal, 0, 1)
          const revealNode = this.root.querySelector<HTMLElement>('.pop-reveal')
          const dismiss = () => { window.clearTimeout(hideTimer); this.hidePop(); revealNode?.removeEventListener('pointerdown', dismiss) }
          const hideTimer = window.setTimeout(dismiss, 2200)
          revealNode?.addEventListener('pointerdown', dismiss, { once: true })
        }
        window.setTimeout(() => {
          if (prizeEl) { prizeEl.innerHTML = ''; prizeEl.classList.remove('is-delivered') }
          if (msg && msg.textContent === earnedText) msg.textContent = '집게를 인형 위치로 움직여 뽑아보세요.'
        }, 2300)
      } else {
        if (false) {
          toy?.classList.add('is-dropped')
          await new Promise(resolve => window.setTimeout(resolve, 500))
          // A failed grab returns the doll to its ORIGINAL location.
          if (toy) {
            toy.classList.remove('is-lifted', 'is-dropped')
            toy.style.transition = 'none'
            toy.style.left = `${originalToy?.x ?? 50}%`
            toy.style.top = `${originalToy?.y ?? 50}%`
            void toy.offsetWidth
            toy.style.removeProperty('transition')
          }
        }
        if (msg && !aligned) msg.textContent = '허공이라 인형을 잡지 못했어요!'
      }
    } catch (error) { this.handleError(error) }
    finally {
      // Only a successful win generates a new position. Failures keep the original.
      if (wonToy) this.respawnClawToy()
      this.clawBusy=false
      if(btn) btn.disabled=false
    }
  }

  private renderWallet(): void {
    this.root.querySelectorAll<HTMLElement>('.wallet-value').forEach(balance => { balance.textContent = this.isAdmin ? '∞' : this.store.data.gems.toLocaleString('ko-KR') })
    this.root.querySelectorAll<HTMLElement>('.diamond-value').forEach(balance => { balance.textContent = (this.isAdmin ? '∞' : (this.store.data.diamonds ?? 0).toLocaleString('ko-KR')) })
    const rate = `+${this.store.hourlyRate().toFixed(2)} 코인/시간`
    this.root.querySelectorAll<HTMLElement>('.wallet-rate').forEach(node => { node.textContent = rate })
    const count = this.store.data.owned.length
    const collectionCount = this.root.querySelector<HTMLElement>('.collection-count')
    if (collectionCount) collectionCount.textContent = `${count} / ${CHARACTERS.length}`
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const alreadyClaimed = this.store.data.lastDaily === today
    const name = this.root.querySelector<HTMLElement>('.account-name')
    if (name) name.textContent = this.store.user ? `${this.isAdmin ? '👑 운영자 · ' : ''}${this.store.user.nickname ?? this.store.user.username} 님` : ''
    const daily = this.root.querySelector<HTMLButtonElement>('[data-action="daily"]')
    if (daily) {
      daily.disabled = alreadyClaimed
      daily.classList.toggle('is-used', alreadyClaimed)
      const dailyLabel = daily.querySelector<HTMLElement>('b')
      if (dailyLabel) dailyLabel.textContent = alreadyClaimed ? '출석 완료 ✓' : '출석 체크'
      const copy = daily.querySelector<HTMLElement>('.daily-copy')
      if (copy) copy.textContent = alreadyClaimed ? '수령 완료 · 내일 다시' : `+${DAILY_GIFT} 코인 받기`
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
      pullButton.disabled = this.revealing || (!this.isAdmin && this.store.data.gems < pullCost(Number(pullButton.dataset.count) as PullCount))
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
    return [...CHARACTERS].sort((a,b) => ({normal:0,mermaid:1,rare:2,super:3,legendary:4}[a.tier] - {normal:0,mermaid:1,rare:2,super:3,legendary:4}[b.tier])).map(character => {
      const has = owned.includes(character.id)
      const isFeatured = has && character.id === this.heroId()
      const footer = has && interactive
        ? isFeatured ? `<button class="friend-select is-selected" disabled aria-disabled="true">✓ 대표 설정됨</button>` : `<button class="friend-select" data-action="choose" data-id="${character.id}">대표로 세우기</button>`
        : `<span class="friend-lock">${has ? '도감 등록' : '미발견'}</span>`
      return `<article class="friend-card ${has ? 'is-owned' : 'is-locked'}${character.tier === 'rare' || character.tier === 'super' || character.tier === 'legendary' ? ' is-rare' : ''}${character.tier === 'super' ? ' is-super' : ''}${character.tier === 'legendary' ? ' is-legendary' : ''}${character.tier === 'mermaid' ? ' is-mermaid' : ''}" style="--friend:${character.color};--accent:${character.accent}">
        <div class="friend-avatar">${has ? `<img src="${CHARACTER_IMAGE_URLS[character.id]}" alt="${fullName(character)}" loading="lazy" />` : '<span class="friend-unknown" aria-label="아직 모르는 친구">?</span>'}</div>
        <div class="friend-chance">${tierTag(character)}</div>
        <b>${has ? character.name : '???'}</b><div class="friend-variant-slot">${character.variant ? `<em class="friend-variant">${character.variant}</em>` : ''}</div><div class="friend-bonus-slot">${bonusTag(character) ? `<em class="friend-bonus">${bonusTag(character)}</em>` : ''}</div>
        <small>${has ? '도감에 등록됐어요' : '아직 만나지 못했어요'}</small>
        ${footer}
      </article>`
    }).join('')
  }

  private setPullMode(mode: 'char' | 'deco'): void {
    this.root.querySelector('.gacha-actions')?.classList.toggle('is-deco', mode === 'deco')
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
        <div class="friend-avatar">${has ? `<img src="${DECO_IMAGE_URLS[deco.id]}" alt="${deco.name}" loading="lazy" />` : '<span class="friend-unknown" aria-label="아직 모르는 데코">?</span>'}</div>
        <div class="friend-chance">데코 · ${DECO_PROBABILITY}%</div>
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
      <label><input type="checkbox" data-privacy="house" ${this.privacy.house ? 'checked' : ''}/> 마이홈 공개</label></div>
      <div class="privacy-save-actions"><button class="modal-primary" data-action="privacy-save">설정 저장</button><button class="modal-secondary" data-action="featured">취소하고 내 프로필로</button></div>`
  }

  private async savePrivacy(): Promise<void> {
    const privacy = Object.fromEntries(['char','deco','house'].map(k => [k, Boolean(this.root.querySelector<HTMLInputElement>(`[data-privacy="${k}"]`)?.checked)])) as ProfilePrivacy
    try { this.privacy = await this.store.setProfilePrivacy(privacy); this.root.querySelector('.users-card')?.classList.remove('privacy-mode'); this.show('featured'); this.toast('공개 설정을 저장했어요.') }
    catch (error) { this.handleError(error) }
  }

  private renderUsers(): void {
    const body = this.root.querySelector<HTMLElement>('.users-body')
    if (!body) return
    if (!this.users.length) { body.innerHTML = '<p class="users-empty">아직 닉네임을 정한 유저가 없어요.</p>'; return }
    body.innerHTML = `<p class="collection-summary">가입한 유저 ${this.users.length}명 · 닉네임을 누르면 그 유저의 도감을 볼 수 있어요.</p>
      <div class="users-list" role="list">${this.users.map(user => {
        const percent = (user.privacy?.char ?? true) || user.me ? Math.round(user.owned.length / CHARACTERS.length * 100) : 0
        return `<button class="user-row${user.me ? ' is-me' : ''}" role="listitem" data-action="user-view" data-nickname="${escapeHtml(user.nickname)}">
          <span class="user-avatar">${(user.featured ?? user.owned[0]) ? `<img src="${CHARACTER_IMAGE_URLS[(user.featured ?? user.owned[0])!]}" alt="" />` : '?'}</span>
          <span class="user-main"><b>${escapeHtml(user.nickname)}${user.me ? ' <em>나</em>' : ''}</b><i class="user-bar"><i style="width:${percent}%"></i></i></span>
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
    const title = tab === 'house' ? '하우스' : deco ? '데코 도감' : '도감'
    const isPrivate = !user.me && !(user.privacy?.[tab === 'house' ? 'house' : deco ? 'deco' : 'char'] ?? true)
    const count = isPrivate ? '🔒 비공개' : tab === 'house' ? '' : deco ? `${user.decos?.length ?? 0} / ${DECOS.length}` : `${user.owned.length} / ${CHARACTERS.length}`
    const tabButton = (id: string, label: string) => `<button type="button" class="auth-tab${tab === id ? ' is-active' : ''}" data-action="user-tab" data-tab="${id}" data-nickname="${nick}" role="tab" aria-selected="${tab === id}">${label}</button>`
    body.innerHTML = `<div class="user-detail-head"><button class="soft-button" data-action="user-list">← 유저 목록</button>${avatar}<b>${nick} 님의 ${title}</b><span>${count}</span></div>
      ${user.me ? '' : `<button class="modal-primary mail-compose-button" data-action="mail-compose" data-nickname="${nick}">✉ ${nick} 님에게 편지 보내기</button>`}
      <div class="auth-tabs user-tabs user-tabs-3" role="tablist">${tabButton('char', '캐릭터 도감')}${tabButton('deco', '데코 도감')}${tabButton('house', '🏠 하우스')}</div>
      ${isPrivate ? '<p class="users-empty privacy-hidden-notice">🔒 이 정보는 비공개로 설정되어 있어요.<br>프로필 사진과 닉네임은 계속 볼 수 있어요.</p>' : tab === 'house' ? '<div class="user-house"><p class="user-house-loading">하우스를 불러오는 중…</p></div>' : `<div class="collection-grid user-grid">${deco ? this.decoCards(decoCounts, false) : this.collectionCards(user.owned, false)}</div>`}`
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
    grid.innerHTML = CHARACTERS.filter(character => this.store.data.owned.includes(character.id)).map(character => `<button class="featured-pick${current === character.id ? ' is-active' : ''}" role="listitem" data-action="featured-pick" data-id="${character.id}" aria-pressed="${current === character.id}" ${current === character.id ? 'disabled aria-disabled="true"' : ''}>
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
    if (!message || [...message].length > 30) { this.toast('메시지는 1~30자로 입력해 주세요.'); return }
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
        <div class="announcement-list">${data.items.length ? data.items.map(item => `<article class="announcement-item"><small>${new Date(item.at).toLocaleString('ko-KR')}</small><p>${escapeHtml(item.message)}</p></article>`).join('') : '<p class="users-empty">아직 공지사항이 없어요.</p>'}</div>`
      await this.store.announcementsSeen()
      const dot = this.root.querySelector<HTMLElement>('.announcement-dot')
      if (dot) dot.hidden = true
    } catch (error) { this.handleError(error); body.innerHTML = '<p class="users-empty">공지를 불러오지 못했어요.</p>' }
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
    try {this.expedition=await this.store.expedition();this.renderExpedition()} catch(e){const el=this.root.querySelector<HTMLElement>('.expedition-status');if(el)el.textContent='원정대 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';this.handleError(e)} finally{this.expeditionLoading=false}
  }
  private renderExpedition():void {
    const state=this.expedition
    if(!state)return
    const room=state.servers.find(r=>r.id===this.expeditionServer)!
    this.root.querySelectorAll<HTMLButtonElement>('.expedition-server-tabs button').forEach(b=>b.classList.toggle('selected',Number(b.dataset.id)===room.id))
    const hp=Math.max(0,room.hp)
    const label=this.root.querySelector<HTMLElement>('.exp-hp');if(label)label.textContent=hp.toLocaleString('ko-KR')
    const fill=this.root.querySelector<HTMLElement>('.expedition-hp-fill');if(fill)fill.style.width=`${hp/10000000*100}%`
    const percent=this.root.querySelector<HTMLElement>('.expedition-hp-percent');if(percent)percent.textContent=`${(hp/10000000*100).toFixed(2)}%`
    const boss=this.root.querySelector<HTMLElement>('.expedition-boss');if(boss){boss.classList.toggle('defeated',hp===0);boss.classList.toggle('under-attack',hp>0 && room.members.length>0)}
    const status=this.root.querySelector<HTMLElement>('.expedition-status')
    if(status)status.textContent=hp===0?'보스 토벌 성공! 우편함에서 보상을 받아주세요! 🎁':`서버 ${room.id} · ${room.members.length}/10명 · ${state.mine?`오늘 ${state.mine.serverId}서버에 배치 완료`:'캐릭터를 직접 배치해 주세요'}`
    const members=this.root.querySelector<HTMLElement>('.expedition-members')
    if(members){const html=room.members.map(m=>`<span>${m.me?'⭐ ':''}${m.name.replace(/[&<>"']/g,'')} · ${fullName(characterById(m.characterId))}</span>`).join('');if(members.innerHTML!==html)members.innerHTML=html}
    const party=this.root.querySelector<HTMLElement>('.expedition-party')
    if(party){const html=room.members.map((m,i)=>`<div class="expedition-combatant" style="--n:${i};--shot-x:${(2.5-(i%5))*72}px;--shot-y:${i<5?-110:-175}px"><span class="expedition-name">${m.me?'⭐ ':''}${m.name.replace(/[&<>"']/g,'')}</span><img class="expedition-fighter" src="${CHARACTER_IMAGE_URLS[m.characterId]}" alt="" /><span class="expedition-projectile"></span></div>`).join('');if(party.innerHTML!==html)party.innerHTML=html}
    const picker=this.root.querySelector<HTMLElement>('.expedition-picker')
    if(picker){const html=hp===0?'보스가 처치됐어요. 📬 우편함에서 500코인 보상을 수령해 주세요.':state.mine && state.mine.serverId!==room.id?'다른 서버에 배치되어 있어요. 같은 날 서버 이동은 불가능해요.':room.members.length>=10 && !state.mine?'이 서버는 인원이 가득 찼어요.':`<b>${state.mine?"배치 캐릭터 변경":"원정대에 보낼 캐릭터 선택"}</b><div class="expedition-choices">${this.store.data.owned.map(id=>`<button data-action="exp-join" data-id="${id}"><img src="${CHARACTER_IMAGE_URLS[id]}" alt=""/><span>${fullName(characterById(id))}<small>전투력 ${battlePower(id)}</small></span></button>`).join('')}</div>`
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
    const waiting = box.mail.filter(item => item.coins > 0 && !item.claimed).reduce((sum, item) => sum + item.coins, 0)
    const all = this.root.querySelector<HTMLButtonElement>('.mail-claim-all')
    if (all) { all.hidden = !inbox; all.disabled = waiting === 0; all.textContent = waiting ? `코인 모두 받기 (+${waiting})` : '받을 코인이 없어요' }
    if (!list) return
    const del = (id: number, which: 'in' | 'sent') => `<button class="mail-delete" data-action="mail-delete" data-box="${which}" data-id="${id}" aria-label="우편 삭제">🗑 삭제</button>`
    if (inbox) {
      list.innerHTML = box.mail.length ? box.mail.map(item => `<article class="mail-item${item.seen ? '' : ' is-new'}" role="listitem">
        <div class="mail-head"><b>${escapeHtml(item.from)}</b><small>${mailTime(item.at)}</small>${item.seen ? '' : '<em>NEW</em>'}${del(item.id, 'in')}</div>
        ${item.message ? `<p class="mail-text">${escapeHtml(item.message)}</p>` : ''}
        ${item.coins > 0 ? (item.claimed ? `<span class="mail-coins is-claimed">✿ ${item.coins}코인 받음</span>` : `<button class="mail-coins" data-action="mail-claim" data-id="${item.id}">✿ ${item.coins}코인 받기</button>`) : ''}
      </article>`).join('') : '<p class="users-empty">아직 받은 편지가 없어요.</p>'
    } else {
      list.innerHTML = box.sent.length ? box.sent.map(item => `<article class="mail-item is-sent" role="listitem">
        <div class="mail-head"><b>To. ${escapeHtml(item.to)}</b><small>${mailTime(item.at)}</small><em class="mail-read">${item.seen ? '읽음' : '안 읽음'}</em>${del(item.id, 'sent')}</div>
        ${item.message ? `<p class="mail-text">${escapeHtml(item.message)}</p>` : ''}
        ${item.coins > 0 ? `<span class="mail-coins is-claimed">✿ ${item.coins}코인 보냄${item.claimed ? ' · 받음' : ''}</span>` : ''}
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
    this.root.querySelectorAll<HTMLElement>('.diamond-value').forEach(el => { el.textContent = (this.isAdmin ? '∞' : (this.store.data.diamonds ?? 0).toLocaleString('ko-KR')) })
    const grid = this.root.querySelector<HTMLElement>('.storage-grid')
    const summary = this.root.querySelector<HTMLElement>('.storage-summary')
    this.root.querySelectorAll<HTMLButtonElement>('[data-action="storage-tab"]').forEach(tab => {
      const on = tab.dataset.tab === this.storageTab
      tab.classList.toggle('is-active', on)
      tab.setAttribute('aria-selected', String(on))
    })
    if (!grid) return
    const sellButtons = (kind: 'char' | 'deco', id: string, extra: number, price: number) => extra > 0
      ? `<div class="storage-sell"><button class="storage-sell-btn" data-action="sell" data-kind="${kind}" data-id="${id}" data-count="1">1개 팔기 +${price}</button>${extra > 1 ? `<button class="storage-sell-btn is-all" data-action="sell" data-kind="${kind}" data-id="${id}" data-count="${extra}">모두 팔기 +${extra * price}</button>` : ''}</div>`
      : '<small class="storage-keep">중복 없음</small>'
    if (this.storageTab === 'char') {
      const owned = CHARACTERS.filter(c => this.store.data.owned.includes(c.id))
      const extras = owned.reduce((sum, c) => sum + (this.store.dupes[c.id] ?? 0), 0)
      if (summary) summary.textContent = `보유 캐릭터 ${owned.length}종 · 중복 ${extras}개 · 중복 판매: 노말 3 · 레어 5 · 에픽 10 · 유니크 30코인 (원본 1개는 남아요).`
      grid.innerHTML = owned.length ? owned.map(c => {
        const extra = this.store.dupes[c.id] ?? 0
        return `<article class="storage-item" role="listitem"><span class="storage-pic"><img src="${CHARACTER_IMAGE_URLS[c.id]}" alt="" loading="lazy" /></span><b>${escapeHtml(fullName(c))}</b><small class="storage-count">보유 ${1 + extra}개${extra ? ` · 중복 ${extra}` : ''}</small>${sellButtons('char', c.id, extra, CHAR_SELL_PRICES[c.tier === 'mermaid' ? 'rare' : c.tier === 'rare' ? 'epic' : c.tier === 'super' || c.tier === 'legendary' ? 'unique' : 'normal'])}</article>`
      }).join('') : '<p class="users-empty">아직 뽑은 캐릭터가 없어요.</p>'
    } else {
      const placed: Record<string, number> = {}
      for (const piece of this.store.house.pieces) placed[piece.id] = (placed[piece.id] ?? 0) + 1
      const owned = DECOS.filter(d => (this.store.decos[d.id] ?? 0) > 0)
      const extras = owned.reduce((sum, d) => sum + Math.max(0, (this.store.decos[d.id] ?? 0) - Math.max(1, placed[d.id] ?? 0)), 0)
      if (summary) summary.textContent = `보유 데코 ${owned.length}종 · 팔 수 있는 중복 ${extras}개 · 중복 데코는 1개당 ${DECO_SELL_PRICE}코인 (원본 1개와 하우스에 놓인 데코는 남아요).`
      grid.innerHTML = owned.length ? owned.map(d => {
        const have = this.store.decos[d.id] ?? 0
        const onHouse = placed[d.id] ?? 0
        const extra = Math.max(0, have - Math.max(1, onHouse))
        return `<article class="storage-item" role="listitem"><span class="storage-pic is-deco"><img src="${DECO_IMAGE_URLS[d.id]}" alt="" loading="lazy" /></span><b>${escapeHtml(d.name)}</b><small class="storage-count">보유 ${have}개${onHouse ? ` · 하우스 ${onHouse}` : ''}</small>${sellButtons('deco', d.id, extra, DECO_SELL_PRICE)}</article>`
      }).join('') : '<p class="users-empty">아직 뽑은 데코가 없어요.</p>'
    }
  }
  private async sell(kind: 'char' | 'deco', id: string, count: number, button: HTMLButtonElement): Promise<void> {
    button.disabled = true
    try {
      const coins = await this.store.sell(kind, id, count)
      this.renderWallet()
      this.renderStorage()
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
        <p>가입한 일반 유저 모두에게 같은 편지와 코인을 보냅니다. 코인은 유저 1명당 지급할 수량입니다.</p>
        <label for="broadcast-message">편지 내용 (필수 · 최대 200자)</label>
        <textarea id="broadcast-message" class="mail-text-input" maxlength="200" rows="4" placeholder="전체 유저에게 보낼 내용을 적어 주세요"></textarea>
        <label for="broadcast-coins">유저 1명당 지급할 코인 (0~1,000,000)</label>
        <input id="broadcast-coins" class="mail-coin-input" type="number" min="0" max="1000000" step="1" value="0" />
        <button class="modal-primary" data-action="admin-broadcast-send">📨 전체 유저에게 보내기</button>
      </div>`
  }

  private async sendBroadcast(): Promise<void> {
    if (!this.isAdmin || this.store.user?.username !== 'tjdrjs885') return
    const body = this.root.querySelector<HTMLElement>('.users-body')
    const message = body?.querySelector<HTMLTextAreaElement>('#broadcast-message')?.value.trim() ?? ''
    const coins = Number(body?.querySelector<HTMLInputElement>('#broadcast-coins')?.value)
    if (!message || message.length > 200 || !Number.isSafeInteger(coins) || coins < 0 || coins > 1000000) {
      this.toast('편지 내용과 코인 수량을 확인해 주세요.'); return
    }
    if (!window.confirm(`전체 일반 유저에게 편지와 1인당 ${coins.toLocaleString()}코인을 보내시겠어요? 발송은 취소할 수 없습니다.`)) return
    const button = body?.querySelector<HTMLButtonElement>('[data-action="admin-broadcast-send"]')
    if (button) button.disabled = true
    try {
      const result = await this.store.broadcastMail(message, coins)
      this.notice('전체 우편 발송 완료', `${result.count}명에게 편지와 1인당 ${coins.toLocaleString()}코인을 보냈어요.`)
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

  private renderWeed(): void {
    const picker = this.root.querySelector<HTMLElement>('.weed-picker')
    const owned = CHARACTERS.filter(character => this.store.data.owned.includes(character.id))
    if (picker) {
      picker.innerHTML = owned.length
        ? owned.map(character => `<button class="weed-pick${this.store.isWeeding(character.id) ? ' is-active' : ''}${(this.store.battle?.id === character.id || this.store.battle?.secondId === character.id) ? ' is-busy' : ''}" role="listitem" data-action="weed-pick" data-id="${character.id}" aria-pressed="${this.store.isWeeding(character.id)}">
            <img src="${CHARACTER_IMAGE_URLS[character.id]}" alt="" /><span>${character.name}</span>${character.variant ? `<em>${character.variant}</em>` : ''}${character.weedBonus ? `<em class="is-bonus">+${character.weedBonus}%</em>` : ''}${(this.store.battle?.id === character.id || this.store.battle?.secondId === character.id) ? '<em class="is-busy-tag">토벌 중</em>' : ''}${character.id === 'beetle' && this.store.weed?.beetle ? '<em class="is-bonus">도우미</em>' : ''}</button>`).join('')
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
      friend.innerHTML = character ? `<img src="/assets/weed/${character.id}.png" alt="제초 중인 ${fullName(character)}" />` : ''
    })
    this.renderBeetle()
    this.renderWeedStatus()
  }

  private renderBattle(): void {
    const picker = this.root.querySelector<HTMLElement>('.battle-picker')
    const owned = CHARACTERS.filter(character => this.store.data.owned.includes(character.id))
    if (picker) {
      picker.innerHTML = owned.length
        ? owned.map(character => `<button class="weed-pick${(this.store.battle?.id === character.id || this.store.battle?.secondId === character.id) ? ' is-active' : ''}${this.weedBusy(character.id) ? ' is-busy' : ''}" role="listitem" data-action="battle-pick" data-id="${character.id}" aria-pressed="${this.store.battle?.id === character.id || this.store.battle?.secondId === character.id}">
            <img src="${CHARACTER_IMAGE_URLS[character.id]}" alt="" /><span>${character.name}</span>${character.variant ? `<em>${character.variant}</em>` : ''}<em class="is-power">⚔ ${battlePower(character.id)}</em>${this.weedBusy(character.id) ? '<em class="is-busy-tag">제초 중</em>' : ''}</button>`).join('')
        : '<p class="weed-empty">가챠에서 친구를 뽑으면 토벌을 보낼 수 있어요.</p>'
    }
    const fighter = this.store.battle ? characterById(this.store.battle.id) : undefined
    const second = this.store.battle?.secondId ? characterById(this.store.battle.secondId) : undefined
    const secondUnit = this.root.querySelector<HTMLElement>('.bf-friend-second')
    if (secondUnit) {
      secondUnit.classList.toggle('is-empty', !second)
      const body = secondUnit.querySelector<HTMLElement>('.bf-friend-body')
      const icon = secondUnit.querySelector<HTMLElement>('.bf-friend-icon')
      const power = secondUnit.querySelector<HTMLElement>('.bf-friend-power')
      if (body) body.innerHTML = second ? `<img src="${CHARACTER_IMAGE_URLS[second.id]}" alt="토벌 중인 ${fullName(second)}" />` : ''
      if (icon) icon.innerHTML = second ? `<img src="${CHARACTER_IMAGE_URLS[second.id]}" alt="" />` : ''
      if (power) power.textContent = second ? `⚔ ${battlePower(second.id)}` : ''
    }
    const unit = this.root.querySelector<HTMLElement>('.bf-friend:not(.bf-friend-second)')
    if (unit) {
      unit.classList.toggle('is-empty', !fighter)
      const body = unit.querySelector<HTMLElement>('.bf-friend-body')
      const icon = unit.querySelector<HTMLElement>('.bf-friend-icon')
      const power = unit.querySelector<HTMLElement>('.bf-friend-power')
      if (body) body.innerHTML = fighter ? `<img src="${CHARACTER_IMAGE_URLS[fighter.id]}" alt="토벌 중인 ${fullName(fighter)}" />` : ''
      if (icon) icon.innerHTML = fighter ? `<img src="${CHARACTER_IMAGE_URLS[fighter.id]}" alt="" />` : ''
      if (power) power.textContent = fighter ? `⚔ ${battlePower(fighter.id)}` : ''
    }
    this.root.querySelector('.battle-field')?.classList.toggle('is-fighting', Boolean(fighter))
    this.renderBattleStatus()
  }

  /** Settles defeated monsters on the server (diamonds are credited to inventory). */
  private async syncBattle(): Promise<void> {
    if (!this.store.battle || this.battleSyncing) return
    this.battleSyncing = true
    try {
      const earned = await this.store.claimBattle()
      if (earned > 0) {
        this.audio.play('pickup')
        if (this.screen === 'battle') this.toast(`몬스터를 ${earned}마리 물리쳤어요! 다이아 +${earned}개`)
      }
    } catch { /* Retried on the next tick. */ } finally { this.battleSyncing = false }
    this.renderWallet()
    if (this.screen === 'battle') this.renderBattleStatus()
  }

  private renderBattleStatus(): void {
    const fighter = this.store.battle ? characterById(this.store.battle.id) : undefined
    const view = this.store.battleView()
    if (view.kills > 0) void this.syncBattle()
    const hourlyRate = this.root.querySelector<HTMLElement>('.battle-hourly-rate')
    if (hourlyRate) hourlyRate.textContent = `${(view.power * 3_600_000 / BATTLE_TICK_MS / ENEMY_HP * 0.4).toFixed(2)}개/시간`
    const status = this.root.querySelector<HTMLElement>('.battle-status')
    if (status) status.textContent = fighter ? `토벌 중 ${this.store.battle?.secondId ? '2/2명' : '1/2명'} · 합산 공격력 ⚔ ${view.power} (캐릭터를 눌러 교체/해제)` : '아래에서 토벌할 친구를 최대 2명 골라 주세요.'
    const hp = this.root.querySelector<HTMLElement>('.battle-hp')
    if (hp) hp.textContent = `${view.hp} / ${ENEMY_HP}`
    const enemyHp = this.root.querySelector<HTMLElement>('.bf-enemy-hp')
    if (enemyHp) enemyHp.textContent = String(view.hp)
    const fill = this.root.querySelector<HTMLElement>('.bf-enemy-fill')
    if (fill) fill.style.transform = `scaleX(${view.hp / ENEMY_HP})`
    const next = this.root.querySelector<HTMLElement>('.battle-next')
    if (next) {
      const seconds = Math.ceil((fighter ? view.nextIn : BATTLE_TICK_MS) / 1000)
      next.textContent = fighter ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : '--:--'
    }
    const kills = this.root.querySelector<HTMLElement>('.battle-kills')
    if (kills) kills.textContent = fighter ? `${Math.max(0, Math.ceil(view.hp / Math.max(1, view.power)))}번` : '-'
    const killsLabel = kills?.nextElementSibling
    if (killsLabel) killsLabel.textContent = '처치까지 공격'
    // A real attack landed since the last frame: show the damage number and a hit shake.
    if (fighter && this.lastEnemyHp >= 0 && view.hp !== this.lastEnemyHp) {
      const hit = this.root.querySelector<HTMLElement>('.bf-hit')
      const enemy = this.root.querySelector<HTMLElement>('.bf-enemy')
      if (hit) { hit.textContent = `-${view.power}`; hit.classList.remove('is-showing'); void hit.offsetWidth; hit.classList.add('is-showing') }
      if (enemy) { enemy.classList.remove('is-hit'); void enemy.offsetWidth; enemy.classList.add('is-hit') }
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
      ? `${members.length === 1 ? withJosa(members[0].name, '이', '가') : `${members.map(c => c.name).join('·')} ${members.length}명이`} 제초 중 (${members.length}/${WEED_MAX})${this.store.weed?.beetle ? ' · 코인 2배' : ''}`
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
    list.innerHTML = this.results.map((item, index) => `<div class="result-friend" style="--friend:${item.color};--accent:${item.accent};--i:${index}">
        <span class="result-avatar"><img src="${item.image}" alt="${item.name}" /></span>
        <span><b>${item.variant ? `${item.name}(${item.variant})` : item.name}</b><small>${item.sub}</small></span>
        <span class="result-chance">${item.chance}%</span>
      </div>`).join('')
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
    const hold = results.length === 1 ? 1500 : 1050
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
    const counter = total > 1 ? `<small class="pop-count">${index + 1} / ${total}</small>` : ''
    const hint = total > 1 ? '<small class="pop-more">화면을 누르면 다음으로 넘어가요</small>' : ''
    node.innerHTML = `<div class="pop-card${item.rare ? ' is-rare' : ''}" style="--friend:${item.color};--accent:${item.accent}">
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

  private showInsufficient(cost?: number): void {
    const overlay = this.root.querySelector<HTMLElement>('.insufficient-overlay')
    const message = this.root.querySelector<HTMLElement>('#insufficient-message')
    if (!overlay || !message) return
    const have = this.store.data.gems
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
