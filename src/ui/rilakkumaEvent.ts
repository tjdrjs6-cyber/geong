import '../styles/rilakkumaEvent.css'

type Mission = {id:string;reward:number;target:number;progress:number;claimed:boolean}
type EventState = {active:boolean;day:string;end:string;balance:number;welcomeClaimed:boolean;missions:Mission[];shop:{id:string;price:number;owned:boolean}[]}
const shopNames:Record<string,string>={rilakkuma:'리락쿠마',korilakkuma:'코리락쿠마',chairoikoguma:'차이로이코구마',rilakkuma_chiikawa:'리락쿠마(치이카와)',korilakkuma_kani:'코리락쿠마(카니)'}
const labels:Record<string,string>={attendance:'오늘 출석',weed:'제초장 잡초 10개 수거',expedition:'원정대 캐릭터 1회 배치',claw:'인형뽑기 10회 (자동 포함)',chat:'전체채팅 1회 작성',lottery:'겅이복권 1회 이용'}
async function api(path:string,body?:object):Promise<EventState>{
  const res=await fetch(path,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})})
  if(!res.ok)throw new Error(res.status===401?'로그인 후 이용할 수 있어요.':'잠시 후 다시 시도해 주세요.')
  return res.json() as Promise<EventState>
}
export function installRilakkumaEvent():void{
  const btn=document.createElement('button');btn.className='ril-event-trigger';btn.innerHTML='<img src="/assets/rilakkuma_event_coin.png" alt=""/>리락쿠마 이벤트<i class="ril-event-dot" hidden></i>';btn.type='button' 
  const overlay=document.createElement('div');overlay.className='ril-event-overlay';overlay.hidden=true
  const panel=document.createElement('section');panel.className='ril-event-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','리락쿠마 이벤트 미션')
  overlay.append(panel);document.body.append(overlay)
  const place=()=>{const expedition=document.querySelector('.expedition-entry');if(expedition?.parentElement)expedition.insertAdjacentElement('afterend',btn)}
  place()
  new MutationObserver(()=>{if(!btn.isConnected)place()}).observe(document.body,{childList:true,subtree:true})
  let busy=false
  const dot=btn.querySelector<HTMLElement>('.ril-event-dot')
  const updateDot=(state:EventState)=>{const ready=state.active&&state.missions.some(m=>!m.claimed&&m.progress>=m.target);if(dot)dot.hidden=!state.active||(!ready&&sessionStorage.getItem('ril-event-visited')==='1')}
  const refreshBadge=async()=>{try{updateDot(await api('/api/rilakkuma-event'))}catch{if(dot)dot.hidden=true}}
  const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))
  function draw(state:EventState):void{
    updateDot(state)
    panel.innerHTML=`<header class="ril-event-header"><div><small>11.12 — 11.22</small><h2>리락쿠마 이벤트</h2><p>매일 미션을 완료하고 직접 보상을 수령해요!</p></div><button class="ril-event-close" type="button" aria-label="닫기">×</button></header>
      <div class="ril-event-balance">보유 이벤트 코인 <strong><img src="/assets/rilakkuma_event_coin.png" alt=""/> ${state.balance.toLocaleString('ko-KR')}개</strong></div>
      <p class="ril-event-hint">첫 접속 보너스 50개 자동 지급 · 일일 최대 100개 · 한국시간 09시 초기화</p>
      <div class="ril-event-missions">${state.missions.map(m=>`<div class="ril-event-mission"><div class="ril-event-copy"><b>${esc(labels[m.id]||m.id)}</b><span>${m.progress}/${m.target} 달성 · 보상 ${m.reward}개</span></div><button type="button" data-claim="${esc(m.id)}" ${!state.active||m.claimed||m.progress<m.target?'disabled':''}>${m.claimed?'수령 완료':m.progress>=m.target?'보상 수령':'진행 중'}</button></div>`).join('')}</div>
      <section class="ril-event-shop"><h3>리락쿠마 한정 교환소</h3><p>이벤트 코인으로 각 캐릭터를 한 번씩 교환할 수 있어요.</p><div class="ril-event-shop-grid">${(state.shop||[]).map(c=>`<article class="ril-event-shop-item"><img src="/assets/chars/${esc(c.id)}.png" alt=""/><b>${esc(shopNames[c.id]||c.id)}</b><small>${c.price===150?'에픽':'레전더리'} · 한정판</small><button type="button" data-exchange="${esc(c.id)}" ${!state.active||c.owned||state.balance<c.price?'disabled':''}>${c.owned?'교환 완료':`${c.price}코인 교환`}</button></article>`).join('')}</div></section>
      <footer>${state.active?'11월 22일 23:59까지 참여할 수 있어요.':'이벤트가 종료되었습니다.'}</footer>`
    panel.querySelectorAll<HTMLButtonElement>('[data-exchange]').forEach(b=>b.addEventListener('click',async()=>{
      if(busy)return
      const id=b.dataset.exchange||''
      if(!confirm(`${shopNames[id]||id} 캐릭터를 이벤트 코인으로 교환할까요?`))return
      busy=true;b.disabled=true
      try{
        const response=await fetch('/api/rilakkuma-event/exchange',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({characterId:id})})
        const result=await response.json()
        if(!response.ok)throw new Error(result.error==='already_owned'?'이미 보유한 캐릭터예요.':result.error==='insufficient_event_coins'?'이벤트 코인이 부족해요.':'교환에 실패했어요.')
        draw(result as EventState)
        alert('캐릭터 교환 완료! 게임 화면에 반영하려면 새로고침해 주세요.')
      }catch(e){alert(e instanceof Error?e.message:'교환 실패');await refresh()}
      finally{busy=false}
    }))
    panel.querySelector('.ril-event-close')?.addEventListener('click',()=>{overlay.hidden=true})
    panel.querySelectorAll<HTMLButtonElement>('[data-claim]').forEach(b=>b.addEventListener('click',async()=>{
      if(busy)return;busy=true;b.disabled=true
      try{draw(await api('/api/rilakkuma-event/claim',{mission:b.dataset.claim}))}
      catch(e){alert(e instanceof Error?e.message:'수령 실패');await refresh()}
      finally{busy=false}
    }))
  }
  async function refresh():Promise<void>{
    try{draw(await api('/api/rilakkuma-event'))}
    catch(e){panel.innerHTML=`<button class="ril-event-close" type="button">닫기</button><p class="ril-event-error">${esc(e instanceof Error?e.message:'서버 연결 오류')}</p>`;panel.querySelector('.ril-event-close')?.addEventListener('click',()=>{overlay.hidden=true})}
  }
  btn.addEventListener('click',()=>{overlay.hidden=false;sessionStorage.setItem('ril-event-visited','1');void refresh()})
  window.setInterval(()=>{if(document.visibilityState==='visible')void refreshBadge()},15000)
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refreshBadge()})
  void refreshBadge()
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.hidden=true})
  // Account authentication is handled by the existing game; refresh after opening the event.
}
