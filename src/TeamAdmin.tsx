import { useState, type FormEvent } from 'react'
import { db } from './auth'

type Person = { id:string; name:string; email:string; role:'admin'|'member' }

export function TeamAdmin({ refresh }: { refresh:()=>Promise<void> }) {
  const [people,setPeople]=useState<Person[]>()
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(false)

  async function load() {
    const {data,error}=await db!.functions.invoke<{users:Person[]}>('team-admin',{body:{action:'list'}})
    if(error || !data) setMessage('팀원 관리 기능을 불러올 수 없습니다.')
    else setPeople(data.users)
  }
  async function save(event:FormEvent<HTMLFormElement>,id:string) {
    event.preventDefault()
    const form=new FormData(event.currentTarget)
    setBusy(true)
    setMessage('')
    const {error}=await db!.functions.invoke('team-admin',{body:{action:'update',id,...Object.fromEntries(form)}})
    if(error) {
      const payload=await error.context?.json?.().catch(()=>null)
      setMessage(payload?.error ?? '팀원 정보를 저장할 수 없습니다.')
    } else {
      await Promise.all([load(),refresh()])
      setMessage('팀원 정보를 저장했습니다.')
    }
    setBusy(false)
  }
  return <section className="card"><h2>팀원 관리</h2>
    {!people && <button onClick={()=>void load()}>팀원 정보 불러오기</button>}
    {people?.map(person=><form className="card" key={person.id} onSubmit={event=>void save(event,person.id)}>
      <label>이름<input name="name" defaultValue={person.name} required maxLength={100}/></label>
      <label>이메일<input name="email" type="email" defaultValue={person.email} required/></label>
      <label>권한<select name="role" defaultValue={person.role}><option value="member">팀원</option><option value="admin">관리자</option></select></label>
      <button disabled={busy}>팀원 정보 저장</button>
    </form>)}
    {message && <p role="status">{message}</p>}
  </section>
}
