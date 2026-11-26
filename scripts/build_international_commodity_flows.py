#!/usr/bin/env python3
"""Build reproducible multi-year (2020-2024) bilateral international commodity flow bundles.

Combines three authoritative public international trade ledgers, keeping each collection's
publisher provenance, native physical units, and non-imputation rules explicit:
1. UN Comtrade HS annual customs exports (cached/acquired via public v1 API):
   - trade_crude_oil (HS 2709)
   - trade_lng (HS 271111)
   - trade_copper (HS 2603 ores/concentrates, HS 7403 refined cathodes)
   - trade_battery_metals (HS 283691, 282520 lithium; HS 2605, 8105 cobalt; HS 7501, 7502 nickel)
   - trade_wheat (HS 1001)
2. UN FAOSTAT Detailed Trade Matrix (TM, bilateral agricultural export quantities & values):
   - trade_maize (Item 56 Maize)
   - trade_rice (Items 31 milled rice, 28 husked rice, 32 broken rice, 27 paddy rice)
   - trade_soybeans (Items 236 soya beans, 238 soya bean cake, 237 soya bean oil)
   - trade_coffee (Items 656 green coffee, 657 roasted/decaffeinated coffee)
3. CEPII BACI (reconciled UN Comtrade HS17 bilateral flows, 2020-2024):
   - trade_fertilizers (HS 3102 nitrogenous, 3103 phosphatic, 3104 potassic, 3105 mixed NPK/DAP/MAP)
"""
from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
PUBLIC = PROJECT / "public-source"
OUT_DIR = PUBLIC / "data" / "commodity-flows"
CACHE_DIR = PROJECT / "qa" / "comtrade_acquisition_cache"
RAW_TMP = Path("/tmp/pink_sheet_raw")

API_BASE = "https://comtradeapi.un.org/public/v1/preview/C/A/HS"
YEARS = ["2020", "2021", "2022", "2023", "2024"]

COMTRADE_SPECS = [
    {
        "id": "trade_crude_oil",
        "title": "Crude petroleum · international customs exports",
        "description": "Multi-year bilateral customs export panel (HS 2709) across leading reporting exporters and global partner areas, 2020–2024.",
        "cmds": [("2709", "Petroleum oils and oils obtained from bituminous minerals, crude")],
        "top_reporters": 16,
    },
    {
        "id": "trade_lng",
        "title": "Liquefied natural gas (LNG) · international customs exports",
        "description": "Multi-year bilateral customs export panel (HS 271111) across LNG-exporting reporters and partner areas, 2020–2024.",
        "cmds": [("271111", "Natural gas, liquefied (LNG)")],
        "top_reporters": 16,
    },
    {
        "id": "trade_copper",
        "title": "Copper (ores & refined cathodes) · international customs exports",
        "description": "Multi-year bilateral customs export panel distinguishing copper ores/concentrates (HS 2603) and refined unwrought copper (HS 7403), 2020–2024.",
        "cmds": [
            ("2603", "Copper ores and concentrates"),
            ("7403", "Refined copper and copper alloys, unwrought"),
        ],
        "top_reporters": 14,
    },
    {
        "id": "trade_battery_metals",
        "title": "Critical battery metals (lithium, cobalt & nickel) · international customs exports",
        "description": "Multi-year bilateral customs export panel across lithium carbonate/hydroxide, cobalt ores/mattes/metal, and nickel mattes/unwrought metal, 2020–2024. Separate product stages are retained.",
        "cmds": [
            ("283691", "Lithium carbonates"),
            ("282520", "Lithium oxide and hydroxide"),
            ("2605", "Cobalt ores and concentrates"),
            ("8105", "Cobalt mattes, intermediates and cobalt metal"),
            ("7501", "Nickel mattes and nickel oxide sinters"),
            ("7502", "Unwrought nickel"),
        ],
        "top_reporters": 12,
    },
    {
        "id": "trade_wheat",
        "title": "Wheat and meslin · international customs exports",
        "description": "Multi-year bilateral customs export panel (HS 1001) across major wheat-exporting reporters and partner areas, 2020–2024.",
        "cmds": [("1001", "Wheat and meslin")],
        "top_reporters": 16,
    },
]

FAO_TM_SPECS = [
    {
        "id": "trade_maize",
        "title": "Maize (corn) · bilateral agricultural exports",
        "description": "Multi-year bilateral export flows (FAOSTAT Detailed Trade Matrix, Item 56) across major maize-exporting countries and partner areas, 2020–2024.",
        "items": {"56": "Maize (corn)"},
        "top_reporters": 18,
    },
    {
        "id": "trade_rice",
        "title": "Rice · bilateral agricultural exports",
        "description": "Multi-year bilateral export flows (FAOSTAT Detailed Trade Matrix) distinguishing milled rice, husked rice, broken rice and paddy rice across major exporters, 2020–2024.",
        "items": {
            "31": "Rice, milled",
            "28": "Rice, husked (brown)",
            "32": "Rice, broken",
            "27": "Rice, paddy",
        },
        "top_reporters": 18,
    },
    {
        "id": "trade_soybeans",
        "title": "Soybeans, meal & oil · bilateral agricultural exports",
        "description": "Multi-year bilateral export flows (FAOSTAT Detailed Trade Matrix) across whole soya beans, soya bean cake/meal and soya bean oil, 2020–2024.",
        "items": {
            "236": "Soya beans",
            "238": "Cake/meal of soya beans",
            "237": "Soya bean oil",
        },
        "top_reporters": 15,
    },
    {
        "id": "trade_coffee",
        "title": "Coffee · bilateral agricultural exports",
        "description": "Multi-year bilateral export flows (FAOSTAT Detailed Trade Matrix) distinguishing green coffee beans and roasted/decaffeinated coffee, 2020–2024.",
        "items": {
            "656": "Coffee, green",
            "657": "Coffee, roasted or decaffeinated",
        },
        "top_reporters": 18,
    },
]

COMTRADE_LIMITATIONS = [
    "Country/area customs totals do not identify producing mines/farms, end customers, intermediate transshipment hubs or physical shipping routes.",
    "Exporting reporter is not automatically the country of extraction or cultivation; re-exports and refining hubs appear as customs reporters.",
    "World reference totals (partnerCode=0) are retained in auxiliary records but excluded from graph edges and sums.",
    "Only exact source ISO3 matches join retained world map polygons; special customs/partner areas remain unmapped in tables and CSV/JSON exports.",
    "Physical net weight (kg) and FOB export value (current USD) are separate native measures; unreported quantities remain null rather than zero.",
]

FAO_LIMITATIONS = [
    "FAOSTAT Detailed Trade Matrix records bilateral exports reported by national statistical offices; re-exports through port hubs appear under the reporting exporter.",
    "Quantities are retained in native metric tonnes (t) and export values in current USD (converted cleanly from FAOSTAT's 1,000 USD reporting unit without rounding).",
    "Missing or not-applicable FAOSTAT cells ('M') remain null rather than zero; source flags ('A', 'E', 'I', 'T') are preserved on every edge and record.",
    "Only exact country ISO3 matches join retained world map polygons; unspecified partner areas remain preserved in tables and downloads.",
]

BACI_LIMITATIONS = [
    "CEPII BACI reconciles bilateral UN Comtrade HS declarations (harmonizing CIF importer and FOB exporter reports into consistent FOB USD values and metric tons).",
    "Separate fertilizer classes — nitrogenous (HS 3102), phosphatic (HS 3103), potassic (HS 3104) and mixed NPK/DAP/MAP (HS 3105) — remain selectable individually in the Material filter.",
    "Bilateral country totals reflect customs origins and destinations, not mine-head ownership, farm-level application or shipping lane geometry.",
]


def sha256_bytes(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def fetch_comtrade(params: dict) -> tuple[str, bytes, dict]:
    qs = urllib.parse.urlencode(params, safe=",")
    url = f"{API_BASE}?{qs}"
    cache_key = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24] + ".json"
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / cache_key
    if cache_file.exists():
        raw = cache_file.read_bytes()
        return url, raw, json.loads(raw)

    for attempt in range(5):
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 PEL-Comtrade-Builder/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=35) as resp:
                raw = resp.read()
                parsed = json.loads(raw)
                cache_file.write_bytes(raw)
                time.sleep(1.35)
                return url, raw, parsed
        except urllib.error.HTTPError as e:
            if e.code == 429:
                retry_after = float(e.headers.get("Retry-After") or 3.2)
                time.sleep(max(2.5, retry_after + 0.5))
                continue
            body = e.read().decode("utf-8", "ignore")
            raise RuntimeError(f"HTTP {e.code} for {url}: {body[:200]}") from e
    raise RuntimeError(f"Failed to fetch {url}")


def fetch_untruncated_batch(reporters: list[int], year: str, cmds: list[str]) -> list[tuple[str, bytes, list[dict]]]:
    params = {
        "reporterCode": ",".join(str(r) for r in reporters),
        "period": year,
        "flowCode": "X",
        "cmdCode": ",".join(cmds),
        "partner2Code": "0",
        "customsCode": "C00",
        "motCode": "0",
        "includeDesc": "true",
    }
    url, raw, payload = fetch_comtrade(params)
    rows = payload.get("data") or []
    if len(rows) < 480:
        return [(url, raw, rows)]
    if len(cmds) > 1:
        mid = len(cmds) // 2
        return fetch_untruncated_batch(reporters, year, cmds[:mid]) + fetch_untruncated_batch(reporters, year, cmds[mid:])
    if len(reporters) > 1:
        mid = len(reporters) // 2
        return fetch_untruncated_batch(reporters[:mid], year, cmds) + fetch_untruncated_batch(reporters[mid:], year, cmds)
    return [(url, raw, rows)]


def load_lookups() -> tuple[dict[int, dict], dict[str, dict], dict[int, str], set[str]]:
    world_geo = json.loads((PUBLIC / "workbench/data/map-geometry/world.json").read_text())
    valid_geo_ids = {str(f["id"]) for f in world_geo["features"]}

    comtrade_areas: dict[int, dict] = {}
    m49_to_iso: dict[int, str] = {}
    for ref_path in [RAW_TMP / "comtrade_partners.json", RAW_TMP / "comtrade_reporters.json"]:
        if ref_path.exists():
            items = json.loads(ref_path.read_text()).get("results", [])
            for item in items:
                try:
                    cid = int(item["id"])
                except (KeyError, ValueError, TypeError):
                    continue
                iso = (item.get("partnerCodeIsoAlpha3") or item.get("reporterCodeIsoAlpha3") or "").strip().upper()
                text = (item.get("text") or "").strip()
                if cid not in comtrade_areas or (iso and not comtrade_areas[cid].get("iso3")):
                    comtrade_areas[cid] = {"name": text, "iso3": iso or None}
                if len(iso) == 3 and iso not in {"W00", "NES", "S19"}:
                    m49_to_iso[cid] = iso
    comtrade_areas[842] = {"name": "USA", "iso3": "USA"}
    m49_to_iso[840] = "USA"

    wi = json.loads((PUBLIC / "data/wheat-weather/wheat-index.json").read_text())
    fao_areas = {str(k): {"name": v.get("name", str(k)), "iso3": v.get("iso3")} for k, v in wi.get("areas", {}).items()}
    return comtrade_areas, fao_areas, m49_to_iso, valid_geo_ids


def write_bundle_and_entry(cid: str, spec_title: str, spec_desc: str, present_years: list[str], metrics: list[dict],
                           sources: list[dict], nodes: list[dict], edges: list[dict], records: list[dict],
                           limitations: list[str], time_sem: str, geo_scope: str) -> dict:
    default_year = "2024" if "2024" in present_years else (present_years[-1] if present_years else "2023")
    bundle = {
        "schema": "ridgeway.pipeline/v1",
        "id": cid,
        "title": spec_title,
        "description": spec_desc,
        "years": present_years,
        "default_year": default_year,
        "default_metric": "quantity",
        "metrics": metrics,
        "sources": sources,
        "nodes": nodes,
        "edges": edges,
        "records": records,
        "limitations": limitations,
        "geographic_scope": geo_scope,
        "time_semantics": time_sem,
    }
    raw_json = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    gz_bytes = gzip.compress(raw_json, compresslevel=9, mtime=0)
    gz_name = f"{cid}.json.gz"
    (OUT_DIR / gz_name).write_bytes(gz_bytes)
    print(f"  -> Wrote {gz_name}: {len(gz_bytes):,} B ({len(nodes)} nodes, {len(edges):,} edges, {len(records):,} records, years={present_years})", flush=True)
    return {
        "id": cid,
        "title": spec_title,
        "description": spec_desc,
        "years": present_years,
        "default_year": default_year,
        "default_metric": "quantity",
        "metrics": metrics,
        "time_semantics": time_sem,
        "geographic_scope": geo_scope,
        "file": gz_name,
        "url": f"/data/commodity-flows/{gz_name}",
        "bytes": len(gz_bytes),
        "sha256": sha256_bytes(gz_bytes),
        "decoded_bytes": len(raw_json),
        "decoded_sha256": sha256_bytes(raw_json),
        "nodes": len(nodes),
        "edges": len(edges),
        "records": len(records),
        "default_focus": "all",
        "default_direction": "either",
    }


def build_comtrade_collections(comtrade_areas: dict[int, dict], valid_geo_ids: set[str], raw_zip_entries: dict[str, bytes]) -> list[dict]:
    observed_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    entries = []

    for spec in COMTRADE_SPECS:
        cid = spec["id"]
        cmd_dict = dict(spec["cmds"])
        cmd_codes = [c for c, _ in spec["cmds"]]
        print(f"=== [UN Comtrade] {cid} ===", flush=True)

        reporter_totals: dict[int, float] = {}
        for disc_year in ["2023", "2024"]:
            _, _, p_world = fetch_comtrade({
                "period": disc_year,
                "cmdCode": ",".join(cmd_codes),
                "flowCode": "X",
                "partnerCode": "0",
                "partner2Code": "0",
                "customsCode": "C00",
                "motCode": "0",
                "includeDesc": "true",
            })
            w_rows = p_world.get("data") or []
            if len(w_rows) >= 480:
                w_rows = []
                for cc in cmd_codes:
                    _, _, p_cc = fetch_comtrade({
                        "period": disc_year,
                        "cmdCode": cc,
                        "flowCode": "X",
                        "partnerCode": "0",
                        "partner2Code": "0",
                        "customsCode": "C00",
                        "motCode": "0",
                        "includeDesc": "true",
                    })
                    w_rows.extend(p_cc.get("data") or [])
            for r in w_rows:
                rc = int(r["reporterCode"])
                iso = (r.get("reporterISO") or comtrade_areas.get(rc, {}).get("iso3") or "").strip().upper()
                if rc == 0 or not iso or iso in {"W00", "EUR", "EU2", "NES", "X1", "XX", "S19"} or len(iso) != 3:
                    continue
                v = r.get("fobvalue") if r.get("fobvalue") is not None else r.get("primaryValue")
                reporter_totals[rc] = reporter_totals.get(rc, 0.0) + (float(v) if v is not None else 0.0)

        ranked_reporters = [rc for rc, _ in sorted(reporter_totals.items(), key=lambda kv: (-kv[1], kv[0]))[: spec["top_reporters"]]]
        batch_size = 5 if len(cmd_codes) == 1 else 3
        rep_batches = [ranked_reporters[i: i + batch_size] for i in range(0, len(ranked_reporters), batch_size)]

        sources = []
        all_rows = []
        call_seq = 0
        for yr in YEARS:
            for rb in rep_batches:
                for url, raw, rows in fetch_untruncated_batch(rb, yr, cmd_codes):
                    call_seq += 1
                    sid = f"comtrade_{cid}_{yr}_b{call_seq:03d}"
                    raw_zip_entries[f"{sid}.json"] = raw
                    sources.append({
                        "id": sid,
                        "title": f"UN Comtrade {cid} customs exports · {yr} (batch {call_seq})",
                        "url": url,
                        "upstream_url": url,
                        "sha256": sha256_bytes(raw),
                        "observed_as_of": observed_date,
                        "license": "UN Comtrade public data; retain reporter/classification/estimation flags and UN attribution",
                        "period_basis": "Annual customs exports, current USD FOB; net weight kilograms; reporting/revision vintage retained",
                        "truncated": False,
                    })
                    for r in rows:
                        all_rows.append((sid, r))

        nodes_map: dict[str, dict] = {}
        edges = []
        records = []

        def ensure_node(area_code: int, desc_hint, iso_hint, stage: str, sid: str) -> str:
            nid = f"un_comtrade_area:{area_code}"
            if nid not in nodes_map:
                ref = comtrade_areas.get(area_code, {})
                iso = (iso_hint or ref.get("iso3") or "").strip().upper() or None
                iso_country = None if (iso in {"W00", "NES", "XX", "X1", "S19"} or (iso and len(iso) != 3)) else iso
                geo_id = "KOS" if iso_country == "XKX" else (iso_country if iso_country in valid_geo_ids else None)
                if area_code == 842:
                    iso_country = "USA"
                    geo_id = "USA" if "USA" in valid_geo_ids else None
                label = (desc_hint or ref.get("name") or f"Area {area_code}").strip()
                nodes_map[nid] = {
                    "id": nid,
                    "label": label,
                    "type": "customs_area",
                    "scope": "world",
                    "geo_id": geo_id,
                    "country_iso3": iso_country,
                    "country_name": label if iso_country else None,
                    "source_iso_code": iso,
                    "state": None,
                    "lat": None,
                    "lon": None,
                    "physical_location": False,
                    "map_eligible": bool(geo_id),
                    "source_area_code": area_code,
                    "stage": stage,
                    "source_id": sid,
                    "record_ids": [],
                    "raw_fields": {"comtrade_area_code": area_code, "source_name": label, "source_iso": iso},
                }
            return nid

        all_rows.sort(key=lambda t: (str(t[1].get("period")), int(t[1].get("reporterCode", 0)), int(t[1].get("partnerCode", 0)), str(t[1].get("cmdCode", ""))))
        seen = set()
        for sid, r in all_rows:
            yr = str(r.get("period") or r.get("refYear") or "")
            if yr not in YEARS:
                continue
            rc = int(r["reporterCode"])
            pc = int(r["partnerCode"])
            cmd_code = str(r.get("cmdCode") or cmd_codes[0]).strip()
            cmd_label = cmd_dict.get(cmd_code) or r.get("cmdDesc") or f"HS {cmd_code}"
            dk = (yr, rc, pc, cmd_code)
            if dk in seen:
                continue
            seen.add(dk)

            rec_idx = len(records)
            rec_id = f"{cid}:record:{rec_idx}"
            records.append({
                "id": rec_id,
                "record_type": "customs_trade_record",
                "source_id": sid,
                "source_row": f"records[{rec_idx}]",
                "raw_fields": {
                    "period": yr,
                    "cmd_code": cmd_code,
                    "cmd_desc": r.get("cmdDesc") or cmd_label,
                    "reporter_code": rc,
                    "reporter_iso": r.get("reporterISO"),
                    "reporter_desc": r.get("reporterDesc"),
                    "partner_code": pc,
                    "partner_iso": r.get("partnerISO"),
                    "partner_desc": r.get("partnerDesc"),
                    "net_wgt": r.get("netWgt"),
                    "fob_value": r.get("fobvalue"),
                    "primary_value": r.get("primaryValue"),
                },
            })
            if pc == 0 or pc == rc:
                continue

            from_id = ensure_node(rc, r.get("reporterDesc"), r.get("reporterISO"), "Customs origin area", sid)
            to_id = ensure_node(pc, r.get("partnerDesc"), r.get("partnerISO"), "Customs destination area", sid)
            nodes_map[from_id]["record_ids"].append(rec_id)
            nodes_map[to_id]["record_ids"].append(rec_id)

            w = r.get("netWgt")
            qty = None if w is None else float(w)
            if qty == 0.0 and (r.get("qtyUnitCode") == -1) and (r.get("primaryValue") or 0) > 0:
                qty = None
            v = r.get("fobvalue") if r.get("fobvalue") is not None else r.get("primaryValue")
            val = None if v is None else float(v)

            edges.append({
                "id": f"{cid}:edge:{len(edges) + 1}",
                "from_id": from_id,
                "to_id": to_id,
                "year": yr,
                "quantity": qty,
                "unit": "kg",
                "value_usd": val,
                "commodity_id": f"HS:{cmd_code}",
                "commodity_label": f"HS {cmd_code} · {cmd_label}",
                "evidence_type": "country_customs_export",
                "stage_from": "Customs reporter",
                "stage_to": "Customs partner",
                "sector": cmd_label,
                "transport": "TOTAL MOT",
                "source_id": sid,
                "source_row": f"records[{rec_idx}]",
                "record_ids": [rec_id],
                "flags": {"is_net_wgt_estimated": bool(r.get("isNetWgtEstimated")), "flow_code": "X"},
            })

        present_years = sorted({e["year"] for e in edges})
        metrics = [
            {"id": "quantity", "label": "Reported customs net weight", "unit": "kg", "field": "quantity", "additive": True},
            {"id": "value_usd", "label": "Reported export value, FOB", "unit": "current USD", "field": "value_usd", "additive": True},
        ]
        entries.append(write_bundle_and_entry(
            cid, spec["title"], spec["description"], present_years, metrics, sources,
            list(nodes_map.values()), edges, records, COMTRADE_LIMITATIONS,
            f"Annual UN Comtrade HS customs export panels ({present_years[0]}–{present_years[-1]}). Unreported weights stay null; World totals stay out of bilateral sums.",
            "Reporting customs areas to bilateral statistical partner areas worldwide",
        ))
    return entries


def build_faostat_tm_collections(fao_areas: dict[str, dict], m49_to_iso: dict[int, str], valid_geo_ids: set[str], raw_zip_entries: dict[str, bytes]) -> list[dict]:
    print("=== [FAOSTAT Detailed Trade Matrix] Streaming 2020–2024 crop export flows ===", flush=True)
    tm_zip_path = RAW_TMP / "Trade_DetailedTradeMatrix_E_All_Data_(Normalized).zip"
    observed_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    wanted_items = {}
    for spec in FAO_TM_SPECS:
        for ic in spec["items"]:
            wanted_items[ic] = spec["id"]

    # Map (cid) -> (yr, rc, pc, ic) -> {"qty": val, "qty_flag": f, "val_usd": val, "val_flag": f, "r_name": ..., "p_name": ..., "r_m49": ..., "p_m49": ...}
    paired_cells: dict[str, dict[tuple[str, str, str, str], dict]] = {s["id"]: {} for s in FAO_TM_SPECS}

    with zipfile.ZipFile(tm_zip_path) as zf:
        csv_name = [n for n in zf.namelist() if n.endswith("All_Data_(Normalized).csv")][0]
        with zf.open(csv_name) as fh:
            reader = csv.DictReader(io.TextIOWrapper(fh, encoding="latin-1"))
            for row in reader:
                ic = row["Item Code"].strip()
                if ic not in wanted_items:
                    continue
                yr = row["Year"].strip()
                if yr not in YEARS:
                    continue
                ec = row["Element Code"].strip()
                # 5910 = Export quantity (t), 5922 = Export value (1000 USD)
                if ec not in {"5910", "5922"}:
                    continue
                rc = row["Reporter Country Code"].strip()
                pc = row["Partner Country Code"].strip()
                if rc == pc:
                    continue
                # Exclude FAO aggregate reporter/partner codes >= 5000 or 351 (China aggregate; 41 = China mainland)
                try:
                    rc_i, pc_i = int(rc), int(pc)
                except ValueError:
                    continue
                if rc_i >= 5000 or pc_i >= 5000 or rc_i == 351 or pc_i == 351:
                    continue

                cid = wanted_items[ic]
                key = (yr, rc, pc, ic)
                cell = paired_cells[cid].get(key)
                if cell is None:
                    cell = {
                        "r_name": row["Reporter Countries"].strip(),
                        "p_name": row["Partner Countries"].strip(),
                        "r_m49": row.get("Reporter Country Code (M49)", "").strip().lstrip("'"),
                        "p_m49": row.get("Partner Country Code (M49)", "").strip().lstrip("'"),
                        "qty": None,
                        "qty_flag": "",
                        "val_usd": None,
                        "val_flag": "",
                    }
                    paired_cells[cid][key] = cell

                raw_v = row.get("Value", "").strip()
                flag = row.get("Flag", "").strip()
                val = None
                if raw_v and flag != "M":
                    try:
                        vf = float(raw_v)
                        if math.isfinite(vf):
                            val = vf
                    except ValueError:
                        val = None
                if ec == "5910":
                    cell["qty"] = val
                    cell["qty_flag"] = flag
                else:
                    # 5922 unit is 1000 USD -> exact current USD
                    cell["val_usd"] = None if val is None else round(val * 1000.0, 2)
                    cell["val_flag"] = flag

    def resolve_fao_iso(code_str: str, m49_str: str) -> str | None:
        if code_str == "41":
            return "CHN"
        iso = fao_areas.get(code_str, {}).get("iso3")
        if not iso and m49_str.isdigit():
            iso = m49_to_iso.get(int(m49_str))
        return iso if (iso and len(iso) == 3) else None

    entries = []
    for spec in FAO_TM_SPECS:
        cid = spec["id"]
        cells = paired_cells[cid]
        # Rank top exporting reporters across 2020-2024 so bundle stays crisp & fast in browser
        rep_totals: dict[str, float] = defaultdict(float)
        for (yr, rc, pc, ic), cell in cells.items():
            rep_totals[rc] += cell["val_usd"] or (cell["qty"] or 0.0)
        top_reps = {rc for rc, _ in sorted(rep_totals.items(), key=lambda kv: (-kv[1], kv[0]))[: spec["top_reporters"]]}

        sid = f"faostat_tm_{cid}_2020_2024"
        csv_slice = io.StringIO()
        cw = csv.writer(csv_slice)
        cw.writerow(["year", "reporter_code", "reporter_name", "partner_code", "partner_name", "item_code", "export_tonnes", "qty_flag", "export_usd", "val_flag"])

        nodes_map: dict[str, dict] = {}
        edges = []
        records = []

        def ensure_fao_node(code_str: str, name_str: str, m49_str: str, stage: str) -> str:
            nid = f"faostat_area:{code_str}"
            if nid not in nodes_map:
                iso = resolve_fao_iso(code_str, m49_str)
                geo_id = "KOS" if iso == "XKX" else (iso if iso in valid_geo_ids else None)
                clean_label = fao_areas.get(code_str, {}).get("name") or name_str
                nodes_map[nid] = {
                    "id": nid,
                    "label": clean_label,
                    "type": "country",
                    "scope": "world",
                    "geo_id": geo_id,
                    "country_iso3": iso,
                    "country_name": clean_label if iso else None,
                    "source_iso_code": iso,
                    "state": None,
                    "lat": None,
                    "lon": None,
                    "physical_location": False,
                    "map_eligible": bool(geo_id),
                    "source_area_code": int(code_str),
                    "stage": stage,
                    "source_id": sid,
                    "record_ids": [],
                    "raw_fields": {"faostat_area_code": int(code_str), "m49": m49_str, "source_name": name_str, "iso3": iso},
                }
            return nid

        for (yr, rc, pc, ic), cell in sorted(cells.items()):
            if rc not in top_reps:
                continue
            if cell["qty"] is None and cell["val_usd"] is None:
                continue
            # Skip tiny zero-both rows to keep graph clean while retaining genuine 0 where value/qty reported
            if (cell["qty"] == 0 and (cell["val_usd"] in (0, None))):
                continue

            item_label = spec["items"][ic]
            cw.writerow([yr, rc, cell["r_name"], pc, cell["p_name"], ic,
                         "" if cell["qty"] is None else cell["qty"], cell["qty_flag"],
                         "" if cell["val_usd"] is None else cell["val_usd"], cell["val_flag"]])

            rec_idx = len(records)
            rec_id = f"{cid}:record:{rec_idx}"
            records.append({
                "id": rec_id,
                "record_type": "faostat_bilateral_export",
                "source_id": sid,
                "source_row": f"records[{rec_idx}]",
                "raw_fields": {
                    "year": yr,
                    "reporter_code": int(rc),
                    "reporter_name": cell["r_name"],
                    "partner_code": int(pc),
                    "partner_name": cell["p_name"],
                    "item_code": int(ic),
                    "item": item_label,
                    "export_tonnes": cell["qty"],
                    "qty_flag": cell["qty_flag"],
                    "export_usd": cell["val_usd"],
                    "val_flag": cell["val_flag"],
                },
            })

            from_id = ensure_fao_node(rc, cell["r_name"], cell["r_m49"], "Reporting exporting country")
            to_id = ensure_fao_node(pc, cell["p_name"], cell["p_m49"], "Reported partner country")
            nodes_map[from_id]["record_ids"].append(rec_id)
            nodes_map[to_id]["record_ids"].append(rec_id)

            edges.append({
                "id": f"{cid}:edge:{len(edges) + 1}",
                "from_id": from_id,
                "to_id": to_id,
                "year": yr,
                "quantity": cell["qty"],
                "unit": "tonnes",
                "value_usd": cell["val_usd"],
                "commodity_id": f"FAO:{ic}",
                "commodity_label": f"FAO {ic} · {item_label}",
                "evidence_type": "faostat_bilateral_export",
                "stage_from": "Reporting exporter",
                "stage_to": "Reported destination",
                "sector": item_label,
                "transport": "All modes",
                "source_id": sid,
                "source_row": f"records[{rec_idx}]",
                "record_ids": [rec_id],
                "flags": {"qty_flag": cell["qty_flag"], "val_flag": cell["val_flag"]},
            })

        slice_bytes = csv_slice.getvalue().encode("utf-8")
        raw_zip_entries[f"{sid}.csv"] = slice_bytes
        sources = [{
            "id": sid,
            "title": f"FAOSTAT Detailed Trade Matrix (TM) · {spec['title']} (2020–2024)",
            "url": "https://www.fao.org/faostat/en/#data/TM",
            "upstream_url": "https://bulks-faostat.fao.org/production/Trade_DetailedTradeMatrix_E_All_Data_(Normalized).zip",
            "sha256": sha256_bytes(slice_bytes),
            "observed_as_of": observed_date,
            "license": "FAOSTAT Open Data Licensing Policy (CC BY 4.0); retain FAO attribution and observation flags",
            "period_basis": "Annual bilateral exports; physical weight in metric tonnes (Element 5910) and value in current USD (Element 5922 × 1,000)",
        }]
        present_years = sorted({e["year"] for e in edges})
        metrics = [
            {"id": "quantity", "label": "Reported export quantity", "unit": "tonnes", "field": "quantity", "additive": True},
            {"id": "value_usd", "label": "Reported export value", "unit": "current USD", "field": "value_usd", "additive": True},
        ]
        entries.append(write_bundle_and_entry(
            cid, spec["title"], spec["description"], present_years, metrics, sources,
            list(nodes_map.values()), edges, records, FAO_LIMITATIONS,
            f"Annual FAOSTAT Detailed Trade Matrix export records ({present_years[0]}–{present_years[-1]}). Missing cells ('M') remain null.",
            "Reporting exporting countries to bilateral partner countries/areas worldwide",
        ))
    return entries


def build_baci_fertilizers(valid_geo_ids: set[str], raw_zip_entries: dict[str, bytes]) -> dict:
    cid = "trade_fertilizers"
    print(f"=== [CEPII BACI / UN Comtrade Reconciled] {cid} ===", flush=True)
    observed_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    hs_labels = {
        "63102": ("3102", "Mineral or chemical fertilizers, nitrogenous (HS 3102)"),
        "63103": ("3103", "Mineral or chemical fertilizers, phosphatic (HS 3103)"),
        "63104": ("3104", "Mineral or chemical fertilizers, potassic (HS 3104)"),
        "63105": ("3105", "Mixed NPK, DAP & MAP fertilizers (HS 3105)"),
    }
    url = (
        "https://api-v2.oec.world/tesseract/data.jsonrecords?"
        "cube=trade_i_baci_a_17&drilldowns=Year,Exporter+Country,Importer+Country,HS4"
        "&measures=Trade+Value,Quantity&Year=2020,2021,2022,2023,2024&HS4=63102,63103,63104,63105"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 PEL-Fertilizer-Builder/1.0"})
    raw = urllib.request.urlopen(req, timeout=60).read()
    payload = json.loads(raw)
    all_data = payload.get("data") or []
    print(f"  Fetched {len(all_data):,} BACI bilateral fertilizer rows (2020–2024)", flush=True)

    # Rank top 18 fertilizer exporting countries across 2020-2024
    exp_totals: dict[str, float] = defaultdict(float)
    for r in all_data:
        exp_id = str(r["Exporter Country ID"])
        exp_totals[exp_id] += float(r.get("Trade Value") or 0.0)
    top_exporters = {eid for eid, _ in sorted(exp_totals.items(), key=lambda kv: (-kv[1], kv[0]))[:18]}

    filtered = [r for r in all_data if str(r["Exporter Country ID"]) in top_exporters]
    sid = "baci_hs17_fertilizers_2020_2024"
    filtered_bytes = json.dumps(filtered, separators=(",", ":")).encode("utf-8")
    raw_zip_entries[f"{sid}.json"] = filtered_bytes

    sources = [{
        "id": sid,
        "title": "CEPII BACI (UN Comtrade HS17 reconciled) · Fertilizers HS 3102–3105 (2020–2024)",
        "url": "http://www.cepii.fr/CEPII/en/bdd_modele/presentation.asp?id=37",
        "upstream_url": url,
        "sha256": sha256_bytes(filtered_bytes),
        "observed_as_of": observed_date,
        "license": "CEPII BACI / UN Comtrade public trade statistics; retain CEPII & UN Comtrade attribution",
        "period_basis": "Annual reconciled bilateral trade flows (2020–2024); physical quantity in metric tonnes and value in current USD FOB",
    }]

    nodes_map: dict[str, dict] = {}
    edges = []
    records = []

    def ensure_baci_node(baci_id: str, name_str: str, stage: str) -> str:
        nid = f"baci_country:{baci_id}"
        if nid not in nodes_map:
            iso = baci_id[-3:].upper() if len(baci_id) >= 5 else None
            if iso in {"XXA", "XXB", "WLD", "NES"}:
                iso = None
            geo_id = "KOS" if iso == "XKX" else (iso if iso in valid_geo_ids else None)
            nodes_map[nid] = {
                "id": nid,
                "label": name_str,
                "type": "country",
                "scope": "world",
                "geo_id": geo_id,
                "country_iso3": iso,
                "country_name": name_str if iso else None,
                "source_iso_code": iso,
                "state": None,
                "lat": None,
                "lon": None,
                "physical_location": False,
                "map_eligible": bool(geo_id),
                "stage": stage,
                "source_id": sid,
                "record_ids": [],
                "raw_fields": {"baci_id": baci_id, "country_name": name_str, "iso3": iso},
            }
        return nid

    filtered.sort(key=lambda r: (int(r["Year"]), str(r["Exporter Country ID"]), str(r["Importer Country ID"]), str(r["HS4 ID"])))
    for r in filtered:
        yr = str(r["Year"])
        if yr not in YEARS:
            continue
        exp_id = str(r["Exporter Country ID"])
        imp_id = str(r["Importer Country ID"])
        if exp_id == imp_id:
            continue
        hs_raw = str(r["HS4 ID"])
        hs_code, hs_desc = hs_labels.get(hs_raw, (hs_raw, str(r.get("HS4") or hs_raw)))
        q_raw = r.get("Quantity")
        v_raw = r.get("Trade Value")
        qty = round(float(q_raw), 3) if (q_raw is not None and math.isfinite(float(q_raw))) else None
        val = round(float(v_raw), 2) if (v_raw is not None and math.isfinite(float(v_raw))) else None

        rec_idx = len(records)
        rec_id = f"{cid}:record:{rec_idx}"
        records.append({
            "id": rec_id,
            "record_type": "baci_reconciled_trade_record",
            "source_id": sid,
            "source_row": f"records[{rec_idx}]",
            "raw_fields": {
                "year": yr,
                "exporter_id": exp_id,
                "exporter": r["Exporter Country"],
                "importer_id": imp_id,
                "importer": r["Importer Country"],
                "hs4": hs_code,
                "hs4_label": hs_desc,
                "quantity_tonnes": qty,
                "trade_value_usd": val,
            },
        })

        from_id = ensure_baci_node(exp_id, str(r["Exporter Country"]), "Exporting country")
        to_id = ensure_baci_node(imp_id, str(r["Importer Country"]), "Importing partner country")
        nodes_map[from_id]["record_ids"].append(rec_id)
        nodes_map[to_id]["record_ids"].append(rec_id)

        edges.append({
            "id": f"{cid}:edge:{len(edges) + 1}",
            "from_id": from_id,
            "to_id": to_id,
            "year": yr,
            "quantity": qty,
            "unit": "tonnes",
            "value_usd": val,
            "commodity_id": f"HS:{hs_code}",
            "commodity_label": hs_desc,
            "evidence_type": "baci_reconciled_bilateral_trade",
            "stage_from": "Exporting economy",
            "stage_to": "Importing economy",
            "sector": hs_desc,
            "transport": "All modes",
            "source_id": sid,
            "source_row": f"records[{rec_idx}]",
            "record_ids": [rec_id],
            "flags": {"revision": "HS17"},
        })

    present_years = sorted({e["year"] for e in edges})
    metrics = [
        {"id": "quantity", "label": "Reconciled bilateral quantity", "unit": "tonnes", "field": "quantity", "additive": True},
        {"id": "value_usd", "label": "Reconciled bilateral value, FOB", "unit": "current USD", "field": "value_usd", "additive": True},
    ]
    return write_bundle_and_entry(
        cid,
        "Mineral & chemical fertilizers (N, P, K & NPK) · bilateral trade flows",
        "Multi-year bilateral trade flows (CEPII BACI / UN Comtrade HS 3102–3105) across nitrogenous, phosphatic, potassic and mixed NPK/DAP/MAP fertilizers, 2020–2024.",
        present_years, metrics, sources, list(nodes_map.values()), edges, records, BACI_LIMITATIONS,
        f"Annual CEPII BACI (UN Comtrade HS17) reconciled bilateral flows ({present_years[0]}–{present_years[-1]}). Unreported weights stay null.",
        "Exporting economies to bilateral importing partner economies worldwide",
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    comtrade_areas, fao_areas, m49_to_iso, valid_geo_ids = load_lookups()
    raw_zip_entries: dict[str, bytes] = {}

    manifest_collections = []
    manifest_collections.extend(build_comtrade_collections(comtrade_areas, valid_geo_ids, raw_zip_entries))
    manifest_collections.extend(build_faostat_tm_collections(fao_areas, m49_to_iso, valid_geo_ids, raw_zip_entries))
    manifest_collections.append(build_baci_fertilizers(valid_geo_ids, raw_zip_entries))

    raw_zip_path = OUT_DIR / "comtrade-raw-sources.zip"
    with zipfile.ZipFile(raw_zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for fn, blob in sorted(raw_zip_entries.items()):
            zi = zipfile.ZipInfo(fn, (2026, 11, 25, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(zi, blob, compresslevel=9)

    manifest = {
        "schema": "public-evidence.supplemental-pipelines/v1",
        "prepared_utc": datetime.now(timezone.utc).isoformat(),
        "raw_sources_archive": {
            "url": "/data/commodity-flows/comtrade-raw-sources.zip",
            "bytes": raw_zip_path.stat().st_size,
            "sha256": sha256_bytes(raw_zip_path.read_bytes()),
            "files": len(raw_zip_entries),
        },
        "collections": manifest_collections,
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"COMPLETE: {len(manifest_collections)} bilateral commodity flow collections written to {OUT_DIR}", flush=True)


if __name__ == "__main__":
    main()
