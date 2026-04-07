export default function GegevenswoordenboekSection() {
  return (
    <div className="-m-6 overflow-hidden" style={{ height: 'calc(100vh - 100px)' }}>
      <iframe
        src="https://skosmos.open-regels.nl"
        title="Gegevenswoordenboek — RONL"
        className="w-full h-full border-0 block"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}
