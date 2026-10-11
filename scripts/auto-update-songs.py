#!/usr/bin/env python3
"""Associate changed LyriCSED assets with the song catalogue; modify metadata only.

Usage: python3 scripts/auto-update-songs.py --changed-list /path/to/changed.txt
Only paths newly added or modified in the triggering Git push are processed.
"""
import argparse
import hashlib
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'data/songs-v2.json'
MIRROR = ROOT / 'data/songs.json'
VERSION = ROOT / 'version-v2.json'
KINDS = {'lyrics': {'.txt'}, 'solfa': {'.png', '.webp', '.jpg', '.jpeg'},
         'instrumental': {'.mp3', '.m4a', '.wav', '.ogg', '.aac', '.wma'}}
SUFFIXES = ('instrumental', 'instrumentale', 'playback', 'solfa', 'partition', 'lyrics', 'paroles')


def key(text):
    text = unicodedata.normalize('NFKD', str(text).lower())
    text = ''.join(c for c in text if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '', text)


def slug(text):
    text = unicodedata.normalize('NFKD', str(text).lower())
    text = ''.join(c for c in text if not unicodedata.combining(c))
    return re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-', text))


def base_title(path):
    stem = Path(path).stem
    pieces = re.split(r'[-_\s]+', stem)
    while pieces and pieces[-1].lower() in SUFFIXES:
        pieces.pop()
    return '-'.join(pieces)


def classify(path):
    part = Path(path)
    if part.is_absolute() or '..' in part.parts or len(part.parts) != 2:
        return None
    kind = {'lyrics': 'lyrics', 'solfa': 'solfa', 'instrumentals': 'instrumental'}.get(part.parts[0])
    if not kind or part.suffix.lower() not in KINDS[kind] or not key(base_title(path)):
        return None
    return kind


def load_json(path):
    with path.open(encoding='utf-8-sig') as stream:
        return json.load(stream)


def save_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def song_matches(song, stem_key, changed_path):
    if song.get('lyrics') == changed_path or song.get('solfa') == changed_path or song.get('instrumental') == changed_path:
        return True
    return any(key(value) == stem_key for value in (song.get('slug'), song.get('title')))


def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.digest()


def is_duplicate_audio(path, songs):
    """Avoid creating an invented new title for a byte-identical known recording."""
    current = ROOT / path
    if not current.is_file():
        return False
    for song in songs:
        existing = song.get('instrumental')
        if not existing or existing == path:
            continue
        previous = ROOT / existing
        if previous.is_file() and previous.stat().st_size == current.stat().st_size:
            if sha256(previous) == sha256(current):
                return True
    return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--changed-list', required=True, help='git diff --name-only --diff-filter=AM paths')
    args = parser.parse_args()

    catalog = load_json(CATALOG)
    mirror = load_json(MIRROR)
    version = load_json(VERSION)
    if catalog != mirror:
        raise SystemExit('STOP: data/songs-v2.json et data/songs.json diffèrent. Aucune modification.')
    songs = catalog.get('songs')
    if not isinstance(songs, list) or not songs:
        raise SystemExit('STOP: catalogue manquant ou vide.')
    ids = [s.get('id') for s in songs]
    if any(not isinstance(i, int) or isinstance(i, bool) for i in ids) or len(set(ids)) != len(ids):
        raise SystemExit('STOP: identifiants invalides ou dupliqués.')
    if not isinstance(version.get('contentVersion'), int):
        raise SystemExit('STOP: contentVersion non numérique.')

    candidates = []
    seen = set()
    for raw in Path(args.changed_list).read_text(encoding='utf-8').splitlines():
        path = raw.strip().replace('\\', '/')
        if path in seen:
            continue
        seen.add(path)
        kind = classify(path)
        if kind and (ROOT / path).is_file():
            candidates.append((path, kind))
    if not candidates:
        print('Aucun nouveau contenu reconnu. Rien à publier.')
        return 0

    # Existing paths and exact normalized slug/title matches only; no fuzzy guessing.
    # A new slug creates a new song (including instrumental-only entries).
    changed = set()
    created = set()
    warnings = []
    next_id = max(ids) + 1
    for path, kind in sorted(candidates):
        name = base_title(path)
        name_key = key(name)
        matches = [s for s in songs if song_matches(s, name_key, path)]
        if len(matches) > 1:
            warnings.append(f'{path}: correspondance ambiguë avec {len(matches)} chants. Ignoré.')
            continue
        if matches:
            song = matches[0]
        else:
            if kind == 'instrumental' and is_duplicate_audio(path, songs):
                warnings.append(f'{path}: audio identique à un chant existant, titre à confirmer. Ignoré.')
                continue
            new_slug = slug(name)
            if not new_slug or any(key(s.get('slug')) == key(new_slug) for s in songs):
                warnings.append(f'{path}: titre non unique ou invalide. Ignoré.')
                continue
            song = {
                'id': next_id, 'slug': new_slug,
                'title': ' '.join(w.capitalize() for w in re.split(r'[-_]+', name) if w),
                'artist': 'Chorale Sedera Ambalavato', 'credits': '', 'revision': 1,
                'lyrics': None, 'solfa': None, 'instrumental': None, 'image': None,
                'markers': [], 'tags': [],
                'revisions': {'lyrics': 0, 'solfa': 0, 'instrumental': 0, 'image': 0},
            }
            songs.append(song)
            created.add(song['id'])
            next_id += 1
            print(f'NOUVEAU: {song["title"]} (ID {song["id"]})')

        old_path = song.get(kind)
        # Re-upload on the same path is also a revision update.
        song[kind] = path
        revisions = song.setdefault('revisions', {})
        revisions[kind] = (max(0, int(revisions.get(kind, 0))) + 1) if old_path else 1
        changed.add(song['id'])
        print(f'ASSOCIÉ: {song["title"]} / {kind}: {path} (révision {revisions[kind]})')

    if not changed:
        for message in warnings:
            print('ATTENTION:', message, file=sys.stderr)
        print('Aucun changement sûr. Catalogue inchangé.')
        return 0

    for song in songs:
        if song['id'] in changed and song['id'] not in created:
            song['revision'] = int(song.get('revision') or 0) + 1
    if created:
        songs.sort(key=lambda s: (slug(s.get('title', '')), s['id']))
        for index, song in enumerate(songs, start=1):
            song['displayNumber'] = index

    if len(set(s['id'] for s in songs)) != len(songs):
        raise SystemExit('STOP: ID dupliqué après fusion. Aucune publication.')
    for song in songs:
        for kind in KINDS:
            p = song.get(kind)
            if p and (not classify(p) or not (ROOT / p).is_file()):
                # Existing historical paths should not suddenly block metadata upgrades:
                if song['id'] in changed:
                    raise SystemExit(f'STOP: fichier absent ou incorrect pour {song["title"]}: {p}')

    version['contentVersion'] += 1
    version['updatedAt'] = datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    save_json(CATALOG, catalog)
    save_json(MIRROR, catalog)
    save_json(VERSION, version)
    print(f'PUBLICATION: {len(songs)} chants, version contenu {version["contentVersion"]}')
    for message in warnings:
        print('ATTENTION:', message, file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
