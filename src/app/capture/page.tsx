/* Self-identification landing page for Klaviyo/Amazon flows */
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, Loader2 } from 'lucide-react';

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
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-blue-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl bg-white border border-gray-200 rounded-2xl shadow-xl shadow-gray-200/50 p-8">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-wider text-blue-600 font-semibold">Alliance Chemical</p>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">Confirm your info</h1>
          <p className="text-gray-600 mt-3 leading-relaxed">
            Drop your details so we can keep your orders and support together. This helps us serve you faster and keep you updated.
          </p>
        </div>

        <form className="grid grid-cols-1 gap-5" onSubmit={onSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">First name</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full rounded-lg bg-white border border-gray-300 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Last name</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} className="w-full rounded-lg bg-white border border-gray-300 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg bg-white border border-gray-300 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-lg bg-white border border-gray-300 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Company</label>
            <input value={company} onChange={e => setCompany(e.target.value)} className="w-full rounded-lg bg-white border border-gray-300 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Order number</label>
            <input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} className="w-full rounded-lg bg-white border border-gray-300 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" />
          </div>

          <button
            type="submit"
            disabled={disabled}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
          >
            {status === 'submitting' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit'
            )}
          </button>

          {message && (
            <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
              status === 'error'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              {status === 'success' && <CheckCircle className="h-4 w-4" />}
              {message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default function CapturePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-blue-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading...
        </div>
      </div>
    }>
      <CaptureForm />
    </Suspense>
  );
}
