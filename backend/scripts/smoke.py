"""到点 · 真实链路冒烟（P0 验收脚本）。

只做真实调用：模型识别、模型抽取、Bing 检索与网页抓取，全部走后端 HTTP 接口，
不使用任何写死结果。可重复执行，默认先清空演示数据。

用法（先在另一个终端启动后端：scripts/dev.ps1）：
    cd backend
    uv run python scripts/smoke.py
    uv run python scripts/smoke.py --keep          # 保留已有数据
    uv run python scripts/smoke.py --base http://127.0.0.1:8010
    uv run python scripts/smoke.py --search "西南交通大学 助梦启航 2027 寒假 研学"   # 只检索引擎

退出码：0 = 全部通过；1 = 有断言失败（会打印失败项）。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sqlite3
import sys
import time
from pathlib import Path

import httpx
from PIL import Image, ImageDraw, ImageFont

BACKEND_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BACKEND_DIR.parent / "storage"
SHOT_DIR = STORAGE_DIR / "smoke"
FONT_PATH = Path("C:/Windows/Fonts/msyh.ttc")
DEFAULT_DB = BACKEND_DIR / "ontime.db"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

TIMEOUT_MODEL = 300

NOTICE_TEXT = """关于举办 2026 年数学学院「创新工作坊」的通知

各班级：
学院定于 2026 年 11 月 12 日（周四）14:00 在学院楼 A301 报告厅举办「创新工作坊」专题活动，邀请企业导师现场指导项目打磨，欢迎同学们踊跃参加。
请有意参加的同学于 11 月 10 日 17:00 前完成报名，报名时需提交一页项目介绍和个人简历各一份，发送至 cs@demo.edu.cn，邮件主题注明「创新工作坊报名」。
活动当天请提前 15 分钟签到，并自带笔记本电脑。
逾期未报名的同学视为放弃本次名额。
数学学院学生工作办公室
2026 年 11 月 5 日
"""

SHOT1_LINES = [
    "数学学院「创新工作坊」活动通知",
    "",
    "活动时间：2026年11月12日（周四）14:00",
    "活动地点：学院楼 A301 报告厅",
    "报名截止：11月10日 17:00",
    "报名材料：一页项目介绍、个人简历",
    "报名方式：发送至 cs@demo.edu.cn",
    "主办单位：数学学院学生工作办公室",
]

SHOT2_LINES = [
    "「创新工作坊」补充通知",
    "",
    "原定于 11月12日 14:00 举办的「创新工作坊」，",
    "活动地点由 学院楼 A301 报告厅",
    "变更为 图书馆 B201 多功能厅。",
    "",
    "另需补交一份《家长知情同意书》，",
    "请于 11月9日 17:00 前交至学院办公室 A210。",
    "",
    "数学学院学生工作办公室",
    "2026年11月7日",
]


# ---------------------------------------------------------------- 断言与输出


class Checker:
    def __init__(self) -> None:
        self.failed: list[str] = []
        self.passed = 0

    def check(self, name: str, ok: bool, detail: str = "") -> bool:
        if ok:
            self.passed += 1
            print(f"  [PASS] {name}" + (f" — {detail}" if detail else ""))
        else:
            self.failed.append(name)
            print(f"  [FAIL] {name}" + (f" — {detail}" if detail else ""))
        return ok

    def note(self, text: str) -> None:
        print(f"  · {text}")


def wait_job(client: httpx.Client, job_id: str, timeout: int = TIMEOUT_MODEL) -> dict:
    last = ""
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = client.get(f"/api/jobs/{job_id}").json()
        stage = (job.get("stage") or {}).get("stage") or job.get("state")
        if stage != last:
            print(f"     job={job['state']} stage={stage}")
            last = stage
        if job["state"] in ("done", "failed"):
            return job
        time.sleep(1.5)
    raise TimeoutError(f"job {job_id} 超时（{timeout}s）")


def stage_keys(job: dict) -> list[tuple[str, str]]:
    return [(s["key"], s["state"]) for s in (job.get("stage") or {}).get("steps") or []]


def field_of(event: dict, key: str) -> dict:
    return next(f for f in event["fields"] if f["key"] == key)


def task_field(task: dict, key: str) -> dict:
    return next(f for f in task["fields"] if f["key"] == key)


# ---------------------------------------------------------------- 图片生成


def render_notice(lines: list[str], path: Path) -> Path:
    if not FONT_PATH.exists():
        raise SystemExit(f"缺少中文字体：{FONT_PATH}")
    font = ImageFont.truetype(str(FONT_PATH), 28)
    title_font = ImageFont.truetype(str(FONT_PATH), 34)
    width, pad, line_h = 980, 44, 52
    height = pad * 2 + line_h * len(lines) + 20
    img = Image.new("RGB", (width, height), (250, 250, 249))
    draw = ImageDraw.Draw(img)
    y = pad
    for i, line in enumerate(lines):
        draw.text((pad, y), line, font=title_font if i == 0 else font, fill=(28, 25, 23))
        y += line_h
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    return path


# ---------------------------------------------------------------- 数据库校验


def db_rows(db_path: Path, sql: str, params: tuple = ()) -> list[tuple]:
    con = sqlite3.connect(str(db_path))
    try:
        return con.execute(sql, params).fetchall()
    finally:
        con.close()


def check_quote_spans(check: Checker, db_path: Path, source_id: str) -> None:
    rows = db_rows(
        db_path,
        "select c.field, c.quote, c.quote_start, c.quote_end, s.text, c.entity_type "
        "from claim c join source s on s.id = c.source_id "
        "where c.source_id = ? and c.quote_start is not null",
        (source_id,),
    )
    check.check("claims 落库", len(rows) > 0, f"{len(rows)} 条带区间的 claim")
    bad = [
        (field, quote)
        for field, quote, start, end, text, _ in rows
        if quote != text[start:end]
    ]
    check.check("quote 区间与原文一致", not bad, f"{len(rows) - len(bad)}/{len(rows)} 条一致")
    no_span = db_rows(
        db_path,
        "select count(*) from claim where source_id = ? and quote is not null and quote_start is null",
        (source_id,),
    )[0][0]
    check.check("所有 quote 都有区间", no_span == 0, f"{no_span} 条缺区间")


# ---------------------------------------------------------------- 各步骤


def step_health(client: httpx.Client, check: Checker) -> None:
    print("\n[1] 健康检查")
    h = client.get("/api/health").json()
    check.check("GET /api/health ok", h.get("ok") is True, json.dumps(h, ensure_ascii=False))
    model = h.get("model") or {}
    check.check("模型连通 model.ok", model.get("ok") is True, model.get("error") or "")


def step_text(client: httpx.Client, check: Checker, db_path: Path) -> tuple[str, str]:
    print("\n[2] 文本通知收录")
    r = client.post("/api/ingest/text", json={"text": NOTICE_TEXT, "title": "创新工作坊通知"})
    r.raise_for_status()
    source_id, job_id = r.json()["source_id"], r.json()["job_id"]
    job = wait_job(client, job_id)
    check.check("job 完成", job["state"] == "done", job.get("error") or "")
    result = job.get("result") or {}
    event_id = result.get("event_id")
    if not check.check("抽出事件", bool(event_id), str(result.get("summary"))[:60]):
        return event_id or "", source_id

    event = client.get(f"/api/events/{event_id}").json()
    start = field_of(event, "start_at")
    check.check("活动时间有值", bool(start["value"]), f"{start['display']} / {start['status']}")
    real_tasks = [t for t in event["tasks"] if t.get("due_at")]
    check.check("至少一个带截止时间的任务", bool(real_tasks), f"{len(event['tasks'])} 个任务")
    if real_tasks:
        check.note(f"任务：{real_tasks[0]['action']} → {real_tasks[0]['due_display']}")

    start_claims = db_rows(
        db_path,
        "select entity_type from claim where entity_id = ? and field = 'start_at'",
        (event_id,),
    )
    due_claims = db_rows(
        db_path,
        "select entity_type from claim where field = 'due_at' and source_id = ?",
        (source_id,),
    )
    check.check(
        "活动时间与报名截止分属不同实体",
        bool(start_claims) and bool(due_claims) and start_claims[0][0] == "event" and due_claims[0][0] == "task",
        f"start_at→{start_claims[0][0] if start_claims else '-'} / due_at→{due_claims[0][0] if due_claims else '-'}",
    )
    check.note(f"materials={real_tasks[0]['materials'] if real_tasks else []}")
    check_quote_spans(check, db_path, source_id)
    return event_id, source_id


def step_screenshot(
    client: httpx.Client, check: Checker, db_path: Path, lines: list[str], name: str
) -> tuple[str, str]:
    path = render_notice(lines, SHOT_DIR / name)
    print(f"\n[截图] {path.name} 上传")
    with path.open("rb") as fh:
        r = client.post("/api/ingest/screenshot", files={"file": (path.name, fh, "image/png")})
    r.raise_for_status()
    source_id, job_id = r.json()["source_id"], r.json()["job_id"]
    job = wait_job(client, job_id)
    check.check(f"{name} job 完成", job["state"] == "done", job.get("error") or "")
    steps = dict(stage_keys(job))
    check.check(
        f"{name} 四步都走到",
        all(s in ("done", "active") for s in steps.values()) and len(steps) == 4 and steps.get("done") in ("done", "active"),
        str(steps),
    )
    ocr = db_rows(db_path, "select text from source where id = ?", (source_id,))[0][0]
    print("     识别的文字：" + ocr.replace("\n", " / ")[:160])
    check.check(f"{name} 视觉识别出文字", len(ocr) >= 40, f"{len(ocr)} 字")
    check.check(f"{name} 识别内容含关键词", "工作坊" in ocr)
    result = job.get("result") or {}
    event_id = result.get("event_id") or ""
    check.check(f"{name} 抽出事件", bool(event_id), str(result.get("summary"))[:60])
    check_quote_spans(check, db_path, source_id)
    return event_id, source_id


def step_merge(client: httpx.Client, check: Checker, new_id: str, known_ids: set[str]) -> str:
    print("\n[4] 收件箱合并建议")
    if not check.check("补充通知已抽出事件", bool(new_id)):
        return ""
    inbox = client.get("/api/inbox").json()
    merges = inbox.get("merges") or []
    check.check("出现合并建议", bool(merges), f"counts={inbox.get('counts')}")
    target = next(
        (m for m in merges if new_id in {m["a"]["id"], m["b"]["id"]}),
        None,
    )
    if not check.check("合并建议指向补充通知与已有活动", target is not None):
        return ""

    partner_id = target["b"]["id"] if target["a"]["id"] == new_id else target["a"]["id"]
    check.check("关联到已收录的同一活动", partner_id in known_ids, partner_id)
    check.note(f"评分 {target['score']}，理由：{'；'.join(target['reasons'])}")
    diff = target["diff"]
    for d in diff:
        check.note(f"diff {d['kind']} {d['label']}：{d['old']} → {d['new']}")

    loc = [d for d in diff if d["kind"] == "change" and d["field"] == "location"]
    loc_text = f"{loc[0]['old']} {loc[0]['new']}" if loc else ""
    check.check(
        "diff 含地点变更（A301 → B201）",
        "A301" in loc_text and "B201" in loc_text,
        json.dumps(loc, ensure_ascii=False)[:160],
    )
    tasks = [d for d in diff if d["kind"] == "task"]
    check.check("diff 含补交材料的新增待办", bool(tasks), json.dumps(tasks, ensure_ascii=False)[:160])

    before = client.get(f"/api/events/{partner_id}").json()
    r = client.post(f"/api/merge/{target['id']}", json={"action": "accept"})
    r.raise_for_status()
    check.check("合并已接受", r.json().get("state") == "accepted", r.text[:120])

    after = client.get(f"/api/events/{partner_id}").json()
    loc_field = field_of(after, "location")
    check.check(
        "目标事件地点出现 conflict",
        loc_field["status"] == "conflict",
        f"status={loc_field['status']} claims={len(loc_field['claims'])}",
    )
    check.check(
        "conflict 字段保留两个候选",
        len([c for c in loc_field["claims"] if c["status"] in ("supported", "conflict")]) >= 2,
        str([c["display"] for c in loc_field["claims"]]),
    )
    check.check(
        "合并后事件 conflict_count > 0",
        after["conflict_count"] > 0,
        f"conflict_count={after['conflict_count']}",
    )
    check.check(
        "任务已并入目标事件",
        after["task_count"] > before["task_count"],
        f"{before['task_count']} → {after['task_count']}",
    )
    actions = [t["action"] for t in after["tasks"]]
    check.note("任务：" + "；".join(actions))
    check.check("补交材料的任务存在", any("材料" in a or "同意书" in a for a in actions), str(actions))
    merged = client.get(f"/api/events/{new_id}").json()
    check.check("被合并事件标记 merged", merged["state"] == "merged", merged["state"])
    return partner_id


def step_verify(client: httpx.Client, check: Checker, event_id: str) -> None:
    print("\n[5] 联网核实")
    if not check.check("有可核实的事件", bool(event_id)):
        return
    r = client.post(f"/api/events/{event_id}/verify")
    r.raise_for_status()
    job = wait_job(client, r.json()["job_id"])
    check.check("核实 job 完成", job["state"] == "done", job.get("error") or "")
    result = job.get("result") or {}
    for key in ("status", "message", "query", "sources", "findings", "checked_at"):
        check.check(f"result 含 {key}", key in result)
    status = result.get("status")
    check.check("status 合法", status in ("found", "conflict", "not_found"), str(status))
    check.note("检索词：" + " | ".join(result.get("query") or []))
    check.note(f"结论：{status} — {result.get('message')}")
    sources = result.get("sources") or []
    findings = result.get("findings") or []
    for s in sources:
        check.note(f"来源：{s['title'][:40]} {s['url'][:70]} official={s['official']} chars={s['chars']}")
    for f in findings[:5]:
        check.note(f"发现：{f['label']} = {f['display']} [{f['state']}] ← {f['source_url'][:60]}")
    if status == "not_found":
        check.check("not_found 不给结论、无 findings", not findings, result.get("message", ""))
        check.check(
            "not_found 文案合规",
            "未找到明确适用的官方依据" in (result.get("message") or ""),
        )
    else:
        check.check("found/conflict 有来源", bool(sources))
        check.check("found/conflict 有 findings", bool(findings))


# ---------------------------------------------------------------- 检索自检


def probe_search(query: str) -> int:
    """只跑检索链路：真实搜索 + 解析跳转 + 抓正文，用于核对搜索引擎是否可用。"""
    from app.verify import fetch_page, search_web

    async def run() -> int:
        hits = await search_web(query, limit=10)
        print(f"检索词：{query}\n命中 {len(hits)} 条（真实目标地址）")
        marks = ("11月10日", "X30447", "2026年11月10日")
        for h in hits:
            print(f"  - {h['title'][:60]}\n    {h['url']}")
        for h in hits[:5]:
            page = await fetch_page(h["url"])
            text = (page or {}).get("text") or ""
            found = [m for m in marks if m in text]
            print(f"    抓取 {len(text):5d} 字 {h['url'][:70]} {found or ''}")
        return 0 if hits else 1

    return asyncio.run(run())


# ---------------------------------------------------------------- 主流程


def main() -> int:
    parser = argparse.ArgumentParser(description="到点后端真实链路冒烟")
    parser.add_argument("--base", default="http://127.0.0.1:8000")
    parser.add_argument("--db", default=str(DEFAULT_DB))
    parser.add_argument("--keep", action="store_true", help="不清空已有演示数据")
    parser.add_argument("--search", help="只跑一次真实检索并打印结果（含跳转解析与正文抓取）")
    args = parser.parse_args()

    if args.search:
        return probe_search(args.search)

    check = Checker()
    db_path = Path(args.db)
    started = time.time()

    with httpx.Client(base_url=args.base, timeout=120) as client:
        try:
            step_health(client, check)
            if not args.keep:
                client.post("/api/demo/reset").raise_for_status()
                print("  已清空演示数据（POST /api/demo/reset）")
            first_id, _ = step_text(client, check, db_path)
            shot1_id, _ = step_screenshot(client, check, db_path, SHOT1_LINES, "notice-1.png")
            shot2_id, _ = step_screenshot(client, check, db_path, SHOT2_LINES, "notice-2.png")
            target_id = step_merge(client, check, shot2_id, {first_id, shot1_id})
            step_verify(client, check, target_id)
        except httpx.HTTPError as e:
            check.check("HTTP 调用", False, str(e))
        except Exception as e:  # noqa: BLE001  冒烟脚本要把失败原因带出来
            check.check("执行流程", False, f"{type(e).__name__}: {e}")

    print(f"\n结果：{check.passed} 项通过，{len(check.failed)} 项失败，用时 {time.time() - started:.0f}s")
    if check.failed:
        print("失败项：" + "；".join(check.failed))
        return 1
    print("全部通过。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
