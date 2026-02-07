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
MISSING=()
for tool in rustscan nmap ffuf gobuster nikto searchsploit enum4linux smbclient hydra john hashcat sqlmap msfconsole; do
    if command -v "$tool" &>/dev/null; then
        echo -e "  ${GREEN}✓ $tool${NC}"
    else
        echo -e "  ${RED}✗ $tool${NC}"
        MISSING+=("$tool")
    fi
done
echo ""

# Propose installation of missing tools
if [ ${#MISSING[@]} -gt 0 ]; then
    echo -e "${YELLOW}[*] Outils manquants : ${MISSING[*]}${NC}"

    # Detect package manager
    if command -v brew &>/dev/null; then
        PKG_MGR="brew"
    elif command -v apt &>/dev/null; then
        PKG_MGR="apt"
    elif command -v pacman &>/dev/null; then
        PKG_MGR="pacman"
    else
        PKG_MGR=""
    fi

    if [ -n "$PKG_MGR" ]; then
        echo -ne "${YELLOW}[?] Installer les outils manquants avec $PKG_MGR ? (y/N) ${NC}"
        read -r INSTALL_TOOLS
        if [[ "$INSTALL_TOOLS" =~ ^[yYoO] ]]; then
            for tool in "${MISSING[@]}"; do
                # Map tool names to package names
                case "$tool" in
                    rustscan)
                        if [ "$PKG_MGR" = "brew" ]; then
                            pkg="rustscan"
                        else
                            echo -e "  ${YELLOW}⚠ rustscan : cargo install rustscan ou https://github.com/RustScan/RustScan/releases${NC}"
                            continue
                        fi
                        ;;
                    searchsploit)
                        if [ "$PKG_MGR" = "brew" ]; then
                            pkg="exploitdb"
                        else
                            pkg="exploitdb"
                        fi
                        ;;
                    smbclient)
                        if [ "$PKG_MGR" = "apt" ]; then
                            pkg="smbclient"
                        elif [ "$PKG_MGR" = "brew" ]; then
                            pkg="samba"
                        else
                            pkg="smbclient"
                        fi
                        ;;
                    msfconsole)
                        echo -e "  ${YELLOW}⚠ Metasploit : installez via https://docs.metasploit.com/docs/using-metasploit/getting-started/nightly-installers.html${NC}"
                        continue
                        ;;
                    john)
                        pkg="john-the-ripper"
                        [ "$PKG_MGR" = "apt" ] && pkg="john"
                        ;;
                    enum4linux)
                        if [ "$PKG_MGR" = "brew" ]; then
                            echo -e "  ${YELLOW}⚠ enum4linux : pip install enum4linux-ng${NC}"
                            continue
                        fi
                        pkg="enum4linux"
                        ;;
                    *)
                        pkg="$tool"
                        ;;
                esac

                echo -e "  ${YELLOW}[*] Installation de $tool ($pkg)...${NC}"
                if [ "$PKG_MGR" = "brew" ]; then
                    brew install "$pkg" 2>/dev/null || echo -e "  ${RED}✗ Échec: $tool${NC}"
                elif [ "$PKG_MGR" = "apt" ]; then
                    sudo apt install -y "$pkg" 2>/dev/null || echo -e "  ${RED}✗ Échec: $tool${NC}"
                elif [ "$PKG_MGR" = "pacman" ]; then
                    sudo pacman -S --noconfirm "$pkg" 2>/dev/null || echo -e "  ${RED}✗ Échec: $tool${NC}"
                fi
            done
            echo ""
        fi
    else
        echo -e "${YELLOW}[*] Aucun gestionnaire de paquets détecté. Installez-les manuellement.${NC}\n"
    fi
fi
