/* Self-identification landing page for Klaviyo/Amazon flows */
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type FormState = 'idle' | 'submitting' | 'success' | 'error';

function CaptureForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [status, setStatus] = useState<FormState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const prefillEmail = searchParams.get('email');
    const prefillOrder = searchParams.get('order');
    if (prefillEmail) setEmail(prefillEmail);
    if (prefillOrder) setOrderNumber(prefillOrder);
  }, [searchParams]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setMessage(null);

    try {
      const res = await fetch('/api/capture-self-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          phone,
          firstName,
          lastName,
          company,
          orderNumber,
          source: 'self_id_form',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setMessage(data?.error || 'Something went wrong.');
        return;
      }

      setStatus('success');
      setMessage('Thanks! We have linked your info.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setMessage('Something went wrong.');
    }
  };

  const disabled = status === 'submitting';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-xl bg-slate-900/70 border border-slate-800 rounded-2xl shadow-2xl shadow-slate-900/50 p-8 backdrop-blur">
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Alliance Chemical</p>
          <h1 className="text-3xl font-semibold mt-2">Confirm your info</h1>
          <p className="text-slate-400 mt-2">
            Drop your details so we can keep your orders and support together. This helps us serve you faster and keep you updated.
          </p>
        </div>

        <form className="grid grid-cols-1 gap-4" onSubmit={onSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">First name</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Last name</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white" />
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Email *</label>
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white" />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white" />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Company</label>
            <input value={company} onChange={e => setCompany(e.target.value)} className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white" />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Order number</label>
            <input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white" />
          </div>

          <button
            type="submit"
            disabled={disabled}
            className="mt-2 inline-flex justify-center rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-4 py-2 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {status === 'submitting' ? 'Submitting…' : 'Submit'}
          </button>

          {message && (
            <p className={`text-sm ${status === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>
              {message}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

export default function CapturePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black text-white flex items-center justify-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    }>
      <CaptureForm />
    </Suspense>
  );
}
