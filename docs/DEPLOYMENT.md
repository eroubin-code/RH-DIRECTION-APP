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
  -czf /tmp/rh-direction-app-update.tgz .
```

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
    }
}
```

Apres modification Nginx :

```bash
nginx -t
systemctl reload nginx
```
