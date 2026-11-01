"""Export native flat-map geometry and exact original-workbench projected 3D regions.

Reads retained source files without changing them. Projection is the original
Python implementation, including dateline splitting and AK/HI display insets.
"""
from pathlib import Path
import argparse
import hashlib
import importlib
import json
import sys
from types import SimpleNamespace


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    blob = (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode()
    path.write_bytes(blob)
    return {'file': str(path), 'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest()}


def export(source_root, output):
    sys.path.insert(0, str(source_root))
    original = importlib.import_module('workbench.map_scene')
    atlas_path = source_root / 'data/atlas.json'
    geometries = json.loads(atlas_path.read_text())['geometry']
    # Reuse the original loader, including its native-identifier and source-hash
    # checks. The separately stored county pack stays a flat map.
    geography_loader = importlib.import_module('workbench.geography_packs')
    geography_loader.load_county_geography(SimpleNamespace(root=source_root, geographies=geometries))
    receipt = {'source_atlas_sha256': hashlib.sha256(atlas_path.read_bytes()).hexdigest(), 'native': {}, 'projected': {}}
    for scope, geometry in geometries.items():
        receipt['native'][scope] = save(output / 'geography' / (scope + '.json'), geometry)
        if scope not in {'world', 'us_states', 'virginia'}:
            continue
        features = original.project_features(geometry, scope)
        projection = ('Albers equal-area contiguous U.S. with separately scaled AK/HI cartographic insets' if scope == 'us_states' else 'Equirectangular display with dateline splitting' if scope == 'world' else 'Local equirectangular display')
        clips = [{'geo_id': 'HI', 'longitude': [-161, -154], 'latitude': [18, 23], 'interpretation': 'Main Hawaiian islands shown in the cartographic inset; northwestern outlines outside this display window are omitted. The entire native Hawaii observation is unchanged.'}] if scope == 'us_states' and any(f['id'] == 'HI' for f in features) else []
        pack = {'schema': 'public-workbench.projected-geometry/v1', 'scope': scope, 'features': features, 'bounds': original._bounds([p for f in features for p in f['polygons']]), 'provenance': {'geometry_sha256': hashlib.sha256(json.dumps(geometry, sort_keys=True).encode()).hexdigest(), 'projection': projection, 'display_clips': clips, 'projected_geometry_note': 'Generated with unchanged original workbench.map_scene.project_features. Display projection and insets do not reallocate native source observations.'}}
        receipt['projected'][scope] = save(output / 'map-geometry' / (scope + '.json'), pack)
    save(output / 'map-geometry' / 'export-receipt.json', receipt)
    return receipt


def reference_cases(source_root, destination):
    """Freeze bounded original-Python results for independently exercised JS parity."""
    sys.path.insert(0, str(source_root))
    original = importlib.import_module('workbench.map_scene')
    public_data = Path(__file__).resolve().parents[1] / 'public-source/data'
    index = json.loads((public_data / 'evidence-index.json').read_text())
    catalogue = json.loads((public_data / 'catalogue.json').read_text())
    geometries = json.loads((source_root / 'data/atlas.json').read_text())['geometry']
    cases = []
    for sid, start, end in [('food-history-qcl::656-5510-t', 2009, 2010), ('bea::SARPP-1', 2015, 2016)]:
        entry = json.loads((public_data / index[sid]).read_text())
        series = entry['series']
        dataset = next(d for d in catalogue['datasets'] if d['id'] == series['dataset_id'])
        registry = SimpleNamespace(series={sid: series}, records={sid: entry['records']}, datasets={dataset['id']: dataset}, geographies=geometries)
        payload = {'series_id': sid, 'start_year': start, 'end_year': end}
        scene = original.build_scene(registry, payload)
        expected = {key: scene[key] for key in ['schema', 'scope', 'years', 'available_years', 'frames', 'bounds', 'scale']}
        expected['geometry_sha256'] = scene['provenance']['geometry_sha256']
        expected['missing_years'] = scene['provenance']['missing_years']
        expected['table_only_records'] = scene['provenance']['table_only_records']
        cases.append({'series_id': sid, 'payload': payload, 'expected': expected})
    save(destination, {'generator': 'Unchanged original Python workbench.map_scene.build_scene', 'cases': cases})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--reference-tests', type=Path)
    args = parser.parse_args()
    result = export(args.source_root.resolve(), args.output.resolve())
    if args.reference_tests:
        reference_cases(args.source_root.resolve(), args.reference_tests.resolve())
    print(json.dumps({kind: {scope: row['bytes'] for scope, row in result[kind].items()} for kind in ['native', 'projected']}))
