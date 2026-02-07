#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${RED}"
echo '   _____ _                 _      _____'
echo '  / ____| |               | |    |  __ \'
echo ' | |    | | __ _ _   _  __| | ___| |__) |_      ___ __'
echo ' | |    | |/ _` | | | |/ _` |/ _ \  ___/\ \ /\ / / '\''_ \'
echo ' | |____| | (_| | |_| | (_| |  __/ |     \ V  V /| | | |'
echo '  \_____|_|\__,_|\__,_|\__,_|\___|_|      \_/\_/ |_| |_|'
echo -e "${NC}"
echo -e "  ${YELLOW}Installation du framework de hacking autonome${NC}\n"

INSTALL_DIR="$HOME/.claudepwn"

# Check Node.js
if ! command -v node &>/dev/null; then
    echo -e "${RED}[-] Node.js non trouvé. Installez Node.js >= 20${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}[-] Node.js >= 20 requis (trouvé: $(node -v))${NC}"
    exit 1
fi
echo -e "${GREEN}[+] Node.js $(node -v)${NC}"

# Check/install pnpm
if ! command -v pnpm &>/dev/null; then
    echo -e "${YELLOW}[*] Installation de pnpm...${NC}"
    npm install -g pnpm
fi
echo -e "${GREEN}[+] pnpm $(pnpm -v)${NC}"

# Clone or update
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}[*] Mise à jour...${NC}"
    cd "$INSTALL_DIR"
    git pull
else
    echo -e "${YELLOW}[*] Clonage...${NC}"
    git clone https://github.com/scribelia-anthony/ClaudePwn.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Install & build
echo -e "${YELLOW}[*] Installation des dépendances...${NC}"
pnpm install

echo -e "${YELLOW}[*] Build...${NC}"
pnpm build

# Symlink
echo -e "${YELLOW}[*] Création du symlink...${NC}"
sudo ln -sf "$INSTALL_DIR/dist/index.js" /usr/local/bin/claudepwn
sudo chmod +x /usr/local/bin/claudepwn

echo -e "\n${GREEN}[+] ClaudePwn installé !${NC}"
echo -e "${YELLOW}[*] Lancez 'claudepwn login' pour vous authentifier${NC}"
echo -e "${YELLOW}[*] Puis 'claudepwn start <box> <ip>' pour commencer${NC}\n"

# Check offensive tools
echo -e "${YELLOW}[*] Vérification des outils offensifs...${NC}"
for tool in nmap ffuf gobuster nikto whatweb searchsploit enum4linux smbclient hydra john hashcat sqlmap msfconsole; do
    if command -v "$tool" &>/dev/null; then
        echo -e "  ${GREEN}✓ $tool${NC}"
    else
        echo -e "  ${RED}✗ $tool${NC}"
    fi
done
echo ""
