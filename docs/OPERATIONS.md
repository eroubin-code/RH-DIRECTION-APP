# Exploitation serveur

## Services

Verifier Nginx :

```bash
systemctl status nginx --no-pager
nginx -t
```

Verifier le backend :

```bash
systemctl status rh-direction-app.service --no-pager
journalctl -u rh-direction-app.service -n 100 --no-pager
```

Redemarrer le backend :

```bash
systemctl restart rh-direction-app.service
```

Recharger Nginx :

```bash
systemctl reload nginx
```

## Ports attendus

```bash
ss -ltnp
```

- `80` : Nginx
- `3001` : backend Node/Express
- `22` : SSH

## Tests rapides

```bash
curl -I http://127.0.0.1/
curl -s http://127.0.0.1/api/health
curl -s http://127.0.0.1:3001/api/health
```

## Emplacements importants

- Application : `/opt/rh-direction-app`
- Build frontend : `/opt/rh-direction-app/dist`
- Configuration Nginx : `/etc/nginx/sites-available/rh-direction-app`
- Site Nginx actif : `/etc/nginx/sites-enabled/rh-direction-app`
- Variables serveur : `/opt/rh-direction-app/.env`
- Utilisateurs crees : `/opt/rh-direction-app/server/data/users.store.json`
- Campagnes awareness : `/opt/rh-direction-app/server/data/awareness-campaigns.store.json`
- Outbox preview awareness : `/opt/rh-direction-app/server/data/awareness-outbox.store.json`

## Module awareness

Le backend prepare automatiquement les messages dus toutes les 5 minutes par defaut, sans emission SMTP reelle.

Verifier les traces de traitement :

```bash
journalctl -u rh-direction-app.service -n 100 --no-pager | grep awareness
```

Declencher un traitement manuel :

```bash
curl -X POST http://127.0.0.1:3001/api/awareness/dispatch \
  -H "Authorization: Bearer <token-admin>" \
  -H "x-csrf-token: <csrf-token>"
```

Consulter les messages prepares localement :

```bash
curl -s http://127.0.0.1:3001/api/awareness/outbox \
  -H "Authorization: Bearer <token-admin>"
```

## Rollback simple

Si une archive precedente est disponible :

```bash
cd /opt/rh-direction-app
tar -xzf /tmp/rh-direction-app-previous.tgz -C /opt/rh-direction-app
npm install
npm run build
systemctl restart rh-direction-app.service
```

Sinon, revenir a un commit Git connu puis reconstruire :

```bash
cd /opt/rh-direction-app
git fetch origin
git checkout <branche-ou-commit>
npm install
npm run build
systemctl restart rh-direction-app.service
```
