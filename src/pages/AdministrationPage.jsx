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
  const [fonctions, setFonctions] = useState([]);
  const [personnelTypes, setPersonnelTypes] = useState([]);
  const [tutelles, setTutelles] = useState([]);
  const [paysNaissance, setPaysNaissance] = useState([]);
  const [isPersonnelPermanent, setIsPersonnelPermanent] = useState(false);
  const [isPendingPermanent, setIsPendingPermanent] = useState(false);
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

  const isEntryOnlyRole = currentUser?.role === "operateur_saisie";
  const canDecidePending = currentUser?.role === "admin" || currentUser?.role === "operateur";
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

        setFonctions(normalizedFonctions);
        setTutelles(normalizedTutelles);
        setPaysNaissance(normalizedPays);
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
      glpiFormanswerId: prefillData?.glpiFormanswerId ?? null
    };

    try {
      const pending = await submitPendingPersonnel(payload);
      formElement?.reset?.();
      setIsPendingPermanent(false);
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
                  <select defaultValue="employe" name="typePersonne" required>
                    {personnelTypes.length > 0 ? (
                      personnelTypes.map((typePersonne) => (
                        <option key={typePersonne.id} value={typePersonne.nom}>
                          {typePersonne.label}
                        </option>
                      ))
                    ) : (
                      <option value="employe">Employe</option>
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
        <div className="admin-layout">
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
                  <select defaultValue="employe" name="typePersonne" required>
                    {personnelTypes.length > 0 ? (
                      personnelTypes.map((typePersonne) => (
                        <option key={typePersonne.id} value={typePersonne.nom}>
                          {typePersonne.label}
                        </option>
                      ))
                    ) : (
                      <option value="employe">Employe</option>
                    )}
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

          <div className="admin-users">
            <div className="admin-users-list">
              <div className="admin-form-header">
                <h4>
                  {canDecidePending ? "Saisies en attente de validation" : "Mes saisies"}
                </h4>
              </div>
              <DataTable
                columns={[
                  { key: "prenom", label: "Prénom" },
                  { key: "nom", label: "Nom" },
                  { key: "entite", label: "Entité" },
                  { key: "fonction", label: "Fonction" },
                  { key: "statutLabel", label: "Statut" },
                  { key: "submitted_by_username", label: "Saisi par" }
                ]}
                data={pendingEntries.map((entry) => ({
                  ...entry,
                  statutLabel: PENDING_STATUS_LABELS[entry.statut] ?? entry.statut
                }))}
                renderRowActions={
                  canDecidePending
                    ? (row) =>
                        row.statut === "en_attente" ? (
                          <div className="admin-pending-actions">
                            <button
                              className="btn-primary admin-submit"
                              disabled={decidingPendingId === row.id}
                              onClick={() => handleValidatePending(row.id)}
                              type="button"
                            >
                              Valider
                            </button>
                            <input
                              aria-label="Motif de rejet"
                              disabled={decidingPendingId === row.id}
                              onChange={(event) =>
                                setRejectComments((previous) => ({
                                  ...previous,
                                  [row.id]: event.target.value
                                }))
                              }
                              placeholder="Motif de rejet (optionnel)"
                              type="text"
                              value={rejectComments[row.id] ?? ""}
                            />
                            <button
                              disabled={decidingPendingId === row.id}
                              onClick={() => handleRejectPending(row.id)}
                              type="button"
                            >
                              Rejeter
                            </button>
                          </div>
                        ) : (
                          row.decision_comment || "—"
                        )
                    : undefined
                }
              />
            </div>
          </div>
        </div>
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
