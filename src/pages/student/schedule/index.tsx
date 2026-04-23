import { useState, useMemo } from 'react';
import { Calendar, Clock, MapPin, User, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useGetStudentScheduleQuery } from '@/api/studentsApi';
import { DatePicker, ConfigProvider } from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router';

// Interfaces for our API response
interface SyllabusSessionDto {
  slotSessionId: string;
  sessionOrder: number;
  syllabusSessionId: string;
  sessionNumber: number;
  topic: string;
  learningTeachingType: string;
  ituSkills: string;
  studentTasks: string;
}

interface ScheduleSlotDto {
  slotId: string;
  classId: string;
  classCode: string;
  classSubjectId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  slotIndex: number;
  date: string;
  endDate: string;
  room: string;
  sessions: SyllabusSessionDto[];
}

export default function StudentSchedule() {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());

  // Calculate the start (Monday) and end (Sunday) of the current week focus
  const weekStart = useMemo(() => {
    const date = new Date(currentDate);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(date.setDate(diff));
  }, [currentDate]);

  const weekEnd = useMemo(() => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + 6);
    return date;
  }, [weekStart]);

  // Format dates for API query (YYYY-MM-DD)
  const startDateStr = dayjs(weekStart).format('YYYY-MM-DD');
  const endDateStr = dayjs(weekEnd).format('YYYY-MM-DD');

  // Fetch schedule data for the week
  const { data: scheduleData, isFetching, error } = useGetStudentScheduleQuery({
    startDate: startDateStr,
    endDate: endDateStr
  });

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const slots = [
    { index: 1, time: '7:00 - 9:15' },
    { index: 2, time: '9:30 - 11:45' },
    { index: 3, time: '12:30 - 14:45' },
    { index: 4, time: '15:00 - 17:15' },
  ];

  // Helpers to get dates
  const getDates = () => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const dates = getDates();

  const previousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const nextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getTimeFromDateString = (dateString: string) => {
    // extracts "07:00" from "2026-03-02T07:00:00"
    return dateString.split('T')[1].substring(0, 5);
  };

  const getScheduleItem = (date: Date, slotIndex: number) => {
    if (!scheduleData) return null;

    const dateStr = dayjs(date).format('YYYY-MM-DD');
    const targetTime = slots.find(s => s.index === slotIndex)?.time.split(' - ')[0]; // E.g., "7:00" or "9:30"

    // Pad with leading zero if needed so "7:00" matches "07:00"
    const formattedTargetTime = targetTime && targetTime.length === 4 ? `0${targetTime}` : targetTime;

    return scheduleData.find((item: any) => {
      const itemDateStr = item.date.split('T')[0];
      const itemTimeStr = getTimeFromDateString(item.date);
      return itemDateStr === dateStr && itemTimeStr === formattedTargetTime;
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto w-full pb-24 px-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0A1B3C]">My Schedule</h1>
        </div>

        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-white rounded-lg border p-1 border-gray-200/60 shadow-sm w-full sm:w-auto">
            <Button variant="ghost" size="icon" onClick={previousWeek} className="h-8 w-8 text-gray-500 hover:text-gray-900 border border-transparent hover:border-gray-200">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 flex items-center gap-2 px-3 text-sm font-medium text-gray-700 justify-center bg-gray-50 rounded-md py-1 border border-gray-200">
              <ConfigProvider
                theme={{
                  token: {
                    colorPrimary: '#3b82f6',
                  },
                  components: {
                    DatePicker: {
                      activeBorderColor: 'transparent',
                      hoverBorderColor: 'transparent',
                    }
                  }
                }}
              >
                <DatePicker
                  variant="borderless"
                  allowClear={false}
                  value={dayjs(currentDate)}
                  onChange={(date) => {
                    if (date) {
                      setCurrentDate(date.toDate());
                    }
                  }}
                  className="w-full cursor-pointer font-medium text-gray-700 bg-transparent p-0 text-center"
                  format="MMM D, YYYY"
                />
              </ConfigProvider>
            </div>
            <Button variant="ghost" size="icon" onClick={nextWeek} className="h-8 w-8 text-gray-500 hover:text-gray-900 border border-transparent hover:border-gray-200">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Card className="glass-card overflow-hidden rounded-xl shadow-sm border-blue-100/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200">
            <table className="w-full min-w-[800px] border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 w-24 border-b border-r bg-gray-50 p-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest backdrop-blur-sm shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                    Slot
                  </th>
                  {dates.map((date, index) => (
                    <th
                      key={index}
                      className={`border-b border-r p-3 text-center transition-colors ${isToday(date) ? 'bg-blue-50/50 backdrop-blur-sm relative overflow-hidden' : 'bg-gray-50/30'
                        }`}
                    >
                      {isToday(date) && (
                        <div className="absolute top-0 left-0 right-0 h-1 bg-[#3b82f6]" />
                      )}
                      <div className={`text-[10px] uppercase tracking-widest font-bold ${isToday(date) ? 'text-blue-600' : 'text-gray-400'}`}>
                        {days[index]}
                      </div>
                      <div className={`text-sm font-bold mt-1 ${isToday(date) ? 'text-blue-900' : 'text-gray-700'}`}>
                        {formatDate(date)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isFetching ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <tr key={`loading-${index}`}>
                      <td className="sticky left-0 z-10 border-b border-r bg-gray-50/50 p-2 text-center h-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-10 mx-auto mb-1"></div>
                        <div className="h-3 bg-gray-100 rounded animate-pulse w-14 mx-auto"></div>
                      </td>
                      {Array.from({ length: 7 }).map((_, colIndex) => (
                        <td key={`loading-col-${colIndex}`} className="border-b border-r p-2 align-top h-20">
                          <div className="h-full w-full bg-gray-100/30 rounded-lg animate-pulse"></div>
                        </td>
                      ))}
                    </tr>
                  ))
                ) : error ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-red-500">
                      Error loading schedule. Please check your connection or contact support.
                    </td>
                  </tr>
                ) : slots.map((slot) => (
                  <tr key={slot.index}>
                    <td className="sticky left-0 z-10 border-b border-r bg-gray-50 p-3 text-center text-xs font-semibold text-[#0A1B3C] backdrop-blur-sm h-24 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                      <div>Slot {slot.index}</div>
                      <div className="text-[10px] text-gray-400 mt-1 font-medium">{slot.time}</div>
                    </td>
                    {dates.map((date, dateIndex) => {
                      const scheduleItem = getScheduleItem(date, slot.index);
                      return (
                        <td key={dateIndex} className={`border-b border-r p-2 align-top h-24 transition-colors ${isToday(date) ? 'bg-blue-50/30' : ''}`}>
                          {scheduleItem ? (
                            <div
                              className="h-full w-full animate-in fade-in duration-300 cursor-pointer"
                              onClick={() => navigate(`/student/course-details/${scheduleItem.classSubjectId}`)}
                            >
                              <div className="h-full rounded-xl border border-blue-200 bg-blue-50/80 p-2.5 hover:bg-blue-100 hover:border-blue-300 transition-all shadow-sm">
                                <div className="font-bold text-sm text-blue-900 mb-1 leading-tight flex justify-between items-start">
                                  <span>{scheduleItem.subjectCode}</span>
                                  <span className="text-[10px] bg-blue-200 text-blue-800 px-1 py-0.5 rounded font-medium">Slot {scheduleItem.slotIndex}</span>
                                </div>

                                <div className="space-y-0.5 opacity-90">
                                  <div className="flex items-center text-xs text-blue-800">
                                    <User className="mr-1 h-3 w-3 shrink-0 text-blue-600" />
                                    <span className="flex-1 truncate"><span className="font-semibold">{scheduleItem.classCode}</span></span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[10px] text-blue-700">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{scheduleItem.room || 'Room'}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="h-full w-full flex items-center justify-center opacity-10">
                              <Calendar className="w-5 h-5 text-gray-300" />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


