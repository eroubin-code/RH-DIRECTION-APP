// Espace reserve aux comptes habilites pour gerer les utilisateurs applicatifs.
import { useEffect, useState } from "react";
import DataTable from "../components/DataTable";
import { createUser, getUsers } from "../services/api";

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

export default function AdministrationPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    getUsers().then(setUsers).catch((requestError) => {
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

  const columns = [
    { key: "username", label: "Utilisateur" },
    { key: "role", label: "Role" }
  ];

  return (
    <section className="content-card rh-panel rh-section admin-section">
      <div className="section-title">
        <h3 className="rh-panel-title">Administration</h3>
      </div>

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
              {ROLE_OPTIONS.map((role) => (
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
            <h4>Utilisateurs</h4>
          </div>
          <DataTable columns={columns} data={users} />
        </div>
      </div>
    </section>
  );
}
