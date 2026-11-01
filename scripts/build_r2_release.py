"""Build a small Worker/static release while retaining complete source files outside its archive.

public-source is never changed. Every full-data file is fingerprinted into the
Worker allowlist; upload runtime bytes separately with the authenticated loader.
Bootstrap keeps the existing v8 index/app until all source objects are present.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess


def digest(path):
    hasher = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            hasher.update(chunk)
    return hasher.hexdigest()


def build(project, mode, bootstrap_commit):
    source = project / 'public-source'
    output = project / 'dist'
    if not (source / 'index.html').is_file() or not (source / 'full-data/index.json').is_file():
        raise ValueError('The intact public-source tree and complete full-data index are required.')
    manifest = json.loads((project / '.openai/hosting.json').read_text())
    if manifest.get('static') is not None or manifest.get('r2') != 'BUCKET':
        raise ValueError('Worker release requires r2: BUCKET and no static hosting configuration.')
    sources = {}
    for path in sorted((source / 'full-data').rglob('*')):
        if path.is_symlink():
            raise ValueError('Public source files must not be symlinks.')
        if not path.is_file():
            continue
        size = path.stat().st_size
        if size > 20_000_000:
            raise ValueError('Public source file exceeds the bounded ingestion size: ' + str(path.relative_to(source)))
        sources['/' + path.relative_to(source).as_posix()] = {'bytes': size, 'sha256': digest(path)}
    encoded = json.dumps(sources, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    worker = (project / 'worker/index.js').read_text()
    if worker.count('/*PUBLIC_DATA_MANIFEST*/{}') != 1 or worker.count('/*PUBLIC_DATA_READ_ONLY*/false') != 1:
        raise ValueError('Worker build markers are missing or ambiguous.')
    worker = worker.replace('/*PUBLIC_DATA_MANIFEST*/{}', encoded).replace('/*PUBLIC_DATA_READ_ONLY*/false', 'true' if mode == 'final' else 'false')
    if len(worker.encode()) > 10_000_000:
        raise ValueError('Compiled public-source Worker exceeds 10 MB.')
    original = {}
    if mode == 'bootstrap':
        commit = subprocess.check_output(['git', 'rev-parse', '--verify', bootstrap_commit + '^{commit}'], cwd=project, text=True).strip()
        for filename in ['index.html', 'app.js']:
            original[filename] = subprocess.check_output(['git', 'show', commit + ':dist/' + filename], cwd=project)
    if output.exists():
        shutil.rmtree(output)
    client = output / 'client'
    client.mkdir(parents=True)
    for entry in source.iterdir():
        if entry.name in {'full-data', '.openai', '_appgen_meta'}:
            continue
        if entry.is_symlink():
            raise ValueError('Public assets must not be symlinks.')
        target = client / entry.name
        if entry.is_dir():
            shutil.copytree(entry, target)
        elif entry.is_file():
            shutil.copy2(entry, target)
    for filename, blob in original.items():
        (client / filename).write_bytes(blob)
    server = output / 'server'
    server.mkdir()
    (server / 'index.js').write_text(worker)
    (server / 'full-data-manifest.json').write_text(encoded + '\n')
    wrangler = {'main': 'index.js', 'compatibility_date': '2026-10-31', 'assets': {'directory': '../client', 'binding': 'ASSETS', 'not_found_handling': 'none', 'run_worker_first': ['/full-data/*', '/__data_ingest/*']}}
    (server / 'wrangler.json').write_text(json.dumps(wrangler, separators=(',', ':')) + '\n')
    built_metadata = output / '.openai'
    built_metadata.mkdir()
    (built_metadata / 'hosting.json').write_text(json.dumps(manifest, indent=2) + '\n')
    result = {'mode': mode, 'source_files': len(sources), 'source_bytes': sum(item['bytes'] for item in sources.values()), 'manifest_bytes': len(encoded.encode()), 'worker_bytes': len(worker.encode()), 'asset_files': sum(1 for p in client.rglob('*') if p.is_file()), 'asset_bytes': sum(p.stat().st_size for p in client.rglob('*') if p.is_file()), 'source_unchanged': True, 'read_only': mode == 'final', 'ingest_header': 'X-Public-Data-Ingest-Token', 'ingest_prefix': '/__data_ingest', 'object_keys': 'sha256/<manifest SHA-256>'}
    print(json.dumps(result))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['bootstrap', 'final'], required=True)
    parser.add_argument('--bootstrap-commit', default='45d5034ddc1956ed0c7fdacdd87e8f848febf3bb')
    args = parser.parse_args()
    build(Path(__file__).resolve().parents[1], args.mode, args.bootstrap_commit)
