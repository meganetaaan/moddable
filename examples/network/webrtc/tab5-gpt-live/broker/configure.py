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

"""Generate private local-development TLS credentials and a device token."""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import secrets
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--host', required=True, help='LAN IP address or DNS name used by the device')
args = parser.parse_args()
try:
	ipaddress.ip_address(args.host); san = 'IP:' + args.host
except ValueError:
	import re
	if not re.fullmatch(r'[A-Za-z0-9.-]+', args.host): parser.error('Invalid host')
	san = 'DNS:' + args.host
folder = Path(__file__).resolve().parent / '.local'
if folder.exists(): parser.error('.local already exists; reuse its credentials or choose a fresh checkout')
os.umask(0o077); folder.mkdir(mode=0o700)
def openssl(*args):
	subprocess.run(['openssl', *args], cwd=folder, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '365', '-subj', '/CN=Local Live Broker CA', '-addext', 'basicConstraints=critical,CA:TRUE')
openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr', '-subj', '/CN=' + args.host)
(folder / 'extensions.cnf').write_text('subjectAltName=' + san + '\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n')
openssl('x509', '-req', '-in', 'server.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'server.pem', '-days', '365', '-sha256', '-extfile', 'extensions.cnf')
openssl('x509', '-in', 'ca.pem', '-outform', 'DER', '-out', 'ca.der')
(folder / 'chain.pem').write_bytes((folder / 'server.pem').read_bytes() + (folder / 'ca.pem').read_bytes())
token = secrets.token_urlsafe(32)
(folder / 'device-token').write_text(token + '\n')
values = {'HOST': '0.0.0.0', 'PORT': '8443', 'LIVE_BROKER_TLS_KEY': str(folder / 'server.key'),
	'LIVE_BROKER_TLS_CERT': str(folder / 'chain.pem'), 'LIVE_BROKER_DEVICE_TOKEN': token}
(folder / 'server.env').write_text(''.join(k + '=' + json.dumps(v) + '\n' for k, v in values.items()))
print('Private development credentials written under broker/.local')
