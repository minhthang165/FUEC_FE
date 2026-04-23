import { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowLeft, FileText, Calendar, ChevronDown, ChevronUp, Download, BookOpen, Lock, CheckCircle, Clock, Loader2, Play, BarChart2, Award, TrendingUp } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { selectCurrentUser } from '@/redux/authSlice';
import { useGetClassSubjectSlotsQuery, useGetClassSubjectByIdQuery } from '@/api/classDetailsApi';
import { useGetAssignmentsByClassSubjectIdQuery } from '@/api/assignmentsApi';
import { useGetStudentAssignmentsByStudentIdQuery } from '@/api/studentAssignmentsApi';
import { useGetExamsByClassSubjectIdQuery } from '@/api/examsApi';
import { useGetStudentClassesQuery, useGetStudentSubjectsQuery } from '@/api/studentsApi';
import { useGetCourseMaterialsByClassSubjectIdQuery } from '@/api/courseMaterialsApi';
import type { Assignment, StudentAssignment } from '@/types/assignment.types';
import StudentSlotContent from './StudentSlotContent';
import PracticeSection from './PracticeSection';

interface Question {
  id: number;
  title: string;
  status: 'custom' | 'finished';
}

export type ExtendedAssignment = Assignment & {
  submitted: boolean;
  timeRemaining: string | null;
  isOverdue: boolean;
  studentSubmission?: StudentAssignment;
};

interface Slot {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  topics: string[];
  questions: Question[];
  assignments: ExtendedAssignment[];
  expanded: boolean;
  status: 'locked' | 'completed' | 'pending' | 'urgent' | 'overdue';
  remaining?: string;
  rawStartTime: string;
  rawEndTime: string;
}

interface ProgressTest {
  id: number;
  title: string;
  questions: number;
  duration: number;
  status: 'completed' | 'available' | 'locked';
  score: number | null;
}

interface Material {
  id: string;
  title: string;
  type: string;
  date: string;
  downloadable: boolean;
  fileUrl?: string;
}

// ── Live countdown to assignment due date ────────────────────────────────
function AssignmentDueCountdown({ dueDate }: { dueDate: string }) {
  const [timeLeft, setTimeLeft] = useState<number>(() => new Date(dueDate).getTime() - Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = new Date(dueDate).getTime() - Date.now();
      setTimeLeft(diff);
      if (diff <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [dueDate]);

  if (timeLeft <= 0) return null;

  const d = Math.floor(timeLeft / 86400000);
  const h = Math.floor((timeLeft % 86400000) / 3600000);
  const m = Math.floor((timeLeft % 3600000) / 60000);
  const s = Math.floor((timeLeft % 60000) / 1000);
  const isUrgent = timeLeft < 24 * 3600 * 1000;

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
      isUrgent ? 'bg-red-50 text-red-600 border-red-200' : 'bg-amber-50 text-amber-600 border-amber-200'
    }`}>
      <Clock className="w-2.5 h-2.5" />
      {d > 0 ? `${d}d ` : ''}{h > 0 ? `${h}h ` : ''}{String(m).padStart(2, '0')}m {String(s).padStart(2, '0')}s
    </span>
  );
}

// ── Live countdown to exam end (while ongoing) ────────────────────────────
function ExamOngoingCountdown({ endTime }: { endTime: string }) {
  const [timeLeft, setTimeLeft] = useState<number>(() => new Date(endTime).getTime() - Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = new Date(endTime).getTime() - Date.now();
      setTimeLeft(diff);
      if (diff <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [endTime]);

  if (timeLeft <= 0) return null;

  const h = Math.floor(timeLeft / 3600000);
  const m = Math.floor((timeLeft % 3600000) / 60000);
  const s = Math.floor((timeLeft % 60000) / 1000);
  const isUrgent = timeLeft < 10 * 60 * 1000;

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border animate-pulse ${
      isUrgent ? 'bg-red-50 text-red-600 border-red-200' : 'bg-blue-50 text-blue-600 border-blue-200'
    }`}>
      <Clock className="w-2.5 h-2.5" />
      {h > 0 ? `${h}h ` : ''}{String(m).padStart(2, '00')}m {String(s).padStart(2, '00')}s left
    </span>
  );
}

function CourseDetails() {
  const navigate = useNavigate();
  const { classSubjectId } = useParams<{ classSubjectId: string }>();
  const [activeSection, setActiveSection] = useState('assignments');
  const [slotContentsExpanded, setSlotContentsExpanded] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const SLOTS_PER_PAGE = 10;

  const user = useSelector(selectCurrentUser);

  const studentEntityId = user?.entityId ?? user?.id;

  const { data: slotsData, isLoading: isSlotsLoading, isError, refetch: refetchSlots } = useGetClassSubjectSlotsQuery(
    { id: classSubjectId || '', studentId: studentEntityId },
    { skip: !classSubjectId }
  );

  const { data: classSubjectData, isLoading: isClassLoading } = useGetClassSubjectByIdQuery(classSubjectId || '', {
    skip: !classSubjectId
  });

  const { data: assignmentsData, isLoading: isAssignmentsLoading } = useGetAssignmentsByClassSubjectIdQuery(classSubjectId || '', {
    skip: !classSubjectId
  });

  const { data: studentAssignmentsData, isLoading: isStudentAssignmentsLoading } = useGetStudentAssignmentsByStudentIdQuery(user?.entityId ?? user?.id ?? '', {
    skip: !user?.id
  });

  const { data: examsData, isLoading: isLoadingExams } = useGetExamsByClassSubjectIdQuery(classSubjectId || '', {
    skip: !classSubjectId
  });

  const { data: materialsData, isLoading: isMaterialsLoading } = useGetCourseMaterialsByClassSubjectIdQuery(classSubjectId || '', {
    skip: !classSubjectId
  });

  // Need user's StudentClasses to know their ID for this course
  // We use studentId: user?.entityId ?? user?.id
  const { data: studentClassesData } = useGetStudentClassesQuery({
    studentId: user?.entityId ?? user?.id,
    pageSize: 100
  }, { skip: !user?.id });

  // Find the exact StudentClass object for this classSubject's classId
  const currentStudentClassId = useMemo(() => {
    if (!classSubjectData?.classId || !studentClassesData?.items) return null;
    const match = studentClassesData.items.find((sc: any) => sc.classId === classSubjectData.classId);
    return match?.id || null;
  }, [classSubjectData, studentClassesData]);

  // Grades for this specific subject
  const { data: studentSubjectsData, isLoading: isLoadingGrades } = useGetStudentSubjectsQuery(
    { studentId: studentEntityId || '' },
    { skip: !studentEntityId }
  );

  const currentSubjectGrades = useMemo(() => {
    if (!studentSubjectsData || !classSubjectId) return null;
    return studentSubjectsData.find(sub => sub.classSubjectId === classSubjectId) || null;
  }, [studentSubjectsData, classSubjectId]);

  const isLoading = isSlotsLoading || isClassLoading || isAssignmentsLoading || isStudentAssignmentsLoading || isLoadingExams || isMaterialsLoading;

  const course = {
    name: classSubjectData?.subjectName || slotsData?.subjectName || 'Loading...',
    code: classSubjectData?.subjectCode || slotsData?.subjectCode || '...',
    instructor: classSubjectData?.teacherName || 'N/A',
    schedule: classSubjectData?.classCode ? `${classSubjectData.classCode}` : 'N/A',
    room: 'N/A',
    credits: classSubjectData?.subjectCredits || 0
  };

  const courseAssignments = useMemo(() => {
    if (!assignmentsData?.items) return [];

    const submissions = studentAssignmentsData?.items || [];

    return assignmentsData.items.map((assignment: Assignment) => {
      const submission = submissions.find((sub: StudentAssignment) => sub.assignmentId === assignment.id);

      let timeRemaining = null;
      let isOverdue = false;

      if (assignment.dueDate) {
        const due = new Date(assignment.dueDate).getTime();
        const now = new Date().getTime();
        const diff = due - now;

        if (diff < 0) {
          timeRemaining = 'Overdue';
          isOverdue = true;
        } else {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

          let parts = [];
          if (days > 0) parts.push(`${days}d`);
          if (hours > 0) parts.push(`${hours}h`);
          if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

          timeRemaining = `${parts.join(' ')} left`;
        }
      }

      return {
        ...assignment,
        submitted: !!submission,
        timeRemaining: !submission ? timeRemaining : null,
        isOverdue: !submission && isOverdue,
        studentSubmission: submission
      };
    }).sort((a: ExtendedAssignment, b: ExtendedAssignment) => a.instanceNumber - b.instanceNumber);
  }, [assignmentsData, studentAssignmentsData]);


  const learningMaterials = useMemo<Material[]>(() => {
    if (!materialsData?.items) return [];
    return materialsData.items.map((m: any) => ({
      id: m.id,
      title: m.fileName || m.displayName || 'Unnamed Material',
      type: m.materialType || 'Material',
      date: dayjs(m.createdDate || m.uploadedAt || undefined).format('YYYY-MM-DD'),
      downloadable: !!(m.fileUrl || m.filePath),
      fileUrl: m.fileUrl || m.filePath
    }));
  }, [materialsData]);

  const progressTests = useMemo(() => {
    return (examsData?.items || []).map((exam: any) => {
      const now = new Date();
      const start = new Date(exam.startTime);
      const end = new Date(exam.endTime);

      let status: 'completed' | 'available' | 'locked' = 'locked';
      if (now >= start && now <= end) {
        status = 'available';
      } else if (now > end) {
        status = 'completed';
      }

      return {
        id: exam.id,
        title: exam.displayName || (exam.category ? `${exam.category} ${exam.instanceNumber}` : `Progress Test ${exam.instanceNumber}`),
        startTime: exam.startTime,
        endTime: exam.endTime,
        questions: exam.questions?.length || 0,
        duration: 0, // Duration could be derived from endTime - startTime if needed
        status: status,
        slotId: exam.slotId,
        isSubmitted: exam.isSubmitted,
        score: exam.grade !== null && exam.grade !== undefined ? exam.grade : null
      };
    });
  }, [examsData]);

  const [expandedSlots, setExpandedSlots] = useState<{ [key: string]: boolean }>({});

  const toggleSlot = (slotId: string) => {
    setExpandedSlots(prev => ({
      ...prev,
      [slotId]: !prev[slotId]
    }));
  };

  const hasScrolledRef = useRef(false);
  const targetSlotIdRef = useRef<string | null>(null);

  const slots: Slot[] = slotsData?.slots.map((slot: any, i: number) => {
    const apiStatus = slot.status || 'Inactive';
    const totalQ = slot.totalQuestions ?? 0;
    const answeredQ = slot.answeredQuestions ?? 0;
    const unanswered = totalQ - answeredQ;

    const calculatedEndTime = (i + 1 < slotsData.slots.length && slotsData.slots[i + 1].date)
      ? slotsData.slots[i + 1].date
      : dayjs(slot.date).add(3, 'day').format('YYYY-MM-DDTHH:mm:ss');

    const now_fe = new Date();
    const start_fe = new Date(slot.date);
    const end_fe = new Date(calculatedEndTime);

    let uiStatus: Slot['status'] = 'pending';
    const passedQ = (slot as any).passedQuestions ?? 0;
    const isAllPassed = totalQ > 0 && passedQ >= totalQ;

    // FE-side status calculation for better TZ reliability
    let currentApiStatus = apiStatus;
    if (now_fe < start_fe) currentApiStatus = 'Inactive';
    else if (now_fe >= start_fe && now_fe < end_fe) currentApiStatus = 'Active';
    else currentApiStatus = 'Expired';

    if (totalQ === 0 && (currentApiStatus === 'Expired' || currentApiStatus === 'Active')) {
      uiStatus = 'completed'; // Treat as done if nothing to do
    } else {
      if (currentApiStatus === 'Expired') {
        if (isAllPassed) uiStatus = 'completed';
        else uiStatus = 'overdue';
      } else if (currentApiStatus === 'Active') {
        if (isAllPassed) uiStatus = 'completed';
        else uiStatus = 'urgent';
      } else {
        uiStatus = 'locked';
      }
    }

    return {
      id: slot.id,
      title: `Slot ${slot.slotIndex}`,
      startTime: new Date(slot.date).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }),
      endTime: slot.endDate
        ? new Date(slot.endDate).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
        : new Date(calculatedEndTime).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }),
      topics: slot.sessions.map((s: any) => s.topic),
      questions: [],
      assignments: [],
      expanded: !!expandedSlots[slot.id],
      status: uiStatus,
      remaining: unanswered > 0 ? `${unanswered} unanswered` : undefined,
      _apiStatus: apiStatus,
      _feStatus: currentApiStatus,
      _totalQuestions: totalQ,
      _answeredQuestions: answeredQ,
      _passedQuestions: passedQ,
      rawStartTime: slot.date,
      rawEndTime: slot.endDate || calculatedEndTime,
      countdownEndTime: calculatedEndTime
    } as any;
  }) || [];

  // Auto-scroll — use FE-processed slots with correct timezone status
  useEffect(() => {
    if (slots.length > 0 && !hasScrolledRef.current) {
      // Find first active (urgent) slot, then first upcoming (locked), fallback to last
      let targetIdx = slots.findIndex((s: any) => s.status === 'urgent');
      if (targetIdx === -1) {
        targetIdx = slots.findIndex((s: any) => s.status === 'overdue');
      }
      if (targetIdx === -1) {
        targetIdx = slots.findIndex((s: any) => s.status === 'locked');
      }
      if (targetIdx === -1) {
        targetIdx = slots.length - 1;
      }

      const finalIdx = targetIdx !== -1 ? targetIdx : 0;
      const targetPage = Math.floor(finalIdx / SLOTS_PER_PAGE) + 1;

      if (targetPage !== currentPage) {
        setCurrentPage(targetPage);
      }

      const targetSlot = slots[finalIdx];
      if (targetSlot) {
        targetSlotIdRef.current = targetSlot.id;
        setExpandedSlots(prev => ({ ...prev, [targetSlot.id]: true }));
      }
      hasScrolledRef.current = true;
    }
  }, [slots.length, currentPage]);

  useEffect(() => {
    if (targetSlotIdRef.current) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`slot-${targetSlotIdRef.current}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetSlotIdRef.current = null;
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [currentPage, slots.length]);

  const SlotCountdown = ({ startTime, endTime, status, onFinished }: { startTime: string, endTime: string, status: string, onFinished: () => void }) => {
    const [timeLeft, setTimeLeft] = useState<number>(0);

    useEffect(() => {
      const calculateTime = () => {
        const now = Date.now();
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();

        if (status === 'Inactive' && now < start) {
          return start - now;
        }
        if (status === 'Active' && now < end) {
          return end - now;
        }
        return 0;
      };

      setTimeLeft(calculateTime());
      const timer = setInterval(() => {
        const remaining = calculateTime();
        setTimeLeft(remaining);
        if (remaining <= 0) {
          clearInterval(timer);
          onFinished();
        }
      }, 1000);

      return () => clearInterval(timer);
    }, [startTime, endTime, status, onFinished]);

    if (timeLeft <= 0) return null;

    const d = Math.floor(timeLeft / 86400000);
    const h = Math.floor((timeLeft % 86400000) / 3600000);
    const m = Math.floor((timeLeft % 3600000) / 60000);
    const s = Math.floor((timeLeft % 60000) / 1000);

    const label = status === 'Inactive' ? 'Starts' : 'Questions end';
    const timeStr = `${d > 0 ? d + 'd ' : ''}${h > 0 ? h + 'h ' : ''}${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;

    return (
      <div className="relative group flex-shrink-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-50 border border-amber-200 cursor-default hover:bg-amber-100 transition-colors">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
        </div>
        {/* Tooltip — below icon to avoid overflow clipping */}
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
          <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto mb-[-4px]" />
          <div className="bg-gray-900 text-white text-[11px] font-mono font-semibold whitespace-nowrap px-2.5 py-1.5 rounded-lg shadow-lg tabular-nums">
            {label} in {timeStr}
          </div>
        </div>
      </div>
    );
  };

  const handleSlotClick = (slotId: string) => {
    const index = slots.findIndex(s => s.id === slotId);
    if (index === -1) return;

    const slotPage = Math.ceil((index + 1) / SLOTS_PER_PAGE);
    setCurrentPage(slotPage);

    // Ensure it's expanded
    setExpandedSlots(prev => ({ ...prev, [slotId]: true }));

    // Small timeout to allow state changes to propagate
    setTimeout(() => {
      scrollToSection(`slot-${slotId}`);
    }, 150);
  };

  const slotMap = useMemo(() => {
    const map: Record<string, string> = {};
    slotsData?.slots.forEach(slot => {
      map[slot.id] = `Slot ${slot.slotIndex}`;
    });
    return map;
  }, [slotsData]);

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 relative p-4 md:p-6 animate-fadeIn">
      {/* Main Content - Left Side */}
      <div className="flex-1 min-w-0">
        {/* Course Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/student/courses')}
            className="flex items-center gap-2 text-gray-600 hover:text-[#0A1B3C] mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Courses
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-[#0A1B3C] mb-2">{course.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm text-gray-600">
            <span className="text-xs font-semibold text-[#0066b3] bg-blue-50 px-2 py-0.5 rounded">
              {course.code}
            </span>
            <span>•</span>
            <span>{course.instructor}</span>
            <span>•</span>
            <span>{course.schedule}</span>
          </div>
        </div>

        {/* Assignments Section */}
        <div id="assignments" className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 md:pb-8 mb-6 scroll-mt-6">
          <h2 className="text-xl font-bold text-[#0A1B3C] mb-4">Assignments</h2>
          <div className="space-y-3">
            {courseAssignments.length === 0 ? (
              <p className="text-gray-500 italic">No assignments available for this course.</p>
            ) : courseAssignments.map(assignment => (
              <div key={assignment.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-orange-600" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-medium text-[#0A1B3C] text-sm">
                      {assignment.displayName || `ASM${assignment.instanceNumber}`}
                      {assignment.slotId && slotMap[assignment.slotId] && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSlotClick(assignment.slotId!);
                          }}
                          className="ml-2 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 uppercase tracking-tight hover:bg-blue-100 hover:border-blue-200 transition-all cursor-pointer"
                          title={`Go to ${slotMap[assignment.slotId]}`}
                        >
                          {slotMap[assignment.slotId]}
                        </button>
                      )}
                    </h4>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {assignment.dueDate && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Due: {new Date(assignment.dueDate).toLocaleDateString('en-GB')}
                        </span>
                      )}
                      {/* Live countdown to due date */}
                      {assignment.dueDate && !assignment.submitted && !assignment.isOverdue && (
                        <AssignmentDueCountdown dueDate={assignment.dueDate} />
                      )}
                      {assignment.isOverdue && !assignment.submitted && (
                        <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">OVERDUE</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {assignment.studentSubmission?.grade != null && (
                    <span className={`text-sm font-bold px-2.5 py-1 rounded-lg border ${
                      assignment.studentSubmission.grade >= 8 ? 'bg-green-50 text-green-700 border-green-200'
                      : assignment.studentSubmission.grade >= 5 ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-red-50 text-red-600 border-red-200'
                    }`}>
                      {assignment.studentSubmission.grade}
                    </span>
                  )}
                  <button
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${assignment.studentSubmission?.grade !== null && assignment.studentSubmission?.grade !== undefined
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : assignment.submitted
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : 'bg-[#F37022] text-white hover:bg-[#D96419]'
                      }`}
                    onClick={() => navigate(`/student/assignment-submission/${assignment.id}`)}
                  >
                    {assignment.submitted || (assignment.studentSubmission?.grade !== null && assignment.studentSubmission?.grade !== undefined)
                      ? 'Review'
                      : 'Submit'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Progress Tests */}
        <div id="progress-tests" className="bg-white rounded-xl border border-gray-200 p-6 pb-8 mb-6 scroll-mt-6">
          <h2 className="text-xl font-bold text-[#0A1B3C] mb-4">Progress Tests</h2>
          <div className="space-y-3">
            {progressTests.length === 0 ? (
              <p className="text-gray-500 italic">No progress tests available for this course.</p>
            ) : progressTests.map(test => (
              <div key={test.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${test.isSubmitted || test.status === 'completed' ? 'bg-green-100' :
                    test.status === 'available' ? 'bg-blue-100' :
                      'bg-gray-200'
                    }`}>
                    {test.isSubmitted || test.status === 'completed' ? <CheckCircle className="w-5 h-5 text-green-600" /> :
                      test.status === 'available' ? <Play className="w-5 h-5 text-blue-600" /> :
                        <Lock className="w-5 h-5 text-gray-500" />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-medium text-[#0A1B3C] text-sm">
                      {test.title}
                      {test.slotId && slotMap[test.slotId] && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSlotClick(test.slotId!);
                          }}
                          className="ml-2 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 uppercase tracking-tight hover:bg-blue-100 hover:border-blue-200 transition-all cursor-pointer"
                          title={`Go to ${slotMap[test.slotId]}`}
                        >
                          {slotMap[test.slotId]}
                        </button>
                      )}
                    </h4>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        End: {new Date(test.endTime).toLocaleString('en-GB')}
                      </span>
                      {/* Live countdown while exam is ongoing */}
                      {test.status === 'available' && !test.isSubmitted && (
                        <ExamOngoingCountdown endTime={test.endTime} />
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {test.score != null && (
                    <span className={`text-sm font-bold px-2.5 py-1 rounded-lg border ${
                      test.score >= 8 ? 'bg-green-50 text-green-700 border-green-200'
                      : test.score >= 5 ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-red-50 text-red-600 border-red-200'
                    }`}>
                      {test.score}
                    </span>
                  )}
                  <button
                    className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${test.isSubmitted || test.status === 'completed' ? 'bg-green-100 text-green-700' :
                      test.status === 'available' ? 'bg-[#F37022] text-white hover:bg-[#D96419]' :
                        'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                    disabled={test.status === 'locked'}
                    onClick={() => {
                      if (test.status === 'available' || test.status === 'completed' || test.isSubmitted) {
                        navigate(`/student/exam-lobby/${test.id}?classSubjectId=${classSubjectId}`);
                      }
                    }}
                  >
                    {test.isSubmitted || test.status === 'completed' ? 'Review' :
                      test.status === 'available' ? 'Start Test' :
                        'Locked'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Learning Materials - PDFs/Files */}
        <div id="learning-materials" className="bg-white rounded-xl border border-gray-200 p-6 pb-8 mb-6 scroll-mt-6">
          <h2 className="text-xl font-bold text-[#0A1B3C] mb-4">Learning Materials</h2>
          <div className="space-y-3">
            {learningMaterials.length === 0 ? (
              <p className="text-gray-500 italic">No learning materials available for this course.</p>
            ) : learningMaterials.map(material => (
              <div key={material.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-[#F37022]" />
                  </div>
                  <div>
                    <h4 className="font-medium text-[#0A1B3C] text-sm">{material.title}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 bg-orange-50 text-orange-600 rounded text-xs font-medium">
                        {material.type}
                      </span>
                      <span className="text-xs text-gray-500">{material.date}</span>
                    </div>
                  </div>
                </div>
                {material.downloadable && material.fileUrl && (
                  <button
                    onClick={() => window.open(material.fileUrl, '_blank')}
                    className="p-2 hover:bg-white rounded-lg transition-colors cursor-pointer"
                    title="Download/Open"
                  >
                    <Download className="w-4 h-4 text-gray-600" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Slot Contents */}
        <div id="slot-contents" className="bg-white rounded-xl border border-gray-200 p-6 pb-8 mb-6 scroll-mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[#0A1B3C]">Slot Contents</h2>
            {isLoading && <Loader2 className="w-5 h-5 animate-spin text-[#F37022]" />}
            {!isLoading && (
              <div className="text-sm text-gray-500">
                Page {currentPage} of {Math.ceil(slots.length / SLOTS_PER_PAGE) || 1}
              </div>
            )}
          </div>
          {isError && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg text-center mb-4">
              Failed to load slots data. Please try again.
            </div>
          )}

          <div className="space-y-4">
            {slots
              .slice((currentPage - 1) * SLOTS_PER_PAGE, currentPage * SLOTS_PER_PAGE)
              .map(slot => (
                <div key={slot.id} id={`slot-${slot.id}`} className={`border rounded-lg overflow-hidden scroll-mt-6 mb-4 ${slot.status === 'locked' ? 'border-gray-300 opacity-60' :
                  slot.status === 'overdue' ? 'border-red-400' :
                    slot.status === 'urgent' ? 'border-orange-300' :
                      slot.status === 'completed' ? 'border-green-300' :
                        'border-gray-200'
                  }`}>
                  {/* Slot Header */}
                  <div className={`p-4 ${slot.status === 'overdue' ? 'bg-red-50' :
                    slot.status === 'urgent' ? 'bg-orange-50' :
                      slot.status === 'completed' ? 'bg-green-50' :
                        'bg-gray-50'
                    }`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`px-3 py-1 text-sm font-semibold rounded-full flex items-center gap-2 ${slot.status === 'locked' ? 'bg-gray-200 text-gray-500' :
                          slot.status === 'overdue' ? 'bg-red-100 text-red-700' :
                            slot.status === 'urgent' ? 'bg-orange-100 text-orange-700' :
                              slot.status === 'completed' ? 'bg-green-100 text-green-700' :
                                'bg-blue-100 text-blue-700'
                          }`}>
                          <span>{slot.title}</span>
                        </div>
                        {slot.status === 'locked' && (
                          <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded border border-gray-200 uppercase tracking-tight">
                            Upcoming
                          </span>
                        )}
                        {slot.status === 'completed' && (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                        {slot.status === 'urgent' && (
                          <div className="flex items-center gap-2">
                            <SlotCountdown
                              startTime={(slot as any).rawStartTime}
                              endTime={(slot as any).countdownEndTime}
                              status={(slot as any)._feStatus}
                              onFinished={() => refetchSlots()}
                            />
                            {((slot as any)._totalQuestions - (slot as any)._passedQuestions) > 0 && (
                              <span className="text-[11px] font-bold text-orange-600 bg-orange-100/50 px-2 py-0.5 rounded border border-orange-200 uppercase">
                                You need to answer {((slot as any)._totalQuestions - (slot as any)._passedQuestions)} more questions
                              </span>
                            )}
                          </div>
                        )}
                        {slot.status === 'overdue' && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-600 font-bold uppercase border border-red-200 bg-red-50 px-2 py-0.5 rounded">
                              OVERDUE
                            </span>
                            {((slot as any)._totalQuestions - (slot as any)._passedQuestions) > 0 && (
                              <span className="text-[11px] font-bold text-red-600 bg-red-100/50 px-2 py-0.5 rounded border border-red-200 uppercase">
                                You need to answer {((slot as any)._totalQuestions - (slot as any)._passedQuestions)} more questions
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => toggleSlot(slot.id)}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        {slot.expanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-600" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-600" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                      <Calendar className="w-4 h-4" />
                      <span>{slot.startTime} - {slot.endTime}</span>
                    </div>

                    <div className="space-y-1">
                      {slot.topics.map((topic, index) => (
                        <div key={index} className="text-sm font-medium text-[#0A1B3C]">
                          {topic}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Slot Content (Expandable) */}
                  {slot.expanded && (
                    <StudentSlotContent
                      slotId={slot.id}
                      slotAssignments={courseAssignments.filter(a => {
                        return a.slotId === slot.id;
                      })}
                      slotExams={(examsData?.items || []).filter(e => e.slotId === slot.id)}
                      studentClassesId={currentStudentClassId}
                      slotStatus={(slot as any)._feStatus}
                    />
                  )}
                </div>
              ))}
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-center gap-2 mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.ceil(slots.length / SLOTS_PER_PAGE) || 1 }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${currentPage === page
                    ? 'bg-[#F37022] text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                    }`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(Math.ceil(slots.length / SLOTS_PER_PAGE) || 1, prev + 1))}
              disabled={currentPage === (Math.ceil(slots.length / SLOTS_PER_PAGE) || 1)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>

        {/* My Grades Section */}
        <div id="my-grades" className="bg-white rounded-xl border border-gray-200 p-6 pb-8 mb-6 scroll-mt-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-[#0A1B3C]">My Grades</h2>
            {isLoadingGrades && <Loader2 className="w-4 h-4 animate-spin text-[#F37022]" />}
          </div>

          {!isLoadingGrades && !currentSubjectGrades && (
            <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <BarChart2 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 text-sm font-medium">No grade data available yet.</p>
              <p className="text-gray-400 text-xs mt-1">Grades will appear here once your teacher records them.</p>
            </div>
          )}

          {currentSubjectGrades && (
            <div className="space-y-5">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-500 mb-1">
                    <FileText className="w-3.5 h-3.5" />
                    Assignments Avg
                  </div>
                  <div className="text-2xl font-bold text-[#0A1B3C]">
                    {currentSubjectGrades.assignmentsAverage != null ? currentSubjectGrades.assignmentsAverage.toFixed(1) : <span className="text-gray-400 text-lg">—</span>}
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-500 mb-1">
                    <BarChart2 className="w-3.5 h-3.5" />
                    Progress Tests Avg
                  </div>
                  <div className="text-2xl font-bold text-[#0A1B3C]">
                    {currentSubjectGrades.midterm != null ? currentSubjectGrades.midterm.toFixed(1) : <span className="text-gray-400 text-lg">—</span>}
                  </div>
                </div>
                <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-500 mb-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Overall Score
                  </div>
                  <div className="text-2xl font-bold text-[#0A1B3C]">
                    {currentSubjectGrades.overall != null ? currentSubjectGrades.overall.toFixed(1) : <span className="text-gray-400 text-lg">—</span>}
                  </div>
                </div>
                <div className={`rounded-xl p-4 flex flex-col gap-1 border ${
                  currentSubjectGrades.gradeLetter === 'A' || currentSubjectGrades.gradeLetter === 'A+'
                    ? 'bg-blue-50 border-blue-200'
                    : currentSubjectGrades.gradeLetter === 'B+' || currentSubjectGrades.gradeLetter === 'B'
                    ? 'bg-orange-50 border-orange-200'
                    : currentSubjectGrades.gradeLetter === 'In Progress' || !currentSubjectGrades.gradeLetter
                    ? 'bg-gray-50 border-gray-200'
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-1">
                    <Award className="w-3.5 h-3.5" />
                    Grade Letter
                  </div>
                  <div className={`text-2xl font-bold ${
                    currentSubjectGrades.gradeLetter === 'A' || currentSubjectGrades.gradeLetter === 'A+' ? 'text-blue-700'
                    : currentSubjectGrades.gradeLetter === 'B+' || currentSubjectGrades.gradeLetter === 'B' ? 'text-orange-600'
                    : currentSubjectGrades.gradeLetter === 'In Progress' || !currentSubjectGrades.gradeLetter ? 'text-gray-400'
                    : 'text-red-600'
                  }`}>
                    {currentSubjectGrades.gradeLetter || 'N/A'}
                  </div>
                </div>
              </div>

              {/* Detailed Grades Breakdown */}
              {currentSubjectGrades.detailedGrades && currentSubjectGrades.detailedGrades.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">
                    Detailed Component Grades
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    {currentSubjectGrades.detailedGrades.map(item => (
                      <div key={item.id} className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-center hover:border-orange-200 hover:bg-orange-50/30 transition-colors">
                        <div className="text-xs text-gray-500 mb-1.5 font-medium truncate" title={item.name}>{item.name}</div>
                        <div className={`text-xl font-bold ${
                          item.grade != null
                            ? item.grade >= 8 ? 'text-green-600'
                            : item.grade >= 5 ? 'text-[#0A1B3C]'
                            : 'text-red-500'
                            : 'text-gray-300'
                        }`}>
                          {item.grade != null ? item.grade : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Practice Selection */}
        <div id="practice" className="bg-white rounded-xl border border-gray-200 p-6 pb-8 mb-6 scroll-mt-6">
          <h2 className="text-xl font-bold text-[#0A1B3C] mb-4">Self-study Practice</h2>
          <PracticeSection
            classSubjectId={classSubjectId || ''}
            subjectCode={course.code}
            subjectId={classSubjectData?.subjectId || ''}
          />
        </div>

      </div>

      {/* Right Sidebar Navigation */}
      <div className="w-64 flex-shrink-0">
        <div className="sticky top-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 max-h-[calc(100vh-3rem)] overflow-y-auto">
            <h3 className="font-bold text-[#0A1B3C] mb-3">Contents</h3>
            <div className="space-y-1">
              <button
                onClick={() => scrollToSection('assignments')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeSection === 'assignments'
                  ? 'bg-orange-50 text-[#F37022]'
                  : 'text-gray-700 hover:bg-gray-50'
                  }`}
              >
                Assignments
              </button>

              <button
                onClick={() => scrollToSection('progress-tests')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeSection === 'progress-tests'
                  ? 'bg-orange-50 text-[#F37022]'
                  : 'text-gray-700 hover:bg-gray-50'
                  }`}
              >
                Progress Tests
              </button>

              <button
                onClick={() => scrollToSection('learning-materials')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeSection === 'learning-materials'
                  ? 'bg-orange-50 text-[#F37022]'
                  : 'text-gray-700 hover:bg-gray-50'
                  }`}
              >
                Learning Materials
              </button>

              <button
                onClick={() => scrollToSection('my-grades')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'my-grades' ? 'bg-orange-50 text-[#F37022]' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                My Grades
              </button>

              <button
                onClick={() => scrollToSection('practice')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeSection === 'practice'
                  ? 'bg-orange-50 text-[#F37022]'
                  : 'text-gray-700 hover:bg-gray-50'
                  }`}
              >
                Subject Practice
              </button>

              {/* Slot Contents with Dropdown */}
              <div>
                <button
                  onClick={() => {
                    setSlotContentsExpanded(!slotContentsExpanded);
                    scrollToSection('slot-contents');
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${activeSection === 'slot-contents' || activeSection.startsWith('slot-')
                    ? 'bg-orange-50 text-[#F37022]'
                    : 'text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  Slot Contents
                  {slotContentsExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>

                {slotContentsExpanded && (
                  <div className="pl-3 space-y-1 mt-1">
                    {slots.map(slot => (
                      <button
                        key={slot.id}
                        onClick={() => {
                          if (slot.status !== 'locked') {
                            const index = slots.findIndex(s => s.id === slot.id);
                            const slotPage = Math.ceil((index + 1) / SLOTS_PER_PAGE);
                            setCurrentPage(slotPage);
                            setTimeout(() => scrollToSection(`slot-${slot.id}`), 100);
                          }
                        }}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-start justify-between group ${slot.status === 'locked' ? 'text-gray-400 cursor-not-allowed' :
                          activeSection === `slot-${slot.id}` ? 'bg-orange-50 text-[#F37022]' :
                            'text-gray-600 hover:bg-gray-50'
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${slot.status === 'completed' ? 'bg-green-500' :
                            slot.status === 'overdue' ? 'bg-red-500' :
                              slot.status === 'urgent' ? 'bg-orange-500' :
                                slot.status === 'pending' ? 'bg-blue-500' :
                                  'bg-gray-300'
                            }`}></span>
                          <span>{slot.title}</span>
                        </div>

                        {/* Sidebar Remaining/Status Info */}
                        <div className="text-[10px] text-right ml-1">
                          {slot.status === 'overdue' && (
                            <span className="text-red-500 font-bold block">OVERDUE</span>
                          )}
                          {slot.remaining && slot.status !== 'overdue' && (
                            <span className={`${slot.status === 'urgent' ? 'text-orange-500 font-medium' : 'text-blue-500'
                              }`}>
                              {slot.remaining}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CourseDetails;
