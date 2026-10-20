import type { CharacterDef, MoveSlot } from '../engine/types';
import type { Lang } from '../i18n';

/** Move slots in the same order as each fighter's `moves` list in `data/goats.ts`. */
const SLOTS: MoveSlot[] = ['jA', 'n1', 'n2', 'n3', 's1', 's2', 's3', 'sp50', 'sp100'];

interface FighterText { name: string; role: string; moves: string[]; quotes: CharacterDef['quotes'] }

/** Chinese names, roles, move names and lines for the ten original fighters. */
export const FIGHTERS_ZH: Record<string, FighterText> = {
  emberpaw: {
    name: '焰爪', role: '火焰 · 连击',
    moves: ['坠焰', '热身拳', '余烬扫', '升腾火花', '火焰掌', '余烬旋', '烈焰步', '日耀', '火焰之心'],
    quotes: { intro: '爪子小，火花大。', win: '刚热完身！', lose: '火还没灭。', taunt: '太烫了吗？' },
  },
  cloudhop: {
    name: '云跳', role: '疾风 · 机动',
    moves: ['落云', '微风拳', '顺风扫', '冲天踢', '疾风步', '风之冲', '旋风掌', '云爆', '天空之舞'],
    quotes: { intro: '跟得上我吗！', win: '身轻如燕！', lose: '下次可没这么容易！', taunt: '这边这边！' },
  },
  stoneguard: {
    name: '岩卫', role: '岩石 · 重击',
    moves: ['巨石坠', '石拳', '碎石扫', '碎岩上勾拳', '基岩冲', '断层', '岩之脉', '山崩', '群山苏醒'],
    quotes: { intro: '先深呼吸，再开始。', win: '稳住，就能赢。', lose: '山也会动。', taunt: '不着急。' },
  },
  scrapclaw: {
    name: '铁爪', role: '机关 · 压制',
    moves: ['废铁俯冲', '快拳', '偷袭扫', '弹射上勾', '废铁冲', '弹簧陷阱', '火花抛', '废铁风暴', '绝妙馊主意'],
    quotes: { intro: '这招我路上刚想的。', win: '完美计划，大概。', lose: '还差一颗螺丝。', taunt: '看好了！' },
  },
  stormhorn: {
    name: '雷角', role: '雷电 · 远攻',
    moves: ['落雷', '静电拳', '风暴扫', '闪电上勾', '雷霆冲', '电弧脉冲', '风暴环', '滚雷', '风暴之眼'],
    quotes: { intro: '听，风暴要来了。', win: '风暴结束了。', lose: '雷声还会回来。', taunt: '该你了。' },
  },
  mossbite: {
    name: '苔牙', role: '藤蔓 · 投技',
    moves: ['苔藓坠', '花苞拳', '树根扫', '新芽上勾', '藤蔓冲', '根缚', '大地吐息', '森林轰鸣', '花园怒吼'],
    quotes: { intro: '别看我爱笑，出手可不轻！', win: '还要再抱一下吗？', lose: '该长得更壮了。', taunt: '靠近点！' },
  },
  pebblepop: {
    name: '石豆', role: '岩石 · 防御',
    moves: ['石子坠', '轻点拳', '扬尘扫', '岩石上勾', '石子冲', '石墙', '碎石波', '滚石', '小小巨人'],
    quotes: { intro: '个子小，胆子可不小！', win: '小个子也能赢！', lose: '这点伤，没事！', taunt: '啵！' },
  },
  puffvolt: {
    name: '绒电', role: '电光 · 空战',
    moves: ['电花坠', '电击拳', '静电扫', '升空电击', '闪光冲', '电花连射', '云中电', '雷绒爆', '超载'],
    quotes: { intro: '一点火花就够了。', win: '电量满格！', lose: '充电中……', taunt: '滋滋滋！' },
  },
  cinderveil: {
    name: '烬纱', role: '烈焰 · 压制',
    moves: ['烬落', '掌击', '灰烬扫', '余烬上勾', '烬火冲', '灼热掌', '热浪', '余烬之纱', '熔炉之心'],
    quotes: { intro: '每一击都要算数。', win: '出拳要稳，心不能乱。', lose: '我会找到破绽。', taunt: '集中精神。' },
  },
  tideknuckle: {
    name: '潮拳', role: '流水 · 控场',
    moves: ['泡泡坠', '水花拳', '涟漪扫', '浪潮上勾', '激流冲', '水压波', '泡泡爆', '大潮', '怒海连拳'],
    quotes: { intro: '准备好挨水花了吗？', win: '这浪花，够劲吧？', lose: '我还能打！', taunt: '哗啦哗啦！' },
  },
};

const cache = new Map<string, CharacterDef>();

/** The fighter as shown in `lang`. English is the source definition; other languages return a translated copy. */
export function localizeFighter(def: CharacterDef, lang: Lang): CharacterDef {
  if (lang === 'en') return def;
  const text = FIGHTERS_ZH[def.id];
  if (!text) return def;
  const key = `${lang}:${def.id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const moves = { ...def.moves };
  SLOTS.forEach((slot, index) => { moves[slot] = { ...moves[slot], name: text.moves[index] }; });
  const localized: CharacterDef = {
    ...def, name: text.name, role: text.role, moves, quotes: text.quotes,
    ending: `${text.name}带着新的故事和更强的斗志离开了浮空竞技场。`,
    endingHard: `竞技场的灯光渐暗，${text.name}已经在准备下一场挑战。`,
  };
  cache.set(key, localized);
  return localized;
}
