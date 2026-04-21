import { useState, useEffect } from 'react';
import { Modal, Descriptions, Spin, Table, Tag, Progress } from 'antd';
import { Calendar, ClipboardCheck, Lock, Globe, Shield, RefreshCw, Copy, Check, Timer } from 'lucide-react';
import { toast } from 'sonner';
import type { Exam } from '@/types/exam.types';
import StudentProgressionView from './StudentProgressionView';
import { generateTOTP } from '@/utils/otp';

interface ExamDetailModalProps {
    exam: Exam | null;
    isOpen: boolean;
    onClose: () => void;
}

export default function ExamDetailModal({ exam, isOpen, onClose }: ExamDetailModalProps) {
    const [copied, setCopied] = useState(false);
    const [otpCode, setOtpCode] = useState<string>('');
    const [timeLeft, setTimeLeft] = useState<number>(240);
    const [progress, setProgress] = useState<number>(100);

    // TOTP Logic
    useEffect(() => {
        if (!isOpen || !exam || exam.securityMode !== 2 || !exam.accessCode) return;

        const duration = exam.codeDuration || 30;

        const handleGenerate = async () => {
            const secret = (exam.accessCode || '').split('=')[0];
            const code = await generateTOTP(secret, duration);
            setOtpCode(code);
        };

        handleGenerate();

        const timer = setInterval(() => {
            const second = Math.floor(Date.now() / 1000) % duration;
            const remaining = duration - second;
            setTimeLeft(remaining);
            setProgress((remaining / duration) * 100);

            if (remaining === duration) {
                handleGenerate();
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [isOpen, exam]);

    // TOTP Logic

    return (
        <Modal
            title={
                <div className="flex items-center gap-2">
                    <ClipboardCheck className="w-5 h-5 text-[#F37022]" />
                    <span className="font-bold text-[#0A1B3C]">Exam Details: {exam?.category} {exam?.displayName ? `- ${exam.displayName}` : ''}</span>
                </div>
            }
            open={isOpen}
            onCancel={onClose}
            width={1000}
            footer={null}
            centered
            className="exam-detail-modal"
        >
            {exam ? (
                <div className="space-y-6 py-4">
                    {/* Exam Info */}
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <Descriptions column={{ xxl: 3, xl: 3, lg: 2, md: 2, sm: 1, xs: 1 }} bordered size="small">
                            <Descriptions.Item label="Starts At">
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                    {new Date(exam.startTime).toLocaleString()}
                                </div>
                            </Descriptions.Item>
                            <Descriptions.Item label="Ends At">
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                    {new Date(exam.endTime).toLocaleString()}
                                </div>
                            </Descriptions.Item>
                            <Descriptions.Item label="Security Mode">
                                <div className="flex items-center gap-2">
                                    {exam.securityMode === 2 ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 text-purple-500" />
                                            <Tag color="purple">Dynamic Code</Tag>
                                        </>
                                    ) : (
                                        <>
                                            <Lock className="w-4 h-4 text-gray-500" />
                                            <Tag color="default">Static Code</Tag>
                                        </>
                                    )}
                                </div>
                            </Descriptions.Item>
                            <Descriptions.Item label="IP Check">
                                <div className="flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-orange-500" />
                                    {exam.requireIpCheck ? (
                                        <Tag color="orange">Enabled</Tag>
                                    ) : (
                                        <Tag color="default">Disabled</Tag>
                                    )}
                                </div>
                            </Descriptions.Item>
                            <Descriptions.Item label="Allowed IPs">
                                {exam.allowedIpRanges || 'Any'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Grade Status">
                                {exam.isPublicGrade ? (
                                    <Tag color="green">Public</Tag>
                                ) : (
                                    <Tag color="volcano">Private</Tag>
                                )}
                            </Descriptions.Item>
                            <Descriptions.Item label="Syllabus" span={2}>
                                {exam.syllabusName} ({exam.weight}%)
                            </Descriptions.Item>
                        </Descriptions>
                    </div>

                    {/* Access Code Highlight */}
                    {(exam.securityMode === 1 || exam.securityMode === 2) && (
                        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                            {/* Background Pattern */}
                            <div className="absolute top-0 right-0 p-4 opacity-5">
                                <Shield className="w-24 h-24" />
                            </div>

                            <div className="flex items-center gap-2 text-blue-800 font-bold uppercase tracking-wider text-sm z-10">
                                <Lock className="w-4 h-4" />
                                {exam.securityMode === 2 ? 'DYNAMIC ACCESS CODE' : 'STATIC ACCESS CODE'}
                            </div>

                            <div className="flex flex-col items-center gap-4 z-10 w-full max-w-md">
                                <div className="flex items-center gap-4 bg-white px-10 py-6 rounded-2xl border-2 border-dashed border-blue-200 group relative shadow-inner">
                                    <span className={`text-5xl font-bold font-mono tracking-widest ${exam.securityMode === 2 ? 'text-[#F37022]' : 'text-blue-900'}`}>
                                        {exam.securityMode === 2 ? otpCode || '------' : exam.accessCode || 'XXXXXX'}
                                    </span>
                                    <button
                                        onClick={() => {
                                            const codeStr = exam.securityMode === 2 ? otpCode : exam.accessCode;
                                            if (codeStr) {
                                                navigator.clipboard.writeText(codeStr);
                                                setCopied(true);
                                                toast.success('Code copied to clipboard!');
                                                setTimeout(() => setCopied(false), 2000);
                                            }
                                        }}
                                        className="p-3 hover:bg-blue-50 rounded-xl border border-blue-100 transition-all active:scale-95 bg-white shadow-sm"
                                        title="Copy code"
                                    >
                                        {copied ? <Check className="w-6 h-6 text-green-500" /> : <Copy className="w-6 h-6 text-blue-600" />}
                                    </button>
                                </div>

                                {exam.securityMode === 2 && (
                                    <div className="w-full space-y-2 px-4">
                                        <div className="flex items-center justify-between text-xs font-bold text-blue-600">
                                            <span className="flex items-center gap-1">
                                                <Timer className="w-3 h-3" />
                                                EXPIRES IN
                                            </span>
                                            <span>{timeLeft}s</span>
                                        </div>
                                        <Progress
                                            percent={progress}
                                            showInfo={false}
                                            strokeColor={{
                                                '0%': '#F37022',
                                                '100%': '#FF9A5C',
                                            }}
                                            trailColor="#E6F0FF"
                                            size="small"
                                            className="m-0"
                                        />
                                    </div>
                                )}
                            </div>

                            <p className="text-sm text-blue-600 font-medium z-10">
                                {exam.securityMode === 2
                                    ? '* Provide this 6-digit code to students. It refreshes automatically.'
                                    : '* Share this static code with students to allow them to enter the exam.'}
                            </p>

                        </div>
                    )}

                    {/* Analytics and Progression */}
                    <div className="border-t border-gray-100 pt-6">
                        <StudentProgressionView exam={exam} />
                    </div>
                </div>
            ) : (
                <div className="py-20 text-center">
                    <Spin tip="Loading exam details..." />
                </div>
            )}
        </Modal>
    );
}
