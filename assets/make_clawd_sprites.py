# -*- coding: utf-8 -*-
"""Claw'd 风格像素螃蟹精灵图生成器（原创致敬 Anthropic 吉祥物造型）

方形身体 / 黑方块眼 / 侧边小短臂 / 四条短腿 / 纯色无描边。
Codex Pet Standard: 8列x9行, 192x208/格。输出 renderer/spritesheet.webp。

用 30_Tools/py311 环境运行:
  python assets/make_clawd_sprites.py
"""
import os
from PIL import Image, ImageDraw

LW, LH = 48, 52
SCALE = 4
COLS, ROWS = 8, 9
CW, CH = LW * SCALE, LH * SCALE

CORAL = (217, 119, 87, 255)      # #D97757 Anthropic 珊瑚橙
CORAL_DK = (192, 98, 68, 255)    # 阴影(腿/暗部)
INK = (26, 20, 18, 255)          # 眼睛
SWEAT = (110, 185, 235, 255)
PROP = (110, 100, 105, 255)
DUST = (203, 192, 182, 255)
LAPTOP_DK = (52, 50, 60, 255)      # 笔记本外框
LAPTOP_BASE = (150, 150, 162, 255) # 键盘底座
SCREEN_A = (38, 78, 110, 255)      # 屏幕(暗)
SCREEN_B = (44, 90, 126, 255)      # 屏幕(亮, 闪烁)
SCREEN_TXT = (140, 220, 170, 255)  # 代码行(终端绿)
STEM = (96, 160, 84, 255)          # 花茎
PETAL = (242, 140, 177, 255)       # 花瓣
POLLEN = (255, 217, 90, 255)       # 花蕊
CUP = (246, 238, 222, 255)         # 咖啡杯
COFFEE = (92, 56, 40, 255)         # 咖啡
STEAM = (190, 186, 190, 200)       # 蒸汽
GLASS = (150, 200, 240, 255)       # 水杯
WATER = (92, 160, 230, 255)        # 水
FRYBOX = (214, 48, 49, 255)        # 薯条盒
FRY = (250, 200, 60, 255)          # 薯条
SAUSAGE = (190, 80, 60, 255)       # 香肠
SAUSAGE_DK = (140, 52, 40, 255)    # 香肠端
STICK = (170, 150, 120, 255)       # 签子
HP_DARK = (58, 56, 70, 255)        # 耳机
HP_LIGHT = (128, 126, 145, 255)    # 耳机内衬
PAD = (124, 124, 136, 255)         # 手柄
PAD_DK = (80, 80, 92, 255)         # 手柄握把
BTN = [(226, 80, 80, 255), (90, 190, 110, 255), (80, 140, 230, 255), (250, 210, 80, 255)]
CAP = (70, 90, 170, 255)           # 睡帽
CAP_WHITE = (248, 248, 250, 255)   # 睡帽边/绒球
PHONE = (40, 40, 48, 255)          # 手机
PHONE_A = (70, 120, 180, 255)      # 手机屏
PHONE_B = (92, 144, 206, 255)      # 手机屏(亮)
ZINK = (120, 110, 130, 255)        # zZZ

GROUND = 48

# 基准几何(逻辑像素): 身体 x10..38 y22..40, 腿基线 40, 眼 y26
BX0, BX1 = 10, 38
BY0, BY1 = 22, 40
LEG_XS = [13, 19, 27, 33]  # 腿左缘, 宽3
EYE_L, EYE_R = 15, 29      # 眼左缘, 4x4


def R(d, x0, y0, x1, y1, fill, radius=0):
    if radius > 0:
        d.rounded_rectangle([round(x0), round(y0), round(x1), round(y1)], radius=radius, fill=fill)
    else:
        d.rectangle([round(x0), round(y0), round(x1), round(y1)], fill=fill)


def draw_eye(d, x, y, state, look=0):
    """x = 眼左缘。4x4 方块眼是 Claw'd 的灵魂"""
    x += look
    if state == "open":
        R(d, x, y, x + 3, y + 3, INK)
    elif state == "closed":
        R(d, x, y + 2, x + 3, y + 2, INK)
    elif state == "happy":  # ^
        d.line([round(x), round(y + 2), round(x + 1.5), round(y)], fill=INK, width=1)
        d.line([round(x + 1.5), round(y), round(x + 3), round(y + 2)], fill=INK, width=1)
    elif state == "x":
        d.line([round(x), round(y), round(x + 3), round(y + 3)], fill=INK, width=1)
        d.line([round(x), round(y + 3), round(x + 3), round(y)], fill=INK, width=1)
    elif state == "half":
        R(d, x, y + 2, x + 3, y + 3, INK)


def draw_clawd(d, p):
    dx = p.get("dx", 0)
    dy = p.get("dy", 0)
    ground = GROUND

    # 动作线(身后)
    for x0, y0, x1, y1 in p.get("motion", []):
        d.line([round(x0), round(y0), round(x1), round(y1)], fill=(168, 158, 152, 210), width=1)

    bx0, bx1 = BX0 + dx, BX1 + dx
    by0, by1 = BY0 + dy - p.get("tall", 0), BY1 + dy   # tall: 伸懒腰时身体拉高

    # ── 腿(4条, 宽3) ──
    legs = p.get("legs", "stand")  # stand / phase0-3 / tuck / splay
    for i, lx in enumerate(LEG_XS):
        x = lx + dx
        if legs == "tuck":       # 腾空收腿
            R(d, x, by1, x + 2, by1 + 3, CORAL_DK)
        elif legs == "splay":    # 瘫倒外八
            off = -2 if i < 2 else 2
            R(d, x + off, by1, x + 2 + off, ground - 1, CORAL_DK)
        elif isinstance(legs, int):  # 走路: 交错抬腿
            lift = 2 if i % 2 == (legs % 2) else 0
            R(d, x, by1, x + 2, ground - 1 - lift, CORAL_DK)
        else:                    # 站立
            R(d, x, by1, x + 2, ground - 1, CORAL_DK)

    # ── 臂(侧边小短臂) ──
    arm_l = p.get("arm_l", "side")   # side / up / down / none
    arm_r = p.get("arm_r", "side")
    ay = by0 + 4
    if arm_l == "side":
        R(d, bx0 - 6, ay, bx0, ay + 5, CORAL)
    elif arm_l == "up":
        R(d, bx0 - 6, by0 - 8, bx0 - 1, by0 + 6, CORAL)
    elif arm_l == "stretch":
        R(d, bx0 - 6, by0 - 13, bx0 - 1, by0 + 6, CORAL)
    elif arm_l == "hold":
        R(d, bx0 - 5, by0 + 1, bx0, by0 + 6, CORAL)
    elif arm_l == "down":
        R(d, bx0 - 5, ay + 4, bx0, ay + 10, CORAL)
    if arm_r == "side":
        R(d, bx1, ay, bx1 + 6, ay + 5, CORAL)
    elif arm_r == "up":
        R(d, bx1 + 1, by0 - 8, bx1 + 6, by0 + 6, CORAL)
    elif arm_r == "stretch":
        R(d, bx1 + 1, by0 - 13, bx1 + 6, by0 + 6, CORAL)
    elif arm_r == "hold":
        R(d, bx1, by0 + 1, bx1 + 5, by0 + 6, CORAL)
    elif arm_r == "down":
        R(d, bx1, ay + 4, bx1 + 5, ay + 10, CORAL)

    # ── 身体(平涂圆角方块) ──
    R(d, bx0, by0, bx1, by1, CORAL, radius=2)

    # ── 笔记本电脑(挡在身体下半部, 眼睛露在上面) ──
    if "laptop" in p:
        flick = p["laptop"]  # 0/1 屏幕闪烁
        R(d, bx0 + 5, by1 - 9, bx1 - 5, by1 - 1, LAPTOP_DK)                 # 屏幕外框
        R(d, bx0 + 6, by1 - 8, bx1 - 6, by1 - 2, SCREEN_A if flick else SCREEN_B)  # 屏幕
        for i in range(3):                                                 # 代码行
            R(d, bx0 + 7, by1 - 7 + i * 2, bx0 + 7 + (5, 8, 3)[i] - (1 if flick and i == 1 else 0),
              by1 - 7 + i * 2, SCREEN_TXT)
        R(d, bx0 + 3, by1 - 1, bx1 - 3, by1 + 1, LAPTOP_BASE)              # 键盘底座
        # 打字的小手(搭在键盘上, 交替上下)
        ty = p.get("type_phase", 0)
        R(d, bx0 + 1, by1 - 3 + ty, bx0 + 5, by1 - 1, CORAL)
        R(d, bx1 - 5, by1 - 3 + (1 - ty), bx1 - 1, by1 - 1, CORAL)

    # ── 手柄(身前) + 耳机 ──
    if "gamepad" in p:
        ph = p["gamepad"]  # 0/1 按键相位
        R(d, bx0 + 4, by1 - 4, bx0 + 6, by1, PAD_DK)             # 左握把
        R(d, bx1 - 6, by1 - 4, bx1 - 4, by1, PAD_DK)             # 右握把
        R(d, bx0 + 5, by1 - 7, bx1 - 5, by1 - 2, PAD)            # 手柄本体
        R(d, bx0 + 8, by1 - 6, bx0 + 8, by1 - 4, PAD_DK)         # 十字键 竖
        R(d, bx0 + 7, by1 - 5, bx0 + 9, by1 - 5, PAD_DK)         # 十字键 横
        for i, (ox, oy) in enumerate(((0, -1), (-1, 0), (1, 0), (0, 1))):  # ABXY
            d.point([(round(bx1 - 9 + ox), round(by1 - 5 + oy))], fill=BTN[i])
        R(d, bx0 + 6, by1 - 9 + ph, bx0 + 7, by1 - 8 + ph, CORAL)          # 左拇指
        R(d, bx1 - 8, by1 - 9 + (1 - ph), bx1 - 7, by1 - 8 + (1 - ph), CORAL)  # 右拇指
    if p.get("headphones"):
        R(d, bx0 + 1, by0 - 3, bx1 - 1, by0 - 2, HP_DARK)        # 头带
        R(d, bx0 - 3, by0 + 1, bx0, by0 + 8, HP_DARK)            # 左耳罩
        R(d, bx1, by0 + 1, bx1 + 3, by0 + 8, HP_DARK)            # 右耳罩
        R(d, bx0 - 2, by0 + 3, bx0 - 2, by0 + 6, HP_LIGHT)
        R(d, bx1 + 2, by0 + 3, bx1 + 2, by0 + 6, HP_LIGHT)

    # ── 手机(身前, 双手捧着) ──
    if "phone" in p:
        cx = (bx0 + bx1) // 2
        R(d, cx - 4, by1 - 10, cx + 4, by1 - 1, PHONE)
        R(d, cx - 3, by1 - 9, cx + 3, by1 - 3, PHONE_B if p["phone"] else PHONE_A)
        R(d, cx - 7, by1 - 6, cx - 4, by1 - 3, CORAL)           # 左手
        R(d, cx + 4, by1 - 6, cx + 7, by1 - 3, CORAL)           # 右手
        d.point([(round(cx + 2), round(by1 - 5 + p["phone"]))], fill=CORAL)  # 拇指点屏

    # ── 薯条盒(左手) ──
    if "fries" in p:
        n = p["fries"]  # 剩余薯条根数
        R(d, bx0 - 9, by0 + 5, bx0 - 2, by0 + 12, FRYBOX)
        R(d, bx0 - 8, by0 + 6, bx0 - 3, by0 + 6, CUP)           # 盒口高光
        for i in range(n):
            R(d, bx0 - 8 + i * 2, by0 + 1 + (i % 2), bx0 - 8 + i * 2, by0 + 5, FRY)

    # ── 眼睛 ──
    eyes = p.get("eyes", "open")
    look = p.get("look", 0)
    ey = by0 + 4 + p.get("eye_dy", 0)
    draw_eye(d, EYE_L + dx, ey, eyes, look)
    draw_eye(d, EYE_R + dx, ey, eyes, look)

    # ── 睡帽(眼睛之后, 盖住头顶) ──
    if p.get("nightcap"):
        R(d, bx0 + 2, by0 - 3, bx1 - 2, by0 - 1, CAP_WHITE)       # 白边
        for i in range(6):                                         # 向右歪的锥体
            R(d, bx0 + 3 + i * 3, by0 - 4 - i, bx1 - 3 - i, by0 - 4 - i, CAP)
        R(d, bx1 - 9, by0 - 12, bx1 - 7, by0 - 10, CAP_WHITE)     # 绒球

    # ── 手里的食物/饮料(眼睛之后, 送到脸前时可以挡住眼睛) ──
    if "cup" in p:  # ("coffee"|"water", at_face: bool, steam phase)
        kind, at_face, ph = p["cup"]
        if at_face:
            x0, y0 = bx1 - 9, by0 + 0
        else:
            x0, y0 = bx1 + 3, by0 - 6
        if kind == "coffee":
            R(d, x0, y0, x0 + 6, y0 + 6, CUP)
            R(d, x0 + 1, y0, x0 + 5, y0, COFFEE)                  # 咖啡液面
            R(d, x0 + 7, y0 + 2, x0 + 7, y0 + 4, CUP)              # 杯把
            if not at_face:
                for j in range(2):                                # 蒸汽
                    sx = x0 + 2 + j * 3
                    sy = y0 - 3 - ((ph + j) % 2)
                    d.point([(round(sx), round(sy)), (round(sx + (1 if (ph + j) % 2 else -1)), round(sy - 2))], fill=STEAM)
        else:
            R(d, x0 + 1, y0, x0 + 5, y0 + 6, GLASS)
            R(d, x0 + 2, y0 + 2, x0 + 4, y0 + 6, WATER)
            R(d, x0 + 1, y0, x0 + 1, y0 + 6, CAP_WHITE)             # 高光
    if "fry_hand" in p:  # 右手捏薯条送到脸前(手在眼睛下方, 薯条竖在眼睛旁边)
        R(d, bx1 - 7, by0 + 9, bx1 - 1, by0 + 12, CORAL)
        if p["fry_hand"]:
            R(d, bx1 - 3, by0 + 2, bx1 - 3, by0 + 8, FRY)
    if "sausage" in p:  # (length, at_face)
        ln, at_face = p["sausage"]
        if at_face:
            x1, y0 = bx1 - 2, by0 + 3
            x0 = x1 - ln
        else:
            x0, y0 = bx1 + 2, by0 - 3
            x1 = x0 + ln
            R(d, bx1 + 2, by0 - 1, bx1 + 2, by0 + 1, STICK)         # 签子
        if ln > 0:
            R(d, x0, y0, x1, y0 + 2, SAUSAGE)
            R(d, x0, y0, x0, y0 + 2, SAUSAGE_DK)
            R(d, x1, y0, x1, y0 + 2, SAUSAGE_DK)
    if "zz" in p:  # 睡觉的 zZZ, 参数是上浮偏移
        off = p["zz"]
        zx, zy = bx1 + 4, by0 - 4 - off
        for i, s in enumerate((2, 3, 4)):
            x, y = zx + i * 4, zy - i * 4
            R(d, x, y - s, x + s, y - s, ZINK)
            for k in range(s + 1):
                d.point([(round(x + s - k), round(y - s + k))], fill=ZINK)
            R(d, x, y, x + s, y, ZINK)
    if "heart" in p:  # 被摸头: 头顶飘小爱心 + 腮红
        hx, hy = bx1 - 2, by0 - 7 - p["heart"]
        R(d, hx - 2, hy - 1, hx - 1, hy, PETAL)
        R(d, hx + 1, hy - 1, hx + 2, hy, PETAL)
        R(d, hx - 3, hy, hx + 3, hy + 1, PETAL)
        R(d, hx - 2, hy + 2, hx + 2, hy + 2, PETAL)
        R(d, hx - 1, hy + 3, hx + 1, hy + 3, PETAL)
        d.point([(round(hx), round(hy + 4))], fill=PETAL)
        R(d, EYE_L + dx - 1, by0 + 9, EYE_L + dx + 1, by0 + 9, PETAL)   # 腮红
        R(d, EYE_R + dx + 2, by0 + 9, EYE_R + dx + 4, by0 + 9, PETAL)
    if "z1" in p:  # 打瞌睡的一个小 z
        x, y = bx1 + 4, by0 - 5 - p["z1"]
        R(d, x, y - 2, x + 2, y - 2, ZINK)
        d.point([(round(x + 1), round(y - 1))], fill=ZINK)
        R(d, x, y, x + 2, y, ZINK)

    # ── 小花(举在右臂顶端) ──
    if "flower" in p:
        fx = bx1 + 3 + p["flower"]      # 摇摆偏移
        fy = by0 - 12
        d.line([round(bx1 + 3), round(by0 - 8), round(fx), round(fy + 4)], fill=STEM, width=1)  # 茎
        R(d, fx - 4, fy - 1, fx - 3, fy + 1, PETAL)   # 左瓣
        R(d, fx + 3, fy - 1, fx + 4, fy + 1, PETAL)   # 右瓣
        R(d, fx - 1, fy - 4, fx + 1, fy - 3, PETAL)   # 上瓣
        R(d, fx - 1, fy + 3, fx + 1, fy + 4, PETAL)   # 下瓣
        R(d, fx - 2, fy - 2, fx + 2, fy + 2, PETAL)   # 花心外圈
        R(d, fx - 1, fy - 1, fx + 1, fy + 1, POLLEN)  # 花蕊
        d.point([(round(bx1 + 1), round(by0 - 6))], fill=STEM)           # 叶子
        R(d, bx1 + 0, by0 - 6, bx1 + 1, by0 - 5, STEM)

    # ── 小道具(前景) ──
    if "sweat" in p:
        sx, sy = p["sweat"]
        R(d, sx, sy, sx + 1, sy + 2, SWEAT)
        d.point([round(sx), round(sy - 1)], fill=SWEAT)
    if "qmark" in p:
        qy = 12 + p["qmark"]
        qx = bx1 + 4
        d.arc([qx - 2, qy - 3, qx + 2, qy + 1], start=180, end=90, fill=PROP, width=2)
        d.line([round(qx + 1.6), round(qy), round(qx), round(qy + 2)], fill=PROP, width=2)
        d.point([round(qx), round(qy + 4)], fill=PROP)
    if "dots" in p:
        for i in range(p["dots"]):
            R(d, bx1 + 3 + i * 4, 14 - i, bx1 + 4 + i * 4, 15 - i, PROP)
    if "bang" in p:
        bx = bx1 + 4
        d.line([round(bx), 9, round(bx), 14], fill=(226, 96, 60, 255), width=2)
        d.point([round(bx), 16], fill=(226, 96, 60, 255))
    if p.get("dust"):
        for ox in (bx0 - 5, bx1 + 3):
            R(d, ox, ground - 3, ox + 2, ground - 2, DUST)
            R(d, ox + 1, ground - 5, ox + 2, ground - 4, DUST)


def render(p, mirror=False):
    img = Image.new("RGBA", (LW, LH), (0, 0, 0, 0))
    draw_clawd(ImageDraw.Draw(img), p)
    if p.get("rot"):  # 后空翻: 绕身体中心旋转
        img = img.rotate(p["rot"], resample=Image.NEAREST, center=(24, 32))
    if p.get("lift"):  # 腾空高度
        shifted = Image.new("RGBA", (LW, LH), (0, 0, 0, 0))
        shifted.paste(img, (0, -int(p["lift"])))
        img = shifted
    if mirror:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    return img.resize((CW, CH), Image.NEAREST)


def frames_idle():
    return [
        {"dy": 0, "eyes": "open"},
        {"dy": 0, "eyes": "open"},
        {"dy": -1, "eyes": "open"},
        {"dy": -1, "eyes": "open", "arm_r": "up"},
        {"dy": 0, "eyes": "closed"},
        {"dy": 0, "eyes": "open"},
    ]


def frames_run(direction=1):
    fs = []
    for i in range(8):
        mx = 5 if direction < 0 else 43
        fs.append({
            "dy": -1 if i % 2 == 0 else 0,
            "dx": direction,
            "legs": i,
            "eyes": "open",
            "look": direction,
            "motion": [(mx, 30, mx + 3 * (1 if direction < 0 else -1), 30),
                       (mx, 36, mx + 2 * (1 if direction < 0 else -1), 36)] if i % 2 == 0 else [],
        })
    return fs


def frames_waving():
    return [
        {"eyes": "happy", "arm_r": "up", "dy": -1},
        {"eyes": "happy", "arm_r": "side"},
        {"eyes": "happy", "arm_r": "up", "dy": -1},
        {"eyes": "happy", "arm_r": "side"},
    ]


def frames_jumping():
    return [
        {"dy": 2, "eyes": "open", "legs": "stand"},
        {"dy": -6, "eyes": "happy", "legs": "tuck", "arm_l": "up", "arm_r": "up"},
        {"dy": -10, "eyes": "happy", "legs": "tuck", "arm_l": "up", "arm_r": "up", "bang": True},
        {"dy": -4, "eyes": "happy", "legs": "tuck", "arm_l": "up", "arm_r": "up"},
        {"dy": 0, "eyes": "happy", "legs": "stand", "dust": True},
    ]


def frames_failed():
    fs = []
    for i in range(8):
        fs.append({
            "dy": 2,
            "dx": 1 if i % 2 == 0 else -1,
            "eyes": "x",
            "legs": "splay",
            "arm_l": "down",
            "arm_r": "down",
            "sweat": (40, 18 + (i % 4)),
        })
    return fs


def frames_waiting():
    looks = [-1, -1, 0, 1, 1, 0]
    fs = []
    for i in range(6):
        fs.append({
            "eyes": "closed" if i == 5 else "open",
            "look": looks[i],
            "arm_r": "up" if i % 2 == 0 else "side",
            "qmark": (i % 3) - 1,
        })
    return fs


def frames_running_work():
    fs = []
    for i in range(6):
        fs.append({
            "dy": -1 if i % 2 == 0 else 0,
            "dx": (-1, 0, 1, 1, 0, -1)[i],
            "legs": i,
            "eyes": "open",
            "look": 0,
            "sweat": (40, 16 + (i % 3)),
            "motion": [(4, 32, 7, 32), (41, 32, 44, 32)] if i % 2 else [],
        })
    return fs


def frames_review():
    fs = []
    for i in range(6):
        fs.append({
            "eyes": "half",
            "arm_r": "up",
            "dots": (i // 2) + 1,
            "dy": 0 if i < 3 else -1,
        })
    return fs


def frames_typing():
    """掏出笔记本敲键盘(running 状态用): 双手交替 + 屏幕闪烁 + 盯着屏幕"""
    fs = []
    for i in range(6):
        fs.append({
            "laptop": i % 2,
            "type_phase": i % 2,
            "eyes": "closed" if i == 4 else "open",
            "eye_dy": 1,
            "arm_l": "none", "arm_r": "none",  # 手画在键盘上, 不画侧臂
        })
    return fs


def frames_flower():
    """举着小花晃悠(空闲彩蛋)"""
    sway = [0, 1, 1, 0, -1, -1]
    fs = []
    for i in range(6):
        fs.append({
            "arm_r": "up",
            "flower": sway[i],
            "eyes": "happy" if i in (1, 2) else ("closed" if i == 4 else "open"),
            "dy": -1 if i in (1, 2) else 0,
        })
    return fs


def frames_drink(kind):
    """端着杯子 → 送到脸前喝 → 放下. kind: coffee / water"""
    seq = [(False, 0, "open"), (False, 1, "open"), (True, 0, "closed"),
           (True, 1, "closed"), (False, 0, "happy"), (False, 1, "open")]
    fs = []
    for at_face, ph, eyes in seq:
        fs.append({"cup": (kind, at_face, ph), "eyes": eyes,
                   "arm_r": "none" if at_face else "hold", "arm_l": "side"})
    return fs


def frames_fries():
    """左手薯条盒, 右手捏一根送到脸前, 吃掉后身体一蹲"""
    seq = [(3, False, "open", 0), (3, True, "open", 0), (2, False, "happy", 1),
           (2, False, "open", 0), (2, True, "open", 0), (1, False, "happy", 1)]
    fs = []
    for n, hand, eyes, dy in seq:
        fs.append({"fries": n, "fry_hand": hand, "eyes": eyes, "dy": dy,
                   "arm_l": "hold", "arm_r": "none"})
    return fs


def frames_sausage():
    seq = [(10, False, "open"), (10, True, "closed"), (7, False, "happy"),
           (7, True, "closed"), (4, False, "happy"), (4, True, "closed")]
    fs = []
    for ln, at_face, eyes in seq:
        fs.append({"sausage": (ln, at_face), "eyes": eyes,
                   "arm_r": "none" if at_face else "hold"})
    return fs


def frames_gaming():
    """戴耳机打手柄(全屏躲在屏幕边上时)"""
    looks = [-1, 0, 1, 0, 0, -1]
    fs = []
    for i in range(6):
        fs.append({"headphones": True, "gamepad": i % 2, "arm_l": "none", "arm_r": "none",
                   "eyes": "closed" if i == 4 else "open", "look": looks[i],
                   "dx": (0, 0, 1, 0, -1, 0)[i]})
    return fs


def frames_backflip():
    fs = [{"dy": 2, "eyes": "open"}]                                   # 蹲
    for i, (rot, lift) in enumerate(((50, 6), (100, 9), (150, 11), (200, 11), (250, 9), (300, 6))):
        fs.append({"rot": rot, "lift": lift, "legs": "tuck", "arm_l": "up", "arm_r": "up",
                   "eyes": "happy"})
    fs.append({"eyes": "happy", "dust": True})                        # 落地
    return fs


def frames_doze():
    """打瞌睡: 点头 + 眼皮打架 + 一个小 z"""
    eyes = ["half", "half", "closed", "closed", "closed", "half"]
    dys = [0, 1, 1, 2, 1, 0]
    dxs = [0, 1, 1, 0, -1, 0]
    fs = []
    for i in range(6):
        p = {"eyes": eyes[i], "dy": dys[i], "dx": dxs[i]}
        if 2 <= i <= 4:
            p["z1"] = i - 2
        fs.append(p)
    return fs


def frames_sleep():
    fs = []
    for i in range(6):
        fs.append({"nightcap": True, "eyes": "closed", "dy": (0, 0, 1, 1, 0, 0)[i], "zz": i})
    return fs


def frames_stretch():
    return [
        {"eyes": "open"},
        {"arm_l": "up", "arm_r": "up", "tall": 1, "eyes": "open"},
        {"arm_l": "stretch", "arm_r": "stretch", "tall": 2, "eyes": "closed"},
        {"arm_l": "stretch", "arm_r": "stretch", "tall": 2, "eyes": "closed"},
        {"arm_l": "up", "arm_r": "up", "tall": 1, "eyes": "happy"},
        {"eyes": "open"},
    ]


def frames_petted():
    """被摸头: 眯眼开心 + 轻轻晃 + 爱心上飘"""
    fs = []
    for i in range(6):
        fs.append({"eyes": "happy", "dy": (0, -1, -1, 0, 0, 0)[i], "dx": (0, 0, 1, 1, 0, -1)[i],
                   "heart": i, "arm_l": "side", "arm_r": "up" if i in (2, 3) else "side"})
    return fs


def frames_phone():
    fs = []
    for i in range(6):
        fs.append({"phone": i % 2, "arm_l": "none", "arm_r": "none", "eye_dy": 1,
                   "eyes": "closed" if i == 4 else "half"})
    return fs


ROWS_SPEC = [
    ("idle", frames_idle(), False),
    ("running-right", frames_run(1), False),
    ("running-left", frames_run(1), True),
    ("waving", frames_waving(), False),
    ("jumping", frames_jumping(), False),
    ("failed", frames_failed(), False),
    ("waiting", frames_waiting(), False),
    ("running", frames_running_work(), False),
    ("review", frames_review(), False),
    ("typing", frames_typing(), False),         # row 9  (扩展行, 以下同)
    ("flower", frames_flower(), False),         # row 10
    ("coffee", frames_drink("coffee"), False),  # row 11
    ("water", frames_drink("water"), False),    # row 12
    ("fries", frames_fries(), False),           # row 13
    ("sausage", frames_sausage(), False),       # row 14
    ("gaming", frames_gaming(), False),         # row 15
    ("backflip", frames_backflip(), False),     # row 16
    ("doze", frames_doze(), False),             # row 17
    ("sleep", frames_sleep(), False),           # row 18
    ("stretch", frames_stretch(), False),       # row 19
    ("phone", frames_phone(), False),           # row 20
    ("petted", frames_petted(), False),         # row 21
]


def make_icons(assets_dir):
    """应用图标: idle 第一帧放大裁成正方形 → icon.png / icon.ico / tray.png"""
    base = Image.new("RGBA", (LW, LH), (0, 0, 0, 0))
    draw_clawd(ImageDraw.Draw(base), {"eyes": "open"})
    # 裁到螃蟹本体(x 4..44, y 20..48) → 40x28, 居中放进 40x40
    crab = base.crop((4, 18, 44, 48))
    sq = Image.new("RGBA", (40, 40), (0, 0, 0, 0))
    sq.paste(crab, (0, 5))
    big = sq.resize((256, 256), Image.NEAREST)
    big.save(os.path.join(assets_dir, "icon.png"), "PNG")
    big.save(os.path.join(assets_dir, "icon.ico"), format="ICO",
             sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    sq.resize((32, 32), Image.LANCZOS).save(os.path.join(assets_dir, "tray.png"), "PNG")
    print("icons saved to", assets_dir)


def main():
    rows = len(ROWS_SPEC)
    sheet = Image.new("RGBA", (COLS * CW, rows * CH), (0, 0, 0, 0))
    for row, (name, frames, mirror) in enumerate(ROWS_SPEC):
        for col, p in enumerate(frames):
            sheet.paste(render(p, mirror), (col * CW, row * CH))
        print(f"row {row} {name}: {len(frames)} frames")

    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(here, "..", "renderer")
    webp_path = os.path.abspath(os.path.join(out_dir, "spritesheet.webp"))
    sheet.save(webp_path, "WEBP", lossless=True)
    print("saved:", webp_path)

    make_icons(here)

    preview = os.environ.get("CRAB_PREVIEW")
    if preview:
        sheet.save(preview, "PNG")
        print("preview:", preview)


if __name__ == "__main__":
    main()
