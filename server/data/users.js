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
  },
  {
    id: 3,
    username: "brice",
    passwordHash:
      "fea1014fa239ae5caa060c3940dbe76c90fb9b1b8f6e56864bd5fc63076ad456794f047ee0cf28ba7f5840b0ad0ec2929d55709a2b186d79165d1cdb9e5fa5db",
    role: "beta"
  },
  {
    id: 4,
    username: "fabienne",
    passwordHash:
      "ab0d244c34a6f3591083a761675ca358891b00075304d9a87b52b4b0b7a6ca89c026e87f2daecd06cb66288e0ae468b844a552fdd6b406d8b9dc2c0ee207061b",
    role: "beta"
  },
  {
    id: 5,
    username: "antoine",
    passwordHash:
      "e5b433d3ba2f3cebcbf09e8fa8a9a388614ddc490686a5cf89ef532e215dd9322ca4390dd3baa90e93c1439e7edeece296ac6cd1048df5459a853c7f8a6e31fd",
    role: "beta"
  }
];
