import { TeamAdmin } from './TeamAdmin'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { Link as Nav, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { LayoutDashboard, Lightbulb, Library, ScanSearch, ChartNoAxesColumnIncreasing, Columns3, GitCompare, Settings, Moon, LogOut, Plus, Menu } from 'lucide-react'
import { db } from './auth'
import { stages, taskStages, fields, criteria, labels, safeUrl, download, csv, type Member, type Entry, type Kind, type Score, type Link } from './model'

const client = db!
const pages = [
  ['/', '대시보드', LayoutDashboard], ['/ideas','아이디어',Lightbulb], ['/resources','자료실',Library],
  ['/similar','유사 서비스 검증',ScanSearch], ['/scores','아이디어 평가',ChartNoAxesColumnIncreasing],
  ['/tasks','업무 관리',Columns3], ['/compare','최종 후보 비교',GitCompare], ['/settings','설정',Settings],
] as const
const kinds = {ideas:'idea',resources:'resource',similar:'similar',tasks:'task'} as const
type Editor = { kind:Kind; entry?:Entry; ideaId?:string }

export function Workspace({user}:{user:User}) {
  const [members,setMembers] = useState<Member[]>()
  const [entries,setEntries] = useState<Entry[]>([])
  const [scores,setScores] = useState<Score[]>([])
  const [links,setLinks] = useState<Link[]>([])
  const [message,setMessage] = useState('')
  const [failure,setFailure] = useState('')
  const [editor,setEditor] = useState<Editor>()
  const [busy,setBusy] = useState(false)
  const [menu,setMenu] = useState(false)
  const [dark,setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const location = useLocation()
  useEffect(() => {setMenu(false); setEditor(undefined)},[location.pathname])
  useEffect(() => {document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('theme',dark ? 'dark' : 'light')},[dark])
  const load = useCallback(async () => {
    const result = await Promise.all([
      client.from('members').select('*').order('name'),
      client.from('records').select('*').order('created_at',{ascending:false}),
      client.from('evaluations').select('*'),
      client.from('idea_resources').select('*'),
    ])
    const error = result.find(item => item.error)?.error
    if (error) { setFailure(error.message); return }
    setFailure('')
    setMembers(result[0].data as Member[])
    setEntries(result[1].data as Entry[])
    setScores(result[2].data as Score[])
    setLinks(result[3].data as Link[])
  },[])
  useEffect(() => {
    void load()
    const channel = client.channel('team-workspace', { config: { private: true } })
    channel.on('broadcast', { event: 'changed' }, () => { void load() })
    channel.subscribe(status => { if (status === 'SUBSCRIBED') void load() })
    return () => { void client.removeChannel(channel) }
  },[load])
  async function run(operation:PromiseLike<{error:{message:string}|null}>, success:string, after?:()=>void) {
    setBusy(true)
    setMessage('')
    try {
      const {error} = await operation
      if (error) throw error
      await load()
      setMessage(success)
      after?.()
    } catch (error) {
      setMessage(error && typeof error === 'object' && 'message' in error ? String(error.message) : '요청을 처리할 수 없습니다.')
    } finally {setBusy(false)}
  }
  const member = members?.find(person => person.id === user.id)
  const ideas = entries.filter(entry => entry.kind === 'idea')
  const project = entries.find(entry => entry.kind === 'settings')
  const deadline = project?.data.deadline || '2026-11-30T18:00'
  const daysLeft = Math.ceil((new Date(deadline + '+09:00').getTime() - Date.now()) / 86400000)
  const personName = (id?:string|null) => members?.find(person => person.id === id)?.name ?? '—'
  const average = (id:string) => {
    const results = scores.filter(score => score.idea_id === id)
    return results.length ? results.reduce((sum,score) => sum + score.total,0) / results.length : null
  }
  const duplicate = (id:string) => entries.some(entry => entry.idea_id === id && entry.kind === 'similar' && entry.data.duplicate === '확인')
  const excluded = (idea:Entry) => idea.data.status === '제외' || entries.some(entry => entry.idea_id === idea.id && entry.kind === 'similar' && entry.data.status === '중복으로 제외')
  const prettyScore = (id:string) => average(id)?.toFixed(1) ?? '—'
  const remove = (entry:Entry) => {
    if (confirm(`‘${entry.title}’ 항목을 삭제할까요?`))
      void run(client.from('records').delete().eq('id',entry.id).select('id').single(),'삭제했습니다.')
  }
  function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return
    const form = new FormData(event.currentTarget)
    const title = editor.kind === 'settings' ? labels.settings : String(form.get('title') ?? '').trim()
    const data = Object.fromEntries(fields[editor.kind].map(([key]) => [key,String(form.get(key) ?? '').trim()]))
    const ideaId = String(form.get('idea_id') ?? editor.ideaId ?? '') || null
    const values = {title,data,idea_id:ideaId}
    void run(editor.entry ? client.from('records').update(values).eq('id',editor.entry.id).select('id').single()
      : client.from('records').insert({...values,kind:editor.kind}).select('id').single(),'저장했습니다.',() => setEditor(undefined))
  }
  const card = (entry:Entry) => <article className="card entry" key={entry.id}>
    <div className="row"><span className="tag">{entry.data.status || entry.data.type || labels[entry.kind]}</span><small>{personName(entry.author_id)} · {new Date(entry.created_at).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}</small></div>
    <h3>{entry.kind === 'idea' ? <Nav to={`/ideas/${entry.id}`}>{entry.title}</Nav> : entry.title}</h3>
    <p>{entry.data.summary || entry.data.problem || entry.data.operator}</p>
    {entry.kind === 'idea' && duplicate(entry.id) && <span className="warning">중복 위험</span>}
    <small>{entry.kind === 'task' ? personName(entry.data.assignee) : entry.data.region} {entry.data.date}</small>
    {entry.idea_id && <Nav to={`/ideas/${entry.idea_id}`}>{ideas.find(idea => idea.id === entry.idea_id)?.title}</Nav>}
    {safeUrl(entry.data.url ?? '') && <a href={safeUrl(entry.data.url)} target="_blank" rel="noreferrer">원문 보기</a>}
    {(entry.kind !== 'comment' || entry.author_id === user.id) && <div className="actions">
      <button onClick={() => setEditor({kind:entry.kind,entry})}>수정</button><button onClick={() => remove(entry)} disabled={busy}>삭제</button>
    </div>}
  </article>

  function details(idea:Entry, tab:string) {
    if (tab === '평가 결과') return scoreForm(idea)
    if (tab === '댓글 및 토론') return <><button onClick={() => setEditor({kind:'comment',ideaId:idea.id})}>댓글 작성</button><div className="grid">{entries.filter(item => item.kind === 'comment' && item.idea_id === idea.id).map(card)}</div></>
    if (tab === '유사 서비스') return <><button onClick={() => setEditor({kind:'similar',ideaId:idea.id})}>유사 서비스 등록</button><div className="grid">{entries.filter(item => item.kind === 'similar' && item.idea_id === idea.id).map(card)}</div></>
    if (tab === '지역문제 근거' || tab === '공공데이터') {
      const resources = entries.filter(item => item.kind === 'resource' && (tab !== '공공데이터' || item.data.type === '공공데이터'))
      return <section className="card"><h2>연결된 자료</h2>{resources.length === 0 && <p>자료실에서 먼저 자료를 등록하세요.</p>}{resources.map(resource => {
        const linked = links.some(link => link.idea_id === idea.id && link.resource_id === resource.id)
        return <div className="row" key={resource.id}><span>{resource.title}</span><button disabled={busy} onClick={() => void run(linked ? client.from('idea_resources').delete().eq('idea_id',idea.id).eq('resource_id',resource.id) : client.from('idea_resources').insert({idea_id:idea.id,resource_id:resource.id}), linked ? '연결을 해제했습니다.' : '자료를 연결했습니다.')}>{linked ? '연결 해제' : '연결'}</button></div>
      })}</section>
    }
    const keys = tab === 'AI 기술 설계' ? ['ai','data','difference'] : tab === '사업화' ? ['business','audience','impact','risk'] : ['summary','region','problem','cause','limits','status','notion']
    return <dl className="card detail">{fields.idea.filter(([key]) => keys.includes(key)).map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{key === 'notion' && safeUrl(idea.data[key] ?? '') ? <a href={safeUrl(idea.data[key])} target="_blank" rel="noreferrer">Notion 열기</a> : idea.data[key] || '—'}</dd></div>)}</dl>
  }
  function scoreForm(idea:Entry) {
    const mine = scores.find(score => score.idea_id === idea.id && score.author_id === user.id)
    const results = scores.filter(score => score.idea_id === idea.id)
    return <section className="card">
      <div className="row"><h2>{idea.title}</h2><span className="tag">평균 {prettyScore(idea.id)} / 105 · {results.length}/4명</span></div>
      <form key={mine?.total ?? 'new'} onSubmit={event => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const values = Object.fromEntries(criteria.map(([key]) => [key,Number(form.get(key))]))
        const notes = Object.fromEntries(criteria.map(([key]) => [key,String(form.get(key + '_note') ?? '')]))
        void run(mine ? client.from('evaluations').update({...values,notes}).eq('idea_id',idea.id).eq('author_id',user.id).select('idea_id').single()
          : client.from('evaluations').insert({...values,notes,idea_id:idea.id,author_id:user.id}),'평가를 저장했습니다.')
      }}>
        {criteria.map(([key,label,max]) => <div className="score-field" key={key}><label>{label} / {max}<input name={key} type="number" required min={0} max={max} step={1} defaultValue={mine?.[key] ?? 0} /></label><label>평가 의견<input name={key + '_note'} defaultValue={mine?.notes[key] ?? ''} /></label><div><small>항목 평균 {results.length ? (results.reduce((sum,item)=>sum+item[key],0)/results.length).toFixed(1) : '—'}</small><progress max={max} value={results.length ? results.reduce((sum,item)=>sum+item[key],0)/results.length : 0} /></div></div>)}
        <div className="actions"><button className="primary" disabled={busy}>평가 저장</button>{mine && <button type="button" disabled={busy} onClick={() => {if(confirm('내 평가를 삭제할까요?')) void run(client.from('evaluations').delete().eq('idea_id',idea.id).eq('author_id',user.id),'평가를 삭제했습니다.')}}>내 평가 삭제</button>}</div>
      </form>
    </section>
  }
  if (failure || !members || !member) return <main className="auth"><section className="auth-card"><h1>DAEGU IDEA LAB</h1><p role="status">{failure || (!members ? '워크스페이스를 불러오는 중입니다.' : '등록된 팀원 계정으로 로그인해 주세요.')}</p>{failure && <button onClick={() => void load()}>다시 시도</button>}<button onClick={() => void client.auth.signOut()}>로그아웃</button></section></main>
  const ranked = [...ideas].sort((a,b) => (average(b.id) ?? -1) - (average(a.id) ?? -1))
  return <div className="shell">
    <aside className={menu ? 'open' : ''}><div className="brand"><span className="brand-mark">D</span><div>DAEGU IDEA LAB<small>대구 AI 공모전 팀</small></div></div>
      <nav>{pages.map(([path,label,Icon]) => <Nav key={path} to={path} className={path === location.pathname || (path !== '/' && location.pathname.startsWith(path + '/')) ? 'active' : ''}><Icon size={18}/>{label}</Nav>)}</nav>
      <div className="sidebar-bottom"><div className="row"><span className="avatar" style={{background:member.color}}>{member.name.slice(0,1)}</span><span>{member.name}<small>{member.role === 'admin' ? '관리자' : '팀원'}</small></span></div><button className="quiet" onClick={() => void client.auth.signOut()}><LogOut size={16}/> 로그아웃</button></div>
    </aside>
    <main className="workspace"><header className="topbar"><button className="mobile" aria-label="메뉴" onClick={() => setMenu(!menu)}><Menu size={19}/></button><span>워크스페이스</span><button aria-label="화면 테마 변경" onClick={() => setDark(!dark)}><Moon size={18}/></button></header>
    <div className="content">
      {message && <div className="notice" role="status">{message}<button onClick={() => setMessage('')} aria-label="알림 닫기">×</button></div>}
      <Routes>
        <Route path="/" element={<><div className="heading"><div><h1>대시보드</h1><p>팀의 공모전 준비 현황</p></div><button className="primary" onClick={() => setEditor({kind:'idea'})}><Plus size={17}/> 아이디어 등록</button></div>
          <div className="hero"><div><span>제안서 제출 마감</span><h2>{daysLeft >= 0 ? 'D-' + daysLeft : '마감 종료'}</h2><p>{deadline.replace('T',' ')} KST</p></div><div className="hero-mark" aria-hidden="true">D</div></div>
          <div className="stats">{[['전체 아이디어',ideas.length],['자료 조사',ideas.filter(i=>i.data.status==='자료 조사').length],['유사 서비스 검증 통과',new Set(entries.filter(e=>e.kind==='similar'&&e.idea_id&&e.data.status==='검증 통과').map(e=>e.idea_id)).size],['최종 후보',ideas.filter(i=>i.data.status==='최종 후보'&&!excluded(i)).length]].map(([label,value]) => <div className="card" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
          {([['최근 아이디어','idea'],['최근 자료','resource'],['팀 업무','task']] as const).map(([title,kind]) => <section key={kind}><h2>{title}</h2><div className="grid">{entries.filter(e=>e.kind===kind).slice(0,4).map(card)}</div>{!entries.some(e=>e.kind===kind) && <p className="empty">등록된 항목이 없습니다.</p>}</section>)}
          <section className="card"><h2>최근 활동</h2>{[...entries].sort((a,b) => b.updated_at.localeCompare(a.updated_at)).slice(0,6).map(entry=><div className="row" key={entry.id}><span>{labels[entry.kind]} · {entry.title}</span><small>{new Date(entry.updated_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</small></div>)}</section></>}/>
        {Object.entries(kinds).map(([path,kind]) => <Route key={path} path={path} element={<Listing key={kind} kind={kind} entries={entries.filter(entry=>entry.kind===kind)} members={members} average={average} card={card} add={()=>setEditor({kind})}/>}/>)}
        <Route path="ideas/:id" element={<IdeaDetail ideas={ideas} render={details} edit={entry=>setEditor({kind:'idea',entry})} duplicate={duplicate}/>}/>
        <Route path="scores" element={<><h1>아이디어 평가</h1><div className="actions"><button onClick={() => download('평가.csv',csv([['아이디어','평균','참여 인원','분류'],...ranked.map(idea=>[idea.title,prettyScore(idea.id),String(scores.filter(score=>score.idea_id===idea.id).length),excluded(idea)?'제외':'일반'])]))}>CSV 다운로드</button></div><h2>일반 순위</h2>{ranked.filter(i=>!excluded(i)).map(idea=><div key={idea.id}>{scoreForm(idea)}</div>)}{ranked.some(excluded) && <><h2>제외된 아이디어</h2>{ranked.filter(excluded).map(idea=><div key={idea.id}>{scoreForm(idea)}</div>)}</>}</>}/>
        <Route path="compare" element={<Compare ideas={ideas.filter(i=>i.data.status==='최종 후보'&&!excluded(i))} score={prettyScore}/>}/>
        <Route path="settings" element={<><h1>설정</h1>{member.role === 'admin' && <TeamAdmin refresh={load}/>}<section className="card"><h2>내 프로필</h2><form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void run(client.from('members').update({name:String(form.get('name')).trim(),color:String(form.get('color'))}).eq('id',user.id).select('id').single(),'프로필을 저장했습니다.')}}><label>이메일<input value={user.email ?? ''} readOnly/></label><label>이름<input name="name" defaultValue={member.name} required/></label><label>프로필 색상<input name="color" type="color" defaultValue={member.color}/></label><button className="primary" disabled={busy}>프로필 저장</button></form></section><section className="card"><h2>팀원</h2>{members.map(person => <div className="row" key={person.id}><span>{person.name}</span><small>{person.role==='admin' ? '관리자' : '팀원'}</small></div>)}</section><section className="card"><h2>프로젝트 설정</h2><p>{deadline.replace('T',' ')} KST</p>{(['notion','meeting'] as const).map((key,index)=>safeUrl(project?.data[key] ?? '') && <div key={key}><a href={safeUrl(project!.data[key])} target="_blank" rel="noreferrer">{index ? 'Notion 회의록' : '프로젝트 Notion'}</a></div>)}{member.role==='admin' && <button onClick={()=>setEditor({kind:'settings',entry:project})}>설정 변경</button>}</section></>}/>
        <Route path="*" element={<p>페이지를 찾을 수 없습니다. <Nav to="/">대시보드로 이동</Nav></p>}/>
      </Routes>
    </div></main>
    {editor && <div className="overlay"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="edit-title"><div className="row"><h2 id="edit-title">{labels[editor.kind]} {editor.entry ? '수정' : '등록'}</h2><button onClick={()=>setEditor(undefined)} aria-label="닫기">×</button></div><form onSubmit={save}>
      {editor.kind !== 'settings' && <label>{editor.kind==='comment' ? '내용' : '제목'}<textarea name="title" defaultValue={editor.entry?.title} required rows={editor.kind==='comment'?4:1}/></label>}
      {['task','similar','comment'].includes(editor.kind) && <label>연결된 아이디어<select name="idea_id" defaultValue={editor.entry?.idea_id ?? editor.ideaId ?? ''} required={editor.kind!=='task'}><option value="">선택</option>{ideas.map(idea=><option key={idea.id} value={idea.id}>{idea.title}</option>)}</select></label>}
      {fields[editor.kind].map(([key,label,options]) => {
        const value=editor.entry?.data[key] ?? (key==='deadline'?deadline:'')
        return <label key={key}>{label}{options ? <select name={key} defaultValue={value || options[0]}>{options.map(option=><option key={option}>{option}</option>)}</select> : key==='assignee' ? <select name={key} defaultValue={value}><option value="">미배정</option>{members.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select> : key==='deadline' || key==='date' ? <input name={key} type={key==='deadline'?'datetime-local':'date'} defaultValue={value} required={key==='deadline'}/> : ['url','notion','meeting'].includes(key) ? <input name={key} type="url" defaultValue={value}/> : <textarea name={key} defaultValue={value} rows={2}/>}</label>
      })}
      {message && <p role="status">{message}</p>}<button className="primary" disabled={busy}>저장</button>
    </form></section></div>}
  </div>
}

type Card = (entry:Entry)=>React.ReactNode
function Listing({kind,entries,members,average,card,add}:{kind:Kind;entries:Entry[];members:Member[];average:(id:string)=>number|null;card:Card;add:()=>void}) {
  const [query,setQuery]=useState('')
  const [stage,setStage]=useState('')
  const [region,setRegion]=useState('')
  const [author,setAuthor]=useState('')
  const [sort,setSort]=useState(false)
  const [view,setView]=useState('cards')
  const options=fields[kind].find(([key])=>key==='status'||key==='type')?.[2]
  const filtered=entries.filter(entry=>[entry.title,...Object.values(entry.data)].join(' ').toLowerCase().includes(query.toLowerCase())&&(!stage||(entry.data.status||entry.data.type)===stage)&&(!region||entry.data.region===region)&&(!author||entry.author_id===author))
  if(sort) filtered.sort((a,b)=>(average(b.id)??-1)-(average(a.id)??-1))
  return <><div className="heading"><h1>{kind==='similar'?'유사 서비스 검증':kind==='task'?'업무 관리':kind==='resource'?'자료실':'아이디어 보드'}</h1><button className="primary" onClick={add}><Plus size={17}/>{labels[kind]} 등록</button></div><div className="filters"><input aria-label="검색" placeholder="제목 또는 내용 검색" value={query} onChange={e=>setQuery(e.target.value)}/>
    {options&&<select aria-label="상태 또는 유형" value={stage} onChange={e=>setStage(e.target.value)}><option value="">전체 상태·유형</option>{options.map(option=><option key={option}>{option}</option>)}</select>}
    {kind==='idea'&&<><select aria-label="지역" value={region} onChange={e=>setRegion(e.target.value)}><option value="">전체 지역</option>{[...new Set(entries.map(entry=>entry.data.region).filter(Boolean))].map(r=><option key={r}>{r}</option>)}</select><select aria-label="작성자" value={author} onChange={e=>setAuthor(e.target.value)}><option value="">전체 작성자</option>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><button aria-pressed={sort} onClick={()=>setSort(!sort)}>점수순</button></>}
    {(kind==='idea'||kind==='task')&&<select aria-label="보기 방식" value={view} onChange={e=>setView(e.target.value)}><option value="cards">카드</option><option value="list">{kind==='idea'?'테이블':'목록'}</option>{kind==='task'&&<option value="kanban">칸반</option>}</select>}
  </div>{filtered.length===0 ? <p className="empty">표시할 항목이 없습니다.</p> : view==='kanban' ? <div className="kanban">{taskStages.map(status=><section key={status}><h2>{status}</h2>{filtered.filter(entry=>entry.data.status===status).map(card)}</section>)}</div> : view==='list' && kind==='idea' ? <div className="table-wrap"><table><thead><tr><th>아이디어</th><th>지역</th><th>상태</th><th>작성자</th><th>평균</th></tr></thead><tbody>{filtered.map(entry=><tr key={entry.id}><td><Nav to={`/ideas/${entry.id}`}>{entry.title}</Nav></td><td>{entry.data.region}</td><td>{entry.data.status}</td><td>{members.find(person=>person.id===entry.author_id)?.name}</td><td>{average(entry.id)?.toFixed(1)??'—'}</td></tr>)}</tbody></table></div> : <div className={view==='list'?'list':'grid'}>{filtered.map(card)}</div>}</>
}
function IdeaDetail({ideas,render,edit,duplicate}:{ideas:Entry[];render:(idea:Entry,tab:string)=>React.ReactNode;edit:(idea:Entry)=>void;duplicate:(id:string)=>boolean}) {
  const {id}=useParams()
  const [tab,setTab]=useState('개요')
  const [copied,setCopied]=useState(false)
  const idea=ideas.find(item=>item.id===id)
  if(!idea)return <p className="empty">아이디어를 찾을 수 없습니다.</p>
  return <><Nav to="/ideas">아이디어 보드</Nav><div className="heading"><div><h1>{idea.title}</h1>{duplicate(idea.id)&&<span className="warning">동일 핵심 문제와 해결 방식이 확인되었습니다.</span>}</div><div className="actions"><button onClick={()=>void navigator.clipboard.writeText(`# ${idea.title}\n\n${idea.data.summary??''}`).then(()=>setCopied(true))}>{copied?'복사했습니다':'요약 복사'}</button><button onClick={()=>edit(idea)}>수정</button></div></div><div className="tabs">{['개요','지역문제 근거','공공데이터','유사 서비스','AI 기술 설계','사업화','댓글 및 토론','평가 결과'].map(name=><button key={name} aria-pressed={tab===name} onClick={()=>setTab(name)}>{name}</button>)}</div>{render(idea,tab)}</>
}
function Compare({ideas,score}:{ideas:Entry[];score:(id:string)=>string}) {
  const [ids,setIds]=useState<string[]>([])
  const chosen=ideas.filter(idea=>ids.includes(idea.id)).slice(0,5)
  const attributes=[['problem','지역문제'],['region','대구 특화성'],['ai','AI 핵심 기술'],['data','확보 가능한 데이터'],['difference','차별성'],['audience','예상 이용자'],['business','사업화 가능성'],['score','팀 평균 평가점수'],['risk','주요 위험요소']]
  const rows=[['비교 항목',...chosen.map(idea=>idea.title)],...attributes.map(([key,label])=>[label,...chosen.map(idea=>key==='score'?score(idea.id):idea.data[key]||'—')])]
  return <><h1>최종 후보 비교</h1>{ideas.length===0&&<p className="empty">최종 후보 상태의 아이디어가 없습니다.</p>}<section className="filters">{ideas.map(idea=><label className="check" key={idea.id}><input type="checkbox" checked={ids.includes(idea.id)} disabled={chosen.length>=5&&!ids.includes(idea.id)} onChange={event=>setIds(event.target.checked?[...ids,idea.id]:ids.filter(id=>id!==idea.id))}/>{idea.title}</label>)}</section>{chosen.length>0&&<><div className="actions"><button onClick={()=>download('최종후보.csv',csv(rows))}>CSV 다운로드</button><button onClick={()=>download('최종후보.md',[rows[0],rows[0].map(()=>'---'),...rows.slice(1)].map(row=>'| '+row.map(cell=>cell.replaceAll('|','\\|').replace(/\r?\n/g,' ')).join(' | ')+' |').join('\n'))}>Markdown 다운로드</button></div><div className="table-wrap"><table><thead><tr>{rows[0].map((cell,index)=><th key={index}>{cell}</th>)}</tr></thead><tbody>{rows.slice(1).map(row=><tr key={row[0]}>{row.map((cell,index)=><td key={index}>{cell}</td>)}</tr>)}</tbody></table></div></>}</>
}
