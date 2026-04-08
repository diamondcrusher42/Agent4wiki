#!/bin/bash
set -e
cd "$(dirname "$0")"
[[ -f package.json ]] && npm install --ignore-scripts --prefer-offline --no-audit --no-fund --silent
[[ -f requirements.txt ]] && pip install -r requirements.txt --quiet
echo "Setup complete."
