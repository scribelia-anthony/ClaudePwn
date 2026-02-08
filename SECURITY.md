# Politique de sécurité

## Usage responsable

ClaudePwn est conçu **exclusivement** pour :
- Les plateformes de CTF (HackTheBox, TryHackMe, etc.)
- Les labs de pentesting autorisés
- La formation en cybersécurité

**Ne jamais utiliser sur des systèmes sans autorisation écrite explicite.**

## Signaler une vulnérabilité

Si tu découvres une vulnérabilité dans ClaudePwn :

1. **Ne pas** ouvrir une issue publique
2. Envoyer un email à l'adresse indiquée dans le profil GitHub du mainteneur
3. Inclure :
   - Description de la vulnérabilité
   - Étapes de reproduction
   - Impact potentiel

## Délai de réponse

- Accusé de réception : 48h
- Évaluation initiale : 7 jours
- Fix : selon la sévérité

## Bonnes pratiques

- Ne jamais committer de tokens ou API keys (utiliser `.env`)
- Les fichiers `.ovpn` sont exclus par `.gitignore`
- Le workspace `boxes/` est exclu du repo
- Les tokens OAuth sont stockés localement (`~/.claudepwn/`)
