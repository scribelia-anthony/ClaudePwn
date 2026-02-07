Affiche l'état complet de la box active.

Lis `.claudepwn-active` pour la box et l'IP.
Lis `boxes/{box}/notes.md` et affiche un résumé structuré :

- **Box** : nom et IP
- **Ports ouverts** : liste des ports/services/versions
- **Web** : URLs et technologies trouvées
- **Users trouvés** : liste
- **Credentials** : tableau user/pass/source
- **Vecteurs d'attaque** : vulnérabilités identifiées
- **Flags** : user et root
- **Fichiers dans scans/** : liste les fichiers disponibles
- **Fichiers dans loot/** : liste les fichiers récupérés

Format compact, pas de bavardage.
