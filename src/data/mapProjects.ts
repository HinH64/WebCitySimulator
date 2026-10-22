/**
 * What changed on the map after July 1997, kept by hand like the history events (docs/MAP.md section 2).
 *
 * The 2025 land use grid (mapBase.ts) is the end point. Each project names the cells it covers (inside a
 * polygon, and of certain kinds in 2025), what they were in July 1997, and how they changed since. Going
 * back through every project gives the 1997 map. Years and areas are approximate, at the 250 m grid's
 * level of detail; developments smaller than a few cells are left out.
 *
 * Coordinates are Hong Kong 1980 Grid metres (easting, northing), as in mapBase.ts and mapStations.ts.
 */

import { MAP_TILE_KINDS } from './mapBase'

export type TileKind = (typeof MAP_TILE_KINDS)[number]
export type YearMonth = [number, number]

export interface MapArea {
  polygon: [number, number][]
  /** Only cells whose 2025 kind is one of these. */
  kinds: TileKind[]
}

export interface ProjectStep {
  from: YearMonth
  /** 'base' is the cell's 2025 kind. */
  kind: TileKind | 'base'
  /** Share of the project's cells this step reaches, counted from `start` outwards. */
  share: number
}

export interface MapProject {
  id: string
  name: string
  area: MapArea
  /** What the cells were in July 1997. */
  before: TileKind
  steps: ProjectStep[]
  /** Where development began; cells nearer to it change first. Defaults to the area's centre. */
  start?: [number, number]
  source: string
}

/** Built-up kinds a new development area is made of. */
const URBAN: TileKind[] = [
  'private', 'public', 'commercial', 'industrial', 'sciencePark', 'logistics', 'institution', 'park', 'road', 'rail',
  'port', 'utility', 'construction', 'otherUrban',
]
const LAND: TileKind[] = [...URBAN, 'airport', 'cemetery', 'farm', 'fishPond', 'woodland', 'shrubGrass', 'wetland', 'barren', 'water', 'village']

const step = (y: number, m: number, kind: TileKind | 'base', share = 1): ProjectStep => ({ from: [y, m], kind, share })

export const MAP_PROJECTS: MapProject[] = [
  {
    id: 'airport',
    name: '赤鱲角機場',
    area: {
      polygon: [[804300, 817300], [810000, 817300], [810000, 817800], [812600, 817800], [812600, 820600], [804300, 820600]],
      kinds: [...URBAN, 'airport'],
    },
    before: 'construction',
    steps: [step(1998, 7, 'base')],
    source: '機場管理局：香港國際機場 1998 年 7 月 6 日啟用；填海平台 1995 年完成',
  },
  {
    id: 'thirdRunway',
    name: '機場三跑道系統',
    area: { polygon: [[804300, 820600], [812600, 820600], [812600, 822600], [804300, 822600]], kinds: LAND },
    before: 'sea',
    steps: [step(2017, 1, 'construction', 0.3), step(2018, 1, 'construction', 0.7), step(2019, 1, 'construction'), step(2022, 7, 'base', 0.6), step(2024, 11, 'base')],
    start: [808000, 821000],
    source: '機場管理局：三跑道系統 2016 年 8 月動工，第三跑道 2022 年 7 月啟用，系統 2024 年 11 月全面啟用',
  },
  {
    id: 'hzmbPort',
    name: '港珠澳大橋香港口岸人工島',
    area: { polygon: [[812600, 818300], [815400, 818300], [815400, 820900], [812600, 820900]], kinds: LAND },
    before: 'sea',
    steps: [step(2012, 1, 'construction', 0.4), step(2014, 1, 'construction'), step(2018, 10, 'base')],
    source: '路政署：港珠澳大橋 2018 年 10 月 24 日通車，香港口岸人工島 2011 年起填海',
  },
  {
    id: 'tungChungEast',
    name: '東涌東填海',
    area: { polygon: [[812600, 816600], [815600, 816600], [815600, 818300], [812600, 818300]], kinds: ['construction', 'road', 'otherUrban', 'park', 'institution'] },
    before: 'sea',
    steps: [step(2019, 1, 'construction', 0.3), step(2021, 1, 'construction', 0.8), step(2023, 1, 'construction'), step(2025, 1, 'base')],
    start: [812800, 817000],
    source: '土木工程拓展署：東涌新市鎮擴展，東涌東填海 2018 年底動工，2023 年完成',
  },
  {
    id: 'tungChung',
    name: '東涌新市鎮',
    area: { polygon: [[809800, 815300], [812600, 815300], [812600, 817300], [809800, 817300]], kinds: URBAN },
    before: 'construction',
    steps: [step(1997, 7, 'base', 0.1), step(1999, 1, 'base', 0.3), step(2002, 1, 'base', 0.6), step(2006, 1, 'base', 0.85), step(2012, 1, 'base')],
    start: [811989, 816716],
    source: '土木工程拓展署：東涌新市鎮第一期 1997 年入伙，其後各期至 2000 年代後期陸續落成',
  },
  {
    id: 'pennysBay',
    name: '竹篙灣迪士尼樂園',
    area: { polygon: [[820700, 818200], [823900, 818200], [823900, 821000], [820700, 821000]], kinds: URBAN },
    before: 'sea',
    steps: [step(2000, 7, 'construction', 0.5), step(2002, 7, 'construction'), step(2005, 9, 'base')],
    start: [822665, 819617],
    source: '香港迪士尼樂園 2005 年 9 月 12 日開幕；竹篙灣填海 2000 年起進行',
  },
  {
    id: 'westKowloon',
    name: '西九龍填海區',
    area: {
      polygon: [[833200, 821400], [834300, 821400], [834700, 820000], [835250, 819000], [835250, 817250], [833200, 817250]],
      kinds: URBAN,
    },
    before: 'construction',
    steps: [step(1998, 7, 'base', 0.15), step(2000, 1, 'base', 0.3), step(2003, 12, 'base', 0.5), step(2007, 1, 'base', 0.7), step(2010, 1, 'base', 0.85), step(2019, 1, 'base')],
    start: [834600, 819300],
    source: '西九龍填海 1990 年代中期完成；九龍站 1998 年啟用，其上蓋、奧海城、南昌和西九文化區其後陸續落成',
  },
  {
    id: 'kaiTak',
    name: '啟德',
    area: {
      polygon: [[837600, 821400], [839200, 821600], [839900, 820600], [841700, 818200], [841200, 817600], [839300, 819500], [837600, 819900]],
      kinds: LAND,
    },
    before: 'airport',
    steps: [step(1998, 7, 'construction'), step(2013, 6, 'base', 0.2), step(2016, 1, 'base', 0.45), step(2019, 1, 'base', 0.7), step(2023, 1, 'base', 0.9), step(2025, 3, 'base')],
    start: [838600, 821200],
    source: '啟德機場 1998 年 7 月 6 日關閉；郵輪碼頭 2013 年啟用，啟晴邨 2013 年入伙，啟德體育園 2025 年開幕',
  },
  {
    id: 'tseungKwanO',
    name: '將軍澳市中心及南部',
    area: { polygon: [[843300, 816500], [846700, 816500], [846700, 819300], [843300, 819300]], kinds: URBAN.filter((k) => k !== 'sciencePark' && k !== 'industrial') },
    before: 'construction',
    steps: [step(1998, 1, 'base', 0.1), step(2000, 1, 'base', 0.25), step(2002, 8, 'base', 0.45), step(2005, 1, 'base', 0.6), step(2009, 7, 'base', 0.8), step(2016, 1, 'base', 0.9), step(2024, 1, 'base')],
    start: [844834, 818722],
    source: '土木工程拓展署：將軍澳新市鎮；將軍澳綫 2002 年通車，日出康城 2008 年起入伙',
  },
  {
    id: 'tinShuiWaiNorth',
    name: '天水圍北',
    area: { polygon: [[816800, 835300], [819700, 835300], [819700, 837100], [816800, 837100]], kinds: URBAN },
    before: 'construction',
    steps: [step(2000, 1, 'base', 0.3), step(2001, 7, 'base', 0.6), step(2006, 5, 'base', 0.85), step(2008, 1, 'base')],
    start: [818500, 835300],
    source: '房屋委員會：天水圍北各邨 2000 至 2008 年入伙；香港濕地公園 2006 年 5 月開放',
  },
  {
    id: 'andersonRoad',
    name: '安達臣道發展區',
    area: { polygon: [[842400, 820300], [844400, 820300], [844400, 822100], [842400, 822100]], kinds: ['public', 'private', 'construction', 'institution', 'park', 'road'] },
    before: 'shrubGrass',
    steps: [step(2009, 1, 'construction', 0.5), step(2016, 1, 'base', 0.3), step(2018, 1, 'base', 0.7), step(2022, 1, 'base')],
    source: '土木工程拓展署：安達臣道發展計劃；安泰邨、安達邨 2016 至 2018 年入伙',
  },
  {
    id: 'pakShekKok',
    name: '白石角科學園',
    area: { polygon: [[838300, 830700], [841800, 830700], [841800, 832800], [838300, 832800]], kinds: ['sciencePark', 'private', 'construction', 'park', 'road', 'commercial'] },
    before: 'construction',
    steps: [step(2001, 6, 'base', 0.3), step(2004, 1, 'base', 0.5), step(2009, 1, 'base', 0.75), step(2016, 1, 'base')],
    start: [840300, 831300],
    source: '香港科技園公司：科學園 2001 年起分期啟用，第二、三期 2004 至 2016 年落成；白石角住宅 2000 年代後期落成',
  },
  {
    id: 'wuKaiSha',
    name: '烏溪沙',
    area: { polygon: [[842300, 831700], [844000, 831700], [844000, 832900], [842300, 832900]], kinds: ['private', 'public', 'institution', 'park', 'road'] },
    before: 'construction',
    steps: [step(2004, 12, 'base', 0.3), step(2009, 1, 'base', 0.7), step(2013, 1, 'base')],
    start: [843163, 832199],
    source: '馬鞍山綫 2004 年 12 月通車；烏溪沙一帶私人屋苑 2000 年代至 2013 年落成',
  },
  {
    id: 'containerTerminal9',
    name: '葵青九號貨櫃碼頭',
    area: { polygon: [[828400, 820300], [830000, 820300], [830000, 822000], [828400, 822000]], kinds: ['port'] },
    before: 'sea',
    steps: [step(2002, 1, 'construction'), step(2003, 7, 'base', 0.5), step(2005, 1, 'base')],
    source: '九號貨櫃碼頭 2003 至 2005 年分期啟用',
  },
  {
    id: 'cyberport',
    name: '數碼港',
    area: { polygon: [[830600, 812800], [832000, 812800], [832000, 814200], [830600, 814200]], kinds: ['commercial', 'sciencePark', 'private', 'park', 'otherUrban'] },
    before: 'construction',
    steps: [step(2002, 1, 'base', 0.5), step(2004, 1, 'base')],
    source: '數碼港 2002 至 2004 年分期落成',
  },
  {
    id: 'lokMaChauLoop',
    name: '落馬洲河套港深創新及科技園',
    area: { polygon: [[825300, 841900], [828100, 841900], [828100, 843900], [825300, 843900]], kinds: URBAN },
    before: 'shrubGrass',
    steps: [step(2018, 1, 'construction', 0.5), step(2021, 1, 'construction'), step(2025, 1, 'base')],
    source: '創新科技及工業局：港深創新及科技園，2018 年起進行土地平整',
  },
  {
    id: 'kwuTungFanlingNorth',
    name: '古洞北及粉嶺北新發展區',
    area: { polygon: [[827800, 839400], [834800, 839400], [834800, 841800], [827800, 841800]], kinds: ['construction'] },
    before: 'farm',
    steps: [step(2019, 1, 'construction', 0.3), step(2022, 1, 'construction', 0.7), step(2025, 1, 'base')],
    source: '土木工程拓展署：古洞北及粉嶺北新發展區 2019 年起進行工程',
  },
  {
    id: 'hungShuiKiu',
    name: '洪水橋／厦村新發展區',
    area: { polygon: [[816000, 830800], [819600, 830800], [819600, 833400], [816000, 833400]], kinds: ['construction'] },
    before: 'logistics',
    steps: [step(2020, 7, 'construction', 0.4), step(2023, 1, 'construction')],
    source: '土木工程拓展署：洪水橋／厦村新發展區 2020 年起進行第一期工程',
  },
]

// ---- Railways ----

export interface RailRoute {
  id: string
  name: string
  /** Station names as in mapStations.ts, in order along the track. */
  stations: string[]
  opened: YearMonth
  /** When this stretch stopped being used as drawn, if it did. */
  closed?: YearMonth
  source: string
}

/** Heavy rail as built, each entry a stretch with its opening date. Light rail is drawn from its stops. */
export const RAIL_ROUTES: RailRoute[] = [
  { id: 'eastRail', name: '東鐵綫', stations: ['紅磡', '旺角東', '九龍塘', '大圍', '沙田', '火炭', '大學', '大埔墟', '太和', '粉嶺', '上水', '羅湖'], opened: [1910, 10], source: '九廣鐵路（英段）1910 年通車' },
  { id: 'racecourse', name: '東鐵綫馬場站', stations: ['火炭', '馬場', '大學'], opened: [1985, 10], source: '九廣鐵路：馬場站 1985 年啟用' },
  { id: 'kwunTong', name: '觀塘綫', stations: ['油麻地', '旺角', '太子', '石硤尾', '九龍塘', '樂富', '黃大仙', '鑽石山', '彩虹', '九龍灣', '牛頭角', '觀塘', '藍田'], opened: [1979, 10], source: '地下鐵路修正早期系統 1979 至 1980 年通車' },
  { id: 'tsuenWan', name: '荃灣綫', stations: ['中環', '金鐘', '尖沙咀', '佐敦', '油麻地', '旺角', '太子', '深水埗', '長沙灣', '荔枝角', '美孚', '荔景', '葵芳', '葵興', '大窩口', '荃灣'], opened: [1982, 5], source: '地下鐵路荃灣支綫 1982 年 5 月通車' },
  { id: 'island', name: '港島綫', stations: ['上環', '中環', '金鐘', '灣仔', '銅鑼灣', '天后', '炮台山', '北角', '鰂魚涌', '太古', '西灣河', '筲箕灣', '杏花邨', '柴灣'], opened: [1985, 5], source: '地下鐵路港島綫 1985 至 1986 年通車' },
  { id: 'eastHarbour', name: '觀塘綫（東區海底隧道段）', stations: ['藍田', '鰂魚涌'], opened: [1989, 10], closed: [2002, 8], source: '觀塘綫 1989 年延至鰂魚涌；2002 年 8 月起此段改屬將軍澳綫，經油塘' },
  { id: 'tungChung', name: '東涌綫', stations: ['香港', '九龍', '奧運', '南昌', '荔景', '青衣', '欣澳', '東涌'], opened: [1998, 6], source: '港鐵：東涌綫 1998 年 6 月 22 日通車' },
  { id: 'airportExpress', name: '機場快綫', stations: ['青衣', '機場'], opened: [1998, 7], source: '港鐵：機場快綫 1998 年 7 月 6 日通車' },
  { id: 'tseungKwanO', name: '將軍澳綫', stations: ['北角', '鰂魚涌', '油塘', '調景嶺', '將軍澳', '坑口', '寶琳'], opened: [2002, 8], source: '港鐵：將軍澳綫 2002 年 8 月 18 日通車' },
  { id: 'kwunTongTkl', name: '觀塘綫延至調景嶺', stations: ['藍田', '油塘', '調景嶺'], opened: [2002, 8], source: '港鐵：觀塘綫 2002 年 8 月延至調景嶺' },
  { id: 'westRail', name: '西鐵綫', stations: ['南昌', '美孚', '荃灣西', '錦上路', '元朗', '朗屏', '天水圍', '兆康', '屯門'], opened: [2003, 12], source: '九廣鐵路：西鐵 2003 年 12 月 20 日通車' },
  { id: 'eastRailTst', name: '東鐵綫尖沙咀延綫', stations: ['紅磡', '尖東'], opened: [2004, 10], source: '九廣鐵路：尖東站 2004 年 10 月 24 日啟用' },
  { id: 'maOnShan', name: '馬鞍山綫', stations: ['大圍', '車公廟', '沙田圍', '第一城', '石門', '大水坑', '恆安', '馬鞍山', '烏溪沙'], opened: [2004, 12], source: '九廣鐵路：馬鞍山綫 2004 年 12 月 21 日通車' },
  { id: 'disney', name: '迪士尼綫', stations: ['欣澳', '迪士尼'], opened: [2005, 8], source: '港鐵：迪士尼綫 2005 年 8 月 1 日通車' },
  { id: 'asiaWorldExpo', name: '機場快綫延至博覽館', stations: ['機場', '博覽館'], opened: [2005, 12], source: '港鐵：博覽館站 2005 年 12 月啟用' },
  { id: 'lokMaChau', name: '落馬洲支綫', stations: ['上水', '落馬洲'], opened: [2007, 8], source: '九廣鐵路：落馬洲支綫 2007 年 8 月 15 日通車' },
  { id: 'lohasPark', name: '將軍澳綫康城支綫', stations: ['將軍澳', '康城'], opened: [2009, 7], source: '港鐵：康城站 2009 年 7 月 26 日啟用' },
  { id: 'kowloonSouthern', name: '九龍南綫', stations: ['南昌', '柯士甸', '尖東'], opened: [2009, 8], source: '港鐵：九龍南綫 2009 年 8 月 16 日通車' },
  { id: 'islandWest', name: '西港島綫', stations: ['堅尼地城', '香港大學', '西營盤', '上環'], opened: [2014, 12], source: '港鐵：西港島綫 2014 年 12 月 28 日通車' },
  { id: 'kwunTongExtension', name: '觀塘綫延綫', stations: ['油麻地', '何文田', '黃埔'], opened: [2016, 10], source: '港鐵：觀塘綫延綫 2016 年 10 月 23 日通車' },
  { id: 'southIsland', name: '南港島綫', stations: ['金鐘', '海洋公園', '黃竹坑', '利東', '海怡半島'], opened: [2016, 12], source: '港鐵：南港島綫 2016 年 12 月 28 日通車' },
  { id: 'highSpeed', name: '高鐵香港段', stations: ['西九龍'], opened: [2018, 9], source: '港鐵：廣深港高鐵香港段 2018 年 9 月 23 日通車（全段在地底，只畫車站）' },
  { id: 'tuenMa1', name: '屯馬綫一期', stations: ['大圍', '顯徑', '鑽石山', '啟德'], opened: [2020, 2], source: '港鐵：屯馬綫一期 2020 年 2 月 14 日通車' },
  { id: 'tuenMa', name: '屯馬綫', stations: ['啟德', '宋皇臺', '土瓜灣', '何文田', '紅磡'], opened: [2021, 6], source: '港鐵：屯馬綫 2021 年 6 月 27 日全綫通車' },
  { id: 'eastRailHarbour', name: '東鐵綫過海段', stations: ['紅磡', '會展', '金鐘'], opened: [2022, 5], source: '港鐵：東鐵綫過海段 2022 年 5 月 15 日通車' },
]

// ---- Where a city that builds more than history could build ----

export interface CandidateSite {
  id: string
  name: string
  area: MapArea
  /** What the site becomes: housing, or land for one of the industries. */
  use: 'housing' | 'finance' | 'trade' | 'tourism' | 'professional'
  /** Earliest the site could be ready, if the city pushes for it. */
  earliest: YearMonth
  /** Only for the country park edge policy. */
  countryPark?: boolean
  source: string
}

/** Sites proposed in real plans but not built, or built later than a bolder city could have. */
export const CANDIDATE_SITES: CandidateSite[] = [
  { id: 'tungChungEastHousing', name: '東涌東', area: { polygon: [[812600, 816600], [815600, 816600], [815600, 818300], [812600, 818300]], kinds: ['construction'] }, use: 'housing', earliest: [2008, 1], source: '東涌新市鎮擴展研究（2012 年起）' },
  { id: 'kwuTungNorth', name: '古洞北', area: { polygon: [[827800, 839400], [831000, 839400], [831000, 841800], [827800, 841800]], kinds: ['construction', 'farm', 'logistics', 'village'] }, use: 'housing', earliest: [2003, 1], source: '新界東北新發展區規劃（1998 年研究，2013 年定案）' },
  { id: 'fanlingNorth', name: '粉嶺北', area: { polygon: [[831000, 839800], [834800, 839800], [834800, 841800], [831000, 841800]], kinds: ['construction', 'farm', 'logistics', 'village'] }, use: 'housing', earliest: [2003, 1], source: '新界東北新發展區規劃' },
  { id: 'hungShuiKiuHousing', name: '洪水橋', area: { polygon: [[816000, 830800], [819600, 830800], [819600, 833400], [816000, 833400]], kinds: ['construction', 'logistics', 'farm'] }, use: 'housing', earliest: [2005, 1], source: '洪水橋新發展區規劃研究（2011 年）' },
  { id: 'yuenLongSouth', name: '元朗南', area: { polygon: [[819600, 830500], [822600, 830500], [822600, 833200], [819600, 833200]], kinds: ['logistics', 'farm', 'construction'] }, use: 'housing', earliest: [2010, 1], source: '元朗南發展規劃研究（2012 年）' },
  { id: 'tko137', name: '將軍澳 137 區', area: { polygon: [[845600, 813800], [847800, 813800], [847800, 815600], [845600, 815600]], kinds: ['construction', 'otherUrban'] }, use: 'housing', earliest: [2005, 1], source: '將軍澳 137 區發展研究' },
  { id: 'kauYiChau', name: '交椅洲人工島', area: { polygon: [[825000, 813600], [828200, 813600], [828200, 816200], [825000, 816200]], kinds: ['sea'] }, use: 'housing', earliest: [2015, 1], source: '「明日大嶼願景」（2018 年施政報告）' },
  { id: 'sanTin', name: '新田科技城', area: { polygon: [[823000, 838000], [827000, 838000], [827000, 840800], [823000, 840800]], kinds: ['fishPond', 'farm', 'logistics', 'construction'] }, use: 'professional', earliest: [2010, 1], source: '北部都會區發展策略（2021 年）' },
  { id: 'kowloonEast', name: '九龍東商業區', area: { polygon: [[839800, 818600], [842000, 818600], [842000, 820600], [839800, 820600]], kinds: ['industrial'] }, use: 'finance', earliest: [2002, 1], source: '「起動九龍東」（2011 年施政報告）' },
  { id: 'tuenMunWest', name: '屯門西物流區', area: { polygon: [[807500, 825500], [811000, 825500], [811000, 828500], [807500, 828500]], kinds: ['sea', 'shrubGrass', 'barren'] }, use: 'trade', earliest: [2000, 1], source: '屯門西發展研究；龍鼓灘填海建議（2015 年）' },
  { id: 'sunnyBay', name: '欣澳旅遊區', area: { polygon: [[820300, 821000], [822200, 821000], [822200, 822600], [820300, 822600]], kinds: ['sea', 'shrubGrass'] }, use: 'tourism', earliest: [2005, 1], source: '欣澳填海建議（2014 年）' },
  { id: 'taiLamEdge', name: '大欖郊野公園邊陲', area: { polygon: [[826300, 826300], [828600, 826300], [828600, 828000], [826300, 828000]], kinds: ['woodland', 'shrubGrass'] }, use: 'housing', earliest: [1998, 1], countryPark: true, source: '2017 年施政報告：研究在郊野公園邊陲建屋' },
  { id: 'maOnShanEdge', name: '馬鞍山郊野公園邊陲', area: { polygon: [[839800, 826500], [841500, 826500], [841500, 828000], [839800, 828000]], kinds: ['woodland', 'shrubGrass'] }, use: 'housing', earliest: [1998, 1], countryPark: true, source: '2017 年施政報告：研究在郊野公園邊陲建屋' },
]

export interface CandidateStation {
  name: string
  e: number
  n: number
}

export interface CandidateRoute {
  id: string
  name: string
  /** Existing station names, or new stations defined here with approximate positions. */
  stations: (string | CandidateStation)[]
  earliest: YearMonth
  source: string
}

/** Lines proposed in real plans; a city that funds more rail than history opens them, in this order. */
export const CANDIDATE_ROUTES: CandidateRoute[] = [
  { id: 'hungShuiKiuStation', name: '洪水橋站', stations: ['天水圍', { name: '洪水橋', e: 817400, n: 832400 }, '兆康'], earliest: [2005, 1], source: '《鐵路發展策略 2014》' },
  { id: 'kwuTungStation', name: '古洞站', stations: ['上水', { name: '古洞', e: 829200, n: 840400 }, '落馬洲'], earliest: [2008, 1], source: '《鐵路發展策略 2014》；2027 年通車' },
  { id: 'tuenMunSouth', name: '屯門南延綫', stations: ['屯門', { name: '屯門南', e: 814500, n: 826200 }], earliest: [2008, 1], source: '《鐵路發展策略 2014》' },
  { id: 'tungChungExtension', name: '東涌綫延綫', stations: [{ name: '東涌西', e: 810600, n: 816200 }, '東涌', { name: '東涌東', e: 813800, n: 817300 }], earliest: [2010, 1], source: '《鐵路發展策略 2014》' },
  { id: 'eastKowloon', name: '東九龍綫', stations: ['鑽石山', { name: '彩雲', e: 840300, n: 822100 }, { name: '順利', e: 841300, n: 821100 }, { name: '秀茂坪', e: 842300, n: 820900 }, { name: '安達臣', e: 843400, n: 821300 }, '寶琳'], earliest: [2005, 1], source: '《鐵路發展策略 2014》' },
  { id: 'northernLink', name: '北環綫', stations: ['錦上路', { name: '牛潭尾', e: 825200, n: 836400 }, { name: '新田', e: 825600, n: 839400 }, { name: '古洞', e: 829200, n: 840400 }], earliest: [2010, 1], source: '《鐵路發展策略 2014》' },
  { id: 'southIslandWest', name: '南港島綫（西段）', stations: ['香港大學', { name: '華富', e: 830700, n: 812300 }, { name: '田灣', e: 832400, n: 811900 }, '黃竹坑'], earliest: [2012, 1], source: '《鐵路發展策略 2014》' },
  { id: 'northIsland', name: '北港島綫', stations: ['香港', '會展', '炮台山'], earliest: [2012, 1], source: '《鐵路發展策略 2014》' },
  { id: 'kauYiChauLink', name: '交椅洲鐵路', stations: ['欣澳', { name: '交椅洲', e: 826600, n: 815000 }, '香港大學'], earliest: [2018, 1], source: '「明日大嶼願景」（2018 年施政報告）' },
]

// ---- Regions for flat prices ----

/** The Rating and Valuation Department's regions, roughly; the rest of the map is the New Territories. */
export const PRICE_REGIONS: { id: 'hk' | 'kln'; name: string; polygon: [number, number][] }[] = [
  {
    id: 'hk',
    name: '港島',
    polygon: [[829300, 817300], [845000, 817300], [845000, 811000], [838000, 808500], [832000, 808500], [829300, 811000]],
  },
  {
    id: 'kln',
    name: '九龍',
    polygon: [
      [831700, 821300], [832600, 823200], [835000, 823900], [838500, 823800], [841500, 823300], [843600, 821500],
      [843300, 818000], [842500, 817300], [835500, 817300], [834000, 817400], [832800, 818800], [831700, 820500],
    ],
  },
]
