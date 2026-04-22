import { useState } from 'react';
import {
  ChevronRight,
  Search
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '@/redux/authSlice';
import { useGetStudentScheduleQuery } from '@/api/studentsApi';
import { useGetAllStudentExamsQuery } from '@/api/studentExamsApi';

function StudentDashboard() {
  const navigate = useNavigate();
  const [checkedItems, setCheckedItems] = useState<{ [key: number]: boolean }>({});

  const toggleCheckbox = (id: number) => {
    setCheckedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const user = useSelector(selectCurrentUser);

  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);

  const { data: scheduleData } = useGetStudentScheduleQuery({
    startDate: today.toISOString(),
    endDate: nextWeek.toISOString()
  }, { skip: !user });

  const { data: examsData } = useGetAllStudentExamsQuery({
    page: 1, pageSize: 5
  }, { skip: !user });

  const scheduleItems = Array.isArray(scheduleData) ? scheduleData : [];
  const todoItems = scheduleItems.slice(0, 4).map((slot: any, index: number) => ({
    id: slot.id || index,
    title: `Upcoming Class: ${slot.subjectName || slot.subjectCode || 'Lesson'}`,
    course: slot.classCode || 'Schedule',
    dueDate: new Date(slot.date).toLocaleDateString() + ' ' + (slot.startTime ? slot.startTime.slice(0, 5) : ''),
  }));

  const recentFeedback = (examsData?.items || []).filter((e: any) => e.isSubmitted).slice(0, 4).map((exam: any, index: number) => ({
    id: exam.studentExamId || index,
    title: exam.examDisplayName || 'Exam',
    course: 'Exam', // Can map subject if available
    grade: exam.grade !== null && exam.grade !== undefined ? `${exam.grade} pts` : 'Pending',
    date: exam.endTime ? new Date(exam.endTime).toLocaleDateString() : 'Recently'
  }));

  const recentActivity: any[] = []; // Waiting for Notification API implementation

  return (
    <div className="flex animate-fadeIn">
      {/* Main Content */}
      <div className="flex-1 p-4 md:p-6">
        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-[#0A1B3C]">Welcome back, {user?.fullName || 'Student'}!</h1>
          <p className="text-gray-500 mt-1">Here's what's happening with your courses.</p>
        </div>

        {/* Quick Links Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div
            onClick={() => navigate('/student/courses')}
            className="p-6 bg-gradient-to-br from-[#F37022] to-[#ff9b5e] rounded-xl text-white cursor-pointer hover:shadow-lg transition-all group"
          >
            <h3 className="text-xl font-bold mb-2">My Courses</h3>
            <p className="text-white/80 text-sm">View all your enrolled subjects and their details.</p>
            <div className="mt-4 flex items-center text-sm font-semibold group-hover:translate-x-1 transition-transform">
              Go to Courses <ChevronRight className="w-4 h-4 ml-1" />
            </div>
          </div>
          <div
            onClick={() => navigate('/student/schedule')}
            className="p-6 bg-gradient-to-br from-[#0066b3] to-[#0092ff] rounded-xl text-white cursor-pointer hover:shadow-lg transition-all group"
          >
            <h3 className="text-xl font-bold mb-2">My Schedule</h3>
            <p className="text-white/80 text-sm">Check your upcoming classes and exam slots.</p>
            <div className="mt-4 flex items-center text-sm font-semibold group-hover:translate-x-1 transition-transform">
              View Schedule <ChevronRight className="w-4 h-4 ml-1" />
            </div>
          </div>
        </div>

        {/* Recent Activity View */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <h2 className="font-bold text-[#0A1B3C]">Recent Activity</h2>
            <button className="text-xs text-[#F37022] font-semibold hover:underline">View All</button>
          </div>
          <div className="divide-y divide-gray-100">
            {recentActivity.length > 0 ? recentActivity.map((activity: any, index: number) => (
              <div key={index} className="flex items-start px-4 py-4 hover:bg-gray-50 cursor-pointer transition-colors">
                <div className="flex-1">
                  <span className="text-xs font-semibold text-[#0066b3] bg-blue-50 px-2 py-0.5 rounded inline-block mb-1">{activity.courseCode}</span>
                  <p className="text-sm text-gray-700 font-medium">{activity.title}</p>
                  <p className="text-xs text-gray-400 mt-1">{activity.time}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 self-center" />
              </div>
            )) : (
              <div className="p-6 text-center text-sm text-gray-500">No recent activity detected.</div>
            )}
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-[320px] border-l border-gray-200 bg-gray-50/50 p-4 hidden lg:block space-y-4">
        {/* To Do Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h2 className="text-lg font-bold text-[#1a1f36] mb-4">To Do</h2>
          <div className="space-y-4">
            {todoItems.length > 0 ? todoItems.map((item: any) => {
              const isChecked = checkedItems[item.id] || false;
              return (
                <div key={item.id} className="flex items-start gap-3 group">
                  <button
                    onClick={() => toggleCheckbox(item.id)}
                    className={`w-5 h-5 rounded flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${isChecked
                      ? 'bg-[#F37022] border-[#F37022]'
                      : 'border-2 border-gray-200 group-hover:border-gray-300'
                      }`}
                  >
                    {isChecked && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold text-[#1a1f36] truncate ${isChecked ? 'line-through text-gray-400' : ''}`}>{item.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-bold text-[#0066b3] bg-blue-50 px-1.5 py-0.5 rounded uppercase">{item.course}</span>
                      <p className="text-[10px] text-gray-400">{item.dueDate}</p>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="p-4 text-center text-sm text-gray-500">No upcoming tasks scheduled!</div>
            )}
          </div>
          <button className="w-full mt-4 py-2 text-xs font-semibold text-[#F37022] bg-[#F37022]/5 hover:bg-[#F37022]/10 rounded-lg transition-colors">
            Show more
          </button>
        </div>

        {/* Recent Feedback Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h2 className="text-lg font-bold text-[#1a1f36] mb-4">Recent Feedback</h2>
          <div className="space-y-4">
            {recentFeedback.length > 0 ? recentFeedback.map((item: any) => (
              <div key={item.id} className="flex flex-col gap-1 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-bold text-[#1a1f36] truncate flex-1">{item.title}</p>
                  <span className="text-xs font-bold text-[#27ae60] bg-green-50 px-2 py-0.5 rounded ml-2">{item.grade}</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[10px] font-bold text-[#0066b3] uppercase">{item.course}</span>
                  <p className="text-[10px] text-gray-400">{item.date}</p>
                </div>
              </div>
            )) : (
              <div className="text-sm text-center text-gray-500 py-4">No recent feedback.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudentDashboard;
