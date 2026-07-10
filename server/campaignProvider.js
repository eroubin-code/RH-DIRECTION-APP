import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { appConfig } from "./config.js";

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadJsonArray(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJsonArray(filePath, rows) {
  ensureDirectory(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(rows, null, 2)}\n`);
}

export class CampaignProvider {
  async queueDeliveries(_payload) {
    throw new Error("CampaignProvider non configure.");
  }
}

export class PreviewCampaignProvider extends CampaignProvider {
  constructor(outboxPath = path.resolve(process.cwd(), appConfig.awareness.outboxPath)) {
    super();
    this.outboxPath = outboxPath;
    this.outbox = loadJsonArray(outboxPath);
  }

  persist() {
    saveJsonArray(this.outboxPath, this.outbox);
  }

  async queueDeliveries({ campaign, deliveries, messages }) {
    const queued = deliveries.map((delivery, index) => {
      const preview = {
        id: crypto.randomUUID(),
        campaignId: campaign.id,
        deliveryId: delivery.id,
        queuedAt: new Date().toISOString(),
        from: {
          email: appConfig.awareness.fromEmail,
          name: appConfig.awareness.fromName,
          replyTo: appConfig.awareness.replyTo
        },
        to: {
          email: delivery.email,
          name: delivery.recipientName
        },
        subject: messages[index].subject,
        text: messages[index].text,
        html: messages[index].html,
        transport: "preview"
      };

      this.outbox.push(preview);

      return {
        deliveryId: delivery.id,
        providerMessageId: preview.id,
        transport: preview.transport
      };
    });

    this.persist();
    return queued;
  }

  listPreviews(limit = 100) {
    return [...this.outbox]
      .sort((left, right) => right.queuedAt.localeCompare(left.queuedAt))
      .slice(0, limit);
  }
}

let providerInstance = null;

export function getCampaignProvider() {
  if (!providerInstance) {
    providerInstance = new PreviewCampaignProvider();
  }

  return providerInstance;
}
