import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const envAppUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const origin = envAppUrl ?? (forwardedHost ? `${forwardedProto ?? 'https'}://${forwardedHost}` : requestUrl.origin)

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
    
    // Check if user is logged in after exchanging code
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user) {
      // User is logged in, redirect to dashboard
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  // User is not logged in, redirect to landing page
  return NextResponse.redirect(`${origin}/`)
}
