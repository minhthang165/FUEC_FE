import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Modal, Input, Button, Switch, DatePicker } from 'antd';
import dayjs from 'dayjs';

import { useUpdateSemesterMutation } from '@/api/semestersApi';
import type { Semester, UpdateSemesterRequest } from '@/types/semester.types';

interface EditSemesterModalProps {
    semester: Semester | null;
    isOpen: boolean;
    onClose: () => void;
}

export default function EditSemesterModal({ semester, isOpen, onClose }: EditSemesterModalProps) {
    const [formData, setFormData] = useState<UpdateSemesterRequest>({
        id: '',
        semesterCode: '',
        startDate: '',
        endDate: '',
        isDefault: false,
        isActive: true,
    });

    const [updateSemester, { isLoading }] = useUpdateSemesterMutation();

    useEffect(() => {
        if (semester) {
            setFormData({
                id: semester.id,
                semesterCode: semester.semesterCode,
                startDate: semester.startDate,
                endDate: semester.endDate,
                isDefault: semester.isDefault,
                isActive: semester.isActive,
            });
        }
    }, [semester, isOpen]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleDateChange = (name: 'startDate' | 'endDate', date: dayjs.Dayjs | null) => {
        setFormData((prev) => ({ ...prev, [name]: date ? date.format('YYYY-MM-DDTHH:mm:ss') : '' }));
    };

    const handleSwitchChange = (name: 'isDefault' | 'isActive', checked: boolean) => {
        setFormData((prev) => ({ ...prev, [name]: checked }));
    };

    const handleSubmit = async () => {
        if (!semester) return;

        if (!formData.semesterCode || !formData.startDate || !formData.endDate) {
            toast.error('Please fill in all required fields');
            return;
        }

        const start = dayjs(formData.startDate);
        const end = dayjs(formData.endDate);

        if (start.isAfter(end)) {
            toast.error('Start Date cannot be after End Date');
            return;
        }

        try {
            await updateSemester(formData).unwrap();
            toast.success('Semester updated successfully');
            onClose();
        } catch (err: any) {
            const errorMessage = err?.data?.message || err?.message || 'Failed to update semester';
            toast.error(errorMessage);
        }
    };

    return (
        <Modal
            title="Edit Semester"
            open={isOpen}
            onCancel={onClose}
            width={800}
            footer={[
                <Button key="cancel" onClick={onClose} disabled={isLoading}>
                    Cancel
                </Button>,
                <Button
                    key="submit"
                    type="primary"
                    loading={isLoading}
                    onClick={handleSubmit}
                    className="bg-[#F37022] hover:bg-[#d95f19] border-none"
                >
                    Save Changes
                </Button>
            ]}
        >
            <div className="grid gap-6 py-6">
                <div className="grid grid-cols-[120px_1fr] items-center gap-4">
                    <span className="text-right font-semibold text-gray-700">
                        Code
                    </span>
                    <Input
                        id="semesterCode"
                        name="semesterCode"
                        value={formData.semesterCode}
                        onChange={handleInputChange}
                        disabled={isLoading}
                        placeholder="e.g. FALL26"
                        size="large"
                    />
                </div>
                <div className="grid grid-cols-[120px_1fr] items-center gap-4">
                    <span className="text-right font-semibold text-gray-700">
                        Start Date
                    </span>
                    <DatePicker
                        value={formData.startDate ? dayjs(formData.startDate) : null}
                        onChange={(date) => handleDateChange('startDate', date)}
                        disabled={isLoading}
                        size="large"
                        className="w-full"
                        format="YYYY-MM-DD"
                        disabledDate={(current) => {
                            if (!formData.endDate) return false;
                            return current && current.isAfter(dayjs(formData.endDate), 'day');
                        }}
                    />
                </div>
                <div className="grid grid-cols-[120px_1fr] items-center gap-4">
                    <span className="text-right font-semibold text-gray-700">
                        End Date
                    </span>
                    <DatePicker
                        value={formData.endDate ? dayjs(formData.endDate) : null}
                        onChange={(date) => handleDateChange('endDate', date)}
                        disabled={isLoading}
                        size="large"
                        className="w-full"
                        format="YYYY-MM-DD"
                        disabledDate={(current) => {
                            if (!formData.startDate) return false;
                            return current && current.isBefore(dayjs(formData.startDate), 'day');
                        }}
                    />
                </div>
                <div className="grid grid-cols-[120px_1fr] items-center gap-4">
                    <span className="text-right font-semibold text-gray-700">
                        Default
                    </span>
                    <div className="flex items-center gap-2">
                        <Switch
                            id="isDefault"
                            checked={formData.isDefault}
                            onChange={(checked) => handleSwitchChange('isDefault', checked)}
                            disabled={isLoading}
                        />
                        <span className="text-sm text-gray-500">Set as default semester</span>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
