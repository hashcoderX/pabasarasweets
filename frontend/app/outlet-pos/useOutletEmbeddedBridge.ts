'use client';

import { useEffect } from 'react';
import axios from '@/lib/http';

export const OUTLET_EMBED_MESSAGE = {
  ready: 'outlet-pos:embedded-ready',
  dataChanged: 'outlet-pos:data-changed',
  navigate: 'outlet-pos:navigate',
} as const;

const postToParent = (payload: Record<string, unknown>) => {
  if (typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage(payload, window.location.origin);
};

/**
 * Lets an Outlet POS page cooperate with the POS shell when rendered inside its iframe:
 * - signals when the page finished its initial load (shell keeps a single loader until then)
 * - signals successful mutations so the shell can refresh its own data and drop stale cached frames
 * - routes in-frame links to other Outlet POS pages through the shell instead of reloading the frame
 */
export function useOutletEmbeddedBridge(isEmbedded: boolean, loading: boolean) {
  useEffect(() => {
    if (!isEmbedded || loading) return;
    postToParent({ type: OUTLET_EMBED_MESSAGE.ready });
  }, [isEmbedded, loading]);

  useEffect(() => {
    if (!isEmbedded) return;

    const interceptorId = axios.interceptors.response.use((response) => {
      const method = String(response.config?.method || 'get').toLowerCase();
      if (method !== 'get' && response.status < 400) {
        postToParent({ type: OUTLET_EMBED_MESSAGE.dataChanged });
      }
      return response;
    });

    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== '_self')) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/outlet-pos')) return;

      event.preventDefault();
      event.stopPropagation();
      postToParent({ type: OUTLET_EMBED_MESSAGE.navigate, path: url.pathname });
    };

    document.addEventListener('click', handleClick, true);

    return () => {
      axios.interceptors.response.eject(interceptorId);
      document.removeEventListener('click', handleClick, true);
    };
  }, [isEmbedded]);
}
