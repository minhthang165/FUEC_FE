import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import {
    ChevronRight, Users, User, FileText, Calendar, ClipboardCheck, Plus,
    ChevronDown, ChevronUp, Clock, Loader2, Pencil, Trash2, Upload, BookOpen, Download, Eye
} from 'lucide-react';
import { Modal } from 'antd';
import dayjs from 'dayjs';
import {
    useGetClassSubjectByIdQuery,
    useGetClassSubjectSlotsQuery,
    useGetStudentClassesByClassIdQuery,
    useLazyExportGradesQuery,
    useLazyExportQuestionReportQuery
} from '@/api/classDetailsApi';
import { useGetExamsByClassSubjectIdQuery, useDeleteExamMutation } from '@/api/examsApi';
import { useGetAssignmentsByClassSubjectIdQuery, useDeleteAssignmentMutation } from '@/api/assignmentsApi';
import { useGetCourseMaterialsByClassSubjectIdQuery, useCreateCourseMaterialMutation, useDeleteCourseMaterialMutation } from '@/api/courseMaterialsApi';
import { useUploadFileMutation } from '@/api/filesApi';
import { useCreateSlotQuestionContentMutation } from '@/api/slotQuestionContentsApi';
import ExamDetailModal from '@/components/modals/ExamDetailModal';
import EditExamModal from '@/components/modals/EditExamModal';
import CreateAssignmentModal from '@/components/modals/CreateAssignmentModal';
import EditAssignmentModal from '@/components/modals/EditAssignmentModal';
import SlotQuestionList from './SlotQuestionList';
import AssignmentSubmissionCount from './AssignmentSubmissionCount';
import type { Exam } from '@/types/exam.types';
import type { Assignment } from '@/types/assignment.types';
import ConfirmDeleteModal from '@/components/shared/ConfirmDeleteModal';
import SlotQuestionContentModal from '@/components/modals/SlotQuestionContentModal';
import ExamParticipantsModal from '@/components/modals/ExamParticipantsModal';
import ZipFolderBrowser from '@/components/ZipFolderBrowser';
import MaterialFilePreview from '@/components/MaterialFilePreview';
import CloneConfigModal from '@/components/modals/CloneConfigModal';
import UploadMaterialModal from '@/components/modals/UploadMaterialModal';

type SlotAssignment = Assignment;

interface Slot {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    topics: string[];
    assignments: SlotAssignment[];
    progressTests: Exam[];
    expanded: boolean;
    isAssessment: boolean;
    slotIndex: number;
    status: string;
    hasQuestions: boolean;
    rawStartTime: string;
    rawEndTime: string;
}

function TeacherCourseDetails() {
    const navigate = useNavigate();
    const { courseId } = useParams();
    const [activeTab, setActiveTab] = useState('slots');
    const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
    const [isExamDetailModalOpen, setIsExamDetailModalOpen] = useState(false);
    const [isEditExamModalOpen, setIsEditExamModalOpen] = useState(false);
    const [examToEdit, setExamToEdit] = useState<Exam | null>(null);
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null);
    const [isCreateAssignmentModalOpen, setIsCreateAssignmentModalOpen] = useState(false);
    const [createAssignmentSlotInfo, setCreateAssignmentSlotInfo] = useState<{ id: string; title: string; slotIndex: number } | null>(null);
    const [isEditAssignmentModalOpen, setIsEditAssignmentModalOpen] = useState(false);
    const [assignmentToEdit, setAssignmentToEdit] = useState<Assignment | null>(null);

    const [triggerExportGrades, { isLoading: isExporting }] = useLazyExportGradesQuery();
    const [triggerExportQuestionReport, { isLoading: isExportingReport }] = useLazyExportQuestionReportQuery();

    const handleExportGrades = async () => {
        if (!courseId) return;
        try {
            const blob = await triggerExportGrades(courseId).unwrap();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Grades_${classSubject?.classCode || ''}_${classSubject?.subjectCode || ''}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success('Grades exported successfully');
        } catch (error) {
            console.error('Failed to export grades:', error);
            toast.error('Failed to export grades. Please try again.');
        }
    };

    const handleExportQuestionReport = async () => {
        if (!courseId) return;
        try {
            const blob = await triggerExportQuestionReport(courseId).unwrap();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `QuestionReport_${classSubject?.classCode || ''}_${classSubject?.subjectCode || ''}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success('Question report exported successfully');
        } catch (error) {
            console.error('Failed to export question report:', error);
            toast.error('Failed to export question report. Please try again.');
        }
    };

    // Slot Question Create State
    const [isCreateQuestionModalOpen, setIsCreateQuestionModalOpen] = useState(false);
    const [createQuestionSlotInfo, setCreateQuestionSlotInfo] = useState<{ id: string; title: string; topics?: string[] } | null>(null);
    const [hasQuestionsMap, setHasQuestionsMap] = useState<Record<string, boolean>>({});
    // API
    const [deleteExam] = useDeleteExamMutation();
    const [createSlotQuestion, { isLoading: isCreatingQuestion }] = useCreateSlotQuestionContentMutation();
    const [isAssignmentDeleteModalOpen, setIsAssignmentDeleteModalOpen] = useState(false);
    const [assignmentToDelete, setAssignmentToDelete] = useState<Assignment | null>(null);
    const [isExamDeleteModalOpen, setIsExamDeleteModalOpen] = useState(false);
    const [examToDelete, setExamToDelete] = useState<Exam | null>(null);

    const [isStudentListModalOpen, setIsStudentListModalOpen] = useState(false);
    const [isParticipantsModalOpen, setIsParticipantsModalOpen] = useState(false);
    const [selectedParticipantsExam, setSelectedParticipantsExam] = useState<Exam | null>(null);
    const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
    const [isUploadMaterialModalOpen, setIsUploadMaterialModalOpen] = useState(false);
    const [selectedMaterialFiles, setSelectedMaterialFiles] = useState<File[]>([]);

    const handleOpenCreateAssignment = (slotInfo: any) => {
        setCreateAssignmentSlotInfo(slotInfo);
        setIsCreateAssignmentModalOpen(true);
    };

    const handleEditAssignment = (e: React.MouseEvent, assignment: Assignment) => {
        e.stopPropagation();
        setAssignmentToEdit(assignment);
        setIsEditAssignmentModalOpen(true);
    };

    const [deleteAssignment] = useDeleteAssignmentMutation();

    const handleDeleteAssignment = (e: React.MouseEvent, assignment: Assignment) => {
        e.stopPropagation();
        setAssignmentToDelete(assignment);
        setIsAssignmentDeleteModalOpen(true);
    };

    const confirmDeleteAssignment = async () => {
        if (!assignmentToDelete) return;
        try {
            await deleteAssignment(assignmentToDelete.id).unwrap();
            toast.success('Assignment deleted successfully');
        } catch (error) {
            toast.error('Failed to delete assignment');
        } finally {
            setAssignmentToDelete(null);
            setIsAssignmentDeleteModalOpen(false);
        }
    };


    // Pagination for slots
    const [currentPage, setCurrentPage] = useState(1);
    const SLOTS_PER_PAGE = 10;

    const { data: slotData, isLoading: isLoadingSlots, refetch: refetchSlots } = useGetClassSubjectSlotsQuery({ id: courseId || '' }, {
        skip: !courseId,
    });

    const [slots, setSlots] = useState<Slot[]>([]);


    // Auto-scroll to current slot
    const hasScrolledToCurrentRef = useRef(false);
    const targetSlotIdRef = useRef<string | null>(null);

    // Scroll to top when page changes
    useEffect(() => {
        if (hasScrolledToCurrentRef.current) {
            const scrollContainer = document.querySelector('.overflow-y-auto');
            if (scrollContainer) {
                scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    }, [currentPage, activeTab]);

    // Handle auto-scroll to current slot
    useEffect(() => {
        if (!hasScrolledToCurrentRef.current && slots.length > 0 && targetSlotIdRef.current) {
            const element = document.getElementById(`slot-${targetSlotIdRef.current}`);
            if (element) {
                setTimeout(() => {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    hasScrolledToCurrentRef.current = true;
                }, 500); // Give it a bit of time to render
            }
        }
    }, [slots, currentPage, activeTab]);

    const { data: classSubject, isLoading } = useGetClassSubjectByIdQuery(courseId || '', {
        skip: !courseId,
    });

    const { data: examsData, isLoading: isLoadingExams } = useGetExamsByClassSubjectIdQuery(courseId || '', {
        skip: !courseId,
    });

    const { data: studentsData, isLoading: isLoadingStudents } = useGetStudentClassesByClassIdQuery(
        { classSubjectId: classSubject?.id || '', pageSize: 200 },
        { skip: !classSubject?.id }
    );

    const { data: assignmentsData, isLoading: isLoadingAssignments } = useGetAssignmentsByClassSubjectIdQuery(
        classSubject?.id || '',
        { skip: !classSubject?.id }
    );

    const { data: materialsData, isLoading: isLoadingMaterials } = useGetCourseMaterialsByClassSubjectIdQuery(
        classSubject?.id || '',
        { skip: !classSubject?.id }
    );
    const [createCourseMaterial] = useCreateCourseMaterialMutation();
    const [deleteCourseMaterial] = useDeleteCourseMaterialMutation();
    const [uploadFile] = useUploadFileMutation();
    const [materialUploading, setMaterialUploading] = useState(false);
    const materialFileInputRef = useRef<HTMLInputElement>(null);

    const handleUploadMaterial = async (file: File) => {
        if (!classSubject?.id) return;
        setMaterialUploading(true);
        try {
            const fileResult = await uploadFile({ file, folder: 'course-materials' }).unwrap();
            await createCourseMaterial({
                classSubjectId: classSubject.id,
                fileId: fileResult.id,
            }).unwrap();
            toast.success(`"${file.name}" uploaded successfully!`);
        } catch (error: any) {
            const message = error?.data?.message || error?.message || 'Failed to upload material.';
            toast.error(message);
        } finally {
            setMaterialUploading(false);
        }
    };

    const handleDeleteMaterial = (materialId: string, fileName?: string) => {
        Modal.confirm({
            title: 'Delete Material',
            content: `Are you sure you want to delete "${fileName || 'this material'}"?`,
            okText: 'Delete',
            okType: 'danger',
            cancelText: 'Cancel',
            onOk: async () => {
                try {
                    await deleteCourseMaterial(materialId).unwrap();
                    toast.success('Material deleted successfully');
                } catch {
                    toast.error('Failed to delete material');
                }
            },
        });
    };

    const exams = useMemo(() => {
        if (!examsData?.items) return [];
        return [...examsData.items].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }, [examsData]);

    // Sync selectedExam if exams list updates (e.g. after Edit)
    useEffect(() => {
        if (selectedExam) {
            const freshExam = exams.find(e => e.id === selectedExam.id);
            if (freshExam && JSON.stringify(freshExam) !== JSON.stringify(selectedExam)) {
                setSelectedExam(freshExam);
            }
        }
    }, [exams, selectedExam]);

    // Mock course data combined with real DB data if available
    const course = {
        id: courseId || 'SE1801',
        name: classSubject?.subjectName || 'Loading...',
        code: classSubject ? `${classSubject.subjectCode} - ${classSubject.classCode}` : 'SE1801',
        room: 'TBA',
        schedule: 'TBA',
        totalStudents: studentsData?.totalItemCount || 0,
        enrolledStudents: studentsData?.totalItemCount || 0,
    };

    const assignments = useMemo(() => {
        return assignmentsData?.items || [];
    }, [assignmentsData]);

    const getStatusColor = (status: string) => {
        return status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600';
    };

    const getSubmissionColor = (submitted: number, total: number) => {
        const percentage = (submitted / total) * 100;
        if (percentage >= 90) return 'text-green-600';
        if (percentage >= 70) return 'text-orange-600';
        return 'text-red-600';
    };

    // Removed mock slot status generation since teacher slots do not need time-based color coding



    useEffect(() => {
        if (slotData && slotData.slots) {
            let targetIdx = slotData.slots.findIndex((s: any) => s.status === 'Active');

            if (targetIdx === -1) {
                targetIdx = slotData.slots.findIndex((s: any) => s.status === 'Inactive');
            }

            if (targetIdx === -1 && slotData.slots.length > 0) {
                // If all slots are Expired (no Active or Inactive found), select the Last slot
                targetIdx = slotData.slots.length - 1;
            }

            // Fallback to first slot if everything is in the past or not found
            const finalTargetIdx = targetIdx !== -1 ? targetIdx : 0;
            const targetPage = Math.floor(finalTargetIdx / SLOTS_PER_PAGE) + 1;

            if (!hasScrolledToCurrentRef.current && targetPage !== currentPage) {
                setCurrentPage(targetPage);
            }

            const currentTargetSlot = slotData.slots[finalTargetIdx];
            if (currentTargetSlot) {
                targetSlotIdRef.current = currentTargetSlot.id;
            }

            setSlots(slotData.slots.map((s: any, i: number) => {
                const calculatedEndTime = (i + 1 < slotData.slots.length && slotData.slots[i + 1].date)
                    ? slotData.slots[i + 1].date
                    : dayjs(s.date).add(3, 'day').format('YYYY-MM-DDTHH:mm:ss');

                return {
                    id: s.id,
                    title: `Slot ${s.slotIndex}`,
                    startTime: new Date(s.date).toLocaleString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                    }),
                    endTime: new Date(calculatedEndTime).toLocaleString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                    }),
                    topics: s.sessions?.map((session: any) => session.topic) || [],
                    // Filter assignments matching this slotId (or falling back to instanceNumber regex logic if needed)
                    assignments: (() => {
                        return (assignmentsData?.items || [])
                            .filter((a: any) => a.slotId === s.id)
                            .map((a: any) => ({
                                ...a,
                                fileUrl: a.fileUrl || a.filePaths?.[0] || ''
                            }));
                    })(),
                    progressTests: (() => {
                        return (examsData?.items || [])
                            .filter((e: any) => e.slotId === s.id);
                    })(),
                    expanded: i === finalTargetIdx,
                    isAssessment: s.sessions?.some((sess: any) =>
                        sess.isAssessment ||
                        /\b(Progress Test|PT|Examination|Final Exam|Exam|Quiz|Test)\b/i.test(sess.topic)
                    ) || false,
                    slotIndex: s.slotIndex,
                    status: s.status,
                    hasQuestions: !!s.hasQuestions,
                    rawStartTime: s.date,
                    rawEndTime: calculatedEndTime
                };
            }));
        }
    }, [slotData, assignmentsData, examsData]);

    const SlotCountdown = ({ startTime, endTime, status, onFinished }: { startTime: string, endTime: string, status: string, onFinished: () => void }) => {
        const [timeLeft, setTimeLeft] = useState<number>(0);

        useEffect(() => {
            const calculateTime = () => {
                const now = Date.now();
                const start = new Date(startTime).getTime();
                const end = new Date(endTime).getTime();

                // If Inactive, countdown to start
                if (status === 'Inactive' && now < start) {
                    return start - now;
                }
                // If Active, countdown to end
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

        return (
            <div className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded text-[11px] font-mono font-bold text-amber-700 shadow-sm tabular-nums w-fit">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="w-[100px] flex-shrink-0 whitespace-nowrap text-left pr-1">
                    {status === 'Inactive' ? 'Starts' : 'Questions end'} in
                </span>
                <div className="flex items-center gap-0.5 min-w-[70px] justify-end">
                    {d > 0 && <span className="w-5 text-right">{d}d</span>}
                    {h > 0 && <span className="w-5 text-right">{h}h</span>}
                    <span className="w-5 text-right">{m.toString().padStart(2, '0')}m</span>
                    <span className="w-5 text-right">{s.toString().padStart(2, '0')}s</span>
                </div>
            </div>
        );
    };

    const formatStudentCode = (code?: string) => {
        if (!code) return '';
        const match = code.match(/[a-zA-Z]{2}\d{6}$/);
        return match ? match[0].toUpperCase() : code;
    };

    const toggleSlot = (slotId: string) => {
        setSlots(slots.map(slot =>
            slot.id === slotId ? { ...slot, expanded: !slot.expanded } : slot
        ));
    };

    const handleDeleteExam = (e: React.MouseEvent, exam: Exam) => {
        e.stopPropagation();
        setExamToDelete(exam);
        setIsExamDeleteModalOpen(true);
    };

    const confirmDeleteExam = async () => {
        if (!examToDelete) return;
        try {
            await deleteExam(examToDelete.id).unwrap();
            toast.success('Exam deleted successfully');
        } catch (error) {
            toast.error('Failed to delete exam');
        } finally {
            setExamToDelete(null);
            setIsExamDeleteModalOpen(false);
        }
    };

    const handleEditExam = (e: React.MouseEvent, exam: Exam) => {
        e.stopPropagation();
        setExamToEdit(exam);
        setIsEditExamModalOpen(true);
    };

    if (isLoading || isLoadingSlots) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <Loader2 className="w-10 h-10 text-[#F37022] animate-spin" />
                <p className="text-gray-500 font-medium">Loading course data...</p>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 pb-24 md:pb-32 animate-fadeIn">
            {/* Breadcrumb ... */}
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                <button onClick={() => navigate('/teacher')} className="hover:text-[#F37022] transition-colors">
                    Home
                </button>
                <ChevronRight className="w-4 h-4" />
                <button onClick={() => navigate('/teacher/classrooms')} className="hover:text-[#F37022] transition-colors">
                    My Classes
                </button>
                <ChevronRight className="w-4 h-4" />
                <span className="text-[#0A1B3C] font-medium">{course.name}</span>
            </div>

            {/* Course Header ... */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-2xl md:text-3xl font-bold text-[#0A1B3C]">{course.code}</h1>
                            {/* <span className="px-3 py-1 bg-orange-100 text-[#F37022] text-sm font-semibold rounded-full">
                                {course.room}
                            </span> */}
                        </div>
                        <p className="text-lg text-gray-700 mb-2">{course.name}</p>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                            {/* <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {course.schedule}
                            </span> */}
                            <span
                                className="flex items-center gap-1 cursor-pointer hover:text-[#F37022] hover:underline"
                                onClick={() => setIsStudentListModalOpen(true)}
                            >
                                <Users className="w-4 h-4" />
                                <span className="text-[#F37022] bg-orange-100 px-1 rounded">{course.enrolledStudents} students</span>
                            </span>
                        </div>
                    </div>
                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={() => setIsCloneModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#F37022] bg-orange-50 border border-orange-100 rounded-lg hover:bg-orange-100 transition-colors shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            Clone Configuration
                        </button>
                        <button
                            onClick={handleExportGrades}
                            disabled={isExporting}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0A1B3C] border border-[#0A1B3C] rounded-lg hover:bg-[#0A1B3C]/90 transition-colors shadow-sm disabled:opacity-50"
                        >
                            {isExporting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Download className="w-4 h-4" />
                            )}
                            Export Grades
                        </button>
                        <button
                            onClick={handleExportQuestionReport}
                            disabled={isExportingReport}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#0A1B3C] bg-white border border-[#0A1B3C] rounded-lg hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
                        >
                            {isExportingReport ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <FileText className="w-4 h-4" />
                            )}
                            Export Question Report
                        </button>
                    </div>
                </div>
            </div>

            <CloneConfigModal
                isOpen={isCloneModalOpen}
                onClose={() => setIsCloneModalOpen(false)}
                sourceClassSubjectId={courseId || ''}
                subjectId={classSubject?.subjectId || ''}
                courseCode={classSubject?.subjectCode || ''}
                courseName={classSubject?.subjectName || ''}
            />

            <UploadMaterialModal
                isOpen={isUploadMaterialModalOpen}
                onClose={() => setIsUploadMaterialModalOpen(false)}
                subjectId={classSubject?.subjectId || ''}
                currentClassSubjectId={courseId || ''}
                subjectName={classSubject?.subjectName || ''}
                files={selectedMaterialFiles}
                onSuccess={() => {
                    // RTK Query handles refetch via invalidatesTags
                }}
            />

            {/* Tabs ... */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200">
                    <nav className="flex overflow-x-auto">
                        {[
                            { id: 'slots', label: 'Slots', icon: Calendar },
                            { id: 'assignments', label: 'Assignments', icon: FileText },
                            { id: 'tests', label: 'Progress Tests', icon: ClipboardCheck },
                            { id: 'materials', label: 'Learning Materials', icon: BookOpen },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
                                    ? 'border-[#F37022] text-[#F37022]'
                                    : 'border-transparent text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Tab Content ... */}
                <div className="p-6">
                    {activeTab === 'slots' && (
                        <div className="animate-fadeIn">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-[#0A1B3C]">Course Slots</h2>
                                <div className="text-sm text-gray-500">
                                    Page {currentPage} of {Math.ceil(slots.length / SLOTS_PER_PAGE)}
                                </div>
                            </div>

                            <div className="space-y-4">
                                {slots
                                    .slice((currentPage - 1) * SLOTS_PER_PAGE, currentPage * SLOTS_PER_PAGE)
                                    .map(slot => (
                                        <div key={slot.id} id={`slot-${slot.id}`} className={`border rounded-lg bg-white transition-colors duration-200 ${slot.hasQuestions ? 'border-green-300 shadow-sm shadow-green-100/50' : 'border-gray-200'}`}>
                                            {/* Slot Header */}
                                            <div className={`p-4 border-b ${slot.expanded ? 'rounded-t-lg' : 'rounded-lg'} ${slot.hasQuestions ? 'bg-green-50/50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="px-3 py-1 text-sm font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                                                            {slot.title}
                                                        </span>

                                                        {slot.status === 'Active' && (
                                                            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-50 text-green-700 border border-green-100">
                                                                Active
                                                            </span>
                                                        )}
                                                        {slot.status === 'Inactive' && (
                                                            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                                                                Inactive
                                                            </span>
                                                        )}
                                                        {slot.status === 'Expired' && (
                                                            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-50 text-red-700 border border-red-100">
                                                                Expired
                                                            </span>
                                                        )}

                                                        <SlotCountdown
                                                            startTime={slot.rawStartTime}
                                                            endTime={slot.rawEndTime}
                                                            status={slot.status}
                                                            onFinished={() => refetchSlots()}
                                                        />

                                                        {slot.hasQuestions ? (
                                                            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-teal-50 text-teal-700 border border-teal-100">
                                                                Has Questions
                                                            </span>
                                                        ) : (
                                                            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-orange-50 text-orange-700 border border-orange-100">
                                                                No Questions
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {/* Actions for teachers */}



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
                                                <div className="p-4 bg-white">
                                                    {/* Slot Content Sections */}
                                                    <div>
                                                        {/* Top Actions: Header & Create Content Dropdown */}
                                                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100 relative z-10">
                                                            <h4 className="text-sm font-bold text-[#0A1B3C] uppercase tracking-wider flex items-center gap-2">
                                                                Slot Content
                                                            </h4>
                                                            {slot.status !== 'Expired' && (
                                                                <div className="relative">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setOpenDropdownId(openDropdownId === `${slot.id}-content` ? null : `${slot.id}-content`);
                                                                        }}
                                                                        className="text-xs font-semibold text-[#F37022] hover:text-[#D96419] flex items-center gap-1 transition-colors px-3 py-1.5 bg-orange-50 rounded-lg border border-orange-100"
                                                                    >
                                                                        <Plus className="w-3 h-3" /> Create content
                                                                    </button>

                                                                    {openDropdownId === `${slot.id}-content` && (
                                                                        <>
                                                                            <div
                                                                                className="fixed inset-0 z-40"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setOpenDropdownId(null);
                                                                                }}
                                                                            />
                                                                            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 z-50 py-1 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setOpenDropdownId(null);
                                                                                        setCreateQuestionSlotInfo({ id: slot.id, title: slot.title, topics: slot.topics });
                                                                                        setIsCreateQuestionModalOpen(true);
                                                                                    }}
                                                                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                                                >
                                                                                    <FileText className="w-4 h-4 text-gray-400" />
                                                                                    Create Question
                                                                                </button>

                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setOpenDropdownId(null);
                                                                                        navigate(`/teacher/create-exam?course=${courseId}&slot=${slot.id}`);
                                                                                    }}
                                                                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-t border-gray-50"
                                                                                >
                                                                                    <FileText className="w-4 h-4 text-gray-400" />
                                                                                    Create Progress Test
                                                                                </button>

                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setOpenDropdownId(null);
                                                                                        setCreateAssignmentSlotInfo({ id: slot.id, title: slot.title, slotIndex: slot.slotIndex });
                                                                                        setIsCreateAssignmentModalOpen(true);
                                                                                    }}
                                                                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-t border-gray-50"
                                                                                >
                                                                                    <FileText className="w-4 h-4 text-gray-400" />
                                                                                    Create Assignment
                                                                                </button>
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {isLoadingExams || isLoadingAssignments ? (
                                                            <div className="py-4 flex items-center justify-center gap-2 text-gray-400">
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                                <span className="text-sm">Loading content...</span>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {/* QUESTION Section (API loaded from SlotQuestionList component) */}
                                                                <SlotQuestionList
                                                                    slotId={slot.id}
                                                                    slotTitle={slot.title}
                                                                    topics={slot.topics}
                                                                    onLoad={(has) => setHasQuestionsMap(prev => prev[slot.id] === has ? prev : { ...prev, [slot.id]: has })}
                                                                />

                                                                {/* PROGRESS TEST Section */}
                                                                {slot.progressTests.length > 0 && (
                                                                    <div className="mb-6">
                                                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 pb-2 border-b border-gray-100">
                                                                            PROGRESS TEST
                                                                        </h4>
                                                                        <div className="space-y-1">
                                                                            {slot.progressTests.map(exam => (
                                                                                <div
                                                                                    key={exam.id}
                                                                                    className="flex flex-col sm:flex-row sm:items-center justify-between p-2 hover:bg-gray-50 rounded-lg group transition-colors cursor-pointer gap-2"
                                                                                    onClick={() => {
                                                                                        setSelectedExam(exam);
                                                                                        setIsExamDetailModalOpen(true);
                                                                                    }}
                                                                                >
                                                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                                                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                                                            <FileText className="w-4 h-4 text-blue-700" />
                                                                                        </div>
                                                                                        <div className="min-w-0">
                                                                                            <p className="text-sm font-medium text-gray-800">
                                                                                                {exam.displayName || (exam.category ? `${exam.category} ${exam.instanceNumber}` : `Progress Test ${exam.instanceNumber}`)}
                                                                                            </p>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2 flex-shrink-0 ml-11 sm:ml-2">
                                                                                        <span className="text-xs font-semibold text-orange-600 whitespace-nowrap">
                                                                                            {exam.participationCount || 0}/{course.enrolledStudents} participated
                                                                                        </span>
                                                                                        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                                                            <button
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    setSelectedParticipantsExam(exam);
                                                                                                    setIsParticipantsModalOpen(true);
                                                                                                }}
                                                                                                className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                                                                                                title="Participants"
                                                                                            >
                                                                                                <Users className="w-4 h-4" />
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={(e) => handleEditExam(e, exam)}
                                                                                                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                                                                title="Edit Exam"
                                                                                            >
                                                                                                <Pencil className="w-4 h-4" />
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={(e) => handleDeleteExam(e, exam)}
                                                                                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                                                                title="Delete Exam"
                                                                                            >
                                                                                                <Trash2 className="w-4 h-4" />
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* ASSIGNMENT Section */}
                                                                {slot.assignments.length > 0 && (
                                                                    <div className="mb-6">
                                                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 pb-2 border-b border-gray-100">
                                                                            ASSIGNMENT
                                                                        </h4>
                                                                        <div className="space-y-1">
                                                                            {slot.assignments.map((assignment: Assignment) => (
                                                                                <div key={assignment.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 hover:bg-gray-50 rounded-lg group transition-colors gap-2">
                                                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                                                        <div className="w-8 h-8 bg-pink-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                                                            <FileText className="w-4 h-4 text-pink-600" />
                                                                                        </div>
                                                                                        <div className="min-w-0 flex flex-col">
                                                                                            <span className="text-sm font-medium text-gray-800">
                                                                                                {assignment.displayName || `ASM${assignment.instanceNumber}`}
                                                                                            </span>
                                                                                            {assignment.description && (
                                                                                                <span className="text-xs text-gray-500 truncate">{assignment.description}</span>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="flex flex-wrap items-center gap-2 flex-shrink-0 ml-11 sm:ml-2">
                                                                                        {assignment.fileUrl && (
                                                                                            <button
                                                                                                onClick={() => {
                                                                                                    setPreviewFile({ url: assignment.fileUrl!, name: assignment.fileName || 'Assignment File' });
                                                                                                    setIsPreviewModalOpen(true);
                                                                                                }}
                                                                                                className="px-2 py-1 text-xs text-orange-600 hover:underline transition-colors bg-transparent font-medium"
                                                                                            >
                                                                                                Preview
                                                                                            </button>
                                                                                        )}
                                                                                        <span className="text-xs text-gray-500 flex items-center gap-1 whitespace-nowrap">
                                                                                            <Clock className="w-3 h-3" />
                                                                                            {assignment.dueDate
                                                                                                ? new Date(assignment.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                                                                                : 'No due date'}
                                                                                        </span>
                                                                                        <AssignmentSubmissionCount
                                                                                            assignmentId={assignment.id}
                                                                                            totalStudents={course.enrolledStudents}
                                                                                        />
                                                                                        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                                                            <button
                                                                                                onClick={() => navigate(`/teacher/assignment/${assignment.id}/submissions`)}
                                                                                                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                                                                title="Submissions"
                                                                                            >
                                                                                                <Users className="w-4 h-4" />
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={(e) => handleEditAssignment(e, assignment)}
                                                                                                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                                                                title="Edit Assignment"
                                                                                            >
                                                                                                <Pencil className="w-4 h-4" />
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={(e) => handleDeleteAssignment(e, assignment)}
                                                                                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                                                                title="Delete Assignment"
                                                                                            >
                                                                                                <Trash2 className="w-4 h-4" />
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {/* Empty State warning if there's no progress tests and assignments and questions */}
                                                                {slot.progressTests.length === 0 && slot.assignments.length === 0 && hasQuestionsMap[slot.id] === false && (
                                                                    <div className="py-8 text-center bg-gray-50 border border-dashed border-gray-200 rounded-xl mt-2">
                                                                        <p className="text-sm text-gray-500 font-medium">
                                                                            No contents for this slot.
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
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
                                    {Array.from({ length: Math.ceil(slots.length / SLOTS_PER_PAGE) }, (_, i) => i + 1).map(page => (
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
                                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(slots.length / SLOTS_PER_PAGE), prev + 1))}
                                    disabled={currentPage === Math.ceil(slots.length / SLOTS_PER_PAGE)}
                                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'assignments' && (
                        <div className="animate-fadeIn">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-[#0A1B3C]">Course Assignments</h2>

                            </div>

                            {isLoadingAssignments ? (
                                <div className="text-center py-12 text-gray-500">
                                    <Loader2 className="w-8 h-8 text-[#F37022] animate-spin mx-auto mb-4" />
                                    Loading assignments...
                                </div>
                            ) : assignmentsData?.items?.length === 0 ? (
                                <div className="text-center py-12 text-gray-500 border border-dashed border-gray-300 rounded-xl bg-gray-50/50">
                                    <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                                    <p className="font-medium text-lg text-gray-500">No assignments created</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {assignmentsData?.items?.map(assignment => (
                                        <div key={assignment.id} className="p-5 border border-gray-200 rounded-xl hover:shadow-md transition-shadow bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <h3 className="text-lg font-bold text-[#0A1B3C]">{assignment.displayName || `Assignment ${assignment.instanceNumber}`}</h3>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="w-4 h-4" />
                                                        Due: {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'No due date'}
                                                    </span>
                                                    <AssignmentSubmissionCount
                                                        assignmentId={assignment.id}
                                                        totalStudents={course.enrolledStudents}
                                                    />
                                                </div>
                                                {assignment.description && (
                                                    <div className="mt-2 text-sm font-medium text-gray-500 max-w-lg truncate">
                                                        {assignment.description}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <button
                                                    onClick={() => navigate(`/teacher/assignment/${assignment.id}/submissions`)}
                                                    className="px-5 py-2 bg-[#F37022] text-white rounded-lg hover:bg-[#d95f19] transition-colors text-sm font-semibold shadow-sm"
                                                >
                                                    View Submissions
                                                </button>
                                                <button
                                                    onClick={(e) => handleEditAssignment(e, assignment)}
                                                    className="px-5 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-semibold shadow-sm"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={(e) => handleDeleteAssignment(e, assignment)}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100 shadow-sm"
                                                    title="Delete Assignment"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'tests' && (
                        <div className="animate-fadeIn">
                            {isLoadingExams ? (
                                <div className="text-center py-12 text-gray-500">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F37022] mx-auto mb-4"></div>
                                    <p className="font-medium animate-pulse">Loading tests...</p>
                                </div>
                            ) : exams.length === 0 ? (
                                <div className="text-center py-12 text-gray-500 border border-dashed border-gray-300 rounded-xl bg-gray-50/50">
                                    <ClipboardCheck className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                                    <p className="font-medium text-lg text-gray-500">No tests available</p>
                                    <p className="text-sm text-gray-400 mt-1">Create a new test to get started</p>
                                </div>
                            ) : (
                                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                    <div className="overflow-x-auto">
                                        <table className="w-full border-collapse">
                                            <thead className="bg-gray-50/80 border-b border-gray-200">
                                                <tr>
                                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Exam Name</th>
                                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Time</th>
                                                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Participants</th>
                                                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {exams.map((exam) => {
                                                    const now = new Date();
                                                    const start = new Date(exam.startTime);
                                                    const end = new Date(exam.endTime);

                                                    let status = { label: 'Upcoming', color: 'bg-blue-50 text-blue-700 border-blue-100' };
                                                    if (!exam.isActive) {
                                                        status = { label: 'Suspended', color: 'bg-orange-50 text-orange-700 border-orange-100' };
                                                    } else if (now > end) {
                                                        status = { label: 'Ended', color: 'bg-red-50 text-red-700 border-red-100' };
                                                    } else if (now >= start && now <= end) {
                                                        status = { label: 'Ongoing', color: 'bg-green-600 text-white border-transparent' };
                                                    }

                                                    return (
                                                        <tr
                                                            key={exam.id}
                                                            className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                                                            onClick={() => {
                                                                setSelectedExam(exam);
                                                                setIsExamDetailModalOpen(true);
                                                            }}
                                                        >
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-semibold text-[#0A1B3C] group-hover:text-[#F37022] transition-colors">
                                                                        {exam.displayName || (exam.category ? `${exam.category} ${exam.instanceNumber}` : `PT ${exam.instanceNumber}`)}
                                                                    </span>
                                                                    <span className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wider font-medium">{exam.syllabusName}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="flex flex-col text-xs text-gray-600">
                                                                    <span className="font-medium text-gray-900">{start.toLocaleDateString('en-GB')} {start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                                                                    <span className="text-gray-400 mt-0.5">to {end.toLocaleDateString('en-GB')} {end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                <div className="flex flex-col items-center">
                                                                    <span className="text-sm font-semibold text-gray-800">{exam.participationCount || 0}</span>
                                                                    <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">/ {course.enrolledStudents} students</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                <span className={`px-3 py-1 text-[11px] font-semibold rounded-full border inline-block min-w-[100px] ${status.color}`}>
                                                                    {status.label}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                                <div className="flex items-center justify-end gap-1">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedParticipantsExam(exam);
                                                                            setIsParticipantsModalOpen(true);
                                                                        }}
                                                                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-all"
                                                                        title="View results"
                                                                    >
                                                                        <Users className="w-5 h-5" />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => handleEditExam(e, exam)}
                                                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                                        title="Edit"
                                                                    >
                                                                        <Pencil className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => handleDeleteExam(e, exam)}
                                                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                                        title="Delete"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'materials' && (
                        <div className="animate-fadeIn">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-[#0A1B3C]">Learning Materials</h2>
                                <div>
                                    <input
                                        ref={materialFileInputRef}
                                        type="file"
                                        className="hidden"
                                        accept=".pdf,.doc,.docx,.pptx,.xlsx,.xls,.zip,.rar,.txt,.png,.jpg,.jpeg"
                                        multiple
                                        onChange={async (e) => {
                                            const files = e.target.files;
                                            if (!files || files.length === 0) return;
                                            setSelectedMaterialFiles(Array.from(files));
                                            setIsUploadMaterialModalOpen(true);
                                            if (materialFileInputRef.current) materialFileInputRef.current.value = '';
                                        }}
                                    />
                                    <button
                                        onClick={() => materialFileInputRef.current?.click()}
                                        disabled={materialUploading}
                                        className="px-4 py-2 bg-[#F37022] text-white rounded-lg hover:bg-[#d95f19] transition-colors font-medium flex items-center gap-2 shadow-sm disabled:opacity-50"
                                    >
                                        {materialUploading ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                                        ) : (
                                            <><Upload className="w-4 h-4" /> Upload Material</>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {isLoadingMaterials ? (
                                <div className="text-center py-12 text-gray-500">
                                    <Loader2 className="w-8 h-8 text-[#F37022] animate-spin mx-auto mb-4" />
                                    Loading materials...
                                </div>
                            ) : !materialsData?.items?.length ? (
                                <div className="text-center py-12 text-gray-500 border border-dashed border-gray-300 rounded-xl bg-gray-50/50">
                                    <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                                    <p className="font-medium text-lg text-gray-500">No learning materials uploaded</p>
                                    <p className="text-sm text-gray-400 mt-1">Upload files to share with your students</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {materialsData.items.map(material => {
                                        const ext = material.fileName?.split('.').pop()?.toLowerCase() || '';
                                        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
                                        const isPdf = ext === 'pdf';
                                        const isDoc = ['doc', 'docx'].includes(ext);
                                        const isPpt = ['ppt', 'pptx'].includes(ext);
                                        const isArchive = ['zip', 'rar', '7z'].includes(ext);

                                        if (isArchive) {
                                            return (
                                                <ZipFolderBrowser
                                                    key={material.id}
                                                    material={material}
                                                    onDelete={handleDeleteMaterial}
                                                    onPreviewFile={(url, name) => {
                                                        setPreviewFile({ url, name });
                                                        setIsPreviewModalOpen(true);
                                                    }}
                                                />
                                            );
                                        }

                                        const getFileColor = () => {
                                            if (isPdf) return 'bg-red-100 text-red-600';
                                            if (isDoc) return 'bg-blue-100 text-blue-600';
                                            if (isPpt) return 'bg-orange-100 text-orange-600';
                                            if (isImage) return 'bg-green-100 text-green-600';
                                            return 'bg-gray-100 text-gray-600';
                                        };

                                        return (
                                            <div
                                                key={material.id}
                                                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-gray-200 rounded-xl hover:shadow-md transition-shadow bg-white group gap-3"
                                            >
                                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getFileColor()}`}>
                                                        <FileText className="w-5 h-5" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-semibold text-[#0A1B3C] truncate">
                                                            {material.fileName || 'Unnamed file'}
                                                        </p>
                                                        <p className="text-xs text-gray-400 mt-0.5">
                                                            Uploaded {new Date(material.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                            {ext && <span className="ml-2 uppercase font-medium text-gray-500">{ext}</span>}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 flex-shrink-0 ml-14 sm:ml-0">
                                                    {material.fileUrl && (
                                                        <>
                                                            <button
                                                                onClick={() => {
                                                                    setPreviewFile({ url: material.fileUrl!, name: material.fileName || 'Material' });
                                                                    setIsPreviewModalOpen(true);
                                                                }}
                                                                className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5"
                                                                title="Preview"
                                                            >
                                                                <Eye className="w-4 h-4" />
                                                                Preview
                                                            </button>
                                                            <button
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    try {
                                                                        const s3Url = new URL(material.fileUrl!);
                                                                        const key = s3Url.pathname.substring(1);
                                                                        const apiBase = import.meta.env.VITE_API_URL || '';
                                                                        const token = localStorage.getItem('token');
                                                                        const res = await fetch(`${apiBase}/Files/download?key=${encodeURIComponent(key)}`, {
                                                                            headers: token ? { Authorization: `Bearer ${token}` } : {},
                                                                        });
                                                                        if (!res.ok) throw new Error('Download failed');
                                                                        const blob = await res.blob();
                                                                        const url = window.URL.createObjectURL(blob);
                                                                        const a = document.createElement('a');
                                                                        a.href = url;
                                                                        a.download = material.fileName || 'download';
                                                                        document.body.appendChild(a);
                                                                        a.click();
                                                                        a.remove();
                                                                        window.URL.revokeObjectURL(url);
                                                                    } catch {
                                                                        toast.error('Failed to download file');
                                                                    }
                                                                }}
                                                                className="px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 rounded-lg transition-colors flex items-center gap-1.5"
                                                                title="Download"
                                                            >
                                                                <Download className="w-4 h-4" />
                                                                Download
                                                            </button>
                                                        </>
                                                    )}
                                                    <button
                                                        onClick={() => handleDeleteMaterial(material.id, material.fileName)}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <Modal
                title={previewFile?.name}
                open={isPreviewModalOpen}
                onCancel={() => {
                    setIsPreviewModalOpen(false);
                    setPreviewFile(null);
                }}
                footer={null}
                width={1800}
                centered
                destroyOnHidden
            >
                {previewFile && (
                    <div className="mt-4">
                        <MaterialFilePreview url={previewFile.url} name={previewFile.name} />
                    </div>
                )}
            </Modal>

            <ExamDetailModal
                exam={selectedExam}
                isOpen={isExamDetailModalOpen}
                onClose={() => {
                    setIsExamDetailModalOpen(false);
                    setSelectedExam(null);
                }}
            />

            {examToEdit && (
                <EditExamModal
                    exam={examToEdit}
                    isOpen={isEditExamModalOpen}
                    onClose={() => {
                        setIsEditExamModalOpen(false);
                        setExamToEdit(null);
                    }}
                />
            )}

            <CreateAssignmentModal
                isOpen={isCreateAssignmentModalOpen}
                onClose={() => {
                    setIsCreateAssignmentModalOpen(false);
                    setCreateAssignmentSlotInfo(null);
                }}
                classSubjectId={classSubject?.id || courseId || ''}
                subjectId={classSubject?.subjectId}
                slotId={createAssignmentSlotInfo?.id}
                slotTitle={createAssignmentSlotInfo?.title}
                existingCount={assignments.length}
            />

            <EditAssignmentModal
                isOpen={isEditAssignmentModalOpen}
                onClose={() => {
                    setIsEditAssignmentModalOpen(false);
                    setAssignmentToEdit(null);
                }}
                assignment={assignmentToEdit}
            />

            {/* Create Question Modal */}
            <SlotQuestionContentModal
                isOpen={isCreateQuestionModalOpen}
                onClose={() => {
                    setIsCreateQuestionModalOpen(false);
                    setCreateQuestionSlotInfo(null);
                }}
                isSaving={isCreatingQuestion}
                slotTitle={createQuestionSlotInfo?.title}
                topics={createQuestionSlotInfo?.topics}
                onSave={async (questions) => {
                    if (createQuestionSlotInfo) {
                        try {
                            // Create all questions in parallel
                            await Promise.all(
                                questions.map(q => createSlotQuestion({
                                    slotId: createQuestionSlotInfo.id,
                                    content: q.content,
                                    description: q.description
                                }).unwrap())
                            );
                            toast.success(`Created ${questions.length} question${questions.length > 1 ? 's' : ''} successfully`);
                            setIsCreateQuestionModalOpen(false);
                            setCreateQuestionSlotInfo(null);
                        } catch {
                            toast.error('Failed to create one or more questions');
                        }
                    }
                }}
            />
            <Modal
                title={
                    <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                        <Users className="w-5 h-5 text-[#F37022]" />
                        <span className="text-lg font-bold text-[#0A1B3C]">Enrolled Students</span>
                        <span className="px-2.5 py-0.5 bg-orange-100 text-[#F37022] text-xs font-semibold rounded-full ml-2">
                            {course.enrolledStudents}
                        </span>
                    </div>
                }
                open={isStudentListModalOpen}
                onCancel={() => setIsStudentListModalOpen(false)}
                footer={null}
                width={600}
                centered
                destroyOnHidden
                className="student-list-modal"
            >
                <div className="max-h-[60vh] overflow-y-auto pr-2 mt-4 custom-scrollbar">
                    {isLoadingStudents ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 text-[#F37022] animate-spin mb-4" />
                            <p className="text-gray-500 font-medium">Loading student list...</p>
                        </div>
                    ) : studentsData?.items && studentsData.items.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {studentsData.items.map((student: any) => (
                                <div
                                    key={student.id}
                                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/50 transition-colors group"
                                >
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-100 to-orange-50 border border-orange-200 flex items-center justify-center flex-shrink-0">
                                        <User className="w-5 h-5 text-[#F37022]" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-[#0A1B3C] transition-colors">
                                            {formatStudentCode(student.studentCode)}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate mt-0.5">
                                            {student.studentName || 'Unknown Student'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                            <Users className="w-12 h-12 text-gray-300 mb-3" />
                            <p className="text-gray-500 font-medium">No students enrolled</p>
                            <p className="text-sm text-gray-400 mt-1">Students will appear here once they join the class</p>
                        </div>
                    )}
                </div>
            </Modal>
            {/* Delete Confirmation Modals */}
            <ConfirmDeleteModal
                isOpen={isExamDeleteModalOpen}
                onClose={() => setIsExamDeleteModalOpen(false)}
                onConfirm={confirmDeleteExam}
                title="Delete Progress Test?"
                message={`Are you sure you want to delete "${examToDelete?.displayName || (examToDelete?.category ? `${examToDelete.category} ${examToDelete.instanceNumber}` : 'this progress test')}"?`}
                confirmButtonLabel="Delete"
            />

            <ConfirmDeleteModal
                isOpen={isAssignmentDeleteModalOpen}
                onClose={() => setIsAssignmentDeleteModalOpen(false)}
                onConfirm={confirmDeleteAssignment}
                title="Delete Assignment?"
                message={`Are you sure you want to delete "${assignmentToDelete?.displayName || `Assignment ${assignmentToDelete?.instanceNumber}`}"?`}
                confirmButtonLabel="Delete"
            />

            <ExamParticipantsModal
                isOpen={isParticipantsModalOpen}
                onClose={() => setIsParticipantsModalOpen(false)}
                exam={selectedParticipantsExam}
                classSubjectId={classSubject?.id || ''}
            />
        </div>
    );
}

export default TeacherCourseDetails;
