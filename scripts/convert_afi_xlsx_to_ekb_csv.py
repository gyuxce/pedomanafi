#!/usr/bin/env python3
"""Convert the AFI Tier 1 workbook into a reviewable EKB import CSV.

The converter keeps the source row reference, excludes archive sheets by default,
and marks incomplete content as Draft/Perlu diperiksa instead of dropping it.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable

from openpyxl import load_workbook


STANDARD_SHEETS = {
    "Akulaku Paylater (Internal)": "Akulaku Paylater (Internal)",
    "Openpay (Online)": "Openpay (Online)",
    "Openpay (Offline)": "Openpay (Offline)",
    "Akulaku Paylater Di Toko (AFI A": "Akulaku Paylater Di Toko",
    "Cicilan Motor Listrik": "Cicilan Motor Listrik",
    "Lazada PayLater": "Lazada PayLater",
    "TikTok PayLater ": "TikTok PayLater",
    "General": "General",
}

ARCHIVE_SHEETS = {
    "Akulaku Elite Card": ("Akulaku Elite Card", 4),
    "Auto Loan": ("Auto Loan", 3),
}

OUTPUT_COLUMNS = [
    "title",
    "product",
    "category",
    "ticket_subtype",
    "condition",
    "probing_livechat",
    "script_livechat",
    "script_callcenter",
    "agent_steps",
    "crm_status",
    "escalation_team",
    "warning",
    "resolution_type",
    "priority",
    "important_update",
    "content_status",
    "needs_review",
    "review_reason",
    "source_sheet",
    "source_type",
    "source_row",
    "source_variant",
    "duplicate_count",
]


def clean(value: object) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n").strip()
    text = re.sub(r"[ \t]+\n", "\n", text)
    return text


def compact_key(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def has_value(*values: str) -> bool:
    return any(value.strip() for value in values)


def has_transfer_marker(*values: str) -> bool:
    text = " ".join(compact_key(value) for value in values)
    return "transfer" in text and "asi" in text


def first_meaningful_line(text: str) -> str:
    for line in text.splitlines():
        line = re.sub(r"^[\s\-–—•]+", "", line).strip()
        if line and not line.lower().startswith(("kondisi:", "status di console:", "link:")):
            return line
    return ""


def make_title(condition: str, subtype: str, resolution: str) -> str:
    title = first_meaningful_line(condition) or subtype or "Pedoman tanpa judul"
    title = re.sub(r"\s+", " ", title).strip()
    suffix = f" — {resolution}" if resolution in {"Selesai di Tier 1", "Eskalasi Tier 2/3"} else ""
    max_base_length = 140 - len(suffix)
    if len(title) > max_base_length:
        title = title[: max_base_length - 3].rstrip() + "..."
    return f"{title}{suffix}"


def extract_team(*values: str) -> str:
    """Extract only a clear team phrase; keep ambiguous free text in CRM status."""
    for value in values:
        match = re.search(r"(?:result|hasil|eskalasi)[^\n]{0,80}?(?:ke|kepada)\s+([^\n.]+)", value, re.I)
        if match:
            return re.sub(r"\s+", " ", match.group(1)).strip(" :-")
    return ""


def new_record(
    *,
    product: str,
    category: str,
    subtype: str,
    condition: str,
    live_script: str,
    call_script: str,
    agent_steps: str,
    crm_status: str,
    escalation_team: str,
    warning: str,
    resolution: str,
    priority: str,
    source_sheet: str,
    source_row: int,
    source_variant: str,
    source_type: str,
) -> dict[str, str]:
    if not subtype:
        subtype = "Belum dikategorikan"
    probing = condition
    reasons: list[str] = []
    if subtype == "Belum dikategorikan":
        reasons.append("Sub tipe tiket kosong")
    if not condition:
        reasons.append("Kondisi pelanggan kosong")
    if not live_script and resolution != "Transfer ke ASI":
        reasons.append("Skrip Live Chat kosong")
    if not agent_steps and resolution not in {"Referensi saja", "Transfer ke ASI"}:
        reasons.append("Langkah agent kosong")
    if resolution == "Referensi saja":
        reasons.append("Jenis tindakan belum dapat ditentukan dari sumber")
    if compact_key(subtype) in {"lain-lain", "lain lain", "-"}:
        reasons.append("Sub tipe masih umum")

    return {
        "title": make_title(condition, subtype, resolution),
        "product": product,
        "category": category,
        "ticket_subtype": subtype,
        "condition": condition,
        "probing_livechat": probing,
        "script_livechat": live_script,
        "script_callcenter": call_script,
        "agent_steps": agent_steps,
        "crm_status": crm_status,
        "escalation_team": escalation_team or extract_team(agent_steps, crm_status),
        "warning": warning,
        "resolution_type": resolution,
        "priority": priority,
        "important_update": "Tidak",
        "content_status": "Draft",
        "needs_review": "Ya" if reasons else "Tidak",
        "review_reason": "; ".join(dict.fromkeys(reasons)),
        "source_sheet": source_sheet,
        "source_row": str(source_row),
        "source_variant": source_variant,
        "source_type": source_type,
        "duplicate_count": "1",
    }


def standard_variants(
    *,
    product: str,
    source_sheet: str,
    source_row: int,
    category: str,
    subtype: str,
    condition: str,
    live_script: str,
    call_script: str,
    tier1_steps: str,
    tier1_status: str,
    tier2_steps: str,
    tier2_status: str,
    warning: str = "",
    escalation_team: str = "",
    priority: str = "Normal",
    source_type: str = "standard",
    force_resolution: str = "",
) -> list[dict[str, str]]:
    if force_resolution:
        return [
            new_record(
                product=product,
                category=category,
                subtype=subtype,
                condition=condition,
                live_script=live_script,
                call_script=call_script,
                agent_steps=tier1_steps or tier2_steps,
                crm_status=tier1_status or tier2_status,
                escalation_team=escalation_team,
                warning=warning,
                resolution=force_resolution,
                priority=priority,
                source_sheet=source_sheet,
                source_row=source_row,
                source_variant=compact_key(force_resolution).replace(" ", "_"),
                source_type=source_type,
            )
        ]

    if has_transfer_marker(live_script, call_script, tier1_steps, tier1_status, tier2_steps, tier2_status):
        return [
            new_record(
                product=product,
                category=category,
                subtype=subtype,
                condition=condition,
                live_script=live_script,
                call_script=call_script,
                agent_steps=tier1_steps or tier2_steps,
                crm_status=tier1_status or tier2_status,
                escalation_team=escalation_team,
                warning=warning,
                resolution="Transfer ke ASI",
                priority="Low",
                source_sheet=source_sheet,
                source_row=source_row,
                source_variant="transfer",
                source_type=source_type,
            )
        ]

    records: list[dict[str, str]] = []
    if has_value(tier1_steps, tier1_status):
        records.append(
            new_record(
                product=product,
                category=category,
                subtype=subtype,
                condition=condition,
                live_script=live_script,
                call_script=call_script,
                agent_steps=tier1_steps,
                crm_status=tier1_status,
                escalation_team=escalation_team,
                warning=warning,
                resolution="Selesai di Tier 1",
                priority=priority,
                source_sheet=source_sheet,
                source_row=source_row,
                source_variant="tier1",
                source_type=source_type,
            )
        )
    if has_value(tier2_steps, tier2_status):
        records.append(
            new_record(
                product=product,
                category=category,
                subtype=subtype,
                condition=condition,
                live_script=live_script,
                call_script=call_script,
                agent_steps=tier2_steps,
                crm_status=tier2_status,
                escalation_team=escalation_team,
                warning=warning,
                resolution="Eskalasi Tier 2/3",
                priority=priority,
                source_sheet=source_sheet,
                source_row=source_row,
                source_variant="escalation",
                source_type=source_type,
            )
        )
    if not records:
        records.append(
            new_record(
                product=product,
                category=category,
                subtype=subtype,
                condition=condition,
                live_script=live_script,
                call_script=call_script,
                agent_steps="",
                crm_status="",
                escalation_team=escalation_team,
                warning=warning,
                resolution="Referensi saja",
                priority=priority,
                source_sheet=source_sheet,
                source_row=source_row,
                source_variant="reference",
                source_type=source_type,
            )
        )
    return records


def read_standard_sheet(ws, product: str, start_row: int, source_type: str) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    last_category = ""
    last_subtype = ""
    for row_number, row in enumerate(ws.iter_rows(min_row=start_row, max_col=9, values_only=True), start_row):
        values = [clean(value) for value in row]
        if not any(values):
            continue
        if values[0]:
            last_category = values[0]
        else:
            values[0] = last_category
        if values[1]:
            last_subtype = values[1]
        else:
            values[1] = last_subtype
        records.extend(
            standard_variants(
                product=product,
                source_sheet=ws.title,
                source_row=row_number,
                category=values[0],
                subtype=values[1],
                condition=values[2],
                live_script=values[3],
                call_script=values[4],
                tier1_steps=values[5],
                tier1_status=values[6],
                tier2_steps=values[7],
                tier2_status=values[8],
                source_type=source_type,
            )
        )
    return records


def read_special_sheets(wb) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []

    ws = wb["OJK Special Case"]
    for row_number, row in enumerate(ws.iter_rows(min_row=3, max_col=9, values_only=True), 3):
        values = [clean(value) for value in row]
        if not any(values):
            continue
        records.extend(
            standard_variants(
                product=values[0] or "General",
                category="OJK Special Case",
                subtype=values[1],
                condition=values[2],
                live_script=values[3],
                call_script=values[4],
                tier1_steps=values[5],
                tier1_status=values[6],
                tier2_steps=values[7],
                tier2_status=values[8],
                priority="Special Case",
                source_sheet=ws.title,
                source_row=row_number,
                source_type="special_ojk",
            )
        )

    ws = wb[" Transfer chatcall ke ASI"]
    for row_number, row in enumerate(ws.iter_rows(min_row=3, max_col=7, values_only=True), 3):
        values = [clean(value) for value in row]
        if not any(values):
            continue
        records.extend(
            standard_variants(
                product="General",
                category="Transfer Chat/Call ke ASI",
                subtype="Transfer chat/call ke ASI",
                condition=values[1],
                live_script=values[5],
                call_script=values[6],
                tier1_steps=values[2],
                tier1_status="",
                tier2_steps="",
                tier2_status="",
                warning=values[3],
                priority="Low",
                source_sheet=ws.title,
                source_row=row_number,
                source_type="special_transfer",
                force_resolution="Transfer ke ASI",
            )
        )

    ws = wb["Special TreatmentReminder"]
    for row_number, row in enumerate(ws.iter_rows(min_row=3, max_col=6, values_only=True), 3):
        values = [clean(value) for value in row]
        if not any(values):
            continue
        warning = "\n\n".join(value for value in (values[4], values[5]) if value)
        records.extend(
            standard_variants(
                product="General",
                category="Special Treatment",
                subtype="Special Treatment",
                condition=values[1],
                live_script="",
                call_script="",
                tier1_steps="",
                tier1_status="",
                tier2_steps=values[2],
                tier2_status="",
                warning=warning,
                escalation_team=values[3],
                priority="Special Case",
                source_sheet=ws.title,
                source_row=row_number,
                source_type="special_treatment",
            )
        )

    ws = wb["Anomali TicketCase"]
    for row_number, row in enumerate(ws.iter_rows(min_row=2, max_col=3, values_only=True), 2):
        values = [clean(value) for value in row]
        if not any(values):
            continue
        records.append(
            new_record(
                product="General",
                category="Anomali Ticket/Case",
                subtype=f"Anomali {values[0]}" if values[0] else "Anomali Ticket/Case",
                condition=values[1],
                live_script="",
                call_script="",
                agent_steps=values[2],
                crm_status="",
                escalation_team="",
                warning="",
                resolution="Referensi saja",
                priority="Special Case",
                source_sheet=ws.title,
                source_row=row_number,
                source_variant="reference",
                source_type="special_anomaly",
            )
        )

    ws = wb["Other App Contact"]
    for row_number, row in enumerate(ws.iter_rows(min_row=2, max_col=2, values_only=True), 2):
        values = [clean(value) for value in row]
        if not any(values):
            continue
        platform = values[0] or "Platform lain"
        records.append(
            new_record(
                product="General",
                category="Kontak / Referensi",
                subtype=f"Kontak {platform}",
                condition=f"Informasi kontak {platform}",
                live_script="",
                call_script="",
                agent_steps="",
                crm_status="",
                escalation_team="",
                warning="",
                resolution="Referensi saja",
                priority="Normal",
                source_sheet=ws.title,
                source_row=row_number,
                source_variant="reference",
                source_type="other_contact",
            )
        )
        records[-1]["warning"] = values[1]
        records[-1]["needs_review"] = "Tidak"
        records[-1]["review_reason"] = ""
    return records


def deduplicate(records: Iterable[dict[str, str]]) -> list[dict[str, str]]:
    groups: defaultdict[tuple[str, ...], list[dict[str, str]]] = defaultdict(list)
    key_fields = ("product", "category", "ticket_subtype", "condition", "script_livechat", "resolution_type")
    for record in records:
        groups[tuple(compact_key(record[field]) for field in key_fields)].append(record)

    output: list[dict[str, str]] = []
    for group in groups.values():
        record = dict(group[0])
        record["duplicate_count"] = str(len(group))
        if len(group) > 1:
            record["needs_review"] = "Ya"
            existing = [part for part in (record["review_reason"], "Duplikat persis sumber") if part]
            record["review_reason"] = "; ".join(existing)
        output.append(record)
    return output


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Path workbook AFI .xlsx")
    parser.add_argument("--output", required=True, type=Path, help="Path CSV hasil bulk import")
    parser.add_argument("--include-archived", action="store_true", help="Sertakan sheet produk tersembunyi/arsip sebagai Draft")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    workbook = load_workbook(args.input, read_only=True, data_only=True)
    records: list[dict[str, str]] = []

    for sheet_name, product in STANDARD_SHEETS.items():
        if sheet_name in workbook.sheetnames:
            records.extend(read_standard_sheet(workbook[sheet_name], product, 4, "standard"))

    if args.include_archived:
        for sheet_name, (product, start_row) in ARCHIVE_SHEETS.items():
            if sheet_name in workbook.sheetnames:
                records.extend(read_standard_sheet(workbook[sheet_name], product, start_row, "archived"))

    records.extend(read_special_sheets(workbook))
    records = deduplicate(records)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(records)

    report = {
        "input": str(args.input),
        "output": str(args.output),
        "rows_output": len(records),
        "rows_needing_review": sum(record["needs_review"] == "Ya" for record in records),
        "duplicate_rows_collapsed": sum(max(int(record["duplicate_count"]) - 1, 0) for record in records),
        "by_source_type": dict(Counter(record["source_type"] for record in records)),
        "by_resolution": dict(Counter(record["resolution_type"] for record in records)),
        "archives_included": args.include_archived,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
