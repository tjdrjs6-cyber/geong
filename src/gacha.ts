import './styles/main.css'
import './styles/gacha.css'
import { installRilakkumaEvent } from './ui/rilakkumaEvent'
import { Audio } from './engine/audio'
import { SaveStore } from './engine/save'
import { CHARACTERS } from './game/collection'
import { CHARACTER_IMAGE_URLS } from './game/characterImageUrls'
import { RemoteGachaStore } from './game/remoteStore'
import { GachaUi } from './ui/gachaUi'

// 우사기 has tall ears, so inside the shared square frame its body looks smaller than everyone else.
// Enlarge just those images from the feet up so the bodies match the other friends.
{
  const big = document.createElement('style')
  big.textContent = (['usagi', 'm_usagi'] as const).map(id => `img[src="${CHARACTER_IMAGE_URLS[id]}"]`).join(',') + '{scale:1.25;transform-origin:50% 100%;}'
  document.head.append(big)
}

/**
 * iOS in-app browsers (KakaoTalk, Safari) can leave the page scrolled after the keyboard
 * closes or the toolbar resizes, which pushes the top bar under the browser's address bar.
 * The game never scrolls the document, so snap it back whenever no text field is focused.
 */
function keepPageAtTop(): void {
  const typing = (): boolean => {
    const el = document.activeElement
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
  }
  const reset = (): void => {
    if (typing()) return
    if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0)
    const root = document.scrollingElement
    if (root && root.scrollTop !== 0) root.scrollTop = 0
    if (document.body.scrollTop !== 0) document.body.scrollTop = 0
  }
  const soon = (): void => { reset(); window.setTimeout(reset, 120); window.setTimeout(reset, 400) }
  window.addEventListener('scroll', soon, { passive: true })
  window.addEventListener('resize', soon)
  window.addEventListener('orientationchange', soon)
  window.addEventListener('pageshow', soon)
  document.addEventListener('focusout', () => window.setTimeout(soon, 50))
  window.visualViewport?.addEventListener('resize', soon)
  window.visualViewport?.addEventListener('scroll', soon)
  soon()
}
keepPageAtTop()
installRilakkumaEvent()

/** Warm the image cache while the account request is running. Keep this bounded so boot
 * does not wait for the entire collection and does not flood mobile connections. */
const initialArt = [
  '/assets/chars/chiikawa_tab_icon.png', '/assets/chars/hachiware_face.png',
  '/assets/chars/chiikawa.png', '/assets/chars/hachiware.png',
  '/assets/chars/usagi.png', '/assets/chars/kani.png',
  '/assets/coin.png', '/assets/attendance_kani.png',
  '/assets/lottery_ticket_custom.png',
  '/lobby_meadow.png', '/expedition_cave.png', '/expedition_banner.jpg',
]
function warmImage(url: string): Promise<void> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = url
    if (img.complete) resolve()
  })
}
function warmCollectionArt(): void {
  // Browser scheduling keeps these requests low priority relative to visible UI.
  const urls = Object.values(CHARACTER_IMAGE_URLS)
  let index = 0
  const next = (): void => {
    if (index >= urls.length) return
    void warmImage(urls[index++]!).then(next)
  }
  for (let i = 0; i < 3; i++) next()
}

/** 2D cartoon gacha: no WebGL, just the DOM UI with character art. */
async function boot(): Promise<void> {
  document.documentElement.lang = 'ko'
  document.querySelector<HTMLCanvasElement>('#game')?.remove()
  const save = new SaveStore()
  const collection = new RemoteGachaStore()
  const audio = new Audio()
  audio.setVolumes(save.data.musicVolume, save.data.sfxVolume, save.data.muted)
  let starting = false
  const ui = new GachaUi(collection, audio, { retry: () => { void start() } })

  const start = async (): Promise<void> => {
    if (starting) return
    starting = true
    ui.show('boot')
    ui.setBootProgress(0.2)
    try {
      // Fetch essential lobby art in parallel with the account restore.
      const artReady = Promise.all(initialArt.map(warmImage))
      ui.setBootProgress(0.6)
      let user = null
      try { user = await collection.restore() } catch { user = null }
      if (user) void fetch('/api/rilakkuma-event', {credentials:'same-origin'}).catch(() => {})
      // Include the selected representative character before displaying the lobby.
      // Backgrounds and the hero must be ready; other collection art stays lazy.
      const hero = collection.featured && collection.data.owned.includes(collection.featured)
        ? collection.featured : (collection.data.owned[0] || 'chiikawa')
      await Promise.all([artReady, warmImage(CHARACTER_IMAGE_URLS[hero])])
      ui.setBootProgress(1)
      ;(window as unknown as { __game: unknown }).__game = { ui, store: collection }
      ui.show(user ? (user.nickname ? 'title' : 'nickname') : 'auth')
      warmCollectionArt()
      // Show the new-character notice once per signed-in account on this browser.
      if (user && user.nickname) {
        const noticeKey = `gm-new-character-chiikawa-babo-v1:${user.nickname}`
        let seen = false
        try { seen = localStorage.getItem(noticeKey) === '1' } catch { /* storage disabled */ }
        if (!seen) {
          const overlay = document.createElement('div')
          overlay.setAttribute('role','dialog')
          overlay.setAttribute('aria-modal','true')
          overlay.setAttribute('aria-label','신규 레전더리 캐릭터 등장')
          overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(12,9,28,.78);padding:20px;pointer-events:auto'
          overlay.innerHTML = `<div style="width:min(92vw,390px);background:linear-gradient(145deg,#fff9e9,#ffe9b0);border:3px solid #f5bf49;border-radius:24px;text-align:center;padding:24px 18px;color:#47320f;box-shadow:0 15px 55px #0007"><div style="font-size:13px;font-weight:900;color:#b07811">NEW LEGENDARY</div><h2 style="margin:10px 0;font-size:24px">신규 캐릭터 등장!</h2><img src="/assets/chars/chiikawa_babo.png" alt="치이카와(바보)" style="width:170px;height:170px;object-fit:contain;display:block;margin:12px auto"/><strong style="display:block;font-size:21px">치이카와(바보)</strong><p style="font-size:13px">초월 세이렌 뽑기에서 만날 수 있어요!</p><button type="button" style="margin-top:8px;border:0;border-radius:13px;padding:13px 30px;background:#f0b82e;color:#342200;font-weight:900;cursor:pointer">확인</button></div>`
          overlay.querySelector('button')?.addEventListener('click',()=>{try{localStorage.setItem(noticeKey,'1')}catch{} overlay.remove()})
          document.body.append(overlay)
        }
      }

    } catch (error) {
      console.error(error)
      ui.showLoadError()
    } finally {
      starting = false
    }
  }
  void start()
}

boot().catch(error => {
  console.error(error)
  const root = document.getElementById('ui')
  if (root) root.textContent = '게임을 시작하지 못했어요. 페이지를 새로고침해 주세요.'
})
