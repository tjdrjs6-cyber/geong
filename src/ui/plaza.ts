import { CHARACTER_IMAGE_URLS } from '../game/characterImageUrls'
type Player={id:number;x:number;y:number;nickname:string;featured:string|null;pet:string|null;emote:string;online:boolean}
type Message={id:number;nickname:string;message:string;at:number}
type State={channel:number;me:number;onlineCount:number;players:Player[];shops:{id:number;x:number;y:number;expires_ms:number;nickname:string;featured:string|null;pet:string|null}[];messages:Message[]}
const PET_IMAGES:Record<string,string>={momonga:'/assets/pets/momonga.png',kurimanju:'/assets/pets/kurimanju.png',usagi:'/assets/pets/usagi.png',chiikawa:'/assets/pets/chiikawa.png',hachiware:'/assets/pets/hachiware.png'}
const PET_GRADES:Record<string,string>={normal:'노말',rare:'레어',epic:'에픽',unique:'유니크'}
const PET_NAMES:Record<string,string>={momonga:'모몽가',kurimanju:'쿠리만쥬',usagi:'우사기',chiikawa:'치이카와',hachiware:'하치와레'}
const safe=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))
async function api<T>(path:string,body?:object):Promise<T>{const r=await fetch('/api/plaza'+path,{credentials:'include',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!r.ok)throw new Error('서버 연결 또는 요청 오류');return r.json()}
export class Plaza {
 private vy=0;private grounded=true;private jumpRequested=false;private timer=0;private moveTimer=0;private state:State|null=null;private x=50;private y=50;private keys=new Set<string>();private joy={x:0,y:0};private active=false;private syncing=false;private lastMove=0;private bound=false
 constructor(private root:HTMLElement,private featured:()=>string|null){this.setupWorld();this.bind()}
 private notice(message:string){
  const card=this.panel.querySelector<HTMLElement>('.plaza-card')!;
  let toast=card.querySelector<HTMLElement>('.plaza-game-notice');if(!toast){toast=document.createElement('div');toast.className='plaza-game-notice';toast.setAttribute('role','status');card.append(toast)}
  toast.textContent=message;toast.classList.add('is-visible');window.setTimeout(()=>{if(toast?.textContent===message)toast.classList.remove('is-visible')},2800)
 }
 private confirmGame(message:string):Promise<boolean>{
  return new Promise(resolve=>{const card=this.panel.querySelector<HTMLElement>('.plaza-card')!;const overlay=document.createElement('div');overlay.className='plaza-game-overlay';overlay.innerHTML=`<div class="plaza-game-dialog" role="dialog" aria-modal="true"><h3>확인</h3><p>${safe(message)}</p><div><button data-choice="no">취소</button><button data-choice="yes">확인</button></div></div>`;card.append(overlay);overlay.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.addEventListener('click',()=>{const yes=b.dataset.choice==='yes';overlay.remove();resolve(yes)}));overlay.querySelector<HTMLButtonElement>('[data-choice="no"]')?.focus()})
 }
 private setupWorld(){const map=this.panel.querySelector<HTMLElement>('.plaza-map');if(!map||map.querySelector('.plaza-world'))return;const world=document.createElement('div');world.className='plaza-world';const controls=map.querySelector('.plaza-mobile-controls');while(map.firstChild)world.appendChild(map.firstChild);map.appendChild(world);if(controls)map.appendChild(controls);
  for(const y of [24,52,82]){const ledge=document.createElement('div');ledge.className='plaza-platform';ledge.style.top=y+'%';world.append(ledge)}
  for(const x of [28,72]){const ladder=document.createElement('div');ladder.className='plaza-ladder';ladder.style.left=x+'%';ladder.style.top='24%';ladder.style.height='58%';world.append(ladder)}
  for(const [x,y] of [[12,24],[48,24],[84,24],[12,52],[48,52],[84,52],[18,82],[82,82]]){
   const spot=document.createElement('span');spot.className='plaza-platform-shop';spot.style.left=x+'%';spot.style.top=y+'%';spot.textContent='판매 구역';world.append(spot)
  }
 }
 private camera(){
  const map=this.panel.querySelector<HTMLElement>('.plaza-map'),world=map?.querySelector<HTMLElement>('.plaza-world');
  if(!map||!world)return;
  const maxX=Math.max(0,world.offsetWidth-map.clientWidth),maxY=Math.max(0,world.offsetHeight-map.clientHeight);
  const px=world.offsetWidth*this.x/100-map.clientWidth*.5,py=world.offsetHeight*this.y/100-map.clientHeight*.55;
  world.style.transform=`translate3d(${-Math.max(0,Math.min(maxX,px))}px,${-Math.max(0,Math.min(maxY,py))}px,0)`
 }
 private get panel(){return this.root.querySelector<HTMLElement>('[data-screen="plaza"]')!}
 private bind(){if(this.bound)return;this.bound=true
  window.addEventListener('keydown',e=>{if(!this.active||!(this.panel.contains(document.activeElement)||document.activeElement===document.body))return;if((e.target as HTMLElement).matches('input,textarea,[contenteditable]'))return;const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){this.keys.add(key);e.preventDefault()}if((key===' '||key==='space')&&!e.repeat){this.jumpRequested=true;e.preventDefault()}if(key==='enter'){this.panel.querySelector<HTMLInputElement>('.plaza-input')?.focus()}})
  window.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{this.keys.clear();this.joy={x:0,y:0}})
  const stick=this.panel.querySelector<HTMLElement>('.plaza-joystick')!;const knob=stick.querySelector<HTMLElement>('.plaza-stick')!;
  const update=(e:PointerEvent)=>{const rect=stick.getBoundingClientRect(),dx=e.clientX-(rect.left+rect.width/2),dy=e.clientY-(rect.top+rect.height/2),length=Math.max(1,Math.hypot(dx,dy));this.joy={x:dx/Math.max(32,length),y:dy/Math.max(32,length)};knob.style.transform=`translate(${this.joy.x*25}px,${this.joy.y*25}px)`}
  stick.addEventListener('pointerdown',e=>{stick.setPointerCapture(e.pointerId);update(e);e.preventDefault()});stick.addEventListener('pointermove',e=>{if(stick.hasPointerCapture(e.pointerId))update(e)});const end=()=>{this.joy={x:0,y:0};knob.style.transform=''};stick.addEventListener('pointerup',end);stick.addEventListener('pointercancel',end)
  this.panel.querySelector<HTMLButtonElement>('.plaza-jump')?.addEventListener('pointerdown',e=>{this.jumpRequested=true;e.preventDefault()});
  this.panel.querySelector<HTMLElement>('.plaza-shop-panel')?.addEventListener('click',e=>{const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button[data-shop-action]');if(!button)return;void this.shopAction(button.dataset.shopAction||'',Number(button.dataset.id||0))})
  this.panel.querySelector<HTMLInputElement>('.plaza-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void this.send()}})
 }
 async enter(){if(this.active)return;this.active=true;this.state=null;await this.sync();if(!this.active)return;this.camera();this.timer=window.setInterval(()=>void this.sync(),1000);this.moveTimer=window.setInterval(()=>this.tick(),80)}
 leave(){if(!this.active)return;this.active=false;clearInterval(this.timer);clearInterval(this.moveTimer);this.keys.clear();this.joy={x:0,y:0};void api('/leave',{}).catch(()=>{})}
 private async sync(){if(this.syncing||!this.active)return;this.syncing=true;try{const data=await api<State>('');if(!this.active)return;if(!this.state){const me=data.players.find(p=>p.id===data.me);if(me){this.x=me.x;this.y=this.snapFloor(me.y)}}this.state=data;this.render()}catch{this.panel.querySelector<HTMLElement>('.plaza-status')!.textContent='연결 확인 중...'}finally{this.syncing=false}}
 private snapFloor(y:number){return [24,52,82].reduce((a,b)=>Math.abs(y-b)<Math.abs(y-a)?b:a,82)}
 private onLadder(){return [28,72].some(x=>Math.abs(this.x-x)<4)}
 private tick(){
  if(!this.active||!this.state)return;
  let dx=this.joy.x,dy=this.joy.y;
  for(const k of this.keys){if(k==='a'||k==='arrowleft')dx--;if(k==='d'||k==='arrowright')dx++;if(k==='w'||k==='arrowup')dy--;if(k==='s'||k==='arrowdown')dy++}
  const oldY=this.y,ladder=this.onLadder();
  this.x=Math.max(3,Math.min(97,this.x+Math.max(-1,Math.min(1,dx))*.65));
  if(ladder&&Math.abs(dy)>.18){
   this.vy=0;this.grounded=false;this.y=Math.max(24,Math.min(82,this.y+Math.max(-1,Math.min(1,dy))*.8));
  }else{
   if(this.jumpRequested&&this.grounded){this.vy=-2.05;this.grounded=false}
   this.vy=Math.min(1.15,this.vy+.14);this.y=Math.max(14,Math.min(82,this.y+this.vy));
   if(this.vy>=0){
    const floor=[24,52,82].find(y=>oldY<=y&&this.y>=y);
    if(floor!==undefined){this.y=floor;this.vy=0;this.grounded=true}
   }
  }
  this.jumpRequested=false;
  const mine=this.panel.querySelector<HTMLElement>(`.plaza-player[data-id="${this.state.me}"]`);
  if(mine){mine.style.left=this.x+'%';mine.style.top=this.y+'%';mine.classList.toggle('is-airborne',!this.grounded)}
  this.camera();
  const now=Date.now();if(now-this.lastMove>=240){this.lastMove=now;void api('/move',{x:this.x,y:this.y}).catch(()=>{})}
 }
 private render(){const s=this.state;if(!s)return;this.panel.querySelector<HTMLElement>('.plaza-status')!.textContent=`${s.channel}채널 · 접속 ${s.onlineCount}/20명 · 자리 남긴 유저 ${s.players.length-s.onlineCount}명`;
 const players=this.panel.querySelector<HTMLElement>('.plaza-players')!;const existing=new Map(Array.from(players.querySelectorAll<HTMLElement>('.plaza-player')).map(el=>[Number(el.dataset.id),el]));for(const p of s.players){let el=existing.get(p.id);if(!el){el=document.createElement('div');el.className='plaza-player';el.dataset.id=String(p.id);players.append(el)}existing.delete(p.id);const avatar=p.featured&&CHARACTER_IMAGE_URLS[p.featured as keyof typeof CHARACTER_IMAGE_URLS]||CHARACTER_IMAGE_URLS.chiikawa;const src=el.querySelector('img')?.getAttribute('src');if(src!==avatar){el.replaceChildren();const img=document.createElement('img');img.src=avatar;img.alt='';el.append(img);const name=document.createElement('span');name.className='plaza-name';el.append(name);const bubble=document.createElement('span');bubble.className='plaza-bubble';el.append(bubble)}let petImage=el.querySelector<HTMLImageElement>('.plaza-pet');if(p.pet&&PET_IMAGES[p.pet]){if(!petImage){petImage=document.createElement('img');petImage.className='plaza-pet';petImage.alt='동행 펫';el.append(petImage)}if(petImage.getAttribute('src')!==PET_IMAGES[p.pet])petImage.src=PET_IMAGES[p.pet]}else petImage?.remove();el.querySelector<HTMLElement>('.plaza-name')!.textContent=p.nickname;const last=[...s.messages].reverse().find(m=>m.nickname===p.nickname&&Date.now()-m.at<4000);const bubble=el.querySelector<HTMLElement>('.plaza-bubble')!;bubble.textContent=last?.message||'';bubble.hidden=!last;el.classList.toggle('is-me',p.id===s.me);el.classList.toggle('is-away',!p.online);el.title=p.online?'접속 중':'자리 유지 중';el.style.left=(p.id===s.me?this.x:p.x)+'%';el.style.top=Math.max(24,p.id===s.me?this.y:p.y)+'%'}for(const el of existing.values())el.remove();for(const el of Array.from(players.querySelectorAll('.plaza-shop-sign,.plaza-shop-spirit')))el.remove();for(const sh of s.shops||[]){const sign=document.createElement('button');sign.type='button';sign.className='plaza-shop-sign';sign.style.left=sh.x+'%';sign.style.top=sh.y+'%';const owner=s.players.find(p=>p.id===sh.id);const nickname=sh.nickname||owner?.nickname||'유저';const featured=sh.featured||owner?.featured||'';const pet=sh.pet||owner?.pet||'';const spirit=document.createElement('span');spirit.className='plaza-shop-spirit';
 spirit.style.left=sh.x+'%';spirit.style.top=sh.y+'%';
 const avatar=document.createElement('img');avatar.src=CHARACTER_IMAGE_URLS[featured as keyof typeof CHARACTER_IMAGE_URLS]||CHARACTER_IMAGE_URLS.chiikawa;avatar.alt='상점 주인 대표 캐릭터';spirit.append(avatar);
 if(pet&&PET_IMAGES[pet]){const companion=document.createElement('img');companion.className='plaza-shop-spirit-pet';companion.src=PET_IMAGES[pet];companion.alt='상점 주인 펫';spirit.append(companion)}
 players.append(spirit);
 const title=document.createElement('span');title.className='plaza-stall-title';title.textContent=nickname+'의 상점';
 const hint=document.createElement('span');hint.className='plaza-stall-hint';hint.textContent='상품 둘러보기';
 sign.append(title,hint);sign.title=nickname+'의 상점 보기';
 sign.addEventListener('click',()=>{void this.openShop('browse',sh.id)});players.append(sign)}this.camera();
 const log=this.panel.querySelector<HTMLElement>('.plaza-chat')!;const latest=s.messages.at(-1)?.id||0;if(log.dataset.last!==String(latest)){const atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<55;log.innerHTML=s.messages.map(m=>`<div><b>${safe(m.nickname)}</b>: ${safe(m.message)}</div>`).join('');log.dataset.last=String(latest);if(atBottom)log.scrollTop=log.scrollHeight}}
 async pet(){const panel=this.panel.querySelector<HTMLElement>('.plaza-shop-panel')!;panel.hidden=false;await this.loadPets()}
 private async loadPets(){
  const panel=this.panel.querySelector<HTMLElement>('.plaza-shop-panel')!;
  try{const r=await fetch('/api/pets',{credentials:'include'});if(!r.ok)throw Error('pets');const d=await r.json() as {boxes:{id:number;grade:string;listing_id:number|null}[];pets:{id:number;kind:string;grade:string;used:number;trades:number;listing_id:number|null}[];equipped:number;collection:{kind:string;grade:string}[]};
   panel.innerHTML=`<div class="plaza-shop-title"><b>펫 보관함 · 도감</b><button data-shop-action="hide">닫기</button></div><p>펫은 한 마리만 동행할 수 있으며 등급별 능력치가 적용됩니다.</p><div class="plaza-shop-list"><b>펫박스 ${d.boxes.length}개</b>${d.boxes.map(b=>`<div><img class="pet-item-image" src="/assets/pets/box_normal.png" alt=""/> ${PET_GRADES[b.grade||'normal']||'노말'} 펫박스 ${b.listing_id?'(판매 중)':`<button data-shop-action="openbox" data-id="${b.id}">개봉</button>`}</div>`).join('')||'<p>보유한 펫박스가 없습니다.</p>'}</div><div class="plaza-shop-list"><b>보유 펫</b>${d.pets.map(x=>`<div><img class="pet-item-image" src="${PET_IMAGES[x.kind]||''}" alt=""/> ${PET_NAMES[x.kind]||''} · ${PET_GRADES[x.grade||'normal']||'노말'} ${x.id===d.equipped?'(동행 중)':''} ${x.listing_id?'(판매 중)':`<button data-shop-action="usepet" data-id="${x.id}">${x.used?'장착':'사용·도감등록'}</button>`} ${!x.used&&!x.trades&&!x.listing_id?'(거래 1회 가능)':''}</div>`).join('')||'<p>보유한 펫이 없습니다.</p>'}${d.equipped?'<button data-shop-action="unequip">펫 장착 해제</button>':''}</div><div class="plaza-shop-list"><b>펫 도감 (${new Set([...(d.collection||[]),...d.pets].map(x=>`${x.grade||'normal'}:${x.kind}`)).size}/20종)</b><p>${Object.keys(PET_NAMES).map(k=>`${PET_NAMES[k]}: ${[...(d.collection||[]),...d.pets].some(x=>x.kind===k)?'등록':'미등록'}`).join(' · ')}</p></div>`;
  }catch{panel.textContent='펫 정보를 불러오지 못했습니다.'}
 }
 private shopView:'browse'|'mine'='browse';private selectedSeller:number|null=null;
 async shop(){const panel=this.panel.querySelector<HTMLElement>('.plaza-shop-panel')!;if(!panel.hidden){panel.hidden=true;return}await this.openShop('browse')}
 private async openShop(view:'browse'|'mine',seller:number|null=null){this.selectedSeller=view==='browse'?seller:null;this.shopView=view;this.panel.querySelector<HTMLElement>('.plaza-shop-panel')!.hidden=false;await this.loadShop()}
 private async loadShop(){
  const panel=this.panel.querySelector<HTMLElement>('.plaza-shop-panel')!;
  panel.innerHTML='<div class="plaza-market-loading">상점 정보를 불러오는 중...</div>';
  try{
   const [sr,pr,mr]=await Promise.all([fetch('/api/plaza/shop',{credentials:'include'}),fetch('/api/pets',{credentials:'include'}),fetch('/api/pets/market',{credentials:'include'})]);
   if(!sr.ok||!pr.ok||!mr.ok)throw Error('shop');
   const s=await sr.json() as {me:number;shops:{id:number;expires_ms:number}[]};
   const p=await pr.json() as {boxes:{id:number;grade:string;listing_id:number|null;trades?:number}[]};
   const m=await mr.json() as {listings:{id:number;seller_id:number;item_type:string;kind:string|null;grade?:string;price:number;seller_nickname?:string}[]};
   const mine=s.shops.find(x=>x.id===s.me);
   const grade=(g?:string)=>PET_GRADES[g||'normal']||'노말';
   const price=(n:number)=>Number(n).toLocaleString('ko-KR');
   const fmt=(n:number)=>Math.max(0,Math.ceil((n-Date.now())/60000));
   const visibleListings=this.shopView==='browse'&&this.selectedSeller!==null?m.listings.filter(l=>l.seller_id===this.selectedSeller):m.listings;
   const tabs=this.selectedSeller===null?`<div class="plaza-market-tabs"><button data-shop-action="browse" class="${this.shopView==='browse'?'is-selected':''}">상품 둘러보기</button><button data-shop-action="mine" class="${this.shopView==='mine'?'is-selected':''}">내 상점 관리</button></div>`:'';
   const head=`<div class="plaza-shop-title"><div><strong>${this.selectedSeller===null?'거래 광장':'판매자 상점'}</strong><small>${this.selectedSeller===null?'유저끼리 펫박스를 거래하는 공간':'해당 판매자의 상품만 표시됩니다.'}</small></div><button data-shop-action="hide" aria-label="상점 닫기">닫기</button></div>${tabs}`;
   let body='';
   if(this.shopView==='browse'){
    body=`<div class="plaza-market-intro"><b>판매 중인 상품 <em>${visibleListings.length}개</em></b><span>다이아 결제 · 구매 전 가격을 확인하세요</span></div><div class="plaza-market-grid">${visibleListings.map(l=>`<article class="plaza-market-item"><div class="plaza-market-art"><img src="${l.item_type==='box'?'/assets/pets/box_normal.png':PET_IMAGES[l.kind||'']||'/assets/pets/box_normal.png'}" alt="" loading="lazy"/></div><div class="plaza-market-item-info"><strong>${l.item_type==='box'?grade(l.grade)+' 펫박스':(PET_NAMES[l.kind||'']||'펫')}</strong><small>${l.seller_id===s.me?'내가 등록한 상품':`판매자 ${safe(l.seller_nickname||'다른 유저')}`}</small><b>${price(l.price)} 다이아</b></div>${l.seller_id===s.me?'<span class="plaza-market-own">판매 중</span>':`<button data-shop-action="buypet" data-id="${l.id}">구매</button>`}</article>`).join('')||'<p class="plaza-market-empty">현재 판매 중인 상품이 없습니다. 내 상점에서 첫 상품을 등록해 보세요.</p>'}</div>`;
   }else{
    const available=p.boxes.filter(x=>!x.listing_id&&!x.trades);
    const myListings=m.listings.filter(l=>l.seller_id===s.me);
    body=`<div class="plaza-market-status"><div><strong>${mine?'내 상점 운영 중':'내 상점 준비'}</strong><small>${mine?`남은 시간 ${fmt(mine.expires_ms)}분 · 최대 5개 판매 가능`:'상점을 열면 보유한 미개봉 펫박스를 등록할 수 있습니다.'}</small></div>${mine?'<button data-shop-action="close">상점 닫기</button>':'<button data-shop-action="open">상점 열기</button>'}</div><div class="plaza-market-section"><h3>내 판매 상품 <span>${myListings.length}개</span></h3>${myListings.length?myListings.map(l=>`<div class="plaza-market-myitem"><img src="/assets/pets/box_normal.png" alt=""/><span>${grade(l.grade)} 펫박스</span><b>${price(l.price)} 다이아</b></div>`).join(''):'<p class="plaza-market-empty">등록된 판매 상품이 없습니다.</p>'}</div>${mine?`<div class="plaza-market-section"><h3>판매할 펫박스 선택 <span>${available.length}개 보유</span></h3><p class="plaza-market-tip">최소 판매가 1,000다이아 · 판매 수수료 10% · 미개봉 박스 최초 1회 거래</p>${available.map(x=>`<div class="plaza-market-register"><img src="/assets/pets/box_normal.png" alt=""/><span>${grade(x.grade)} 펫박스</span><input type="number" min="1000" step="100" inputmode="numeric" placeholder="1,000 이상" aria-label="${grade(x.grade)} 펫박스 판매가격" data-price-id="box-${x.id}"/><button data-shop-action="listpet" data-type="box" data-id="${x.id}">판매 등록</button></div>`).join('')||'<p class="plaza-market-empty">판매 가능한 펫박스가 없습니다.</p>'}</div>`:''}`;
   }
   panel.innerHTML=head+`<div class="plaza-market-body">${body}</div>`;
  }catch{panel.innerHTML='<div class="plaza-shop-title"><strong>거래 광장</strong><button data-shop-action="hide">닫기</button></div><p class="plaza-market-empty">상점 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>'}
 }
 private async shopAction(action:string,id:number){const panel=this.panel.querySelector<HTMLElement>('.plaza-shop-panel')!;if(action==='hide'){panel.hidden=true;return}if(action==='browse'||action==='mine'){if(this.selectedSeller!==null&&action==='mine')return;await this.openShop(action);return}if(['buypet','openbox','usepet','close'].includes(action)){
    const msg=action==='buypet'?'다이아로 구매하시겠습니까?':action==='openbox'?'펫박스를 개봉하시겠습니까?':action==='usepet'?'이 펫을 장착하시겠습니까?':'상점을 닫고 미판매 상품을 반환하시겠습니까?';
    if(!await this.confirmGame(msg))return
  }
  const button=panel.querySelector<HTMLButtonElement>(`button[data-shop-action="${action}"][data-id="${id}"]`);const type=button?.dataset.type||'';
  try{const request=async(path:string,body:object={})=>{const r=await fetch(path,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('request');return r.json()};
   if(action==='open'||action==='close'){try{await request('/api/plaza/shop/'+action)}catch{this.notice(action==='open'?'상점은 지정된 판매 구역에서만 열 수 있습니다. 빈 판매 자리로 이동해 주세요.':'상점을 닫지 못했습니다.');return}}
   else if(action==='listpet'){const price=Number(panel.querySelector<HTMLInputElement>(`[data-price-id="${type}-${id}"]`)?.value);if(type==='box'&&(!Number.isFinite(price)||price<1000)){this.notice('펫박스는 1,000다이아 이상부터 판매할 수 있습니다.');return}await request('/api/pets/list',{itemType:type,itemId:id,price})}
   else if(action==='buypet')await request('/api/pets/buy',{listingId:id});
   else if(action==='openbox'){const result=await request('/api/pets/open',{boxId:id});this.notice(result.pet?`${PET_NAMES[result.pet.kind]} ${PET_GRADES[result.pet.grade||'normal']} 펫을 획득했습니다!`:'꽝! 펫이 나오지 않았습니다.')}
   else if(action==='usepet')await request('/api/pets/use',{petId:id});
   else if(action==='unequip')await request('/api/pets/unequip');
   if(['openbox','usepet','unequip'].includes(action))await this.loadPets();else await this.loadShop();
   if(!['openbox'].includes(action))this.notice('처리가 완료되었습니다.')
  }catch{this.notice('요청을 처리하지 못했습니다. 아이템 상태·다이아·상점 위치를 확인해주세요.');if(['openbox','usepet','unequip'].includes(action))await this.loadPets();else await this.loadShop()}
 }
 async send(){const input=this.panel.querySelector<HTMLInputElement>('.plaza-input')!;const message=input.value.trim();if(!message)return;try{await api('/chat',{message});input.value='';await this.sync()}catch{this.panel.querySelector<HTMLElement>('.plaza-hint')!.textContent='채팅 전송 실패 · 잠시 후 다시 시도해주세요'}}

}
