#!/usr/bin/env python3
"""Build 1960-2026 World Bank Pink Sheet price histories (monthly & annual, nominal & real)
paired with FAOSTAT (1961-2024), USGS (1990-2022), and EIA (1973-2025) country production.

Preserves unmodified publisher archives in ZIPs with SHA-256 provenance, keeps
missing/withheld sentinels strictly null (Missing != 0), and never fabricates or
interpolates observations.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import math
import re
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

PROJECT = Path(__file__).resolve().parents[1]
PUBLIC = PROJECT / "public-source"
OUT_DIR = PUBLIC / "data" / "commodities"
PROD_DIR = OUT_DIR / "production"
SOURCE_CACHE = PROJECT.parent / "source_cache"

WB_ANNUAL_URL = "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Annual.xlsx"
WB_MONTHLY_URL = "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx"
FAO_QCL_URL = "https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_All_Data_(Normalized).zip"
FAO_RFN_URL = "https://bulks-faostat.fao.org/production/Inputs_FertilizersNutrient_E_All_Data_(Normalized).zip"


def ensure_cached_file(filename: str, url: str, refresh: bool = False) -> Path:
    SOURCE_CACHE.mkdir(parents=True, exist_ok=True)
    dest = SOURCE_CACHE / filename
    if dest.exists() and not refresh:
        return dest
    print(f"Downloading {url} -> {dest} ...", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 PEL-Commodities-Builder/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        dest.write_bytes(resp.read())
    return dest

# FAOSTAT items to extract for country-by-country physical production (1961-2024)
FAO_QCL_ITEMS = {
    "15": ("wheat", "Wheat"),
    "56": ("maize", "Maize (corn)"),
    "27": ("rice", "Rice"),
    "44": ("barley", "Barley"),
    "83": ("sorghum", "Sorghum"),
    "236": ("soybeans", "Soya beans"),
    "237": ("soybean-oil", "Soya bean oil"),
    "257": ("palm-oil", "Palm oil"),
    "258": ("palm-kernel-oil", "Oil of palm kernel"),
    "252": ("coconut-oil", "Coconut oil"),
    "242": ("groundnuts", "Groundnuts, excluding shelled"),
    "244": ("groundnut-oil", "Groundnut oil"),
    "656": ("coffee", "Coffee, green"),
    "661": ("cocoa", "Cocoa beans"),
    "667": ("tea", "Tea leaves"),
    "162": ("sugar", "Raw cane or beet sugar (centrifugal only)"),
    "486": ("bananas", "Bananas"),
    "490": ("oranges", "Oranges"),
    "867": ("beef", "Meat of cattle with the bone, fresh or chilled"),
    "1058": ("chicken", "Meat of chickens, fresh or chilled"),
    "977": ("lamb", "Meat of sheep, fresh or chilled"),
    "826": ("tobacco", "Unmanufactured tobacco"),
    "767": ("cotton", "Cotton lint, ginned"),
    "836": ("rubber", "Natural rubber in primary forms"),
}

FAO_RFN_ITEMS = {
    "3102": ("fert-nitrogen", "Nutrient nitrogen N (total)"),
    "3103": ("fert-phosphate", "Nutrient phosphate P2O5 (total)"),
    "3104": ("fert-potash", "Nutrient potash K2O (total)"),
}


def sha256_bytes(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def slugify(text: str) -> str:
    s = re.sub(r"\*+", "", text).strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def clean_num(val):
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val) if math.isfinite(val) else None
    s = str(val).strip()
    if not s or s in {"…", "...", "..", "-", "—", "NA", "N/A", "n.a."}:
        return None
    try:
        f = float(s.replace(",", ""))
        return f if math.isfinite(f) else None
    except ValueError:
        return None


def clean_unit(u: str | None) -> str:
    if not u:
        return "index (2010=100)"
    s = str(u).strip()
    if s.startswith("(") and s.endswith(")"):
        s = s[1:-1].strip()
    # Replace literal '$' with 'USD ' to prevent KaTeX/math rendering ambiguity and match project conventions
    s = s.replace("$/", "USD/").replace("¢/", "US cents/")
    return s


def classify_group(name: str) -> str:
    n = name.lower()
    if any(k in n for k in ("crude oil", "coal", "natural gas", "liquefied natural gas")):
        return "Energy"
    if any(k in n for k in ("cocoa", "coffee", "tea")):
        return "Beverages"
    if any(k in n for k in ("coconut oil", "groundnut", "fish meal", "palm", "soybean")):
        return "Oils & Meals"
    if any(k in n for k in ("barley", "maize", "sorghum", "rice", "wheat")):
        return "Grains"
    if any(k in n for k in ("banana", "orange", "beef", "chicken", "lamb", "shrimp", "sugar")):
        return "Other Food"
    if any(k in n for k in ("tobacco", "logs", "sawnwood", "plywood", "cotton", "rubber")):
        return "Agricultural Raw Materials"
    if any(k in n for k in ("phosphate", "dap", "tsp", "urea", "potassium")):
        return "Fertilizers"
    if any(k in n for k in ("gold", "platinum", "silver")):
        return "Precious Metals"
    return "Metals & Minerals"


def map_pairing_and_flow(name: str, evidence_index: dict[str, str], cat_by_id: dict[str, dict]) -> tuple[dict | None, str | None]:
    n = name.lower()

    def retained(sid: str, note: str) -> dict | None:
        rel = evidence_index.get(sid)
        meta = cat_by_id.get(sid)
        if not rel or not meta:
            return None
        return {
            "kind": "retained-evidence",
            "series_id": sid,
            "url": "/data/" + rel,
            "title": meta["label"],
            "unit": meta.get("unit", ""),
            "source_publisher": "EIA International Energy Statistics" if "eia" in sid else "USGS Mineral Commodity Summaries / Minerals Yearbook",
            "first_year": meta.get("first_year"),
            "last_year": meta.get("last_year"),
            "note": note,
        }

    def fao(slug: str, label: str, domain: str) -> dict:
        return {
            "kind": "faostat-production",
            "slug": slug,
            "url": f"/data/commodities/production/fao-{slug}.json",
            "title": f"FAOSTAT country production · {label}",
            "unit": "tonnes",
            "source_publisher": f"FAOSTAT ({domain})",
            "first_year": 1961,
            "last_year": 2024 if domain == "Crops and livestock products" else 2023,
            "note": "Country physical production in metric tonnes. Benchmark world market prices and national harvest/output totals are separate series with distinct geographic and stage definitions.",
        }

    # Energy
    if "crude oil" in n:
        return retained("early-energy-eia-intl::countries-INTL.57-1-TBPD.A", "Country crude oil including lease condensate production (thousand barrels/day)."), "trade_crude_oil"
    if "coal" in n:
        return retained("early-energy-eia-intl::countries-INTL.7-1-TST.A", "Country coal production (thousand short tons)."), "trade_coal"
    if "liquefied natural gas" in n:
        return retained("early-energy-eia-intl::countries-INTL.26-1-BCF.A", "Country dry natural gas production (billion cubic feet)."), "trade_lng"
    if "natural gas" in n:
        return retained("early-energy-eia-intl::countries-INTL.26-1-BCF.A", "Country dry natural gas production (billion cubic feet)."), "trade_lng"

    # Metals & Minerals (USGS)
    usgs_pairs = [
        ("aluminum", "history-usgs::696e0fadd146fc0b6779", None),
        ("iron ore", "history-usgs::44df457e4d18108095f6", None),
        ("copper", "history-usgs::d1cd1bb1f72b1417feea", "trade_copper"),
        ("lead", "history-usgs::6611c8ed1ae6701a02f4", None),
        ("tin", "history-usgs::45b6b9b3c15bf85a774a", None),
        ("nickel", "history-usgs::925bac03ff1d16e9f60e", "trade_battery_metals"),
        ("zinc", "history-usgs::55932b57b7effbe0e0f8", None),
        ("gold", "history-usgs::bc46e8d211f1ea77d838", None),
        ("platinum", "history-usgs::6de52cf0f139a2ff47de", None),
        ("silver", "history-usgs::4cf4cbdb1df326cd44e3", None),
        ("phosphate rock", "history-usgs::4eca5e60dbc55354ea20", "trade_fertilizers"),
    ]
    for kw, sid, flow in usgs_pairs:
        if kw in n:
            return retained(sid, f"USGS country mineral production ({cat_by_id.get(sid, {}).get('unit', '')})."), flow

    # Fertilizers (FAOSTAT RFN)
    if any(k in n for k in ("dap", "tsp")):
        return fao("fert-phosphate", "Nutrient phosphate P2O5 (total)", "Fertilizers by Nutrient"), "trade_fertilizers"
    if "urea" in n:
        return fao("fert-nitrogen", "Nutrient nitrogen N (total)", "Fertilizers by Nutrient"), "trade_fertilizers"
    if "potassium chloride" in n:
        return fao("fert-potash", "Nutrient potash K2O (total)", "Fertilizers by Nutrient"), "trade_fertilizers"

    # Crops, Oils, Beverages, Livestock, Raw Materials (FAOSTAT QCL)
    fao_pairs = [
        ("wheat", "wheat", "Wheat", "trade_wheat"),
        ("maize", "maize", "Maize (corn)", "trade_maize"),
        ("rice", "rice", "Rice", "trade_rice"),
        ("barley", "barley", "Barley", None),
        ("sorghum", "sorghum", "Sorghum", None),
        ("soybean oil", "soybean-oil", "Soya bean oil", "trade_soybeans"),
        ("soybeans", "soybeans", "Soya beans", "trade_soybeans"),
        ("soybean meal", "soybeans", "Soya beans (primary oilseed input)", "trade_soybeans"),
        ("palm kernel oil", "palm-kernel-oil", "Oil of palm kernel", None),
        ("palm oil", "palm-oil", "Palm oil", None),
        ("coconut oil", "coconut-oil", "Coconut oil", None),
        ("groundnut oil", "groundnut-oil", "Groundnut oil", None),
        ("groundnuts", "groundnuts", "Groundnuts, excluding shelled", None),
        ("coffee", "coffee", "Coffee, green", "trade_coffee"),
        ("cocoa", "cocoa", "Cocoa beans", None),
        ("tea", "tea", "Tea leaves", None),
        ("sugar", "sugar", "Raw cane or beet sugar", None),
        ("banana", "bananas", "Bananas", None),
        ("orange", "oranges", "Oranges", None),
        ("beef", "beef", "Cattle meat, fresh or chilled", None),
        ("chicken", "chicken", "Chicken meat, fresh or chilled", None),
        ("lamb", "lamb", "Sheep meat, fresh or chilled", None),
        ("tobacco", "tobacco", "Unmanufactured tobacco", None),
        ("cotton", "cotton", "Cotton lint, ginned", None),
        ("rubber", "rubber", "Natural rubber in primary forms", None),
    ]
    for kw, slug, label, flow in fao_pairs:
        if kw in n:
            return fao(slug, label, "Crops and livestock products"), flow

    return None, None


def build_faostat_area_iso_lookup() -> tuple[dict[str, dict], set[str]]:
    world_geo = json.loads((PUBLIC / "workbench/data/map-geometry/world.json").read_text())
    valid_geo_ids = {str(f["id"]) for f in world_geo["features"]}

    # 1. Start with existing wheat-index.json FAO area mapping
    wi = json.loads((PUBLIC / "data/wheat-weather/wheat-index.json").read_text())
    fao_areas: dict[str, dict] = {}
    for code, info in wi.get("areas", {}).items():
        iso = info.get("iso3")
        fao_areas[str(code)] = {"name": info.get("name", str(code)), "iso3": iso}

    # 2. M49 integer -> ISO3 fallback from committed comtrade-reference-areas.json
    m49_to_iso: dict[int, str] = {}
    ref_file = PUBLIC / "data/commodity-flows/comtrade-reference-areas.json"
    if ref_file.exists():
        for m49_str, iso in json.loads(ref_file.read_text()).get("m49_to_iso3", {}).items():
            if str(m49_str).isdigit() and len(iso) == 3:
                m49_to_iso[int(m49_str)] = iso
    m49_to_iso[840] = "USA"
    return {"fao": fao_areas, "m49": m49_to_iso}, valid_geo_ids


def extract_faostat_production(lookups: dict, valid_geo_ids: set[str], refresh: bool = False) -> dict[str, dict]:
    PROD_DIR.mkdir(parents=True, exist_ok=True)
    fao_map = lookups["fao"]
    m49_map = lookups["m49"]

    by_slug: dict[str, list[dict]] = {slug: [] for slug, _ in list(FAO_QCL_ITEMS.values()) + list(FAO_RFN_ITEMS.values())}
    flags_dict: dict[str, str] = {}
    raw_slice_rows = []
    archived_zip = OUT_DIR / "faostat-production-sources.zip"

    if archived_zip.exists() and not refresh:
        with zipfile.ZipFile(archived_zip) as zf:
            flags_dict.update(json.loads(zf.read("faostat_flags.json").decode("utf-8")))
            with zf.open("faostat_selected_commodities_production_1961_2024.csv") as fh:
                reader = csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8"))
                slug_lookup = {ic: slug for ic, (slug, _) in list(FAO_QCL_ITEMS.items()) + list(FAO_RFN_ITEMS.items())}
                for row in reader:
                    ic = row["item_code"].strip()
                    slug = slug_lookup.get(ic)
                    if not slug:
                        continue
                    iso = row["iso3"].strip()
                    yr = int(row["year"])
                    val = clean_num(row["production_tonnes"])
                    flag = (row.get("flag") or "").strip()
                    if flag == "M" and val == 0.0:
                        val = None
                    geo_id = "KOS" if iso == "XKX" else (iso if iso in valid_geo_ids else None)
                    by_slug[slug].append({
                        "iso3": iso,
                        "geo_id": geo_id,
                        "name": row["area_name"].strip(),
                        "year": yr,
                        "value": val,
                        "unit": row.get("unit", "t").strip(),
                        "flag": flag,
                    })
                    raw_slice_rows.append([
                        row["domain"], row["fao_area_code"], row["m49"], iso, row["area_name"],
                        ic, row["item"], yr, "" if val is None else val, row.get("unit", "t"), flag, row.get("note", "")
                    ])
    else:
        def process_zip(zip_name: str, url: str, items_map: dict[str, tuple[str, str]], domain_label: str):
            zpath = ensure_cached_file(zip_name, url, refresh=refresh)
            with zipfile.ZipFile(zpath) as zf:
                flag_files = [n for n in zf.namelist() if n.endswith("Flags.csv")]
                if flag_files:
                    with zf.open(flag_files[0]) as ff:
                        for r in csv.DictReader(io.TextIOWrapper(ff, encoding="latin-1")):
                            fc = (r.get("Flag") or "").strip()
                            fd = (r.get("Description") or r.get("Flags") or "").strip()
                            if fc:
                                flags_dict[fc] = fd

                csv_name = [n for n in zf.namelist() if n.endswith("All_Data_(Normalized).csv")][0]
                with zf.open(csv_name) as fh:
                    reader = csv.reader(io.TextIOWrapper(fh, encoding="latin-1"))
                    hdr = [h.strip() for h in next(reader)]
                    idx = {h: i for i, h in enumerate(hdr)}
                    i_ic, i_ec, i_ac = idx["Item Code"], idx["Element Code"], idx["Area Code"]
                    i_m49 = idx.get("Area Code (M49)")
                    i_area, i_yr, i_val = idx["Area"], idx["Year"], idx["Value"]
                    i_unit, i_flag, i_note = idx["Unit"], idx["Flag"], idx.get("Note")
                    for row in reader:
                        ic = row[i_ic].strip()
                        if ic not in items_map or row[i_ec].strip() != "5510":
                            continue
                        ac = row[i_ac].strip()
                        try:
                            ac_int = int(ac)
                        except ValueError:
                            continue
                        if ac_int >= 5000 or ac_int in {351}:
                            continue
                        m49_raw = row[i_m49].strip().lstrip("'") if i_m49 is not None else ""
                        iso = fao_map.get(ac, {}).get("iso3")
                        if not iso and m49_raw.isdigit():
                            iso = m49_map.get(int(m49_raw))
                        if ac == "41":
                            iso = "CHN"
                        if not iso or len(iso) != 3:
                            continue
                        yr_s = row[i_yr].strip()
                        if not yr_s.isdigit():
                            continue
                        yr = int(yr_s)
                        if yr < 1960:
                            continue
                        val = clean_num(row[i_val])
                        flag = row[i_flag].strip()
                        if flag == "M" and val == 0.0:
                            val = None
                        slug, item_title = items_map[ic]
                        area_name = fao_map.get(ac, {}).get("name") or row[i_area].strip()
                        geo_id = "KOS" if iso == "XKX" else (iso if iso in valid_geo_ids else None)
                        unit_s = row[i_unit].strip() or "t"
                        note_s = row[i_note].strip() if i_note is not None and i_note < len(row) else ""
                        by_slug[slug].append({
                            "iso3": iso, "geo_id": geo_id, "name": area_name,
                            "year": yr, "value": val, "unit": unit_s, "flag": flag,
                        })
                        raw_slice_rows.append([
                            domain_label, ac, m49_raw, iso, area_name, ic, item_title, yr,
                            "" if val is None else val, unit_s, flag, note_s
                        ])

        process_zip("Production_Crops_Livestock_E_All_Data_(Normalized).zip", FAO_QCL_URL, FAO_QCL_ITEMS, "QCL")
        process_zip("Inputs_FertilizersNutrient_E_All_Data_(Normalized).zip", FAO_RFN_URL, FAO_RFN_ITEMS, "RFN")

    summaries = {}
    all_items = {slug: (ic, title, "QCL") for ic, (slug, title) in FAO_QCL_ITEMS.items()}
    all_items.update({slug: (ic, title, "RFN") for ic, (slug, title) in FAO_RFN_ITEMS.items()})

    for slug, rows in sorted(by_slug.items()):
        ic, title, dom = all_items[slug]
        # Deduplicate exact (iso3, year): if multiple territories share ISO3, keep exact primary country only
        grouped: dict[tuple[str, int], list[dict]] = {}
        for r in rows:
            grouped.setdefault((r["iso3"], r["year"]), []).append(r)

        countries: dict[str, dict] = {}
        years_set = set()
        records_out = []
        for (iso, yr), grp in sorted(grouped.items()):
            if len(grp) > 1:
                # Ambiguous territory collision: do not sum; retain unavailable status per project semantics
                rec = grp[0]
                val = None
                flag = "AMBIGUOUS"
            else:
                rec = grp[0]
                val = rec["value"]
                flag = rec["flag"]
            years_set.add(yr)
            if iso not in countries:
                countries[iso] = {"iso3": iso, "geo_id": rec["geo_id"], "name": rec["name"]}
            records_out.append([iso, yr, val, flag])

        years = sorted(years_set)
        packet = {
            "schema": "public-evidence.commodity-production/v1",
            "slug": slug,
            "item_code": ic,
            "title": f"FAOSTAT country production · {title}",
            "commodity": title,
            "domain": "Crops and livestock products (QCL)" if dom == "QCL" else "Fertilizers by Nutrient (RFN)",
            "unit": "tonnes",
            "years": years,
            "first_year": years[0] if years else None,
            "last_year": years[-1] if years else None,
            "flags": flags_dict,
            "countries": list(countries.values()),
            # Compact tuple rows: [iso3, year, value_or_null, flag]
            "rows": records_out,
        }
        out_file = PROD_DIR / f"fao-{slug}.json"
        blob = json.dumps(packet, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
        out_file.write_bytes(blob)
        summaries[slug] = {
            "slug": slug,
            "file": f"/data/commodities/production/fao-{slug}.json",
            "bytes": len(blob),
            "sha256": sha256_bytes(blob),
            "countries": len(countries),
            "rows": len(records_out),
            "years": [years[0], years[-1]] if years else [],
        }

    # Write compressed CSV + source slice ZIP
    csv_buf = io.StringIO()
    cw = csv.writer(csv_buf)
    cw.writerow(["domain", "fao_area_code", "m49", "iso3", "area_name", "item_code", "item", "year", "production_tonnes", "unit", "flag", "note"])
    cw.writerows(raw_slice_rows)
    csv_bytes = csv_buf.getvalue().encode("utf-8")
    (OUT_DIR / "faostat-production.csv.gz").write_bytes(gzip.compress(csv_bytes, compresslevel=9, mtime=0))

    with zipfile.ZipFile(OUT_DIR / "faostat-production-sources.zip", "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        zi = zipfile.ZipInfo("faostat_selected_commodities_production_1961_2024.csv", (2026, 11, 25, 0, 0, 0))
        zi.compress_type = zipfile.ZIP_DEFLATED
        zf.writestr(zi, csv_bytes, compresslevel=9)
        zi2 = zipfile.ZipInfo("faostat_flags.json", (2026, 11, 25, 0, 0, 0))
        zi2.compress_type = zipfile.ZIP_DEFLATED
        zf.writestr(zi2, json.dumps(flags_dict, indent=2).encode("utf-8"), compresslevel=9)

    print(f"Extracted {len(summaries)} FAOSTAT country production series ({len(raw_slice_rows):,} country-year rows)", flush=True)
    return summaries


def parse_pink_sheet(evidence_index: dict[str, str], cat_by_id: dict[str, dict], refresh: bool = False) -> dict:
    archived_wb_zip = OUT_DIR / "pink-sheet-sources.zip"
    if archived_wb_zip.exists() and not refresh:
        with zipfile.ZipFile(archived_wb_zip) as zf:
            ann_bytes = zf.read("CMO-Historical-Data-Annual.xlsx")
            mon_bytes = zf.read("CMO-Historical-Data-Monthly.xlsx")
    else:
        ann_bytes = ensure_cached_file("CMO-Historical-Data-Annual.xlsx", WB_ANNUAL_URL, refresh=refresh).read_bytes()
        mon_bytes = ensure_cached_file("CMO-Historical-Data-Monthly.xlsx", WB_MONTHLY_URL, refresh=refresh).read_bytes()

    wb_a = openpyxl.load_workbook(io.BytesIO(ann_bytes), read_only=True, data_only=True)
    wb_m = openpyxl.load_workbook(io.BytesIO(mon_bytes), read_only=True, data_only=True)

    # Parse benchmark descriptions
    descriptions: dict[str, str] = {}
    if "Description" in wb_a.sheetnames:
        for r in wb_a["Description"].iter_rows(values_only=True):
            vals = [str(x).strip() for x in r if x is not None and str(x).strip()]
            if len(vals) >= 2:
                descriptions[vals[0].rstrip("*").strip().lower()] = " — ".join(vals[1:])

    ws_nom = list(wb_a["Annual Prices (Nominal)"].iter_rows(values_only=True))
    ws_real = list(wb_a["Annual Prices (Real)"].iter_rows(values_only=True))
    ws_mon = list(wb_m["Monthly Prices"].iter_rows(values_only=True))

    h_nom = next(i for i, r in enumerate(ws_nom) if r and r[1] and "Crude oil" in str(r[1]))
    h_real = next(i for i, r in enumerate(ws_real) if r and r[1] and "Crude oil" in str(r[1]))
    h_mon = next(i for i, r in enumerate(ws_mon) if r and r[1] and "Crude oil" in str(r[1]))

    # Map column name -> column index in Real and Monthly
    real_cols = {str(ws_real[h_real][j]).rstrip("*").strip(): j for j in range(1, len(ws_real[h_real])) if ws_real[h_real][j]}
    mon_cols = {str(ws_mon[h_mon][j]).rstrip("*").strip(): j for j in range(1, len(ws_mon[h_mon])) if ws_mon[h_mon][j]}

    ann_years = []
    ann_nom_rows = []
    for r in ws_nom[h_nom + 2:]:
        if r and r[0] is not None and str(r[0]).strip().isdigit():
            ann_years.append(int(str(r[0]).strip()))
            ann_nom_rows.append(r)

    real_by_year = {}
    for r in ws_real[h_real + 2:]:
        if r and r[0] is not None and str(r[0]).strip().isdigit():
            real_by_year[int(str(r[0]).strip())] = r

    months = []
    mon_data_rows = []
    for r in ws_mon[h_mon + 2:]:
        if r and r[0] is not None and re.match(r"^\d{4}M\d{2}$", str(r[0]).strip()):
            months.append(str(r[0]).strip())
            mon_data_rows.append(r)

    commodities = []
    ann_csv_rows = []
    mon_csv_rows = []

    for j in range(1, len(ws_nom[h_nom])):
        raw_name = ws_nom[h_nom][j]
        if not raw_name:
            continue
        clean_name = re.sub(r"\s*\*+$", "", str(raw_name)).strip()
        cid = slugify(clean_name)
        unit = clean_unit(ws_nom[h_nom + 1][j])
        rj = real_cols.get(clean_name)
        mj = mon_cols.get(clean_name)

        nom_vals = [clean_num(r[j] if j < len(r) else None) for r in ann_nom_rows]
        real_vals = [
            clean_num(real_by_year.get(y, ())[rj] if rj is not None and rj < len(real_by_year.get(y, ())) else None)
            for y in ann_years
        ]
        mon_vals = [
            clean_num(r[mj] if mj is not None and mj < len(r) else None)
            for r in mon_data_rows
        ]

        for idx_y, y in enumerate(ann_years):
            ann_csv_rows.append([cid, clean_name, classify_group(clean_name), unit, y,
                                 "" if nom_vals[idx_y] is None else round(nom_vals[idx_y], 6),
                                 "" if real_vals[idx_y] is None else round(real_vals[idx_y], 6)])
        for idx_m, m in enumerate(months):
            mon_csv_rows.append([cid, clean_name, classify_group(clean_name), unit, m,
                                 "" if mon_vals[idx_m] is None else round(mon_vals[idx_m], 6)])

        pairing, related_flow = map_pairing_and_flow(clean_name, evidence_index, cat_by_id)
        desc = descriptions.get(clean_name.lower(), "")

        commodities.append({
            "id": cid,
            "name": clean_name,
            "raw_label": str(raw_name).strip(),
            "group": classify_group(clean_name),
            "unit": unit,
            "is_index": "2010=100" in unit,
            "description": desc,
            "annual_nominal": [None if v is None else round(v, 5) for v in nom_vals],
            "annual_real_2010": [None if v is None else round(v, 5) for v in real_vals],
            "monthly_nominal": [None if v is None else round(v, 5) for v in mon_vals],
            "production_pairing": pairing,
            "related_flow_collection": related_flow,
        })

    # Also parse the 15 World Bank Composite Indices (Annual Nominal, Annual Real, Monthly Nominal)
    ws_in = list(wb_a["Annual Indices (Nominal)"].iter_rows(values_only=True))
    ws_ir = list(wb_a["Annual Indices (Real)"].iter_rows(values_only=True))
    ws_im = list(wb_m["Monthly Indices"].iter_rows(values_only=True))

    def index_headers(rows, max_hdr=9):
        cols = {}
        for col_i in range(1, 18):
            parts = []
            for r_i in range(4, max_hdr):
                if r_i < len(rows) and col_i < len(rows[r_i]) and rows[r_i][col_i]:
                    t = re.sub(r"\s+", " ", str(rows[r_i][col_i])).rstrip("*").strip()
                    if t:
                        parts.append(t)
            if parts:
                cols[col_i] = parts[-1]
        return cols

    in_hdr = index_headers(ws_in, 9)
    ir_hdr = {v: k for k, v in index_headers(ws_ir, 9).items()}
    im_hdr = {
        ("World Bank Commodity Price Index" if v == "Total Index" else v): k
        for k, v in index_headers(ws_im, 9).items()
    }

    in_by_y = {int(str(r[0]).strip()): r for r in ws_in if r and r[0] is not None and str(r[0]).strip().isdigit()}
    ir_by_y = {int(str(r[0]).strip()): r for r in ws_ir if r and r[0] is not None and str(r[0]).strip().isdigit()}
    im_by_m = {str(r[0]).strip(): r for r in ws_im if r and r[0] is not None and re.match(r"^\d{4}M\d{2}$", str(r[0]).strip())}

    indices = []
    for col_i, idx_name in sorted(in_hdr.items()):
        iid = "index-" + slugify(idx_name)
        rj = ir_hdr.get(idx_name)
        mj = im_hdr.get(idx_name)
        nom_v = [clean_num(in_by_y.get(y, ())[col_i] if col_i < len(in_by_y.get(y, ())) else None) for y in ann_years]
        real_v = [clean_num(ir_by_y.get(y, ())[rj] if rj and rj < len(ir_by_y.get(y, ())) else None) for y in ann_years]
        mon_v = [clean_num(im_by_m.get(m, ())[mj] if mj and mj < len(im_by_m.get(m, ())) else None) for m in months]
        indices.append({
            "id": iid,
            "name": idx_name,
            "group": "Composite Price Indices",
            "unit": "index (2010=100)",
            "is_index": True,
            "description": f"World Bank Commodity Price Index ({idx_name}, 2010 = 100).",
            "annual_nominal": [None if v is None else round(v, 4) for v in nom_v],
            "annual_real_2010": [None if v is None else round(v, 4) for v in real_v],
            "monthly_nominal": [None if v is None else round(v, 4) for v in mon_v],
            "production_pairing": None,
            "related_flow_collection": None,
        })

    # Save CSV.GZ downloads
    ann_buf = io.StringIO()
    aw = csv.writer(ann_buf)
    aw.writerow(["commodity_id", "commodity_name", "group", "unit", "year", "nominal_price", "real_2010_usd_price"])
    aw.writerows(ann_csv_rows)
    (OUT_DIR / "pink-sheet-annual.csv.gz").write_bytes(gzip.compress(ann_buf.getvalue().encode("utf-8"), compresslevel=9, mtime=0))

    mon_buf = io.StringIO()
    mw = csv.writer(mon_buf)
    mw.writerow(["commodity_id", "commodity_name", "group", "unit", "month", "nominal_price"])
    mw.writerows(mon_csv_rows)
    (OUT_DIR / "pink-sheet-monthly.csv.gz").write_bytes(gzip.compress(mon_buf.getvalue().encode("utf-8"), compresslevel=9, mtime=0))

    # Save unmodified publisher Excel workbooks in pink-sheet-sources.zip
    with zipfile.ZipFile(OUT_DIR / "pink-sheet-sources.zip", "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for fn, blob in [("CMO-Historical-Data-Annual.xlsx", ann_bytes), ("CMO-Historical-Data-Monthly.xlsx", mon_bytes)]:
            zi = zipfile.ZipInfo(fn, (2026, 11, 25, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(zi, blob, compresslevel=9)

    payload = {
        "schema": "public-evidence.pink-sheet/v1",
        "title": "World Bank Commodity Price Data (The Pink Sheet) · 1960–2026",
        "annual_vintage": "Updated September 02, 2026 (1960–2025, nominal USD and real 2010 USD)",
        "monthly_vintage": "Updated November 03, 2026 (1960M01–2026M10, nominal USD)",
        "years": ann_years,
        "months": months,
        "commodities": commodities,
        "indices": indices,
        "boundaries": [
            "Publisher missing symbols ('…', '..') remain null and are never interpolated or converted to zero.",
            "Annual real prices use the World Bank's published 2010 constant-USD deflator (MUV index); monthly series are published by the World Bank in nominal USD only.",
            "World benchmark spot/contract prices and national physical production series come from separate publishers, units and market stages; pairing them in one view facilitates inspection without implying a direct causal elasticity.",
        ],
    }
    (OUT_DIR / "pink-sheet.json").write_bytes(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    )

    provenance = {
        "schema": "public-evidence.pink-sheet-provenance/v1",
        "prepared_utc": datetime.now(timezone.utc).isoformat(),
        "sources": [
            {
                "id": "world_bank_pink_sheet_annual",
                "title": "World Bank Commodity Markets (The Pink Sheet) — Historical Annual Data",
                "url": WB_ANNUAL_URL,
                "vintage": "Updated on September 02, 2026",
                "bytes": len(ann_bytes),
                "sha256": sha256_bytes(ann_bytes),
            },
            {
                "id": "world_bank_pink_sheet_monthly",
                "title": "World Bank Commodity Markets (The Pink Sheet) — Historical Monthly Data",
                "url": WB_MONTHLY_URL,
                "vintage": "Updated on November 03, 2026",
                "bytes": len(mon_bytes),
                "sha256": sha256_bytes(mon_bytes),
            },
        ],
        "counts": {
            "commodities": len(commodities),
            "paired_with_country_production": sum(1 for c in commodities if c["production_pairing"]),
            "linked_to_bilateral_flows": sum(1 for c in commodities if c["related_flow_collection"]),
            "composite_indices": len(indices),
            "annual_years": len(ann_years),
            "monthly_periods": len(months),
        },
    }
    (OUT_DIR / "pink-sheet-provenance.json").write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + "\n")
    print("Pink Sheet summary:", json.dumps(provenance["counts"]), flush=True)
    return provenance


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh-upstream", action="store_true", help="Re-download fresh upstream World Bank & FAOSTAT archives into durable source_cache/")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    evidence_index = json.loads((PUBLIC / "data/evidence-index.json").read_text())
    cat = json.loads((PUBLIC / "data/catalogue.json").read_text())
    cat_by_id = {s["id"]: s for s in cat["series"]}

    lookups, valid_geo_ids = build_faostat_area_iso_lookup()
    fao_summary = extract_faostat_production(lookups, valid_geo_ids, refresh=args.refresh_upstream)
    prov = parse_pink_sheet(evidence_index, cat_by_id, refresh=args.refresh_upstream)
    prov["faostat_production_series"] = len(fao_summary)
    (OUT_DIR / "pink-sheet-provenance.json").write_text(json.dumps(prov, indent=2, ensure_ascii=False) + "\n")
    print("DONE building Pink Sheet + paired FAOSTAT/USGS/EIA production!", flush=True)


if __name__ == "__main__":
    main()
