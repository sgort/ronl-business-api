export default function WooNoAccessPanel() {
  return (
    <div className="v2-main-pad">
      <div className="v2-crumb">WOO-DASHBOARD</div>
      <h1 className="v2-page-title">Geen toegang</h1>
      <p style={{ color: '#4b5563', maxWidth: '52ch', margin: '14px 0 0' }}>
        Dit dashboard vereist de rol <strong>woo-coordinatie</strong>. Vraag uw beheerder om
        toegang, of log in met een account dat de rol heeft.
      </p>
    </div>
  );
}
