import { useEffect, useState } from 'react';
import BookingsDashboard from './BookingsDashboard.jsx';
import RiskDashboard from './RiskDashboard.jsx';
import ReviewsDashboard from './ReviewsDashboard.jsx';
import PasteDashboard from './PasteDashboard.jsx';
import MlDashboard from './MlDashboard.jsx';

const TABS = [
  { id: 'bookings', label: 'Bookings Analytics', hint: 'Performance & mix' },
  { id: 'ml', label: 'ML Insights', hint: 'Model evaluation' },
  { id: 'risk', label: 'Cancellation Risk', hint: 'Rule-based scoring' },
  { id: 'reviews', label: 'Reviews & Sentiment', hint: 'Guest feedback' },
  { id: 'paste', label: 'Paste & Analyze', hint: 'Analyze review text' },
];

const tabFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, '');
  return TABS.some((t) => t.id === id) ? id : 'bookings';
};

export default function App() {
  const [tab, setTab] = useState(tabFromHash);
  const [bookings, setBookings] = useState(null);

  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const select = (id) => {
    window.location.hash = '#/' + id;
    setTab(id);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app-shell">
      <nav className="tabs" aria-label="Dashboard sections">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">H</span> Hotel Intelligence Pro
        </span>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={'tab' + (tab === t.id ? ' on' : '')}
            onClick={() => select(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            {t.label}
            <em>{t.hint}</em>
          </button>
        ))}
      </nav>

      <main className="tab-panel">
        {tab === 'bookings' && <BookingsDashboard onDataLoaded={setBookings} />}
        {tab === 'ml' && <MlDashboard />}
        {tab === 'risk' && <RiskDashboard bookings={bookings} />}
        {tab === 'reviews' && <ReviewsDashboard />}
        {tab === 'paste' && <PasteDashboard />}
      </main>
    </div>
  );
}