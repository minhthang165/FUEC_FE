import { useState, useEffect } from 'react';
import { Modal, Form, DatePicker, Switch, Input, InputNumber, Select, Button } from 'antd';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { useUpdateExamMutation } from '@/api/examsApi';
import { useGetStudentClassesByClassIdQuery } from '@/api/classDetailsApi';
import type { Exam } from '@/types/exam.types';

interface EditExamModalProps {
    exam: Exam | null;
    isOpen: boolean;
    onClose: () => void;
}

export default function EditExamModal({ exam, isOpen, onClose }: EditExamModalProps) {
    const [form] = Form.useForm();
    const [updateExam, { isLoading }] = useUpdateExamMutation();

    const { data: studentsData } = useGetStudentClassesByClassIdQuery(
        { classSubjectId: exam?.classSubjectId || '' },
        { skip: !exam?.classSubjectId }
    );
    const students = studentsData?.items || [];

    useEffect(() => {
        if (exam && isOpen) {
            form.setFieldsValue({
                startTime: dayjs(exam.startTime),
                endTime: dayjs(exam.endTime),
                isPublicGrade: exam.isPublicGrade,
                showAnswers: exam.showAnswers,
                requireIpCheck: exam.requireIpCheck,
                allowedIpRanges: exam.allowedIpRanges,
                codeDuration: 240,
                securityMode: exam.securityMode,
                displayName: exam.displayName,
                duration: exam.duration ?? 60,
                enableAiProctoring: exam.enableAiProctoring ?? true,
                requireLockdownBrowser: exam.requireLockdownBrowser ?? false,
                proctoringExemptStudentClassIds: exam.proctoringExemptStudentClassIds || [],
            });
        }
    }, [exam, isOpen, form]);

    const isPublicGrade = Form.useWatch('isPublicGrade', form);

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            if (!exam) return;

            await updateExam({
                id: exam.id,
                ...values,
                startTime: values.startTime.format('YYYY-MM-DDTHH:mm:ss'),
                endTime: values.endTime.format('YYYY-MM-DDTHH:mm:ss'),
                codeDuration: 240,
                regenerateAccessCode: exam.securityMode !== values.securityMode,
            }).unwrap();

            toast.success('Exam updated successfully');
            onClose();
        } catch (error: any) {
            if (error?.errorFields) return;
            toast.error(error?.data?.message || 'Failed to update exam');
        }
    };

    return (
        <Modal
            title="Edit Exam"
            open={isOpen}
            onCancel={onClose}
            onOk={handleSubmit}
            confirmLoading={isLoading}
            width="min(96vw, 640px)"
            destroyOnClose
            styles={{ body: { padding: '16px 0 0' } }}
        >
            <Form
                form={form}
                layout="vertical"
                initialValues={{
                    securityMode: 1,
                    codeDuration: 240,
                    isPublicGrade: true,
                    showAnswers: true,
                    requireIpCheck: false,
                    displayName: '',
                    enableAiProctoring: true,
                    requireLockdownBrowser: false,
                    proctoringExemptStudentClassIds: [],
                }}
            >
                <Form.Item
                    name="displayName"
                    label="Exam Title / Display Name"
                    rules={[{ required: true, message: 'Please enter exam title' }]}
                >
                    <Input placeholder="e.g. Progress Test 1" />
                </Form.Item>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                    <Form.Item
                        name="startTime"
                        label="Start Time"
                        rules={[{ required: true, message: 'Please select start time' }]}
                    >
                        <DatePicker showTime className="w-full" />
                    </Form.Item>

                    <Form.Item
                        name="endTime"
                        label="End Time"
                        dependencies={['startTime']}
                        rules={[
                            { required: true, message: 'Please select end time' },
                            ({ getFieldValue }) => ({
                                validator(_, value) {
                                    if (!value || !getFieldValue('startTime') || value.isAfter(getFieldValue('startTime'))) {
                                        return Promise.resolve();
                                    }
                                    return Promise.reject(new Error('End time must be after start time'));
                                },
                            }),
                        ]}
                    >
                        <DatePicker
                            showTime
                            className="w-full"
                            disabledDate={(current) => {
                                const startTime = form.getFieldValue('startTime');
                                return current && startTime && current.isBefore(startTime, 'day');
                            }}
                            disabledTime={(current) => {
                                const startTime = form.getFieldValue('startTime');
                                if (!startTime || !current || !current.isSame(startTime, 'day')) {
                                    return {};
                                }
                                return {
                                    disabledHours: () => Array.from({ length: startTime.hour() }, (_, i) => i),
                                    disabledMinutes: (h) => h === startTime.hour() ? Array.from({ length: startTime.minute() }, (_, i) => i) : [],
                                    disabledSeconds: (h, m) => h === startTime.hour() && m === startTime.minute() ? Array.from({ length: startTime.second() }, (_, i) => i) : [],
                                };
                            }}
                        />
                    </Form.Item>
                </div>

                <Form.Item
                    name="duration"
                    label="Duration (Minutes)"
                    rules={[{ required: true, message: 'Please enter duration' }]}
                >
                    <InputNumber min={1} className="w-full" placeholder="e.g. 30" />
                </Form.Item>

                <Form.Item name="securityMode" label="Security Mode">
                    <Select options={[
                        { value: 1, label: 'Static Access Code' },
                        { value: 2, label: 'Dynamic Access Code' }
                    ]} />
                </Form.Item>



                {/* Toggle switches — stacked on mobile, row on desktop */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
                    <Form.Item name="isPublicGrade" label="Public Grade" valuePropName="checked" className="!mb-0">
                        <Switch />
                    </Form.Item>
                    <Form.Item
                        name="showAnswers"
                        label="Show Answers"
                        valuePropName="checked"
                        className="!mb-0"
                        style={{ opacity: isPublicGrade ? 1 : 0.5, transition: 'all 0.3s' }}
                    >
                        <Switch disabled={!isPublicGrade} />
                    </Form.Item>



                    <Form.Item name="enableAiProctoring" label="AI Proctoring" valuePropName="checked" className="!mb-0">
                        <Switch />
                    </Form.Item>

                    <Form.Item name="requireLockdownBrowser" label="Lockdown App" valuePropName="checked" className="!mb-0">
                        <Switch />
                    </Form.Item>
                </div>

                {/* Exemption list — shown only when AI Proctoring is ON */}
                <Form.Item
                    noStyle
                    shouldUpdate={(prev, cur) => prev.enableAiProctoring !== cur.enableAiProctoring}
                >
                    {({ getFieldValue }) =>
                        getFieldValue('enableAiProctoring') ? (
                            <Form.Item
                                name="proctoringExemptStudentClassIds"
                                label="Camera Exemptions"
                                extra="Students selected here will bypass AI proctoring (e.g. broken camera)"
                                className="mt-3"
                            >
                                <Select
                                    mode="multiple"
                                    allowClear
                                    placeholder="Select students to exempt..."
                                    options={students.map((s) => ({
                                        label: `${s.studentCode} – ${s.studentName}`,
                                        value: s.id,
                                    }))}
                                />
                            </Form.Item>
                        ) : null
                    }
                </Form.Item>
            </Form>
        </Modal>
    );
}
