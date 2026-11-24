# -*- coding: utf-8 -*-
"""繪製動畫影格並與旁白合成為 MP4（字幕燒錄＋輸出 SRT）。

用法: python3 render.py <build資料夾> <輸出mp4>
"""
import json
import math
import os
import subprocess
import sys
from multiprocessing import Pool

from PIL import Image, ImageDraw, ImageFont, ImageFilter

from script import SOURCES

W, H = 1920, 1080
FPS = 30
FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"

# 色票
NAVY = (14, 27, 48)
NAVY2 = (28, 52, 86)
ORANGE = (245, 166, 35)
TEAL = (46, 196, 182)
RED = (230, 57, 70)
CREAM = (250, 243, 224)
WHITE = (255, 255, 255)
GREY = (150, 165, 185)
SEPIA_D = (74, 52, 33)
SEPIA_L = (226, 205, 166)

_fonts = {}


def F(size):
    if size not in _fonts:
        _fonts[size] = ImageFont.truetype(FONT_PATH, size)
    return _fonts[size]


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def mix(c1, c2, k):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * k) for i in range(3))


def fade(c, k, bg):
    return mix(bg, c, clamp(k))


def text(d, xy, s, size, fill, anchor="la", stroke=0, stroke_fill=(0, 0, 0)):
    d.text(xy, s, font=F(size), fill=fill, anchor=anchor,
           stroke_width=stroke, stroke_fill=stroke_fill)


_grad = {}


def gradient(top, bottom):
    key = (top, bottom)
    if key not in _grad:
        g = Image.new("RGB", (1, H))
        for y in range(H):
            g.putpixel((0, y), mix(top, bottom, y / H))
        _grad[key] = g.resize((W, H))
    return _grad[key].copy()


# ---------------------------------------------------------------- 腳踏車
def draw_bike(d, cx, cy, s, phase, frame=ORANGE, rider=WHITE, wheel=WHITE, hat=False, lw=None):
    lw = lw or max(2, int(5 * s))
    r = 42 * s
    rear, front = (cx - 58 * s, cy), (cx + 58 * s, cy)
    for (wx, wy) in (rear, front):
        d.ellipse([wx - r, wy - r, wx + r, wy + r], outline=wheel, width=lw)
        for k in range(6):
            a = phase + k * math.pi / 3
            d.line([wx, wy, wx + r * math.cos(a), wy + r * math.sin(a)], fill=wheel, width=max(1, lw // 3))
    bb = (cx - 5 * s, cy + 2 * s)
    seat = (cx - 18 * s, cy - 62 * s)
    head = (cx + 40 * s, cy - 58 * s)
    for a, b in [(rear, bb), (rear, seat), (seat, bb), (bb, head), (seat, head), (head, front)]:
        d.line([a, b], fill=frame, width=lw + 1)
    bar = (head[0] + 4 * s, head[1] - 14 * s)
    d.line([head, bar], fill=frame, width=lw)
    # 騎士
    hip = (seat[0], seat[1] - 6 * s)
    shoulder = (cx + 18 * s, cy - 112 * s) if not hat else (cx + 2 * s, cy - 118 * s)
    d.line([hip, shoulder], fill=rider, width=lw + 4)
    hc = (shoulder[0] + 14 * s, shoulder[1] - 24 * s)
    hr = 15 * s
    d.ellipse([hc[0] - hr, hc[1] - hr, hc[0] + hr, hc[1] + hr], fill=rider)
    if hat:
        d.rectangle([hc[0] - hr * 1.5, hc[1] - hr * 0.9, hc[0] + hr * 1.5, hc[1] - hr * 0.6], fill=frame)
        d.rectangle([hc[0] - hr * 0.9, hc[1] - hr * 1.9, hc[0] + hr * 0.9, hc[1] - hr * 0.6], fill=frame)
    else:  # 安全帽
        d.pieslice([hc[0] - hr * 1.15, hc[1] - hr * 1.25, hc[0] + hr * 1.25, hc[1] + hr * 0.9], 180, 360, fill=frame)
    d.line([shoulder, bar], fill=rider, width=lw + 1)
    for k in (0, math.pi):
        pa = phase * 0.9 + k
        pedal = (bb[0] + 17 * s * math.cos(pa), bb[1] + 17 * s * math.sin(pa))
        mx, my = (hip[0] + pedal[0]) / 2, (hip[1] + pedal[1]) / 2
        L = math.dist(hip, pedal)
        bend = math.sqrt(max(0, (52 * s) ** 2 - (L / 2) ** 2))
        knee = (mx + bend * 0.9, my - bend * 0.3)
        col = rider if k == 0 else mix(rider, (90, 90, 90), 0.35)
        d.line([hip, knee, pedal], fill=col, width=lw + 2, joint="curve")


# ---------------------------------------------------------------- 台灣地圖
TAIWAN = [
    (121.53, 25.30), (121.75, 25.15), (121.93, 25.02), (121.83, 24.85), (121.86, 24.60),
    (121.75, 24.38), (121.63, 24.02), (121.52, 23.62), (121.42, 23.18), (121.20, 22.80),
    (120.98, 22.48), (120.88, 22.20), (120.85, 21.90), (120.74, 21.94), (120.70, 22.20),
    (120.60, 22.38), (120.45, 22.48), (120.27, 22.62), (120.15, 22.95), (120.10, 23.10),
    (120.13, 23.42), (120.16, 23.72), (120.33, 24.05), (120.50, 24.25), (120.65, 24.55),
    (120.90, 24.85), (121.03, 25.03), (121.20, 25.12), (121.40, 25.22),
]


def tw_pts(cx, cy, scale):
    out = []
    for lon, lat in TAIWAN:
        out.append((cx + (lon - 121.0) * scale, cy + (23.6 - lat) * scale * 1.09))
    return out


def poly_point(pts, k):
    """沿著封閉多邊形周長取比例 k 的位置；回傳(點, 已走過的點列)"""
    segs = list(zip(pts, pts[1:] + pts[:1]))
    lens = [math.dist(a, b) for a, b in segs]
    total = sum(lens)
    target = clamp(k) * total
    walked = [pts[0]]
    for (a, b), l in zip(segs, lens):
        if target <= l:
            f = target / l if l else 0
            p = (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)
            walked.append(p)
            return p, walked
        target -= l
        walked.append(b)
    return pts[0], walked


def draw_taiwan(d, cx, cy, scale, fill=(40, 80, 70), outline=TEAL):
    pts = tw_pts(cx, cy, scale)
    d.polygon(pts, fill=fill, outline=outline, width=3)
    # 中央山脈示意
    ridge = [(121.55, 24.7), (121.35, 24.2), (121.15, 23.6), (120.95, 23.0), (120.82, 22.4)]
    rp = [(cx + (lo - 121.0) * scale, cy + (23.6 - la) * scale * 1.09) for lo, la in ridge]
    d.line(rp, fill=mix(fill, WHITE, 0.25), width=max(3, int(scale / 40)), joint="curve")
    return pts


# ---------------------------------------------------------------- 共用元件
def year_badge(d, x, y, year, k, color=ORANGE, size=120):
    if k <= 0:
        return
    c = fade(color, k, NAVY)
    text(d, (x, y + (1 - ease(k)) * 40), year, size, c, "lm")


def card(img, box, k, fill=(255, 255, 255), alpha=34, radius=26, border=None):
    if k <= 0:
        return
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    x0, y0, x1, y1 = box
    dy = (1 - ease(k)) * 30
    od.rounded_rectangle([x0, y0 + dy, x1, y1 + dy], radius, fill=fill + (int(alpha * clamp(k * 1.5)),),
                         outline=(border + (int(255 * clamp(k)),)) if border else None, width=3)
    img.alpha_composite(ov) if img.mode == "RGBA" else img.paste(Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB"))


def appear(t, start, dur=0.6):
    return clamp((t - start) / dur)


def wrap(s, size, maxw):
    f = F(size)
    lines, cur = [], ""
    for ch in s:
        if f.getlength(cur + ch) > maxw and cur:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    # 避免標點落在行首
    for i in range(1, len(lines)):
        if lines[i] and lines[i][0] in "，。、；：！？」》）":
            lines[i - 1] += lines[i][0]
            lines[i] = lines[i][1:]
    return [l for l in lines if l]


def multiline(d, x, y, s, size, fill, maxw, gap=1.35, anchor="la"):
    for i, l in enumerate(wrap(s, size, maxw)):
        text(d, (x, y + i * size * gap), l, size, fill, anchor)


def hills(d, offset, base, color, amp, wl, seed=0):
    pts = [(0, H)]
    for x in range(0, W + 40, 40):
        xx = x + offset
        y = base + amp * math.sin(xx / wl + seed) + amp * 0.5 * math.sin(xx / (wl * 0.43) + seed * 2)
        pts.append((x, y))
    pts.append((W, H))
    d.polygon(pts, fill=color)


def scene_title_bar(d, title, k, color=ORANGE):
    if k <= 0:
        return
    c = fade(WHITE, k, NAVY)
    text(d, (90, 70), title, 46, c, "la")
    d.rectangle([90, 132, 90 + 160 * ease(k), 138], fill=color)


# ---------------------------------------------------------------- 各場景
def sc_title(t, sc):
    img = gradient((18, 32, 70), (240, 140, 80))
    d = ImageDraw.Draw(img)
    sun_y = 560 - 40 * ease(t / 6)
    d.ellipse([W / 2 - 170, sun_y - 170, W / 2 + 170, sun_y + 170], fill=(255, 205, 120))
    hills(d, t * 40, 720, (60, 70, 110), 40, 260, 1)
    hills(d, t * 90, 800, (34, 44, 78), 30, 180, 3)
    d.rectangle([0, 880, W, H], fill=(22, 28, 50))
    for i in range(12):  # 路面標線
        x = (i * 220 - t * 420) % (W + 220) - 110
        d.rectangle([x, 948, x + 110, 958], fill=(240, 200, 120))
    draw_bike(d, W / 2 + 60 * math.sin(t * 0.5), 838, 1.6, t * 7, frame=RED, rider=(25, 25, 35), wheel=(25, 25, 35))
    ls = [l["start"] for l in sc["lines"]]
    k = appear(t, 0.3, 1.2)
    text(d, (W / 2, 210 + (1 - ease(k)) * 40), "轉動的島嶼", 120, fade(WHITE, k, (60, 70, 110)), "mm",
         stroke=4, stroke_fill=fade((20, 25, 50), k, (60, 70, 110)))
    k2 = appear(t, 1.0, 1.2)
    text(d, (W / 2, 330), "台灣自由車發展史", 64, fade(ORANGE, k2, (80, 80, 120)), "mm",
         stroke=3, stroke_fill=fade((20, 25, 50), k2, (80, 80, 120)))
    return img


def sc_colonial(t, sc):
    img = gradient((236, 220, 186), (196, 166, 120))
    d = ImageDraw.Draw(img)
    ls = [l["start"] for l in sc["lines"]]
    # 老照片外框
    d.rectangle([40, 40, W - 40, H - 40], outline=SEPIA_D, width=6)
    d.rectangle([60, 60, W - 60, H - 60], outline=(160, 130, 90), width=2)
    # 日式木造街屋剪影
    for i, x in enumerate(range(80, W - 80, 260)):
        hh = 200 + (i % 3) * 40
        d.rectangle([x, 760 - hh, x + 220, 760], fill=(150, 118, 82))
        d.polygon([(x - 20, 760 - hh), (x + 110, 700 - hh), (x + 240, 760 - hh)], fill=(110, 84, 58))
        for wx in range(x + 25, x + 200, 60):
            d.rectangle([wx, 760 - hh + 50, wx + 35, 760 - hh + 100], fill=(210, 188, 150))
    d.rectangle([60, 760, W - 60, H - 60], fill=(178, 148, 108))
    bx = -200 + (t * 140) % (W + 400)
    draw_bike(d, bx, 860, 1.5, t * 4, frame=SEPIA_D, rider=SEPIA_D, wheel=SEPIA_D, hat=True)
    k = appear(t, 0.2)
    text(d, (110, 110), "1895－1945", 92, fade(SEPIA_D, k, SEPIA_L), "la")
    text(d, (110, 220), "日治時期 · 腳踏車傳入台灣", 50, fade(SEPIA_D, k, SEPIA_L), "la")
    k2 = appear(t, ls[1])
    if k2:
        text(d, (W - 110, 130), "早期：官員與富裕人家的交通工具", 40, fade(SEPIA_D, k2, SEPIA_L), "ra")
    k3 = appear(t, ls[2])
    if k3:
        text(d, (W - 110, 200), "1920 年代起 逐漸普及", 64, fade((150, 40, 30), k3, SEPIA_L), "ra")
        text(d, (W - 110, 285), "各地出現自轉車競速活動", 40, fade(SEPIA_D, k3, SEPIA_L), "ra")
    return img


def factory(d, x, y, s, t, k, color):
    if k <= 0:
        return
    c = fade(color, k, NAVY)
    d.rectangle([x, y - 120 * s, x + 260 * s, y], fill=c)
    for i in range(4):
        x0 = x + i * 65 * s
        d.polygon([(x0, y - 120 * s), (x0 + 65 * s, y - 120 * s), (x0 + 65 * s, y - 170 * s)], fill=c)
    d.rectangle([x + 200 * s, y - 230 * s, x + 230 * s, y - 120 * s], fill=c)
    for i in range(4):
        ph = (t * 0.5 + i / 4) % 1
        r = (10 + 30 * ph) * s
        cx, cy = x + 215 * s + 40 * ph * s, y - 240 * s - 120 * ph * s
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fade((200, 210, 225), k * (1 - ph), NAVY))
    for i in range(3):
        d.rectangle([x + 30 * s + i * 60 * s, y - 80 * s, x + 70 * s + i * 60 * s, y - 40 * s], fill=NAVY)


def sc_industry(t, sc):
    img = gradient(NAVY, NAVY2)
    d = ImageDraw.Draw(img)
    ls = [l["start"] for l in sc["lines"]]
    scene_title_bar(d, "產業起飛：從代工到自有品牌", appear(t, 0))
    # 時間軸
    y0 = 790
    d.line([120, y0, W - 120, y0], fill=GREY, width=4)
    nodes = [(320, "1972", "巨大、美利達創立", 0), (960, "1980", "全球最大出口國", 2), (1600, "1981", "GIANT 自有品牌", 3)]
    for x, yr, lab, li in nodes:
        k = appear(t, ls[li])
        if k:
            r = 18 * ease(k)
            d.ellipse([x - r, y0 - r, x + r, y0 + r], fill=ORANGE)
            text(d, (x, y0 + 50), yr, 52, fade(ORANGE, k, NAVY), "mm")
            text(d, (x, y0 + 105), lab, 34, fade(WHITE, k, NAVY), "mm")
    # 1972：兩座工廠
    k0 = appear(t, ls[0])
    factory(d, 150, 610, 1.0, t, k0, (90, 130, 190))
    factory(d, 450, 610, 0.8, t, appear(t, ls[0] + 2.5), (120, 160, 200))
    if k0:
        text(d, (280, 200), "巨大機械 · 台中大甲", 38, fade(WHITE, k0, NAVY), "mm")
    k01 = appear(t, ls[0] + 2.5)
    if k01:
        text(d, (555, 290), "美利達 · 彰化", 38, fade(WHITE, k01, NAVY), "mm")
    k1 = appear(t, ls[1])
    if k1:  # 生產線：一台台腳踏車
        for i in range(5):
            x = 120 + ((t * 120 + i * 160) % 800)
            draw_bike(d, x, 690, 0.45, t * 3, frame=fade(TEAL, k1, NAVY), rider=NAVY2, wheel=fade(WHITE, k1, NAVY))
    # 1980：地球＋第一名
    k2 = appear(t, ls[2])
    if k2:
        gx, gy, gr = 1180, 400, 170 * ease(k2)
        d.ellipse([gx - gr, gy - gr, gx + gr, gy + gr], fill=(40, 110, 170), outline=TEAL, width=4)
        for j in range(-2, 3):
            yy = gy + j * gr * 0.38
            hw = math.sqrt(max(0, gr ** 2 - (yy - gy) ** 2))
            d.line([gx - hw, yy, gx + hw, yy], fill=(90, 160, 210), width=2)
        for j in range(3):
            ph = (t * 0.3 + j / 3) % 1
            ww = gr * math.cos(ph * math.pi)
            d.ellipse([gx - abs(ww), gy - gr, gx + abs(ww), gy + gr], outline=(90, 160, 210), width=2)
        text(d, (1180, 620), "1980 全球第一", 56, fade(ORANGE, k2, NAVY), "mm")
        text(d, (1180, 680), "自行車出口國（取代日本）", 34, fade(WHITE, k2, NAVY), "mm")
    k3 = appear(t, ls[3])
    if k3:
        bx, by = 1560, 300
        d.rounded_rectangle([bx - 190, by - 70, bx + 190, by + 70], 20, fill=fade((30, 60, 140), k3, NAVY),
                            outline=fade(WHITE, k3, NAVY), width=4)
        text(d, (bx, by), "GIANT", 84, fade(WHITE, k3, NAVY), "mm")
        text(d, (bx, by + 120), "1981 年推出自有品牌", 34, fade(WHITE, k3, NAVY), "mm")
    return img


def sc_tour(t, sc):
    img = gradient((20, 60, 90), (90, 160, 190))
    d = ImageDraw.Draw(img)
    ls = [l["start"] for l in sc["lines"]]
    hills(d, t * 60, 640, (50, 110, 90), 50, 220, 2)
    hills(d, t * 150, 720, (40, 90, 70), 30, 150, 5)
    d.rectangle([0, 800, W, H], fill=(55, 60, 70))
    for i in range(14):
        x = (i * 180 - t * 900) % (W + 180) - 90
        d.rectangle([x, 900, x + 90, 910], fill=WHITE)
    colors = [RED, ORANGE, TEAL, (120, 90, 200), (240, 240, 240), (60, 140, 240)]
    for i in range(6):
        x = 260 + i * 260 + 40 * math.sin(t * 0.8 + i)
        y = 870 + (i % 2) * 70
        draw_bike(d, x, y - 30, 1.0, t * 10 + i, frame=colors[i], rider=(30, 30, 40), wheel=(20, 20, 25))
    for i in range(10):  # 速度線
        y = 560 + i * 37
        x = (W - (t * 1600 + i * 330) % (W + 600))
        d.line([x, y, x + 200, y], fill=(220, 240, 250), width=3)
    card(img, (80, 170, 1000, 560), appear(t, 0.2), fill=(10, 30, 50), alpha=170)
    d = ImageDraw.Draw(img)
    scene_title_bar(d, "國際自由車環台賽 Tour de Taiwan", appear(t, 0))
    items = [("1978", "開辦，至今近半世紀"), ("2005", "納入 UCI 亞洲巡迴賽"), ("2012", "升級 UCI 2.1 級，台灣唯一國際公路賽")]
    for i, (yr, s) in enumerate(items):
        k = appear(t, ls[i])
        if k:
            y = 230 + i * 105
            text(d, (130 + (1 - ease(k)) * 40, y), yr, 60, fade(ORANGE, k, (10, 30, 50)), "la")
            text(d, (310 + (1 - ease(k)) * 40, y + 14), s, 38, fade(WHITE, k, (10, 30, 50)), "la")
    return img


def sc_boom(t, sc):
    img = gradient(NAVY, NAVY2)
    d = ImageDraw.Draw(img)
    ls = [l["start"] for l in sc["lines"]]
    scene_title_bar(d, "單車熱潮：從產業到全民運動", appear(t, 0), TEAL)
    MX, MY, MS = 470, 565, 205
    pts = draw_taiwan(d, MX, MY, MS)
    # 2007 環島路線動畫
    k2 = clamp((t - ls[2] - 0.5) / (sc["lines"][2]["end"] - ls[2] + 6))
    if t >= ls[2]:
        p, walked = poly_point(pts, ease(k2) if k2 < 1 else 1)
        d.line(walked, fill=ORANGE, width=7, joint="curve")
        d.ellipse([p[0] - 14, p[1] - 14, p[0] + 14, p[1] + 14], fill=ORANGE, outline=WHITE, width=3)
        km = int(927 * ease(k2))
        text(d, (MX + 150, MY + 230), f"{km} 公里", 56, ORANGE, "lm")
    if t >= ls[3]:  # 台北 YouBike 標記
        k = appear(t, ls[3])
        tp = (MX + (121.52 - 121.0) * MS, MY + (23.6 - 25.04) * MS * 1.09)
        r = 12 + 14 * (0.5 + 0.5 * math.sin(t * 5))
        d.ellipse([tp[0] - r, tp[1] - r, tp[0] + r, tp[1] + r], outline=fade((255, 200, 0), k, NAVY), width=4)
        text(d, (tp[0] + 30, tp[1] - 40), "台北", 32, fade(WHITE, k, NAVY), "la")
    cards = [
        ("2003", "A-Team 台灣自行車協進會成立", "巨大、美利達攜手同業，走向高值化"),
        ("2006", "電影《練習曲》上映", "帶動單車環島熱潮"),
        ("2007", "劉金標 73 歲單車環島", "15 天 · 927 公里"),
        ("2009", "台北試辦 YouBike 微笑單車", "單車走進城市日常"),
    ]
    for i, (yr, a, b) in enumerate(cards):
        k = appear(t, ls[i])
        if k <= 0:
            continue
        y = 200 + i * 200
        card(img, (1000, y, 1830, y + 170), k, fill=(255, 255, 255), alpha=28, border=TEAL if i != 2 else ORANGE)
        d = ImageDraw.Draw(img)
        dy = (1 - ease(k)) * 30
        bg = mix(NAVY, NAVY2, y / H)
        text(d, (1040, y + 30 + dy), yr, 56, fade(TEAL if i != 2 else ORANGE, k, bg), "la")
        text(d, (1220, y + 30 + dy), a, 38, fade(WHITE, k, bg), "la")
        text(d, (1220, y + 95 + dy), b, 30, fade(GREY, k, bg), "la")
    return img


KOM = [(0, 0), (8, 30), (20, 60), (28, 220), (40, 480), (52, 820), (62, 1150), (72, 1600),
       (80, 2050), (90, 2450), (96, 2600), (100, 2850), (105, 3275)]


def sc_kom(t, sc):
    img = gradient((12, 24, 52), (70, 60, 110))
    d = ImageDraw.Draw(img)
    ls = [l["start"] for l in sc["lines"]]
    scene_title_bar(d, "台灣自行車登山王挑戰（KOM）", appear(t, 0))
    # 星空
    for i in range(60):
        x = (i * 397) % W
        y = (i * 211) % 420 + 160
        b = 160 + int(90 * math.sin(t * 2 + i))
        d.ellipse([x, y, x + 3, y + 3], fill=(b, b, b))
    X0, X1, Y0, Y1 = 180, 1740, 800, 280

    def P(km, m):
        return (X0 + (X1 - X0) * km / 105, Y0 - (Y0 - Y1) * m / 3300)

    d.line([X0, Y0, X1, Y0], fill=GREY, width=3)
    d.line([X0, Y0, X0, Y1 - 20], fill=GREY, width=3)
    for m in (0, 1000, 2000, 3000):
        y = P(0, m)[1]
        d.line([X0 - 10, y, X0, y], fill=GREY, width=3)
        text(d, (X0 - 20, y), f"{m}", 28, GREY, "rm")
    text(d, (X0 - 20, Y1 - 60), "海拔（公尺）", 28, GREY, "la")
    for km in (0, 25, 50, 75, 105):
        x = P(km, 0)[0]
        text(d, (x, Y0 + 30), f"{km} km", 28, GREY, "mm")
    k = clamp((t - ls[1]) / 7.5) if len(ls) > 1 else 0
    k = ease(k)
    dist = 105 * k
    prof = [P(km, m) for km, m in KOM if km <= dist]
    # 插值目前位置
    cur = KOM[0]
    for (a, ma), (b, mb) in zip(KOM, KOM[1:]):
        if a <= dist <= b:
            f = (dist - a) / (b - a) if b > a else 0
            cur = (dist, ma + (mb - ma) * f)
            break
    pc = P(*cur)
    prof.append(pc)
    if len(prof) > 1:
        poly = prof + [(pc[0], Y0), (X0, Y0)]
        d.polygon(poly, fill=(60, 120, 100))
        d.line(prof, fill=TEAL, width=6, joint="curve")
        d.ellipse([pc[0] - 14, pc[1] - 14, pc[0] + 14, pc[1] + 14], fill=ORANGE, outline=WHITE, width=3)
        if dist < 100:
            text(d, (pc[0] + 20, pc[1] - 30), f"{int(cur[1])} m", 40, ORANGE, "la")
    if t >= ls[0]:
        k0 = appear(t, ls[0])
        text(d, (X0 + 10, Y0 - 60), "花蓮七星潭 0 m", 34, fade(WHITE, k0, NAVY), "la")
        text(d, (X1 - 30, Y1 - 10), "合歡山武嶺 3275 m", 42, fade(WHITE, k0, NAVY), "ra")
        text(d, (W - 90, 82), "首屆 2012 年", 42, fade(ORANGE, k0, NAVY), "ra")
    if t >= ls[2]:
        k2 = appear(t, ls[2])
        card(img, (300, 300, 1180, 460), k2, fill=(10, 20, 40), alpha=190, border=ORANGE)
        d = ImageDraw.Draw(img)
        text(d, (340, 330), "2014 法國《Le Cycle》雜誌評選", 36, fade(WHITE, k2, NAVY), "la")
        text(d, (340, 385), "世界十大最艱難登山耐力賽之一", 42, fade(ORANGE, k2, NAVY), "la")
    text(d, (X1, Y0 + 65), "※ 高度剖面為示意", 24, GREY, "ra")
    return img


def sc_route1(t, sc):
    img = gradient((10, 40, 60), (20, 90, 110))
    d = ImageDraw.Draw(img)
    ls = [l["start"] for l in sc["lines"]]
    scene_title_bar(d, "自行車環島 1 號線", appear(t, 0), TEAL)
    pts = draw_taiwan(d, 560, 570, 212, fill=(50, 100, 80))
    # 2014 劉金標
    k0 = appear(t, ls[0])
    card(img, (1080, 200, 1830, 400), k0, alpha=30, border=ORANGE)
    d = ImageDraw.Draw(img)
    if k0:
        text(d, (1120, 230), "2014 · 劉金標 80 歲再度環島", 40, fade(ORANGE, k0, NAVY2), "la")
        text(d, (1120, 305), "12 天 · 966 公里", 52, fade(WHITE, k0, NAVY2), "la")
    if t >= ls[1]:
        k = clamp((t - ls[1]) / 9)
        p, walked = poly_point(pts, ease(k))
        d.line(walked, fill=(255, 210, 60), width=9, joint="curve")
        d.ellipse([p[0] - 16, p[1] - 16, p[0] + 16, p[1] + 16], fill=RED, outline=WHITE, width=4)
        k1 = appear(t, ls[1])
        card(img, (1080, 450, 1830, 640), k1, alpha=30, border=TEAL)
        d = ImageDraw.Draw(img)
        text(d, (1120, 480), "2015.12.30 正式啟用", 40, fade(TEAL, k1, NAVY2), "la")
        text(d, (1120, 545), f"主線 {int(968 * ease(k))} 公里", 60, fade(WHITE, k1, NAVY2), "la")
    if t >= ls[2]:
        k2 = appear(t, ls[2])
        card(img, (1080, 690, 1830, 870), k2, alpha=30, border=TEAL)
        d = ImageDraw.Draw(img)
        text(d, (1120, 720), "主線 968 ＋ 環支線約 235", 38, fade(GREY, k2, NAVY2), "la")
        text(d, (1120, 780), "總長約 1203 公里", 58, fade((255, 210, 60), k2, NAVY2), "la")
    return img


def medal(d, x, y, color, label, k, bg):
    if k <= 0:
        return
    r = 34 * ease(k)
    d.polygon([(x - 22, y - 70), (x - 6, y - 30), (x + 6, y - 30), (x + 22, y - 70)], fill=fade(RED, k, bg))
    d.ellipse([x - r, y - r, x + r, y + r], fill=fade(color, k, bg), outline=fade(WHITE, k, bg), width=3)
    text(d, (x, y), label, 28, fade(NAVY, k, bg), "mm")


def athlete_panel(img, x0, name, sub, items, t, ls, color, k):
    card(img, (x0, 170, x0 + 840, 925), k, alpha=24, border=color)
    d = ImageDraw.Draw(img)
    if k <= 0:
        return
    bg = mix(NAVY, NAVY2, 0.5)
    # 頭像剪影
    cx, cy = x0 + 120, 275
    d.ellipse([cx - 70, cy - 70, cx + 70, cy + 70], fill=fade(color, k, bg))
    d.ellipse([cx - 28, cy - 50, cx + 28, cy + 6], fill=fade(NAVY, k, bg))
    d.pieslice([cx - 52, cy + 10, cx + 52, cy + 110], 180, 360, fill=fade(NAVY, k, bg))
    text(d, (x0 + 220, 220), name, 64, fade(WHITE, k, bg), "la")
    text(d, (x0 + 222, 300), sub, 30, fade(GREY, k, bg), "la")
    for i, (li, yr, s, med) in enumerate(items):
        kk = appear(t, ls[li])
        if kk <= 0:
            continue
        y = 395 + i * 125
        text(d, (x0 + 50, y), yr, 44, fade(color, kk, bg), "la")
        multiline(d, x0 + 200, y + 4, s, 32, fade(WHITE, kk, bg), 520, 1.3)
        if med:
            medal(d, x0 + 770, y + 50, med[0], med[1], kk, bg)


def sc_athletes(t, sc):
    img = gradient(NAVY, NAVY2)
    d = ImageDraw.Draw(img)
    ls = [l["start"] for l in sc["lines"]]
    scene_title_bar(d, "國際賽場上的台灣選手", appear(t, 0), RED)
    SILVER, GOLD, BRONZE = (200, 205, 215), (240, 200, 70), (205, 130, 70)
    athlete_panel(img, 90, "黃亭茵", "場地／公路 自由車", [
        (1, "2007", "世界青年錦標賽 女子 500 公尺計時賽 銀牌（35 秒 256）", (SILVER, "銀")),
        (2, "2015", "亞洲錦標賽 四面金牌", (GOLD, "金")),
        (2, "2016", "挺進里約奧運", None),
        (3, "2018", "雅加達亞運 女子全能 銀牌、3 公里個人追逐 銅牌", (SILVER, "銀")),
    ], t, ls, ORANGE, appear(t, ls[1]))
    athlete_panel(img, 990, "馮俊凱", "公路 自由車", [
        (4, "2008", "北京奧運 男子計分賽", None),
        (5, "2014", "簽約美利達·藍波車隊：加入世界一級職業車隊的台灣第一人", None),
        (6, "2021", "東京奧運 男子公路賽", None),
    ], t, ls, TEAL, appear(t, ls[4]))
    if t < ls[1]:
        d = ImageDraw.Draw(img)
        k = appear(t, 0.3)
        text(d, (W / 2, H / 2 - 40), "站上國際舞台", 96, fade(WHITE, k, NAVY), "mm")
    return img


def sc_data(t, sc):
    img = gradient(NAVY, NAVY2)
    d = ImageDraw.Draw(img)
    ls = [l["start"] for l in sc["lines"]]
    scene_title_bar(d, "高值化：平均出口單價（美元／輛）", appear(t, 0), ORANGE)
    X0, Y0, top = 200, 790, 280
    maxv = 1600
    d.line([X0, Y0, 1300, Y0], fill=GREY, width=3)
    for v in (0, 500, 1000, 1500):
        y = Y0 - (Y0 - top) * v / maxv
        d.line([X0, y, 1300, y], fill=(50, 70, 100), width=1)
        text(d, (X0 - 16, y), f"{v:,}", 28, GREY, "rm")
    groups = [("整車", [(2021, 661.51), (2022, 827.73)], 1), ("電動輔助自行車", [(2021, 1331.17), (2022, 1497.48)], 2)]
    for gi, (gname, vals, li) in enumerate(groups):
        gx = 320 + gi * 500
        kgrp = appear(t, ls[li] - 0.3, 1.6)
        text(d, (gx + 150, Y0 + 50), gname, 38, WHITE if kgrp else GREY, "mm")
        for bi, (yr, v) in enumerate(vals):
            x = gx + bi * 170
            k = ease(kgrp)
            h = (Y0 - top) * v / maxv * k
            col = ORANGE if yr == 2022 else (90, 120, 160)
            if h > 1:
                d.rectangle([x, Y0 - h, x + 130, Y0], fill=col)
            if kgrp:
                text(d, (x + 65, Y0 - h - 30), f"{v * k:,.2f}", 32, WHITE, "mm")
                text(d, (x + 65, Y0 + 18), str(yr), 26, GREY, "mm")
        if gi == 0 and kgrp > 0.9:
            text(d, (gx + 235, top - 40), "▲ 25.13%", 34, TEAL, "mm")
        if gi == 1 and kgrp > 0.9:
            text(d, (gx + 235, top - 40), "▲ 12.49%", 34, TEAL, "mm")
    k3 = appear(t, ls[3])
    card(img, (1400, 330, 1830, 700), k3, alpha=30, border=ORANGE)
    d = ImageDraw.Draw(img)
    if k3:
        text(d, (1615, 400), "2022 產業出口值", 36, fade(GREY, k3, NAVY2), "mm")
        text(d, (1615, 510), f"{61.5 * ease(k3):.1f}", 110, fade(ORANGE, k3, NAVY2), "mm")
        text(d, (1615, 610), "億美元（含零件）", 36, fade(WHITE, k3, NAVY2), "mm")
    text(d, (W - 90, 82), "資料：國際貿易署；財政部關務署", 26, GREY, "ra")
    return img


def sc_ending(t, sc):
    img = gradient((40, 30, 80), (250, 150, 80))
    d = ImageDraw.Draw(img)
    d.ellipse([W / 2 - 220, 520, W / 2 + 220, 960], fill=(255, 200, 110))
    hills(d, t * 30, 760, (70, 50, 100), 30, 300, 4)
    d.rectangle([0, 860, W, H], fill=(35, 25, 55))
    x = W * 0.25 + t * 70
    draw_bike(d, x, 818, 1.4, t * 6, frame=(35, 25, 55), rider=(35, 25, 55), wheel=(35, 25, 55))
    ls = [l["start"] for l in sc["lines"]]
    k = appear(t, ls[1], 1.2)
    text(d, (W / 2, 260), "故事，持續向前轉動", 96, fade(WHITE, k, (60, 45, 95)), "mm",
         stroke=3, stroke_fill=fade((35, 25, 55), k, (60, 45, 95)))
    return img


def sc_sources(t, sc):
    img = gradient(NAVY, (10, 18, 32))
    d = ImageDraw.Draw(img)
    k = appear(t, 0.2)
    text(d, (W / 2, 140), "資料來源", 64, fade(ORANGE, k, NAVY), "mm")
    for i, s in enumerate(SOURCES):
        kk = appear(t, 0.4 + i * 0.25)
        text(d, (200, 260 + i * 82), "・" + s, 34, fade(WHITE, kk, NAVY), "la")
    text(d, (W / 2, 990), "旁白：AI 語音合成（女聲）　字幕：繁體中文", 30, fade(GREY, k, NAVY), "mm")
    return img


SCENE_FN = dict(title=sc_title, colonial=sc_colonial, industry=sc_industry, tour=sc_tour, boom=sc_boom,
                kom=sc_kom, route1=sc_route1, athletes=sc_athletes, data=sc_data, ending=sc_ending,
                sources=sc_sources)


# ---------------------------------------------------------------- 字幕
def draw_subtitle(img, s, k):
    if not s or k <= 0:
        return
    lines = wrap(s, 50, 1560)
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    lh = 66
    y0 = H - 40 - lh * len(lines)
    maxw = max(F(50).getlength(l) for l in lines)
    od.rounded_rectangle([W / 2 - maxw / 2 - 36, y0 - 18, W / 2 + maxw / 2 + 36, H - 30], 18,
                         fill=(0, 0, 0, int(150 * k)))
    for i, l in enumerate(lines):
        od.text((W / 2, y0 + i * lh + lh / 2 - 4), l, font=F(50), fill=(255, 255, 255, int(255 * k)), anchor="mm",
                stroke_width=2, stroke_fill=(0, 0, 0, int(255 * k)))
    img.paste(Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB"))


TL = None


def init(tl):
    global TL
    TL = tl


def render_frame(fi):
    t = fi / FPS
    scenes = TL["scenes"]
    sc = scenes[-1]
    for s in scenes:
        if s["start"] <= t < s["end"]:
            sc = s
            break
    lt = t - sc["start"]
    local = dict(sc)
    local["lines"] = [dict(l, start=l["start"] - sc["start"], end=l["end"] - sc["start"]) for l in sc["lines"]]
    img = SCENE_FN[sc["kind"]](lt, local)
    # 場景轉場（淡入淡出）
    dur = sc["end"] - sc["start"]
    fk = min(clamp(lt / 0.5), clamp((dur - lt) / 0.5)) if sc is not scenes[-1] or lt < 0.5 else clamp(lt / 0.5)
    if sc is scenes[-1]:
        fk = min(clamp(lt / 0.5), clamp((dur - lt) / 1.0))
    if fk < 1:
        img = Image.blend(Image.new("RGB", (W, H), (0, 0, 0)), img, fk)
    # 字幕
    for l in sc["lines"]:
        if l["start"] - 0.1 <= t < l["end"] + 0.3:
            k = min(clamp((t - l["start"] + 0.1) / 0.2), clamp((l["end"] + 0.3 - t) / 0.2))
            draw_subtitle(img, l["sub"], k)
            break
    return img.tobytes()


def srt_time(x):
    ms = int(round(x * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def write_srt(tl, path):
    n = 1
    with open(path, "w", encoding="utf-8") as f:
        for sc in tl["scenes"]:
            for l in sc["lines"]:
                f.write(f"{n}\n{srt_time(l['start'])} --> {srt_time(l['end'] + 0.3)}\n{l['sub']}\n\n")
                n += 1


def main(build, out, only=None):
    tl = json.load(open(os.path.join(build, "timeline.json"), encoding="utf-8"))
    nframes = int(tl["duration"] * FPS)
    if only:  # 預覽單張影格
        init(tl)
        for sec in only:
            Image.frombytes("RGB", (W, H), render_frame(int(sec * FPS))).save(os.path.join(build, f"preview_{sec}.png"))
        return
    write_srt(tl, os.path.splitext(out)[0] + ".srt")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-i", os.path.join(build, "narration.wav"),
           "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
           "-metadata", "title=轉動的島嶼：台灣自由車發展史", out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(os.cpu_count(), initializer=init, initargs=(tl,)) as pool:
        for i, fr in enumerate(pool.imap(render_frame, range(nframes), chunksize=8)):
            p.stdin.write(fr)
            if i % 600 == 0:
                print(f"frame {i}/{nframes}", flush=True)
    p.stdin.close()
    p.wait()
    print("done", out)


if __name__ == "__main__":
    only = [float(x) for x in sys.argv[3].split(",")] if len(sys.argv) > 3 else None
    main(sys.argv[1], sys.argv[2], only)
