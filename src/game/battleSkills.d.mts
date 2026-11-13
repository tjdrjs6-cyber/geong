export type SkillMember={id:string;tier:string;power:number}
export type SkillEffect={id:string;name:string;kind:'support'|'strike'|'ultimate'}
export function skillInfo(id:string,tier?:string):{id:string;name:string;kind:'support'|'strike'|'ultimate';cooldown:number;chance:number;multiplier:number;buff:number;duration:number;description:string}
export function skillTick(members:(SkillMember|null)[],baseExtra:number,tickAt:number):{damage:number;active:SkillEffect[];buff:number;characterBase:number}
