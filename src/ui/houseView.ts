import './houseRedesign.css'
import { CHARACTER_IMAGE_URLS } from '../game/characterImageUrls'
import type { HouseLayout } from '../game/decos'
import type { RemoteGachaStore,HouseCareState } from '../game/remoteStore'

type Hooks={toast(text:string):void;error(error:unknown):void;wallet():void;coinAvailable(available:boolean):void}
type Life={buildings:Record<string,{level:number;readyAt:number}>;snacks:Record<string,number>}
const snackNames:Record<string,string>={candy:'사탕',cookie:'쿠키',pudding:'푸딩',cake:'딸기 케이크',lunch:'특제 도시락'}
const bg='/assets/bg/house_room_test09.png'
export function houseLotMarkup():string{return `<img class="house-bg" src="${bg}" alt="" draggable="false"/>`}
export function houseVisitMarkup(_layout:HouseLayout):string{return `<div class="house-visit-frame"><div class="house-lot house-visit">${houseLotMarkup()}<div class="house-items"><img class="house-single-chiikawa" src="${CHARACTER_IMAGE_URLS.chiikawa}" alt="치이카와"/></div></div></div>`}
export class HouseView {
  private life:Life={buildings:{},snacks:{}}
  private care:(HouseCareState & {health?:number;messAt?:number;bornAt?:number;favorite?:string;tasted?:string[];memories?:string[];sleepUntil?:number})|null=null
  private busy=false
  private roamTimer:ReturnType<typeof setInterval>|null=null
  private activeTab: 'care'|'snack'|'mission'|'diary'='care'
  private infoOpen=false
  private miniActive=false
  private miniStarted=0
  private miniTick:ReturnType<typeof setInterval>|null=null
  constructor(private readonly root:HTMLElement,private readonly store:RemoteGachaStore,private readonly hooks:Hooks){}
  open():void{
    this.hooks.coinAvailable(false)
    this.renderLot();this.startRoaming();void this.load()
  }
  private startRoaming():void{
    if(this.roamTimer)clearInterval(this.roamTimer)
    this.roamTimer=setInterval(()=>{
      const c=this.care
      const bubble=this.root.querySelector<HTMLElement>('.house-life-bubble')
      if(bubble)bubble.textContent=c?.sleepUntil&&c.sleepUntil>Date.now()?'쿨쿨…':c&&c.hunger<30?'배고파…':c&&c.energy<30?'졸려…':c&&c.clean<30?'씻고 싶어…':c&&c.happy<35?'놀고 싶어…':'기분 좋아!'
    },3200)
  }
  private async load():Promise<void>{try{const [life,care]=await Promise.all([this.store.houseLife(),this.store.houseCare()]);this.life=life.life;this.care=care.care;this.renderLot();this.renderCare()}catch(e){this.hooks.error(e)}}
  handle(action:string,button:HTMLElement):boolean{
    if(action==='house-info'){this.infoOpen=!this.infoOpen;this.renderCare();return true}
    if(action==='house-tab'){const tab=button.dataset.tab;if(tab==='care'||tab==='snack'||tab==='mission'||tab==='diary'){this.activeTab=tab;this.infoOpen=true;this.renderCare()}return true}
    if(action.startsWith('house-care-')){void this.performCare(action.slice(11),button.dataset.snack);return true}
    if(action==='house-mini-start'){void this.adventure('mini-start');return true}
    if(action==='house-mini-stop'){void this.adventure('mini-stop');return true}
    if(action==='house-event'){void this.adventure('event');return true}
    if(action==='house-claim'){void this.adventure('claim');return true}
    if(action==='house-coin')return true
    return false
  }
  private async performCare(action:string,snackId?:string):Promise<void>{
    if(this.busy)return;this.busy=true
    try{const result=await this.store.houseCareAction(action,snackId);this.care=result.care;await this.refreshLife();this.renderCare();this.hooks.wallet();this.hooks.toast(`돌보기 완료! 경험치 +${result.earned}`)}
    catch(e){this.fail(e)}finally{this.busy=false}
  }
  private async adventure(action:'mini-start'|'mini-stop'|'event'|'claim'):Promise<void>{
    if(this.busy)return;this.busy=true
    try{
      const result=await this.store.houseAdventure(action);this.care=result.care
      if(action==='mini-start'){this.miniActive=true;this.miniStarted=Date.now();this.startMiniAnimation()}
      if(action==='mini-stop'){this.miniActive=false;this.stopMiniAnimation()}
      this.renderCare();this.hooks.wallet();this.hooks.toast(result.message+(result.coins?` · ${result.coins.toLocaleString()}코인`:''))
    }catch(e){if(action==='mini-stop'){this.miniActive=false;this.stopMiniAnimation()}this.fail(e)}finally{this.busy=false}
  }
  private startMiniAnimation():void{
    this.stopMiniAnimation();this.miniTick=setInterval(()=>{
      const el=this.root.querySelector<HTMLElement>('.house-mini-pointer');if(!el)return
      const phase=((Date.now()-this.miniStarted)%2200)/2200
      el.style.left=`${phase<=.5?phase*200:(1-phase)*200}%`
    },50)
  }
  private stopMiniAnimation():void{if(this.miniTick){clearInterval(this.miniTick);this.miniTick=null}}
  private async refreshLife():Promise<void>{this.life=(await this.store.houseLife()).life;this.renderLot()}
  private fail(error:unknown):void{const code=(error as {code?:string}).code;const messages:Record<string,string>={insufficient_coins:'코인이 부족해요!',building_required:'시설을 먼저 건설하고 완공을 기다려주세요.',building_in_progress:'건설이 진행 중이에요.',already_built:'이미 건설한 시설이에요.',max_level:'최대 레벨이에요.',care_full:'아직 돌봄이 필요하지 않아요.',care_cooldown:'조금 뒤에 다시 돌봐주세요.',snack_required:'간식이 부족해요.',event_unavailable:'이벤트는 LV.2부터 하루 3번, 3시간 간격으로 가능해요.',no_quest_reward:'수령할 일일 미션 보상이 없어요.',mini_in_progress:'이미 게임 중이에요.',mini_expired:'게임 시간이 끝났어요. 다시 시작해주세요.'};if(code&&messages[code])this.hooks.toast(messages[code]);else this.hooks.error(error)}
  private renderLot():void{
    const el=this.root.querySelector<HTMLElement>('.house-items');if(!el)return
    el.innerHTML=`<img class="house-single-chiikawa" src="${CHARACTER_IMAGE_URLS.chiikawa}" alt="노말 치이카와" draggable="false"/><div class="house-life-bubble" style="position:absolute;left:50%;top:22%;transform:translateX(-50%);background:white;color:#59483e;padding:5px 10px;border-radius:12px;pointer-events:none;z-index:20">안녕!</div>`
  }
  private renderCare():void{
    const el=this.root.querySelector<HTMLElement>('.house-care');if(!el)return
    const c=this.care;if(!c){el.innerHTML='육성 정보를 불러오는 중…';return}
    const stats:[string,number][]=[['배부름',c.hunger],['행복',c.happy],['청결',c.clean],['체력',c.energy],['건강',Math.round(c.health??100)]]
    const emotion=c.hunger<30?'배가 고파요':c.happy<35?'심심해요':c.clean<30?'씻고 싶어요':c.energy<30?'졸려요':c.happy>=80?'아주 행복해요':'기분이 좋아요'
    const missions:[string,string,number][]=[['feed','밥주기',1000],['play','게임하기',1500],['pet','쓰다듬기',500]]
    const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10)
    const currentDay=c.questDay===today
    const canClaim=missions.some(([id])=>currentDay&&(c as HouseCareState & {quests?:Record<string,number>}).quests?.[id]&&!c.claimed?.includes(id))
    const diary=(c.diary||[]).slice(0,6)
    const moodClass=c.hunger<30||c.happy<35||c.clean<30||c.energy<30?'needs-care':'feeling-good'
    const tabs:[string,string][]=[['care','돌보기'],['snack','간식'],['mission','오늘의 할 일'],['diary','성장 일기']]
    const statCards=stats.map(([name,n])=>`<div class="tama-stat"><div class="tama-stat-label"><span>${name}</span><b>${n}%</b></div><div class="house-care-track"><i style="width:${Math.round(n)}%;background:${n<30?'#e8a28d':n<60?'#e6c084':'#91cdb4'}"></i></div></div>`).join('')
    const carePanel=`<div class="tama-panel-heading">치이카와 돌보기 <small>아래 메뉴에서 돌봐주세요</small></div><div class="tama-care-hint">하단 버튼으로 먹이기, 씻기, 놀아주기, 재우기를 할 수 있어요.</div><div class="tama-pet"><button data-action="house-care-medicine" ${(c.health??100)>=100?'disabled':''}>약 먹이기</button><button data-action="house-care-tidy" ${!c.messAt||c.messAt>Date.now()?'disabled':''}>청소</button><button data-action="house-care-pet">쓰다듬기</button><span>친밀도를 올려주세요</span></div><section class="house-tama-section"><strong>타이밍 챌린지</strong><p>게이지를 중앙에 멈춰보세요.</p><div class="house-mini-bar"><span class="house-mini-target"></span><i class="house-mini-pointer"></i></div><button data-action="${this.miniActive?'house-mini-stop':'house-mini-start'}">${this.miniActive?'여기서 멈추기!':'게임 시작'}</button></section><section class="house-tama-section"><strong>깜짝 생활 이벤트</strong><p>LV.2부터 하루 최대 3번 참여할 수 있어요.</p><button data-action="house-event" ${c.level<2?'disabled':''}>이벤트 확인 (${c.eventCount||0}/3)</button></section>`
    const snackPanel=`<div class="tama-panel-heading">간식 주기 <small>뽑기에서 얻은 간식을 먹여주세요</small></div><div class="tama-snack-grid">${Object.entries(snackNames).map(([id,name])=>`<button data-action="house-care-snack" data-snack="${id}" ${(this.life.snacks[id]||0)<=0?'disabled':''}><strong>${name}</strong><span>보유 ${this.life.snacks[id]||0}개</span></button>`).join('')}</div><p class="tama-note">${c.level>=4&&c.favorite&&c.tasted?.includes(c.favorite)?`좋아하는 간식: ${snackNames[c.favorite]}`:'간식을 먹이며 취향을 발견해 보세요.'} 간식뽑기는 1회 10,000코인입니다.</p>`
    const missionPanel=`<div class="tama-panel-heading">오늘의 할 일 <small>매일 치이카와와 추억을 쌓아보세요</small></div><div class="tama-mission-list">${missions.map(([id,name,coins])=>`<div><span>${name}</span><span>${currentDay&&((c as HouseCareState & {quests?:Record<string,number>}).quests?.[id]||0)>0?'완료':'진행 전'}</span><b>${coins.toLocaleString()}코인 ${c.claimed?.includes(id)?'· 수령 완료':''}</b></div>`).join('')}</div><button class="tama-main-button" data-action="house-claim" ${canClaim?'':'disabled'}>미션 보상 받기</button>`
    const diaryPanel=`<div class="tama-panel-heading">성장 일기 <small>치이카와와 함께한 기록 · ${Math.floor((Date.now()-(c.bornAt||Date.now()))/86400000)+1}일차 · 추억 ${c.memories?.length||0}개</small></div><div class="house-diary">${diary.length?diary.map(d=>`<div>${new Date(d.at).toLocaleDateString('ko-KR')} · ${d.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`).join(''):'치이카와와 첫 추억을 만들어보세요.'}</div>`
    const panels:Record<string,string>={care:carePanel,snack:snackPanel,mission:missionPanel,diary:diaryPanel}
    const heartCount=Math.max(0,Math.min(4,Math.ceil((c.hunger+c.happy+c.clean+c.energy)/100)))
    const hearts=Array.from({length:4},(_,i)=>`<span class="tama-heart ${i<heartCount?'filled':''}" aria-hidden="true">♥</span>`).join('')
    const miniStats=`<div class="tama-game-hud" aria-label="육성 상태"><div class="tama-hearts" title="종합 컨디션">${hearts}</div><div class="tama-hud-level">LV.${c.level}</div><div class="tama-hud-mood">${emotion}</div></div>`
    const menu:[string,string,string][]=[['care','⌂','돌보기'],['snack','▣','간식'],['mission','☆','미션'],['diary','▤','일기']]
    el.innerHTML=`<div class="tama-device">${miniStats}<div class="tama-direct-care" aria-label="간편 돌보기">${([['feed','먹이기'],['wash','씻기'],['play','놀아주기'],['sleep','재우기']] as const).map(([id,name])=>`<button data-action="house-care-${id}">${name}</button>`).join('')}</div><div class="tama-game-menu" role="tablist">${menu.map(([id,icon,name])=>`<button class="tama-game-key ${this.activeTab===id&&this.infoOpen?'selected':''}" role="tab" aria-selected="${this.activeTab===id&&this.infoOpen}" data-action="house-tab" data-tab="${id}" title="${name}"><span aria-hidden="true">${icon}</span><small>${name}</small></button>`).join('')}<button class="tama-game-key tama-info-key" data-action="house-info" title="상태 보기"><span aria-hidden="true">${this.infoOpen?'×':'☰'}</span><small>${this.infoOpen?'닫기':'상태'}</small></button></div><div class="tama-drawer ${this.infoOpen?'is-open':''}" ${this.infoOpen?'':'hidden'}><div class="tama-drawer-head"><strong>${this.activeTab==='care'?'치이카와 돌보기':this.activeTab==='snack'?'간식 보관함':this.activeTab==='mission'?'오늘의 할 일':'성장 일기'}</strong><button data-action="house-info" aria-label="닫기">×</button></div><div class="tama-drawer-summary"><div class="tama-level">LV.${c.level}</div><span>친밀도 ${c.affection} · ${c.level>=3?(c.personality||'성격 미발견'):'LV.3 성격 발견'}</span></div><div class="tama-exp"><div class="tama-exp-label"><span>성장 경험치</span><b>${c.level>=10?"MAX":`${c.exp} / ${[150,200,250,300,350,400,450,450,450][Math.min(8,c.level-1)]}`}</b></div><div class="house-care-track"><i style="width:${Math.min(100,c.level>=10?100:c.exp/Math.max(1,[150,200,250,300,350,400,450,450,450][Math.min(8,c.level-1)])*100)}%"></i></div></div><div class="tama-stats">${statCards}</div><div class="tama-tab-content">${panels[this.activeTab]}</div></div></div>`
    if(this.miniActive)this.startMiniAnimation()
  }
}
