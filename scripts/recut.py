"""从 _raw/ 的整页截图重切部件——零配额，不重新出图。

为什么要重切：第一版切出来的 head 普遍是 122x64 的**横条**（原有四个是 119x112 这样的竖向），
头只占框的 7~20%，画面上就是"雷震子的头特别小"。
根因不是缩放系数，是**抠完品红后画面边缘残留了零星杂点**，把 bbox 撑成横条，
真正的头再按这个横条等比缩进去，自然只剩一点点。

所以这里换两步做法：
① **先在整页截图里定位品红面板**（找品红像素的行列范围），只在面板内部工作，
   天然排除面板外那圈键不掉的深色 UI；
② 抠完之后**按行列的墨量阈值裁**，而不是直接 getbbox——
   单像素杂点撑不起一整列，主体才撑得起，于是杂点自动被切掉。
"""
import glob, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIZE = {'head': (128, 128), 'torso': (160, 224)}


def is_magenta(r, g, b):
    """宽松判据：Gemini 每次出的品红深浅不一，第一版 r>170 and b>170 漏掉了偏暗的那种
    （猪八戒那张整个粉底都留着，看起来像张冠李戴）。"""
    return r > 110 and b > 110 and g < min(r, b) * 0.72


def recut(raw_path, out_path, size):
    im = Image.open(raw_path).convert('RGBA')
    px = im.load()
    W, H = im.size
    # ① 找品红面板：逐行逐列统计品红像素，取其密集区域
    cols = [0] * W
    rows = [0] * H
    for y in range(0, H, 2):            # 隔行采样，够用且快
        for x in range(0, W, 2):
            r, g, b, _ = px[x, y]
            if is_magenta(r, g, b):
                cols[x] += 1
                rows[y] += 1
    if not any(cols):
        return None
    cx = [x for x, v in enumerate(cols) if v > max(cols) * 0.25]
    ry = [y for y, v in enumerate(rows) if v > max(rows) * 0.25]
    if not cx or not ry:
        return None
    pad = 6
    im = im.crop((min(cx) + pad, min(ry) + pad, max(cx) - pad + 1, max(ry) - pad + 1))
    px = im.load()
    w, h = im.size
    # ② 抠品红
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0 and is_magenta(r, g, b):
                px[x, y] = (0, 0, 0, 0)
    # ③ 按"墨量"裁，不用 getbbox：一两个杂点撑不起一整列，主体才撑得起
    colc = [0] * w
    rowc = [0] * h
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 40:
                colc[x] += 1
                rowc[y] += 1
    if not any(colc):
        return None
    # 墨量阈值不是一个能拍死的常数，两个方向都翻过车：
    #   6% 太松——边缘杂点（墨量 4~5）刚好过线，bbox 被撑成整幅宽的横条，
    #            主体再按横条等比缩进去，就成了"雷震子的头特别小"；
    #   15% 太紧——白骨精那身淡色robe 的腰封/下摆只占二十来行，占比不到 15%，
    #            整列被当杂点删掉，宽度 140 掉到 72，长宽比 0.64 变 0.33，
    #            挂上去反过来被横向抻宽 1.8 倍。
    # 躯干有个**客观口径**可以裁决：挂载是横向铺到 40、纵向铺到骨长 68，两轴独立，
    # 所以内容长宽比应当接近 40/68=0.588。于是这里试几档阈值，取最接近该口径的那档。
    # 注意这只是在"边缘裁多少"之间选，改不动素材本身的形状——1.85 的宽扁躯干
    # 无论哪档都进不了带内，该报警还是报警。
    def cut(pct):
        cth = max(3, int(max(colc) * pct))
        rth = max(3, int(max(rowc) * pct))
        xs = [x for x, v in enumerate(colc) if v >= cth]
        ys = [y for y, v in enumerate(rowc) if v >= rth]
        if not xs or not ys:
            return None
        return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)

    Wt0, Ht0 = size
    cands = [c for c in (cut(pct) for pct in (0.15, 0.08, 0.04)) if c]
    if not cands:
        return None
    if Ht0 > Wt0:   # 躯干：按挂载口径挑
        box = min(cands, key=lambda c: abs((c[2] - c[0]) / max(1, c[3] - c[1]) - 0.588))
    else:           # 头：不参与骨长反推，维持原来最紧的那档
        box = cands[0]
    im = im.crop(box)
    # ④ 铺满目标框（留 4px 边），不再有"内容缩成一小团"
    Wt, Ht = size
    # 这里曾经有个 fill = 0.80：躯干**不许铺满框**，因为渲染层拿躯干内容宽反推头的缩放，
    # 而 drawBoneImg 自己用的是整幅 naturalWidth——两个口径差 160/124，头就小了一号。
    # 那是拿切图常量去凑渲染层的 bug。现在 drawBoneImg 也按内容盒取源矩形了，
    # 留白多少对画面**完全没有影响**，这个旋钮随之删除（guard: tests/boneMount.test.ts）。
    s = min((Wt - 4) / im.width, (Ht - 4) / im.height)
    im2 = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    out.paste(im2, ((Wt - im2.width) // 2, (Ht - im2.height) // 2), im2)
    out.save(out_path)
    # 躯干挂到骨骼上是**横向按内容宽铺到 40 逻辑单位、纵向按内容高铺到骨长 68**，
    # 两轴各自独立——所以素材内容的长宽比必须接近 40/68=0.588，否则就是被压扁/抻长。
    # 实测手工老素材哪吒 0.59、二郎 0.63 都在谱上，生成的白骨精 1.85、雷震子 1.68 差了三倍。
    if Ht > Wt:
        ar = im2.width / im2.height
        flag = '' if 0.45 <= ar <= 0.78 else f'  <== 长宽比 {ar:.2f} 偏离 0.588，挂上去会变形'
        return f'{im2.size} ar={ar:.2f}{flag}'
    return im2.size


if __name__ == '__main__':
    done = []
    for raw in sorted(glob.glob(os.path.join(ROOT, '_raw', '*.png'))):
        base = os.path.basename(raw)[:-4]
        if base.endswith('_raw') or base.endswith('_page'):
            continue
        if '_' not in base:
            continue
        cid, part = base.rsplit('_', 1)
        if part not in SIZE:
            continue
        out = os.path.join(ROOT, 'public', 'chars', cid, part + '.png')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        r = recut(raw, out, SIZE[part])
        done.append(f'{cid}/{part} -> {r}')
    print('\n'.join(done))
