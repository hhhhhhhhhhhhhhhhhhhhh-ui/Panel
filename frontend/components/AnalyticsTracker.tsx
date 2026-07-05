'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import nacl from 'tweetnacl';

// Helper to convert Uint8Array to Hex string
const toHex = (arr: Uint8Array): string =>
  Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

// Helper to convert Hex string to Uint8Array
const fromHex = (hex: string): Uint8Array => {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const pairs = cleanHex.match(/.{1,2}/g) || [];
  return new Uint8Array(pairs.map((byte) => parseInt(byte, 16)));
};

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const lastPathname = useRef<string | null>(null);

  useEffect(() => {
    // Prevent double-triggering on same pathname (React StrictMode)
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;

    const trackPageView = async () => {
      try {
        // 1. Fetch the server's public key
        const pkRes = await fetch('/api/analytics/public-key');
        if (!pkRes.ok) return;
        const { publicKey: serverPublicKeyHex } = await pkRes.json();
        if (!serverPublicKeyHex) return;

        const serverPublicKey = fromHex(serverPublicKeyHex);

        // 2. Generate a random session ID if not exists
        let sessionId = sessionStorage.getItem('analytics_session_id');
        if (!sessionId) {
          sessionId = toHex(nacl.randomBytes(16));
          sessionStorage.setItem('analytics_session_id', sessionId);
        }

        // 3. Gather anonymous metrics
        const referrer = document.referrer
          ? new URL(document.referrer).hostname
          : 'direct';

        const deviceType =
          window.innerWidth < 768
            ? 'mobile'
            : window.innerWidth < 1024
            ? 'tablet'
            : 'desktop';

        // Parse UTM parameters
        const urlParams = new URLSearchParams(window.location.search);
        const utm_source = urlParams.get('utm_source') || 'organic';
        const utm_medium = urlParams.get('utm_medium') || 'none';
        const utm_campaign = urlParams.get('utm_campaign') || 'none';

        // Gather basic performance/Core Web Vital indicators
        let performanceMetrics = { ttfb: 0, load_time: 0, dom_interactive: 0 };
        if (typeof window !== 'undefined' && window.performance && window.performance.timing) {
          const t = window.performance.timing;
          // Wait for load event before calculating (or estimate)
          performanceMetrics = {
            ttfb: Math.max(0, t.responseStart - t.navigationStart),
            load_time: Math.max(0, t.loadEventEnd > 0 ? t.loadEventEnd - t.navigationStart : Date.now() - t.navigationStart),
            dom_interactive: Math.max(0, t.domInteractive - t.navigationStart)
          };
        }

        const eventData = {
          event_type: 'pageview',
          path: pathname || '/',
          session_id: sessionId,
          referrer,
          device_type: deviceType,
          country: 'unknown',
          domain: window.location.hostname || 'unknown',
          payload: {
            screen_width: window.innerWidth,
            screen_height: window.innerHeight,
            user_agent: navigator.userAgent,
            utm_source,
            utm_medium,
            utm_campaign,
            performance: performanceMetrics
          },
        };

        // 4. Asymmetric Encryption using tweetnacl
        const ephemKeyPair = nacl.box.keyPair();
        const nonce = nacl.randomBytes(nacl.box.nonceLength);
        const msgBytes = new TextEncoder().encode(JSON.stringify(eventData));

        const ciphertext = nacl.box(
          msgBytes,
          nonce,
          serverPublicKey,
          ephemKeyPair.secretKey
        );

        // 5. POST encrypted payload
        await fetch('/api/analytics/events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ciphertext: toHex(ciphertext),
            ephemPubKey: toHex(ephemKeyPair.publicKey),
            nonce: toHex(nonce),
          }),
          keepalive: true,
        });
      } catch (err) {
        // Fail silently to prevent console pollution or tracking visibility
      }
    };

    trackPageView();
  }, [pathname]);

  return null;
}
