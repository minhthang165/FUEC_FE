import { useState, useMemo, useEffect } from 'react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    ChevronRight, ChevronLeft, Save, Plus,
    FileQuestion, Clock, Shield, Globe, Hash, Tag, Calendar, Eye, Lock, Wifi, Users
} from 'lucide-react';
import { toast } from 'sonner';
import { useGetClassSubjectByIdQuery, useGetClassSubjectSlotsQuery, useGetStudentClassesByClassIdQuery } from '@/api/classDetailsApi';
import { useGetSubjectSyllabusesQuery } from '@/api/subjectsApi';
import { useGetChapterQuestionCountsQuery } from '@/api/questionsApi';
import { useGetSyllabusAssessmentsQuery } from '@/api/syllabusApi';
import { useGetExamFormatsQuery } from '@/api/examFormatsApi';
import { useCreateExamMutation, useGetExamsByClassSubjectIdQuery } from '@/api/examsApi';
import { DatePicker, Select } from 'antd';
import dayjs from 'dayjs';
import { type ChapterQuestionCount } from '@/types/exam.types';

interface ExamFormData {
    selectionMode: 'random' | 'chapter';
    questionCount: number;
    chapterQuestionCounts: ChapterQuestionCount[];
    tag: string;
    displayName: string;
    syllabusAssessmentId: string;
    examFormatId: string;
    startTime: string;
    endTime: string;
    isPublicGrade: boolean;
    showAnswers: boolean;
    instanceNumber: number;
    securityMode: number; // 1 = Static Code, 2 = Dynamic Code
    requireIpCheck: boolean;
    allowedIpRanges: string;
    codeDuration: number;
    enableAiProctoring: boolean;
    requireLockdownBrowser: boolean;
    duration: number; // minutes
    proctoringExemptStudentClassIds: string[];
    questionMode: number; // 0 = SharedExam, 1 = UniqueExam
}

const Field = ({ label, required, error, children, icon: Icon, hint, isSubmitted }: {
    label: string;
    required?: boolean;
    error?: string;
    children: React.ReactNode;
    icon?: any;
    hint?: string;
    isSubmitted?: boolean;
}) => {
    const displayError = isSubmitted ? error : undefined;
    return (
        <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                {Icon && <Icon className="w-4 h-4 text-gray-400" />}
                {label}
                {required && <span className="text-red-500">*</span>}
            </label>
            {children}
            {hint && !displayError && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
            {displayError && <p className="text-xs text-red-500 mt-1">{displayError}</p>}
        </div>
    );
};

// Mock data — will be replaced by API calls later
function CreateExam() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const courseId = searchParams.get('course') || '';
    const targetSlotId = searchParams.get('slot') || '';

    // Fetch course data for breadcrumb
    const { data: classSubject } = useGetClassSubjectByIdQuery(courseId, {
        skip: !courseId,
    });
    const courseName = classSubject
        ? `${classSubject.subjectCode} - ${classSubject.classCode}`
        : '';

    const { data: studentsData } = useGetStudentClassesByClassIdQuery({ classSubjectId: classSubject?.id }, {
        skip: !classSubject?.id,
    });
    const students = studentsData?.items || [];

    // Fetch Syllabus and Assessments
    const { data: syllabuses } = useGetSubjectSyllabusesQuery(classSubject?.subjectId || '', {
        skip: !classSubject?.subjectId,
    });
    const syllabusId = syllabuses?.[0]?.id || '';
    const { data: assessments } = useGetSyllabusAssessmentsQuery(syllabusId, {
        skip: !syllabusId,
    });
    const filteredAssessments = assessments?.filter(
        a => a.category === 'Progress Test' || a.shortCode === 'PT' || a.category === 'Assignment' || a.shortCode === 'ASM'
    ) || [];

    // Fetch Exam Formats
    const { data: examFormatsData } = useGetExamFormatsQuery({ page: 1, pageSize: 100 });
    const examFormats = examFormatsData?.items || [];

    const [createExam, { isLoading: isCreating }] = useCreateExamMutation();

    // Fetch question counts per chapter for the subject
    const { data: chapterQuestionCounts } = useGetChapterQuestionCountsQuery(
        classSubject?.subjectId || '',
        { skip: !classSubject?.subjectId }
    );

    // Fetch progress based on slots
    const { data: slotData } = useGetClassSubjectSlotsQuery(courseId ? { id: courseId } : skipToken);

    const { currentChapterProgress, totalSubjectChapters } = useMemo(() => {
        if (!slotData?.slots) return { currentChapterProgress: 1, totalSubjectChapters: 1 };

        let currentMax = 1;
        let absoluteMax = 1;

        const targetIndex = targetSlotId ? slotData.slots.findIndex(s => s.id === targetSlotId) : -1;

        slotData.slots.forEach((slot, index) => {
            slot.sessions?.forEach((session: any) => {
                const topic = session.topic.trim();
                const keywordMatch = topic.match(/\b(?:Chương|Chapter|Ch|Chap)\.?\s*(\d+)\b/i);
                const leadingNumberMatch = topic.match(/^(\d+)(?:\.|\s|$)/);

                let ch = 0;
                if (keywordMatch) ch = parseInt(keywordMatch[1]);
                else if (leadingNumberMatch) {
                    const val = parseInt(leadingNumberMatch[1]);
                    if (val > 0 && val < 50) ch = val;
                }

                if (ch > 0 && ch <= 50) {
                    if (ch > absoluteMax) absoluteMax = ch;
                    if (targetIndex === -1 || index <= targetIndex) {
                        if (ch > currentMax) currentMax = ch;
                    }
                }
            });
        });

        return { currentChapterProgress: currentMax, totalSubjectChapters: absoluteMax };
    }, [slotData, targetSlotId]);

    const availableChapters = Array.from(
        { length: Math.min(currentChapterProgress + 1, totalSubjectChapters) },
        (_, i) => i + 1
    );

    // Fetch existing exams to handle sequence (Progress Test 1, 2, 3...)
    const { data: existingExamsData } = useGetExamsByClassSubjectIdQuery(courseId, { skip: !courseId });
    const existingExams = existingExamsData?.items || [];

    const [isSubmitted, setIsSubmitted] = useState(false);

    const [form, setForm] = useState<ExamFormData>({
        selectionMode: 'random',
        questionCount: 30,
        chapterQuestionCounts: [],
        tag: 'PT1',
        displayName: 'Progress Test 1',
        syllabusAssessmentId: '',
        examFormatId: '',
        startTime: '',
        endTime: '',
        isPublicGrade: true,
        showAnswers: true,
        instanceNumber: 1,
        securityMode: 1,
        requireIpCheck: false,
        allowedIpRanges: '',
        codeDuration: 240,
        enableAiProctoring: true,
        requireLockdownBrowser: false,
        duration: 30, // Default 30 min as per request example
        proctoringExemptStudentClassIds: [],
        questionMode: 0, // SharedExam by default
    });

    // Auto-select first assessment and set initial display name
    useEffect(() => {
        if (!form.syllabusAssessmentId && filteredAssessments.length > 0) {
            setForm(prev => ({ ...prev, syllabusAssessmentId: filteredAssessments[0].id }));
        }
    }, [filteredAssessments, form.syllabusAssessmentId]);

    // Handle initial sequence for PT titles based on target slot or existing exams
    useEffect(() => {
        if (slotData?.slots && targetSlotId) {
            const targetSlot = slotData.slots.find(s => s.id === targetSlotId);
            if (targetSlot) {
                setForm(prev => ({
                    ...prev,
                    instanceNumber: targetSlot.slotIndex,
                    tag: `PT${targetSlot.slotIndex}`,
                    displayName: `Progress Test ${targetSlot.slotIndex}`
                }));
            }
        } else if (existingExams.length > 0 && form.displayName === 'Progress Test 1') {
            const ptExams = existingExams.filter(e => e.tag?.startsWith('PT'));
            const nextIndex = ptExams.length + 1;
            setForm(prev => ({
                ...prev,
                tag: `PT${nextIndex}`,
                displayName: `Progress Test ${nextIndex}`,
                instanceNumber: nextIndex
            }));
        }
    }, [existingExams.length, slotData, targetSlotId]);

    const getMaxQuestionsForChapter = (chapter: number): number => {
        if (!chapterQuestionCounts) return 60;
        return chapterQuestionCounts[chapter] || 0;
    };

    const updateChapterCount = (chapter: number, count: number) => {
        setForm(prev => {
            if (count < 0) return prev;

            // Auto-cap at max available questions for this chapter
            const maxAvailable = getMaxQuestionsForChapter(chapter);
            const cappedCount = Math.min(count, maxAvailable);

            const existing = prev.chapterQuestionCounts.find(c => c.chapter === chapter);
            let nextCounts;

            if (cappedCount === 0) {
                nextCounts = prev.chapterQuestionCounts.filter(c => c.chapter !== chapter);
            } else if (existing) {
                nextCounts = prev.chapterQuestionCounts.map(c => c.chapter === chapter ? { ...c, count: cappedCount } : c);
            } else {
                nextCounts = [...prev.chapterQuestionCounts, { chapter, count: cappedCount }].sort((a, b) => a.chapter - b.chapter);
            }

            const total = nextCounts.reduce((acc, c) => acc + c.count, 0);
            return { ...prev, chapterQuestionCounts: nextCounts, questionCount: total };
        });
    };

    const updateField = <K extends keyof ExamFormData>(key: K, value: ExamFormData[K]) => {
        if (key === 'tag') {
            const tagVal = value as string;
            let instanceNum = 1;
            if (tagVal === 'PT2') instanceNum = 2;
            if (tagVal === 'PT3') instanceNum = 3;

            setForm(prev => {
                const defaultPrevTitle = prev.tag.startsWith('PT') ? `Progress Test ${prev.tag.match(/\d+/)?.[0] || '1'}` : prev.tag;
                const isTitleStillDefault = prev.displayName === defaultPrevTitle;
                const newTitle = tagVal.startsWith('PT') ? `Progress Test ${tagVal.match(/\d+/)?.[0] || '1'}` : tagVal;

                return {
                    ...prev,
                    tag: tagVal,
                    instanceNumber: instanceNum,
                    displayName: isTitleStillDefault ? newTitle : prev.displayName
                };
            });
        } else {
            setForm(prev => ({ ...prev, [key]: value }));
        }
    };

    // Validation
    const errors: Partial<Record<keyof ExamFormData, string>> = {};
    if (!form.displayName.trim()) errors.displayName = 'Required';
    // Only require syllabusAssessmentId if data is loaded, otherwise it will be auto-set by useEffect
    if (filteredAssessments.length > 0 && !form.syllabusAssessmentId) errors.syllabusAssessmentId = 'Required';
    if (!form.examFormatId) errors.examFormatId = 'Required';
    if (form.questionCount <= 0 || form.questionCount > 60) errors.questionCount = 'Must be 1–60';
    if (!form.startTime) errors.startTime = 'Required';
    if (!form.endTime) errors.endTime = 'Required';
    if (form.startTime && form.endTime && new Date(form.endTime) <= new Date(form.startTime)) {
        errors.endTime = 'Must be after start time';
    }
    if (form.requireIpCheck && !form.allowedIpRanges.trim()) {
        errors.allowedIpRanges = 'Required when IP check is enabled';
    }

    const isValid = Object.keys(errors).length === 0;

    const handleSubmit = async () => {
        setIsSubmitted(true);
        if (!isValid) {
            toast.error('Please fix validation errors before submitting.');
            return;
        }

        // Build API payload (Filter out selectionMode which is UI-only)
        const { selectionMode, ...formData } = form;

        const payload = {
            ...formData,
            chapterQuestionCounts: selectionMode === 'chapter' ? formData.chapterQuestionCounts : [],
            classSubjectId: courseId,
            slotId: targetSlotId || undefined,
            startTime: formData.startTime,
            endTime: formData.endTime,
            // Hardcode codeDuration to 240 for Dynamic Code
            codeDuration: 240,
        };

        try {
            await createExam(payload).unwrap();
            toast.success('Exam created successfully!');
            navigate(`/teacher/course-details/${courseId}`);
        } catch (error: any) {
            console.error('Failed to create exam:', error);
            toast.error(error?.data?.message || 'Failed to create exam. Please try again.');
        }
    };


    const inputClass = (hasError?: string) =>
        `w-full px-3.5 py-2.5 border rounded-xl text-sm transition-all focus:outline-none focus:ring-2 ${(isSubmitted && hasError)
            ? 'border-red-300 focus:ring-red-200 bg-red-50/30'
            : 'border-gray-200 focus:ring-[#F37022]/20 focus:border-[#F37022]'
        }`;

    const selectClass = (hasError?: string) =>
        `${inputClass(hasError)} appearance-none bg-white bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222.5%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20d%3D%22m19.5%208.25-7.5%207.5-7.5-7.5%22%2F%3E%3C%2Fsvg%3E')] bg-[length:14px] bg-[right_12px_center] bg-no-repeat pr-10`;

    return (
        <div className="p-4 md:p-6 animate-fadeIn">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
                <button onClick={() => navigate('/teacher')} className="hover:text-[#F37022] transition-colors">Home</button>
                <ChevronRight className="w-3.5 h-3.5" />
                <button onClick={() => navigate('/teacher/classrooms')} className="hover:text-[#F37022] transition-colors">My Classes</button>
                {courseId && (
                    <>
                        <ChevronRight className="w-3.5 h-3.5" />
                        <button onClick={() => navigate(`/teacher/course-details/${courseId}`)} className="hover:text-[#F37022] transition-colors">
                            {courseName || 'Course Details'}
                        </button>
                    </>
                )}
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-[#0A1B3C] font-medium">Create Exam</span>
            </div>

            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl md:text-3xl font-bold text-[#0A1B3C]">Create New Exam</h1>
                <p className="text-gray-500 mt-1">Configure all exam parameters before submission</p>
            </div>

            <div className="max-w-4xl mx-auto space-y-6">
                {/* ═══════════════════════════════════════════
                    Section 1: Basic Configuration
                ═══════════════════════════════════════════ */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-[#F37022]/10 flex items-center justify-center">
                            <FileQuestion className="w-4 h-4 text-[#F37022]" />
                        </div>
                        <h2 className="text-lg font-bold text-[#0A1B3C]">Basic Configuration</h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {/* Exam Format */}
                        <Field isSubmitted={isSubmitted} label="Exam Format" required error={errors.examFormatId} icon={FileQuestion}>
                            <select
                                value={form.examFormatId}
                                onChange={e => updateField('examFormatId', e.target.value)}
                                className={selectClass(errors.examFormatId)}
                            >
                                <option value="">Select format...</option>
                                {examFormats.map(ef => (
                                    <option key={ef.id} value={ef.id}>{ef.typeName} ({ef.code})</option>
                                ))}
                            </select>
                        </Field>

                        {/* Tag */}
                        <Field isSubmitted={isSubmitted} label="Tag / Label" icon={Tag}>
                            <select
                                value={form.tag}
                                onChange={e => updateField('tag', e.target.value)}
                                className={selectClass()}
                            >
                                <option value="PT1">PT1</option>
                                <option value="PT2">PT2</option>
                                <option value="PT3">PT3</option>
                            </select>
                        </Field>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-gray-100">
                        <label className="text-sm font-medium text-gray-700">Question Selection Mode</label>
                        <div className="flex gap-4">
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, selectionMode: 'random', chapterQuestionCounts: [] }))}
                                className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all ${form.selectionMode === 'random'
                                    ? 'border-[#F37022] bg-orange-50 text-[#F37022]'
                                    : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200'
                                    }`}
                            >
                                Random Questions
                            </button>
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, selectionMode: 'chapter', questionCount: 0 }))}
                                className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all ${form.selectionMode === 'chapter'
                                    ? 'border-[#F37022] bg-orange-50 text-[#F37022]'
                                    : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200'
                                    }`}
                            >
                                Select by Chapter
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-gray-100">
                        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                            <Users className="w-4 h-4 text-gray-400" />
                            Exam Distribution Mode
                        </label>
                        <div className="flex gap-4">
                            <button
                                type="button"
                                onClick={() => updateField('questionMode', 0)}
                                className={`flex-1 p-4 rounded-xl border-2 text-left transition-all ${form.questionMode === 0
                                    ? 'border-[#F37022] bg-orange-50/50 ring-1 ring-[#F37022]/20'
                                    : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                                    }`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.questionMode === 0 ? 'border-[#F37022]' : 'border-gray-300'}`}>
                                        {form.questionMode === 0 && <div className="w-2 h-2 rounded-full bg-[#F37022]" />}
                                    </div>
                                    <span className="text-sm font-semibold text-[#0A1B3C]">Shared Exam</span>
                                </div>
                                <p className="text-xs text-gray-500 ml-6">All students receive the same set of questions</p>
                            </button>
                            <button
                                type="button"
                                onClick={() => updateField('questionMode', 1)}
                                className={`flex-1 p-4 rounded-xl border-2 text-left transition-all ${form.questionMode === 1
                                    ? 'border-[#F37022] bg-orange-50/50 ring-1 ring-[#F37022]/20'
                                    : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                                    }`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.questionMode === 1 ? 'border-[#F37022]' : 'border-gray-300'}`}>
                                        {form.questionMode === 1 && <div className="w-2 h-2 rounded-full bg-[#F37022]" />}
                                    </div>
                                    <span className="text-sm font-semibold text-[#0A1B3C]">Unique Exam</span>
                                </div>
                                <p className="text-xs text-gray-500 ml-6">Each student receives a different random set of questions</p>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {/* Question Count */}
                        <Field
                            label={form.selectionMode === 'random' ? "Question Count" : "Total Question Count"}
                            required={form.selectionMode === 'random'}
                            error={errors.questionCount}
                            icon={Hash}
                            hint={form.selectionMode === 'random' ? "Number of random questions to generate" : "Calculated from chapter distribution"}
                        >
                            <input
                                type="number"
                                value={form.questionCount || ''}
                                onChange={e => form.selectionMode === 'random' && updateField('questionCount', parseInt(e.target.value) || 0)}
                                readOnly={form.selectionMode === 'chapter'}
                                className={`${inputClass(errors.questionCount)} ${form.selectionMode === 'chapter' ? 'bg-gray-50 font-semibold text-[#F37022]' : ''}`}
                                placeholder="e.g. 30"
                            />
                        </Field>
                    </div>

                    {/* Chapter Question Distribution - ONLY if selectionMode is 'chapter' */}
                    {form.selectionMode === 'chapter' && (
                        <div className="pt-4 border-t border-gray-100 animate-fadeIn">
                            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-3">
                                <Plus className="w-4 h-4 text-gray-400" />
                                Chapter Question Distribution
                                <span className="text-xs font-normal text-gray-400 ml-auto">
                                    Current Course Progress: Ch. {currentChapterProgress}
                                </span>
                            </label>

                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                {availableChapters.map(ch => {
                                    const count = form.chapterQuestionCounts.find(c => c.chapter === ch)?.count || 0;
                                    const maxAvailable = getMaxQuestionsForChapter(ch);
                                    const inputId = `chapter-input-${ch}`;

                                    return (
                                        <div
                                            key={ch}
                                            className={`p-3 rounded-xl border transition-all cursor-pointer group ${count > 0 ? 'border-[#F37022] bg-orange-50/30' : 'border-gray-100 bg-gray-50/50 hover:border-gray-200'}`}
                                            onClick={() => document.getElementById(inputId)?.focus()}
                                        >
                                            <div className="text-xs font-bold text-[#0A1B3C] mb-1.5 flex items-center justify-between">
                                                <span>Ch. {ch}</span>
                                                {ch > currentChapterProgress && <span className="text-[10px] text-orange-600 bg-orange-100 px-1 rounded">Extra</span>}
                                            </div>
                                            <div className={`grid grid-cols-2 items-center bg-white border rounded-lg py-1.5 focus-within:ring-1 focus-within:ring-[#F37022] focus-within:border-transparent transition-all ${maxAvailable === 0 ? 'border-red-200' : 'border-gray-200'}`}>
                                                <input
                                                    id={inputId}
                                                    type="number"
                                                    min="0"
                                                    max={maxAvailable}
                                                    value={count || ''}
                                                    onChange={e => {
                                                        const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                                        if (!isNaN(val)) updateChapterCount(ch, val);
                                                    }}
                                                    onFocus={(e) => e.target.select()}
                                                    className="w-full bg-transparent text-sm font-semibold text-gray-700 text-right pr-[1px] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    placeholder="0"
                                                />
                                                <span className={`text-sm font-medium text-left pl-[1px] whitespace-nowrap ${maxAvailable === 0 ? 'text-red-400' : count >= maxAvailable ? 'text-orange-500' : 'text-gray-400'}`}>
                                                    /{maxAvailable}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-[11px] text-gray-400 mt-3 italic">
                                * Select questions manually for each chapter.
                            </p>
                        </div>
                    )}
                </div>

                {/* ═══════════════════════════════════════════
                    Section 2: Schedule
                ═══════════════════════════════════════════ */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                            <Calendar className="w-4 h-4 text-blue-600" />
                        </div>
                        <h2 className="text-lg font-bold text-[#0A1B3C]">Schedule</h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <Field isSubmitted={isSubmitted} label="Start Time" required error={errors.startTime} icon={Clock}>
                            <DatePicker
                                showTime
                                format="YYYY-MM-DD HH:mm"
                                className="w-full h-[42px] border-gray-200 rounded-xl hover:border-[#F37022] focus:border-[#F37022]"
                                value={form.startTime ? dayjs(form.startTime) : null}
                                onChange={(date) => updateField('startTime', date ? date.toISOString() : '')}
                                placeholder="Select start date & time"
                            />
                        </Field>

                        <Field isSubmitted={isSubmitted} label="End Time" required error={errors.endTime} icon={Clock}>
                            <DatePicker
                                showTime
                                format="YYYY-MM-DD HH:mm"
                                className="w-full h-[42px] border-gray-200 rounded-xl hover:border-[#F37022] focus:border-[#F37022]"
                                value={form.endTime ? dayjs(form.endTime) : null}
                                onChange={(date) => updateField('endTime', date ? date.toISOString() : '')}
                                placeholder="Select end date & time"
                                disabledDate={(current) => {
                                    if (!form.startTime) return false;
                                    return current && current.isBefore(dayjs(form.startTime), 'day');
                                }}
                            />
                        </Field>

                        <Field isSubmitted={isSubmitted} label="Duration (Minutes)" required icon={Clock} hint="Number of minutes students have to complete the exam.">
                            <input
                                type="number"
                                value={form.duration || ''}
                                onChange={e => updateField('duration', parseInt(e.target.value) || 0)}
                                className={inputClass()}
                                placeholder="e.g. 30"
                            />
                        </Field>
                    </div>
                </div>

                {/* ═══════════════════════════════════════════
                    Section 3: Security & Options
                ═══════════════════════════════════════════ */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                            <Shield className="w-4 h-4 text-purple-600" />
                        </div>
                        <h2 className="text-lg font-bold text-[#0A1B3C]">Security & Options</h2>
                    </div>

                    <div className="space-y-5">
                        {/* Security Mode */}
                        <Field isSubmitted={isSubmitted} label="Security Mode" icon={Lock}>
                            <div className="flex gap-3">
                                {[
                                    { value: 1, label: 'Static Code', desc: 'One exam code for the entire session' },
                                    { value: 2, label: 'Dynamic Code', desc: 'Code refreshes periodically' },
                                ].map(mode => (
                                    <button
                                        key={mode.value}
                                        type="button"
                                        onClick={() => updateField('securityMode', mode.value)}
                                        className={`flex-1 p-4 rounded-xl border-2 text-left transition-all ${form.securityMode === mode.value
                                            ? 'border-[#F37022] bg-orange-50/50 ring-1 ring-[#F37022]/20'
                                            : 'border-gray-200 hover:border-gray-300 bg-white'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.securityMode === mode.value
                                                ? 'border-[#F37022]'
                                                : 'border-gray-300'
                                                }`}>
                                                {form.securityMode === mode.value && (
                                                    <div className="w-2 h-2 rounded-full bg-[#F37022]" />
                                                )}
                                            </div>
                                            <span className="text-sm font-semibold text-[#0A1B3C]">{mode.label}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 ml-6">{mode.desc}</p>
                                    </button>
                                ))}
                            </div>
                        </Field>

                        <div className="hidden">
                            <Field isSubmitted={isSubmitted} label="Code Duration (seconds)" icon={Clock} hint="How long each code remains valid">
                                <input
                                    type="number"
                                    value={form.codeDuration}
                                    onChange={e => updateField('codeDuration', parseInt(e.target.value) || 240)}
                                    min={10}
                                    className={inputClass()}
                                />
                            </Field>
                        </div>

                        {/* Toggles Row */}
                        <div className="grid grid-cols-1 gap-5">
                            {/* Display Name */}
                            <Field isSubmitted={isSubmitted} label="Exam Title / Display Name" required error={errors.displayName} icon={FileQuestion} hint="Enter a clear name for students (e.g. Progress Test 1 - Logic Circuit)">
                                <input
                                    type="text"
                                    value={form.displayName}
                                    onChange={e => updateField('displayName', e.target.value)}
                                    className={inputClass(errors.displayName)}
                                    placeholder="Enter exam title..."
                                />
                            </Field>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {/* Public Grade Toggle */}
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <Eye className="w-4 h-4 text-gray-500" />
                                    <div>
                                        <p className="text-sm font-medium text-[#0A1B3C]">Public Grade</p>
                                        <p className="text-xs text-gray-500">Students can see their grades</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => updateField('isPublicGrade', !form.isPublicGrade)}
                                    className={`relative w-11 h-6 rounded-full transition-colors ${form.isPublicGrade ? 'bg-[#F37022]' : 'bg-gray-300'
                                        }`}
                                >
                                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.isPublicGrade ? 'translate-x-[22px]' : 'translate-x-0.5'
                                        }`} />
                                </button>
                            </div>

                            {/* Show Answers Toggle */}
                            <div className={`flex items-center justify-between p-4 bg-gray-50 rounded-xl transition-all ${!form.isPublicGrade ? 'opacity-50 pointer-events-none' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <Eye className="w-4 h-4 text-gray-500" />
                                    <div>
                                        <p className="text-sm font-medium text-[#0A1B3C]">Show Answers</p>
                                        <p className="text-xs text-gray-500">Students can see correct answers</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    disabled={!form.isPublicGrade}
                                    onClick={() => updateField('showAnswers', !form.showAnswers)}
                                    className={`relative w-11 h-6 rounded-full transition-colors ${form.showAnswers ? 'bg-[#F37022]' : 'bg-gray-300'
                                        }`}
                                >
                                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.showAnswers ? 'translate-x-[22px]' : 'translate-x-0.5'
                                        }`} />
                                </button>
                            </div>
                        </div>

                        {/* AI Proctoring Toggle */}
                        <div className="pt-4 border-t border-gray-100">
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <Shield className="w-4 h-4 text-gray-500" />
                                    <div>
                                        <p className="text-sm font-medium text-[#0A1B3C]">AI Proctoring</p>
                                        <p className="text-xs text-gray-500">Enable webcam & head-pose detection during exam</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => updateField('enableAiProctoring', !form.enableAiProctoring)}
                                    className={`relative w-11 h-6 rounded-full transition-colors ${form.enableAiProctoring ? 'bg-[#F37022]' : 'bg-gray-300'
                                        }`}
                                >
                                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.enableAiProctoring ? 'translate-x-[22px]' : 'translate-x-0.5'
                                        }`} />
                                </button>
                            </div>
                        </div>

                        {/* Require Lockdown Browser Toggle */}
                        <div className="pt-4 border-t border-gray-100">
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <Lock className="w-4 h-4 text-gray-500" />
                                    <div>
                                        <p className="text-sm font-medium text-[#0A1B3C]">Require Lockdown Browser</p>
                                        <p className="text-xs text-gray-500">Force students to take this exam via the official Lockdown Browser app</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => updateField('requireLockdownBrowser', !form.requireLockdownBrowser)}
                                    className={`relative w-11 h-6 rounded-full transition-colors ${form.requireLockdownBrowser ? 'bg-red-500' : 'bg-gray-300'
                                        }`}
                                >
                                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.requireLockdownBrowser ? 'translate-x-[22px]' : 'translate-x-0.5'
                                        }`} />
                                </button>
                            </div>
                        </div>

                        {/* Proctoring Exemption List — only when AI Proctoring is enabled */}
                        {form.enableAiProctoring && (
                            <div className="pt-4 border-t border-gray-100">
                                <Field isSubmitted={isSubmitted} label="AI Proctoring Exemptions" icon={Shield} hint="Select students who cannot use webcams (will bypass AI proctoring)">
                                    <Select
                                        mode="multiple"
                                        allowClear
                                        placeholder="Select students to exempt..."
                                        style={{ width: '100%' }}
                                        className="!rounded-xl"
                                        value={form.proctoringExemptStudentClassIds}
                                        onChange={(value) => updateField('proctoringExemptStudentClassIds', value)}
                                        options={students.map((student) => ({
                                            label: `${student.studentCode} - ${student.studentName}`,
                                            value: student.id,
                                        }))}
                                    />
                                </Field>
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══════════════════════════════════════════
                    Section 4: Summary Preview
                ═══════════════════════════════════════════ */}
                <div className="bg-gradient-to-r from-[#0A1B3C] to-[#142d5c] rounded-2xl p-6 text-white">
                    <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wide mb-4">Summary</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div>
                            <div className="text-2xl font-bold">{form.questionCount}</div>
                            <div className="text-xs text-white/60">Questions</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{form.securityMode === 1 ? 'Static' : 'Dynamic'}</div>
                            <div className="text-xs text-white/60">Security Mode</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{form.questionMode === 0 ? 'Shared' : 'Unique'}</div>
                            <div className="text-xs text-white/60">Distribution</div>
                        </div>
                        {form.securityMode === 2 && (
                            <div>
                                <div className="text-2xl font-bold">240s</div>
                                <div className="text-xs text-white/60">Code Duration</div>
                            </div>
                        )}
                    </div>
                    {form.startTime && form.endTime && (
                        <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-4 text-sm">
                            <span className="text-white/70">
                                📅 {new Date(form.startTime).toLocaleString('vi-VN')} → {new Date(form.endTime).toLocaleString('vi-VN')}
                            </span>
                        </div>
                    )}
                </div>

                {/* ═══════════════════════════════════════════
                    Action Buttons
                ═══════════════════════════════════════════ */}
                <div className="flex items-center justify-between pt-2 pb-8">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isCreating}
                        className="flex items-center gap-2 px-6 py-2.5 bg-[#F37022] text-white rounded-xl text-sm font-semibold hover:bg-[#d95f19] shadow-lg shadow-orange-200/50 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isCreating ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Creating...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Create Exam
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default CreateExam;
