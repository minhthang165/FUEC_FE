import { useEffect, useRef, useCallback, useState } from 'react';
import { useSelector } from 'react-redux';
import * as signalR from '@microsoft/signalr';
import { selectIsAuthenticated } from '@/redux/authSlice';
import type {
  NotificationDto,
  AssignmentNotificationDto,
  ExamNotificationDto,
  GradeNotificationDto,
  AnnouncementDto,
  NotificationItem,
} from '@/types/notification.types';

export interface StudentAnswerUpdateDto {
  studentExamId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  questionId: string;
  choiceId?: string;
  choiceIds?: string[];
  answerText?: string;
  updatedAt: string;
}

export interface StudentExamStartedDto {
  studentExamId: string;
  studentCode?: string;
  studentName?: string;
  startedAt: string;
}

/**
 * Hub URL: the BE maps NotificationHub to /hubs/notification (Program.cs line 123)
 * PathBase is /api, so full path is: {baseUrl}/hubs/notification
 */
const getHubUrl = (): string => {
  const apiUrl = import.meta.env.VITE_API_URL as string; // e.g. http://localhost:5077/api/v1
  // Strip /v1 suffix to get base path: http://localhost:5077/api
  const base = apiUrl.replace(/\/v1\/?$/, '');
  return `${base}/hubs/notification`;
};

/** Convert any incoming BE event into a unified NotificationItem */
function toNotificationItem(
  id: string,
  title: string,
  message: string,
  type: NotificationItem['type'],
  createdAt: string,
  relatedEntityId?: string,
  relatedEntityType?: string,
): NotificationItem {
  return { id, title, message, type, isRead: false, createdAt, relatedEntityId, relatedEntityType };
}

function normalizeNotificationType(type: NotificationDto['type'] | number): NotificationItem['type'] {
  if (typeof type !== 'number') {
    return type;
  }

  switch (type) {
    case 0:
      return 'System';
    case 1:
      return 'Message';
    case 2:
      return 'Assignment';
    case 3:
      return 'Exam';
    case 4:
      return 'Grade';
    case 5:
      return 'Announcement';
    case 6:
      return 'CourseMaterial';
    case 7:
      return 'SlotQuestion';
    case 8:
      return 'CheatDetected';
    case 9:
      return 'QuestionReport';
    default:
      return 'General';
  }
}

export interface NotificationHubCallbacks {
  onReceiveNotification?: (notification: NotificationDto) => void;
  onNotificationRead?: (event: { NotificationId: string }) => void;
  onAllNotificationsRead?: () => void;
  onAssignmentNotification?: (notification: AssignmentNotificationDto) => void;
  onExamNotification?: (notification: ExamNotificationDto) => void;
  onGradeNotification?: (notification: GradeNotificationDto) => void;
  onSystemAnnouncement?: (announcement: AnnouncementDto) => void;
  onStudentAnswerUpdated?: (update: StudentAnswerUpdateDto) => void;
  onStudentExamStarted?: (update: StudentExamStartedDto) => void;
}

export interface UseNotificationHubReturn {
  connectionState: signalR.HubConnectionState;
  isConnected: boolean;
  notifications: NotificationItem[];
  unreadCount: number;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  subscribeToChannel: (channelName: string) => Promise<void>;
  clearNotification: (id: string) => void;
  clearAll: () => void;
  joinExamMonitoring: (examId: string) => Promise<void>;
  leaveExamMonitoring: (examId: string) => Promise<void>;
}

export function useNotificationHub(
  callbacks?: NotificationHubCallbacks,
): UseNotificationHubReturn {
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const [connectionState, setConnectionState] = useState<signalR.HubConnectionState>(
    signalR.HubConnectionState.Disconnected,
  );
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Local states
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeExamId, setActiveExamId] = useState<string | null>(null);

  const isAuthenticated = useSelector(selectIsAuthenticated);

  const addNotification = useCallback((item: NotificationItem) => {
    setNotifications((prev) => {
      // Avoid duplicates by id
      if (prev.some((n) => n.id === item.id)) return prev;
      return [item, ...prev];
    });
  }, []);

  // ── Build and start connection ──
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !isAuthenticated) {
      console.warn('[NotificationHub] No auth token found, skipping connection.');
      return;
    }

    const hubUrl = getHubUrl();
    console.log('[NotificationHub] Connecting to:', hubUrl);

    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => localStorage.getItem('token') || '',
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling,
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Information)
      .build();

    const MAX_RETRY_DELAY = 60000;

    function startConnection(attempt = 0) {
      if (isCancelled) return;
      connection
        .start()
        .then(() => {
          console.log('[NotificationHub] Connected successfully.');
          setConnectionState(signalR.HubConnectionState.Connected);
        })
        .catch((err) => {
          console.error(`[NotificationHub] Connection error (attempt ${attempt + 1}):`, err);
          setConnectionState(signalR.HubConnectionState.Disconnected);
          if (!isCancelled) {
            const delay = Math.min(2000 * Math.pow(2, attempt), MAX_RETRY_DELAY);
            console.log(`[NotificationHub] Retrying in ${delay}ms...`);
            retryTimeoutId = setTimeout(() => startConnection(attempt + 1), delay);
          }
        });
    }

    // ── Event: ReceiveNotification (general) ──
    connection.on('ReceiveNotification', (dto: NotificationDto) => {
      callbacksRef.current?.onReceiveNotification?.(dto);
      addNotification({
        id: dto.id,
        title: dto.title,
        message: dto.message,
        type: normalizeNotificationType(dto.type as NotificationDto['type'] | number),
        isRead: dto.isRead,
        createdAt: dto.createdAt,
        relatedEntityId: dto.relatedEntityId,
        relatedEntityType: dto.relatedEntityType,
      });
    });

    // ── Event: NotificationMarkedRead ──
    connection.on('NotificationMarkedRead', (notificationId: string) => {
      callbacksRef.current?.onNotificationRead?.({ NotificationId: notificationId });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
      );
    });

    // ── Event: AllNotificationsMarkedRead (from hub method) ──
    connection.on('AllNotificationsMarkedRead', () => {
      callbacksRef.current?.onAllNotificationsRead?.();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    });

    // ── Event: AssignmentNotification ──
    connection.on('AssignmentNotification', (dto: AssignmentNotificationDto) => {
      callbacksRef.current?.onAssignmentNotification?.(dto);
      addNotification(
        toNotificationItem(
          `assignment-${dto.assignmentId}-${Date.now()}`,
          `Assignment: ${dto.assignmentTitle}`,
          dto.message,
          'Assignment',
          dto.createdAt,
          dto.assignmentId,
          'Assignment'
        ),
      );
    });

    // ── Event: ExamNotification ──
    connection.on('ExamNotification', (dto: ExamNotificationDto) => {
      callbacksRef.current?.onExamNotification?.(dto);
      addNotification(
        toNotificationItem(
          `exam-${dto.examId}-${Date.now()}`,
          `Exam: ${dto.examTitle}`,
          dto.message,
          'Exam',
          dto.createdAt,
          dto.examId,
          'Exam'
        ),
      );
    });

    // ── Event: GradeNotification ──
    connection.on('GradeNotification', (dto: GradeNotificationDto) => {
      callbacksRef.current?.onGradeNotification?.(dto);
      addNotification(
        toNotificationItem(
          `grade-${dto.assignmentId ?? dto.examId ?? Date.now()}`,
          `Grade: ${dto.subjectName}`,
          dto.message,
          'Grade',
          dto.createdAt,
          dto.assignmentId ?? dto.examId,
          dto.assignmentId ? 'Assignment' : 'Exam'
        ),
      );
    });

    // ── Event: SystemAnnouncement ──
    connection.on('SystemAnnouncement', (dto: AnnouncementDto) => {
      callbacksRef.current?.onSystemAnnouncement?.(dto);
      addNotification(
        toNotificationItem(dto.id, dto.title, dto.content, 'Announcement', dto.createdAt, dto.id, 'Announcement'),
      );
    });

    // ── Event: StudentAnswerUpdated ──
    connection.on('StudentAnswerUpdated', (dto: StudentAnswerUpdateDto) => {
      callbacksRef.current?.onStudentAnswerUpdated?.(dto);
      // Dispatch global event for other components to listen
      window.dispatchEvent(new CustomEvent('signalr:student-answer-updated', { detail: dto }));
    });

    // ── Event: StudentExamStarted ──
    connection.on('StudentExamStarted', (dto: StudentExamStartedDto) => {
      callbacksRef.current?.onStudentExamStarted?.(dto);
      // Dispatch global event for other components to listen
      window.dispatchEvent(new CustomEvent('signalr:student-exam-started', { detail: dto }));
    });

    // ── Event: QuestionUpdated ──
    connection.on('QuestionUpdated', (dto: any) => {
      window.dispatchEvent(new CustomEvent('signalr:question-updated', { detail: dto }));
    });

    // ── Connection lifecycle ──
    connection.onreconnecting(() => {
      console.log('[NotificationHub] Reconnecting...');
      setConnectionState(signalR.HubConnectionState.Reconnecting);
    });
    connection.onreconnected(() => {
      console.log('[NotificationHub] Reconnected.');
      setConnectionState(signalR.HubConnectionState.Connected);
    });
    connection.onclose(() => {
      console.log('[NotificationHub] Connection closed.');
      setConnectionState(signalR.HubConnectionState.Disconnected);
      // Retry connection after all automatic reconnect attempts are exhausted
      if (!isCancelled) {
        console.log('[NotificationHub] All automatic reconnects exhausted, retrying manually...');
        startConnection(0);
      }
    });

    // Start connection with retry
    startConnection(0);

    connectionRef.current = connection;

    return () => {
      isCancelled = true;
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
      connection.stop().catch(console.error);
    };
  }, [addNotification, isAuthenticated]);

  // ── Auto-Sync Monitoring Groups on Reconnect ──
  useEffect(() => {
    if (connectionState === signalR.HubConnectionState.Connected && activeExamId) {
      const conn = connectionRef.current;
      if (conn) {
        console.log(`[NotificationHub] Auto-joining monitoring for exam: ${activeExamId}`);
        conn.invoke('JoinExamMonitoring', activeExamId).catch(err => {
            console.error('[NotificationHub] Auto-join error:', err);
        });
      }
    }
  }, [connectionState, activeExamId]);

  // ── Hub method invocations ──

  const markAsRead = useCallback(async (notificationId: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
    );
    const conn = connectionRef.current;
    if (conn?.state === signalR.HubConnectionState.Connected) {
      try {
        await conn.invoke('MarkNotificationAsRead', notificationId);
      } catch (err) {
        console.error('[NotificationHub] MarkNotificationAsRead error:', err);
      }
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    const conn = connectionRef.current;
    if (conn?.state === signalR.HubConnectionState.Connected) {
      try {
        await conn.invoke('MarkAllNotificationsAsRead');
      } catch (err) {
        console.error('[NotificationHub] MarkAllNotificationsAsRead error:', err);
      }
    }
  }, []);

  const subscribeToChannel = useCallback(async (channelName: string) => {
    const conn = connectionRef.current;
    if (conn?.state === signalR.HubConnectionState.Connected) {
      try {
        await conn.invoke('SubscribeToChannel', channelName);
      } catch (err) {
        console.error('[NotificationHub] SubscribeToChannel error:', err);
      }
    }
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const joinExamMonitoring = useCallback(async (examId: string) => {
    setActiveExamId(examId);
    const conn = connectionRef.current;
    if (conn?.state === signalR.HubConnectionState.Connected) {
      try {
        await conn.invoke('JoinExamMonitoring', examId);
        console.log(`[NotificationHub] Joined monitoring for exam: ${examId}`);
      } catch (err) {
        console.error('[NotificationHub] JoinExamMonitoring error:', err);
      }
    } else {
        console.log('[NotificationHub] Connection not ready, group join will be handled by auto-sync.');
    }
  }, []);

  const leaveExamMonitoring = useCallback(async (examId: string) => {
    setActiveExamId(null);
    const conn = connectionRef.current;
    if (conn?.state === signalR.HubConnectionState.Connected) {
      try {
        await conn.invoke('LeaveExamMonitoring', examId);
        console.log(`[NotificationHub] Left monitoring for exam: ${examId}`);
      } catch (err) {
        console.error('[NotificationHub] LeaveExamMonitoring error:', err);
      }
    }
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return {
    connectionState,
    isConnected: connectionState === signalR.HubConnectionState.Connected,
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    subscribeToChannel,
    clearNotification,
    clearAll,
    joinExamMonitoring,
    leaveExamMonitoring,
  };
}
