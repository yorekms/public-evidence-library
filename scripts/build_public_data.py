"""Prepare an additive, source-linked public snapshot from the running local registry.

Only verified built-in datasets are included. No imported/user data or poll records
are read. Full rows are kept for hosted selected evidence; large county examples
use the declared VA/IA source subset. Originals are not modified.
"""
from pathlib import Path
import urllib.request,urllib.parse,json,csv,hashlib,datetime,shutil
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT.parent;WB=BASE/'Public_Data_Workbench_2026-10-30_Global_Footprints_Trade_Policy';OUT=ROOT/'dist/data';URL='http://127.0.0.1:8772'
def get(path):
 with urllib.request.urlopen(URL+path,timeout=120)as r:return json.load(r)
def save(path,data):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n')
cat=get('/api/catalog');datasets=[d for d in cat['datasets']if d.get('builtin')is True];allowed={d['id']for d in datasets};series=[s for s in cat['series']if s['dataset_id']in allowed]
assert len(datasets)==22 and len(series)==7811,'Unexpected source edition; inspect rather than silently broadening publication.'
def metadata(s):
 ys=s.get('years',[]);return {'id':s['id'],'label':s['label'],'dataset_id':s['dataset_id'],'unit':s.get('unit',''),'scope':s.get('scope',''),'family':s.get('resource_family','other'),'commodity':s.get('commodity',''),'stage':s.get('stage',''),'first_year':min(ys)if ys else None,'last_year':max(ys)if ys else None,'source_year_count':len(ys),'rows':s.get('rows',0),'source_url':s.get('source_url',''),'description':s.get('definition',''),'source_program':s.get('native_source_dimensions',{}).get('SOURCE_DESC',''),'reference_period':s.get('native_source_dimensions',{}).get('REFERENCE_PERIOD_DESC',''),'native_place_count':len(s.get('places',[]))}
public_ds=[{k:d[k]for k in ['id','title','rows','description','source_url','sha256','raw_download_url','raw_retrieval_utc','source_quality','source_scope','source_snapshot_date','license']if k in d}for d in datasets]
counts={'series':len(series),'datasets':len(datasets),'rows':sum(d['rows']for d in datasets)}
public={'edition':'public-evidence-2026-10-31','prepared_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'counts':counts,'scope_note':'Complete measure catalogue from retained built-in workbench collections. Some collections overlap in source years; these are retained records, not independent people, places or shipments. Only the selected evidence files are hosted interactively here.','series':[metadata(s)for s in series],'datasets':public_ds}
save(OUT/'catalogue.json',public)
with (OUT/'catalogue.csv').open('w',newline='')as f:
 writer=csv.DictWriter(f,fieldnames=list(public['series'][0]));writer.writeheader();writer.writerows(public['series'])
questions=json.loads(Path('/tmp/learning_questions_public.json').read_text())
for q in questions:
 q.pop('workbench_path',None)
 q['evidence_series']=list(dict.fromkeys(q['evidence_series']))
 q['prompts']=[s.replace('Change from a recent source-year map to each state’s available time series.','Compare each state’s available time series, then narrow the source-year window to a recent period.').replace('Open the separate customs-export map and identify its reporting-country scope.','In the linked customs source, identify the reporting country, commodity and period before comparing exports.')for s in q['prompts']]
ids=sorted({sid for q in questions for sid in q.get('evidence_series',[])})
assert all(sid in {s['id']for s in series}for sid in ids)
index={};checks=[]
for sid in ids:
 d=get('/api/data?series='+urllib.parse.quote(sid,safe=''));rows=d['records'];s=d['series'];selected=rows
 subset=None
 if s['scope']=='us_counties':
  selected=[r for r in rows if str(r.get('geo_id',''))[:2]in {'51','19'}]
  subset='Hosted subset: all retained records with native five-digit county identifiers beginning 51 (Virginia) or 19 (Iowa). Other counties remain in the full retained research dataset and original USDA downloads.'
 elif s['scope']=='world':
  keep={'USA','CAN','CHN','IND','BRA','RUS','DEU','GBR','FRA','AUS','UKR','UK','US','IN','CN','BR','RU','CA','AU','UA','250','251','231','41','100','21','185','79','229','68','10','230'}
  # The actual registry uses native FAOSTAT area IDs; select named native places rather than inventing a crosswalk.
  names={'united states of america','canada','china','china, mainland','india','brazil','russian federation','germany','united kingdom of great britain and northern ireland','france','australia','ukraine'}
  selected=[r for r in rows if str(r.get('geo_name','')).lower()in names]
  subset='Hosted subset: selected named reporting countries/economies, retaining their original source IDs and all available source years. The complete country collection remains in the original source.'
  assert selected,sid
 place_ids={str(r['geo_id'])for r in selected};sm={k:v for k,v in s.items()if k not in ['places']};sm['places']=[p for p in s.get('places',[])if str(p['id'])in place_ids];sm['years']=sorted({r['year']for r in selected if r.get('year')is not None});sm['hosted_scope_note']=subset or 'All retained observations for this measure in the named built-in dataset.'
 filename=hashlib.sha256(sid.encode()).hexdigest()[:20]+'.json';payload={'series':sm,'records':selected,'edition':public['edition'],'hosted_scope_note':sm['hosted_scope_note'],'full_retained_measure_rows':len(rows),'hosted_rows':len(selected)};save(OUT/'evidence'/filename,payload)
 size=(OUT/'evidence'/filename).stat().st_size;assert size<24*1024*1024,(sid,size)
 index[sid]='evidence/'+filename;checks.append({'id':sid,'retained_rows':len(rows),'hosted_rows':len(selected),'file':'data/evidence/'+filename,'bytes':size,'sha256':hashlib.sha256((OUT/'evidence'/filename).read_bytes()).hexdigest(),'subset':subset,'source_record_fields_preserved':True})
 print('Prepared',sid,len(selected),'rows',size,'bytes',flush=True)
save(OUT/'questions.json',questions);save(OUT/'evidence-index.json',index)
# Preserve source inventories across the non-numerical workspaces as references,
# not as invented additions to the numerical-series or independent-row counts.
inventories=[]
for group in ['pipelines','ownership','industry','footprints','pipeline_context','trade_policy','us_counties']:
 p=WB/'data'/group/'manifest.json';d=json.loads(p.read_text());entry={'group':group,'schema':d.get('schema'),'manifest_sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 if 'collections'in d:entry['collections']=[{k:v for k,v in c.items()if k in ['id','title','years','nodes','edges','records','geographic_scope','time_semantics','metrics']}for c in d['collections']]
 if 'bundles'in d:entry['bundles']=[{k:v for k,v in c.items()if k not in ['file']}for c in d['bundles']]
 for key in ['title','scope','sources','years','limitations','counts']:
  if key in d:entry[key]=d[key]
 inventories.append(entry)
source_index={'edition':public['edition'],'numeric_datasets':public_ds,'other_source_inventories':inventories,'access_note':'Public publisher references and frozen source identities. Full local normalized packs and private/imported tables are not uploaded by this build. Original source links retain their publisher terms and definitions.'}
save(OUT/'source-index.json',source_index)
# Copy bounded source/definition guides as downloadable text, never private reports.
(OUT/'guides').mkdir(exist_ok=True)
for name in ['GLOBAL_RESOURCE_RESEARCH_FRAMEWORK.md','US_FOOD_HISTORY_SOURCE_GUIDE.md','US_FOOD_SOURCE_QUALITY.md','GLOBAL_FOOTPRINTS_AND_GOVERNMENT_GUIDE.md','PIPELINE_GUIDE.md','TRADE_POLICY_SOURCES.md','STATISTICAL_METHODS.md']:
 text=(WB/'docs'/name).read_text();text=text.replace(str(BASE),'[local research workspace]').replace('http://127.0.0.1:8772/','[local research view] ')
 (OUT/'guides'/name).write_text(text)
report={'schema':'public-learning-build/v1','counts':counts,'questions':len(questions),'hosted_evidence_series':len(index),'hosted_rows':sum(c['hosted_rows']for c in checks),'evidence_files':checks,'existing_data_modified':False,'user_imports_or_poll_records_read':False,'all_selected_row_fields_preserved':True,'public_data_scope':'Complete built-in measure catalogue; declared selected native evidence subsets; original publisher links for full sources.'};save(ROOT/'qa/DATA_BUILD.json',report)
shutil.copy2('/tmp/learning_questions.json',ROOT/'qa/QUESTION_PROPOSAL_PRIVATE_PATHS.json');shutil.copy2('/tmp/learning_questions.md',ROOT/'QUESTION_RESEARCH_NOTES.md')
print('COMPLETE',json.dumps({k:report[k]for k in ['counts','questions','hosted_evidence_series','hosted_rows']}),flush=True)
