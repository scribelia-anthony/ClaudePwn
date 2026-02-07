# ClaudePwn

Hacking automation avec Claude Code. L'IA se tait, exécute les outils, enchaîne intelligemment, et stocke tout.

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/scribelia-anthony/ClaudePwn/main/install.sh | bash
```

Prérequis : [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`npm install -g @anthropic-ai/claude-code`)

## Usage

```bash
# Connecter le VPN HTB
claudepwn connect lab.ovpn

# Démarrer une box
claudepwn start Sau 10.10.11.224

# Dans Claude Code :
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

`claudepwn start` crée un workspace `boxes/{box}/`, configure `/etc/hosts`, et lance Claude Code avec le bon contexte. L'IA exécute, enchaîne les outils automatiquement (nmap → searchsploit, port 80 → whatweb + ffuf, etc.), et stocke tout dans le workspace. `/ask` est le seul moment où elle parle.

```
boxes/{box}/
├── notes.md       # Découvertes (ports, services, users, credentials, flags)
├── log.md         # Historique des commandes (auto)
├── scans/         # Outputs bruts
├── loot/          # Fichiers récupérés, credentials
└── exploits/      # Scripts d'exploit
```
