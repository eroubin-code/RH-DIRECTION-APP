// Espace reserve aux comptes habilites pour gerer les utilisateurs applicatifs.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import DataTable from "../components/DataTable";
import {
  createPersonnel,
  createUser,
  getEffectif,
  getEntites,
  getGlpiArrivals,
  getPendingPersonnel,
  getPersonnelTypes,
  getUsers,
  rejectPendingPersonnel,
  resetUserPassword,
  submitPendingPersonnel,
  validatePendingPersonnel
} from "../services/api";

const ROLE_OPTIONS = [
  { value: "beta", label: "Beta" },
  { value: "operateur", label: "Operateur" },
  { value: "operateur_saisie", label: "Opérateur de saisie" },
  { value: "admin", label: "Administrateur" }
];

const ADMIN_SECTIONS = ["utilisateurs", "personnel", "batiments", "plans", "saisie"];

const PASSWORD_RULE_TEXT =
  "8 caractères minimum, avec au moins une lettre, un chiffre et un caractère spécial.";

const PENDING_STATUS_LABELS = {
  en_attente: "En attente",
  validee: "Validée",
  rejetee: "Rejetée"
};

// Formate une date SQL (DATE "2026-09-01" ou DATETIME "2026-09-01 15:10:00")
// pour l'affichage dans la fenetre de revue. Renvoie la valeur brute si elle
// n'est pas interpretable, "—" si vide.
function formatFrDateTime(value) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return "—";
  }

  const hasTime = /[ T]\d{2}:\d{2}/.test(raw);
  const isoish = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(hasTime ? isoish : `${isoish}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return new Intl.DateTimeFormat(
    "fr-FR",
    hasTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }
  ).format(date);
}

// Fenetre de revue d'une saisie en attente : recapitule tous les champs saisis
// (y compris ceux absents du tableau) avant que l'admin ne valide ou rejette.
function PendingReviewModal({
  entry,
  canDecide,
  deciding,
  contactLabel,
  rejectComment,
  onRejectCommentChange,
  feedbackError,
  onValidate,
  onReject,
  onClose
}) {
  const rows = [
    ["Civilité", entry.civilite || "—"],
    ["Nom", entry.nom || "—"],
    ["Prénom", entry.prenom || "—"],
    ["Date de naissance", formatFrDateTime(entry.naissance)],
    ["Pays de naissance", entry.pays || "—"],
    ["Fonction", entry.fonction || "—"],
    ["Type de personnel", entry.type_personne || "—"],
    ["Contact (référent)", contactLabel || "—"],
    ["Entité", entry.entite || "—"],
    ["Tutelle", entry.tutelle || "—"],
    ["Date d'arrivée", formatFrDateTime(entry.arrivee)],
    [
      "Date de départ",
      entry.depart ? formatFrDateTime(entry.depart) : "Personnel permanent"
    ],
    ["Badge demandé", entry.badge_demande ? "Oui" : "Non"],
    [
      "Numéro de badge",
      entry.numero_badge || (entry.badge_demande ? "à attribuer" : "—")
    ],
    ["Statut", PENDING_STATUS_LABELS[entry.statut] ?? entry.statut],
    ["Saisi par", entry.submitted_by_username || "—"],
    ["Soumis le", formatFrDateTime(entry.submitted_at)],
    [
      "Origine",
      entry.glpi_formanswer_id
        ? `Formulaire GLPI #${entry.glpi_formanswer_id}`
        : "Saisie manuelle"
    ]
  ];

  if (entry.statut !== "en_attente") {
    rows.push(["Décidé par", entry.decided_by_username || "—"]);
    rows.push(["Décidé le", formatFrDateTime(entry.decided_at)]);

    if (entry.decision_comment) {
      rows.push(["Commentaire", entry.decision_comment]);
    }
  }

  const canAct = canDecide && entry.statut === "en_attente";

  return (
    <div className="admin-review-overlay" onClick={onClose} role="presentation">
      <div
        aria-labelledby="admin-review-title"
        aria-modal="true"
        className="admin-review-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="admin-review-head">
          <h4 id="admin-review-title">
            Revue de la saisie — {entry.prenom} {entry.nom}
          </h4>
          <button
            aria-label="Fermer"
            className="admin-review-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <dl className="admin-review-grid">
          {rows.map(([label, value]) => (
            <div className="admin-review-row" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {canAct ? (
          <div className="admin-review-actions">
            {feedbackError ? (
              <p className="admin-feedback error">{feedbackError}</p>
            ) : null}
            <label className="admin-field">
              <span>Motif de rejet (optionnel)</span>
              <input
                disabled={deciding}
                onChange={(event) => onRejectCommentChange(event.target.value)}
                type="text"
                value={rejectComment}
              />
            </label>
            <div className="admin-review-buttons">
              <button
                className="btn-primary admin-submit"
                disabled={deciding}
                onClick={onValidate}
                type="button"
              >
                {deciding ? "Traitement..." : "Valider et créer le personnel"}
              </button>
              <button
                className="admin-review-reject"
                disabled={deciding}
                onClick={onReject}
                type="button"
              >
                Rejeter
              </button>
            </div>
          </div>
        ) : (
          <p className="admin-form-hint">
            {canDecide
              ? "Cette saisie a déjà été traitée."
              : "Lecture seule — la validation est réservée aux administrateurs."}
          </p>
        )}
      </div>
    </div>
  );
}

const initialForm = {
  username: "",
  password: "",
  role: "beta"
};

const initialPasswordResetForm = {
  userId: "",
  password: "",
  confirmation: ""
};

export default function AdministrationPage({ currentUser }) {
  const [searchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [entites, setEntites] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [fonctions, setFonctions] = useState([]);
  const [personnelTypes, setPersonnelTypes] = useState([]);
  const [tutelles, setTutelles] = useState([]);
  const [paysNaissance, setPaysNaissance] = useState([]);
  const [isPersonnelPermanent, setIsPersonnelPermanent] = useState(false);
  const [isPendingPermanent, setIsPendingPermanent] = useState(false);
  const [isPendingBadge, setIsPendingBadge] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [passwordResetForm, setPasswordResetForm] = useState(initialPasswordResetForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [feedbackTarget, setFeedbackTarget] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isCreatingPersonnel, setIsCreatingPersonnel] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [pendingEntries, setPendingEntries] = useState([]);
  const [isSubmittingPending, setIsSubmittingPending] = useState(false);
  const [decidingPendingId, setDecidingPendingId] = useState(null);
  const [rejectComments, setRejectComments] = useState({});
  const [glpiArrivals, setGlpiArrivals] = useState([]);
  const [prefillData, setPrefillData] = useState(null);
  const [prefillKey, setPrefillKey] = useState(0);
  const [reviewEntry, setReviewEntry] = useState(null);

  const isEntryOnlyRole = currentUser?.role === "operateur_saisie";
  const canDecidePending = currentUser?.role === "admin" || currentUser?.role === "operateur";
  // Liste "à vérifier" en haut de l'onglet : pour un valideur, uniquement les
  // saisies encore en attente ; pour l'operateur_saisie, ses propres saisies
  // (deja filtrees cote serveur), tous statuts confondus.
  const pendingToReview = canDecidePending
    ? pendingEntries.filter((entry) => entry.statut === "en_attente")
    : pendingEntries;
  const requestedSection = searchParams.get("section") ?? "utilisateurs";
  const activeSection = ADMIN_SECTIONS.includes(requestedSection)
    ? requestedSection
    : "utilisateurs";
  // operateur_saisie n'a le droit de voir que l'onglet "saisie", meme si l'URL
  // demande une autre section (defense en profondeur, l'API refuse deja les
  // autres endpoints admin cote serveur pour ce role).
  const effectiveSection = isEntryOnlyRole ? "saisie" : activeSection;

  function loadPendingPersonnel() {
    getPendingPersonnel()
      .then(setPendingEntries)
      .catch((requestError) => {
        setFeedbackTarget("page");
        setError(requestError.message);
      });
  }

  function loadGlpiArrivals() {
    // Fonctionnalite optionnelle (necessite RH_GLPI_MYSQL_USER cote serveur) :
    // une erreur ici ne doit pas bloquer le reste de la page de saisie.
    getGlpiArrivals()
      .then(setGlpiArrivals)
      .catch(() => setGlpiArrivals([]));
  }

  useEffect(() => {
    if (effectiveSection === "saisie") {
      loadPendingPersonnel();
      loadGlpiArrivals();
    }
  }, [effectiveSection]);

  // Fermeture de la fenetre de revue au clavier (Echap).
  useEffect(() => {
    if (!reviewEntry) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setReviewEntry(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reviewEntry]);

  // La saisie affichee dans la fenetre de revue suit la liste rechargee
  // (statut mis a jour apres validation/rejet) et disparait si elle n'existe plus.
  useEffect(() => {
    if (!reviewEntry) {
      return;
    }

    const refreshed = pendingEntries.find((entry) => entry.id === reviewEntry.id);
    if (refreshed && refreshed !== reviewEntry) {
      setReviewEntry(refreshed);
    }
  }, [pendingEntries, reviewEntry]);

  function handlePrefillFromGlpi(submission) {
    setPrefillData(submission);
    setPrefillKey((previous) => previous + 1);

    if (submission.isPermanent !== null) {
      setIsPendingPermanent(submission.isPermanent);
    }
  }

  useEffect(() => {
    getUsers().then(setUsers).catch((requestError) => {
      setFeedbackTarget("page");
      setError(requestError.message);
    });
  }, []);

  useEffect(() => {
    getEntites()
      .then((data) => {
        const normalizedEntites = [
          ...new Set(
            data
              .map((entite) => String(entite.entite ?? "").trim())
              .filter(Boolean)
          )
        ].sort((left, right) => left.localeCompare(right));

        setEntites(normalizedEntites);
      })
      .catch((requestError) => {
        setFeedbackTarget("page");
        setError(requestError.message);
      });
  }, []);

  useEffect(() => {
    getEffectif()
      .then((data) => {
        const normalizedFonctions = [
          ...new Set(
            data
              .map((personnel) => String(personnel.fonction ?? "").trim())
              .filter(Boolean)
              .map((fonction) => fonction.toLocaleUpperCase("fr-FR"))
          )
        ].sort((left, right) => left.localeCompare(right));
        const normalizedTutelles = [
          ...new Set(
            data
              .map((personnel) => String(personnel.tutelle ?? "").trim())
              .filter(Boolean)
          )
        ].sort((left, right) => left.localeCompare(right));
        const normalizedPays = [
          ...new Set(
            data
              .map((personnel) => String(personnel.nationalite ?? "").trim())
              .filter(Boolean)
          )
        ].sort((left, right) => left.localeCompare(right));

        const normalizedContacts = data
          .filter((personnel) => personnel.id)
          .map((personnel) => ({
            id: personnel.id,
            label: `${String(personnel.nom ?? "").trim()} ${String(
              personnel.prenom ?? ""
            ).trim()}`.trim()
          }))
          .sort((left, right) => left.label.localeCompare(right.label));

        setFonctions(normalizedFonctions);
        setTutelles(normalizedTutelles);
        setPaysNaissance(normalizedPays);
        setContacts(normalizedContacts);
      })
      .catch((requestError) => {
        setFeedbackTarget("page");
        setError(requestError.message);
      });
  }, []);

  useEffect(() => {
    getPersonnelTypes()
      .then(setPersonnelTypes)
      .catch((requestError) => {
        setFeedbackTarget("page");
        setError(requestError.message);
      });
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value
    }));
  }

  function handlePasswordResetChange(event) {
    const { name, value } = event.target;

    setPasswordResetForm((previous) => ({
      ...previous,
      [name]: value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsCreatingUser(true);
    setFeedbackTarget("user");
    setError("");
    setMessage("");

    try {
      const user = await createUser(form);
      setUsers((previous) => [...previous, user]);
      setForm(initialForm);
      setMessage(`Utilisateur ${user.username} cree.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsCreatingUser(false);
    }
  }

  async function handlePasswordResetSubmit(event) {
    event.preventDefault();
    setIsResettingPassword(true);
    setFeedbackTarget("password");
    setError("");
    setMessage("");

    if (passwordResetForm.password !== passwordResetForm.confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      setIsResettingPassword(false);
      return;
    }

    try {
      const user = await resetUserPassword(
        passwordResetForm.userId,
        passwordResetForm.password
      );
      setPasswordResetForm(initialPasswordResetForm);
      setMessage(`Mot de passe de ${user.username} modifie.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsResettingPassword(false);
    }
  }

  async function handlePersonnelSubmit(event) {
    event.preventDefault();
    setIsCreatingPersonnel(true);
    setFeedbackTarget("personnel");
    setError("");
    setMessage("");

    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const payload = {
      civilite: formData.get("civilite"),
      nom: formData.get("nom"),
      prenom: formData.get("prenom"),
      naissance: formData.get("naissance"),
      pays: formData.get("pays"),
      paysLibre: formData.get("paysLibre"),
      fonction: formData.get("fonction"),
      fonctionLibre: formData.get("fonctionLibre"),
      typePersonne: formData.get("typePersonne"),
      entite: formData.get("entite"),
      tutelle: formData.get("tutelle"),
      arrivee: formData.get("arrivee"),
      permanent: isPersonnelPermanent,
      depart: isPersonnelPermanent ? "" : formData.get("depart")
    };

    try {
      const personnel = await createPersonnel(payload);
      formElement?.reset?.();
      setIsPersonnelPermanent(false);
      setMessage(
        `Personnel ${personnel.prenom} ${personnel.nom} cree. Identifiant : ${personnel.userid}.`
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsCreatingPersonnel(false);
    }
  }

  async function handlePendingSubmit(event) {
    event.preventDefault();
    setIsSubmittingPending(true);
    setFeedbackTarget("saisie");
    setError("");
    setMessage("");

    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const payload = {
      civilite: formData.get("civilite"),
      nom: formData.get("nom"),
      prenom: formData.get("prenom"),
      naissance: formData.get("naissance"),
      pays: formData.get("pays"),
      paysLibre: formData.get("paysLibre"),
      fonction: formData.get("fonction"),
      fonctionLibre: formData.get("fonctionLibre"),
      typePersonne: formData.get("typePersonne"),
      entite: formData.get("entite"),
      tutelle: formData.get("tutelle"),
      arrivee: formData.get("arrivee"),
      permanent: isPendingPermanent,
      depart: isPendingPermanent ? "" : formData.get("depart"),
      badgeDemande: isPendingBadge,
      numeroBadge: isPendingBadge ? formData.get("numeroBadge") : "",
      contactPersonneId: formData.get("contactPersonneId") || null,
      glpiFormanswerId: prefillData?.glpiFormanswerId ?? null
    };

    try {
      const pending = await submitPendingPersonnel(payload);
      formElement?.reset?.();
      setIsPendingPermanent(false);
      setIsPendingBadge(false);
      setPrefillData(null);
      setPrefillKey((previous) => previous + 1);
      setPendingEntries((previous) => [pending, ...previous]);
      // La soumission provenait d'une arrivee GLPI : elle disparait de la liste
      // "a importer" (deja transformee en saisie).
      if (payload.glpiFormanswerId) {
        setGlpiArrivals((previous) =>
          previous.filter((item) => item.glpiFormanswerId !== payload.glpiFormanswerId)
        );
      }
      setMessage(
        `Saisie de ${pending.prenom} ${pending.nom} envoyee aux administrateurs pour validation.`
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmittingPending(false);
    }
  }

  async function handleValidatePending(id) {
    setDecidingPendingId(id);
    setFeedbackTarget("saisie");
    setError("");
    setMessage("");

    try {
      await validatePendingPersonnel(id);
      setMessage("Saisie validee, le personnel a ete cree.");
      setReviewEntry(null);
      loadPendingPersonnel();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDecidingPendingId(null);
    }
  }

  async function handleRejectPending(id) {
    setDecidingPendingId(id);
    setFeedbackTarget("saisie");
    setError("");
    setMessage("");

    try {
      await rejectPendingPersonnel(id, rejectComments[id] ?? "");
      setMessage("Saisie rejetee.");
      setReviewEntry(null);
      setRejectComments((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      loadPendingPersonnel();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDecidingPendingId(null);
    }
  }

  const columns = [
    { key: "username", label: "Utilisateur" },
    { key: "role", label: "Role" }
  ];
  const availableRoleOptions =
    currentUser?.role === "admin"
      ? ROLE_OPTIONS
      : ROLE_OPTIONS.filter((role) => role.value !== "admin");
  const resettableUsers =
    currentUser?.role === "admin"
      ? users
      : users.filter((user) => user.role !== "admin");
  return (
    <section className="content-card rh-panel rh-section admin-section">
      <div className="section-title">
        <h3 className="rh-panel-title">Administration</h3>
        <Link className="admin-home-link" to="/dashboard">
          Visualiser les stats
        </Link>
      </div>

      {feedbackTarget === "page" && error ? (
        <p className="admin-feedback error">{error}</p>
      ) : null}

      {effectiveSection === "utilisateurs" ? (
        <div className="admin-layout">
          <form className="admin-form" onSubmit={handleSubmit}>
            <div className="admin-form-header">
              <h4>Créer un utilisateur</h4>
            </div>

            <label className="admin-field">
              <span>Utilisateur</span>
              <input
                autoComplete="off"
                minLength="3"
                name="username"
                onChange={handleChange}
                required
                type="text"
                value={form.username}
              />
            </label>

            <label className="admin-field">
              <span>Mot de passe</span>
              <input
                autoComplete="new-password"
                minLength="8"
                name="password"
                onChange={handleChange}
                required
                type="password"
                value={form.password}
              />
              <small className="admin-form-hint">{PASSWORD_RULE_TEXT}</small>
            </label>

            <label className="admin-field">
              <span>Role</span>
              <select name="role" onChange={handleChange} value={form.role}>
                {availableRoleOptions.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>

            {feedbackTarget === "user" && error ? (
              <p className="admin-feedback error">{error}</p>
            ) : null}
            {feedbackTarget === "user" && message ? (
              <p className="admin-feedback success">{message}</p>
            ) : null}

            <button className="btn-primary admin-submit" disabled={isCreatingUser} type="submit">
              {isCreatingUser ? "Creation..." : "Créer"}
            </button>
          </form>

          <div className="admin-users">
            <div className="admin-users-list">
              <div className="admin-form-header">
                <h4>Utilisateurs du site</h4>
              </div>
              <DataTable columns={columns} data={users} />
            </div>

            <form className="admin-form admin-password-form" onSubmit={handlePasswordResetSubmit}>
              <div className="admin-form-header">
                <h4>Réinitialiser un mot de passe</h4>
              </div>

              <label className="admin-field">
                <span>Utilisateur</span>
                <select
                  name="userId"
                  onChange={handlePasswordResetChange}
                  required
                  value={passwordResetForm.userId}
                >
                  <option value="" disabled>
                    Sélectionner un utilisateur
                  </option>
                  {resettableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.username} ({user.role})
                    </option>
                  ))}
                </select>
              </label>

              <div className="admin-form-grid compact">
                <label className="admin-field">
                  <span>Nouveau mot de passe</span>
                  <input
                    autoComplete="new-password"
                    minLength="8"
                    name="password"
                    onChange={handlePasswordResetChange}
                    required
                    type="password"
                    value={passwordResetForm.password}
                  />
                  <small className="admin-form-hint">{PASSWORD_RULE_TEXT}</small>
                </label>

                <label className="admin-field">
                  <span>Confirmation</span>
                  <input
                    autoComplete="new-password"
                    minLength="8"
                    name="confirmation"
                    onChange={handlePasswordResetChange}
                    required
                    type="password"
                    value={passwordResetForm.confirmation}
                  />
                </label>
              </div>

              {feedbackTarget === "password" && error ? (
                <p className="admin-feedback error">{error}</p>
              ) : null}
              {feedbackTarget === "password" && message ? (
                <p className="admin-feedback success">{message}</p>
              ) : null}

              <button
                className="btn-primary admin-submit"
                disabled={isResettingPassword}
                type="submit"
              >
                {isResettingPassword ? "Modification..." : "Modifier le mot de passe"}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {effectiveSection === "personnel" ? (
        <div className="admin-single-panel">
          <form className="admin-form admin-personnel-form" onSubmit={handlePersonnelSubmit}>
            <div className="admin-form-header">
              <h4>Créer un personnel</h4>
            </div>

            <div className="admin-form-section">
              <h5>Identité civile</h5>
              <fieldset className="admin-radio-group">
                <legend>Civilité</legend>
                <label>
                  <input name="civilite" required type="radio" value="Madame" />
                  <span>Madame</span>
                </label>
                <label>
                  <input name="civilite" required type="radio" value="Monsieur" />
                  <span>Monsieur</span>
                </label>
              </fieldset>

              <div className="admin-form-grid">
                <label className="admin-field">
                  <span>Nom</span>
                  <input name="nom" required type="text" />
                </label>
                <label className="admin-field">
                  <span>Prénom</span>
                  <input name="prenom" required type="text" />
                </label>
                <label className="admin-field">
                  <span>Date de naissance</span>
                  <input name="naissance" type="date" />
                </label>
                <label className="admin-field">
                  <span>Pays de naissance</span>
                  <div className="admin-combo-field">
                    <select defaultValue="" name="pays">
                      <option value="" disabled>
                        Sélectionner un pays
                      </option>
                      {paysNaissance.map((pays) => (
                        <option key={pays} value={pays}>
                          {pays}
                        </option>
                      ))}
                    </select>
                  <input
                    aria-label="Pays non listé"
                    name="paysLibre"
                    placeholder="Pays non listé"
                    type="text"
                  />
                  </div>
                </label>
              </div>
            </div>

            <div className="admin-form-section">
              <h5>Données internes</h5>
              <div className="admin-form-grid">
                <label className="admin-field">
                  <span>Fonction</span>
                  <div className="admin-combo-field">
                    <select defaultValue="" name="fonction">
                      <option value="" disabled>
                        Sélectionner une fonction
                      </option>
                      {fonctions.map((fonction) => (
                        <option key={fonction} value={fonction}>
                          {fonction}
                        </option>
                      ))}
                    </select>
                  <input
                    aria-label="Fonction non listée"
                    name="fonctionLibre"
                    placeholder="Fonction non listée"
                    type="text"
                  />
                  </div>
                </label>
                <label className="admin-field">
                  <span>Type de personnel</span>
                  <select defaultValue="agent" name="typePersonne" required>
                    {personnelTypes.length > 0 ? (
                      personnelTypes.map((typePersonne) => (
                        <option key={typePersonne.id} value={typePersonne.nom}>
                          {typePersonne.label}
                        </option>
                      ))
                    ) : (
                      <option value="agent">Agent</option>
                    )}
                  </select>
                </label>
                <label className="admin-field">
                  <span>Entité</span>
                  <select defaultValue="" name="entite" required>
                    <option value="" disabled>
                      Sélectionner une entité
                    </option>
                    {entites.map((entite) => (
                      <option key={entite} value={entite}>
                        {entite}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>Tutelle</span>
                  <select defaultValue="" name="tutelle">
                    <option value="" disabled>
                      Sélectionner une tutelle
                    </option>
                    {tutelles.map((tutelle) => (
                      <option key={tutelle} value={tutelle}>
                        {tutelle}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>Date d'arrivée</span>
                  <input name="arrivee" required type="date" />
                </label>
                <fieldset className="admin-radio-group">
                  <legend>Personnel permanent</legend>
                  <label>
                    <input
                      checked={isPersonnelPermanent}
                      name="personnelPermanent"
                      onChange={() => setIsPersonnelPermanent(true)}
                      type="radio"
                      value="oui"
                    />
                    <span>Oui</span>
                  </label>
                  <label>
                    <input
                      checked={!isPersonnelPermanent}
                      name="personnelPermanent"
                      onChange={() => setIsPersonnelPermanent(false)}
                      type="radio"
                      value="non"
                    />
                    <span>Non</span>
                  </label>
                </fieldset>
                {!isPersonnelPermanent ? (
                  <label className="admin-field">
                    <span>Date de départ</span>
                    <input name="depart" required type="date" />
                  </label>
                ) : null}
              </div>
            </div>

            {feedbackTarget === "personnel" && error ? (
              <p className="admin-feedback error">{error}</p>
            ) : null}
            {feedbackTarget === "personnel" && message ? (
              <p className="admin-feedback success">{message}</p>
            ) : null}

            <button
              className="btn-primary admin-submit"
              disabled={isCreatingPersonnel}
              type="submit"
            >
              {isCreatingPersonnel ? "Creation..." : "Créer"}
            </button>
          </form>
        </div>
      ) : null}

      {effectiveSection === "saisie" ? (
        <>
          <div className="admin-pending-review">
            <div className="admin-form-header">
              <h4>{canDecidePending ? "Saisies à vérifier" : "Mes saisies"}</h4>
            </div>
            {pendingToReview.length > 0 ? (
              <DataTable
                columns={[
                  { key: "prenom", label: "Prénom" },
                  { key: "nom", label: "Nom" }
                ]}
                data={pendingToReview}
                renderRowActions={(row) => (
                  <button
                    className="btn-primary admin-submit"
                    onClick={() => setReviewEntry(row)}
                    type="button"
                  >
                    Vérifier
                  </button>
                )}
              />
            ) : (
              <p className="admin-form-hint">Aucune saisie en attente de vérification.</p>
            )}
          </div>

          <div className={glpiArrivals.length > 0 ? "admin-layout" : undefined}>
          {glpiArrivals.length > 0 ? (
            <div className="admin-glpi-arrivals">
              <div className="admin-form-header">
                <h4>Arrivées déclarées via GLPI à importer</h4>
                <p className="admin-form-hint">
                  Pré-remplit le formulaire ci-dessous à partir du ticket GLPI — pense à
                  vérifier/compléter avant d'envoyer (le type de personnel n'est pas
                  fourni par GLPI).
                </p>
              </div>
              <ul className="admin-glpi-arrivals-list">
                {glpiArrivals.map((submission) => (
                  <li key={submission.glpiFormanswerId}>
                    <span>
                      {submission.prenom} {submission.nom} — {submission.entite || "?"} —
                      arrivée {submission.arrivee || "?"}
                    </span>
                    <button
                      className="btn-primary admin-submit"
                      onClick={() => handlePrefillFromGlpi(submission)}
                      type="button"
                    >
                      Pré-remplir
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <form
            className="admin-form admin-personnel-form"
            key={prefillKey}
            onSubmit={handlePendingSubmit}
          >
            <div className="admin-form-header">
              <h4>Saisir un nouvel arrivant</h4>
              <p className="admin-form-hint">
                Cette saisie sera envoyee aux administrateurs pour validation avant
                creation effective du personnel.
              </p>
            </div>

            <div className="admin-form-section">
              <h5>Identité civile</h5>
              <fieldset className="admin-radio-group">
                <legend>Civilité</legend>
                <label>
                  <input
                    defaultChecked={prefillData?.civilite === "Madame"}
                    name="civilite"
                    required
                    type="radio"
                    value="Madame"
                  />
                  <span>Madame</span>
                </label>
                <label>
                  <input
                    defaultChecked={prefillData?.civilite === "Monsieur"}
                    name="civilite"
                    required
                    type="radio"
                    value="Monsieur"
                  />
                  <span>Monsieur</span>
                </label>
              </fieldset>

              <div className="admin-form-grid">
                <label className="admin-field">
                  <span>Nom</span>
                  <input defaultValue={prefillData?.nom ?? ""} name="nom" required type="text" />
                </label>
                <label className="admin-field">
                  <span>Prénom</span>
                  <input
                    defaultValue={prefillData?.prenom ?? ""}
                    name="prenom"
                    required
                    type="text"
                  />
                </label>
                <label className="admin-field">
                  <span>Date de naissance</span>
                  <input
                    defaultValue={prefillData?.naissance ?? ""}
                    name="naissance"
                    type="date"
                  />
                </label>
                <label className="admin-field">
                  <span>Pays de naissance</span>
                  <div className="admin-combo-field">
                    <select defaultValue="" name="pays">
                      <option value="" disabled>
                        Sélectionner un pays
                      </option>
                      {paysNaissance.map((pays) => (
                        <option key={pays} value={pays}>
                          {pays}
                        </option>
                      ))}
                    </select>
                  <input
                    aria-label="Pays non listé"
                    defaultValue={prefillData?.pays ?? ""}
                    name="paysLibre"
                    placeholder="Pays non listé"
                    type="text"
                  />
                  </div>
                </label>
              </div>
            </div>

            <div className="admin-form-section">
              <h5>Données internes</h5>
              <div className="admin-form-grid">
                <label className="admin-field">
                  <span>Fonction</span>
                  <div className="admin-combo-field">
                    <select defaultValue="" name="fonction">
                      <option value="" disabled>
                        Sélectionner une fonction
                      </option>
                      {fonctions.map((fonction) => (
                        <option key={fonction} value={fonction}>
                          {fonction}
                        </option>
                      ))}
                    </select>
                  <input
                    aria-label="Fonction non listée"
                    defaultValue={prefillData?.fonction ?? ""}
                    name="fonctionLibre"
                    placeholder="Fonction non listée"
                    type="text"
                  />
                  </div>
                </label>
                <label className="admin-field">
                  <span>Type de personnel</span>
                  <select defaultValue="agent" name="typePersonne" required>
                    {personnelTypes.length > 0 ? (
                      personnelTypes.map((typePersonne) => (
                        <option key={typePersonne.id} value={typePersonne.nom}>
                          {typePersonne.label}
                        </option>
                      ))
                    ) : (
                      <option value="agent">Agent</option>
                    )}
                  </select>
                </label>
                <label className="admin-field">
                  <span>Contact (référent)</span>
                  <select defaultValue="" name="contactPersonneId">
                    <option value="">Aucun</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>Entité</span>
                  <select defaultValue={prefillData?.entite ?? ""} name="entite" required>
                    <option value="" disabled>
                      Sélectionner une entité
                    </option>
                    {entites.map((entite) => (
                      <option key={entite} value={entite}>
                        {entite}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>Tutelle</span>
                  <select defaultValue={prefillData?.tutelle ?? ""} name="tutelle">
                    <option value="" disabled>
                      Sélectionner une tutelle
                    </option>
                    {tutelles.map((tutelle) => (
                      <option key={tutelle} value={tutelle}>
                        {tutelle}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>Date d'arrivée</span>
                  <input defaultValue={prefillData?.arrivee ?? ""} name="arrivee" required type="date" />
                </label>
                <fieldset className="admin-radio-group">
                  <legend>Personnel permanent</legend>
                  <label>
                    <input
                      checked={isPendingPermanent}
                      name="personnelPermanent"
                      onChange={() => setIsPendingPermanent(true)}
                      type="radio"
                      value="oui"
                    />
                    <span>Oui</span>
                  </label>
                  <label>
                    <input
                      checked={!isPendingPermanent}
                      name="personnelPermanent"
                      onChange={() => setIsPendingPermanent(false)}
                      type="radio"
                      value="non"
                    />
                    <span>Non</span>
                  </label>
                </fieldset>
                {!isPendingPermanent ? (
                  <label className="admin-field">
                    <span>Date de départ</span>
                    <input defaultValue={prefillData?.depart ?? ""} name="depart" required type="date" />
                  </label>
                ) : null}
              </div>
            </div>

            <div className="admin-form-section">
              <h5>Contrôle d'accès</h5>
              <div className="admin-form-grid">
                <fieldset className="admin-radio-group">
                  <legend>Badge demandé</legend>
                  <label>
                    <input
                      checked={isPendingBadge}
                      name="badgeDemande"
                      onChange={() => setIsPendingBadge(true)}
                      type="radio"
                      value="oui"
                    />
                    <span>Oui</span>
                  </label>
                  <label>
                    <input
                      checked={!isPendingBadge}
                      name="badgeDemande"
                      onChange={() => setIsPendingBadge(false)}
                      type="radio"
                      value="non"
                    />
                    <span>Non</span>
                  </label>
                </fieldset>
                {isPendingBadge ? (
                  <label className="admin-field">
                    <span>Numéro de badge (si connu)</span>
                    <input
                      maxLength={50}
                      name="numeroBadge"
                      placeholder="Laisser vide si non attribué"
                      type="text"
                    />
                  </label>
                ) : null}
              </div>
            </div>

            {feedbackTarget === "saisie" && error ? (
              <p className="admin-feedback error">{error}</p>
            ) : null}
            {feedbackTarget === "saisie" && message ? (
              <p className="admin-feedback success">{message}</p>
            ) : null}

            <button
              className="btn-primary admin-submit"
              disabled={isSubmittingPending}
              type="submit"
            >
              {isSubmittingPending ? "Envoi..." : "Envoyer pour validation"}
            </button>
          </form>
          </div>

          {reviewEntry ? (
            <PendingReviewModal
              canDecide={canDecidePending}
              contactLabel={
                contacts.find(
                  (contact) =>
                    String(contact.id) === String(reviewEntry.contact_personne_id)
                )?.label
              }
              deciding={decidingPendingId === reviewEntry.id}
              entry={reviewEntry}
              feedbackError={feedbackTarget === "saisie" ? error : ""}
              onClose={() => setReviewEntry(null)}
              onReject={() => handleRejectPending(reviewEntry.id)}
              onRejectCommentChange={(value) =>
                setRejectComments((previous) => ({
                  ...previous,
                  [reviewEntry.id]: value
                }))
              }
              onValidate={() => handleValidatePending(reviewEntry.id)}
              rejectComment={rejectComments[reviewEntry.id] ?? ""}
            />
          ) : null}
        </>
      ) : null}

      {effectiveSection === "batiments" ? (
        <div className="admin-single-panel">
          <div className="admin-form admin-placeholder-panel">
            <div className="admin-form-header">
              <h4>Bâtiments</h4>
            </div>
            <div className="admin-placeholder-grid">
              <div className="admin-placeholder-tile">Bâtiment</div>
              <div className="admin-placeholder-tile">Étage</div>
              <div className="admin-placeholder-tile">Zone</div>
            </div>
          </div>
        </div>
      ) : null}

      {effectiveSection === "plans" ? (
        <div className="admin-single-panel">
          <div className="admin-form admin-placeholder-panel">
            <div className="admin-form-header">
              <h4>Plans bâtiment</h4>
            </div>
            <div className="admin-placeholder-grid">
              <div className="admin-placeholder-tile">Plan</div>
              <div className="admin-placeholder-tile">Salle</div>
              <div className="admin-placeholder-tile">Affectation</div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
