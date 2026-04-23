import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import dayjs from 'dayjs';
import { useSelector } from 'react-redux';
import {
    ChevronRight,
    Send,
    BookOpen,
    Calendar,
    FileText,
    CheckCircle,
    XCircle,
    Clock,
    Loader2,
    Trash2,
    Edit2
} from 'lucide-react';
import { Button as AntButton, message } from 'antd';
import { selectCurrentUser } from '@/redux/authSlice';
import { useGetSlotQuestionContentsBySlotIdQuery } from '@/api/slotQuestionContentsApi';
import { useGetClassSubjectSlotsQuery } from '@/api/classDetailsApi';
import {
    useGetSlotAnswersByStudentAndSlotQuery,
    useGetSlotAnswersByQuestionIdQuery,
    useSubmitSlotAnswerMutation,
    useDeleteSlotAnswerMutation,
    useEditSlotAnswerMutation,
} from '@/api/studentSlotAnswersApi';
import type { StudentSlotAnswerDto } from '@/api/studentSlotAnswersApi';

function QuestionDetail() {
    const navigate = useNavigate();
    const { id: questionId } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const slotId = searchParams.get('slotId') || '';
    const classSubjectId = searchParams.get('classSubjectId') || '';
    const readOnlyParam = searchParams.get('readOnly') ?? '';
    const isReadOnly = readOnlyParam === 'true' || readOnlyParam === 'inactive' || readOnlyParam === 'expired';
    const user = useSelector(selectCurrentUser);
    const studentId = user?.entityId ?? user?.id ?? '';

    const [answer, setAnswer] = useState('');
    const [cooldownSeconds, setCooldownSeconds] = useState<number | null>(null);
    const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const myAnswerRef = useRef<HTMLDivElement | null>(null);

    // Format seconds to mm:ss
    const formatCooldown = (secs: number) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    // Fetch all questions for this slot
    const { data: questions = [], isLoading: isLoadingQuestions } = useGetSlotQuestionContentsBySlotIdQuery(slotId, {
        skip: !slotId,
    });

    // Find the current question from the list
    const currentQuestion = useMemo(() => {
        return questions.find(q => q.id === questionId);
    }, [questions, questionId]);

    // Find slot index for display
    const currentQuestionIndex = useMemo(() => {
        return questions.findIndex(q => q.id === questionId);
    }, [questions, questionId]);

    // Fetch slot data to get the countdown end time
    const { data: slotsData, refetch: refetchSlotData } = useGetClassSubjectSlotsQuery(
        { id: classSubjectId, studentId },
        { skip: !classSubjectId || !studentId }
    );

    const currentSlot = useMemo(() => {
        if (!slotsData?.slots || !slotId) return null;
        const index = slotsData.slots.findIndex((s: any) => s.id === slotId);
        if (index === -1) return null;

        const s = slotsData.slots[index];
        const nextDate = (index + 1 < slotsData.slots.length) ? slotsData.slots[index + 1].date : null;
        const calcEndTime = nextDate || dayjs(s.date).add(3, 'day').format('YYYY-MM-DDTHH:mm:ss');

        return { ...s, calculatedEndTime: calcEndTime };
    }, [slotsData, slotId]);

    const SlotCountdownRed = ({ endTime, onFinished }: { endTime: string, onFinished: () => void }) => {
        const [timeLeft, setTimeLeft] = useState<number>(0);

        useEffect(() => {
            const calculateTime = () => {
                const now = Date.now();
                const end = new Date(endTime).getTime();
                return Math.max(0, end - now);
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
        }, [endTime, onFinished]);

        if (timeLeft <= 0) return null;

        const d = Math.floor(timeLeft / 86400000);
        const h = Math.floor((timeLeft % 86400000) / 3600000);
        const m = Math.floor((timeLeft % 3600000) / 60000);
        const s = Math.floor((timeLeft % 60000) / 1000);

        return (
            <div className="flex items-center gap-2 text-red-600 font-mono font-bold tabular-nums bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 w-fit">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                <div className="flex items-baseline gap-1.5 whitespace-nowrap text-[12px]">
                    <span>Questions end in:</span>
                    <span>
                        {d > 0 ? `${d}d ` : ''}{h > 0 ? `${h}h ` : ''}{m.toString().padStart(2, '0')}m {s.toString().padStart(2, '0')}s
                    </span>
                </div>
            </div>
        );
    };

    // Fetch existing answers for this student + slot
    const { data: allSlotAnswers = [], isLoading: isLoadingAnswers, refetch: refetchSlotAnswers } = useGetSlotAnswersByStudentAndSlotQuery(
        { studentId, slotId },
        { skip: !studentId || !slotId }
    );

    // Fetch ALL answers for this question (so student can see classmates' answers too)
    const { data: questionAnswers = [], isLoading: isLoadingQuestionAnswers, refetch: refetchQuestionAnswers } = useGetSlotAnswersByQuestionIdQuery(questionId!, {
        skip: !questionId,
    });

    // Determine the student's own answers for this question to enforce attempt limits
    const myAnswers = useMemo(() => {
        return questionAnswers.filter(a => a.studentId === studentId);
    }, [questionAnswers, studentId]);

    // The most recent answer for this question from THIS student
    const latestAnswer = useMemo(() => {
        if (myAnswers.length === 0) return undefined;
        return myAnswers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    }, [myAnswers]);

    const hasPassed = useMemo(() => myAnswers.some(a => a.isPassed === true), [myAnswers]);

    // Locked only when the student has passed
    const isLocked = hasPassed;

    // Can submit: slot is active, not passed, and no active cooldown
    const canSubmit = useMemo(() => {
        if (isReadOnly) return false;
        if (hasPassed) return false;
        if (cooldownSeconds !== null) return false;
        return true;
    }, [isReadOnly, hasPassed, cooldownSeconds]);


    // Status map for sidebar: { questionId: 'passed' | 'failed' | 'none' }
    const questionStatusMap = useMemo(() => {
        const map: Record<string, 'passed' | 'failed' | 'none'> = {};

        // Group answers by question ID
        const groupedAnswers: Record<string, StudentSlotAnswerDto[]> = {};
        allSlotAnswers.forEach(ans => {
            if (!groupedAnswers[ans.slotQuestionContentId]) {
                groupedAnswers[ans.slotQuestionContentId] = [];
            }
            groupedAnswers[ans.slotQuestionContentId].push(ans);
        });

        questions.forEach(q => {
            const qAnswers = groupedAnswers[q.id] || [];
            if (qAnswers.length === 0) {
                map[q.id] = 'none';
            } else if (qAnswers.some(a => a.isPassed === true)) {
                map[q.id] = 'passed';
            } else if (qAnswers.some(a => a.isPassed === false)) {
                // If all attempts failed (we check if there are no 'true' above)
                map[q.id] = 'failed';
            } else {
                map[q.id] = 'none'; // Pending review
            }
        });

        return map;
    }, [allSlotAnswers, questions]);

    const answeredQuestionIds = useMemo(() => {
        return new Set(allSlotAnswers.map(a => a.slotQuestionContentId));
    }, [allSlotAnswers]);

    // Mutations
    const [submitSlotAnswer, { isLoading: isSubmitting }] = useSubmitSlotAnswerMutation();
    const [deleteSlotAnswer] = useDeleteSlotAnswerMutation();
    const [editSlotAnswer, { isLoading: isEditing }] = useEditSlotAnswerMutation();

    // ── Account-based cooldown: recalculate from DB timestamp on load ──────────
    // When a student has exactly 2 failed answers, the cooldown end is
    // (createdAt of the 2nd answer) + 1 hour.  We compute remaining seconds
    // from the server data so it works across page reloads and devices.
    const parseUTC = (dateStr: string) => dayjs(dateStr).toDate();

    // Cooldown: after any failed attempt, the student must wait 5 min before retrying.
    // Computed from the latest failed answer's createdAt.
    useEffect(() => {
        const latestFailed = [...myAnswers]
            .filter(a => a.isPassed === false)
            .sort((a, b) => parseUTC(b.createdAt).getTime() - parseUTC(a.createdAt).getTime())[0];

        if (latestFailed && !hasPassed) {
            const cooldownEnd = parseUTC(latestFailed.createdAt).getTime() + 5 * 60 * 1000; // 5 min (change to 60*60*1000 for prod)
            const remaining = Math.floor((cooldownEnd - Date.now()) / 1000);
            if (remaining > 0) {
                setCooldownSeconds(prev => (prev === null ? remaining : prev));
            } else {
                setCooldownSeconds(null);
            }
        } else {
            setCooldownSeconds(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [myAnswers.length, questionId]);

    // Tick the countdown every second while active
    useEffect(() => {
        if (cooldownSeconds !== null && cooldownSeconds > 0) {
            cooldownTimerRef.current = setInterval(() => {
                setCooldownSeconds(prev => {
                    if (prev === null || prev <= 1) {
                        if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
                        return null;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => { if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cooldownSeconds !== null]);

    const [editingAnswerId, setEditingAnswerId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');

    useEffect(() => {
        if (!isLoadingAnswers && !isLoadingQuestionAnswers && myAnswerRef.current) {
            setTimeout(() => {
                myAnswerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 600);
        }
    }, [isLoadingAnswers, isLoadingQuestionAnswers, questionId]);

    const handleSubmitAnswer = async () => {
        if (!answer.trim() || !questionId || !studentId) return;

        try {
            await submitSlotAnswer({
                studentId,
                slotQuestionContentId: questionId,
                answerText: answer.trim(),
            }).unwrap();

            message.success('Answer submitted successfully!');
            setAnswer('');
        } catch (err: any) {
            const raw = err?.data?.message || err?.data?.result || '';
            if (raw.startsWith('COOLDOWN:')) {
                const seconds = parseInt(raw.split(':')[1], 10);
                setCooldownSeconds(seconds);
            } else {
                message.error(raw || 'Failed to submit answer');
            }
        } finally {
            // Always refetch so FE state stays in sync with DB
            refetchQuestionAnswers();
            refetchSlotAnswers();
        }
    };

    const handleEditSave = async (id: string) => {
        if (!editContent.trim()) return;
        try {
            await editSlotAnswer({
                id,
                studentId,
                answerText: editContent.trim(),
            }).unwrap();
            message.success('Answer updated successfully!');
            setEditingAnswerId(null);
            setEditContent('');
        } catch (err: any) {
            message.error(err?.data?.message || err?.data?.result || 'Failed to update answer');
        }
    };

    const handleDeleteAnswer = async (answerId: string) => {
        try {
            await deleteSlotAnswer(answerId).unwrap();
            message.success('Answer deleted');
        } catch {
            message.error('Failed to delete answer');
        }
    };

    const isLoading = isLoadingQuestions || isLoadingAnswers || isLoadingQuestionAnswers;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-[#F37022]" />
            </div>
        );
    }

    if (!currentQuestion) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500">
                <BookOpen className="w-12 h-12 mb-4 text-gray-300" />
                <p className="text-lg font-medium">Question not found</p>
                <p className="text-sm mt-1">The question may have been removed or the link is invalid.</p>
                <button
                    onClick={() => navigate(-1)}
                    className="mt-4 px-4 py-2 bg-[#F37022] text-white rounded-lg hover:bg-[#D96419] transition-colors"
                >
                    Go Back
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 relative p-4 md:p-6 animate-fadeIn">
            {/* Main Content */}
            <div className="flex-1 min-w-0">
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                    <button onClick={() => navigate('/student')} className="hover:text-[#F37022] transition-colors">
                        Home
                    </button>
                    <ChevronRight className="w-4 h-4" />
                    <button
                        onClick={() => classSubjectId ? navigate(`/student/course-details/${classSubjectId}`) : navigate('/student')}
                        className="hover:text-[#F37022] transition-colors"
                    >
                        Course Details
                    </button>
                    <ChevronRight className="w-4 h-4" />
                    <span className="text-[#0A1B3C] font-medium truncate max-w-xs">
                        {currentQuestion.content}
                    </span>
                </div>

                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl md:text-3xl font-bold text-[#0A1B3C] mb-2">
                        {currentQuestion.content}
                    </h1>
                    {currentQuestion.description && (
                        <p className="text-gray-600 mt-2">{currentQuestion.description}</p>
                    )}
                    <div className="space-y-3 mt-3">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-4 h-4" />
                            <span>Created: {new Date(currentQuestion.createdAt).toLocaleDateString()}</span>
                        </div>

                    </div>
                </div>

                {/* Question Content */}
                {isReadOnly && (
                    <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-500">
                        <XCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span>
                            {readOnlyParam === 'inactive'
                                ? 'This slot has not started yet. You can view questions but cannot submit answers.'
                                : 'This slot has ended. You can view answers but cannot submit or edit.'}
                        </span>
                    </div>
                )}
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                    <h2 className="text-lg font-bold text-[#0A1B3C] mb-4">Content</h2>
                    <p className="text-gray-700">{currentQuestion.content}</p>
                    {currentQuestion.description && (
                        <p className="text-gray-500 mt-3 text-sm">{currentQuestion.description}</p>
                    )}
                </div>

                {/* Discussion / Answers */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-lg font-bold text-[#0A1B3C] mb-6">
                        Discussion
                        {questionAnswers.length > 0 && (
                            <span className="ml-2 text-sm font-normal text-gray-500">
                                ({questionAnswers.length} {questionAnswers.length === 1 ? 'answer' : 'answers'})
                            </span>
                        )}
                    </h2>

                    {/* Answer Submission — shown when student has not passed and not permanently locked */}
                    {!isReadOnly && !isLocked && (
                        <div className="space-y-3 mb-6">
                            <label className="block text-sm font-semibold text-[#0A1B3C]">
                                {latestAnswer?.isPassed === false ? 'Retry — write a new answer:' : 'Your Answer'}
                            </label>
                            <div className={`relative rounded-lg transition-all ${cooldownSeconds !== null ? 'opacity-60' : ''}`}>
                                <textarea
                                    value={answer}
                                    onChange={(e) => setAnswer(e.target.value)}
                                    placeholder={cooldownSeconds !== null ? 'You are on cooldown. Please wait before retrying...' : 'Write your answer here...'}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:border-[#F37022] focus:ring-2 focus:ring-orange-100 outline-none resize-none transition-all disabled:bg-gray-50 disabled:cursor-not-allowed"
                                    rows={6}
                                    maxLength={4000}
                                    disabled={cooldownSeconds !== null}
                                />
                                {cooldownSeconds !== null && (
                                    <div className="absolute inset-0 rounded-lg cursor-not-allowed" />
                                )}
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-400">{answer.length}/4000</span>
                                <AntButton
                                    type="primary"
                                    onClick={handleSubmitAnswer}
                                    loading={isSubmitting}
                                    disabled={!answer.trim() || cooldownSeconds !== null}
                                    className="flex items-center gap-2 h-10 px-6 bg-[#F37022] hover:bg-[#D96419] border-none text-white font-semibold rounded-lg transition-all hover-lift disabled:opacity-50"
                                    icon={!isSubmitting && <Send className="w-4 h-4" />}
                                >
                                    {isSubmitting ? 'Submitting...' : 'Submit Answer'}
                                </AntButton>
                            </div>

                            {/* Cooldown countdown below textarea */}
                            {cooldownSeconds !== null && (
                                <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
                                        <Clock className="w-4 h-4 text-amber-600" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-semibold text-amber-700">Cooldown active</p>
                                        <p className="text-xs text-amber-600">You can retry in <span className="font-bold font-mono">{formatCooldown(cooldownSeconds)}</span></p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Permanently locked (all 3 attempts failed) */}
                    {!isReadOnly && isLocked && !hasPassed && (
                        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                            You have used all 3 attempts for this question. The answer is permanently locked.
                        </div>
                    )}

                    {/* Passed — show success */}
                    {!isReadOnly && hasPassed && (
                        <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                            You have passed this question.
                        </div>
                    )}

                    {/* Answers List */}
                    <div className="space-y-4">
                        {questionAnswers.length === 0 && (
                            <div className="text-center py-8 text-gray-400">
                                <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                                <p className="text-sm">No answers yet. Be the first to answer!</p>
                            </div>
                        )}

                        {questionAnswers.map((ans: StudentSlotAnswerDto) => (
                            <div
                                key={ans.id}
                                className="animate-slideUp"
                                ref={ans.studentId === studentId ? myAnswerRef : null}
                            >
                                {/* Author and Timestamp */}
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                                            <span className="text-white text-xs font-semibold">
                                                {(ans.studentName || 'U')
                                                    .split(' ')
                                                    .map(n => n[0])
                                                    .join('')
                                                    .slice(0, 2)}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-[#0A1B3C]">
                                                {ans.studentName || 'Unknown Student'}
                                                {ans.studentCode && (
                                                    <span className="ml-2 text-xs text-gray-400 font-normal">
                                                        ({ans.studentCode})
                                                    </span>
                                                )}
                                                {ans.studentId === studentId && (
                                                    <span className="ml-2 text-xs font-semibold text-[#F37022] bg-orange-50 px-2 py-0.5 rounded-full">
                                                        You
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {new Date(ans.createdAt.endsWith('Z') ? ans.createdAt : ans.createdAt + 'Z').toLocaleDateString()}{' '}
                                                {new Date(ans.createdAt.endsWith('Z') ? ans.createdAt : ans.createdAt + 'Z').toLocaleTimeString()}
                                                {ans.updatedAt && new Date(ans.updatedAt.endsWith('Z') ? ans.updatedAt : ans.updatedAt + 'Z').getTime() > new Date(ans.createdAt.endsWith('Z') ? ans.createdAt : ans.createdAt + 'Z').getTime() + 1000 && (
                                                    <span className="italic ml-1">(edited)</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {/* Grade badge */}
                                        {ans.isPassed === true && (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                                                Passed ✓
                                            </span>
                                        )}
                                        {ans.isPassed === false && (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                                                Not Passed ✗
                                            </span>
                                        )}

                                        {/* Edit/Delete actions — only for ungraded own answers */}
                                        {ans.studentId === studentId && !ans.isPassed && !ans.teacherFeedback && !ans.isAIGraded && (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => {
                                                        setEditingAnswerId(ans.id);
                                                        setEditContent(ans.answerText);
                                                    }}
                                                    className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Edit answer"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteAnswer(ans.id)}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Delete answer"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Content Box */}
                                <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                                    {editingAnswerId === ans.id ? (
                                        <div className="space-y-3">
                                            <textarea
                                                value={editContent}
                                                onChange={(e) => setEditContent(e.target.value)}
                                                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none transition-all text-sm"
                                                rows={4}
                                            />
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => {
                                                        setEditingAnswerId(null);
                                                        setEditContent('');
                                                    }}
                                                    className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <AntButton
                                                    type="primary"
                                                    loading={isEditing}
                                                    onClick={() => handleEditSave(ans.id)}
                                                    className="bg-blue-600 border-none hover:bg-blue-700"
                                                >
                                                    Save Edit
                                                </AntButton>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                                            {ans.answerText}
                                        </p>
                                    )}
                                </div>

                                {/* Teacher or AI feedback */}
                                {ans.teacherFeedback && (
                                    ans.isAIGraded ? (
                                        <div className="mt-2 flex items-start gap-2 bg-purple-50 border border-purple-100 rounded-lg p-3">
                                            <span className="text-purple-600 font-bold text-xs mt-0.5 flex-shrink-0">✨ AI Feedback:</span>
                                            <p className="text-sm text-gray-700">{ans.teacherFeedback}</p>
                                        </div>
                                    ) : (
                                        <div className="mt-2 flex items-start gap-2 bg-orange-50 border border-orange-100 rounded-lg p-3">
                                            <span className="text-[#F37022] font-bold text-xs mt-0.5 flex-shrink-0">💬 Teacher:</span>
                                            <p className="text-sm text-gray-700">{ans.teacherFeedback}</p>
                                        </div>
                                    )
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right Sidebar - Slot Questions */}
            <div className="w-full lg:w-64 flex-shrink-0">
                <div className="sticky top-6">
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <h3 className="font-bold text-[#0A1B3C] mb-3">Questions</h3>

                        {/* Questions List */}
                        <div className="space-y-1">
                            {questions.map((q, idx) => (
                                <button
                                    key={q.id}
                                    onClick={() => navigate(`/student/course-details/questions/${q.id}?slotId=${slotId}&classSubjectId=${classSubjectId}`)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${questionId === q.id
                                        ? 'bg-orange-50 text-[#F37022] font-medium'
                                        : 'text-gray-700 hover:bg-gray-50 hover:text-[#F37022]'
                                        }`}
                                >
                                    <FileText className="w-4 h-4 flex-shrink-0" />
                                    <span className="flex-1 truncate">{idx + 1}. {q.content}</span>
                                    {questionStatusMap[q.id] === 'passed' && (
                                        <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                                    )}
                                    {questionStatusMap[q.id] === 'failed' && (
                                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                    )}
                                    {questionStatusMap[q.id] === 'none' && answeredQuestionIds.has(q.id) && (
                                        <div className="w-4 h-4 rounded-full bg-gray-200" title="Answered, pending review" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default QuestionDetail;
