# ClaudePwn

```
   _____ _                 _      _____
  / ____| |               | |    |  __ \
 | |    | | __ _ _   _  __| | ___| |__) |_      ___ __
 | |    | |/ _` | | | |/ _` |/ _ \  ___/\ \ /\ / / '_ \
 | |____| | (_| | |_| | (_| |  __/ |     \ V  V /| | | |
  \_____|_|\__,_|\__,_|\__,_|\___|_|      \_/\_/ |_| |_|
```

<p align="center">
<strong>Ton co-pilote pour HackTheBox.</strong>
<br>
<em>Tu ne tapes plus <code>nmap -sC -sV -p- -oN scan.txt 10.10.10.1</code>. Tu tapes <code>scan la box</code>.</em>
<br><br>
<a href="https://github.com/scribelia-anthony/ClaudePwn/actions/workflows/ci.yml"><img src="https://github.com/scribelia-anthony/ClaudePwn/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
<img src="https://img.shields.io/badge/Node.js-%3E%3D20-green.svg" alt="Node.js">
<img src="https://img.shields.io/badge/TypeScript-strict-blue.svg" alt="TypeScript">
<img src="https://img.shields.io/badge/LLM-Claude%20Opus%204.6-purple.svg" alt="Claude Opus 4.6">
</p>

---

## Philosophie

L'IA est partout. Demander à un hacker de ne pas l'utiliser, c'est comme demander à un dev React de coder en vanilla JS — ça n'a pas de sens.

Mais "solve cette box" ou "trouve le flag", ça n'a pas de sens non plus. Tu perds ta méthodologie, ta réflexion, tes skills.

**ClaudePwn trouve le juste milieu** : un framework de productivité comme les hackers en bug bounty en ont toujours eu. Des workflows, des automatisations, de l'efficacité — mais c'est **toi** qui réfléchis, c'est **toi** qui décides de la prochaine étape.

Concrètement :
- **L'agent exécute, résume, et s'arrête.** Il te propose des pistes, il ne les lance pas.
- **Tu gardes le contrôle.** Maximum 3 commandes par action, puis retour au REPL.
- **Les tâches répétitives sont automatisées**, pas la réflexion. `scan la box` remplace 5 commandes manuelles, pas ton cerveau.

---

## Démo

```
claudepwn/Nibbles> scan la box
  ⠹ Réflexion...

[Bash] nmap -sC -sV -p- -oN boxes/Nibbles/scans/nmap-full.txt 10.129.96.84
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 7.2p2 Ubuntu
80/tcp open  http    Apache httpd 2.4.18
  ✓ 47s

  ⠹ Analyse des résultats...

[Bash] searchsploit Apache 2.4.18
[Bash] whatweb http://10.129.96.84

Port 80 ouvert — Apache 2.4.18 sur Ubuntu. Nibbleblog trouvé sur /nibbleblog.
Searchsploit : pas de CVE critique pour cette version Apache.

Prochaines étapes :
  1. enum web /nibbleblog/ — Fuzzer le CMS
  2. inspect /nibbleblog/README — Identifier la version
  3. exploit search nibbleblog — Chercher des CVE connues
```

L'agent a fait la recon, résumé les résultats, et **s'est arrêté**. C'est toi qui choisis la suite.

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

### Workflows

Au lieu de retenir des flags et des syntaxes, tu parles en intentions :

| Commande | Ce que ça fait |
|---|---|
| `scan la box` | nmap full → searchsploit sur chaque service → enum auto |
| `enum web` | curl headers + body + ffuf directories |
| `enum smb` | smbclient + enum4linux |
| `enum web deep` | Fuzzing approfondi (wordlist large) |
| `inspect /path` | Lecture rapide d'une URL |
| `exploit search <terme>` | searchsploit |
| `privesc` | linpeas, énumération locale |

Tu peux aussi écrire en langage naturel :

```
claudepwn/Box> cherche un exploit pour ProFTPD 1.3.5
claudepwn/Box> lance hydra sur SSH avec admin:password123
claudepwn/Box> crack ces hashs avec john
```

### Raccourcis

| Touche | Action |
|---|---|
| **Tab** | Autocomplétion |
| **Ctrl+C** | Interrompt le scan en cours |
| **1, 2, 3** | Sélectionner une prochaine étape proposée |

### VPN & gestion

```bash
claudepwn connect lab.ovpn    # connecter
claudepwn connect              # vérifier l'IP VPN
claudepwn stop                 # déconnecter
claudepwn list                 # lister les boxes
claudepwn login                # (ré)authentification OAuth
```

---

## Comment ça marche

```
Toi → REPL → Agent Loop → API Anthropic (Opus 4.6)
                ↕                    ↕
          Tools (Bash,         Claude exécute,
          Read, Write,         résume, propose
          WebFetch)            → retour au REPL
                ↕
          Résultats + notes auto-mises à jour
```

1. Tu tapes une instruction
2. L'agent exécute les commandes adaptées (max 3 par action)
3. Il résume les résultats et propose des prochaines étapes
4. **Tu choisis.** L'agent ne continue jamais seul.

---

## Workspace

Chaque box a son workspace dans `boxes/{box}/` :

```
boxes/{box}/
├── notes.md        # Découvertes auto-mises à jour (ports, creds, flags)
├── log.md          # Toutes les commandes exécutées (horodatées)
├── history.json    # Historique messages (reprise de session)
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

---

## Outils supportés

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

Usage responsable uniquement — CTF et labs autorisés. Voir [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
