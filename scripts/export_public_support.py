"""Preserve retained built-in support bundles as lossless, bounded public downloads.

Only seven named source directories are read. No user imports, project files,
poll records or server state are included. Existing compressed files keep their
exact bytes; plain source JSON is reversibly gzip wrapped for transfer.
"""
from pathlib import Path
import argparse
import gzip
import hashlib
import json

GROUPS = {
    'pipelines': 'Commodity flows, chemicals, pharmaceuticals and economic model inputs',
    'ownership': 'Mine and processing ownership records',
    'industry': 'Electricity, environmental reporting and corporate parent records',
    'footprints': 'Global production and consumption emissions footprints',
    'pipeline_context': 'Time-paired ownership and environmental context',
    'trade_policy': 'Government indicators, trade conditions and agreements',
    'us_counties': 'Native U.S. county and equivalent boundaries',
}
CHUNK_BYTES = 20_000_000


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


def export(source_root, output):
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for group in GROUPS:
        folder = source_root / 'data' / group
        if not folder.is_dir():
            raise ValueError('Missing retained public support directory: ' + group)
        for source in sorted(folder.rglob('*')):
            if not source.is_file():
                continue
            if source.is_symlink():
                raise ValueError('Source bundle must be a regular retained file: ' + str(source))
            relative = source.relative_to(folder)
            original = source.read_bytes()
            encoding = 'gzip' if source.suffix in {'.json', '.csv', '.tsv'} else 'identity'
            stored = gzip.compress(original, compresslevel=9, mtime=0) if encoding == 'gzip' else original
            target_relative = Path(group) / relative
            if encoding == 'gzip':
                target_relative = target_relative.with_name(target_relative.name + '.transfer.gz')
            chunks = []
            for number, offset in enumerate(range(0, len(stored), CHUNK_BYTES), 1):
                target = target_relative
                if len(stored) > CHUNK_BYTES:
                    target = target.with_name(target.name + '.part-' + str(number).zfill(4))
                blob = stored[offset:offset + CHUNK_BYTES]
                destination = output / target
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(blob)
                reread = destination.read_bytes()
                if reread != blob:
                    raise ValueError('Published source chunk differs: ' + str(target))
                chunks.append({'url': '/full-data/support/' + target.as_posix(), 'bytes': len(blob), 'sha256': digest(blob)})
            reconstructed = b''.join((output / item['url'].removeprefix('/full-data/support/')).read_bytes() for item in chunks)
            decoded = gzip.decompress(reconstructed) if encoding == 'gzip' else reconstructed
            if decoded != original:
                raise ValueError('Source reassembly differs from original: ' + str(source))
            records.append({'group': group, 'group_title': GROUPS[group], 'original_path': source.relative_to(source_root).as_posix(), 'filename': source.name, 'original_bytes': len(original), 'original_sha256': digest(original), 'transfer_encoding': encoding, 'stored_bytes': len(stored), 'stored_sha256': digest(stored), 'chunks': chunks, 'reassembled_bytes_verified': True})
    index = {'schema': 'public-evidence.support-downloads/v1', 'scope': 'Retained built-in public-source support bundles. No private imports, saved projects or poll records.', 'source_boundary': 'These are the retained workbench source bundles, source manifests and explicitly derived model/context assets. They are not all unmodified publisher downloads; their original manifests retain publisher identities, transformations and limits.', 'preservation': 'Original relative paths, lengths and SHA-256 are retained. Transfer gzip is reversible packaging only. Multi-part files reassemble in listed order. No source observation, matrix entry, flag or metadata is removed.', 'original_files': len(records), 'original_bytes': sum(r['original_bytes'] for r in records), 'published_bytes': sum(r['stored_bytes'] for r in records), 'max_published_part_bytes': max(p['bytes'] for r in records for p in r['chunks']), 'groups': [{'id': key, 'title': value, 'files': sum(r['group'] == key for r in records)} for key, value in GROUPS.items()], 'files': records}
    (output / 'support-index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    lines = ['original_path\toriginal_bytes\toriginal_sha256\ttransfer_encoding\tpublished_parts']
    lines += ['\t'.join([r['original_path'], str(r['original_bytes']), r['original_sha256'], r['transfer_encoding'], '|'.join(p['url'] for p in r['chunks'])]) for r in records]
    (output / 'DOWNLOAD_FILES.tsv').write_text('\n'.join(lines) + '\n')
    (output / 'README.txt').write_text('Retained public-source supporting evidence\n\nOpen /workbench/support.html to browse and download each complete original file.\nThe browser joins parts, removes only declared transfer gzip, and verifies the original SHA-256.\nAll original source paths and hashes are in support-index.json and DOWNLOAD_FILES.tsv.\nOriginal .json.gz and .npz files stay compressed in their native retained format.\nAn extra .transfer.gz wrapper is transfer packaging, not a change to source contents.\nSpecialized Python analytical screens remain available in the original local research workbench.\nThese bundles contain source observations, ownership records, derived context and model inputs; consult their original manifests before interpretation.\n')
    return index


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = export(args.source_root.resolve(), args.output.resolve())
    print(json.dumps({key: result[key] for key in ['original_files', 'original_bytes', 'published_bytes', 'max_published_part_bytes']}))
