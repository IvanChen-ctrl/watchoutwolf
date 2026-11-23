"""Build a true self-contained HTML game for mobile files and offline demo."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
web = root / 'web'
html = (web / 'index.html').read_text('utf-8')
css = (web / 'styles.css').read_text('utf-8')
engine = (web / 'js' / 'engine.js').read_text('utf-8')
app = (web / 'js' / 'app.js').read_text('utf-8')
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="js/engine.js"></script>', '<script>\n' + engine + '\n</script>')
html = html.replace('<script src="js/app.js"></script>', '<script>\n' + app + '\n</script>')
html = '\n'.join(line for line in html.split('\n') if not any(s in line for s in ('rel="manifest"', 'rel="icon"', 'rel="apple-touch-icon"')))
(web / 'play.html').write_text(html, 'utf-8')
print('Built', web / 'play.html', 'bytes=', (web / 'play.html').stat().st_size)
