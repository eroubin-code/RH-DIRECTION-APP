// Espace reserve aux comptes habilites pour gerer les utilisateurs applicatifs.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import DataTable from "../components/DataTable";
import {
  createPersonnel,
  createUser,
  getEffectif,
  getEntites,
  getPersonnelTypes,
  getUsers
} from "../services/api";

const ROLE_OPTIONS = [
  { value: "beta", label: "Beta" },
  { value: "operateur", label: "Operateur" },
  { value: "admin", label: "Administrateur" }
];

const initialForm = {
  username: "",
  password: "",
  role: "beta"
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
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    getUsers().then(setUsers).catch((requestError) => {
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
        setError(requestError.message);
      });
  }, []);

  useEffect(() => {
    getPersonnelTypes()
      .then(setPersonnelTypes)
      .catch((requestError) => {
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

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
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
      setIsSubmitting(false);
    }
  }

  async function handlePersonnelSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
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
      setIsSubmitting(false);
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
  const selectedSection = searchParams.get("section") ?? "utilisateurs";
  const activeSection = ["utilisateurs", "personnel", "batiments", "plans"].includes(
    selectedSection
  )
    ? selectedSection
    : "utilisateurs";

  return (
    <section className="content-card rh-panel rh-section admin-section">
      <div className="section-title">
        <h3 className="rh-panel-title">Administration</h3>
        <Link className="admin-home-link" to="/dashboard">
          Visualiser les stats
        </Link>
      </div>

      {activeSection === "utilisateurs" ? (
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
                minLength="6"
                name="password"
                onChange={handleChange}
                required
                type="password"
                value={form.password}
              />
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

            {error ? <p className="admin-feedback error">{error}</p> : null}
            {message ? <p className="admin-feedback success">{message}</p> : null}

            <button className="btn-primary admin-submit" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Creation..." : "Créer"}
            </button>
          </form>

          <div className="admin-users">
            <div className="admin-form-header">
              <h4>Utilisateurs du site</h4>
            </div>
            <DataTable columns={columns} data={users} />
          </div>
        </div>
      ) : null}

      {activeSection === "personnel" ? (
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

            {error ? <p className="admin-feedback error">{error}</p> : null}
            {message ? <p className="admin-feedback success">{message}</p> : null}

            <button className="btn-primary admin-submit" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Creation..." : "Créer"}
            </button>
          </form>
        </div>
      ) : null}

      {activeSection === "batiments" ? (
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

      {activeSection === "plans" ? (
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
