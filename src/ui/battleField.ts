/** Hand-drawn style 2D hunting ground: stone cave, torches, banners, sandy floor and a striped green monster. */
const INK = '#4a3b3b'

const torch = (x: number): string => `
  <g transform="translate(${x} 150)">
    <rect x="-7" y="20" width="14" height="120" rx="5" fill="#9a6a44" stroke="${INK}" stroke-width="4"/>
    <path d="M-20 18 h40 l-8 22 h-24 z" fill="#c98a52" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <g class="bf-flame"><path d="M0 -38 C 18 -14 22 0 14 12 C 8 20 -8 20 -14 12 C -22 0 -14 -16 0 -38 Z" fill="#ff9a3c" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M0 -14 C 8 -2 9 6 4 12 C 0 15 -4 14 -6 10 C -8 4 -5 -4 0 -14 Z" fill="#ffe27a"/></g>
  </g>`

const banner = (x: number): string => `
  <g transform="translate(${x} 40)">
    <rect x="-46" y="-6" width="92" height="12" rx="6" fill="#8a5a3a" stroke="${INK}" stroke-width="4"/>
    <path d="M-34 6 h68 v92 l-34 -20 l-34 20 z" fill="#de7a72" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M-12 44 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0 M-9 36 l-3 -10 M9 36 l3 -10" fill="none" stroke="#fbd6cf" stroke-width="4" stroke-linecap="round"/>
  </g>`

const bush = (x: number, y: number, flip = 1): string => `
  <g transform="translate(${x} ${y}) scale(${flip} 1)">
    <path d="M-70 30 C -86 0 -60 -26 -36 -16 C -30 -44 6 -50 18 -24 C 40 -38 72 -16 62 10 C 80 18 72 40 52 40 H -56 C -76 40 -82 34 -70 30 Z" fill="#9ccf7a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M-30 6 q6 -8 12 0 M16 -2 q6 -8 12 0" fill="none" stroke="#6ea653" stroke-width="3" stroke-linecap="round"/>
  </g>`

const rock = (x: number, y: number, s = 1): string =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M-40 14 C -44 -6 -24 -20 -2 -18 C 22 -22 42 -6 40 12 C 30 20 -30 22 -40 14 Z" fill="#a9a1a6" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`

export function battleFieldMarkup(): string {
  return `
    <img class="bf-scene bf-scene-background" src="/assets/battle_background_v163.png" alt="" aria-hidden="true" draggable="false" />
    <div class="bf-title"><span>⚔</span> 토벌장 <span>⚔</span></div>
    <div class="bf-unit bf-enemy">
      <div class="bf-bar"><span class="bf-bar-track"><b class="bf-enemy-fill"></b></span><em class="bf-enemy-hp">20,000 / 20,000 · 100%</em></div>
      <div class="bf-body bf-enemy-body">${monsterSvg()}</div>
      <span class="bf-hit">-10</span>
    </div>
    <div class="bf-unit bf-friend bf-friend-second is-empty"><div class="bf-friend-label"><span class="bf-friend-name"></span><em class="bf-friend-power"></em></div><div class="bf-body bf-friend-body"></div></div>
    <div class="bf-unit bf-friend is-empty">
      <div class="bf-friend-label"><span class="bf-friend-name"></span><em class="bf-friend-power"></em></div>
      <div class="bf-body bf-friend-body"></div>
    </div>`
}

/** Uploaded monster illustration, shown only in the hunting ground. */
function monsterSvg(): string {
  return `<img class="bf-monster" src="/assets/battle_monster_v162.png" alt="초록 줄무늬 몬스터" draggable="false" />`
}
