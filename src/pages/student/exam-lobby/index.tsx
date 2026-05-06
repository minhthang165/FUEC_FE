import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Clock, Shield, Lock, Loader2, Play, Calendar, FileText, AlertTriangle } from 'lucide-react';
import { useGetExamsByClassSubjectIdQuery } from '@/api/examsApi';
import { useStartStudentExamMutation } from '@/api/studentExamsApi';
import { useSearchParams } from 'react-router';

// SecurityMode enum matching BE
const SecurityMode = {
  None: 0,
  StaticCode: 1,
  DynamicCode: 2,
} as const;

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '---';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '---';
  return date.toLocaleString('en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getExamStatus(startTime: string, endTime: string): 'upcoming' | 'available' | 'ended' {
  const now = Date.now();
  if (now < new Date(startTime).getTime()) return 'upcoming';
  if (now > new Date(endTime).getTime()) return 'ended';
  return 'available';
}

function getCountdown(targetTime: string): string {
  const diff = new Date(targetTime).getTime() - Date.now();
  if (diff <= 0) return '00:00:00';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function ExamLobby() {
  const navigate = useNavigate();
  const { examId } = useParams<{ examId: string }>();
  const [searchParams] = useSearchParams();
  const classSubjectId = searchParams.get('classSubjectId') || '';

  const [accessCode, setAccessCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const { data: examsData, isLoading: isLoadingExams } = useGetExamsByClassSubjectIdQuery(classSubjectId, {
    skip: !classSubjectId,
  });

  const [startStudentExam, { isLoading: isStarting }] = useStartStudentExamMutation();

  // Find the specific exam
  const exam = useMemo(() => {
    if (!examsData?.items || !examId) return null;
    return examsData.items.find(e => e.id === examId) || null;
  }, [examsData, examId]);

  const status = exam ? getExamStatus(exam.startTime, exam.endTime) : 'upcoming';
  const requiresCode = exam ? (exam.securityMode === SecurityMode.StaticCode || exam.securityMode === SecurityMode.DynamicCode) : false;
  const securityLabel = exam?.securityMode === SecurityMode.DynamicCode ? 'Dynamic Code' : exam?.securityMode === SecurityMode.StaticCode ? 'Static Code' : 'None';
  
  const isLockdownBrowser = navigator.userAgent.includes('FUECLockdownBrowser');

  // Auto-refresh countdown
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    // Clear any previous authorization for this exam when entering the lobby
    if (examId) sessionStorage.removeItem(`quiz_authorized_${examId}`);
    return () => clearInterval(timer);
  }, [examId]);

  const handleStart = async () => {
    if (!examId) return;
    setErrorMsg('');

    if (requiresCode && !accessCode.trim()) {
      setErrorMsg('Please enter the access code.');
      return;
    }

    try {
      const response = await startStudentExam({
        examId,
        accessCode: (requiresCode && !exam?.isSubmitted) ? accessCode.trim() : undefined,
      }).unwrap();

      // Authorized for this session
      sessionStorage.setItem(`quiz_authorized_${examId}`, 'true');

      // Check Lockdown Browser requirement
      const targetPath = `/student/quiz?studentExamId=${response.studentExamId}&examId=${response.examId}&classSubjectId=${classSubjectId}&appAuth=true`;
      
      if (exam?.requireLockdownBrowser && !isLockdownBrowser) {
          // Redirect via custom protocol to launch the app
          const token = localStorage.getItem('token') || '';
          const userObj = localStorage.getItem('user') || '';
          const encodedUrl = encodeURIComponent(targetPath);
          const encodedUser = encodeURIComponent(userObj);
          
          const launchUrl = `fuec://start?token=${token}&user=${encodedUser}&target=${encodedUrl}`;
          console.log('FUEC Lockdown Browser Launch URL:', launchUrl);
          
          window.location.href = launchUrl;
          setErrorMsg(
            <div className="flex flex-col gap-3">
              <p>Launching FUEC Lockdown Browser... Please click "Allow" or "Open".</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <a 
                  href={launchUrl}
                  className="inline-flex items-center justify-center px-4 py-2 bg-[#0A1B3C] text-white rounded-lg text-sm font-bold hover:bg-[#1a3a6c] transition-colors"
                >
                  Click here to open app manually
                </a>
                <button 
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center justify-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-200"
                >
                  I have opened the app
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1 italic">If nothing happens, make sure the app is installed. Check console log (F12) for launch URL.</p>
            </div> as any
          );
          return;
      }

      navigate(targetPath);
    } catch (error: any) {
      console.error('Failed to start exam', error);
      const msg = error?.data?.message || error?.data?.result || error?.message || 'Could not start the exam.';
      setErrorMsg(msg);
    }
  };

  // Loading
  if (isLoadingExams) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-[#F37022]" />
      </div>
    );
  }

  // Exam not found
  if (!exam) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center bg-white rounded-xl border border-gray-200 p-8 max-w-md">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#0A1B3C] mb-2">Exam Not Found</h2>
          <p className="text-gray-600 mb-6">This exam doesn't exist or has been deleted.</p>
          <button onClick={() => navigate(-1)} className="px-6 py-3 bg-[#F37022] text-white rounded-lg font-semibold hover:bg-[#D96419] transition-colors">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto animate-fadeIn">
      {/* Back button */}
      <button
        onClick={() => {
          if (classSubjectId) {
            navigate(`/student/course-details/${classSubjectId}`);
          } else {
            navigate('/student/exams');
          }
        }}
        className="flex items-center gap-2 text-gray-600 hover:text-[#0A1B3C] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm font-medium">Back to Course</span>
      </button>

      {/* Exam Info Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0A1B3C] to-[#1a3a6c] p-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{exam.displayName || `${exam.category} ${exam.instanceNumber}`}</h1>
              <p className="text-sm text-white/70">{exam.subjectName} ({exam.subjectCode})</p>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Calendar className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 font-medium">Start</p>
                <p className="text-sm font-semibold text-[#0A1B3C]">{formatDateTime(exam.startTime)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Clock className="w-5 h-5 text-orange-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 font-medium">Duration</p>
                <p className="text-sm font-semibold text-[#0A1B3C]">{exam.duration} minutes</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Shield className="w-5 h-5 text-purple-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 font-medium">Security</p>
                <p className="text-sm font-semibold text-[#0A1B3C]">{securityLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <FileText className="w-5 h-5 text-green-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 font-medium">Category</p>
                <p className="text-sm font-semibold text-[#0A1B3C]">{exam.category || '-'} - {exam.tag || ''}</p>
              </div>
            </div>
          </div>

          {/* Status Banner */}
          {status === 'upcoming' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-800">Exam hasn't started yet</p>
                  <p className="text-sm text-blue-600 font-mono mt-1">
                    Starting in: {getCountdown(exam.startTime)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {status === 'ended' && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <p className="text-sm font-semibold text-gray-600">Exam has ended</p>
              </div>
            </div>
          )}

          {status === 'available' && (
            exam.isSubmitted ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-blue-800">You have completed this exam</p>
                      <p className="text-sm text-blue-600 mt-0.5">Submitted at: {formatDateTime(exam.submittedAt)}</p>
                      {!exam.isPublicGrade && (
                        <p className="text-xs text-blue-500 font-medium mt-2 flex items-center gap-1.5 bg-blue-100/50 w-fit px-2 py-1 rounded-md">
                          <Lock className="w-3 h-3" />
                          Results are currently set to private by the teacher.
                        </p>
                      )}
                    </div>
                  </div>
                  {exam.grade !== null && (
                    <div className="text-right">
                      <p className="text-xs text-blue-500 font-medium uppercase tracking-wider">Score</p>
                      <p className="text-2xl font-bold text-blue-700">{exam.grade.toFixed(1)} <span className="text-sm font-normal text-blue-400">/ 10</span></p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-3">
                  <Play className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-800">Exam is open</p>
                    <p className="text-sm text-green-600 font-mono mt-1">
                      Time remaining: {getCountdown(exam.endTime)}
                    </p>
                  </div>
                </div>
              </div>
            )
          )}

          {/* Access Code Input */}
          {status === 'available' && requiresCode && !exam.isSubmitted && (
            <div className="mb-6">
              <label className="block text-sm font-semibold text-[#0A1B3C] mb-2">
                <Lock className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                Access Code
              </label>
              <input
                type="text"
                value={accessCode}
                onChange={(e) => { setAccessCode(e.target.value); setErrorMsg(''); }}
                placeholder={exam.securityMode === SecurityMode.DynamicCode ? 'Enter code from teacher...' : 'Enter access code...'}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-[#F37022] focus:outline-none text-lg font-mono tracking-wider text-center transition-colors"
                maxLength={50}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleStart(); }}
              />
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{errorMsg}</p>
            </div>
          )}

          {/* Start Button */}
          {status === 'available' && !exam.isSubmitted && (
            <div className="flex flex-col gap-4">
              <button
                onClick={handleStart}
                disabled={isStarting}
                className="w-full py-4 bg-[#F37022] text-white rounded-lg font-bold text-lg hover:bg-[#D96419] disabled:opacity-50 transition-all flex items-center justify-center gap-3 shadow-lg shadow-orange-200"
              >
                {isStarting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> {exam.requireLockdownBrowser && !isLockdownBrowser ? 'Launching App...' : 'Opening exam...'}</>
                ) : (
                  <><Play className="w-5 h-5" /> {exam.requireLockdownBrowser && !isLockdownBrowser ? 'Start & Open Lockdown Browser' : 'Start Exam'}</>
                )}
              </button>
              
              {exam.requireLockdownBrowser && !isLockdownBrowser && (
                <div className="bg-red-50/50 border border-red-200 rounded-lg p-4 flex flex-col items-center justify-center gap-2 text-center mt-2">
                  <Lock className="w-6 h-6 text-red-500 mb-1" />
                  <p className="text-sm font-semibold text-[#0A1B3C]">This exam requires the FUEC Lockdown Browser.</p>
                  <p className="text-xs text-gray-600 px-4">You will be prompted to open the app when you click Start. If you haven't downloaded it yet, please do so below.</p>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-3 mt-3 w-full sm:w-auto">
                    <a 
                      href="https://drive.google.com/file/d/1AqZF6RKjbBuezshIw6BUdTxYcI9I5w_Z/view?usp=sharing" 
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-50 border-2 border-blue-500 text-blue-700 hover:bg-blue-100 rounded-lg text-sm font-bold transition-colors"
                    >
                      <svg viewBox="0 0 87.6 87.6" className="w-4 h-4 fill-current"><path d="M0,12.4H39.2V41.6H0V12.4z M0,45.2H39.2V74.4H0V45.2z M42.4,8.1H87.6V41.6H42.4V8.1z M42.4,45.2H87.6V78.7H42.4V45.2z"/></svg>
                      Download for Windows
                    </a>
                    
                    <a 
                      href="https://drive.google.com/file/d/1otnmjHv0ET6ZYavwtEXg4OTKxnTyYgzB/view?usp=sharing" 
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-gray-50 border-2 border-gray-600 text-gray-800 hover:bg-gray-100 rounded-lg text-sm font-bold transition-colors"
                    >
                      <svg viewBox="0 0 384 512" className="w-4 h-4 fill-current"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>
                      Download for macOS
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* View Result Button for submitted exams */}
          {exam.isSubmitted && (
            exam.isPublicGrade ? (
              <button
                onClick={() => {
                  navigate(`/student/quiz?studentExamId=${exam.studentExamId}&examId=${exam.id}`);
                }}
                className="w-full py-4 bg-[#0A1B3C] text-white rounded-lg font-bold text-lg hover:bg-[#1a3a6c] transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-200"
              >
                <FileText className="w-5 h-5" /> View Results
              </button>
            ) : (
              <div className="w-full py-4 bg-gray-100 text-gray-500 rounded-lg font-bold text-lg flex items-center justify-center gap-3 border-2 border-dashed border-gray-200">
                <Lock className="w-5 h-5" /> Results Hidden
              </div>
            )
          )}

          {/* Disabled button for non-available states */}
          {status !== 'available' && (
            <button
              disabled
              className="w-full py-4 bg-gray-200 text-gray-500 rounded-lg font-bold text-lg cursor-not-allowed"
            >
              {status === 'upcoming' ? 'Not started yet' : 'Exam has ended'}
            </button>
          )}

          {/* Instructions */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-[#0A1B3C] mb-3">Notes:</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-0.5">•</span>
                Once started, the timer will begin counting down.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-0.5">•</span>
                Your answers are saved automatically as you select them.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-0.5">•</span>
                You can resume your progress if you refresh or exit.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-0.5">•</span>
                The exam will auto-submit when the timer reaches zero.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
