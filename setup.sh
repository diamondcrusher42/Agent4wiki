#!/bin/bash
set -e
cd "$(dirname "$0")"
[[ -f package.json ]] && npm install --prefer-offline --no-audit --no-fund --ignore-scripts --silent
[[ -f requirements.txt ]] && pip install -r requirements.txt --quiet
echo "Setup complete."
