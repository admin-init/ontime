# -*- coding: utf-8 -*-
"""生成「到点」Demo 的演示素材截图。

产出（均在脚本所在目录下）：
  notice.png     正式通知截图（依据真实公开通知绘制）
  notice.txt     notice.png 中文字的逐字内容
  chat.png       班级群聊截图（虚构）
  chat.txt       chat.png 中文字的逐字内容
  notice_2.png   同一通知的「补充说明」截图（自拟，用于演示冲突与变更）
  notice_2.txt   notice_2.png 中文字的逐字内容

依赖：Pillow（backend/pyproject.toml 已含 pillow>=11.0）。
用法：
  cd backend && uv sync
  .\\.venv\\Scripts\\python.exe ..\\fixtures\\demo\\generate.py

来源：吉林大学党委学生工作部《关于召开2026年度本科生"小米奖（助）学金"评审答辩会的通知》
      https://xsc.jlu.edu.cn/info/1048/5974.htm （抓取日期 2026-11-08）
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent

# ---------------------------------------------------------------- 字体

FONT_DIR = Path("C:/Windows/Fonts")
FONT_REGULAR = FONT_DIR / "msyh.ttc"       # 微软雅黑
FONT_BOLD = FONT_DIR / "msyhbd.ttc"       # 微软雅黑 Bold

# ---------------------------------------------------------------- 调色板

INK = (26, 26, 26)
MUTED = (110, 110, 110)
FOOT = (150, 150, 150)
BRAND = (16, 58, 122)      # 深蓝：校名 / 小节标题
RULE = (216, 216, 216)
CHAT_BG = (237, 237, 237)
CHAT_BAR = (247, 247, 247)
BUBBLE = (255, 255, 255)

# ================================================================ 文本工具


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = FONT_BOLD if bold else FONT_REGULAR
    return ImageFont.truetype(str(path), size)


def _tokens(text: str) -> list[str]:
    """把文本切成可换行单元：中文逐字，ASCII 单词整体保留。"""
    out: list[str] = []
    buf = ""
    for ch in text:
        if ch.isascii() and (ch.isalnum() or ch in "@._+-/:()%"):
            buf += ch
        else:
            if buf:
                out.append(buf)
                buf = ""
            out.append(ch)
    if buf:
        out.append(buf)
    return out


# 不允许出现在行首的标点
NO_LINE_START = "，。、；：？！）》」』】%,.:;?!)]}"


def wrap(text: str, fnt: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """按像素宽度折行，支持中文。"""
    lines: list[str] = []
    cur = ""
    for tok in _tokens(text):
        if cur and fnt.getlength(cur + tok) > max_width:
            # 行首避头点处理
            if tok and tok[0] in NO_LINE_START and len(cur) > 1:
                lines.append(cur[:-1])
                cur = cur[-1] + tok
            else:
                lines.append(cur)
                cur = tok
        else:
            cur += tok
    if cur:
        lines.append(cur)
    return lines or [""]


def text_width(text: str, fnt: ImageFont.FreeTypeFont) -> float:
    return fnt.getlength(text)


# ================================================================ 通知渲染

NOTICE_W = 960
NOTICE_PAD = 78
NOTICE_TEXT_W = NOTICE_W - 2 * NOTICE_PAD

F_BODY = 18
F_H2 = 19
F_TITLE = 26
F_ORG = 30
F_DEPT = 20
F_META = 16
F_FOOT = 15

LINE_H = 34
BLOCK_GAP = 10


class NoticeDoc:
    """把 notice.png / notice.txt 的内容统一成一份结构，避免图文不同步。"""

    def __init__(
        self,
        title: str,
        date_line: str,
        blocks: list[tuple],
        footer: str,
        org: str = "吉林大学",
        dept: str = "党委学生工作部",
    ):
        self.title = title
        self.date_line = date_line
        self.blocks = blocks          # ("p"|"li"|"h2"|"sign", text)
        self.footer = footer
        self.org = org                # 学校
        self.dept = dept              # 学院 / 发文单位

    def plain_lines(self) -> list[str]:
        lines = [self.org, self.dept, "", self.title, "", self.date_line, ""]
        for kind, text in self.blocks:
            if kind == "h2":
                lines.append("")
                lines.append(text)
                lines.append("")
            elif kind == "li":
                lines.append("· " + text)
            elif kind == "sign":
                if lines and lines[-1] != "":
                    lines.append("")
                lines.append(text)
                lines.append("")
            else:
                lines.append(text)
                lines.append("")
        # 合并连续空行
        merged: list[str] = []
        for ln in lines:
            if ln == "" and merged and merged[-1] == "":
                continue
            merged.append(ln)
        while merged and merged[-1] == "":
            merged.pop()
        merged.append("")
        merged.append(self.footer)
        return merged


def draw_notice(doc: NoticeDoc, path: Path) -> None:
    f_org = font(F_ORG, bold=True)
    f_dept = font(F_DEPT)
    f_title = font(F_TITLE, bold=True)
    f_meta = font(F_META)
    f_h2 = font(F_H2, bold=True)
    f_body = font(F_BODY)
    f_foot = font(F_FOOT)

    img = Image.new("RGB", (NOTICE_W, 2400), (255, 255, 255))
    d = ImageDraw.Draw(img)

    y = 46

    # 页眉：学校 + 发文单位
    org_w = text_width(doc.org, f_org)
    d.text(((NOTICE_W - org_w) / 2, y), doc.org, font=f_org, fill=BRAND)
    y += F_ORG + 12
    dept_w = text_width(doc.dept, f_dept)
    d.text(((NOTICE_W - dept_w) / 2, y), doc.dept, font=f_dept, fill=MUTED)
    y += F_DEPT + 16
    d.line([(NOTICE_PAD, y), (NOTICE_W - NOTICE_PAD, y)], fill=BRAND, width=3)
    y += 34

    # 标题（过长时自动缩小字号，保证排版整齐）
    title_size = F_TITLE
    while title_size > 21 and len(wrap(doc.title, font(title_size, bold=True), NOTICE_TEXT_W)) > 1:
        title_size -= 1
    f_title = font(title_size, bold=True)
    title_lines = wrap(doc.title, f_title, NOTICE_TEXT_W)
    for ln in title_lines:
        w = text_width(ln, f_title)
        d.text(((NOTICE_W - w) / 2, y), ln, font=f_title, fill=INK)
        y += title_size + 12
    y += 12

    # 日期
    meta_w = text_width(doc.date_line, f_meta)
    d.text(((NOTICE_W - meta_w) / 2, y), doc.date_line, font=f_meta, fill=MUTED)
    y += F_META + 26

    # 正文
    for kind, text in doc.blocks:
        if kind == "h2":
            y += 14
            d.text((NOTICE_PAD, y), text, font=f_h2, fill=BRAND)
            y += F_H2 + 12
        elif kind == "li":
            for i, ln in enumerate(wrap(text, f_body, NOTICE_TEXT_W - 26)):
                prefix = "· " if i == 0 else "  "
                d.text((NOTICE_PAD + 2, y), prefix + ln, font=f_body, fill=INK)
                y += LINE_H
            y += 2
        elif kind == "sign":
            y += 10
            d.text((NOTICE_W - NOTICE_PAD - text_width(text, f_body), y), text, font=f_body, fill=INK)
            y += LINE_H
        else:
            # 首行缩进两字（中文通知排版惯例）
            for i, ln in enumerate(wrap(text, f_body, NOTICE_TEXT_W - 24)):
                x = NOTICE_PAD + (24 if i == 0 else 0)
                d.text((x, y), ln, font=f_body, fill=INK)
                y += LINE_H
            y += 4

    # 页脚
    y += 26
    d.line([(NOTICE_PAD, y), (NOTICE_W - NOTICE_PAD, y)], fill=RULE, width=1)
    y += 14
    d.text((NOTICE_PAD, y), doc.footer, font=f_foot, fill=FOOT)
    y += F_FOOT + 40

    img.crop((0, 0, NOTICE_W, y)).save(path, "PNG")


# ================================================================ 群聊渲染

CHAT_W = 900
CHAT_PAD = 24
AVATAR_R = 22
F_MSG = 18
F_NICK = 15
F_TIME = 15
F_CHAT_TITLE = 19
F_CAPTION = 15

BUBBLE_PAD_X = 16
BUBBLE_PAD_Y = 13
BUBBLE_MAX_W = 560


def draw_chat(messages: list[dict], group: str, caption: str, path: Path) -> None:
    f_msg = font(F_MSG)
    f_nick = font(F_NICK)
    f_time = font(F_TIME)
    f_title = font(F_CHAT_TITLE, bold=True)
    f_cap = font(F_CAPTION)

    # 先量高度
    msg_bubbles = []
    for m in messages:
        lines = wrap(m["text"], f_msg, BUBBLE_MAX_W - 2 * BUBBLE_PAD_X)
        tw = max(text_width(ln, f_msg) for ln in lines)
        bw = int(tw) + 2 * BUBBLE_PAD_X
        bh = len(lines) * (F_MSG + 8) + 2 * BUBBLE_PAD_Y
        msg_bubbles.append((lines, bw, bh))

    title_h = 58
    cap_h = 40
    input_h = 56
    y = title_h + 18
    blocks = []
    for m, (lines, bw, bh) in zip(messages, msg_bubbles):
        head_h = F_NICK + 6
        blocks.append((m, lines, bw, bh, head_h))
        y += head_h + bh + 18
    total_h = y + input_h + cap_h

    img = Image.new("RGB", (CHAT_W, total_h), CHAT_BG)
    d = ImageDraw.Draw(img)

    # 标题栏
    d.rectangle([0, 0, CHAT_W, title_h], fill=CHAT_BAR)
    d.line([(0, title_h), (CHAT_W, title_h)], fill=(218, 218, 218), width=1)
    d.text((CHAT_PAD + 4, 16), "‹", font=font(30), fill=(60, 60, 60))
    tw = text_width(group, f_title)
    d.text(((CHAT_W - tw) / 2, 18), group, font=f_title, fill=INK)
    d.text((CHAT_W - CHAT_PAD - 22, 20), "···", font=font(20), fill=(110, 110, 110))

    # 消息
    y = title_h + 18
    for m, lines, bw, bh, head_h in blocks:
        # 头像
        cx = CHAT_PAD + AVATAR_R
        cy = y + AVATAR_R
        d.ellipse(
            [cx - AVATAR_R, cy - AVATAR_R, cx + AVATAR_R, cy + AVATAR_R],
            fill=m["color"],
        )
        f_av = font(22, bold=True)
        ch = m["name"][0]
        aw = text_width(ch, f_av)
        d.text((cx - aw / 2, cy - 15), ch, font=f_av, fill=(255, 255, 255))

        bx = CHAT_PAD + 2 * AVATAR_R + 14
        # 昵称 + 时间
        d.text((bx, y), m["name"], font=f_nick, fill=(140, 140, 140))
        nw = text_width(m["name"], f_nick)
        d.text((bx + nw + 10, y), m["time"], font=f_time, fill=(180, 180, 180))
        by = y + head_h
        # 气泡
        d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=12, fill=BUBBLE)
        # 小尾巴
        d.polygon(
            [(bx, by + 16), (bx - 9, by + 24), (bx, by + 32)],
            fill=BUBBLE,
        )
        ty = by + BUBBLE_PAD_Y
        for ln in lines:
            d.text((bx + BUBBLE_PAD_X, ty), ln, font=f_msg, fill=INK)
            ty += F_MSG + 8
        y = by + bh + 18

    # 底部输入条
    input_top = total_h - cap_h - input_h
    d.rectangle([0, input_top, CHAT_W, input_top + input_h], fill=(247, 247, 247))
    d.line([(0, input_top), (CHAT_W, input_top)], fill=(222, 222, 222), width=1)
    d.rounded_rectangle(
        [CHAT_PAD + 4, input_top + 12, CHAT_W - 110, input_top + 44],
        radius=8,
        fill=(255, 255, 255),
        outline=(225, 225, 225),
        width=1,
    )
    d.text((CHAT_PAD + 18, input_top + 17), "…", font=font(18), fill=(180, 180, 180))
    d.rounded_rectangle(
        [CHAT_W - 96, input_top + 13, CHAT_W - CHAT_PAD, input_top + 43],
        radius=8,
        fill=(7, 193, 96),
    )
    d.text((CHAT_W - 78, input_top + 18), "发送", font=font(15), fill=(255, 255, 255))

    # 底部说明条
    d.rectangle([0, total_h - cap_h, CHAT_W, total_h], fill=(250, 250, 250))
    cw = text_width(caption, f_cap)
    d.text(((CHAT_W - cw) / 2, total_h - cap_h + 11), caption, font=f_cap, fill=FOOT)

    img.save(path, "PNG")


# ================================================================ 内容定义

NOTICE_FOOTER = "演示素材 · 依据吉林大学党委学生工作部公开通知绘制（抓取日期 2026-11-08）"
NOTICE2_FOOTER = "演示素材 · 自拟补充说明，用于演示冲突与变更，非真实公开通知"

NOTICE_DOC = NoticeDoc(
    title="关于召开2026年度本科生“小米奖（助）学金”评审答辩会的通知",
    date_line="发布日期：2026年10月22日",
    blocks=[
        ("p", "各相关学院："),
        (
            "p",
            "经学生本人申请，学院推荐，学校资格审核，共有90名本科学生入围2026年度本科生"
            "“小米奖（助）学金”评审答辩环节，现将相关事宜通知如下。",
        ),
        ("h2", "一、会议时间"),
        ("li", "小米奖学金答辩：2026年10月26日（星期一）下午13:30"),
        ("li", "小米助学金答辩：2026年10月27日（星期二）下午13:30"),
        ("h2", "二、会议地点"),
        ("p", "中心校区鼎新楼C328多功能会议室"),
        ("h2", "三、提交材料"),
        ("li", "答辩PPT电子版：答辩学生可自愿准备PPT，自述时间不超过3分钟。"),
        ("li", "答辩名单（小米奖学金、小米助学金各一份），答辩顺序详见附件。"),
        ("h2", "四、提交方式与截止时间"),
        ("li", "提交方式：发送邮件至党委学生工作部学生事务管理科邮箱（收件邮箱见通知原文）。"),
        ("li", "邮件命名：以“答辩序号+姓名+学院+小米奖学金（或小米助学金）”形式命名。"),
        ("li", "截止时间：2026年10月26日（星期一）上午9:00前。"),
        ("h2", "五、相关要求"),
        ("li", "请答辩学生于相关场次答辩开始前15分钟到鼎新楼C328会议室外签到并准备答辩。"),
        ("li", "答辩学生应着正装参会；如本人有特殊情况不能出席，可由其他学生代为答辩。"),
        ("sign", "吉林大学党委学生工作部"),
        ("sign", "2026年10月22日"),
    ],
    footer=NOTICE_FOOTER,
)

NOTICE2_DOC = NoticeDoc(
    title="关于召开2026年度本科生“小米奖（助）学金”评审答辩会的补充说明",
    date_line="发布日期：2026年10月24日",
    blocks=[
        ("p", "各入围答辩学生："),
        (
            "p",
            "针对部分同学反映的问题，现就2026年度本科生“小米奖（助）学金”评审答辩会的"
            "有关安排补充说明如下。",
        ),
        ("h2", "一、会议地点"),
        (
            "p",
            "答辩会地点由“中心校区鼎新楼C328多功能会议室”调整为“中心校区鼎新楼报告厅”。"
            "原定C328多功能会议室不再使用，请同学们按时前往新地点参加答辩。",
        ),
        ("h2", "二、提交材料"),
        (
            "p",
            "在原定提交答辩PPT电子版的基础上，增加《一页项目介绍》一份，内容包括项目名称、"
            "起止时间、本人承担的工作与主要成果，一页A4即可，与答辩PPT电子版一并提交。",
        ),
        ("h2", "三、提交截止时间"),
        (
            "p",
            "答辩PPT电子版与《一页项目介绍》的提交截止时间，由原定的2026年10月26日"
            "（星期一）上午9:00前提前至2026年10月25日（星期日）18:00前。",
        ),
        ("h2", "四、其他事项"),
        ("p", "答辩时间、自述时长、着装与签到要求均按原通知执行。"),
        ("sign", "吉林大学党委学生工作部"),
        ("sign", "2026年10月24日"),
    ],
    footer=NOTICE2_FOOTER,
)

CHAT_GROUP = "2024级计算机科学与技术2班"
CHAT_CAPTION = "演示素材 · 虚构班级群聊，人物与对话均为演示用途"

CHAT_MESSAGES = [
    {
        "name": "李同学",
        "time": "20:14",
        "color": (66, 133, 244),
        "text": "答辩时间没变，还是26号（下周一）下午1点半。助学金那场是27号下午1点半。",
    },
    {
        "name": "王同学",
        "time": "20:16",
        "color": (234, 67, 53),
        "text": "地点改了！C328多功能会议室临时被占了，改到鼎新楼报告厅，别走错了。",
    },
    {
        "name": "李同学",
        "time": "20:17",
        "color": (66, 133, 244),
        "text": "另外要补交一页项目介绍，就一页A4，写清项目名称和你负责的部分，跟PPT一起发。",
    },
    {
        "name": "王同学",
        "time": "20:19",
        "color": (234, 67, 53),
        "text": "截止还是26号上午9点前吗？我PPT还没弄完。",
    },
    {
        "name": "李同学",
        "time": "20:21",
        "color": (66, 133, 244),
        "text": "群里说的不一定准，我按学院的补充通知来，等通知出来再定。",
    },
]


def chat_plain_lines() -> list[str]:
    lines = [f"群聊名称：{CHAT_GROUP}", "界面日期：2026年10月24日", ""]
    for m in CHAT_MESSAGES:
        lines.append(f"{m['time']}  {m['name']}")
        lines.append(m["text"])
        lines.append("")
    lines.append(CHAT_CAPTION)
    return lines


# ================================================================ 未来日期素材
#
# 演示日 = 2026-11-08。真实通知里的截止时间普遍落在发布后 1~2 周内，
# 很难同时满足「截止时间 ≥ 2026-11-15」与「材料齐全」，因此另做一套
# 时间设定在演示日之后的素材，供录屏主流程使用。

FUTURE_FOOTER = "演示素材 · 自拟通知（虚构学校，时间设定在演示日 2026-11-08 之后）"
FUTURE2_FOOTER = "演示素材 · 自拟补充说明，用于演示冲突与变更，非真实公开通知"
FUTURE_CAPTION = "演示素材 · 虚构班级群聊，人物与对话均为演示用途"

FUTURE_DOC = NoticeDoc(
    title="关于开展2026年“启澜杯”大学生创新创业训练计划项目申报答辩的通知",
    date_line="发布日期：2026年11月9日",
    org="启澜大学",
    dept="信息工程学院",
    blocks=[
        ("p", "信息工程学院全体本科生："),
        (
            "p",
            "为鼓励同学们结合专业所长开展创新创业实践、检验项目培育成果，学院决定举办"
            "2026年“启澜杯”大学生创新创业训练计划项目申报答辩。现将有关事项通知如下：",
        ),
        ("h2", "一、答辩时间"),
        ("li", "2026年11月20日（星期五）下午14:00，具体答辩分组另行通知。"),
        ("h2", "二、答辩地点"),
        ("li", "信息工程学院弘毅楼A座302会议室。"),
        ("h2", "三、需提交材料"),
        ("li", "《“启澜杯”项目申报表》（纸质一式两份，同时提交电子版）。"),
        ("li", "项目支撑材料：论文、专利、获奖证书等复印件。"),
        ("li", "指导教师意见表一份，需指导教师本人签字。"),
        ("h2", "四、提交方式与截止时间"),
        ("li", "提交截止时间：2026年11月18日（星期三）17:00前。"),
        ("li", "纸质材料交至信息工程学院教学楼A座305办公室（本科生工作办公室）。"),
        (
            "li",
            "电子版材料打包发送至学院本科生工作办公室邮箱（收件邮箱见通知原文），"
            "压缩包命名为“启澜杯+学院+项目名称”。",
        ),
        ("h2", "五、相关要求"),
        ("li", "每人陈述5分钟，需准备PPT；请按分组顺序提前15分钟到场签到。"),
        ("li", "申报项目须已正式立项并有在研记录，立项材料随支撑材料一并提交。"),
        ("sign", "信息工程学院本科生工作办公室"),
        ("sign", "2026年11月9日"),
    ],
    footer=FUTURE_FOOTER,
)

FUTURE2_DOC = NoticeDoc(
    title="关于2026年“启澜杯”大学生创新创业训练计划项目申报答辩的补充说明",
    date_line="发布日期：2026年11月13日",
    org="启澜大学",
    dept="信息工程学院",
    blocks=[
        ("p", "各项目申报人："),
        (
            "p",
            "针对同学们反映的问题，现就2026年“启澜杯”大学生创新创业训练计划项目申报答辩的"
            "有关安排补充说明如下。",
        ),
        ("h2", "一、答辩地点"),
        (
            "p",
            "答辩地点由“信息工程学院弘毅楼A座302会议室”调整为“信息工程学院弘毅楼A座3楼"
            "学术报告厅”。原定302会议室不再使用，请同学们按时前往新地点参加答辩。",
        ),
        ("h2", "二、提交材料"),
        (
            "p",
            "在原定提交《项目申报表》、项目支撑材料、指导教师意见表的基础上，增加"
            "《一页项目介绍》一份，内容包括项目名称、起止时间、负责人及团队分工，一页A4即可，"
            "与上述材料一并提交。",
        ),
        ("h2", "三、提交截止时间"),
        (
            "p",
            "《项目申报表》等材料及《一页项目介绍》的提交截止时间，由原定的2026年11月18日"
            "（星期三）17:00前提前至2026年11月17日（星期二）20:00前。",
        ),
        ("h2", "四、其他事项"),
        ("p", "答辩时间、陈述时长与PPT要求均按原通知执行。"),
        ("sign", "信息工程学院本科生工作办公室"),
        ("sign", "2026年11月13日"),
    ],
    footer=FUTURE2_FOOTER,
)

FUTURE_GROUP = "启澜大学信息工程学院2024级计科1班"

FUTURE_MESSAGES = [
    {
        "name": "李同学",
        "time": "21:02",
        "color": (66, 133, 244),
        "text": "答辩还是20号（下周五）下午2点，材料18号周三下午5点前交，别搞混了。",
    },
    {
        "name": "王同学",
        "time": "21:04",
        "color": (234, 67, 53),
        "text": "地点改了！302会议室被占了，改到弘毅楼A座3楼报告厅，别走错了。",
    },
    {
        "name": "李同学",
        "time": "21:05",
        "color": (66, 133, 244),
        "text": "另外要补交一页项目介绍，就一页A4，写清项目名称和你负责的部分，跟申报表一起交。",
    },
    {
        "name": "王同学",
        "time": "21:07",
        "color": (234, 67, 53),
        "text": "那截止还是18号下午5点吗？我项目书还没写完。",
    },
    {
        "name": "李同学",
        "time": "21:09",
        "color": (66, 133, 244),
        "text": "群里说的不一定准，以学院补充通知为准，等通知出来再定。",
    },
]


def future_chat_plain_lines() -> list[str]:
    lines = [f"群聊名称：{FUTURE_GROUP}", "界面日期：2026年11月12日", ""]
    for m in FUTURE_MESSAGES:
        lines.append(f"{m['time']}  {m['name']}")
        lines.append(m["text"])
        lines.append("")
    lines.append(FUTURE_CAPTION)
    return lines


# ================================================================ 真实「未来日期」通知
#
# 西南交通大学数学学院【资助】2027年寒假“助梦启航”研学项目选拔通知：
# 真实公开页面，发布日期 2026-11-06，材料提交截止 2026-11-10 17:00（仍在未来），
# 活动时间为 2027-01-17—01-22（在截止之后），含完整材料清单。
# 来源：https://maths.swjtu.edu.cn/info/1064/27964.htm （抓取日期 2026-11-08）

REAL_FUTURE_FOOTER = "演示素材 · 依据西南交通大学数学学院公开通知绘制（抓取日期 2026-11-08）"
REAL_FUTURE_CAPTION = "演示素材 · 虚构班级群聊，人物与对话均为演示用途"

REAL_FUTURE_DOC = NoticeDoc(
    title="关于开展2027年寒假“助梦启航”受助学生出国（境）研学项目选拔工作的通知",
    date_line="发布日期：2026年11月6日",
    org="西南交通大学",
    dept="数学学院",
    blocks=[
        ("p", "数学学院全体本科生："),
        (
            "p",
            "为鼓励并支持优秀家庭经济困难学生开拓视野、丰富阅历、提升素养，学校决定开展"
            "2027年寒假“助梦启航”受助学生出国（境）研学项目。现将相关事宜通知如下：",
        ),
        ("h2", "一、项目开展时间"),
        ("li", "2027年1月17日—2027年1月22日（香港科技大学）。"),
        ("h2", "二、资助人数"),
        ("li", "本科生50名；数学学院可推荐人数2名。"),
        ("h2", "三、需提交材料"),
        ("li", "《西南交通大学“助梦启航”受助学生出国（境）研学项目申请表》（附件1）。"),
        ("li", "正式出国成绩单。"),
        ("li", "个人简历。"),
        ("li", "支撑材料（获奖、科研、实践等证明）。"),
        ("h2", "四、提交方式与截止时间"),
        ("li", "提交截止时间：2026年11月10日（星期二）17:00前。"),
        ("li", "提交地点：学院学生工作组X30447。"),
        (
            "li",
            "提交方式：申请材料按“申请表、成绩单、简历、支撑材料”顺序整理装订，"
            "于截止时间前一并交至学院学生工作组。",
        ),
        ("h2", "五、申请条件（节选）"),
        ("li", "具有中华人民共和国国籍，年满18周岁（截止2026年11月6日）。"),
        ("li", "全日制在籍本科生，2026—2027学年被学校认定为家庭经济特别困难学生。"),
        ("li", "从无任何出国（境）经历（含因公和因私）。"),
        ("sign", "数学学院学生工作组"),
        ("sign", "2026年11月6日"),
    ],
    footer=REAL_FUTURE_FOOTER,
)

REAL_FUTURE_GROUP = "西南交大数学学院2024级本科班"

REAL_FUTURE_MESSAGES = [
    {
        "name": "李同学",
        "time": "20:36",
        "color": (66, 133, 244),
        "text": "研学项目材料11月10号周二下午5点前交到X30447。",
    },
    {
        "name": "王同学",
        "time": "20:38",
        "color": (234, 67, 53),
        "text": "提交地点改了，X30447这周不收材料，改到逸夫馆3楼314办公室。",
    },
    {
        "name": "李同学",
        "time": "20:40",
        "color": (66, 133, 244),
        "text": "另外还要补交一页研学计划，写清楚这学期做的项目，跟申请表一起交。",
    },
    {
        "name": "王同学",
        "time": "20:42",
        "color": (234, 67, 53),
        "text": "截止时间没变吧？我成绩单还没打印。",
    },
    {
        "name": "李同学",
        "time": "20:44",
        "color": (66, 133, 244),
        "text": "群里说的不一定准，以学院通知为准。",
    },
]


def real_future_chat_plain_lines() -> list[str]:
    lines = [f"群聊名称：{REAL_FUTURE_GROUP}", "界面日期：2026年11月8日", ""]
    for m in REAL_FUTURE_MESSAGES:
        lines.append(f"{m['time']}  {m['name']}")
        lines.append(m["text"])
        lines.append("")
    lines.append(REAL_FUTURE_CAPTION)
    return lines


# ================================================================ 入口


def main() -> None:
    # 1) 真实素材（吉林大学，历史通知）——演示「联网核实找到官方原文」
    draw_notice(NOTICE_DOC, HERE / "notice.png")
    (HERE / "notice.txt").write_text(
        "\n".join(NOTICE_DOC.plain_lines()) + "\n", encoding="utf-8"
    )

    draw_notice(NOTICE2_DOC, HERE / "notice_2.png")
    (HERE / "notice_2.txt").write_text(
        "\n".join(NOTICE2_DOC.plain_lines()) + "\n", encoding="utf-8"
    )

    draw_chat(CHAT_MESSAGES, CHAT_GROUP, CHAT_CAPTION, HERE / "chat.png")
    (HERE / "chat.txt").write_text("\n".join(chat_plain_lines()) + "\n", encoding="utf-8")

    # 2) 未来日期素材（自拟）——录屏主流程
    draw_notice(FUTURE_DOC, HERE / "notice_future.png")
    (HERE / "notice_future.txt").write_text(
        "\n".join(FUTURE_DOC.plain_lines()) + "\n", encoding="utf-8"
    )

    draw_notice(FUTURE2_DOC, HERE / "notice_future_2.png")
    (HERE / "notice_future_2.txt").write_text(
        "\n".join(FUTURE2_DOC.plain_lines()) + "\n", encoding="utf-8"
    )

    draw_chat(FUTURE_MESSAGES, FUTURE_GROUP, FUTURE_CAPTION, HERE / "chat_future.png")
    (HERE / "chat_future.txt").write_text(
        "\n".join(future_chat_plain_lines()) + "\n", encoding="utf-8"
    )

    # 3) 真实「未来日期」通知（西南交通大学）——真实且未逾期
    draw_notice(REAL_FUTURE_DOC, HERE / "notice_real_future.png")
    (HERE / "notice_real_future.txt").write_text(
        "\n".join(REAL_FUTURE_DOC.plain_lines()) + "\n", encoding="utf-8"
    )

    draw_chat(
        REAL_FUTURE_MESSAGES,
        REAL_FUTURE_GROUP,
        REAL_FUTURE_CAPTION,
        HERE / "chat_real_future.png",
    )
    (HERE / "chat_real_future.txt").write_text(
        "\n".join(real_future_chat_plain_lines()) + "\n", encoding="utf-8"
    )

    for name in (
        "notice.png",
        "notice_2.png",
        "chat.png",
        "notice_future.png",
        "notice_future_2.png",
        "chat_future.png",
        "notice_real_future.png",
        "chat_real_future.png",
    ):
        with Image.open(HERE / name) as im:
            print(f"{name}: {im.size[0]}x{im.size[1]}")
    print("written to", HERE)


if __name__ == "__main__":
    main()
