export type BusRoute = {
  id: string
  number: string
  origin: string
  destination: string
  color: string
}

/** Vibrant colors inspired by transit route maps */
const PALETTE = [
  '#2563EB', // 103 blue
  '#7C3AED', // 1300 violet
  '#DB2777', // 1301 pink
  '#0891B2', // 1302 cyan
  '#EA580C', // 16 orange
  '#16A34A', // 3-2 green
  '#CA8A04', // 34 gold
  '#4F46E5', // 4 indigo
  '#E11D48', // 4401 rose
  '#0284C7', // 521 sky
  '#9333EA', // 522 purple
  '#0D9488', // 6777 teal
  '#DC2626', // 8 red
  '#F59E0B', // 8A amber
  '#059669', // 9 emerald
  '#C026D3', // 9200 fuchsia
  '#65A30D', // 9201 lime
  '#1D4ED8', // M6405
  '#BE123C', // M6450
  '#7E22CE', // M6724
  '#B45309', // 급행99
  '#0369A1', // 65-1
  '#B91C1C', // 112
  '#0F766E', // 330
  '#A21CAF', // 523
  '#C2410C', // 순환52
]

export const BUS_ROUTES: BusRoute[] = [
  { id: '103', number: '103', origin: '동춘동차고지', destination: '상정중학교' },
  {
    id: '112',
    number: '112',
    origin: '십정동차고지',
    destination: '동춘동차고지',
  },
  {
    id: '1300',
    number: '1300',
    origin: '힐스테이트레이크 송도4차',
    destination: '동교동삼거리',
  },
  {
    id: '1301',
    number: '1301',
    origin: '송도공영차고지',
    destination: '동교동삼거리',
  },
  {
    id: '1302',
    number: '1302',
    origin: '극지연구소',
    destination: '동교동삼거리',
  },
  {
    id: '16',
    number: '16',
    origin: '송도제2차고지',
    destination: '가좌동차고지',
  },
  {
    id: '3-2',
    number: '3-2',
    origin: '인천아시아드주경기장(동문)',
    destination: '송도파크레인동일하이빌',
  },
  {
    id: '330',
    number: '330',
    origin: '신흥교통입구',
    destination: '인천공항T2',
  },
  {
    id: '34',
    number: '34',
    origin: '무지개아파트(동남아파트)',
    destination: '휴먼시아1단지',
  },
  {
    id: '4',
    number: '4',
    origin: '송도제2차고지',
    destination: '가좌동차고',
  },
  {
    id: '4401',
    number: '4401',
    origin: '송도제2차고지',
    destination: '인천포스코고등학교',
  },
  {
    id: '521',
    number: '521',
    origin: '옥련중학교',
    destination: '동인천',
  },
  {
    id: '522',
    number: '522',
    origin: '남동인더스파크역',
    destination: '주안역',
  },
  {
    id: '523',
    number: '523',
    origin: '무지개아파트(동남아파트)',
    destination: '인명여자고등학교',
  },
  {
    id: '65-1',
    number: '65-1',
    origin: '무지개아파트(동남아파트)',
    destination: '주안역환승정류장',
  },
  {
    id: '6777',
    number: '6777',
    origin: '인천항신국제여객터미널(송도)',
    destination: '인천공항T2-3층',
  },
  {
    id: '8',
    number: '8',
    origin: '인천대학교공과대학',
    destination: '송내역남부',
  },
  {
    id: '8A',
    number: '8A',
    origin: '인천대학교공과대학',
    destination: '송내역남부',
  },
  {
    id: '9',
    number: '9',
    origin: '송도제2차고지',
    destination: '원창동(종점)',
  },
  {
    id: '9200',
    number: '9200',
    origin: '송도파크레인동일하이빌',
    destination: '강남역서초현대타워앞',
  },
  {
    id: '9201',
    number: '9201',
    origin: '성호아파트',
    destination: '강남역서초현대타워앞',
  },
  {
    id: 'M6405',
    number: 'M6405',
    origin: '웰카운티',
    destination: '강남역서초현대타워앞',
  },
  {
    id: 'M6450',
    number: 'M6450',
    origin: 'e편한세상정문',
    destination: '한국무역센터.삼성역',
  },
  {
    id: 'M6724',
    number: 'M6724',
    origin: '연세대',
    destination: '신촌오거리.2호선신촌역',
  },
  {
    id: '급행99',
    number: '급행99',
    origin: '송도제2차고지',
    destination: '송내역남부',
  },
  {
    id: '순환52',
    number: '순환52',
    origin: '소래포구역종점',
    destination: '송도역',
  },
].map((route, i) => ({
  ...route,
  color: PALETTE[i % PALETTE.length],
}))
