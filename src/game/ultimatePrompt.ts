/**
 * The FastH3 Omni prompt for a voice ultimate. FastH3 only sees one opening frame and this text, so the prompt has
 * to say who is who, where each fighter stands, who attacks whom, and how the hit resolves — otherwise the model
 * picks its own attacker, swaps sides, or ends on a pose with no impact.
 *
 * Written in the structure Reactor's prompt guide recommends: <Picture N> / <Subject N> labels, one clear beat,
 * then Camera / Dialogue / Soundscape / Music lines. A Chinese interface gets the same structure written in Chinese,
 * with the player's Chinese words kept verbatim and the move name shouted in Chinese.
 */
import type { Lang } from '../i18n';

/** What each fighter looks like (from the approved character sheets) and what their power is made of. */
export const FIGHTER_LOOKS: Record<string, { look: string; element: string }> = {
  emberpaw: { look: 'a small upright cinnamon red panda with a long ringed orange tail, rust-red sleeveless wrap jacket and cream sash', element: 'fire and embers' },
  cloudhop: { look: 'a lavender rabbit with long pink-lined ears, mint sleeveless wrap jacket, peach sash and chunky mint boots', element: 'swirling wind' },
  stoneguard: { look: 'a broad upright brown capybara with a calm sleepy face, ochre wrap tunic and huge basalt gauntlets with glowing amber cracks', element: 'rock and earth' },
  scrapclaw: { look: 'an agile gray raccoon with a black eye mask, ringed fluffy tail, teal vest and copper knuckle guards', element: 'sparking scrap-metal gadgets' },
  stormhorn: { look: 'a strong upright ram with large curled brass-colored horns, pale wool, indigo tunic and brass bracers', element: 'thunder and lightning' },
  mossbite: { look: 'a stocky moss-green dragon with a cream belly, two small ivory horns, a thick leaf-tipped tail and no wings', element: 'roots, vines and leaves' },
  pebblepop: { look: 'a round navy-and-cream penguin martial artist with big eyes, an amber sleeveless vest and chunky flipper fists', element: 'bouncing pebbles and stone' },
  puffvolt: { look: 'a fluffy silver-lilac chinchilla with huge round ears, a short plum combat jacket and gold wrist bands', element: 'crackling static electricity' },
  cinderveil: { look: 'an adult woman martial artist with dark brown skin, short white curly hair, a small bronze half mask and a coral-and-charcoal battle jacket', element: 'smoldering embers' },
  tideknuckle: { look: 'a cute upright blue axolotl with coral external gills, a cream belly, navy waist wrap and teal bracers', element: 'crashing water' },
};

/** The same character sheets, in Chinese, for Chinese prompts. */
export const FIGHTER_LOOKS_ZH: Record<string, string> = {
  emberpaw: '一只直立的肉桂色小熊猫，长长的橙色环纹尾巴，穿锈红色无袖交领短褂，系奶油色腰带',
  cloudhop: '一只淡紫色兔子，长耳朵内侧是粉色，穿薄荷绿无袖交领短褂，系桃色腰带，脚穿厚实的薄荷绿靴子',
  stoneguard: '一只体格宽厚、直立的棕色水豚，表情平静、略带睡意，穿赭黄色交领短袍，戴一对巨大的玄武岩拳套，拳套上有发光的琥珀色裂纹',
  scrapclaw: '一只敏捷的灰色浣熊，戴黑色眼罩状斑纹，蓬松的环纹尾巴，穿青绿色背心，戴铜制护指',
  stormhorn: '一只强壮的直立公羊，长着一对大大的黄铜色卷角，浅色羊毛，穿靛蓝色短袍，戴黄铜护腕',
  mossbite: '一条敦实的苔绿色小龙，奶油色肚皮，两只象牙色小角，粗尾巴末端像叶子，没有翅膀',
  pebblepop: '一只圆滚滚的藏青色与奶油色企鹅武术家，大眼睛，穿琥珀色无袖背心，鳍状拳头很厚实',
  puffvolt: '一只毛茸茸的银紫色龙猫，大大的圆耳朵，穿梅子色短战斗夹克，戴金色护腕',
  cinderveil: '一位成年女武术家，深棕色皮肤，白色短卷发，戴小小的青铜半面具，穿珊瑚色与炭灰色相间的战斗夹克',
  tideknuckle: '一只可爱的直立蓝色六角恐龙（墨西哥钝口螈），珊瑚色外鳃，奶油色肚皮，系藏青色腰布，戴青绿色护腕',
};

const ARENA = 'an overgrown floating stone arena with vines, waterfalls and drifting clouds';
const ARENA_ZH = '一座长满植物的浮空石制竞技场，周围有藤蔓、瀑布和飘动的云'

export interface UltimatePromptInput {
  caster: { id: string; name: string };
  target: { id: string; name: string };
  /** Which side of the opening frame the caster stands on. */
  casterSide: 'left' | 'right';
  move: { name: string; description: string; transcript?: string };
  /** Interface language; Chinese writes the whole prompt in Chinese. */
  lang?: Lang;
}

const title = (name: string) => name.charAt(0) + name.slice(1).toLowerCase();

/** One visual direction for every move; the player's words define the entity, power and action. */
export function buildUltimatePrompt(input: UltimatePromptInput): string {
  if (input.lang === 'zh') return buildChinesePrompt(input);
  const { caster, target, casterSide, move } = input;
  const c = FIGHTER_LOOKS[caster.id] ?? { look: 'the fighter on that side of the frame' };
  const t = FIGHTER_LOOKS[target.id] ?? { look: 'the fighter on that side of the frame' };
  const cName = title(caster.name), tName = title(target.name);
  const targetSide = casterSide === 'left' ? 'right' : 'left';
  const toward = casterSide === 'left' ? 'to the right' : 'to the left';
  const away = casterSide === 'left' ? 'right' : 'left';
  const description = move.description.replace(/\s+/g, ' ').trim();
  const original = move.transcript?.replace(/\s+/g, ' ').trim();
  return [
    `<Picture 1>: opening frame, cel-shaded 2D side-view fight in ${ARENA}.`,
    `<Subject 1> is ${cName}, the attacker on the ${casterSide} of <Picture 1>: ${c.look}.`,
    `<Subject 2> is ${tName}, the target on the ${targetSide}: ${t.look}.`,
    `Player's move "${move.name}": ${description}`,
    ...(original && original !== description ? [`Player's original request: ${original}`] : []),
    "The original request has priority: honor its entities, phenomena, objects, materials, colors and action literally. The requested power overrides the caster's usual element. Do not substitute a basic attack or generic flash for a named creation.",
    'Summoned creatures, objects and environmental phenomena are allowed attack effects, separate from the two fighters. Show the complete recognizable form before impact; keep it visible as it attacks. Neither fighter transforms unless requested.',
    'Make this a spectacular cinematic ultimate: monumental scale, strong silhouettes, luminous detail, dramatic lighting and powerful momentum. The arena reacts to the requested power; the attack should dominate the scene, not be a small puff.',
    `One continuous action. Beat 1: anticipation, then the requested creation visibly materializes at impressive scale. Beat 2: <Subject 1> directs the attack ${toward}, straight at <Subject 2>; preserve its requested form and natural arrival. Beat 3: the attack hits <Subject 2> squarely; <Subject 2> is blasted back to the ${away}, tumbles and lands on the arena floor.`,
    "Impact: brief slow motion at contact, a large burst of the requested power, expanding shockwaves, flying debris and a hard camera shake. Show the actual collision and the target's physical reaction.",
    `Keep fighter identities and sides. Only <Subject 1> casts; only <Subject 2> takes the hit. Camera: pull wide enough to show the entire creation and both fighters, then push in briefly on impact.`,
    `Dialogue: <Subject 1> shouts "${move.name}!" Soundscape: the requested effect's distinct build-up, rushing movement and a thunderous hit. Music: one epic orchestral accent.`,
    'No text, UI, logos, blood, gore, additional combatants or scene changes.',
  ].join('\n');
}

/** 中文界面的必杀提示词：结构与英文版一致，玩家的中文原话逐字保留。 */
function buildChinesePrompt({ caster, target, casterSide, move }: UltimatePromptInput): string {
  const c = FIGHTER_LOOKS_ZH[caster.id] ?? '画面这一侧的格斗家';
  const t = FIGHTER_LOOKS_ZH[target.id] ?? '画面这一侧的格斗家';
  const side = (s: 'left' | 'right') => (s === 'left' ? '左' : '右');
  const targetSide = casterSide === 'left' ? 'right' : 'left';
  const description = move.description.replace(/\s+/g, ' ').trim();
  const original = move.transcript?.replace(/\s+/g, ' ').trim();
  return [
    `<Picture 1>：开场画面，赛璐璐风格的 2D 横版格斗，场景是${ARENA_ZH}。`,
    `<Subject 1> 是${caster.name}，位于 <Picture 1> ${side(casterSide)}侧的攻击者：${c}。`,
    `<Subject 2> 是${target.name}，位于${side(targetSide)}侧的目标：${t}。`,
    `玩家的招式“${move.name}”：${description}`,
    ...(original && original !== description ? [`玩家的原话：${original}`] : []),
    '玩家的原话优先：照字面还原其中的生物、现象、物体、材质、颜色和动作。玩家要求的力量取代攻击者平时的元素。不要用普通攻击或笼统的闪光代替玩家点名的造物。',
    '召唤出的生物、物体和自然现象都可以作为攻击特效，与两位格斗家分开。命中前完整展示可辨认的形态，攻击过程中保持可见。除非玩家要求，两位格斗家都不变身。',
    '把它做成壮观的电影级必杀：宏大的规模、鲜明的轮廓、发光的细节、戏剧化的光影和强劲的冲势。场地对这股力量产生反应；攻击要主宰整个画面，不能只是一小团烟。',
    `一个连续的动作。第 1 拍：蓄势，然后玩家要求的造物以震撼的规模清晰显现。第 2 拍：<Subject 1> 把攻击向${side(targetSide)}直接打向 <Subject 2>，保持它被要求的形态和自然的到来方式。第 3 拍：攻击正面命中 <Subject 2>；<Subject 2> 被向${side(targetSide)}轰飞，翻滚后落在场地上。`,
    '命中：接触瞬间短暂慢动作，玩家要求的力量大爆发，冲击波扩散，碎片飞溅，镜头剧烈震动。展示真实的碰撞和目标的身体反应。',
    '保持两位格斗家的外观和左右位置。只有 <Subject 1> 出招，只有 <Subject 2> 挨打。镜头：拉远到能看见完整的造物和两位格斗家，命中时短暂推近。',
    `对白：<Subject 1> 用中文大喊：“${move.name}！” 音效：这股力量独特的蓄力声、呼啸的移动声和雷鸣般的命中声。音乐：一记史诗感的管弦乐重音。`,
    '画面中不要出现文字、界面、标志、血腥、额外的格斗者或场景切换。',
  ].join('\n');
}
