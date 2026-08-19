export function MockBanner() {
  if (process.env.NEXT_PUBLIC_MOCK_MODE !== "true") return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        background: "#fbbf24",
        color: "#111827",
        borderBottom: "2px solid #92400e",
        fontFamily: "monospace",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.4,
        padding: "6px 12px",
        textAlign: "center",
      }}
    >
      MOCK MODE - no real transactions. Set NEXT_PUBLIC_MOCK_MODE=false for live
      Stellar and passport calls.
    </div>
  );
}
