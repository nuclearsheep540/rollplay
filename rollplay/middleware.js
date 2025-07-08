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
  
  // Get the auth token from cookies
  const authToken = request.cookies.get('auth_token')?.value
  
  // If accessing a protected route
  if (isProtectedRoute) {
    if (!authToken) {
      // No token found, redirect to login
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
        // Token is invalid, redirect to login
        console.log(`Protected route access denied: ${pathname} - Invalid token`)
        const response = NextResponse.redirect(new URL('/auth/magic', request.url))
        // Clear the invalid cookie
        response.cookies.set('auth_token', '', { maxAge: 0 })
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