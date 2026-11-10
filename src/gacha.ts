import './styles/main.css'
import './styles/gacha.css'
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
      // Render the login/title screen immediately. Character art loads lazily in the background.
      ui.setBootProgress(0.8)
      let user = null
      try { user = await collection.restore() } catch { user = null }
      ui.setBootProgress(1)
      ;(window as unknown as { __game: unknown }).__game = { ui, store: collection }
      ui.show(user ? (user.nickname ? 'title' : 'nickname') : 'auth')
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
