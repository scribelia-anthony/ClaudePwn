# Contribuer à ClaudePwn

Merci de vouloir contribuer ! Voici comment participer.

## Prérequis

- Node.js >= 20
- pnpm
- Un compte Anthropic (OAuth ou API key)

## Setup dev

```bash
git clone https://github.com/scribelia-anthony/ClaudePwn.git
cd ClaudePwn
pnpm install
pnpm dev start TestBox 10.10.10.1
```

## Workflow

1. Fork le repo
2. Crée une branche (`git checkout -b feat/ma-feature`)
3. Code tes changements
4. Vérifie que ça build (`pnpm build`)
5. Vérifie les types (`pnpm exec tsc --noEmit`)
6. Commit avec un message clair (`feat: ajouter support DNS zone transfer`)
7. Push et ouvre une PR

## Conventions

- **Langue** : Messages utilisateur en français, code/commentaires en anglais
- **Commits** : Format [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`)
- **TypeScript** : Strict mode, ESM, pas de `any` sauf nécessité absolue
- **Architecture** : Respecter la structure `src/` existante (agent/, cli/, config/, utils/)

## Ajouter un outil

Pour ajouter un nouvel outil au catalogue de l'agent :

1. Éditer le system prompt dans `src/agent/system-prompt.ts`
2. Ajouter les commandes dans le catalogue existant
3. Tester sur une box HTB

## Ajouter une commande CLI

1. Créer le fichier dans `src/cli/commands/`
2. L'enregistrer dans `src/cli/program.ts`

## Signaler un bug

Utilise le template [Bug Report](https://github.com/scribelia-anthony/ClaudePwn/issues/new?template=bug_report.md).

## Proposer une feature

Utilise le template [Feature Request](https://github.com/scribelia-anthony/ClaudePwn/issues/new?template=feature_request.md).
