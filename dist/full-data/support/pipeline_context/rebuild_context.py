#!/usr/bin/env python3
"""Rebuild additive source-attached flow context from the unchanged bundled sources."""
from pathlib import Path
from collections import defaultdict
import gzip,json,hashlib,gc,datetime
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'data/pipeline_context'
def read(rel):
 p=ROOT/rel;blob=p.read_bytes();print('Reading',rel,flush=True)
 return json.loads(gzip.decompress(blob)),hashlib.sha256(blob).hexdigest()
def write(name,data):
 p=OUT/name
 with p.open('wb') as f:
  with gzip.GzipFile(fileobj=f,mode='wb',mtime=0) as z:z.write(json.dumps(data,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode())
 return {'file':name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
def slim(row,fields):return {k:row[k] for k in fields if k in row}
AF=['asset_id','source_asset_id','name','asset_type','commodity','commodity_group','country_iso3','country','state','county','latitude','longitude','location_basis','location_accuracy','coordinate_status','map_eligible','workbench_map_eligible','portable_operation','geographic_plausibility','observed_as_of','source_id','source_url','status','frs_id','naics_code','sector','plant_asset_id','technology','source_sheet','source_row','source_row_number','source_feature_indices','location_quality']
RF=['asset_id','plant_asset_id','entity_id','entity_name','role','share_percent','reported_share_percent','share_basis','observed_as_of','reported_ownership_as_of','valid_from','valid_to','temporal_usable','invalid_interval','date_basis','date_precision','observed_precision','source_id','source_url','source_field','source_row','source_row_numbers','relationship_id','relationship_basis','source_plant_code','source_generator_id','control_status','identity_resolved','beneficial_ownership_verified','raw_component','parent_depth','parent_directness','overlap_with_other_entities','shared_boundary_date','interval_end_basis','knowledge_cutoff_date','endpoint_convention','economic_ownership_inferred']
MF=['asset_id','year','observed_as_of','metric','label','chemical_id','chemical_name','value','unit','source_id','eligible','flags','uncertainty','source_field','source_row','source_rows','source_row_numbers','source_sheet','measurement_basis','record_kind','is_aggregate','denominator','reporting_period','source_value']
manifest={'schema':'ridgeway.pipeline-context/v1','built_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'input_fingerprints':{},'ownership_files':{},'environment_files':{},'sources':[],'environment_metrics':{},'inventory_commodities':set(),'scope':['Global GEM public coal/iron mine and processing-map snapshots','U.S. MSHA coal operations and exact coal-receipt MSHA references; current metadata with dated operator/controller history','Virginia EIA annual plants and generator roles, 2015–2025','U.S. EPA GHGRP direct reporting and Virginia TRI chemical reporting','GLEIF certified GEM-to-LEI and accounting-parent snapshots'], 'limitations':['Different source populations and geographic boundaries remain separate.','No facility output, traded quantity, emissions, pollution or economic value is allocated to an owner or a trade link.','Regional inventory points are context, not suppliers/customers or proof that a mapped shipment visited a site.','Source roles include operator, controller, owner, owner-or-operator and accounting parent; none is silently converted to verified ultimate beneficial control.','Environmental observations are annual reports, not exposure, toxicity, health effects or a complete life-cycle footprint.','No nearest source year, interpolated ownership transaction, inferred route or name/proximity match is used.']}
source_map={};owners=defaultdict(lambda:{'assets':[],'roles':[]});env=defaultdict(lambda:{'assets':[],'roles':[],'measures':[]});bridges=[]
def register(rel,b,sha):
 manifest['input_fingerprints'][rel]=sha
 for s in b.get('sources',[]):source_map[s['id']]=s
receipts,receipt_sha=read('data/pipelines/coal_receipts.json.gz');manifest['input_fingerprints']['data/pipelines/coal_receipts.json.gz']=receipt_sha;receipt_msha={n.get('ownership_asset_id') for n in receipts['nodes'] if n.get('ownership_asset_id')};del receipts
b,sha=read('data/ownership/msha.json.gz');register('data/ownership/msha.json.gz',b,sha)
assets=[a for a in b['assets'] if a.get('coal_metal_indicator')=='C' or a['asset_id'] in receipt_msha];ids={a['asset_id'] for a in assets}
for a in assets:manifest['inventory_commodities'].add(a.get('commodity') or 'Coal');a['context_collection']='msha';a['metadata_reference_date']=b.get('source_snapshot_date');a['stage']='preparation_logistics' if str(a.get('asset_type')).casefold()=='facility' else 'extraction'
msha={'cutoff':b.get('date_cutoff'),'assets':[{**slim(a,AF),'context_collection':'msha','metadata_reference_date':a['metadata_reference_date'],'stage':a['stage']} for a in assets],'roles':[slim(r,RF) for r in b['relationships'] if r['asset_id'] in ids]}
manifest['msha']=write('msha_context.json.gz',msha);print('MSHAcontext',len(assets),len(msha['roles']),flush=True);del b,msha,assets;gc.collect()
for rel,cid in [('data/ownership/gem_mines.json.gz','gem_mines'),('data/ownership/processing.json.gz','processing')]:
 b,sha=read(rel);register(rel,b,sha);observations=b.get('asset_observations') or b['assets'];look={}
 for a in observations:
  y=str(a.get('observed_as_of',''))[:4]
  if not y.isdigit():continue
  out={**slim(a,AF),'context_collection':cid,'stage':'extraction' if cid=='gem_mines' else 'processing','location_reference_date':a.get('observed_as_of')}
  owners[y]['assets'].append(out);look[(a['asset_id'],str(a.get('observed_as_of','')))]=out;manifest['inventory_commodities'].add(a.get('commodity') or 'Unspecified')
 for row in b['relationships']:
  if (row['asset_id'],str(row.get('observed_as_of',''))) in look:owners[str(row['observed_as_of'])[:4]]['roles'].append(slim(row,RF))
 del b;gc.collect()
b,sha=read('data/industry/eia_plant_bundle.json.gz');register('data/industry/eia_plant_bundle.json.gz',b,sha);va_ids=set()
for a in b['asset_observations']:
 if a.get('state')!='VA':continue
 y=str(a['observed_as_of']);va_ids.add(a['asset_id']);owners[y]['assets'].append({**slim(a,AF),'context_collection':'eia_plants','stage':'power_generation','location_reference_date':y})
for row in b['relationships']:
 if row['asset_id'] in va_ids:owners[str(row['observed_as_of'])]['roles'].append(slim(row,RF))
manifest['inventory_commodities'].add('electricity');del b;gc.collect()
b,sha=read('data/industry/eia_generator_bundle.json.gz');register('data/industry/eia_generator_bundle.json.gz',b,sha)
for row in b['relationships']:
 if row.get('plant_asset_id') in va_ids:
  r=slim(row,RF);r['generator_asset_id']=row['asset_id'];r['asset_id']=row['plant_asset_id'];r['role_scope']='Reported generator; not a plant equity share';owners[str(row['observed_as_of'])]['roles'].append(r)
del b;gc.collect()
for rel,cid in [('data/industry/ghgrp_compact.json.gz','epa_ghgrp'),('data/industry/tri_va_compact.json.gz','epa_tri_va')]:
 b,sha=read(rel);register(rel,b,sha)
 for a in b['asset_observations']:
  y=str(a.get('observed_as_of',a.get('reporting_year')));env[y]['assets'].append({**slim(a,AF),'context_collection':cid,'stage':'environmental_reporting','location_reference_date':y})
 for row in b['relationships']:
  y=str(row.get('observed_as_of',row.get('reporting_year')));env[y]['roles'].append(slim(row,RF))
 for row in b['measures']:
  # Detailed TRI chemical-unit rows remain distinct; aggregate rows are not substituted or double-summed.
  if row.get('is_aggregate'):continue
  r=slim(row,MF);mid=row['metric']
  if row.get('chemical_id') is not None:mid+='::'+str(row['chemical_id'])+'::'+str(row.get('unit',''))
  r['context_metric']=mid;env[str(row['year'])]['measures'].append(r)
  manifest['environment_metrics'].setdefault(mid,{'id':mid,'label':row.get('label',row['metric'].replace('_',' '))+(' · '+str(row.get('chemical_name',row.get('chemical_id'))) if row.get('chemical_id') is not None else ''),'unit':row.get('unit'),'source_metric':row['metric'],'chemical_id':row.get('chemical_id'),'collection':cid})
 bridges.extend(b.get('crosswalks',[]));del b;gc.collect()
for y,data in sorted(owners.items()):manifest['ownership_files'][y]={**write('ownership_'+y+'.json.gz',data),'assets':len(data['assets']),'roles':len(data['roles'])};print('ownership',y,len(data['assets']),len(data['roles']),flush=True)
for y,data in sorted(env.items()):manifest['environment_files'][y]={**write('environment_'+y+'.json.gz',data),'assets':len(data['assets']),'roles':len(data['roles']),'measures':len(data['measures'])};print('environment',y,len(data['assets']),len(data['measures']),flush=True)
latest_env={}
for y,data in sorted(env.items()):
 for a in data['assets']:
  if a['asset_id'] not in latest_env or str(a.get('observed_as_of',''))>str(latest_env[a['asset_id']].get('observed_as_of','')):latest_env[a['asset_id']]=a
latest_dates={(a['asset_id'],str(a.get('observed_as_of',''))) for a in latest_env.values()}
latest_roles=[r for data in env.values() for r in data['roles'] if (r['asset_id'],str(r.get('observed_as_of',''))) in latest_dates]
manifest['environment_owner_latest']=write('environment_owner_latest.json.gz',{'assets':list(latest_env.values()),'roles':latest_roles,'measures':[]})
manifest['bridges']=write('identifier_bridges.json.gz',{'eia_epa':bridges})
b,sha=read('data/industry/gleif_bundle.json.gz');register('data/industry/gleif_bundle.json.gz',b,sha)
parent={'snapshots':b['snapshots'],'entities':[{k:e.get(k) for k in ['entity_id','name','lei','source_id','observed_as_of','identity_date_basis','source_url']} for e in b['entities']],'asset_links':b['asset_links'],'relationships':[slim(r,['relationship_id','child_entity_id','parent_entity_id','role','relationship_type','relationship_status','observed_as_of','valid_from','valid_to','periods','qualifiers','quantifiers','share_percent','share_basis','date_basis','source_id','source_url']) for r in b['relationships']],'exceptions':[slim(r,['entity_id','relationship_kind','category','reason','reasons','observed_as_of','source_id','source_url','unavailable','date_basis']) for r in b['exceptions']]}
manifest['parents']=write('accounting_parents.json.gz',parent);manifest['parent_snapshots']=[s['observed_as_of'] for s in b['snapshots']];del b,parent;gc.collect()
manifest['sources']=list(source_map.values());manifest['ownership_years']=sorted(set(owners)|{str(y) for y in range(1970,2027)});manifest['environment_years']=sorted(env);manifest['environment_metrics']=list(manifest['environment_metrics'].values());manifest['inventory_commodities']=sorted(manifest['inventory_commodities'],key=str.casefold)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n');print('Complete',sum(p.stat().st_size for p in OUT.glob('*.gz')),flush=True)
