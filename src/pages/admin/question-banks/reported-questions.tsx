import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Flag, Eye, Trash2, ArrowLeft, X, MessageSquare, User, BookOpen, FileText, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from 'antd';

import DataTable from '@/components/shared/DataTable';
import ConfirmDeleteModal from '@/components/shared/ConfirmDeleteModal';
import QuestionModal, { type QuestionData } from '@/components/modals/QuestionModal';
import {
  useGetQuestionReportsQuery,
  useDeleteQuestionReportMutation,
} from '@/api/questionReportsApi';
import {
  useGetQuestionByIdQuery,
  useUpdateQuestionMutation,
} from '@/api/questionsApi';
import type { QuestionReportDto } from '@/types/question.types';

function AdminReportedQuestions() {
  const navigate = useNavigate();

  // Pagination & search state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Detail modal state
  const [selectedReport, setSelectedReport] = useState<QuestionReportDto | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Delete modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<QuestionReportDto | null>(null);

  // Edit question state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<QuestionData | null>(null);

  // RTK Query hooks
  const { data: reportsData, isLoading, error } = useGetQuestionReportsQuery({
    pageNumber: page,
    pageSize,
    searchPhase: searchTerm || undefined,
    sortBy: sortBy || undefined,
    sortOrder: sortOrder === 'asc' ? 0 : 1,
  });
  const [deleteReport, { isLoading: isDeleting }] = useDeleteQuestionReportMutation();
  const [updateQuestion] = useUpdateQuestionMutation();
  const { data: fullQuestionData } = useGetQuestionByIdQuery(editingQuestionId!, {
    skip: !editingQuestionId,
  });

  const reports = reportsData?.items || [];
  const totalReports = reportsData?.totalItemCount || 0;

  useEffect(() => {
    if (error && 'status' in error && error.status !== 404) {
      toast.error('Failed to load reported questions');
    }
  }, [error]);

  const handleViewDetail = (report: QuestionReportDto) => {
    setSelectedReport(report);
    setIsDetailModalOpen(true);
  };

  const handleDeleteClick = (report: QuestionReportDto) => {
    setReportToDelete(report);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!reportToDelete) return;
    try {
      await deleteReport(reportToDelete.id).unwrap();
      toast.success('Report deleted successfully');
      setReportToDelete(null);
      setIsDeleteModalOpen(false);
    } catch (err) {
      toast.error('Failed to delete report: ' + ((err as any)?.data?.message || ''));
    }
  };

  // Populate edit form when full question data arrives
  useEffect(() => {
    if (fullQuestionData && editingQuestionId) {
      const q = fullQuestionData;
      const options = q.options || [];
      const tags = q.tag ? q.tag.split(',').map((t: string) => t.trim()) : [];
      const correctAnswers = options
        .map((o, idx) => (o.isCorrect ? idx : -1))
        .filter((i) => i !== -1);

      setEditingQuestion({
        id: q.id,
        content: q.questionContent,
        type: 'multiple_choice',
        difficulty: 'medium',
        tags,
        options: options.map((o) => o.choiceContent || ''),
        correctAnswers,
        chapter: q.chapter || 1,
        rawOptions: options,
      });
      setIsEditModalOpen(true);
    }
  }, [fullQuestionData, editingQuestionId]);

  const handleEditQuestion = (questionId: string) => {
    setEditingQuestionId(questionId);
  };

  const handleSaveQuestion = async (data: QuestionData) => {
    if (!data.id) return;
    try {
      const mappedOptions =
        data.options?.map((optContent: string, index: number) => {
          const isCorrect = data.correctAnswers?.includes(index) ?? false;
          const existingOpt = (data as any).rawOptions?.[index];
          if (existingOpt) return { id: existingOpt.id, choiceContent: optContent, isCorrect };
          return { choiceContent: optContent, isCorrect };
        }) || [];

      const questionType = data.correctAnswers && data.correctAnswers.length > 1 ? 1 : 0;

      await updateQuestion({
        id: data.id,
        body: {
          questionContent: data.content,
          questionType,
          tag: data.tags.join(','),
          points: 1.0,
          chapter: data.chapter,
          options: mappedOptions,
        },
      }).unwrap();

      toast.success('Question updated successfully');
      setIsEditModalOpen(false);
      setEditingQuestion(null);
      setEditingQuestionId(null);
    } catch (err) {
      toast.error('Failed to update question: ' + ((err as any)?.data?.message || ''));
    }
  };

  const handleSortChange = (column: keyof QuestionReportDto, direction: 'asc' | 'desc') => {
    setSortBy(column as string);
    setSortOrder(direction);
  };

  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
    setPage(1);
  };

  const columns = [
    {
      header: 'Student',
      accessor: 'studentCode' as keyof QuestionReportDto,
      sortable: true,
      className: 'w-[15%]',
      render: (item: QuestionReportDto) => (
        <div>
          <div className="font-medium text-[#0A1B3C]">{item.studentCode || 'N/A'}</div>
          <div className="text-xs text-gray-500">{item.studentName || ''}</div>
        </div>
      ),
    },
    {
      header: 'Subject',
      accessor: 'subjectCode' as keyof QuestionReportDto,
      sortable: true,
      className: 'w-[12%]',
      render: (item: QuestionReportDto) => (
        <div>
          <div className="font-medium">{item.subjectCode || 'N/A'}</div>
          <div className="text-xs text-gray-500 truncate max-w-[150px]">{item.subjectName || ''}</div>
        </div>
      ),
    },
    {
      header: 'Question',
      accessor: 'questionContent' as keyof QuestionReportDto,
      className: 'w-[25%]',
      render: (item: QuestionReportDto) => (
        <div
          className="text-sm text-gray-700 line-clamp-2 max-w-[300px]"
          title={item.questionContent || ''}
          dangerouslySetInnerHTML={{ __html: item.questionContent || 'N/A' }}
        />
      ),
    },
    {
      header: 'Reason',
      accessor: 'reason' as keyof QuestionReportDto,
      sortable: true,
      className: 'w-[15%]',
      render: (item: QuestionReportDto) => (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-100">
          <Flag className="w-3 h-3" />
          {item.reason}
        </span>
      ),
    },
    {
      header: 'Exam',
      accessor: 'examName' as keyof QuestionReportDto,
      hideOnMobile: true,
      className: 'w-[13%]',
      render: (item: QuestionReportDto) => (
        <span className="text-sm text-gray-600 truncate max-w-[120px] block">
          {item.examName || 'N/A'}
        </span>
      ),
    },
    {
      header: 'Reported At',
      accessor: 'createdAt' as keyof QuestionReportDto,
      sortable: true,
      align: 'center' as const,
      hideOnMobile: true,
      className: 'w-[10%]',
      render: (item: QuestionReportDto) =>
        item.createdAt
          ? new Date(item.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : 'N/A',
    },
    {
      header: 'Actions',
      accessor: 'id' as keyof QuestionReportDto,
      align: 'center' as const,
      className: 'w-[10%]',
      render: (item: QuestionReportDto) => (
        <div className="flex gap-2 justify-center">
          <button
            className="p-2 hover:bg-orange-50 rounded-lg transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleViewDetail(item);
            }}
            title="View Details"
          >
            <Eye className="w-4 h-4 text-[#F37022]" />
          </button>
          <button
            className="p-2 hover:bg-blue-50 rounded-lg transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleEditQuestion(item.questionId);
            }}
            title="Edit Question"
          >
            <Edit2 className="w-4 h-4 text-blue-600" />
          </button>
          <button
            className="p-2 hover:bg-red-50 rounded-lg transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteClick(item);
            }}
            disabled={isDeleting}
            title="Delete Report"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="p-4 md:p-6">
        <div className="mb-4 md:mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-[#0A1B3C]">Reported Questions</h1>
        </div>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="w-12 h-12 border-4 border-[#F37022] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 animate-fadeIn">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate('/admin/question-banks')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Back to Question Banks"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#0A1B3C]">Reported Questions</h1>
          <p className="text-sm text-gray-500 mt-1">
            View and manage questions reported by students during exams
          </p>
        </div>
      </div>

      {/* Table */}
      <DataTable
        title={`All Reports (${totalReports})`}
        data={reports}
        columns={columns}
        selectable={false}
        manualPagination={true}
        totalItems={totalReports}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        onSortChange={handleSortChange as any}
        onSearchChange={handleSearchChange}
        searchTerm={searchTerm}
        onRowClick={handleViewDetail}
      />

      {/* Detail Modal */}
      <Modal
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={null}
        width={640}
        centered
        title={null}
        closable={false}
      >
        {selectedReport && (
          <div className="py-2">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                  <Flag className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#0A1B3C]">Report Details</h3>
                  <p className="text-xs text-gray-500">
                    {selectedReport.createdAt
                      ? new Date(selectedReport.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Reason badge */}
            <div className="mb-5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-red-50 text-red-700 border border-red-200">
                <Flag className="w-3.5 h-3.5" />
                {selectedReport.reason}
              </span>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                <User className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Student</p>
                  <p className="text-sm font-medium text-[#0A1B3C]">{selectedReport.studentName || 'N/A'}</p>
                  <p className="text-xs text-gray-500">{selectedReport.studentCode || ''}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                <BookOpen className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Subject</p>
                  <p className="text-sm font-medium text-[#0A1B3C]">{selectedReport.subjectName || 'N/A'}</p>
                  <p className="text-xs text-gray-500">{selectedReport.subjectCode || ''}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl col-span-2">
                <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Exam</p>
                  <p className="text-sm font-medium text-[#0A1B3C]">{selectedReport.examName || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Question content */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Question Content</p>
              <div
                className="p-4 bg-orange-50/50 border border-orange-100 rounded-xl text-sm text-[#0A1B3C] leading-relaxed"
                dangerouslySetInnerHTML={{ __html: selectedReport.questionContent || 'No content available' }}
              />
            </div>

            {/* Description */}
            {selectedReport.description && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Student's Description</p>
                <div className="flex items-start gap-3 p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                  <MessageSquare className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-[#0A1B3C] leading-relaxed">{selectedReport.description}</p>
                </div>
              </div>
            )}

            {/* Edit Question Button */}
            <div className="pt-3 border-t border-gray-100">
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  handleEditQuestion(selectedReport.questionId);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#F37022] text-white rounded-xl text-sm font-semibold hover:bg-[#D96419] transition-colors shadow-sm"
              >
                <Edit2 className="w-4 h-4" />
                Edit Question
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setReportToDelete(null); }}
        onConfirm={confirmDelete}
        title="Delete Report"
        message={`Are you sure you want to delete this report from "${reportToDelete?.studentName || 'Unknown'}"?`}
        confirmButtonLabel="Delete"
        confirmButtonVariant="danger"
      />

      {/* Edit Question Modal */}
      <QuestionModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingQuestion(null);
          setEditingQuestionId(null);
        }}
        onSave={handleSaveQuestion}
        editData={editingQuestion}
      />
    </div>
  );
}

export default AdminReportedQuestions;
