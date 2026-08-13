export function simEur(n: number): string {
  return '€' + Math.round(n).toLocaleString('nl-NL');
}

export function simEurK(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000000) {
    return '€' + (n / 1000000).toFixed(1).replace('.0', '').replace('.', ',') + 'M';
  }
  if (a >= 1000) {
    const v = n / 1000;
    return (
      '€' + (Number.isInteger(v) ? v : Number(v.toFixed(1))).toString().replace('.', ',') + 'k'
    );
  }
  return '€' + Math.round(n);
}
