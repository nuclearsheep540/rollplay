/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NextResponse } from 'next/server'

// Define protected routes that require authentication
const PROTECTED_ROUTES = [
  '/dashboard',
  '/game',
  '/profile',
  '/settings'
]

// Define auth routes that authenticated users shouldn't access
const AUTH_ROUTES = [
  '/auth/magic',
  '/auth/verify'
]

/**
 * Attempt to refresh the access token using the refresh token.
 * Returns the new auth_token if successful, null otherwise.
 */
async function tryRefreshToken(refreshToken) {
  try {
    const refreshResponse = await fetch(`http://api-site:8082/api/users/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `refresh_token=${refreshToken}`
      }
    })

    if (refreshResponse.ok) {
      // Extract the new auth_token from Set-Cookie header
      const setCookieHeader = refreshResponse.headers.get('set-cookie')
      if (setCookieHeader) {
        const authTokenMatch = setCookieHeader.match(/auth_token=([^;]+)/)
        if (authTokenMatch) {
          return authTokenMatch[1]
        }
      }
    }
  } catch (error) {
    console.error(`Token refresh failed: ${error.message}`)
  }
  return null
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
      if (refreshToken) {
        console.log(`Protected route: ${pathname} - No auth token, attempting refresh`)
        const newAuthToken = await tryRefreshToken(refreshToken)

        if (newAuthToken) {
          console.log(`Protected route access granted: ${pathname} (after refresh)`)
          const response = NextResponse.next()
          // Set the new auth token cookie
          response.cookies.set('auth_token', newAuthToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            maxAge: 900, // 15 minutes
            path: '/'
          })
          return response
        }
      }

      // No refresh token or refresh failed
      console.log(`Protected route access denied: ${pathname} - No token`)
      return NextResponse.redirect(new URL('/auth/magic', request.url))
    }

    // Validate token with backend
    try {
      const validateResponse = await fetch(`http://api-auth:8083/auth/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth_token=${authToken}`
        }
      })

      if (!validateResponse.ok) {
        // Token is invalid - try to refresh before giving up
        if (refreshToken) {
          console.log(`Protected route: ${pathname} - Invalid token, attempting refresh`)
          const newAuthToken = await tryRefreshToken(refreshToken)

          if (newAuthToken) {
            console.log(`Protected route access granted: ${pathname} (after refresh)`)
            const response = NextResponse.next()
            response.cookies.set('auth_token', newAuthToken, {
              httpOnly: true,
              secure: true,
              sameSite: 'lax',
              maxAge: 900,
              path: '/'
            })
            return response
          }
        }

        // Refresh failed or no refresh token
        console.log(`Protected route access denied: ${pathname} - Invalid token`)
        const response = NextResponse.redirect(new URL('/auth/magic', request.url))
        response.cookies.set('auth_token', '', { maxAge: 0 })
        response.cookies.set('refresh_token', '', { maxAge: 0 })
        return response
      }

      // Token is valid, allow access
      console.log(`Protected route access granted: ${pathname}`)
      return NextResponse.next()

    } catch (error) {
      // Backend validation failed, redirect to login
      console.error(`Token validation failed: ${error.message}`)
      const response = NextResponse.redirect(new URL('/auth/magic', request.url))
      response.cookies.set('auth_token', '', { maxAge: 0 })
      return response
    }
  }
  
  // If accessing auth routes while authenticated
  if (isAuthRoute && authToken) {
    // Validate token to ensure it's still valid
    try {
      const validateResponse = await fetch(`http://api-auth:8083/auth/validate`, {
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
      
      // Token is invalid, clear cookie and allow access to auth route
      const response = NextResponse.next()
      response.cookies.set('auth_token', '', { maxAge: 0 })
      return response
      
    } catch (error) {
      // Backend validation failed, clear cookie and allow access to auth route
      console.error(`Token validation failed on auth route: ${error.message}`)
      const response = NextResponse.next()
      response.cookies.set('auth_token', '', { maxAge: 0 })
      return response
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