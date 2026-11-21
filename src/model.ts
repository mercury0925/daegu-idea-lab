export const stages = ['신규 발굴','자료 조사','유사 서비스 검증','심층 검토','최종 후보','제외']
export const taskStages = ['할 일','진행 중','검토 필요','완료']
export const criteria = [
  ['local_score','지역문제 해결성',25], ['ai_score','AI 기술 활용도',25],
  ['feasibility','실현가능성',15], ['originality','독창성',15],
  ['growth','발전가능성',20], ['bonus','지역연계 가점',5],
] as const
export type Kind = 'idea' | 'resource' | 'similar' | 'task' | 'comment' | 'settings'
export type Entry = { id:string; kind:Kind; title:string; data:Record<string,string>; idea_id:string|null; author_id:string|null; created_at:string; updated_at:string }
export type Member = { id:string; name:string; role:'admin'|'member'; color:string }
export type Score = { idea_id:string; author_id:string; total:number; notes:Record<string,string> } & Record<typeof criteria[number][0],number>
export type Link = { idea_id:string; resource_id:string }
type Field = [string,string,string[]?]
export const fields:Record<Kind,Field[]> = {
  idea: [['summary','한 줄 설명'],['region','대구 적용 지역'],['problem','지역문제'],['cause','발생 원인'],['ai','AI 활용방안'],['limits','기존 해결방식의 한계'],['audience','예상 이용자'],['impact','기대효과'],['business','사업화 가능성'],['data','확보 가능한 데이터'],['difference','차별성'],['risk','위험요소'],['notion','Notion 링크'],['status','상태',stages]],
  resource: [['url','URL'],['type','자료 유형',['뉴스 기사','공공데이터','정책보고서','논문','특허','기존 서비스','기타']],['source','출처'],['date','발행일'],['summary','핵심 내용'],['region','지역'],['verified','원본 확인',['미확인','확인']]],
  similar: [['operator','운영기관'],['region','적용 지역'],['url','URL'],['problem','해결하는 문제'],['features','핵심 기능'],['ai','AI 활용'],['overlap','겹치는 부분'],['difference','차별화'],['running','실제 운영',['미확인','운영 중','종료']],['date','검증 날짜'],['status','검증 상태',['미조사','조사 중','유사사례 발견','차별성 검토 필요','검증 통과','중복으로 제외']],['duplicate','동일 핵심 문제와 해결 방식',['미확인','확인']]],
  task: [['summary','설명'],['assignee','담당자'],['date','마감일'],['priority','우선순위',['보통','높음','낮음']],['status','상태',taskStages]],
  comment: [],
  settings: [['deadline','마감일 (한국 시간)'],['notion','공용 Notion 링크'],['meeting','회의록 링크']],
}
export const labels:Record<Kind,string> = {idea:'아이디어',resource:'자료',similar:'유사 서비스',task:'업무',comment:'댓글',settings:'프로젝트 설정'}
export function safeUrl(value: string) {
  try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? url.href : undefined } catch { return undefined }
}
export function download(name:string, content:string) {
  const url = URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const csv = (rows:string[][]) => '\uFEFF' + rows.map(row => row.map(value => '"' + (/^[=+@\-\t\r\n]/.test(value) ? "'" : '') + value.replaceAll('"','""') + '"').join(',')).join('\r\n')
