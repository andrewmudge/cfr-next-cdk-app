import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

const Callback = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Parse tokens from URL fragment
      const hash = window.location.hash.substr(1);
      const params = new URLSearchParams(hash);
      const idToken = params.get('id_token');
      const accessToken = params.get('access_token');

      if (idToken && accessToken) {
        // Send tokens to API to set cookies
        fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, accessToken }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const data = await res.json();
              setError(data.error || 'Sign in failed.');
              setLoading(false);
            } else {
              router.replace('/');
            }
          })
          .catch(() => {
            setError('Sign in failed.');
            setLoading(false);
          });
      } else {
        setError('Missing tokens in callback.');
        setLoading(false);
      }
    }
  }, [router]);

  if (loading) return <div>Signing you in...</div>;
  if (error) {
    return (
      <div style={{ maxWidth: 400, margin: '2rem auto', padding: 24, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #0001', textAlign: 'center' }}>
        <h2 style={{ color: '#b91c1c', marginBottom: 16 }}>Sign in Error</h2>
        <p style={{ color: '#333', marginBottom: 24 }}>{error}</p>
        <button
          style={{ background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}
          onClick={() => router.replace('/')}
        >
          Return to Sign In
        </button>
      </div>
    );
  }
  return null;
};

export default Callback;
