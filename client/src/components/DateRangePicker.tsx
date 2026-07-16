import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

interface DateRangePickerProps {
  value: string;
  onChange: (date: string) => void;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function toLocalDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();

  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const parsed = value ? new Date(value + "T00:00:00") : now;
  const [selYear, setSelYear] = useState(parsed.getFullYear());
  const [selMonth, setSelMonth] = useState(parsed.getMonth());

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, [isOpen]);

  const maxYear = currentYear;
  const isCurrentMonth = selYear === currentYear && selMonth === currentMonth;
  const maxDay = isCurrentMonth ? currentDay : getDaysInMonth(selYear, selMonth);
  const daysInMonth = getDaysInMonth(selYear, selMonth);
  const firstDayOfWeek = new Date(selYear, selMonth, 1).getDay();

  const handleDayClick = (day: number) => {
    if (day > maxDay) return;
    onChange(toLocalDateStr(selYear, selMonth, day));
  };

  const handleMonthClick = (month: number) => {
    if (selYear === currentYear && month > currentMonth) return;
    setSelMonth(month);
    setView("days");
  };

  const handleYearClick = (year: number) => {
    if (year > currentYear) return;
    setSelYear(year);
    if (year < currentYear) {
      setSelMonth(11);
    } else {
      setSelMonth(Math.min(selMonth, currentMonth));
    }
    setView("months");
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        onClick={() => { setIsOpen(!isOpen); if (!isOpen) setView("days"); }}
        className="flex items-center gap-2 h-10 px-3 rounded-xl border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <Calendar className="w-4 h-4 text-slate-400" />
        {new Date(value + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </button>

      {isOpen && view !== "days" && (
        <div className="absolute z-50 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 w-72">
          {view === "years" && (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }, (_, i) => currentYear - 4 + i).map((year) => (
                <button
                  key={year}
                  onClick={() => handleYearClick(year)}
                  disabled={year > currentYear}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                    year === selYear
                      ? "bg-blue-500 text-white"
                      : year > currentYear
                        ? "text-slate-300 cursor-not-allowed"
                        : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          )}

          {view === "months" && (
            <>
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setView("years")}
                  className="text-xs text-blue-500 hover:text-blue-700"
                >
                  {selYear}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { if (selYear > currentYear - 5) setSelYear(selYear - 1); }}
                    className="p-1 rounded hover:bg-slate-100"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => { if (selYear < currentYear) setSelYear(selYear + 1); }}
                    disabled={selYear >= currentYear}
                    className="p-1 rounded hover:bg-slate-100 disabled:text-slate-300"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MONTHS.map((m, i) => (
                  <button
                    key={m}
                    onClick={() => handleMonthClick(i)}
                    disabled={selYear === currentYear && i > currentMonth}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                      i === selMonth
                        ? "bg-blue-500 text-white"
                        : selYear === currentYear && i > currentMonth
                          ? "text-slate-300 cursor-not-allowed"
                          : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </>
          )}

          <button
            onClick={() => setView("days")}
            className="mt-3 w-full text-center text-xs text-blue-500 hover:text-blue-700"
          >
            Pick date
          </button>
        </div>
      )}

      {isOpen && view === "days" && (
        <div className="absolute z-50 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 w-72">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setView("months")}
              className="text-sm font-semibold text-slate-800 hover:text-blue-500"
            >
              {MONTHS[selMonth]} {selYear}
            </button>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  if (selMonth === 0) {
                    if (selYear > currentYear - 5) { setSelYear(selYear - 1); setSelMonth(11); }
                  } else {
                    setSelMonth(selMonth - 1);
                  }
                }}
                className="p-1 rounded hover:bg-slate-100"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (selYear === currentYear && selMonth >= currentMonth) return;
                  if (selMonth === 11) { setSelYear(selYear + 1); setSelMonth(0); }
                  else { setSelMonth(selMonth + 1); }
                }}
                disabled={selYear === currentYear && selMonth >= currentMonth}
                className="p-1 rounded hover:bg-slate-100 disabled:text-slate-300"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d} className="text-center text-[10px] font-medium text-slate-400 py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const dateStr = toLocalDateStr(selYear, selMonth, day);
              const isSelected = dateStr === value;
              const isFuture = day > maxDay;
              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  disabled={isFuture}
                  className={`h-8 w-8 rounded-lg text-sm font-medium transition-colors ${
                    isSelected
                      ? "bg-blue-500 text-white"
                      : isFuture
                        ? "text-slate-300 cursor-not-allowed"
                        : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
