<div align="center">

<h1>ClaudePwn</h1>

<pre>
   _____ _                 _      _____
  / ____| |               | |    |  __ \
 | |    | | __ _ _   _  __| | ___| |__) |_      ___ __
 | |    | |/ _` | | | |/ _` |/ _ \  ___/\ \ /\ / / '_ \
 | |____| | (_| | |_| | (_| |  __/ |     \ V  V /| | | |
  \_____|_|\__,_|\__,_|\__,_|\___|_|      \_/\_/ |_| |_|
</pre>

<strong>Framework de hacking autonome propulsé par Claude.</strong>

[![CI](https://github.com/scribelia-anthony/ClaudePwn/actions/workflows/ci.yml/badge.svg)](https://github.com/scribelia-anthony/ClaudePwn/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Claude Opus 4.6](https://img.shields.io/badge/LLM-Claude%20Opus%204.6-purple.svg)](https://anthropic.com)

</div>

Un CLI standalone qui utilise l'API Anthropic (Opus 4.6) pour enchaîner automatiquement reconnaissance, énumération, exploitation et post-exploitation sur des boxes HackTheBox / CTF.

Tu lui dis `scan la box`, il lance nmap, searchsploit sur chaque service, ffuf si port 80, enum4linux si SMB, adapte les exploits et enchaîne tout seul.

> **Disclaimer** : Cet outil est destiné **uniquement** aux environnements autorisés (CTF, labs). Voir [SECURITY.md](SECURITY.md).

---

## Démo

```
claudepwn/Nibbles> scan la box
  ⠹ Réflexion...

[Bash] nmap -sC -sV -p- -oN boxes/Nibbles/scans/nmap-full.txt 10.129.96.84
Starting Nmap 7.98...
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 7.2p2 Ubuntu
80/tcp open  http    Apache httpd 2.4.18
  ✓ 47s

  ⠹ Analyse des résultats...

[Bash] searchsploit Apache 2.4.18
[Bash] whatweb http://10.129.96.84
[Bash] ffuf -u http://10.129.96.84/FUZZ -w /usr/share/seclists/...

Port 80 ouvert — Apache 2.4.18 sur Ubuntu. Nibbleblog trouvé sur /nibbleblog.
Searchsploit: pas de CVE critique pour cette version Apache.
Prochaine étape: énumération de /nibbleblog.
```

---

## Installation

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/scribelia-anthony/ClaudePwn/main/install.sh)
```

L'installeur :
- Vérifie Node.js >= 20, installe pnpm si absent
- Clone, build, crée le symlink `/usr/local/bin/claudepwn`
- Détecte les outils offensifs manquants et propose de les installer (brew/apt)

<details>
<summary>Installation manuelle</summary>

```bash
git clone https://github.com/scribelia-anthony/ClaudePwn.git ~/.claudepwn
cd ~/.claudepwn
pnpm install && pnpm build
sudo ln -sf ~/.claudepwn/dist/index.js /usr/local/bin/claudepwn
```
</details>

## Authentification

```bash
# OAuth — utilise ton abonnement Claude Pro/Max (recommandé)
claudepwn login

# Ou avec une API key
export ANTHROPIC_API_KEY=sk-ant-...
```

`claudepwn login` ouvre le navigateur, tu autorises, c'est fait. Le token est stocké dans `~/.claudepwn/oauth-token.json` et se refresh automatiquement.

---

## Usage

### Démarrer une session

```bash
claudepwn start <box> <ip>
```

Crée le workspace, ajoute `<box>.htb` à `/etc/hosts`, et ouvre le REPL interactif.

### Dans le REPL

| Commande | Description |
|---|---|
| `scan la box` | Recon complète (nmap → searchsploit → enum) |
| `enum web` | Énumération web (whatweb, ffuf, nikto) |
| `enum smb` | Énumération SMB (smbclient, enum4linux) |
| `privesc` | Escalade de privilèges (linpeas, enumération) |
| `/ask` | Analyse détaillée + prochaines étapes |
| `help` | Aide locale (pas d'appel IA) |
| `exit` | Quitter (session sauvegardée) |
| **Tab** | Autocomplétion |
| **Ctrl+C** | Interrompt le scan en cours |

Tu peux aussi écrire n'importe quelle instruction en langage naturel :

```
claudepwn/Box> cherche un exploit pour ProFTPD 1.3.5
claudepwn/Box> lance hydra sur SSH avec admin:password123
claudepwn/Box> télécharge le fichier /etc/shadow
claudepwn/Box> crack ces hashs avec john
```

### VPN HackTheBox

```bash
claudepwn connect lab.ovpn    # connecter
claudepwn connect              # vérifier l'IP VPN
claudepwn stop                 # déconnecter
```

### Autres commandes

```bash
claudepwn list     # lister toutes les boxes
claudepwn login    # (ré)authentification OAuth
claudepwn --help   # aide CLI
```

---

## Comment ça marche

```
Toi → REPL → Agent Loop → API Anthropic (Opus 4.6)
                ↕                    ↕
          Tools (Bash,         Claude décide
          Read, Write,         quels tools
          WebFetch)            appeler et
                ↕              enchaîne
          Résultats →     jusqu'à end_turn
```

1. Tu tapes une instruction
2. L'IA réfléchit et appelle des tools (Bash, Read, Write...)
3. Les tools s'exécutent (en parallèle si plusieurs)
4. L'IA analyse les résultats et enchaîne automatiquement
5. Quand elle a fini, tu reprends la main

### Smart Chaining

L'agent enchaîne automatiquement sans qu'on lui demande :

- **nmap** → `searchsploit` sur chaque service:version
- **Port 80/443** → `whatweb` + `ffuf`
- **Port 445** → `smbclient -L -N` + `enum4linux -a`
- **Port 53** → tentative de zone transfer
- **Credentials trouvés** → test sur tous les services (SSH, SMB, WinRM)
- **Exploit identifié** → recherche + adaptation du PoC

---

## Workspace

Chaque box a son workspace dans `boxes/{box}/` :

```
boxes/{box}/
├── notes.md        # Découvertes auto-mises à jour (ports, creds, flags)
├── log.md          # Toutes les commandes exécutées (horodatées)
├── history.json    # Historique messages Claude (reprise de session)
├── scans/          # Outputs nmap, ffuf, whatweb, etc.
├── loot/           # Credentials, hashs, fichiers récupérés
└── exploits/       # Scripts d'exploit utilisés ou adaptés
```

La session est sauvegardée automatiquement. Relancer `claudepwn start Box 10.10.10.1` reprend là où tu t'es arrêté.

---

## Configuration

| Variable | Défaut | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | API key (alternative à OAuth) |
| `CLAUDEPWN_MODEL` | `claude-opus-4-6` | Modèle Claude |
| `CLAUDEPWN_MAX_TOKENS` | `16384` | Max tokens par réponse |
| `CLAUDEPWN_EXEC_TIMEOUT` | `300000` | Timeout commandes (ms) |

Ou via `~/.claudepwn/config.json` :

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "maxTokens": 8192,
  "execTimeout": 600000
}
```

---

## Outils supportés

L'agent sait utiliser automatiquement :

| Catégorie | Outils |
|---|---|
| **Recon** | nmap, rustscan, masscan |
| **Web** | ffuf, gobuster, feroxbuster, nikto, whatweb, wpscan, nuclei |
| **Services** | enum4linux, smbclient, smbmap, rpcclient, crackmapexec, snmpwalk, ldapsearch |
| **Exploitation** | searchsploit, msfconsole, msfvenom, sqlmap, hydra |
| **Cracking** | john, hashcat |
| **Post-exploit** | linpeas, winpeas, pspy64, bloodhound-python |
| **Impacket** | psexec, smbexec, wmiexec, secretsdump, getTGT, getNPUsers |
| **Pivot** | chisel, ligolo-ng, proxychains, socat |

---

## Stack

- **Runtime** : Node.js >= 20 (TypeScript, ESM)
- **LLM** : API Anthropic (tool_use natif, agent loop manuel)
- **Auth** : OAuth 2.0 PKCE (Claude Pro/Max) ou API key
- **CLI** : Commander.js
- **Build** : tsup

## Contribuer

Les contributions sont les bienvenues ! Consulte [CONTRIBUTING.md](CONTRIBUTING.md) pour les guidelines.

## Sécurité

Usage responsable uniquement. Voir [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
