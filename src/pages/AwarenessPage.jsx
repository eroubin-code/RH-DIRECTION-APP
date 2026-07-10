import { useEffect, useState } from "react";
import DataTable from "../components/DataTable";
import {
  activateAwarenessCampaign,
  attachAwarenessTemplate,
  cancelAwarenessCampaign,
  createAwarenessCampaign,
  createAwarenessGroup,
  createAwarenessTemplate,
  dispatchAwarenessCampaigns,
  getAwarenessAudit,
  getAwarenessCampaigns,
  getAwarenessDashboard,
  getAwarenessGroups,
  getAwarenessCsvReportUrl,
  getAwarenessPdfReportUrl,
  getAwarenessTemplates,
  importAwarenessGroup,
  importAwarenessRecipients,
  updateAwarenessGroup,
  validateAwarenessCampaign
} from "../services/api";

const initialCampaignForm = {
  name: "",
  description: "",
  responsable: "",
  authorizationReference: "",
  startDate: "",
  endDate: "",
  maxPerDay: 4,
  minGapMinutes: 30,
  maxGapMinutes: 90,
  dayStart: "08:30",
  dayEnd: "16:30"
};

const initialGroupForm = {
  name: "",
  description: "",
  members: ""
};

const initialTemplateForm = {
  name: "",
  description: "",
  category: "general",
  subject: "",
  html: "",
  text: ""
};

export default function AwarenessPage() {
  const [dashboard, setDashboard] = useState({ kpis: [], eventCounts: [], campaigns: [] });
  const [campaigns, setCampaigns] = useState([]);
  const [groups, setGroups] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  const [campaignForm, setCampaignForm] = useState(initialCampaignForm);
  const [groupForm, setGroupForm] = useState(initialGroupForm);
  const [templateForm, setTemplateForm] = useState(initialTemplateForm);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [editingGroupId, setEditingGroupId] = useState("");
  const [recipientCsv, setRecipientCsv] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadPage() {
    const [dashboardData, campaignsData, groupsData, templatesData, auditData] =
      await Promise.all([
        getAwarenessDashboard(),
        getAwarenessCampaigns(),
        getAwarenessGroups(),
        getAwarenessTemplates(),
        getAwarenessAudit(50)
      ]);

    setDashboard(dashboardData);
    setCampaigns(campaignsData);
    setGroups(groupsData);
    setTemplates(templatesData);
    setAuditEntries(auditData);
  }

  useEffect(() => {
    loadPage().catch((requestError) => {
      setError(requestError.message);
    });
  }, []);

  async function runAction(action) {
    setError("");
    setMessage("");

    try {
      await action();
      await loadPage();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const campaignColumns = [
    { key: "name", label: "Campagne" },
    { key: "status", label: "Statut" },
    { key: "responsable", label: "Responsable" },
    { key: "startDate", label: "Debut" },
    { key: "endDate", label: "Fin" }
  ];
  const groupColumns = [
    { key: "name", label: "Groupe" },
    { key: "description", label: "Description" },
    { key: "memberCount", label: "Membres" }
  ];
  const templateColumns = [
    { key: "name", label: "Modele" },
    { key: "category", label: "Categorie" },
    { key: "updatedAt", label: "Maj" }
  ];
  const auditColumns = [
    { key: "at", label: "Date" },
    { key: "campaignName", label: "Campagne" },
    { key: "username", label: "Acteur" },
    { key: "action", label: "Action" }
  ];

  function loadGroupIntoForm(groupId) {
    const group = groups.find((entry) => entry.id === groupId);

    if (!group) {
      setEditingGroupId("");
      setGroupForm(initialGroupForm);
      return;
    }

    setEditingGroupId(group.id);
    setGroupForm({
      name: group.name ?? "",
      description: group.description ?? "",
      members: Array.isArray(group.members) ? group.members.join("\n") : ""
    });
  }

  return (
    <div className="page-section rh-section awareness-page">
      <section className="dashboard-hero awareness-hero">
        <div>
          <p className="dashboard-eyebrow">Sensibilisation cybersécurité</p>
          <h2>Pilotage des campagnes Awareness</h2>
          <p>
            Gestion des campagnes, groupes autorises, modeles generiques, audit et rapports.
          </p>
        </div>
      </section>

      {message ? <p className="admin-feedback success">{message}</p> : null}
      {error ? <p className="admin-feedback error">{error}</p> : null}

      <div className="kpi-grid">
        {(dashboard.kpis ?? []).map((item) => (
          <article className="kpi-card content-card rh-panel" key={item.label}>
            <p className="kpi-label">{item.label}</p>
            <strong className="kpi-value">{item.value}</strong>
          </article>
        ))}
      </div>

      <div className="dashboard-grid">
        <section className="content-card rh-panel dashboard-panel">
          <div className="section-title">
            <h3 className="rh-panel-title">Evenements</h3>
          </div>
          <div className="dashboard-list">
            {(dashboard.eventCounts ?? []).map((item) => (
              <div className="dashboard-list-row" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="content-card rh-panel dashboard-panel">
          <div className="section-title">
            <h3 className="rh-panel-title">Actions rapides</h3>
          </div>
          <div className="awareness-actions">
            <button
              className="effectif-reset"
              type="button"
              onClick={() =>
                runAction(async () => {
                  const result = await dispatchAwarenessCampaigns();
                  setMessage(`${result.dispatchedCount} message(s) prepares.`);
                })
              }
            >
              Lancer le traitement
            </button>
          </div>
        </section>
      </div>

      <div className="awareness-grid">
        <section className="content-card rh-panel">
          <div className="section-title">
            <h3 className="rh-panel-title">Nouvelle campagne</h3>
          </div>
          <form
            className="admin-form awareness-form"
            onSubmit={(event) => {
              event.preventDefault();
              runAction(async () => {
                await createAwarenessCampaign(campaignForm);
                setCampaignForm(initialCampaignForm);
                setMessage("Campagne creee.");
              });
            }}
          >
            <input
              placeholder="Nom"
              value={campaignForm.name}
              onChange={(event) =>
                setCampaignForm((previous) => ({ ...previous, name: event.target.value }))
              }
            />
            <input
              placeholder="Responsable"
              value={campaignForm.responsable}
              onChange={(event) =>
                setCampaignForm((previous) => ({ ...previous, responsable: event.target.value }))
              }
            />
            <input
              placeholder="Reference autorisation"
              value={campaignForm.authorizationReference}
              onChange={(event) =>
                setCampaignForm((previous) => ({
                  ...previous,
                  authorizationReference: event.target.value
                }))
              }
            />
            <textarea
              placeholder="Description"
              value={campaignForm.description}
              onChange={(event) =>
                setCampaignForm((previous) => ({
                  ...previous,
                  description: event.target.value
                }))
              }
            />
            <div className="awareness-inline-fields">
              <input
                type="date"
                value={campaignForm.startDate}
                onChange={(event) =>
                  setCampaignForm((previous) => ({ ...previous, startDate: event.target.value }))
                }
              />
              <input
                type="date"
                value={campaignForm.endDate}
                onChange={(event) =>
                  setCampaignForm((previous) => ({ ...previous, endDate: event.target.value }))
                }
              />
            </div>
            <button className="login-button" type="submit">
              Creer la campagne
            </button>
          </form>
        </section>

        <section className="content-card rh-panel">
          <div className="section-title">
            <h3 className="rh-panel-title">
              {editingGroupId ? "Modifier le groupe" : "Nouveau groupe"}
            </h3>
          </div>
          <form
            className="admin-form awareness-form"
            onSubmit={(event) => {
              event.preventDefault();
              runAction(async () => {
                const payload = {
                  ...groupForm,
                  members: groupForm.members
                    .split(/\r?\n|,|;/)
                    .map((member) => member.trim())
                    .filter(Boolean)
                };

                if (editingGroupId) {
                  await updateAwarenessGroup(editingGroupId, payload);
                  setMessage("Groupe mis a jour.");
                } else {
                  await createAwarenessGroup(payload);
                  setMessage("Groupe cree.");
                }

                setEditingGroupId("");
                setGroupForm(initialGroupForm);
              });
            }}
          >
            <select
              value={editingGroupId}
              onChange={(event) => loadGroupIntoForm(event.target.value)}
            >
              <option value="">Creer un nouveau groupe</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Nom du groupe"
              value={groupForm.name}
              onChange={(event) =>
                setGroupForm((previous) => ({ ...previous, name: event.target.value }))
              }
            />
            <input
              placeholder="Description"
              value={groupForm.description}
              onChange={(event) =>
                setGroupForm((previous) => ({ ...previous, description: event.target.value }))
              }
            />
            <textarea
              placeholder="Emails autorises, un par ligne"
              value={groupForm.members}
              onChange={(event) =>
                setGroupForm((previous) => ({ ...previous, members: event.target.value }))
              }
            />
            <div className="awareness-actions">
              <button className="login-button" type="submit">
                {editingGroupId ? "Enregistrer le groupe" : "Creer le groupe"}
              </button>
              {editingGroupId ? (
                <button
                  className="effectif-reset"
                  type="button"
                  onClick={() => {
                    setEditingGroupId("");
                    setGroupForm(initialGroupForm);
                  }}
                >
                  Annuler l'edition
                </button>
              ) : null}
            </div>
          </form>
        </section>
      </div>

      <div className="awareness-grid">
        <section className="content-card rh-panel">
          <div className="section-title">
            <h3 className="rh-panel-title">Nouveau modele</h3>
          </div>
          <form
            className="admin-form awareness-form"
            onSubmit={(event) => {
              event.preventDefault();
              runAction(async () => {
                await createAwarenessTemplate(templateForm);
                setTemplateForm(initialTemplateForm);
                setMessage("Modele cree.");
              });
            }}
          >
            <input
              placeholder="Nom du modele"
              value={templateForm.name}
              onChange={(event) =>
                setTemplateForm((previous) => ({ ...previous, name: event.target.value }))
              }
            />
            <input
              placeholder="Categorie"
              value={templateForm.category}
              onChange={(event) =>
                setTemplateForm((previous) => ({ ...previous, category: event.target.value }))
              }
            />
            <input
              placeholder="Sujet"
              value={templateForm.subject}
              onChange={(event) =>
                setTemplateForm((previous) => ({ ...previous, subject: event.target.value }))
              }
            />
            <textarea
              placeholder="Description"
              value={templateForm.description}
              onChange={(event) =>
                setTemplateForm((previous) => ({ ...previous, description: event.target.value }))
              }
            />
            <textarea
              placeholder="Contenu HTML"
              value={templateForm.html}
              onChange={(event) =>
                setTemplateForm((previous) => ({ ...previous, html: event.target.value }))
              }
            />
            <textarea
              placeholder="Texte brut"
              value={templateForm.text}
              onChange={(event) =>
                setTemplateForm((previous) => ({ ...previous, text: event.target.value }))
              }
            />
            <button className="login-button" type="submit">
              Creer le modele
            </button>
          </form>
        </section>

        <section className="content-card rh-panel">
          <div className="section-title">
            <h3 className="rh-panel-title">Operations campagne</h3>
          </div>
          <div className="admin-form awareness-form">
            <select
              value={selectedCampaignId}
              onChange={(event) => setSelectedCampaignId(event.target.value)}
            >
              <option value="">Selectionner une campagne</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
            <select
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
            >
              <option value="">Selectionner un modele</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <select
              value={selectedGroupId}
              onChange={(event) => setSelectedGroupId(event.target.value)}
            >
              <option value="">Selectionner un groupe</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <textarea
              placeholder="CSV destinataires"
              value={recipientCsv}
              onChange={(event) => setRecipientCsv(event.target.value)}
            />
            <div className="awareness-actions">
              <button
                className="effectif-reset"
                type="button"
                disabled={!selectedCampaignId || !selectedTemplateId}
                onClick={() =>
                  runAction(async () => {
                    await attachAwarenessTemplate(selectedCampaignId, selectedTemplateId);
                    setMessage("Modele attache a la campagne.");
                  })
                }
              >
                Attacher le modele
              </button>
              <button
                className="effectif-reset"
                type="button"
                disabled={!selectedCampaignId || !selectedGroupId}
                onClick={() =>
                  runAction(async () => {
                    await importAwarenessGroup(selectedCampaignId, selectedGroupId);
                    setMessage("Groupe importe dans la campagne.");
                  })
                }
              >
                Importer le groupe
              </button>
              <button
                className="effectif-reset"
                type="button"
                disabled={!selectedCampaignId || !recipientCsv.trim()}
                onClick={() =>
                  runAction(async () => {
                    await importAwarenessRecipients(selectedCampaignId, recipientCsv);
                    setRecipientCsv("");
                    setMessage("Destinataires importes.");
                  })
                }
              >
                Importer le CSV
              </button>
              <button
                className="effectif-reset"
                type="button"
                disabled={!selectedCampaignId}
                onClick={() =>
                  runAction(async () => {
                    await validateAwarenessCampaign(selectedCampaignId, {});
                    setMessage("Campagne validee.");
                  })
                }
              >
                Valider
              </button>
              <button
                className="effectif-reset"
                type="button"
                disabled={!selectedCampaignId}
                onClick={() =>
                  runAction(async () => {
                    await activateAwarenessCampaign(selectedCampaignId);
                    setMessage("Campagne activee.");
                  })
                }
              >
                Activer
              </button>
              <button
                className="effectif-reset"
                type="button"
                disabled={!selectedCampaignId}
                onClick={() =>
                  runAction(async () => {
                    await cancelAwarenessCampaign(selectedCampaignId);
                    setMessage("Campagne annulee.");
                  })
                }
              >
                Arret / annulation
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="content-card rh-panel dashboard-panel">
        <div className="section-title">
          <h3 className="rh-panel-title">Campagnes</h3>
        </div>
        <DataTable columns={campaignColumns} data={campaigns} />
        <div className="awareness-report-links">
          {campaigns.map((campaign) => (
            <div className="dashboard-list-row" key={campaign.id}>
              <span>{campaign.name}</span>
              <strong>
                <a href={getAwarenessCsvReportUrl(campaign.id)} target="_blank" rel="noreferrer">
                  CSV
                </a>
                {" / "}
                <a href={getAwarenessPdfReportUrl(campaign.id)} target="_blank" rel="noreferrer">
                  PDF
                </a>
              </strong>
            </div>
          ))}
        </div>
      </section>

      <div className="awareness-grid awareness-bottom-grid">
        <section className="content-card rh-panel dashboard-panel">
          <div className="section-title">
            <h3 className="rh-panel-title">Groupes</h3>
          </div>
          <DataTable columns={groupColumns} data={groups} />
        </section>

        <section className="content-card rh-panel dashboard-panel">
          <div className="section-title">
            <h3 className="rh-panel-title">Modeles</h3>
          </div>
          <DataTable columns={templateColumns} data={templates} />
        </section>
      </div>

      <section className="content-card rh-panel dashboard-panel">
        <div className="section-title">
          <h3 className="rh-panel-title">Audit recent</h3>
        </div>
        <DataTable columns={auditColumns} data={auditEntries} />
      </section>
    </div>
  );
}
