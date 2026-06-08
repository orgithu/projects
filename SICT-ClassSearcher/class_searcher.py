#!/usr/bin/env python3
"""Fetch, cache, and search SICT classroom weekly schedules.

The script reads room numbers from class-list.md, downloads each classroom
weekly page once, caches the parsed schedule locally, and then lets you search
across all cached rooms by room, subject, teacher, or combinations of those
fields.

Examples:
  python3 class_searcher.py update
  python3 class_searcher.py search --teacher "Л.БАЯР-ЭРДЭНЭ"
  python3 class_searcher.py search --subject "F.CSA823" --teacher "Л.БАЯР-ЭРДЭНЭ"
  python3 class_searcher.py search --classroom 102
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import urllib.request
from urllib.error import HTTPError, URLError
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable, Sequence


WORKSPACE_ROOT = Path(__file__).resolve().parent
ROOM_LIST_FILE = WORKSPACE_ROOT / "class-list.md"
CACHE_DIR = WORKSPACE_ROOT / ".cache" / "class_searcher"
RAW_DIR = CACHE_DIR / "raw"
INDEX_FILE = CACHE_DIR / "schedules.json"
DEFAULT_BASE_URL = "https://sict.edu.mn/class/{room}?view=week"
DAY_NAMES = ("Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан")
LESSON_TYPES = ("Лек", "Сем", "Лаб")

ROOM_LINE_PATTERN = re.compile(r"^\s*\*\s*\[\d+\]\s*([^\s]+)\s*$")
PERIOD_LINE_PATTERN = re.compile(r"^(\d+)\.\s+(\d+)-р(?:[─-])?\s*$")


@dataclass
class ScheduleEntry:
    room: str
    day: str
    period: int
    subject: str = ""
    teacher: str = ""
    lesson_type: str = ""
    details: list[str] = field(default_factory=list)
    raw_lines: list[str] = field(default_factory=list)
    source_url: str = ""
    fetched_at: str = ""

    def search_text(self) -> str:
        parts = [
            self.room,
            self.day,
            str(self.period),
            self.subject,
            self.teacher,
            self.lesson_type,
            " ".join(self.details),
            " ".join(self.raw_lines),
        ]
        return normalize_text(" ".join(part for part in parts if part))


class PlainTextExtractor(HTMLParser):
    BLOCK_TAGS = {
        "article",
        "aside",
        "div",
        "footer",
        "header",
        "li",
        "main",
        "p",
        "section",
        "table",
        "tbody",
        "td",
        "th",
        "tr",
    }

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:  # type: ignore[override]
        if tag in {"br", "hr"}:
            self.parts.append("\n")
        elif tag in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:  # type: ignore[override]
        if tag in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def text(self) -> str:
        raw = unescape("".join(self.parts))
        lines = [re.sub(r"\s+", " ", line).strip() for line in raw.splitlines()]
        cleaned = [line for line in lines if line]
        return "\n".join(cleaned)


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def ensure_cache_dirs() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)


def load_room_list(path: Path = ROOM_LIST_FILE) -> list[str]:
    if not path.exists():
        raise FileNotFoundError(f"Room list file not found: {path}")

    rooms: list[str] = []
    seen: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        match = ROOM_LINE_PATTERN.match(line)
        if not match:
            continue
        room = match.group(1).strip()
        if room and room not in seen:
            rooms.append(room)
            seen.add(room)
    return rooms


def room_cache_path(room: str) -> Path:
    safe_room = re.sub(r"[^0-9A-Za-z._-]+", "_", room)
    return RAW_DIR / f"{safe_room}.txt"


def fetch_page_dump(room: str, base_url: str = DEFAULT_BASE_URL) -> str:
    url = base_url.format(room=room)
    curl = shutil.which("curl")
    lynx = shutil.which("lynx")

    if curl and lynx:
        curl_result = subprocess.run(
            [curl, "-fsSL", url],
            check=True,
            capture_output=True,
            text=True,
        )
        lynx_result = subprocess.run(
            [lynx, "-stdin", "-dump"],
            check=True,
            capture_output=True,
            input=curl_result.stdout,
            text=True,
        )
        return lynx_result.stdout

    with urllib.request.urlopen(url) as response:
        html = response.read().decode("utf-8", errors="replace")

    extractor = PlainTextExtractor()
    extractor.feed(html)
    return extractor.text()


def split_teacher_and_type(value: str) -> tuple[str, str]:
    text = value.strip()
    for lesson_type in LESSON_TYPES:
        if text.endswith(lesson_type):
            teacher = text[: -len(lesson_type)].strip()
            if teacher:
                return teacher, lesson_type
    return text, ""


def parse_schedule_dump(text: str, room: str, source_url: str) -> list[ScheduleEntry]:
    lines = [line.rstrip() for line in text.splitlines()]
    entries: list[ScheduleEntry] = []
    current_day: str | None = None
    current_entry: ScheduleEntry | None = None
    current_content: list[str] = []

    def finalize_current_entry() -> None:
        nonlocal current_entry, current_content
        if current_entry is None:
            current_content = []
            return

        content = [line.strip() for line in current_content if line.strip()]
        if content:
            current_entry.raw_lines = content
            current_entry.subject = content[0]
            if len(content) >= 2:
                teacher, lesson_type = split_teacher_and_type(content[1])
                current_entry.teacher = teacher
                current_entry.lesson_type = lesson_type
            if len(content) > 2:
                current_entry.details = content[2:]
            entries.append(current_entry)

        current_entry = None
        current_content = []

    for raw_line in lines:
        line = raw_line.strip()

        if line in DAY_NAMES:
            finalize_current_entry()
            current_day = line
            continue

        if current_day is None:
            continue

        if not line or line == "Өнөөдөр":
            continue

        period_match = PERIOD_LINE_PATTERN.match(line)
        if period_match:
            finalize_current_entry()
            period_number = int(period_match.group(1))
            is_empty = line.endswith("─") or line.endswith("-")
            current_entry = None if is_empty else ScheduleEntry(
                room=room,
                day=current_day,
                period=period_number,
                source_url=source_url,
                fetched_at=datetime.now(timezone.utc).isoformat(),
            )
            current_content = []
            continue

        if current_entry is not None:
            current_content.append(line)

    finalize_current_entry()

    deduped: dict[tuple, ScheduleEntry] = {}
    for entry in entries:
        key = (
            entry.room,
            entry.day,
            entry.period,
            entry.subject,
            entry.teacher,
            entry.lesson_type,
            tuple(entry.details),
            tuple(entry.raw_lines),
        )
        deduped[key] = entry

    ordered_entries = sorted(
        deduped.values(),
        key=lambda item: (item.room, DAY_NAMES.index(item.day), item.period, item.subject, item.teacher),
    )
    return ordered_entries


def load_cached_entries(index_path: Path = INDEX_FILE) -> list[ScheduleEntry]:
    if not index_path.exists():
        return []

    data = json.loads(index_path.read_text(encoding="utf-8"))
    return [ScheduleEntry(**item) for item in data]


def save_cached_entries(entries: Sequence[ScheduleEntry], index_path: Path = INDEX_FILE) -> None:
    ensure_cache_dirs()
    payload = [asdict(entry) for entry in entries]
    index_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def update_cache(rooms: Sequence[str], base_url: str = DEFAULT_BASE_URL) -> list[ScheduleEntry]:
    ensure_cache_dirs()
    all_entries: list[ScheduleEntry] = []
    skipped_rooms: list[str] = []
    total = len(rooms)

    for position, room in enumerate(rooms, start=1):
        url = base_url.format(room=room)
        try:
            dump = fetch_page_dump(room, base_url=base_url)
        except (subprocess.CalledProcessError, HTTPError, URLError) as exc:
            skipped_rooms.append(room)
            print(f"[{position}/{total}] skipped room {room}: {exc}")
            continue

        room_cache_path(room).write_text(dump, encoding="utf-8")
        entries = parse_schedule_dump(dump, room=room, source_url=url)
        all_entries.extend(entries)
        print(f"[{position}/{total}] cached room {room}: {len(entries)} classes")

    save_cached_entries(all_entries)
    if skipped_rooms:
        print(f"Skipped {len(skipped_rooms)} room(s): {', '.join(skipped_rooms)}")
    return all_entries


def ensure_entries_loaded(refresh: bool = False, base_url: str = DEFAULT_BASE_URL) -> list[ScheduleEntry]:
    if refresh:
        return update_cache(load_room_list(), base_url=base_url)

    entries = load_cached_entries()
    if entries:
        return entries

    print("Cache is empty, fetching schedules first...")
    return update_cache(load_room_list(), base_url=base_url)


def record_matches(entry: ScheduleEntry, *, room: str | None, teacher: str | None, subject: str | None) -> bool:
    blob = entry.search_text()
    if room and normalize_text(room) not in normalize_text(entry.room):
        return False
    if teacher and normalize_text(teacher) not in blob:
        return False
    if subject and normalize_text(subject) not in blob:
        return False
    return True


def search_entries(
    entries: Iterable[ScheduleEntry],
    *,
    room: str | None = None,
    teacher: str | None = None,
    subject: str | None = None,
) -> list[ScheduleEntry]:
    matches = [
        entry
        for entry in entries
        if record_matches(entry, room=room, teacher=teacher, subject=subject)
    ]
    return sorted(matches, key=lambda item: (item.room, DAY_NAMES.index(item.day), item.period, item.subject, item.teacher))


def format_entry(entry: ScheduleEntry) -> str:
    teacher_bits = [entry.teacher]
    if entry.lesson_type:
        teacher_bits.append(f"({entry.lesson_type})")
    teacher_display = " ".join(bit for bit in teacher_bits if bit).strip()
    detail_display = " / ".join(entry.details) if entry.details else ""
    return " | ".join(
        part
        for part in [
            entry.room,
            entry.day,
            f"{entry.period}-р",
            entry.subject,
            teacher_display,
            detail_display,
        ]
        if part
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Fetch and search SICT classroom schedules.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Schedule page URL template.")

    subparsers = parser.add_subparsers(dest="command")

    update_parser = subparsers.add_parser("update", help="Fetch all classrooms and refresh the local cache.")

    search_parser = subparsers.add_parser("search", help="Search cached schedules.")
    search_parser.add_argument("--classroom", "--class", dest="room", help="Filter by classroom number.")
    search_parser.add_argument("--teacher", help="Filter by teacher name.")
    search_parser.add_argument("--subject", help="Filter by subject code or name.")
    search_parser.add_argument("--refresh", action="store_true", help="Refresh the cache before searching.")

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "update":
        rooms = load_room_list()
        update_cache(rooms, base_url=args.base_url)
        print(f"Saved {len(rooms)} rooms to {INDEX_FILE}")
        return 0

    if args.command == "search":
        entries = ensure_entries_loaded(refresh=args.refresh, base_url=args.base_url)
        matches = search_entries(entries, room=args.room, teacher=args.teacher, subject=args.subject)
        if not matches:
            print("No matches.")
            return 0

        for entry in matches:
            print(format_entry(entry))
        print(f"{len(matches)} match(es)")
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())