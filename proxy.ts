import { NextResponse, type NextRequest } from 'next/server'

// Local-only: no auth, just pass all requests through
export function proxy(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)',
  ],
}
