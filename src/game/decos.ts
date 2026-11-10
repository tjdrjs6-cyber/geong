/** house decorations from the 데코 뽑기 (equal chance each). Keep in sync with server/game.mjs DECO_IDS. */
export const DECOS = [
  { id: 'd001', name: "건조대", zone: 'floor' },
  { id: 'd002', name: "게임기", zone: 'floor' },
  { id: 'd003', name: "기타 세트", zone: 'floor' },
  { id: 'd004', name: "다트 게임판", zone: 'floor' },
  { id: 'd005', name: "러닝머신", zone: 'floor' },
  { id: 'd006', name: "미니 수족관", zone: 'floor' },
  { id: 'd007', name: "미니 온실", zone: 'floor' },
  { id: 'd008', name: "미니 화실", zone: 'floor' },
  { id: 'd009', name: "벽난로", zone: 'floor' },
  { id: 'd010', name: "변기 세트", zone: 'floor' },
  { id: 'd011', name: "빵 쇼케이스", zone: 'floor' },
  { id: 'd012', name: "샌드백", zone: 'floor' },
  { id: 'd013', name: "샤워 부스", zone: 'floor' },
  { id: 'd014', name: "세면대 세트", zone: 'floor' },
  { id: 'd015', name: "세탁기", zone: 'floor' },
  { id: 'd016', name: "식료품 수납장", zone: 'floor' },
  { id: 'd017', name: "실내 자전거", zone: 'floor' },
  { id: 'd018', name: "욕조", zone: 'floor' },
  { id: 'd019', name: "운동 세트", zone: 'floor' },
  { id: 'd020', name: "원목 테이블", zone: 'floor' },
  { id: 'd021', name: "인형뽑기 기계", zone: 'floor' },
  { id: 'd022', name: "작은 선반", zone: 'wall' },
  { id: 'd023', name: "재봉틀", zone: 'floor' },
  { id: 'd024', name: "캡슐 머신", zone: 'floor' },
  { id: 'd025', name: "캣 타워", zone: 'floor' },
  { id: 'd026', name: "코타츠", zone: 'floor' },
  { id: 'd027', name: "큰 선반", zone: 'wall' },
  { id: 'd028', name: "큰 테이블", zone: 'floor' },
  { id: 'd029', name: "터널 침대", zone: 'floor' },
  { id: 'd030', name: "피아노 세트", zone: 'floor' },
  { id: 'd031', name: "화분 테이블", zone: 'floor' },
] as const
export type DecoId = (typeof DECOS)[number]['id']
export type Deco = (typeof DECOS)[number]
export const DECO_IDS: readonly DecoId[] = DECOS.map(deco => deco.id)
export const decoById = (id: DecoId): Deco => DECOS.find(deco => deco.id === id)!
/** All items are drawn uniformly, without rounded percentage weights. */
export const DECO_PROBABILITY = 100 / DECOS.length
export const DECO_PULL_OPTIONS = [
  { count: 1, cost: 20 },
  { count: 3, cost: 60 },
  { count: 5, cost: 100 },
  { count: 10, cost: 200 },
] as const
export type DecoPullCount = (typeof DECO_PULL_OPTIONS)[number]['count']
export const decoPullCost = (count: DecoPullCount): number => DECO_PULL_OPTIONS.find(option => option.count === count)!.cost
/** Registering a new deco in the deco collection pays coins (duplicates pay nothing). */
export const DECO_NEW_BONUS = 10
export type DecoCounts = Partial<Record<DecoId, number>>
export type DecoPullResult = { id: DecoId; duplicate: boolean; bonus: number }
/** One placed item in the house lot; x/y are percentages of the lot (bottom-centre anchor). */
export type HousePiece = { id: DecoId; x: number; y: number; s: number; f: boolean }
export type HouseFriend = { id: string; x: number; y: number; s: number; f: boolean }
export type HouseLayout = { pieces: HousePiece[]; friends: HouseFriend[] }
export const HOUSE_MAX_PIECES = 20
export const HOUSE_MAX_FRIENDS = 3

export const DECO_IMAGE_URLS: Record<DecoId, string> = Object.fromEntries(DECOS.map(d => [d.id, `/assets/decos/${d.id}.png`])) as Record<DecoId, string>
