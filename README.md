# DAEGU IDEA LAB

대구 AI 공모전 팀을 위한 비공개 협업 워크스페이스입니다. React, TypeScript, Vite와 Supabase를 사용합니다. 사이트는 GitHub Pages에서 제공하고 팀원은 이메일과 비밀번호로 로그인합니다.

## 로컬 실행

Node.js 22를 사용합니다. `npm ci`로 의존성을 설치하고 `npm run dev`로 시작합니다. Vite 기본 경로는 `http://localhost:5173/daegu-idea-lab/`입니다. `npm test`는 임베디드 PostgreSQL에서 마이그레이션과 RLS를 검사하며, `npm run build`는 타입 검사와 정적 배포 파일 생성을 수행합니다.

Supabase Project URL과 publishable key를 `.env.local`의 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`에 지정합니다. 프로젝트 설정이 없으면 로그인 화면에 연결 필요 상태가 표시됩니다. Supabase 서비스 역할 키는 Edge Function 실행 환경에서만 사용합니다.

## Supabase 설정

1. Supabase 프로젝트에 연결해 `supabase db push`를 실행하거나 SQL Editor에서 마이그레이션을 한 번 실행합니다.
2. 인증 설정에서 이메일 로그인은 활성화하고 공개 가입, 익명 로그인, GitHub 공급자는 비활성화합니다.
3. Site URL을 배포 주소 뒤에 `auth.html`을 붙인 주소로 설정하고 같은 주소를 허용된 Redirect URLs에 추가합니다. 로컬 인증을 시험할 때는 `http://localhost:5173/daegu-idea-lab/auth.html`도 허용합니다. 기본 초대 및 재설정 이메일 템플릿의 확인 링크를 사용합니다.
4. 팀원 4명에게 메일을 전송할 수 있도록 Supabase Authentication에 SMTP를 연결합니다. Supabase 기본 발신 서비스는 일반 팀원 이메일 발송에 제한이 있습니다.
5. Authentication의 Users에서 팀원 이메일 4개를 초대합니다. 각 Auth UID에 대응하는 `public.members` 행을 한 개씩 입력하고 최초 관리자에게 `admin` 역할을 지정합니다. 초대만 발송하고 멤버십을 입력하지 않은 사용자는 내부 데이터에 접근할 수 없습니다.
6. `supabase functions deploy team-admin --no-verify-jwt`로 관리자 전용 함수를 배포합니다. 함수에서 요청의 사용자 토큰을 Supabase에 검증하고 관리자 역할을 확인한 후 계정을 조회하거나 수정합니다.

## GitHub Pages

저장소 이름은 `daegu-idea-lab`입니다. Pages의 배포 소스를 **GitHub Actions**로 설정하고 저장소 Actions Variables에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`를 등록합니다. main 브랜치에 푸시하거나 워크플로를 수동으로 실행합니다. 배포 주소는 GitHub Actions의 `github-pages` 환경에서 확인할 수 있습니다.

배포 후 초대 링크로 팀원별 비밀번호를 설정합니다. 서로 다른 팀원 계정 두 개로 아이디어·자료·댓글 변경 공유를 확인하고, 4명 모두 평가를 제출해 평균과 참여 인원을 확인합니다. 모바일 탐색, 새로고침 후 세션, 로그아웃 후 접근 차단, 재설정 이메일을 실제 배포 주소에서 검사합니다.

공식 문서 · [Supabase 인증 설정](https://supabase.com/docs/guides/auth/general-configuration) · [Supabase 팀원 초대](https://supabase.com/docs/guides/auth/users)
