#!/usr/bin/env python3
"""Build the 26 November 2026 Critical Metals & Border-Reporting Source Register (2020-2025).

Integrates all four verified research packets compiled on 26 November 2026 into:
1. `public-source/data/commodities/metals-2020-2025/` — archived unmodified source packets,
   workbook, PDFs and SHA-256 manifest.
2. `public-source/data/commodities/critical-metals-register.json` & `.csv.gz` — structured
   machine-readable register for `commodities.html?lens=metals-audit`:
   - BGS World Mineral Production 2020-24 (cobalt mine output & recovery notes; lithium
     carbonate product weight vs. Li metal content, kept strictly non-additive).
   - Chile COCHILCO copper (mine, concentrates, SX-EW cathodes, smelter, electrorefined,
     fire-refined dashes, refined total across Dec 2024 & Sept 2026 bulletins, 2005-2024
     yearbook and BGS) & DR Congo CTCPM Table 35 monthly/annual Copper, Cobalt & Zinc
     exports (15/15 monthly sums within 0.02 t; 5 dashed 2024 zinc months kept null;
     2024 Ministry index vs. Table 35 vs. BGS preserved side by side).
   - Chile lithium carbonate (2020-2025): COCHILCO production & 33-destination physical
     exports (+ Otros) vs. UN Comtrade HS 283691 net weight.
   - Argentina & Chile bilateral border-reporting audit (2020-2025, 356 route-year pairs):
     exporter-reported vs. foreign importer-reported net weights + Argentina INDEC monthly
     mining production (72 months; 41 confidential 's' months kept null; 2023 7/12 months
     never summed to a national annual total).
   - Argentina INDEC COMEX national customs (NCM 28369100, 2020-2025, 87 destination rows):
     published named weights + confidential destination code 999 reconciled to 0.001 kg and
     USD 0.01 against INDEC queries, preserving withheld 's' rows and s1-s10 FOB bands.
3. Three supplemental 2020-2025 bilateral flow bundles in `public-source/data/commodity-flows/`
   registered in `manifest.json` for 3D Flow Globe inspection in `workbench/pipelines.html`:
   - `trade_lithium_arg_chl_perspectives` (exporter vs. foreign importer border perspectives)
   - `trade_lithium_chile_cochilco` (COCHILCO physical tonnes vs. UN Comtrade net tonnes)
   - `trade_lithium_argentina_indec` (INDEC NCM 28369100 published routes + withheld 's' + unmapped code 999)
"""
from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import math
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

PROJECT = Path(__file__).resolve().parents[1]
PUBLIC = PROJECT / "public-source"
COMMODITIES_DIR = PUBLIC / "data" / "commodities"
METALS_ARCHIVE_DIR = COMMODITIES_DIR / "metals-2020-2025"
FLOW_DIR = PUBLIC / "data" / "commodity-flows"

CODEX_NOV26 = Path("/Users/yorek_mac/Documents/Codex/2026-11-26/new-chat-3")
TMP_WORKBOOK = Path("/tmp/pel_metals_2020_2025.xlsx")

ISO2_TO_ISO3 = {
    "AR": "ARG", "AT": "AUT", "AU": "AUS", "AZ": "AZE", "BA": "BIH", "BE": "BEL",
    "BG": "BGR", "BO": "BOL", "BR": "BRA", "BY": "BLR", "CA": "CAN", "CH": "CHE",
    "CL": "CHL", "CN": "CHN", "CO": "COL", "CZ": "CZE", "DE": "DEU", "DK": "DNK",
    "EC": "ECU", "EE": "EST", "EG": "EGY", "ES": "ESP", "FI": "FIN", "FR": "FRA",
    "GB": "GBR", "HK": "HKG", "HR": "HRV", "ID": "IDN", "IE": "IRL", "IN": "IND",
    "IS": "ISL", "IT": "ITA", "JM": "JAM", "JO": "JOR", "JP": "JPN", "KR": "KOR",
    "KW": "KWT", "KZ": "KAZ", "LB": "LBN", "LK": "LKA", "MA": "MAR", "MD": "MDA",
    "MX": "MEX", "MY": "MYS", "NL": "NLD", "NO": "NOR", "NZ": "NZL", "PE": "PER",
    "PH": "PHL", "PL": "POL", "PT": "PRT", "PY": "PRY", "QA": "QAT", "RS": "SRB",
    "RU": "RUS", "SA": "SAU", "SE": "SWE", "SG": "SGP", "SI": "SVN", "SK": "SVK",
    "TH": "THA", "TR": "TUR", "TT": "TTO", "TW": "TWN", "UA": "UKR", "US": "USA",
    "UY": "URY", "VE": "VEN", "VN": "VNM", "ZA": "ZAF",
}


def sha256_bytes(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def clean_float(val, ndigits: int | None = None) -> float | None:
    if val is None or val == "":
        return None
    f = float(val)
    if not math.isfinite(f):
        return None
    if f == 0.0:
        return 0.0
    return round(f, ndigits) if ndigits is not None else f


def stage_source_packets() -> dict[str, dict]:
    METALS_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    to_stage = [
        ("Chile_lithium_carbonate_2020-2025.zip", CODEX_NOV26 / "Chile_lithium_carbonate_2020-2025.zip",
         "COCHILCO production (1996-2025) & destination exports (2002-2025) paired with UN Comtrade HS 283691 (2020-2025)."),
        ("Argentina_Chile_lithium_carbonate_2020-2025.zip", CODEX_NOV26 / "Argentina_Chile_lithium_carbonate_2020-2025.zip",
         "Two-country annual & 356 bilateral route-year exporter/importer UN Comtrade responses + INDEC monthly production workbook."),
        ("Argentina_lithium_carbonate_customs_2020-2025.zip", CODEX_NOV26 / "Argentina_lithium_carbonate_customs_2020-2025.zip",
         "INDEC COMEX annual export extracts (NCM 28369100), 12 portal query responses, source guides, annual/destination CSVs and SHA-256 manifest."),
        ("Argentina_lithium_trade_map_2024.pdf", CODEX_NOV26 / "Argentina_lithium_trade_map_2024.pdf",
         "Reference 2024 side-by-side map contrasting Argentina's 1 named Comtrade export destination vs. 24 foreign importer reports."),
        ("Argentina_lithium_carbonate_customs_2020-2025.pdf", CODEX_NOV26 / "Argentina_lithium_carbonate_customs_2020-2025.pdf",
         "Reference 2020-2025 stacked bar chart of Argentina INDEC published destination weights vs. confidential code 999."),
        ("metals_statistics_2020-2025.xlsx", TMP_WORKBOOK,
         "11-tab workbook (Chile copper & lithium, DR Congo CTCPM monthly/annual copper/cobalt/zinc, Argentina INDEC production & customs, BGS 2020-24)."),
    ]
    archived = {}
    for filename, src_path, desc in to_stage:
        dest = METALS_ARCHIVE_DIR / filename
        if not dest.exists():
            if not src_path.exists():
                raise FileNotFoundError(f"Required source artifact missing: {dest} (staging source {src_path} not found)")
            shutil.copy2(src_path, dest)
        raw = dest.read_bytes()
        archived[filename] = {
            "file": filename,
            "url": f"/data/commodities/metals-2020-2025/{filename}",
            "bytes": len(raw),
            "sha256": sha256_bytes(raw),
            "description": desc,
        }
    return archived


def parse_workbook_and_packets() -> dict:
    wb = openpyxl.load_workbook(METALS_ARCHIVE_DIR / "metals_statistics_2020-2025.xlsx", data_only=True)

    # 1. Data tab (272 rows: DRC monthly/annual copper/cobalt/zinc + Chile copper stages/vintages)
    data_rows_raw = [r for r in wb["Data"].iter_rows(values_only=True) if any(x is not None for x in r)]
    national_series = []
    for r in data_rows_raw[1:]:
        iso3, period, freq, metal, measure, src_val, src_unit, tonnes, status, src_id, locator = r[:11]
        # Preserve publisher dashes ('-', '—') or blanks strictly as None!
        val_num = clean_float(src_val, 6) if isinstance(src_val, (int, float)) else None
        tonnes_num = clean_float(tonnes, 6) if isinstance(tonnes, (int, float)) else None
        national_series.append({
            "iso3": str(iso3).strip(),
            "period": str(period).strip(),
            "frequency": str(freq).strip(),
            "metal": str(metal).strip(),
            "measure": str(measure).strip(),
            "source_value": val_num,
            "source_unit": str(src_unit or "").strip(),
            "tonnes": tonnes_num,
            "status": str(status or "").strip(),
            "source_id": str(src_id or "").strip(),
            "locator": str(locator or "").strip(),
        })

    # Verify 2024 DRC Zinc has 7 numeric months and 5 dashed null months
    drc_zinc_2024_m = [x for x in national_series if x["iso3"] == "COD" and x["frequency"] == "Monthly" and x["metal"] == "Zinc" and x["period"].startswith("2024-")]
    assert len(drc_zinc_2024_m) == 12
    assert sum(1 for x in drc_zinc_2024_m if x["tonnes"] is not None) == 7
    assert sum(1 for x in drc_zinc_2024_m if x["tonnes"] is None) == 5

    # 2. Sources tab
    src_rows_raw = [r for r in wb["Sources"].iter_rows(values_only=True) if any(x is not None for x in r)]
    sources_register = [
        {
            "source_id": str(r[0]).strip(),
            "publication": str(r[1]).strip(),
            "table_or_file": str(r[2]).strip(),
            "use": str(r[3]).strip(),
            "url": str(r[4]).strip(),
            "status": str(r[5]).strip(),
        }
        for r in src_rows_raw[1:]
    ]

    # 3. Checks tab (DRC monthly vs printed annual)
    chk_rows_raw = [r for r in wb["Checks"].iter_rows(values_only=True) if any(x is not None for x in r)]
    drc_checks = []
    for r in chk_rows_raw[1:]:
        yr = int(float(r[0]))
        diff = clean_float(r[5], 4)
        assert diff is not None and abs(diff) <= 0.025, f"DRC check exceeded 0.02 t: {r}"
        drc_checks.append({
            "year": yr,
            "metal": str(r[1]).strip(),
            "numeric_months": int(r[2]),
            "sum_numeric_months_t": clean_float(r[3], 4),
            "printed_annual_t": clean_float(r[4], 4),
            "difference_t": diff,
            "source_id": str(r[6]).strip(),
        })
    assert len(drc_checks) == 15

    # 4. BGS World Mineral Production 2020-24 selected series (from 26 Nov checkpoint doc & BGS24)
    bgs_selected = {
        "years": [2020, 2021, 2022, 2023, 2024],
        "source_url": "https://nora.nerc.ac.uk/id/eprint/541620/1/WMP_2020%20to%202024.pdf",
        "series": [
            {
                "id": "bgs-cod-cobalt-mine",
                "iso3": "COD",
                "country": "DR Congo",
                "commodity": "Cobalt (mine production)",
                "basis": "metal content",
                "unit": "tonnes",
                "page": "Printed p. 15 (PDF p. 25)",
                "values": [86591, 93144, 115371, 140121, 200253],
                "flags": ["", "", "", "", ""],
                "note": "BGS notes national cobalt series may measure recovered metal or metal contained in ore.",
            },
            {
                "id": "bgs-idn-cobalt-mine",
                "iso3": "IDN",
                "country": "Indonesia",
                "commodity": "Cobalt (mine production)",
                "basis": "metal content",
                "unit": "tonnes",
                "page": "Printed p. 15 (PDF p. 25)",
                "values": [1000, 2100, 9500, 21600, 31570],
                "flags": ["*", "*", "*", "", "*"],
                "note": "Asterisk (*) denotes a British Geological Survey estimate.",
            },
            {
                "id": "bgs-chl-lithium-carbonate",
                "iso3": "CHL",
                "country": "Chile",
                "commodity": "Lithium minerals · Carbonate",
                "basis": "carbonate product weight",
                "unit": "tonnes",
                "page": "Printed p. 44 (PDF p. 54)",
                "values": [114260, 150348, 201950, 220256, 250605],
                "flags": ["", "", "", "", ""],
                "non_additive_with": "bgs-chl-lithium-content",
                "note": "Product weight of lithium carbonate. Never sum with the Li-content row, which describes the same output on an elemental-lithium basis.",
            },
            {
                "id": "bgs-chl-lithium-content",
                "iso3": "CHL",
                "country": "Chile",
                "commodity": "Lithium minerals · Li content in carbonate",
                "basis": "elemental Li content",
                "unit": "tonnes Li",
                "page": "Printed p. 44 (PDF p. 54)",
                "values": [21481, 28265, 37967, 41408, 47114],
                "flags": ["", "", "", "", ""],
                "non_additive_with": "bgs-chl-lithium-carbonate",
                "note": "Elemental lithium contained in Chile's carbonate output (~18.8% Li by mass). Never add to carbonate product weight.",
            },
            {
                "id": "bgs-arg-lithium-carbonate",
                "iso3": "ARG",
                "country": "Argentina",
                "commodity": "Lithium minerals · Carbonate",
                "basis": "carbonate product weight",
                "unit": "tonnes",
                "page": "Printed p. 44 (PDF p. 54)",
                "values": [26846, 47917, 35046, 47764, 81000],
                "flags": ["", "", "", "", "*"],
                "note": "2024 figure (81,000 t) is a BGS estimate (*), compared alongside INDEC's 64,806.9 t provisional national figure.",
            },
        ],
    }

    # 5. Chile Lithium Carbonate packet (2020-2025)
    with zipfile.ZipFile(METALS_ARCHIVE_DIR / "Chile_lithium_carbonate_2020-2025.zip") as z_chl:
        chl_annual = []
        for r in csv.DictReader(io.StringIO(z_chl.read("annual.csv").decode("utf-8"))):
            chl_annual.append({
                "year": int(r["year"]),
                "production_cochilco_t": clean_float(r["production_cochilco_t"], 4),
                "exports_cochilco_t": clean_float(r["exports_cochilco_t"], 4),
                "exports_comtrade_net_t": clean_float(r["exports_comtrade_net_t"], 4),
                "export_gap_t": clean_float(r["export_gap_t"], 4),
                "gap_fraction_of_comtrade": clean_float(r["gap_fraction_of_comtrade"], 6),
                "china_share_cochilco": clean_float(r["china_share_cochilco"], 6),
                "china_share_comtrade": clean_float(r["china_share_comtrade"], 6),
                "production_bgs_t": clean_float(r["production_bgs_t"], 4),
                "exports_cochilco_yearbook_t": clean_float(r["exports_cochilco_yearbook_t"], 4),
            })
        chl_destinations = []
        for r in csv.DictReader(io.StringIO(z_chl.read("destinations.csv").decode("utf-8"))):
            est_raw = r["comtrade_net_weight_estimated"]
            est = True if est_raw == "True" else (False if est_raw == "False" else None)
            chl_destinations.append({
                "year": int(r["year"]),
                "reporter_iso3": r["reporter_iso3"],
                "partner_iso3": r["partner_iso3"] or None,
                "cochilco_destination": r["cochilco_destination"],
                "cochilco_exports_t": clean_float(r["cochilco_exports_t"], 4),
                "comtrade_net_kg": clean_float(r["comtrade_net_kg"], 3),
                "comtrade_net_t": clean_float(r["comtrade_net_t"], 6),
                "cochilco_minus_comtrade_t": clean_float(r["cochilco_minus_comtrade_t"], 4),
                "share_cochilco": clean_float(r["share_cochilco"], 6),
                "share_comtrade": clean_float(r["share_comtrade"], 6),
                "comtrade_partner_code": int(r["comtrade_partner_code"]) if r["comtrade_partner_code"] else None,
                "comtrade_destination": r["comtrade_destination"] or None,
                "comtrade_net_weight_estimated": est,
                "cochilco_cell": r["cochilco_cell"],
            })

    # 6. Argentina & Chile Bilateral Border-Reporting packet (2020-2025)
    with zipfile.ZipFile(METALS_ARCHIVE_DIR / "Argentina_Chile_lithium_carbonate_2020-2025.zip") as z_ac:
        ac_annual = []
        for r in csv.DictReader(io.StringIO(z_ac.read("annual.csv").decode("utf-8"))):
            ac_annual.append({
                "year": int(r["year"]),
                "origin_iso3": r["origin_iso3"],
                "national_production_t": clean_float(r["national_production_t"], 4),
                "national_status": r["national_status"],
                "bgs_production_t": clean_float(r["bgs_production_t"], 4),
                "bgs_status": r["bgs_status"] or None,
                "exporter_world_net_t": clean_float(r["exporter_world_net_t"], 4),
                "foreign_importer_sum_net_t": clean_float(r["foreign_importer_sum_net_t"], 6),
                "export_destinations_with_weight": int(r["export_destinations_with_weight"]),
                "foreign_importers_with_weight": int(r["foreign_importers_with_weight"]),
                "china_share_exporter": clean_float(r["china_share_exporter"], 6),
                "china_share_observed_imports": clean_float(r["china_share_observed_imports"], 6),
            })
        ac_routes = []
        for r in csv.DictReader(io.StringIO(z_ac.read("routes.csv").decode("utf-8"))):
            ex_est = True if r["export_net_estimated"] == "True" else (False if r["export_net_estimated"] == "False" else None)
            im_est = True if r["import_net_estimated"] == "True" else (False if r["import_net_estimated"] == "False" else None)
            ac_routes.append({
                "year": int(r["year"]),
                "origin_iso3": r["origin_iso3"],
                "destination_iso3": r["destination_iso3"],
                "destination_name": r["comtrade_destination_name"],
                "exporter_net_t": clean_float(r["exporter_net_t"], 6),
                "importer_net_t": clean_float(r["importer_net_t"], 6),
                "record_coverage": r["record_coverage"],
                "export_net_estimated": ex_est,
                "import_net_estimated": im_est,
            })
        arg_monthly = []
        for r in csv.DictReader(io.StringIO(z_ac.read("argentina_monthly.csv").decode("utf-8"))):
            yr, mo = int(r["year"]), int(r["month"])
            arg_monthly.append({
                "year": yr,
                "month": mo,
                "period": f"{yr}M{mo:02d}",
                "carbonate_t": clean_float(r["carbonate_t"], 6),
                "publication_status": r["publication_status"],
                "year_provisional": r["year_provisional"] == "True",
                "source_cell": r["source_cell"],
            })
        assert len(ac_routes) == 356
        assert len(arg_monthly) == 72
        assert sum(1 for m in arg_monthly if m["carbonate_t"] is None) == 41
        # 2023 Argentina annual national production must remain None (only 7/12 months disclosed)
        arg_2023_ann = next(a for a in ac_annual if a["origin_iso3"] == "ARG" and a["year"] == 2023)
        assert arg_2023_ann["national_production_t"] is None and arg_2023_ann["national_status"] == "7/12 months public"

    # 7. Argentina INDEC Customs packet (NCM 28369100, 2020-2025)
    with zipfile.ZipFile(METALS_ARCHIVE_DIR / "Argentina_lithium_carbonate_customs_2020-2025.zip") as z_cust:
        cust_annual = []
        for r in csv.DictReader(io.StringIO(z_cust.read("annual.csv").decode("utf-8"))):
            tot = clean_float(r["indec_total_net_t"], 6)
            named = clean_float(r["indec_named_net_t"], 6)
            c999 = clean_float(r["indec_confidential_999_net_t"], 6)
            assert tot is not None and named is not None and c999 is not None
            assert abs((named + c999) - tot) <= 1e-6, f"INDEC annual reconciliation failed: {r}"
            cust_annual.append({
                "year": int(r["year"]),
                "indec_total_net_t": tot,
                "indec_named_net_t": named,
                "indec_confidential_999_net_t": c999,
                "confidential_share": clean_float(r["confidential_share"], 6),
                "named_destinations_with_weight": int(r["named_destinations_with_weight"]),
                "named_destinations_weight_withheld": int(r["named_destinations_weight_withheld"]),
                "indec_total_fob_usd": clean_float(r["indec_total_fob_usd"], 2),
                "un_exporter_world_net_t": clean_float(r["un_exporter_world_net_t"], 6),
                "un_foreign_importers_sum_net_t": clean_float(r["un_foreign_importers_sum_net_t"], 6),
                "indec_minus_un_exporter_net_t": clean_float(r["indec_minus_un_exporter_net_t"], 6),
            })
        cust_destinations = []
        for r in csv.DictReader(io.StringIO(z_cust.read("destinations.csv").decode("utf-8"))):
            iso2 = (r["iso2"] or "").strip().upper() or None
            iso3 = ISO2_TO_ISO3.get(iso2) if iso2 else None
            if iso2 and not iso3:
                raise ValueError(f"Unmapped ISO2 code in INDEC destinations: {iso2}")
            wt = clean_float(r["net_weight_t"], 6)
            fob = clean_float(r["fob_usd"], 2)
            status = r["weight_status"]
            if status == "Withheld (s)":
                assert wt is None and fob is None
            cust_destinations.append({
                "year": int(r["year"]),
                "indec_code": r["indec_destination_code"],
                "destination_indec": r["destination_name_indec"],
                "iso2": iso2,
                "iso3": iso3,
                "net_weight_t": wt,
                "fob_usd": fob,
                "weight_status": status,
                "fob_band": r["fob_band"] or None,
                "expona_source_line": int(r["expona_source_line"]),
            })
        assert len(cust_destinations) == 87

    return {
        "bgs_selected_2020_2024": bgs_selected,
        "national_metal_series": national_series,
        "sources_register": sources_register,
        "drc_monthly_checks": drc_checks,
        "chile_lithium_2020_2025": {"annual": chl_annual, "destinations": chl_destinations},
        "arg_chl_border_comparison_2020_2025": {
            "annual": ac_annual,
            "routes": ac_routes,
            "argentina_monthly_production": arg_monthly,
        },
        "argentina_indec_customs_2020_2025": {
            "annual": cust_annual,
            "destinations": cust_destinations,
        },
    }


def write_pipeline_bundle(cid: str, title: str, desc: str, years: list[str], default_metric: str,
                          metrics: list[dict], sources: list[dict], nodes: list[dict], edges: list[dict],
                          records: list[dict], limitations: list[str], time_sem: str, geo_scope: str) -> dict:
    default_year = "2024" if "2024" in years else years[-1]
    bundle = {
        "schema": "ridgeway.pipeline/v1",
        "id": cid,
        "title": title,
        "description": desc,
        "years": years,
        "default_year": default_year,
        "default_metric": default_metric,
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
    (FLOW_DIR / gz_name).write_bytes(gz_bytes)
    print(f"  -> Wrote {gz_name}: {len(gz_bytes):,} B ({len(nodes)} nodes, {len(edges)} edges, years={years})", flush=True)
    return {
        "id": cid,
        "title": title,
        "description": desc,
        "years": years,
        "default_year": default_year,
        "default_metric": default_metric,
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


def build_three_lithium_flow_bundles(parsed: dict, archived: dict[str, dict]) -> list[dict]:
    world_geo = json.loads((PUBLIC / "workbench/data/map-geometry/world.json").read_text())
    valid_geo_ids = {str(f["id"]) for f in world_geo["features"]}
    country_labels = {str(f["id"]): (f.get("properties") or {}).get("name") or f.get("name") or str(f["id"]) for f in world_geo["features"]}
    ref_areas = json.loads((FLOW_DIR / "comtrade-reference-areas.json").read_text()).get("areas", {})
    for info in ref_areas.values():
        if info.get("iso3") and len(info["iso3"]) == 3 and info.get("name"):
            country_labels.setdefault(info["iso3"], info["name"])
    country_labels.update({"USA": "United States", "KOR": "South Korea", "GBR": "United Kingdom", "RUS": "Russia", "TWN": "Taiwan", "HKG": "Hong Kong SAR", "SGP": "Singapore", "BHR": "Bahrain", "VNM": "Viet Nam"})

    years = ["2020", "2021", "2022", "2023", "2024", "2025"]
    observed = "2026-11-26"
    new_entries = []

    # --- Bundle 1: Argentina & Chile Exporter vs. Foreign Importer Border Perspectives (2020-2025) ---
    cid1 = "trade_lithium_arg_chl_perspectives"
    sid1 = "arg_chl_comtrade_hs283691_2020_2025"
    sources1 = [{
        "id": sid1,
        "title": "UN Comtrade HS 283691 · Argentina & Chile exporter vs. foreign importer reports (2020–2025)",
        "url": archived["Argentina_Chile_lithium_carbonate_2020-2025.zip"]["url"],
        "upstream_url": "https://comtradeapi.un.org/public/v1/preview/C/A/HS",
        "sha256": archived["Argentina_Chile_lithium_carbonate_2020-2025.zip"]["sha256"],
        "observed_as_of": observed,
        "license": "UN Comtrade public data; retain border-perspective distinction and estimation flags",
        "period_basis": "Annual net weight in metric tonnes (kg / 1,000); exporter-reported and foreign importer-reported series kept strictly separate",
    }]
    nodes1: dict[str, dict] = {}
    edges1, records1 = [], []

    def ensure_iso_node(nmap: dict, iso3: str, label_hint: str, stage: str, sid: str) -> str:
        nid = f"country:{iso3}"
        if nid not in nmap:
            geo_id = "KOS" if iso3 == "XKX" else (iso3 if iso3 in valid_geo_ids else None)
            lbl = label_hint or country_labels.get(iso3) or iso3
            nmap[nid] = {
                "id": nid, "label": lbl, "type": "country", "scope": "world",
                "geo_id": geo_id, "country_iso3": iso3, "country_name": lbl,
                "source_iso_code": iso3, "state": None, "lat": None, "lon": None,
                "physical_location": False, "map_eligible": bool(geo_id),
                "stage": stage, "source_id": sid, "record_ids": [],
                "raw_fields": {"iso3": iso3, "name": lbl},
            }
        return nid

    origin_names = {"ARG": "Argentina", "CHL": "Chile"}
    for r in parsed["arg_chl_border_comparison_2020_2025"]["routes"]:
        yr = str(r["year"])
        orig, dest = r["origin_iso3"], r["destination_iso3"]
        dname = "Taiwan" if dest == "TWN" else r["destination_name"]
        rec_idx = len(records1)
        rec_id = f"{cid1}:record:{rec_idx}"
        records1.append({
            "id": rec_id, "record_type": "bilateral_border_comparison",
            "source_id": sid1, "source_row": f"routes[{rec_idx}]", "raw_fields": r,
        })
        from_id = ensure_iso_node(nodes1, orig, origin_names[orig], "Lithium carbonate origin", sid1)
        to_id = ensure_iso_node(nodes1, dest, dname, "Partner economy", sid1)
        nodes1[from_id]["record_ids"].append(rec_id)
        nodes1[to_id]["record_ids"].append(rec_id)
        edges1.append({
            "id": f"{cid1}:edge:{len(edges1) + 1}",
            "from_id": from_id, "to_id": to_id, "year": yr,
            "exporter_net_t": r["exporter_net_t"],
            "importer_net_t": r["importer_net_t"],
            "unit": "tonnes",
            "commodity_id": "HS:283691",
            "commodity_label": "HS 283691 · Lithium carbonate",
            "evidence_type": "bilateral_mirror_comparison",
            "stage_from": "Origin economy", "stage_to": "Destination / importing economy",
            "sector": r["record_coverage"],
            "transport": "All modes",
            "source_id": sid1, "source_row": f"routes[{rec_idx}]",
            "record_ids": [rec_id],
            "flags": {"export_net_estimated": r["export_net_estimated"], "import_net_estimated": r["import_net_estimated"]},
        })
    metrics1 = [
        {"id": "importer_net_t", "label": "Foreign importer-reported net weight (UN Comtrade)", "unit": "tonnes", "field": "importer_net_t", "additive": True},
        {"id": "exporter_net_t", "label": "Exporter-reported net weight (UN Comtrade)", "unit": "tonnes", "field": "exporter_net_t", "additive": True},
    ]
    lim1 = [
        "Switch Measure between foreign importer-reported net weight and exporter-reported net weight; the two border perspectives are never added together.",
        "In 2024, Argentina's Comtrade export record names only China (47,609 t), whereas 24 foreign importing economies report 64,840 t of Argentine-origin lithium carbonate (including USA 6,779 t, South Korea 5,888 t and Japan 4,432 t). In 2021 and 2022, Argentina had zero Comtrade export rows while 24 and 19 foreign importers reported shipments.",
        "Differences reflect INDEC confidentiality rules (code 999), transshipment/origin attribution and transit timing across borders.",
    ]
    new_entries.append(write_pipeline_bundle(
        cid1,
        "Lithium carbonate (Argentina & Chile) · exporter vs. importer border records",
        "Pairs exporter-reported and foreign importer-reported UN Comtrade net weights (HS 283691) across 356 bilateral route-years, 2020–2025.",
        years, "importer_net_t", metrics1, sources1, list(nodes1.values()), edges1, records1, lim1,
        "Annual UN Comtrade HS 283691 export and mirror-import panels (2020–2025). Absent side stays null.",
        "Argentina and Chile to reporting partner economies worldwide",
    ))

    # --- Bundle 2: Chile COCHILCO Physical Exports vs. UN Comtrade Net Weight (2020-2025) ---
    cid2 = "trade_lithium_chile_cochilco"
    sid2 = "chl_cochilco_vs_comtrade_2020_2025"
    sources2 = [{
        "id": sid2,
        "title": "Chile COCHILCO physical export volumes vs. UN Comtrade HS 283691 (2020–2025)",
        "url": archived["Chile_lithium_carbonate_2020-2025.zip"]["url"],
        "upstream_url": "https://www.cochilco.cl/web/estadisticas-mineria/",
        "sha256": archived["Chile_lithium_carbonate_2020-2025.zip"]["sha256"],
        "observed_as_of": observed,
        "license": "COCHILCO & UN Comtrade public statistics; retain publisher attribution and basis notes",
        "period_basis": "Annual lithium carbonate exports (2020–2025); COCHILCO metric tonnes and UN Comtrade net tonnes (kg / 1,000)",
    }]
    nodes2: dict[str, dict] = {}
    edges2, records2 = [], []
    chl_from = ensure_iso_node(nodes2, "CHL", "Chile", "COCHILCO / customs origin", sid2)
    nodes2["cochilco_dest:OTHER"] = {
        "id": "cochilco_dest:OTHER", "label": "Otros (COCHILCO residual group)", "type": "customs_partner_area",
        "scope": "world", "geo_id": None, "country_iso3": None, "country_name": None, "source_iso_code": None,
        "state": None, "lat": None, "lon": None, "physical_location": False, "map_eligible": False,
        "stage": "Residual destination category", "source_id": sid2, "record_ids": [],
        "raw_fields": {"cochilco_destination": "Otros"},
    }
    for r in parsed["chile_lithium_2020_2025"]["destinations"]:
        yr = str(r["year"])
        p_iso = r["partner_iso3"]
        rec_idx = len(records2)
        rec_id = f"{cid2}:record:{rec_idx}"
        records2.append({
            "id": rec_id, "record_type": "cochilco_comtrade_destination_row",
            "source_id": sid2, "source_row": f"destinations[{rec_idx}]", "raw_fields": r,
        })
        if p_iso:
            lbl = "Taiwan" if p_iso == "TWN" else (r["comtrade_destination"] or country_labels.get(p_iso) or r["cochilco_destination"])
            to_id = ensure_iso_node(nodes2, p_iso, lbl, "Export destination", sid2)
        else:
            to_id = "cochilco_dest:OTHER"
        nodes2[chl_from]["record_ids"].append(rec_id)
        nodes2[to_id]["record_ids"].append(rec_id)
        edges2.append({
            "id": f"{cid2}:edge:{len(edges2) + 1}",
            "from_id": chl_from, "to_id": to_id, "year": yr,
            "quantity": r["cochilco_exports_t"],
            "unit": "tonnes",
            "comtrade_net_t": r["comtrade_net_t"],
            "commodity_id": "HS:283691",
            "commodity_label": "HS 283691 · Lithium carbonate (Chile)",
            "evidence_type": "national_vs_un_export_ledger",
            "stage_from": "Chile", "stage_to": "Export destination",
            "sector": "Both publishers > 0" if (r["cochilco_exports_t"] or 0) > 0 and r["comtrade_net_t"] is not None else ("COCHILCO explicit zero" if r["cochilco_exports_t"] == 0 else "COCHILCO only"),
            "transport": "All modes",
            "source_id": sid2, "source_row": f"destinations[{rec_idx}]",
            "record_ids": [rec_id],
            "flags": {"cochilco_cell": r["cochilco_cell"], "comtrade_estimated": r["comtrade_net_weight_estimated"]},
        })
    metrics2 = [
        {"id": "quantity", "label": "COCHILCO physical export volume", "unit": "tonnes", "field": "quantity", "additive": True},
        {"id": "comtrade_net_t", "label": "UN Comtrade export net weight (HS 283691)", "unit": "tonnes", "field": "comtrade_net_t", "additive": True},
    ]
    lim2 = [
        "COCHILCO annual export totals exceed UN Comtrade net weight by 2.84% to 3.35% across 2020–2025; COCHILCO does not specify gross vs. net packaging weight. Choose one publisher consistently via Measure.",
        "Explicit COCHILCO zeros remain 0; absent UN Comtrade rows remain null. 'Otros' is retained in totals and tables without geographic coordinates.",
        "COCHILCO 'Taiwán' maps to ISO3 TWN and UN partner code 490 (Other Asia, nes).",
    ]
    new_entries.append(write_pipeline_bundle(
        cid2,
        "Chile lithium carbonate · COCHILCO physical exports vs. UN Comtrade",
        "Compares Chile's national COCHILCO destination export ledger (33 countries + Otros) with UN Comtrade HS 283691 net weights across 2020–2025.",
        years, "quantity", metrics2, sources2, list(nodes2.values()), edges2, records2, lim2,
        "Annual Chilean lithium carbonate exports (2020–2025). Published COCHILCO zeros stay 0; absent Comtrade rows stay null.",
        "Chile to 33 named destination economies plus COCHILCO residual category",
    ))

    # --- Bundle 3: Argentina INDEC National Customs (NCM 28369100, 2020-2025) ---
    cid3 = "trade_lithium_argentina_indec"
    sid3 = "arg_indec_ncm28369100_2020_2025"
    sources3 = [{
        "id": sid3,
        "title": "Argentina INDEC COMEX annual exports · NCM 28369100 lithium carbonate (2020–2025)",
        "url": archived["Argentina_lithium_carbonate_customs_2020-2025.zip"]["url"],
        "upstream_url": "https://comex.indec.gob.ar/#/database",
        "sha256": archived["Argentina_lithium_carbonate_customs_2020-2025.zip"]["sha256"],
        "observed_as_of": observed,
        "license": "INDEC public trade statistics; preserve statistical secrecy symbol (s) and confidential destination code 999",
        "period_basis": "Annual product-priority customs exports (expona20..25.csv), verified to 0.001 kg and USD 0.01 against INDEC COMEX queries",
    }]
    nodes3: dict[str, dict] = {}
    edges3, records3 = [], []
    arg_from = ensure_iso_node(nodes3, "ARG", "Argentina", "INDEC customs origin", sid3)
    nodes3["indec_dest:999"] = {
        "id": "indec_dest:999",
        "label": "Confidencial · INDEC code 999 (destination withheld)",
        "type": "customs_partner_area",
        "scope": "world", "geo_id": None, "country_iso3": None, "country_name": None, "source_iso_code": "999",
        "state": None, "lat": None, "lon": None, "physical_location": False, "map_eligible": False,
        "stage": "Unallocated confidential destination pool", "source_id": sid3, "record_ids": [],
        "raw_fields": {"indec_code": "999", "note": "Holds all tonnage whose individual destination weights were suppressed under statistical secrecy (s)."},
    }
    for r in parsed["argentina_indec_customs_2020_2025"]["destinations"]:
        yr = str(r["year"])
        rec_idx = len(records3)
        rec_id = f"{cid3}:record:{rec_idx}"
        records3.append({
            "id": rec_id, "record_type": "indec_customs_destination_row",
            "source_id": sid3, "source_row": f"expona:{r['expona_source_line']}", "raw_fields": r,
        })
        if r["indec_code"] == "999":
            to_id = "indec_dest:999"
        else:
            iso3 = r["iso3"]
            lbl = country_labels.get(iso3) or r["destination_indec"]
            to_id = ensure_iso_node(nodes3, iso3, lbl, "Declared customs destination", sid3)
        nodes3[arg_from]["record_ids"].append(rec_id)
        nodes3[to_id]["record_ids"].append(rec_id)
        sector_lbl = r["weight_status"] if not r["fob_band"] else f"{r['weight_status']} · FOB band {r['fob_band']}"
        edges3.append({
            "id": f"{cid3}:edge:{len(edges3) + 1}",
            "from_id": arg_from, "to_id": to_id, "year": yr,
            "quantity": r["net_weight_t"],
            "unit": "tonnes",
            "value_usd": r["fob_usd"],
            "commodity_id": "NCM:28369100",
            "commodity_label": "NCM 28369100 · Lithium carbonate (INDEC)",
            "evidence_type": "indec_national_customs_export",
            "stage_from": "Argentina (INDEC)", "stage_to": "Customs destination",
            "sector": sector_lbl,
            "transport": "All modes",
            "source_id": sid3, "source_row": f"expona:{r['expona_source_line']}",
            "record_ids": [rec_id],
            "flags": {"weight_status": r["weight_status"], "fob_band": r["fob_band"], "indec_code": r["indec_code"]},
        })
    metrics3 = [
        {"id": "quantity", "label": "INDEC export net weight (named + code 999)", "unit": "tonnes", "field": "quantity", "additive": True},
        {"id": "value_usd", "label": "INDEC export value, FOB (named + code 999)", "unit": "current USD", "field": "value_usd", "additive": True},
    ]
    lim3 = [
        "Named destination weights plus confidential code 999 equal INDEC's exact national export total in all six years (e.g. 67,895.67 t in 2024; 102,842.32 t in 2025).",
        "In 2021 (27,470.76 t across 17 destinations) and 2022 (29,872.06 t across 12 destinations), INDEC withheld every individual destination weight ('s') and placed 100% of weight in unmapped code 999.",
        "Code 999 has no geographic location (map_eligible=false), so weighted map arcs draw only disclosed named destinations while suppressed destinations remain inspectable with their s1–s10 FOB value bands in tables and records.",
    ]
    new_entries.append(write_pipeline_bundle(
        cid3,
        "Argentina lithium carbonate · INDEC national customs (NCM 28369100)",
        "Preserves all 87 annual INDEC export destination rows (2020–2025), separating published route weights, withheld ('s') destinations with FOB bands, and confidential code 999.",
        years, "quantity", metrics3, sources3, list(nodes3.values()), edges3, records3, lim3,
        "Annual INDEC COMEX NCM 28369100 exports (2020–2025). Withheld ('s') weights remain null; code 999 remains unmapped.",
        "Argentina to INDEC declared partner destinations plus unallocated code 999",
    ))

    # Update commodity-flows/manifest.json idempotently
    manifest_path = FLOW_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    new_ids = {e["id"] for e in new_entries}
    kept = [c for c in manifest.get("collections", []) if c["id"] not in new_ids]
    manifest["collections"] = kept + new_entries
    manifest["prepared_utc"] = datetime.now(timezone.utc).isoformat()
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"Updated {manifest_path} -> {len(manifest['collections'])} supplemental flow collections", flush=True)
    return new_entries


def main() -> None:
    archived = stage_source_packets()
    parsed = parse_workbook_and_packets()
    flow_entries = build_three_lithium_flow_bundles(parsed, archived)

    # Write flat CSV.GZ of national metal series for one-click download
    csv_buf = io.StringIO()
    cw = csv.writer(csv_buf)
    cw.writerow(["iso3", "period", "frequency", "metal", "measure", "source_value", "source_unit", "tonnes", "status", "source_id", "locator"])
    for r in parsed["national_metal_series"]:
        cw.writerow([
            r["iso3"], r["period"], r["frequency"], r["metal"], r["measure"],
            "" if r["source_value"] is None else r["source_value"],
            r["source_unit"],
            "" if r["tonnes"] is None else r["tonnes"],
            r["status"], r["source_id"], r["locator"],
        ])
    (COMMODITIES_DIR / "critical-metals-register.csv.gz").write_bytes(
        gzip.compress(csv_buf.getvalue().encode("utf-8"), compresslevel=9, mtime=0)
    )

    register_doc = {
        "schema": "public-evidence.critical-metals-register/v1",
        "title": "National Metal Registers & Border-Reporting Audit · Chile, Argentina, DR Congo & BGS (2020–2025)",
        "prepared_utc": datetime.now(timezone.utc).isoformat(),
        "research_vintage": "26 November 2026",
        "archived_packets": archived,
        "flow_collections": [e["id"] for e in flow_entries],
        **parsed,
        "boundaries": [
            "Publisher dashes ('-') and statistical secrecy markers ('s') remain null and are never converted to zero or interpolated.",
            "Lithium carbonate product weight and elemental Li content describe the same material on different mass bases (~18.8% Li) and must never be summed.",
            "Exporter-reported and foreign importer-reported border weights reflect distinct customs declarations and must never be added together.",
            "Argentina national annual production requires 12 disclosed monthly INDEC observations (leaving 2020–2023 null at the national annual level, while BGS series are retained separately).",
            "INDEC confidential destination code 999 reconciles national totals to 0.001 kg and USD 0.01 without assigning an invented geographic location.",
        ],
    }
    out_json = COMMODITIES_DIR / "critical-metals-register.json"
    out_json.write_bytes(json.dumps(register_doc, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8"))
    print(f"Wrote {out_json} ({out_json.stat().st_size:,} bytes)", flush=True)


if __name__ == "__main__":
    main()
