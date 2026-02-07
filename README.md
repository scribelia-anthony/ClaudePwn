# ClaudePwn

Framework de hacking autonome propulsé par Claude. Un CLI qui utilise l'API Anthropic pour enchaîner intelligemment reconnaissance, énumération, exploitation et post-exploitation.

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/anthcoding/ClaudePwn/main/install.sh | bash
```

Ou manuellement :

```bash
git clone https://github.com/anthcoding/ClaudePwn.git ~/.claudepwn
cd ~/.claudepwn
pnpm install && pnpm build
sudo ln -sf ~/.claudepwn/dist/index.js /usr/local/bin/claudepwn
```

## Authentification

```bash
# OAuth (recommandé — utilise ton abonnement Claude Pro/Max)
claudepwn login

# Ou avec une API key
export ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

```bash
# Démarrer une session
claudepwn start Box 10.10.10.1

# Dans le REPL
claudepwn/Box> scan la box
claudepwn/Box> enum web sur le port 80
claudepwn/Box> cherche des exploits pour ce service
claudepwn/Box> /ask            # demande une analyse
claudepwn/Box> exit

# Autres commandes
claudepwn list               # lister les boxes
claudepwn stop               # arrêter la session
claudepwn connect lab.ovpn   # connecter VPN
```

## Architecture

```
src/
├── index.ts              # Entry point
├── cli/                  # Commander.js CLI
├── agent/
│   ├── loop.ts           # Agent loop (tool_use)
│   ├── system-prompt.ts  # System prompt dynamique
│   └── tools/            # exec, read_file, write_file, http_request, ask_user
├── config/               # API key, model, settings
├── session/              # Gestion boxes/ workspace
└── utils/                # Logger, hosts, VPN, auth
```

## Workspace

Chaque box a son workspace dans `boxes/{box}/` :

```
boxes/{box}/
├── notes.md        # Découvertes
├── log.md          # Commandes exécutées
├── history.json    # Historique messages (reprise session)
├── scans/          # nmap, ffuf, etc.
├── loot/           # Credentials, fichiers
└── exploits/       # Scripts d'exploit
```

## License

MIT
