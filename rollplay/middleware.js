/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NextResponse } from 'next/server'
import { API_AUTH_INTERNAL_URL } from './app/shared/config'

// Define protected routes that require authentication
const PROTECTED_ROUTES = [
  '/dashboard',
  '/game',
  '/workshop',
  '/notes',
  '/news',
  '/profile',
  '/settings'
]

// Define auth routes that authenticated users shouldn't access
const AUTH_ROUTES = [
  '/auth/magic',
  '/auth/verify'
]

/**
 * Attempt a refresh against api-auth using the refresh cookie on the incoming request.
 * Returns api-auth's Set-Cookie headers (a new access + refresh pair) or null.
 *
 * This runs on the Next server, where there is no cookie jar: the Cookie header is
 * built by hand on the way out, and the Set-Cookie headers have to be copied onto our
 * own response on the way back. They are forwarded verbatim, so the browser receives
 * exactly the cookies api-auth decided on, lifetimes and flags included, and this file
 * never has to know a token lifetime.
 *
 * getSetCookie() is the only safe way to read several Set-Cookie headers: the joined
 * string form cannot be split on commas, because Expires values contain them.
 *
 * Returns { refreshed, cookies }. The cookies are returned on failure too, and that is
 * the point: api-auth answers 401 with headers that clear both cookies, and 503 (it
 * could not reach api-site to confirm the account) with no headers at all, so that a
 * transient outage costs nobody their session. Collapsing those two into a single
 * "failed" would force this file to guess which had happened, and guessing wrong on a
 * 503 logs the user out for real.
 */
async function tryRefreshToken(refreshToken) {
  try {
    const refreshResponse = await fetch(`${API_AUTH_INTERNAL_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Cookie': `refresh_token=${refreshToken}`
      }
    })

    return {
      refreshed: refreshResponse.ok,
      cookies: refreshResponse.headers.getSetCookie()
    }
  } catch (error) {
    // No response at all, so no cookie instructions to carry: an unreachable
    // api-auth must not cost the user their session either.
    console.error(`Token refresh failed: ${error.message}`)
    return { refreshed: false, cookies: [] }
  }
}

/**
 * Attach api-auth's Set-Cookie headers to a response, verbatim.
 *
 * Every auth cookie the browser receives from this file comes through here. The
 * middleware never sets or clears one on its own initiative: api-auth owns that
 * decision, and an empty list means it deliberately made none.
 */
function withAuthCookies(response, setCookieHeaders) {
  for (const setCookieHeader of setCookieHeaders) {
    response.headers.append('set-cookie', setCookieHeader)
  }
  return response
}

function passThroughWithCookies(setCookieHeaders) {
  return withAuthCookies(NextResponse.next(), setCookieHeaders)
}

function redirectToLogin(request, setCookieHeaders = []) {
  return withAuthCookies(
    NextResponse.redirect(new URL('/auth/magic', request.url)),
    setCookieHeaders
  )
}

export async function middleware(request) {
  const { pathname } = request.nextUrl

  // Check if the current path is a protected route
  const isProtectedRoute = PROTECTED_ROUTES.some(route =>
    pathname.startsWith(route)
  )

  // Check if the current path is an auth route
  const isAuthRoute = AUTH_ROUTES.some(route =>
    pathname.startsWith(route)
  )

  // Get tokens from cookies
  const authToken = request.cookies.get('auth_token')?.value
  const refreshToken = request.cookies.get('refresh_token')?.value

  // If accessing a protected route
  if (isProtectedRoute) {
    // No auth token - try refresh first if we have a refresh token
    if (!authToken) {
      let refreshCookies = []

      if (refreshToken) {
        console.log(`Protected route: ${pathname} - No auth token, attempting refresh`)
        const refreshResult = await tryRefreshToken(refreshToken)

        if (refreshResult.refreshed) {
          console.log(`Protected route access granted: ${pathname} (after refresh)`)
          return passThroughWithCookies(refreshResult.cookies)
        }

        refreshCookies = refreshResult.cookies
      }

      // No refresh token or refresh failed
      console.log(`Protected route access denied: ${pathname} - No token`)
      return redirectToLogin(request, refreshCookies)
    }

    // Validate token with backend
    try {
      const validateResponse = await fetch(`${API_AUTH_INTERNAL_URL}/auth/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth_token=${authToken}`
        }
      })

      if (!validateResponse.ok) {
        let refreshCookies = []

        // Token is invalid - try to refresh before giving up
        if (refreshToken) {
          console.log(`Protected route: ${pathname} - Invalid token, attempting refresh`)
          const refreshResult = await tryRefreshToken(refreshToken)

          if (refreshResult.refreshed) {
            console.log(`Protected route access granted: ${pathname} (after refresh)`)
            return passThroughWithCookies(refreshResult.cookies)
          }

          refreshCookies = refreshResult.cookies
        }

        // Refresh failed or no refresh token. The cookies are cleared only if
        // api-auth said to: this used to clear both unconditionally, which meant a
        // 503 during an api-site outage logged the user out permanently.
        console.log(`Protected route access denied: ${pathname} - Invalid token`)
        return redirectToLogin(request, refreshCookies)
      }

      // Token is valid, allow access
      console.log(`Protected route access granted: ${pathname}`)
      return NextResponse.next()

    } catch (error) {
      // api-auth is unreachable, so nothing has been proven about these cookies.
      // Send the user to login but leave them intact, so the session survives the
      // outage rather than being ended by it.
      console.error(`Token validation failed: ${error.message}`)
      return redirectToLogin(request)
    }
  }
  
  // If accessing auth routes while authenticated
  if (isAuthRoute && authToken) {
    // Validate token to ensure it's still valid
    try {
      const validateResponse = await fetch(`${API_AUTH_INTERNAL_URL}/auth/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth_token=${authToken}`
        }
      })
      
      if (validateResponse.ok) {
        // Token is valid, redirect to dashboard
        console.log(`Auth route redirect: ${pathname} - User already authenticated`)
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      
      // Token is invalid: show the login page. The stale cookie is left alone —
      // logging in replaces both cookies anyway, and this file does not clear one
      // api-auth has not asked it to.
      return NextResponse.next()

    } catch (error) {
      // api-auth is unreachable, so nothing is proven about the cookie. Show the
      // login page and leave it intact.
      console.error(`Token validation failed on auth route: ${error.message}`)
      return NextResponse.next()
    }
  }
  
  // For all other routes, allow access
  return NextResponse.next()
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}