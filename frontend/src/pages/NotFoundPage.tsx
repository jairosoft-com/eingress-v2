import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="page-stack" aria-labelledby="not-found-title">
      <div className="content-panel">
        <p className="eyebrow">404</p>
        <h1 id="not-found-title">Page not found</h1>
        <p>The route does not exist yet.</p>
        <Link className="text-link" to="/dashboard">
          Return to dashboard
        </Link>
      </div>
    </section>
  );
}
