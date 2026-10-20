// Canvas 的 ctx.font 不等字体加载：不处理的话开局前几帧用回退字体画字，宋体子集到位后
// 画面突然跳变（笔画粗细、字宽都变）。在开始渲染循环之前等一下 document.fonts，但这是
// 离线可玩的 PWA——字体加载失败或超时（比如离线首次访问，子集还没进 Service Worker 缓存）
// 绝不能卡住开局，超时后照旧用 @font-face 声明里的系统衬线回退栈开跑。
const FONT_FAMILY = "'ShenxianSerif'";
// 传一小段代表性文字：document.fonts.load 只保证请求到的字符对应的资源被下载，传比传空/
// 单字符更贴近实际会用到的字形（角色名/招式常见字 + 间隔号 + 全角叹号）
const SAMPLE_TEXT = '神仙打架孙悟空哪吒二郎神牛魔王奥超对手关！·';
const TIMEOUT_MS = 2000;

let cached: Promise<void> | null = null;

/** 等宋体子集就绪（或超时/失败兜底）。结果按 module 级 Promise 缓存——同一个页面会话里
 * 只有第一次挂载 GameCanvas 会真正等，后续每局重新挂载都立刻 resolve。 */
export function waitForSerifFont(): Promise<void> {
  if (cached) return cached;
  if (typeof document === 'undefined' || !('fonts' in document)) {
    cached = Promise.resolve();
    return cached;
  }
  const load = Promise.all([
    document.fonts.load(`400 20px ${FONT_FAMILY}`, SAMPLE_TEXT),
    document.fonts.load(`700 34px ${FONT_FAMILY}`, SAMPLE_TEXT),
  ]).then(
    () => undefined,
    () => undefined, // 加载失败（离线且未命中预缓存等）不算错——照旧用回退栈开跑
  );
  const timeout = new Promise<void>(resolve => setTimeout(resolve, TIMEOUT_MS));
  cached = Promise.race([load, timeout]);
  return cached;
}
