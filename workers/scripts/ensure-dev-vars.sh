#!/bin/sh
# Napravi workers/.dev.vars iz primera ako ne postoji (wrangler dev ga čita),
# pa dopuni ključeve koji fale (npr. ADMIN_TOKEN dodat posle prvog kopiranja).
set -e
cd "$(dirname "$0")/.."
[ -f .dev.vars ] || cp .dev.vars.example .dev.vars
while IFS= read -r line; do
  case "$line" in
    [A-Z_]*=*)
      key="${line%%=*}"
      grep -q "^$key=" .dev.vars || printf '%s\n' "$line" >>.dev.vars
      ;;
  esac
done <.dev.vars.example
