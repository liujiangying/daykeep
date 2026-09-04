declare module 'lunar-javascript' {
  export class Solar {
    static fromYmd(y: number, m: number, d: number): Solar
    getYear(): number
    getMonth(): number
    getDay(): number
    getLunar(): Lunar
    toYmd(): string
  }
  export class Lunar {
    static fromYmd(y: number, m: number, d: number): Lunar
    getYear(): number
    getMonth(): number
    getDay(): number
    getMonthInChinese(): string
    getDayInChinese(): string
    getSolar(): Solar
    toString(): string
  }
  export class LunarYear {
    static fromYear(y: number): LunarYear
    getMonths(): LunarMonth[]
  }
  export class LunarMonth {
    getYear(): number
    getMonth(): number
    getDayCount(): number
  }
}
