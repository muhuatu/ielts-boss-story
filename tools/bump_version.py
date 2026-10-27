"""Set a new asset version in index.html and sw.js so phones fetch the new files.

Usage: python3 tools/bump_version.py 20261101-1
"""
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent
v = sys.argv[1]
index = root / 'index.html'
index.write_text(re.sub(r'\?v=[\w-]+', '?v=' + v, index.read_text(encoding='utf8')), encoding='utf8')
sw = root / 'sw.js'
sw.write_text(re.sub(r"const VERSION = '[\w-]+'", f"const VERSION = '{v}'", sw.read_text(encoding='utf8')), encoding='utf8')
print('version', v)
