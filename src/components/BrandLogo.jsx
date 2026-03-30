// Affiche le logo institutionnel s'il existe, sinon un monogramme de secours.
export default function BrandLogo({ className = "", alt = "Logo IECB" }) {
  return (
    <div className={`brand-logo ${className}`.trim()}>
      <img
        className="brand-logo-image"
        src="/images/logo-iecb.png"
        alt={alt}
        onError={(event) => {
          event.currentTarget.style.display = "none";
          event.currentTarget.parentElement?.setAttribute("data-fallback", "true");
        }}
      />
      <span className="brand-logo-fallback" aria-hidden="true">
        RH
      </span>
    </div>
  );
}
