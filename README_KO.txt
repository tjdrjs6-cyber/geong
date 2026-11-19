겅이마켓 MAIN 5.14 광장 개별 구매 패치
기준: 사용자 제공 geong-main (1)(1).zip 내 geong-main/src/ui/plaza.ts 및 geong-main/server/index.mjs
변경: 펫박스 묶음 표시에서 1개 구매, 드롭 아이템 구매 수량(1~잔여량) 지정, 총액 확인 및 잔액 확인, 서버 부분 구매 시 잔여 수량 유지.
적용: main 브랜치의 src/ui/plaza.ts, server/index.mjs 파일만 교체.
주의: main에 이후 수정한 변경 사항이 있다면 반드시 병합하세요. staging용 파일을 덮어쓰지 마세요.
검증: 서버 node --check, ZIP 무결성 확인. 실제 MySQL 동시거래 및 브라우저 테스트 미실시.
