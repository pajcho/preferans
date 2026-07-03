#!/bin/sh
# Napravi workers/.dev.vars iz primera ako ne postoji (wrangler dev ga čita).
set -e
cd "$(dirname "$0")/.."
[ -f .dev.vars ] || cp .dev.vars.example .dev.vars
