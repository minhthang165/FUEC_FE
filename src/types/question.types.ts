export type QuestionType = 0 | 1; // 0 = Single, 1 = Multiple

export interface PagedResult<T> {
    items: T[];
    totalItemCount: number;
    totalPages: number;
    itemFrom: number;
    itemTo: number;
}

export interface ApiResponse<T> {
    statusCode: number;
    message: string;
    isSuccess: boolean;
    result: T;
}

export interface QuestionOptionDto {
    id: string;
    questionId: string;
    choiceContent: string;
    isCorrect: boolean;
    isActive: boolean;
}

export interface QuestionDto {
    id: string;
    questionType: QuestionType;
    subjectId: string;
    subjectName?: string;
    subjectCode?: string;
    questionContent: string;
    tag?: string;
    points: number;
    isActive: boolean;
    createdAt: string;
    createdBy?: string;
    updatedAt?: string;
    updatedBy?: string;
    chapter: number;
    options: QuestionOptionDto[];
}

export interface CreateQuestionOptionRequestDto {
    choiceContent?: string;
    isCorrect: boolean;
}

export interface CreateQuestionDto {
    questionType: QuestionType;
    subjectId: string;
    questionContent: string;
    tag?: string;
    points: number;
    chapter: number;
    options: CreateQuestionOptionRequestDto[];
}

export interface UpdateQuestionOptionRequestDto {
    id?: string;
    choiceContent?: string;
    isCorrect: boolean;
}

export interface UpdateQuestionDto {
    questionType?: QuestionType;
    questionContent?: string;
    tag?: string;
    points?: number;
    chapter?: number;
    options?: UpdateQuestionOptionRequestDto[];
}

export interface GetAllQuestionsRequest {
    pageNumber?: number;
    pageSize?: number;
    subjectId?: string;
    subjectCode?: string;
    searchPhase?: string;
    sortBy?: string;
    sortOrder?: number;
}

export interface QuestionReportDto {
    id: string;
    questionId: string;
    studentId: string;
    examId?: string;
    reason: string;
    description?: string;
    studentCode?: string;
    studentName?: string;
    examName?: string;
    questionContent?: string;
    subjectName?: string;
    subjectCode?: string;
    createdAt?: string;
    createdBy?: string;
    updatedAt?: string;
    updatedBy?: string;
    isActive: boolean;
}

export interface GetAllQuestionReportsRequest {
    pageNumber?: number;
    pageSize?: number;
    examId?: string;
    subjectId?: string;
    studentId?: string;
    searchPhase?: string;
    sortBy?: string;
    sortOrder?: number;
}
