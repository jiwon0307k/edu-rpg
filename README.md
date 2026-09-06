# Edu-RPG: 경험치 통장

RPG 스타일의 교실 경험치 관리 시스템입니다. 학생은 매일 자신의 활동(인사, 가치 도장, 과제, 글쓰기, 칭호)을 입력하고, 선생님은 이를 승인하며 레벨을 올려갑니다.

배포 주소: **https://jiwon0307k.github.io/edu-rpg**

---

## 핵심 시스템

### 데이터 무결성 엔진 (Full-Reconciliation)
- 승인/수정/삭제/감점이 일어날 때마다 `+`, `-` 누적 계산을 하지 않음
- 매번 승인된 원천 기록 전체를 처음부터 다시 합산해서 `profiles.total_xp`를 새로 기록 (`recalculateAndSaveXP`, `js/xp-service.js`)
- 수정 순서와 무관하게 최종 숫자가 항상 실제 데이터와 일치

### 자식 레코드 트랜잭션 (Delete & Replace)
- 가치 도장·칭호가 딸린 기록 수정 시, 기존 도장/칭호를 전부 삭제 후 현재 입력값으로 재생성
- 부분 수정 방식에서 발생하던 "수정했더니 옛날 값이 남아 중복 누적" 문제를 원천 차단

### 보안 및 롤백 체계
- Supabase RLS 정책을 기능 단위로 세분화 (예: 알림 삭제 전용 정책, 학생 본인 pending 기록의 도장/칭호 수정 전용 정책)
- 기록 삭제·수정으로 도장 개수가 줄어 이전에 보낸 칭호 알림 기준에 못 미치게 되면, 해당 알림을 자동 롤백 (`reconcileMilestoneNotifications`)
- 이후 같은 단계를 재달성해도 "이미 보낸 알림" 취급으로 조용히 씹히는 일 없이 정상 재발송

### 게이미피케이션 & 시각화
| 요소 | 내용 |
|---|---|
| 승인 대기 게이지 | 오늘 제출한 기록이 승인됐을 때의 예상 레벨/퍼센트를 미리 표시 |
| 레벨업 연출 | 레벨업 및 5의 배수 레벨 달성 시 폭죽과 함께 축하 모달 표시 |
| 모은 도장 요약 행 | 테이블 헤더 바로 위에 각 가치 도장 열과 칼정렬된 누적 개수 배지 표시 |
| 티어 색상 | 10개 단위로 4단계 색상 승급 (연한 버터 → 골드 → 앰버 → 로열 골드) |

### 교사용 업무 효율화
- **2배 Day 이벤트 모드**: 관리자 설정의 토글 하나로 당일 전체 경험치 획득량 2배 적용. 제출된 기록은 당시 배율을 스냅샷 저장해, 이후 토글을 꺼도 과거 기록의 배율은 유지
- **일괄 입력 모달**: 반 전체 학생에게 동일 활동(인사/과제/글쓰기)을 한 번에 등록, 학생별 예외(추가 도장/칭호/감점)만 개별 조정
- **즉시 보너스 부여**: 경험치 직접 추가 시 보너스 점수와 사유를 함께 입력

### 디자인 시스템
- 입력 폼/모달의 인풋·버튼·드롭다운 높이 40px, 모서리 8px 라운드로 규격 통일
- "Soft Butter & Pure Milk" 톤(연크림 배경 + 버터 골드 포인트) 전 화면 일괄 적용

---

## 기능 요약

### 학생 기능
- 매일 경험치 입력 (인사, 가치 도장, 과제, 글쓰기, 칭호)
- 본인 경험치 기록 및 레벨 확인, 레벨업 축하 연출
- 승인 대기 중인 오늘 기록 직접 수정 (도장/칭호 포함)
- 알림 (가치 도장 칭호 달성, 레벨업)
- '모은 도장' 누적 현황 확인

### 선생님(관리자) 기능
- 학생 목록 조회 (레벨, 누적 경험치)
- 학생별 상세 기록 확인, 개별 기록/감점 수정 및 삭제
- 경험치 직접 추가 (보너스 포함, 즉시 승인)
- 반 전체 대상 일괄 입력 (예외 학생만 별도 조정)
- 학생 제출 항목 승인/수정/거절
- 감점 적용 (일반, 비율형, 초기화 — 다중 적용 가능)
- 가치 종류 및 감점 종류 관리
- 2배 Day 이벤트 모드 On/Off

---

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프론트엔드 | HTML + CSS + 바닐라 JavaScript (빌드 도구 없음) |
| 백엔드/DB/인증 | [Supabase](https://supabase.com) (PostgreSQL + Auth + JS SDK CDN) |
| 호스팅 | [GitHub Pages](https://pages.github.com) |

---

## 시스템 구조

### 페이지 구성

```
index.html ─── 로그인
  │
  ├─ [학생] student.html ─── 경험치 기록 조회 (레벨, 모은 도장, 누적 경험치 테이블)
  │    │        └── 오늘 기록 수정 모달 (승인 대기 중일 때)
  │    └── student-input.html ─── 오늘의 경험치 입력
  │
  └─ [관리자] admin-students.html ─── 학생 관리 (메인 대시보드)
       │    ├── 학생 목록 (레벨, 경험치)
       │    ├── 학생 상세 기록 + '모은 도장' 요약
       │    ├── 경험치 직접 추가 / 개별 기록 수정·삭제
       │    ├── 일괄 입력 모달
       │    └── 감점 적용/수정
       │
       ├── admin-approval.html ─── 승인 관리
       │    ├── 승인 대기 목록
       │    ├── 승인 / 수정(보너스·도장·칭호 포함) / 거절
       │    └── 전체 승인
       │
       └── admin.html ─── 관리 설정
            ├── 가치 종류 관리 (추가/수정/활성화)
            ├── 감점 종류 관리 (일반/비율형/초기화)
            └── 2배 Day 이벤트 모드 토글
```

### 데이터베이스 구조

```
auth.users (Supabase Auth)
  └── profiles (id, name, role, total_xp)
        ├── daily_entries (student_id, date, greetings, assignments, writing_type,
        │                  bonus_points, bonus_reason, status, is_double_day)
        │     ├── entry_value_stamps (entry_id, value_type_id, points, count)
        │     └── titles (entry_id, title_name, status)
        ├── penalties (student_id, penalty_type_id, xp_deducted, count)
        └── notifications (recipient_id, student_id, milestone_level)

value_types (id, name, points, active)
penalty_types (id, name, percent, is_reset, is_rate, rate_unit, rate_unit_count, active)
app_settings (key, value)  -- 2배 Day 전역 토글
```

전체 스키마와 RLS 정책, 개발 관련 세부 규약은 [`CLAUDE.md`](./CLAUDE.md)에 정리되어 있습니다.

### JavaScript 로드 순서
```
Supabase CDN → supabase-config.js → auth.js → notifications.js → date-util.js
             → xp-service.js / double-day.js / stamp-groups.js (필요한 페이지만) → 페이지별 JS
```

---

## 경험치 시스템

### 경험치 획득 항목
| 항목 | 경험치 | 2배 Day 적용 |
|------|--------|:---:|
| 인사 | 3% | ✅ |
| 가치 도장 | 기본 5% × 개수 (관리자 설정 가능) | ✅ |
| 과제 | 5% × 과제 수 | ✅ |
| 감사 일기 | 5% | ✅ |
| 주제 글쓰기 | 10% | ✅ |
| 칭호 | 20% × 칭호 수 (최대 5개) | ❌ |
| 보너스 | 관리자가 직접 부여 | ❌ |

### 레벨 시스템
- 100% 경험치 = 1 레벨 (Lv.1부터 시작)
- 표시 형식: `Lv.3 42%` = 레벨 3, 다음 레벨까지 42%
- 경험치 바(XP bar)로 진행도 시각화, 승인 대기 중인 예상치는 별도 게이지로 표시
- 레벨업 및 5의 배수 레벨 달성 시 폭죽 연출

### 가치 도장 (Stamp Count)
- 같은 가치 종류를 여러 번 받을 수 있음 (예: 국어 x3 = 15%)
- 학생 입력 시 체크박스 + 횟수 입력
- 승인된 기록만 집계해서 10개 단위 칭호 알림 발생, '모은 도장' 요약 행에 색상 티어로 표시

### 감점 시스템
| 유형 | 설명 | 예시 |
|------|------|------|
| **일반** | 잔여 경험치의 N% 감점 | 욕설 5%, 폭력 5% |
| **비율형** | 단위 수 기반 감점 (단위 수 / 기준 수 × 퍼센트) | 지각: 20분 / 10분 기준 × 10% = 20% |
| **초기화** | 잔여 경험치 전액 몰수 | 반역 |

- 여러 감점을 한 번에 적용 가능 (다중 행 UI)

### 경험치 재계산
- `profiles.total_xp`는 승인/거절/감점/수정/삭제 발생 시마다 승인된 원천 데이터를 처음부터 다시 합산해 갱신 (`recalculateAndSaveXP`)
- 학생 목록은 이 캐싱된 값만 읽어 빠르게 로드

---

## 사용 방법

### 선생님 (관리자)
1. 로그인 → 학생 관리 페이지로 이동
2. 학생 목록: 모든 학생의 레벨과 경험치 확인
3. 학생 상세보기: 학생 이름 클릭 → 전체 경험치 기록 타임라인 + 모은 도장 현황
4. 경험치 직접 추가: 상세보기 → "경험치 추가" → 항목/보너스 선택 후 추가 (즉시 승인)
5. 일괄 입력: 학생 목록 상단 "일괄 입력" → 반 전체 공통 항목 입력, 필요한 학생만 예외 조정
6. 개별 기록 수정/삭제: 상세보기 타임라인에서 각 행의 연필/휴지통 아이콘 사용
7. 승인 관리: 상단 네비 "승인 관리" → 학생 제출 항목 승인/수정(보너스·도장·칭호 포함)/거절
8. 감점 적용: 상세보기 → "감점" → 감점 종류/횟수 선택 → 미리보기 확인 후 적용
9. 설정 관리: 상단 네비 "관리 설정" → 가치/감점 종류 관리, 2배 Day 이벤트 On/Off

### 학생
1. 로그인 → 내 기록 페이지로 이동
2. 경험치 확인: 레벨 바 + 모은 도장 현황 + 일별 경험치 테이블
3. 경험치 입력: 상단 "경험치 입력" → 오늘의 활동 체크/입력 → 제출
4. 오늘 기록 수정: 승인 전이라면 배너의 "수정" 버튼으로 직접 수정 가능 (도장/칭호 포함)
5. 알림 확인: 🔔 알림벨에서 칭호/레벨업 알림 확인

---

## 설치 및 배포

### 1. Supabase 설정
1. [Supabase](https://supabase.com)에서 프로젝트 생성
2. SQL Editor에서 `supabase-setup.sql`을 위에서부터 순서대로 실행 (파일 하단 `MIGRATION` 섹션까지 전부 포함)
3. Authentication > Users에서 관리자/학생 계정 생성
4. 프로필 등록:
```sql
-- 관리자
INSERT INTO profiles (id, name, role) VALUES ('<admin-uuid>', '선생님', 'admin');
-- 학생
INSERT INTO profiles (id, name, role) VALUES ('<student-uuid>', '학생이름', 'student');
```

### 2. 설정 파일
저장소에는 포함되지 않는(.gitignore) `js/supabase-config.js` 파일을 직접 생성:
```js
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

### 3. 배포
- GitHub 저장소의 Settings > Pages에서 배포 브랜치 지정
- 별도 빌드 과정 없이 저장소 그대로 서비스됨

### 기존 배포 업그레이드
- `supabase-setup.sql` 하단 `MIGRATION` 섹션은 번호 순서(1a → 1k)대로 실행
- 이미 운영 중인 DB라면 새로 추가된 항목만 골라 순서대로 실행
- CSS/JS 수정 후에는 각 HTML 파일의 `?v=` 캐시 버스팅 값 갱신 여부 확인

---

## 파일 구조

```
edu-rpg/
├── index.html              # 로그인 페이지
├── student.html            # 학생 경험치 기록 조회 (모은 도장 + 오늘 기록 수정)
├── student-input.html      # 학생 경험치 입력 폼
├── admin-students.html     # 관리자 학생 관리 (메인, 일괄 입력 포함)
├── admin.html               # 관리자 설정 (가치/감점 종류, 2배 Day)
├── admin-approval.html     # 관리자 승인 관리
├── css/
│   └── style.css           # Soft Butter & Pure Milk 테마 CSS
├── js/
│   ├── supabase-config.js  # Supabase 연결 설정 (.gitignore)
│   ├── auth.js              # 로그인/로그아웃/라우트 가드
│   ├── date-util.js         # KST 날짜 유틸리티
│   ├── double-day.js        # 2배 Day 전역 토글 + 배율 헬퍼
│   ├── xp-service.js        # Full-Reconciliation 재계산, 칭호/알림 로직
│   ├── stamp-groups.js      # 가치 도장 그리드/모은 도장 요약 행 공용 렌더러
│   ├── notifications.js     # 알림벨 UI
│   ├── student.js           # 학생 기록 테이블 + 레벨업 연출
│   ├── student-input.js     # 학생 입력 폼
│   ├── admin-students.js    # 학생 관리 (목록, 상세, 추가, 감점, 수정/삭제)
│   ├── admin-batch-entry.js # 일괄 입력 모달 로직
│   ├── admin.js              # 관리 설정 (가치/감점 종류 CRUD, 2배 Day)
│   └── admin-approval.js    # 승인 관리
├── assets/                 # 아이콘/이미지
├── supabase-setup.sql      # DB 스키마 + RLS + 시드 + 마이그레이션(1a~1k)
├── CLAUDE.md                # 시스템 엔지니어링 명세 (스키마, RLS, 디자인 가이드)
└── README.md                # 이 파일
```
