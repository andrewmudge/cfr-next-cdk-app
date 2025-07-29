import { useEffect } from 'react';
import { useRouter } from 'next/router';

const Callback = () => {
  const router = useRouter();

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
        }).then(() => {
          router.replace('/');
        });
      } else {
        router.replace('/'); // or show error
      }
    }
  }, [router]);

  return <div>Signing you in...</div>;
};

export default Callback;
