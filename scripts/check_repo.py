"""Standard-library static sanity check. Does NOT prove app/DB integration works."""
from pathlib import Path
from html.parser import HTMLParser
import re
ROOT = Path(__file__).resolve().parents[1]
class Assets(HTMLParser):
    paths=[]
    def handle_starttag(self, tag, attrs):
        for k,v in attrs:
            if k in {'src','href'} and v and not v.startswith(('https://','http://','mailto:','#','data:')):
                self.paths.append(v)
html=(ROOT/'index.html').read_text(encoding='utf8')
p=Assets();p.feed(html)
errors=[]
for path in p.paths:
    if not (ROOT/path.split('?')[0]).is_file():errors.append(f'Missing asset: {path}')
for css in (ROOT/'assets/css').glob('*.css'):
    for rel in re.findall(r'url\([\'\"]?([^\)\'\"]+)',css.read_text()):
        if not rel.startswith(('http','data:','#')) and not (css.parent/rel).is_file():errors.append(f'Missing CSS asset in {css.name}: {rel}')
for target in ['assets/js/core.js','assets/js/cloud.js','assets/js/operations.js','assets/js/config.js','supabase/000_fresh_install.sql']:
    if not (ROOT/target).is_file():errors.append(f'Missing expected file: {target}')
if errors: raise SystemExit('\n'.join(errors))
print(f'PASS: {len(p.paths)} local asset references + CSS resources + essential files')
