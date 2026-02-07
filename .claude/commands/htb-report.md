Génère un writeup/rapport complet pour la box active.

Lis `.claudepwn-active` pour la box.
Lis `boxes/{box}/notes.md` et `boxes/{box}/log.md` pour le contenu.
Lis les scans dans `boxes/{box}/scans/` pour les détails techniques.

Génère `boxes/{box}/report.md` avec la structure suivante :

```markdown
# {Box} — Writeup

## Informations
- **IP** : {ip}
- **OS** : {os détecté}
- **Difficulté** : {si connue}
- **Date** : {date}

## Résumé
{2-3 phrases résumant le chemin d'attaque complet}

## Reconnaissance
{Scans effectués, ports/services trouvés}

## Énumération
{Détails de l'énumération par service, découvertes}

## Exploitation — User
{Vecteur d'attaque, exploitation étape par étape, commandes utilisées}
### Flag User
`{flag}`

## Escalade de Privilèges — Root
{Méthode de privesc, étapes, commandes}
### Flag Root
`{flag}`

## Leçons Apprises
{Ce qui a bien marché, ce qui a pris du temps, techniques apprises}
```

Écris le rapport dans `boxes/{box}/report.md`.
