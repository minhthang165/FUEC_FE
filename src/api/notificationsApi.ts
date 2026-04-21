import { baseApi } from './baseApi';

export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    deleteNotification: builder.mutation<void, string>({
      query: (id) => ({
        url: `/Notifications/${id}`,
        method: 'DELETE',
      }),
    }),
    reportQuestion: builder.mutation<void, { questionId: string; reason: string; description?: string; examId?: string }>({
      query: ({ questionId, ...body }) => ({
        url: `/Questions/${questionId}/report`,
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const { useDeleteNotificationMutation, useReportQuestionMutation } = notificationsApi;
