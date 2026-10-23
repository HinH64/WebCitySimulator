import type { CitizenState, CitizenView } from '../engine/citizens'
import { monthIndex, monthOf, yearOf } from '../engine/time'
import type { AreaId, Place } from '../engine/types'
import { PLACES } from './places'

/**
 * People the player follows through the term, like 8 Billion Lives follows one life. Each story moves on
 * the city's own figures and decisions (CitizenView), never on real history, and never changes the city.
 * The end screen replays the same story on real Hong Kong's figures to compare.
 */

export interface Citizen {
  id: string
  /** Name as the news tags them. */
  name: string
  /** Who they are, in a few words, for the introduction and the end screen. */
  who: string
  area: AreaId
  start: [number, number]
  place: Place
  /** One month of the story: what happens, said as lines for the news. */
  step(st: CitizenState, v: CitizenView, say: (text: string, place?: Place) => void, rand: () => number): void
  /**
   * A line for a year without news, while the person is waiting for something (a flat, a job, a place);
   * nothing once they have settled, so the news does not repeat itself.
   */
  quiet(st: CitizenState, v: CitizenView): string | undefined
  /** How it turned out, in a few words. */
  summary(st: CitizenState): string
}

const one = new Intl.NumberFormat('zh-HK', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const years = (months: number) => one.format(months / 12)
const at = (y: number, m: number) => monthIndex(y, m)

/** The next of a story's waiting lines, in turn, so none repeats until all have been used. */
function inTurn(st: CitizenState, lines: string[]): string {
  st.n.quiet = (st.n.quiet ?? -1) + 1
  return lines[st.n.quiet % lines.length]
}

/** Months to find a job at this unemployment rate, as a pace: a month at 3.5%, about eight at 8%. */
const jobPace = (unemployment: number) => 1 / Math.min(18, Math.max(1, 1.5 * (unemployment - 2.5)))

function employer(v: CitizenView): string {
  if (v.m.professionalShare >= 14) return '一間科技公司'
  if (v.m.sectors.finance >= 0.16) return '一間銀行'
  return '一間貿易公司'
}

/** Where a family housed in a given year would most likely be sent. */
function estate(t: number): { name: string; place: Place } {
  const year = yearOf(t)
  if (year < 2012) return { name: '東涌', place: PLACES.tungChung }
  if (year < 2018) return { name: '觀塘安達臣道', place: PLACES.kwunTong }
  return { name: '啟德', place: PLACES.kaiTak }
}

export const CITIZENS: Citizen[] = [
  {
    id: 'subdivided',
    name: '陳家',
    who: '深水埗劏房的一家四口',
    area: 'housing',
    start: [2009, 1],
    place: PLACES.shamShuiPo,
    step(st, v, say) {
      if (st.stage === 'start') {
        say(`陳家四口住在深水埗一間不足 100 平方呎的劏房，剛遞交公屋申請。公屋平均輪候 ${one.format(v.m.prhWait)} 年。`)
        st.stage = 'waiting'
        st.since = v.t
      } else if (st.stage === 'waiting' && v.t - st.since >= v.m.prhWait * 12) {
        // The queue moves at the pace of the city's average wait at the time.
        const home = estate(v.t)
        st.n.wait = v.t - st.since
        say(`陳家輪候了 ${years(st.n.wait)} 年，終於上樓，搬進${home.name}的新公屋，兩個女兒第一次有自己的房間。`, home.place)
        st.stage = 'housed'
        st.since = v.t
      } else if (st.stage === 'housed' && v.t - st.since >= 12) {
        say(v.m.postSecondary >= 30 ? '陳家大女兒考上大學，是家中第一個大學生。' : '陳家大女兒中學畢業後讀副學士，晚上兼職幫補家計。')
        st.done = true
      }
    },
    quiet: (st, v) =>
      st.stage === 'waiting'
        ? `陳家輪候公屋第 ${Math.floor((v.t - st.since) / 12) + 1} 年，${inTurn(st, ['劏房租金又加了', '單位沒有窗，夏天熱得要整晚開風扇', '兩個女兒在床上做功課', '附近又有劏房發生火警，陳太很擔心'])}。平均輪候時間現在是 ${one.format(v.m.prhWait)} 年。`
        : undefined,
    summary: (st) => (st.n.wait !== undefined ? `輪候 ${years(st.n.wait)} 年，${yearOf(st.since)} 年上樓` : '到任期完結仍在輪候公屋'),
  },
  {
    id: 'graduate',
    name: '阿欣',
    who: '2003 年畢業的大學生',
    area: 'jobs',
    start: [2003, 7],
    place: PLACES.hku,
    step(st, v, say) {
      if (st.stage === 'start') {
        say(`阿欣大學畢業，碰上 SARS 後的經濟低迷，開始找工作。失業率 ${one.format(v.m.unemployment)}%。`)
        st.stage = 'searching'
        st.since = v.t
        st.n.progress = 0
      } else if (st.stage === 'searching') {
        st.n.progress += jobPace(v.m.unemployment)
        if (st.n.progress >= 1) {
          st.n.searched = v.t - st.since + 1
          say(`阿欣找了 ${st.n.searched} 個月，終於在${employer(v)}找到全職工作。`)
          st.stage = 'working'
        }
      } else if (st.stage === 'working' && v.t === at(2010, 1)) {
        say(v.m.professionalShare >= 13 ? '阿欣轉職到一間創科公司，人工加了三成。' : '阿欣升職做主任，開始儲錢買樓。')
      } else if (st.stage === 'working' && v.t === at(2020, 7)) {
        if (v.migration12 <= -4) say('身邊不少朋友移民，阿欣考慮了很久，最後決定留在香港。')
        else if (v.m.unemployment >= 5) say('疫情下公司裁員，阿欣幸運保住工作，改為在家工作。')
        else say('疫情下阿欣改為在家工作，多了時間陪家人。')
        st.done = true
      }
    },
    quiet: (st, v) =>
      st.stage === 'searching'
        ? `阿欣找了 ${v.t - st.since + 1} 個月工作，${inTurn(st, ['寄出過百封求職信，暫時做兼職', '去了十幾次面試都沒有消息', '在快餐店做兼職，晚上繼續找工'])}。失業率 ${one.format(v.m.unemployment)}%。`
        : undefined,
    summary: (st) => (st.n.searched !== undefined ? `找了 ${st.n.searched} 個月才找到全職工作` : '到任期完結仍未找到全職工作'),
  },
  {
    id: 'elderly',
    name: '黃婆婆',
    who: '北角獨居長者',
    area: 'care',
    start: [2010, 1],
    place: PLACES.northPoint,
    step(st, v, say) {
      if (st.stage === 'start') {
        say(`80 歲的黃婆婆獨居北角唐樓，行動愈來愈不便，社工幫她申請資助安老院舍宿位。每千名長者有 ${Math.round(v.m.carePerThousandElderly)} 個病床及宿位。`)
        st.stage = 'waiting'
        st.since = v.t
        st.n.progress = 0
      } else if (st.stage === 'waiting') {
        // About two and a half years at 67 places per thousand elders, four years at 40.
        st.n.progress += v.m.carePerThousandElderly / 2000
        if (st.n.progress >= 1) {
          st.n.wait = v.t - st.since + 1
          say(`黃婆婆輪候了 ${years(st.n.wait)} 年，終於入住資助安老院舍，有護理員日夜照顧。`)
          st.stage = 'placed'
          st.since = v.t
        }
      } else if (st.stage === 'placed' && v.t - st.since >= 12) {
        say('黃婆婆在院舍慶祝生日，院友和職員一起為她唱生日歌。')
        st.done = true
      }
    },
    quiet: (st, v) =>
      st.stage === 'waiting'
        ? `黃婆婆輪候宿位第 ${Math.floor((v.t - st.since) / 12) + 1} 年，${inTurn(
            st,
            v.m.carePerThousandElderly < 45
              ? ['在家跌倒，等了一晚才被鄰居發現', '女兒每晚下班後趕來照顧她，身心俱疲', '一個人在家，連洗澡也有困難']
              : ['靠社區中心送飯和社工探訪', '每星期到長者中心做運動', '女兒週末來陪她飲茶'],
          )}。`
        : undefined,
    summary: (st) => (st.n.wait !== undefined ? `輪候 ${years(st.n.wait)} 年入住資助院舍` : '到任期完結仍在輪候院舍宿位'),
  },
  {
    id: 'commuter',
    name: '梁先生',
    who: '住在天水圍、在中環上班',
    area: 'transport',
    start: [2001, 1],
    place: PLACES.tinShuiWai,
    step(st, v, say) {
      if (st.stage === 'start') {
        say('梁先生一家搬進天水圍的新公屋。他每天坐巴士到中環上班，單程要一個半小時。')
        st.stage = 'bus'
      } else if (st.stage === 'bus' && v.line('westRail')) {
        st.n.railAt = v.t
        say('西鐵通車，梁先生改坐鐵路上班，單程縮短到一小時左右，終於趕得及回家吃晚飯。', PLACES.tinShuiWai)
        st.stage = 'rail'
      } else if (st.stage === 'bus' && v.t === at(2003, 12)) {
        say('西鐵未能如期通車，梁先生繼續每天坐一個半小時巴士上班。')
      } else if (st.stage === 'rail' && st.n.south === undefined && v.line('kowloonSouthern')) {
        st.n.south = v.t
        say('九龍南綫通車，西鐵接通東鐵，梁先生的太太可以由天水圍直達尖沙咀上班。', PLACES.austin)
      } else if (st.stage === 'rail' && v.line('tuenMa') && v.t >= at(2016, 1)) {
        say('屯馬綫全綫通車，梁先生的女兒到何文田上大學，不用再轉車。', PLACES.hoManTin)
        st.done = true
      } else if (st.stage === 'rail' && v.t >= at(2024, 1)) {
        say('梁先生退休了，留在天水圍安享晚年。')
        st.done = true
      }
    },
    quiet: (st, v) =>
      st.stage === 'bus'
        ? `梁先生每天花三小時通勤，${inTurn(st, [v.m.railPerMillion < 26 ? '屯門公路經常塞車' : '巴士經常脫班', '很少見到孩子', '早上六點就要出門'])}。`
        : undefined,
    summary: (st) =>
      st.n.railAt !== undefined ? `西鐵 ${yearOf(st.n.railAt)} 年 ${monthOf(st.n.railAt)} 月通車，通勤由一個半小時縮短到約一小時` : '任期內西鐵沒有通車，一直坐巴士通勤',
  },
  {
    id: 'shop',
    name: '何生',
    who: '尖沙咀小店老闆',
    area: 'jobs',
    start: [1997, 7],
    place: PLACES.tsimShaTsui,
    step(st, v, say) {
      const tourism = v.m.sectors.tourism
      if (st.stage === 'start') {
        say('何生在尖沙咀經營一間小電器店，主要做遊客生意。')
        st.stage = 'open'
        st.n.tourism = tourism
        st.n.price = v.m.priceIndex
        st.n.bad = 0
        return
      }
      // Business is weighed each July, on how tourism and rents did over the year.
      if (st.stage !== 'open' || monthOf(v.t) !== 7 || v.t === st.since) return
      const change = tourism / st.n.tourism
      const rentUp = v.m.priceIndex / st.n.price
      st.n.tourism = tourism
      st.n.price = v.m.priceIndex
      if (change < 0.88) {
        if (v.flag('ess') === 'ess' && yearOf(v.t) >= 2020 && yearOf(v.t) <= 2022) {
          st.n.relief = 1
          say('旅客大減，幸好保就業計劃資助員工薪金，何生咬緊牙關撐下去。')
          return
        }
        st.n.bad++
        if (st.n.bad >= 2) {
          st.n.closed = v.t
          say('連續兩年旅客大減，何生撐不下去，經營多年的小店結業。')
          st.stage = 'closed'
          st.done = true
        } else say('旅客大減，何生的店生意跌了三成，要減少人手。')
      } else {
        st.n.bad = 0
        if (change > 1.08) say(tourism > 0.035 && yearOf(v.t) >= 2023 ? '通關後旅客回來了，何生的店重新熱鬧起來。' : '旅客多了，何生的店生意興旺，請多了兩個店員。')
        else if (rentUp > 1.2) say('業主要加租三成，何生的利潤被蠶食，考慮搬到樓上舖。')
      }
    },
    quiet: () => undefined,
    summary: (st) =>
      st.n.closed !== undefined ? `${yearOf(st.n.closed)} 年結業` : `小店撐到任期完結${st.n.relief ? '，疫情時靠保就業計劃渡過難關' : ''}`,
  },
  {
    id: 'couple',
    name: '張生張太',
    who: '想買樓的新婚夫婦',
    area: 'housing',
    start: [2008, 1],
    place: PLACES.maOnShan,
    step(st, v, say) {
      if (st.stage === 'start') {
        say('張生張太剛結婚，暫住馬鞍山的父母家，想儲首期買樓。')
        st.stage = 'saving'
        st.n.ballots = 0
        return
      }
      if (st.stage === 'owner' && v.t - st.since >= 12) {
        say('張生張太的兒子出世，一家人在新居安頓下來。')
        st.done = true
        return
      }
      // Each January from 2010 they look at the market again.
      if (st.stage !== 'saving' || monthOf(v.t) !== 1 || v.t < at(2010, 1)) return
      const year = yearOf(v.t)
      if (year >= 2015 && v.migration12 <= -4) {
        say('看到身邊朋友陸續移民，又一直買不起樓，張生張太決定移居外地。')
        st.n.left = v.t
        st.stage = 'left'
        st.done = true
      } else if (v.m.affordability <= 115) {
        say('樓價回落到負擔得起，張生張太終於在馬鞍山買了第一個單位。')
        st.n.bought = v.t
        st.stage = 'owner'
        st.since = v.t
      } else if (v.policy('hos') === 'on' && year >= 2014) {
        st.n.ballots++
        if (st.n.ballots >= 3) {
          say('張生張太第三次申請居屋，終於抽中，一家人搬進新居屋。')
          st.n.hos = v.t
          st.stage = 'owner'
          st.since = v.t
        } else say(`張生張太申請居屋，可惜第 ${st.n.ballots} 次也落空。`)
      } else if (year === 2010) say('樓價又升了，張生張太的首期仍然不夠，搬出來租了一個小單位。')
      else say(inTurn(st, ['樓價又升了，張生張太的首期仍然不夠。', '業主加租，張生張太的儲蓄計劃又要延後。', '張生張太睇了十幾個樓盤，全部都負擔不起。']))
    },
    quiet: () => undefined,
    summary(st) {
      if (st.n.hos !== undefined) return `${yearOf(st.n.hos)} 年抽中居屋`
      if (st.n.bought !== undefined) return `${yearOf(st.n.bought)} 年買樓`
      if (st.n.left !== undefined) return `${yearOf(st.n.left)} 年移居外地`
      return '一直買不起樓，繼續租樓'
    },
  },
  {
    id: 'student',
    name: '阿浩',
    who: '新高中學制的第一屆學生',
    area: 'education',
    start: [2009, 9],
    place: PLACES.yuenLong,
    step(st, v, say, rand) {
      if (st.stage === 'start') {
        // Where he stands in his year: the share of the year doing better.
        st.n.rank = 0.2 + rand() * 0.3
        say('阿浩升上中四，是新高中學制的第一屆學生，目標是考上大學。')
        st.stage = 'school'
      } else if (st.stage === 'school' && v.t === at(2012, 7)) {
        if (st.n.rank < Math.min(0.9, Math.max(0.05, (v.m.postSecondary - 15) / 40))) {
          say('文憑試放榜，阿浩考入大學讀工程。')
          st.n.university = v.t
          st.stage = 'university'
          st.since = v.t
        } else {
          say('文憑試放榜，阿浩差少少分，未能入讀資助學士學位，改讀副學士。')
          st.stage = 'associate'
          st.since = v.t
        }
      } else if (st.stage === 'associate' && v.t === at(2014, 7)) {
        if (st.n.rank < Math.min(0.9, Math.max(0.05, (v.m.postSecondary - 10) / 40))) {
          say('阿浩的副學士成績優異，銜接上大學的學士課程。')
          st.n.topUp = v.t
          st.stage = 'university'
          st.since = v.t
        } else {
          say('阿浩副學士畢業後出來工作，在一間公司做文員。')
          st.stage = 'working'
        }
      } else if (st.stage === 'university' && v.t - st.since >= (st.n.topUp !== undefined ? 24 : 48)) {
        say('阿浩大學畢業，開始找工作。')
        st.stage = 'searching'
        st.since = v.t
        st.n.progress = 0
      } else if (st.stage === 'searching') {
        st.n.progress += jobPace(v.m.unemployment)
        if (st.n.progress >= 1) {
          say(`阿浩找了 ${v.t - st.since + 1} 個月，加入${employer(v)}。`)
          st.stage = 'working'
        }
      } else if (st.stage === 'working' && v.t >= at(2021, 1)) {
        say(v.m.professionalShare >= 14.5 ? '阿浩轉到一間創科公司做工程師。' : '阿浩在公司升職，開始儲錢。')
        st.done = true
      }
    },
    quiet(st) {
      if (st.stage === 'school') return inTurn(st, ['阿浩每晚溫習到深夜，週末還要上補習班。', '阿浩參加了學校的機械人學會。'])
      if (st.stage === 'university' || st.stage === 'associate') return inTurn(st, ['阿浩一邊讀書一邊在便利店兼職。', '阿浩暑假去工程公司實習。', '阿浩搬進宿舍，認識了來自各區的同學。'])
      if (st.stage === 'searching') return '阿浩還在找工作，每天上網看招聘廣告。'
      return undefined
    },
    summary(st) {
      if (st.n.university !== undefined) return '文憑試後直接考入大學'
      if (st.n.topUp !== undefined) return '先讀副學士，再銜接上大學'
      return '讀副學士後出來工作'
    },
  },
]

export const CITIZEN_BY_ID: Record<string, Citizen> = Object.fromEntries(CITIZENS.map((c) => [c.id, c]))
