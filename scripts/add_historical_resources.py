#!/usr/bin/env python3
"""Add reproducible WDI food/energy and USGS mineral histories without editing old evidence.

Raw replies and the complete USGS CSV (all publication vintages) are retained in
downloadable ZIP archives. Country records, regional aggregates, historical
geographies and source-unavailable periods have separate accounting. A cached
acquisition is reused; --refresh explicitly replaces that cache with a new edition.
"""
import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import datetime, timezone
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import re
import unicodedata
import zipfile

import requests

PROJECT = Path(__file__).resolve().parents[1]
PUBLIC = PROJECT / 'public-source'
CACHE = PROJECT / 'qa/history_acquisition'
DATA = PUBLIC / 'data'
RAW = DATA / 'historical-sources'
WB = 'https://api.worldbank.org/v2/'
USGS_ID = '6ad0d6581ba49b1dd2a0b8a0'
USGS_DOI = 'https://doi.org/10.5066/P13DFA65'
FOOD = ['AG.PRD.FOOD.XD', 'AG.PRD.CROP.XD', 'AG.PRD.LVSK.XD', 'AG.PRD.CREL.MT', 'AG.LND.CREL.HA', 'AG.YLD.CREL.KG', 'AG.CON.FERT.ZS', 'AG.CON.FERT.PT.ZS']
ALIASES = {'Burma':'MMR','Congo (Kinshasa)':'COD','Congo, Democratic Republic of the':'COD','Congo (Brazzaville)':'COG','Congo, Republic of the':'COG','Korea, Republic of':'KOR','Korea, North':'PRK','Korea, Democratic People’s Republic of':'PRK','Russia':'RUS','Turkey':'TUR','Tanzania':'TZA','Vietnam':'VNM','Iran':'IRN','Egypt':'EGY','Syria':'SYR','United States':'USA','Laos':'LAO','Venezuela':'VEN','Bolivia':'BOL','Côte d’Ivoire':'CIV','Kyrgyzstan':'KGZ','Slovakia':'SVK','United Kingdom':'GBR','Hong Kong':'HKG','Taiwan':'TWN','Kosovo':'XKX','Macedonia':'MKD','Macedonia, North':'MKD','Swaziland':'SWZ','Cape Verde':'CPV','East Timor':'TLS','The Bahamas':'BHS','The Gambia':'GMB','Brunei':'BRN','Micronesia, Federated States of':'FSM'}
ALIASES.update({'Czech Republic':'CZE', 'Myanmar (Burma)':'MMR', 'Macau':'MAC', 'French Guiana (Guyane)':'GUF', 'Guadeloupe':'GLP', 'Martinique':'MTQ', 'Réunion':'REU', 'Christmas Island':'CXR'})
LIMITS = ['Retained source edition acquired 1 November 2026; publisher coverage and revisions vary by country and year.', 'Missing or ineligible source cells remain unavailable. No interpolation, carry-forward, zero filling, numerical unit conversion or averaging is performed.', 'Country, territory and aggregate accounts remain separate. Historical geographies are not reassigned to current successor states.', 'Compare the exact source definition, physical basis, unit and year. A production index, a percentage, a physical quantity and an accounting estimate answer different questions.']
USGS_SENTINELS = {'-111':'Reported value less than a half unit; not a measured zero', '-222':'W: value withheld to avoid disclosing company proprietary data', '-333':'NA: no available data'}


def compact(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode()


def sha(blob):
    return hashlib.sha256(blob).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(compact(value) + b'\n')


def acquire(url, name, refresh=False):
    path = CACHE / name
    if refresh or not path.exists():
        response = requests.get(url, timeout=180)
        response.raise_for_status()
        path.write_bytes(response.content)
    return path.read_bytes()


def archive(name, entries):
    path = RAW / name
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for filename, blob in entries.items():
            info = zipfile.ZipInfo(filename, (2026, 11, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, blob, compresslevel=9)
    return {'path': '/data/historical-sources/' + name, 'bytes': path.stat().st_size, 'sha256': sha(path.read_bytes()), 'members': [{'path': k, 'bytes': len(v), 'sha256': sha(v)} for k, v in entries.items()]}


def packet(series, dataset, records, **extra):
    series['years'] = sorted({r['year'] for r in records})
    series['places'] = [{'id': k, 'name': v} for k, v in sorted({r['geo_id']:r['geo_name'] for r in records}.items())]
    series['first_year'], series['last_year'] = min(series['years']), max(series['years'])
    series.update(source_year_count=len(series['years']), native_place_count=len(series['places']), rows=len(records), numeric_rows=sum(r['eligible'] for r in records), family=series['resource_family'], description=series['definition'])
    name = 'history-' + sha(series['id'].encode())[:20] + '.json'
    blob = compact({'schema':'public-evidence.supplementary-history/v1', 'series':series, 'dataset':dataset, 'records':records, **extra}) + b'\n'
    if len(blob) > 19_000_000:
        raise ValueError('Supplementary packet exceeds static asset limit: ' + series['id'])
    (DATA / 'evidence' / name).write_bytes(blob)
    return {'id':series['id'], 'file':'evidence/' + name, 'rows':len(records), 'bytes':len(blob), 'sha256':sha(blob), 'first_year':series['first_year'], 'last_year':series['last_year'], 'source_year_count':len(series['years']), 'native_places':len(series['places']), 'eligible_numeric_rows':series['numeric_rows']}


def wb_histories(refresh):
    countries_blob = acquire(WB+'country?format=json&per_page=400', 'wb-countries.json', refresh)
    countries = json.loads(countries_blob)[1]
    country_ids = {c['id'] for c in countries if c['region']['value'] != 'Aggregates'}
    metadata_blob = acquire(WB+'indicator?source=2&format=json&per_page=30000', 'wb-wdi-indicators.json', refresh)
    metadata = {s['id']:s for s in json.loads(metadata_blob)[1]}
    codes = FOOD + sorted(k for k in metadata if k.startswith('EG.'))
    def load(code):
        url = WB+'country/all/indicator/'+code+'?source=2&format=json&per_page=20000&footnote=y'
        blob = acquire(url, 'wb-'+code+'.json', refresh)
        data = json.loads(blob)
        if not isinstance(data, list) or len(data) != 2 or data[0].get('pages') != 1:
            raise ValueError('Incomplete or invalid World Bank response: '+code)
        return code,url,blob,data
    datasets = {kind:{'id':'history-wdi-'+kind, 'title':'World Bank WDI · '+('food, crops and livestock' if kind=='food' else 'energy, electricity and fuel mix')+' · annual country histories', 'description':'Complete available annual country and territory API cells within each indicator’s numeric reporting-year extent. Original API replies, out-of-extent empty cells and regional aggregates remain downloadable; source estimates and missing cells retain their status.', 'source_url':'https://databank.worldbank.org/source/world-development-indicators', 'builtin':True, 'license':'World Bank dataset terms, with original provider attribution retained', 'source_vintage':'WDI API acquired 2026-11-01'} for kind in ['food','energy']}
    series_list, receipts, archives = [], [], []
    with ThreadPoolExecutor(max_workers=5) as pool:
        loaded=list(pool.map(load,codes))
        for kind,dataset in datasets.items():
            fingerprint={'country_classification_sha256':sha(countries_blob),'indicator_responses':[{'id':code,'response_sha256':sha(blob),'metadata_sha256':sha(compact(metadata[code]))} for code,url,blob,data in loaded if (code in FOOD)==(kind=='food')]}
            dataset['normalized_bundle_sha256']=sha(compact(fingerprint))
            dataset['source_fingerprint_meaning']='SHA-256 of canonical per-indicator exact API response and source-metadata checksums plus country/aggregate classification checksum; not an assertion of source measurement certainty.'
        for code,url,blob,data in loaded:
            meta=metadata[code]; kind='food' if code in FOOD else 'energy'; dataset=datasets[kind]
            country=[r for r in data[1] if r['countryiso3code'] in country_ids]
            aggregates=[r for r in data[1] if r['countryiso3code'] not in country_ids]
            numeric_years=sorted({int(r['date']) for r in country if isinstance(r['value'], (int,float)) and math.isfinite(r['value'])})
            if len(numeric_years)<2:
                print('No annual history',code,flush=True);continue
            first,last=numeric_years[0],numeric_years[-1]
            included=[r for r in country if first<=int(r['date'])<=last]
            outside=[r for r in country if not first<=int(r['date'])<=last]
            raw_archive=archive('wdi-'+code+'.zip',{code+'-response.json':blob, code+'-indicator.json':compact(meta), 'countries.json':countries_blob})
            archives.append(raw_archive)
            sid='history-wdi::'+code
            # The parenthetical expression is the publisher's literal unit label;
            # the original API unit (often blank) also stays in source_record.
            unit=meta['unit'] or (re.search(r'\((.*)\)\s*$',meta['name']).group(1) if re.search(r'\((.*)\)\s*$',meta['name']) else 'Publisher-defined indicator unit')
            definition=meta['sourceNote']+' Original provider: '+meta['sourceOrganization']
            s={'id':sid,'label':meta['name']+' · annual history','dataset_id':dataset['id'],'unit':unit,'scope':'world','resource_family':'food_agriculture' if kind=='food' else 'energy','commodity':meta['name'],'stage':'source_indicator','definition':definition,'source_url':'https://data.worldbank.org/indicator/'+code,'sources':[{'id':'wb-wdi-'+code,'publisher':'World Bank; '+meta['sourceOrganization'],'url':url,'download_url':raw_archive['path']}],'limitations':LIMITS+['World Bank regional, income and world aggregates are outside country-map records and remain in the original response archive. API dates outside the first and last available numerical country source year are retained in the original response, rather than offered as empty historical frames.','The API observation-status and footnote fields are retained exactly. An empty status is not an assertion that a value is directly measured or free of uncertainty.'],'reporting_period':'Publisher annual calendar-year labels; source definitions may specify a different energy or agriculture boundary','source_archive':raw_archive['path'],'api_last_updated':data[0].get('lastupdated'),'source_metadata':meta,'numeric_source_years':numeric_years}
            records=[]
            for r in included:
                v=r['value'];eligible=isinstance(v,(int,float)) and math.isfinite(v)
                status=('Unavailable: publisher returned null' if v is None else ('Publisher observation status: '+r['obs_status'] if r.get('obs_status') else 'Publisher numerical value; observation status not supplied'))
                if r.get('footnote'):status+='; '+r['footnote']
                records.append({'series_id':sid,'geo_id':r['countryiso3code'],'geo_name':r['country']['value'],'scope':'world','year':int(r['date']),'period':r['date']+' WDI source year','value':v,'raw_value':v,'status':status,'eligible':eligible,'unit':unit,'source_record':r})
            receipt=packet(s,dataset,records,hosted_scope_note='Annual source history from '+str(first)+' to '+str(last)+'. Country coverage varies; source estimates and nulls are retained. Regional aggregates and every requested raw API cell are in the linked source archive.')
            receipt.update(source_url=url,source_archive=raw_archive['path'],api_rows=len(data[1]),country_rows_in_reporting_extent=len(included),country_empty_rows_outside_reporting_extent=len(outside),aggregate_rows=len(aggregates),source_status_counts=dict(Counter(r.get('obs_status','') for r in included)),source_row_accounting_complete=len(included)+len(outside)+len(aggregates)==len(data[1]))
            receipts.append(receipt);series_list.append(s)
            print(code,len(records),first,last,flush=True)
    for d in datasets.values():d['rows']=sum(s['rows'] for s in series_list if s['dataset_id']==d['id'])
    return series_list,list(datasets.values()),receipts,archives,countries


def keytext(v):
    return unicodedata.normalize('NFKC',v).strip().casefold()


def select_latest(latest, ambiguous, key, vintage, rownum, record):
    """Retain latest publisher edition; ties remain an explicit ambiguity."""
    previous=latest.get(key);candidate=(vintage,rownum,record)
    if previous is None or vintage>previous[0]:
        latest[key]=candidate;ambiguous.pop(key,None)
    elif vintage==previous[0]:
        ambiguous[key].append(candidate)


def usgs_cell(record,geo,year,vintage,rownum,additional):
    raw=record['QUANTITY'];literal=raw.strip()
    isnum=bool(re.fullmatch(r'[-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?',literal)) and literal not in USGS_SENTINELS
    notes=record['STATISTIC_NOTES'];bounded=bool(re.search(r'less than|greater than|not available|withheld',notes,re.I))
    status=notes if notes not in ['', '<null>'] else 'Publisher quantity; no statistic note supplied'
    if literal in USGS_SENTINELS:status+='; '+USGS_SENTINELS[literal]
    if not isnum:status+='; nonnumeric or coded source quantity retained'
    if additional:status+='; multiple rows in latest publication vintage: not combined or mapped'
    return {'geo_id':geo,'geo_name':record['COUNTRY_OR_REGION'],'scope':'world','year':year,'period':str(year)+' source year; MYB '+str(vintage)+' publication vintage','value':float(raw) if isnum else None,'raw_value':raw,'eligible':isnum and not bounded and not additional,'status':status,'unit':record['UNITS'],'source_publication_year':vintage,'source_table':record['DATA_SOURCE'],'source_csv_row':rownum,'source_record':record,'same_latest_vintage_additional_rows':[{'source_csv_row':n,'source_record':sr} for _,n,sr in additional]}


def usgs_histories(refresh,countries):
    item_blob=acquire('https://www.sciencebase.gov/catalog/item/'+USGS_ID+'?format=json','usgs-sciencebase.json',refresh)
    item=json.loads(item_blob); entries={'ScienceBase-item.json':item_blob}
    for f in item['files']:
        entries[f['name']]=acquire(f['url'],f['name'],refresh)
    raw_archive=archive('usgs-world-production-1990-2022-all-vintages.zip',entries)
    lookup={keytext(c['name']):c['id'] for c in countries if c['region']['value']!='Aggregates'}
    full=json.loads(gzip.decompress((PUBLIC/'full-data/catalogue.json.gz').read_bytes()))
    for s in full['series']:
        if s.get('scope')=='world':
            for p in s.get('places',[]):
                if re.fullmatch('[A-Z]{3}',p['id']):lookup.setdefault(keytext(p['name']),p['id'])
    lookup.update({keytext(k):v for k,v in ALIASES.items()})
    current_ids={c['id'] for c in countries if c['region']['value']!='Aggregates'}|{'TWN','GUF','GLP','MTQ','REU','CXR'}
    latest={};source_count=0;geographies=Counter();ambiguous=defaultdict(list)
    csv_blob=entries['USGS_MYB_V1_Production_Data_Release.csv']
    fields=['COMMODITY','COMMODITY_FORM','FORM_DETAIL','UNITS','UNIT_DETAIL']
    for rownum,r in enumerate(csv.DictReader(io.StringIO(csv_blob.decode('utf-8-sig'))),start=2):
        source_count+=1;geographies[r['COUNTRY_OR_REGION']]+=1
        geo=lookup.get(keytext(r['COUNTRY_OR_REGION']))
        if not geo or geo not in current_ids:continue
        m=re.search(r'MYB_(\d{4})_',r['DATA_SOURCE'])
        if not m:raise ValueError('USGS publication year missing '+r['DATA_SOURCE'])
        vintage=int(m.group(1));dims=tuple(r[k] for k in fields);key=(dims,geo,int(r['YEAR']))
        select_latest(latest,ambiguous,key,vintage,rownum,r)
    groups=defaultdict(list)
    for (dims,geo,year),(vintage,rownum,r) in latest.items():
        groups[dims].append(usgs_cell(r,geo,year,vintage,rownum,ambiguous.get((dims,geo,year),[])))
    dataset={'id':'history-usgs-world-minerals','title':'USGS mineral production · annual country histories · 1990–2022','description':'Minerals Yearbook world production CSV. Exact material/form/unit dimensions remain separate. Each country/source-year uses its latest available publication vintage; all publisher vintages remain in the downloadable original CSV archive.','source_url':USGS_DOI,'builtin':True,'license':'CC0 1.0 Universal','source_archive':raw_archive['path'],'sha256':sha(csv_blob),'rows':sum(len(r) for r in groups.values())}
    series_list=[];receipts=[]
    for dims,records in sorted(groups.items()):
        commodity,form,detail,unit,basis=dims
        sid='history-usgs::'+sha(compact(dims))[:20]
        for r in records:r['series_id']=sid
        s={'id':sid,'label':' · '.join(v for v in [commodity,form,detail,basis,unit] if v not in ['Unspecified','<null>',''])+' · annual production','dataset_id':dataset['id'],'unit':unit,'scope':'world','resource_family':'industrial_minerals','commodity':commodity,'stage':'production','material_basis':basis,'native_source_dimensions':dict(zip(fields,dims)),'definition':'USGS Minerals Yearbook world production. Exact commodity, form, form detail, units and unit detail identify this series. Latest publication vintage per source year and country, as identified in every row; source editions are not averaged. '+dataset['description'],'source_url':USGS_DOI,'source_archive':raw_archive['path'],'sources':[{'id':'usgs-world-production-1990-2022','publisher':'U.S. Geological Survey','url':USGS_DOI,'download_url':raw_archive['path'],'license':'CC0 1.0 Universal'}],'limitations':LIMITS+['Latest publication vintage per source year is a declared selection across Minerals Yearbook source tables, not a single frozen survey vintage. Table definitions and rounding may change; original table notes accompany every selected row.','Multiple rows in the same latest publication vintage are unavailable for mapping; their source rows remain attached. Missing latest-vintage values are never replaced by older numerical observations.','World/region totals, historical geographies and unresolved country labels remain in the all-vintages source archive and geography register; no boundary reassignment or worldwide sum is constructed.','Even an unchanged country label may span boundary or reporting changes, such as Sudan. A constant modern polygon does not establish comparable historical territory.','Production is separate from reserves, capacity, consumption or physical shipment flows. Material content and gross mass are separate native dimensions.'],'reporting_period':'Publisher annual source years; per-cell latest publication vintage is explicit'}
        receipt=packet(s,dataset,records,hosted_scope_note='Latest publication vintage per source year; exact material and unit dimensions stay separate. Source table IDs and notes are retained per observation. The complete original CSV retains every publication vintage, aggregate and historical geography.')
        receipt.update(ambiguous_latest_vintage_cells=sum(bool(r['same_latest_vintage_additional_rows']) for r in records));series_list.append(s);receipts.append(receipt)
    crosswalk=[{'source_country_label':label,'iso3':lookup.get(keytext(label)) if lookup.get(keytext(label)) in current_ids else None,'raw_source_rows':n,'mapping':('documented explicit country-name alias' if label in ALIASES else 'exact retained country-name match') if lookup.get(keytext(label)) in current_ids else 'table-only aggregate, historical geography, or unresolved label; no successor assignment'} for label,n in sorted(geographies.items())]
    write_json(RAW/'usgs-country-crosswalk.json',crosswalk)
    accounting={'original_source_rows_all_vintages':source_count,'latest_vintage_country_cells':len(latest),'mapped_country_source_rows_all_vintages':sum(x['raw_source_rows'] for x in crosswalk if x['iso3']),'table_only_geography_source_rows_all_vintages':sum(x['raw_source_rows'] for x in crosswalk if not x['iso3']),'ambiguous_latest_vintage_cells':len(ambiguous),'country_crosswalk':'/data/historical-sources/usgs-country-crosswalk.json','source_csv_sha256':sha(csv_blob),'source_source_url':USGS_DOI}
    print('USGS',len(series_list),dataset['rows'],accounting,flush=True)
    return series_list,[dataset],receipts,[raw_archive],accounting


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--refresh',action='store_true');args=parser.parse_args()
    CACHE.mkdir(parents=True,exist_ok=True);RAW.mkdir(parents=True,exist_ok=True)
    base=json.loads((DATA/'catalogue.json').read_text());index=json.loads((DATA/'evidence-index.json').read_text())
    a,ds,receipts,archives,countries=wb_histories(args.refresh)
    b,ds2,rr,aa,accounting=usgs_histories(args.refresh,countries);a+=b;ds+=ds2;receipts+=rr;archives+=aa
    # Idempotent additive update. Original identifiers and all their objects stay intact.
    previous=[s for s in base['series'] if s['id'].startswith(('history-wdi::','history-usgs::'))]
    previous_ds=[d for d in base['datasets'] if d['id'].startswith(('history-wdi-','history-usgs-'))]
    base['series']=[s for s in base['series'] if s not in previous]
    base['datasets']=[d for d in base['datasets'] if d not in previous_ds]
    base['counts']['series']-=len(previous);base['counts']['datasets']-=len(previous_ds);base['counts']['rows']-=sum(s['rows'] for s in previous)
    old_s={s['id'] for s in base['series']};old_d={d['id'] for d in base['datasets']}
    added=[s for s in a if s['id'] not in old_s];added_d=[d for d in ds if d['id'] not in old_d]
    base['series'].extend(added);base['datasets'].extend(added_d)
    base['counts']['series']+=len(added);base['counts']['datasets']+=len(added_d);base['counts']['rows']+=sum(s['rows'] for s in added)
    base['historical_supplement']={'revision':'historical-resources-2026-11-01','series':len(a),'datasets':len(ds),'country_records':sum(s['rows'] for s in a),'manifest':'/data/historical-resources-manifest.json'}
    for r in receipts:
        if r['id'] in index and index[r['id']]!=r['file']:raise ValueError('Existing evidence identity would change')
        index[r['id']]=r['file']
    write_json(DATA/'catalogue.json',base);write_json(DATA/'evidence-index.json',index)
    csv_path=DATA/'catalogue.csv'
    csv_bytes=csv_path.read_bytes()
    if b'\nhistory-wdi::' in csv_bytes:csv_path.write_bytes(csv_bytes.split(b'\nhistory-wdi::',1)[0]+b'\n')
    with csv_path.open(newline='') as f:fieldnames=next(csv.reader(f))
    with csv_path.open('a',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fieldnames,extrasaction='ignore',lineterminator='\n')
        for s in added:w.writerow(s)
    source_index=json.loads((DATA/'source-index.json').read_text())
    source_index['numeric_datasets']=[d for d in source_index['numeric_datasets'] if not d['id'].startswith(('history-wdi-','history-usgs-'))]
    known={d['id'] for d in source_index['numeric_datasets']}
    source_index['numeric_datasets'].extend(d for d in ds if d['id'] not in known)
    source_index['historical_supplement_manifest']='/data/historical-resources-manifest.json'
    write_json(DATA/'source-index.json',source_index)
    report={'schema':'public-evidence.historical-resources-manifest/v1','revision':'historical-resources-2026-11-01','prepared_utc':datetime.now(timezone.utc).isoformat(),'new_datasets':ds,'new_measures':len(a),'new_country_records':sum(s['rows'] for s in a),'eligible_numeric_country_records':sum(s['numeric_rows'] for s in a),'all_raw_source_archives':archives,'series':receipts,'usgs_source_accounting':accounting,'no_local_imputation':True,'no_numerical_unit_conversion':True,'original_full_data_tree_modified':False,'source_original_archives_preserve_all_requested_rows':True,'world_bank_source_year_rule':'Only first-to-last numeric country reporting-year extent is offered as timeline frames; within-range null cells stay in country records. Every out-of-extent API cell and aggregate stays in original source archive.','usgs_vintage_rule':'Latest publication year for exact commodity/form/detail/unit/basis/country/source-year. Ambiguous same-latest-vintage rows unavailable, not arbitrarily combined. Complete CSV retains every alternative vintage and all geographies.'}
    write_json(DATA/'historical-resources-manifest.json',report)
    guide=['# Historical food, energy and raw-material sources','', 'Added 1 November 2026. Existing maps, source collections and retained observations remain available. These histories contain source records, source estimates and unavailable cells; no missing values have been imputed by the library.','', '| Collection | Measures | Country/territory records | Source years |','| --- | ---: | ---: | --- |']
    for d in ds:
        ss=[s for s in a if s['dataset_id']==d['id']]
        guide.append('| '+d['title']+' | '+str(len(ss))+' | '+format(sum(s['rows'] for s in ss),',')+' | '+str(min(s['first_year'] for s in ss))+'–'+str(max(s['last_year'] for s in ss))+' |')
    guide+=['', '## Meaning and comparison limits', '', 'World Bank food histories include the FAO food, crop and livestock production volume indices (2014–2016 = 100), cereal tonnes, cereal area and yield, and fertilizer-use indicators. An index is separate from commodity tonnage. Energy histories include use per person, electricity generation shares by fuel, renewable electricity, access, intensity and imports. Published percentages, energy-equivalent units and physical units stay distinct. Source definitions and original-provider attribution accompany every measure.', '', 'World Bank API observation-status and footnote fields are preserved. Country nulls within each indicator’s numerical reporting-year extent remain unavailable. API cells outside that extent and regional/income/world aggregates remain in each original response archive. An empty observation-status field does not establish that the value is a direct measurement or has no uncertainty.', '', 'USGS Minerals Yearbook histories cover 1990–2022. Each exact commodity, commodity form, form detail, unit and material basis is a separate measure. The map history selects the latest publication vintage per source year and country, retaining that source table ID, publication year, original quantity and all table/statistic notes. It does not average revisions. If multiple rows remain in the same latest publication vintage, the cell is unavailable for mapping and all competing rows stay attached. A missing latest value is not replaced by an older numerical value.', '', 'USGS source codes -111 (reported below half a unit), -222 (withheld) and -333 (unavailable) are not negative production and are not measured zeros. They remain unavailable, with the literal source code and its explanation retained. Estimates, revisions and rounding notes remain attached. Production is separate from reserves, capacity, consumption and shipments.', '', 'Historical countries and aggregate regions are not assigned to modern successor states. Country/territory labels without retained map polygons remain available through the country selector and source table. The geography register documents every original USGS country label and the exact alias or table-only treatment.', '', '## Source register and original downloads', '', '- [Machine-readable source register, coverage, checksums and row accounting](/data/historical-resources-manifest.json)', '- [USGS country/territory crosswalk and table-only geography accounting](/data/historical-sources/usgs-country-crosswalk.json)', '- [USGS primary release and methodology](https://doi.org/10.5066/P13DFA65) — published 15 October 2026, CC0 1.0 Universal.', '- [World Bank WDI source catalogue](https://databank.worldbank.org/source/world-development-indicators)', '- [World Bank dataset use terms](https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets)', '', 'Every ZIP is reversible packaging of unmodified publisher download bytes. The USGS archive includes the complete 462,845-row CSV with every publication vintage, aggregate and historical country, together with publisher XML metadata and ScienceBase release metadata. WDI archives include the complete API response, original indicator metadata and country/aggregate classification metadata. Original byte lengths and SHA-256 checksums are in the source register.', '']
    guide += ['- ['+r['path'].rsplit('/',1)[-1]+']('+r['path']+')' for r in archives]
    (DATA/'HISTORICAL_RESOURCES.md').write_text('\n'.join(guide)+'\n')
    write_json(PROJECT/'qa/HISTORICAL_RESOURCES_BUILD.json',report)
    print(json.dumps({'new_measures':report['new_measures'],'new_country_records':report['new_country_records'],'datasets':[(d['id'],d['rows']) for d in ds],'max_packet_bytes':max(r['bytes'] for r in receipts),'raw_archives_bytes':sum(r['bytes'] for r in archives),'catalogue_counts':base['counts']}),flush=True)


if __name__=='__main__':main()
