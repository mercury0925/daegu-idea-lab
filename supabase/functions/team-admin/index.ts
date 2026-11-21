import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (response: unknown, status = 200) => Response.json(response, { status, headers: cors })

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return json({ error: '허용되지 않은 요청입니다.' }, 405)
  const url = Deno.env.get('SUPABASE_URL')!
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: '로그인이 필요합니다.' }, 401)
  const caller = createClient(url, publicKey, { global: { headers: { Authorization: authorization } } })
  const { data: allowed, error: accessError } = await caller.rpc('is_team_admin')
  if (accessError || !allowed) return json({ error: '관리자만 변경할 수 있습니다.' }, 403)
  const body = await request.json().catch(() => null)
  if (!body) return json({ error: '잘못된 요청입니다.' }, 400)
  const server = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  if (body.action === 'list') {
    const { data: members, error } = await server.from('members').select('id,name,role')
    if (error) return json({ error: '팀원 정보를 읽을 수 없습니다.' }, 500)
    const users = await Promise.all(members.map(async member => {
      const result = await server.auth.admin.getUserById(member.id)
      return { ...member, email: result.data.user?.email ?? '' }
    }))
    return json({ users })
  }
  const { id, role } = body
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (body.action !== 'update' || typeof id !== 'string' || !name || name.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['admin', 'member'].includes(role)) {
    return json({ error: '이름, 이메일, 역할을 확인해 주세요.' }, 400)
  }
  const { data: actor } = await caller.auth.getUser()
  if (actor.user?.id === id && role !== 'admin') return json({ error: '내 관리자 권한은 직접 해제할 수 없습니다.' }, 400)
  const { data: member } = await server.from('members').select('id').eq('id', id).maybeSingle()
  if (!member) return json({ error: '등록된 팀원이 아닙니다.' }, 404)
  const { data: current, error: readError } = await server.auth.admin.getUserById(id)
  if (readError) return json({ error: '인증 계정을 찾을 수 없습니다.' }, 404)
  if (current.user.email?.toLowerCase() !== email) {
    const { error } = await server.auth.admin.updateUserById(id, { email })
    if (error) return json({ error: '이메일을 변경할 수 없습니다.' }, 409)
  }
  const { error } = await server.from('members').update({ name, role }).eq('id', id)
  return error ? json({ error: '이름과 역할을 저장하지 못했습니다.' }, 500) : json({ ok: true })
})
