import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>CPQ POC</h1>
      <p>Open the bike builder to run the init/configure flow.</p>
      <Link href='/bike-builder'>Go to Bike Builder</Link>
    </main>
  );
}
