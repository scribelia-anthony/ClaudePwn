#!/usr/bin/env bash
# PostToolUse hook : log chaque commande Bash dans boxes/{box}/log.md
# Appelé par Claude Code après chaque exécution de Bash

set -euo pipefail

CLAUDEPWN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/../../.. && pwd)"
ACTIVE_FILE="${CLAUDEPWN_DIR}/.claudepwn-active"

# Lire le contexte du hook depuis stdin (JSON)
INPUT=$(cat)

# Vérifier que c'est un outil Bash
TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null || echo "")
if [[ "$TOOL_NAME" != "Bash" ]]; then
    exit 0
fi

# Extraire la commande
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
# tool_input peut être un dict avec 'command' ou une string
ti = data.get('tool_input', {})
if isinstance(ti, dict):
    print(ti.get('command', ''))
else:
    print(str(ti))
" 2>/dev/null || echo "")

if [[ -z "$COMMAND" ]]; then
    exit 0
fi

# Vérifier qu'une box est active
if [[ ! -f "$ACTIVE_FILE" ]]; then
    exit 0
fi

source "$ACTIVE_FILE"

LOG_FILE="${BOX_DIR}/log.md"
if [[ ! -f "$LOG_FILE" ]]; then
    exit 0
fi

# Nettoyer la commande (une seule ligne, échapper les pipes)
CLEAN_CMD=$(echo "$COMMAND" | head -1 | tr '|' '¦' | cut -c1-200)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Ajouter au log
echo "| ${TIMESTAMP} | ${CLEAN_CMD} |" >> "$LOG_FILE"

exit 0
