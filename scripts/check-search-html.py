from pathlib import Path
from lxml import html, etree
import json
from urllib.parse import urlparse,unquote
root=Path(__file__).resolve().parents[1]
urls=etree.parse(str(root/'sitemap.xml')).xpath('//*[local-name()="loc"]/text()')
titles=set(); missing=set(); checks=0
for url in urls:
 route=urlparse(url).path;path=root/(route.lstrip('/')+'index.html');doc=html.parse(str(path))
 canonical=doc.xpath('//link[@rel="canonical"]/@href');assert canonical==[url],(path,canonical)
 title=doc.xpath('//title/text()');assert len(title)==1 and title[0] not in titles,(path,title);titles.add(title[0])
 assert doc.xpath('count(//h1)')==1,(path,'h1 count')
 assert not any('noindex' in value for value in doc.xpath('//meta[@name="robots"]/@content'))
 for schema in doc.xpath('//script[@type="application/ld+json"]/text()'):json.loads(schema)
 if '/products/' in route:assert doc.xpath('//*[@id="product" and not(@hidden)]')
 for ref in doc.xpath('//a/@href|//script/@src|//link[@rel="stylesheet"]/@href|//img/@src'):
  target=urlparse(ref)
  if target.netloc or target.scheme or not target.path.startswith('/'):continue
  target_path=root/unquote(target.path.lstrip('/'))
  if target.path.endswith('/'):target_path=target_path/'index.html'
  if not target_path.exists():missing.add((route,target.path))
 checks+=1
assert not missing,sorted(missing)
print(f'PASS: {checks} sitemap pages, unique titles, one H1, canonical URLs, JSON-LD parsing, visible products and internal file links.')
