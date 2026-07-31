'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [apartmentNumber, setApartmentNumber] = useState('');
  const [consent, setConsent] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!consent) {
      setError('Musíte súhlasiť so spracovaním osobných údajov.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        data: {
          full_name: fullName,
          apartment_number: apartmentNumber,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      setError('Nepodarilo sa odoslať prihlasovací e-mail. Skúste to znova.');
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-md w-full p-8 text-center">
          <h1 className="font-display text-2xl text-harbor mb-3">Skontrolujte e-mail</h1>
          <p className="text-ink">
            Poslali sme prihlasovací odkaz na adresu <strong>{email}</strong>. Otvorte e-mail
            a kliknite na odkaz, aby ste sa prihlásili do fóra.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="card max-w-md w-full p-8">
        <h1 className="font-display text-3xl text-harbor mb-1">Fórum komunity</h1>
        <p className="text-ink/70 mb-6">Prihlásenie alebo registrácia majiteľov apartmánov</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">Meno a priezvisko</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input-field"
              placeholder="Ján Novák"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">Číslo apartmánu</label>
            <input
              type="text"
              required
              value={apartmentNumber}
              onChange={(e) => setApartmentNumber(e.target.value)}
              className="input-field"
              placeholder="napr. 24B"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-harbor mb-1">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="vas@email.com"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            <span>
              Súhlasím so spracovaním mojich osobných údajov (meno, e-mail, číslo apartmánu)
              za účelom overenia členstva a fungovania komunitného fóra.
            </span>
          </label>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Odosielam…' : 'Prihlásiť sa / Registrovať'}
          </button>
        </form>

        <p className="text-xs text-ink/50 mt-6">
          Nová registrácia musí byť schválená výborom komunity. Po prihlásení uvidíte stav
          vašej žiadosti.
        </p>
      </div>
    </main>
  );
}
