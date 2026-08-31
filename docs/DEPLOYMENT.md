# Guide de deploiement

## Architecture cible

- Serveur : `rh-app.local.iecb.u-bordeaux.fr` / `172.16.100.20`
- Dossier applicatif : `/opt/rh-direction-app`
- Frontend : build Vite servi par Nginx depuis `/opt/rh-direction-app/dist`
- Backend : Node/Express sur le port `3001`
- Service systemd : `rh-direction-app.service`
- Proxy API : `/api/` vers `http://127.0.0.1:3001`

## Preparer l'archive depuis le poste local

```bash
cd /mnt/c/Users/eric/Projet/RH-DIRECTION-APP-git

tar \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=.git \
  --exclude=.env \
  --exclude=server/data/users.store.json \
  --exclude=server/data/awareness-campaigns.store.json \
  --exclude=server/data/awareness-outbox.store.json \
  --exclude=server/data/arrival-notify.store.json \
  -czf /tmp/rh-direction-app-update.tgz .
```

⚠️ Ces fichiers `*.store.json` contiennent l'etat vivant de la production (comptes utilisateurs, campagnes de sensibilisation en cours) — ils divergent forcement du poste local et **ne doivent jamais etre ecrases par un deploiement**. Un oubli ici a deja provoque un incident (mot de passe admin ecrase par le hash local lors d'un deploiement).

## Envoyer l'archive

```bash
scp -i ~/.ssh/rh-direction-app \
  /tmp/rh-direction-app-update.tgz \
  root@172.16.100.20:/tmp/
```

## Deployer sur le serveur

```bash
ssh -i ~/.ssh/rh-direction-app root@172.16.100.20

cd /opt/rh-direction-app
tar -xzf /tmp/rh-direction-app-update.tgz -C /opt/rh-direction-app
npm install
npm run build
systemctl restart rh-direction-app.service
```

## Verifier le service

```bash
systemctl status rh-direction-app.service --no-pager
curl -s http://127.0.0.1:3001/api/health
curl -I http://127.0.0.1/
```

## Configuration Nginx attendue

Le site actif est `/etc/nginx/sites-enabled/rh-direction-app`.

```nginx
server {
    listen 80;
    server_name _;

    root /opt/rh-direction-app/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "same-origin" always;
}
```

Apres modification Nginx :

```bash
nginx -t
systemctl reload nginx
```

`X-Forwarded-For` est indispensable : le backend (`app.set("trust proxy", "loopback")` dans `server/index.js`) s'en sert pour retrouver l'IP reelle du client derriere Nginx, notamment pour le controle d'acces du dashboard public. Sans cet en-tete, toutes les requetes apparaissent comme venant de `127.0.0.1`.
