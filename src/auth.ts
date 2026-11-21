import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const db = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
}) : null

export const authCallback = () => new URL('auth.html', window.location.href.split('#')[0]).href
export const signIn = (email: string, password: string) => db!.auth.signInWithPassword({ email, password })
export const resetPassword = (email: string) => db!.auth.resetPasswordForEmail(email, { redirectTo: authCallback() })
export const passwordSetupKey = 'daegu-idea-lab-password-setup'
export async function acceptAuthLink() {
  const params = new URLSearchParams(location.hash.slice(1))
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  const type = params.get('type')
  history.replaceState(null, '', location.pathname)
  if (type !== 'invite' && type !== 'recovery') throw new Error('초대 또는 비밀번호 재설정 링크를 사용해 주세요.')
  if (!access_token || !refresh_token) throw new Error('이메일 링크가 만료되었거나 유효하지 않습니다.')
  const result = await db!.auth.setSession({ access_token, refresh_token })
  if (result.error) throw result.error
  if (!result.data.user) throw new Error('유효한 계정 세션이 없습니다.')
  sessionStorage.setItem(passwordSetupKey, result.data.user.id)
}
