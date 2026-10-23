/**
 * Landmarks on the map (docs/SPATIAL.md section 4). Real ones open in their real month when the city keeps
 * up with history in what they need, later when it catches up, and never if it does not. Site landmarks
 * stand for the city's own developments on candidate sites once enough of the site is built.
 *
 * Places are Hong Kong 1980 Grid metres, converted from latitude and longitude (WGS84, to about 50 m) or
 * taken from the nearest station, and moved onto the nearest land cell of the 250 m grid where needed.
 */

import type { Place } from '../engine/types'
import type { TileKind, YearMonth } from './mapProjects'
import type { SectorId } from './sectors'

/** What a city has to keep up with history in for a real landmark to open on time. */
export type LandmarkNeed =
  | { kind: 'none' }
  | { kind: 'sector'; sector: SectorId }
  | { kind: 'green' }
  | { kind: 'mobility' }
  /** The railway line it serves: it opens with the line, which the railway rules already report. */
  | { kind: 'route'; route: string }
  /** Net reserves: a public showpiece waits while the city has far less money than real Hong Kong. */
  | { kind: 'reserves' }

export type LandmarkShape =
  | 'terminal' | 'skyscraper' | 'supertall' | 'campus' | 'castle' | 'wetland' | 'cableBridge' | 'cruise'
  | 'station' | 'port' | 'museum' | 'stadium' | 'cbd' | 'techCampus' | 'logisticsHub' | 'attraction' | 'offices'

export interface RealLandmark {
  id: string
  name: string
  place: Place
  opened: YearMonth
  /** 開幕, 啟用, 落成, 通車 or 開放. */
  verb: string
  need: LandmarkNeed
  /** Earlier decisions it depends on, as an event's `requires`; without them it is never built. */
  requires?: Record<string, string[]>
  shape: LandmarkShape
  source: string
}

export const REAL_LANDMARKS: RealLandmark[] = [
  { id: 'airport', name: '新機場客運大樓', place: [811500, 819678], opened: [1998, 7], verb: '啟用', need: { kind: 'none' }, shape: 'terminal', source: '機場管理局：香港國際機場 1998 年 7 月 6 日啟用（1997 年前已動工）' },
  { id: 'sciencePark', name: '香港科學園', place: [839811, 831911], opened: [2002, 6], verb: '啟用', need: { kind: 'sector', sector: 'professional' }, shape: 'campus', source: '政府新聞公報（2004 年 10 月 29 日）：第一期首三座大樓 2002 年 6 月啟用' },
  { id: 'ifc2', name: '國際金融中心二期', place: [834445, 816234], opened: [2003, 7], verb: '落成', need: { kind: 'sector', sector: 'finance' }, shape: 'skyscraper', source: '港鐵公司 2003 年報（Form 20-F）：2003 年 7 月 15 日實際完工；10 月 18 日開幕' },
  { id: 'disneyland', name: '香港迪士尼樂園', place: [822300, 819324], opened: [2005, 9], verb: '開幕', need: { kind: 'sector', sector: 'tourism' }, requires: { disney: ['build'] }, shape: 'castle', source: '華特迪士尼公司：2005 年 9 月 12 日開幕' },
  { id: 'wetlandPark', name: '香港濕地公園', place: [818879, 836610], opened: [2006, 5], verb: '開放', need: { kind: 'green' }, shape: 'wetland', source: '香港濕地公園：2006 年 5 月 20 日開放；政府新聞公報（2006 年 5 月 3 日）' },
  { id: 'stonecutters', name: '昂船洲大橋', place: [830300, 820747], opened: [2009, 12], verb: '通車', need: { kind: 'mobility' }, shape: 'cableBridge', source: '路政署：昂船洲大橋 2009 年 12 月 20 日通車' },
  { id: 'icc', name: '環球貿易廣場', place: [834541, 818261], opened: [2010, 12], verb: '落成', need: { kind: 'sector', sector: 'finance' }, shape: 'supertall', source: '維基百科「環球貿易廣場」及 CTBUH 高層建築資料庫：2010 年落成（未有可靠月份，用年底）' },
  { id: 'cruiseTerminal', name: '啟德郵輪碼頭', place: [840125, 818625], opened: [2013, 6], verb: '啟用', need: { kind: 'sector', sector: 'tourism' }, shape: 'cruise', source: '旅遊事務署（2013 年 6 月 5 日）；首艘郵輪 2013 年 6 月 12 日停泊' },
  { id: 'xrlStation', name: '高鐵西九龍站', place: [835031, 818376], opened: [2018, 9], verb: '通車', need: { kind: 'route', route: 'highSpeed' }, requires: { tenProjects: ['all'] }, shape: 'station', source: '港鐵：廣深港高鐵香港段 2018 年 9 月 23 日通車' },
  { id: 'hzmbPort', name: '港珠澳大橋香港口岸', place: [813875, 819625], opened: [2018, 10], verb: '啟用', need: { kind: 'reserves' }, requires: { tenProjects: ['all'] }, shape: 'port', source: '路政署：港珠澳大橋 2018 年 10 月 24 日通車' },
  { id: 'mPlus', name: 'M+', place: [834375, 817875], opened: [2021, 11], verb: '開幕', need: { kind: 'reserves' }, shape: 'museum', source: '維基百科「M+」：2021 年 11 月 12 日開幕' },
  { id: 'kaiTakSports', name: '啟德體育園', place: [839000, 820200], opened: [2025, 3], verb: '開幕', need: { kind: 'reserves' }, shape: 'stadium', source: '香港電台（2025 年 2 月 4 日）：主場館 2025 年 3 月 1 日開幕' },
]

/** The city's own developments that get a landmark once enough of the candidate site is built. */
export interface SiteLandmark {
  site: string
  name: string
  /** Kinds that count as built on the site. */
  kinds: TileKind[]
  shape: LandmarkShape
}

export const SITE_LANDMARKS: SiteLandmark[] = [
  { site: 'kowloonEast', name: '九龍東商業區', kinds: ['commercial'], shape: 'offices' },
  { site: 'kauYiChauCore', name: '交椅洲核心商業區', kinds: ['commercial'], shape: 'cbd' },
  { site: 'sanTin', name: '新田科技城', kinds: ['sciencePark'], shape: 'techCampus' },
  { site: 'tuenMunWest', name: '屯門西物流區', kinds: ['logistics', 'port'], shape: 'logisticsHub' },
  { site: 'sunnyBay', name: '欣澳旅遊區', kinds: ['park', 'commercial'], shape: 'attraction' },
]
