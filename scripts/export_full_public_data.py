#!/usr/bin/env python3
"""Read built-in frozen sources and export lossless, bounded static JSON/gzip shards.

No source files, existing public evidence, imported tables or poll responses are changed.
Requires ijson (installed separately in the task-local .deps directory).
"""
from __future__ import annotations
import collections
import datetime
import gzip
import hashlib
import json
import pathlib
import sys
import time
import urllib.request

TASK=pathlib.Path(__file__).resolve().parents[1]
ROOT=TASK.parent
SOURCE=ROOT/'Public_Data_Workbench_2026-10-30_Global_Footprints_Trade_Policy'
OUTPUT=ROOT/'Public_Learning_Library_2026-10-31'/'public-source'/'full-data'
sys.path.insert(0,str(TASK/'.deps'))
sys.path.insert(0,str(SOURCE))
import ijson

LIMIT=16*1024*1024
EXPECTED={'datasets':22,'series':7811,'records':13431313}
def encoded(value):
    return json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode('utf-8')
def sha_file(path):
    result=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(8*1024*1024),b''):result.update(block)
    return result.hexdigest()
def digest(text):return hashlib.sha256(text.encode()).hexdigest()[:20]
def write_json(path,value):
    content=encoded(value);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(content+b'\n')
def write_gzip(path,value):
    content=encoded(value);path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('wb') as raw:
        with gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0,compresslevel=6) as stream:stream.write(content)
    return {'path':'/full-data/'+str(path.relative_to(OUTPUT)),'bytes':path.stat().st_size,'uncompressed_bytes':len(content),'sha256':sha_file(path),'json_sha256':hashlib.sha256(content).hexdigest()}

class Shard:
    def __init__(self,sid,number):
        self.sid=sid;self.path=OUTPUT/'series'/(digest(sid)+'-'+str(number).zfill(4)+'.json.gz')
        self.raw=self.path.open('wb');self.gzip=gzip.GzipFile(filename='',mode='wb',fileobj=self.raw,mtime=0,compresslevel=5)
        self.json_hash=hashlib.sha256();self.bytes=0;self.records=0;self.years=set()
        self.write(b'{"series_id":'+encoded(sid)+b',"records":[')
    def write(self,content):self.gzip.write(content);self.json_hash.update(content);self.bytes+=len(content)
    def add(self,row,content):
        if self.records:self.write(b',')
        self.write(content);self.records+=1
        if row.get('year') is not None:self.years.add(row['year'])
    def finish(self):
        self.write(b']}');self.gzip.close();self.raw.close()
        h=hashlib.sha256();size=0
        with gzip.open(self.path,'rb') as stream:
            for block in iter(lambda:stream.read(4*1024*1024),b''):h.update(block);size+=len(block)
        if size!=self.bytes or h.hexdigest()!=self.json_hash.hexdigest():raise ValueError('Gzip roundtrip differs: '+str(self.path))
        if self.path.stat().st_size>=20*1024*1024 or self.bytes>=20*1024*1024:raise ValueError('Shard exceeds size limit.')
        return {'path':'/full-data/'+str(self.path.relative_to(OUTPUT)),'records':self.records,'bytes':self.path.stat().st_size,'uncompressed_bytes':self.bytes,'sha256':sha_file(self.path),'json_sha256':h.hexdigest(),'years':sorted(self.years)}

def main():
    started=time.monotonic();OUTPUT.mkdir(parents=True,exist_ok=True);(OUTPUT/'series').mkdir(exist_ok=True);(OUTPUT/'metadata').mkdir(exist_ok=True)
    with urllib.request.urlopen('http://127.0.0.1:8772/api/catalog',timeout=30) as stream:catalogue=json.load(stream)
    datasets={d['id']:d for d in catalogue['datasets'] if d.get('builtin') is True}
    metadata={s['id']:s for s in catalogue['series'] if s['dataset_id'] in datasets}
    counts={'datasets':len(datasets),'series':len(metadata),'records':sum(s['rows'] for s in metadata.values())}
    if counts!=EXPECTED:raise ValueError('Built-in catalogue differs from authorized collection: '+str(counts))
    catalogue={**catalogue,'datasets':list(datasets.values()),'series':list(metadata.values()),'schema':'public-evidence.full-data-catalogue/v1','counts':counts}
    catfile=write_gzip(OUTPUT/'catalogue.json.gz',catalogue)
    index={'schema':'public-evidence.full-data-index/v1','complete':False,'counts':counts,'series':{}}
    for did,dataset in datasets.items():
        values={sid:meta for sid,meta in metadata.items() if meta['dataset_id']==did}
        m=write_gzip(OUTPUT/'metadata'/(digest(did)+'.json.gz'),{'schema':'public-evidence.full-data-metadata/v1','dataset':dataset,'series':values})
        for sid,meta in values.items():index['series'][sid]={'dataset_id':did,'label':meta['label'],'scope':meta['scope'],'records':meta['rows'],'metadata_path':m['path'],'metadata_sha256':m['sha256'],'parts':[]}
    provenance={'schema':'public-evidence.full-data-provenance/v1','prepared_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_workbench':SOURCE.name,'scope':'All 22 original built-in numerical collections. No user imports, poll answers, downsampling, estimates, filled gaps or numeric conversions added.','record_representation':'Exact normalized row objects and original field values; JSON whitespace and gzip packaging differ. Registry metadata, source links, native flags, original/normalized bundle hashes and eligibility fields are retained.','datasets':list(datasets.values()),'input_files':[],'catalogue_asset':catfile}
    active={};seen=collections.Counter();dataset_counts=collections.Counter();source_entries=[]
    def close(sid):
        writer=active.pop(sid,None)
        if writer:index['series'][sid]['parts'].append(writer.finish())
    def add(row,did):
        sid=row.get('series_id')
        if sid not in metadata or metadata[sid]['dataset_id']!=did:raise ValueError('Unexpected or cross-dataset row: '+str(sid))
        content=encoded(row);writer=active.get(sid)
        if writer and writer.records and writer.bytes+len(content)+4>LIMIT:close(sid);writer=None
        if writer is None:writer=active[sid]=Shard(sid,len(index['series'][sid]['parts'])+1)
        writer.add(row,content);seen[sid]+=1;dataset_counts[did]+=1
    def finish_dataset(did):
        for sid in list(active):close(sid)
        for sid,meta in metadata.items():
            if meta['dataset_id']==did and seen[sid]!=meta['rows']:raise ValueError('Row accounting differs for '+sid)
        if dataset_counts[did]!=datasets[did]['rows']:raise ValueError('Dataset row accounting differs: '+did)
        write_json(OUTPUT/'index.json',index)
        print(json.dumps({'dataset':did,'records':dataset_counts[did],'elapsed_seconds':round(time.monotonic()-started,1),'parts_so_far':sum(len(entry['parts']) for entry in index['series'].values())}),flush=True)
    # Reuse the original exact normalization code only for the four small atlas,
    # BEA, pension and fiscal collections, without loading the giant packs again.
    from workbench.data import Registry
    import workbench.resource_packs,workbench.geography_packs
    workbench.resource_packs.load_resource_packs=lambda *args,**kwargs:None
    workbench.geography_packs.load_county_geography=lambda *args,**kwargs:None
    class BaseSources(Registry):
        def add(self,dataset,series,records):
            did=dataset['id']
            for row in records:add(row,did)
            finish_dataset(did)
    base=BaseSources.__new__(BaseSources);base.root=SOURCE;base.datasets={};base.series={};base.records={};base.geographies={}
    Registry.load_builtins(base)
    for path in [SOURCE/'data'/'atlas.json',SOURCE/'data'/'bea_history.csv',SOURCE/'data'/'pension_history.csv']:
        provenance['input_files'].append({'path':str(path.relative_to(SOURCE)),'bytes':path.stat().st_size,'sha256':sha_file(path)})
    for folder in ['resource_packs','food_history','us_food_history']:
        manifest=SOURCE/'data'/folder/'manifest.json';source_entries.extend((manifest.parent,entry) for entry in json.loads(manifest.read_text())['packs'])
        provenance['input_files'].append({'path':str(manifest.relative_to(SOURCE)),'bytes':manifest.stat().st_size,'sha256':sha_file(manifest)})
    for folder,entry in source_entries:
        source=folder/entry['file'];fingerprint=sha_file(source)
        if fingerprint!=entry['sha256']:raise ValueError('Original source bundle fingerprint differs: '+source.name)
        did=entry['dataset_id'];source_count=0
        with gzip.open(source,'rb') as stream:
            for row in ijson.items(stream,'records.item',use_float=True):add(row,did);source_count+=1
        if source_count!=entry['rows']:raise ValueError('Manifest row accounting differs: '+did)
        provenance['input_files'].append({'path':str(source.relative_to(SOURCE)),'bytes':source.stat().st_size,'sha256':fingerprint,'dataset_id':did,'records':source_count})
        finish_dataset(did)
    if set(seen)!=set(metadata) or sum(seen.values())!=EXPECTED['records']:raise ValueError('Full collection completeness failed.')
    index['complete']=True;write_json(OUTPUT/'index.json',index);write_json(OUTPUT/'provenance.json',provenance)
    parts=[part for entry in index['series'].values() for part in entry['parts']]
    files=[OUTPUT/name for name in ['catalogue.json.gz','index.json','provenance.json']]+list((OUTPUT/'metadata').glob('*.json.gz'))+list((OUTPUT/'series').glob('*.json.gz'))
    receipt={'schema':'public-evidence.full-data-export-qa/v1','prepared_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':True,'counts':counts,'records_exported':sum(seen.values()),'dataset_records':dict(dataset_counts),'scopes':dict(collections.Counter(s['scope'] for s in metadata.values())),'parts':len(parts),'files':len(files),'bytes':sum(p.stat().st_size for p in files),'max_part_bytes':max(p['bytes'] for p in parts),'max_part_uncompressed_bytes':max(p['uncompressed_bytes'] for p in parts),'all_part_gzip_roundtrips_match_serialized_original_rows':True,'source_fingerprints_checked':len(provenance['input_files']),'no_existing_public_evidence_files_written':True,'elapsed_seconds':round(time.monotonic()-started,3),'catalogue':catfile,'index_sha256':sha_file(OUTPUT/'index.json'),'provenance_sha256':sha_file(OUTPUT/'provenance.json'),'limitations':['Original normalized source objects are preserved; gzip/JSON formatting differs from the source pack.','Geometry and original UI runtime are verified separately.','No source numeric adjustments, regional exclusions, year exclusions or record filters were applied.']}
    write_json(TASK/'qa'/'FULL_DATA_EXPORT_QA.json',receipt)
    print(json.dumps(receipt,indent=2),flush=True)

if __name__=='__main__':main()
