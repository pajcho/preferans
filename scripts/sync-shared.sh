#!/bin/sh
# Kopira čist TS kod (engine + protocol) u supabase/functions/_shared/
# da bi edge funkcije (Deno u Dockeru) videle isti kod koji koristi i browser.
# Generisano — NE menjati ručno kopije; izvor je src/engine i src/protocol.
set -e
cd "$(dirname "$0")/.."

rm -rf supabase/functions/_shared/engine supabase/functions/_shared/protocol
mkdir -p supabase/functions/_shared/engine supabase/functions/_shared/protocol

cp src/engine/*.ts supabase/functions/_shared/engine/
if [ -d src/protocol ]; then
  cp src/protocol/*.ts supabase/functions/_shared/protocol/ 2>/dev/null || true
fi

echo "sync-shared: engine + protocol kopirani u supabase/functions/_shared/"
