'use client';

import { useEffect, useState } from 'react';

export default function AppFooter() {
  const [year, setYear] = useState(new Date().getFullYear());

  // This ensures the year is only rendered on the client after hydration,
  // avoiding any potential mismatch with the server's render time.
  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="app-footer">
      <div className="footer-content">
        <div className="footer-left">
          <span className="footer-brand">Alliance Chemical</span>
          <span className="footer-separator">•</span>
          <span className="footer-title">Premium Ticket System</span>
        </div>
        <div className="footer-right">
          <span className="footer-version">v2.0</span>
          <span className="footer-separator">•</span>
          <span className="footer-year">{year}</span>
        </div>
      </div>
      <div className="footer-glow"></div>
    </footer>
  );
} 