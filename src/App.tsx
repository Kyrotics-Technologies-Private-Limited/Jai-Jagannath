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

  // Exit aggregates
  const [exitLiveMinuteCount, setExitLiveMinuteCount] = useState<number | null>(null)
  const [exitLastHourCount, setExitLastHourCount] = useState<number | null>(null)
  const [exitTodaysTotal, setExitTodaysTotal] = useState<number | null>(null)
  const [exitMonthlyTotal, setExitMonthlyTotal] = useState<number | null>(null)
  const [exitYesterdaysTotal, setExitYesterdaysTotal] = useState<number | null>(null)
  const [exitYearlyTotal, setExitYearlyTotal] = useState<number | null>(null)
  const [dailyExit, setDailyExit] = useState<any | null>(null)

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
  
  // Time-wise filtering
  const [filterStartTime, setFilterStartTime] = useState<string>("00:00")
  const [filterEndTime, setFilterEndTime] = useState<string>("23:59")
  const [enableTimeFilter, setEnableTimeFilter] = useState<boolean>(false)
  
  // Quick time filter
  const [quickDate, setQuickDate] = useState<string>(() => {
    const { year, month, day } = getTZParts(Date.now(), "Asia/Kolkata")
    return `${year}-${month}-${day}`
  })
  const [quickTimeStart, setQuickTimeStart] = useState<string>(() => {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const hour = oneHourAgo.getHours().toString().padStart(2, '0')
    const minute = oneHourAgo.getMinutes().toString().padStart(2, '0')
    return `${hour}:${minute}`
  })
  const [quickTimeEnd, setQuickTimeEnd] = useState<string>(() => {
    const now = new Date()
    const hour = now.getHours().toString().padStart(2, '0')
    const minute = now.getMinutes().toString().padStart(2, '0')
    return `${hour}:${minute}`
  })
  const [quickFilteredTotal, setQuickFilteredTotal] = useState<number>(0)
  
  // Hourly and minutely data for time filtering
  const [hourlyEntranceData, setHourlyEntranceData] = useState<any | null>(null)
  const [minutelyEntranceData, setMinutelyEntranceData] = useState<any | null>(null)

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
      // Note: Filtered data will be updated by the useEffect that depends on both daily and hourly data
    })

    const hourlyRef = ref(db, "aggregates/hourly/entrance")
    const unsubHourly = onValue(hourlyRef, (snap) => {
      const hourlyData = snap.val()
      setHourlyEntranceData(hourlyData)
      setLastHourCount(pickLatest4Level(hourlyData))
    })

    const minutelyRef = ref(db, "aggregates/minutely/entrance")
    const unsubMinutely = onValue(minutelyRef, (snap) => {
      const minutelyData = snap.val()
      setMinutelyEntranceData(minutelyData)
      setLiveMinuteCount(pickLatest5Level(minutelyData))
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

  // Subscribe to aggregates for exit
  useEffect(() => {
    const dailyRef = ref(db, "aggregates/daily/exit")
    const unsubDaily = onValue(dailyRef, (snap) => {
      const dailyObj = snap.val()
      setDailyExit(dailyObj)
      setExitTodaysTotal(getDailyForTZDate(dailyObj, 0))
      setExitYesterdaysTotal(getDailyForTZDate(dailyObj, -1))
    })

    const hourlyRef = ref(db, "aggregates/hourly/exit")
    const unsubHourly = onValue(hourlyRef, (snap) => {
      setExitLastHourCount(pickLatest4Level(snap.val()))
    })

    const minutelyRef = ref(db, "aggregates/minutely/exit")
    const unsubMinutely = onValue(minutelyRef, (snap) => {
      setExitLiveMinuteCount(pickLatest5Level(snap.val()))
    })

    const monthlyRef = ref(db, "aggregates/monthly/exit")
    const unsubMonthly = onValue(monthlyRef, (snap) => {
      setExitMonthlyTotal(pickLatest2Level(snap.val()))
    })

    const yearlyRef = ref(db, "aggregates/yearly/exit")
    const unsubYearly = onValue(yearlyRef, (snap) => {
      const obj = snap.val() || {}
      const val = obj?.[String(TARGET_YEAR)]
      setExitYearlyTotal(typeof val === "number" ? val : Number(val) || null)
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
    let gen
    if (enableTimeFilter) {
      // Use minutely data for most precise filtering, fallback to hourly
      if (minutelyEntranceData) {
        gen = generateMinutelyTimeFilteredData(filterStartDate, filterEndDate, minutelyEntranceData, filterStartTime, filterEndTime)
      } else if (hourlyEntranceData) {
        gen = generateTimeFilteredData(filterStartDate, filterEndDate, hourlyEntranceData, filterStartTime, filterEndTime)
      } else {
        // Fallback to daily data with time range in label only
        gen = generateDayWiseData(filterStartDate, filterEndDate, dailyEntrance, filterStartTime, filterEndTime)
      }
    } else {
      gen = generateDayWiseData(filterStartDate, filterEndDate, dailyEntrance)
    }
    setFilteredDaily(gen.list)
    setFilteredTotal(gen.total)
  }, [dailyEntrance, hourlyEntranceData, minutelyEntranceData, filterStartDate, filterEndDate, enableTimeFilter, filterStartTime, filterEndTime])

  // Quick time filter effect
  useEffect(() => {
    if (hourlyEntranceData || minutelyEntranceData) {
      let gen
      if (minutelyEntranceData) {
        gen = generateMinutelyTimeFilteredData(quickDate, quickDate, minutelyEntranceData, quickTimeStart, quickTimeEnd)
      } else if (hourlyEntranceData) {
        gen = generateTimeFilteredData(quickDate, quickDate, hourlyEntranceData, quickTimeStart, quickTimeEnd)
      } else {
        gen = generateDayWiseData(quickDate, quickDate, dailyEntrance, quickTimeStart, quickTimeEnd)
      }
      setFilteredDaily(gen.list)
      setQuickFilteredTotal(gen.total)
    }
  }, [quickDate, quickTimeStart, quickTimeEnd, hourlyEntranceData, minutelyEntranceData, dailyEntrance])

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
    startTime?: string | null,
    endTime?: string | null,
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
      
      // Format label with time range if time filtering is enabled
      let label = formatDateAsiaKolkata(ms)
      if (startTime && endTime) {
        label += ` (${startTime} - ${endTime})`
      }
      
      out.push({ ms, label, count })
    }
    return { list: out, total }
  }

  function generateTimeFilteredData(
    startStr: string,
    endStr: string,
    hourlyObj: any,
    startTime: string,
    endTime: string,
  ): { list: Array<{ ms: number; label: string; count: number | null }>; total: number } {
    if (!hourlyObj || !startStr || !endStr) return { list: [], total: 0 }
    
    let start = msAtStartOfIST(startStr)
    let end = msAtStartOfIST(endStr)
    if (Number.isNaN(start) || Number.isNaN(end)) return { list: [], total: 0 }
    if (start > end) {
      const t = start
      start = end
      end = t
    }

    // Convert IST time inputs to UTC for database filtering
    const [startHourStr, startMinStr] = startTime.split(':')
    const [endHourStr, endMinStr] = endTime.split(':')
    const startHourIST = parseInt(startHourStr)
    const startMinIST = parseInt(startMinStr)
    const endHourIST = parseInt(endHourStr)
    const endMinIST = parseInt(endMinStr)
    
    // Convert IST to UTC (subtract 5:30)
    const startHourUTC = (startHourIST - 5 + (startMinIST - 30 < 0 ? -1 : 0) + 24) % 24
    const startMinUTC = (startMinIST - 30 + 60) % 60
    const endHourUTC = (endHourIST - 5 + (endMinIST - 30 < 0 ? -1 : 0) + 24) % 24
    const endMinUTC = (endMinIST - 30 + 60) % 60
    
    const out: Array<{ ms: number; label: string; count: number | null }> = []
    let total = 0
    
    for (let ms = start; ms <= end; ms += 86400000) {
      const { year, month, day } = getTZParts(ms, "Asia/Kolkata")
      const dayData = hourlyObj?.[year]?.[month]?.[day]
      
      if (!dayData) {
        out.push({ ms, label: formatDateAsiaKolkata(ms) + ` (${startTime} - ${endTime} IST)`, count: null })
        continue
      }
      
      let dayTotal = 0
      const hours = Object.keys(dayData).sort((a, b) => Number(a) - Number(b))
      
      for (const hour of hours) {
        const hourNum = parseInt(hour)
        
        // Check if this UTC hour falls within our UTC time range
        let shouldIncludeHour = false
        
        if (startHourUTC === endHourUTC) {
          // Same hour range in UTC
          shouldIncludeHour = hourNum === startHourUTC
        } else {
          // Different hours in UTC
          if (startHourUTC < endHourUTC) {
            // Normal case: start < end (e.g., 09:00 - 17:00 IST = 03:30 - 11:30 UTC)
            shouldIncludeHour = hourNum >= startHourUTC && hourNum <= endHourUTC
          } else {
            // Cross-midnight case: start > end (e.g., 22:00 - 06:00 IST = 16:30 - 00:30 UTC)
            shouldIncludeHour = hourNum >= startHourUTC || hourNum <= endHourUTC
          }
        }
        
        if (shouldIncludeHour) {
          const val = dayData[hour]
          const count = typeof val === "number" ? val : Number(val) || 0
          dayTotal += count
        }
      }
      
      total += dayTotal
      out.push({ 
        ms, 
        label: formatDateAsiaKolkata(ms) + ` (${startTime} - ${endTime} IST)`, 
        count: dayTotal 
      })
    }
    
    return { list: out, total }
  }

  function generateMinutelyTimeFilteredData(
    startStr: string,
    endStr: string,
    minutelyObj: any,
    startTime: string,
    endTime: string,
  ): { list: Array<{ ms: number; label: string; count: number | null }>; total: number } {
    if (!minutelyObj || !startStr || !endStr) return { list: [], total: 0 }
    
    let start = msAtStartOfIST(startStr)
    let end = msAtStartOfIST(endStr)
    if (Number.isNaN(start) || Number.isNaN(end)) return { list: [], total: 0 }
    if (start > end) {
      const t = start
      start = end
      end = t
    }

    // Convert IST time inputs to UTC for database filtering
    const [startHourStr, startMinStr] = startTime.split(':')
    const [endHourStr, endMinStr] = endTime.split(':')
    const startHourIST = parseInt(startHourStr)
    const startMinIST = parseInt(startMinStr)
    const endHourIST = parseInt(endHourStr)
    const endMinIST = parseInt(endMinStr)
    
    // Convert IST to UTC (subtract 5:30)
    const startHourUTC = (startHourIST - 5 + (startMinIST - 30 < 0 ? -1 : 0) + 24) % 24
    const startMinUTC = (startMinIST - 30 + 60) % 60
    const endHourUTC = (endHourIST - 5 + (endMinIST - 30 < 0 ? -1 : 0) + 24) % 24
    const endMinUTC = (endMinIST - 30 + 60) % 60
    
    const out: Array<{ ms: number; label: string; count: number | null }> = []
    let total = 0
    
    for (let ms = start; ms <= end; ms += 86400000) {
      const { year, month, day } = getTZParts(ms, "Asia/Kolkata")
      const dayData = minutelyObj?.[year]?.[month]?.[day]
      
      if (!dayData) {
        out.push({ ms, label: formatDateAsiaKolkata(ms) + ` (${startTime} - ${endTime} IST)`, count: null })
        continue
      }
      
      let dayTotal = 0
      const hours = Object.keys(dayData).sort((a, b) => Number(a) - Number(b))
      
      for (const hour of hours) {
        const hourNum = parseInt(hour)
        const hourData = dayData[hour]
        
        if (!hourData) continue
        
        const minutes = Object.keys(hourData).sort((a, b) => Number(a) - Number(b))
        
        for (const minute of minutes) {
          const minNum = parseInt(minute)
          
          // Check if this UTC minute falls within our UTC time range
          let shouldIncludeMinute = false
          
          if (startHourUTC === endHourUTC) {
            // Same hour range in UTC
            shouldIncludeMinute = hourNum === startHourUTC && minNum >= startMinUTC && minNum <= endMinUTC
          } else {
            // Different hours in UTC
            if (startHourUTC < endHourUTC) {
              // Normal case: start < end
              if (hourNum > startHourUTC && hourNum < endHourUTC) {
                shouldIncludeMinute = true // Full hour is included
              } else if (hourNum === startHourUTC) {
                shouldIncludeMinute = minNum >= startMinUTC // From start minute onwards
              } else if (hourNum === endHourUTC) {
                shouldIncludeMinute = minNum <= endMinUTC // Up to end minute
              }
            } else {
              // Cross-midnight case: start > end
              if (hourNum > startHourUTC || hourNum < endHourUTC) {
                shouldIncludeMinute = true // Full hour is included
              } else if (hourNum === startHourUTC) {
                shouldIncludeMinute = minNum >= startMinUTC // From start minute onwards
              } else if (hourNum === endHourUTC) {
                shouldIncludeMinute = minNum <= endMinUTC // Up to end minute
              }
            }
          }
          
          if (shouldIncludeMinute) {
            const val = hourData[minute]
            const count = typeof val === "number" ? val : Number(val) || 0
            dayTotal += count
          }
        }
      }
      
      total += dayTotal
      out.push({ 
        ms, 
        label: formatDateAsiaKolkata(ms) + ` (${startTime} - ${endTime} IST)`, 
        count: dayTotal 
      })
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

  function getTodayDateString(): string {
    const { year, month, day } = getTZParts(Date.now(), "Asia/Kolkata")
    return `${year}-${month}-${day}`
  }

  function onApplyRange() {
    let gen
    if (enableTimeFilter) {
      // Use minutely data for most precise filtering, fallback to hourly
      if (minutelyEntranceData) {
        gen = generateMinutelyTimeFilteredData(filterStartDate, filterEndDate, minutelyEntranceData, filterStartTime, filterEndTime)
      } else if (hourlyEntranceData) {
        gen = generateTimeFilteredData(filterStartDate, filterEndDate, hourlyEntranceData, filterStartTime, filterEndTime)
      } else {
        // Fallback to daily data with time range in label only
        gen = generateDayWiseData(filterStartDate, filterEndDate, dailyEntrance, filterStartTime, filterEndTime)
      }
    } else {
      gen = generateDayWiseData(filterStartDate, filterEndDate, dailyEntrance)
    }
    setFilteredDaily(gen.list)
    setFilteredTotal(gen.total)
  }

  function onQuickTimeFilter() {
    let gen
    // Use minutely data for most precise filtering, fallback to hourly
    if (minutelyEntranceData) {
      gen = generateMinutelyTimeFilteredData(quickDate, quickDate, minutelyEntranceData, quickTimeStart, quickTimeEnd)
    } else if (hourlyEntranceData) {
      gen = generateTimeFilteredData(quickDate, quickDate, hourlyEntranceData, quickTimeStart, quickTimeEnd)
    } else {
      // Fallback to daily data with time range in label only
      gen = generateDayWiseData(quickDate, quickDate, dailyEntrance, quickTimeStart, quickTimeEnd)
    }
    setFilteredDaily(gen.list)
    setQuickFilteredTotal(gen.total)
  }

  function onClearQuickFilter() {
    // Reset quick filter to today with last hour
    setQuickDate(() => {
      const { year, month, day } = getTZParts(Date.now(), "Asia/Kolkata")
      return `${year}-${month}-${day}`
    })
    setQuickTimeStart(() => {
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      const hour = oneHourAgo.getHours().toString().padStart(2, '0')
      const minute = oneHourAgo.getMinutes().toString().padStart(2, '0')
      return `${hour}:${minute}`
    })
    setQuickTimeEnd(() => {
      const now = new Date()
      const hour = now.getHours().toString().padStart(2, '0')
      const minute = now.getMinutes().toString().padStart(2, '0')
      return `${hour}:${minute}`
    })
  }

  function downloadAllHourlyData() {
    if (!hourlyEntranceData) {
      alert("No hourly data available for download")
      return
    }

    // Prepare CSV data
    const csvHeaders = ["Date (IST)", "Time (IST)", "Count"]
    const csvRows = [csvHeaders.join(",")]
    
    // Get all years, months, and days from hourly data
    const years = Object.keys(hourlyEntranceData).sort((a, b) => Number(a) - Number(b))
    
    years.forEach(year => {
      const yearData = hourlyEntranceData[year]
      const months = Object.keys(yearData).sort((a, b) => Number(a) - Number(b))
      
      months.forEach(month => {
        const monthData = yearData[month]
        const days = Object.keys(monthData).sort((a, b) => Number(a) - Number(b))
        
        days.forEach(day => {
          const dayData = monthData[day]
          const hours = Object.keys(dayData).sort((a, b) => Number(a) - Number(b))
          
          // Format date in IST
          const dateIST = formatDateAsiaKolkata(msAtStartOfIST(`${year}-${month}-${day}`))
          
          hours.forEach(hourUTC => {
            const count = dayData[hourUTC]
            // Convert UTC hour to IST hour for display
            const hourIST = (parseInt(hourUTC) + 5) % 24 // Add 5 hours for IST
            const hourISTStr = hourIST.toString().padStart(2, '0')
            const timeRange = `${hourISTStr}:00 - ${hourISTStr}:59`
            
            csvRows.push([dateIST, timeRange, count].join(","))
          })
        })
      })
    })

    if (csvRows.length === 1) {
      alert("No data available for download")
      return
    }

    // Create and download CSV file
    const csvContent = csvRows.join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", `temple_all_hourly_data.csv`)
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  function onClearFilters() {
    // Reset all filters to default values
    setFilterStartDate(() => {
      const ms = Date.now() - 6 * 86400000
      const { year, month, day } = getTZParts(ms, "Asia/Kolkata")
      return `${year}-${month}-${day}`
    })
    setFilterEndDate(() => {
      const { year, month, day } = getTZParts(Date.now(), "Asia/Kolkata")
      return `${year}-${month}-${day}`
    })
    setFilterStartTime("00:00")
    setFilterEndTime("23:59")
    setEnableTimeFilter(false)
    
    // Reset quick filter to today with last hour
    setQuickDate(() => {
      const { year, month, day } = getTZParts(Date.now(), "Asia/Kolkata")
      return `${year}-${month}-${day}`
    })
    setQuickTimeStart(() => {
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      const hour = oneHourAgo.getHours().toString().padStart(2, '0')
      const minute = oneHourAgo.getMinutes().toString().padStart(2, '0')
      return `${hour}:${minute}`
    })
    setQuickTimeEnd(() => {
      const now = new Date()
      const hour = now.getHours().toString().padStart(2, '0')
      const minute = now.getMinutes().toString().padStart(2, '0')
      return `${hour}:${minute}`
    })
    
    // Apply default range filter
    const gen = generateDayWiseData(
      (() => {
        const ms = Date.now() - 6 * 86400000
        const { year, month, day } = getTZParts(ms, "Asia/Kolkata")
        return `${year}-${month}-${day}`
      })(),
      (() => {
        const { year, month, day } = getTZParts(Date.now(), "Asia/Kolkata")
        return `${year}-${month}-${day}`
      })(),
      dailyEntrance
    )
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

  // Compute current inside as today's entry minus today's exit
  const insideCountToday: number | null =
    typeof todaysTotal === "number" && typeof exitTodaysTotal === "number"
      ? todaysTotal - exitTodaysTotal
      : null

  return (
    <div className="min-h-screen bg-stone-100 text-foreground">
      <>
          {/* Header */}
          <header className="bg-slate-700 border-b border-slate-600">
            <div className="container mx-auto px-4 sm:px-6 py-4">
              {/* Mobile Layout */}
              <div className="block md:hidden">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-white shadow-md">
                      <img 
                        src="/logo.png" 
                        alt="Temple Logo" 
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <h1 className="text-lg font-semibold text-yellow-500">Jagannath Mandir</h1>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-slate-700 bg-transparent text-xs px-2 py-1"
                    onClick={downloadAllHourlyData}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download
                  </Button>
                </div>
                <div className="text-center">
                  <div className="text-white text-sm mb-1">
                    CURRENTLY INSIDE:{" "}
                    <span className="text-blue-400 font-bold text-lg">
                      {insideCountToday !== null ? insideCountToday.toLocaleString() : "—"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-300">{formatAsiaKolkata(new Date().getTime())}</div>
                </div>
              </div>

              {/* Desktop Layout */}
              <div className="hidden md:grid md:grid-cols-3 items-center">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-full overflow-hidden bg-white shadow-md">
                    <img 
                      src="/logo.png" 
                      alt="Temple Logo" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <h1 className="text-lg lg:text-xl font-semibold text-yellow-500">Jagannath Mandir</h1>
                </div>

                <div className="text-white text-sm justify-self-center">
                  CURRENTLY INSIDE:{" "}
                  <span className="text-blue-400 font-bold text-lg">
                    {insideCountToday !== null ? insideCountToday.toLocaleString() : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-4 justify-self-end">
                  <div className="text-sm text-gray-300 hidden lg:block">{formatAsiaKolkata(new Date().getTime())}</div>
                  <Button
                    variant="outline"
                    className="border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-slate-700 bg-transparent"
                    onClick={downloadAllHourlyData}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    <span className="hidden lg:inline">Download Data (Excel)</span>
                    <span className="lg:hidden">Download</span>
                  </Button>
                </div>
              </div>
            </div>
          </header>

          {/* Main Dashboard */}
          <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
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
                    <div className="text-xs text-gray-600 mb-1">LAST MINUTE</div>
                    <div className="text-3xl font-bold text-gray-900">{exitLiveMinuteCount ?? "—"}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-600 mb-1">LAST HOUR</div>
                    <div className="text-3xl font-bold text-gray-900">{exitLastHourCount ?? "—"}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-600 mb-1">{formatDateAsiaKolkata(Date.now())}</div>
                    <div className="text-3xl font-bold text-gray-900">{exitTodaysTotal ?? "—"}</div>
                  </div>
                </div>

                {/* Extended Statistics */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">YESTERDAY</div>
                    <div className="text-2xl font-bold text-gray-900">{exitYesterdaysTotal ?? "—"}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">MONTH'S TOTAL</div>
                    <div className="text-2xl font-bold text-gray-900">{exitMonthlyTotal ?? "—"}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">YEAR 2025</div>
                    <div className="text-2xl font-bold text-gray-900">{exitYearlyTotal ?? "—"}</div>
                  </div>
                </div>

              </CardContent>
            </Card>
          </div>
            
            {/* Quick Time Filter */}
            <div className="space-y-6 lg:col-span-2">
              <Card className="bg-white shadow-lg border border-gray-200">
                <CardHeader>
                  <CardTitle className="text-center text-lg font-medium text-gray-800">
                    Quick Time Filter
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Date and Time Selection - Side by Side for Large Screens */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Date Selection */}
                    <div className="space-y-3">
                      <div className="text-sm font-medium text-gray-700 border-b border-gray-200 pb-2">Select Date</div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Date (IST)</div>
                        <Input
                          type="date"
                          value={quickDate}
                          onChange={(e) => setQuickDate(e.target.value)}
                          className="bg-white border-gray-300 text-gray-900"
                        />
                      </div>
                    </div>

                    {/* Time Range */}
                    <div className="space-y-3">
                      <div className="text-sm font-medium text-gray-700 border-b border-gray-200 pb-2">Time Range (IST)</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Start time (IST)</div>
                          <Input
                            type="time"
                            value={quickTimeStart}
                            onChange={(e) => setQuickTimeStart(e.target.value)}
                            className="bg-white border-gray-300 text-gray-900"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 mb-1">End time (IST)</div>
                          <Input
                            type="time"
                            value={quickTimeEnd}
                            onChange={(e) => setQuickTimeEnd(e.target.value)}
                            className="bg-white border-gray-300 text-gray-900"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Total Count and Clear Button */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                    <div className="text-sm text-gray-700">
                      <span className="inline-flex items-center rounded-full bg-green-50 text-green-700 border border-green-200 px-3 py-1 text-base font-bold shadow-sm">
                        Total Count: {quickFilteredTotal.toLocaleString()}
                      </span>
                    </div>
                    <Button className="bg-orange-500 hover:bg-orange-600 text-white font-medium px-6 shadow" onClick={onClearQuickFilter}>
                      Clear Quick Filter
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Date and Time Range Filter (Global) - Bottom */}
            <div className="space-y-6 lg:col-span-2">
              <Card className="bg-white shadow-lg border border-gray-200">
                <CardHeader>
                  <CardTitle className="text-center text-lg font-medium text-gray-800">
                    Filter by Date & Time Range
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Date Filters */}
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-gray-700 border-b border-gray-200 pb-2">Date Range</div>
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
                  </div>

                  {/* Time Filters */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-gray-700 border-b border-gray-200 pb-2 flex-1">Time Range (IST)</div>
                      <div className="flex items-center gap-2 ml-4">
                        <input
                          type="checkbox"
                          id="enableTimeFilter"
                          checked={enableTimeFilter}
                          onChange={(e) => setEnableTimeFilter(e.target.checked)}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="enableTimeFilter" className="text-xs text-gray-600">Enable time filter</label>
                      </div>
                    </div>
                    {enableTimeFilter && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Start time (IST)</div>
                          <Input
                            type="time"
                            value={filterStartTime}
                            onChange={(e) => setFilterStartTime(e.target.value)}
                            className="bg-white border-gray-300 text-gray-900"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 mb-1">End time (IST)</div>
                          <Input
                            type="time"
                            value={filterEndTime}
                            onChange={(e) => setFilterEndTime(e.target.value)}
                            className="bg-white border-gray-300 text-gray-900"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      {/* <span className="mr-2">Total in range:</span> */}
                      <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 text-base font-bold shadow-sm">
                      Total in range: {filteredTotal.toLocaleString()}
                      </span>
                    </div>
                    <Button className="bg-red-500 hover:bg-red-600 text-white font-medium px-6 shadow" onClick={onClearFilters}>
                      Clear Filters
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
