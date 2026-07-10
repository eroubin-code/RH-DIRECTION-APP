# API Awareness

## Authentification

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

Les routes d'ecriture exigent :
- `Authorization: Bearer <token>`
- `x-csrf-token: <csrf-token>`

## Groupes

- `GET /api/awareness/groups`
- `POST /api/awareness/groups`
- `PATCH /api/awareness/groups/:groupId`

## Bibliotheque de modeles

- `GET /api/awareness/templates`
- `POST /api/awareness/templates`
- `PATCH /api/awareness/templates/:templateId`

## Campagnes

- `GET /api/awareness/dashboard`
- `GET /api/awareness/campaigns`
- `GET /api/awareness/campaigns/:campaignId`
- `POST /api/awareness/campaigns`
- `PATCH /api/awareness/campaigns/:campaignId`
- `POST /api/awareness/campaigns/:campaignId/recipients/import`
- `POST /api/awareness/campaigns/:campaignId/groups/:groupId/import`
- `POST /api/awareness/campaigns/:campaignId/recipients/exclude`
- `PUT /api/awareness/campaigns/:campaignId/template`
- `POST /api/awareness/campaigns/:campaignId/template/attach`
- `POST /api/awareness/campaigns/:campaignId/validate`
- `POST /api/awareness/campaigns/:campaignId/activate`
- `POST /api/awareness/campaigns/:campaignId/cancel`
- `POST /api/awareness/dispatch`

## Reporting

- `GET /api/awareness/outbox`
- `GET /api/awareness/audit`
- `GET /api/awareness/campaigns/:campaignId/report.csv`
- `GET /api/awareness/campaigns/:campaignId/report.pdf`

## Provider externe

- `POST /api/awareness/provider/events`

Payload exemple :

```json
{
  "providerMessageId": "uuid-du-provider",
  "type": "message_opened"
}
```

Types supportes :

- `message_sent`
- `message_opened`
- `message_clicked`
- `message_reported`
- `campaign_finished`

## Routes publiques signees

- `GET /awareness/click/:trackingId`
- `GET /awareness/report/:trackingId`
- `GET /awareness/unsubscribe/:trackingId`
