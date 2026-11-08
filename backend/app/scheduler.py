"""APScheduler 装配：按 WatchTarget.cron 定时触发官网同步。

cron 用标准 5 段写法（分 时 日 月 周），按 Asia/Shanghai 解释。
`SCHEDULER_ENABLED=0` 可整体关闭，手动同步不受影响。
"""

from __future__ import annotations

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from app.core import SessionLocal, settings
from app.crawl import scheduled_sync
from app.models import WatchTarget

_scheduler: AsyncIOScheduler | None = None


def reload_jobs() -> None:
    if _scheduler is None:
        return
    for job in _scheduler.get_jobs():
        job.remove()
    with SessionLocal() as db:
        targets = db.scalars(
            select(WatchTarget).where(
                WatchTarget.enabled.is_(True),
                WatchTarget.cron.is_not(None),
                WatchTarget.url.is_not(None),
            )
        ).all()
        for target in targets:
            try:
                trigger = CronTrigger.from_crontab((target.cron or "").strip())
            except Exception as e:  # noqa: BLE001
                target.last_error = f"cron 配置无效：{str(e)[:160]}"
                db.commit()
                continue
            _scheduler.add_job(
                scheduled_sync,
                trigger=trigger,
                args=[target.id],
                id=f"watch-{target.id}",
                replace_existing=True,
                max_instances=1,
                coalesce=True,
                misfire_grace_time=600,
            )


def start_scheduler() -> None:
    global _scheduler
    if not settings.scheduler_enabled or _scheduler is not None:
        return
    _scheduler = AsyncIOScheduler(timezone="Asia/Shanghai")
    reload_jobs()
    _scheduler.start()


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        try:
            _scheduler.shutdown(wait=False)
        finally:
            _scheduler = None


def scheduler_running() -> bool:
    return bool(_scheduler and _scheduler.running)
