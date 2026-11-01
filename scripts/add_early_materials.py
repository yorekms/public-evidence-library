#!/usr/bin/env python3
"""Read public-domain USGS DS140 originals into an additive, source-attached fragment.

No existing catalogue, evidence, index, renderer or observation is overwritten.
Numeric values are native typed cells or publisher-cached formula values; no
workbook calculation, unit conversion or missing-value substitution is performed.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urljoin
from collections import Counter
import argparse, hashlib, io, json, math, re, shutil, warnings, zipfile
import openpyxl

PROJECT=Path(__file__).resolve().parents[1]
DATA=PROJECT/'public-source/data'
CACHE=PROJECT/'qa/early_materials_acquisition'
SOURCES=DATA/'historical-sources'
LANDING='https://www.usgs.gov/centers/national-minerals-information-center/historical-statistics-mineral-commodities-united'
REVISION='early-materials-ds140-2026-11-01'
LIMITS=[
 'United States source observations and publisher world totals are separate datasets; a world total is never assigned to individual countries.',
 'Native units, quantities, monetary unit values, source text, unavailable cells and source notes remain attached. No numerical unit conversion, interpolation, carry-forward, zero filling, summation or recalculation is performed.',
 'A workbook is a retained publication vintage. Publisher estimates, apparent-consumption calculations and inflation adjustments retain their original source meaning; these are not new model results.',
 'Blank, NA, W, footnote-only and other nonnumeric cells remain unavailable rather than zero. Workbook-wide and table notes may qualify multiple observations; the absence of a cell flag does not establish a directly measured value.',
 'Calendar years and geography follow this source. Boundaries, reporting methods, physical forms and coverage may change; compare the exact native column definition and notes.',
]
class Links(HTMLParser):
 def __init__(self):super().__init__();self.items=[];self.href=None;self.parts=[]
 def handle_starttag(self,tag,attrs):
  if tag=='a':self.href=dict(attrs).get('href');self.parts=[]
 def handle_data(self,d):
  if self.href:self.parts.append(d)
 def handle_endtag(self,tag):
  if tag=='a' and self.href:self.items.append((self.href,''.join(self.parts).strip()));self.href=None

def compact(v):return json.dumps(v,ensure_ascii=False,allow_nan=False,separators=(',',':'),default=str).encode()
def sha(v):return hashlib.sha256(v).hexdigest()
def write(path,value):path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(compact(value)+b'\n')
def links(blob):p=Links();p.feed(blob.decode());return p.items
def get(url,name,refresh=False):
 path=CACHE/name
 if refresh or not path.exists():
  request=Request(url,headers={'User-Agent':'Mozilla/5.0 (source-preserving USGS public-data research)'})
  with urlopen(request,timeout=120) as response:blob=response.read()
  path.write_bytes(blob)
 return path.read_bytes()
def acquire(pair,refresh=False):
 url,_=pair
 if url.lower().split('?')[0].endswith('.xlsx'):download=url;page_name=None
 else:
  page_name=url.rstrip('/').split('/')[-1]+'.html';page=get(url,page_name,refresh)
  download=next(urljoin(url,u) for u,t in links(page) if '.xlsx' in u.lower())
 name=download.split('?')[0].split('/')[-1];blob=get(download,name,refresh)
 if not zipfile.is_zipfile(io.BytesIO(blob)):raise ValueError('Source is not an XLSX ZIP: '+download)
 return {'source_page':url,'download_url':download,'filename':name,'source_page_file':page_name,'bytes':len(blob),'sha256':sha(blob)}
def clean(s):return ' '.join(str(s).split())
def numeric(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
def annual(v):return numeric(v) and int(v)==v and 1800<=v<=2100

def unit_for(header,statement):
 # Explicit native column units and physical bases override table defaults.
 if '%' in header:return '%; native column percentage, no rescaling'
 basis=re.search(r'\((gross weight|metal content|lithium content|lithium carbonate equivalent)\)',header,re.I)
 if basis:
  mass=re.search(r'(metric tons\s*(?:\(t\))?)',statement,re.I)
  if mass:return clean(mass.group(1))+' '+basis.group(1)
 constant=re.search(r'98\s*\$\s*/\s*([^)]*)',header)
 if constant:return '1998 constant US dollars per '+constant.group(1).strip()
 if '$' in header:
  expression=re.search(r'\(([^)]*\$[^)]*)\)',header)
  return (expression.group(1) if expression else header)+'; nominal current US dollars'
 # Preserve literal physical basis; never assume the general metric-ton default.
 match=re.search(r'All\s+(?:values|quantities)\s+(?:are\s+)?in\s+(.+?)(?:\s+unless\s+otherwise\s+noted|\]$)',statement,re.I)
 return clean(match.group(1)) if match else clean(statement).strip('[]') or 'Native workbook unit; inspect column and table notes'

def parse_workbook(source,datasets,archive_path):
 path=CACHE/source['filename'];blob=path.read_bytes()
 with warnings.catch_warnings():
  warnings.simplefilter('ignore',UserWarning)
  formulas=openpyxl.load_workbook(io.BytesIO(blob),data_only=False)
  cached=openpyxl.load_workbook(io.BytesIO(blob),data_only=True)
 series=[];evidence={};receipts=[];sheet_inventory=[]
 for sheet in formulas:
  values=cached[sheet.title]
  year_rows=[row[0].row for row in sheet if annual(row[0].value)]
  if not year_rows:
   sheet_inventory.append({'sheet':sheet.title,'annual_rows':0,'treatment':'Nonannual worksheet retained unchanged in original workbook archive.'});continue
  first=year_rows[0];header_rows=[r for r in range(1,first) if clean(sheet.cell(r,1).value).casefold()=='year'];header_row=header_rows[-1] if header_rows else None
  year_counts=Counter(int(sheet.cell(r,1).value) for r in year_rows);duplicate_years=sorted(y for y,n in year_counts.items() if n>1)
  if header_row is None:
   raise ValueError('Unrecognized annual table header: '+source['filename']+' / '+sheet.title)
  prelude=[{'cell':c.coordinate,'value':c.value} for row in sheet.iter_rows(max_row=first-1) for c in row if c.value is not None]
  notes=[{'cell':c.coordinate,'value':c.value} for row in sheet.iter_rows(min_row=year_rows[-1]+1) for c in row if c.value is not None]
  title=clean(sheet.cell(1,1).value or sheet.title)
  commodity=re.sub(r'\s+STATISTICS\d*\s*$','',title,flags=re.I).title()
  all_formats={};skipped=[];sheet_series=0
  for col in range(2,sheet.max_column+1):
   header_cells=[]
   for hr in range(header_row,first):
    hc=sheet.cell(hr,col)
    for merged in sheet.merged_cells.ranges:
     if merged.min_row<=hr<=merged.max_row and merged.min_col<=col<=merged.max_col:
      hc=sheet.cell(merged.min_row,merged.min_col);break
    if hc.value is not None and hc.coordinate not in [h['cell'] for h in header_cells]:header_cells.append({'cell':hc.coordinate,'value':hc.value})
   if not header_cells:continue
   raw_header=' · '.join(str(h['value']) for h in header_cells);header=clean(raw_header)
   typed=sum(numeric(values.cell(r,col).value) for r in year_rows)
   if not typed:
    skipped.append({'column':openpyxl.utils.get_column_letter(col),'header':raw_header,'reason':'No typed numeric or cached formula observations; all cells remain in original workbook.'});continue
   statement_cells=[c for c in sheet[3] if c.value is not None and c.column<=col]
   statement=clean(statement_cells[-1].value) if statement_cells else ''
   unit=unit_for(header,statement);aggregate=bool(re.search(r'\bworld\b',header,re.I))
   dataset=datasets['world' if aggregate else 'usa'];scope='world_aggregate' if aggregate else 'world';geo='WLD' if aggregate else 'USA';geo_name='World total (publisher aggregate)' if aggregate else 'United States'
   sid='early-materials::'+sha(compact([source['filename'],sheet.title,col,raw_header]))[:24]
   source_url=source['source_page'];years=sorted({int(sheet.cell(r,1).value) for r in year_rows})
   label=commodity+' · '+clean(sheet.title)+' · '+header+' · '+('World total' if aggregate else 'United States')
   native={'workbook':source['filename'],'worksheet':sheet.title,'column':openpyxl.utils.get_column_letter(col),'column_header':raw_header,'native_header_cells':header_cells,'table_unit_statement':statement,'workbook_sha256':source['sha256']}
   metadata={'id':sid,'label':label,'dataset_id':dataset['id'],'scope':scope,'resource_family':'industrial_minerals','family':'industrial_minerals','commodity':commodity,'stage':header,'unit':unit,'source_url':source_url,'definition':'USGS Data Series 140. Native '+('publisher world aggregate' if aggregate else 'United States')+' column: '+header+'. Table unit statement: '+statement+'. Source workbook: '+source['filename']+'; worksheet: '+sheet.title+'. '+('This is one world total, with no country breakdown and no country map.' if aggregate else 'A United States series is one country’s history, not worldwide country coverage.'),'native_source_dimensions':native,'years':years,'places':[{'id':geo,'name':geo_name}],'first_year':years[0],'last_year':years[-1],'source_year_count':len(years),'native_place_count':1,'reporting_period':'Annual publisher calendar-year table; retained workbook vintage','sources':[{'id':'usgs-ds140-'+source['filename'],'publisher':'U.S. Geological Survey','url':source_url,'download_url':source['download_url'],'retained_archive_url':archive_path,'sha256':source['sha256'],'license':'Public domain, U.S. Geological Survey'}],'source_archive':archive_path,'source_workbook_sha256':source['sha256'],'source_prelude':prelude,'source_table_notes':notes,'ambiguous_source_years':duplicate_years,'limitations':LIMITS+['Physical quantities and nominal or 1998-dollar unit values are different columns. The constant-dollar calculation was made by the publisher and is not recomputed here.'],'aggregate_geography':aggregate,'display_reference':None}
   metadata['description']=metadata['definition'];records=[]
   for row in year_rows:
    cell=sheet.cell(row,col);cache=values.cell(row,col);raw=cell.value;v=cache.value
    eligible=numeric(v);year=int(sheet.cell(row,1).value);formula=raw if cell.data_type=='f' else None
    text=clean(raw) if isinstance(raw,str) else None
    if eligible:status='Publisher-cached formula value; not recalculated' if formula else 'Publisher typed numeric cell; consult native table notes for estimates, revisions and definitions'
    elif raw is None or (isinstance(raw,str) and not raw.strip()):status='Unavailable: blank native source cell'
    elif text=='W':status='Withheld: native source W'
    elif text=='NA':status='Unavailable: native source NA'
    elif formula:status='Unavailable: publisher formula has no numeric cached value; not recalculated'
    else:status='Unavailable: nonnumeric native source cell '+str(raw)
    if year_counts[year]>1:
     eligible=False;status+='; duplicate native source year: alternative source cells retained, not combined or mapped; no year correction inferred from filename'
    if cell.comment:status+='; publisher cell comment: '+cell.comment.text
    records.append({'series_id':sid,'geo_id':geo,'geo_name':geo_name,'scope':scope,'year':year,'period':str(year)+' native DS140 calendar year','unit':unit,'value':v if eligible else None,'raw_value':raw,'eligible':eligible,'status':status,'source_record':{'workbook':source['filename'],'workbook_sha256':source['sha256'],'worksheet':sheet.title,'cell':cell.coordinate,'year_cell':sheet.cell(row,1).coordinate,'column_header':raw_header,'native_header_cells':header_cells,'cell_value':raw,'cell_data_type':cell.data_type,'cell_number_format':cell.number_format,'cached_value':v,'formula':formula,'comment':cell.comment.text if cell.comment else None}})
   metadata.update(rows=len(records),numeric_rows=sum(r['eligible'] for r in records))
   name='history-early-materials-'+sha(sid.encode())[:20]+'.json';file='evidence/'+name
   packet={'schema':'public-evidence.supplementary-history/v1','series':metadata,'dataset':dataset,'records':records,'hosted_scope_note':('Publisher world-total history; not a country comparison or worldwide country map. ' if aggregate else 'United States only; this adds earlier source years without implying worldwide country coverage. ')+str(years[0])+'–'+str(years[-1])+'. Original workbook, native units, unavailable cells, formula caches and table notes are retained.'}
   write(DATA/file,packet);series.append(metadata);evidence[sid]=file;sheet_series+=1
   receipts.append({'id':sid,'file':file,'rows':len(records),'eligible_numeric_rows':metadata['numeric_rows'],'first_year':years[0],'last_year':years[-1],'source_year_count':len(years),'scope':scope,'workbook':source['filename'],'sheet':sheet.title,'column':native['column'],'bytes':(DATA/file).stat().st_size,'sha256':sha((DATA/file).read_bytes())})
  sheet_inventory.append({'sheet':sheet.title,'annual_rows':len(year_rows),'first_year':min(int(sheet.cell(r,1).value) for r in year_rows),'last_year':max(int(sheet.cell(r,1).value) for r in year_rows),'series':sheet_series,'duplicate_native_year_labels':duplicate_years,'unmapped_columns_without_numeric_values':skipped,'source_prelude':prelude,'source_table_notes':notes})
 return series,evidence,receipts,sheet_inventory

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--refresh',action='store_true');parser.add_argument('--research-cache');args=parser.parse_args()
 CACHE.mkdir(parents=True,exist_ok=True);SOURCES.mkdir(exist_ok=True)
 if args.research_cache:
  for path in Path(args.research_cache).glob('*'):
   if path.is_file() and path.suffix in ['.xlsx','.html'] and not (CACHE/path.name).exists():shutil.copy2(path,CACHE/path.name)
 landing=get(LANDING,'landing.html',args.refresh);pairs=[(urljoin(LANDING,u),t) for u,t in links(landing) if t=='XLSX']
 with ThreadPoolExecutor(max_workers=6) as pool:sources=list(pool.map(lambda p:acquire(p,args.refresh),pairs))
 archive=SOURCES/'early-materials-usgs-ds140-originals.zip';members={p.name:p.read_bytes() for p in CACHE.iterdir() if p.suffix in ['.html','.xlsx']}
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for name,blob in sorted(members.items()):info=zipfile.ZipInfo(name,(2026,11,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,blob,compresslevel=9)
 archive_info={'path':'/data/historical-sources/'+archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes()),'members':[{'path':n,'bytes':len(b),'sha256':sha(b)} for n,b in sorted(members.items())]}
 base={'builtin':True,'source_url':LANDING,'license':'Public domain, U.S. Geological Survey','source_archive':archive_info['path'],'sha256':sha(compact([{'filename':s['filename'],'sha256':s['sha256']} for s in sources])),'source_vintage':'Individual source workbook updates through2014–2023; acquired1November2026; exact native modification statements retained'}
 datasets={k:{**base,'id':'early-usgs-ds140-'+k,'title':'USGS DS140 · '+('United States supply, demand and unit values' if k=='usa' else 'publisher world-production totals')+' · historical annual tables','description':'Native annual column observations from '+str(len(sources))+' original public-domain commodity workbooks. '+('United States history only.' if k=='usa' else 'One publisher world aggregate, not country observations.'),'scope':'world' if k=='usa' else 'world_aggregate'} for k in ['usa','world']}
 series=[];evidence={};receipts=[];workbook_inventory=[]
 for source in sources:
  a,b,c,sheets=parse_workbook(source,datasets,archive_info['path']);series+=a;evidence.update(b);receipts+=c;workbook_inventory.append({**source,'worksheets':sheets});print(source['filename'],len(a),sum(r['rows'] for r in c),flush=True)
 for k,d in datasets.items():d['rows']=sum(s['rows'] for s in series if s['dataset_id']==d['id']);d['series_count']=sum(s['dataset_id']==d['id'] for s in series)
 report={'schema':'public-evidence.early-materials-manifest/v1','revision':REVISION,'prepared_utc':datetime.now(timezone.utc).isoformat(),'source_url':LANDING,'source_workbooks':len(sources),'source_archives':[archive_info],'new_measures':len(series),'new_records':sum(s['rows'] for s in series),'usa_records':datasets['usa']['rows'],'world_aggregate_records':datasets['world']['rows'],'eligible_numeric_records':sum(s['numeric_rows'] for s in series),'earliest_year':min(s['first_year'] for s in series),'latest_year':max(s['last_year'] for s in series),'series':receipts,'workbooks':workbook_inventory,'no_numerical_unit_conversion':True,'no_recalculation':True,'no_aggregate_country_assignment':True,'existing_files_modified':False,'cell_extraction_rule':'Columns with a native header and at least one typed numeric or publisher-cached numeric formula cell in native annual rows. All annual cells in included columns retained, including blank, NA, W and other nonnumeric text; no numeric text or formulas are calculated. All worksheets, other columns, embedded objects and formatting remain unchanged in original XLSX archive.'}
 manifest_path='/data/early-materials-manifest.json';write(DATA/'early-materials-manifest.json',report)
 fragment={'schema':'public-evidence.additive-history-fragment/v1','revision':REVISION,'datasets':list(datasets.values()),'series':series,'evidence':evidence,'manifest_path':manifest_path,'source_archives':[archive_info]};write(DATA/'early-materials-fragment.json',fragment)
 write(PROJECT/'qa/EARLY_MATERIALS_BUILD.json',report)
 guide='# Earlier material histories: USGS Data Series140\n\n'+str(len(sources))+' original public-domain commodity workbooks are preserved, including their embedded notes and source formatting. '+str(len(series))+' native annual column series add '+str(report['new_records'])+' cells spanning '+str(report['earliest_year'])+'–'+str(report['latest_year'])+'. Coverage varies by commodity and column.\n\nUnited States observations and publisher world-production totals are separate datasets. World totals are source aggregates and never supply values to country polygons. Production, trade, stocks, consumption and physical or monetary unit values remain separate columns. Nominal and1998-dollar unit values retain the publisher adjustments; nothing is recalculated.\n\nTyped numeric cells and publisher-cached numeric formula values are extracted. Every included annual cell keeps its workbook, sheet, cell address, literal header, native number format, original value, formula/cache and source comment. Blank, NA, W and other nonnumeric source cells stay unavailable. The series includes all native table notes and prelude; full XLSX bytes, omitted nonnumeric-only columns, embedded notes/objects and every original worksheet remain downloadable in the archive.\n\nOriginal source: ['+LANDING+']('+LANDING+'). Source workbook hashes, member hashes, units, table notes, coverage, row accounting and packet checksums are in[the manifest](/data/early-materials-manifest.json). The[original-source archive]('+archive_info['path']+') preserves the downloaded source bytes.\n';(SOURCES/'EARLY_MATERIALS_SOURCES.md').write_text(guide)
 print(json.dumps({k:report[k] for k in ['new_measures','new_records','usa_records','world_aggregate_records','eligible_numeric_records','earliest_year','latest_year']}),flush=True)

if __name__=='__main__':main()
