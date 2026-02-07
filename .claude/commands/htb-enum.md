Énumération ciblée d'un service sur la box active.

Argument : $ARGUMENTS (le service à énumérer : web, smb, ssh, dns, ldap, snmp, ftp, etc.)

Lis `.claudepwn-active` pour la box et l'IP. Lis `boxes/{box}/notes.md` pour le contexte.

## Selon le service :

### web
- `ffuf -u http://{box}.htb/FUZZ -w /usr/share/seclists/Discovery/Web-Content/directory-list-2.3-medium.txt -fc 404 -o boxes/{box}/scans/ffuf-dirs.json -of json`
- `ffuf -u http://{box}.htb -H "Host: FUZZ.{box}.htb" -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt -fc 302,404 -o boxes/{box}/scans/ffuf-vhosts.json -of json` (filtre la taille par défaut)
- `nikto -h http://{box}.htb -o boxes/{box}/scans/nikto.txt`
- Identifie la stack technique (CMS, framework, langage)
- Si CMS trouvé : wpscan, droopescan, joomscan selon le cas

### smb
- `enum4linux -a {IP}` → `boxes/{box}/scans/enum4linux.txt`
- `crackmapexec smb {IP} --shares` → `boxes/{box}/scans/cme-shares.txt`
- `smbmap -H {IP}` → `boxes/{box}/scans/smbmap.txt`
- Si credentials connus : tente l'accès authentifié

### ssh
- `nmap -p 22 --script ssh-auth-methods,ssh2-enum-algos {IP} -oN boxes/{box}/scans/ssh-enum.txt`
- Vérifie la version pour vulnérabilités connues (searchsploit)

### dns
- `dig axfr {box}.htb @{IP}` → `boxes/{box}/scans/dns-axfr.txt`
- `dig any {box}.htb @{IP}`
- `ffuf -u http://{IP} -H "Host: FUZZ.{box}.htb" -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt -fc 302,404`

### ldap
- `ldapsearch -x -H ldap://{IP} -b "" -s base namingContexts`
- `ldapsearch -x -H ldap://{IP} -b "DC={domain},DC={tld}" "(objectClass=*)"` → `boxes/{box}/scans/ldap-dump.txt`
- `windapsearch -d {box}.htb --dc {IP} -U`

### snmp
- `snmpwalk -v2c -c public {IP}` → `boxes/{box}/scans/snmpwalk.txt`
- `onesixtyone {IP} -c /usr/share/seclists/Discovery/SNMP/snmp.txt`

### ftp
- `nmap -p 21 --script ftp-anon,ftp-syst {IP}`
- Si anonymous login → liste et télécharge les fichiers dans `boxes/{box}/loot/`

Mets à jour `boxes/{box}/notes.md` avec toutes les découvertes. Sauve tous les outputs dans `boxes/{box}/scans/`.
