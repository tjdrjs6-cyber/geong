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
    <svg class="bf-scene" viewBox="0 0 800 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <rect width="800" height="600" fill="#c9c2c7"/>
      <path d="M0 0 H800 V330 H0 Z" fill="#b8b0b6"/>
      <g fill="none" stroke="#9a9198" stroke-width="4" stroke-linejoin="round">
        <path d="M40 60 l60 -20 l40 50 l-30 60 l-70 -10 z M170 120 l70 -30 l50 40 l-20 70 l-80 0 z M560 100 l60 -40 l70 30 l-10 70 l-90 10 z M680 200 l70 -10 l40 60 l-50 50 l-60 -30 z M60 220 l60 -10 l30 60 l-60 30 z"/>
      </g>
      <path d="M210 330 C 210 150 300 90 400 90 C 500 90 590 150 590 330 Z" fill="#8f878e" stroke="${INK}" stroke-width="5"/>
      <path d="M260 330 C 262 190 330 140 400 140 C 470 140 538 190 540 330 Z" fill="#7a7279"/>
      ${banner(130)}${banner(670)}
      ${torch(70)}${torch(730)}
      ${bush(90, 300)}${bush(712, 300, -1)}
      <path d="M0 320 C 160 300 640 300 800 320 V600 H0 Z" fill="#efdcbc" stroke="${INK}" stroke-width="5"/>
      <g stroke="#d9c39d" stroke-width="4" stroke-linecap="round"><path d="M90 380 h30 M640 360 h26 M170 470 h22 M560 520 h34 M700 450 h20 M300 560 h26"/></g>
      <g class="bf-circle" fill="none" stroke="#e98e8e" stroke-width="5" stroke-linecap="round" stroke-dasharray="40 16">
        <ellipse cx="400" cy="470" rx="290" ry="70"/>
      </g>
      <path d="M330 450 l40 20 l-40 20 M470 450 l-40 20 l40 20 M400 430 v80" fill="none" stroke="#f0aaaa" stroke-width="4" stroke-linecap="round"/>
      ${rock(150, 430)}${rock(660, 410, .8)}${rock(60, 560, 1.4)}${rock(760, 560, 1.3)}
    </svg>
    <div class="bf-title"><span>⚔</span> 토벌장 <span>⚔</span></div>
    <div class="bf-unit bf-enemy">
      <div class="bf-bar"><i class="bf-bar-icon">🐛</i><span class="bf-bar-track"><b class="bf-enemy-fill"></b></span><em class="bf-enemy-hp">100</em></div>
      <div class="bf-body bf-enemy-body">${monsterSvg()}</div>
      <span class="bf-hit">-10</span>
    </div>
    <span class="bf-spark" aria-hidden="true">✦</span>
    <div class="bf-unit bf-friend is-empty">
      <div class="bf-bar bf-friend-bar"><i class="bf-bar-icon bf-friend-icon"></i><span class="bf-bar-track"><b class="bf-friend-fill"></b></span><em class="bf-friend-power"></em></div>
      <div class="bf-body bf-friend-body"></div>
    </div>`
}

/** Round green striped bug monster with antennae, drawn in the same thick-outline style as the characters. */
function monsterSvg(): string {
  return `
    <svg viewBox="0 0 220 230" class="bf-monster" aria-label="초록 줄무늬 몬스터">
      <g fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"><path d="M88 52 Q 78 26 66 18 M132 52 Q 142 26 154 18"/></g>
      <circle cx="64" cy="16" r="12" fill="#fff" stroke="${INK}" stroke-width="6"/><circle cx="156" cy="16" r="12" fill="#fff" stroke="${INK}" stroke-width="6"/>
      <ellipse cx="110" cy="170" rx="92" ry="48" fill="#a6d77c" stroke="${INK}" stroke-width="6"/>
      <path d="M30 150 Q 110 132 190 150 M22 178 Q 110 196 198 178" fill="none" stroke="#4f8a3a" stroke-width="12" stroke-linecap="round"/>
      <path d="M58 214 l-10 14 M162 214 l10 14" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
      <ellipse cx="110" cy="96" rx="66" ry="56" fill="#a6d77c" stroke="${INK}" stroke-width="6"/>
      <path d="M52 76 Q 110 58 168 76 M46 104 Q 110 90 174 104" fill="none" stroke="#4f8a3a" stroke-width="11" stroke-linecap="round"/>
      <ellipse cx="110" cy="116" rx="40" ry="30" fill="#fffaf2" stroke="${INK}" stroke-width="5"/>
      <circle cx="96" cy="112" r="4.5" fill="${INK}"/><circle cx="124" cy="112" r="4.5" fill="${INK}"/>
      <ellipse cx="110" cy="128" rx="6" ry="8" fill="${INK}"/>
      <ellipse cx="84" cy="124" rx="7" ry="4" fill="#f6b4bf"/><ellipse cx="136" cy="124" rx="7" ry="4" fill="#f6b4bf"/>
    </svg>`
}
