# ClaudePwn — Framework de Hacking Autonome

## Projet

Framework TypeScript standalone propulsé par l'API Anthropic.
Agent loop manuel avec tool_use (exec_command, read_file, write_file, http_request, ask_user).

## Stack

- Runtime : Node.js ≥ 20 (TypeScript ESM)
- LLM : @anthropic-ai/sdk (authToken OAuth ou API key)
- CLI : commander
- Build : tsup → dist/index.js

## Architecture

```
src/
├── index.ts              # Entry point
├── cli/program.ts        # Commander CLI
├── cli/commands/         # start, connect, stop, list, login
├── agent/loop.ts         # Agent loop (tool_use → execute → repeat)
├── agent/system-prompt.ts
├── agent/tools/          # exec, read-file, write-file, http-request, ask-user
├── config/index.ts       # Config, OAuth constants, API key
├── session/              # manager (workspace), notes (template)
└── utils/                # logger, hosts, vpn, auth (OAuth PKCE)
```

## Commandes

```bash
pnpm build          # Build
pnpm dev start Box 10.10.10.1  # Dev run
```

## Conventions

- Français pour les messages utilisateur
- Modèle par défaut : claude-opus-4-6
- Auth OAuth PKCE via claude.ai/oauth/authorize
- Workspace boxes/{box}/ avec scans/, loot/, exploits/
