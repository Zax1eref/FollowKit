"""Package source without local databases, secrets, sessions, or Git internals."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import sys
root=Path(__file__).resolve().parents[1]
target=Path(sys.argv[1]).resolve()
with ZipFile(target,'w',ZIP_DEFLATED) as z:
    for f in sorted(root.rglob('*')):
        rel=f.relative_to(root)
        if not f.is_file() or any(part in {'.git','.local','node_modules','__pycache__'} for part in rel.parts): continue
        if f.name.startswith('.env') and f.name!='.env.example': continue
        if '.sqlite' in f.name or f.suffix in {'.zip','.pyc'}: continue
        z.write(f,Path('followkit')/rel)
with ZipFile(target) as z:
    assert z.testzip() is None
    assert not any('/.local/' in n or '.sqlite' in n for n in z.namelist())
    print(f'Archive verified: {len(z.namelist())} files; no local DB/session runtime data')
