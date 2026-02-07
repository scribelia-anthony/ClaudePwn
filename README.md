# ClaudePwn v2

Hacking automation avec Claude Code. L'IA se tait, exécute les outils, enchaîne intelligemment, et stocke tout.

## Installation

```bash
git clone <repo> && cd ClaudePwn
./install.sh
```

## Usage

```bash
# Connecter le VPN HTB
claudepwn connect lab_anthony.ovpn

# Démarrer une box
claudepwn start Sau 10.10.11.224

# Dans Claude Code, utilise les commandes slash :
/htb-scan                    # Scan complet auto (nmap → searchsploit → whatweb → ffuf)
/htb-enum web                # Enum ciblée d'un service
/htb-enum smb
/htb-status                  # Résumé de la box
/htb-notes credential trouvé # Ajouter une note
/ask comment exploiter X ?   # Poser une question à l'IA
/htb-report                  # Générer un writeup

# Arrêter
claudepwn stop
```

## Comment ça marche

- `claudepwn start` crée le workspace `boxes/{box}/`, configure `/etc/hosts`, et lance `claude`
- Claude Code lit `CLAUDE.md` → mode silencieux, smart chaining, stockage auto
- Les commandes `/htb-*` sont des slash commands Claude Code (`.claude/commands/`)
- Un hook PostToolUse log automatiquement chaque commande dans `boxes/{box}/log.md`
- `/ask` est le seul moment où l'IA parle

## Structure

```
boxes/{box}/
├── notes.md       # Découvertes (ports, services, users, credentials, flags)
├── log.md         # Historique des commandes (auto)
├── scans/         # Outputs bruts (nmap, ffuf, whatweb...)
├── loot/          # Fichiers récupérés, credentials
└── exploits/      # Scripts d'exploit
```
