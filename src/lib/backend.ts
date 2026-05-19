'use client';

import { useSyncExternalStore } from 'react';

const STATIC_BACKEND_BASE_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_BACKEND_BASE_URL);
const noopSubscribe = () => () => {};

export function getBackendBaseUrl() {
  return STATIC_BACKEND_BASE_URL;
}

export function resolveBackendBaseUrl() {
  if (STATIC_BACKEND_BASE_URL) return STATIC_BACKEND_BASE_URL;
  if (typeof window === 'undefined') return null;

  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return 'http://localhost:8080';
  }

  return null;
}

export function useBackendBaseUrl() {
  return useSyncExternalStore(noopSubscribe, resolveBackendBaseUrl, getBackendBaseUrl);
}

export function buildBackendUrl(path: string, baseUrl = resolveBackendBaseUrl()) {
  if (!baseUrl) return null;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, `${baseUrl}/`).toString();
}

function normalizeBaseUrl(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : null;
}
