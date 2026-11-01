#!/usr/bin/env python3
"""Build additive early-energy source packets and a fragment for central merging.

Requires requests; xlrd is optional only for inspection of the retained XLS
comparison files. No shared catalogue/index, old evidence, map or R2 file is
modified. Country histories are distinct from historical entities/aggregates.
Run from any directory. Frozen cached publisher bytes are reused by default.
"""
from collections import Counter, defaultdict
from datetime import datetime, timezone
import csv
import gzip
import hashlib
from html.parser import HTMLParser
import io
import json
import math
from pathlib import Path
import re
import zipfile

import requests

PROJECT=Path(__file__).resolve().parents[1]
DATA=PROJECT/'public-source/data'
CACHE=PROJECT/'qa/early_energy_acquisition'
RAW=DATA/'early-energy-sources'
SHIFT='https://raw.githubusercontent.com/dataforgoodfr/shiftdataportal/b69de961ce4beb010661b444b6030fc14b6b9b24/server/data/WORLD_ENERGY_HISTORY_primary_energy_prod.csv'
INTL='https://api.eia.gov/bulk/INTL.zip'
PET='https://api.eia.gov/bulk/PET.zip'
EIA_TERMS='https://www.eia.gov/about/copyrights_reuse.php'
SHIFT_TERMS='https://www.theshiftdataportal.org/legal-notice'
BENCHMARK='https://www.eia.gov/totalenergy/data/annual/txt/ptb1601.html'
BASE_LIMITS=['Frozen publisher source bytes acquired 1 November 2026; this is not a live feed or a claim that all values are direct measurements.','Source units, quantities, source year labels and unavailable values are retained. No local interpolation, carry-forward, averaging, zero filling or numerical unit conversion is performed.','Countries and territories follow the publisher labels and country definitions. Historical borders or reporting populations may change even when a country name does not. Modern map geometry does not establish equivalent historical territory.','Production, consumption, trade, installed capacity and energy-accounting measures are separate. Native energy-content and physical units must not be added as independent quantities.']


def compact(x):return json.dumps(x,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode()
def sha(blob):return hashlib.sha256(blob).hexdigest()
def write(path,value):path.write_bytes(compact(value)+b'\n')


def get(url,name):
    q=CACHE/name
    if not q.exists():
        r=requests.get(url,timeout=180);r.raise_for_status();q.write_bytes(r.content)
    return q.read_bytes()


def archive(name,members):
    q=RAW/name
    with zipfile.ZipFile(q,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for filename,blob in members.items():
            info=zipfile.ZipInfo(filename,(2026,11,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,blob,compresslevel=9)
    return {'path':'/data/early-energy-sources/'+name,'bytes':q.stat().st_size,'sha256':sha(q.read_bytes()),'members':[{'path':n,'bytes':len(b),'sha256':sha(b)} for n,b in members.items()]}


def number(raw):
    if isinstance(raw,(int,float)) and not isinstance(raw,bool):return float(raw) if math.isfinite(raw) else None
    if isinstance(raw,str) and re.fullmatch(r'[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][-+]?\d+)?',raw.strip()):return float(raw)
    return None


def eia_is_current_country(source,current):
    """A geometry hint alone cannot identify a source reporting entity."""
    native_area=source['series_id'].split('-')[-2]
    return source.get('geography') in current and native_area==source.get('geography')


def dataset(identifier,title,url,blob,source_archive,license,description):
    return {'id':identifier,'title':title,'source_url':url,'sha256':sha(blob),'source_archive':source_archive,'license':license,'builtin':True,'description':description,'source_fingerprint_meaning':'SHA-256 of the exact retained publisher CSV/HTML, or the exact selected original JSON series lines; full bulk archive hashes are separately recorded.','evidence_version':'early-energy-2026-11-01'}


SERIES=[];RECEIPTS=[];EVIDENCE={};DATASETS=[];ARCHIVES=[];ACCOUNTING={}


def packet(meta,ds,records,**extra):
    meta.update(dataset_id=ds['id'],years=sorted({r['year'] for r in records}),places=[{'id':k,'name':v} for k,v in sorted({r['geo_id']:r['geo_name'] for r in records}.items())],rows=len(records),numeric_rows=sum(r['eligible'] for r in records),family='energy',resource_family='energy',source_url=meta.get('source_url',ds['source_url']),source_archive=ds['source_archive'],license=ds['license'])
    meta.update(first_year=min(meta['years']),last_year=max(meta['years']),source_year_count=len(meta['years']),native_place_count=len(meta['places']),description=meta['definition'])
    for r in records:r['series_id']=meta['id']
    name='history-early-energy-'+sha(meta['id'].encode())[:20]+'.json';blob=compact({'schema':'public-evidence.early-energy/v1','series':meta,'dataset':ds,'records':records,**extra})+b'\n'
    if len(blob)>19_000_000:raise ValueError('Packet too large '+meta['id'])
    (DATA/'evidence'/name).write_bytes(blob)
    SERIES.append(meta);EVIDENCE[meta['id']]='evidence/'+name
    RECEIPTS.append({'id':meta['id'],'file':'evidence/'+name,'bytes':len(blob),'sha256':sha(blob),'gzip_bytes':len(gzip.compress(blob,compresslevel=9,mtime=0)),'rows':len(records),'eligible_numeric_rows':meta['numeric_rows'],'first_year':meta['first_year'],'last_year':meta['last_year'],'source_year_count':len(meta['years']),'scope':meta['scope']})


def geography():
    # The frozen metadata used by the existing library is reused explicitly.
    original=PROJECT/'qa/history_acquisition/wb-countries.json'
    blob=original.read_bytes() if original.exists() else get('https://api.worldbank.org/v2/country?format=json&per_page=400','countries.json')
    rows=json.loads(blob)[1];current={x['id'] for x in rows if x['region']['value']!='Aggregates'}|{'TWN','GUF','GLP','MTQ','REU','CXR'}
    lookup={x['name'].casefold():x['id'] for x in rows if x['id'] in current}
    lookup.update({'united states of america':'USA','burma':'MMR','brunei darussalam':'BRN','czech republic':'CZE','congo':'COG','democratic republic of the congo':'COD','faeroe islands':'FRO','falkland islands (malvinas)':'FLK','iran':'IRN','ivory coast':'CIV','laos':'LAO','north korea':'PRK','south korea':'KOR','syria':'SYR','swaziland':'SWZ','taiwan':'TWN','tanzania':'TZA','turkey':'TUR','venezuela':'VEN','viet nam':'VNM','bolivia':'BOL'})
    # Mixed historical labels and uncertain untranslated labels are never
    # assigned to modern successor states, including Russian Federation & USSR.
    return blob,current,lookup


def shift_histories(country_blob,current,lookup):
    blob=get(SHIFT,'shift-primary-energy-production.csv');terms=get(SHIFT_TERMS,'shift-legal-notice.html')
    parsed=list(csv.DictReader(io.StringIO(blob.decode('utf-8-sig'))))
    selected=[(n,r) for n,r in enumerate(parsed,start=2) if r['source']=='Etemad & Luciani']
    raw=archive('shift-etemad-original-source.zip',{'WORLD_ENERGY_HISTORY_primary_energy_prod.csv':blob,'publisher-legal-notice.html':terms,'country-classification.json':country_blob})
    ARCHIVES.append(raw)
    license='CC BY-SA 3.0; Etemad & Luciani (1991), machine-readable version distributed by The Shift Project with author agreement; normalization of this branch is shared under CC BY-SA 3.0.'
    ds_country=dataset('early-shift-energy-countries','Historical energy production · Etemad & Luciani / The Shift Project · 1900–1979',SHIFT,blob,raw['path'],license,'Seven native production fuel categories, Mtoe. Exact current-country aliases are mapped; historical entities, regional and world aggregates remain in a separate collection. Conflicting and repeated source cells are not silently combined.')
    ds_other=dataset('early-shift-energy-source-entities','Historical energy production · original regions and historical entities · 1900–1979',SHIFT,blob,raw['path'],license,'Original world, regional and historical-entity accounts, with source country/group classifications retained. They are not allocated to present-day countries.')
    ds_other['aggregate_scope']='original_source_entities'
    DATASETS.extend([ds_country,ds_other])
    groups=defaultdict(list);crosswalk={}
    for n,r in selected:
        mapped=lookup.get(r['group_name'].casefold()) if r['group_type']=='country' else None
        country=bool(mapped and mapped in current)
        geo=mapped if country else 'SHIFT-'+sha((r['group_type']+'|'+r['group_name']).encode())[:9].upper()
        crosswalk[(r['group_type'],r['group_name'])]={'source_group_type':r['group_type'],'source_group_name':r['group_name'],'geo_id':geo,'treatment':'exact country label or documented name alias; retained historical source territory' if country else 'source-defined entity; no successor allocation'}
        key=(country,r['energy_family'],r['energy_unit'],geo,int(r['year']))
        groups[key].append((n,r))
    fuel_groups=defaultdict(list);duplicate_cells=0;conflicting_cells=0
    for (country,fuel,unit,geo,year),items in groups.items():
        repeated=len(items)>1;duplicate_cells+=int(repeated);conflicting_cells+=int(len({r['energy'] for _,r in items})>1)
        raw_value=items[0][1]['energy'];value=number(raw_value) if not repeated else None
        status='Historical production estimate; source supplies no separate cell precision or estimate flag'
        if repeated:status+='; repeated native source key, all original rows retained and not combined'
        row={'geo_id':geo,'geo_name':items[0][1]['group_name'],'scope':'world' if country else 'source_defined','year':year,'period':str(year)+' source reporting year; historical production estimate','value':value,'raw_value':raw_value if not repeated else [r['energy'] for _,r in items],'eligible':value is not None,'status':status,'unit':unit,'source_csv_rows':[n for n,_ in items],'source_records':[r for _,r in items]}
        fuel_groups[(country,fuel,unit)].append(row)
    for (country,fuel,unit),records in sorted(fuel_groups.items()):
        ds=ds_country if country else ds_other;scope='world' if country else 'source_defined'
        meta={'id':'early-energy-shift::'+('countries-' if country else 'source-entities-')+fuel.lower().replace(' ','-'),'label':fuel+' production · '+unit+' · historical '+('countries' if country else 'source entities')+' · 1900–1979','scope':scope,'unit':unit,'commodity':fuel,'stage':'production','definition':'Etemad & Luciani, World Energy Production 1800–1985 (1991), machine-readable historical estimates distributed by The Shift Project. This file’s actual historical rows cover 1900–1979. Source energy unit Mtoe is retained exactly. No join to later EIA or Energy Institute series is performed.','sources':[{'id':'et emad-luciani-shift'.replace(' ',''),'publisher':'Etemad & Luciani; The Shift Project','url':SHIFT,'license':'CC BY-SA 3.0','license_url':SHIFT_TERMS,'download_url':raw['path']}],'limitations':BASE_LIMITS+['This is a historical reconstruction, not a modern meter-reading series. Source-country and imperial/colonial boundaries can differ from modern polygons.','Every repeated native source key is unavailable for mapping, including identical duplicates; all original source row numbers and values remain attached. No numerical sum, average or arbitrary row selection resolves those duplicates.','The source contains both historical Etemad & Luciani and later US EIA rows. This collection uses only rows explicitly attributed to Etemad & Luciani; the entire unmodified CSV remains downloadable.','This branch and its normalization are CC BY-SA 3.0 with attribution to Etemad & Luciani (1991), via The Shift Project, accessed 1 November 2026.'],'reporting_period':'Annual historical source reporting years, 1900–1979; source estimates and repeated-cell ambiguities are explicit'}
        packet(meta,ds,records,hosted_scope_note='Historical estimates in native Mtoe, separate from later energy-accounting editions. Repeated source country/fuel/year keys remain unavailable; all literal rows remain in the source archive.')
    write(RAW/'shift-geography-register.json',list(crosswalk.values()))
    ACCOUNTING['shift']={'original_csv_rows':len(parsed),'historical_etemad_rows':len(selected),'other_source_rows_preserved_in_original':len(parsed)-len(selected),'native_history_cells':len(groups),'repeated_source_keys_unavailable':duplicate_cells,'conflicting_source_keys_unavailable':conflicting_cells,'source_geography_register':'/data/early-energy-sources/shift-geography-register.json','actual_historical_first_year':min(int(r['year']) for _,r in selected),'actual_historical_last_year':max(int(r['year']) for _,r in selected),'publisher_source_url':SHIFT,'publisher_terms':SHIFT_TERMS,'source_csv_sha256':sha(blob)}


PHYSICAL={'Total energy production':'quadrillion Btu','Total energy consumption':'quadrillion Btu','Coal production':'thousand short tons','Coal consumption':'thousand short tons','Coal exports':'thousand short tons','Coal imports':'thousand short tons','Dry natural gas production':'billion cubic feet','Dry natural gas consumption':'billion cubic feet','Dry natural gas exports':'billion cubic feet','Dry natural gas imports':'billion cubic feet','Crude oil including lease condensate production':'thousand barrels per day','Crude oil including lease condensate exports':'thousand barrels per day','Crude oil including lease condensate imports':'thousand barrels per day','Petroleum and other liquids production':'thousand barrels per day','Petroleum and other liquids consumption':'thousand barrels per day','Electricity net generation':'billion kilowatthours','Electricity net consumption':'billion kilowatthours','Electricity imports':'billion kilowatthours','Electricity exports':'billion kilowatthours','Electricity distribution losses':'billion kilowatthours','Renewable electricity net generation':'billion kilowatthours','Hydroelectricity net generation':'billion kilowatthours','Wind electricity net generation':'billion kilowatthours','Solar electricity net generation':'billion kilowatthours','Geothermal electricity net generation':'billion kilowatthours','Biomass and waste electricity net generation':'billion kilowatthours','Nuclear electricity net generation':'billion kilowatthours','Electricity installed capacity':'million kilowatts'}


def eia_international(country_blob,current):
    blob=get(INTL,'eia-intl.zip');z=zipfile.ZipFile(io.BytesIO(blob));selected=[];all_rows=0;all_series=0
    with z.open('INTL.txt') as f:
        for line_number,line in enumerate(f,start=1):
            x=json.loads(line);all_rows+=1
            if 'series_id' in x:all_series+=1
            if x.get('f')=='A' and PHYSICAL.get(x.get('name','').split(',')[0])==x.get('units'):
                selected.append((line_number,line,x))
    selected_blob=b''.join(line for _,line,_ in selected)
    raw=archive('eia-international-selected-original-series.zip',{'INTL-selected-annual-original-lines.txt':selected_blob,'selection.json':compact({'original_bulk_url':INTL,'original_zip_bytes':len(blob),'original_zip_sha256':sha(blob),'member':'INTL.txt','selection':'Annual frequency A, literal measure prefix and native unit in documented PHYSICAL mapping; every country, aggregate and historical source geography for these measures retained.','selected_source_line_numbers':[n for n,_,_ in selected],'measure_unit_selection':PHYSICAL}),'country-classification.json':country_blob,'publisher-reuse-policy.html':get(EIA_TERMS,'eia-reuse.html')})
    ARCHIVES.append(raw)
    ds_country=dataset('early-eia-international-countries','EIA international energy · native physical measures · 1973 onward; coverage varies',INTL,selected_blob,raw['path'],'U.S. government public domain; acknowledgment requested','Twenty-eight literal annual energy measures in publisher physical or energy-content units. Earliest selected source years begin in 1973 for some series; most country coverage begins in 1980 or later. The selected original series lines retain every native observation and source metadata. Broader monthly/quarterly and alternative-unit series remain accessible in the original publisher bulk download.')
    ds_other=dataset('early-eia-international-source-entities','EIA international energy · original aggregate and historical entities',INTL,selected_blob,raw['path'],'U.S. government public domain; acknowledgment requested','Source world/region/group and historical-entity accounts are retained separately, without allocating to current countries.')
    ds_other['aggregate_scope']='original_source_entities';DATASETS.extend([ds_country,ds_other])
    groups=defaultdict(list);source_meta=defaultdict(list);counts=Counter();symbols=Counter();unknown=[]
    for line_number,line,x in selected:
        geo=x.get('geography','');native_area=x['series_id'].split('-')[-2]
        # Geography is a geometry hint, not a unique reporting-entity identity.
        # EIA offshore and predecessor-state series can share a modern ISO hint.
        # They must stay separate from the native whole-country account.
        country=eia_is_current_country(x,current)
        scope='world' if country else 'source_defined';prefix=x['name'].split(',')[0]
        # geo_name is publisher text, not a reconstructed successor country.
        name=x['name'][len(prefix)+2:];name=name[:-8] if name.endswith(', Annual') else name
        record_geo=geo if country else 'EIA-'+sha(native_area.encode())[:9].upper()
        key=(country,x['geoset_id']);source_meta[key].append({k:v for k,v in x.items() if k!='data'})
        for i,observation in enumerate(x.get('data',[])):
            period,raw_value=observation
            if not re.fullmatch(r'\d{4}',period):raise ValueError('Annual EIA period invalid '+x['series_id'])
            value=number(raw_value);status='Publisher annual value; no observation-level estimate flag supplied'
            if value is None:status='Unavailable source code: '+str(raw_value);symbols[str(raw_value)]+=1
            groups[key].append({'geo_id':record_geo,'geo_name':name,'scope':scope,'year':int(period),'period':period+' EIA annual reporting year','value':value,'raw_value':raw_value,'eligible':value is not None,'status':status,'unit':x['units'],'source_series_id':x['series_id'],'source_line':line_number,'source_observation_index':i,'source_observation':observation,'source_last_updated':x.get('last_updated')})
            counts['country_observations' if country else 'aggregate_or_historical_observations']+=1
    for (country,geoset),records in sorted(groups.items()):
        source=source_meta[(country,geoset)];ds=ds_country if country else ds_other;prefix=source[0]['name'].split(',')[0];unit=source[0]['units']
        keys=Counter((r['geo_id'],r['year']) for r in records)
        for r in records:
            if keys[(r['geo_id'],r['year'])]>1:r['eligible']=False;r['status']+='; repeated native place/year, not combined'
        meta={'id':'early-energy-eia-intl::'+('countries-' if country else 'source-entities-')+geoset,'label':prefix+' · '+unit+' · EIA annual '+('countries' if country else 'source entities'),'scope':'world' if country else 'source_defined','unit':unit,'commodity':prefix,'stage':'source_energy_measure','definition':'U.S. Energy Information Administration international data. Native geoset '+geoset+'; source series and observations remain identified per row. The native physical unit is retained; no conversion to WDI, Mtoe, Energy Institute total energy supply or other source editions is performed.','sources':[{'id':'eia-international','publisher':'U.S. Energy Information Administration','url':'https://www.eia.gov/international/data/world','raw_download_url':INTL,'download_url':raw['path'],'license':'Public domain','license_url':EIA_TERMS}],'limitations':BASE_LIMITS+['Selected annual source measures are separate from the retained earlier historical reconstruction and from WDI measures. No automatic stitching fills the 1979/1980 source boundary.','API/bulk metadata do not provide a separate estimate flag for every observation. A numerical source value is not automatically a direct physical measurement.','Source groups and historical or unresolved geographies remain in the source-entities collection rather than being assigned to modern countries.'],'reporting_period':'Native EIA annual reporting years; individual series start and end years vary'}
        packet(meta,ds,records,source_series=source,hosted_scope_note='Native annual EIA source measures, with country and source-entity accounts kept separate. Source series metadata and original observations are retained; this is not joined to other editions.')
    ACCOUNTING['eia_international']={'original_bulk_url':INTL,'original_bulk_zip_bytes':len(blob),'original_bulk_zip_sha256':sha(blob),'original_member_bytes':z.getinfo('INTL.txt').file_size,'original_member_lines':all_rows,'original_series_count':all_series,'selected_original_annual_series':len(selected),'selected_original_lines_sha256':sha(selected_blob),'selection':PHYSICAL,'observation_counts':dict(counts),'unavailable_source_symbols':dict(symbols)}


def mer_histories():
    members={};groups=defaultdict(list);row_counts={};source_tables={}
    for table in ['T01.02','T01.03']:
        url='https://www.eia.gov/totalenergy/data/browser/csv.php?tbl='+table
        blob=get(url,'eia-mer-'+table+'.csv');members[table+'.csv']=blob;rows=list(csv.DictReader(io.StringIO(blob.decode('utf-8-sig'))));row_counts[table]={'all_rows':len(rows),'annual_rows':sum(r['YYYYMM'].endswith('13') for r in rows),'other_period_rows':sum(not r['YYYYMM'].endswith('13') for r in rows)}
        for n,r in enumerate(rows,start=2):
            if not r['YYYYMM'].endswith('13'):continue
            key=(table,r['MSN'],r['Description'],r['Unit']);value=number(r['Value'])
            groups[key].append({'geo_id':'USA','geo_name':'United States','scope':'world','year':int(r['YYYYMM'][:4]),'period':r['YYYYMM'][:4]+' annual EIA reporting total (native month 13)','value':value,'raw_value':r['Value'],'eligible':value is not None,'status':'Publisher annual energy estimate; no cell-level estimate flag supplied' if value is not None else 'Unavailable source text: '+r['Value'],'unit':r['Unit'],'source_csv_row':n,'source_record':r,'source_table':table})
        source_tables[table]=url
    raw=archive('eia-us-monthly-energy-review-original-tables.zip',members);ARCHIVES.append(raw)
    ds=dataset('early-eia-us-energy-review','United States energy production and consumption · EIA MER · 1949 onward','https://www.eia.gov/totalenergy/data/monthly/',b''.join(members.values()),raw['path'],'U.S. government public domain; acknowledgment requested','Annual month-13 source rows from native EIA production/consumption tables. Monthly observations remain in the original CSV downloads and are not combined into constructed annual totals.');DATASETS.append(ds)
    for (table,msn,label,unit),records in sorted(groups.items()):
        meta={'id':'early-energy-eia-mer::'+table+'-'+msn,'label':'United States · '+label+' · '+unit+' · annual history','scope':'world','unit':unit,'commodity':label,'stage':'production' if table=='T01.02' else 'consumption','source_url':source_tables[table],'definition':'EIA Monthly Energy Review table '+table+', native source code '+msn+'. Only the publisher annual month-13 total is used; monthly cells are not summed. Native definition and energy-content unit remain distinct from historical benchmarks and physical oil/gas/coal quantities.','sources':[{'id':'eia-mer-'+table,'publisher':'U.S. Energy Information Administration','url':source_tables[table],'download_url':raw['path'],'license':'Public domain','license_url':EIA_TERMS}],'limitations':BASE_LIMITS+['The same fuel can appear in a component and a total; series cannot be added across the catalogue.','Wood and wood-derived fuels in modern source tables differ from historical fuelwood-only benchmarks. These collections are separate; missing 1946–1948 years are not constructed.'],'reporting_period':'Native annual source totals; YYYYMM ending 13 denotes the publisher annual row'}
        packet(meta,ds,records,hosted_scope_note='United States national annual source totals, with actual native reporting years and original CSV text. Monthly records remain separate in the original source archive.')
    ACCOUNTING['eia_mer']={'source_tables':source_tables,'source_row_accounting':row_counts,'annual_rows_total':sum(len(r) for r in groups.values())}


def crude_history():
    # API bulk retains pre-1900 years, unlike the date-limited XLS export.
    names=['PET.MCRFPUS1.A','PET.MCRFPUS2.A'];found={}
    for name in names:
        q=CACHE/(name+'.json')
        if q.exists():found[name]=q.read_bytes()
    if len(found)!=len(names):
        blob=get(PET,'eia-petroleum.zip');z=zipfile.ZipFile(io.BytesIO(blob))
        with z.open(z.namelist()[0]) as f:
            for line in f:
                x=json.loads(line)
                if x.get('series_id') in names:
                    found[x['series_id']]=line;(CACHE/(x['series_id']+'.json')).write_bytes(line)
    if set(found)!=set(names):raise ValueError('Official EIA annual crude oil series missing')
    raw=archive('eia-us-crude-original-series.zip',{name+'.json':blob for name,blob in found.items()});ARCHIVES.append(raw)
    ds=dataset('early-eia-us-crude','United States crude-oil field production · native annual EIA series','https://www.eia.gov/dnav/pet/pet_crd_crpdn_adc_mbbl_a.htm',b''.join(found[k] for k in sorted(found)),raw['path'],'U.S. government public domain; acknowledgment requested','Two distinct native source measures: annual thousand barrels and annual-average thousand barrels per day. They are parallel views of production, not separate output to sum.');DATASETS.append(ds)
    for native,blob in sorted(found.items()):
        x=json.loads(blob);records=[]
        for i,observation in enumerate(x['data']):
            period,raw_value=observation;value=number(raw_value)
            records.append({'geo_id':'USA','geo_name':'United States','scope':'world','year':int(period),'period':period+' native annual EIA reporting year','value':value,'raw_value':raw_value,'eligible':value is not None,'status':'Publisher annual value; source series notes remain attached' if value is not None else 'Unavailable source text: '+str(raw_value),'unit':x['units'],'source_series_id':native,'source_observation_index':i,'source_observation':observation})
        meta={'id':'early-energy-eia-crude::'+native,'label':x['name']+' · '+x['units']+' · annual history','scope':'world','unit':x['units'],'commodity':'Crude oil','stage':'field_production','definition':'U.S. Energy Information Administration native series '+native+'. '+x['name']+'. Quantities are not converted, annualized or joined to other editions.','sources':[{'id':native,'publisher':'U.S. Energy Information Administration','url':'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s='+native.split('.')[1]+'&f=A','raw_download_url':PET,'download_url':raw['path'],'license':'Public domain','license_url':EIA_TERMS}],'limitations':BASE_LIMITS+['The earliest source years are historical estimates and geographic coverage can change. The fixed modern polygon does not represent historical U.S. borders.','Annual volume and annual-average daily production have different units. They must not be summed as distinct output.'],'reporting_period':'Native annual reporting years; quantity versus annual daily average remains a separate source series'}
        packet(meta,ds,records,source_series={k:v for k,v in x.items() if k!='data'},hosted_scope_note='Unmodified native annual production history. Actual first and last source years follow the retained official bulk series, including pre-1900 dates when supplied.')
    ACCOUNTING['eia_us_crude']={'original_bulk_url':PET,'selected_native_series':names,'source_year_extents':{k:[json.loads(v).get('start'),json.loads(v).get('end')] for k,v in found.items()},'full_bulk_zip_sha256':sha((CACHE/'eia-petroleum.zip').read_bytes()) if (CACHE/'eia-petroleum.zip').exists() else None}


class TableParser(HTMLParser):
    def __init__(self):super().__init__();self.rows=[];self.row=[];self.cell=None
    def handle_starttag(self,t,a):
        if t=='tr':self.row=[]
        if t in ['td','th']:self.cell=[]
    def handle_data(self,d):
        if self.cell is not None:self.cell.append(d)
    def handle_endtag(self,t):
        if t in ['td','th'] and self.cell is not None:self.row.append(' '.join(''.join(self.cell).split()));self.cell=None
        if t=='tr':self.rows.append(self.row)


def benchmark_histories():
    blob=get(BENCHMARK,'eia-historical-benchmarks.html');parser=TableParser();parser.feed(blob.decode('cp1252'))
    rows=[(n,r) for n,r in enumerate(parser.rows,start=1) if r and re.fullmatch(r'\d{4}',r[0])]
    if not rows or any(len(r)!=10 for _,r in rows):raise ValueError('Benchmark table shape changed')
    labels=['Coal','Natural gas','Petroleum','Total fossil fuels','Conventional hydroelectric power','Fuelwood','Total renewable energy','Electricity net imports','Total primary energy']
    raw=archive('eia-us-historical-benchmark-original.zip',{'ptb1601.html':blob,'parsed-original-cells.json':compact(parser.rows)});ARCHIVES.append(raw)
    ds=dataset('early-eia-us-benchmarks','Historical U.S. energy estimates · selected benchmark years · 1635–1945',BENCHMARK,blob,raw['path'],'U.S. government public domain; acknowledgment requested','Sparse publisher benchmarks in source-defined historical U.S. geography, kept separate from annual country-map histories. Early fuelwood represents decade averages assigned by the publisher to mid-decade years.');ds['aggregate_scope']='historical_us_source_geography';DATASETS.append(ds)
    notes=[r for r in parser.rows if r and not re.fullmatch(r'\d{4}',r[0])][-3:]
    for col,label in enumerate(labels,start=1):
        records=[]
        for n,cells in rows:
            literal=cells[col];numeric_literal=literal
            # A superscript footnote 1 accompanies the 1945 wood value; the
            # literal cell stays attached and only that explicit marker is removed.
            if cells[0]=='1945' and label=='Fuelwood' and literal.startswith('1 '):numeric_literal=literal[2:]
            value=number(numeric_literal)
            status='Publisher historical estimate at a selected source year'
            if literal=='(s)':status='Published amount below 0.0005 quadrillion Btu; not a measured zero'
            elif literal=='NA':status='Not available'
            elif value is None:status='Not applicable or nonnumeric publisher symbol: '+literal
            if int(cells[0])<=1845 and label in ['Fuelwood','Total renewable energy','Total primary energy']:status+='; source decade-average estimate assigned to mid-decade year'
            records.append({'geo_id':'US-HIST','geo_name':'Historical United States · publisher geographic coverage','scope':'source_defined','year':int(cells[0]),'period':cells[0]+' selected publisher benchmark year','value':value,'raw_value':literal,'eligible':value is not None,'status':status,'unit':'Quadrillion Btu','source_html_row':n,'source_column':col,'source_original_cell':literal,'source_row_cells':cells})
        meta={'id':'early-energy-eia-benchmark::'+label.lower().replace(' ','-'),'label':'Historical United States · '+label+' · selected benchmark years','scope':'source_defined','unit':'Quadrillion Btu','commodity':label,'stage':'estimated_consumption','definition':'EIA Annual Energy Review Table E1, Estimated Primary Energy Consumption in the United States, Selected Years, 1635–1945. These are sparse historical estimates, not an annual measured sequence. Early fuelwood decade averages were assigned by the publisher to the fifth year of the decade.','sources':[{'id':'eia-aer-table-e1','publisher':'U.S. Energy Information Administration; original historical references retained in table footnotes','url':BENCHMARK,'download_url':raw['path'],'license':'Public domain','license_url':EIA_TERMS}],'limitations':BASE_LIMITS+['This collection uses source-defined historical U.S. geography. It is table/history evidence, not a present-day-country choropleth.','For years not shown, the source states that no data are available. No intervening annual observations are manufactured.','There is a documented fuelwood-only versus wood/wood-derived-fuels discontinuity between 1945 and 1949. The benchmark collection is not joined to modern MER annual series.','Source symbols NA, not-applicable dashes and (s) below publication precision remain unavailable rather than zero.'],'reporting_period':'Selected historical benchmark years; early wood data represent publisher-assigned decade averages','source_table_notes':notes}
        packet(meta,ds,records,source_table_notes=notes,hosted_scope_note='Sparse historical benchmarks in source-defined U.S. geography. Only actual supplied years appear. Early wood estimates represent decade averages; the 1945/1949 source discontinuity remains separate.')
    ACCOUNTING['eia_us_benchmarks']={'source_years':[int(r[0]) for _,r in rows],'source_benchmark_rows':len(rows),'source_columns':labels,'source_country_map_allocation':False,'annual_interpolation':False}


def main():
    CACHE.mkdir(parents=True,exist_ok=True);RAW.mkdir(parents=True,exist_ok=True)
    country_blob,current,lookup=geography()
    shift_histories(country_blob,current,lookup)
    eia_international(country_blob,current)
    mer_histories()
    crude_history()
    benchmark_histories()
    for ds in DATASETS:ds['rows']=sum(s['rows'] for s in SERIES if s['dataset_id']==ds['id'])
    manifest={'schema':'public-evidence.early-energy-manifest/v1','revision':'early-energy-2026-11-01','prepared_utc':datetime.now(timezone.utc).isoformat(),'datasets':DATASETS,'series':RECEIPTS,'source_archives':ARCHIVES,'source_accounting':ACCOUNTING,'measure_count':len(SERIES),'records':sum(s['rows'] for s in SERIES),'country_map_records':sum(s['rows'] for s in SERIES if s['scope']=='world'),'source_defined_records':sum(s['rows'] for s in SERIES if s['scope']!='world'),'source_defined_entities_not_allocated_to_modern_countries':True,'old_evidence_or_maps_modified':False,'no_join_across_source_editions':True,'license_boundary':'The Etemad & Luciani / Shift branch and its normalization are CC BY-SA 3.0. EIA branches are U.S. government public-domain source data. Existing unrelated collections keep their own licenses.'}
    write(DATA/'early-energy-manifest.json',manifest)
    fragment={'schema':'public-evidence.additive-history-fragment/v1','revision':'early-energy-2026-11-01','datasets':DATASETS,'series':SERIES,'evidence':EVIDENCE,'manifest_path':'/data/early-energy-manifest.json','source_archives':ARCHIVES}
    write(DATA/'early-energy-fragment.json',fragment)
    write(PROJECT/'qa/EARLY_ENERGY_BUILD.json',manifest)
    guide=['# Earlier energy histories','', 'Prepared 1 November 2026. Existing histories are preserved; source branches are separate and are never silently stitched together.','', '| Collection | Measures | Records | Actual source years |','| --- | ---: | ---: | --- |']
    for ds in DATASETS:
        ss=[s for s in SERIES if s['dataset_id']==ds['id']]
        guide.append('| '+ds['title']+' | '+str(len(ss))+' | '+format(sum(s['rows'] for s in ss),',')+' | '+str(min(s['first_year'] for s in ss))+'–'+str(max(s['last_year'] for s in ss))+' |')
    guide+=['','Country maps use exact source country identities or documented name aliases. Original historical countries, regions, world accounts and uncertain source labels remain in the source-defined collection rather than being allocated to successors. Modern polygons are a navigation aid, not evidence of unchanged historical borders.','','The Etemad & Luciani branch contains historical production estimates (Mtoe) from 1900–1979, published in World Energy Production 1800–1985 (1991) and distributed by The Shift Project with author agreement. This branch and its normalization are **CC BY-SA 3.0**. Attribution: Etemad & Luciani (1991), via The Shift Project, accessed 1 November 2026. Every repeated native country/fuel/year key remains unavailable, with all original rows attached; no sum, average or arbitrary choice resolves conflicting values.','','EIA international annual histories use separately declared native physical/energy units and actual country reporting years. Selected original annual series lines contain all native observations, unavailable source symbols and series metadata. The full current publisher bulk download is linked in the register, with its acquired checksum. Monthly, quarterly and alternative-unit source series are outside this selected evidence branch, not deleted from any existing collection.','','U.S. MER production and consumption histories use only the publisher annual month-13 rows; monthly data are retained in the original downloads and are not summed locally. U.S. crude-oil annual volume and annual-average daily production remain separate parallel measures. The sparse 1635–1945 benchmark collection uses source-defined historical U.S. geography and publisher decade-average fuelwood assignments; it is not an annual country-map series. The source explicitly documents a fuelwood-only/wood-and-derived-fuels discontinuity between 1945 and 1949.','','No missing value, withheld cell, source symbol or duplicate ambiguity is converted to zero. No local numerical unit conversion, historical border allocation, interpolation or join across source editions is performed.','','- [Complete earlier-energy source register, accounting and checksums](/data/early-energy-manifest.json)','- [Shift historical geography register](/data/early-energy-sources/shift-geography-register.json)','- [The Shift Project publisher reuse terms](https://www.theshiftdataportal.org/legal-notice)','- [EIA publisher reuse terms](https://www.eia.gov/about/copyrights_reuse.php)','']
    guide+=['- ['+x['path'].rsplit('/',1)[-1]+']('+x['path']+')' for x in ARCHIVES]
    (DATA/'EARLY_ENERGY.md').write_text('\n'.join(guide)+'\n')
    print(json.dumps({'measures':len(SERIES),'records':manifest['records'],'country_map_records':manifest['country_map_records'],'source_defined_records':manifest['source_defined_records'],'source_archive_bytes':sum(x['bytes'] for x in ARCHIVES),'compressed_packet_bytes':sum(x['gzip_bytes'] for x in RECEIPTS),'largest_packet_bytes':max(x['bytes'] for x in RECEIPTS),'datasets':[(d['id'],d['rows']) for d in DATASETS]}),flush=True)


if __name__=='__main__':main()
