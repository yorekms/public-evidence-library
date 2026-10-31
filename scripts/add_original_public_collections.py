"""Make all original atlas and household/fiscal/retirement histories readable.

This copies full native rows of four existing built-in collections. It never
reads imported data or participant records and does not invent annual dates.
"""
from pathlib import Path
import urllib.request,urllib.parse,json,hashlib,datetime
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'dist/data';URL='http://127.0.0.1:8772'
def get(path):
 with urllib.request.urlopen(URL+path,timeout=60)as r:return json.load(r)
def save(p,d):p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n')
cat=get('/api/catalog');allowed={d['id']for d in cat['datasets']if d.get('builtin')is True and d['id']in {'frozen-atlas','bea-history','pension-history','fiscal-history'}}
assert len(allowed)==4
index=json.loads((OUT/'evidence-index.json').read_text());report=json.loads((ROOT/'qa/DATA_BUILD.json').read_text());checks={d['id']:d for d in report['evidence_files']};added=[]
for s in cat['series']:
 sid=s['id']
 if s['dataset_id']not in allowed or sid in index:continue
 d=get('/api/data?series='+urllib.parse.quote(sid,safe=''));records=d['records'];assert all(r['series_id']==sid for r in records)
 filename=hashlib.sha256(sid.encode()).hexdigest()[:20]+'.json';sm=d['series'];sm['hosted_scope_note']='All retained observations for this measure in the named built-in dataset. Native dates, reporting populations and unavailable/source-ineligible values remain unchanged.'
 payload={'series':sm,'records':records,'edition':'public-evidence-2026-10-31','hosted_scope_note':sm['hosted_scope_note'],'full_retained_measure_rows':len(records),'hosted_rows':len(records)};p=OUT/'evidence'/filename;save(p,payload);assert p.stat().st_size<24*1024*1024
 index[sid]='evidence/'+filename;entry={'id':sid,'retained_rows':len(records),'hosted_rows':len(records),'file':'data/evidence/'+filename,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'subset':None,'source_record_fields_preserved':True};checks[sid]=entry;added.append(sid)
 if len(added)%40==0:print('Added',len(added),'full native measures',flush=True)
save(OUT/'evidence-index.json',index);report['evidence_files']=list(checks.values());report['hosted_evidence_series']=len(index);report['hosted_rows']=sum(v['hosted_rows']for v in checks.values());report['full_public_collections']=sorted(allowed);save(ROOT/'qa/DATA_BUILD.json',report)
save(ROOT/'qa/ORIGINAL_COLLECTIONS_PUBLIC.json',{'added':len(added),'full_collection_ids':sorted(allowed),'hosted_series':len(index),'hosted_rows':report['hosted_rows'],'dataset_rows_unmodified':True,'retained_native_missing_dates':True,'prepared_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()})
print('COMPLETE',len(added),'added;',len(index),'publicnative measures;',report['hosted_rows'],'rows',flush=True)
