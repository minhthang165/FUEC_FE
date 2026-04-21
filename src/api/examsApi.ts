import { baseApi } from './baseApi';
import type { CreateExamRequest, UpdateExamRequest, PaginatedExamsResponse, PaginatedExamQuestionsResponse } from '@/types/exam.types';

export const examsApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        createExam: builder.mutation<void, CreateExamRequest>({
            query: (exam) => ({
                url: '/Exams/generate',
                method: 'POST',
                body: exam,
            }),
            invalidatesTags: ['Exams'],
        }),
        getAllExams: builder.query<PaginatedExamsResponse, { classSubjectId?: string; studentId?: string; semesterId?: string }>({
            query: (params) => {
                const searchParams = new URLSearchParams();
                if (params.classSubjectId) searchParams.append('ClassSubjectId', params.classSubjectId);
                if (params.studentId) searchParams.append('StudentId', params.studentId);
                if (params.semesterId) searchParams.append('SemesterId', params.semesterId);
                return `/Exams?${searchParams.toString()}`;
            },
            transformResponse: (response: any) => {
                console.log("EXAMS RESPONSE:", response);
                return response?.result || {
                    items: [],
                    totalItemCount: 0,
                    totalPages: 0,
                    itemFrom: 0,
                    itemTo: 0
                };
            },
            providesTags: ['Exams'],
        }),
        getExamsByClassSubjectId: builder.query<PaginatedExamsResponse, string>({
            query: (classSubjectId) => `/Exams?ClassSubjectId=${classSubjectId}`,
            transformResponse: (response: any) => {
                console.log("EXAMS RESPONSE:", response);
                return response?.result || {
                    items: [],
                    totalItemCount: 0,
                    totalPages: 0,
                    itemFrom: 0,
                    itemTo: 0
                };
            },
            providesTags: ['Exams'],
        }),
        getExamQuestions: builder.query<PaginatedExamQuestionsResponse, { examId: string; page?: number; pageSize?: number }>({
            query: ({ examId, page = 0, pageSize = 100 }) => `/ExamQuestions?ExamId=${examId}&PageNumber=${page}&PageSize=${pageSize}`,
            transformResponse: (response: any) => response?.result || {
                items: [],
                totalItemCount: 0,
                totalPages: 0,
                itemFrom: 0,
                itemTo: 0
            },
            providesTags: ['Exams'],
        }),
        updateExam: builder.mutation<any, UpdateExamRequest>({
            query: ({ id, ...exam }) => ({
                url: `/Exams/${id}`,
                method: 'PUT',
                body: exam,
            }),
            transformResponse: (response: any) => response?.result,
            invalidatesTags: ['Exams'],
            async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
                try {
                    const { data: updatedExam } = await queryFulfilled;
                    if (updatedExam?.classSubjectId) {
                        dispatch(
                            examsApi.util.updateQueryData('getExamsByClassSubjectId', updatedExam.classSubjectId, (draft) => {
                                const index = draft.items.findIndex((e: any) => e.id === id);
                                if (index !== -1) {
                                    // Update the existing exam in the list
                                    draft.items[index] = { ...draft.items[index], ...updatedExam };
                                }
                            })
                        );
                    }
                } catch (err) {
                    console.error('Manual cache update failed:', err);
                }
            },
        }),
        deleteExam: builder.mutation<void, string>({
            query: (id) => ({
                url: `/Exams/${id}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['Exams'],
        }),
    }),
});

export const {
    useCreateExamMutation,
    useGetAllExamsQuery,
    useGetExamsByClassSubjectIdQuery,
    useGetExamQuestionsQuery,
    useUpdateExamMutation,
    useDeleteExamMutation
} = examsApi;
