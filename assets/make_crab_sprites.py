# -*- coding: utf-8 -*-
"""原创像素小螃蟹精灵图生成器（Codex Pet Standard: 8列x9行, 192x208/格）

用 30_Tools/py311 环境运行:
  python assets/make_crab_sprites.py

逻辑画布 48x52，最近邻放大 4 倍到 192x208。
行布局: 0 idle / 1 run-right / 2 run-left / 3 waving / 4 jumping
        5 failed / 6 waiting / 7 running(工作) / 8 review(思考)
"""
import math
import os
from PIL import Image, ImageDraw

# ── 画布参数 ──
LW, LH = 48, 52          # 逻辑像素
SCALE = 4                # 放大倍数 → 192x208
COLS, ROWS = 8, 9
CW, CH = LW * SCALE, LH * SCALE

# ── 调色板（Claude 珊瑚橙螃蟹）──
BODY = (217, 119, 87, 255)     # #D97757
BODY_DARK = (166, 76, 50, 255)
BODY_LIGHT = (240, 158, 122, 255)
BELLY = (246, 199, 168, 255)
OUTLINE = (92, 41, 26, 255)
EYE_W = (255, 252, 245, 255)
INK = (43, 26, 20, 255)
BLUSH = (240, 132, 108, 255)
SWEAT = (110, 185, 235, 255)
PROP = (70, 66, 78, 255)
DUST = (205, 190, 175, 255)

GROUND = 48  # 地面线 y


def E(d, cx, cy, rx, ry, fill, outline=None, width=1):
    d.ellipse([round(cx - rx), round(cy - ry), round(cx + rx), round(cy + ry)],
              fill=fill, outline=outline, width=width)


def draw_claw(d, cx, cy, r=4.5, angle_notch=0.0):
    """一只钳子: 圆 + 缺口V。angle_notch 是缺口朝向(弧度, 0=朝外右)"""
    E(d, cx, cy, r, r, BODY, OUTLINE, 2)
    # 高光
    E(d, cx - r * 0.3, cy - r * 0.35, r * 0.35, r * 0.3, BODY_LIGHT)
    # 钳口 V 缺口
    a = angle_notch
    tipx, tipy = cx + math.cos(a) * (r + 1), cy + math.sin(a) * (r + 1)
    inx, iny = cx + math.cos(a) * (r * 0.2), cy + math.sin(a) * (r * 0.2)
    d.line([round(tipx), round(tipy), round(inx), round(iny)], fill=OUTLINE, width=2)


def draw_legs(d, cx, ground_y, phase, splay=False):
    """两侧各3条小腿。phase 0-3 走路循环; splay=瘫倒张开"""
    for side in (-1, 1):
        for i in range(3):
            hipx = cx + side * (7 + i * 3)
            hipy = ground_y - 8 + i * 0.5
            if splay:
                tipx = hipx + side * (4 + i)
                tipy = ground_y
            else:
                lift = 0
                if phase >= 0:
                    # 交错抬腿: 同相位的腿抬起 2px
                    if (i + (0 if side < 0 else 1)) % 2 == (phase % 4) % 2:
                        lift = 2 if (phase % 4) < 2 else 0
                tipx = hipx + side * 3
                tipy = ground_y - lift
            midx = hipx + side * 2
            midy = hipy + 3
            d.line([round(hipx), round(hipy), round(midx), round(midy)], fill=OUTLINE, width=2)
            d.line([round(midx), round(midy), round(tipx), round(tipy)], fill=OUTLINE, width=2)


def draw_eye(d, x, y, state="open", look=(0, 0)):
    r = 3.4
    if state == "open":
        E(d, x, y, r, r, EYE_W, OUTLINE, 1)
        px, py = x + look[0], y + 0.4 + look[1]
        E(d, px, py, 1.5, 1.7, INK)
        d.point([round(px - 0.6), round(py - 1)], fill=EYE_W)
    elif state == "happy":   # ^ ^
        d.line([round(x - 2.6), round(y + 1), round(x), round(y - 1.6)], fill=INK, width=2)
        d.line([round(x), round(y - 1.6), round(x + 2.6), round(y + 1)], fill=INK, width=2)
    elif state == "closed":  # 闭眼: 白眼球 + 眼睑线
        E(d, x, y, r, r, EYE_W, OUTLINE, 1)
        d.line([round(x - 2), round(y + 0.5), round(x + 2), round(y + 0.5)], fill=INK, width=1)
    elif state == "x":       # x_x
        d.line([round(x - 2), round(y - 2), round(x + 2), round(y + 2)], fill=INK, width=2)
        d.line([round(x - 2), round(y + 2), round(x + 2), round(y - 2)], fill=INK, width=2)
    elif state == "half":    # 半闭(思考)
        E(d, x, y, r, r, EYE_W, OUTLINE, 1)
        E(d, x + look[0], y + 1 + look[1], 1.5, 1.5, INK)
        d.rectangle([round(x - r), round(y - r), round(x + r), round(y - 0.5)], fill=BODY)
        d.line([round(x - r + 1), round(y - 0.5), round(x + r - 1), round(y - 0.5)], fill=INK, width=1)


def draw_crab(d, p):
    """参数化画一只螃蟹。p 是参数字典"""
    cx = 24 + p.get("dx", 0)
    body_cy = 36 + p.get("dy", 0)
    ground = p.get("ground", GROUND)
    tilt = p.get("tilt", 0)          # 身体左右歪(仅影响眼睛/腮红偏移)
    rx, ry = 11.5, 8.5

    # 动作线(身后)
    for ml in p.get("motion", []):
        x0, y0, x1, y1 = ml
        d.line([round(x0), round(y0), round(x1), round(y1)], fill=(160, 150, 145, 200), width=1)

    # 腿
    if not p.get("hide_legs"):
        draw_legs(d, cx, ground if p.get("legs_on_ground", True) else body_cy + ry + 3,
                  p.get("leg_phase", -1), splay=p.get("splay", False))

    # 钳臂 + 钳子
    la = p.get("claw_l", math.radians(200))   # 左钳角度(相对身体中心)
    ra = p.get("claw_r", math.radians(-20))
    arm_r = rx + 1.5
    claw_r = p.get("claw_size", 4.5)
    for ang, side in ((la, -1), (ra, 1)):
        pos_key = "claw_r_pos" if side > 0 else "claw_l_pos"
        if pos_key in p:  # 绝对偏移覆盖(相对身体中心), 用于招手等需要钳子离开脸部的动作
            ox, oy = p[pos_key]
            ax, ay = cx + ox, body_cy + oy
            ang = math.atan2(oy, ox)
        else:
            ax = cx + math.cos(ang) * arm_r
            ay = body_cy - 1 + math.sin(ang) * (ry + 1)
        # 臂
        sx = cx + side * (rx - 3)
        d.line([round(sx), round(body_cy - 1), round(ax), round(ay)], fill=OUTLINE, width=2)
        draw_claw(d, ax, ay, claw_r, ang)

    # 身体
    E(d, cx, body_cy, rx, ry, BODY, OUTLINE, 2)
    # 肚皮
    d.ellipse([round(cx - rx + 3), round(body_cy + 1), round(cx + rx - 3), round(body_cy + ry - 1)],
              fill=BELLY)
    d.line([round(cx - rx + 4), round(body_cy + 2), round(cx + rx - 4), round(body_cy + 2)],
           fill=BODY_DARK, width=1)
    # 壳顶高光 + 斑点
    E(d, cx - 4, body_cy - 4.5, 3, 1.6, BODY_LIGHT)
    d.point([(round(cx + 5), round(body_cy - 5)), (round(cx + 7), round(body_cy - 3))], fill=BODY_DARK)

    # 腮红
    E(d, cx - 7 + tilt, body_cy - 0.5, 1.6, 1.1, BLUSH)
    E(d, cx + 7 + tilt, body_cy - 0.5, 1.6, 1.1, BLUSH)

    # 眼柄 + 眼睛
    stalk_h = p.get("stalk", 5)
    eye_y = body_cy - ry - stalk_h + p.get("eye_dy", 0)
    for ex in (-4.5, 4.5):
        sx = cx + ex * 0.8 + tilt
        d.line([round(sx), round(body_cy - ry + 2), round(cx + ex + tilt), round(eye_y + 2)],
               fill=OUTLINE, width=2)
    eyes = p.get("eyes", "open")
    look = p.get("look", (0, 0))
    draw_eye(d, cx - 4.5 + tilt, eye_y, eyes, look)
    draw_eye(d, cx + 4.5 + tilt, eye_y, eyes, look)

    # 嘴(小w)
    mx, my = cx + tilt, body_cy - 2.2
    mouth = p.get("mouth", "w")
    if mouth == "w":
        d.line([round(mx - 2), round(my), round(mx - 1), round(my + 1)], fill=INK, width=1)
        d.line([round(mx - 1), round(my + 1), round(mx), round(my)], fill=INK, width=1)
        d.line([round(mx), round(my), round(mx + 1), round(my + 1)], fill=INK, width=1)
        d.line([round(mx + 1), round(my + 1), round(mx + 2), round(my)], fill=INK, width=1)
    elif mouth == "o":
        E(d, mx, my + 0.5, 1.3, 1.5, INK)
    elif mouth == "wavy":
        d.line([round(mx - 2.5), round(my + 1), round(mx - 1), round(my)], fill=INK, width=1)
        d.line([round(mx - 1), round(my), round(mx + 0.5), round(my + 1)], fill=INK, width=1)
        d.line([round(mx + 0.5), round(my + 1), round(mx + 2), round(my)], fill=INK, width=1)

    # ── 前景小道具 ──
    if "sweat" in p:  # (x, y) 汗滴
        sx, sy = p["sweat"]
        E(d, sx, sy, 1.4, 2, SWEAT, None)
        d.point([round(sx), round(sy - 2.4)], fill=SWEAT)
    if "qmark" in p:  # 问号 y 偏移
        qy = 12 + p["qmark"]
        qx = cx + 9
        d.arc([qx - 2, qy - 3, qx + 2, qy + 1], start=180, end=90, fill=PROP, width=2)
        d.line([round(qx + 1.6), round(qy), round(qx), round(qy + 2)], fill=PROP, width=2)
        d.point([round(qx), round(qy + 4)], fill=PROP)
    if "dots" in p:  # 思考点点 1-3
        n = p["dots"]
        for i in range(n):
            E(d, cx + 8 + i * 3.4, 13 - i * 1.2, 1.1, 1.1, PROP)
    if "bang" in p:  # 感叹号
        bx = cx + 9
        d.line([round(bx), 10, round(bx), 14], fill=(226, 96, 60, 255), width=2)
        d.point([round(bx), 16], fill=(226, 96, 60, 255))
    if p.get("dust"):  # 落地尘土
        for ox in (-13, 13):
            E(d, cx + ox, ground - 1, 2, 1.2, DUST)
            E(d, cx + ox * 1.05, ground - 3, 1, 0.8, DUST)
    if "zzz" in p:
        zx, zy = cx + 10, 12
        for i, s in enumerate((3, 2.4, 1.8)):
            x0, y0 = zx + i * 3, zy - i * 3
            d.line([round(x0 - s / 2), round(y0 - s / 2), round(x0 + s / 2), round(y0 - s / 2)], fill=PROP, width=1)
            d.line([round(x0 + s / 2), round(y0 - s / 2), round(x0 - s / 2), round(y0 + s / 2)], fill=PROP, width=1)
            d.line([round(x0 - s / 2), round(y0 + s / 2), round(x0 + s / 2), round(y0 + s / 2)], fill=PROP, width=1)


def render_frame(p, mirror=False):
    img = Image.new("RGBA", (LW, LH), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_crab(d, p)
    if mirror:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    return img.resize((CW, CH), Image.NEAREST)


DEG = math.radians

# ── 每行的帧参数 ──

def frames_idle():
    fs = []
    for i, (dy, eyes, cr) in enumerate([
        (0, "open", -20), (0, "open", -20), (-1, "open", -25),
        (-1, "open", -25), (0, "closed", -20), (0, "open", -20),
    ]):
        fs.append({"dy": dy, "eyes": eyes, "claw_r": DEG(cr), "claw_l": DEG(180 - (-cr)),
                   "leg_phase": -1})
    return fs


def frames_run(direction=1):
    """direction 1=向右。侧移快跑: 腿循环 + 身体起伏 + 动作线"""
    fs = []
    for i in range(8):
        bob = -1 if i % 2 == 0 else 0
        lean = 1 * direction
        motion = []
        if i % 2 == 0:
            mx = 4 if direction < 0 else 44
            motion = [(mx, 34, mx + (2 if direction < 0 else -2), 34),
                      (mx - (1 if direction < 0 else -1), 39, mx + (3 if direction < 0 else -3), 39)]
        fs.append({"dy": bob, "dx": lean, "tilt": lean, "leg_phase": i,
                   "eyes": "open", "look": (1.2 * direction, 0),
                   "claw_r": DEG(-35), "claw_l": DEG(215), "motion": motion})
    return fs


def frames_waving():
    fs = []
    for up in (True, False, True, False):
        fs.append({"eyes": "happy", "leg_phase": -1,
                   "claw_r_pos": (15, -14) if up else (16, -7),
                   "claw_l": DEG(200), "claw_size": 5,
                   "mouth": "w"})
    return fs


def frames_jumping():
    seq = [
        {"dy": 3, "eyes": "open", "claw_r": DEG(-10), "claw_l": DEG(190), "leg_phase": -1},          # 蹲
        {"dy": -6, "eyes": "happy", "claw_r_pos": (14, -11), "claw_l_pos": (-14, -11),
         "legs_on_ground": False, "leg_phase": -1},                                                   # 升
        {"dy": -10, "eyes": "happy", "claw_r_pos": (15, -13), "claw_l_pos": (-15, -13),
         "legs_on_ground": False, "leg_phase": -1, "bang": True},                                     # 顶点
        {"dy": -4, "eyes": "happy", "claw_r_pos": (14, -9), "claw_l_pos": (-14, -9),
         "legs_on_ground": False, "leg_phase": -1},                                                   # 落
        {"dy": 0, "eyes": "happy", "claw_r": DEG(-25), "claw_l": DEG(205), "leg_phase": -1,
         "dust": True},                                                                               # 着地
    ]
    return seq


def frames_failed():
    fs = []
    for i in range(8):
        t = 1 if i % 2 == 0 else -1
        fs.append({"dy": 2, "tilt": t, "eyes": "x", "mouth": "wavy",
                   "claw_r": DEG(30), "claw_l": DEG(150), "splay": True, "leg_phase": -1,
                   "sweat": (33, 22 + (i % 4))})
    return fs


def frames_waiting():
    looks = [(-1.6, 0), (-1.6, 0), (0, 0), (1.6, 0), (1.6, 0), (0, 0)]
    fs = []
    for i in range(6):
        fs.append({"eyes": "closed" if i == 5 else "open", "look": looks[i],
                   "leg_phase": -1, "mouth": "o" if i in (2, 3) else "w",
                   "claw_r": DEG(-20 if i % 2 == 0 else -8), "claw_l": DEG(200),
                   "qmark": (i % 3) - 1})
    return fs


def frames_running_work():
    """工作中: 原地快速小碎步 + 汗滴 + 专注眼神"""
    fs = []
    for i in range(6):
        bob = -1 if i % 2 == 0 else 0
        dx = (-1, 0, 1, 1, 0, -1)[i]
        fs.append({"dy": bob, "dx": dx, "leg_phase": i, "eyes": "open", "look": (0, 1.4),
                   "mouth": "o", "claw_r": DEG(-40), "claw_l": DEG(220),
                   "sweat": (33 + dx, 20 + (i % 3)),
                   "motion": [(6, 36, 9, 36), (39, 36, 42, 36)] if i % 2 else []})
    return fs


def frames_review():
    fs = []
    for i in range(6):
        fs.append({"eyes": "half", "look": (0, 0), "leg_phase": -1, "mouth": "w",
                   "claw_r": DEG(-52), "claw_l": DEG(195), "claw_size": 4.5,
                   "dots": (i // 2) + 1, "dy": 0 if i < 3 else -1})
    return fs


ROWS_SPEC = [
    ("idle", frames_idle(), False),
    ("running-right", frames_run(1), False),
    ("running-left", frames_run(1), True),   # 镜像行1
    ("waving", frames_waving(), False),
    ("jumping", frames_jumping(), False),
    ("failed", frames_failed(), False),
    ("waiting", frames_waiting(), False),
    ("running", frames_running_work(), False),
    ("review", frames_review(), False),
]


def main():
    sheet = Image.new("RGBA", (COLS * CW, ROWS * CH), (0, 0, 0, 0))
    for row, (name, frames, mirror) in enumerate(ROWS_SPEC):
        for col, p in enumerate(frames):
            frame = render_frame(p, mirror=mirror)
            sheet.paste(frame, (col * CW, row * CH))
        print(f"row {row} {name}: {len(frames)} frames")

    out_dir = os.path.join(os.path.dirname(__file__), "..", "renderer")
    webp_path = os.path.abspath(os.path.join(out_dir, "spritesheet.webp"))
    sheet.save(webp_path, "WEBP", lossless=True)
    print("saved:", webp_path)

    preview = os.environ.get("CRAB_PREVIEW")
    if preview:
        sheet.save(preview, "PNG")
        print("preview:", preview)


if __name__ == "__main__":
    main()
