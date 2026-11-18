겅이마켓 2.6 패치 (2.5 적용 후)
- src/styles/gacha.css: 커뮤니티/상점 펼침 메뉴 크기 정상화, 펫박스/펫관리 동일한 세로 영역 확장
- src/ui/gachaUi.ts: 펫박스 개봉 연출 완료 후에만 확인 버튼 활성화, 펫 도감 이미지 지연 로딩 해제

토벌장 보상 정적 검토:
- 서버 settleBattle에서 스테이지 클리어 시 stageReward를 누적하고 gm_saves의 diamonds/fragments/lottery_tickets에 가산한 뒤 동일 트랜잭션으로 commit하는 코드를 확인함.
- 실서버 DB/로그 접근 권한이 없어 실제 미지급 현상은 재현·검증하지 못함. 따라서 서버 보상 계산 코드는 임의 변경하지 않음.
- 운영 환경에서 특정 계정의 클리어 직전/직후 gm_saves 수치, /api/battle 응답의 cleared·earned·diamondsEarned, 서버 오류 로그를 비교해 원인 파악 필요.

주의: 기존 프로젝트의 변경 파일만 덮어쓰세요. staging에서 먼저 확인하세요.
