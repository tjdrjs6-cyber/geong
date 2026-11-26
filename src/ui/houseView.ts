import './houseRedesign.css'
import type { HouseLayout } from '../game/decos'
import type { RemoteGachaStore,HouseCareState } from '../game/remoteStore'

type Hooks={toast(text:string):void;error(error:unknown):void;wallet():void;coinAvailable(available:boolean):void}
type Life={buildings:Record<string,{level:number;readyAt:number}>;snacks:Record<string,number>}
const snackNames:Record<string,string>={candy:'사탕',cookie:'쿠키',pudding:'푸딩',cake:'딸기 케이크',lunch:'특제 도시락'}
const snackBond:Record<string,number>={candy:20,cookie:25,pudding:30,cake:40,lunch:50}
const relations=[{min:0,name:'처음 만난 사이'},{min:500,name:'조금 친해진 사이'},{min:1500,name:'친한 친구'},{min:3000,name:'단짝 친구'},{min:5000,name:'소중한 친구'},{min:10000,name:'둘도 없는 친구'},{min:20000,name:'가족 같은 사이'},{min:35000,name:'영원한 단짝'},{min:50000,name:'운명적인 만남'},{min:100000,name:'최고의 동반자'}]
const bg='/assets/bg/house_room_test09.png'
export function houseLotMarkup():string{return `<img class="house-bg" src="${bg}" alt="" draggable="false"/>`}
export function houseVisitMarkup(_layout:HouseLayout):string{return `<div class="house-visit-frame"><div class="house-lot house-visit">${houseLotMarkup()}<div class="house-items"><img class="house-single-chiikawa" src="/assets/house/care-chiikawa.png" alt="치이카와"/></div></div></div>`}
export class HouseView {
  private life:Life={buildings:{},snacks:{}}
  private care:(HouseCareState & {health?:number;messAt?:number;bornAt?:number;favorite?:string;tasted?:string[];memories?:string[];sleepUntil?:number})|null=null
  private chiPos={x:50,y:56}
  private bubbleTimer:ReturnType<typeof setTimeout>|null=null
  private busy=false
  private careClock:ReturnType<typeof setInterval>|null=null
  private roamTimer:ReturnType<typeof setInterval>|null=null
  private activeTab: 'care'|'snack'|'mission'|'diary'='care'
  private infoOpen=false
  private careDialog:HTMLDialogElement|null=null
  constructor(private readonly root:HTMLElement,private readonly store:RemoteGachaStore,private readonly hooks:Hooks){}
  open():void{
    this.hooks.coinAvailable(false)
    this.renderLot();this.startRoaming();void this.load()
    if(this.careClock)clearInterval(this.careClock)
    this.careClock=setInterval(()=>this.updateCareClock(),1000)
  }
  private remaining(ms:number):string{
    const n=Math.max(0,Math.ceil(ms/1000));return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,'0')).join(':')
  }
  private updateCareClock():void{
    const c=this.care;if(!c)return
    const now=Date.now(), sleep=c.sleepUntil??0
    this.syncAppearance()
    const banner=this.root.querySelector<HTMLElement>('.tama-sleep-clock')
    if(banner){banner.hidden=sleep<=now;banner.textContent=sleep>now?`수면 중 · 기상까지 ${this.remaining(sleep-now)} · ${new Date(sleep).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})} 기상 예정`:''}
    this.root.querySelectorAll<HTMLElement>('[data-care-clock]').forEach(el=>{
      const action=el.dataset.careClock||''
      const due=Math.max(c.cooldowns[action]||0,action==='sleep'?sleep:0)
      let label=due>now?this.remaining(due-now):'대기시간 없음'
      const blocked=sleep>now&&['feed','wash','play','sleep','snack'].includes(action)
      if(['feed','wash','play','sleep','snack'].includes(action)){const button=el.closest('button');if(button){button.disabled=false;button.style.opacity=blocked?'0.55':''}}
      if(blocked)label='수면 중'
      if(action==='tidy'&&due<=now)label=c.messAt&&c.messAt<=now?'이용 가능':c.messAt?`응가까지 ${this.remaining(c.messAt-now)}`:'청소할 응가 없음'
      if(action==='pet'&&due<=now)label='이용 가능'
      el.textContent=label;el.classList.toggle('ready',label==='이용 가능'||label==='대기시간 없음')
    })
  }
  private placeChiikawa():void{
    const actor=this.root.querySelector<HTMLElement>('.house-roaming-actor');if(!actor)return
    actor.style.left=`${this.chiPos.x}%`;actor.style.top=`${this.chiPos.y}%`
  }
  private startRoaming():void{
    if(this.roamTimer)clearInterval(this.roamTimer)
    this.roamTimer=setInterval(()=>{
      const lot=this.root.querySelector<HTMLElement>('.house-lot')
      if(!lot||!lot.getClientRects().length||this.root.getAttribute('aria-hidden')==='true')return
      this.syncMess()
      if(this.busy||this.bubbleTimer|| (this.care?.sleepUntil??0)>Date.now()||Math.random()<.25)return
      const y=Math.max(49,Math.min(65,this.chiPos.y+(Math.random()-.5)*14))
      const half=Math.max(5,25*(1-Math.abs(y-57.5)/19))
      const x=Math.max(50-half,Math.min(50+half,this.chiPos.x+(Math.random()-.5)*24))
      this.chiPos={x,y};this.placeChiikawa()
    },3200)
  }
  private speak():void{
    const c=this.care
    const lines=!c?['안녕!','반가워!']:
      (c.sleepUntil??0)>Date.now()?['쿨쿨…','조금만 더 잘래…']:
      (c.health??100)<50?['몸이 안 좋아…','약 먹고 싶어…']:
      c.hunger<50?['배고파…','맛있는 거 먹고 싶어!']:
      c.clean<50?['꼬질꼬질해…','씻고 싶어!']:
      c.energy<50?['졸려…','조금 쉬고 싶어.']:
      c.happy<35?['나랑 놀아줘…','심심해…']:
      c.messAt&&c.messAt<=Date.now()?['응가했어…','청소해 줘!']:
      ['오늘도 기분이 좋아!','너랑 함께 있어서 행복해!','반가워!','같이 놀자!']
    const bubble=this.root.querySelector<HTMLElement>('.house-life-bubble');if(!bubble)return
    bubble.textContent=lines[Math.floor(Math.random()*lines.length)];bubble.hidden=false
    if(this.bubbleTimer)clearTimeout(this.bubbleTimer)
    this.bubbleTimer=setTimeout(()=>{bubble.hidden=true;this.bubbleTimer=null},3000)
  }
  private async load():Promise<void>{try{const [life,care]=await Promise.all([this.store.houseLife(),this.store.houseCare()]);this.life=life.life;this.care=care.care;this.renderLot();this.renderCare()}catch(e){this.hooks.error(e)}}
  handle(action:string,button:HTMLElement):boolean{
    if(action==='house-info'){this.infoOpen=!this.infoOpen;this.renderCare();return true}
    if(action==='house-tab'){const tab=button.dataset.tab;if(tab==='care'||tab==='snack'||tab==='mission'||tab==='diary'){this.activeTab=tab;this.infoOpen=true;this.renderCare()}return true}
    if(action.startsWith('house-care-')){this.confirmCare(action.slice(11),button.dataset.snack);return true}
    if(action==='house-event'){void this.adventure('event');return true}
    if(action==='house-claim'){void this.adventure('claim');return true}
    if(action==='house-coin')return true
    return false
  }
  private showCareDialog(title:string,message:string,confirm?:()=>void):void{
    this.careDialog?.close();this.careDialog?.remove()
    const dialog=document.createElement('dialog');dialog.className='house-care-dialog';dialog.setAttribute('aria-label',title)
    const heading=document.createElement('h3');heading.textContent=title
    const body=document.createElement('p');body.textContent=message
    const actions=document.createElement('div');actions.className='house-care-dialog-actions'
    const close=()=>{dialog.close();dialog.remove();if(this.careDialog===dialog)this.careDialog=null}
    if(confirm){const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';cancel.onclick=close;actions.append(cancel)}
    const ok=document.createElement('button');ok.type='button';ok.textContent='확인';ok.onclick=()=>{ok.disabled=true;close();confirm?.()};actions.append(ok)
    dialog.addEventListener('cancel',e=>{e.preventDefault();close()});dialog.append(heading,body,actions);this.root.append(dialog);this.careDialog=dialog;dialog.showModal()
  }
  private fullCareMessage(action:string):string{
    return ({feed:'아직 치이카와가 배고프지 않습니다.',wash:'치이카와가 아직 깨끗합니다.',play:'치이카와가 충분히 행복한 상태입니다.',sleep:'치이카와가 아직 피곤하지 않습니다.',medicine:'치이카와가 건강합니다. 약을 먹일 필요가 없습니다.',tidy:'하우스에 치울 응가가 없습니다.',snack:'치이카와가 충분히 배부르고 행복합니다.'} as Record<string,string>)[action]||'아직 돌봄이 필요하지 않습니다.'
  }
  private careUnavailable(action:string,snackId?:string):string|undefined{
    const c=this.care;if(!c)return '육성 정보를 불러오는 중입니다.'
    const now=Date.now(),sleep=c.sleepUntil??0
    if(sleep>now&&['feed','wash','play','sleep','snack'].includes(action))return action==='sleep'?'치이카와가 이미 자고 있습니다.':`치이카와가 자고 있습니다. 일어난 후 이용해 주세요.\n기상까지 ${this.remaining(sleep-now)}`
    if(action==='snack'&&(!snackId||!(this.life.snacks[snackId]>0)))return '간식이 부족합니다.'
    const due=c.cooldowns[action]||0
    if(due>now)return `${action==='pet'?'조금 뒤에 다시 쓰다듬어 주세요.':'아직 이용할 수 없습니다.'}\n남은 시간 ${this.remaining(due-now)}`
    if((action==='feed'&&c.hunger>75)||(action==='wash'&&c.clean>65)||(action==='play'&&c.happy>75)||(action==='sleep'&&c.energy>80)||(action==='medicine'&&(c.health??100)>=100)||(action==='tidy'&&(!c.messAt||c.messAt>now)))return this.fullCareMessage(action)
    const cost=action==='feed'?1000:action==='medicine'?5000:0
    if(cost&&this.store.data.gems<cost)return `코인이 부족합니다.\n필요 코인: ${cost.toLocaleString()}코인`
  }
  private async confirmCare(action:string,snackId?:string):Promise<void>{
    if(this.busy||this.careDialog)return
    this.busy=true
    try{this.care=(await this.store.houseCare()).care;this.renderCare()}catch{this.showCareDialog('돌보기 안내','현재 상태를 확인하지 못했습니다. 다시 시도해 주세요.');return}finally{this.busy=false}
    const prompts:Record<string,[string,string]>={feed:['먹이기','치이카와에게 밥을 먹이시겠습니까?\n1,000코인 · 배부름 +25%'],wash:['씻기기','치이카와를 씻기시겠습니까?\n무료 · 청결 +35%'],sleep:['재우기','치이카와를 재우시겠습니까?\n무료 · 체력 +20%'],play:['놀아주기','치이카와와 놀아주시겠습니까?\n무료 · 행복 +25% · 체력 -10% · 친밀도 +10'],medicine:['약 먹이기','치이카와에게 약을 먹이시겠습니까?\n5,000코인 · 건강 +30%'],tidy:['청소','하우스를 청소하시겠습니까?\n응가 제거'],pet:['쓰다듬기','치이카와를 쓰다듬으시겠습니까?\n친밀도 +5'],snack:['간식','치이카와에게 간식을 먹이시겠습니까?']}
    const prompt=prompts[action];if(!prompt)return
    const unavailable=this.careUnavailable(action,snackId);if(unavailable){this.showCareDialog(`${prompt[0]} 안내`,unavailable);return}
    this.showCareDialog(prompt[0],action==='snack'&&snackId?`${prompt[1]}\n친밀도 +${snackBond[snackId]} (좋아하는 간식은 50% 추가)`:prompt[1],()=>void this.performCare(action,snackId,prompt[0]))
  }
  private async performCare(action:string,snackId:string|undefined,label:string):Promise<void>{
    if(this.busy)return;this.busy=true
    try{
      const before=this.care;const result=await this.store.houseCareAction(action,snackId);this.care=result.care
      if(action==='snack'&&snackId)this.life.snacks[snackId]=Math.max(0,(this.life.snacks[snackId]||0)-1)
      this.renderLot();this.renderCare();this.hooks.wallet()
      const stats=['hunger','happy','clean','energy','health','affection'] as const
      const names=['배부름','행복','청결','체력','건강','친밀도']
      const after=this.care;const changes=stats.map((key,i)=>{const delta=Math.round((after[key]??100)-(before?.[key]??after[key]??100));return delta?`${names[i]} ${delta>0?'+':''}${delta}${key==='affection'?'':'%'}`:''}).filter(Boolean)
      this.showCareDialog(`${label} 완료!`,[...changes,`경험치 +${result.earned}`,result.spent?`${result.spent.toLocaleString()}코인 사용`:''].filter(Boolean).join('\n'))
    }catch(e){
      const err=e as {code?:string;nextAt?:number};const remaining=Math.ceil(((err.nextAt??this.care?.cooldowns[action]??0)-Date.now())/1000)
      const messages:Record<string,string>={care_sleeping:'치이카와가 자고 있어요. 기상 후 다시 돌봐주세요.',care_full:this.fullCareMessage(action),care_cooldown:remaining>0?`다시 이용하려면 ${Math.floor(remaining/60)}분 ${remaining%60}초 기다려 주세요.`:'조금 뒤에 다시 돌봐주세요.',insufficient_coins:`코인이 부족합니다.\n필요 코인: ${(action==='medicine'?5000:1000).toLocaleString()}코인`,snack_required:'간식이 부족해요.',login_required:'다시 로그인해 주세요.'}
      this.showCareDialog(`${label} 안내`,messages[err.code||'']||'처리 결과를 확인하지 못했습니다. 상태를 새로 확인한 뒤 다시 시도해 주세요.')
    }finally{this.busy=false}
  }
  private async adventure(action:'event'|'claim'):Promise<void>{
    if(this.busy)return;this.busy=true
    try{
      const result=await this.store.houseAdventure(action);this.care=result.care
      this.renderCare();this.hooks.wallet();this.hooks.toast(result.message+(result.coins?` · ${result.coins.toLocaleString()}코인`:'')+(result.diamonds?` · ${result.diamonds.toLocaleString()}다이아`:''))
    }catch(e){this.fail(e)}finally{this.busy=false}
  }
  private fail(error:unknown):void{const code=(error as {code?:string}).code;const messages:Record<string,string>={insufficient_coins:'코인이 부족해요!',building_required:'시설을 먼저 건설하고 완공을 기다려주세요.',building_in_progress:'건설이 진행 중이에요.',already_built:'이미 건설한 시설이에요.',max_level:'최대 레벨이에요.',care_full:'아직 돌봄이 필요하지 않아요.',care_cooldown:'조금 뒤에 다시 돌봐주세요.',snack_required:'간식이 부족해요.',event_unavailable:'이벤트는 LV.2부터 하루 3번, 3시간 간격으로 가능해요.',no_quest_reward:'수령할 일일 미션 보상이 없어요.',mini_in_progress:'이미 게임 중이에요.',mini_expired:'게임 시간이 끝났어요. 다시 시작해주세요.'};if(code&&messages[code])this.hooks.toast(messages[code]);else this.hooks.error(error)}
  private syncAppearance():void{
    const img=this.root.querySelector<HTMLImageElement>('.house-items .house-single-chiikawa');if(!img)return
    const c=this.care
    const sleeping=(c?.sleepUntil??0)>Date.now()
    const sick=c!==null&&(c.health??100)<50
    const tired=c!==null&&c.energy<50
    const hungry=c!==null&&c.hunger<50
    const dirty=c!==null&&c.clean<50
    const variant=sleeping?'sleeping':sick?'sick':tired?'tired':hungry?'hungry':dirty?'dirty':''
    const src=`/assets/house/care-chiikawa${variant?'-'+variant:''}.png`
    if(img.getAttribute('src')!==src)img.src=src
    if(variant==='hungry'){
      img.style.setProperty('transform-origin','50% 100%')
      img.style.setProperty('transform','translateX(14%) scale(1.27)','important')
    }else{
      img.style.removeProperty('transform-origin')
      img.style.removeProperty('transform')
    }
    img.alt=sleeping?'잠자는 치이카와':sick?'아픈 치이카와':tired?'졸린 치이카와':hungry?'배고픈 치이카와':dirty?'꼬질꼬질한 치이카와':'치이카와'
  }
  private syncMess():void{
    this.syncAppearance()
    const el=this.root.querySelector<HTMLElement>('.house-items');if(!el)return
    const due=!!this.care?.messAt&&this.care.messAt<=Date.now()
    const existing=el.querySelector<HTMLImageElement>('.house-care-mess')
    if(due&&!existing){
      // Stable pseudo-random position from the persisted mess timestamp.
      let seed=(this.care!.messAt! % 4294967296) >>> 0
      const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
      let x=50,y=70
      for(let i=0;i<128;i++){
        const px=7+random()*86,py=42+random()*31
        const edge=Math.abs(px-50)/48.2
        // Inset the diamond floor to keep the entire sprite inside.
        if(py<38.4+16.9*edge+3.5||py>76.9-19.7*edge-3.5)continue
        if(Math.abs(px-50)<12&&Math.abs(py-56)<11)continue
        x=px;y=py;break
      }
      const img=document.createElement('img')
      img.className='house-care-mess';img.src='/assets/house/care-mess.png';img.alt='응가';img.draggable=false
      img.style.left=`${x}%`;img.style.top=`${y}%`;el.appendChild(img)
    }
    if(!due&&existing)existing.remove()
  }
  private renderLot():void{
    const el=this.root.querySelector<HTMLElement>('.house-items');if(!el)return
    if(this.bubbleTimer){clearTimeout(this.bubbleTimer);this.bubbleTimer=null}
    el.innerHTML=`<div class="house-roaming-actor"><img class="house-single-chiikawa" src="/assets/house/care-chiikawa.png" alt="치이카와" draggable="false" role="button" tabindex="0"/><div class="house-life-bubble" hidden aria-live="polite"></div></div>`
    const img=el.querySelector<HTMLImageElement>('.house-single-chiikawa')!
    img.addEventListener('click',()=>this.speak())
    img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.speak()}})
    this.placeChiikawa()
    this.syncMess()
  }
  private renderCare():void{
    this.syncAppearance()
    const el=this.root.querySelector<HTMLElement>('.house-care');if(!el)return
    const c=this.care;if(!c){el.innerHTML='육성 정보를 불러오는 중…';return}
    const stats:[string,number][]=[['배부름',c.hunger],['행복',c.happy],['청결',c.clean],['체력',c.energy],['건강',Math.round(c.health??100)]]
    const emotion=c.hunger<50?'배가 고파요':c.happy<35?'심심해요':c.clean<30?'씻고 싶어요':c.energy<50?'졸려요':c.happy>=80?'아주 행복해요':'기분이 좋아요'
    const missions:[string,string,number][]=[['feed','밥주기',500],['play','놀아주기',500],['pet','쓰다듬기',500]]
    const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10)
    const currentDay=c.questDay===today
    const canClaim=missions.some(([id])=>currentDay&&(c as HouseCareState & {quests?:Record<string,number>}).quests?.[id]&&!c.claimed?.includes(id))
    const diary=(c.diary||[]).slice(0,6)
    const moodClass=c.hunger<50||c.happy<35||c.clean<30||c.energy<50?'needs-care':'feeling-good'
    const tabs:[string,string][]=[['care','돌보기'],['snack','간식'],['mission','오늘의 할 일'],['diary','성장 일기']]
    const statCards=stats.map(([name,n])=>`<div class="tama-stat"><div class="tama-stat-label"><span>${name}</span><b>${n}%</b></div><div class="house-care-track"><i style="width:${Math.round(n)}%;background:${n<30?'#e8a28d':n<60?'#e6c084':'#91cdb4'}"></i></div></div>`).join('')
    const carePanel=`<div class="tama-panel-heading">치이카와 돌보기 <small>아래 메뉴에서 돌봐주세요</small></div><div class="tama-care-hint">하단 버튼으로 먹이기, 씻기, 놀아주기, 재우기를 할 수 있어요.</div><div class="tama-pet"><button data-action="house-care-medicine">약 먹이기<small class="tama-care-clock" data-care-clock="medicine"></small></button><button data-action="house-care-tidy">청소<small class="tama-care-clock" data-care-clock="tidy"></small></button><button data-action="house-care-pet">쓰다듬기<small class="tama-care-clock" data-care-clock="pet"></small></button><span>친밀도를 올려주세요</span></div><section class="house-tama-section"><strong>깜짝 생활 이벤트</strong><p>LV.2부터 하루 최대 3번 참여할 수 있어요.</p><button data-action="house-event" ${c.level<2?'disabled':''}>이벤트 확인 (${c.eventCount||0}/3)</button></section>`
    const snackPanel=`<div class="tama-panel-heading">간식 주기 <small class="tama-care-clock" data-care-clock="snack"></small></div><div class="tama-snack-grid">${Object.entries(snackNames).map(([id,name])=>`<button data-action="house-care-snack" data-snack="${id}"><img src="/assets/house/snack-${id}.png" alt="" style="width:40px;height:40px;object-fit:contain"/><strong>${name}</strong><span>보유 ${this.life.snacks[id]||0}개</span><span>친밀도 +${snackBond[id]}</span></button>`).join('')}</div><p class="tama-note">${c.level>=4&&c.favorite&&c.tasted?.includes(c.favorite)?`좋아하는 간식: ${snackNames[c.favorite]}`:'간식을 먹이며 취향을 발견해 보세요.'} 간식뽑기는 1회 200다이아, 10+1회 2,000다이아입니다.</p>`
    const missionPanel=`<div class="tama-panel-heading">오늘의 할 일 <small>매일 치이카와와 추억을 쌓아보세요</small></div><div class="tama-mission-list">${missions.map(([id,name,diamonds])=>`<div><span>${name}</span><span>${currentDay&&((c as HouseCareState & {quests?:Record<string,number>}).quests?.[id]||0)>0?'완료':'진행 전'}</span><b>${diamonds.toLocaleString()}다이아 ${c.claimed?.includes(id)?'· 수령 완료':''}</b></div>`).join('')}</div><button class="tama-main-button" data-action="house-claim" ${canClaim?'':'disabled'}>미션 보상 받기</button>`
    const diaryPanel=`<div class="tama-panel-heading">성장 일기 <small>치이카와와 함께한 기록 · ${Math.floor((Date.now()-(c.bornAt||Date.now()))/86400000)+1}일차 · 추억 ${c.memories?.length||0}개</small></div><div class="house-diary">${diary.length?diary.map(d=>`<div>${new Date(d.at).toLocaleDateString('ko-KR')} · ${d.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`).join(''):'치이카와와 첫 추억을 만들어보세요.'}</div>`
    const panels:Record<string,string>={care:carePanel,snack:snackPanel,mission:missionPanel,diary:diaryPanel}
    const heartCount=Math.max(0,Math.min(4,Math.ceil((c.hunger+c.happy+c.clean+c.energy)/100)))
    const hearts=Array.from({length:4},(_,i)=>`<span class="tama-heart ${i<heartCount?'filled':''}" aria-hidden="true">♥</span>`).join('')
    const rank=relations.reduce((r,v,i)=>c.affection>=v.min?i:r,0), rel=relations[rank], next=relations[rank+1];
    const bondPanel=`<div class="tama-bond" style="padding:8px 12px;text-align:center"><strong>친밀도 ${rank+1}단계 · ${rel.name}</strong><div>${c.affection.toLocaleString()}${next?' / '+next.min.toLocaleString():''}</div><div class="house-care-track"><i style="width:${next?Math.min(100,(c.affection-rel.min)/(next.min-rel.min)*100):100}%"></i></div><small>${next?'다음 관계: '+next.name+' · '+(next.min-c.affection).toLocaleString()+' 남음':'최고 관계 달성'}</small></div>`;
    const miniStats=`<div class="tama-game-hud" aria-label="육성 상태"><div class="tama-hearts" title="종합 컨디션">${hearts}</div><div class="tama-hud-level">LV.${c.level}</div><div class="tama-hud-mood">${emotion}</div></div>`
    const menu:[string,string,string][]=[['care','⌂','돌보기'],['snack','▣','간식'],['mission','☆','미션'],['diary','▤','일기']]
    el.innerHTML=`<div class="tama-device">${miniStats}${bondPanel}<div class="tama-sleep-clock" hidden></div><div class="tama-direct-care" aria-label="간편 돌보기">${([['feed','먹이기'],['wash','씻기'],['play','놀아주기'],['sleep','재우기']] as const).map(([id,name])=>`<button data-action="house-care-${id}">${name}<small class="tama-care-clock" data-care-clock="${id}"></small></button>`).join('')}</div><div class="tama-game-menu" role="tablist">${menu.map(([id,icon,name])=>`<button class="tama-game-key ${this.activeTab===id&&this.infoOpen?'selected':''}" role="tab" aria-selected="${this.activeTab===id&&this.infoOpen}" data-action="house-tab" data-tab="${id}" title="${name}"><span aria-hidden="true">${icon}</span><small>${name}</small></button>`).join('')}<button class="tama-game-key tama-info-key" data-action="house-info" title="상태 보기"><span aria-hidden="true">${this.infoOpen?'×':'☰'}</span><small>${this.infoOpen?'닫기':'상태'}</small></button></div><div class="tama-drawer ${this.infoOpen?'is-open':''}" ${this.infoOpen?'':'hidden'}><div class="tama-drawer-head"><strong>${this.activeTab==='care'?'치이카와 돌보기':this.activeTab==='snack'?'간식 보관함':this.activeTab==='mission'?'오늘의 할 일':'성장 일기'}</strong><button data-action="house-info" aria-label="닫기">×</button></div><div class="tama-drawer-summary"><div class="tama-level">LV.${c.level}</div><span>친밀도 ${c.affection} · ${c.level>=3?(c.personality||'성격 미발견'):'LV.3 성격 발견'}</span></div><div class="tama-exp"><div class="tama-exp-label"><span>성장 경험치</span><b>${c.level>=10?"MAX":`${c.exp} / ${[150,200,250,300,350,400,450,450,450][Math.min(8,c.level-1)]}`}</b></div><div class="house-care-track"><i style="width:${Math.min(100,c.level>=10?100:c.exp/Math.max(1,[150,200,250,300,350,400,450,450,450][Math.min(8,c.level-1)])*100)}%"></i></div></div><div class="tama-stats">${statCards}</div><div class="tama-tab-content">${panels[this.activeTab]}</div></div></div>`
    this.updateCareClock()
  }
}
