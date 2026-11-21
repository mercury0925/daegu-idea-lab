import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { acceptAuthLink, db, passwordSetupKey, resetPassword, signIn } from './auth'
import { Workspace } from './Workspace'

const callback = new URLSearchParams(location.search).has('auth')
const callbackResult = db && callback ? acceptAuthLink().then(() => '', (error: Error) => error.message) : null

export function App() {
  const [session, setSession] = useState<Session|null>()
  const [mode, setMode] = useState<'login'|'reset'|'password'>(callback || sessionStorage.getItem(passwordSetupKey) ? 'password' : 'login')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [validLink, setValidLink] = useState(!callback && Boolean(sessionStorage.getItem(passwordSetupKey)))
  useEffect(() => {
    if (!db) return
    const {data} = db.auth.onAuthStateChange((_event, current) => setSession(current))
    callbackResult?.then(error => {
      setMessage(error)
      setValidLink(!error)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!db) return
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'reset') {
        const {error} = await resetPassword(email)
        if (error) throw error
        setMessage('등록된 이메일이면 비밀번호 재설정 링크를 받을 수 있습니다.')
      } else if (mode === 'password') {
        const {error} = await db.auth.updateUser({password})
        if (error) throw error
        sessionStorage.removeItem(passwordSetupKey)
        setMode('login')
      } else {
        const {error} = await signIn(email, password)
        if (error) throw error
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '인증 요청을 처리할 수 없습니다.')
    } finally { setBusy(false) }
  }
  if (session && mode === 'login') return <Workspace key={session.user.id} user={session.user} />
  return <main className="auth">
    <div className="auth-brand"><span className="brand-mark">D</span> DAEGU IDEA LAB</div>
    <section className="auth-card">
      <h1>{mode === 'password' ? '새 비밀번호 설정' : mode === 'reset' ? '비밀번호 재설정' : '팀 워크스페이스 로그인'}</h1>
      {!db ? <p role="status">Supabase 연결 설정이 필요합니다.</p> : <form onSubmit={submit}>
        {mode !== 'password' && <label>이메일<input name="email" type="email" autoComplete="email" required /></label>}
        {mode !== 'reset' && <label>비밀번호<input name="password" type="password" autoComplete={mode === 'password' ? 'new-password' : 'current-password'} minLength={mode === 'password' ? 8 : undefined} required /></label>}
        <button className="primary" disabled={busy || session === undefined || (mode === 'password' && (!validLink || session?.user.id !== sessionStorage.getItem(passwordSetupKey)))}>{mode === 'reset' ? '재설정 링크 보내기' : mode === 'password' ? '비밀번호 저장' : '로그인'}</button>
        {message && <p role="status">{message}</p>}
        {mode !== 'password' && <button type="button" className="quiet" onClick={() => {setMode(mode === 'login' ? 'reset' : 'login'); setMessage('')}}>{mode === 'login' ? '비밀번호를 잊으셨나요?' : '로그인으로 돌아가기'}</button>}
        {mode === 'password' && <button type="button" className="quiet" onClick={async () => {await db?.auth.signOut({scope:'local'}); sessionStorage.removeItem(passwordSetupKey); setMode('login'); setMessage('')}}>로그인으로 돌아가기</button>}
      </form>}
    </section>
  </main>
}
