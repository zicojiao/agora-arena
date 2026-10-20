"""把 docs/art-missing-parts.md 里剩下的部件一次跑完。

为什么是脚本不是手工：一件要 5~8 次交互，14 件手工做不完，而且每件的裁切坐标
都得重填一次。这里改成按图片自己的 boundingRect 裁——面板随对话滚动而移动，
手填坐标必然过期（第一张就是这么裁歪的）。

前置：Chrome 副本(9222) + ai-image-gen 的 cdp-proxy(3456) 都在跑，Gemini 已登录。
出一张记一张：已存在的文件直接跳过，可断点续跑。
"""
import json, os, sys, time, urllib.request, urllib.parse
from PIL import Image

PROXY = 'http://localhost:3456'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, '_raw')
os.makedirs(RAW, exist_ok=True)

STYLE = ("Flat vector illustration, thick dark outline, cel shaded, Chinese mythology character. "
         "East Asian face. Flat blocks of solid color with hard edges — "
         "no soft gradients, no airbrush shading, no fine cross-hatching, not semi-realistic. "
         "Plain flat solid magenta #FF00FF background. "
         "Absolutely no text, no letters, no words, no captions, no watermark, no signature anywhere in the image.")

# 躯干的形状是**硬约束**，不是构图偏好：挂载时横向按内容宽铺到 40 逻辑单位、纵向按内容高
# 铺到骨长 68，两轴各自独立缩放。内容长宽比偏离 40/68≈0.59 多少，画面上就变形多少。
# 第一批生成的躯干普遍是 1.3~1.85 的宽扁形（模型默认把衣服画成一件摊开的平面），
# 挂上去横向被压扁到 1/2~1/3，正是"身子不成比例"的来源。所以这句必须逐条附在躯干提示词后面。
TORSO_SHAPE = (" Tall narrow vertical torso that fills the whole height of a tall portrait frame: "
               "shoulder line touching the top edge, waist line touching the bottom edge. "
               "The silhouette must be clearly taller than wide, about 3 units wide for every 5 units tall. "
               "The body is turned to the right in a sideways fighting stance, matching the head. "
               "Nothing spreads out sideways — no outstretched sleeves, no sashes flying out, "
               "no spread wings, no wide flat laid-out garment. "
               # 袖子是这条管线栽过的坑：五件袍子都画出了垂着的袖子，而胳膊是程序化的、
               # 跟着动作摆，两者只有立正时对得上。光写 no sleeves 不够（baigu 那条写了
               # no trailing sleeves 照样出袖子），得**正面**描述一件构造上无袖的衣服。
               "The garment is a SLEEVELESS vest: its outline simply ends at the shoulder line. "
               "Do not draw sleeves, cuffs, draped shawls, or any cloth hanging along the sides. "
               "Do not cut holes into the garment — the chest and shoulders stay solid.")

# 头的朝向必须和躯干同向：docs/art-pipeline.md 第 3 节写死了"所有部件按角色面朝右画"，
# 引擎按 facing 镜像。躯干这一轮已经改成三分侧身朝右，头还留着各写各的措辞——
# 铁扇公主那条被我上次为了加宽脸削成了 "facing slightly right"，模型就画成了正脸。
# "单独一颗头"这句是必须的：描述视角的措辞（双颊可见/不要侧脸/不要正脸）容易被理解成
# "画几个视角对比"，实测铁扇公主那张出成了并排两颗头的双联图，包围盒把两颗都框进去，
# 切出来就是 124x74 的横条——正是文档里记着的那个"头特别小"的老毛病，换了个成因。
HEAD_SHAPE = (" A single head, one view only — one subject alone in the picture, "
              "not a character sheet, no multiple views, no side-by-side panels, no duplicates. "
              "Head and neck fill the frame. "
              # 朝向要写成**可执行的几何**，不能写成感受。上一版写的是"三分侧面朝右、双颊可见"，
              # 结果全员出正脸——"双颊可见"本身就在往正脸推（那句是更早为了让铁扇公主的脸别太窄加的，
              # 现在头按面积归一，宽窄已经不靠它兜了）。真正的三分侧面恰恰是远侧脸颊被挡掉一部分。
              # "rotated" 单写会被理解成**旋转画面**——实测白骨精那颗整个头躺倒了 90 度，
              # 切出来 124x83 的横条。必须写明绕哪根轴转、且头保持竖直。
              "The head stays upright with the chin level — do not tilt or rotate the picture. "
              "It is turned horizontally about 35 degrees to its right, pivoting around the vertical "
              "axis of the neck, the same direction the body is turned: "
              "the nose breaks the line of the far cheek, the far cheek is partly hidden behind it, "
              "the near ear is fully visible and the far ear is hidden. "
              "Not a frontal portrait facing the camera, and not a flat 90-degree side profile. "
              # 配色那句要限定作用范围。实测铁扇公主那条写"teal and white palette"，
              # 模型把整幅画都染成青绿，连脸一起——出来是一张没有肤色的单色线稿。
              # 同轮红孩儿"crimson and gold palette"却是正常肤色，因为他本来就配红发，
              # 差别在于脸色会不会被那两个颜色吃掉。所以显式圈定：配色只管头发/冠饰/衣领。
              "The stated palette applies to the hair, headwear, collar and ornaments only — "
              "the face keeps a natural warm skin tone, unless the character is explicitly "
              "described as having a non-human face colour.")

# (角色 id, 部件, 尺寸, 这件东西画什么)
JOBS = [
    ('honghaier', 'head',  (128, 128), "Head and neck only of Red Boy, a Chinese boy demon deity: childlike round face with a fierce grin, flame-red hair gathered into two tufts, crimson and gold palette."),
    ('honghaier', 'torso', (160, 224), "Torso only of Red Boy, a Chinese boy demon deity: crimson battle tunic with gold cloud trim, red sash. No head, no arms, no legs. Three-quarter view turned to the right, the same turn as the head — not facing the camera straight on."),
    ('tieshan',   'head',  (128, 128), "Head and neck only of Princess Iron Fan, a Chinese noblewoman deity: high coiled hair with a single jade hairpin, composed dignified full round face, teal and white palette."),
    ('tieshan',   'torso', (160, 224), "Torso only of Princess Iron Fan: SLEEVELESS teal bodice cut straight across at the shoulder seams, white silk trim along the neckline only. No shawl, no draped fabric over the shoulders. No head, no arms, no legs. Three-quarter view turned to the right, the same turn as the head — not facing the camera straight on."),
    ('baigu',     'head',  (128, 128), "Head and neck only of the White Bone Lady, a Chinese ghost spirit in opera style: pale white painted face with dark shadowed eyes, bone-white and grey-green palette."),
    ('baigu',     'torso', (160, 224), "Torso only of a Chinese opera ghost-lady costume: SLEEVELESS pale ivory layered vestment cut off at the shoulder seams, broad square shoulders as wide as the chest, full-bodied not a slender column, grey-green silk sash tied at the waist. Both arm openings are empty. No head, no arms, no legs. Three-quarter view turned to the right, the same turn as the head — not facing the camera straight on."),
    ('houyi',     'head',  (128, 128), "Head and neck only of Hou Yi the archer, a Chinese hunter deity: cloth headband across the brow, weathered determined face, ochre and amber palette."),
    ('houyi',     'torso', (160, 224), "Torso only of Hou Yi the archer: ochre hunter's short jacket, leather chest strap, amber trim. No head, no arms, no legs. Three-quarter view turned to the right, the same turn as the head — not facing the camera straight on."),
    ('leizhen',   'head',  (128, 128), "Head and neck only of Lei Zhenzi, a Chinese thunder deity: blue-green face with a sharp beak-like nose, lightning motif on the brow, thunder-blue and moon-white palette."),
    ('leizhen',   'torso', (160, 224), "Torso only of Lei Zhenzi: SLEEVELESS thunder-blue tunic cut off at the shoulder seams, moon-white feathered wing roots folded tight against the back, not spread. Both arm openings are empty. No head, no arms, no legs. Three-quarter view turned to the right, the same turn as the head — not facing the camera straight on."),
    ('zhongkui',  'head',  (128, 128), "Head and neck only of a Chinese opera magistrate character: full curly black beard, black winged futou official hat, dignified stern face, deep purple and vermilion palette."),
    ('zhongkui',  'torso', (160, 224), "Torso only of a Chinese opera magistrate costume: broad heavy shoulders and a stout barrel chest, SLEEVELESS vermilion official vestment cut off at the shoulder seams, dark purple sash and a jade belt plaque. Both arm openings are empty. No head, no arms, no legs. Three-quarter view turned to the right, the same turn as the head — not facing the camera straight on."),
    ('bajie',     'head',  (128, 128), "Head and neck only of Zhu Bajie, a Chinese pig-headed monk deity: boar snout, large floppy ears, good-natured dim expression, earth-brown and cream palette."),
    ('bajie',     'torso', (160, 224), "Torso only of Zhu Bajie: SLEEVELESS earth-brown monk's kasaya over a big round belly, cut off at the shoulder seams, cream sash. Both arm openings are empty. No head, no arms, no legs. Three-quarter view turned to the right, the same turn as the head — not facing the camera straight on."),
    # 刑天无头：只出 torso，眼睛画在胸口、嘴画在腹上
    ('xingtian',  'torso', (160, 224), "Torso only of Xing Tian, the headless Chinese warrior god: a pair of fierce eyes on the chest and a wide mouth on the belly, russet and antique bronze armor. No head, no neck, no arms, no legs. Three-quarter view turned to the right, the same turn as the head — not facing the camera straight on."),
]


def is_magenta(r, g, b):
    """与 scripts/recut.py 同一份判据，别再各写一份。

    原来这里是 `r > 170 and b > 170 and g < 140`，recut.py 早就记着它不够用：
    Gemini 每次出的品红深浅不一，严判据**漏掉偏暗的那种**，抠不干净时整张粉底
    留在素材里（"猪八戒那张整个粉底都留着，看起来像张冠李戴"）。
    同一条规则写两份、其中一份修了另一份没修，正是这个仓库反复栽的那类漂移。
    """
    return r > 110 and b > 110 and g < min(r, b) * 0.72


def post(path, body):
    req = urllib.request.Request(PROXY + path, data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=60))


def ev(target, expr):
    return post('/eval', {'target': target, 'expression': expr}).get('value')


def big_imgs(target):
    """当前页面上的生成图（长边 >800），返回 src 列表。

    判据必须用**长边**，不能用 naturalWidth：那是照着 Gemini 默认横图 1264x848 定的。
    躯干提示词改成"高瘦竖构图 3:5"之后，模型如实出了 617x1024 的竖图，宽度不到 800，
    判据永远不触发——连着两件判成 TIMEOUT，而图其实都出来了，配额白烧。
    提示词的构图要求和完成判据是耦合的，改一个就得回头看另一个。
    """
    raw = ev(target, "JSON.stringify([...document.images].filter(i=>Math.max(i.naturalWidth,i.naturalHeight)>800).map(i=>i.src))")
    try:
        return json.loads(raw or '[]')
    except Exception:
        return []


def make(target, cid, part, size, desc):
    out = os.path.join(ROOT, 'public', 'chars', cid, part + '.png')
    prompt = STYLE + ' ' + desc + (TORSO_SHAPE if part == 'torso' else HEAD_SHAPE)
    # 每件开一条**新对话**。复用同一个线程时踩过：某次生成挂住之后，
    # 后续 /enter 全部发不出去——提示词就一直躺在编辑器里，页面尾部还留着上一次的
    # "Creating your image"。表现像限流，其实是被那条卡住的对话堵在后面。
    ev(target, "location.href='https://gemini.google.com/app'")
    for _ in range(30):
        time.sleep(2)
        if ev(target, "!!document.querySelector('.ql-editor')"):
            break
    time.sleep(2)
    # 盯**最后一张图的 src**，不盯数量：Gemini 会把滚出视野的旧图从 DOM 回收，
    # 数量可能持平甚至变少——第一版用 len()>before 判完成，连报 6 次 TIMEOUT，
    # 而图其实都出来了（标签页标题正常、不是触额），是判据认不出来。
    prev = big_imgs(target)
    prev_last = prev[-1] if prev else ''
    # 填提示词并提交
    ev(target, "(()=>{const e=document.querySelector('.ql-editor');e.focus();"
               "const r=document.createRange();r.selectNodeContents(e);"
               "const s=getSelection();s.removeAllRanges();s.addRange(r);"
               "document.execCommand('insertText',false," + json.dumps(prompt) + ");return 1})()")
    # 点发送按钮，不靠 /enter：实测 /enter 回执正常（entered: .ql-editor）但根本没提交——
    # 312 字的提示词一直躺在编辑器里，big=0。第一次手工能成是因为 /enter 紧跟 insertText
    # 单独发、焦点还在；脚本里中间隔了一次 eval，焦点掉了。
    # 先开焦点仿真再提交——这是唯一稳定的路径。
    # 合成点击对 Gemini 恒 no-op（skill 里明写着）；/enter 单用也不行，
    # 焦点丢了就没人接那一下。实测：不开 focus 时点按钮，editorLen 一直是 327 不变；
    # 开了 focus 再 /enter，editorLen 立刻变 1、发送按钮消失。
    post('/focus', {'target': target, 'enabled': True})
    time.sleep(1)
    post('/enter', {'target': target, 'selector': '.ql-editor'})
    time.sleep(2)
    if len(ev(target, "(document.querySelector('.ql-editor')||{}).innerText||''") or '') > 20:
        sent = ev(target, "(()=>{const b=[...document.querySelectorAll('button')]"
                      ".find(x=>/send|发送/i.test((x.getAttribute('aria-label')||'')+x.className));"
                      "if(b){b.click();return 'clicked'}return 'no-button'})()")
        if sent != 'clicked':
            post('/enter', {'target': target, 'selector': '.ql-editor'})   # 兜底
    # 等新图出现（最多 10 分钟；6 分钟那版有件是生成没跑完就被判超时）
    for i in range(120):
        time.sleep(5)
        if i < 3:
            continue   # 前 15 秒一律不认：出图从来没这么快。这段时间里冒出来的"新图"
                       # 多半是 Gemini 把上一轮会话的图重新挂回 DOM（它会回收也会重挂），
                       # prev_last 是导航后 2 秒采的，那会儿页面常常还是空的（''）。
                       # 认了就会把上一条会话的图裁下来存成本部件，还打一行 OK——静默投毒。
        cur = big_imgs(target)
        if cur and cur[-1] != prev_last:
            break
    else:
        print('TIMEOUT', cid, part, flush=True)
        return False
    time.sleep(3)
    # 取最后一张生成图的位置（按它自己的 rect 裁，不手填坐标）
    rect = json.loads(ev(target,
        "(()=>{const a=[...document.images].filter(i=>Math.max(i.naturalWidth,i.naturalHeight)>800);"
        "const i=a[a.length-1];i.scrollIntoView({block:'center'});const r=i.getBoundingClientRect();"
        "return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height,d:devicePixelRatio})})()"))
    time.sleep(1)
    shot = os.path.join(RAW, f'{cid}_{part}.png')
    urllib.request.urlopen(f'{PROXY}/shot?target={target}&file=' + urllib.parse.quote(shot), timeout=60).read()
    # 裁 + 抠品红 + 装框
    d = rect['d']
    im = Image.open(shot).convert('RGBA')
    # **按截图里品红的实际范围裁，不按 <img> 的 rect 裁。**
    # rect 描述的是元素的布局盒，而生成图常常比视口还高：scrollIntoView 居中之后
    # rect.y 是负数、rect.y+rect.h 超出视口底，可截图只有视口那么大。拿它当裁切边界，
    # 下边界就会一路越界，把 Gemini 的输入框（"问问 Gemini / Flash / 麦克风"）
    # 连同免责声明一起圈进素材——实测一轮四张全中，底部约 46px 全是页面 UI。
    # 品红是我们自己在提示词里要求的背景，它的范围才是面板的真实范围。
    px = im.load()
    W0, H0 = im.size
    step = 4
    rows = [y for y in range(H0)
            if sum(1 for x in range(0, W0, step) if is_magenta(*px[x, y][:3])) >= 8]
    cols = [x for x in range(W0)
            if sum(1 for y in range(0, H0, step) if is_magenta(*px[x, y][:3])) >= 8]
    # 阈值 8 是用来甩掉侧栏里零星的品红单点的（选中态的对话条目就有）；
    # 不能用"每行品红数 > 最大值的某个比例"——主体占满画面的那些行品红本来就少，
    # 会被当成不是面板。实测那么写长宽比算出 1.106，整张裁飞。
    if rows and cols:
        pad = int(6 * d)
        im = im.crop((max(0, cols[0] + pad), max(0, rows[0] + pad),
                      min(W0, cols[-1] - pad + 1), min(H0, rows[-1] - pad + 1)))
    else:
        # 没找到品红面板（模型没照要求上品红底）：退回按 rect 裁，但**钳进截图范围内**
        pad = int(10 * d)
        im = im.crop((max(0, int(rect['x'] * d) + pad), max(0, int(rect['y'] * d) + pad),
                      min(W0, int((rect['x'] + rect['w']) * d) - pad),
                      min(H0, int((rect['y'] + rect['h']) * d) - pad)))
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a > 0 and is_magenta(r, g, b):
                px[x, y] = (0, 0, 0, 0)
    bb = im.getbbox()
    if not bb:
        print('EMPTY', cid, part, flush=True)
        return False
    im = im.crop(bb)
    W, H = size
    s = min((W - 6) / im.width, (H - 6) / im.height)
    im2 = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    canvas = Image.new('RGBA', size, (0, 0, 0, 0))
    canvas.paste(im2, ((W - im2.width) // 2, (H - im2.height) // 2), im2)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    canvas.save(out)
    print('OK', cid, part, im2.size, flush=True)
    return True


FORCE = set(sys.argv[1:])   # 点名重出：python gen-parts.py baigu_torso leizhen_torso ...
                            # 不点名就是纯续跑（已存在跳过）。改了提示词却不点名，等于没改。

if __name__ == '__main__':
    targets = json.load(urllib.request.urlopen(PROXY + '/targets', timeout=30))
    t = next((x['id'] for x in targets if 'gemini.google.com' in x.get('url', '')), None)
    if not t:
        raise SystemExit('找不到 Gemini 标签页——先开一个并登录')
    print('target', t, flush=True)
    done = 0
    made = 0        # 真正出过图的件数——跳过的不算，否则续跑会报"完成 14 / 14"却一张没出
    fails = 0
    for cid, part, size, desc in JOBS:
        out = os.path.join(ROOT, 'public', 'chars', cid, part + '.png')
        if os.path.exists(out) and not (FORCE & {cid, f'{cid}_{part}'}):
            print('skip (已存在)', cid, part, flush=True)
            continue    # 没占配额就不退避——续跑时十几件全跳过要白等 21 分钟。
                        # 存在判断放在这里而不是 make() 里：它决定的是"要不要退避"，那是循环的事。
        try:
            ok = make(t, cid, part, size, desc)
        except Exception as e:
            print('ERR', cid, part, repr(e)[:160], flush=True)
            ok = False
        made += 1
        if ok:
            done += 1
        fails = 0 if ok else fails + 1
        # 件间退避：4 秒那版连续提交十来发之后被限流（页面停在 Creating your image 不出图）。
        # skill 红线：别猛捶单账号、检测到限流要退避。慢比被封好。
        # 连续失败通常就是 1095 过载或触额，这时候接着捶只会加深封标，所以退避加长到 10 分钟。
        time.sleep(600 if fails >= 2 else 90)
    print('完成', done, '/', made, flush=True)
