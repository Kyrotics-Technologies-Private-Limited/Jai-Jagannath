"use client"

import { useEffect, useState } from "react"
import { Download, Play, Maximize2, Filter } from "lucide-react"
import { Button } from "./components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card"
import { Input } from "./components/ui/input"
import { auth, db } from "./lib/firebase"
import { onAuthStateChanged, type User } from "firebase/auth"
import { onValue, ref } from "firebase/database"

function App() {
  const [dateRange, setDateRange] = useState("2023-10-01 to 2033-26")
  const [timeRange, setTimeRange] = useState("10:23 0:0 to 126:26")
  const [filterType, setFilterType] = useState("today")
  const [user, setUser] = useState<User | null>(null)
  
  const [currentlyInside, setCurrentlyInside] = useState<number | null>(null)
  const [lastUpdateTs, setLastUpdateTs] = useState<number | null>(null)

  const [liveMinuteCount, setLiveMinuteCount] = useState<number | null>(null)
  const [lastHourCount, setLastHourCount] = useState<number | null>(null)
  const [todaysTotal, setTodaysTotal] = useState<number | null>(null)
  const [monthlyTotal, setMonthlyTotal] = useState<number | null>(null)
  const [yesterdaysTotal, setYesterdaysTotal] = useState<number | null>(null)
  const [yearlyTotal, setYearlyTotal] = useState<number | null>(null)
  const TARGET_YEAR = 2025

  // Date-wise filtering (IST only)
  const [dailyEntrance, setDailyEntrance] = useState<any | null>(null)
  const [filterStartDate, setFilterStartDate] = useState<string>(() => {
    const ms = Date.now() - 6 * 86400000
    const { year, month, day } = getTZParts(ms, "Asia/Kolkata")
    return `${year}-${month}-${day}`
  })
  const [filterEndDate, setFilterEndDate] = useState<string>(() => {
    const { year, month, day } = getTZParts(Date.now(), "Asia/Kolkata")
    return `${year}-${month}-${day}`
  })
  const [filteredDaily, setFilteredDaily] = useState<Array<{ ms: number; label: string; count: number | null }>>([])
  const [filteredTotal, setFilteredTotal] = useState<number>(0)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u)
    })
    return () => unsubscribe()
  }, [])

  // Subscribe to live occupancy and last update timestamp
  useEffect(() => {
    const r = ref(db, "live")
    const unsubscribe = onValue(r, (snapshot) => {
      const v = snapshot.val() || {}
      const occ = typeof v.occupancy === "number" ? v.occupancy : Number(v.occupancy)
      setCurrentlyInside(Number.isFinite(occ) ? occ : null)
      const ts = typeof v.lastUpdateTs === "number" ? v.lastUpdateTs : Number(v.lastUpdateTs)
      setLastUpdateTs(Number.isFinite(ts) ? ts : null)
    })
    return () => unsubscribe()
  }, [])

  // Subscribe to aggregates for entrance
  useEffect(() => {
    const dailyRef = ref(db, "aggregates/daily/entrance")
    const unsubDaily = onValue(dailyRef, (snap) => {
      const dailyObj = snap.val()
      setDailyEntrance(dailyObj)
      setTodaysTotal(getDailyForTZDate(dailyObj, 0))
      setYesterdaysTotal(getDailyForTZDate(dailyObj, -1))
      const gen = generateDayWiseData(filterStartDate, filterEndDate, dailyObj)
      setFilteredDaily(gen.list)
      setFilteredTotal(gen.total)
    })

    const hourlyRef = ref(db, "aggregates/hourly/entrance")
    const unsubHourly = onValue(hourlyRef, (snap) => {
      setLastHourCount(pickLatest4Level(snap.val()))
    })

    const minutelyRef = ref(db, "aggregates/minutely/entrance")
    const unsubMinutely = onValue(minutelyRef, (snap) => {
      setLiveMinuteCount(pickLatest5Level(snap.val()))
    })

    const monthlyRef = ref(db, "aggregates/monthly/entrance")
    const unsubMonthly = onValue(monthlyRef, (snap) => {
      setMonthlyTotal(pickLatest2Level(snap.val()))
    })

    const yearlyRef = ref(db, "aggregates/yearly/entrance")
    const unsubYearly = onValue(yearlyRef, (snap) => {
      const obj = snap.val() || {}
      const val = obj?.[String(TARGET_YEAR)]
      setYearlyTotal(typeof val === "number" ? val : Number(val) || null)
    })

    return () => {
      unsubDaily()
      unsubHourly()
      unsubMinutely()
      unsubMonthly()
      unsubYearly()
    }
  }, [])

  useEffect(() => {
    const gen = generateDayWiseData(filterStartDate, filterEndDate, dailyEntrance)
    setFilteredDaily(gen.list)
    setFilteredTotal(gen.total)
  }, [dailyEntrance, filterStartDate, filterEndDate])

  function formatAsiaKolkata(ts: number | null): string {
    if (!ts) return "—"
    const ms = ts < 1e12 ? ts * 1000 : ts
    const d = new Date(ms)
    const dateStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "long",
      day: "2-digit",
    }).format(d)
    const timeStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d)
    return `${dateStr} | ${timeStr}`
  }

  // Helpers to pick latest numbers from nested objects
  function pickLatest1Level(obj: any): number | null {
    if (!obj || typeof obj !== "object") return null
    const keys = Object.keys(obj)
    if (!keys.length) return null
    const latestKey = keys.sort((a, b) => Number(a) - Number(b)).at(-1) as string
    const val = obj[latestKey]
    return typeof val === "number" ? val : Number(val) || null
  }

  function pickLatest2Level(obj: any): number | null {
    if (!obj) return null
    const yearKeys = Object.keys(obj)
    if (!yearKeys.length) return null
    const latestYear = yearKeys.sort((a, b) => Number(a) - Number(b)).at(-1) as string
    const monthObj = obj[latestYear]
    if (!monthObj) return null
    const monthKeys = Object.keys(monthObj)
    if (!monthKeys.length) return null
    const latestMonth = monthKeys.sort((a, b) => Number(a) - Number(b)).at(-1) as string
    const val = monthObj[latestMonth]
    return typeof val === "number" ? val : Number(val) || null
  }

  function pickLatest2LevelWeek(obj: any): number | null {
    if (!obj) return null
    const yearKeys = Object.keys(obj)
    if (!yearKeys.length) return null
    const latestYear = yearKeys.sort((a, b) => Number(a) - Number(b)).at(-1) as string
    const weekObj = obj[latestYear]
    if (!weekObj) return null
    const weekKeys = Object.keys(weekObj)
    if (!weekKeys.length) return null
    // weeks are like "W38"; compare numerically
    const latestWeek = weekKeys
      .sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")))
      .at(-1) as string
    const val = weekObj[latestWeek]
    return typeof val === "number" ? val : Number(val) || null
  }

  function getTZParts(ms: number, tz: string) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms))
    const year = parts.find((p) => p.type === "year")?.value || ""
    const month = parts.find((p) => p.type === "month")?.value || ""
    const day = parts.find((p) => p.type === "day")?.value || ""
    return { year, month, day }
  }

  function getDailyForTZDate(dailyObj: any, dayOffset: number): number | null {
    if (!dailyObj) return null
    const baseMs = Date.now() + dayOffset * 86400000
    const { year, month, day } = getTZParts(baseMs, "Asia/Kolkata")
    const y = dailyObj?.[year]
    const m = y?.[month]
    const v = m?.[day]
    return typeof v === "number" ? v : Number(v) || null
  }

  function msAtStartOfIST(dateStr: string): number {
    // dateStr in format YYYY-MM-DD
    return new Date(`${dateStr}T00:00:00+05:30`).getTime()
  }

  function generateDayWiseData(
    startStr: string,
    endStr: string,
    dailyObj: any,
  ): { list: Array<{ ms: number; label: string; count: number | null }>; total: number } {
    if (!dailyObj || !startStr || !endStr) return { list: [], total: 0 }
    let start = msAtStartOfIST(startStr)
    let end = msAtStartOfIST(endStr)
    if (Number.isNaN(start) || Number.isNaN(end)) return { list: [], total: 0 }
    if (start > end) {
      const t = start
      start = end
      end = t
    }
    const out: Array<{ ms: number; label: string; count: number | null }> = []
    let total = 0
    for (let ms = start; ms <= end; ms += 86400000) {
      const { year, month, day } = getTZParts(ms, "Asia/Kolkata")
      const val = dailyObj?.[year]?.[month]?.[day]
      const count = typeof val === "number" ? val : Number(val) || null
      if (typeof count === "number") total += count
      out.push({ ms, label: formatDateAsiaKolkata(ms), count })
    }
    return { list: out, total }
  }

  function getOrdinalSuffix(n: number): string {
    const mod100 = n % 100
    if (mod100 >= 11 && mod100 <= 13) return "th"
    switch (n % 10) {
      case 1:
        return "st"
      case 2:
        return "nd"
      case 3:
        return "rd"
      default:
        return "th"
    }
  }

  function formatDateAsiaKolkata(ms: number): string {
    const { month, day } = getTZParts(ms, "Asia/Kolkata")
    const dayNum = Number(day)
    const suffix = getOrdinalSuffix(dayNum)
    const monthNames: Record<string, string> = {
      "01": "Jan",
      "02": "Feb",
      "03": "Mar",
      "04": "Apr",
      "05": "May",
      "06": "Jun",
      "07": "Jul",
      "08": "Aug",
      "09": "Sept",
      "10": "Oct",
      "11": "Nov",
      "12": "Dec",
    }
    return `${dayNum}${suffix} ${monthNames[month] || month}`
  }

  function onApplyRange() {
    const gen = generateDayWiseData(filterStartDate, filterEndDate, dailyEntrance)
    setFilteredDaily(gen.list)
    setFilteredTotal(gen.total)
  }

  function pickLatest3Level(obj: any): number | null {
    if (!obj) return null
    const yearKeys = Object.keys(obj)
    if (!yearKeys.length) return null
    const latestYear = yearKeys.sort((a, b) => Number(a) - Number(b)).at(-1) as string
    const monthObj = obj[latestYear]
    if (!monthObj) return null
    const monthKeys = Object.keys(monthObj)
    if (!monthKeys.length) return null
    const latestMonth = monthKeys.sort((a, b) => Number(a) - Number(b)).at(-1) as string
    const dayObj = monthObj[latestMonth]
    if (!dayObj) return null
    const dayKeys = Object.keys(dayObj)
    if (!dayKeys.length) return null
    const latestDay = dayKeys.sort((a, b) => Number(a) - Number(b)).at(-1) as string
    const val = dayObj[latestDay]
    return typeof val === "number" ? val : Number(val) || null
  }

  function pickLatest4Level(obj: any): number | null {
    if (!obj) return null
    const yearKeys = Object.keys(obj)
    if (!yearKeys.length) return null
    const latestYear = yearKeys.sort((a, b) => Number(a) - Number(b)).at(-1) as string
    const monthObj = obj[latestYear]
    if (!monthObj) return null
    const monthKeys = Object.keys(monthObj)
    if (!monthKeys.length) return null
    const latestMonth = monthKeys.sort((a, b) => Number(a) - Number(b)).at(-1) as string
    const dayObj = monthObj[latestMonth]
    if (!dayObj) return null
    const dayKeys = Object.keys(dayObj)
    if (!dayKeys.length) return null
    const latestDay = dayKeys.sort((a, b) => Number(a) - Number(b)).at(-1) as string
    const hourObj = dayObj[latestDay]
    if (!hourObj) return null
    const hourKeys = Object.keys(hourObj)
    if (!hourKeys.length) return null
    const latestHour = hourKeys.sort((a, b) => Number(a) - Number(b)).at(-1) as string
    const val = hourObj[latestHour]
    return typeof val === "number" ? val : Number(val) || null
  }

  function pickLatest5Level(obj: any): number | null {
    if (!obj) return null
    const yearKeys = Object.keys(obj)
    if (!yearKeys.length) return null
    const latestYear = yearKeys.sort((a, b) => Number(a) - Number(b)).at(-1) as string
    const monthObj = obj[latestYear]
    if (!monthObj) return null
    const monthKeys = Object.keys(monthObj)
    if (!monthKeys.length) return null
    const latestMonth = monthKeys.sort((a, b) => Number(a) - Number(b)).at(-1) as string
    const dayObj = monthObj[latestMonth]
    if (!dayObj) return null
    const dayKeys = Object.keys(dayObj)
    if (!dayKeys.length) return null
    const latestDay = dayKeys.sort((a, b) => Number(a) - Number(b)).at(-1) as string
    const hourObj = dayObj[latestDay]
    if (!hourObj) return null
    const hourKeys = Object.keys(hourObj)
    if (!hourKeys.length) return null
    const latestHour = hourKeys.sort((a, b) => Number(a) - Number(b)).at(-1) as string
    const minuteObj = hourObj[latestHour]
    if (!minuteObj) return null
    const minuteKeys = Object.keys(minuteObj)
    if (!minuteKeys.length) return null
    const latestMinute = minuteKeys.sort((a, b) => Number(a) - Number(b)).at(-1) as string
    const val = minuteObj[latestMinute]
    return typeof val === "number" ? val : Number(val) || null
  }

  

  return (
    <div className="min-h-screen bg-stone-100 text-foreground">
      <>
          {/* Header */}
          <header className="bg-slate-700 border-b border-slate-600">
            <div className="container mx-auto px-6 py-4">
              <div className="grid grid-cols-3 items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-yellow-600 rounded text-white flex items-center justify-center font-bold">
                    🏛️
                  </div>
                  <h1 className="text-xl font-semibold text-yellow-500">Temple FlowGuard</h1>
                </div>

                <div className="text-white text-sm justify-self-center">
                  CURRENTLY INSIDE:{" "}
                  <span className="text-blue-400 font-bold text-lg">
                    {currentlyInside !== null ? currentlyInside.toLocaleString() : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-4 justify-self-end">
                  <div className="text-sm text-gray-300">{formatAsiaKolkata(lastUpdateTs)}</div>
                  <Button
                    variant="outline"
                    className="border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-slate-700 bg-transparent"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Data (Excel)
                  </Button>
                  
                </div>
              </div>
            </div>
          </header>

          {/* Main Dashboard */}
          <main className="container mx-auto px-6 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Entering Traffic Section */}
          <div className="space-y-6 pb-6">
            <Card className="bg-white shadow-lg border border-gray-200">
              <CardHeader>
                <CardTitle className="text-center text-lg font-medium text-green-500">
                  ENTRY GATE
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Video Feed */}
                <div className="rounded-lg p-4 relative bg-gray-50">
                  <div className="absolute top-2 left-2 bg-gray-600 text-white px-3 py-1 rounded text-sm">
                    Live Feed - Entrance
                  </div>
                  <div className="aspect-video bg-gray-200 rounded flex items-center justify-center">
                    <img
                      src="ancient-temple-entrance-with-stone-architecture-an.jpg"
                      alt="Temple Entrance Live Feed"
                      className="w-full h-full object-cover rounded"
                    />
                  </div>
                  <div className="absolute bottom-2 right-2 flex gap-2">
                    <Button size="sm" variant="secondary" className="w-8 h-8 p-0">
                      <Play className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="secondary" className="w-8 h-8 p-0">
                      <Maximize2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Live Statistics */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-xs text-gray-600 mb-1">LAST MINUTE</div>
                    <div className="text-3xl font-bold text-gray-900">{liveMinuteCount ?? "—"}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-600 mb-1">LAST HOUR</div>
                    <div className="text-3xl font-bold text-gray-900">{lastHourCount ?? "—"}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-600 mb-1">{formatDateAsiaKolkata(Date.now())}</div>
                    <div className="text-3xl font-bold text-gray-900">{todaysTotal ?? "—"}</div>
                  </div>
                </div>

                {/* Extended Statistics */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">YESTERDAY</div>
                    <div className="text-2xl font-bold text-gray-900">{yesterdaysTotal ?? "—"}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">MONTH'S TOTAL</div>
                    <div className="text-2xl font-bold text-gray-900">{monthlyTotal ?? "—"}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">YEAR 2025</div>
                    <div className="text-2xl font-bold text-gray-900">{yearlyTotal ?? "—"}</div>
                  </div>
                </div>

                {/* Removed duplicate filter in Entry card */}
              </CardContent>
            </Card>
          </div>

          {/* Leaving Traffic Section */}
          <div className="space-y-6 pb-6">
            <Card className="bg-white shadow-lg border border-gray-200">
              <CardHeader>
                <CardTitle className="text-center text-lg font-medium text-red-500 ">
                  EXIT GATE
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Video Feed */}
                <div className="rounded-lg p-4 relative bg-gray-50">
                  <div className="absolute top-2 left-2 bg-gray-600 text-white px-3 py-1 rounded text-sm">
                    Live Feed - Exit
                  </div>
                  <div className="aspect-video bg-gray-200 rounded flex items-center justify-center">
                    <img
                      src="ancient-temple-exit-with-stone-architecture-and-pe.jpg"
                      alt="Temple Exit Live Feed"
                      className="w-full h-full object-cover rounded"
                    />
                  </div>
                  <div className="absolute bottom-2 right-2 flex gap-2">
                    <Button size="sm" variant="secondary" className="w-8 h-8 p-0">
                      <Play className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="secondary" className="w-8 h-8 p-0">
                      <Maximize2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Live Statistics */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-xs text-gray-600 mb-1">LIVE COUNT:</div>
                    <div className="text-3xl font-bold text-gray-900">38</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-600 mb-1">LAST HOUR</div>
                    <div className="text-3xl font-bold text-gray-900">190</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-600 mb-1">TODAY'S TOTAL</div>
                    <div className="text-3xl font-bold text-gray-900">1,650</div>
                  </div>
                </div>

                {/* Extended Statistics */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">MONTH'S TOTAL</div>
                    <div className="text-2xl font-bold text-gray-900">32,100</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">YEAR'S TOTAL</div>
                    <div className="text-2xl font-bold text-gray-900">260,780</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">OVERALL TOTAL</div>
                    <div className="text-2xl font-bold text-gray-900">800K</div>
                  </div>
                </div>

                {/* Removed duplicate filter in Exit card */}
              </CardContent>
            </Card>
          </div>
            
            {/* Date Range Filter (Global) - Bottom */}
            <div className="space-y-6 lg:col-span-2">
              <Card className="bg-white shadow-lg border border-gray-200">
                <CardHeader>
                  <CardTitle className="text-center text-lg font-medium text-gray-800">
                    Filter by Date Range (IST)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Start date</div>
                      <Input
                        type="date"
                        value={filterStartDate}
                        onChange={(e) => setFilterStartDate(e.target.value)}
                        className="bg-white border-gray-300 text-gray-900"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">End date</div>
                      <Input
                        type="date"
                        value={filterEndDate}
                        onChange={(e) => setFilterEndDate(e.target.value)}
                        className="bg-white border-gray-300 text-gray-900"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      {/* <span className="mr-2">Total in range:</span> */}
                      <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 text-base font-bold shadow-sm">
                      Total in range: {filteredTotal.toLocaleString()}
                      </span>
                    </div>
                    <Button className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-6 shadow" onClick={onApplyRange}>
                      Apply
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                    {filteredDaily.length ? (
                      filteredDaily.map((d) => (
                        <div key={d.ms} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 bg-white">
                          <div className="text-sm text-gray-600">{d.label}</div>
                          <div className="text-base font-semibold text-gray-900">{d.count ?? "—"}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-500">No data in range</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            </div>
          </main>
      </>
    </div>
  )
}

export default App
