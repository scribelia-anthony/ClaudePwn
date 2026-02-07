#!/usr/bin/env bash
set -euo pipefail

REPO="scribelia-anthony/ClaudePwn"
INSTALL_DIR="${HOME}/.claudepwn"
BIN_LINK="/usr/local/bin/claudepwn"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[*]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[+]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[-]${NC} $1"; }

echo -e "${BOLD}ClaudePwn${NC} — Installation"
echo ""

# Prérequis : claude
if ! command -v claude &> /dev/null; then
    log_error "Claude Code requis. Installe-le d'abord :"
    echo -e "    ${BOLD}npm install -g @anthropic-ai/claude-code${NC}"
    exit 1
fi
log_ok "Claude Code trouvé"

# Prérequis : git
if ! command -v git &> /dev/null; then
    log_error "git requis."
    exit 1
fi

# Télécharger / mettre à jour
if [[ -d "${INSTALL_DIR}/.git" ]]; then
    log_info "Mise à jour de ClaudePwn..."
    git -C "$INSTALL_DIR" pull --ff-only origin main 2>/dev/null || {
        log_warn "Pull échoué, réinstallation..."
        rm -rf "$INSTALL_DIR"
        git clone --depth 1 "https://github.com/${REPO}.git" "$INSTALL_DIR"
    }
    log_ok "Mis à jour"
else
    if [[ -d "$INSTALL_DIR" ]]; then
        rm -rf "$INSTALL_DIR"
    fi
    log_info "Téléchargement de ClaudePwn..."
    git clone --depth 1 "https://github.com/${REPO}.git" "$INSTALL_DIR"
    log_ok "Installé dans ${INSTALL_DIR}"
fi

# Rendre exécutable
chmod +x "${INSTALL_DIR}/claudepwn"

# Symlink dans le PATH
log_info "Lien symbolique → ${BIN_LINK}"
if [[ -L "$BIN_LINK" || -f "$BIN_LINK" ]]; then
    sudo rm -f "$BIN_LINK"
fi
sudo ln -s "${INSTALL_DIR}/claudepwn" "$BIN_LINK"
log_ok "claudepwn disponible dans le PATH"

# Check outils offensifs
echo ""
echo -e "${BOLD}Outils offensifs :${NC}"

MISSING=()
check_tool() {
    if command -v "$1" &> /dev/null; then
        printf "  ${GREEN}✓${NC} %s\n" "$1"
    else
        printf "  ${RED}✗${NC} %s\n" "$1"
        MISSING+=("$1")
    fi
}

check_tool nmap
check_tool ffuf
check_tool gobuster
check_tool nikto
check_tool whatweb
check_tool nuclei
check_tool enum4linux
check_tool smbclient
check_tool crackmapexec
check_tool sqlmap
check_tool hydra
check_tool john
check_tool hashcat
check_tool searchsploit
check_tool python3
check_tool curl
check_tool nc

echo ""
if [[ ${#MISSING[@]} -gt 0 ]]; then
    log_warn "${#MISSING[@]} outil(s) manquant(s) — Claude proposera l'install au besoin."
else
    log_ok "Tous les outils sont installés."
fi

echo ""
log_ok "Installation terminée."
echo -e "    ${BOLD}claudepwn start <box> <ip>${NC}"
echo ""
