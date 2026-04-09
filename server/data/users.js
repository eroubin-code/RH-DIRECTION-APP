// Utilisateur initial du backend avec mot de passe stocke sous forme de hash scrypt.
export const users = [
  {
    id: 1,
    username: "sysadm",
    passwordHash:
      "8e38b1984ce4c832f32eb5de69f6963f4342d7f48090c0028ac58c500c1c922ba71f71d2352264827fe159a59d5ace84b37adc1b0ea9af92aeb1d7b0b9861f7d",
    role: "admin"
  },
  {
    id: 2,
    username: "Betauser",
    passwordHash:
      "0d1b373aaf696ecf9b7dd7e07ab0c54f20f6eb4a25f19f0210bcf3a74b9678977f4ad5af4aabbe3678d2d976d0367bc293ce440084aca6d6ec479af9117c03d6",
    role: "beta"
  }
];
