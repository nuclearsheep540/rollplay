/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Centralized configuration for the Next.js application.
 *
 * Internal service URLs are server-side only (used in middleware, API routes).
 * These default to Docker service names but can be overridden via environment
 * variables for non-Docker environments.
 */

// Internal service URLs (server-side only - not exposed to browser)
export const API_SITE_INTERNAL_URL = process.env.API_SITE_INTERNAL_URL || 'http://api-site:8082'
export const API_AUTH_INTERNAL_URL = process.env.API_AUTH_INTERNAL_URL || 'http://api-auth:8083'
