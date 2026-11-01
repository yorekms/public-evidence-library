#!/usr/bin/env python3
"""Append independently acquired early-history fragments without replacing retained data."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public-source/data'


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n')


def integrate(names):
    fragments = [read(DATA / name) for name in names]
    catalogue = read(DATA / 'catalogue.json')
    evidence = read(DATA / 'evidence-index.json')
    series_by_id = {s['id']: s for s in catalogue['series']}
    datasets_by_id = {d['id']: d for d in catalogue['datasets']}
    added = []
    for fragment in fragments:
        for dataset in fragment['datasets']:
            if dataset['id'] in datasets_by_id:
                if datasets_by_id[dataset['id']] != dataset:
                    raise ValueError('Refusing to replace a retained dataset definition: ' + dataset['id'])
            else:
                catalogue['datasets'].append(dataset)
                datasets_by_id[dataset['id']] = dataset
        for series in fragment['series']:
            sid = series['id']
            filename = fragment['evidence'][sid]
            if not filename.startswith('evidence/history-') or '..' in filename:
                raise ValueError('Invalid supplemental evidence path: ' + filename)
            packet = read(DATA / filename)
            if packet['series']['id'] != sid or packet['series']['rows'] != len(packet['records']):
                raise ValueError('Source packet identifier or row count mismatch: ' + sid)
            if sid in series_by_id:
                if series_by_id[sid] != series or evidence.get(sid) != filename:
                    raise ValueError('Refusing to replace a retained measure: ' + sid)
            else:
                catalogue['series'].append(series)
                series_by_id[sid] = series
                added.append(series)
            evidence[sid] = filename
    catalogue['counts'] = {'series': len(catalogue['series']), 'datasets': len(catalogue['datasets']), 'rows': sum(s['rows'] for s in catalogue['series'])}
    catalogue['early_history_register'] = '/data/early-histories-manifest.json'
    catalogue['supplement_revision'] = 'early-histories-2026-11-01'
    catalogue['scope_note'] = 'Complete retained built-in public catalogue plus separately attributed historical collections. All indexed normalized source records are available; geography, periods, units, missingness and source definitions remain attached. Overlapping source records are not independent people, places or shipments.'
    original_csv = (DATA / 'catalogue.csv').read_bytes()
    columns = next(csv.reader(io.StringIO(original_csv.decode('utf-8-sig'))))
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction='ignore', lineterminator='\n')
    for series in added:
        writer.writerow(series)
    source_index = read(DATA / 'source-index.json')
    existing_ids = {d['id'] for d in source_index['numeric_datasets']}
    source_index['numeric_datasets'].extend(d for f in fragments for d in f['datasets'] if d['id'] not in existing_ids)
    source_index['early_history_register'] = '/data/early-histories-manifest.json'
    archives = [archive for f in fragments for archive in f['source_archives']]
    all_new_series = [s for f in fragments for s in f['series']]
    register = {'schema': 'public-evidence.early-histories/v1', 'revision': 'early-histories-2026-11-01', 'source_registers': [f['manifest_path'] for f in fragments], 'datasets': [d['id'] for f in fragments for d in f['datasets']], 'added_measures': len(all_new_series), 'added_records': sum(s['rows'] for s in all_new_series), 'current_catalogue_counts': catalogue['counts'], 'series': [{'id': s['id'], 'file': evidence[s['id']], 'rows': s['rows'], 'scope': s['scope'], 'first_year': s['first_year'], 'last_year': s['last_year'], 'unit': s['unit'], 'sha256': hashlib.sha256((DATA / evidence[s['id']]).read_bytes()).hexdigest()} for s in all_new_series], 'source_archives': archives, 'preservation': 'Earlier definitions, source files and records are retained. Separate sources, units, historical entities and world aggregates are not spliced, reassigned or allocated to current countries.'}
    snapshot = read(DATA / 'snapshot-manifest.json')
    snapshot['current_library']['counts'] = catalogue['counts']
    snapshot['current_library']['early_history_register'] = '/data/early-histories-manifest.json'
    for name, value in [('catalogue.json', catalogue), ('evidence-index.json', evidence), ('source-index.json', source_index), ('snapshot-manifest.json', snapshot), ('early-histories-manifest.json', register)]:
        write(DATA / name, value)
    if added:
        (DATA / 'catalogue.csv').write_bytes(original_csv + output.getvalue().encode('utf-8'))
    print(json.dumps({'new_measures_this_run': len(added), 'early_measures': len(all_new_series), 'early_records': register['added_records'], 'counts': catalogue['counts']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fragments', nargs='+', default=['early-energy-fragment.json', 'early-materials-fragment.json'])
    integrate(parser.parse_args().fragments)
