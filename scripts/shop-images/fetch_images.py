"""Downloads one freely licensed product photo per tuck shop item from Wikimedia Commons into
public/img/shop/<slug>.jpg and writes CREDITS.md (title, author, licence, source) next to them.
Only CC0, public domain, CC BY and CC BY-SA files are taken. Run: python fetch_images.py"""
import json, re, pathlib, time, urllib.parse, urllib.request, urllib.error, html

OUT = pathlib.Path(__file__).resolve().parents[2] / 'public' / 'img' / 'shop'
UA = {'User-Agent': 'SahyadriPortalBuild/1.0 (student project; images credited in CREDITS.md)'}
OK = re.compile(r'^(cc0|public domain|pd|cc by(-sa)? ?[\d.]*)', re.I)

# slug -> Commons search terms (first good licence wins; override with a fixed File: title when a search picks badly)
ITEMS = {
    'milk': ['milk bottle glass', 'milk carton'],
    'bread': ['loaf of white bread', 'sliced bread loaf'],
    'eggs': ['eggs in carton', 'chicken eggs'],
    'rice': ['basmati rice grains', 'uncooked rice'],
    'tea': ['black tea leaves', 'cup of tea'],
    'biscuits': ['biscuits plate', 'cookies biscuits'],
    'detergent': ['laundry detergent powder', 'washing powder'],
    'soap': ['bar of soap', 'soap bar'],
}

def get(url, tries=5):
    # Wikimedia rate-limits bursts (HTTP 429): wait and retry, and pause between calls.
    for i in range(tries):
        try:
            time.sleep(1.5)
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == tries - 1:
                raise
            time.sleep(10 * (i + 1))

def strip(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()

def search(term):
    q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': 6,
        'gsrsearch': f'{term} filetype:bitmap', 'gsrlimit': 12, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|mime', 'iiurlwidth': 480})
    pages = json.loads(get('https://commons.wikimedia.org/w/api.php?' + q)).get('query', {}).get('pages', {})
    for p in sorted(pages.values(), key=lambda x: x.get('index', 99)):
        ii = (p.get('imageinfo') or [{}])[0]
        if ii.get('mime') not in ('image/jpeg', 'image/png'):
            continue
        md = ii.get('extmetadata', {})
        lic = strip(md.get('LicenseShortName', {}).get('value'))
        if not OK.match(lic):
            continue
        yield {'title': p['title'], 'thumb': ii['thumburl'], 'page': ii.get('descriptionurl'), 'licence': lic,
               'author': strip(md.get('Artist', {}).get('value')) or 'Unknown', 'w': ii.get('thumbwidth'), 'h': ii.get('thumbheight')}

# Picked by eye after the searches returned the wrong thing (a bunny chow for bread, a painting for biscuits).
FIXED = {
    'bread': 'File:Tin Loaf - one slash in the crust.jpg',
    'biscuits': 'File:Biscuits on a plate, Goa India.JPG',
    'detergent': 'File:Detergent - Persil Megaperls 02.jpg',
}

def by_title(title):
    q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'titles': title, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|mime', 'iiurlwidth': 480})
    p = next(iter(json.loads(get('https://commons.wikimedia.org/w/api.php?' + q))['query']['pages'].values()))
    ii = p['imageinfo'][0]; md = ii.get('extmetadata', {})
    lic = strip(md.get('LicenseShortName', {}).get('value'))
    assert OK.match(lic), (title, lic)
    return {'title': p['title'], 'thumb': ii['thumburl'], 'page': ii.get('descriptionurl'), 'licence': lic, 'author': strip(md.get('Artist', {}).get('value')) or 'Unknown'}

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    credits = []
    for slug, terms in ITEMS.items():
        pick = by_title(FIXED[slug]) if slug in FIXED else None
        for t in ([] if pick else terms):
            # landscape-ish photos crop best on the cards
            pick = next((c for c in search(t) if c['w'] and c['h'] and 0.6 <= c['w'] / c['h'] <= 2.2), None)
            if pick:
                break
        if not pick:
            print('no image for', slug); continue
        (OUT / f'{slug}.jpg').write_bytes(get(pick['thumb']))
        credits.append(f"| {slug}.jpg | [{pick['title'][5:]}]({pick['page']}) | {pick['author']} | {pick['licence']} |")
        print(slug, '<-', pick['title'], pick['licence'])
    (OUT / 'CREDITS.md').write_text('# Tuck shop product photos\n\nFrom Wikimedia Commons under the licences below (resized). Used with attribution.\n\n'
        '| File | Source | Author | Licence |\n|---|---|---|---|\n' + '\n'.join(credits) + '\n', encoding='utf-8')

if __name__ == '__main__':
    main()
