Scan complet automatique de la box active.

Lis `.claudepwn-active` pour obtenir la box et l'IP.

Exécute dans l'ordre et enchaîne automatiquement :

1. **Nmap full TCP** : `nmap -sC -sV -p- {IP} -oN boxes/{box}/scans/nmap-full.txt`
   - Parse le résultat : extrais chaque port, service, version
   - Mets à jour `boxes/{box}/notes.md` section "Ports & Services"

2. **Searchsploit** sur chaque service:version trouvé par nmap
   - Sauve dans `boxes/{box}/scans/searchsploit.txt`
   - Note les exploits pertinents dans notes.md "Vecteurs d'attaque"

3. **Si port 80 ou 443 ouvert** :
   - `whatweb {IP}` ou `whatweb http://{box}.htb` → sauve dans `boxes/{box}/scans/whatweb.txt`
   - `ffuf -u http://{box}.htb/FUZZ -w /usr/share/seclists/Discovery/Web-Content/directory-list-2.3-medium.txt -o boxes/{box}/scans/ffuf-dirs.json -of json -fc 404` (ou adapte la wordlist si seclists pas dispo)
   - Mets à jour notes.md section "Web"

4. **Si port 445 ouvert** :
   - `smbclient -L //{IP} -N` → sauve dans `boxes/{box}/scans/smb-shares.txt`
   - `enum4linux -a {IP}` → sauve dans `boxes/{box}/scans/enum4linux.txt`

5. **Nmap UDP top 50** : `nmap -sU --top-ports 50 {IP} -oN boxes/{box}/scans/nmap-udp.txt`

Résume les découvertes en 3-5 lignes max à la fin. Pas de bavardage pendant l'exécution.
