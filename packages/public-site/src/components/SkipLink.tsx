// packages/public-site/src/components/SkipLink.tsx
export default function SkipLink({ label }: { label: string }) {
  return (
    <a className="pub-skip" href="#pub-main">
      {label}
    </a>
  );
}
