"""Copy the web game's exact assets into the offline Android WebView project."""
from pathlib import Path
from shutil import copytree, rmtree

root = Path(__file__).resolve().parents[1]
src = root / 'web'
dst = root / 'android' / 'app' / 'src' / 'main' / 'assets' / 'www'
if dst.exists():
    rmtree(dst)
copytree(src, dst, ignore=lambda directory, names: {'play.html'} if Path(directory) == src else set())
print(f'Copied {src} -> {dst}')
