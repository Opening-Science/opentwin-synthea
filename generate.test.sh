#!/usr/bin/env bash
# Checks the input and output-folder guards in generate.sh. Needs Java 21+; downloads the JAR once.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
failures=0

refuses() {
  local name="$1" pattern="$2" err
  shift 2
  if err="$(env SYNTHEA_POPULATION=1 "$@" bash "$ROOT/generate.sh" 2>&1 >/dev/null)"; then
    echo "FAIL $name: ran instead of refusing"
    failures=$((failures + 1))
  elif ! grep -q "$pattern" <<<"$err"; then
    echo "FAIL $name: expected '$pattern', got: $(tail -n1 <<<"$err")"
    failures=$((failures + 1))
  else
    echo "ok   $name"
  fi
}

check() {
  if "${@:2}"; then echo "ok   $1"; else
    echo "FAIL $1"
    failures=$((failures + 1))
  fi
}

refuses "impossible date" "must be a real date" SYNTHEA_REFERENCE_DATE=20250229
refuses "age range upside down" "minimum is above maximum" SYNTHEA_AGE=75-40
refuses "unknown sex" "must be M or F" SYNTHEA_GENDER=X

mkdir -p "$WORK/foreign/fhir"
echo notes >"$WORK/foreign/notes.txt"
refuses "folder with a foreign file" "was not created by this script" SYNTHEA_OUT_DIR="$WORK/foreign"
check "foreign file kept" test -f "$WORK/foreign/notes.txt"

mkdir -p "$WORK/linked/out" "$WORK/linked/elsewhere"
: >"$WORK/linked/out/.synthea-out"
echo '{}' >"$WORK/linked/out/keep.json"
ln -s ../out/keep.json "$WORK/linked/elsewhere/keep.json"
refuses "keep module linked into the output folder" "inside the output folder" \
  SYNTHEA_OUT_DIR="$WORK/linked/out" SYNTHEA_KEEP_MODULE="$WORK/linked/elsewhere/keep.json"
check "linked keep module kept" test -f "$WORK/linked/out/keep.json"

mkdir -p "$WORK/mods"
refuses "output folder inside the modules folder" "inside SYNTHEA_MODULES_DIR" \
  SYNTHEA_OUT_DIR="$WORK/mods/out" SYNTHEA_MODULES_DIR="$WORK/mods"

mkdir -p "$WORK/old/fhir"
echo '{}' >"$WORK/old/manifest.json"
generate_quietly() { env SYNTHEA_POPULATION=1 "$@" bash "$ROOT/generate.sh" >/dev/null 2>&1; }
check "output folder from before the marker is reused" generate_quietly SYNTHEA_OUT_DIR="$WORK/old"
check "marker written" test -f "$WORK/old/.synthea-out"

((failures == 0)) || {
  echo "$failures failed"
  exit 1
}
