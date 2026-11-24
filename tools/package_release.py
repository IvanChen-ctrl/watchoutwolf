"""Package full source and website without transient build and CI files."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
release=Path('/mnt/data')
source=release/'WatchOutWolf_v1.5_Source_and_Web.zip'
web=release/'WatchOutWolf_v1.5_Web_PWA.zip'
folders=['.github','android','web','tests','tools']
with ZipFile(source,'w',ZIP_DEFLATED,compresslevel=8) as z:
  for name in ['README.md','QA_REPORT.md','.gitignore']:
    z.write(root/name,name)
  for folder in folders:
    for file in sorted((root/folder).rglob('*')):
      if not file.is_file():continue
      rel=file.relative_to(root)
      if any(part in ('.gradle','build','__pycache__','.git') for part in rel.parts): continue
      if file.suffix in ('.apk','.aab','.pyc','.jks','.bak'):continue
      if folder=='android' and 'assets' in rel.parts:continue # regenerated with sync_web
      z.write(file,rel.as_posix())
with ZipFile(web,'w',ZIP_DEFLATED,compresslevel=8) as z:
  for file in sorted((root/'web').rglob('*')):
    if file.is_file():z.write(file,file.relative_to(root).as_posix())
print(source,source.stat().st_size)
print(web,web.stat().st_size)
