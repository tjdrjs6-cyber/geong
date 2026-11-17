겅이마켓 3차 패치 (2차 패치 적용된 staging 기준)
- server/index.mjs: 원정대 단계별 코인 2000/3000/5000, 파편 제거; 캐릭터 1회 50 다이아, 데코 1회 100 다이아; 복권 아이템 1장당 1회; 토벌 60초 보상 판정마다 복권 0.5% 드롭; gm_saves.lottery_tickets 자동 추가
- server/game.mjs: 제초 배치 시 60초마다 코인 자동 지급(일반 30/황금 300, 비율 85/15, 최대 8시간), 제초 보너스 및 풍뎅이 배수 유지
- src/game/collection.ts, decos.ts, remoteStore.ts, src/ui/gachaUi.ts: 다이아 뽑기 가격/표시, 복권 보유 수량 및 구매 안내
- 기존 겅이복권 이미지 /assets/lottery_ticket_custom.png 그대로 사용 (이미지 파일 교체 없음)
- 기존 DB 데이터 삭제/초기화 없음. 서버 시작 시 컬럼 자동 생성.
주의: 실 Railway/MySQL 통합 검증은 수행하지 못했습니다. staging에서 먼저 확인하고 DB 백업 후 운영에 적용하세요.
