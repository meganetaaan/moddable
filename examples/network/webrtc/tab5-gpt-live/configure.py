#!/usr/bin/env python3
# Copyright (c) 2026 Moddable Tech, Inc.
#
# This file is part of the Moddable SDK.
#
# This work is licensed under the
# Creative Commons Attribution 4.0 International License.
# To view a copy of this license, visit
# <http://creativecommons.org/licenses/by/4.0>
# or send a letter to Creative Commons, PO Box 1866,
# Mountain View, CA 94042, USA.
#
#

"""Generate private build configuration without putting credentials in argv."""
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import subprocess
import unicodedata
import uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--env-file', type=Path, default=Path('.env'))
parser.add_argument('--ssid', default=os.environ.get('LIVE_WIFI_SSID'))
parser.add_argument('--auto-start', action='store_true')
parser.add_argument('--test-seconds', type=int, default=0)
parser.add_argument('--test-repeat-seconds', type=int)
parser.add_argument('--test-mute', action='store_true')
parser.add_argument('--test-cycles', type=int, default=1, choices=range(1, 6))
args = parser.parse_args()
if args.test_seconds < 0 or (args.test_repeat_seconds is not None and args.test_repeat_seconds < 0):
	parser.error('Test durations must be nonnegative')
text = args.env_file.read_text()
match = re.search(r'^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(.+?)\s*$', text, re.M)
if not match:
	parser.error('OPENAI_API_KEY is missing from the env file')
key = match.group(1).strip().strip('"\'')
ssid = args.ssid or input('Wi-Fi SSID: ')
password = os.environ.get('LIVE_WIFI_PASSWORD') or getpass.getpass('Wi-Fi password: ')
# Japanese subtitles are open-ended. Include CP932 characters, not only the
# static UI strings. The generated manifest and compiled firmware are private.
characters = ''.join(chr(c) for c in range(32, 65536)
	if not unicodedata.category(chr(c)).startswith('C') and chr(c).encode('cp932', errors='ignore'))
folder = Path(__file__).resolve().parent
fonts = folder / 'fonts'
fonts.mkdir(exist_ok=True)
chars = fonts / 'characters.txt'
generate = not chars.exists() or chars.read_text() != characters or not (fonts / "NotoSansJP-Regular-28.fnt").exists() or not (fonts / "NotoSansJP-Regular-28.png").exists()
chars.write_text(characters)
root = folder.parents[3]
if generate:
	subprocess.run(['fontbm', '--font-file', str(root / 'examples/assets/scalablefonts/NotoSans/NotoSansJP-Regular.otf'),
		'--font-size', '28', '--output', str(fonts / 'NotoSansJP-Regular-28'),
		'--texture-size', '4096x4096', '--max-texture-count', '1', '--texture-name-suffix', 'none',
		'--texture-crop-width', '--texture-crop-height', '--data-format', 'bin', '--chars-file', str(chars)], check=True)

manifest = {'config': {'ssid': ssid, 'password': password, 'openaiApiKey': key,
	'autoStart': args.auto_start, 'testSeconds': args.test_seconds,
	'testCycles': args.test_cycles, 'testRunId': uuid.uuid4().hex}}
if args.test_repeat_seconds is not None:
	manifest['config']['testRepeatSeconds'] = args.test_repeat_seconds
manifest['config']['testMute'] = args.test_mute
path = Path(__file__).with_name('manifest.local.json')
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as out:
	json.dump(manifest, out, ensure_ascii=False, indent='\t')
	out.write('\n')
os.chmod(path, 0o600)
print('Private configuration written to manifest.local.json')
