Connexion infrastructure pour la box active.

Argument optionnel : $ARGUMENTS (fichier .ovpn)

1. **VPN** : Si un fichier .ovpn est fourni en argument, lance le VPN :
   - `sudo openvpn --config {fichier} --daemon --log /tmp/claudepwn-vpn.log`
   - Attends "Initialization Sequence Completed" dans le log
   - Affiche l'IP tun0

2. **Vérifie /etc/hosts** : Lis `.claudepwn-active`, vérifie que `{IP} {box}.htb` est dans /etc/hosts. Ajoute si manquant.

3. **Test connectivité** : `ping -c 1 {IP}` pour vérifier que la box est accessible.

Affiche un résumé : VPN status, IP tun0, entrée hosts, connectivité.
