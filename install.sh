#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_PATH="/usr/local/bin/claudepwn"

echo -e "${BOLD}ClaudePwn — Installation${NC}"
echo ""

# Vérifier Claude Code
echo -ne "${CYAN}[*]${NC} Claude Code... "
if command -v claude &> /dev/null; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}NON TROUVÉ${NC}"
    echo -e "    Installe Claude Code : ${BOLD}npm install -g @anthropic-ai/claude-code${NC}"
    exit 1
fi

# Installer claudepwn
echo -ne "${CYAN}[*]${NC} Installation de claudepwn... "
if [[ -L "$INSTALL_PATH" || -f "$INSTALL_PATH" ]]; then
    sudo rm -f "$INSTALL_PATH"
fi
sudo ln -s "${SCRIPT_DIR}/claudepwn" "$INSTALL_PATH"
echo -e "${GREEN}OK${NC} → ${INSTALL_PATH}"

# Vérifier les outils
echo ""
echo -e "${BOLD}Outils offensifs :${NC}"

check_tool() {
    local name="$1"
    local pkg="${2:-$1}"
    if command -v "$name" &> /dev/null; then
        printf "  ${GREEN}✓${NC} %-20s\n" "$name"
    else
        printf "  ${RED}✗${NC} %-20s ${YELLOW}(manquant)${NC}\n" "$name"
        MISSING+=("$name")
    fi
}

MISSING=()

check_tool nmap
check_tool rustscan
check_tool ffuf
check_tool gobuster
check_tool feroxbuster
check_tool nikto
check_tool whatweb
check_tool wpscan
check_tool nuclei
check_tool enum4linux
check_tool smbclient
check_tool crackmapexec
check_tool evil-winrm
check_tool sqlmap
check_tool hydra
check_tool john
check_tool hashcat
check_tool searchsploit
check_tool msfconsole
check_tool chisel
check_tool ligolo-proxy
check_tool python3
check_tool curl
check_tool wget
check_tool nc
check_tool socat

echo ""
if [[ ${#MISSING[@]} -gt 0 ]]; then
    echo -e "${YELLOW}[!]${NC} ${#MISSING[@]} outil(s) manquant(s). Claude proposera l'installation au besoin."
else
    echo -e "${GREEN}[+]${NC} Tous les outils sont installés."
fi

echo ""
echo -e "${GREEN}[+]${NC} Installation terminée."
echo -e "    Usage : ${BOLD}claudepwn start <box> <ip>${NC}"
echo ""
