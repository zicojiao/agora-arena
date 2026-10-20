export type PartName = 'head' | 'torso' | 'armF' | 'armB' | 'legF' | 'legB' | 'weapon'
  | 'poseIdle' | 'poseRun' | 'posePunch' | 'poseKick' | 'poseBlock' | 'poseSuper';

/** 探测成功的部件：图片本体 + 裁掉上下透明留白后的内容行范围（图片像素坐标，[top, bottom)）。
 * 只裁纵向——头/躯干的接缝是纵向现象（脖子、腰），横向留白跟接缝无关，裁横向反而会把非方形
 * 内容拉伸变形（比如某角色脸部左右留白明显更多，连横向一起裁到贴边、撑满挂载方形后脸会被
 * 横向拉宽走样）。左右保持原图全宽不动。 */
export interface PartImage {
  img: HTMLImageElement;
  top: number; bottom: number;
  /** 内容的横向范围（图片像素坐标，[left, right)）。
   * **怎么塞进目标框是调用方的策略，这里不规定**：骨骼挂载要拉满骨长（接缝靠
   * NECK_OVERLAP/WAIST_OVERLAP 压住，等比内接反而会把它撑开），cut-in 要等比内接固定画框。
   * 早先这里写的是"绘制时不按它裁剪，横向裁切会拉伸变形"——那是把 drawBoneImg 一家的策略
   * 写进了共享类型。横向裁切本身不变形，**裁完还拉满**才变形。这句禁令的直接后果是
   * cut-in 拿整幅 naturalWidth 配裁过的高度算等比，缩放被留白锁死，画面上有素材的角色
   * 反而比程序化兜底的小。
   * 另一个用途是量出"这件素材实际多宽"，好让头和躯干共用同一个像素→逻辑比例：此前头被塞进
   * 32×32 方框、躯干按 40 逻辑单位宽挂载，各缩各的，头相对身体既偏窄又对不上。 */
  left: number; right: number;
}
export type PartImages = Partial<Record<PartName, PartImage>>;

/** **实际去探测的部件**。类型 PartName 仍列着七件（挂载逻辑逐件独立，随时能接上），
 * 但只探这两件——美术管线在 docs/art-pipeline.md 第 0 节就定了「只做头 + 躯干，不做四肢」，
 * 每角色出图量 6 张降到 2 张，那四肢与兵器的图**从来没有生产过、以后也不打算生产**。
 * 照七件探的代价是每个角色 5 个必然 404：选人页把十二个人全预载一遍，就是 60 个白跑的请求
 * （生产构建实测 63 个失败请求，其中 60 个是这个）。手机上那是实打实的往返延迟。
 * 哪天真出了四肢素材，把名字加回这张表即可——扩展点还在，只是不再为它每次白付 60 个请求。 */
const BASIC_NAMES: PartName[] = ['head', 'torso'];

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

export interface VBounds { top: number; bottom: number }
export interface BBounds extends VBounds { left: number; right: number }

/** 从拍平的单通道透明度数组算出内容的纵向包围（忽略上下透明像素）。不依赖 canvas/Image，
 * 方便脱离浏览器环境单测。整列都透明时兜底返回 {0,h}（不裁，等价于跳过这一步）。
 * threshold 挡掉切件边缘极淡的抗锯齿残留，避免包围盒被半透明的 1px 毛边撑大。 */
export function trimVertical(alpha: Uint8Array | Uint8ClampedArray, w: number, h: number, threshold = 10): VBounds {
  let top = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    let opaque = false;
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] > threshold) { opaque = true; break; }
    }
    if (opaque) { if (top < 0) top = y; bottom = y; }
  }
  return top < 0 ? { top: 0, bottom: h } : { top, bottom: bottom + 1 };
}

/** 从透明度数组算内容的四向包围。横向那两个数只用于量素材实际宽度（定缩放比例），
 * 不用于裁剪。 */
export function trimBox(alpha: Uint8Array | Uint8ClampedArray, w: number, h: number, threshold = 10): BBounds {
  const v = trimVertical(alpha, w, h, threshold);
  let left = -1, right = -1;
  for (let x = 0; x < w; x++) {
    let opaque = false;
    for (let y = 0; y < h; y++) if (alpha[y * w + x] > threshold) { opaque = true; break; }
    if (opaque) { if (left < 0) left = x; right = x; }
  }
  return left < 0 ? { ...v, left: 0, right: w } : { ...v, left, right: right + 1 };
}

/** 用离屏 canvas 读像素算包围盒；测试环境（vitest 默认 node）没有 document/canvas，
 * 探测不到就直接不裁（返回整张图的尺寸），不会在非浏览器环境里抛错。 */
function verticalBounds(img: HTMLImageElement): BBounds {
  if (typeof document === 'undefined') return { top: 0, bottom: img.naturalHeight, left: 0, right: img.naturalWidth };
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  // getContext 可能返回 null（画布数量/内存吃紧时手机 Safari 会），getImageData 也可能抛
  // （零尺寸图 IndexSizeError）。原来这里是 `getContext('2d')!` 的非空断言 + 裸调用：
  // 一旦抛出去，loadParts 整个 reject，而调用方 preloadParts 没有 catch，
  // 那个角色就永远停在 'pending'——立绘再也不重画。裁边只是优化，失败就退回"不裁"，
  // 与上面 typeof document === 'undefined' 那一支同一个兜底。
  const cctx = c.getContext('2d');
  if (!cctx) return { top: 0, bottom: h, left: 0, right: w };
  let data: Uint8ClampedArray;
  try {
    cctx.drawImage(img, 0, 0);
    data = cctx.getImageData(0, 0, w, h).data;
  } catch {
    return { top: 0, bottom: h, left: 0, right: w };
  }
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
  return trimBox(alpha, w, h);
}

/** 逐件独立探测：谁加载成功就设那个字段,缺的部件字段直接不存在（不会写成 null 占位）——
 * 调用方（renderer.ts 的 seg()/头/躯干绘制）靠 `parts?.xxx` 判断存在与否,逐件回退到笔锋/
 * 胶囊绘制。目录整个不存在时 7 个请求全部 onerror,返回空对象,效果等同"整体回退"。 */
export async function loadParts(charId: string): Promise<PartImages> {
  // 必须走 BASE_URL，不能写死开头那个 /：base 是 './'（见 vite.config.ts——同一份产物
  // 既挂根域又挂 GitHub Pages 子路径），拼出来是 './chars/...'，两种前缀下都成立。
  // vite 只重写 index.html 里的引用，**运行时拼出来的字符串它一概不管**，
  // 而这一路一旦 404 是**静默**的：图拿不到就整体回退成骨骼火柴人，控制台一句错都没有
  //（docs/engine-notes.zh-CN.md 里「新角色看着都一样」那一节讲的就是这个画面）。
  // The playable roster draws from src/render/originalAtlas.ts; this probe only serves the legacy skeleton
  // characters' head/torso parts.
  const names = BASIC_NAMES;
  const imgs = await Promise.all(names.map(n => loadImg(`${import.meta.env.BASE_URL}chars/${charId}/${n}.png`)));
  const out: PartImages = {};
  names.forEach((n, i) => {
    const img = imgs[i];
    if (img) { const { top, bottom, left, right } = verticalBounds(img); out[n] = { img, top, bottom, left, right }; }
  });
  return out;
}
