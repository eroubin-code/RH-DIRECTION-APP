export const rhData = {
  dashboard: {
    kpis: [
      { label: "Effectif total", value: 128 },
      { label: "Departs a suivre", value: 9 },
      { label: "Badges actifs", value: 121 },
      { label: "Entites suivies", value: 14 }
    ],
    recentDeparts: [
      {
        id: 1,
        nom: "Martin",
        prenom: "Claire",
        date: "2026-04-03",
        entite: "Plateforme Imagerie"
      },
      {
        id: 2,
        nom: "Durand",
        prenom: "Paul",
        date: "2026-04-08",
        entite: "Administration"
      },
      {
        id: 3,
        nom: "Nguyen",
        prenom: "Lina",
        date: "2026-04-14",
        entite: "Bioinformatique"
      }
    ],
    tutelleBuckets: [
      { label: "CNRS", count: 2 },
      { label: "Universite", count: 1 },
      { label: "Inserm", count: 1 }
    ],
    assignmentGroups: [
      { label: "CBMN", items: ["Equipe Bioinformatique"] },
      { label: "ISM", items: ["Plateforme Imagerie"] },
      { label: "MFP", items: ["Administration", "Informatique"] }
    ]
  },
  effectif: [
    {
      id: 1,
      civilite: "Mme",
      nom: "Martin",
      prenom: "Claire",
      fonction: "Ingenieure",
      entite: "Plateforme Imagerie",
      tutelle: "CNRS"
    },
    {
      id: 2,
      civilite: "M.",
      nom: "Durand",
      prenom: "Paul",
      fonction: "Technicien",
      entite: "Administration",
      tutelle: "Universite"
    },
    {
      id: 3,
      civilite: "Mme",
      nom: "Nguyen",
      prenom: "Lina",
      fonction: "Chercheuse",
      entite: "Bioinformatique",
      tutelle: "CNRS"
    },
    {
      id: 4,
      civilite: "M.",
      nom: "Roussel",
      prenom: "Marc",
      fonction: "Assistant ingenieur",
      entite: "Informatique",
      tutelle: "Inserm"
    }
  ],
  departs: [
    {
      id: 1,
      nom: "Martin",
      prenom: "Claire",
      depart: "2026-04-03",
      entite: "Plateforme Imagerie",
      badge: "B-1045"
    },
    {
      id: 2,
      nom: "Durand",
      prenom: "Paul",
      depart: "2026-04-08",
      entite: "Administration",
      badge: "B-2021"
    },
    {
      id: 3,
      nom: "Petit",
      prenom: "Laura",
      depart: "2026-04-22",
      entite: "Direction",
      badge: "B-1189"
    }
  ],
  badges: [
    {
      id: 1,
      nom: "Martin",
      prenom: "Claire",
      badge: "B-1045",
      statut: "Actif"
    },
    {
      id: 2,
      nom: "Durand",
      prenom: "Paul",
      badge: "B-2021",
      statut: "A restituer"
    },
    {
      id: 3,
      nom: "Petit",
      prenom: "Laura",
      badge: "B-1189",
      statut: "A desactiver"
    }
  ],
  entites: [
    {
      id: 1,
      type_entite: "equipe",
      entite: "Plateforme Imagerie",
      unite_tutelle: "ISM",
      responsable: "Dr A. Bernard",
      effectif: 18
    },
    {
      id: 2,
      type_entite: "equipe",
      entite: "Administration",
      unite_tutelle: "MFP",
      responsable: "Mme E. Robert",
      effectif: 12
    },
    {
      id: 3,
      type_entite: "equipe",
      entite: "Bioinformatique",
      unite_tutelle: "CBMN",
      responsable: "Dr N. Leclerc",
      effectif: 9
    },
    {
      id: 4,
      type_entite: "equipe",
      entite: "Informatique",
      unite_tutelle: "MFP",
      responsable: "E. Roubin",
      effectif: 4
    }
  ]
};
