/** 壁画/矿物颜料语汇的共用色板：不覆盖各关卡 StageBg 自己的天空配色，只用于描边/叠加 */
export const INK = {
  ink: '#1B2430', // 墨蓝，描边与暗部
  paper: '#EDE3D2', // 宣纸，最亮的中性色
  cinnab: '#C8443C', // 朱砂
  gamboge: '#D9A441', // 藤黄
  azurite: '#3E7C8C', // 石青
  malach: '#7E9A6B', // 石绿
};

/**
 * 镜像战的换色。选牛魔王时最后一关正是他本人（buildRun 只滤掉"玩家"与"BOSS"其中之一，
 * 而末关固定是 FINAL_BOSS），于是场上两个人**配色完全一样**——而紧急回避的设计
 * 就是从对手身体里穿过去换边，穿完谁是谁全靠血条猜。
 *
 * 做法取街机的老办法：**转色相**，不动明度与饱和度。角色的轮廓、材质、明暗关系
 * 全都保持原样，只是换了个颜色——认得出还是同一个人，也分得出不是同一个。
 */
export function shiftHue(hex: string, deg: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  h = ((h + deg) % 360 + 360) % 360;
  // HSL → RGB
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const [rr, gg, bb] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(rr)}${to(gg)}${to(bb)}`;
}

/** 镜像战里给后手换的一套配色。150° 是转得够远又不至于把暖色系全转成冷色 */
export const MIRROR_HUE = 150;

/**
 * 单纯转色相对**低饱和**的角色没用：白骨精的主色 #7d8a84 是近乎灰的青绿，
 * 转 150° 只挪动 31（按 RGB 通道差之和），场上还是看不出两边的区别。
 * 灰色本来就没有色相可转——这时改推明度，一深一浅同样分得开。
 */
function tooClose(a: string, b: string): boolean {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return x.reduce((s, v, i) => s + Math.abs(v - y[i]), 0) < 90;
}

function shiftLight(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map(v => {
    // 亮的往暗推、暗的往亮推，避免推到纯黑/纯白丢掉轮廓
    const t = Math.max(0, Math.min(255, v + amt));
    return t.toString(16).padStart(2, '0');
  });
  return `#${ch.join('')}`;
}

function distinct(hex: string): string {
  const turned = shiftHue(hex, MIRROR_HUE);
  if (!tooClose(hex, turned)) return turned;
  // 灰调：按原色明暗决定往哪边推，保证推得动
  const n = parseInt(hex.slice(1), 16);
  const lum = ((n >> 16) + ((n >> 8) & 255) + (n & 255)) / 3;
  return shiftLight(turned, lum > 128 ? -70 : 70);
}

export function mirrorPalette(p: { main: string; accent: string }): { main: string; accent: string } {
  return { main: distinct(p.main), accent: distinct(p.accent) };
}

/**
 * 整套外观的镜像换色。只换 palette 是不够的——飘带、余烬、气环、扬尘、兵器、
 * 大招背光都各有各的颜色，不一起换的话两个牛魔王仍然只有身体是两个色，
 * 身上飘的、手里拿的、放大招时背后烧的全都一模一样。
 *
 * 全部走同一个 distinct()：转出来的是**同一套色相关系**，读起来是"另一件衣服"，
 * 而不是随机调色板。
 */
export function mirrorLook<T extends {
  palette: { main: string; accent: string };
  weapon?: { shaft: string; edge: string };
  superGlow?: [string, string];
  adorn?: {
    sashes?: { color: string; tip?: string }[];
    ember?: { color: string };
    aura?: string;
    dust?: string;
  };
}>(def: T): T {
  def.palette = mirrorPalette(def.palette);
  if (def.weapon) {
    def.weapon.shaft = distinct(def.weapon.shaft);
    def.weapon.edge = distinct(def.weapon.edge);
  }
  if (def.superGlow) def.superGlow = [distinct(def.superGlow[0]), distinct(def.superGlow[1])];
  const ad = def.adorn;
  if (ad) {
    for (const s of ad.sashes ?? []) {
      s.color = distinct(s.color);
      if (s.tip !== undefined) s.tip = distinct(s.tip);
    }
    if (ad.ember) ad.ember.color = distinct(ad.ember.color);
    if (ad.aura !== undefined) ad.aura = distinct(ad.aura);
    if (ad.dust !== undefined) ad.dust = distinct(ad.dust);
  }
  return def;
}
