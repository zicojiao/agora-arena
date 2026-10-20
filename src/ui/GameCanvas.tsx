import { useEffect, useMemo, useRef } from 'react';
import { victoryQuoteFrame } from '../data/motions';
import type { Battle } from '../engine/battle';
import type { InputFrame } from '../engine/types';
import { ARENA_MAX, ARENA_MIN, FLOOR_Y, LOGIC_H, LOGIC_W, NULL_INPUT } from '../engine/types';
import { capturePrev, draw, getHeadPart, preloadParts, tickAfterimages, tickDamageTrail } from '../render/renderer';
import { Camera } from '../render/camera';
import { FxSystem } from '../render/fx';
import { BannerSystem, STAGE_HOLD_END } from '../render/banner';
import { MandorlaSystem } from '../render/mandorla';
import { CutInSystem } from '../render/cutin';
import { tickHitCounter } from '../render/hitCounter';
import { visualReachGap } from '../render/renderer';
import { addDecal, flingWeapon, tickAdornments } from '../render/adornments';
import { waitForSerifFont } from '../render/fontReady';
import { sfx, sfxForEvent } from '../render/sfx';
import { DEFAULT_BG, type StageBg } from '../data/stages';
import { winQuote } from '../data/quotes';
import { ASSAULT_BEATS, BRIEF_BEATS, SUPER_BEATS } from '../data/superPhases';
import { t } from '../i18n';

const STEP = 1000 / 60;
/** 大招暗场压住的帧数——只盖住发动那一下，之后衰减，别让十秒演出全程黑着 */
const DARK_HOLD = 45;

export function GameCanvas(props: {
  battle: Battle;
  getP1: () => InputFrame;
  getP2: () => InputFrame;
  /** Online lockstep: both players' inputs for the next tick, or null to wait for the network. Replaces getP1/getP2. */
  step?: () => [InputFrame, InputFrame] | null;
  onTick?: (b: Battle) => void;
  stage?: StageBg;
  /** 关卡名 + 对手名：只用于开场横幅显示，训练场没有关卡概念，调用方不传即可 */
  stageName?: string;
  opponentName?: string;
  /** 对手的机制钩子，一句话。开场横幅第三行——六关的对手是随机抽的，
   * 报了名字还不够，玩家得知道这一位跟别人哪儿不一样 */
  opponentTrait?: string;
  /** 对手的开场那一句。陪练场不给——那里没有『这一关的对手』这回事 */
  opponentIntro?: string;
  /** 这是不是一趟阶梯的最后一关。只在开场那一次横幅上加个记号——
   * 六关连战的收尾此前和第一关长得一模一样 */
  finalStage?: boolean;
  paused?: boolean;
  /** Draw the health/meter HUD (off when the arena is a menu backdrop). */
  hud?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const cam = useMemo(() => new Camera(), []);
  const fx = useMemo(() => new FxSystem(), []);
  const banner = useMemo(() => new BannerSystem(), []);
  const mandorla = useMemo(() => new MandorlaSystem(), []);
  const cutin = useMemo(() => new CutInSystem(), []);
  useEffect(() => {
    preloadParts(props.battle.p1.def.id);
    preloadParts(props.battle.p2.def.id);
  }, [props.battle]);
  // 演出状态机：与 cam/fx 同生命周期（战斗期间持续存在），不可在 rAF 回调内重建，否则每帧清零
  const cine = useMemo(() => ({
    dark: 0, freeze: 0, slow: 0, slowCounter: 0, hold: 0, camHold: 0, focusWho: null as 0 | 1 | null,
    // 影院黑边：bars 是当前高度比例，barsTarget 是节拍表设定的目标，每逻辑 tick 缓动逼近
    bars: 0, barsTarget: 0,
    /** 上一 tick 出招者的 stateFrame，用来判定「跨过了哪一拍」——节拍只触发一次 */
    beatFrame: -1,
  }), []);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;

    // 可见视口的逻辑尺寸（960×540 安全区之外还能看见多少），每次 resize 更新，读给下面
    // 两处 draw() 调用——draw() 不认屏幕像素，只认逻辑单位，跟战斗坐标系用同一套度量。
    const viewport = { w: LOGIC_W, h: LOGIC_H };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vw = window.innerWidth, vh = window.innerHeight;
      // 缩放仍取 min（不能改 max）——960×540 是玩法安全区，横向裁切会切掉场地边界
      // （ARENA_MIN/MAX），纵向裁切会切掉 HUD。宽于/窄于 16:9 时，多出来的那个轴由
      // 画布本身撑满视口来体现，不再靠缩小画布元素露出页面底色当"黑边"。
      const scale = Math.min(vw / LOGIC_W, vh / LOGIC_H);
      canvas.width = vw * dpr;
      canvas.height = vh * dpr;
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
      viewport.w = vw / scale;
      viewport.h = vh / scale;
      // 把 960×540 的安全区居中摆进这块更大的画布：平移量是安全区与可见视口的差值之半
      const offX = (viewport.w - LOGIC_W) / 2, offY = (viewport.h - LOGIC_H) / 2;
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offX * scale * dpr, offY * scale * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let acc = 0;
    // 回合起始的「准备」锁：横幅还完全立着的时候，双方都收不到输入。
    // 实测不加这一段的话，40% 的回合在横幅结束前玩家就已经挨打（平均 8 点，首次命中
    // 落在第 49-60 帧）——第二、三回合尤其不该这样，玩家刚看完 KO 慢镜。
    // 只在有开场横幅时锁（陪练场不报关卡名，也就不锁）。
    let ready = propsRef.current.stageName ? STAGE_HOLD_END : 0;
    let last = performance.now();
    let prev = capturePrev(propsRef.current.battle);
    // 上一 tick 的离地高度/贴墙状态：落地与撞墙都是"跨越那一刻"才触发一次的事件
    const prevAir: [number, number] = [0, 0];
    const prevWall: [boolean, boolean] = [false, false];
    const portraitMq = window.matchMedia('(orientation: portrait)');
    // 开场关卡横幅只报一次；BannerSystem 本身随 GameCanvas 一起挂载/卸载，跟 Battle 生命周期
    // 一一对应，不需要像 dmgTrail 那样靠 Battle 引用变化去探测新局
    if (propsRef.current.stageName) {
      banner.showStage(propsRef.current.stageName, propsRef.current.opponentName ?? '',
        propsRef.current.opponentTrait ?? '', propsRef.current.finalStage ?? false,
        propsRef.current.opponentIntro ?? '');
    }

    const frame = (now: number) => {
      const { battle, getP1, getP2, step, onTick, stage, paused, hud } = propsRef.current;
      // 竖屏时 RotateOverlay 盖住画面但控件仍在遮罩下方——不暂停循环的话 AI 会继续打一个
      // 摸不到屏幕的玩家。重置 acc+last（而非只是 skip）是为了不让转回横屏时补一串追帧
      if (portraitMq.matches) {
        acc = 0;
        last = now;
        draw(ctx, battle, prev, 0, cam, fx, banner, mandorla, cine.focusWho, cine.dark, stage ?? DEFAULT_BG, viewport, cutin, cine.bars, hud ?? true);
        raf = requestAnimationFrame(frame);
        return;
      }
      if (paused) {
        acc = 0;
        last = now;
        draw(ctx, battle, prev, 0, cam, fx, banner, mandorla, cine.focusWho, cine.dark, stage ?? DEFAULT_BG, viewport, cutin, cine.bars, hud ?? true);
        raf = requestAnimationFrame(frame);
        return;
      }
      acc += Math.min(now - last, 100); // 后台切回时不追帧
      last = now;
      while (acc >= STEP) {
        // 时停：只推进特效和相机，不消费输入、不推进战斗逻辑。banner 也要在这里推进——
        // 大招竖排卷轴的逐字揭示正是靠这 30 帧时停才读得完，不推进的话卷轴会跟着一起冻住
        if (cine.freeze > 0) {
          cine.freeze--; acc -= STEP; fx.tick(); cam.tick(); banner.tick(); mandorla.tick(cine.dark > 0); cutin.tick(cine.freeze > 0); continue;
        }
        // 慢镜：按 1/3 速跳过子帧（固定 1/60s 步长不变，只是每 3 帧才真正 tick 一次）
        if (cine.slow > 0) {
          cine.slowCounter++;
          if (cine.slowCounter % 3 !== 0) {
            acc -= STEP; fx.tick(); cam.tick(); banner.tick(); mandorla.tick(cine.dark > 0); cutin.tick(cine.freeze > 0); continue;
          }
          cine.slow--;
        }
        // Lockstep: no inputs from the opponent yet → hold this tick (and drop the backlog so we don't fast-forward).
        let inputs: [InputFrame, InputFrame] | null = null;
        if (ready <= 0 && step) {
          inputs = step();
          if (!inputs) { acc = Math.min(acc, STEP); break; }
        }
        prev = capturePrev(battle);
        // 准备期间照常推进物理与待机动作，只是双方都收不到输入——不是把画面冻住，
        // 那样连呼吸感都没有了
        if (ready > 0) { ready--; battle.tick(NULL_INPUT, NULL_INPUT); }
        else if (inputs) battle.tick(inputs[0], inputs[1]);
        else battle.tick(getP1(), getP2());
        onTick?.(battle); // 训练场在这一步把 p2.hp 强制拉回满血——必须先跑完，残影才读到"复位后"的值
        tickDamageTrail(battle); // 残影推进钉在这条真正执行了 battle.tick() 的分支上：
        // freeze/slow 的丢帧分支在上面就 continue 掉了，不会走到这里——hp 本身没变化的那些帧，
        // 残影也跟着一起冻结，不会在时停/慢镜头里自己偷偷追赶
        tickAfterimages(battle); // 残影环形缓冲同一条分支上推进，采样间隔同样不能挂渲染帧
        // 走路扬尘：每半个步幅踢起一小撮土。walk 动作 36 帧一个循环，落脚在 0/18 附近
        for (const f of [battle.p1, battle.p2]) {
          if (f.state === 'walk' && f.stateFrame % 18 === 2) {
            fx.spawn('spark', f.x - f.facing * 12, FLOOR_Y, { color: f.def.adorn?.dust ?? '#b9a888', size: 3 });
          }
        }
        // 判词：回合以**非 KO** 的方式结束时，屏幕上得有一句话交代。KO 有整套死亡演出
        // （兵器脱手、震屏、慢镜、镜头怼脸）说明发生了什么，这三种此前一个字都没有。
        // 引擎那边不发事件（它们都不是 KO，不该走那条路），所以按状态位触发；
        // showVerdict 内部只认第一次调用。不额外发声——胜者摆定造型时那一声 victory
        // 紧接着就来（见下面 showWinQuote 那段），这里再响一次是同一件事说两遍。
        // 训练场不读秒也打不死人，天然走不到这里
        if (battle.timeUp) banner.showVerdict(t(battle.winner === null ? 'canvas.timeUpDraw' : 'canvas.timeUp'));
        else if (battle.doubleKo) banner.showVerdict(t('canvas.doubleKo'));
        tickAdornments(battle); // 飘带/余烬/气环/地面痕迹：同一条逻辑 tick
        tickHitCounter(battle);  // HIT 计数消费 battle.events，必须紧跟 battle.tick() 之后
        // 地面/版边互动：落地扬尘、撞墙碎屑。引擎里没有对应事件，但这两件事都能从既有状态
        // 直接判出来——落地=上一 tick 还在空中而这一 tick 贴地，撞墙=贴着场地边界且还有速度。
        // 判定放在这条真正跑过 battle.tick() 的分支上，跟着逻辑帧走。
        for (const [f, was] of [[battle.p1, prevAir[0]], [battle.p2, prevAir[1]]] as const) {
          const idx = f === battle.p1 ? 0 : 1;
          const landed = was > 0.5 && f.y <= 0.5;
          if (landed) {
            const power = Math.min(Math.abs(f.vy) / 14, 1.6);
            cam.addShake(3 + power * 5);
            for (let k = 0; k < 3; k++) {
              fx.spawn('spark', f.x + (k - 1) * 12, FLOOR_Y, { color: '#c9b79a', size: 4 + power * 4 });
            }
            fx.spawn('shockwave', f.x, FLOOR_Y, { color: '#b9a888', size: 8 + power * 10 });
            addDecal(f.x, 'scorch', f.def.adorn?.dust ?? '#b9a888');
            sfx('whiff'); // 借用最轻的那记气声当落地闷响，不为此新增采样
          }
          const atWall = f.x <= ARENA_MIN + 0.5 || f.x >= ARENA_MAX - 0.5;
          if (atWall && !prevWall[idx] && Math.abs(f.vx) > 4) {
            cam.addShake(11);
            for (let k = 0; k < 5; k++) {
              fx.spawn('burst', f.x, FLOOR_Y - 40 - k * 16, { color: '#d8c7ad', size: 5 });
            }
            addDecal(f.x, 'crack', '#d8c7ad');
            sfx('hit', true);
          }
          prevWall[idx] = atWall;
          prevAir[idx] = f.y;
        }
        for (const ev of battle.events) {
          // 发声统一走这一处分派：散在各分支里的话，新增事件很容易忘了配音，
          // 而"哪种声音从来不响"这种事肉眼看不出来
          const snd = sfxForEvent(ev);
          if (snd) sfx(snd.kind, snd.heavy);
          // 先制：本回合第一记**打实**的命中（挡下不算，那是防住了）。
          // 投技也算——它同样是"第一下打到人身上"。BannerSystem 内部只认第一次调用
          if (ev.type === 'hit' && !ev.blocked) banner.showFirstAttack(ev.attacker);   // 先制
          if (ev.type === 'throw') banner.showFirstAttack(ev.attacker);
          if (ev.type === 'hit') {
            const type = ev.blocked ? 'spark' : 'burst';
            // 反击命中单独一色：金色是普通命中，朱红是"你读对了这一招"。
            // 引擎那边多给 1.2 倍伤害和 6 帧硬直，屏幕上必须有对应的一下，否则等于没加
            const color = ev.blocked ? '#7fd4ff' : ev.counter ? '#ff6b4a' : '#ffcf5c';
            // 普通命中按伤害分三档（轻/中/重）给不同的粒子尺寸；重档额外叠一波粒子——
            // 池子上限 256 不动，加重的是单次爆发的量，不是无限堆量
            const heavyDmg = ev.damage >= 16, midDmg = !heavyDmg && ev.damage >= 10;
            fx.spawn(type, ev.x, ev.y, { color, size: heavyDmg ? 11 : midDmg ? 8 : 6 });
            if (heavyDmg) fx.spawn(type, ev.x, ev.y, { color, size: 7 });
            if (ev.counter) fx.spawn('shockwave', ev.x, ev.y, { color: '#ff8a5c', size: 9 });
            cam.addShake(ev.heavy ? 14 : ev.counter ? 11 : ev.damage >= 12 ? 9 : 5);
            if (ev.heavy) { // 大招命中：冲击波、白闪时长都比普通重击再加一档
              fx.spawn('shockwave', ev.x, ev.y, { color: '#ffe6a3', size: 16 });
              fx.spawn('flash', 0, 0, { color: '#fff', size: 6 }); // size 复用为白闪多维持的 tick 数
              cine.slow = 10; cine.slowCounter = 0;
            }
          } else if (ev.type === 'throw') { cam.addShake(10); }
          // 守方翻盘的三件事：受身、投技解脱、防御取消。此前渲染层一个都不接——
          // 与爆气当初的毛病一样，"看不见的系统等于不存在"。
          // 统一用青白色的冲击波：跟命中的金色/朱红分开，一眼能认出"这是脱出来了"，
          // 而不是"又挨了一下"。
          else if (ev.type === 'tech' || ev.type === 'throwEscape' || ev.type === 'guardCancel') {
            // throwEscape 的 who 是**投的人**（见 battle.doThrow），另外两个是当事人自己，
            // 所以这里一律取两人中点：解脱本来就是双方分开的那一下，中点才对得上
            const self = ev.who === 0 ? battle.p1 : battle.p2;
            const other = ev.who === 0 ? battle.p2 : battle.p1;
            const bx = ev.type === 'throwEscape' ? (self.x + other.x) / 2 : self.x;
            const by = FLOOR_Y - self.y - self.def.height / 2;
            const gc = ev.type === 'guardCancel';
            fx.spawn('shockwave', bx, by, { color: '#8ff0e0', size: gc ? 15 : 10 });
            fx.spawn('spark', bx, by, { color: '#d8fff8', size: gc ? 9 : 6 });
            cam.addShake(gc ? 11 : 6);
          }
          else if (ev.type === 'maxMode') {
            // 爆气：此前这个事件在渲染层完全没人接，进 MAX 屏幕上一点动静都没有——
            // 一个看不见的系统等于不存在，玩家不可能学会用它
            const f = ev.who === 0 ? battle.p1 : battle.p2;
            const bx = f.x, by = FLOOR_Y - f.y - f.def.height / 2;
            fx.spawn('shockwave', bx, by, { color: '#ffd76a', size: 18 });
            fx.spawn('burst', bx, by, { color: '#ffd76a', size: 12 });
            fx.spawn('burst', bx, by, { color: '#fff2c0', size: 8 });
            cam.addShake(12);
          }
          else if (ev.type === 'super') {
            const f = ev.who === 0 ? battle.p1 : battle.p2;
            cine.freeze = ev.tier === 100 ? 30 : 14; // 时停帧
            cine.dark = ev.tier === 100 ? 1 : 0.6;   // 暗场强度
            // 时停结束后暗场维持出招动画时长再衰减；只在此刻读一次招式数据算成自成一体的计时器，
            // 之后只靠 cine 自己的计数器递减——不再看 caster.state，KO 把战斗冻结也不会卡住它
            // 暗场与镜头焦点分开计时。大招拉到 600 帧（10s）之后，若照旧让暗场压满全程，
            // 玩家要盯着一块黑幕看十秒；而镜头焦点又必须跟满全程，否则演出中途就松开。
            // 暗场只压住开场这一下（DARK_HOLD 帧后开始衰减），焦点跟到招式结束。
            cine.hold = DARK_HOLD;
            cine.camHold = f.move ? f.move.startup + f.move.active + f.move.recovery : 0;
            cine.focusWho = ev.who;
            cam.focus = { x: f.x, zoom: ev.tier === 100 ? 1.45 : 1.25 };
            // 火焰纹背光：暗场铺满之后由 mandorla 自己的 tick 计时绽放；配色/花瓣形态跟出招者
            // 的 superGlow/superAura 走，没有就落回 mandorla 内部的默认基准（Task 28 之前的样子）
            mandorla.trigger(ev.tier, f.def.superGlow, f.def.superAura);
            // Cut-in 立绘：只给超必杀（tier 100），奥义传 null 主动跳过（顺带清掉上一次可能
            // 还没滑完的残留）。缺 head.png 时 getHeadPart 返回 null，trigger 内部优雅跳过。
            // 第三个参数是**没有立绘时的程序化回退依据**：public/chars/ 只有最早四个人的
            // head.png，另外八个一张都没有，此前那八个人的超必杀 cut-in 整段不出现
            cutin.trigger(ev.tier === 100 ? getHeadPart(f.def.id) : null, f.facing,
              ev.tier === 100 ? f.def : undefined);
          }
          else if (ev.type === 'moveStart') {
            const f = ev.who === 0 ? battle.p1 : battle.p2;
            banner.showMove(ev.move.name, ev.move.slot, f.facing, ev.who); // n1-n3 内部直接忽略
            // 发声交给 sfxForEvent 统一分派（见循环末尾），这里只管横幅
          }
          else if (ev.type === 'ko') {
            // 输家的兵器脱手飞出、扎进地里——KO 那一刻最该有的一个画面。
            // 只在这里触发：连打中途让兵器消失，后面几十段就成了"空手挥棍"，反而穿帮
            const loser = ev.loser === 0 ? battle.p1 : battle.p2;
            flingWeapon(ev.loser, loser.x, loser.y, -loser.facing);
            cam.addShake(20); fx.spawn('flash', 0, 0);
            cine.slow = 20; cine.slowCounter = 0;
            cam.focus = { x: ev.loser === 0 ? battle.p1.x : battle.p2.x, zoom: 1.35 };
          }
        }
        // 胜利台词：等造型摆定了再说话。触发帧从**这个角色自己**的胜利动作推导——
        // 四套的收势时刻不一样（46~66），写死一个数会让其中几个在抡到一半时开口。
        // 内部只认第一次调用，所以这里不必自己防重复
        for (const f of [battle.p1, battle.p2]) {
          if (f.victory === victoryQuoteFrame(f.def.id)) {
            // 对手是谁决定说哪一句：牛魔王赢红孩儿是父子对话，赢孙悟空是结拜旧账，
            // 通用那句只在没写过这一对时才出场（vs 见 CharacterDef.vs）
            const foe = f === battle.p1 ? battle.p2 : battle.p1;
            banner.showWinQuote(winQuote(f.def, foe.def.id), f === battle.p1 ? 0 : 1);
            sfx('victory');   // 收尾那 2 秒此前是全静的
          }
        }
        // 第二个参数是"视觉够不到判定前沿"的缺口：够得到就是 0，什么都不补
        for (const fg of [battle.p1, battle.p2]) {
          fx.syncMoveFx(fg, fg.move ? visualReachGap(fg.def, fg.move) : 0);
        }
        fx.tick();
        cam.tick();
        banner.tick();
        // 第三个参数让焦点跟着出招者走（详见 Camera.follow 的注释）。KO 那条分支只设
        // cam.focus 不设 cine.focusWho，传进去是 null，镜头照旧钉住倒下的那一位。
        cam.follow(battle.p1.x, battle.p2.x, cine.focusWho);
        // sp100 的 motionSeq 每跨进新一段就给镜头一次轻微 zoom 脉冲（+0.06，约基准 1.45x 的
        // 4%）——幅度克制，不跟大招本身的推镜（cam.focus.zoom）打架：脉冲叠加在 cam.zoom 上，
        // 下一 tick 起 follow() 按既有的 0.25 lerp 自己把它拉回 focus.zoom，不需要额外的衰减
        // 计时器。跨段探测纯读 stateFrame（motionSeqPhaseIndex 是纯函数），天然挂在本 tick，
        // 不会有「按渲染帧走」的风险。
        // 演出节拍表（superPhases.ts 的 SUPER_BEATS）：出招者的 stateFrame 跨过某一拍时，
        // 把那一拍要求的镜头缩放/震屏/慢镜/黑边/暗场/定格一次性应用。十五段骨架四人一致，
        // 镜头语言也就一致，玩家看第二次能预判下一拍。
        // 判定只读 stateFrame（纯状态）、每拍触发一次；被改的量本身都挂在逻辑 tick 上推进，
        // 不引入新的按渲染帧走的计时器。
        const caster = cine.focusWho === null ? null : (cine.focusWho === 0 ? battle.p1 : battle.p2);
        const slot = caster?.state === 'attack' ? caster.move?.slot : undefined;
        // 两档各有自己的总谱：超必杀十五拍（密集连打逼到版边），奥义九拍（长蓄力 + 少数
        // 几下极重的技）。拍数与幅度的差别正是玩家分辨"放的是哪一档"的依据。
        // 短演出（打不死人那一版）另有一张五拍的表：幅度全面低一档、不压影院黑边——
        // 黑边是"这是过场"的信号，留给真正的终结演出
        const beats = !slot || (slot !== 'sp100' && slot !== 'sp50') ? null
          : caster?.move?.isBrief ? BRIEF_BEATS
            : slot === 'sp100' ? SUPER_BEATS : ASSAULT_BEATS;
        if (beats && caster) {
          const sf = caster.stateFrame;
          for (const beat of beats) {
            if (beat.frame > cine.beatFrame && beat.frame <= sf) {
              if (beat.zoom !== undefined && cam.focus) cam.focus.zoom = beat.zoom;
              if (beat.shake !== undefined) cam.addShake(beat.shake);
              if (beat.slow !== undefined) { cine.slow = beat.slow; cine.slowCounter = 0; }
              if (beat.bars !== undefined) cine.barsTarget = beat.bars;
              if (beat.dark !== undefined) { cine.dark = beat.dark; cine.hold = beat.dark > 0 ? DARK_HOLD : 0; }
              if (beat.freeze !== undefined) cine.freeze = Math.max(cine.freeze, beat.freeze);
            }
          }
          cine.beatFrame = sf;
        } else {
          cine.beatFrame = -1;
          cine.barsTarget = 0;
        }
        // 黑边缓动：同样走逻辑 tick，不挂渲染帧
        cine.bars += (cine.barsTarget - cine.bars) * 0.18;
        if (Math.abs(cine.bars - cine.barsTarget) < 0.002) cine.bars = cine.barsTarget;
        // 暗场衰减：只在真正跑了一次逻辑 tick 的分支里走一格（与 freeze/slow 同为逐 tick 计数，
        // 不挂渲染帧率），全靠 cine 自己的计数器，不读战斗/角色状态，KO 后 battle.tick 早退也无碍
        if (cine.dark > 0) {
          if (cine.hold > 0) cine.hold--;
          else cine.dark = Math.max(0, cine.dark - 0.06);
        }
        // 焦点的生命周期与暗场脱钩：暗场早早退场，镜头继续跟着出招者走完整段演出
        if (cine.camHold > 0) {
          cine.camHold--;
          if (cine.camHold === 0) { cam.focus = null; cine.focusWho = null; }
        }
        // mandorla 用本 tick 结算完的 cine.dark 判断还要不要继续绽放/自转——暗场退场（本
        // tick 才刚衰减到 0）背光同一 tick 跟着关闭，不必再维护第二套淡出计时器
        mandorla.tick(cine.dark > 0);
        cutin.tick(cine.freeze > 0);
        acc -= STEP;
      }
      if (cine.dark === 0 && cine.camHold === 0 && battle.winner === null && cine.slow === 0) cam.focus = null;
      draw(ctx, battle, prev, acc / STEP, cam, fx, banner, mandorla, cine.focusWho, cine.dark, stage ?? DEFAULT_BG, viewport, cutin, cine.bars, hud ?? true);
      raf = requestAnimationFrame(frame);
    };
    // 开跑前等宋体子集就绪：waitForSerifFont 内置超时兜底（离线/加载失败也不卡住），
    // 首帧真正落地前的等待时间被 frame() 里 acc += Math.min(now-last,100) 的既有上限
    // 吸收掉，不会在等待结束的瞬间补一串追帧
    let cancelled = false;
    waitForSerifFont().then(() => {
      if (cancelled) return;
      raf = requestAnimationFrame(frame);
    });
    return () => { cancelled = true; cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [cam, fx, cine, banner, mandorla, cutin]);

  return <canvas ref={ref} style={{ display: 'block', margin: 'auto' }} />;
}
