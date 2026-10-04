#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Malte Leonard Herz
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# End-to-end test of the PSP file API against a running Nextcloud.
#
# Usage: tests/integration/api-test.sh <base-url> <path-to-occ>
#   e.g. tests/integration/api-test.sh http://127.0.0.1:8080 ../../occ
#
# Creates the users psp_owner, psp_editor and psp_reader, a plan, shares it
# and checks loading, saving, conflicts, permissions and validation.
set -euo pipefail

BASE=${1:?base url}
OCC=${2:?path to occ}
API="$BASE/ocs/v2.php/apps/psp/api/v1/files"
SHARES="$BASE/ocs/v2.php/apps/files_sharing/api/v1/shares"
HERE=$(cd "$(dirname "$0")" && pwd)
EXAMPLE="$HERE/../../docs/beispiel.psp"
FAILURES=0

for user in psp_owner psp_editor psp_reader; do
	if ! php "$OCC" user:info "$user" > /dev/null 2>&1; then
		OC_PASS="pw-$user-2026" php "$OCC" user:add --password-from-env "$user" > /dev/null
	fi
done

# call <user> <method> <url> [json-body] -> prints "<http-code> <body>"
call() {
	local user=$1 method=$2 url=$3 body=${4:-}
	local args=(-s -u "$user:pw-$user-2026" -H 'OCS-APIRequest: true' -H 'Accept: application/json' -X "$method" -w '\n%{http_code}')
	if [ -n "$body" ]; then
		args+=(-H 'Content-Type: application/json' --data-binary "$body")
	fi
	curl "${args[@]}" "$url"
}

json() { python3 -c "import json,sys; d=json.load(sys.stdin)['ocs']['data']; print($1)"; }

expect() {
	local name=$1 expected=$2 actual=$3
	if [ "$expected" = "$actual" ]; then
		echo "ok    $name"
	else
		echo "FAIL  $name: expected $expected, got $actual"
		FAILURES=$((FAILURES + 1))
	fi
}

body_of() { sed '$d' <<< "$1"; }
code_of() { tail -n1 <<< "$1"; }

payload() { python3 -c "import json,sys; print(json.dumps(dict(arg.split('=',1) for arg in sys.argv[2:]) | {'content': open(sys.argv[1]).read()}))" "$@"; }

# Create
RESPONSE=$(call psp_owner POST "$API" "$(payload "$EXAMPLE" directory=/ name='API Test')")
expect 'create returns 201' 201 "$(code_of "$RESPONSE")"
FILE_ID=$(body_of "$RESPONSE" | json "d['fileId']")
ETAG=$(body_of "$RESPONSE" | json "d['etag']")
FILE_PATH=$(body_of "$RESPONSE" | json "d['path']")
FILE_NAME=$(body_of "$RESPONSE" | json "d['name']")
expect 'create adds the extension' '.psp' "${FILE_NAME: -4}"

RESPONSE=$(call psp_owner POST "$API" "$(payload "$EXAMPLE" directory=/ name="$FILE_NAME")")
expect 'existing name gets a suffix' 1 "$(body_of "$RESPONSE" | json "int(d['name'] != '$FILE_NAME' and d['name'].endswith(').psp'))")"

expect 'create rejects non-plans' 400 "$(code_of "$(call psp_owner POST "$API" '{"directory":"/","name":"x","content":"{}"}')")"
expect 'create rejects bad names' 400 "$(code_of "$(call psp_owner POST "$API" "$(payload "$EXAMPLE" directory=/ name='a/b')")")"
expect 'create needs an existing folder' 404 "$(code_of "$(call psp_owner POST "$API" "$(payload "$EXAMPLE" directory=/gibtsnicht name=x)")")"

# Load
RESPONSE=$(call psp_owner GET "$API/$FILE_ID")
expect 'load returns 200' 200 "$(code_of "$RESPONSE")"
expect 'load returns the content' "$(cat "$EXAMPLE")" "$(body_of "$RESPONSE" | json "d['content']")"
expect 'unknown id is 404' 404 "$(code_of "$(call psp_owner GET "$API/999999999")")"
expect 'other users cannot load it' 404 "$(code_of "$(call psp_editor GET "$API/$FILE_ID")")"

# Share: editor may change, reader may only read
call psp_owner POST "$SHARES" "{\"path\":\"$FILE_PATH\",\"shareType\":0,\"shareWith\":\"psp_editor\",\"permissions\":19}" > /dev/null
call psp_owner POST "$SHARES" "{\"path\":\"$FILE_PATH\",\"shareType\":0,\"shareWith\":\"psp_reader\",\"permissions\":17}" > /dev/null
expect 'editor can load the shared plan' true "$(body_of "$(call psp_editor GET "$API/$FILE_ID")" | json "str(d['canEdit']).lower()")"
expect 'reader sees canEdit=false' false "$(body_of "$(call psp_reader GET "$API/$FILE_ID")" | json "str(d['canEdit']).lower()")"

CHANGED=$(sed 's/Recherche/Recherche (Editor)/' "$EXAMPLE" > /tmp/psp-changed.psp && echo /tmp/psp-changed.psp)
expect 'reader cannot save' 403 "$(code_of "$(call psp_reader PUT "$API/$FILE_ID" "$(payload "$CHANGED" etag="$ETAG")")")"

# Save with ETag
RESPONSE=$(call psp_editor PUT "$API/$FILE_ID" "$(payload "$CHANGED" etag="$ETAG")")
expect 'editor saves with the current etag' 200 "$(code_of "$RESPONSE")"
NEW_ETAG=$(body_of "$RESPONSE" | json "d['etag']")

RESPONSE=$(call psp_owner PUT "$API/$FILE_ID" "$(payload "$EXAMPLE" etag="$ETAG")")
expect 'stale etag is a conflict' 409 "$(code_of "$RESPONSE")"
expect 'conflict reports the current etag' "$NEW_ETAG" "$(body_of "$RESPONSE" | json "d['etag']")"
expect 'conflict leaves the file alone' "$(grep -o '(Editor)' "$CHANGED" | wc -l | tr -d ' ')" "$(body_of "$(call psp_owner GET "$API/$FILE_ID")" | json "d['content'].count('Recherche (Editor)')")"

FORCED=$(python3 -c "import json,sys; print(json.dumps({'content': open(sys.argv[1]).read(), 'etag': 'old', 'force': True}))" "$EXAMPLE")
expect 'force overwrites' 200 "$(code_of "$(call psp_owner PUT "$API/$FILE_ID" "$FORCED")")"
expect 'save rejects non-plans' 400 "$(code_of "$(call psp_owner PUT "$API/$FILE_ID" '{"content":"[]","etag":"x"}')")"

# Other file types are refused
curl -s -u psp_owner:pw-psp_owner-2026 -X PUT --data 'hello' "$BASE/remote.php/dav/files/psp_owner/notiz.txt" > /dev/null
TXT_ID=$(curl -s -u psp_owner:pw-psp_owner-2026 -X PROPFIND -H 'Depth: 0' --data '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>' "$BASE/remote.php/dav/files/psp_owner/notiz.txt" | sed -n 's:.*<oc\:fileid>\([0-9]*\)</oc\:fileid>.*:\1:p')
expect 'non-.psp files are refused' 415 "$(code_of "$(call psp_owner GET "$API/$TXT_ID")")"

# MIME type of new .psp files
MIME=$(curl -s -u psp_owner:pw-psp_owner-2026 -X PROPFIND -H 'Depth: 0' --data '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontenttype/></d:prop></d:propfind>' "$BASE/remote.php/dav/files/psp_owner$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$FILE_PATH")" | sed -n 's:.*<d\:getcontenttype>\([^<]*\)</d\:getcontenttype>.*:\1:p')
expect '.psp files get their own MIME type' 'application/x-psp+json' "$MIME"

if [ "$FAILURES" -gt 0 ]; then
	echo "$FAILURES check(s) failed"
	exit 1
fi
echo 'all checks passed'
