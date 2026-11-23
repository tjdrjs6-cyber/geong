import './houseRedesign.css'
import { CHARACTER_IMAGE_URLS } from '../game/characterImageUrls'
import type { HouseLayout } from '../game/decos'
import type { RemoteGachaStore,HouseCareState } from '../game/remoteStore'

type Hooks={toast(text:string):void;error(error:unknown):void;wallet():void;coinAvailable(available:boolean):void}
type Life={buildings:Record<string,{level:number;readyAt:number}>;snacks:Record<string,number>}
const facilities=[{id:'arcade',name:'게임기',price:100000,img:'/assets/house/arcade.png',action:'play'},{id:'shower',name:'샤워장',price:80000,img:'/assets/house/shower.png',action:'wash'},{id:'bed',name:'침대',price:30000,img:'/assets/house/bed.png',action:'sleep'},{id:'kitchen',name:'부엌',price:50000,img:'/assets/house/kitchen.png',action:'feed'}] as const
const snackNames:Record<string,string>={candy:'사탕',cookie:'쿠키',pudding:'푸딩',cake:'딸기 케이크',lunch:'특제 도시락'}
const bg='/assets/bg/house_room_test09.png'
export function houseLotMarkup():string{return `<img class="house-bg" src="${bg}" alt="" draggable="false"/>`}
export function houseVisitMarkup(_layout:HouseLayout):string{return `<div class="house-visit-frame"><div class="house-lot house-visit">${houseLotMarkup()}<div class="house-items"><img class="house-single-chiikawa" src="${CHARACTER_IMAGE_URLS.chiikawa}" alt="치이카와"/></div></div></div>`}
export class HouseView {
  private life:Life={buildings:{},snacks:{}}
  private care:HouseCareState|null=null
  private busy=false
  constructor(private readonly root:HTMLElement,private readonly store:RemoteGachaStore,private readonly hooks:Hooks){}
  open():void{this.hooks.coinAvailable(false);this.renderLot();void this.load()}
  private async load():Promise<void>{try{const [life,care]=await Promise.all([this.store.houseLife(),this.store.houseCare()]);this.life=life.life;this.care=care.care;this.renderLot();this.renderCare()}catch(e){this.hooks.error(e)}}
  handle(action:string,button:HTMLElement):boolean{
    if(action==='house-build'||action==='house-upgrade'){const id=button.dataset.id;if(id)void this.build(action==='house-build'?'build':'upgrade',id);return true}
    if(action.startsWith('house-care-')){void this.performCare(action.slice(11),button.dataset.snack);return true}
    if(action==='house-coin')return true
    return false
  }
  private async build(action:'build'|'upgrade',id:string):Promise<void>{
    if(this.busy)return;this.busy=true
    try{const result=await this.store.houseLifeAction(action,id);this.life=result.life;this.renderLot();this.renderCare();this.hooks.wallet();this.hooks.toast(action==='build'?'시설 건설을 시작했어요!':'시설 업그레이드 완료!')}
    catch(e){this.fail(e)}finally{this.busy=false}
  }
  private async performCare(action:string,snackId?:string):Promise<void>{
    if(this.busy)return;this.busy=true
    try{const result=await this.store.houseCareAction(action,snackId);this.care=result.care;await this.refreshLife();this.renderCare();this.hooks.wallet();this.hooks.toast(`돌보기 완료! 경험치 +${result.earned}`)}
    catch(e){this.fail(e)}finally{this.busy=false}
  }
  private async refreshLife():Promise<void>{this.life=(await this.store.houseLife()).life;this.renderLot()}
  private fail(error:unknown):void{const code=(error as {code?:string}).code;const messages:Record<string,string>={insufficient_coins:'코인이 부족해요!',building_required:'시설을 먼저 건설하고 완공을 기다려주세요.',building_in_progress:'건설이 진행 중이에요.',already_built:'이미 건설한 시설이에요.',max_level:'최대 레벨이에요.',care_full:'아직 돌봄이 필요하지 않아요.',care_cooldown:'조금 뒤에 다시 돌봐주세요.',snack_required:'간식이 부족해요.'};if(code&&messages[code])this.hooks.toast(messages[code]);else this.hooks.error(error)}
  private renderLot():void{
    const el=this.root.querySelector<HTMLElement>('.house-items');if(!el)return
    el.innerHTML=`<div class="house-life-grid">${facilities.map(f=>{const b=this.life.buildings[f.id],ready=b&&b.readyAt<=Date.now();return `<section class="house-life-cell"><strong>${f.name}</strong>${b?`<img src="${f.img}" alt="${f.name}"/><small>${ready?`LV.${b.level}`:'건설 중'}</small>${ready&&b.level<3?`<button data-action="house-upgrade" data-id="${f.id}">강화 ${b.level===1?'100,000':'300,000'}코인</button>`:''}${ready?`<button data-action="house-care-${f.action}">이용하기</button>`:''}`:`<div class="house-life-placeholder">미건설</div><button data-action="house-build" data-id="${f.id}">건설 ${f.price.toLocaleString()}코인</button>`}</section>`}).join('')}</div><img class="house-single-chiikawa" src="${CHARACTER_IMAGE_URLS.chiikawa}" alt="노말 치이카와"/>`
  }
  private renderCare():void{
    const el=this.root.querySelector<HTMLElement>('.house-care');if(!el)return
    const c=this.care;if(!c){el.innerHTML='육성 정보를 불러오는 중…';return}
    const stats:[string,number][]=[['배부름',c.hunger],['행복',c.happy],['청결',c.clean],['체력',c.energy]]
    el.innerHTML=`<div class="house-care-head"><strong>치이카와 키우기 · LV.${c.level}</strong><span>EXP ${c.exp}/${c.level*50} · 친밀도 ${c.affection}</span></div><div class="house-care-stats">${stats.map(([name,n])=>`<div><span>${name} ${n}%</span><div class="house-care-track"><i style="width:${n}%"></i></div></div>`).join('')}</div><div class="house-care-actions"><button data-action="house-care-pet">쓰다듬기</button></div><div class="house-snack-list"><strong>간식주기 · 보유 간식</strong>${Object.entries(snackNames).map(([id,name])=>`<button data-action="house-care-snack" data-snack="${id}" ${(this.life.snacks[id]||0)<=0?'disabled':''}>${name} (${this.life.snacks[id]||0})</button>`).join('')}</div>`
  }
}
