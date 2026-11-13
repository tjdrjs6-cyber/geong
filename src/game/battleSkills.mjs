/** Deterministic, server-authoritative combat skills; identical in browser previews. */
const names = {
 rilakkuma:'느긋한 일격',korilakkuma:'장난꾸러기 돌진',chairoikoguma:'숲의 기운',rilakkuma_chiikawa:'곰돌이 용기',korilakkuma_kani:'수줍은 집게',pepero_chiikawa:'달콤한 응원',
 chiikawa:'용기의 일격',hachiware:'힘내자!',usagi:'우라 돌격',momonga:'귀여움 공격',kurimanju:'기합 한 모금',shisa:'씩씩한 응원',kani:'반짝 집게',goblin:'도깨비 기습',rakko:'검술의 달인',armor1:'갑옷 돌진',armor2:'갑옷 방패',armor3:'갑옷 삼연격',
 m_chiikawa:'인어의 물방울',m_hachiware:'바다의 응원',m_usagi:'파도 돌격',m_momonga:'물거품 환영',m_kurimanju:'심해의 기합',m_shisa:'산호의 축복',m_kani:'진주 집게',m_rakko:'해류 베기',hanip:'잎새 회오리',duip:'쌍잎 바람',
 siren:'세이렌의 노래',shimajiro:'호랑이 발톱',anoko:'숨겨진 힘',dekatsuyo:'거대한 강타',c_curry:'매콤한 용기',h_curry:'카레 응원',u_curry:'매운 돌격',ginger_chiikawa:'진저 펀치',ginger_hachiware:'진저 응원',ginger_usagi:'진저 난타',beetle_berserk:'광폭 돌진',kurimanju_bean:'콩의 기합',rakko_limited:'전설의 검격',beetle:'풍뎅이 돌격',honey:'꿀맛 회복',ode:'오데의 응원',ode_prison:'탈출 돌격',usagi_orange:'주황빛 폭주',
 halloween_chiikawa:'호박 일격',halloween_hachiware:'유령의 응원',halloween_usagi:'할로윈 난타',pajama_chiikawa:'꿈속 용기',pajama_hachiware:'잘자요 응원',pajama_usagi:'꿈나라 돌격',staff_chiikawa:'토벌봉 일격',staff_hachiware:'토벌봉 연격',staff_usagi:'토벌봉 폭주',devil_momonga:'악마의 장난',angel_momonga:'천사의 가호',siren_curry:'초월의 해일'
}
const supports = new Set(['hachiware','shisa','m_hachiware','m_shisa','h_curry','ginger_hachiware','halloween_hachiware','pajama_hachiware','angel_momonga','honey','ode','pepero_chiikawa','chairoikoguma'])
const durations = {normal:18,mermaid:18,rare:18,super:21,legendary:24,transcendent:30}
const levels = {normal:0,mermaid:1,rare:2,super:3,legendary:4,transcendent:5}
export function skillInfo(id, tier='normal') {
 const level = levels[tier] ?? 0
 const support = supports.has(id)
 const cooldown = durations[tier] ?? 18
 const chance = Math.max(8, 18-level*2)
 const multiplier = Number((1.55+level*.19).toFixed(2))
 const buff = 4+level*2
 return {id,name:names[id]||'특별한 일격',kind:support?'support':(level>=4?'ultimate':'strike'),cooldown,chance,multiplier,buff,duration:6,
  description:support?`${cooldown}초마다 6초간 팀 캐릭터 공격 피해 +${buff}% (자동 발동)`:`공격 시 ${chance}% 확률로 자신의 공격 피해 ${multiplier}배 (자동 발동)`}
}
/** Stable pseudorandom roll. No persisted RNG or exploitable client-reported damage. */
function roll(id, tick) { let h=2166136261;for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619);h=Math.imul(h^(tick|0),2246822519);h^=h>>>13;return (h>>>0)%10000 }
export function skillTick(members, baseExtra, tickAt) {
 const tick=Math.floor(tickAt/3000)
 let total=baseExtra, bonus=0, active=[]
 for(const member of members){if(!member)continue;const s=skillInfo(member.id,member.tier);if(s.kind==='support'){
   const period=s.cooldown/3; const phase=roll(member.id,0)%period;const since=(tick-phase+period*1000000)%period
   if(since<s.duration/3){bonus+=s.buff; if(since===0)active.push({id:member.id,name:s.name,kind:'support'})}
 }else{
   const hit=roll(member.id,tick)<s.chance*100
   total+=member.power*(hit?s.multiplier:1)
   if(hit)active.push({id:member.id,name:s.name,kind:s.kind})
 }}
 // Supports buff character damage only, not weapons/accessories/achievements.
 const characterBase=members.reduce((sum,m)=>sum+(m?.power||0),0)
 const characterDamage=total-baseExtra
 return {damage:Math.max(0,Math.round(baseExtra+characterDamage*(1+Math.min(20,bonus)/100))),active,buff:Math.min(20,bonus),characterBase}
}
