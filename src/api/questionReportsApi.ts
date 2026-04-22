import { baseApi } from './baseApi';
import type {
  ApiResponse,
  PagedResult,
  QuestionReportDto,
  GetAllQuestionReportsRequest,
} from '@/types/question.types';

export const questionReportsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getQuestionReports: builder.query<PagedResult<QuestionReportDto>, GetAllQuestionReportsRequest>({
      query: (params) => ({
        url: '/QuestionReports',
        params,
      }),
      transformResponse: (response: ApiResponse<PagedResult<QuestionReportDto>>) => response.result,
      providesTags: ['QuestionReports'],
    }),
    getQuestionReportById: builder.query<QuestionReportDto, string>({
      query: (id) => `/QuestionReports/${id}`,
      transformResponse: (response: ApiResponse<QuestionReportDto>) => response.result,
      providesTags: ['QuestionReports'],
    }),
    deleteQuestionReport: builder.mutation<void, string>({
      query: (id) => ({
        url: `/QuestionReports/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['QuestionReports'],
    }),
  }),
});

export const {
  useGetQuestionReportsQuery,
  useGetQuestionReportByIdQuery,
  useDeleteQuestionReportMutation,
} = questionReportsApi;
